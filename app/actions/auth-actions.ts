'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { cookies, headers } from 'next/headers';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import * as React from 'react';
import CustomerPasswordResetEmail from '@/lib/emails/CustomerPasswordResetEmail';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { getErrorMessage } from '@/lib/error-message';

const resend = new Resend(process.env.RESEND_API_KEY);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuv';

// ★ .toLowerCase() ต่อจาก .trim() เสมอ — กันเคส email ตัวพิมพ์ต่างกัน (เช่น Google OAuth
// คืน "John@Gmail.com" แต่ตอนลงทะเบียนกรอก "john@gmail.com") ทำให้ login ล้มเหลวทั้งที่เป็น
// บัญชีเดียวกัน เนื่องจากทุกจุด lookup (login, Google callback, password reset) ผ่าน schema
// นี้จุดเดียว การ normalize ตรงนี้จุดเดียวจึงครอบคลุมทั้งหมด — คู่กับ RegisterSchema.email ใน
// auth.ts ที่ normalize ฝั่งบันทึกข้อมูลใหม่ด้วยเช่นกัน (ข้อมูลเดิมใน DB ตรวจแล้วเป็น lowercase
// อยู่แล้วทุกแถว ไม่ต้อง backfill)
const EmailSchema = z.string().trim().min(1, 'กรุณากรอกอีเมล').toLowerCase().email('รูปแบบอีเมลไม่ถูกต้อง');

function getClientIp(headerList: Headers): string {
  // รองรับทั้งกรณีอยู่หลัง proxy/CDN (Vercel, Cloudflare) และ self-host เปล่าๆ (nginx/traefik)
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = headerList.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

function hashOtp(otp: string) {
  return crypto.createHash('sha256').update(otp + process.env.OTP_PEPPER).digest('hex');
}

// สร้าง session จริงของแอป (ตาราง `sessions` + cookie httpOnly) ให้ลูกค้าที่ยืนยันตัวตนแล้ว
// ใช้ร่วมกันทั้ง loginCustomerAction และ loginCustomerByVerifiedEmail (Google OAuth) เพื่อให้มี
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
// (สอดคล้องกับโมเดล approval-gated เดียวกัน ไม่เปิดให้สมัครอัตโนมัติผ่าน Google) — ทางเลือก
// เดิมที่ยังคงไว้คู่กับ login ด้วย email+password ด้านล่าง
export async function loginCustomerByVerifiedEmail(email: string) {
  const parsedEmail = EmailSchema.safeParse(email);
  if (!parsedEmail.success) {
    return { success: false, error: 'อีเมลจากบัญชี Google ไม่ถูกต้อง' };
  }
  const cleanEmail = parsedEmail.data;

  const { data: customer } = await supabaseAdmin
    .from('b2b_customers').select('id').eq('email', cleanEmail).maybeSingle();

  if (!customer) {
    return { success: false, error: 'ไม่พบบัญชีลูกค้าที่ผูกกับอีเมลนี้ กรุณาลงทะเบียนหรือเข้าสู่ระบบด้วยรหัสผ่านก่อน' };
  }

  const created = await createCustomerSession(customer.id);
  if (!created) return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };

  return { success: true };
}

// ล็อกอินลูกค้าด้วย email (ใช้เป็น username) + รหัสผ่าน — แทนที่ flow OTP เดิม ใช้ pattern
// เดียวกับ loginStaffAction (bcrypt.compare กับ DUMMY_HASH ตอนไม่เจอบัญชี กัน timing attack,
// ข้อความ error กลางๆ เดียวกันไม่ว่าจะ email หรือ password ผิด กัน enumeration)
export async function loginCustomerAction(payload: { email: string; password: string }) {
  const parsedEmail = EmailSchema.safeParse(payload.email);
  if (!parsedEmail.success || !payload.password) {
    return { success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
  }
  const cleanEmail = parsedEmail.data;

  // ★ กันเดารหัสผ่านรัว — เดิมมีแค่ bcrypt กับ DUMMY_HASH (กัน timing attack) แต่ไม่มี cap
  // จำนวนครั้งเลย ต่างจากทุกจุด auth อื่นในระบบ (พบระหว่าง security audit 7 ส.ค. 2569)
  //
  // ★★ เพิ่ม IP-based limit คู่กับของเดิม (พบระหว่าง security audit 11 ส.ค. 2569) — ของเดิม
  // ผูกกับ email เดียวเท่านั้น กันแค่ "เดารหัสผ่านซ้ำกับบัญชีเดียว" ไม่กัน credential
  // stuffing ที่กระจายยิงหลายอีเมลพร้อมกันจาก IP เดียว (เช่น บอทลองรหัสผ่านที่หลุดจากที่อื่น
  // ไล่ทีละอีเมลๆ ละไม่กี่ครั้ง หลบ cap ต่อบัญชีได้สบายๆ) เพดานตั้งกว้างกว่าของเดิม (20 vs 10)
  // เพราะ IP เดียวอาจมีผู้ใช้จริงหลายคน (เช่น รพ./ร้านยาที่ใช้ NAT เดียวกัน) ไม่อยากบล็อก
  // คนปกติเกินจำเป็น เช็คก่อน per-email เพราะเป็นเกราะกว้างกว่า
  const ip = getClientIp(await headers());
  const ipRateLimit = await checkRateLimit(`login-customer-ip:${ip}`, 20, 300);
  if (!ipRateLimit.allowed) return { success: false, error: 'เข้าสู่ระบบถี่เกินไป กรุณารอสักครู่' };

  const rateLimit = await checkRateLimit(`login-customer:${cleanEmail}`, 10, 300);
  if (!rateLimit.allowed) return { success: false, error: 'เข้าสู่ระบบถี่เกินไป กรุณารอสักครู่' };

  const { data: customer, error } = await supabaseAdmin
    .from('b2b_customers')
    .select('id, password_hash')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (error || !customer || !customer.password_hash) {
    await bcrypt.compare(payload.password, DUMMY_HASH); // กัน timing attack
    return { success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
  }

  const isMatch = await bcrypt.compare(payload.password, customer.password_hash);
  if (!isMatch) return { success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };

  const created = await createCustomerSession(customer.id);
  if (!created) return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };

  return { success: true };
}

// ══ ลืมรหัสผ่าน (ลูกค้า) — ใช้ otp_logs ตารางเดียวกับ staff (auth-staff.ts) แต่ระบุตัวด้วย
// email ตรงๆ (ไม่ต้องมี username→email lookup เหมือน staff เพราะลูกค้า login ด้วย email
// โดยตรงอยู่แล้ว) ══

// 1. ขอ OTP สำหรับตั้งรหัสผ่านใหม่ — ตอบผลเหมือนกันเสมอไม่ว่าจะเจอบัญชีที่ผูกกับอีเมลนี้
// หรือไม่ กัน email enumeration
export async function requestCustomerPasswordReset(email: string) {
  const parsedEmail = EmailSchema.safeParse(email);
  if (!parsedEmail.success) return { success: false, error: 'กรุณากรอกอีเมลให้ถูกต้อง' };
  const cleanEmail = parsedEmail.data;

  const rateLimit = await checkRateLimit(`customer-pwreset-request:${cleanEmail}`, 3, 300);
  if (!rateLimit.allowed) return { success: false, error: 'ขอรหัสถี่เกินไป กรุณารอสักครู่' };

  const { data: customer } = await supabaseAdmin
    .from('b2b_customers')
    .select('id')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (customer) {
    const otp = crypto.randomInt(100000, 999999).toString();
    await supabaseAdmin.from('otp_logs').insert({
      email: cleanEmail,
      otp_hash: hashOtp(otp),
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      used: false,
    });

    const emailHtml = await render(React.createElement(CustomerPasswordResetEmail, { otp }));
    await resend.emails.send({
      from: 'GPO Xchange <onboarding@resend.dev>',
      to: cleanEmail,
      subject: 'รหัส OTP สำหรับตั้งรหัสผ่านใหม่ — GPO Xchange Portal',
      html: emailHtml,
    });
  }

  return { success: true };
}

// 2. ยืนยัน OTP + ตั้งรหัสผ่านใหม่ — สำเร็จแล้วเพิกถอน session ลูกค้าเดิมทั้งหมดของบัญชีนี้
export async function resetCustomerPassword(email: string, otp: string, newPassword: string) {
  try {
    const parsedEmail = EmailSchema.safeParse(email);
    if (!parsedEmail.success) return { success: false, error: 'กรุณากรอกอีเมลให้ถูกต้อง' };
    const cleanEmail = parsedEmail.data;
    if (!/^\d{6}$/.test(otp?.trim() ?? '')) return { success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' };
    if (!newPassword || newPassword.length < 6) return { success: false, error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' };
    const cleanOtp = otp.trim();

    const rateLimit = await checkRateLimit(`customer-pwreset-verify:${cleanEmail}`, 5, 300);
    if (!rateLimit.allowed) return { success: false, error: 'ลองยืนยันถี่เกินไป กรุณารอสักครู่' };

    const { data: customer } = await supabaseAdmin
      .from('b2b_customers')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    // ข้อความกลางๆ เดียวกับตอน OTP ผิด กันเดาว่า email นี้มีบัญชีลูกค้าอยู่ไหม
    if (!customer) return { success: false, error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' };

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

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const { error: updateErr } = await supabaseAdmin
      .from('b2b_customers')
      .update({ password_hash: hashedPassword })
      .eq('id', customer.id);

    if (updateErr) return { success: false, error: 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาลองใหม่' };

    await supabaseAdmin.from('sessions').delete().eq('customer_id', customer.id).eq('actor_type', 'customer');

    const ip = getClientIp(await headers());
    await supabaseAdmin.from('customer_password_reset_logs').insert({ customer_id: customer.id, ip });

    return { success: true };
  } catch (error: unknown) {
    console.error('Customer Password Reset Error:', error);
    Sentry.captureException(error, { tags: { area: 'customer-password-reset' } });
    return { success: false, error: getErrorMessage(error) };
  }
}

// ดึง Session — verify ผ่าน DB จริง ไม่ parse cookie ตรง
export async function getCustomerSession() {
  const token = (await cookies()).get('customer_session')?.value;
  if (!token || !UUID_RE.test(token)) return null;

  // hospital_name/customer_code/province join ผ่าน organizations เสมอ (เจ้าของข้อมูล
  // ระดับหน่วยงานตัวจริง) ไม่ได้อ่านคอลัมน์ที่ mirror ไว้บน b2b_customers ตรงๆ อีกต่อไป
  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select('expires_at, b2b_customers!inner(id, email, contact_name, phone, position, organizations!inner(hospital_name, customer_code, province))')
    .eq('token', token)
    .eq('actor_type', 'customer')
    .maybeSingle();

  if (error) {
    console.error('getCustomerSession query error:', error);
    // ★ จุดสำคัญมาก — เรียกทุกหน้าที่ต้อง login ถ้าพังแปลว่าลูกค้าทุกคนหลุด session
    // พร้อมกันทั้งระบบ ควรรู้ทันที ไม่ใช่รอมีคนมาแจ้ง
    Sentry.captureException(error, { level: 'fatal', tags: { area: 'customer-session' } });
    return null;
  }

  if (!data || new Date(data.expires_at) < new Date()) {
    console.warn('getCustomerSession: no matching session, logging out', {
      tokenPrefix: token.slice(0, 8),
      found: !!data,
      expiresAt: data?.expires_at ?? null,
    });
    await logoutCustomer();
    return null;
  }

  const customerRow = Array.isArray(data.b2b_customers)
    ? data.b2b_customers[0]
    : data.b2b_customers;

  if (!customerRow) return null;

  // แบน organizations ที่ join มาให้เป็น field เดิม (hospital_name/customer_code/province)
  // เพื่อไม่ต้องแก้ shape ที่ทุกหน้าฝั่งลูกค้าคาดหวังไว้จาก session นี้
  const organization = Array.isArray(customerRow.organizations)
    ? customerRow.organizations[0]
    : customerRow.organizations;
  const { organizations: _omit, ...customerRest } = customerRow;

  return {
    ...customerRest,
    hospital_name: organization?.hospital_name ?? null,
    customer_code: organization?.customer_code ?? null,
    province: organization?.province ?? null,
  };
}

// Logout — ลบ session ออกจาก DB จริง ไม่ใช่แค่ลบ cookie ฝั่งเดียว
export async function logoutCustomer() {
  const cookieStore = await cookies();
  const token = cookieStore.get('customer_session')?.value;
  if (token) await supabaseAdmin.from('sessions').delete().eq('token', token);
  cookieStore.delete('customer_session');
}
