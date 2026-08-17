import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('../auth-actions', () => ({ getCustomerSession: vi.fn() }));
vi.mock('../auth-staff', () => ({ getStaffSession: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99 }) }));
vi.mock('@/lib/email-service', () => ({ sendPdfDocumentEmail: vi.fn().mockResolvedValue({ error: null }) }));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { getCustomerSession } = await import('../auth-actions');
const mockGetCustomerSession = vi.mocked(getCustomerSession);
const { checkRateLimit } = await import('@/lib/rate-limit');
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const { sendPdfDocumentEmail } = await import('@/lib/email-service');
const mockSendPdfDocumentEmail = vi.mocked(sendPdfDocumentEmail);

const { sendPdfEmailAction } = await import('../send-pdf-email-action');

const CUSTOMER = { id: 1, email: 'customer@example.com', hospital_name: 'รพ.ทดสอบ', contact_name: 'สมชาย', customer_code: 'C-0007', phone: null, position: null, province: 'สงขลา' };

function seedOwnedRequest(overrides: Record<string, any> = {}) {
  fakeAdmin.seed({
    requests: [{
      id: 1, ref_id: 'REF-1', hospital_name: 'รพ.ทดสอบ', doc_number: 'S001/2026',
      request_date: '2026-01-01', created_at: '2026-01-01', request_type: 'รับคืนแลกเปลี่ยน',
      return_reason: 'x', delivery_type: 'ขนส่ง', total_value: 100,
      drug_items: [{ drug_name: 'Paracetamol', qty: 1, unit: 'กล่อง', lot_number: 'L1', exp_date: null }],
      b2b_customers: { customer_code: 'C-0007' },
      ...overrides,
    }],
    document_attachments: [{ id: 'doc-1', request_id: 1, file_path: 'returns/1/REF-1.pdf' }],
    status_logs: [], access_logs: [],
    organizations: [], staff_users: [],
  });
}

beforeEach(async () => {
  mockGetCustomerSession.mockReset();
  mockGetCustomerSession.mockResolvedValue(CUSTOMER as any);
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99 });
  mockSendPdfDocumentEmail.mockReset();
  mockSendPdfDocumentEmail.mockResolvedValue({ error: null } as any);
});

describe('sendPdfEmailAction — guards', () => {
  it('rejects a non-positive-integer requestId', async () => {
    const res = await sendPdfEmailAction(-1);
    expect(res).toEqual({ success: false, error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' });
  });

  it('requires login', async () => {
    mockGetCustomerSession.mockResolvedValue(null);
    const res = await sendPdfEmailAction(1);
    expect(res).toEqual({ success: false, error: 'กรุณาเข้าสู่ระบบ' });
  });

  it('rejects when the per-customer throttle is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    await fakeAdmin.client.storage.from('return-documents').upload('returns/1/REF-1.pdf', new Uint8Array([1]));
    seedOwnedRequest();
    const res = await sendPdfEmailAction(1);
    expect(res).toEqual({ success: false, error: 'ส่งอีเมลถี่เกินไป กรุณาลองใหม่ภายหลัง' });
  });

  it('returns the same generic message for "not found" and "belongs to another organization"', async () => {
    fakeAdmin.seed({ requests: [], document_attachments: [], status_logs: [], access_logs: [], organizations: [], staff_users: [] });
    const notFound = await sendPdfEmailAction(999);

    seedOwnedRequest({ b2b_customers: { customer_code: 'SOMEONE-ELSE' } });
    const wrongOrg = await sendPdfEmailAction(1);

    expect(notFound).toEqual({ success: false, error: 'ไม่พบคำร้องนี้ หรือไม่มีสิทธิ์เข้าถึง' });
    expect(wrongOrg).toEqual({ success: false, error: 'ไม่พบคำร้องนี้ หรือไม่มีสิทธิ์เข้าถึง' });
  });

  it('requires that a PDF was already generated', async () => {
    fakeAdmin.seed({
      requests: [{ id: 1, ref_id: 'REF-1', b2b_customers: { customer_code: 'C-0007' }, drug_items: [] }],
      document_attachments: [], status_logs: [], access_logs: [], organizations: [], staff_users: [],
    });
    const res = await sendPdfEmailAction(1);
    expect(res).toEqual({ success: false, error: 'ไม่พบไฟล์เอกสาร กรุณาสร้างเอกสาร PDF ก่อนส่งอีเมล' });
  });
});

describe('sendPdfEmailAction — happy path', () => {
  beforeEach(async () => {
    seedOwnedRequest();
    await fakeAdmin.client.storage.from('return-documents').upload('returns/1/REF-1.pdf', new Uint8Array([1]));
  });

  it('always sends to the current session email, never a stored/stale address', async () => {
    const res = await sendPdfEmailAction(1);
    expect(res).toEqual({ success: true, message: 'ส่งอีเมลสำเร็จแล้ว' });
    expect(mockSendPdfDocumentEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'customer@example.com', refId: 'REF-1' }));
  });

  it('records a system status_log and a PDPA access_log entry', async () => {
    await sendPdfEmailAction(1);
    expect(fakeAdmin.rows('status_logs')).toMatchObject([{ status_name: 'email_sent', actor_type: 'system' }]);
    expect(fakeAdmin.rows('access_logs')).toMatchObject([{ actor_type: 'customer', action: 'send_pdf_email', request_id: 1 }]);
  });

  it('also CCs the sale rep(s) covering this organization, best-effort', async () => {
    fakeAdmin.seed({
      requests: fakeAdmin.rows('requests'),
      document_attachments: fakeAdmin.rows('document_attachments'),
      status_logs: [], access_logs: [],
      organizations: [{ id: 7, customer_code: 'C-0007', hospital_name: 'รพ.ทดสอบ', province: 'สงขลา', org_type: 'gov_hospital' }],
      staff_users: [{ id: 'sale-1', full_name: 'ฝ่ายขายใต้', email: 'sale@example.com', department: 'sale', is_approved: true, sale_customer_types: ['government'], sale_provinces: ['สงขลา'] }],
    });
    const res = await sendPdfEmailAction(1);
    expect(res.success).toBe(true);
    expect(mockSendPdfDocumentEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'customer@example.com' }));
    expect(mockSendPdfDocumentEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'sale@example.com' }));
  });

  it('still reports success to the customer even if the best-effort sale CC fails', async () => {
    fakeAdmin.seed({
      requests: fakeAdmin.rows('requests'),
      document_attachments: fakeAdmin.rows('document_attachments'),
      status_logs: [], access_logs: [],
      organizations: [{ id: 7, customer_code: 'C-0007', hospital_name: 'รพ.ทดสอบ', province: 'สงขลา', org_type: 'gov_hospital' }],
      staff_users: [{ id: 'sale-1', full_name: 'ฝ่ายขายใต้', email: 'sale@example.com', department: 'sale', is_approved: true, sale_customer_types: ['government'], sale_provinces: ['สงขลา'] }],
    });
    mockSendPdfDocumentEmail.mockImplementation(async ({ to }: any) =>
      to === 'sale@example.com' ? { error: new Error('sale mailbox full') } : { error: null }
    );
    const res = await sendPdfEmailAction(1);
    expect(res).toEqual({ success: true, message: 'ส่งอีเมลสำเร็จแล้ว' });
  });

  it('fails cleanly, without leaking the raw SMTP error, when the customer\'s own email fails to send', async () => {
    mockSendPdfDocumentEmail.mockResolvedValue({ error: new Error('smtp connection refused') } as any);
    const res = await sendPdfEmailAction(1);
    expect(res).toEqual({ success: false, error: 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่ภายหลัง' });
  });
});
