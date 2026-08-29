import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99 }) }));
vi.mock('@/lib/email-service', () => ({ sendRegistrationReceivedEmail: vi.fn().mockResolvedValue({ error: null }) }));
// password policy: permissive by default — real policy logic is unit-tested in lib/__tests__/password-policy.test.ts.
// Here we only verify registerCustomer wires the result through (see the wiring tests below).
vi.mock('@/lib/password-policy', () => ({
  validateNewPassword: vi.fn().mockResolvedValue({ ok: true, breachCheckFailed: false }),
}));
// registerCustomer อ่าน IP จาก headers() สำหรับ per-IP rate limit (register-customer-ip:)
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.7' })),
}));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { checkRateLimit } = await import('@/lib/rate-limit');
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const { sendRegistrationReceivedEmail } = await import('@/lib/email-service');
const mockSendRegEmail = vi.mocked(sendRegistrationReceivedEmail);
const { validateNewPassword } = await import('@/lib/password-policy');
const mockValidatePassword = vi.mocked(validateNewPassword);

const { registerCustomer } = await import('../auth');

function pngDataUri(sizeBytes = 100): string {
  const buf = Buffer.alloc(Math.max(sizeBytes, 8), 0);
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function validPayload(overrides: Record<string, any> = {}) {
  return {
    hospital_name: 'รพ.ทดสอบ',
    org_type: 'gov_hospital',
    province: 'สงขลา',
    contact_name: 'สมชาย ทดสอบ',
    position: 'เภสัชกร',
    phone: '0812345678',
    email: 'newcustomer@example.com',
    password: 'password123',
    signature_url: pngDataUri(200),
    ...overrides,
  };
}

beforeEach(() => {
  fakeAdmin.seed({ clients: [], notification_log: [] });
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99 });
  mockSendRegEmail.mockReset();
  mockSendRegEmail.mockResolvedValue({ error: null } as any);
  mockValidatePassword.mockReset();
  mockValidatePassword.mockResolvedValue({ ok: true, breachCheckFailed: false });
});

describe('registerCustomer — password policy is enforced (P0-2)', () => {
  it('checks the new password against the policy, passing account identifiers for the blocklist', async () => {
    await registerCustomer(validPayload({ email: 'p@hospital.go.th', contact_name: 'สมหญิง', hospital_name: 'รพ.กลาง' }));
    expect(mockValidatePassword).toHaveBeenCalledWith('password123', {
      identifiers: ['p@hospital.go.th', 'สมหญิง', 'รพ.กลาง'],
    });
  });

  it('rejects (and creates nothing, uploads nothing) when the policy fails the password', async () => {
    mockValidatePassword.mockResolvedValueOnce({ ok: false, error: 'รหัสผ่านนี้เคยปรากฏในเหตุการณ์ข้อมูลรั่วไหลจากบริการอื่น กรุณาใช้รหัสผ่านอื่น' });
    const uploadSpy = vi.spyOn(fakeAdmin.client.storage.from('signatures'), 'upload');

    const res = await registerCustomer(validPayload());

    expect(res).toEqual({ success: false, error: 'รหัสผ่านนี้เคยปรากฏในเหตุการณ์ข้อมูลรั่วไหลจากบริการอื่น กรุณาใช้รหัสผ่านอื่น' });
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(fakeAdmin.rows('clients')).toHaveLength(0);
  });
});

describe('registerCustomer — input validation (schema rejects, does not throw)', () => {
  it('rejects a malformed payload entirely (e.g. missing fields)', async () => {
    const res = await registerCustomer({});
    expect(res).toEqual({ success: false, error: 'ข้อมูลที่กรอกไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' });
  });

  it('rejects an invalid email format', async () => {
    const res = await registerCustomer(validPayload({ email: 'not-an-email' }));
    expect(res.success).toBe(false);
  });

  it('rejects an empty password at the schema layer', async () => {
    const res = await registerCustomer(validPayload({ password: '' }));
    expect(res.success).toBe(false);
  });

  it('rejects a malformed phone number', async () => {
    const res = await registerCustomer(validPayload({ phone: 'not-a-phone' }));
    expect(res.success).toBe(false);
  });

  it('rejects an org_type outside the known ORG_TYPE_OPTIONS enum', async () => {
    const res = await registerCustomer(validPayload({ org_type: 'made_up_type' }));
    expect(res.success).toBe(false);
  });

  it('rejects a signature that is not a PNG data URI (e.g. a plain URL)', async () => {
    const res = await registerCustomer(validPayload({ signature_url: 'https://evil.example/x.png' }));
    expect(res.success).toBe(false);
  });
});

describe('registerCustomer — rate limiting and signature handling', () => {
  it('rejects when the per-IP rate limit is exceeded, before touching storage', async () => {
    // per-IP check runs first (broader gate) — a bot rotating random emails is capped by this
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const uploadSpy = vi.spyOn(fakeAdmin.client.storage.from('signatures'), 'upload');
    const res = await registerCustomer(validPayload());
    expect(res).toEqual({ success: false, error: 'พยายามลงทะเบียนถี่เกินไป กรุณาลองใหม่ภายหลัง' });
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(1, 'register-customer-ip:203.0.113.7', 10, 3600);
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(fakeAdmin.rows('clients')).toHaveLength(0);
  });

  it('rejects when the per-email rate limit is exceeded (2nd gate, after per-IP passes)', async () => {
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 9 })   // per-IP passes
      .mockResolvedValueOnce({ allowed: false, remaining: 0 }); // per-email fails
    const res = await registerCustomer(validPayload());
    expect(res).toEqual({ success: false, error: 'พยายามลงทะเบียนถี่เกินไป กรุณาลองใหม่ภายหลัง' });
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(2, 'register:newcustomer@example.com', 3, 3600);
  });

  it('rejects a signature over the 2MB cap', async () => {
    const res = await registerCustomer(validPayload({ signature_url: pngDataUri(3 * 1024 * 1024) }));
    expect(res).toEqual({ success: false, error: 'ไฟล์ลายเซ็นไม่ถูกต้องหรือมีขนาดใหญ่เกินไป' });
  });

  it('uploads the signature to the private "signatures" bucket, storing a path not the raw base64', async () => {
    const uploadSpy = vi.spyOn(fakeAdmin.client.storage.from('signatures'), 'upload');
    await registerCustomer(validPayload());
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    const [path] = uploadSpy.mock.calls[0];
    expect(path).toMatch(/^registration\/.+\.png$/);
    expect(fakeAdmin.rows('clients')[0].signature_url).toBe(path);
  });

  it('fails cleanly when the signature upload itself fails', async () => {
    vi.spyOn(fakeAdmin.client.storage.from('signatures'), 'upload').mockResolvedValueOnce({ data: null, error: { message: 'disk full' } } as any);
    const res = await registerCustomer(validPayload());
    expect(res).toEqual({ success: false, error: 'บันทึกลายเซ็นไม่สำเร็จ กรุณาลองใหม่' });
    expect(fakeAdmin.rows('clients')).toHaveLength(0);
  });
});

describe('registerCustomer — password handling and stored record', () => {
  it('never stores the plaintext password — password_hash is a bcrypt hash', async () => {
    await registerCustomer(validPayload({ password: 'super-secret-pw' }));
    const stored = fakeAdmin.rows('clients')[0];
    expect(stored.password_hash).toBeDefined();
    expect(stored.password_hash).not.toBe('super-secret-pw');
    expect(stored.password_hash).not.toContain('super-secret-pw');
  });

  it('never returns password_hash back to the caller — only selects id', async () => {
    const res: any = await registerCustomer(validPayload());
    expect(res.success).toBe(true);
    expect(res.data[0]).toEqual({ id: expect.anything() });
    expect(res.data[0].password_hash).toBeUndefined();
  });

  it('sets status=pending and records pdpa_consented_at on the new client row', async () => {
    await registerCustomer(validPayload());
    const stored = fakeAdmin.rows('clients')[0];
    expect(stored.status).toBe('pending');
    expect(stored.pdpa_consented_at).toBeTruthy();
  });
});

describe('registerCustomer — duplicate email handling', () => {
  it('returns a specific Thai message for a duplicate email (23505), not the generic error', async () => {
    fakeAdmin.seed({ clients: [{ id: 1, email: 'newcustomer@example.com' }], notification_log: [] });
    const res = await registerCustomer(validPayload());
    expect(res).toEqual({ success: false, error: 'อีเมลนี้ได้ทำการลงทะเบียนไปแล้ว' });
  });
});

describe('registerCustomer — best-effort side effects never block a successful registration', () => {
  it('still succeeds when the confirmation email fails to send', async () => {
    mockSendRegEmail.mockResolvedValue({ error: new Error('smtp down') } as any);
    const res = await registerCustomer(validPayload());
    expect(res.success).toBe(true);
  });

  it('logs a new_client notification with the submitted org_type/province for Sale/CSR/Manager visibility', async () => {
    await registerCustomer(validPayload({ org_type: 'private_hospital', province: 'ตรัง' }));
    const notif = fakeAdmin.rows('notification_log')[0];
    expect(notif).toMatchObject({ type: 'new_client', org_type: 'private_hospital', province: 'ตรัง' });
  });
});
