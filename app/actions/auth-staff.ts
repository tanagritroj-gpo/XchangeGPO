'use server'

import { createClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

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

// --- ล็อกอินพนักงาน (ปรับปรุง: ส่ง department กลับไปให้หน้า Login ด้วย) ---
export async function loginStaffAction(payload: any) {
  const supabase = await createClient();
  const { username, password } = payload;

  try {
    // เพิ่มการ select 'department' เข้าไปครับ
    const { data: user, error } = await supabase
      .from('staff_users')
      .select('id, username, password_hash, role, is_approved, department')
      .eq('username', username)
      .single();

    if (error || !user) return { success: false, error: "ไม่พบผู้ใช้นี้ในระบบ" };
    if (!user.is_approved) return { success: false, error: "บัญชีนี้ยังไม่ได้รับการอนุมัติ" };

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return { success: false, error: "รหัสผ่านไม่ถูกต้อง" };

    // สร้าง Session
    const cookieStore = await cookies();
    cookieStore.set('staff_session', JSON.stringify({
      id: user.id,
      username: user.username,
      role: user.role,
      department: user.department // เก็บ department ไว้ใน session ด้วย
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8 
    });

    // ส่ง role และ department กลับไปให้หน้า Login ใช้ทำ routing
    return { success: true, role: user.role, department: user.department };
  } catch (error: any) {
    console.error("Login Error:", error);
    return { success: false, error: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ" };
  }
}

// --- อนุมัติพนักงาน ---
export async function approveStaff(staffId: string) {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('staff_session');

  if (!sessionCookie) return { success: false, error: "ไม่ได้ Login" };

  const session = JSON.parse(sessionCookie.value);
  if (session.role !== 'manager') {
    return { success: false, error: "คุณไม่มีสิทธิ์ดำเนินการนี้" };
  }

  const { error } = await supabase
    .from('staff_users')
    .update({ is_approved: true })
    .eq('id', staffId);

  return error ? { success: false, error: error.message } : { success: true };
}

// --- ดึงรายชื่อพนักงานที่รออนุมัติ ---
export async function getPendingStaff() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('staff_users')
    .select('*')
    .eq('is_approved', false);

  return error ? { success: false, error: error.message } : { success: true, data };
}