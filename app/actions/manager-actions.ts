'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getStaffSession } from './auth-staff';
import { getErrorMessage } from '@/lib/error-message';

// เช็คสิทธิ์เฉพาะ role 'manager' เท่านั้น (เข้มกว่า getCSRSession ที่อนุญาต department 'csr' ด้วย)
// ยังคงไว้เหมือนเดิมทุกบรรทัด — ใช้กับ action ที่ควรเป็นสิทธิ์ manager ล้วนๆ เท่านั้น
async function getManagerSession() {
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