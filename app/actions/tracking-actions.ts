'use server'

import { headers } from 'next/headers';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/get-client-ip';
import { getCustomerSession } from './auth-actions';
import { getManagerOrCsrSession } from './manager-actions';
import { getErrorMessage } from '@/lib/error-message';
import type { DrugItemRow } from '@/lib/types';
import { z } from 'zod';
import { parseOrError } from '@/lib/validate-input';

// ── Public: ไม่ต้อง login ────────────────────────────────────
export async function getTrackingTimeline(refId: string) {
  const cleaned = refId?.trim();
  if (!cleaned || cleaned.length > 50) return { error: 'รหัสอ้างอิงไม่ถูกต้อง' };

  const headerList = await headers();
  const ip = getClientIp(headerList);

  // throttle รวมต่อ IP กันยิงรัว — 20 ครั้ง / 5 นาที ถือว่าเผื่อเหลือเผื่อขาดสำหรับผู้ใช้จริงที่กดรีเฟรชบ่อยๆ
  // failMode 'open': หน้าติดตามสถานะเป็น read-only + public — ถ้า DB สะดุดจนเช็คโควตาไม่ได้
  // การบล็อกผู้ใช้ทุกคนเสียหายกว่าความเสี่ยง enumeration ในช่วงสั้น ๆ (และตอน DB ล่ม query
  // ด้านล่างก็ fail ทุกคำขอกลายเป็น "ไม่พบ" อยู่แล้ว ผู้ไล่สุ่มจึงไม่ได้ signature อะไร)
  const general = await checkRateLimit(`track:ip:${ip}`, 20, 5 * 60, { failMode: 'open' });
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
    const miss = await checkRateLimit(`track:miss:${ip}`, 8, 15 * 60, { failMode: 'open' });
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
  const parsed = parseOrError(z.object({ refId: z.string().trim().min(1).max(50) }), { refId });
  if (!parsed.ok) return { success: false, error: parsed.error };

  const session = await getCustomerSession();
  if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };

  // throttle เบาๆ ต่อ session กันสแปมกดรัว — เข้มน้อยกว่า public เพราะมี login คั่นอยู่แล้ว
  // failMode 'open': read-only + login แล้ว (abuse จำกัดอยู่แล้ว) — ไม่บล็อกการดูสถานะคำร้อง
  // ของตัวเองตอน DB สะดุด
  const limited = await checkRateLimit(`track-private:session:${session.id}`, 60, 5 * 60, { failMode: 'open' });
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
  // ★ ปกติเจ้าของหน่วยงานมาจาก b2b_customers ที่ join — แต่ใบงานที่ CSR กรอกแทนลูกค้า
  // (csr_manual) มี b2b_customer_id = NULL จึงไม่มี join นี้ ให้ fallback ไปดู
  // requests.customer_code ตรง ๆ (createStaffReturnRequest ตั้งค่าจาก organization เสมอ) —
  // pattern เดียวกับ generatePdfAction (ให้ลูกค้าหน่วยงานเดียวกันติดตามสถานะจาก
  // "ประวัติงานรวมทั้งหน่วยงาน" ได้)
  const owner = Array.isArray(request?.b2b_customers) ? request.b2b_customers[0] : request?.b2b_customers;
  const ownerCode = owner?.customer_code ?? request?.customer_code ?? null;
  const sameOrg = !!session.customer_code && !!ownerCode && ownerCode === session.customer_code;

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

// ── Manager/CSR: "Track & Trace" — ดู tracking แบบเดียวกับที่ลูกค้าเห็น (private, มี
// staff_remark) แต่ไม่จำกัดแค่หน่วยงานตัวเอง เห็นได้ทุกใบงานในระบบ รวมถึงคำร้องที่ CSR
// กรอกแทนลูกค้า (submission_channel='csr_manual') เพราะไม่มีการ filter ช่องทางใน query
// นี้เลย ต่างจาก trackMyRequestByRefId ที่ scope ด้วย customer_code ของ session ลูกค้า ==
// ★ เดิมชื่อ getRequestTrackingForManager ใช้ getManagerSession() (manager-only) — ตอนนี้
// CSR ต้องใช้ตอบลูกค้าด้วย เปลี่ยนเป็น getManagerOrCsrSession() (pattern เดียวกับ
// getUnansweredChatbotQuestions/getManagerStatusLogs) และเปลี่ยนชื่อฟังก์ชันให้ตรงตาม
// สิทธิ์จริง ใช้ร่วมกันทั้ง app/admin/manager/tracking/page.tsx และ app/admin/csr/tracking/page.tsx
export async function getRequestTrackingForStaff(refId: string) {
  try {
    const session = await getManagerOrCsrSession();

    const cleaned = refId?.trim();
    if (!cleaned || cleaned.length > 50) return { success: false, error: 'รหัสอ้างอิงไม่ถูกต้อง' };

    // throttle ต่อ staff กันสแปมกดรัว — เข้มน้อยกว่า public เพราะมี login คั่นอยู่แล้ว
    // (pattern เดียวกับ trackMyRequestByRefId ฝั่งลูกค้า) — failMode 'open' ด้วยเหตุผลเดียวกัน
    const limited = await checkRateLimit(`track-staff:staff:${session.id}`, 60, 5 * 60, { failMode: 'open' });
    if (!limited.allowed) {
      return { success: false, error: 'ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' };
    }

    const { data: request, error: reqErr } = await supabaseAdmin
      .from('requests')
      .select('*, drug_items(*)')
      .eq('ref_id', cleaned)
      .maybeSingle();

    if (reqErr || !request) {
      return { success: false, error: 'ไม่พบรหัสอ้างอิงนี้ในระบบ' };
    }

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
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}