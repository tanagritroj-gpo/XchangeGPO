import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('../auth-actions', () => ({ getCustomerSession: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99 }) }));
vi.mock('../../services/pdf-service', () => ({
  buildReturnFormPdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { getCustomerSession } = await import('../auth-actions');
const mockGetCustomerSession = vi.mocked(getCustomerSession);
const { checkRateLimit } = await import('@/lib/rate-limit');
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const { buildReturnFormPdf } = await import('../../services/pdf-service');
const mockBuildPdf = vi.mocked(buildReturnFormPdf);

const { generatePdfAction } = await import('../generate-pdf-action');

const CUSTOMER = { id: 1, email: 'c@example.com', hospital_name: 'รพ.ทดสอบ', contact_name: 'สมชาย', customer_code: 'C-0007', phone: null, position: null, province: 'สงขลา' };

function seedOwnedRequest(overrides: Record<string, any> = {}) {
  fakeAdmin.seed({
    requests: [{
      id: 1, ref_id: 'REF-1', doc_number: 'S001/2026',
      drug_items: [], b2b_customers: { customer_code: 'C-0007' },
      ...overrides,
    }],
    document_attachments: [],
    status_logs: [],
    access_logs: [],
  });
}

beforeEach(() => {
  mockGetCustomerSession.mockReset();
  mockGetCustomerSession.mockResolvedValue(CUSTOMER as any);
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99 });
  mockBuildPdf.mockClear();
});

describe('generatePdfAction — guards', () => {
  it('rejects a non-positive-integer requestId', async () => {
    const res = await generatePdfAction(-1);
    expect(res).toEqual({ success: false, error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' });
  });

  it('requires login', async () => {
    mockGetCustomerSession.mockResolvedValue(null);
    const res = await generatePdfAction(1);
    expect(res).toEqual({ success: false, error: 'กรุณาเข้าสู่ระบบ' });
  });

  it('rejects when the per-customer throttle is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    seedOwnedRequest();
    const res = await generatePdfAction(1);
    expect(res).toEqual({ success: false, error: 'มีการเรียกดูเอกสารถี่เกินไป กรุณารอสักครู่' });
  });

  it('returns the same generic message for "not found" and "belongs to another organization" (anti-enumeration)', async () => {
    fakeAdmin.seed({ requests: [], document_attachments: [], status_logs: [], access_logs: [] });
    const notFound = await generatePdfAction(999);

    seedOwnedRequest({ b2b_customers: { customer_code: 'SOMEONE-ELSE' } });
    const wrongOrg = await generatePdfAction(1);

    expect(notFound).toEqual({ success: false, error: 'ไม่พบคำร้องนี้ หรือไม่มีสิทธิ์เข้าถึง' });
    expect(wrongOrg).toEqual({ success: false, error: 'ไม่พบคำร้องนี้ หรือไม่มีสิทธิ์เข้าถึง' });
  });
});

describe('generatePdfAction — first generation vs. reuse of an existing PDF', () => {
  it('builds and uploads a new PDF, records document_attachments + a system status_log, on first generation', async () => {
    seedOwnedRequest();
    const res = await generatePdfAction(1);
    expect(res.success).toBe(true);
    expect(mockBuildPdf).toHaveBeenCalledTimes(1);
    expect(fakeAdmin.rows('document_attachments')).toHaveLength(1);
    expect(fakeAdmin.rows('status_logs')).toMatchObject([{ status_name: 'document_generated', actor_type: 'system' }]);
  });

  it('reuses the existing file_path and does not rebuild the PDF or duplicate the document_attachments/status_logs rows on a second call', async () => {
    seedOwnedRequest();
    fakeAdmin.rows('document_attachments').push({ id: 'doc-1', request_id: 1, kind: 'final', file_path: 'returns/1/REF-1.pdf' });
    // must actually exist in the fake storage bucket for createSignedUrl to succeed
    await fakeAdmin.client.storage.from('return-documents').upload('returns/1/REF-1.pdf', new Uint8Array([9]));

    const res = await generatePdfAction(1);
    expect(res.success).toBe(true);
    expect(mockBuildPdf).not.toHaveBeenCalled();
    expect(fakeAdmin.rows('document_attachments')).toHaveLength(1);
    expect(fakeAdmin.rows('status_logs')).toHaveLength(0);
  });

  it('still writes a fresh access_logs (PDPA) entry every time, even when reusing an existing file', async () => {
    seedOwnedRequest();
    fakeAdmin.rows('document_attachments').push({ id: 'doc-1', request_id: 1, kind: 'final', file_path: 'returns/1/REF-1.pdf' });
    await fakeAdmin.client.storage.from('return-documents').upload('returns/1/REF-1.pdf', new Uint8Array([9]));

    await generatePdfAction(1);
    await generatePdfAction(1);

    const accessLogs = fakeAdmin.rows('access_logs').filter((r) => r.action === 'generate_pdf' && r.request_id === 1);
    expect(accessLogs).toHaveLength(2);
  });

  it('returns a signed URL with a 300s expiry and the request\'s ref_id/doc_number', async () => {
    seedOwnedRequest();
    const res: any = await generatePdfAction(1);
    expect(res).toMatchObject({ success: true, expiresIn: 300, refId: 'REF-1', docNumber: 'S001/2026' });
    expect(res.url).toContain('return-documents');
  });

  it('fails cleanly, without leaking the raw storage error, when the upload fails', async () => {
    seedOwnedRequest();
    vi.spyOn(fakeAdmin.client.storage.from('return-documents'), 'upload').mockResolvedValueOnce({ data: null, error: { message: 'disk full' } } as any);
    const res = await generatePdfAction(1);
    expect(res).toEqual({ success: false, error: 'บันทึกไฟล์ไม่สำเร็จ กรุณาลองใหม่' });
  });
});
