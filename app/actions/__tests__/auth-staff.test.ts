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

const {
  requestStaffPasswordReset, resetStaffPassword, loginStaffAction,
  updateStaffUsername, updateStaffEmail, updateStaffPassword,
} = await import('../auth-staff');

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
  id: string; username: string; email: string | null; password_hash: string; department: string;
}> = {}) {
  const staffRow = {
    id: overrides.id ?? 's1',
    username: overrides.username ?? 'dofcoffee',
    full_name: 'Test Staff',
    role: 'staff',
    department: overrides.department ?? 'csr',
    is_approved: true,
    sale_customer_types: null,
    sale_provinces: null,
    email: overrides.email ?? 'staff@example.com',
    signature_url: null,
    password_hash: overrides.password_hash ?? 'unused-hash',
  };
  fakeAdmin.seed({
    staff_users: [staffRow],
    sessions: [{
      token: VALID_TOKEN, actor_type: 'staff', staff_id: staffRow.id,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
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

beforeEach(async () => {
  await setSessionCookie(null);
});

beforeEach(() => {
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99 });
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

  it('rejects a password shorter than 6 characters', async () => {
    const res = await resetStaffPassword('dofcoffee', '123456', 'abc');
    expect(res).toEqual({ success: false, error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
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
});

describe('loginStaffAction', () => {
  it('is blocked by the login-side rate limiter before touching the DB', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    seed({ staff_users: [{ id: 's1', username: 'dofcoffee', password_hash: 'hash', role: 'staff', is_approved: true, department: 'csr' }] });
    const res = await loginStaffAction({ username: 'dofcoffee', password: 'whatever' });
    expect(res).toEqual({ success: false, error: 'เข้าสู่ระบบถี่เกินไป กรุณารอสักครู่' });
  });

  it('logs in successfully and creates a session when the rate limiter allows it', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ staff_users: [{ id: 's1', username: 'dofcoffee', password_hash: hash, role: 'staff', is_approved: true, department: 'csr' }] });
    const res = await loginStaffAction({ username: 'dofcoffee', password: 'correctpass' });
    expect(res).toEqual({ success: true, role: 'staff', department: 'csr' });

    const sessions = fakeAdmin.rows('sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ actor_type: 'staff', staff_id: 's1' });
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

  it('rejects a new password shorter than 6 characters without checking the current password', async () => {
    seedAuthedStaff();
    await setSessionCookie(VALID_TOKEN);
    const res = await updateStaffPassword('whatever', 'abc');
    expect(res).toEqual({ success: false, error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
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
