import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import type { createFakeAdmin } from '../../../test/fakeSupabase';

process.env.OTP_PEPPER = 'test-pepper';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: vi.fn().mockResolvedValue({ data: { id: 'test' }, error: null }) };
  },
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99 }),
}));
// password policy: permissive by default — real logic unit-tested in lib/__tests__/password-policy.test.ts
vi.mock('@/lib/password-policy', () => ({
  assertPasswordAllowed: vi.fn(() => ({ ok: true })),
  isPasswordBreached: vi.fn().mockResolvedValue({ breached: false, checkFailed: false }),
}));
vi.mock('@/lib/email-service', () => ({
  sendCustomerOtpEmail: vi.fn().mockResolvedValue({ error: null }),
  sendAccountLockedEmail: vi.fn().mockResolvedValue({ error: null }),
  sendSecurityAlertEmail: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/headers', () => {
  const store = new Map<string, string>();
  const cookieStore = {
    get: (name: string) => (store.has(name) ? { value: store.get(name)! } : undefined),
    set: (name: string, value: string) => { store.set(name, value); },
    delete: (name: string) => { store.delete(name); },
  };
  return {
    cookies: vi.fn().mockResolvedValue(cookieStore),
    headers: vi.fn().mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.5' })),
  };
});

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { checkRateLimit } = await import('@/lib/rate-limit');
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const pwPolicy = await import('@/lib/password-policy');
const mockAssertPassword = vi.mocked(pwPolicy.assertPasswordAllowed);
const mockIsBreached = vi.mocked(pwPolicy.isPasswordBreached);
const emailSvc = await import('@/lib/email-service');
const mockLockedEmail = vi.mocked(emailSvc.sendAccountLockedEmail);
const mockAlertEmail = vi.mocked(emailSvc.sendSecurityAlertEmail);
const { logAuditEvent: mockAudit } = vi.mocked(await import('@/lib/audit'));

const {
  loginCustomerAction,
  loginCustomerByVerifiedEmail,
  requestCustomerPasswordReset,
  resetCustomerPassword,
  updateCustomerPassword,
  getMyCustomerSessions,
  revokeCustomerSession,
  revokeOtherCustomerSessions,
} = await import('../auth-actions');
const { cookies: mockedCookies } = await import('next/headers');

function hashOtp(otp: string) {
  return crypto.createHash('sha256').update(otp + process.env.OTP_PEPPER).digest('hex');
}

const CUST_TOKEN = '22222222-2222-2222-2222-222222222222';

/** seed a valid customer session (fake doesn't resolve joins → embed the b2b_customers shape) */
function seedCustomerSession(over: Partial<{ id: number; email: string; contact_name: string; password_hash: string }> = {}) {
  const cust = {
    id: over.id ?? 4,
    email: over.email ?? 'cust@example.com',
    contact_name: over.contact_name ?? 'สมชาย',
    phone: null, position: null,
    access_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    cancelled_at: null,
    organizations: { hospital_name: 'รพ.ทดสอบ', customer_code: 'C-0004', province: 'สงขลา' },
    password_hash: over.password_hash ?? 'unused',
  };
  fakeAdmin.seed({
    b2b_customers: [cust],
    sessions: [{ token: CUST_TOKEN, actor_type: 'customer', customer_id: cust.id, expires_at: new Date(Date.now() + 3600_000).toISOString(), b2b_customers: cust }],
    otp_logs: [],
  });
  return cust;
}
async function setCustomerCookie(token: string | null) {
  const store: any = await mockedCookies();
  if (token) store.set('customer_session', token);
  else store.delete('customer_session');
}

function seed(overrides: { b2b_customers?: any[]; otp_logs?: any[]; sessions?: any[] } = {}) {
  fakeAdmin.seed({
    b2b_customers: overrides.b2b_customers ?? [],
    otp_logs: overrides.otp_logs ?? [],
    sessions: overrides.sessions ?? [],
  });
}

beforeEach(() => {
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99 });
  mockAssertPassword.mockReset();
  mockAssertPassword.mockReturnValue({ ok: true });
  mockIsBreached.mockReset();
  mockIsBreached.mockResolvedValue({ breached: false, checkFailed: false });
  mockAudit.mockClear();
});

describe('loginCustomerAction', () => {
  it('rejects an invalid email without touching the DB', async () => {
    const res = await loginCustomerAction({ email: 'not-an-email', password: 'whatever' });
    expect(res).toEqual({ success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  });

  it('rejects with a generic error for an unknown email (anti-enumeration)', async () => {
    seed();
    const res = await loginCustomerAction({ email: 'nobody@example.com', password: 'somepass' });
    expect(res).toEqual({ success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  });

  it('rejects a customer who has not set a password yet', async () => {
    seed({ b2b_customers: [{ id: 1, email: 'nopass@example.com', password_hash: null }] });
    const res = await loginCustomerAction({ email: 'nopass@example.com', password: 'somepass' });
    expect(res).toEqual({ success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  });

  it('rejects a wrong password', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ b2b_customers: [{ id: 1, email: 'cust@example.com', password_hash: hash }] });
    const res = await loginCustomerAction({ email: 'cust@example.com', password: 'wrongpass' });
    expect(res).toEqual({ success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  });

  it('logs in on correct email+password and creates an 8-hour session by default', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ b2b_customers: [{ id: 1, email: 'cust@example.com', password_hash: hash }] });
    const res = await loginCustomerAction({ email: 'cust@example.com', password: 'correctpass' });
    expect(res).toEqual({ success: true });

    const sessions = fakeAdmin.rows('sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ actor_type: 'customer', customer_id: 1 });
    const ttlH = (new Date(sessions[0].expires_at).getTime() - Date.now()) / 3600_000;
    expect(ttlH).toBeGreaterThan(7.9);
    expect(ttlH).toBeLessThan(8.1);
  });

  it('remember: true → creates a 30-day session', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ b2b_customers: [{ id: 1, email: 'cust@example.com', password_hash: hash }] });
    await loginCustomerAction({ email: 'cust@example.com', password: 'correctpass', remember: true });
    const ttlDays = (new Date(fakeAdmin.rows('sessions')[0].expires_at).getTime() - Date.now()) / 86_400_000;
    expect(ttlDays).toBeGreaterThan(29.9);
    expect(ttlDays).toBeLessThan(30.1);
  });

  // ── Account lockout ──
  it('locks + emails on the 5th consecutive wrong password; clears on success', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ b2b_customers: [{ id: 1, email: 'cust@example.com', password_hash: hash, failed_login_count: 4 }] });

    const bad = await loginCustomerAction({ email: 'cust@example.com', password: 'wrong' });
    expect(bad).toEqual({ success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    let cust = fakeAdmin.rows('b2b_customers')[0];
    expect(cust.failed_login_count).toBe(5);
    expect(cust.locked_until).toBeTruthy();
    expect(mockLockedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'cust@example.com', minutesLocked: 15 }));

    // ตอนถูกล็อก — แม้รหัสถูกก็ยังเข้าไม่ได้
    const locked = await loginCustomerAction({ email: 'cust@example.com', password: 'correctpass' });
    expect(locked.success).toBe(false);
    expect(locked.error).toContain('ถูกล็อกชั่วคราว');

    // ปลดล็อกด้วยมือใน fixture แล้ว login ถูก → counter เคลียร์
    fakeAdmin.rows('b2b_customers')[0].locked_until = new Date(Date.now() - 1000).toISOString();
    const ok = await loginCustomerAction({ email: 'cust@example.com', password: 'correctpass' });
    expect(ok).toEqual({ success: true });
    cust = fakeAdmin.rows('b2b_customers')[0];
    expect(cust.failed_login_count).toBe(0);
    expect(cust.locked_until).toBeNull();
  });

  it('is blocked by the login-side rate limiter before touching the DB', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ b2b_customers: [{ id: 1, email: 'cust@example.com', password_hash: hash }] });
    const res = await loginCustomerAction({ email: 'cust@example.com', password: 'correctpass' });
    expect(res).toEqual({ success: false, error: 'เข้าสู่ระบบถี่เกินไป กรุณารอสักครู่' });
    expect(fakeAdmin.rows('sessions')).toHaveLength(0);
  });
});

describe('loginCustomerByVerifiedEmail (Google OAuth)', () => {
  it('rejects an unknown email', async () => {
    seed();
    const res = await loginCustomerByVerifiedEmail('nobody@example.com');
    expect(res.success).toBe(false);
  });

  it('creates a session for a known email', async () => {
    seed({ b2b_customers: [{ id: 2, email: 'google@example.com' }] });
    const res = await loginCustomerByVerifiedEmail('google@example.com');
    expect(res).toEqual({ success: true });
    expect(fakeAdmin.rows('sessions')).toHaveLength(1);
  });
});

describe('requestCustomerPasswordReset', () => {
  it('returns success without creating an OTP for an unknown email (anti-enumeration)', async () => {
    seed();
    const res = await requestCustomerPasswordReset('nobody@example.com');
    expect(res).toEqual({ success: true });
    expect(fakeAdmin.rows('otp_logs')).toHaveLength(0);
  });

  it('creates a 5-minute OTP for a known customer email', async () => {
    seed({ b2b_customers: [{ id: 3, email: 'cust@example.com' }] });
    const before = Date.now();
    const res = await requestCustomerPasswordReset('cust@example.com');
    expect(res).toEqual({ success: true });

    const logs = fakeAdmin.rows('otp_logs');
    expect(logs).toHaveLength(1);
    expect(logs[0].email).toBe('cust@example.com');
    expect(logs[0].used).toBe(false);
    const expiresAt = new Date(logs[0].expires_at).getTime();
    expect(expiresAt).toBeGreaterThan(before + 4 * 60_000);
    expect(expiresAt).toBeLessThanOrEqual(before + 5 * 60_000 + 5_000);
  });

  it('is blocked by the request-side rate limiter', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    seed({ b2b_customers: [{ id: 3, email: 'cust@example.com' }] });
    const res = await requestCustomerPasswordReset('cust@example.com');
    expect(res).toEqual({ success: false, error: 'ขอรหัสถี่เกินไป กรุณารอสักครู่' });
    expect(fakeAdmin.rows('otp_logs')).toHaveLength(0);
  });
});

describe('resetCustomerPassword', () => {
  it('rejects an invalid email', async () => {
    const res = await resetCustomerPassword('not-an-email', '123456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'กรุณากรอกอีเมลให้ถูกต้อง' });
  });

  it('rejects a non-6-digit OTP', async () => {
    const res = await resetCustomerPassword('cust@example.com', '12a456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
  });

  it('rejects a password that fails the policy shape check, before the rate limiter / DB', async () => {
    mockAssertPassword.mockReturnValueOnce({ ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร' });
    const res = await resetCustomerPassword('cust@example.com', '123456', 'abc');
    expect(res).toEqual({ success: false, error: 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร' });
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockAssertPassword).toHaveBeenCalledWith('abc', { identifiers: ['cust@example.com'] });
  });

  it('rejects a breached password after OTP verification but before consuming the OTP', async () => {
    seed({
      b2b_customers: [{ id: 4, email: 'cust@example.com', password_hash: 'oldhash' }],
      otp_logs: [{
        id: 1, email: 'cust@example.com', otp_hash: hashOtp('123456'),
        expires_at: new Date(Date.now() + 60_000).toISOString(), used: false, created_at: new Date().toISOString(),
      }],
    });
    mockIsBreached.mockResolvedValueOnce({ breached: true, checkFailed: false });

    const res = await resetCustomerPassword('cust@example.com', '123456', 'seventeen-letters-x');

    expect(res).toEqual({ success: false, error: expect.stringContaining('รั่วไหล') });
    expect(fakeAdmin.rows('b2b_customers')[0].password_hash).toBe('oldhash');
    expect(fakeAdmin.rows('otp_logs')[0].used).toBe(false);
  });

  it('rejects with the generic OTP error for an unknown email', async () => {
    seed();
    const res = await resetCustomerPassword('nobody@example.com', '123456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
  });

  it('rejects when there is no OTP on record', async () => {
    seed({ b2b_customers: [{ id: 4, email: 'cust@example.com', password_hash: 'oldhash' }] });
    const res = await resetCustomerPassword('cust@example.com', '123456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
  });

  it('rejects an already-used OTP', async () => {
    seed({
      b2b_customers: [{ id: 4, email: 'cust@example.com', password_hash: 'oldhash' }],
      otp_logs: [{
        id: 1, email: 'cust@example.com', otp_hash: hashOtp('123456'),
        expires_at: new Date(Date.now() + 60_000).toISOString(), used: true, created_at: new Date().toISOString(),
      }],
    });
    const res = await resetCustomerPassword('cust@example.com', '123456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
  });

  it('rejects an expired OTP', async () => {
    seed({
      b2b_customers: [{ id: 4, email: 'cust@example.com', password_hash: 'oldhash' }],
      otp_logs: [{
        id: 1, email: 'cust@example.com', otp_hash: hashOtp('123456'),
        expires_at: new Date(Date.now() - 60_000).toISOString(), used: false, created_at: new Date().toISOString(),
      }],
    });
    const res = await resetCustomerPassword('cust@example.com', '123456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
  });

  it('rejects a wrong OTP value without mutating the password', async () => {
    seed({
      b2b_customers: [{ id: 4, email: 'cust@example.com', password_hash: 'oldhash' }],
      otp_logs: [{
        id: 1, email: 'cust@example.com', otp_hash: hashOtp('123456'),
        expires_at: new Date(Date.now() + 60_000).toISOString(), used: false, created_at: new Date().toISOString(),
      }],
    });
    const res = await resetCustomerPassword('cust@example.com', '999999', 'newpass123');
    expect(res).toEqual({ success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
    expect(fakeAdmin.rows('b2b_customers')[0].password_hash).toBe('oldhash');
  });

  it('is blocked by the verify-side rate limiter before touching the DB', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    seed({
      b2b_customers: [{ id: 4, email: 'cust@example.com', password_hash: 'oldhash' }],
      otp_logs: [{
        id: 1, email: 'cust@example.com', otp_hash: hashOtp('123456'),
        expires_at: new Date(Date.now() + 60_000).toISOString(), used: false, created_at: new Date().toISOString(),
      }],
    });
    const res = await resetCustomerPassword('cust@example.com', '123456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'ลองยืนยันถี่เกินไป กรุณารอสักครู่' });
    expect(fakeAdmin.rows('b2b_customers')[0].password_hash).toBe('oldhash');
  });

  it('on a correct OTP: updates the password, marks the OTP used, revokes only this customer\'s sessions, and writes an audit log row', async () => {
    seed({
      b2b_customers: [
        { id: 4, email: 'cust@example.com', password_hash: 'oldhash' },
        { id: 5, email: 'other@example.com', password_hash: 'untouched' },
      ],
      otp_logs: [{
        id: 1, email: 'cust@example.com', otp_hash: hashOtp('123456'),
        expires_at: new Date(Date.now() + 60_000).toISOString(), used: false, created_at: new Date().toISOString(),
      }],
      sessions: [
        { id: 1, actor_type: 'customer', customer_id: 4, token: 'tok-1' },
        { id: 2, actor_type: 'customer', customer_id: 5, token: 'tok-2' },
        { id: 3, actor_type: 'staff', staff_id: 'staff-1', customer_id: null, token: 'tok-3' },
      ],
    });

    const res = await resetCustomerPassword('cust@example.com', '123456', 'newpass123');
    expect(res).toEqual({ success: true });

    const customer = fakeAdmin.rows('b2b_customers').find((c) => c.id === 4);
    expect(customer?.password_hash).not.toBe('oldhash');

    const otherCustomer = fakeAdmin.rows('b2b_customers').find((c) => c.id === 5);
    expect(otherCustomer?.password_hash).toBe('untouched');

    expect(fakeAdmin.rows('otp_logs')[0].used).toBe(true);

    const remainingSessionTokens = fakeAdmin.rows('sessions').map((s) => s.token);
    expect(remainingSessionTokens).toEqual(['tok-2', 'tok-3']);

    const resetLogs = fakeAdmin.rows('customer_password_reset_logs');
    expect(resetLogs).toHaveLength(1);
    expect(resetLogs[0].customer_id).toBe(4);
    expect(resetLogs[0].ip).toBe('203.0.113.5');
  });
});

describe('updateCustomerPassword — password policy (P0-2)', () => {
  beforeEach(() => setCustomerCookie(null));

  it('rejects when there is no session', async () => {
    const res = await updateCustomerPassword('whatever', 'a-fine-new-password-2569');
    expect(res).toEqual({ success: false, error: 'กรุณาเข้าสู่ระบบใหม่' });
  });

  it('rejects a policy-failing new password with the session email + contact name as blocklist identifiers, without checking the current password', async () => {
    seedCustomerSession({ email: 'cust@example.com', contact_name: 'สมชาย' });
    await setCustomerCookie(CUST_TOKEN);
    mockAssertPassword.mockReturnValueOnce({ ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร' });

    const res = await updateCustomerPassword('whatever', 'abc');

    expect(res).toEqual({ success: false, error: 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร' });
    expect(mockAssertPassword).toHaveBeenCalledWith('abc', { identifiers: ['cust@example.com', 'สมชาย'] });
  });

  it('rejects a breached new password after verifying the current one, without changing the hash', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('currentpass', 12);
    seedCustomerSession({ password_hash: hash });
    await setCustomerCookie(CUST_TOKEN);
    mockIsBreached.mockResolvedValueOnce({ breached: true, checkFailed: false });

    const res = await updateCustomerPassword('currentpass', 'a-leaked-passphrase-xx');

    expect(res).toEqual({ success: false, error: expect.stringContaining('รั่วไหล') });
    expect(fakeAdmin.rows('b2b_customers')[0].password_hash).toBe(hash);
  });

  it('on a good password: re-hashes and records the change log', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('currentpass', 12);
    seedCustomerSession({ id: 4, password_hash: hash });
    await setCustomerCookie(CUST_TOKEN);

    const res = await updateCustomerPassword('currentpass', 'a-solid-fresh-passphrase');

    expect(res).toEqual({ success: true });
    expect(fakeAdmin.rows('b2b_customers')[0].password_hash).not.toBe(hash);
    const logs = fakeAdmin.rows('customer_account_change_logs');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ customer_id: 4, field: 'password' });
  });
});

describe('customer session management (Phase 3)', () => {
  beforeEach(() => setCustomerCookie(null));

  function seedTwoSessions() {
    const cust = {
      id: 4, email: 'cust@example.com', contact_name: 'สมชาย', phone: null, position: null,
      access_expires_at: new Date(Date.now() + 86_400_000).toISOString(), cancelled_at: null,
      organizations: { hospital_name: 'รพ.ทดสอบ', customer_code: 'C-0004', province: 'สงขลา' },
      password_hash: 'unused',
    };
    fakeAdmin.seed({
      b2b_customers: [cust],
      sessions: [
        { token: CUST_TOKEN, actor_type: 'customer', customer_id: 4, expires_at: new Date(Date.now() + 3600_000).toISOString(), created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), user_agent: 'Chrome/124 Windows NT 10.0', ip: '203.0.113.1', b2b_customers: cust },
        { token: '88888888-8888-8888-8888-888888888888', actor_type: 'customer', customer_id: 4, expires_at: new Date(Date.now() + 3600_000).toISOString(), created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), user_agent: 'Safari iPhone', ip: '198.51.100.4' },
      ],
      otp_logs: [],
    });
  }

  it('lists the customer sessions and marks the current one', async () => {
    seedTwoSessions();
    await setCustomerCookie(CUST_TOKEN);
    const res = await getMyCustomerSessions();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.sessions).toHaveLength(2);
    expect(res.sessions.filter((s) => s.isCurrent)).toHaveLength(1);
  });

  it('revokes a specific other session by short id', async () => {
    seedTwoSessions();
    await setCustomerCookie(CUST_TOKEN);
    const { sessionShortId } = await import('@/lib/device');
    const res = await revokeCustomerSession(sessionShortId('88888888-8888-8888-8888-888888888888'));
    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('sessions').map((s) => s.token)).toEqual([CUST_TOKEN]);
  });

  it('refuses to revoke the current session', async () => {
    seedTwoSessions();
    await setCustomerCookie(CUST_TOKEN);
    const { sessionShortId } = await import('@/lib/device');
    const res = await revokeCustomerSession(sessionShortId(CUST_TOKEN));
    expect(res.success).toBe(false);
  });

  it('revokeOtherCustomerSessions keeps only the current session', async () => {
    seedTwoSessions();
    await setCustomerCookie(CUST_TOKEN);
    const res = await revokeOtherCustomerSessions();
    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('sessions').map((s) => s.token)).toEqual([CUST_TOKEN]);
  });

  it('rejects when not logged in', async () => {
    const res = await getMyCustomerSessions();
    expect(res.success).toBe(false);
  });
});

describe('audit — customer auth events (G0-3 phase B)', () => {
  const auditActions = () => mockAudit.mock.calls.map((c) => (c[0] as { action: string }).action);

  it('logs auth.login.success (method: password) on a good login', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ b2b_customers: [{ id: 1, email: 'cust@example.com', password_hash: hash }] });
    await loginCustomerAction({ email: 'cust@example.com', password: 'correctpass' });
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
      category: 'auth', action: 'auth.login.success',
      actor: expect.objectContaining({ type: 'customer', id: 1 }),
      detail: { method: 'password' },
    }));
  });

  it('logs auth.login.failure reason=bad_password', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ b2b_customers: [{ id: 1, email: 'cust@example.com', password_hash: hash }] });
    await loginCustomerAction({ email: 'cust@example.com', password: 'nope' });
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'auth.login.failure', detail: expect.objectContaining({ reason: 'bad_password' }),
    }));
  });

  it('logs auth.lockout.triggered on the 5th failure', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ b2b_customers: [{ id: 1, email: 'cust@example.com', password_hash: hash, failed_login_count: 4 }] });
    await loginCustomerAction({ email: 'cust@example.com', password: 'nope' });
    expect(auditActions()).toContain('auth.lockout.triggered');
  });

  it('logs auth.login.success (method: google) via loginCustomerByVerifiedEmail', async () => {
    seed({ b2b_customers: [{ id: 7, email: 'g@example.com', access_expires_at: new Date(Date.now() + 86_400_000).toISOString(), cancelled_at: null }] });
    await loginCustomerByVerifiedEmail('g@example.com');
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'auth.login.success', detail: { method: 'google' },
    }));
  });

  it('logs auth.logout only for a user-initiated logout, not for an expired-session cleanup', async () => {
    seedCustomerSession({ id: 4 });
    await setCustomerCookie(CUST_TOKEN);
    const { logoutCustomer } = await import('../auth-actions');
    await logoutCustomer();                     // user
    await logoutCustomer('expired');            // system cleanup
    const logouts = mockAudit.mock.calls.filter((c) => (c[0] as any).action === 'auth.logout');
    expect(logouts).toHaveLength(1);
  });
});
