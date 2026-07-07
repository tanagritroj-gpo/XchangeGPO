'use server'

import { createClient } from '@/lib/supabase/server';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuv';

// --- ลงทะเบียนพนักงาน ---
export async function registerStaff(payload: any) {
  const supabase = await createClient();

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(payload.password, salt);
    const userRole = payload.department === 'manager' ? 'manager' : 'staff';

    const { error } = await supabase
      .from('staff_users')
      .insert([
        {
          employee_id: payload.employee_id,
          username: payload.username,
          password_hash: hashedPassword,
          full_name: payload.full_name,
          department: payload.department,
          is_approved: false,
          role: userRole
        }
      ]);

    if (error) {
      if (error.code === '23505') {
        throw new Error("Username หรือรหัสพนักงานนี้ถูกใช้งานแล้ว");
      }
      throw error;
    }
    return { success: true };
  } catch (error: any) {
    console.error("Staff Registration Error:", error);
    return { success: false, error: error.message };
  }
}

// --- ล็อกอินพนักงาน ---
export async function loginStaffAction(payload: any) {
  const supabase = await createClient();
  const { username, password } = payload;

  try {
    const { data: user, error } = await supabase
      .from('staff_users')
      .select('id, username, password_hash, role, is_approved, department')
      .eq('username', username)
      .single();

    // ข้อความเดียวกันไม่ว่า username หรือ password ผิด กัน user enumeration
    if (error || !user) {
      await bcrypt.compare(password, DUMMY_HASH); // กัน timing attack
      return { success: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return { success: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };

    if (!user.is_approved) return { success: false, error: "บัญชีนี้ยังไม่ได้รับการอนุมัติ" };

    // สร้าง session ใน DB แล้วเก็บแค่ token ไว้ใน cookie
    const { data: session, error: sessErr } = await supabaseAdmin
      .from('sessions')
      .insert({
        actor_type: 'staff',
        staff_id: user.id,
        expires_at: new Date(Date.now() + 60 * 60 * 8 * 1000).toISOString(),
      })
      .select('token')
      .single();

    if (sessErr || !session) return { success: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };

    const cookieStore = await cookies();
    cookieStore.set('staff_session', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8
    });

    return { success: true, role: user.role, department: user.department };
  } catch (error: any) {
    console.error("Login Error:", error);
    return { success: false, error: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ" };
  }
}

// --- อนุมัติพนักงาน ---
export async function approveStaff(staffId: string) {
  const session = await getStaffSession(); // query DB จริง แก้ cookie ไม่ได้ผลอีกต่อไป
  if (!session) return { success: false, error: "ไม่ได้ Login" };

  if (session.role !== 'manager') {
    return { success: false, error: "คุณไม่มีสิทธิ์ดำเนินการนี้" };
  }

  const { error } = await supabaseAdmin
    .from('staff_users')
    .update({ is_approved: true })
    .eq('id', staffId);

  return error ? { success: false, error: error.message } : { success: true };
}

// --- ดึงรายชื่อพนักงานที่รออนุมัติ ---
export async function getPendingStaff() {
  const session = await getStaffSession();
  if (!session || session.role !== 'manager') {
    return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" };
  }

  const { data, error } = await supabaseAdmin
    .from('staff_users')
    .select('*')
    .eq('is_approved', false);

  return error ? { success: false, error: error.message } : { success: true, data };
}

// --- ดึง Session (verify กับ DB จริงทุกครั้ง) ---
export async function getStaffSession() {
  const token = (await cookies()).get('staff_session')?.value;
  if (!token || !UUID_RE.test(token)) return null;

  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select('expires_at, staff_users!inner(id, username, role, department, is_approved)')
    .eq('token', token)
    .eq('actor_type', 'staff')
    .maybeSingle();

  if (error) {
    console.error('getStaffSession query error:', error);
    return null;
  }

  if (!data || new Date(data.expires_at) < new Date()) return null;

  // Normalize: บาง PostgREST version (โดยเฉพาะ self-host) คืน embedded relation
  // เป็น array แทน object แม้จะเป็น many-to-one ก็ตาม กันไว้ทั้งสองแบบ
  const staffUser = Array.isArray(data.staff_users)
    ? data.staff_users[0]
    : data.staff_users;

  if (!staffUser || !staffUser.is_approved) return null; // เช็คซ้ำเผื่อโดนถอนสิทธิ์ภายหลัง

  return {
    id: staffUser.id,
    username: staffUser.username,
    role: staffUser.role,
    department: staffUser.department,
  };
}

// --- ออกจากระบบ (ลบ session ออกจาก DB จริง) ---
export async function logoutStaffAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get('staff_session')?.value;
  if (token) await supabaseAdmin.from('sessions').delete().eq('token', token);
  cookieStore.delete('staff_session');
}