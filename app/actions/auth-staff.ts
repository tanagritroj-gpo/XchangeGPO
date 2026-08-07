'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import * as React from 'react';
import StaffPasswordResetEmail from '@/lib/emails/StaffPasswordResetEmail';
import { checkRateLimit } from '@/lib/rate-limit';
import { getErrorMessage } from '@/lib/error-message';

const resend = new Resend(process.env.RESEND_API_KEY);

function getClientIp(headerList: Headers): string {
  // รองรับทั้งกรณีอยู่หลัง proxy/CDN (Vercel, Cloudflare) และ self-host เปล่าๆ (nginx/traefik)
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = headerList.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuv';

interface StaffRegisterPayload {
  employee_id: string;
  username: string;
  password: string;
  full_name: string;
  department: string;
  sale_customer_types?: string | string[];
  sale_provinces?: string | string[];
  // ★ ทุกแผนกต้องกรอก — ใช้ทั้งส่ง OTP ตอน "ลืมรหัสผ่าน" (requestStaffPasswordReset) และ
  // แจ้งเตือน sale เมื่อลูกค้าในเขตที่ดูแลส่งใบงานเข้ามา
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- ลงทะเบียนพนักงาน ---
export async function registerStaff(payload: StaffRegisterPayload) {
  try {
    // ★ email บังคับทุกแผนกแล้ว (เดิมเฉพาะ sale) — เช็คซ้ำฝั่ง server แม้ client บังคับ
    // required ไว้แล้ว (กันกรณีเลี่ยงผ่าน form โดยตรง เหมือน pattern อื่นในระบบ)
    const email = payload.email?.trim();
    if (!email || !EMAIL_RE.test(email)) {
      return { success: false, error: 'กรุณากรอกอีเมลให้ถูกต้อง' };
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(payload.password, salt);
    const userRole = payload.department === 'manager' ? 'manager' : 'staff';

    // ขอบเขตดูแลของ sale — มีค่าเฉพาะ department 'sale' เท่านั้น (undefined สำหรับแผนกอื่น)
    const saleCustomerTypes = payload.department === 'sale'
      ? (Array.isArray(payload.sale_customer_types) ? payload.sale_customer_types : payload.sale_customer_types ? [payload.sale_customer_types] : [])
      : null;
    const saleProvinces = payload.department === 'sale'
      ? (Array.isArray(payload.sale_provinces) ? payload.sale_provinces : payload.sale_provinces ? [payload.sale_provinces] : [])
      : null;

    const { error } = await supabaseAdmin
      .from('staff_users')
      .insert([
        {
          employee_id: payload.employee_id,
          username: payload.username,
          password_hash: hashedPassword,
          full_name: payload.full_name,
          department: payload.department,
          is_approved: false,
          role: userRole,
          sale_customer_types: saleCustomerTypes,
          sale_provinces: saleProvinces,
          email,
        }
      ]);

    if (error) {
      if (error.code === '23505') {
        throw new Error("Username หรือรหัสพนักงานนี้ถูกใช้งานแล้ว");
      }
      throw error;
    }
    return { success: true };
  } catch (error: unknown) {
    console.error("Staff Registration Error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

// --- ล็อกอินพนักงาน ---
export async function loginStaffAction(payload: { username: string; password: string }) {
  const { username, password } = payload;

  try {
    const { data: user, error } = await supabaseAdmin
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
  } catch (error: unknown) {
    console.error("Login Error:", error);
    return { success: false, error: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ" };
  }
}

// --- อนุมัติพนักงาน ---
export async function approveStaff(staffId: string) {
  const session = await getStaffSession();
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
    .select('id, employee_id, full_name, department')
    .eq('is_approved', false);

  return error ? { success: false, error: error.message } : { success: true, data };
}

// --- ดึง Session (verify กับ DB จริงทุกครั้ง) ---
// เพิ่ม full_name เข้า select เพื่อให้หน้า hub/dashboard ต่างๆ แสดงชื่อจริงพนักงานแทน username ได้
export async function getStaffSession() {
  const token = (await cookies()).get('staff_session')?.value;
  if (!token || !UUID_RE.test(token)) return null;

  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select('expires_at, staff_users!inner(id, username, full_name, role, department, is_approved, sale_customer_types, sale_provinces, email)')
    .eq('token', token)
    .eq('actor_type', 'staff')
    .maybeSingle();

  if (error) {
    console.error('getStaffSession query error:', error);
    return null;
  }

  if (!data || new Date(data.expires_at) < new Date()) return null;

  const staffUser = Array.isArray(data.staff_users)
    ? data.staff_users[0]
    : data.staff_users;

  if (!staffUser || !staffUser.is_approved) return null;

  return {
    id: staffUser.id,
    username: staffUser.username,
    full_name: staffUser.full_name,
    role: staffUser.role,
    department: staffUser.department,
    sale_customer_types: staffUser.sale_customer_types as string[] | null,
    sale_provinces: staffUser.sale_provinces as string[] | null,
    email: staffUser.email as string | null,
  };
}

// --- ออกจากระบบ (ลบ session ออกจาก DB จริง) ---
export async function logoutStaffAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get('staff_session')?.value;
  if (token) await supabaseAdmin.from('sessions').delete().eq('token', token);
  cookieStore.delete('staff_session');
}

// ══ ลืมรหัสผ่าน — ใช้ otp_logs ตารางเดียวกับ OTP login ฝั่งลูกค้า (auth-actions.ts) แต่
// ระบุตัวด้วย username แทนอีเมล (staff login ด้วย username เป็นหลัก ไม่ใช่ทุกคนจำอีเมล
// ตัวเองได้) แล้วค่อยไปหาอีเมลที่ผูกกับ username นั้นเพื่อส่ง OTP ══

function hashOtp(otp: string) {
  return crypto.createHash('sha256').update(otp + process.env.OTP_PEPPER).digest('hex');
}

// 1. ขอ OTP สำหรับตั้งรหัสผ่านใหม่ — ตอบผลเหมือนกันเสมอไม่ว่าจะเจอ username/มีอีเมล/
// approved หรือไม่ กัน username enumeration (pattern เดียวกับ requestCustomerPasswordReset ฝั่งลูกค้า)
export async function requestStaffPasswordReset(username: string) {
  const cleanUsername = username?.trim();
  if (!cleanUsername) return { success: false, error: 'กรุณากรอก Username' };

  const rateLimit = await checkRateLimit(`staff-pwreset-request:${cleanUsername}`, 3, 300);
  if (!rateLimit.allowed) return { success: false, error: 'ขอรหัสถี่เกินไป กรุณารอสักครู่' };

  const { data: staff } = await supabaseAdmin
    .from('staff_users')
    .select('email, is_approved')
    .eq('username', cleanUsername)
    .maybeSingle();

  if (staff?.email && staff.is_approved) {
    const otp = crypto.randomInt(100000, 999999).toString();
    await supabaseAdmin.from('otp_logs').insert({
      email: staff.email,
      otp_hash: hashOtp(otp),
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      used: false,
    });

    const emailHtml = await render(React.createElement(StaffPasswordResetEmail, { otp }));
    await resend.emails.send({
      from: 'GPO Xchange <onboarding@resend.dev>',
      to: staff.email,
      subject: 'รหัส OTP สำหรับตั้งรหัสผ่านใหม่ — GPO Xchange Staff Portal',
      html: emailHtml,
    });
  }

  return { success: true };
}

// 2. ยืนยัน OTP + ตั้งรหัสผ่านใหม่ — สำเร็จแล้วเพิกถอน session staff เดิมทั้งหมดของบัญชีนี้
// (กันเคสอุปกรณ์หาย/ถูกขโมยที่มักเป็นสาเหตุให้มาลืมรหัสผ่านตั้งแต่แรก)
export async function resetStaffPassword(username: string, otp: string, newPassword: string) {
  try {
    const cleanUsername = username?.trim();
    if (!cleanUsername) return { success: false, error: 'กรุณากรอก Username' };
    if (!/^\d{6}$/.test(otp?.trim() ?? '')) return { success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' };
    if (!newPassword || newPassword.length < 6) return { success: false, error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' };
    const cleanOtp = otp.trim();

    const rateLimit = await checkRateLimit(`staff-pwreset-verify:${cleanUsername}`, 5, 300);
    if (!rateLimit.allowed) return { success: false, error: 'ลองยืนยันถี่เกินไป กรุณารอสักครู่' };

    const { data: staff } = await supabaseAdmin
      .from('staff_users')
      .select('id, email')
      .eq('username', cleanUsername)
      .maybeSingle();

    // ข้อความกลางๆ เดียวกับตอน OTP ผิด กันเดาว่า username นี้มีอีเมลผูกอยู่ไหม
    if (!staff?.email) return { success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' };

    const { data: log } = await supabaseAdmin
      .from('otp_logs')
      .select('id, otp_hash, expires_at, used')
      .eq('email', staff.email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!log || log.used || new Date(log.expires_at) < new Date()) {
      return { success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' };
    }
    if (hashOtp(cleanOtp) !== log.otp_hash) {
      return { success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' };
    }

    await supabaseAdmin.from('otp_logs').update({ used: true }).eq('id', log.id);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const { error: updateErr } = await supabaseAdmin
      .from('staff_users')
      .update({ password_hash: hashedPassword, updated_at: new Date().toISOString() })
      .eq('id', staff.id);

    if (updateErr) return { success: false, error: 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาลองใหม่' };

    await supabaseAdmin.from('sessions').delete().eq('staff_id', staff.id).eq('actor_type', 'staff');

    const ip = getClientIp(await headers());
    await supabaseAdmin.from('staff_password_reset_logs').insert({ staff_id: staff.id, ip });

    return { success: true };
  } catch (error: unknown) {
    console.error('Staff Password Reset Error:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}