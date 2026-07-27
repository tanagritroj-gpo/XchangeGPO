'use server';

import crypto from 'crypto';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import * as React from 'react';
import OTPEmail from '@/lib/emails/OTPEmail';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';

const resend = new Resend(process.env.RESEND_API_KEY);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EmailSchema = z.string().trim().min(1, 'กรุณากรอกอีเมล').email('รูปแบบอีเมลไม่ถูกต้อง');
const OtpSchema = z.string().trim().regex(/^\d{6}$/, 'รหัส OTP ต้องเป็นตัวเลข 6 หลัก');

function hashOtp(otp: string) {
  return crypto.createHash('sha256').update(otp + process.env.OTP_PEPPER).digest('hex');
}

// สร้าง session จริงของแอป (ตาราง `sessions` + cookie httpOnly) ให้ลูกค้าที่ยืนยันตัวตนแล้ว
// ใช้ร่วมกันทั้ง verifyOTP และ loginCustomerByVerifiedEmail (Google OAuth) เพื่อให้มี
// จุดเดียวที่ออก session จริงของระบบ ไม่กระจายลอจิกซ้ำ
async function createCustomerSession(customerId: number) {
  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .insert({
      actor_type: 'customer',
      customer_id: customerId,
      expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    })
    .select('token')
    .single();

  if (error || !session) return false;

  (await cookies()).set('customer_session', session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600,
    path: '/',
  });

  return true;
}

// ล็อกอินลูกค้าด้วยอีเมลที่ยืนยันตัวตนแล้วจากภายนอก (เช่น Google OAuth ผ่าน Supabase Auth)
// เจตนา: ผูก "identity ที่ verify แล้ว" เข้ากับ session จริงของแอปทันที ไม่ปล่อยให้ Supabase
// Auth session ค้างอยู่คู่ขนาน — ต้องเป็นอีเมลที่ตรงกับ b2b_customers ที่ CSR อนุมัติแล้วเท่านั้น
// (สอดคล้องกับโมเดล approval-gated เดียวกับ flow OTP ปกติ ไม่เปิดให้สมัครอัตโนมัติผ่าน Google)
export async function loginCustomerByVerifiedEmail(email: string) {
  const parsedEmail = EmailSchema.safeParse(email);
  if (!parsedEmail.success) {
    return { success: false, error: 'อีเมลจากบัญชี Google ไม่ถูกต้อง' };
  }
  const cleanEmail = parsedEmail.data;

  const { data: customer } = await supabaseAdmin
    .from('b2b_customers').select('id').eq('email', cleanEmail).maybeSingle();

  if (!customer) {
    return { success: false, error: 'ไม่พบบัญชีลูกค้าที่ผูกกับอีเมลนี้ กรุณาลงทะเบียนหรือเข้าสู่ระบบด้วย OTP ก่อน' };
  }

  const created = await createCustomerSession(customer.id);
  if (!created) return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };

  return { success: true };
}

// 1. ส่ง OTP
export async function sendOTP(email: string) {
  // ★ เช็ค format ก่อนทุกอย่าง — ไม่เกี่ยวกับ enumeration เพราะยังไม่ได้ query ว่ามี/ไม่มีในระบบ
  const parsedEmail = EmailSchema.safeParse(email);
  if (!parsedEmail.success) {
    return { 
  success: false, 
  error: parsedEmail.error.flatten().formErrors[0] || 'กรุณากรอกอีเมลให้ถูกต้อง' 
};
  }
  const cleanEmail = parsedEmail.data;

  // แก้แล้ว: (1) สลับ param ให้ตรง signature จริง (key, limit, windowSeconds)
  // เดิมเขียน (key, 300, 3) = ตีความว่า limit 300 ครั้ง/3 วิ ผิดจากที่ตั้งใจ
  // (2) เข้าถึง .allowed จาก object ผลลัพธ์ — เดิมเช็ค `if (!allowed)` ทั้งที่
  // allowed เป็น object ทั้งก้อน (truthy เสมอ) ทำให้ไม่เคยบล็อกอะไรเลย
  const rateLimit = await checkRateLimit(`otp-request:${cleanEmail}`, 3, 300);
  if (!rateLimit.allowed) return { success: false, error: 'ขอ OTP ถี่เกินไป กรุณารอสักครู่' };

  const { data: customer } = await supabaseAdmin
    .from('b2b_customers').select('id').eq('email', cleanEmail).maybeSingle();

  // ★ ทำงานเหมือนกันไม่ว่าจะเจอ customer หรือไม่ กัน email enumeration
  //   (จุดนี้เท่านั้นที่ตั้งใจตอบกำกวม เพราะ format ผ่านการเช็คไปแล้วข้างต้น)
  if (customer) {
    const otp = crypto.randomInt(100000, 999999).toString();
    await supabaseAdmin.from('otp_logs').insert({
      email: cleanEmail,
      otp_hash: hashOtp(otp),
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      used: false,
    });

    const emailHtml = await render(React.createElement(OTPEmail, { otp }));
    await resend.emails.send({
      from: 'GPO Xchange <onboarding@resend.dev>',
      to: cleanEmail,
      subject: 'รหัส OTP ยืนยันการเข้าใช้งานระบบ Xchange',
      html: emailHtml,
    });
  }

  return { success: true };
}

// 2. ยืนยัน OTP
export async function verifyOTP(email: string, otp: string) {
  const parsedEmail = EmailSchema.safeParse(email);
  if (!parsedEmail.success) {
    return { success: false, error: 'กรุณากรอกอีเมลให้ถูกต้อง' };
  }
  const cleanEmail = parsedEmail.data;

  const parsedOtp = OtpSchema.safeParse(otp);
  if (!parsedOtp.success) {
    return { success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' }; // ข้อความกลางๆ กันเดา format
  }
  const cleanOtp = parsedOtp.data;

  // แก้แล้วเหมือนกับ sendOTP ด้านบน — สลับ param + เข้าถึง .allowed จริงๆ
  const rateLimit = await checkRateLimit(`otp-verify:${cleanEmail}`, 5, 300);
  if (!rateLimit.allowed) return { success: false, error: 'ลองยืนยันถี่เกินไป กรุณารอสักครู่' };

  const { data: log } = await supabaseAdmin
    .from('otp_logs')
    .select('id, otp_hash, expires_at, used')
    .eq('email', cleanEmail)
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

  const { data: customer } = await supabaseAdmin
    .from('b2b_customers').select('id').eq('email', cleanEmail).single();

  const created = await createCustomerSession(customer!.id);
  if (!created) return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };

  return { success: true };
}

// 3. ดึง Session — verify ผ่าน DB จริง ไม่ parse cookie ตรง
export async function getCustomerSession() {
  const token = (await cookies()).get('customer_session')?.value;
  if (!token || !UUID_RE.test(token)) return null;

  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select('expires_at, b2b_customers!inner(id, email, hospital_name, contact_name, customer_code, phone, position)')
    .eq('token', token)
    .eq('actor_type', 'customer')
    .maybeSingle();

  if (error) {
    console.error('getCustomerSession query error:', error);
    return null;
  }

  if (!data || new Date(data.expires_at) < new Date()) {
    await logoutCustomer();
    return null;
  }

  const customer = Array.isArray(data.b2b_customers)
    ? data.b2b_customers[0]
    : data.b2b_customers;

  if (!customer) return null;

  return customer;
}

// 4. Logout — ลบ session ออกจาก DB จริง ไม่ใช่แค่ลบ cookie ฝั่งเดียว
export async function logoutCustomer() {
  const cookieStore = await cookies();
  const token = cookieStore.get('customer_session')?.value;
  if (token) await supabaseAdmin.from('sessions').delete().eq('token', token);
  cookieStore.delete('customer_session');
}