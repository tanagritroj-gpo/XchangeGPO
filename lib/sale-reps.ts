import 'server-only';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { bucketForOrgType } from '@/lib/sale-coverage';

export interface SaleRepInfo {
  id: string;
  full_name: string;
  email: string;
}

// จับคู่ sale ที่ดูแลหน่วยงานนี้ — many-to-many ผ่าน org_type/province เทียบกับ
// sale_customer_types/sale_provinces ของแต่ละคน (ไม่ใช่ assign ตรง 1:1) อาจได้ 0/1/หลายคน
// ★ ต้องมี email เท่านั้นถึงจะนับ (ไม่มี email ส่งอีเมลหาไม่ได้)
export async function findSaleRepsCovering(
  orgType: string | null | undefined,
  province: string | null | undefined,
): Promise<SaleRepInfo[]> {
  const bucket = bucketForOrgType(orgType);
  if (!bucket || !province) return [];

  const { data: saleReps } = await supabaseAdmin
    .from('staff_users')
    .select('id, full_name, email, sale_customer_types, sale_provinces')
    .eq('department', 'sale')
    .eq('is_approved', true)
    .not('email', 'is', null);

  return (saleReps ?? [])
    .filter((s) => {
      const types = (s.sale_customer_types as string[] | null) ?? [];
      const provinces = (s.sale_provinces as string[] | null) ?? [];
      return !!s.email && types.includes(bucket) && provinces.includes(province);
    })
    .map((s) => ({ id: String(s.id), full_name: s.full_name ?? 'ไม่ระบุชื่อ', email: s.email as string }));
}

// อีเมล sale ที่ดูแลหน่วยงานตาม customer_code — ใช้ตอน CSR trigger ส่งเอกสารให้ลูกค้า
// (customer_code มาจาก request ในระบบ ไม่ใช่ input ผู้ใช้)
export async function saleEmailsForCustomerCode(customerCode: string | null | undefined): Promise<string[]> {
  if (!customerCode) return [];
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('org_type, province')
    .eq('customer_code', customerCode)
    .maybeSingle();
  return (await findSaleRepsCovering(org?.org_type, org?.province)).map((r) => r.email);
}
