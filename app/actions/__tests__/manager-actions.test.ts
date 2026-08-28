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

const {
  getManagerSession, getManagerHubCounts, getAllOrganizations,
  getB2BCustomerOrgLinks, getUnansweredChatbotQuestions, getManagerRequestDetail,
  getManagerStatusLogs, getManagerStatusLogsDetailed,
} = await import('../manager-actions');

function staff(overrides: Partial<{ id: string; department: string; role: string }> = {}) {
  return {
    id: 'staff-1', username: 'u', full_name: 'Staff', role: 'staff', department: 'csr',
    sale_customer_types: null, sale_provinces: null, email: null, signature_url: null, mfa_enabled: false, mfa_grace_until: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetStaffSession.mockReset();
});

describe('getManagerSession — role=manager strictly, department is irrelevant', () => {
  it('rejects no session', async () => {
    mockGetStaffSession.mockResolvedValue(null);
    await expect(getManagerSession()).rejects.toThrow('ไม่ได้ Login');
  });

  it('rejects department=manager with role=staff (checks role, not department)', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'manager', role: 'staff' }));
    await expect(getManagerSession()).rejects.toThrow('คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
  });

  it('allows role=manager from any department', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'wh', role: 'manager' }));
    await expect(getManagerSession()).resolves.toMatchObject({ role: 'manager' });
  });
});

describe('getManagerOrCsrSession — department=csr OR role=manager (via getManagerStatusLogs)', () => {
  it('rejects a non-csr, non-manager staff member', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'wh', role: 'staff' }));
    const res = await getManagerStatusLogs();
    expect(res.success).toBe(false);
  });

  it('allows department=csr', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'csr', role: 'staff' }));
    fakeAdmin.seed({ status_logs: [] });
    await expect(getManagerStatusLogs()).resolves.toMatchObject({ success: true });
  });
});

describe('getManagerHubCounts', () => {
  beforeEach(() => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'manager', role: 'manager' }));
    fakeAdmin.seed({
      staff_users: [
        { id: 's1', is_approved: false },
        { id: 's2', is_approved: false },
        { id: 's3', is_approved: true },
      ],
      requests: [
        { id: 1, current_status: 'pending_review' },
        { id: 2, current_status: 'pending_review' },
        { id: 3, current_status: 'completed' },
        { id: 4, current_status: 'rejected' },
        { id: 5, current_status: 'in_transit' },
      ],
    });
  });

  it('rejects a non-manager', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'csr', role: 'staff' }));
    const res = await getManagerHubCounts();
    expect(res.success).toBe(false);
  });

  it('computes every tile count correctly from the live tables', async () => {
    const res = await getManagerHubCounts();
    expect(res).toMatchObject({
      success: true,
      pendingStaff: 2,
      totalRequests: 5,
      pendingReview: 2,
      completed: 1,
      rejected: 1,
    });
  });
});

describe('getAllOrganizations / getB2BCustomerOrgLinks — manager-only master data for reports', () => {
  beforeEach(() => {
    fakeAdmin.seed({
      organizations: [{ id: 1, customer_code: 'C-1', hospital_name: 'รพ.A', province: 'สงขลา', org_type: 'gov_hospital' }],
      b2b_customers: [{ id: 10, organization_id: 1 }],
    });
  });

  it('getAllOrganizations rejects a non-manager', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'csr', role: 'staff' }));
    const res = await getAllOrganizations();
    expect(res.success).toBe(false);
  });

  it('getAllOrganizations returns the full organization master list for a manager', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ role: 'manager' }));
    const res: any = await getAllOrganizations();
    expect(res).toEqual({ success: true, data: [{ id: 1, customer_code: 'C-1', hospital_name: 'รพ.A', province: 'สงขลา', org_type: 'gov_hospital' }] });
  });

  it('getB2BCustomerOrgLinks returns the b2b_customer→organization mapping used for report joins', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ role: 'manager' }));
    const res: any = await getB2BCustomerOrgLinks();
    expect(res).toEqual({ success: true, data: [{ id: 10, organization_id: 1 }] });
  });
});

describe('getUnansweredChatbotQuestions', () => {
  it('rejects a non-positive limit', async () => {
    const res = await getUnansweredChatbotQuestions(0);
    expect(res.success).toBe(false);
  });

  it('rejects a limit over 500', async () => {
    const res = await getUnansweredChatbotQuestions(501);
    expect(res.success).toBe(false);
  });

  it('is reachable by csr, not just manager (moved to CSR hub)', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'csr', role: 'staff' }));
    fakeAdmin.seed({ chatbot_unanswered_questions: [{ id: 1, question: 'q', answer: null, created_at: '2026-01-01' }] });
    const res = await getUnansweredChatbotQuestions(50);
    expect(res.success).toBe(true);
  });
});

describe('getManagerRequestDetail — sees any request, no ownership scoping at all', () => {
  beforeEach(() => {
    mockGetStaffSession.mockResolvedValue(staff({ role: 'manager' }));
  });

  it('rejects a non-manager', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'csr', role: 'staff' }));
    fakeAdmin.seed({ requests: [{ id: 1, drug_items: [] }], timeline_summary: [] });
    const res = await getManagerRequestDetail(1);
    expect(res.success).toBe(false);
  });

  it('returns "not found" for a nonexistent request id', async () => {
    fakeAdmin.seed({ requests: [], timeline_summary: [] });
    const res = await getManagerRequestDetail(999);
    expect(res).toEqual({ success: false, error: 'ไม่พบข้อมูลใบงานนี้' });
  });

  it('resolves drug_name onto the timeline for a request submitted by any customer', async () => {
    fakeAdmin.seed({
      requests: [{ id: 1, ref_id: 'REF-1', drug_items: [{ id: 1, drug_name: 'Paracetamol' }] }],
      timeline_summary: [{ id: 1, request_id: 1, status_name: 'approved', log_date: '2026-01-01', drug_item_id: 1 }],
    });
    const res: any = await getManagerRequestDetail(1);
    expect(res.success).toBe(true);
    expect(res.data.timeline[0]).toMatchObject({ drug_name: 'Paracetamol' });
  });
});

describe('getManagerStatusLogsDetailed — the .in() empty-array sentinel guard', () => {
  beforeEach(() => {
    mockGetStaffSession.mockResolvedValue(staff({ role: 'manager' }));
    fakeAdmin.seed({
      status_logs: [
        { id: 1, request_id: 1, staff_id: 'staff-1', status_name: 'approved', log_date: '2026-01-01', department: 'csr' },
        { id: 2, request_id: 2, staff_id: 'staff-2', status_name: 'approved', log_date: '2026-01-02', department: 'csr' },
      ],
      staff_users: [{ id: 'staff-1', full_name: 'พนักงานหนึ่ง' }, { id: 'staff-2', full_name: 'พนักงานสอง' }],
    });
  });

  it('rejects a non-manager', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'csr', role: 'staff' }));
    const res = await getManagerStatusLogsDetailed();
    expect(res.success).toBe(false);
  });

  it('rejects a non-positive-integer id in the requestIds array', async () => {
    const res = await getManagerStatusLogsDetailed([-1]);
    expect(res.success).toBe(false);
  });

  it('returns every log when requestIds is omitted entirely', async () => {
    const res: any = await getManagerStatusLogsDetailed();
    expect(res.data).toHaveLength(2);
  });

  it('returns zero rows (not every row) when requestIds is explicitly an empty array — the exact sentinel-guard regression', async () => {
    // Without the [-1] sentinel fallback, an empty .in('request_id', []) is ambiguous across
    // Postgrest drivers — this asserts the documented "must resolve to 0 rows" contract holds.
    const res: any = await getManagerStatusLogsDetailed([]);
    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
  });

  it('filters to only the requested ids and resolves staff_name for each log', async () => {
    const res: any = await getManagerStatusLogsDetailed([1]);
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ request_id: 1, staff_name: 'พนักงานหนึ่ง' });
  });

  it('falls back staff_name to null when the staff row is missing (e.g. deleted account), never throwing', async () => {
    fakeAdmin.seed({
      status_logs: [{ id: 3, request_id: 3, staff_id: 'ghost-id', status_name: 'approved', log_date: '2026-01-03', department: 'csr' }],
      staff_users: [],
    });
    const res: any = await getManagerStatusLogsDetailed([3]);
    expect(res.success).toBe(true);
    expect(res.data[0].staff_name).toBeNull();
  });
});
