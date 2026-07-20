'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getStaffSession } from './auth-staff';

// เช็คสิทธิ์เฉพาะ role 'manager' เท่านั้น (เข้มกว่า getCSRSession ที่อนุญาต department 'csr' ด้วย)
// ยังคงไว้เหมือนเดิมทุกบรรทัด — ใช้กับ action ที่ควรเป็นสิทธิ์ manager ล้วนๆ เท่านั้น
async function getManagerSession() {
  const session = await getStaffSession();
  if (!session) throw new Error("ไม่ได้ Login");
  if (session.role !== 'manager') throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  return session;
}

// ── ใช้เฉพาะกับ action ที่ต้องเปิดให้ทั้ง manager และ csr อ่านได้
// (ตอนนี้มีแค่ getManagerStatusLogs สำหรับ staff-chat bot) ──
// เช็คจาก session.department แทน session.role สำหรับฝั่ง CSR เพราะ staff
// ทุกแผนกที่ไม่ใช่ manager จะมี role = 'staff' เสมอ (ดู registerStaff ใน
// auth-staff.ts) แผนกจริงอยู่ที่ department เท่านั้น
async function getManagerOrCsrSession() {
  const session = await getStaffSession();
  if (!session) throw new Error("ไม่ได้ Login");
  if (session.role !== 'manager' && session.department !== 'csr') {
    throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  }
  return session;
}

// ดึง status_logs ทั้งหมด — ใช้คำนวณ "เวลาเฉลี่ยแต่ละขั้นตอน" และ "เหตุผลการปฏิเสธยอดนิยม"
// (ใช้ทั้งใน ManagerInsights.tsx และ staff-chat bot — เปิดให้ CSR อ่านได้ด้วยแล้ว)
export async function getManagerStatusLogs() {
  try {
    await getManagerOrCsrSession();

    const { data, error } = await supabaseAdmin
      .from('status_logs')
      .select('request_id, status_name, log_date, staff_remark, department, actor_type')
      .order('log_date', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}