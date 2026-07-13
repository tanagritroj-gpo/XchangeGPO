'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getStaffSession } from './auth-staff';

// เช็คสิทธิ์เฉพาะ role 'manager' เท่านั้น (เข้มกว่า getCSRSession ที่อนุญาต department 'csr' ด้วย)
async function getManagerSession() {
  const session = await getStaffSession();
  if (!session) throw new Error("ไม่ได้ Login");
  if (session.role !== 'manager') throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  return session;
}

// ดึง status_logs ทั้งหมด — ใช้คำนวณ "เวลาเฉลี่ยแต่ละขั้นตอน" และ "เหตุผลการปฏิเสธยอดนิยม"
export async function getManagerStatusLogs() {
  try {
    await getManagerSession();

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