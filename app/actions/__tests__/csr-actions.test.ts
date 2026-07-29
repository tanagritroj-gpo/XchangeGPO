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
  approveRequest,
  rejectRequest,
  startExchangeProcess,
  completeRequest,
  reviewClient,
} = await import('../csr-actions');

const CSR_STAFF = { id: 'csr-1', username: 'csr-1', full_name: 'Test Staff', department: 'csr', role: 'staff' };

function seedRequest(
  requestId: number,
  items: { id: number; current_status: string }[],
  requestStatus = 'pending_review',
) {
  fakeAdmin.seed({
    requests: [{ id: requestId, current_status: requestStatus }],
    drug_items: items.map((i) => ({ ...i, request_id: requestId })),
    status_logs: [],
    clients: [],
    b2b_customers: [],
  });
}

beforeEach(() => {
  mockGetStaffSession.mockReset();
  mockGetStaffSession.mockResolvedValue(CSR_STAFF);
});

describe('authorization guard uses department, not role — unlike wh/logistics', () => {
  it('rejects a "manager role" session whose department is not csr or manager', async () => {
    // Deliberately the mirror image of wh/logistics' "role==='manager' always
    // wins" guard: csr-actions checks department only. A staff member who
    // somehow has role='manager' but department='wh' must still be rejected
    // here, even though the same session would pass the WH/logistics guard.
    mockGetStaffSession.mockResolvedValue({ id: 'x', username: 'x', full_name: 'Test Staff', department: 'wh', role: 'manager' });
    seedRequest(1, [{ id: 1, current_status: 'approved' }]);
    const res = await approveRequest(1);
    expect(res).toEqual({ success: false, error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
  });

  it('allows department=manager', async () => {
    mockGetStaffSession.mockResolvedValue({ id: 'mgr-1', username: 'mgr-1', full_name: 'Test Staff', department: 'manager', role: 'manager' });
    seedRequest(1, [{ id: 1, current_status: 'approved' }]);
    const res = await approveRequest(1);
    expect(res.success).toBe(true);
  });
});

describe('approveRequest — blocked while any item is still unreviewed', () => {
  it('refuses to approve while an item sits at pending_review', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'approved' },
      { id: 2, current_status: 'pending_review' },
    ]);

    const res = await approveRequest(1);

    expect(res).toEqual({ success: false, error: 'ยังมีรายการยาที่ยังไม่ได้อนุมัติ' });
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('pending_review');
  });

  it('approves once nothing is left pending_review', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'approved' },
      { id: 2, current_status: 'rejected' },
    ]);

    const res = await approveRequest(1);

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('approved');
  });
});

describe('rejectRequest — cascades to every item regardless of current status', () => {
  it('force-rejects items that were already approved', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'approved' },
      { id: 2, current_status: 'pending_review' },
    ]);

    const res = await rejectRequest(1, 'customer_cancelled', 'ลูกค้ายกเลิก');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('rejected');
    expect(fakeAdmin.rows('drug_items').every((i) => i.current_status === 'rejected')).toBe(true);
    expect(fakeAdmin.rows('status_logs')[0].rejection_reason_code).toBe('customer_cancelled');
  });

  it('refuses to reject without a valid structured reason', async () => {
    seedRequest(1, [{ id: 1, current_status: 'approved' }]);
    const res = await rejectRequest(1, 'not-a-real-reason', 'whatever');
    expect(res).toEqual({ success: false, error: 'กรุณาเลือกเหตุผลที่ปฏิเสธ' });
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('pending_review');
  });
});

describe('startExchangeProcess / completeRequest — spare already-rejected items', () => {
  it('moves only non-rejected items into exchanging', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'approved' },
      { id: 2, current_status: 'rejected' },
    ], 'approved');

    const res = await startExchangeProcess(1);

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('exchanging');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 1)?.current_status).toBe('exchanging');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 2)?.current_status).toBe('rejected');
  });

  it('completes only non-rejected items', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'exchanging' },
      { id: 2, current_status: 'rejected' },
    ], 'exchanging');

    const res = await completeRequest(1);

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('completed');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 1)?.current_status).toBe('completed');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 2)?.current_status).toBe('rejected');
  });
});

describe('reviewClient — approval provisions a real b2b_customer', () => {
  function seedClient() {
    fakeAdmin.seed({
      clients: [{
        id: 'client-1',
        email: 'hospital@example.com',
        hospital_name: 'รพ.ทดสอบ',
        phone: '0800000000',
        contact_name: 'สมชาย',
        position: 'เภสัชกร',
        status: 'pending',
      }],
      b2b_customers: [],
      requests: [],
      drug_items: [],
      status_logs: [],
    });
  }

  it('creates a b2b_customer (with the CSR-entered customer_code) and links it back on approval', async () => {
    seedClient();

    const res = await reviewClient('client-1', 'approved', 'CUST-001');

    expect(res.success).toBe(true);
    const client = fakeAdmin.rows('clients')[0];
    expect(client.status).toBe('approved');
    expect(fakeAdmin.rows('b2b_customers')).toHaveLength(1);
    expect(fakeAdmin.rows('b2b_customers')[0].email).toBe('hospital@example.com');
    expect(fakeAdmin.rows('b2b_customers')[0].customer_code).toBe('CUST-001');
    expect(client.b2b_customer_id).toBe(fakeAdmin.rows('b2b_customers')[0].id);
  });

  it('refuses to approve without a customer_code', async () => {
    seedClient();

    const res = await reviewClient('client-1', 'approved');

    expect(res).toEqual({ success: false, error: 'กรุณาระบุรหัสลูกค้าก่อนอนุมัติ' });
    expect(fakeAdmin.rows('clients')[0].status).toBe('pending');
    expect(fakeAdmin.rows('b2b_customers')).toHaveLength(0);
  });

  it('does not provision a customer on rejection', async () => {
    seedClient();

    const res = await reviewClient('client-1', 'rejected');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('clients')[0].status).toBe('rejected');
    expect(fakeAdmin.rows('b2b_customers')).toHaveLength(0);
  });
});
