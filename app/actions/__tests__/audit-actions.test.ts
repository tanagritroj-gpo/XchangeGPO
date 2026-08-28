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

const { getAuditEvents } = await import('../audit-actions');

const manager = {
  id: 'm1', username: 'boss', full_name: 'Boss', role: 'manager', department: 'manager',
  sale_customer_types: null, sale_provinces: null, email: null, signature_url: null,
  mfa_enabled: true, mfa_grace_until: null,
};

function seedEvents(n: number, overrides: (i: number) => Record<string, any> = () => ({})) {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    occurred_at: new Date(Date.UTC(2026, 7, 1, 0, 0, i)).toISOString(),
    category: 'auth', action: 'auth.login.success', outcome: 'success',
    actor_type: 'staff', actor_staff_id: 's1', actor_customer_id: null, actor_label: 'somchai',
    target_type: null, target_id: null, ip: '203.0.113.5', user_agent: 'Chrome', detail: {},
    ...overrides(i),
  }));
  fakeAdmin.seed({ audit_events: rows });
}

beforeEach(() => {
  mockGetStaffSession.mockReset();
  mockGetStaffSession.mockResolvedValue(manager as any);
});

describe('getAuditEvents', () => {
  it('rejects a non-manager', async () => {
    mockGetStaffSession.mockResolvedValue({ ...manager, role: 'staff' } as any);
    const res = await getAuditEvents();
    expect(res.success).toBe(false);
  });

  it('rejects when not logged in', async () => {
    mockGetStaffSession.mockResolvedValue(null);
    const res = await getAuditEvents();
    expect(res.success).toBe(false);
  });

  it('returns events for a manager', async () => {
    seedEvents(3);
    const res = await getAuditEvents();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.events).toHaveLength(3);
    expect(res.nextCursor).toBeNull();
  });

  it('paginates: first page returns PAGE_SIZE + a cursor, second page returns the rest', async () => {
    seedEvents(60);
    const first = await getAuditEvents();
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.events).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();

    const second = await getAuditEvents({ cursor: first.nextCursor });
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.events).toHaveLength(10);
    expect(second.nextCursor).toBeNull();
  });

  it('filters by category and outcome', async () => {
    seedEvents(4, (i) => ({
      category: i % 2 === 0 ? 'auth' : 'data_access',
      outcome: i < 2 ? 'success' : 'failure',
    }));
    const res = await getAuditEvents({ category: 'auth', outcome: 'failure' });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.events.every((e) => e.category === 'auth' && e.outcome === 'failure')).toBe(true);
  });

  it('rejects a malformed cursor via the zod schema', async () => {
    const res = await getAuditEvents({ cursor: 'not-a-number' as any });
    expect(res.success).toBe(false);
  });
});
