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
  loginCustomerAction,
  loginCustomerByVerifiedEmail,
  requestCustomerPasswordReset,
  resetCustomerPassword,
} = await import('../auth-actions');

function hashOtp(otp: string) {
  return crypto.createHash('sha256').update(otp + process.env.OTP_PEPPER).digest('hex');
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

  it('logs in on correct email+password and creates a session', async () => {
    const hash = await (await import('bcryptjs')).hash('correctpass', 10);
    seed({ b2b_customers: [{ id: 1, email: 'cust@example.com', password_hash: hash }] });
    const res = await loginCustomerAction({ email: 'cust@example.com', password: 'correctpass' });
    expect(res).toEqual({ success: true });

    const sessions = fakeAdmin.rows('sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ actor_type: 'customer', customer_id: 1 });
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

  it('rejects a password shorter than 6 characters', async () => {
    const res = await resetCustomerPassword('cust@example.com', '123456', 'abc');
    expect(res).toEqual({ success: false, error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
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
