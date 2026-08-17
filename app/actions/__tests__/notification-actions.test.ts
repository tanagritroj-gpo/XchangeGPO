import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
// Single mock point — manager-actions.ts and sale-actions.ts (imported for real below,
// not mocked) both ultimately call getStaffSession() themselves, so mocking it here
// exercises their actual guard logic instead of re-stubbing it a second time.
vi.mock('../auth-staff', () => ({ getStaffSession: vi.fn() }));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { getStaffSession } = await import('../auth-staff');
const mockGetStaffSession = vi.mocked(getStaffSession);

const {
  getUnreadNotificationCount, getRecentNotifications, markNotificationsAsRead,
  getUnreadNotificationCountForManager,
  getUnreadNotificationCountForLog,
  getUnreadNotificationCountForWh,
  getUnreadNotificationCountForSale, getRecentNotificationsForSale, markNotificationsAsReadForSale,
} = await import('../notification-actions');

function staff(overrides: Partial<{ id: string; department: string; role: string }> = {}) {
  return {
    id: 'staff-1', username: 'u', full_name: 'Staff', role: 'staff', department: 'csr',
    sale_customer_types: null, sale_provinces: null, email: null, signature_url: null,
    ...overrides,
  };
}

function seedNotifications(rows: Record<string, any>[]) {
  fakeAdmin.seed({ notification_log: rows });
}

const BASE_ROW = (over: Record<string, any> = {}) => ({
  id: 'n1', type: 'new_request', request_id: 1, ref_id: 'REF-1', contact_name: 'x', hospital_name: 'y',
  created_at: '2026-01-01T00:00:00Z', department: null,
  read_by_csr_at: null, read_by_manager_at: null, read_by_log_at: null, read_by_wh_at: null, read_by_sale_at: null,
  org_type: null, province: null,
  ...over,
});

beforeEach(() => {
  mockGetStaffSession.mockReset();
});

describe('csr scope (getManagerOrCsrSession — department=csr OR role=manager)', () => {
  it('rejects a non-csr staff member without manager role', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'wh', role: 'staff' }));
    seedNotifications([BASE_ROW()]);
    const res = await getUnreadNotificationCount();
    expect(res.success).toBe(false);
  });

  it('allows a manager sitting outside the csr department (role wins over department here)', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'wh', role: 'manager' }));
    seedNotifications([BASE_ROW()]);
    const res = await getUnreadNotificationCount();
    expect(res.success).toBe(true);
  });

  it('allows department=csr regardless of role', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'csr', role: 'staff' }));
    seedNotifications([BASE_ROW()]);
    await expect(getUnreadNotificationCount()).resolves.toMatchObject({ success: true });
  });
});

describe('manager scope (getManagerSession — role=manager strictly, department is irrelevant)', () => {
  it('rejects department=manager with role=staff — this scope checks role, not department', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'manager', role: 'staff' }));
    const res = await getUnreadNotificationCountForManager();
    expect(res.success).toBe(false);
  });

  it('allows role=manager even from an unrelated department', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'sale', role: 'manager' }));
    seedNotifications([BASE_ROW()]);
    await expect(getUnreadNotificationCountForManager()).resolves.toMatchObject({ success: true });
  });
});

describe('log/wh scopes (assertDepartmentAccess — own department OR role=manager)', () => {
  it('rejects wh staff trying to read the log feed', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'wh', role: 'staff' }));
    const res = await getUnreadNotificationCountForLog();
    expect(res.success).toBe(false);
  });

  it('rejects log staff trying to read the wh feed (cross-department isolation both directions)', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'log', role: 'staff' }));
    const res = await getUnreadNotificationCountForWh();
    expect(res.success).toBe(false);
  });

  it('allows a manager to read both the log and the wh feed', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'manager', role: 'manager' }));
    seedNotifications([BASE_ROW()]);
    await expect(getUnreadNotificationCountForLog()).resolves.toMatchObject({ success: true });
    await expect(getUnreadNotificationCountForWh()).resolves.toMatchObject({ success: true });
  });
});

describe('SLA notification types must never leak into the general feed (count, list, and mark-as-read)', () => {
  beforeEach(() => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'csr' }));
    seedNotifications([
      BASE_ROW({ id: 'n1', type: 'new_request' }),
      BASE_ROW({ id: 'n2', type: 'sla_warning', department: 'csr' }),
      BASE_ROW({ id: 'n3', type: 'sla_breach', department: null }),
    ]);
  });

  it('getUnreadNotificationCount excludes sla_warning/sla_breach from the count', async () => {
    const res = await getUnreadNotificationCount();
    expect(res).toMatchObject({ success: true, count: 1 });
  });

  it('getRecentNotifications excludes them from the list', async () => {
    const res: any = await getRecentNotifications();
    expect(res.success).toBe(true);
    expect(res.data.map((r: any) => r.id)).toEqual(['n1']);
  });

  it('markNotificationsAsRead never marks an sla_warning/sla_breach row as read', async () => {
    await markNotificationsAsRead();
    const slaRows = fakeAdmin.rows('notification_log').filter((r) => r.type.startsWith('sla_'));
    expect(slaRows.every((r) => r.read_by_csr_at === null)).toBe(true);
    const normalRow = fakeAdmin.rows('notification_log').find((r) => r.id === 'n1')!;
    expect(normalRow.read_by_csr_at).not.toBeNull();
  });
});

describe('read state is independent per scope — one department reading a notification never affects another', () => {
  beforeEach(() => {
    mockGetStaffSession.mockResolvedValue(staff({ department: 'csr' }));
    seedNotifications([BASE_ROW({ id: 'n1', read_by_manager_at: '2026-01-01T00:00:00Z' })]);
  });

  it('a notification already read by manager still shows isUnread:true for csr', async () => {
    const res: any = await getRecentNotifications();
    expect(res.data[0]).toMatchObject({ id: 'n1', isUnread: true });
  });

  it('markNotificationsAsRead (csr) sets only read_by_csr_at/read_by_csr_by, leaving other scopes untouched', async () => {
    mockGetStaffSession.mockResolvedValue(staff({ id: 'csr-9', department: 'csr' }));
    await markNotificationsAsRead();
    const row = fakeAdmin.rows('notification_log')[0];
    expect(row.read_by_csr_at).not.toBeNull();
    expect(row.read_by_csr_by).toBe('csr-9');
    expect(row.read_by_log_at).toBeNull();
    expect(row.read_by_wh_at).toBeNull();
    expect(row.read_by_sale_at).toBeNull();
    // manager's prior read state (seeded above) must be untouched by a csr mark-as-read
    expect(row.read_by_manager_at).toBe('2026-01-01T00:00:00Z');
  });

  it('markNotificationsAsRead only updates rows that were actually unread (idempotent, no-op on already-read rows)', async () => {
    seedNotifications([BASE_ROW({ id: 'n1', read_by_csr_at: '2025-01-01T00:00:00Z', read_by_csr_by: 'someone-else' })]);
    await markNotificationsAsRead();
    expect(fakeAdmin.rows('notification_log')[0].read_by_csr_by).toBe('someone-else');
  });
});

describe('sale scope — the cross-region/cross-org-type boundary (getSaleCoverage-gated)', () => {
  const SALE = staff({ id: 'sale-1', department: 'sale' , role: 'staff'});
  const SALE_WITH_COVERAGE = { ...SALE, sale_customer_types: ['government'], sale_provinces: ['สงขลา'] };

  it('rejects a sale account with no coverage configured', async () => {
    mockGetStaffSession.mockResolvedValue(SALE as any);
    const res = await getUnreadNotificationCountForSale();
    expect(res).toEqual({ success: false, error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
  });

  it('counts/lists only notifications whose org_type+province fall inside this rep\'s coverage', async () => {
    mockGetStaffSession.mockResolvedValue(SALE_WITH_COVERAGE as any);
    seedNotifications([
      BASE_ROW({ id: 'in-scope', org_type: 'gov_hospital', province: 'สงขลา' }),
      BASE_ROW({ id: 'wrong-province', org_type: 'gov_hospital', province: 'ภูเก็ต' }),
      BASE_ROW({ id: 'wrong-bucket', org_type: 'private_hospital', province: 'สงขลา' }),
    ]);

    const countRes = await getUnreadNotificationCountForSale();
    expect(countRes).toMatchObject({ success: true, count: 1 });

    const listRes: any = await getRecentNotificationsForSale();
    expect(listRes.data.map((r: any) => r.id)).toEqual(['in-scope']);
  });

  it('markNotificationsAsReadForSale never touches a notification outside this rep\'s coverage', async () => {
    mockGetStaffSession.mockResolvedValue(SALE_WITH_COVERAGE as any);
    seedNotifications([
      BASE_ROW({ id: 'in-scope', org_type: 'gov_hospital', province: 'สงขลา' }),
      BASE_ROW({ id: 'out-of-scope', org_type: 'gov_hospital', province: 'ภูเก็ต' }),
    ]);

    await markNotificationsAsReadForSale();

    const rows = fakeAdmin.rows('notification_log');
    expect(rows.find((r) => r.id === 'in-scope')!.read_by_sale_at).not.toBeNull();
    expect(rows.find((r) => r.id === 'in-scope')!.read_by_sale_by).toBe('sale-1');
    expect(rows.find((r) => r.id === 'out-of-scope')!.read_by_sale_at).toBeNull();
  });
});
