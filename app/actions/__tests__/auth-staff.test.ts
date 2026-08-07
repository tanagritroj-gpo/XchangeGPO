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

const { requestStaffPasswordReset, resetStaffPassword, loginStaffAction } = await import('../auth-staff');

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
