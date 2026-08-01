import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';

// vi.mock factories run before regular imports are evaluated, so they can't
// close over anything imported normally — an async factory with a dynamic
// import sidesteps that, and stashes the fake DB on the mocked module itself
// so the test below can reach back into it.
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

const { stampCheckedIn, confirmCheckedInBatch, stampReceiving, rejectWHItem } = await import(
  '../wh-actions'
);

const WH_STAFF = { id: 'wh-1', username: 'wh-1', full_name: 'Test Staff', department: 'wh', role: 'staff', sale_customer_types: null, sale_provinces: null };

function seedRequest(requestId: number, items: { id: number; current_status: string }[], requestStatus = 'at_warehouse') {
  fakeAdmin.seed({
    requests: [{ id: requestId, current_status: requestStatus }],
    drug_items: items.map((i) => ({ ...i, request_id: requestId })),
    status_logs: [],
  });
}

beforeEach(() => {
  mockGetStaffSession.mockReset();
  mockGetStaffSession.mockResolvedValue(WH_STAFF);
});

describe('authorization guard', () => {
  it('rejects when not logged in', async () => {
    mockGetStaffSession.mockResolvedValue(null);
    seedRequest(1, [{ id: 1, current_status: 'at_warehouse' }]);
    const res = await stampCheckedIn(1, '');
    expect(res).toEqual({ success: false, error: 'ไม่ได้ Login' });
  });

  it('rejects staff outside the wh department', async () => {
    mockGetStaffSession.mockResolvedValue({ id: 'csr-1', username: 'csr-1', full_name: 'Test Staff', department: 'csr', role: 'staff', sale_customer_types: null, sale_provinces: null });
    seedRequest(1, [{ id: 1, current_status: 'at_warehouse' }]);
    const res = await stampCheckedIn(1, '');
    expect(res).toEqual({ success: false, error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
  });

  it('allows a manager regardless of their department', async () => {
    mockGetStaffSession.mockResolvedValue({ id: 'mgr-1', username: 'mgr-1', full_name: 'Test Staff', department: 'manager', role: 'manager', sale_customer_types: null, sale_provinces: null });
    seedRequest(1, [{ id: 1, current_status: 'at_warehouse' }]);
    const res = await stampCheckedIn(1, '');
    expect(res.success).toBe(true);
  });
});

describe('stampCheckedIn — per-item check-in cascades to request status', () => {
  it('leaves the request status alone until every item is checked in', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'at_warehouse' },
      { id: 2, current_status: 'at_warehouse' },
    ]);

    const res = await stampCheckedIn(1, 'ok');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 1)?.current_status).toBe('checked_in');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 2)?.current_status).toBe('at_warehouse');
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('at_warehouse');
  });

  it('flips the request to checked_in once the last item is checked in', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'checked_in' },
      { id: 2, current_status: 'at_warehouse' },
    ]);

    const res = await stampCheckedIn(2, 'ok');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('checked_in');
    expect(fakeAdmin.rows('status_logs')).toHaveLength(1);
  });
});

describe('confirmCheckedInBatch', () => {
  it('refuses to confirm the whole request while any item is still pending', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'checked_in' },
      { id: 2, current_status: 'at_warehouse' },
    ]);

    const res = await confirmCheckedInBatch(1, '');

    expect(res).toEqual({ success: false, error: 'ยังมีรายการยาที่ยังไม่ได้ตรวจรับ กรุณาตรวจรับให้ครบก่อน' });
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('at_warehouse');
  });

  it('confirms once every item is checked_in/receiving/rejected', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'checked_in' },
      { id: 2, current_status: 'rejected' },
    ]);

    const res = await confirmCheckedInBatch(1, 'batch ok');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('checked_in');
    // Only the item still sitting at checked_in gets a "confirmed" log — the
    // already-rejected one was already logged when it was rejected.
    expect(fakeAdmin.rows('status_logs')).toHaveLength(1);
  });
});

describe('stampReceiving — request status depends on whether anything survived', () => {
  it('stays put until every item reaches a terminal stocking status', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'checked_in' },
      { id: 2, current_status: 'checked_in' },
    ], 'checked_in');

    await stampReceiving(1, '');

    expect(fakeAdmin.rows('requests')[0].current_status).toBe('checked_in');
  });

  it('moves the request to receiving once all items are stocked or rejected', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'receiving' },
      { id: 2, current_status: 'checked_in' },
    ], 'checked_in');

    const res = await stampReceiving(2, '');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('receiving');
  });
});

describe('rejectWHItem — the all-rejected edge case', () => {
  it('marks the request rejected only when nothing else survived', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'rejected' },
      { id: 2, current_status: 'checked_in' },
    ], 'checked_in');

    // Rejecting the second item means every item in the request is now
    // rejected and none was ever received — the whole request should die.
    const res = await rejectWHItem(2, 'damaged', 'bad batch');
    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('rejected');
    expect(fakeAdmin.rows('status_logs')[0].rejection_reason_code).toBe('damaged');
  });

  it('refuses to reject without a valid structured reason', async () => {
    seedRequest(1, [{ id: 1, current_status: 'at_warehouse' }]);
    const res = await rejectWHItem(1, 'not-a-real-reason', 'whatever');
    expect(res).toEqual({ success: false, error: 'กรุณาเลือกเหตุผลที่ปฏิเสธ' });
    expect(fakeAdmin.rows('drug_items')[0].current_status).toBe('at_warehouse');
  });

  it('keeps the request alive as "receiving" if at least one item was received before the rest got rejected', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'receiving' },
      { id: 2, current_status: 'checked_in' },
    ], 'checked_in');

    const res = await rejectWHItem(2, 'damaged', '');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('receiving');
  });
});
