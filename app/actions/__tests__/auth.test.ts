import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99 }) }));
vi.mock('@/lib/email-service', () => ({ sendRegistrationReceivedEmail: vi.fn().mockResolvedValue({ error: null }) }));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { checkRateLimit } = await import('@/lib/rate-limit');
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const { sendRegistrationReceivedEmail } = await import('@/lib/email-service');
const mockSendRegEmail = vi.mocked(sendRegistrationReceivedEmail);

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

  it('rejects a password under 6 characters', async () => {
    const res = await registerCustomer(validPayload({ password: '123' }));
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
  it('rejects when the per-email rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await registerCustomer(validPayload());
    expect(res).toEqual({ success: false, error: 'พยายามลงทะเบียนถี่เกินไป กรุณาลองใหม่ภายหลัง' });
    expect(mockCheckRateLimit).toHaveBeenCalledWith('register:newcustomer@example.com', 3, 3600);
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
