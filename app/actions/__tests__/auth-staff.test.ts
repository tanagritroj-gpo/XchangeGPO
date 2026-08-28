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
// password policy: permissive by default — real logic unit-tested in lib/__tests__/password-policy.test.ts.
// These action tests verify the wiring (identifiers passed, result respected).
vi.mock('@/lib/password-policy', () => ({
  assertPasswordAllowed: vi.fn(() => ({ ok: true })),
  isPasswordBreached: vi.fn().mockResolvedValue({ breached: false, checkFailed: false }),
  validateNewPassword: vi.fn().mockResolvedValue({ ok: true, breachCheckFailed: false }),
}));
vi.mock('@/lib/email-service', () => ({
  sendStaffOtpEmail: vi.fn().mockResolvedValue({ error: null }),
  sendAccountLockedEmail: vi.fn().mockResolvedValue({ error: null }),
  sendSecurityAlertEmail: vi.fn().mockResolvedValue({ error: null }),
}));
// TOTP: deterministic — "123456" is the only valid code. Real RFC 6238 logic is
// unit-tested in lib/__tests__/totp.test.ts.
vi.mock('@/lib/totp', () => ({
  generateTotpSecret: vi.fn(() => 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  totpAuthUri: vi.fn(() => 'otpauth://totp/GPO%20Xchange:x?secret=A'),
  verifyTotp: vi.fn((_secret: string, code: string) => code === '123456'),
}));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') } }));
// lib/mfa: RPC/DB wrappers stubbed; recovery-code hashing logic unit-tested in lib/__tests__/mfa.test.ts.
vi.mock('@/lib/mfa', () => ({
  saveStaffMfaSecret: vi.fn().mockResolvedValue(undefined),
  getStaffMfaSecret: vi.fn().mockResolvedValue('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  generateRecoveryCodes: vi.fn(() => ({
    plain: Array.from({ length: 10 }, (_, i) => `AAAA${i}-BBBBB`),
    hashes: Array.from({ length: 10 }, (_, i) => `hash-${i}`),
  })),
  replaceRecoveryCodes: vi.fn().mockResolvedValue(undefined),
  consumeRecoveryCode: vi.fn().mockResolvedValue(false),
  countUnusedRecoveryCodes: vi.fn().mockResolvedValue(8),
  TRUSTED_DEVICE_DAYS: 30,
  createTrustedDevice: vi.fn().mockResolvedValue('raw-device-token'),
  consumeTrustedDevice: vi.fn().mockResolvedValue(null),
  revokeAllTrustedDevices: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/known-login', () => ({
  recordLoginLocation: vi.fn().mockResolvedValue({ isNewLocation: false }),
  touchSessionLastSeen: vi.fn().mockResolvedValue(undefined),
}));
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
const mockValidatePassword = vi.mocked(pwPolicy.validateNewPassword);
const emailSvc = await import('@/lib/email-service');
const mockLockedEmail = vi.mocked(emailSvc.sendAccountLockedEmail);
const mockAlertEmail = vi.mocked(emailSvc.sendSecurityAlertEmail);
const mfaLib = await import('@/lib/mfa');
const mockConsumeRecovery = vi.mocked(mfaLib.consumeRecoveryCode);
const mockReplaceRecovery = vi.mocked(mfaLib.replaceRecoveryCodes);
const mockConsumeTrustedDevice = vi.mocked(mfaLib.consumeTrustedDevice);
const mockCreateTrustedDevice = vi.mocked(mfaLib.createTrustedDevice);
const mockRevokeTrustedDevices = vi.mocked(mfaLib.revokeAllTrustedDevices);

const {
  registerStaff,
  requestStaffPasswordReset, resetStaffPassword, loginStaffAction,
  updateStaffUsername, updateStaffEmail, updateStaffPassword,
  verifyStaffMfa, startMfaEnrollment, confirmMfaEnrollment, regenerateRecoveryCodes,
  getStaffMfaStatusList, resetStaffMfa,
  getMyStaffSessionsAndDevices, revokeStaffSession, revokeOtherStaffSessions, revokeStaffTrustedDevice,
} = await import('../auth-staff');

// PNG data URI ที่ผ่านการตรวจ prefix + ขนาด (registerStaff decode + เช็ค 0 < size <= 2MB)
function pngDataUri(sizeBytes = 100): string {
  const buf = Buffer.alloc(Math.max(sizeBytes, 8), 0);
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function validStaffPayload(overrides: Record<string, any> = {}) {
  return {
    employee_id: 'GPO-123',
    username: 'newstaff',
    password: 'purple-turtle-canyon-92',
    full_name: 'พนักงาน ใหม่',
    department: 'csr',
    email: 'newstaff@example.com',
    signature_url: pngDataUri(),
    ...overrides,
  };
}

const { cookies: mockedCookies } = await import('next/headers');

function hashOtp(otp: string) {
  return crypto.createHash('sha256').update(otp + process.env.OTP_PEPPER).digest('hex');
}

function seed(overrides: { staff_users?: any[]; otp_logs?: any[]; sessions?: any[] } = {}) {
  fakeAdmin.seed({
    staff_users: overrides.staff_users ?? [],
    otp_logs: overrides.otp_logs ?? [],
    sessions: overrides.sessions ?? [],
  });
}

// ── helpers ใช้เฉพาะ updateStaffUsername/updateStaffEmail/updateStaffPassword — ต่างจาก
// requestStaffPasswordReset/resetStaffPassword ด้านบนตรงที่ทั้ง 3 ฟังก์ชันนี้ authenticate
// ผ่าน getStaffSession() (คุกกี้ + join sessions.staff_users) แทนการรับ username มาตรงๆ —
// ต้องทั้ง seed แถว `sessions` แบบฝัง staff_users มาด้วย (fake ไม่ resolve join จริง แค่คืน
// ตามที่ seed มาตรงๆ — ดูคอมเมนต์ FakeQueryBuilder.select) และ seed ตาราง `staff_users` แยก
// อีกชุด (สำหรับ verifyCurrentPassword/update ที่ query ตรงๆ ไม่ผ่าน join)
const VALID_TOKEN = '11111111-1111-1111-1111-111111111111';

function seedAuthedStaff(overrides: Partial<{
  id: string; username: string; email: string | null; password_hash: string; department: string; role: string;
  mfa_enabled: boolean; mfa_grace_until: string | null; failed_login_count: number; locked_until: string | null;
}> = {}) {
  const staffRow = {
    id: overrides.id ?? 's1',
    username: overrides.username ?? 'dofcoffee',
    full_name: 'Test Staff',
    role: overrides.role ?? 'staff',
    department: overrides.department ?? 'csr',
    is_approved: true,
    sale_customer_types: null,
    sale_provinces: null,
    email: overrides.email ?? 'staff@example.com',
    signature_url: null,
    password_hash: overrides.password_hash ?? 'unused-hash',
    mfa_enabled: overrides.mfa_enabled ?? false,
    mfa_enrolled_at: null,
    // default: not in grace and not enrolled would force enrollment, which most
    // pre-MFA tests don't expect — give a far-future grace unless a test overrides.
    mfa_grace_until:
      overrides.mfa_grace_until === undefined
        ? new Date(Date.now() + 999 * 86400_000).toISOString()
        : overrides.mfa_grace_until,
    mfa_pending: false,
    failed_login_count: overrides.failed_login_count ?? 0,
    locked_until: overrides.locked_until ?? null,
  };
  fakeAdmin.seed({
    staff_users: [staffRow],
    sessions: [{
      token: VALID_TOKEN, actor_type: 'staff', staff_id: staffRow.id,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      mfa_pending: false,
      staff_users: staffRow,
    }],
  });
  return staffRow;
}

async function setSessionCookie(token: string | null) {
  const store: any = await mockedCookies();
  if (token) store.set('staff_session', token);
  else store.delete('staff_session');
}

async function setCookie(name: string, value: string | null) {
  const store: any = await mockedCookies();
  if (value) store.set(name, value);
  else store.delete(name);
}

beforeEach(async () => {
  await setSessionCookie(null);
  await setCookie('staff_mfa_device', null);
});

beforeEach(() => {
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99 });
  mockAssertPassword.mockReset();
  mockAssertPassword.mockReturnValue({ ok: true });
  mockIsBreached.mockReset();
  mockIsBreached.mockResolvedValue({ breached: false, checkFailed: false });
  mockValidatePassword.mockReset();
  mockValidatePassword.mockResolvedValue({ ok: true, breachCheckFailed: false });
  mockConsumeRecovery.mockReset();
  mockConsumeRecovery.mockResolvedValue(false);
  mockReplaceRecovery.mockReset();
  mockReplaceRecovery.mockResolvedValue(undefined);
  mockConsumeTrustedDevice.mockReset();
  mockConsumeTrustedDevice.mockResolvedValue(null);
  mockCreateTrustedDevice.mockReset();
  mockCreateTrustedDevice.mockResolvedValue('raw-device-token');
  mockRevokeTrustedDevices.mockReset();
  mockRevokeTrustedDevices.mockResolvedValue(undefined);
  process.env.MFA_SECRET_KEY = 'test-mfa-key-0123456789';
});

describe('registerStaff', () => {
  it('runs the new password through the full policy (validateNewPassword) with account identifiers', async () => {
    seed();
    await registerStaff(validStaffPayload({ email: 'newstaff@example.com', username: 'newstaff', employee_id: 'GPO-123', full_name: 'พนักงาน ใหม่' }));
    expect(mockValidatePassword).toHaveBeenCalledWith('purple-turtle-canyon-92', {
      identifiers: ['newstaff@example.com', 'newstaff', 'GPO-123', 'พนักงาน ใหม่'],
    });
  });

  it('rejects before touching storage when the password fails the policy', async () => {
    seed();
    mockValidatePassword.mockResolvedValueOnce({ ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร' });
    const uploadSpy = vi.spyOn(fakeAdmin.client.storage.from('signatures'), 'upload');

    const res = await registerStaff(validStaffPayload());

    expect(res).toEqual({ success: false, error: 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร' });
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(fakeAdmin.rows('staff_users')).toHaveLength(0);
  });
});

describe('registerStaff — signature + row', () => {
  it('rejects when the per-IP rate limit is exceeded, before decoding/uploading the signature', async () => {
    seed();
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const uploadSpy = vi.spyOn(fakeAdmin.client.storage.from('signatures'), 'upload');

    const res = await registerStaff(validStaffPayload());

    expect(res).toEqual({ success: false, error: 'ลงทะเบียนถี่เกินไป กรุณาลองใหม่ในภายหลัง' });
    expect(mockCheckRateLimit).toHaveBeenCalledWith('register-staff-ip:203.0.113.5', 8, 3600);
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(fakeAdmin.rows('staff_users')).toHaveLength(0);
  });

  it('creates an unapproved staff row (is_approved=false) and stores the signature path, not raw base64', async () => {
    seed();
    const uploadSpy = vi.spyOn(fakeAdmin.client.storage.from('signatures'), 'upload');

    const res = await registerStaff(validStaffPayload());

    expect(res).toEqual({ success: true });
    const rows = fakeAdmin.rows('staff_users');
    expect(rows).toHaveLength(1);
    expect(rows[0].is_approved).toBe(false);
    expect(rows[0].role).toBe('staff');
    expect(rows[0].username).toBe('newstaff');
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(rows[0].signature_url).toMatch(/^staff\/.+\.png$/);
    expect(rows[0].signature_url).not.toContain('base64');
  });

  it('assigns role "manager" when the department is manager', async () => {
    seed();
    const res = await registerStaff(validStaffPayload({ department: 'manager', username: 'bossperson' }));
    expect(res).toEqual({ success: true });
    expect(fakeAdmin.rows('staff_users')[0].role).toBe('manager');
  });
});

describe('requestStaffPasswordReset', () => {
  it('rejects an empty username without touching rate limit or DB', async () => {
    const res = await requestStaffPasswordReset('   ');
    expect(res).toEqual({ success: false, error: 'กรุณากรอก Username' });
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('returns success without creating an OTP for an unknown username (anti-enumeration)', async () => {
    seed();
    const res = await requestStaffPasswordReset('nobody');
    expect(res).toEqual({ success: true });
    expect(fakeAdmin.rows('otp_logs')).toHaveLength(0);
  });

  it('returns success without creating an OTP for an unapproved staff account', async () => {
    seed({ staff_users: [{ id: 's1', username: 'pending', email: 'pending@example.com', is_approved: false }] });
    const res = await requestStaffPasswordReset('pending');
    expect(res).toEqual({ success: true });
    expect(fakeAdmin.rows('otp_logs')).toHaveLength(0);
  });

  it('returns success without creating an OTP for an approved staff account with no email on file', async () => {
    seed({ staff_users: [{ id: 's2', username: 'noemail', email: null, is_approved: true }] });
    const res = await requestStaffPasswordReset('noemail');
    expect(res).toEqual({ success: true });
    expect(fakeAdmin.rows('otp_logs')).toHaveLength(0);
  });

  it('creates a 5-minute OTP for an approved staff account with an email', async () => {
    seed({ staff_users: [{ id: 's3', username: 'dofcoffee', email: 'sale@example.com', is_approved: true }] });
    const before = Date.now();
    const res = await requestStaffPasswordReset('dofcoffee');
    expect(res).toEqual({ success: true });

    const logs = fakeAdmin.rows('otp_logs');
    expect(logs).toHaveLength(1);
    expect(logs[0].email).toBe('sale@example.com');
    expect(logs[0].used).toBe(false);
    expect(logs[0].otp_hash).toMatch(/^[0-9a-f]{64}$/);
    const expiresAt = new Date(logs[0].expires_at).getTime();
    expect(expiresAt).toBeGreaterThan(before + 4 * 60_000);
    expect(expiresAt).toBeLessThanOrEqual(before + 5 * 60_000 + 5_000);
  });

  it('is blocked by the request-side rate limiter', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    seed({ staff_users: [{ id: 's4', username: 'dofcoffee', email: 'sale@example.com', is_approved: true }] });
    const res = await requestStaffPasswordReset('dofcoffee');
    expect(res).toEqual({ success: false, error: 'ขอรหัสถี่เกินไป กรุณารอสักครู่' });
    expect(fakeAdmin.rows('otp_logs')).toHaveLength(0);
  });
});

describe('resetStaffPassword', () => {
  it('rejects an empty username', async () => {
    const res = await resetStaffPassword('   ', '123456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'กรุณากรอก Username' });
  });

  it('rejects a non-6-digit OTP', async () => {
    const res = await resetStaffPassword('dofcoffee', '12a456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
  });

  it('rejects a password that fails the policy shape check, before rate limit / DB', async () => {
    mockAssertPassword.mockReturnValueOnce({ ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร' });
    const res = await resetStaffPassword('dofcoffee', '123456', 'abc');
    expect(res).toEqual({ success: false, error: 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร' });
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('rejects with the generic OTP error for an unknown username', async () => {
    seed();
    const res = await resetStaffPassword('nobody', '123456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
  });

  it('rejects when the staff account has no OTP on record', async () => {
    seed({ staff_users: [{ id: 's1', username: 'dofcoffee', email: 'sale@example.com', password_hash: 'oldhash' }] });
    const res = await resetStaffPassword('dofcoffee', '123456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
  });

  it('rejects an already-used OTP', async () => {
    seed({
      staff_users: [{ id: 's1', username: 'dofcoffee', email: 'sale@example.com', password_hash: 'oldhash' }],
      otp_logs: [{
        id: 1, email: 'sale@example.com', otp_hash: hashOtp('123456'),
        expires_at: new Date(Date.now() + 60_000).toISOString(), used: true, created_at: new Date().toISOString(),
      }],
    });
    const res = await resetStaffPassword('dofcoffee', '123456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
  });

  it('rejects an expired OTP', async () => {
    seed({
      staff_users: [{ id: 's1', username: 'dofcoffee', email: 'sale@example.com', password_hash: 'oldhash' }],
      otp_logs: [{
        id: 1, email: 'sale@example.com', otp_hash: hashOtp('123456'),
        expires_at: new Date(Date.now() - 60_000).toISOString(), used: false, created_at: new Date().toISOString(),
      }],
    });
    const res = await resetStaffPassword('dofcoffee', '123456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
  });

  it('rejects a wrong OTP value without mutating the password', async () => {
    seed({
      staff_users: [{ id: 's1', username: 'dofcoffee', email: 'sale@example.com', password_hash: 'oldhash' }],
      otp_logs: [{
        id: 1, email: 'sale@example.com', otp_hash: hashOtp('123456'),
        expires_at: new Date(Date.now() + 60_000).toISOString(), used: false, created_at: new Date().toISOString(),
      }],
    });
    const res = await resetStaffPassword('dofcoffee', '999999', 'newpass123');
    expect(res).toEqual({ success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
    expect(fakeAdmin.rows('staff_users')[0].password_hash).toBe('oldhash');
  });

  it('is blocked by the verify-side rate limiter before touching the DB', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    seed({
      staff_users: [{ id: 's1', username: 'dofcoffee', email: 'sale@example.com', password_hash: 'oldhash' }],
      otp_logs: [{
        id: 1, email: 'sale@example.com', otp_hash: hashOtp('123456'),
        expires_at: new Date(Date.now() + 60_000).toISOString(), used: false, created_at: new Date().toISOString(),
      }],
    });
    const res = await resetStaffPassword('dofcoffee', '123456', 'newpass123');
    expect(res).toEqual({ success: false, error: 'ลองยืนยันถี่เกินไป กรุณารอสักครู่' });
    expect(fakeAdmin.rows('staff_users')[0].password_hash).toBe('oldhash');
  });

  it('on a correct OTP: updates the password hash, marks the OTP used, and revokes only this staff member\'s staff sessions', async () => {
    seed({
      staff_users: [
        { id: 's1', username: 'dofcoffee', email: 'sale@example.com', password_hash: 'oldhash' },
        { id: 's2', username: 'otherstaff', email: 'other@example.com', password_hash: 'untouched' },
      ],
      otp_logs: [{
        id: 1, email: 'sale@example.com', otp_hash: hashOtp('123456'),
        expires_at: new Date(Date.now() + 60_000).toISOString(), used: false, created_at: new Date().toISOString(),
      }],
      sessions: [
        { id: 1, actor_type: 'staff', staff_id: 's1', token: 'tok-1' },
        { id: 2, actor_type: 'staff', staff_id: 's2', token: 'tok-2' },
        { id: 3, actor_type: 'customer', staff_id: null, customer_id: 'c1', token: 'tok-3' },
      ],
    });

    const res = await resetStaffPassword('dofcoffee', '123456', 'newpass123');
    expect(res).toEqual({ success: true });

    const staff = fakeAdmin.rows('staff_users').find((s) => s.id === 's1');
    expect(staff?.password_hash).not.toBe('oldhash');

    const otherStaff = fakeAdmin.rows('staff_users').find((s) => s.id === 's2');
    expect(otherStaff?.password_hash).toBe('untouched');

    expect(fakeAdmin.rows('otp_logs')[0].used).toBe(true);

    const remainingSessionTokens = fakeAdmin.rows('sessions').map((s) => s.token);
    expect(remainingSessionTokens).toEqual(['tok-2', 'tok-3']);

    const resetLogs = fakeAdmin.rows('staff_password_reset_logs');
    expect(resetLogs).toHaveLength(1);
    expect(resetLogs[0].staff_id).toBe('s1');
    expect(resetLogs[0].ip).toBe('203.0.113.5');
  });

  it('a breached password is rejected AFTER OTP verification but BEFORE the OTP is consumed (user can retry with the same OTP)', async () => {
    seed({
      staff_users: [{ id: 's1', username: 'dofcoffee', email: 'sale@example.com', password_hash: 'oldhash' }],
      otp_logs: [{
        id: 1, email: 'sale@example.com', otp_hash: hashOtp('123456'),
        expires_at: new Date(Date.now() + 60_000).toISOString(), used: false, created_at: new Date().toISOString(),
      }],
    });
    mockIsBreached.mockResolvedValueOnce({ breached: true, checkFailed: false });

    const res = await resetStaffPassword('dofcoffee', '123456', 'hunter2-but-longer-x');

    expect(res).toEqual({ success: false, error: expect.stringContaining('รั่วไหล') });
    expect(fakeAdmin.rows('staff_users')[0].password_hash).toBe('oldhash');
    expect(fakeAdmin.rows('otp_logs')[0].used).toBe(false); // ยังไม่ consume
  });
});

describe('loginStaffAction', () => {
  it('is blocked by the login-side rate limiter before touching the DB', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    seed({ staff_users: [{ id: 's1', username: 'dofcoffee', password_hash: 'hash', role: 'staff', is_approved: true, department: 'csr' }] });
    const res = await loginStaffAction({ username: 'dofcoffee', password: 'whatever' });
    expect(res).toEqual({ success: false, error: 'เข้าสู่ระบบถี่เกินไป กรุณารอสักครู่' });
  });

  it('logs in successfully (grace window) and creates a full session when the rate limiter allows it', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    const grace = new Date(Date.now() + 10 * 86400_000).toISOString();
    seed({ staff_users: [{ id: 's1', username: 'dofcoffee', password_hash: hash, role: 'staff', is_approved: true, department: 'csr', mfa_enabled: false, mfa_grace_until: grace }] });
    const res = await loginStaffAction({ username: 'dofcoffee', password: 'correctpass' });
    expect(res).toMatchObject({ success: true, mfa: 'grace', role: 'staff', department: 'csr' });

    const sessions = fakeAdmin.rows('sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ actor_type: 'staff', staff_id: 's1', mfa_pending: false });
  });

  it('with MFA enabled, returns an mfa challenge and a pending session (no full login yet)', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ staff_users: [{ id: 's1', username: 'dofcoffee', password_hash: hash, role: 'staff', is_approved: true, department: 'csr', mfa_enabled: true, mfa_grace_until: null }] });
    const res = await loginStaffAction({ username: 'dofcoffee', password: 'correctpass' });
    expect(res).toEqual({ success: true, mfa: 'challenge' });
    expect(fakeAdmin.rows('sessions')[0]).toMatchObject({ mfa_pending: true });
  });

  it('past the grace window with no MFA, forces enrollment', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    const past = new Date(Date.now() - 86400_000).toISOString();
    seed({ staff_users: [{ id: 's1', username: 'dofcoffee', password_hash: hash, role: 'staff', is_approved: true, department: 'csr', mfa_enabled: false, mfa_grace_until: past }] });
    const res = await loginStaffAction({ username: 'dofcoffee', password: 'correctpass' });
    expect(res).toEqual({ success: true, mfa: 'enroll' });
    expect(fakeAdmin.rows('sessions')[0]).toMatchObject({ mfa_pending: true });
  });

  // ── Account lockout (audit §P1-4) ──
  it('increments failed_login_count on a wrong password; locks + emails on the 5th consecutive failure', async () => {
    seed({ staff_users: [{ id: 's1', username: 'dofcoffee', email: 'd@example.com', password_hash: 'realhash', role: 'staff', is_approved: true, department: 'csr', failed_login_count: 4 }] });
    const res = await loginStaffAction({ username: 'dofcoffee', password: 'wrong' });
    expect(res).toEqual({ success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

    const staff = fakeAdmin.rows('staff_users')[0];
    expect(staff.failed_login_count).toBe(5);
    expect(new Date(staff.locked_until).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(mockLockedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'd@example.com', minutesLocked: 15 }));
  });

  it('rejects with a lockout message (no real bcrypt) while locked_until is in the future', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ staff_users: [{ id: 's1', username: 'dofcoffee', password_hash: hash, role: 'staff', is_approved: true, department: 'csr', failed_login_count: 5, locked_until: new Date(Date.now() + 10 * 60_000).toISOString() }] });
    const res = await loginStaffAction({ username: 'dofcoffee', password: 'correctpass' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('ถูกล็อกชั่วคราว');
    expect(fakeAdmin.rows('sessions')).toHaveLength(0);
  });

  it('clears failed_login_count + locked_until on a successful login', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    const grace = new Date(Date.now() + 10 * 86400_000).toISOString();
    seed({ staff_users: [{ id: 's1', username: 'dofcoffee', password_hash: hash, role: 'staff', is_approved: true, department: 'csr', failed_login_count: 3, locked_until: new Date(Date.now() - 60_000).toISOString(), mfa_enabled: false, mfa_grace_until: grace }] });
    const res = await loginStaffAction({ username: 'dofcoffee', password: 'correctpass' });
    expect(res.success).toBe(true);
    const staff = fakeAdmin.rows('staff_users')[0];
    expect(staff.failed_login_count).toBe(0);
    expect(staff.locked_until).toBeNull();
  });
});

describe('updateStaffUsername', () => {
  it('rejects when there is no session', async () => {
    const res = await updateStaffUsername('whatever', 'newname');
    expect(res).toEqual({ success: false, error: 'กรุณาเข้าสู่ระบบใหม่' });
  });

  it('rejects a new username shorter than 3 characters without checking the password', async () => {
    seedAuthedStaff();
    await setSessionCookie(VALID_TOKEN);
    const res = await updateStaffUsername('whatever', 'ab');
    expect(res).toEqual({ success: false, error: 'Username ต้องมีความยาว 3-50 ตัวอักษร' });
  });

  it('rejects re-submitting the current username unchanged', async () => {
    seedAuthedStaff({ username: 'dofcoffee' });
    await setSessionCookie(VALID_TOKEN);
    const res = await updateStaffUsername('whatever', 'dofcoffee');
    expect(res).toEqual({ success: false, error: 'Username นี้เป็น Username ปัจจุบันของคุณอยู่แล้ว' });
  });

  it('rejects an incorrect current password without changing anything', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seedAuthedStaff({ password_hash: hash });
    await setSessionCookie(VALID_TOKEN);
    const res = await updateStaffUsername('wrongpass', 'newname');
    expect(res).toEqual({ success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    expect(fakeAdmin.rows('staff_users')[0].username).toBe('dofcoffee');
  });

  it('rejects a username already used by another staff account', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seedAuthedStaff({ password_hash: hash });
    await setSessionCookie(VALID_TOKEN);
    fakeAdmin.seed({
      staff_users: [
        ...fakeAdmin.rows('staff_users'),
        { id: 's2', username: 'taken', password_hash: 'x' },
      ],
      sessions: fakeAdmin.rows('sessions'),
    });
    const res = await updateStaffUsername('correctpass', 'taken');
    expect(res).toEqual({ success: false, error: 'Username นี้ถูกใช้งานแล้ว' });
  });

  it('is blocked by the shared account-update rate limiter before touching the DB', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    seedAuthedStaff();
    await setSessionCookie(VALID_TOKEN);
    const res = await updateStaffUsername('correctpass', 'newname');
    expect(res).toEqual({ success: false, error: 'ทำรายการถี่เกินไป กรุณารอสักครู่' });
    expect(fakeAdmin.rows('staff_users')[0].username).toBe('dofcoffee');
  });

  it('on a correct password: updates the username and logs the change with old/new value + ip', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seedAuthedStaff({ password_hash: hash, username: 'dofcoffee', email: 'staff@example.com' });
    await setSessionCookie(VALID_TOKEN);

    const res = await updateStaffUsername('correctpass', ' newname ');
    expect(res).toEqual({ success: true });
    expect(fakeAdmin.rows('staff_users')[0].username).toBe('newname');

    const logs = fakeAdmin.rows('staff_account_change_logs');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      staff_id: 's1', field: 'username', old_value: 'dofcoffee', new_value: 'newname', ip: '203.0.113.5',
    });
  });
});

describe('updateStaffEmail', () => {
  it('rejects when there is no session', async () => {
    const res = await updateStaffEmail('whatever', 'new@example.com');
    expect(res).toEqual({ success: false, error: 'กรุณาเข้าสู่ระบบใหม่' });
  });

  it('rejects a malformed email without checking the password', async () => {
    seedAuthedStaff();
    await setSessionCookie(VALID_TOKEN);
    const res = await updateStaffEmail('whatever', 'not-an-email');
    expect(res).toEqual({ success: false, error: 'กรุณากรอกอีเมลให้ถูกต้อง' });
  });

  it('rejects re-submitting the current email unchanged', async () => {
    seedAuthedStaff({ email: 'staff@example.com' });
    await setSessionCookie(VALID_TOKEN);
    const res = await updateStaffEmail('whatever', 'staff@example.com');
    expect(res).toEqual({ success: false, error: 'อีเมลนี้เป็นอีเมลปัจจุบันของคุณอยู่แล้ว' });
  });

  it('rejects an incorrect current password without changing anything', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seedAuthedStaff({ password_hash: hash, email: 'staff@example.com' });
    await setSessionCookie(VALID_TOKEN);
    const res = await updateStaffEmail('wrongpass', 'new@example.com');
    expect(res).toEqual({ success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    expect(fakeAdmin.rows('staff_users')[0].email).toBe('staff@example.com');
  });

  it('on a correct password: updates the email and logs the change with old/new value + ip', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seedAuthedStaff({ password_hash: hash, email: 'old@example.com' });
    await setSessionCookie(VALID_TOKEN);

    const res = await updateStaffEmail('correctpass', 'new@example.com');
    expect(res).toEqual({ success: true });
    expect(fakeAdmin.rows('staff_users')[0].email).toBe('new@example.com');

    const logs = fakeAdmin.rows('staff_account_change_logs');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      staff_id: 's1', field: 'email', old_value: 'old@example.com', new_value: 'new@example.com', ip: '203.0.113.5',
    });
  });
});

describe('updateStaffPassword', () => {
  it('rejects when there is no session', async () => {
    const res = await updateStaffPassword('whatever', 'newpass123');
    expect(res).toEqual({ success: false, error: 'กรุณาเข้าสู่ระบบใหม่' });
  });

  it('rejects a new password that fails the policy shape check, without checking the current password', async () => {
    seedAuthedStaff();
    await setSessionCookie(VALID_TOKEN);
    mockAssertPassword.mockReturnValueOnce({ ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร' });
    const res = await updateStaffPassword('whatever', 'abc');
    expect(res).toEqual({ success: false, error: 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร' });
    // passes the session username + email as blocklist identifiers
    expect(mockAssertPassword).toHaveBeenCalledWith('abc', { identifiers: ['dofcoffee', 'staff@example.com'] });
  });

  it('rejects a breached new password after verifying the current one, without changing the hash', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 12);
    seedAuthedStaff({ password_hash: hash });
    await setSessionCookie(VALID_TOKEN);
    mockIsBreached.mockResolvedValueOnce({ breached: true, checkFailed: false });
    const res = await updateStaffPassword('correctpass', 'a-very-common-leaked-one');
    expect(res).toEqual({ success: false, error: expect.stringContaining('รั่วไหล') });
    expect(fakeAdmin.rows('staff_users')[0].password_hash).toBe(hash);
  });

  it('rejects an incorrect current password without changing the hash', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seedAuthedStaff({ password_hash: hash });
    await setSessionCookie(VALID_TOKEN);
    const res = await updateStaffPassword('wrongpass', 'newpass123');
    expect(res).toEqual({ success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    expect(fakeAdmin.rows('staff_users')[0].password_hash).toBe(hash);
  });

  it('on a correct password: updates the hash, keeps the current session, revokes every other staff session, and logs the change without storing values', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    const staffRow = seedAuthedStaff({ password_hash: hash });
    await setSessionCookie(VALID_TOKEN);
    fakeAdmin.seed({
      staff_users: [staffRow],
      sessions: [
        ...fakeAdmin.rows('sessions'),
        { token: 'other-device-token', actor_type: 'staff', staff_id: 's1', expires_at: new Date(Date.now() + 3600_000).toISOString(), staff_users: staffRow },
        { token: 'other-staff-token', actor_type: 'staff', staff_id: 's2', expires_at: new Date(Date.now() + 3600_000).toISOString() },
        { token: 'customer-token', actor_type: 'customer', customer_id: 'c1', expires_at: new Date(Date.now() + 3600_000).toISOString() },
      ],
    });
    const sessionsBefore = fakeAdmin.rows('sessions');
    expect(sessionsBefore).toHaveLength(4);

    const res = await updateStaffPassword('correctpass', 'newpass123');
    expect(res).toEqual({ success: true });

    const updatedHash = fakeAdmin.rows('staff_users')[0].password_hash;
    expect(updatedHash).not.toBe(hash);

    // เหลือ: session ปัจจุบัน (VALID_TOKEN, ไม่ถูก revoke), session ของ staff อื่น (s2, ไม่ใช่
    // เจ้าของบัญชีนี้เลยไม่โดน filter), session ฝั่งลูกค้า (actor_type ต่างกัน) — โดน revoke
    // แค่ "other-device-token" ที่เป็น staff เดียวกันแต่คนละ token เท่านั้น
    const remainingTokens = fakeAdmin.rows('sessions').map((s) => s.token).sort();
    expect(remainingTokens).toEqual(['customer-token', 'other-staff-token', VALID_TOKEN].sort());

    const logs = fakeAdmin.rows('staff_account_change_logs');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ staff_id: 's1', field: 'password', old_value: null, new_value: null, ip: '203.0.113.5' });
  });

  it('is blocked by the shared account-update rate limiter before touching the DB', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seedAuthedStaff({ password_hash: hash });
    await setSessionCookie(VALID_TOKEN);
    const res = await updateStaffPassword('correctpass', 'newpass123');
    expect(res).toEqual({ success: false, error: 'ทำรายการถี่เกินไป กรุณารอสักครู่' });
    expect(fakeAdmin.rows('staff_users')[0].password_hash).toBe(hash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MFA — Phase 2 (13-mfa-remember-me-design.md)
// ─────────────────────────────────────────────────────────────────────────────

function seedPendingMfaSession(staffOverrides: Record<string, any> = {}) {
  const staffRow = {
    id: 's1', username: 'dofcoffee', full_name: 'Test Staff', role: 'staff',
    department: 'csr', is_approved: true, email: 'staff@example.com',
    password_hash: 'unused', mfa_enabled: false, mfa_enrolled_at: null,
    mfa_grace_until: null, failed_login_count: 0, locked_until: null,
    ...staffOverrides,
  };
  fakeAdmin.seed({
    staff_users: [staffRow],
    sessions: [{
      token: VALID_TOKEN, actor_type: 'staff', staff_id: 's1',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      mfa_pending: true, staff_users: staffRow,
    }],
    staff_mfa_recovery_codes: [],
    staff_account_change_logs: [],
  });
  return staffRow;
}

describe('verifyStaffMfa', () => {
  it('rejects when there is no session cookie', async () => {
    await setSessionCookie(null);
    const res = await verifyStaffMfa({ code: '123456' });
    expect(res).toEqual({ success: false, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  });

  it('accepts a valid TOTP code, clears mfa_pending and extends the session', async () => {
    seedAuthedStaff({ mfa_enabled: true });
    await setSessionCookie(VALID_TOKEN);
    const res = await verifyStaffMfa({ code: '123456' });
    expect(res).toEqual({ success: true, role: 'staff', department: 'csr' });
    expect(fakeAdmin.rows('sessions')[0].mfa_pending).toBe(false);
  });

  it('rejects a wrong code and increments the shared lockout counter', async () => {
    seedPendingMfaSession({ mfa_enabled: true, failed_login_count: 2 });
    await setSessionCookie(VALID_TOKEN);
    const res = await verifyStaffMfa({ code: '000000' });
    expect(res).toEqual({ success: false, error: 'รหัสยืนยันไม่ถูกต้อง' });
    expect(fakeAdmin.rows('staff_users')[0].failed_login_count).toBe(3);
    expect(fakeAdmin.rows('sessions')[0].mfa_pending).toBe(true);
  });

  it('falls back to a recovery code when the TOTP does not match', async () => {
    seedAuthedStaff({ mfa_enabled: true });
    await setSessionCookie(VALID_TOKEN);
    mockConsumeRecovery.mockResolvedValueOnce(true);
    const res = await verifyStaffMfa({ code: 'AAAA1-BBBBB' });
    expect(res.success).toBe(true);
    expect(mockConsumeRecovery).toHaveBeenCalledWith('s1', 'AAAA1-BBBBB');
  });

  it('is fail-closed on the rate limiter', async () => {
    seedAuthedStaff({ mfa_enabled: true });
    await setSessionCookie(VALID_TOKEN);
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await verifyStaffMfa({ code: '123456' });
    expect(res).toEqual({ success: false, error: 'ยืนยันรหัสถี่เกินไป กรุณารอสักครู่' });
  });

  it('refuses while the account is locked', async () => {
    seedAuthedStaff({ mfa_enabled: true, locked_until: new Date(Date.now() + 600_000).toISOString() });
    await setSessionCookie(VALID_TOKEN);
    const res = await verifyStaffMfa({ code: '123456' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('ถูกล็อกชั่วคราว');
  });
});

describe('startMfaEnrollment / confirmMfaEnrollment', () => {
  it('startMfaEnrollment returns a QR + manual key for a pending session', async () => {
    seedPendingMfaSession();
    await setSessionCookie(VALID_TOKEN);
    const res = await startMfaEnrollment();
    expect(res).toMatchObject({ success: true, qrDataUrl: expect.stringContaining('data:image'), manualKey: expect.any(String) });
  });

  it('startMfaEnrollment refuses when MFA is already enabled', async () => {
    seedPendingMfaSession({ mfa_enabled: true });
    await setSessionCookie(VALID_TOKEN);
    const res = await startMfaEnrollment();
    expect(res).toEqual({ success: false, error: 'บัญชีนี้เปิดใช้งาน MFA อยู่แล้ว' });
  });

  it('confirmMfaEnrollment with the right code enables MFA, issues 10 codes and clears mfa_pending', async () => {
    seedPendingMfaSession();
    await setSessionCookie(VALID_TOKEN);
    const res = await confirmMfaEnrollment('123456');
    expect(res.success).toBe(true);
    expect((res as any).recoveryCodes).toHaveLength(10);
    const staff = fakeAdmin.rows('staff_users')[0];
    expect(staff.mfa_enabled).toBe(true);
    expect(staff.mfa_grace_until).toBeNull();
    expect(fakeAdmin.rows('sessions')[0].mfa_pending).toBe(false);
    expect(mockReplaceRecovery).toHaveBeenCalledWith('s1', expect.arrayContaining(['hash-0']));
    const logs = fakeAdmin.rows('staff_account_change_logs');
    expect(logs[0]).toMatchObject({ field: 'mfa', new_value: 'enrolled' });
  });

  it('confirmMfaEnrollment rejects a wrong code without enabling MFA', async () => {
    seedPendingMfaSession();
    await setSessionCookie(VALID_TOKEN);
    const res = await confirmMfaEnrollment('000000');
    expect(res).toEqual({ success: false, error: 'รหัสยืนยันไม่ถูกต้อง กรุณาลองใหม่' });
    expect(fakeAdmin.rows('staff_users')[0].mfa_enabled).toBe(false);
  });
});

describe('regenerateRecoveryCodes', () => {
  it('requires the current password and returns a fresh set', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seedAuthedStaff({ password_hash: hash, mfa_enabled: true });
    await setSessionCookie(VALID_TOKEN);
    const res = await regenerateRecoveryCodes('correctpass');
    expect(res.success).toBe(true);
    expect((res as any).recoveryCodes).toHaveLength(10);
    expect(mockReplaceRecovery).toHaveBeenCalled();
  });

  it('rejects a wrong current password', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seedAuthedStaff({ password_hash: hash, mfa_enabled: true });
    await setSessionCookie(VALID_TOKEN);
    const res = await regenerateRecoveryCodes('wrongpass');
    expect(res).toEqual({ success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  });

  it('refuses when MFA is not enabled', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seedAuthedStaff({ password_hash: hash, mfa_enabled: false });
    await setSessionCookie(VALID_TOKEN);
    const res = await regenerateRecoveryCodes('correctpass');
    expect(res).toEqual({ success: false, error: 'ยังไม่ได้เปิดใช้งาน MFA' });
  });
});

describe('resetStaffMfa (manager only)', () => {
  const MANAGER_TOKEN = '22222222-2222-2222-2222-222222222222';

  function seedManagerAndTarget(targetOverrides: Record<string, any> = {}) {
    const manager = {
      id: '33333333-3333-3333-3333-333333333333', username: 'boss', full_name: 'Boss', role: 'manager', department: 'manager',
      is_approved: true, email: 'boss@example.com', password_hash: 'x',
      sale_customer_types: null, sale_provinces: null, signature_url: null,
      mfa_enabled: true, mfa_grace_until: null,
    };
    const target = {
      id: '44444444-4444-4444-4444-444444444444', username: 'target', full_name: 'Target Staff', role: 'staff', department: 'csr',
      is_approved: true, email: 'target@example.com', mfa_enabled: true, mfa_enrolled_at: '2026-08-01T00:00:00Z',
      mfa_grace_until: null, ...targetOverrides,
    };
    fakeAdmin.seed({
      staff_users: [manager, target],
      sessions: [{
        token: MANAGER_TOKEN, actor_type: 'staff', staff_id: '33333333-3333-3333-3333-333333333333',
        expires_at: new Date(Date.now() + 3600_000).toISOString(), mfa_pending: false,
        staff_users: manager,
      }],
      staff_mfa_recovery_codes: [{ id: 'rc1', staff_id: '44444444-4444-4444-4444-444444444444', code_hash: 'h', used_at: null }],
      staff_account_change_logs: [],
    });
  }

  it('clears the target MFA, revokes their sessions and logs the change', async () => {
    seedManagerAndTarget();
    await setSessionCookie(MANAGER_TOKEN);
    const res = await resetStaffMfa('44444444-4444-4444-4444-444444444444');
    expect(res.success).toBe(true);
    const target = fakeAdmin.rows('staff_users').find((s) => s.id === '44444444-4444-4444-4444-444444444444')!;
    expect(target.mfa_enabled).toBe(false);
    expect(target.mfa_secret).toBeNull();
    expect(new Date(target.mfa_grace_until).getTime()).toBeGreaterThan(Date.now());
    expect(fakeAdmin.rows('staff_mfa_recovery_codes')).toHaveLength(0);
    expect(fakeAdmin.rows('staff_account_change_logs')[0]).toMatchObject({ staff_id: '44444444-4444-4444-4444-444444444444', field: 'mfa' });
  });

  it('rejects a non-manager', async () => {
    seedAuthedStaff({ role: 'staff' });
    await setSessionCookie(VALID_TOKEN);
    const res = await resetStaffMfa('44444444-4444-4444-4444-444444444444');
    expect(res).toEqual({ success: false, error: 'คุณไม่มีสิทธิ์ดำเนินการนี้' });
  });

  it('refuses to reset your own MFA', async () => {
    seedManagerAndTarget();
    await setSessionCookie(MANAGER_TOKEN);
    const res = await resetStaffMfa('33333333-3333-3333-3333-333333333333');
    expect(res.success).toBe(false);
    expect(res.error).toContain('ตัวเอง');
  });

  it('getStaffMfaStatusList is manager-only', async () => {
    seedAuthedStaff({ role: 'staff' });
    await setSessionCookie(VALID_TOKEN);
    const res = await getStaffMfaStatusList();
    expect(res).toEqual({ success: false, error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MFA — Phase 3 (trusted devices + session management)
// ─────────────────────────────────────────────────────────────────────────────

describe('loginStaffAction — trusted device', () => {
  it('skips the TOTP challenge when a valid trusted-device cookie is present', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ staff_users: [{ id: 's1', username: 'dofcoffee', password_hash: hash, role: 'staff', is_approved: true, department: 'csr', mfa_enabled: true, mfa_grace_until: null }] });
    await setCookie('staff_mfa_device', 'device-raw-token');
    mockConsumeTrustedDevice.mockResolvedValueOnce('rotated-token');

    const res = await loginStaffAction({ username: 'dofcoffee', password: 'correctpass' });
    expect(res).toEqual({ success: true, mfa: 'trusted', role: 'staff', department: 'csr' });
    expect(fakeAdmin.rows('sessions')[0].mfa_pending).toBe(false);
    expect(mockConsumeTrustedDevice).toHaveBeenCalledWith('s1', 'device-raw-token', expect.any(Object));
  });

  it('falls back to the TOTP challenge when the device cookie does not match', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ staff_users: [{ id: 's1', username: 'dofcoffee', password_hash: hash, role: 'staff', is_approved: true, department: 'csr', mfa_enabled: true, mfa_grace_until: null }] });
    await setCookie('staff_mfa_device', 'stale-token');
    mockConsumeTrustedDevice.mockResolvedValueOnce(null);

    const res = await loginStaffAction({ username: 'dofcoffee', password: 'correctpass' });
    expect(res).toEqual({ success: true, mfa: 'challenge' });
    expect(fakeAdmin.rows('sessions')[0].mfa_pending).toBe(true);
  });
});

describe('verifyStaffMfa — rememberDevice', () => {
  it('registers a trusted device when rememberDevice is true', async () => {
    seedAuthedStaff({ mfa_enabled: true });
    await setSessionCookie(VALID_TOKEN);
    const res = await verifyStaffMfa({ code: '123456', rememberDevice: true });
    expect(res.success).toBe(true);
    expect(mockCreateTrustedDevice).toHaveBeenCalledWith('s1', expect.any(Object));
  });

  it('does not register a device without rememberDevice', async () => {
    seedAuthedStaff({ mfa_enabled: true });
    await setSessionCookie(VALID_TOKEN);
    await verifyStaffMfa({ code: '123456' });
    expect(mockCreateTrustedDevice).not.toHaveBeenCalled();
  });
});

describe('updateStaffPassword / resetStaffPassword — revoke trusted devices', () => {
  it('updateStaffPassword revokes all trusted devices', async () => {
    const hash = await (await import('bcryptjs')).hash('oldpass', 10);
    seedAuthedStaff({ password_hash: hash, mfa_enabled: true });
    await setSessionCookie(VALID_TOKEN);
    await updateStaffPassword('oldpass', 'a-brand-new-passphrase');
    expect(mockRevokeTrustedDevices).toHaveBeenCalledWith('s1');
  });
});

describe('staff session management', () => {
  function seedSessionsForStaff() {
    const staffRow = {
      id: 's1', username: 'dofcoffee', full_name: 'Test Staff', role: 'staff', department: 'csr',
      is_approved: true, email: 'staff@example.com', mfa_enabled: true, mfa_grace_until: null,
      sale_customer_types: null, sale_provinces: null, signature_url: null,
    };
    fakeAdmin.seed({
      staff_users: [staffRow],
      sessions: [
        { token: VALID_TOKEN, actor_type: 'staff', staff_id: 's1', mfa_pending: false, expires_at: new Date(Date.now() + 3600_000).toISOString(), created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), user_agent: 'Chrome/124 Windows NT 10.0', ip: '203.0.113.1', staff_users: staffRow },
        { token: '99999999-9999-9999-9999-999999999999', actor_type: 'staff', staff_id: 's1', mfa_pending: false, expires_at: new Date(Date.now() + 3600_000).toISOString(), created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), user_agent: 'Firefox/125 Linux', ip: '198.51.100.2' },
      ],
      staff_trusted_devices: [
        { id: '55555555-5555-5555-5555-555555555555', staff_id: 's1', label: 'Chrome บน Windows', user_agent: 'x', ip: '203.0.113.1', last_used_at: new Date().toISOString(), created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 20 * 86400_000).toISOString() },
      ],
    });
  }

  it('lists sessions (marking the current one) and trusted devices', async () => {
    seedSessionsForStaff();
    await setSessionCookie(VALID_TOKEN);
    const res = await getMyStaffSessionsAndDevices();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.sessions).toHaveLength(2);
    expect(res.sessions.filter((s) => s.isCurrent)).toHaveLength(1);
    expect(res.devices).toHaveLength(1);
  });

  it('revokes a specific non-current session by its short id', async () => {
    seedSessionsForStaff();
    await setSessionCookie(VALID_TOKEN);
    const { sessionShortId } = await import('@/lib/device');
    const otherSid = sessionShortId('99999999-9999-9999-9999-999999999999');
    const res = await revokeStaffSession(otherSid);
    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('sessions').map((s) => s.token)).toEqual([VALID_TOKEN]);
  });

  it('refuses to revoke the current session', async () => {
    seedSessionsForStaff();
    await setSessionCookie(VALID_TOKEN);
    const { sessionShortId } = await import('@/lib/device');
    const res = await revokeStaffSession(sessionShortId(VALID_TOKEN));
    expect(res.success).toBe(false);
  });

  it('revokeOtherStaffSessions keeps only the current session', async () => {
    seedSessionsForStaff();
    await setSessionCookie(VALID_TOKEN);
    const res = await revokeOtherStaffSessions();
    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('sessions').map((s) => s.token)).toEqual([VALID_TOKEN]);
  });

  it('revokeStaffTrustedDevice deletes only that device for this staff', async () => {
    seedSessionsForStaff();
    await setSessionCookie(VALID_TOKEN);
    const res = await revokeStaffTrustedDevice('55555555-5555-5555-5555-555555555555');
    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('staff_trusted_devices')).toHaveLength(0);
  });
});
