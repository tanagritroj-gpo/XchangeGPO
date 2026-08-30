'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getCustomerSession } from './auth-actions';
import { getStaffSession } from './auth-staff';
import { findSaleRepsCovering } from '@/lib/sale-reps';
import type { SaleRepInfo } from '@/lib/sale-reps';

// ★ ไฟล์นี้เป็น 'use server' — export ได้เฉพาะ async function เท่านั้น ห้าม re-export type
//   (export type { SaleRepInfo } ทำให้ SWC pass ของ Server Actions emit เป็น value re-export
//    ของ binding ที่ถูก erase ไปแล้ว → ReferenceError ตอน runtime) ผู้ใช้ที่ต้องการ SaleRepInfo
//   ให้ import ตรงจาก '@/lib/sale-reps'
export type SaleRepLookupResult =
  | { success: true; reps: SaleRepInfo[] }
  | { success: false; error: string };

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

  // ★ "หน่วยงานรัฐอื่นๆ" (gov_other) ไม่มี sale คนไหนดูแลโดยเจตนา (ยืนยันจากผู้ใช้ระบบ) —
  // ใส่ exclusion ไว้แค่ในฟังก์ชันนี้ (ฝั่งลูกค้ากรอกเองเท่านั้น) ไม่แตะ bucketForOrgType()
  // ที่ใช้ร่วมกับฝั่ง CSR (fetchOrgContactsForRequest/getAssignedSaleRepsForOrg ด้านล่าง)
  // เพราะฝั่งนั้นออกแบบไว้ดีอยู่แล้ว ไม่ต้องแก้ตามที่ตกลงกันไว้
  if (org?.org_type === 'gov_other') return { success: true, reps: [] };

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
