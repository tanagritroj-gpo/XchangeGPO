import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('@/lib/return-form-pdf', () => ({
  buildAndStoreReturnPdf: vi.fn().mockResolvedValue({ filePath: 'returns/1/REF-1.pdf' }),
  finalDir: () => 'returns/1',
}));
vi.mock('@/lib/send-return-form-email', () => ({
  sendReturnFormEmail: vi.fn().mockResolvedValue({ error: null }),
  resolveEmailMode: () => 'verified',
}));
vi.mock('@/lib/sale-reps', () => ({ saleEmailsForCustomerCode: vi.fn().mockResolvedValue(['sale@x.com']) }));
vi.mock('@/lib/resolve-signature', () => ({ resolveStaffSignaturePng: vi.fn().mockResolvedValue(null) }));

const STAFF = { id: 'csr-1', full_name: 'ภญ. สมชาย ใจดี', signature_url: null } as any;

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { buildAndStoreReturnPdf } = await import('@/lib/return-form-pdf');
const { sendReturnFormEmail } = await import('@/lib/send-return-form-email');
const mockBuild = vi.mocked(buildAndStoreReturnPdf);
const mockEmail = vi.mocked(sendReturnFormEmail);

const { logComplianceCorrection, deliverVerifiedExchangeDoc } = await import('../exchange-verification');

beforeEach(() => {
  mockBuild.mockClear();
  mockEmail.mockClear();
});

describe('logComplianceCorrection', () => {
  it('writes one compliance_checked status_log + a data_correction_logs row per changed field', async () => {
    fakeAdmin.seed({ status_logs: [], data_correction_logs: [] });
    await logComplianceCorrection({
      requestId: 1, drugItemId: 5, staffId: 's1',
      before: { product_type: null, is_compliant: null, compliance_remark: null },
      after: { product_type: 'OTHER', is_compliant: false, compliance_remark: 'อายุไม่ถึง 7 เดือน' },
    });
    expect(fakeAdmin.rows('status_logs')).toMatchObject([{ status_name: 'compliance_checked', drug_item_id: 5, actor_type: 'staff' }]);
    const dcl = fakeAdmin.rows('data_correction_logs');
    expect(dcl).toHaveLength(3);
    expect(dcl.map((r) => r.field_name).sort()).toEqual(['compliance_remark', 'is_compliant', 'product_type']);
    expect(dcl.every((r) => r.status_log_id === fakeAdmin.rows('status_logs')[0].id)).toBe(true);
  });

  it('does nothing when no field actually changed', async () => {
    fakeAdmin.seed({ status_logs: [], data_correction_logs: [] });
    await logComplianceCorrection({
      requestId: 1, drugItemId: 5, staffId: 's1',
      before: { product_type: 'GPO', is_compliant: true, compliance_remark: 'ผ่านเกณฑ์' },
      after: { product_type: 'GPO', is_compliant: true, compliance_remark: 'ผ่านเกณฑ์' },
    });
    expect(fakeAdmin.rows('status_logs')).toHaveLength(0);
    expect(fakeAdmin.rows('data_correction_logs')).toHaveLength(0);
  });
});

describe('deliverVerifiedExchangeDoc', () => {
  const seedExchange = (over: Record<string, any> = {}) =>
    fakeAdmin.seed({
      requests: [{
        id: 1, ref_id: 'REF-1', request_type: 'รับคืนแลกเปลี่ยน', submission_channel: 'customer_portal',
        customer_email: 'cust@x.com', customer_code: 'C-1', b2b_customer_id: 1,
        drug_items: [{ id: 1, is_compliant: false, compliance_remark: 'x', value_amount: 10 }],
        b2b_customers: { email: 'bc@x.com' },
        ...over,
      }],
      status_logs: [], access_logs: [],
    });

  it('builds the final PDF and emails customer + covering sale, then logs document_sent', async () => {
    seedExchange();
    const res = await deliverVerifiedExchangeDoc(1, STAFF);
    expect(mockBuild).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ kind: 'final', storageDir: 'returns/1', stamp: expect.objectContaining({ kind: 'verified', byName: 'ภญ. สมชาย ใจดี' }) }),
    );
    expect(res?.emailedTo.sort()).toEqual(['cust@x.com', 'sale@x.com']);
    expect(fakeAdmin.rows('status_logs')).toMatchObject([{ status_name: 'document_sent', actor_type: 'staff' }]);
  });

  it('skips csr_manual exchanges', async () => {
    seedExchange({ submission_channel: 'csr_manual' });
    expect(await deliverVerifiedExchangeDoc(1, STAFF)).toBeNull();
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it('skips non-exchange requests', async () => {
    seedExchange({ request_type: 'รับคืนลดหนี้' });
    expect(await deliverVerifiedExchangeDoc(1, STAFF)).toBeNull();
  });

  it('does not send twice (guards on an existing document_sent log)', async () => {
    seedExchange();
    fakeAdmin.rows('status_logs').push({ id: 99, request_id: 1, status_name: 'document_sent' });
    expect(await deliverVerifiedExchangeDoc(1, STAFF)).toBeNull();
    expect(mockEmail).not.toHaveBeenCalled();
  });
});
