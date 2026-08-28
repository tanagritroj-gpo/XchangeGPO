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
  getSlaQueueForCsr, getSlaQueueForLog, getSlaQueueForWh, getSlaQueueForManager,
  getUnreadSlaCountForCsr, markSlaNotificationsAsReadForCsr,
  getUnreadSlaCountForLog,
  getUnreadSlaCountForWh,
  getManagerSlaBadgeCount, markManagerSlaBadgeAsRead,
  getSlaRules, updateSlaRule,
} = await import('../sla-actions');

function staff(overrides: Partial<{ id: string; department: string; role: string }> = {}) {
  return {
    id: 'staff-1', username: 'u', full_name: 'Staff', role: 'staff', department: 'csr',
    sale_customer_types: null, sale_provinces: null, email: null, signature_url: null, mfa_enabled: false, mfa_grace_until: null,
    ...overrides,
  };
}

const PAST = new Date(Date.now() - 60_000).toISOString(); // already past status_warn_at → shows in queue
const FUTURE = new Date(Date.now() + 60 * 60_000).toISOString(); // not warned yet → hidden

beforeEach(() => {
  mockGetStaffSession.mockReset();
});

describe('getSlaQueueForCsr/Log/Wh — department guard (own department OR role=manager)', () => {
  it('rejects a wh staff member reading the csr SLA queue', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'wh', role: 'staff' }));
    await expect(getSlaQueueForCsr()).rejects.toThrow('คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
  });

  it('allows a manager to read the log queue despite department=manager', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'manager', role: 'manager' }));
    fakeAdmin.seed({ requests: [] });
    const res = await getSlaQueueForLog();
    expect(res.success).toBe(true);
  });
});

describe('getSlaQueueForCsr/Log/Wh/Manager — status filtering, due-date gating, isOverdue', () => {
  beforeEach(() => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'csr' }));
    fakeAdmin.seed({
      requests: [
        // owned by csr, already past its warning point, overdue
        { id: 1, ref_id: 'REF-1', hospital_name: 'A', contact_name: 'a', current_status: 'pending_review', status_due_at: PAST, status_warn_at: PAST },
        // owned by csr, but not warned yet — must be hidden from every queue
        { id: 2, ref_id: 'REF-2', hospital_name: 'B', contact_name: 'b', current_status: 'receiving', status_due_at: FUTURE, status_warn_at: FUTURE },
        // owned by logistics, not csr — must not appear in the csr queue
        { id: 3, ref_id: 'REF-3', hospital_name: 'C', contact_name: 'c', current_status: 'approved', status_due_at: PAST, status_warn_at: PAST },
        // terminal/no SLA clock running (status_due_at null) — must never appear anywhere
        { id: 4, ref_id: 'REF-4', hospital_name: 'D', contact_name: 'd', current_status: 'completed', status_due_at: null, status_warn_at: null },
      ],
    });
  });

  it('csr queue shows only its own owned, warned, non-null-due-date requests', async () => {
    const res: any = await getSlaQueueForCsr();
    expect(res.success).toBe(true);
    expect(res.data.map((r: any) => r.id)).toEqual([1]);
    expect(res.data[0].isOverdue).toBe(true);
    expect(res.data[0].department).toBe('csr');
  });

  it('logistics queue only shows the approved/in_transit/out_for_delivery request, not csr\'s', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'log' }));
    const res: any = await getSlaQueueForLog();
    expect(res.data.map((r: any) => r.id)).toEqual([3]);
  });

  it('warehouse queue is empty here — no request currently owned by warehouse', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'wh' }));
    const res: any = await getSlaQueueForWh();
    expect(res.data).toEqual([]);
  });

  it('manager queue sees across every department, still excluding un-warned and null-due-date rows', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'manager', role: 'manager' }));
    const res: any = await getSlaQueueForManager();
    expect(res.data.map((r: any) => r.id).sort()).toEqual([1, 3]);
  });
});

describe('SLA badge count/mark-as-read per scope — must filter by department, unlike the general notification feed', () => {
  beforeEach(() => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'csr' }));
    fakeAdmin.seed({
      notification_log: [
        { id: 'n1', type: 'sla_warning', department: 'csr', read_by_csr_at: null },
        { id: 'n2', type: 'sla_breach', department: 'logistics', read_by_csr_at: null, read_by_log_at: null },
        { id: 'n3', type: 'new_request', department: 'csr', read_by_csr_at: null }, // wrong type, must be excluded too
      ],
    });
  });

  it('csr unread count only counts sla_warning/sla_breach rows owned by csr', async () => {
    const res = await getUnreadSlaCountForCsr();
    expect(res).toMatchObject({ success: true, count: 1 });
  });

  it('csr mark-as-read never touches logistics-owned or non-SLA rows', async () => {
    await markSlaNotificationsAsReadForCsr();
    const rows = fakeAdmin.rows('notification_log');
    expect(rows.find((r) => r.id === 'n1')!.read_by_csr_at).not.toBeNull();
    expect(rows.find((r) => r.id === 'n2')!.read_by_csr_at).toBeNull();
    expect(rows.find((r) => r.id === 'n3')!.read_by_csr_at).toBeNull();
  });

  it('log scope only sees its own department\'s SLA notification, not csr\'s', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'log' }));
    const res = await getUnreadSlaCountForLog();
    expect(res).toMatchObject({ success: true, count: 1 }); // n2 only
  });

  it('wh scope sees none of these (no warehouse-owned SLA rows seeded)', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'wh' }));
    await expect(getUnreadSlaCountForWh()).resolves.toMatchObject({ success: true, count: 0 });
  });
});

describe('getManagerSlaBadgeCount / markManagerSlaBadgeAsRead — only the department=NULL manager sentinel', () => {
  beforeEach(() => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'manager', role: 'manager' }));
    fakeAdmin.seed({
      notification_log: [
        { id: 'm1', type: 'sla_breach', department: null, read_by_manager_at: null },
        { id: 'csr-owned', type: 'sla_breach', department: 'csr', read_by_manager_at: null }, // must be excluded
        { id: 'warning-not-breach', type: 'sla_warning', department: null, read_by_manager_at: null }, // must be excluded
      ],
    });
  });

  it('requires role=manager', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'manager', role: 'staff' }));
    const res = await getManagerSlaBadgeCount();
    expect(res.success).toBe(false);
  });

  it('counts only department-null sla_breach rows', async () => {
    const res = await getManagerSlaBadgeCount();
    expect(res).toMatchObject({ success: true, count: 1 });
  });

  it('mark-as-read never touches a department-scoped sla_breach or an sla_warning', async () => {
    await markManagerSlaBadgeAsRead();
    const rows = fakeAdmin.rows('notification_log');
    expect(rows.find((r) => r.id === 'm1')!.read_by_manager_at).not.toBeNull();
    expect(rows.find((r) => r.id === 'csr-owned')!.read_by_manager_at).toBeNull();
    expect(rows.find((r) => r.id === 'warning-not-breach')!.read_by_manager_at).toBeNull();
  });
});

describe('getSlaRules / updateSlaRule — manager-only mutation of system-wide SLA timing', () => {
  beforeEach(() => {
    fakeAdmin.seed({ sla_rules: [{ status_name: 'pending_review', sla_days: 2, warning_days: 1, updated_at: null, updated_by: null }] });
  });

  it('getSlaRules rejects a non-manager', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'csr', role: 'staff' }));
    const res = await getSlaRules();
    expect(res.success).toBe(false);
  });

  it('updateSlaRule rejects a non-manager, without mutating the row', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'csr', role: 'staff' }));
    const res = await updateSlaRule('pending_review', { slaDays: 5, warningDays: 2 });
    expect(res.success).toBe(false);
    expect(fakeAdmin.rows('sla_rules')[0].sla_days).toBe(2);
  });

  it('updateSlaRule rejects slaDays <= 0', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'manager', role: 'manager' }));
    const res = await updateSlaRule('pending_review', { slaDays: 0, warningDays: 1 });
    expect(res).toEqual({ success: false, error: 'จำนวนวัน SLA ต้องเป็นจำนวนเต็มมากกว่า 0' });
  });

  it('updateSlaRule rejects a negative warningDays', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'manager', role: 'manager' }));
    const res = await updateSlaRule('pending_review', { slaDays: 3, warningDays: -1 });
    expect(res).toEqual({ success: false, error: 'จำนวนวันเตือนล่วงหน้าต้องเป็นจำนวนเต็มไม่ติดลบ' });
  });

  it('updateSlaRule applies valid changes and records the manager as updated_by', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ id: 'mgr-42', department: 'manager', role: 'manager' }));
    const res = await updateSlaRule('pending_review', { slaDays: 5, warningDays: 2 });
    expect(res.success).toBe(true);
    const row = fakeAdmin.rows('sla_rules')[0];
    expect(row).toMatchObject({ sla_days: 5, warning_days: 2, updated_by: 'mgr-42' });
  });
});
