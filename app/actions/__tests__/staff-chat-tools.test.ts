import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { getRejectionBreakdown, getPeriodStats, getCustomerStats, executeStaffChatTool } =
  await import('../staff-chat-tools');

beforeEach(() => {
  fakeAdmin.seed({ status_logs: [], requests: [] });
});

describe('getRejectionBreakdown', () => {
  it('groups by rejection_reason_code and labels unspecified legacy rows', async () => {
    fakeAdmin.seed({
      status_logs: [
        { id: 1, status_name: 'rejected', rejection_reason_code: 'damaged', log_date: '2026-03-05' },
        { id: 2, status_name: 'rejected', rejection_reason_code: 'damaged', log_date: '2026-03-10' },
        { id: 3, status_name: 'rejected', rejection_reason_code: 'customer_cancelled', log_date: '2026-03-12' },
        { id: 4, status_name: 'rejected', rejection_reason_code: null, log_date: '2026-01-01' },
        { id: 5, status_name: 'approved', rejection_reason_code: null, log_date: '2026-03-12' },
      ],
    });

    const res: any = await getRejectionBreakdown();

    expect(res.totalRejected).toBe(4);
    expect(res.breakdown[0]).toEqual({ code: 'damaged', label: 'สินค้าชำรุด/เสียหาย', count: 2 });
    const unspecified = res.breakdown.find((b: any) => b.code === 'unspecified');
    expect(unspecified.count).toBe(1);
  });

  it('filters to a specific year+month when given', async () => {
    fakeAdmin.seed({
      status_logs: [
        { id: 1, status_name: 'rejected', rejection_reason_code: 'damaged', log_date: '2026-03-05' },
        { id: 2, status_name: 'rejected', rejection_reason_code: 'damaged', log_date: '2026-04-05' },
      ],
    });

    const res: any = await getRejectionBreakdown(2026, 3);

    expect(res.totalRejected).toBe(1);
  });
});

describe('getPeriodStats', () => {
  it('rejects an invalid month', async () => {
    const res: any = await getPeriodStats(2026, 13);
    expect(res.error).toBeDefined();
  });

  it('computes totals and rejection rate for the given month only', async () => {
    fakeAdmin.seed({
      requests: [
        { id: 1, current_status: 'completed', total_value: 1000, created_at: '2026-02-10' },
        { id: 2, current_status: 'rejected', total_value: 500, created_at: '2026-02-15' },
        { id: 3, current_status: 'approved', total_value: 2000, created_at: '2026-03-01' }, // outside range
      ],
    });

    const res: any = await getPeriodStats(2026, 2);

    expect(res.totalRequests).toBe(2);
    expect(res.totalValue).toBe(1500);
    expect(res.rejectedCount).toBe(1);
    expect(res.rejectionRatePercent).toBe(50);
  });
});

describe('getCustomerStats', () => {
  it('reports not found for no matches', async () => {
    fakeAdmin.seed({ requests: [{ id: 1, hospital_name: 'รพ.เอ', current_status: 'completed', total_value: 100, created_at: '2026-01-01' }] });

    const res: any = await getCustomerStats('รพ.ไม่มีจริง');

    expect(res.found).toBe(false);
  });

  it('aggregates stats across matching requests, tolerating minor name variants', async () => {
    fakeAdmin.seed({
      requests: [
        { id: 1, hospital_name: 'โรงพยาบาลป่าใหญ่', current_status: 'completed', total_value: 1000, created_at: '2026-01-01' },
        { id: 2, hospital_name: 'โรงพยาบาลป่าใหญ่', current_status: 'rejected', total_value: 200, created_at: '2026-02-01' },
      ],
    });

    const res: any = await getCustomerStats('ป่าใหญ่');

    expect(res.found).toBe(true);
    expect(res.totalRequests).toBe(2);
    expect(res.totalValue).toBe(1200);
    expect(res.rejectedCount).toBe(1);
    expect(res.completedCount).toBe(1);
  });

  it('rejects an empty query', async () => {
    const res: any = await getCustomerStats('   ');
    expect(res.error).toBeDefined();
  });
});

describe('executeStaffChatTool', () => {
  it('dispatches to the right function by name', async () => {
    fakeAdmin.seed({ requests: [{ id: 1, hospital_name: 'รพ.เอ', current_status: 'completed', total_value: 100, created_at: '2026-01-01' }] });

    const res: any = await executeStaffChatTool('get_customer_stats', { hospital_name: 'เอ' });
    expect(res.found).toBe(true);
  });

  it('returns an error for an unknown tool name', async () => {
    const res: any = await executeStaffChatTool('not_a_real_tool', {});
    expect(res.error).toBeDefined();
  });
});
