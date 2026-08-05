'use server'

import { headers } from 'next/headers';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCustomerSession } from './auth-actions';
import type { DrugItemRow } from '@/lib/types';

function getClientIp(headerList: Headers): string {
  // รองรับทั้งกรณีอยู่หลัง proxy/CDN (Vercel, Cloudflare) และ self-host เปล่าๆ (nginx/traefik)
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = headerList.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

// requests.current_status / drug_items.current_status เป็น enum ภาษาอังกฤษตาม CHECK constraint จริง
// (ไม่ใช่ข้อความไทย) — เช็คแบบ exact match ตรงนี้ ต่างจาก status_name ใน timeline ที่เป็น free-text ภาษาไทย
const REJECTED_STATUS = 'rejected';

// ── Public: ไม่ต้อง login ────────────────────────────────────
export async function getTrackingTimeline(refId: string) {
  const cleaned = refId?.trim();
  if (!cleaned || cleaned.length > 50) return { error: 'รหัสอ้างอิงไม่ถูกต้อง' };

  const headerList = await headers();
  const ip = getClientIp(headerList);

  // throttle รวมต่อ IP กันยิงรัว — 20 ครั้ง / 5 นาที ถือว่าเผื่อเหลือเผื่อขาดสำหรับผู้ใช้จริงที่กดรีเฟรชบ่อยๆ
  const general = await checkRateLimit(`track:ip:${ip}`, 20, 5 * 60);
  if (!general.allowed) {
    return { error: 'ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง' };
  }

  // แก้ไข: เพิ่ม 'id' ลงใน .select()
  const { data: request, error: reqErr } = await supabaseAdmin
    .from('requests')
    .select('id, ref_id, current_status, created_at, request_type')
    .eq('ref_id', cleaned)
    .maybeSingle();

  if (reqErr || !request) {
    // ตั้งใจแยก throttle เฉพาะกรณี "หาไม่เจอ" ให้เข้มกว่า throttle ทั่วไป
    // เพื่อชะลอการไล่สุ่ม ref_id (enumeration) โดยไม่กระทบผู้ใช้ที่พิมพ์ถูกอยู่แล้ว
    const miss = await checkRateLimit(`track:miss:${ip}`, 8, 15 * 60);
    if (!miss.allowed) {
      return { error: 'ค้นหาผิดพลาดหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง' };
    }
    return { error: 'ไม่พบรหัสอ้างอิงนี้ในระบบ' };
  }

  // ตอนนี้ request.id จะมีค่าแล้วครับ
  // เพิ่ม drug_item_id: log บางรายการ (โดยเฉพาะตอน reject) ผูกกับยาตัวใดตัวหนึ่งโดยเฉพาะ ไม่ใช่ทั้งคำร้อง
  const { data: timelineRaw } = await supabaseAdmin
    .from('timeline_summary')
    .select('status_name, log_date, drug_item_id')
    .eq('request_id', request.id)
    .order('log_date', { ascending: true });

  // เติมชื่อยากำกับให้ log ที่ผูกกับ drug_item_id — ดึงครั้งเดียวด้วย .in() กันยิง query ซ้ำต่อแถว (N+1)
  const drugItemIds = Array.from(
    new Set(
      (timelineRaw ?? [])
        .map((t) => t.drug_item_id)
        .filter((id): id is number => id !== null && id !== undefined)
    )
  );

  let drugNameById: Record<number, string> = {};
  if (drugItemIds.length > 0) {
    const { data: namedItems } = await supabaseAdmin
      .from('drug_items')
      .select('id, drug_name')
      .in('id', drugItemIds);
    drugNameById = Object.fromEntries((namedItems ?? []).map((i) => [i.id, i.drug_name]));
  }

  const timeline = (timelineRaw ?? []).map((t) => ({
    status_name: t.status_name,
    log_date: t.log_date,
    drug_name: t.drug_item_id != null ? drugNameById[t.drug_item_id] ?? null : null,
  }));

  // แสดงรายการยาเสมอ (ไม่จำกัดเฉพาะตอน reject แล้ว) — ผู้ใช้อยากเห็นรายการยา/lot/จำนวน/หน่วยของคำร้องได้ทุกสถานะ
  // ⚠️ เลือกคอลัมน์เฉพาะที่ปลอดภัยให้ public เห็นเท่านั้น: ตัด value_amount (ข้อมูลการเงิน),
  //    invoice_number, compliance_remark, is_compliant ออกทั้งหมด เพราะเป็นข้อมูลภายใน/สำหรับ staff เท่านั้น
  // current_status ของแต่ละชิ้นรวมไว้ด้วยเพื่อไฮไลต์รายการที่ถูกปฏิเสธเป็นรายชิ้นในฝั่ง UI
  const SAFE_DRUG_ITEM_COLUMNS = 'drug_name, qty, unit, lot_number, exp_date, current_status';
  const { data: allItems } = await supabaseAdmin
    .from('drug_items')
    .select(SAFE_DRUG_ITEM_COLUMNS)
    .eq('request_id', request.id);
  const drugItems = allItems ?? [];

  return { request, timeline, drug_items: drugItems };
}

// ── Private: ต้อง login ────────────────────────────────────
export async function trackMyRequestByRefId(refId: string) {
  const session = await getCustomerSession();
  if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };

  // throttle เบาๆ ต่อ session กันสแปมกดรัว — เข้มน้อยกว่า public เพราะมี login คั่นอยู่แล้ว
  const limited = await checkRateLimit(`track-private:session:${session.id}`, 60, 5 * 60);
  if (!limited.allowed) {
    return { success: false, error: 'ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' };
  }

  // แก้ไข: .select('*') ปกติจะดึง 'id' มาให้แล้ว แต่เพื่อให้ชัวร์ว่าเข้าถึง request.id ได้แน่นอน
  // ★ join b2b_customers(customer_code) เพิ่ม — ใช้เช็คสิทธิ์ระดับ "หน่วยงาน" แทน exact
  // b2b_customer_id (ดูเหตุผลด้านล่าง)
  const { data: request, error: reqErr } = await supabaseAdmin
    .from('requests')
    .select('*, drug_items(*), b2b_customers(customer_code)')
    .eq('ref_id', refId)
    .single();

  // ★ เช็คสิทธิ์ระดับหน่วยงาน (customer_code) ไม่ใช่ exact b2b_customer_id — 1 หน่วยงานมี
  // login ได้หลายบัญชี (เช่น CSR กรอกแทนลูกค้าโดยเลือกบัญชีหนึ่ง แต่ลูกค้าคนที่ login จริงเป็น
  // อีกบัญชีของหน่วยงานเดียวกัน) ใช้ pattern เดียวกับ getOrgExchangeHistory/get_org_history
  // ที่ scope ด้วย customer_code เช่นกัน ไม่ใช้ requests.customer_code เพราะคอลัมน์นี้เป็น legacy
  // ไม่ได้ถูกเติมค่าเสมอไป (ตัวจริงต้องอ่านจาก b2b_customers ที่ join มา)
  const owner = Array.isArray(request?.b2b_customers) ? request.b2b_customers[0] : request?.b2b_customers;
  const sameOrg = !!session.customer_code && !!owner?.customer_code && owner.customer_code === session.customer_code;

  if (reqErr || !request || !sameOrg) {
    return { success: false, error: 'ไม่พบข้อมูล หรือไม่มีสิทธิ์เข้าถึง' };
  }

  // ตอนนี้ request.id จะมีค่าแล้วครับ
  // เพิ่ม drug_item_id เพื่อเติมชื่อยากำกับ log ที่ผูกกับยารายชิ้น — ใช้ drug_items ที่ join มาแล้วด้านบน ไม่ต้อง query ซ้ำ
  const { data: timelineRaw } = await supabaseAdmin
    .from('timeline_summary')
    .select('status_name, log_date, staff_remark, drug_item_id')
    .eq('request_id', request.id)
    .order('log_date', { ascending: true });

  const drugNameById: Record<number, string> = Object.fromEntries(
    (request.drug_items ?? []).map((i: DrugItemRow) => [i.id, i.drug_name])
  );

  const timeline = (timelineRaw ?? []).map((t) => ({
    ...t,
    drug_name: t.drug_item_id != null ? drugNameById[t.drug_item_id] ?? null : null,
  }));

  return {
    success: true,
    data: {
      ...request,
      timeline,
    },
  };
}