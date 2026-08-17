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

const { getCustomerExchangeHistory, getOrgExchangeHistory } = await import('../history-actions');

const CUSTOMER = { id: 1, email: 'c@example.com', hospital_name: 'รพ.ทดสอบ', contact_name: 'สมชาย', customer_code: 'C-0007', phone: null, position: null, province: 'สงขลา' };

beforeEach(() => {
  mockGetCustomerSession.mockReset();
  mockGetCustomerSession.mockResolvedValue(CUSTOMER as any);
});

describe('getCustomerExchangeHistory', () => {
  it('returns an empty array (not an error/throw) when not logged in', async () => {
    mockGetCustomerSession.mockResolvedValue(null);
    await expect(getCustomerExchangeHistory()).resolves.toEqual([]);
  });

  it('calls the RPC with the session\'s own id, never anything from outside — this function takes no arguments at all', () => {
    expect(getCustomerExchangeHistory.length).toBe(0);
  });

  it('passes p_customer_id from the session and returns the RPC data', async () => {
    let captured: any;
    fakeAdmin.setRpcHandler('get_customer_history', (params) => {
      captured = params;
      return { data: [{ ref_id: 'REF-1' }], error: null };
    });
    const result = await getCustomerExchangeHistory();
    expect(captured).toEqual({ p_customer_id: 1 });
    expect(result).toEqual([{ ref_id: 'REF-1' }]);
  });

  it('fails closed to an empty array (not a throw) when the RPC errors', async () => {
    fakeAdmin.setRpcHandler('get_customer_history', () => ({ data: null, error: { message: 'db down' } }));
    await expect(getCustomerExchangeHistory()).resolves.toEqual([]);
  });

  it('returns an empty array when the RPC succeeds with no data', async () => {
    fakeAdmin.setRpcHandler('get_customer_history', () => ({ data: null, error: null }));
    await expect(getCustomerExchangeHistory()).resolves.toEqual([]);
  });
});

describe('getOrgExchangeHistory — org-wide view scoped to session.customer_code', () => {
  it('returns an empty array when not logged in', async () => {
    mockGetCustomerSession.mockResolvedValue(null);
    await expect(getOrgExchangeHistory()).resolves.toEqual([]);
  });

  it('returns an empty array when the session has no customer_code yet (never queries the RPC)', async () => {
    mockGetCustomerSession.mockResolvedValue({ ...CUSTOMER, customer_code: '  ' } as any);
    const rpcSpy = vi.spyOn(fakeAdmin.client, 'rpc');
    await expect(getOrgExchangeHistory()).resolves.toEqual([]);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('passes p_customer_code from the session, never from any external input (zero-argument function)', () => {
    expect(getOrgExchangeHistory.length).toBe(0);
  });

  it('calls the RPC with the session\'s customer_code and returns the RPC data', async () => {
    let captured: any;
    fakeAdmin.setRpcHandler('get_org_history', (params) => {
      captured = params;
      return { data: [{ ref_id: 'REF-1' }, { ref_id: 'REF-2' }], error: null };
    });
    const result = await getOrgExchangeHistory();
    expect(captured).toEqual({ p_customer_code: 'C-0007' });
    expect(result).toEqual([{ ref_id: 'REF-1' }, { ref_id: 'REF-2' }]);
  });

  it('fails closed to an empty array when the RPC errors', async () => {
    fakeAdmin.setRpcHandler('get_org_history', () => ({ data: null, error: { message: 'db down' } }));
    await expect(getOrgExchangeHistory()).resolves.toEqual([]);
  });
});
