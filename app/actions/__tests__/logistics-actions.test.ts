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
  updateLogisticsStatus,
  updateItemStatus,
  rejectItemStatus,
  confirmLogisticsBatch,
} = await import('../logistics-actions');

const LOG_STAFF = { id: 'log-1', username: 'log-1', full_name: 'Test Staff', department: 'log', role: 'staff' };

function seedRequest(
  requestId: number,
  items: { id: number; current_status: string }[],
  requestStatus = 'approved',
) {
  fakeAdmin.seed({
    requests: [{ id: requestId, current_status: requestStatus }],
    drug_items: items.map((i) => ({ ...i, request_id: requestId })),
    status_logs: [],
  });
}

beforeEach(() => {
  mockGetStaffSession.mockReset();
  mockGetStaffSession.mockResolvedValue(LOG_STAFF);
});

describe('authorization guard', () => {
  it('rejects staff outside the logistics department', async () => {
    mockGetStaffSession.mockResolvedValue({ id: 'wh-1', username: 'wh-1', full_name: 'Test Staff', department: 'wh', role: 'staff' });
    seedRequest(1, [{ id: 1, current_status: 'approved' }]);
    const res = await updateLogisticsStatus(1, 'in_transit', '');
    expect(res).toEqual({ success: false, error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
  });

  it('allows a manager regardless of their department', async () => {
    mockGetStaffSession.mockResolvedValue({ id: 'mgr-1', username: 'mgr-1', full_name: 'Test Staff', department: 'manager', role: 'manager' });
    seedRequest(1, [{ id: 1, current_status: 'approved' }]);
    const res = await updateLogisticsStatus(1, 'in_transit', '');
    expect(res.success).toBe(true);
  });
});

describe('updateLogisticsStatus — bulk transition skips already-rejected items', () => {
  it('moves every non-rejected item and the request to in_transit', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'approved' },
      { id: 2, current_status: 'rejected' },
    ]);

    const res = await updateLogisticsStatus(1, 'in_transit', 'picked up');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('in_transit');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 1)?.current_status).toBe('in_transit');
    // Already-rejected item must not be resurrected by the bulk update.
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 2)?.current_status).toBe('rejected');
  });
});

describe('updateItemStatus — per-item arrival cascades to the request', () => {
  it('leaves the request alone until every item has arrived', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'in_transit' },
      { id: 2, current_status: 'in_transit' },
    ], 'in_transit');

    await updateItemStatus(1, 'at_warehouse', '');

    expect(fakeAdmin.rows('requests')[0].current_status).toBe('in_transit');
  });

  it('flips the request to at_warehouse once the last item arrives', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'at_warehouse' },
      { id: 2, current_status: 'in_transit' },
    ], 'in_transit');

    const res = await updateItemStatus(2, 'at_warehouse', '');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('at_warehouse');
  });
});

describe('rejectItemStatus — the all-rejected edge case', () => {
  it('rejects the whole request when every item ends up rejected', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'rejected' },
      { id: 2, current_status: 'in_transit' },
    ], 'in_transit');

    const res = await rejectItemStatus(2, 'damaged', 'damaged in transit');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('rejected');
    expect(fakeAdmin.rows('status_logs')[0].rejection_reason_code).toBe('damaged');
  });

  it('refuses to reject without a valid structured reason', async () => {
    seedRequest(1, [{ id: 1, current_status: 'in_transit' }], 'in_transit');
    const res = await rejectItemStatus(1, 'not-a-real-reason', 'whatever');
    expect(res).toEqual({ success: false, error: 'กรุณาเลือกเหตุผลที่ปฏิเสธ' });
    expect(fakeAdmin.rows('drug_items')[0].current_status).toBe('in_transit');
  });

  it('keeps the request alive as at_warehouse if something else already arrived', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'at_warehouse' },
      { id: 2, current_status: 'in_transit' },
    ], 'in_transit');

    const res = await rejectItemStatus(2, 'damaged', 'damaged in transit');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('at_warehouse');
  });
});

describe('confirmLogisticsBatch — mixed accept/reject in one submission', () => {
  it('accepts a fully mixed batch and lands on at_warehouse when at least one item arrived', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'in_transit' },
      { id: 2, current_status: 'in_transit' },
    ], 'in_transit');

    const res = await confirmLogisticsBatch(1, [
      { itemId: 1, status: 'at_warehouse', remark: 'ok' },
      { itemId: 2, status: 'rejected', remark: 'damaged', reasonCode: 'damaged' },
    ]);

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('at_warehouse');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 1)?.current_status).toBe('at_warehouse');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 2)?.current_status).toBe('rejected');
    expect(fakeAdmin.rows('status_logs')).toHaveLength(2);
  });

  it('rejects the whole request when every action in the batch is a rejection', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'in_transit' },
      { id: 2, current_status: 'in_transit' },
    ], 'in_transit');

    const res = await confirmLogisticsBatch(1, [
      { itemId: 1, status: 'rejected', remark: 'damaged', reasonCode: 'damaged' },
      { itemId: 2, status: 'rejected', remark: 'damaged', reasonCode: 'damaged' },
    ]);

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('rejected');
  });
});
