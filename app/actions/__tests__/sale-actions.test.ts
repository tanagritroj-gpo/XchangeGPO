import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('../auth-staff', () => ({ getStaffSession: vi.fn() }));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { getStaffSession } = await import('../auth-staff');
const mockGetStaffSession = vi.mocked(getStaffSession);

const { getSaleCoverage, getSaleCustomerHistory, getSaleRequestDetail } = await import('../sale-actions');

// covers 'government' bucket → expands to ['gov_hospital', 'gov_other'] (see lib/sale-coverage.ts),
// scoped to the 7 southern provinces this role is meant to cover
const SALE_STAFF_SOUTH_GOV = {
  id: 'sale-1', username: 'sale1', full_name: 'ฝ่ายขายใต้', department: 'sale', role: 'staff',
  sale_customer_types: ['government'], sale_provinces: ['สงขลา', 'ตรัง'], email: 'sale@example.com', signature_url: null,
};

// The fake query builder (test/fakeSupabase.ts) doesn't perform real joins — a
// `.select('*, drug_items(*), b2b_customers!inner(organizations!inner(...)))')` just
// returns the requests row exactly as seeded, so the joined shape has to be embedded
// directly on the row itself here, the way the real Postgrest client's response looks.
function seedRequestWithOrg(requestId: number, orgType: string, province: string) {
  fakeAdmin.seed({
    requests: [{
      id: requestId,
      ref_id: `REF-${requestId}`,
      current_status: 'approved',
      drug_items: [{ id: 1, drug_name: 'Paracetamol' }],
      b2b_customers: { organizations: { org_type: orgType, province } },
    }],
    timeline_summary: [{ id: 1, request_id: requestId, status_name: 'approved', log_date: '2026-01-01', drug_item_id: 1 }],
  });
}

beforeEach(() => {
  mockGetStaffSession.mockReset();
  mockGetStaffSession.mockResolvedValue(SALE_STAFF_SOUTH_GOV as any);
});

describe('getSaleCoverage — the shared gate every other sale-actions function relies on', () => {
  it('returns null when not logged in', async () => {
    mockGetStaffSession.mockResolvedValue(null);
    await expect(getSaleCoverage()).resolves.toBeNull();
  });

  it('returns null for a staff member outside the sale department, even a manager', async () => {
    mockGetStaffSession.mockResolvedValue({ ...SALE_STAFF_SOUTH_GOV, department: 'csr', role: 'manager' } as any);
    await expect(getSaleCoverage()).resolves.toBeNull();
  });

  it('returns null when sale_customer_types is empty (registered but scope never configured)', async () => {
    mockGetStaffSession.mockResolvedValue({ ...SALE_STAFF_SOUTH_GOV, sale_customer_types: [] } as any);
    await expect(getSaleCoverage()).resolves.toBeNull();
  });

  it('returns null when sale_provinces is empty', async () => {
    mockGetStaffSession.mockResolvedValue({ ...SALE_STAFF_SOUTH_GOV, sale_provinces: [] } as any);
    await expect(getSaleCoverage()).resolves.toBeNull();
  });

  it('expands the government bucket to its raw org_type values', async () => {
    const coverage = await getSaleCoverage();
    expect(coverage).toEqual({
      orgTypes: expect.arrayContaining(['gov_hospital', 'gov_other']),
      provinces: ['สงขลา', 'ตรัง'],
      staffId: 'sale-1',
    });
    expect(coverage!.orgTypes).not.toContain('private_hospital');
  });
});

describe('getSaleCustomerHistory', () => {
  it('returns an empty array without calling the RPC when the session has no coverage', async () => {
    mockGetStaffSession.mockResolvedValue(null);
    const rpcSpy = vi.spyOn(fakeAdmin.client, 'rpc');
    await expect(getSaleCustomerHistory()).resolves.toEqual([]);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('calls the RPC with exactly the coverage derived from the session, never client input', async () => {
    let capturedParams: any;
    fakeAdmin.setRpcHandler('get_sale_customer_history', (params) => {
      capturedParams = params;
      return { data: [{ ref_id: 'REF-1' }], error: null };
    });
    const result = await getSaleCustomerHistory();
    expect(capturedParams).toEqual({
      p_org_types: expect.arrayContaining(['gov_hospital', 'gov_other']),
      p_provinces: ['สงขลา', 'ตรัง'],
    });
    expect(result).toEqual([{ ref_id: 'REF-1' }]);
  });

  it('fails closed to an empty array (not an error) when the RPC errors', async () => {
    fakeAdmin.setRpcHandler('get_sale_customer_history', () => ({ data: null, error: { message: 'db down' } }));
    await expect(getSaleCustomerHistory()).resolves.toEqual([]);
  });
});

describe('getSaleRequestDetail — the critical cross-region/cross-org-type boundary', () => {
  it('rejects a non-positive-integer requestId before touching the database', async () => {
    const res = await getSaleRequestDetail(-1);
    expect(res).toEqual({ success: false, error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' });
  });

  it('rejects when the session has no sale coverage at all', async () => {
    mockGetStaffSession.mockResolvedValue(null);
    seedRequestWithOrg(1, 'gov_hospital', 'สงขลา');
    const res = await getSaleRequestDetail(1);
    expect(res).toEqual({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
  });

  it('rejects a request whose org_type is covered but whose province is outside the sale rep\'s assigned provinces', async () => {
    // org_type matches (gov_hospital is in the government bucket) but province ('ภูเก็ต')
    // is not one of this rep's ['สงขลา','ตรัง'] — must be blocked on province alone.
    seedRequestWithOrg(1, 'gov_hospital', 'ภูเก็ต');
    const res = await getSaleRequestDetail(1);
    expect(res).toEqual({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลใบงานนี้' });
  });

  it('rejects a request whose province is covered but whose org_type bucket is outside the rep\'s assigned types', async () => {
    // province matches ('สงขลา') but org_type is private_hospital — this rep only covers
    // the government bucket, so a private_hospital request in the same province must still
    // be blocked. This is the exact "org_type only, forgot province" or vice-versa mistake
    // this test guards against.
    seedRequestWithOrg(1, 'private_hospital', 'สงขลา');
    const res = await getSaleRequestDetail(1);
    expect(res).toEqual({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลใบงานนี้' });
  });

  it('allows a request whose org_type and province are both within the rep\'s coverage', async () => {
    seedRequestWithOrg(1, 'gov_hospital', 'สงขลา');
    const res = await getSaleRequestDetail(1);
    expect(res.success).toBe(true);
  });

  it('rejects a request with no linked organization data (defensive default-deny, not default-allow)', async () => {
    fakeAdmin.seed({
      requests: [{ id: 1, ref_id: 'REF-1', current_status: 'approved', drug_items: [], b2b_customers: { organizations: null } }],
      timeline_summary: [],
    });
    const res = await getSaleRequestDetail(1);
    expect(res).toEqual({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลใบงานนี้' });
  });

  it('returns "not found" for a request id that does not exist', async () => {
    fakeAdmin.seed({ requests: [], timeline_summary: [] });
    const res = await getSaleRequestDetail(999);
    expect(res).toEqual({ success: false, error: 'ไม่พบข้อมูลใบงานนี้' });
  });

  it('resolves drug_name onto each timeline entry and strips the nested b2b_customers/organizations blob from the response', async () => {
    seedRequestWithOrg(1, 'gov_hospital', 'สงขลา');
    const res: any = await getSaleRequestDetail(1);
    expect(res.success).toBe(true);
    expect(res.data.timeline[0]).toMatchObject({ status_name: 'approved', drug_name: 'Paracetamol' });
    expect(res.data.b2b_customers).toBeUndefined();
  });
});
