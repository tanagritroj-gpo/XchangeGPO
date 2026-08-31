'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { cookies, headers } from 'next/headers';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/get-client-ip';
import { assertPasswordAllowed, isPasswordBreached } from '@/lib/password-policy';
import { lockStatus, lockedMessage, recordFailure, lockDurationMinutes, CLEARED } from '@/lib/account-lockout';
import { getErrorMessage } from '@/lib/error-message';
import { sendCustomerOtpEmail, sendAccountLockedEmail, sendSecurityAlertEmail } from '@/lib/email-service';
import { recordLoginLocation, touchSessionLastSeen } from '@/lib/known-login';
import { parseDeviceLabel, sessionShortId } from '@/lib/device';
import { logAuditEvent } from '@/lib/audit';

const nowThai = () => new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

// เมื่อ login ลูกค้าสำเร็จ — audit, บันทึกตำแหน่ง, แจ้งอีเมลถ้าเป็นตำแหน่งที่ไม่เคยเห็น
async function afterCustomerLogin(
  customer: { id: number; email: string | null },
  ctx: { ip: string; userAgent?: string | null; method: 'password' | 'google' },
) {
  const actor = { type: 'customer' as const, id: customer.id, label: customer.email ?? null };
  void logAuditEvent({
    category: 'auth', action: 'auth.login.success', outcome: 'success',
    actor, ip: ctx.ip, userAgent: ctx.userAgent, detail: { method: ctx.method },
  });
  try {
    const { isNewLocation } = await recordLoginLocation({ type: 'customer', id: customer.id }, ctx.ip);
    if (isNewLocation) {
      void logAuditEvent({
        category: 'auth', action: 'auth.new_location', actor, ip: ctx.ip, userAgent: ctx.userAgent,
      });
      if (customer.email) {
        sendSecurityAlertEmail({
          to: customer.email,
          action: 'เข้าสู่ระบบจากอุปกรณ์/สถานที่ใหม่',
          whenText: nowThai(),
          ip: ctx.ip,
          detail: 'หากไม่ใช่คุณ กรุณาเปลี่ยนรหัสผ่านทันที',
        }).catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'security-alert-email' } }));
      }
    }
  } catch (e) {
    Sentry.captureException(e, { level: 'warning', tags: { area: 'known-login' } });
  }
}

function auditCustomerLoginFailure(ctx: { ip: string; userAgent?: string | null; reason: string; customerId?: number }) {
  void logAuditEvent({
    category: 'auth', action: 'auth.login.failure', outcome: 'failure',
    actor: ctx.customerId ? { type: 'customer', id: ctx.customerId } : { type: 'anon' },
    ip: ctx.ip, userAgent: ctx.userAgent, detail: { reason: ctx.reason },
  });
}

// remember-me: ไม่ติ๊ก = 8 ชม. / ติ๊ก = 30 วัน (ยืนยันโดยผู้ใช้ 28 ส.ค. 2569)
const CUSTOMER_SESSION_SECONDS = 8 * 60 * 60;
const CUSTOMER_REMEMBER_SECONDS = 30 * 24 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuv';

// ★ .toLowerCase() ต่อจาก .trim() เสมอ — กันเคส email ตัวพิมพ์ต่างกัน (เช่น Google OAuth
// คืน "John@Gmail.com" แต่ตอนลงทะเบียนกรอก "john@gmail.com") ทำให้ login ล้มเหลวทั้งที่เป็น
// บัญชีเดียวกัน เนื่องจากทุกจุด lookup (login, Google callback, password reset) ผ่าน schema
// นี้จุดเดียว การ normalize ตรงนี้จุดเดียวจึงครอบคลุมทั้งหมด — คู่กับ RegisterSchema.email ใน
// auth.ts ที่ normalize ฝั่งบันทึกข้อมูลใหม่ด้วยเช่นกัน (ข้อมูลเดิมใน DB ตรวจแล้วเป็น lowercase
// อยู่แล้วทุกแถว ไม่ต้อง backfill)
const EmailSchema = z.string().trim().min(1, 'กรุณากรอกอีเมล').toLowerCase().email('รูปแบบอีเมลไม่ถูกต้อง');

function hashOtp(otp: string) {
  return crypto.createHash('sha256').update(otp + process.env.OTP_PEPPER).digest('hex');
}

// สร้าง session จริงของแอป (ตาราง `sessions` + cookie httpOnly) ให้ลูกค้าที่ยืนยันตัวตนแล้ว
// ใช้ร่วมกันทั้ง loginCustomerAction และ loginCustomerByVerifiedEmail (Google OAuth) เพื่อให้มี
// จุดเดียวที่ออก session จริงของระบบ ไม่กระจายลอจิกซ้ำ
async function createCustomerSession(customerId: number, opts: { remember?: boolean } = {}) {
  const ttlSeconds = opts.remember ? CUSTOMER_REMEMBER_SECONDS : CUSTOMER_SESSION_SECONDS;
  const h = await headers();

  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .insert({
      actor_type: 'customer',
      customer_id: customerId,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      user_agent: h.get('user-agent'),
      ip: getClientIp(h),
      last_seen_at: new Date().toISOString(),
    })
    .select('token')
    .single();

  if (error || !session) return false;

  (await cookies()).set('customer_session', session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ttlSeconds,
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
    .from('b2b_customers').select('id, access_expires_at, cancelled_at').eq('email', cleanEmail).maybeSingle();

  if (!customer) {
    return { success: false, error: 'ไม่พบบัญชีลูกค้าที่ผูกกับอีเมลนี้ กรุณาลงทะเบียนหรือเข้าสู่ระบบด้วยรหัสผ่านก่อน' };
  }

  // ★ อายุการใช้งานบัญชี 2 ปีนับจากวันอนุมัติ + สวิตช์ "ยกเลิกลูกค้า" ที่ CSR คุมเอง — เช็คก่อน
  // สร้าง session เสมอ ไม่ว่าจะ login ทางไหน (คู่กับเช็คเดียวกันใน loginCustomerAction ด้านล่าง
  // และ getCustomerSession() ที่เช็คซ้ำทุกครั้งที่โหลดหน้า กัน session เก่าที่ออกไปก่อนหมดอายุ)
  if (customer.cancelled_at) {
    return { success: false, error: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อเจ้าหน้าที่' };
  }
  if (new Date(customer.access_expires_at) < new Date()) {
    return { success: false, error: 'บัญชีหมดอายุการใช้งาน กรุณาติดต่อเจ้าหน้าที่เพื่อต่ออายุ' };
  }

  // Google OAuth — ยืนยันตัวตนแล้ว ไม่มี checkbox "จดจำ" ใน flow นี้ → session 8 ชม.
  const created = await createCustomerSession(customer.id);
  if (!created) return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };

  const gHdrs = await headers();
  await afterCustomerLogin(
    { id: customer.id, email: cleanEmail },
    { ip: getClientIp(gHdrs), userAgent: gHdrs.get('user-agent'), method: 'google' },
  );
  return { success: true };
}

// ล็อกอินลูกค้าด้วย email (ใช้เป็น username) + รหัสผ่าน — แทนที่ flow OTP เดิม ใช้ pattern
// เดียวกับ loginStaffAction (bcrypt.compare กับ DUMMY_HASH ตอนไม่เจอบัญชี กัน timing attack,
// ข้อความ error กลางๆ เดียวกันไม่ว่าจะ email หรือ password ผิด กัน enumeration)
export async function loginCustomerAction(payload: { email: string; password: string; remember?: boolean }) {
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
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const ua = hdrs.get('user-agent');
  const ipRateLimit = await checkRateLimit(`login-customer-ip:${ip}`, 20, 300);
  if (!ipRateLimit.allowed) {
    auditCustomerLoginFailure({ ip, userAgent: ua, reason: 'rate_limited' });
    return { success: false, error: 'เข้าสู่ระบบถี่เกินไป กรุณารอสักครู่' };
  }

  const rateLimit = await checkRateLimit(`login-customer:${cleanEmail}`, 10, 300);
  if (!rateLimit.allowed) {
    auditCustomerLoginFailure({ ip, userAgent: ua, reason: 'rate_limited' });
    return { success: false, error: 'เข้าสู่ระบบถี่เกินไป กรุณารอสักครู่' };
  }

  const { data: customer, error } = await supabaseAdmin
    .from('b2b_customers')
    .select('id, email, password_hash, access_expires_at, cancelled_at, failed_login_count, locked_until')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (error || !customer || !customer.password_hash) {
    await bcrypt.compare(payload.password, DUMMY_HASH); // กัน timing attack
    auditCustomerLoginFailure({ ip, userAgent: ua, reason: 'no_account' });
    return { success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
  }

  // ★ Account lockout (audit §P1-4)
  const lock = lockStatus(customer.locked_until);
  if (lock.locked) {
    await bcrypt.compare(payload.password, DUMMY_HASH);
    auditCustomerLoginFailure({ ip, userAgent: ua, reason: 'locked', customerId: customer.id });
    return { success: false, error: lockedMessage(lock.minutesLeft) };
  }

  const isMatch = await bcrypt.compare(payload.password, customer.password_hash);
  if (!isMatch) {
    const f = recordFailure(customer.failed_login_count ?? 0);
    await supabaseAdmin.from('b2b_customers')
      .update({ failed_login_count: f.failed_login_count, locked_until: f.locked_until })
      .eq('id', customer.id);
    auditCustomerLoginFailure({ ip, userAgent: ua, reason: 'bad_password', customerId: customer.id });
    if (f.justLocked) {
      void logAuditEvent({
        category: 'auth', action: 'auth.lockout.triggered',
        actor: { type: 'customer', id: customer.id, label: customer.email },
        ip, userAgent: ua,
        detail: { minutes: lockDurationMinutes(f.failed_login_count), failed_count: f.failed_login_count },
      });
      if (customer.email) {
        sendAccountLockedEmail({
          to: customer.email, minutesLocked: lockDurationMinutes(f.failed_login_count), whenText: nowThai(), ip,
        }).catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'account-locked-email' } }));
      }
    }
    return { success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
  }

  // ★ อายุการใช้งานบัญชี 2 ปีนับจากวันอนุมัติ + สวิตช์ "ยกเลิกลูกค้า" ที่ CSR คุมเอง — เช็คหลัง
  // ยืนยันรหัสผ่านถูกต้องแล้วเท่านั้น (ไม่เปิดช่องให้เดาได้ว่าอีเมลนี้มีบัญชีอยู่ไหมจากข้อความ
  // error ที่ต่างกัน) คู่กับเช็คเดียวกันใน loginCustomerByVerifiedEmail ด้านบน และ
  // getCustomerSession() ที่เช็คซ้ำทุกครั้งที่โหลดหน้า
  if (customer.cancelled_at) {
    return { success: false, error: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อเจ้าหน้าที่' };
  }
  if (new Date(customer.access_expires_at) < new Date()) {
    return { success: false, error: 'บัญชีหมดอายุการใช้งาน กรุณาติดต่อเจ้าหน้าที่เพื่อต่ออายุ' };
  }

  // login สำเร็จ — เคลียร์ตัวนับ lockout
  if ((customer.failed_login_count ?? 0) > 0 || customer.locked_until) {
    await supabaseAdmin.from('b2b_customers').update(CLEARED).eq('id', customer.id);
  }

  const created = await createCustomerSession(customer.id, { remember: payload.remember === true });
  if (!created) return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };

  await afterCustomerLogin({ id: customer.id, email: customer.email }, { ip, userAgent: ua, method: 'password' });
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

    await sendCustomerOtpEmail({ to: cleanEmail, otp });
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
    // ★ นโยบายรหัสผ่าน — ตรวจรูปแบบก่อน (HIBP ตรวจหลังยืนยัน OTP เพื่อไม่ให้ consume OTP ถ้าไม่ผ่าน)
    const pwShape = assertPasswordAllowed(newPassword, { identifiers: [cleanEmail] });
    if (!pwShape.ok) return { success: false, error: pwShape.error };
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

    // OTP ถูกต้องแล้ว — ตรวจ HIBP ก่อน consume OTP
    const breach = await isPasswordBreached(newPassword);
    if (breach.checkFailed) {
      Sentry.captureMessage('HIBP breach check failed (failing open)', {
        level: 'warning', tags: { area: 'password-policy', flow: 'resetCustomerPassword' },
      });
    }
    if (breach.breached) {
      return { success: false, error: 'รหัสผ่านนี้เคยปรากฏในเหตุการณ์ข้อมูลรั่วไหลจากบริการอื่น กรุณาใช้รหัสผ่านอื่น' };
    }

    await supabaseAdmin.from('otp_logs').update({ used: true }).eq('id', log.id);

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const { error: updateErr } = await supabaseAdmin
      .from('b2b_customers')
      // reset password ผ่าน OTP ปลดล็อก account lockout ด้วย (audit §P1-4)
      .update({ password_hash: hashedPassword, failed_login_count: 0, locked_until: null })
      .eq('id', customer.id);

    if (updateErr) return { success: false, error: 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาลองใหม่' };

    await supabaseAdmin.from('sessions').delete().eq('customer_id', customer.id).eq('actor_type', 'customer');

    const ip = getClientIp(await headers());
    await supabaseAdmin.from('customer_password_reset_logs').insert({ customer_id: customer.id, ip });
    void logAuditEvent({
      category: 'auth', action: 'auth.password.reset', outcome: 'success',
      actor: { type: 'customer', id: customer.id, label: cleanEmail }, ip, detail: { via: 'otp' },
    });

    sendSecurityAlertEmail({ to: cleanEmail, action: 'ตั้งรหัสผ่านใหม่ (ผ่าน OTP)', whenText: nowThai(), ip })
      .catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'security-alert-email' } }));

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
    .select('expires_at, last_seen_at, b2b_customers!inner(id, email, contact_name, phone, position, access_expires_at, cancelled_at, organizations!inner(hospital_name, customer_code, province))')
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
    await logoutCustomer("expired");
    return null;
  }

  const customerRow = Array.isArray(data.b2b_customers)
    ? data.b2b_customers[0]
    : data.b2b_customers;

  if (!customerRow) return null;

  // ★ อายุการใช้งานบัญชี 2 ปีนับจากวันอนุมัติ + สวิตช์ "ยกเลิกลูกค้า" ที่ CSR คุมเอง — เช็คซ้ำ
  // ทุกครั้งที่โหลดหน้า/เรียก server action (จุดเดียวที่ทุกอย่างฝั่งลูกค้าวิ่งผ่าน) เหมือนที่
  // getStaffSession() เช็ค is_approved ซ้ำทุกครั้ง — กัน session เก่าที่ login ไว้ก่อนหมดอายุ/
  // ก่อนถูกยกเลิกใช้งานต่อได้ทั้งที่ไม่ควรแล้ว
  await touchSessionLastSeen(token, (data as { last_seen_at: string | null }).last_seen_at);

  if (customerRow.cancelled_at || new Date(customerRow.access_expires_at) < new Date()) {
    await logoutCustomer(customerRow.cancelled_at ? "cancelled" : "access_ended");
    return null;
  }

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
// `reason` แยกการกดออกเองของผู้ใช้ ('user') ออกจากการที่ getCustomerSession ล้าง session
// ที่หมดอายุ/ถูกยกเลิก (จะไม่ยิง audit event ในเคสหลังเพื่อไม่ให้ log ท่วม)
export async function logoutCustomer(reason: 'user' | 'expired' | 'cancelled' | 'access_ended' = 'user') {
  const cookieStore = await cookies();
  const token = cookieStore.get('customer_session')?.value;
  if (token) {
    if (reason === 'user') {
      const { data: sess } = await supabaseAdmin
        .from('sessions').select('customer_id, b2b_customers(email)')
        .eq('token', token).eq('actor_type', 'customer').maybeSingle();
      const cust = sess ? (Array.isArray(sess.b2b_customers) ? sess.b2b_customers[0] : sess.b2b_customers) : null;
      if (sess?.customer_id) {
        void logAuditEvent({
          category: 'auth', action: 'auth.logout',
          actor: { type: 'customer', id: sess.customer_id as number, label: (cust?.email as string) ?? null },
          ip: getClientIp(await headers()),
        });
      }
    }
    await supabaseAdmin.from('sessions').delete().eq('token', token);
  }
  cookieStore.delete('customer_session');
}

// ══ จัดการบัญชีตัวเอง (self-service, หน้า /account) — คู่ขนานกับหมวดเดียวกันของ staff
// (auth-staff.ts) บางส่วน: password ยืนยันตัวตนด้วย "รหัสผ่านปัจจุบัน" โดยตรง (ไม่ใช่ OTP),
// authenticate ด้วย getCustomerSession() เอง ไม่รับ customerId จาก client เพื่อกันการปลอมแปลง
// แก้บัญชีคนอื่น และบันทึกลง customer_account_change_logs (audit trail แยกจาก
// customer_password_reset_logs และแยกจาก staff_account_change_logs โดยสิ้นเชิง) ทุกครั้งที่แก้
// สำเร็จ — ต่างจาก staff ตรงที่ลูกค้ามีฟอร์มที่ 2 เพิ่ม (ข้อมูลติดต่อ) ที่ไม่ต้องยืนยันรหัสผ่าน
// เพราะไม่ใช่ identity credential (แค่ contact_name/phone/position ที่แสดงในเอกสาร/หน้าบัญชี
// อยู่แล้ว) — ไม่แตะ hospital_name/customer_code/province เพราะเป็นข้อมูลระดับ organizations
// ที่ผู้ติดต่อรายบุคคลไม่ควรแก้เอง (กระทบผู้ติดต่อคนอื่นในหน่วยงานเดียวกัน)
//
// ★ ไม่มีฟังก์ชันแก้อีเมล — ตั้งใจตัดออก (เคยมี updateCustomerEmail แล้วในช่วงพัฒนา) เพราะ
// อีเมลผูกกับ "Sign in with Google" (จับคู่ Google account ด้วยอีเมลที่ verify มา ดู
// loginCustomerByVerifiedEmail ด้านบน) ถ้าให้ลูกค้าแก้อีเมลเองได้จะทำให้ Google Sign-In เดิม
// หลุดทันที (ต้องแก้ปัญหานั้นด้วยกลไก stable-identity-anchor เพิ่ม ซึ่งผู้ใช้พิจารณาแล้วตัดสินใจ
// ตัดฟีเจอร์แก้อีเมลออกไปเลยแทน ให้อีเมลเป็นค่าคงที่ที่แก้ได้เฉพาะ CSR ผ่านกระบวนการอนุมัติปกติ
// ง่ายและปลอดภัยกว่า) ══

const ContactInfoSchema = z.object({
  contact_name: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ติดต่อ').max(100),
  position: z.string().trim().min(1, 'กรุณากรอกตำแหน่ง').max(100),
  phone: z.string().trim().regex(/^[0-9+\-\s]{9,15}$/, 'รูปแบบเบอร์โทรไม่ถูกต้อง'),
});

async function verifyCurrentCustomerPassword(customerId: number, currentPassword: string): Promise<boolean> {
  const { data: customer } = await supabaseAdmin
    .from('b2b_customers')
    .select('password_hash')
    .eq('id', customerId)
    .maybeSingle();
  if (!customer?.password_hash) return false;
  return bcrypt.compare(currentPassword, customer.password_hash);
}

// --- เปลี่ยนรหัสผ่าน (รู้รหัสเดิม) — ต่างจาก resetCustomerPassword ด้านบนตรงที่ยืนยันด้วย
// รหัสผ่านเดิมโดยตรง (ไม่ใช่ OTP) แล้ว revoke เฉพาะ session อื่นทั้งหมด "ยกเว้น session
// ปัจจุบัน" (resetCustomerPassword revoke ทุก session รวมของตัวเองด้วย เพราะฝั่งนั้นเพิ่งยืนยัน
// ตัวตนใหม่ผ่าน OTP ไม่ได้ถืออยู่ใน session เดิมอีกต่อไป) ──
export async function updateCustomerPassword(currentPassword: string, newPassword: string) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('customer_session')?.value;
    const session = await getCustomerSession();
    if (!session || !token) return { success: false, error: 'กรุณาเข้าสู่ระบบใหม่' };

    const rateLimit = await checkRateLimit(`customer-account-update:${session.id}`, 5, 300);
    if (!rateLimit.allowed) return { success: false, error: 'ทำรายการถี่เกินไป กรุณารอสักครู่' };

    if (!currentPassword) return { success: false, error: 'กรุณากรอกรหัสผ่านปัจจุบัน' };
    const pwShape = assertPasswordAllowed(newPassword, {
      identifiers: [session.email, session.contact_name ?? ''],
    });
    if (!pwShape.ok) return { success: false, error: pwShape.error };

    const passwordOk = await verifyCurrentCustomerPassword(session.id, currentPassword);
    if (!passwordOk) return { success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };

    // ★ HIBP หลังยืนยันรหัสผ่านปัจจุบัน
    const breach = await isPasswordBreached(newPassword);
    if (breach.checkFailed) {
      Sentry.captureMessage('HIBP breach check failed (failing open)', {
        level: 'warning', tags: { area: 'password-policy', flow: 'updateCustomerPassword' },
      });
    }
    if (breach.breached) {
      return { success: false, error: 'รหัสผ่านนี้เคยปรากฏในเหตุการณ์ข้อมูลรั่วไหลจากบริการอื่น กรุณาใช้รหัสผ่านอื่น' };
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const { error } = await supabaseAdmin
      .from('b2b_customers')
      .update({ password_hash: hashedPassword })
      .eq('id', session.id);

    if (error) throw error;

    // revoke session อื่นทั้งหมด เก็บ session ปัจจุบัน (ที่เพิ่งยืนยันรหัสผ่านเดิมสำเร็จ) ไว้
    // ไม่ให้หลุดออกจากระบบกลางทาง
    await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('customer_id', session.id)
      .eq('actor_type', 'customer')
      .neq('token', token);

    const ip = getClientIp(await headers());
    await supabaseAdmin.from('customer_account_change_logs').insert({
      customer_id: session.id, field: 'password', old_value: null, new_value: null, ip,
    });
    void logAuditEvent({
      category: 'auth', action: 'auth.password.changed', outcome: 'success',
      actor: { type: 'customer', id: session.id, label: session.email }, ip,
    });

    sendSecurityAlertEmail({ to: session.email, action: 'เปลี่ยนรหัสผ่าน', whenText: nowThai(), ip })
      .catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'security-alert-email' } }));

    return { success: true };
  } catch (error: unknown) {
    console.error('Update Customer Password Error:', error);
    Sentry.captureException(error, { tags: { area: 'customer-account-update' } });
    return { success: false, error: getErrorMessage(error) };
  }
}

// --- แก้ไขข้อมูลติดต่อ (ชื่อผู้ติดต่อ/เบอร์โทร/ตำแหน่ง) — ไม่ต้องยืนยันรหัสผ่านปัจจุบัน
// เพราะไม่ใช่ identity credential ต่างจากอีเมล/รหัสผ่านด้านบน ──
export async function updateCustomerContactInfo(payload: { contact_name: string; phone: string; position: string }) {
  try {
    const session = await getCustomerSession();
    if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบใหม่' };

    const rateLimit = await checkRateLimit(`customer-account-update:${session.id}`, 5, 300);
    if (!rateLimit.allowed) return { success: false, error: 'ทำรายการถี่เกินไป กรุณารอสักครู่' };

    const parsed = ContactInfoSchema.safeParse(payload);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'ข้อมูลที่กรอกไม่ถูกต้อง' };
    const { contact_name, phone, position } = parsed.data;

    const { error } = await supabaseAdmin
      .from('b2b_customers')
      .update({ contact_name, phone, position })
      .eq('id', session.id);

    if (error) throw error;

    const oldSummary = `ชื่อ: ${session.contact_name ?? '-'}, โทร: ${session.phone ?? '-'}, ตำแหน่ง: ${session.position ?? '-'}`;
    const newSummary = `ชื่อ: ${contact_name}, โทร: ${phone}, ตำแหน่ง: ${position}`;
    const ip = getClientIp(await headers());
    await supabaseAdmin.from('customer_account_change_logs').insert({
      customer_id: session.id, field: 'contact_info', old_value: oldSummary, new_value: newSummary, ip,
    });

    sendSecurityAlertEmail({
      to: session.email, action: 'แก้ไขข้อมูลติดต่อ', whenText: nowThai(), ip, detail: newSummary,
    }).catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'security-alert-email' } }));

    return { success: true };
  } catch (error: unknown) {
    console.error('Update Customer Contact Info Error:', error);
    Sentry.captureException(error, { tags: { area: 'customer-account-update' } });
    return { success: false, error: getErrorMessage(error) };
  }
}

// ══ Phase 3 — เซสชัน/อุปกรณ์ของลูกค้า (หน้า /account) ═══════════════════════════
// ลูกค้าไม่มีปัจจัยที่สอง จึงไม่มี "อุปกรณ์ที่เชื่อถือ" — แสดงเฉพาะเซสชันที่ยัง active
// พร้อมปุ่ม "ออกจากอุปกรณ์อื่นทั้งหมด" (ทั้ง security §P3-8 และ UX)

export async function getMyCustomerSessions() {
  const session = await getCustomerSession();
  if (!session) return { success: false as const, error: 'กรุณาเข้าสู่ระบบใหม่' };
  const currentToken = (await cookies()).get('customer_session')?.value ?? '';

  // เฉพาะเซสชันที่ยังไม่หมดอายุ — แถวที่หมดอายุแล้วไม่มีอะไรลบทิ้ง (ลบเฉพาะตอน logout/เพิกถอน)
  // จึงค้างในตารางและเคยโผล่ในลิสต์เป็น "อุปกรณ์ที่ไม่ทราบ" (เซสชันเก่าก่อนเก็บ user_agent/ip)
  const { data: sessions } = await supabaseAdmin
    .from('sessions')
    .select('token, user_agent, ip, last_seen_at, created_at, expires_at')
    .eq('customer_id', session.id)
    .eq('actor_type', 'customer')
    .gt('expires_at', new Date().toISOString());

  return {
    success: true as const,
    sessions: (sessions ?? [])
      .map((s) => ({
        sid: sessionShortId(s.token as string),
        label: parseDeviceLabel(s.user_agent as string | null),
        ip: (s.ip as string | null) ?? null,
        lastSeenAt: (s.last_seen_at as string | null) ?? (s.created_at as string),
        createdAt: s.created_at as string,
        expiresAt: s.expires_at as string,
        isCurrent: s.token === currentToken,
      }))
      .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()),
  };
}

export async function revokeCustomerSession(sid: string) {
  const session = await getCustomerSession();
  if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบใหม่' };
  const currentToken = (await cookies()).get('customer_session')?.value ?? '';

  const { data: rows } = await supabaseAdmin
    .from('sessions')
    .select('token')
    .eq('customer_id', session.id)
    .eq('actor_type', 'customer');

  const match = (rows ?? []).find((r) => sessionShortId(r.token as string) === sid);
  if (!match) return { success: false, error: 'ไม่พบเซสชันนี้' };
  if (match.token === currentToken) return { success: false, error: 'ไม่สามารถออกจากเซสชันปัจจุบันจากที่นี่ได้ ใช้ปุ่มออกจากระบบแทน' };

  await supabaseAdmin.from('sessions').delete().eq('token', match.token);
  void logAuditEvent({
    category: 'auth', action: 'auth.session.revoked', outcome: 'success',
    actor: { type: 'customer', id: session.id, label: session.email },
    ip: getClientIp(await headers()), detail: { scope: 'one' },
  });
  return { success: true };
}

export async function revokeOtherCustomerSessions() {
  const session = await getCustomerSession();
  if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบใหม่' };
  const currentToken = (await cookies()).get('customer_session')?.value ?? '';

  const { data: del } = await supabaseAdmin
    .from('sessions')
    .delete()
    .eq('customer_id', session.id)
    .eq('actor_type', 'customer')
    .neq('token', currentToken)
    .select('token');
  void logAuditEvent({
    category: 'auth', action: 'auth.session.revoked', outcome: 'success',
    actor: { type: 'customer', id: session.id, label: session.email },
    ip: getClientIp(await headers()), detail: { scope: 'others', count: del?.length ?? 0 },
  });
  return { success: true };
}
