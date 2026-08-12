'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getCustomerSession } from './auth-actions';
import { getStaffSession } from './auth-staff';
import { bucketForOrgType } from '@/lib/sale-coverage';

export interface SaleRepInfo {
  id: string;
  full_name: string;
}

export type SaleRepLookupResult =
  | { success: true; reps: SaleRepInfo[] }
  | { success: false; error: string };

// จับคู่ sale ที่ดูแลหน่วยงานนี้ — logic เดียวกับที่ fetchOrgContactsForRequest() ใน
// staff-form-actions.ts ใช้ตอนหา sale เพื่อเป็นผู้รับอีเมล (many-to-many ผ่าน
// org_type/province เทียบกับ sale_customer_types/sale_provinces ของแต่ละคน ไม่ใช่
// assign ตรง 1 หน่วยงานต่อ 1 sale — อาจได้ 0/1/หลายคนก็ได้)
async function findSaleRepsCovering(orgType: string | null | undefined, province: string | null | undefined): Promise<SaleRepInfo[]> {
  const bucket = bucketForOrgType(orgType);
  if (!bucket || !province) return [];

  const { data: saleReps } = await supabaseAdmin
    .from('staff_users')
    .select('id, full_name, sale_customer_types, sale_provinces')
    .eq('department', 'sale')
    .eq('is_approved', true);

  return (saleReps ?? [])
    .filter((s) => {
      const types = (s.sale_customer_types as string[] | null) ?? [];
      const provinces = (s.sale_provinces as string[] | null) ?? [];
      return types.includes(bucket) && provinces.includes(province);
    })
    .map((s) => ({ id: String(s.id), full_name: s.full_name ?? 'ไม่ระบุชื่อ' }));
}

// ฝั่งลูกค้า — ใช้ตอนกรอกแบบฟอร์มเอง เลือก "จัดส่งผ่านผู้แทน" แล้วอยากรู้ว่า sale
// คนไหนดูแลหน่วยงานตัวเอง ★ ดึง customer_code จาก session ที่ verify แล้วเท่านั้น
// ห้ามรับจาก client เพราะจะกลายเป็นช่องให้ enumerate ดูว่าหน่วยงานอื่นมีใครดูแลได้
export async function getAssignedSaleRepsForCustomer(): Promise<SaleRepLookupResult> {
  const session = await getCustomerSession();
  if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
  if (!session.customer_code) return { success: true, reps: [] };

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('org_type, province')
    .eq('customer_code', session.customer_code)
    .maybeSingle();

  return { success: true, reps: await findSaleRepsCovering(org?.org_type, org?.province) };
}

// ฝั่ง CSR — กรอกแบบฟอร์มแทนลูกค้า เลือกหน่วยงานผ่าน OrganizationPicker (ค้นหามาแล้ว
// ผ่าน searchOrganizations() ที่ gate ด้วย CSR session อยู่แล้ว) จึง trust customer_code
// ที่ CSR เลือกไว้ได้ แค่เช็คว่ายังเป็น CSR session อยู่จริง
export async function getAssignedSaleRepsForOrg(customerCode?: string): Promise<SaleRepLookupResult> {
  const session = await getStaffSession();
  if (!session || session.department !== 'csr') return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
  if (!customerCode) return { success: true, reps: [] };

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('org_type, province')
    .eq('customer_code', customerCode)
    .maybeSingle();

  return { success: true, reps: await findSaleRepsCovering(org?.org_type, org?.province) };
}
