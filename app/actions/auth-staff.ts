'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { cookies, headers } from 'next/headers';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/get-client-ip';
import { assertPasswordAllowed, isPasswordBreached, validateNewPassword } from '@/lib/password-policy';
import { lockStatus, lockedMessage, recordFailure, lockDurationMinutes, CLEARED } from '@/lib/account-lockout';
import { getErrorMessage } from '@/lib/error-message';
import { sendStaffOtpEmail, sendAccountLockedEmail, sendSecurityAlertEmail } from '@/lib/email-service';
import QRCode from 'qrcode';
import { generateTotpSecret, totpAuthUri, verifyTotp } from '@/lib/totp';
import {
  saveStaffMfaSecret, getStaffMfaSecret, generateRecoveryCodes, replaceRecoveryCodes,
  consumeRecoveryCode, countUnusedRecoveryCodes,
  createTrustedDevice, consumeTrustedDevice, revokeAllTrustedDevices, TRUSTED_DEVICE_DAYS,
} from '@/lib/mfa';
import { parseDeviceLabel, sessionShortId } from '@/lib/device';
import { recordLoginLocation, touchSessionLastSeen } from '@/lib/known-login';
import { logAuditEvent } from '@/lib/audit';

const nowThai = () => new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuv';

// --- MFA / session lifetimes (Phase 2 of 13-mfa-remember-me-design.md) ---
const STAFF_SESSION_SECONDS = 60 * 60 * 8;   // password re-auth every 8h, always
const MFA_PENDING_SECONDS = 60 * 10;         // window to complete the 2nd factor
const MFA_GRACE_DAYS = 14;                   // new staff: time to enroll before it's forced
const MFA_RESET_GRACE_DAYS = 3;              // after a manager reset: time to re-enroll
const STAFF_DEVICE_COOKIE = 'staff_mfa_device';

function staffCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

// Trusted-device cookie: sameSite 'strict' — it must never ride along on a
// cross-site navigation, since possessing it skips the 2nd factor.
function deviceCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
  };
}

// Create a staff session row + cookie. `mfaPending` sessions are short-lived and are
// treated as unauthenticated by getStaffSession() until the 2nd factor is cleared.
async function createStaffSession(staffId: string, opts: { mfaPending: boolean }) {
  const ttl = opts.mfaPending ? MFA_PENDING_SECONDS : STAFF_SESSION_SECONDS;
  const h = await headers();
  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .insert({
      actor_type: 'staff',
      staff_id: staffId,
      mfa_pending: opts.mfaPending,
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      user_agent: h.get('user-agent'),
      ip: getClientIp(h),
      last_seen_at: new Date().toISOString(),
    })
    .select('token')
    .single();
  if (error || !session) {
    console.error('Staff session creation failed:', error);
    Sentry.captureException(error, { tags: { area: 'staff-login' } });
    return null;
  }
  (await cookies()).set('staff_session', session.token, staffCookieOptions(ttl));
  return session.token as string;
}

// After a staff login completes (full session): audit it, record the location,
// and alert the account owner by email if it's a location we've never seen.
async function afterStaffLogin(
  user: { id: string; email: string | null; username?: string | null },
  ctx: { ip: string; userAgent?: string | null; method: 'password' | 'trusted_device' },
) {
  const actor = { type: 'staff' as const, id: user.id, label: user.username ?? null };
  void logAuditEvent({
    category: 'auth', action: 'auth.login.success', outcome: 'success',
    actor, ip: ctx.ip, userAgent: ctx.userAgent, detail: { method: ctx.method },
  });
  try {
    const { isNewLocation } = await recordLoginLocation({ type: 'staff', id: user.id }, ctx.ip);
    if (isNewLocation) {
      void logAuditEvent({
        category: 'auth', action: 'auth.new_location', actor, ip: ctx.ip, userAgent: ctx.userAgent,
      });
      if (user.email) {
        sendSecurityAlertEmail({
          to: user.email,
          action: 'เข้าสู่ระบบจากอุปกรณ์/สถานที่ใหม่',
          whenText: nowThai(),
          ip: ctx.ip,
          detail: 'หากไม่ใช่คุณ กรุณาเปลี่ยนรหัสผ่านและแจ้งผู้ดูแลระบบทันที',
        }).catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'security-alert-email' } }));
      }
    }
  } catch (e) {
    Sentry.captureException(e, { level: 'warning', tags: { area: 'known-login' } });
  }
}

// Staff login/2FA that did NOT result in a session (failure or challenge issued).
function auditStaffAuthFailure(
  action: 'auth.login.failure' | 'auth.mfa.challenge.failure',
  ctx: { ip: string; userAgent?: string | null; reason: string; username?: string | null; staffId?: string },
) {
  void logAuditEvent({
    category: 'auth', action, outcome: 'failure',
    actor: ctx.staffId
      ? { type: 'staff', id: ctx.staffId, label: ctx.username ?? null }
      : { type: 'anon' },
    ip: ctx.ip, userAgent: ctx.userAgent,
    // username only when it matched a real account (avoid logging outsiders' PII / enabling enumeration via the log)
    detail: { reason: ctx.reason, ...(ctx.staffId && ctx.username ? { username: ctx.username } : {}) },
  });
}

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
  // base64 PNG data URI จาก SignaturePad (canvas.toDataURL()) ไม่ใช่ URL — ตรวจ + upload
  // ฝั่ง server เอง (pattern เดียวกับ registerCustomer ใน auth.ts) นำไปฝังในเอกสารยืนยัน
  // การลงทะเบียนของลูกค้าตอนพนักงานคนนี้กดอนุมัติ
  signature_url: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- ลงทะเบียนพนักงาน ---
export async function registerStaff(payload: StaffRegisterPayload) {
  try {
    // ★ Rate limit ต่อ IP — เป็น server action ที่เรียกได้โดยไม่ต้อง login และในนี้มีการ
    // อัปโหลดไฟล์ลายเซ็นเข้า bucket `signatures` ก่อนตรวจสิทธิ์ใด ๆ (พบระหว่าง security
    // audit 28 ส.ค. 2569 — P0-5 ว่าเดิมไม่มี rate limit เลย ต่างจากทุกจุด auth อื่นในระบบ)
    // ผูกกับ IP อย่างเดียว: employee_id/username ผู้ยิงสแปมสุ่มใหม่ได้ทุกครั้ง (unique
    // constraint กันแค่แถวซ้ำ ไม่กันปริมาณ) — 8 ครั้ง/ชม. กว้างพอสำหรับ onboarding พนักงาน
    // จริงจากออฟฟิศเดียว (ผ่าน NAT IP เดียวกัน) แต่บล็อกบอทที่ยิงสร้างแถว pending + ไฟล์ขยะ
    // (ถ้าเกินโควตาระหว่าง onboarding จริง: รอ 1 ชม. หรือให้ผู้จัดการช่วยสร้างบัญชีที่เหลือ)
    const ip = getClientIp(await headers());
    const ipRateLimit = await checkRateLimit(`register-staff-ip:${ip}`, 8, 3600);
    if (!ipRateLimit.allowed) {
      return { success: false, error: 'ลงทะเบียนถี่เกินไป กรุณาลองใหม่ในภายหลัง' };
    }

    // ★ email บังคับทุกแผนกแล้ว (เดิมเฉพาะ sale) — เช็คซ้ำฝั่ง server แม้ client บังคับ
    // required ไว้แล้ว (กันกรณีเลี่ยงผ่าน form โดยตรง เหมือน pattern อื่นในระบบ)
    const email = payload.email?.trim();
    if (!email || !EMAIL_RE.test(email)) {
      return { success: false, error: 'กรุณากรอกอีเมลให้ถูกต้อง' };
    }

    // ★ นโยบายรหัสผ่าน (P0-2) — เดิม registerStaff ไม่ตรวจรหัสผ่านเลย
    const pw = await validateNewPassword(payload.password, {
      identifiers: [email, payload.username, payload.employee_id, payload.full_name],
    });
    if (!pw.ok) return { success: false, error: pw.error };
    if (pw.breachCheckFailed) {
      Sentry.captureMessage('HIBP breach check failed (failing open)', {
        level: 'warning', tags: { area: 'password-policy', flow: 'registerStaff' },
      });
    }

    if (!payload.signature_url?.startsWith('data:image/png;base64,')) {
      return { success: false, error: 'กรุณาลงลายเซ็นก่อนดำเนินการต่อ' };
    }
    const sigBase64 = payload.signature_url.split(',')[1] ?? '';
    const sigBuffer = Buffer.from(sigBase64, 'base64');
    if (sigBuffer.length === 0 || sigBuffer.length > 2 * 1024 * 1024) {
      return { success: false, error: 'ไฟล์ลายเซ็นไม่ถูกต้องหรือมีขนาดใหญ่เกินไป' };
    }

    const signaturePath = `staff/${crypto.randomUUID()}.png`;
    const { error: sigUploadErr } = await supabaseAdmin.storage
      .from('signatures')
      .upload(signaturePath, sigBuffer, { contentType: 'image/png' });

    if (sigUploadErr) {
      console.error('Staff signature upload failed:', sigUploadErr);
      Sentry.captureException(sigUploadErr, { tags: { area: 'staff-signature-upload' } });
      return { success: false, error: 'บันทึกลายเซ็นไม่สำเร็จ กรุณาลองใหม่' };
    }

    const salt = await bcrypt.genSalt(12);
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
          signature_url: signaturePath,
          // MFA is mandatory; give a new hire MFA_GRACE_DAYS to enroll before login forces it.
          mfa_grace_until: new Date(Date.now() + MFA_GRACE_DAYS * 86400_000).toISOString(),
        }
      ]);

    if (error) {
      if (error.code === '23505') {
        throw new Error("Username หรือรหัสพนักงานนี้ถูกใช้งานแล้ว");
      }
      throw error;
    }
    void logAuditEvent({
      category: 'admin_action', action: 'admin.staff.registered', outcome: 'success',
      actor: { type: 'anon' }, ip,
      detail: { username: payload.username, employee_id: payload.employee_id, department: payload.department },
    });
    return { success: true };
  } catch (error: unknown) {
    console.error("Staff Registration Error:", error);
    // ★ ไม่ capture เคส username/รหัสพนักงานซ้ำ — เป็นพฤติกรรมคาดหวังปกติของผู้ใช้ ไม่ใช่
    // ระบบพัง (เช็คจาก message เพราะ throw ใหม่เป็น Error ธรรมดา ไม่มี .code ของ Postgres ติดมา)
    if (getErrorMessage(error) !== 'Username หรือรหัสพนักงานนี้ถูกใช้งานแล้ว') {
      Sentry.captureException(error, { tags: { area: 'staff-registration' } });
    }
    return { success: false, error: getErrorMessage(error) };
  }
}

// --- ล็อกอินพนักงาน ---
export async function loginStaffAction(payload: { username: string; password: string }) {
  const { username, password } = payload;

  try {
    // ★ กันเดารหัสผ่านรัว — เดิมมีแค่ bcrypt กับ DUMMY_HASH (กัน timing attack) แต่ไม่มี cap
    // จำนวนครั้งเลย ต่างจากทุกจุด auth อื่นในระบบ (พบระหว่าง security audit 7 ส.ค. 2569)
    //
    // ★★ เพิ่ม IP-based limit คู่กับของเดิม (พบระหว่าง security audit 11 ส.ค. 2569) — ของเดิม
    // ผูกกับ username เดียวเท่านั้น กันแค่ "เดารหัสผ่านซ้ำกับบัญชีเดียว" ไม่กัน credential
    // stuffing ที่กระจายยิงหลาย username พร้อมกันจาก IP เดียว เพดานตั้งกว้างกว่าของเดิม
    // (20 vs 10) เพราะ IP เดียวอาจมีพนักงานหลายคน login จากเครือข่ายเดียวกัน (office/สาขา)
    // ไม่อยากบล็อกคนปกติเกินจำเป็น เช็คก่อน per-username เพราะเป็นเกราะกว้างกว่า
    const h = await headers();
    const ip = getClientIp(h);
    const ua = h.get('user-agent');
    const ipRateLimit = await checkRateLimit(`login-staff-ip:${ip}`, 20, 300);
    if (!ipRateLimit.allowed) {
      auditStaffAuthFailure('auth.login.failure', { ip, userAgent: ua, reason: 'rate_limited' });
      return { success: false, error: "เข้าสู่ระบบถี่เกินไป กรุณารอสักครู่" };
    }

    const rateLimit = await checkRateLimit(`login-staff:${username}`, 10, 300);
    if (!rateLimit.allowed) {
      auditStaffAuthFailure('auth.login.failure', { ip, userAgent: ua, reason: 'rate_limited' });
      return { success: false, error: "เข้าสู่ระบบถี่เกินไป กรุณารอสักครู่" };
    }

    const { data: user, error } = await supabaseAdmin
      .from('staff_users')
      .select('id, username, email, password_hash, role, is_approved, department, failed_login_count, locked_until, mfa_enabled, mfa_grace_until')
      .eq('username', username)
      .single();

    // ข้อความเดียวกันไม่ว่า username หรือ password ผิด กัน user enumeration
    if (error || !user) {
      await bcrypt.compare(password, DUMMY_HASH); // กัน timing attack
      auditStaffAuthFailure('auth.login.failure', { ip, userAgent: ua, reason: 'no_account' });
      return { success: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
    }

    // ★ Account lockout (audit §P1-4) — เช็คก่อน bcrypt.compare แต่ยัง compare DUMMY กัน timing
    const lock = lockStatus(user.locked_until);
    if (lock.locked) {
      await bcrypt.compare(password, DUMMY_HASH);
      auditStaffAuthFailure('auth.login.failure', {
        ip, userAgent: ua, reason: 'locked', staffId: user.id, username: user.username,
      });
      return { success: false, error: lockedMessage(lock.minutesLeft) };
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const f = recordFailure(user.failed_login_count ?? 0);
      await supabaseAdmin.from('staff_users')
        .update({ failed_login_count: f.failed_login_count, locked_until: f.locked_until })
        .eq('id', user.id);
      auditStaffAuthFailure('auth.login.failure', {
        ip, userAgent: ua, reason: 'bad_password', staffId: user.id, username: user.username,
      });
      if (f.justLocked) {
        void logAuditEvent({
          category: 'auth', action: 'auth.lockout.triggered',
          actor: { type: 'staff', id: user.id, label: user.username },
          ip, userAgent: ua,
          detail: { minutes: lockDurationMinutes(f.failed_login_count), failed_count: f.failed_login_count },
        });
        if (user.email) {
          sendAccountLockedEmail({
            to: user.email, minutesLocked: lockDurationMinutes(f.failed_login_count), whenText: nowThai(), ip,
          }).catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'account-locked-email' } }));
        }
      }
      return { success: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
    }

    if (!user.is_approved) {
      auditStaffAuthFailure('auth.login.failure', {
        ip, userAgent: ua, reason: 'not_approved', staffId: user.id, username: user.username,
      });
      return { success: false, error: "บัญชีนี้ยังไม่ได้รับการอนุมัติ" };
    }

    // login สำเร็จ — เคลียร์ตัวนับ lockout
    if ((user.failed_login_count ?? 0) > 0 || user.locked_until) {
      await supabaseAdmin.from('staff_users').update(CLEARED).eq('id', user.id);
    }

    // ── ปัจจัยที่สอง (MFA) — บังคับทุก role, มี grace period ให้ enroll ──
    // (ดู 13-mfa-remember-me-design.md §2.4)
    const graceMsLeft = user.mfa_grace_until
      ? new Date(user.mfa_grace_until).getTime() - Date.now()
      : -1;

    if (user.mfa_enabled) {
      // อุปกรณ์ที่เชื่อถือ (จดจำไว้ 30 วัน) → ข้ามการกรอก TOTP
      const deviceToken = (await cookies()).get(STAFF_DEVICE_COOKIE)?.value;
      if (deviceToken) {
        const rotated = await consumeTrustedDevice(user.id, deviceToken, { userAgent: ua, ip });
        if (rotated) {
          const token = await createStaffSession(user.id, { mfaPending: false });
          if (!token) return { success: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
          (await cookies()).set(STAFF_DEVICE_COOKIE, rotated, deviceCookieOptions(TRUSTED_DEVICE_DAYS * 86400));
          await afterStaffLogin(user, { ip, userAgent: ua, method: 'trusted_device' });
          return { success: true, mfa: 'trusted' as const, role: user.role, department: user.department };
        }
      }
      // ต้องยืนยัน TOTP/recovery code ก่อน — สร้าง session ค้างไว้ (client จะโชว์ช่องกรอกรหัส)
      const token = await createStaffSession(user.id, { mfaPending: true });
      if (!token) return { success: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
      return { success: true, mfa: 'challenge' as const };
    }

    if (graceMsLeft > 0) {
      // ยังอยู่ในช่วงผ่อนผัน — เข้าระบบได้ตามปกติ แต่ client จะเตือนให้ไปตั้งค่า MFA
      const token = await createStaffSession(user.id, { mfaPending: false });
      if (!token) return { success: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
      await afterStaffLogin(user, { ip, userAgent: ua, method: 'password' });
      return {
        success: true,
        mfa: 'grace' as const,
        role: user.role,
        department: user.department,
        graceDaysLeft: Math.max(1, Math.ceil(graceMsLeft / 86400_000)),
      };
    }

    // เกินกำหนดผ่อนผันและยังไม่ตั้งค่า — บังคับ enroll ก่อนใช้งานต่อ
    const token = await createStaffSession(user.id, { mfaPending: true });
    if (!token) return { success: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
    return { success: true, mfa: 'enroll' as const };
  } catch (error: unknown) {
    console.error("Login Error:", error);
    Sentry.captureException(error, { tags: { area: 'staff-login' } });
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

  if (error) return { success: false, error: error.message };

  void logAuditEvent({
    category: 'admin_action', action: 'admin.staff.approved', outcome: 'success',
    actor: { type: 'staff', id: session.id, label: session.username },
    target: { type: 'staff', id: staffId },
    ip: getClientIp(await headers()),
  });
  return { success: true };
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
    .select('expires_at, mfa_pending, last_seen_at, staff_users!inner(id, username, full_name, role, department, is_approved, sale_customer_types, sale_provinces, email, signature_url, mfa_enabled, mfa_grace_until)')
    .eq('token', token)
    .eq('actor_type', 'staff')
    .maybeSingle();

  if (error) {
    console.error('getStaffSession query error:', error);
    // ★ เรียกทุกหน้า staff ที่ต้อง login ถ้าพังแปลว่า staff ทุกคนหลุด session พร้อมกัน
    Sentry.captureException(error, { level: 'fatal', tags: { area: 'staff-session' } });
    return null;
  }

  if (!data || new Date(data.expires_at) < new Date()) return null;

  // ยังยืนยันปัจจัยที่สองไม่ครบ — ยังไม่ถือว่า login สมบูรณ์ (หน้า MFA challenge / บังคับ
  // enroll ใช้ getStaffSessionPending() แทน)
  if (data.mfa_pending) return null;

  await touchSessionLastSeen(token, data.last_seen_at as string | null);

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
    signature_url: staffUser.signature_url as string | null,
    mfa_enabled: staffUser.mfa_enabled as boolean,
    mfa_grace_until: staffUser.mfa_grace_until as string | null,
  };
}

// เหมือน getStaffSession แต่ "ยอมรับ" session ที่ยังค้างปัจจัยที่สอง (mfa_pending) ด้วย —
// ใช้เฉพาะหน้า/แอ็กชันที่เกี่ยวกับการยืนยัน MFA หรือบังคับ enroll เท่านั้น
export async function getStaffSessionPending() {
  const token = (await cookies()).get('staff_session')?.value;
  if (!token || !UUID_RE.test(token)) return null;

  const { data } = await supabaseAdmin
    .from('sessions')
    .select('token, expires_at, mfa_pending, staff_users!inner(id, username, full_name, role, department, is_approved, email, mfa_enabled, mfa_enrolled_at, mfa_grace_until)')
    .eq('token', token)
    .eq('actor_type', 'staff')
    .maybeSingle();

  if (!data || new Date(data.expires_at) < new Date()) return null;

  const s = Array.isArray(data.staff_users) ? data.staff_users[0] : data.staff_users;
  if (!s || !s.is_approved) return null;

  return {
    token: data.token as string,
    mfaPending: data.mfa_pending as boolean,
    id: s.id as string,
    username: s.username as string,
    full_name: s.full_name as string | null,
    role: s.role as string | null,
    department: s.department as string,
    email: s.email as string | null,
    mfa_enabled: s.mfa_enabled as boolean,
    mfa_enrolled_at: s.mfa_enrolled_at as string | null,
    mfa_grace_until: s.mfa_grace_until as string | null,
  };
}

// --- ยืนยันปัจจัยที่สอง (TOTP หรือ recovery code) — เรียกหลัง loginStaffAction คืน mfa:'challenge' ---
export async function verifyStaffMfa(payload: { code: string; rememberDevice?: boolean }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('staff_session')?.value;
    if (!token || !UUID_RE.test(token)) {
      return { success: false, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' };
    }

    const { data: sess } = await supabaseAdmin
      .from('sessions')
      .select('token, expires_at, staff_users!inner(id, username, role, department, email, mfa_enabled, failed_login_count, locked_until)')
      .eq('token', token)
      .eq('actor_type', 'staff')
      .maybeSingle();

    if (!sess || new Date(sess.expires_at) < new Date()) {
      return { success: false, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' };
    }
    const staff = Array.isArray(sess.staff_users) ? sess.staff_users[0] : sess.staff_users;
    if (!staff || !staff.mfa_enabled) {
      return { success: false, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' };
    }

    // rate limit — fail-closed (เดารหัส 6 หลักรัวไม่ได้)
    const rl = await checkRateLimit(`mfa-verify:${staff.id}`, 5, 300);
    if (!rl.allowed) return { success: false, error: 'ยืนยันรหัสถี่เกินไป กรุณารอสักครู่' };

    // ใช้ account lockout ตัวเดียวกับรหัสผ่าน
    const lock = lockStatus(staff.locked_until);
    if (lock.locked) return { success: false, error: lockedMessage(lock.minutesLeft) };

    const hdrs = await headers();
    const mfaIp = getClientIp(hdrs);
    const mfaUa = hdrs.get('user-agent');

    const raw = (payload.code ?? '').trim();
    const digits = raw.replace(/\s+/g, '');
    let ok = false;
    let via: 'totp' | 'recovery_code' | null = null;
    if (/^\d{6}$/.test(digits)) {
      const secret = await getStaffMfaSecret(staff.id);
      if (secret && verifyTotp(secret, digits)) { ok = true; via = 'totp'; }
    }
    if (!ok) {
      // recovery code (รูปแบบ XXXXX-XXXXX) — normalize ภายใน; 6 หลักล้วนถูกปฏิเสธเพราะสั้นเกิน
      if (await consumeRecoveryCode(staff.id, raw)) { ok = true; via = 'recovery_code'; }
    }

    if (!ok) {
      const f = recordFailure(staff.failed_login_count ?? 0);
      await supabaseAdmin.from('staff_users')
        .update({ failed_login_count: f.failed_login_count, locked_until: f.locked_until })
        .eq('id', staff.id);
      auditStaffAuthFailure('auth.mfa.challenge.failure', {
        ip: mfaIp, userAgent: mfaUa, reason: 'bad_code', staffId: staff.id, username: staff.username,
      });
      if (f.justLocked) {
        void logAuditEvent({
          category: 'auth', action: 'auth.lockout.triggered',
          actor: { type: 'staff', id: staff.id, label: staff.username },
          ip: mfaIp, userAgent: mfaUa,
          detail: { minutes: lockDurationMinutes(f.failed_login_count), failed_count: f.failed_login_count, at: 'mfa' },
        });
        if (staff.email) {
          sendAccountLockedEmail({
            to: staff.email, minutesLocked: lockDurationMinutes(f.failed_login_count), whenText: nowThai(), ip: mfaIp,
          }).catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'account-locked-email' } }));
        }
      }
      return { success: false, error: 'รหัสยืนยันไม่ถูกต้อง' };
    }

    // สำเร็จ — ปลด mfa_pending + ต่ออายุ session เป็น 8 ชม.
    await supabaseAdmin.from('sessions')
      .update({
        mfa_pending: false,
        expires_at: new Date(Date.now() + STAFF_SESSION_SECONDS * 1000).toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq('token', token);
    if ((staff.failed_login_count ?? 0) > 0 || staff.locked_until) {
      await supabaseAdmin.from('staff_users').update(CLEARED).eq('id', staff.id);
    }
    cookieStore.set('staff_session', token, staffCookieOptions(STAFF_SESSION_SECONDS));

    if (payload.rememberDevice) {
      const rawDevice = await createTrustedDevice(staff.id, { userAgent: mfaUa, ip: mfaIp });
      if (rawDevice) {
        cookieStore.set(STAFF_DEVICE_COOKIE, rawDevice, deviceCookieOptions(TRUSTED_DEVICE_DAYS * 86400));
        void logAuditEvent({
          category: 'auth', action: 'auth.trusted_device.added',
          actor: { type: 'staff', id: staff.id, label: staff.username },
          ip: mfaIp, userAgent: mfaUa, detail: { device_label: parseDeviceLabel(mfaUa) },
        });
      }
    }
    void logAuditEvent({
      category: 'auth', action: 'auth.mfa.challenge.success', outcome: 'success',
      actor: { type: 'staff', id: staff.id, label: staff.username },
      ip: mfaIp, userAgent: mfaUa, detail: { via },
    });
    await afterStaffLogin(
      { id: staff.id, email: staff.email, username: staff.username },
      { ip: mfaIp, userAgent: mfaUa, method: 'password' },
    );

    return { success: true, role: staff.role, department: staff.department };
  } catch (error: unknown) {
    console.error('verifyStaffMfa Error:', error);
    Sentry.captureException(error, { tags: { area: 'staff-mfa-verify' } });
    return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };
  }
}

// --- ออกจากระบบ (ลบ session ออกจาก DB จริง) ---
export async function logoutStaffAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get('staff_session')?.value;
  if (token) {
    const { data: sess } = await supabaseAdmin
      .from('sessions')
      .select('staff_users(id, username)')
      .eq('token', token).eq('actor_type', 'staff').maybeSingle();
    const su = sess ? (Array.isArray(sess.staff_users) ? sess.staff_users[0] : sess.staff_users) : null;
    await supabaseAdmin.from('sessions').delete().eq('token', token);
    if (su) {
      void logAuditEvent({
        category: 'auth', action: 'auth.logout',
        actor: { type: 'staff', id: su.id as string, label: su.username as string },
        ip: getClientIp(await headers()),
      });
    }
  }
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

    await sendStaffOtpEmail({ to: staff.email, otp });
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
    // ★ นโยบายรหัสผ่าน — ตรวจรูปแบบก่อน (HIBP ตรวจหลังยืนยัน OTP เพื่อไม่ให้ consume OTP ถ้ารหัสผ่านไม่ผ่าน)
    const pwShape = assertPasswordAllowed(newPassword, { identifiers: [cleanUsername] });
    if (!pwShape.ok) return { success: false, error: pwShape.error };
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

    // OTP ถูกต้องแล้ว — ตรวจ HIBP ก่อน consume OTP (ถ้ารหัสผ่านเคยรั่ว ผู้ใช้ยังใช้ OTP เดิมลองใหม่ได้)
    const breach = await isPasswordBreached(newPassword);
    if (breach.checkFailed) {
      Sentry.captureMessage('HIBP breach check failed (failing open)', {
        level: 'warning', tags: { area: 'password-policy', flow: 'resetStaffPassword' },
      });
    }
    if (breach.breached) {
      return { success: false, error: 'รหัสผ่านนี้เคยปรากฏในเหตุการณ์ข้อมูลรั่วไหลจากบริการอื่น กรุณาใช้รหัสผ่านอื่น' };
    }

    await supabaseAdmin.from('otp_logs').update({ used: true }).eq('id', log.id);

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const { error: updateErr } = await supabaseAdmin
      .from('staff_users')
      // reset password ผ่าน OTP ปลดล็อก account lockout ด้วย (audit §P1-4)
      .update({ password_hash: hashedPassword, updated_at: new Date().toISOString(), failed_login_count: 0, locked_until: null })
      .eq('id', staff.id);

    if (updateErr) return { success: false, error: 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาลองใหม่' };

    await supabaseAdmin.from('sessions').delete().eq('staff_id', staff.id).eq('actor_type', 'staff');
    // อุปกรณ์หาย/ถูกขโมยมักเป็นสาเหตุที่มารีเซ็ตรหัสผ่าน — เพิกถอนอุปกรณ์ที่เชื่อถือทั้งหมดด้วย
    await revokeAllTrustedDevices(staff.id);

    const ip = getClientIp(await headers());
    await supabaseAdmin.from('staff_password_reset_logs').insert({ staff_id: staff.id, ip });
    void logAuditEvent({
      category: 'auth', action: 'auth.password.reset', outcome: 'success',
      actor: { type: 'staff', id: staff.id, label: cleanUsername }, ip, detail: { via: 'otp' },
    });

    if (staff.email) {
      sendSecurityAlertEmail({ to: staff.email, action: 'ตั้งรหัสผ่านใหม่ (ผ่าน OTP)', whenText: nowThai(), ip })
        .catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'security-alert-email' } }));
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('Staff Password Reset Error:', error);
    Sentry.captureException(error, { tags: { area: 'staff-password-reset' } });
    return { success: false, error: getErrorMessage(error) };
  }
}

// ══ จัดการบัญชีตัวเอง (self-service, หน้า /admin/account) — ต่างจาก "ลืมรหัสผ่าน" ด้านบน
// ตรงที่ทั้ง 3 ฟังก์ชันนี้ยืนยันตัวตนด้วย "รหัสผ่านปัจจุบัน" โดยตรง (ไม่ใช่ OTP) เพราะสมมติ
// ฐานว่าพนักงานยัง login ค้างอยู่และจำรหัสผ่านเดิมได้ ทุกฟังก์ชัน authenticate ด้วย
// getStaffSession() เอง ไม่รับ staffId จาก client เพื่อกันการปลอมแปลงแก้บัญชีคนอื่น และ
// บันทึกลง staff_account_change_logs (audit trail แยกจาก staff_password_reset_logs) ทุกครั้ง
// ที่แก้สำเร็จ ให้ manager/ผู้ดูแลระบบตรวจสอบย้อนหลังได้ ══

async function verifyCurrentPassword(staffId: string, currentPassword: string): Promise<boolean> {
  const { data: staff } = await supabaseAdmin
    .from('staff_users')
    .select('password_hash')
    .eq('id', staffId)
    .maybeSingle();
  if (!staff) return false;
  return bcrypt.compare(currentPassword, staff.password_hash);
}

// --- เปลี่ยน Username ---
export async function updateStaffUsername(currentPassword: string, newUsername: string) {
  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบใหม่' };

    // ★ rate limit ผูกกับ staff เดียวกันทั้ง 3 ฟังก์ชันจัดการบัญชี (ใช้ prefix เดียวกัน) เพราะ
    // ทุกฟังก์ชันต้องยืนยันรหัสผ่านปัจจุบันเหมือนกัน กันเดารหัสผ่านผ่านฟังก์ชันไหนก็ได้เกิน
    // งบรวมที่ตั้งไว้ ไม่ใช่แยกงบต่อฟังก์ชัน
    const rateLimit = await checkRateLimit(`staff-account-update:${session.id}`, 5, 300);
    if (!rateLimit.allowed) return { success: false, error: 'ทำรายการถี่เกินไป กรุณารอสักครู่' };

    const cleanUsername = newUsername?.trim();
    if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 50) {
      return { success: false, error: 'Username ต้องมีความยาว 3-50 ตัวอักษร' };
    }
    if (!currentPassword) return { success: false, error: 'กรุณากรอกรหัสผ่านปัจจุบัน' };

    if (cleanUsername === session.username) {
      return { success: false, error: 'Username นี้เป็น Username ปัจจุบันของคุณอยู่แล้ว' };
    }

    const passwordOk = await verifyCurrentPassword(session.id, currentPassword);
    if (!passwordOk) return { success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };

    const { error } = await supabaseAdmin
      .from('staff_users')
      .update({ username: cleanUsername, updated_at: new Date().toISOString() })
      .eq('id', session.id);

    if (error) {
      // เคสเดียวกับตอนสมัคร — unique constraint ชน username ซ้ำ
      if (error.code === '23505') return { success: false, error: 'Username นี้ถูกใช้งานแล้ว' };
      throw error;
    }

    const ip = getClientIp(await headers());
    await supabaseAdmin.from('staff_account_change_logs').insert({
      staff_id: session.id, field: 'username', old_value: session.username, new_value: cleanUsername, ip,
    });

    if (session.email) {
      sendSecurityAlertEmail({
        to: session.email, action: 'เปลี่ยน Username', whenText: nowThai(), ip,
        detail: `จาก "${session.username}" เป็น "${cleanUsername}"`,
      }).catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'security-alert-email' } }));
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('Update Staff Username Error:', error);
    Sentry.captureException(error, { tags: { area: 'staff-account-update' } });
    return { success: false, error: getErrorMessage(error) };
  }
}

// --- เปลี่ยนอีเมล ---
export async function updateStaffEmail(currentPassword: string, newEmail: string) {
  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบใหม่' };

    const rateLimit = await checkRateLimit(`staff-account-update:${session.id}`, 5, 300);
    if (!rateLimit.allowed) return { success: false, error: 'ทำรายการถี่เกินไป กรุณารอสักครู่' };

    const cleanEmail = newEmail?.trim();
    if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
      return { success: false, error: 'กรุณากรอกอีเมลให้ถูกต้อง' };
    }
    if (!currentPassword) return { success: false, error: 'กรุณากรอกรหัสผ่านปัจจุบัน' };

    if (cleanEmail === session.email) {
      return { success: false, error: 'อีเมลนี้เป็นอีเมลปัจจุบันของคุณอยู่แล้ว' };
    }

    const passwordOk = await verifyCurrentPassword(session.id, currentPassword);
    if (!passwordOk) return { success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };

    const { error } = await supabaseAdmin
      .from('staff_users')
      .update({ email: cleanEmail, updated_at: new Date().toISOString() })
      .eq('id', session.id);

    if (error) throw error;

    const ip = getClientIp(await headers());
    await supabaseAdmin.from('staff_account_change_logs').insert({
      staff_id: session.id, field: 'email', old_value: session.email, new_value: cleanEmail, ip,
    });

    // ส่งไปทั้งอีเมลเดิมและอีเมลใหม่ — ถ้าไม่ใช่เจ้าของทำ อีเมลเดิมยังได้รับแจ้ง
    sendSecurityAlertEmail({
      to: [session.email, cleanEmail].filter((e): e is string => !!e),
      action: 'เปลี่ยนอีเมลบัญชี', whenText: nowThai(), ip,
      detail: `จาก "${session.email ?? '-'}" เป็น "${cleanEmail}"`,
    }).catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'security-alert-email' } }));

    return { success: true };
  } catch (error: unknown) {
    console.error('Update Staff Email Error:', error);
    Sentry.captureException(error, { tags: { area: 'staff-account-update' } });
    return { success: false, error: getErrorMessage(error) };
  }
}

// --- เปลี่ยนรหัสผ่าน (รู้รหัสเดิม) — ต่างจาก resetStaffPassword ด้านบนตรงที่ยืนยันด้วย
// รหัสผ่านเดิมโดยตรง (ไม่ใช่ OTP) แล้ว revoke เฉพาะ session อื่นทั้งหมด "ยกเว้น session
// ปัจจุบัน" (resetStaffPassword revoke ทุก session รวมของตัวเองด้วย เพราะฝั่งนั้นเพิ่งยืนยัน
// ตัวตนใหม่ผ่าน OTP ไม่ได้ถืออยู่ใน session เดิมอีกต่อไป) ══
export async function updateStaffPassword(currentPassword: string, newPassword: string) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('staff_session')?.value;
    const session = await getStaffSession();
    if (!session || !token) return { success: false, error: 'กรุณาเข้าสู่ระบบใหม่' };

    const rateLimit = await checkRateLimit(`staff-account-update:${session.id}`, 5, 300);
    if (!rateLimit.allowed) return { success: false, error: 'ทำรายการถี่เกินไป กรุณารอสักครู่' };

    if (!currentPassword) return { success: false, error: 'กรุณากรอกรหัสผ่านปัจจุบัน' };
    const pwShape = assertPasswordAllowed(newPassword, {
      identifiers: [session.username, session.email ?? ''],
    });
    if (!pwShape.ok) return { success: false, error: pwShape.error };

    const passwordOk = await verifyCurrentPassword(session.id, currentPassword);
    if (!passwordOk) return { success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };

    // ★ HIBP หลังยืนยันรหัสผ่านปัจจุบัน (ไม่ให้ใช้ endpoint นี้ probe รหัสผ่านโดยไม่รู้รหัสเดิม)
    const breach = await isPasswordBreached(newPassword);
    if (breach.checkFailed) {
      Sentry.captureMessage('HIBP breach check failed (failing open)', {
        level: 'warning', tags: { area: 'password-policy', flow: 'updateStaffPassword' },
      });
    }
    if (breach.breached) {
      return { success: false, error: 'รหัสผ่านนี้เคยปรากฏในเหตุการณ์ข้อมูลรั่วไหลจากบริการอื่น กรุณาใช้รหัสผ่านอื่น' };
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const { error } = await supabaseAdmin
      .from('staff_users')
      .update({ password_hash: hashedPassword, updated_at: new Date().toISOString() })
      .eq('id', session.id);

    if (error) throw error;

    // revoke session อื่นทั้งหมด เก็บ session ปัจจุบัน (ที่เพิ่งยืนยันรหัสผ่านเดิมสำเร็จ) ไว้
    // ไม่ให้หลุดออกจากระบบกลางทาง
    await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('staff_id', session.id)
      .eq('actor_type', 'staff')
      .neq('token', token);
    // เพิกถอนอุปกรณ์ที่เชื่อถือทั้งหมด — ครั้งหน้าที่เข้าจากอุปกรณ์ไหนต้องยืนยัน MFA ใหม่
    await revokeAllTrustedDevices(session.id);
    (await cookies()).delete(STAFF_DEVICE_COOKIE);

    const ip = getClientIp(await headers());
    await supabaseAdmin.from('staff_account_change_logs').insert({
      staff_id: session.id, field: 'password', old_value: null, new_value: null, ip,
    });
    void logAuditEvent({
      category: 'auth', action: 'auth.password.changed', outcome: 'success',
      actor: { type: 'staff', id: session.id, label: session.username }, ip,
    });

    if (session.email) {
      sendSecurityAlertEmail({ to: session.email, action: 'เปลี่ยนรหัสผ่าน', whenText: nowThai(), ip })
        .catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'security-alert-email' } }));
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('Update Staff Password Error:', error);
    Sentry.captureException(error, { tags: { area: 'staff-account-update' } });
    return { success: false, error: getErrorMessage(error) };
  }
}

// ══ MFA — เปิดใช้งาน / จัดการ (Phase 2 ของ 13-mfa-remember-me-design.md) ═══════════
// การ enroll เข้าถึงได้ทั้งจากหน้าบังคับ (/mfa-setup, session ยัง mfa_pending) และจากหน้า
// จัดการบัญชี (/admin/account, session สมบูรณ์แล้วในช่วง grace) จึงยืนยันตัวตนด้วย
// getStaffSessionPending() ตัวเดียว พนักงาน "ปิด" MFA เองไม่ได้ (บังคับ) — มีแต่ผู้จัดการ
// รีเซ็ตให้ผ่าน resetStaffMfa ด้านล่าง

// สถานะ MFA ของบัญชีตัวเอง — ใช้ทั้งหน้า /mfa-setup และการ์ด MFA ใน /admin/account
export async function getMyMfaStatus() {
  const s = await getStaffSessionPending();
  if (!s) return { success: false as const, error: 'กรุณาเข้าสู่ระบบใหม่' };
  return {
    success: true as const,
    enabled: s.mfa_enabled,
    enrolledAt: s.mfa_enrolled_at,
    graceUntil: s.mfa_grace_until,
    mfaPending: s.mfaPending,
    recoveryLeft: s.mfa_enabled ? await countUnusedRecoveryCodes(s.id) : 0,
  };
}

// เริ่ม enroll — สร้าง secret ใหม่ เก็บลง DB (เข้ารหัส) แต่ mfa_enabled ยัง false จนกว่าจะ
// ยืนยันโค้ดสำเร็จใน confirmMfaEnrollment คืน QR + manual key ให้ client แสดง
export async function startMfaEnrollment() {
  try {
    const s = await getStaffSessionPending();
    if (!s) return { success: false, error: 'กรุณาเข้าสู่ระบบใหม่' };
    if (s.mfa_enabled) return { success: false, error: 'บัญชีนี้เปิดใช้งาน MFA อยู่แล้ว' };

    const rl = await checkRateLimit(`mfa-enroll:${s.id}`, 5, 3600);
    if (!rl.allowed) return { success: false, error: 'ทำรายการถี่เกินไป กรุณารอสักครู่' };

    const secret = generateTotpSecret();
    await saveStaffMfaSecret(s.id, secret);
    const uri = totpAuthUri(secret, s.username || s.email || 'staff');
    const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 224 });
    return { success: true, qrDataUrl, manualKey: secret };
  } catch (error: unknown) {
    console.error('startMfaEnrollment Error:', error);
    Sentry.captureException(error, { tags: { area: 'staff-mfa-enroll' } });
    return { success: false, error: getErrorMessage(error) };
  }
}

// ยืนยันโค้ดจากแอป → เปิดใช้งาน MFA + สร้าง recovery code 10 ชุด (แสดงครั้งเดียว)
export async function confirmMfaEnrollment(code: string) {
  try {
    const s = await getStaffSessionPending();
    if (!s) return { success: false, error: 'กรุณาเข้าสู่ระบบใหม่' };
    if (s.mfa_enabled) return { success: false, error: 'บัญชีนี้เปิดใช้งาน MFA อยู่แล้ว' };

    const rl = await checkRateLimit(`mfa-enroll:${s.id}`, 5, 3600);
    if (!rl.allowed) return { success: false, error: 'ทำรายการถี่เกินไป กรุณารอสักครู่' };

    const secret = await getStaffMfaSecret(s.id);
    if (!secret) return { success: false, error: 'ยังไม่ได้เริ่มการตั้งค่า กรุณาสแกน QR ใหม่' };
    if (!verifyTotp(secret, (code ?? '').replace(/\s+/g, ''))) {
      return { success: false, error: 'รหัสยืนยันไม่ถูกต้อง กรุณาลองใหม่' };
    }

    const { plain, hashes } = generateRecoveryCodes();
    await replaceRecoveryCodes(s.id, hashes);

    await supabaseAdmin.from('staff_users').update({
      mfa_enabled: true,
      mfa_enrolled_at: new Date().toISOString(),
      mfa_grace_until: null,
    }).eq('id', s.id);

    // การกรอกโค้ด TOTP สดถือว่าผ่านปัจจัยที่สองสำหรับ session นี้แล้ว
    await supabaseAdmin.from('sessions').update({
      mfa_pending: false,
      expires_at: new Date(Date.now() + STAFF_SESSION_SECONDS * 1000).toISOString(),
    }).eq('token', s.token);
    (await cookies()).set('staff_session', s.token, staffCookieOptions(STAFF_SESSION_SECONDS));

    const ip = getClientIp(await headers());
    const ua = (await headers()).get('user-agent');
    await supabaseAdmin.from('staff_account_change_logs').insert({
      staff_id: s.id, field: 'mfa', old_value: null, new_value: 'enrolled', ip,
    });
    void logAuditEvent({
      category: 'auth', action: 'auth.mfa.enrolled', outcome: 'success',
      actor: { type: 'staff', id: s.id, label: s.username }, ip, userAgent: ua,
    });
    if (s.email) {
      sendSecurityAlertEmail({
        to: s.email, action: 'เปิดใช้งาน MFA (การยืนยันตัวตนสองชั้น)', whenText: nowThai(), ip,
      }).catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'security-alert-email' } }));
    }
    await afterStaffLogin({ id: s.id, email: s.email, username: s.username }, { ip, userAgent: ua, method: 'password' });

    return { success: true, recoveryCodes: plain, role: s.role, department: s.department };
  } catch (error: unknown) {
    console.error('confirmMfaEnrollment Error:', error);
    Sentry.captureException(error, { tags: { area: 'staff-mfa-enroll' } });
    return { success: false, error: getErrorMessage(error) };
  }
}

// สร้าง recovery code ชุดใหม่ (ยกเลิกชุดเดิมทั้งหมด) — ต้องยืนยันรหัสผ่านปัจจุบัน
export async function regenerateRecoveryCodes(currentPassword: string) {
  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบใหม่' };
    if (!session.mfa_enabled) return { success: false, error: 'ยังไม่ได้เปิดใช้งาน MFA' };

    const rl = await checkRateLimit(`staff-account-update:${session.id}`, 5, 300);
    if (!rl.allowed) return { success: false, error: 'ทำรายการถี่เกินไป กรุณารอสักครู่' };
    if (!currentPassword) return { success: false, error: 'กรุณากรอกรหัสผ่านปัจจุบัน' };

    const passwordOk = await verifyCurrentPassword(session.id, currentPassword);
    if (!passwordOk) return { success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };

    const { plain, hashes } = generateRecoveryCodes();
    await replaceRecoveryCodes(session.id, hashes);

    const ip = getClientIp(await headers());
    await supabaseAdmin.from('staff_account_change_logs').insert({
      staff_id: session.id, field: 'mfa', old_value: 'recovery-codes', new_value: 'regenerated', ip,
    });
    if (session.email) {
      sendSecurityAlertEmail({ to: session.email, action: 'สร้างรหัสสำรอง MFA ชุดใหม่', whenText: nowThai(), ip })
        .catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'security-alert-email' } }));
    }
    return { success: true, recoveryCodes: plain };
  } catch (error: unknown) {
    console.error('regenerateRecoveryCodes Error:', error);
    Sentry.captureException(error, { tags: { area: 'staff-mfa-enroll' } });
    return { success: false, error: getErrorMessage(error) };
  }
}

// ══ Manager — จัดการ MFA พนักงาน (หน้า /admin/manager/staff-approvals) ═════════════

// รายชื่อพนักงานที่อนุมัติแล้ว + สถานะ MFA ของแต่ละคน (manager เท่านั้น)
export async function getStaffMfaStatusList() {
  const session = await getStaffSession();
  if (!session || session.role !== 'manager') {
    return { success: false as const, error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' };
  }
  const { data, error } = await supabaseAdmin
    .from('staff_users')
    .select('id, employee_id, full_name, username, department, role, email, mfa_enabled, mfa_enrolled_at, mfa_grace_until')
    .eq('is_approved', true)
    .order('department', { ascending: true })
    .order('full_name', { ascending: true });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: data ?? [] };
}

// รีเซ็ต MFA ของพนักงานอีกคน — ผู้จัดการเท่านั้น เคลียร์ secret + recovery codes, บังคับออก
// จากระบบทุกอุปกรณ์, ตั้ง grace 3 วันให้ตั้งค่าใหม่, บันทึก audit + แจ้งอีเมล (ถ้ามี)
export async function resetStaffMfa(staffId: string) {
  try {
    const session = await getStaffSession();
    if (!session || session.role !== 'manager') {
      return { success: false, error: 'คุณไม่มีสิทธิ์ดำเนินการนี้' };
    }
    if (!UUID_RE.test(staffId ?? '')) return { success: false, error: 'ข้อมูลไม่ถูกต้อง' };
    if (staffId === session.id) {
      return { success: false, error: 'ไม่สามารถรีเซ็ต MFA ของตัวเองได้ กรุณาให้ผู้จัดการท่านอื่นดำเนินการ' };
    }

    const rl = await checkRateLimit(`mfa-reset:${session.id}`, 20, 3600);
    if (!rl.allowed) return { success: false, error: 'ทำรายการถี่เกินไป กรุณารอสักครู่' };

    const { data: target } = await supabaseAdmin
      .from('staff_users')
      .select('id, email, full_name, username')
      .eq('id', staffId)
      .maybeSingle();
    if (!target) return { success: false, error: 'ไม่พบพนักงานคนนี้' };

    const { error: updErr } = await supabaseAdmin.from('staff_users').update({
      mfa_secret: null,
      mfa_enabled: false,
      mfa_enrolled_at: null,
      mfa_grace_until: new Date(Date.now() + MFA_RESET_GRACE_DAYS * 86400_000).toISOString(),
    }).eq('id', staffId);
    if (updErr) throw updErr;

    await supabaseAdmin.from('staff_mfa_recovery_codes').delete().eq('staff_id', staffId);
    // ออกจากระบบทุกอุปกรณ์ของพนักงานคนนั้น + เพิกถอนอุปกรณ์ที่เชื่อถือ (บังคับ enroll ใหม่ตอน login ครั้งหน้า)
    await supabaseAdmin.from('sessions').delete().eq('staff_id', staffId).eq('actor_type', 'staff');
    await revokeAllTrustedDevices(staffId);

    const ip = getClientIp(await headers());
    await supabaseAdmin.from('staff_account_change_logs').insert({
      staff_id: staffId, field: 'mfa', old_value: 'enrolled',
      new_value: `reset by @${session.username}`, ip,
    });
    void logAuditEvent({
      category: 'auth', action: 'auth.mfa.reset', outcome: 'success',
      actor: { type: 'staff', id: session.id, label: session.username },
      target: { type: 'staff', id: staffId },
      ip,
      detail: { target_username: target.username, grace_days: MFA_RESET_GRACE_DAYS },
    });
    if (target.email) {
      sendSecurityAlertEmail({
        to: target.email, action: 'MFA ถูกรีเซ็ตโดยผู้จัดการ', whenText: nowThai(), ip,
        detail: `กรุณาตั้งค่า MFA ใหม่ภายใน ${MFA_RESET_GRACE_DAYS} วัน`,
      }).catch((e) => Sentry.captureException(e, { level: 'warning', tags: { area: 'security-alert-email' } }));
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('resetStaffMfa Error:', error);
    Sentry.captureException(error, { tags: { area: 'staff-mfa-reset' } });
    return { success: false, error: getErrorMessage(error) };
  }
}
// ══ Phase 3 — อุปกรณ์และเซสชันของตัวเอง (หน้า /admin/account) ═══════════════════

export async function getMyStaffSessionsAndDevices() {
  const session = await getStaffSession();
  if (!session) return { success: false as const, error: 'กรุณาเข้าสู่ระบบใหม่' };
  const currentToken = (await cookies()).get('staff_session')?.value ?? '';

  const [{ data: sessions }, { data: devices }] = await Promise.all([
    supabaseAdmin
      .from('sessions')
      .select('token, user_agent, ip, last_seen_at, created_at, expires_at')
      .eq('staff_id', session.id)
      .eq('actor_type', 'staff')
      .eq('mfa_pending', false),
    supabaseAdmin
      .from('staff_trusted_devices')
      .select('id, label, user_agent, ip, last_used_at, created_at, expires_at')
      .eq('staff_id', session.id),
  ]);

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
    devices: (devices ?? [])
      .map((d) => ({
        id: d.id as string,
        label: (d.label as string | null) ?? parseDeviceLabel(d.user_agent as string | null),
        ip: (d.ip as string | null) ?? null,
        lastUsedAt: d.last_used_at as string,
        expiresAt: d.expires_at as string,
      }))
      .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()),
  };
}

// เพิกถอน 1 เซสชัน (ระบุด้วย short id ที่ไม่ย้อนกลับเป็น token ได้)
export async function revokeStaffSession(sid: string) {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบใหม่' };
  const currentToken = (await cookies()).get('staff_session')?.value ?? '';

  const { data: rows } = await supabaseAdmin
    .from('sessions')
    .select('token')
    .eq('staff_id', session.id)
    .eq('actor_type', 'staff');

  const match = (rows ?? []).find((r) => sessionShortId(r.token as string) === sid);
  if (!match) return { success: false, error: 'ไม่พบเซสชันนี้' };
  if (match.token === currentToken) return { success: false, error: 'ไม่สามารถออกจากเซสชันปัจจุบันจากที่นี่ได้ ใช้ปุ่มออกจากระบบแทน' };

  await supabaseAdmin.from('sessions').delete().eq('token', match.token);
  void logAuditEvent({
    category: 'auth', action: 'auth.session.revoked', outcome: 'success',
    actor: { type: 'staff', id: session.id, label: session.username },
    ip: getClientIp(await headers()), detail: { scope: 'one' },
  });
  return { success: true };
}

// ออกจากทุกอุปกรณ์อื่น (เก็บเครื่องปัจจุบัน)
export async function revokeOtherStaffSessions() {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบใหม่' };
  const currentToken = (await cookies()).get('staff_session')?.value ?? '';

  const { data: del } = await supabaseAdmin
    .from('sessions')
    .delete()
    .eq('staff_id', session.id)
    .eq('actor_type', 'staff')
    .neq('token', currentToken)
    .select('token');
  void logAuditEvent({
    category: 'auth', action: 'auth.session.revoked', outcome: 'success',
    actor: { type: 'staff', id: session.id, label: session.username },
    ip: getClientIp(await headers()), detail: { scope: 'others', count: del?.length ?? 0 },
  });
  return { success: true };
}

// ลบอุปกรณ์ที่เชื่อถือ 1 รายการ (ครั้งหน้าที่เข้าจากเครื่องนั้นต้องยืนยัน MFA ใหม่)
export async function revokeStaffTrustedDevice(id: string) {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบใหม่' };
  if (!UUID_RE.test(id ?? '')) return { success: false, error: 'ข้อมูลไม่ถูกต้อง' };

  await supabaseAdmin
    .from('staff_trusted_devices')
    .delete()
    .eq('id', id)
    .eq('staff_id', session.id);
  void logAuditEvent({
    category: 'auth', action: 'auth.trusted_device.revoked', outcome: 'success',
    actor: { type: 'staff', id: session.id, label: session.username },
    target: { type: 'trusted_device', id }, ip: getClientIp(await headers()),
  });
  return { success: true };
}
