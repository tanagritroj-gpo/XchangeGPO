import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('../auth-actions', () => ({ getCustomerSession: vi.fn() }));
vi.mock('../auth-staff', () => ({ getStaffSession: vi.fn() }));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { getCustomerSession } = await import('../auth-actions');
const mockGetCustomerSession = vi.mocked(getCustomerSession);
const { getStaffSession } = await import('../auth-staff');
const mockGetStaffSession = vi.mocked(getStaffSession);

const { getAssignedSaleRepsForCustomer, getAssignedSaleRepsForOrg } = await import('../sale-lookup-actions');

const CUSTOMER_SESSION = {
  id: 1, email: 'cust@example.com', hospital_name: 'รพ.ทดสอบ', contact_name: 'สมชาย',
  customer_code: 'C-0007', phone: null, position: null, province: 'สงขลา',
};
const CSR_STAFF = {
  id: 'csr-1', username: 'csr1', full_name: 'CSR หนึ่ง', department: 'csr', role: 'staff',
  sale_customer_types: null, sale_provinces: null, email: null, signature_url: null, mfa_enabled: false, mfa_grace_until: null,
};

function seedOrgAndReps(org: { org_type: string; province: string }, reps: any[]) {
  fakeAdmin.seed({
    organizations: [{ id: 7, customer_code: 'C-0007', hospital_name: 'รพ.ทดสอบ', ...org }],
    staff_users: reps,
  });
}

beforeEach(() => {
  mockGetCustomerSession.mockReset();
  mockGetCustomerSession.mockResolvedValue(CUSTOMER_SESSION as any);
  mockGetStaffSession.mockReset();
  mockGetStaffSession.mockResolvedValue(CSR_STAFF as any);
});

describe('getAssignedSaleRepsForCustomer — customer-facing, identity from session only', () => {
  it('requires login', async () => {
    mockGetCustomerSession.mockResolvedValue(null);
    await expect(getAssignedSaleRepsForCustomer()).resolves.toEqual({ success: false, error: 'กรุณาเข้าสู่ระบบ' });
  });

  it('returns no reps when the session has no customer_code yet', async () => {
    mockGetCustomerSession.mockResolvedValue({ ...CUSTOMER_SESSION, customer_code: null } as any);
    await expect(getAssignedSaleRepsForCustomer()).resolves.toEqual({ success: true, reps: [] });
  });

  it('never accepts a customer_code from the caller — only session.customer_code (no parameters on this function at all)', () => {
    // getAssignedSaleRepsForCustomer() takes zero arguments — this is a compile-time
    // guarantee, not just a runtime one, but assert the arity explicitly so a future
    // refactor that accidentally adds a customer_code parameter fails a real test.
    expect(getAssignedSaleRepsForCustomer.length).toBe(0);
  });

  it('excludes gov_other by design even if a matching sale rep exists (customer-side only exclusion)', async () => {
    seedOrgAndReps(
      { org_type: 'gov_other', province: 'สงขลา' },
      [{ id: 'sale-1', full_name: 'ฝ่ายขาย', email: 's@example.com', department: 'sale', is_approved: true, sale_customer_types: ['government'], sale_provinces: ['สงขลา'] }],
    );
    await expect(getAssignedSaleRepsForCustomer()).resolves.toEqual({ success: true, reps: [] });
  });

  it('matches a sale rep whose bucket and province both cover the customer\'s organization', async () => {
    seedOrgAndReps(
      { org_type: 'gov_hospital', province: 'สงขลา' },
      [{ id: 'sale-1', full_name: 'ฝ่ายขายใต้', email: 's@example.com', department: 'sale', is_approved: true, sale_customer_types: ['government'], sale_provinces: ['สงขลา'] }],
    );
    const res = await getAssignedSaleRepsForCustomer();
    expect(res).toEqual({ success: true, reps: [{ id: 'sale-1', full_name: 'ฝ่ายขายใต้', email: 's@example.com' }] });
  });

  it('excludes a rep whose province does not match, even with the right bucket', async () => {
    seedOrgAndReps(
      { org_type: 'gov_hospital', province: 'สงขลา' },
      [{ id: 'sale-1', full_name: 'ฝ่ายขายเหนือ', email: 's@example.com', department: 'sale', is_approved: true, sale_customer_types: ['government'], sale_provinces: ['เชียงใหม่'] }],
    );
    await expect(getAssignedSaleRepsForCustomer()).resolves.toEqual({ success: true, reps: [] });
  });

  it('excludes an unapproved sale account and one with no email', async () => {
    seedOrgAndReps(
      { org_type: 'gov_hospital', province: 'สงขลา' },
      [
        { id: 'sale-1', full_name: 'ยังไม่อนุมัติ', email: 'a@example.com', department: 'sale', is_approved: false, sale_customer_types: ['government'], sale_provinces: ['สงขลา'] },
        { id: 'sale-2', full_name: 'ไม่มีอีเมล', email: null, department: 'sale', is_approved: true, sale_customer_types: ['government'], sale_provinces: ['สงขลา'] },
      ],
    );
    await expect(getAssignedSaleRepsForCustomer()).resolves.toEqual({ success: true, reps: [] });
  });
});

describe('getAssignedSaleRepsForOrg — CSR-facing, requires CSR session', () => {
  it('rejects a non-CSR session', async () => {
    mockGetStaffSession.mockResolvedValue({ ...CSR_STAFF, department: 'wh' } as any);
    await expect(getAssignedSaleRepsForOrg('C-0007')).resolves.toEqual({ success: false, error: 'กรุณาเข้าสู่ระบบ' });
  });

  it('does not exclude gov_other (only the customer-facing lookup does that)', async () => {
    seedOrgAndReps(
      { org_type: 'gov_other', province: 'สงขลา' },
      [{ id: 'sale-1', full_name: 'ฝ่ายขายใต้', email: 's@example.com', department: 'sale', is_approved: true, sale_customer_types: ['government'], sale_provinces: ['สงขลา'] }],
    );
    const res = await getAssignedSaleRepsForOrg('C-0007');
    expect(res).toEqual({ success: true, reps: [{ id: 'sale-1', full_name: 'ฝ่ายขายใต้', email: 's@example.com' }] });
  });

  it('returns no reps when no customerCode is supplied', async () => {
    await expect(getAssignedSaleRepsForOrg(undefined)).resolves.toEqual({ success: true, reps: [] });
  });
});
