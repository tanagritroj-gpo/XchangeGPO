'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getStaffSession } from './auth-staff';
import { expandToOrgTypes } from '@/lib/sale-coverage';

// ตรวจ session + ขยายขอบเขตดูแลของ sale เป็น org_type ดิบ — ใช้ร่วมกันทั้งดึงรายการ
// และดึงรายละเอียดใบงานเดี่ยว คืน null ถ้าไม่ใช่ sale หรือยังไม่ได้กำหนดขอบเขต
async function getSaleCoverage() {
  const session = await getStaffSession();
  if (!session || session.department !== 'sale') return null;

  const orgTypes = expandToOrgTypes(session.sale_customer_types ?? []);
  const provinces = session.sale_provinces ?? [];
  if (orgTypes.length === 0 || provinces.length === 0) return null;

  return { orgTypes, provinces };
}

// ประวัติการแลกเปลี่ยนของลูกค้าในขอบเขตที่ sale คนนี้ดูแล — กรองด้วย org_type
// (ขยายจาก bucket 'private'/'government' ที่เลือกไว้ตอนลงทะเบียน) และจังหวัด
// ไม่รับพารามิเตอร์จากภายนอกเลย ดึงขอบเขตจาก session ที่ verify แล้วเท่านั้น
export async function getSaleCustomerHistory() {
  const coverage = await getSaleCoverage();
  if (!coverage) return [];

  const { data, error } = await supabaseAdmin.rpc('get_sale_customer_history', {
    p_org_types: coverage.orgTypes,
    p_provinces: coverage.provinces,
  });

  if (error) {
    console.error('Error fetching sale customer history via RPC:', error);
    return [];
  }

  return data || [];
}

// รายละเอียดใบงานเดี่ยว (stepper/timeline/รายการยา) — ใช้รูปแบบเดียวกับ
// getStaffRequestDetail ของ CSR แต่ตรวจสิทธิ์ต่างกัน: CSR ยืนยันด้วย customerId
// ที่ระบุมาตรงๆ ส่วน sale ไม่รู้จัก customer ล่วงหน้า จึงต้อง join ไปดู org_type/
// province ของลูกค้าเจ้าของใบงานแล้วเทียบกับขอบเขตที่ sale คนนี้ดูแลแทน
export async function getSaleRequestDetail(requestId: number) {
  try {
    const coverage = await getSaleCoverage();
    if (!coverage) throw new Error('ไม่มีสิทธิ์เข้าถึงข้อมูลนี้');

    const { data: request, error: reqErr } = await supabaseAdmin
      .from('requests')
      .select('*, drug_items(*), b2b_customers!inner(org_type, province)')
      .eq('id', requestId)
      .maybeSingle();

    if (reqErr || !request) throw new Error('ไม่พบข้อมูลใบงานนี้');

    const customer = Array.isArray(request.b2b_customers) ? request.b2b_customers[0] : request.b2b_customers;
    if (!customer || !coverage.orgTypes.includes(customer.org_type) || !coverage.provinces.includes(customer.province)) {
      throw new Error('ไม่มีสิทธิ์เข้าถึงข้อมูลใบงานนี้');
    }

    const { data: timelineRaw } = await supabaseAdmin
      .from('timeline_summary')
      .select('status_name, log_date, staff_remark, drug_item_id')
      .eq('request_id', request.id)
      .order('log_date', { ascending: true });

    const drugNameById: Record<number, string> = Object.fromEntries(
      (request.drug_items ?? []).map((i: any) => [i.id, i.drug_name])
    );

    const timeline = (timelineRaw ?? []).map((t) => ({
      ...t,
      drug_name: t.drug_item_id != null ? drugNameById[t.drug_item_id] ?? null : null,
    }));

    const { b2b_customers: _omit, ...requestData } = request;
    return { success: true, data: { ...requestData, timeline } };
  } catch (e: any) {
    console.error('getSaleRequestDetail error:', e.message);
    return { success: false, error: e.message };
  }
}
