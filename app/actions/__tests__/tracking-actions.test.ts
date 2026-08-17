import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('../auth-actions', () => ({ getCustomerSession: vi.fn() }));
vi.mock('../auth-staff', () => ({ getStaffSession: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99 }) }));
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.5' })),
}));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { getCustomerSession } = await import('../auth-actions');
const mockGetCustomerSession = vi.mocked(getCustomerSession);
const { getStaffSession } = await import('../auth-staff');
const mockGetStaffSession = vi.mocked(getStaffSession);
const { checkRateLimit } = await import('@/lib/rate-limit');
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const { getTrackingTimeline, trackMyRequestByRefId, getRequestTrackingForStaff } = await import('../tracking-actions');

const CUSTOMER = { id: 1, email: 'c@example.com', hospital_name: 'รพ.ทดสอบ', contact_name: 'สมชาย', customer_code: 'C-0007', phone: null, position: null, province: 'สงขลา' };
const CSR_STAFF = { id: 'csr-1', username: 'csr1', full_name: 'CSR หนึ่ง', department: 'csr', role: 'staff', sale_customer_types: null, sale_provinces: null, email: null, signature_url: null };

const FULL_DRUG_ITEM = {
  id: 1, request_id: 1, drug_name: 'Paracetamol', qty: 10, unit: 'กล่อง', lot_number: 'LOT1', exp_date: '2027-01-01',
  current_status: 'approved',
  value_amount: 50000, invoice_number: 'INV-SECRET-001', compliance_remark: 'internal note', is_compliant: true, unit_price: 5000,
};

beforeEach(() => {
  mockGetCustomerSession.mockReset();
  mockGetCustomerSession.mockResolvedValue(CUSTOMER as any);
  mockGetStaffSession.mockReset();
  mockGetStaffSession.mockResolvedValue(CSR_STAFF as any);
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99 });
});

describe('getTrackingTimeline — public, no login required', () => {
  it('rejects an empty refId', async () => {
    await expect(getTrackingTimeline('   ')).resolves.toEqual({ error: 'รหัสอ้างอิงไม่ถูกต้อง' });
  });

  it('rejects a refId over 50 characters', async () => {
    await expect(getTrackingTimeline('R'.repeat(51))).resolves.toEqual({ error: 'รหัสอ้างอิงไม่ถูกต้อง' });
  });

  it('rejects when the general per-IP throttle is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await getTrackingTimeline('REF-1');
    expect(res).toEqual({ error: 'ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง' });
  });

  it('returns a generic not-found message, gated by a separate stricter "miss" throttle', async () => {
    fakeAdmin.seed({ requests: [], timeline_summary: [], drug_items: [] });
    const res = await getTrackingTimeline('REF-DOES-NOT-EXIST');
    expect(res).toEqual({ error: 'ไม่พบรหัสอ้างอิงนี้ในระบบ' });
    // both the general throttle and the miss-specific throttle get checked on a miss
    expect(mockCheckRateLimit).toHaveBeenCalledWith(expect.stringMatching(/^track:miss:/), 8, 15 * 60);
  });

  it('returns a distinct error once the miss-specific throttle is exceeded (slows down ref_id enumeration)', async () => {
    fakeAdmin.seed({ requests: [], timeline_summary: [], drug_items: [] });
    mockCheckRateLimit.mockImplementation(async (key: string) =>
      key.startsWith('track:miss:') ? { allowed: false, remaining: 0 } : { allowed: true, remaining: 99 }
    );
    const res = await getTrackingTimeline('REF-DOES-NOT-EXIST');
    expect(res).toEqual({ error: 'ค้นหาผิดพลาดหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง' });
  });

  it('never exposes value_amount/invoice_number/compliance_remark/is_compliant/unit_price — public-facing safe-column allowlist', async () => {
    fakeAdmin.seed({
      requests: [{ id: 1, ref_id: 'REF-1', current_status: 'approved', created_at: '2026-01-01', request_type: 'รับคืนแลกเปลี่ยน' }],
      timeline_summary: [{ id: 1, request_id: 1, status_name: 'approved', log_date: '2026-01-01', drug_item_id: 1 }],
      drug_items: [FULL_DRUG_ITEM],
    });
    const res: any = await getTrackingTimeline('REF-1');
    expect(res.error).toBeUndefined();
    expect(res.drug_items).toHaveLength(1);
    const returned = res.drug_items[0];
    for (const sensitiveField of ['value_amount', 'invoice_number', 'compliance_remark', 'is_compliant', 'unit_price']) {
      expect(returned[sensitiveField]).toBeUndefined();
    }
    expect(returned).toMatchObject({ drug_name: 'Paracetamol', qty: 10, unit: 'กล่อง', lot_number: 'LOT1' });
  });

  it('resolves drug_name onto the timeline via a single batched lookup', async () => {
    fakeAdmin.seed({
      requests: [{ id: 1, ref_id: 'REF-1', current_status: 'approved', created_at: '2026-01-01', request_type: 'x' }],
      timeline_summary: [{ id: 1, request_id: 1, status_name: 'rejected', log_date: '2026-01-01', drug_item_id: 1 }],
      drug_items: [FULL_DRUG_ITEM],
    });
    const res: any = await getTrackingTimeline('REF-1');
    expect(res.timeline[0]).toMatchObject({ status_name: 'rejected', drug_name: 'Paracetamol' });
  });
});

describe('trackMyRequestByRefId — private, org-scoped', () => {
  function seedOwnedRequest(overrides: Record<string, any> = {}) {
    fakeAdmin.seed({
      requests: [{
        id: 1, ref_id: 'REF-1', current_status: 'approved',
        drug_items: [{ id: 1, drug_name: 'Paracetamol' }],
        b2b_customers: { customer_code: 'C-0007' },
        ...overrides,
      }],
      timeline_summary: [{ id: 1, request_id: 1, status_name: 'approved', log_date: '2026-01-01', staff_remark: null, drug_item_id: 1 }],
    });
  }

  it('requires login', async () => {
    mockGetCustomerSession.mockResolvedValue(null);
    await expect(trackMyRequestByRefId('REF-1')).resolves.toEqual({ success: false, error: 'กรุณาเข้าสู่ระบบ' });
  });

  it('rejects an empty refId via schema validation before touching the database', async () => {
    const res = await trackMyRequestByRefId('   ');
    expect(res).toEqual({ success: false, error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' });
  });

  it('rejects when the per-session throttle is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    seedOwnedRequest();
    const res = await trackMyRequestByRefId('REF-1');
    expect(res).toEqual({ success: false, error: 'ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' });
  });

  it('returns the same generic error for "not found" and "belongs to another organization" (anti-enumeration)', async () => {
    fakeAdmin.seed({ requests: [], timeline_summary: [] });
    const notFound = await trackMyRequestByRefId('REF-GHOST');

    seedOwnedRequest({ b2b_customers: { customer_code: 'SOMEONE-ELSE' } });
    const wrongOrg = await trackMyRequestByRefId('REF-1');

    expect(notFound).toEqual({ success: false, error: 'ไม่พบข้อมูล หรือไม่มีสิทธิ์เข้าถึง' });
    expect(wrongOrg).toEqual({ success: false, error: 'ไม่พบข้อมูล หรือไม่มีสิทธิ์เข้าถึง' });
  });

  it('allows a request submitted under a different b2b_customer_id of the same organization (customer_code match)', async () => {
    seedOwnedRequest({ b2b_customer_id: 999 }); // not this session's own id, same org code
    const res: any = await trackMyRequestByRefId('REF-1');
    expect(res.success).toBe(true);
    expect(res.data.timeline[0]).toMatchObject({ drug_name: 'Paracetamol' });
  });
});

describe('getRequestTrackingForStaff — manager/csr, sees every request regardless of organization', () => {
  function seedAnyRequest() {
    fakeAdmin.seed({
      requests: [{ id: 1, ref_id: 'REF-1', current_status: 'approved', drug_items: [{ id: 1, drug_name: 'Paracetamol' }] }],
      timeline_summary: [{ id: 1, request_id: 1, status_name: 'approved', log_date: '2026-01-01', staff_remark: 'ตรวจสอบแล้ว', drug_item_id: 1 }],
    });
  }

  it('rejects a non-csr, non-manager staff member', async () => {
    mockGetStaffSession.mockResolvedValue({ ...CSR_STAFF, department: 'wh', role: 'staff' } as any);
    seedAnyRequest();
    const res = await getRequestTrackingForStaff('REF-1');
    expect(res.success).toBe(false);
  });

  it('rejects when the per-staff throttle is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    seedAnyRequest();
    const res = await getRequestTrackingForStaff('REF-1');
    expect(res).toEqual({ success: false, error: 'ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' });
  });

  it('rejects an overlong refId', async () => {
    const res = await getRequestTrackingForStaff('R'.repeat(51));
    expect(res).toEqual({ success: false, error: 'รหัสอ้างอิงไม่ถูกต้อง' });
  });

  it('returns "not found" for a nonexistent ref_id', async () => {
    fakeAdmin.seed({ requests: [], timeline_summary: [] });
    const res = await getRequestTrackingForStaff('REF-GHOST');
    expect(res).toEqual({ success: false, error: 'ไม่พบรหัสอ้างอิงนี้ในระบบ' });
  });

  it('sees a request regardless of which organization owns it — no ownership filter at all, unlike the customer-facing lookup', async () => {
    seedAnyRequest();
    const res: any = await getRequestTrackingForStaff('REF-1');
    expect(res.success).toBe(true);
    expect(res.data.timeline[0]).toMatchObject({ staff_remark: 'ตรวจสอบแล้ว', drug_name: 'Paracetamol' });
  });
});
