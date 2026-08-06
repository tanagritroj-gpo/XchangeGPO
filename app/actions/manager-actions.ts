'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getStaffSession } from './auth-staff';
import { getErrorMessage } from '@/lib/error-message';
import type { DrugItemRow } from '@/lib/types';

// เช็คสิทธิ์เฉพาะ role 'manager' เท่านั้น (เข้มกว่า getCSRSession ที่อนุญาต department 'csr' ด้วย)
// export ออกมาให้ route อื่น (เช่น downloads-export) เรียกใช้ตรวจสิทธิ์แบบเดียวกันได้
export async function getManagerSession() {
  const session = await getStaffSession();
  if (!session) throw new Error("ไม่ได้ Login");
  if (session.role !== 'manager') throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  return session;
}

// ── ใช้เฉพาะกับ action ที่ต้องเปิดให้ทั้ง manager และ csr อ่านได้
// (getManagerStatusLogs สำหรับ staff-chat bot, และตอนนี้ staff-ping-actions.ts
// สำหรับกระดิ่งเร่งงาน) ──
// เช็คจาก session.department แทน session.role สำหรับฝั่ง CSR เพราะ staff
// ทุกแผนกที่ไม่ใช่ manager จะมี role = 'staff' เสมอ (ดู registerStaff ใน
// auth-staff.ts) แผนกจริงอยู่ที่ department เท่านั้น
// ── export ออกมาแล้ว (เดิมเป็น private function) เพื่อให้ไฟล์อื่นที่ต้อง
// เช็คสิทธิ์แบบเดียวกัน (manager หรือ csr) import ไปใช้ได้ ไม่ต้องเขียนซ้ำ
export async function getManagerOrCsrSession() {
  const session = await getStaffSession();
  if (!session) throw new Error("ไม่ได้ Login");
  if (session.role !== 'manager' && session.department !== 'csr') {
    throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  }
  return session;
}

// ตัวเลขสรุปสำหรับ tile บนหน้า hub ของ manager (รออนุมัติ/ใบงานทั้งหมด/คำถามค้าง) —
// ใช้ count: 'exact', head: true ทั้งสามคิวรี่ ไม่ดึงตัวข้อมูลจริงมาเลย เร็วกว่าเดิมมาก
// เทียบกับที่หน้า hub เคยเรียก getPendingStaff (ดึงทุกคอลัมน์ทุกแถว) + getCSRDashboardData
// (join requests กับ drug_items ทั้งตาราง) + getUnansweredChatbotQuestions (limit 50 แล้วนับ
// .length ซึ่งจะนิ่งที่ 50 ไม่โตต่อทั้งที่มีมากกว่านั้นจริง — เป็นบั๊กนับเพี้ยน ไม่ใช่แค่ช้า)
export async function getManagerHubCounts(): Promise<
  | { success: true; pendingStaff: number; totalRequests: number; unanswered: number }
  | { success: false; error: string }
> {
  try {
    await getManagerSession();

    const [pendingStaffRes, totalRequestsRes, unansweredRes] = await Promise.all([
      supabaseAdmin.from('staff_users').select('id', { count: 'exact', head: true }).eq('is_approved', false),
      supabaseAdmin.from('requests').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('chatbot_unanswered_questions').select('id', { count: 'exact', head: true }),
    ]);

    const firstError = pendingStaffRes.error || totalRequestsRes.error || unansweredRes.error;
    if (firstError) return { success: false, error: firstError.message };

    return {
      success: true,
      pendingStaff: pendingStaffRes.count ?? 0,
      totalRequests: totalRequestsRes.count ?? 0,
      unanswered: unansweredRes.count ?? 0,
    };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// รายชื่อหน่วยงานที่ลงทะเบียนทั้งหมด (master list — สร้างตอน CSR อนุมัติลูกค้าใหม่ ดู
// reviewClient ใน csr-actions.ts) ใช้เฉพาะสำหรับรายงาน "พอร์ตลูกค้า/หน่วยงาน" ใน
// Download Center — ต่างจาก searchOrganizations ที่จำกัดผลลัพธ์ 5 แถวสำหรับ autocomplete
export async function getAllOrganizations() {
  try {
    await getManagerSession();

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('id, customer_code, hospital_name, province, org_type')
      .order('hospital_name', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// จับคู่ b2b_customers.id -> organization_id — requests ผูกกับลูกค้าผ่าน b2b_customer_id
// เสมอ (ทั้ง submission_channel='customer_portal' และ 'csr_manual') ส่วน requests.customer_code
// เอง "ไม่เคยถูกเซ็ตค่าเลยสักแถวเดียว" ในข้อมูลจริง — ใช้ join สาย b2b_customer_id นี้เท่านั้น
// ในการนับใบงาน/มูลค่าต่อหน่วยงานสำหรับรายงานพอร์ตลูกค้า ห้ามกลับไป join ด้วย customer_code ตรงๆ
export async function getB2BCustomerOrgLinks() {
  try {
    await getManagerSession();

    const { data, error } = await supabaseAdmin
      .from('b2b_customers')
      .select('id, organization_id');

    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// คำถามที่บอทลูกค้า (app/api/chat) ตอบว่า "ไม่แน่ใจ" — เก็บไว้ให้ manager ทบทวน
// ว่าควรเพิ่มเข้า FAQ_ENTRIES (lib/chatbot-knowledge.ts) ไหม ดู app/api/chat/route.ts
export async function getUnansweredChatbotQuestions(limit: number = 50) {
  try {
    await getManagerSession();

    const { data, error } = await supabaseAdmin
      .from('chatbot_unanswered_questions')
      .select('id, question, answer, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// รายละเอียดใบงานแบบเต็ม (ใช้เป็น fetchDetail ของ RequestHistoryList ในแท็บ "ใบงานทั้งหมด")
// ต่างจาก getStaffRequestDetail/getSaleRequestDetail ตรงที่ manager ไม่ต้องเช็ค customerId
// หรือ org_type/province ของเจ้าของใบงานเลย — เห็นได้ทุกใบงานในระบบไม่จำกัดขอบเขต
export async function getManagerRequestDetail(requestId: number) {
  try {
    await getManagerSession();

    const { data: request, error: reqErr } = await supabaseAdmin
      .from('requests')
      .select('*, drug_items(*)')
      .eq('id', requestId)
      .maybeSingle();

    if (reqErr || !request) throw new Error('ไม่พบข้อมูลใบงานนี้');

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

    return { success: true, data: { ...request, timeline } };
  } catch (e: unknown) {
    console.error('getManagerRequestDetail error:', getErrorMessage(e));
    return { success: false, error: getErrorMessage(e) };
  }
}

// ดึง status_logs ทั้งหมด — ใช้คำนวณ "เวลาเฉลี่ยแต่ละขั้นตอน" และ "เหตุผลการปฏิเสธยอดนิยม"
// (ใช้ทั้งใน ManagerInsights.tsx และ staff-chat bot — เปิดให้ CSR อ่านได้ด้วยแล้ว)
export async function getManagerStatusLogs() {
  try {
    await getManagerOrCsrSession();

    const { data, error } = await supabaseAdmin
      .from('status_logs')
      .select('id, request_id, staff_id, status_name, log_date, staff_remark, department, actor_type, drug_item_id, rejection_reason_code')
      .order('log_date', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// ดึง status_logs พร้อมชื่อพนักงานผู้ดำเนินการ (join staff_users.full_name ด้วยมือ ตาม
// pattern เดียวกับ drugNameById ใน getManagerRequestDetail) — ใช้เฉพาะ Download Center
// สำหรับ export เป็น audit trail แบบเต็ม แยกจาก getManagerStatusLogs ตัวเดิมที่
// ManagerInsights/staff-chat พึ่งพา shape เดิมอยู่แล้ว (กันไม่ให้กระทบจุดอื่น)
// requestIds === undefined -> ทุกใบงาน, ระบุ array (แม้ว่าง) -> กรองเฉพาะ id ที่ให้มาเท่านั้น
export async function getManagerStatusLogsDetailed(requestIds?: number[]) {
  try {
    await getManagerSession();

    let query = supabaseAdmin
      .from('status_logs')
      .select('id, request_id, staff_id, status_name, log_date, staff_remark, department, actor_type, drug_item_id, rejection_reason_code')
      .order('log_date', { ascending: true });

    if (requestIds !== undefined) {
      // .in() กับ array ว่างพฤติกรรมไม่แน่นอนข้าม driver — ใส่ sentinel ที่ไม่มีจริงแทน
      // เพื่อการันตีว่าได้ผลลัพธ์ 0 แถวเสมอเมื่อไม่มีใบงานตรงตามตัวกรอง
      query = query.in('request_id', requestIds.length > 0 ? requestIds : [-1]);
    }

    const { data: logs, error } = await query;
    if (error) return { success: false, error: error.message };

    const staffIds = Array.from(
      new Set((logs ?? []).map((l) => l.staff_id).filter((id): id is string => !!id))
    );
    const staffNameById: Record<string, string> = {};
    if (staffIds.length > 0) {
      const { data: staffRows } = await supabaseAdmin
        .from('staff_users')
        .select('id, full_name')
        .in('id', staffIds);
      (staffRows ?? []).forEach((s) => { staffNameById[s.id] = s.full_name ?? s.id; });
    }

    const data = (logs ?? []).map((l) => ({
      ...l,
      staff_name: l.staff_id ? staffNameById[l.staff_id] ?? null : null,
    }));

    return { success: true, data };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}