import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('../auth-actions', () => ({ getCustomerSession: vi.fn() }));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { getCustomerSession } = await import('../auth-actions');
const mockGetCustomerSession = vi.mocked(getCustomerSession);

const { pingRequestAttention, getPingStatus } = await import('../ping-actions');

const CUSTOMER = { id: 1, email: 'c@example.com', hospital_name: 'รพ.ทดสอบ', contact_name: 'สมชาย', customer_code: 'C-0007', phone: null, position: null, province: 'สงขลา' };

// The fake query builder has no real joins — .select('..., b2b_customers(customer_code, organizations(...))')
// just returns the requests row exactly as seeded, so the joined shape has to be embedded directly.
function seedRequest(id: number, overrides: Record<string, any> = {}) {
  fakeAdmin.seed({
    requests: [{
      id, ref_id: `REF-${id}`, current_status: 'pending_review',
      b2b_customers: { customer_code: 'C-0007', organizations: { org_type: 'gov_hospital', province: 'สงขลา' } },
      ...overrides,
    }],
    notification_log: [],
  });
}

function minutesAgo(min: number) {
  return new Date(Date.now() - min * 60_000).toISOString();
}

beforeEach(() => {
  mockGetCustomerSession.mockReset();
  mockGetCustomerSession.mockResolvedValue(CUSTOMER as any);
});

describe('pingRequestAttention', () => {
  it('requires login', async () => {
    mockGetCustomerSession.mockResolvedValue(null);
    await expect(pingRequestAttention(1)).resolves.toEqual({ success: false, error: 'กรุณาเข้าสู่ระบบ' });
  });

  it('rejects a non-finite requestId', async () => {
    await expect(pingRequestAttention(NaN)).resolves.toEqual({ success: false, error: 'รหัสคำร้องไม่ถูกต้อง' });
  });

  it('returns the same "not found" message for a nonexistent request and one belonging to another organization (anti-enumeration)', async () => {
    fakeAdmin.seed({ requests: [], notification_log: [] });
    const notFound = await pingRequestAttention(999);

    seedRequest(1, { b2b_customers: { customer_code: 'SOMEONE-ELSE', organizations: null } });
    const wrongOwner = await pingRequestAttention(1);

    expect(notFound).toEqual({ success: false, error: 'ไม่พบคำร้องนี้' });
    expect(wrongOwner).toEqual({ success: false, error: 'ไม่พบคำร้องนี้' });
  });

  it('allows pinging a request submitted by a different login of the same organization (customer_code match, not exact b2b_customer_id)', async () => {
    seedRequest(1, { b2b_customer_id: 999 }); // different account id, same org customer_code
    const res = await pingRequestAttention(1);
    expect(res.success).toBe(true);
  });

  it('rejects a finished request (completed/rejected) — pinging a closed request is meaningless', async () => {
    seedRequest(1, { current_status: 'completed' });
    const res = await pingRequestAttention(1);
    expect(res).toEqual({ success: false, error: 'คำร้องนี้เสร็จสิ้นแล้ว ไม่สามารถแจ้งเตือนได้' });
  });

  it('inserts a ping notification carrying the owning org\'s org_type/province for Sale-scoped filtering', async () => {
    seedRequest(1);
    await pingRequestAttention(1);
    const notif = fakeAdmin.rows('notification_log')[0];
    expect(notif).toMatchObject({ type: 'ping', request_id: 1, ref_id: 'REF-1', customer_id: 1, org_type: 'gov_hospital', province: 'สงขลา' });
  });

  it('enforces the 1-hour cooldown per request — blocks a second ping within the hour', async () => {
    seedRequest(1);
    fakeAdmin.rows('notification_log').push({ id: 'n1', request_id: 1, type: 'ping', created_at: minutesAgo(10) });
    const res = await pingRequestAttention(1);
    expect(res.success).toBe(false);
    expect((res as any).error).toContain('นาที');
  });

  it('allows pinging again once the cooldown has fully elapsed', async () => {
    seedRequest(1);
    fakeAdmin.rows('notification_log').push({ id: 'n1', request_id: 1, type: 'ping', created_at: minutesAgo(61) });
    const res = await pingRequestAttention(1);
    expect(res.success).toBe(true);
  });

  it('cooldown is tracked independently per request — pinging request A does not block request B', async () => {
    fakeAdmin.seed({
      requests: [
        { id: 1, ref_id: 'REF-1', current_status: 'pending_review', b2b_customers: { customer_code: 'C-0007', organizations: null } },
        { id: 2, ref_id: 'REF-2', current_status: 'pending_review', b2b_customers: { customer_code: 'C-0007', organizations: null } },
      ],
      notification_log: [{ id: 'n1', request_id: 1, type: 'ping', created_at: minutesAgo(5) }],
    });
    const res = await pingRequestAttention(2);
    expect(res.success).toBe(true);
  });
});

describe('getPingStatus', () => {
  it('requires login', async () => {
    mockGetCustomerSession.mockResolvedValue(null);
    await expect(getPingStatus(1)).resolves.toEqual({ success: false, error: 'กรุณาเข้าสู่ระบบ' });
  });

  it('uses the same anti-enumeration ownership check as pingRequestAttention', async () => {
    seedRequest(1, { b2b_customers: { customer_code: 'SOMEONE-ELSE', organizations: null } });
    const res = await getPingStatus(1);
    expect(res).toEqual({ success: false, error: 'ไม่พบคำร้องนี้' });
  });

  it('canPing:true, onCooldown:false for a request with no prior ping', async () => {
    seedRequest(1);
    const res = await getPingStatus(1);
    expect(res).toMatchObject({ success: true, canPing: true, onCooldown: false, cooldownRemainingMinutes: 0 });
  });

  it('canPing:false, onCooldown:true, with an accurate remaining-minutes estimate right after a ping', async () => {
    seedRequest(1);
    fakeAdmin.rows('notification_log').push({ id: 'n1', request_id: 1, type: 'ping', created_at: minutesAgo(1) });
    const res: any = await getPingStatus(1);
    expect(res.canPing).toBe(false);
    expect(res.onCooldown).toBe(true);
    expect(res.cooldownRemainingMinutes).toBeGreaterThan(55);
    expect(res.cooldownRemainingMinutes).toBeLessThanOrEqual(60);
  });

  it('canPing:false for a finished request even with no cooldown active', async () => {
    seedRequest(1, { current_status: 'rejected' });
    const res: any = await getPingStatus(1);
    expect(res).toMatchObject({ success: true, canPing: false, onCooldown: false });
  });
});
