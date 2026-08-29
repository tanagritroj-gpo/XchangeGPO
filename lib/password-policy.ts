import { z } from 'zod';

/**
 * นโยบายรหัสผ่านของระบบ — ดูเอกสารเต็ม 12-password-policy-design.md
 * ออกแบบตาม NIST SP 800-63B + OWASP ASVS 4.0 L2:
 *  - ความยาวขั้นต่ำ 12 (ไม่มี MFA → ASVS ให้ 12)
 *  - ไม่มีกฎองค์ประกอบ (upper/lower/digit/symbol) — โดยตั้งใจตามมาตรฐาน
 *  - ต้องตรวจกับ HaveIBeenPwned ทุกครั้งที่ตั้ง/เปลี่ยนรหัสผ่าน (isPasswordBreached — server เท่านั้น)
 *  - กันคำที่เกี่ยวกับบัญชี/ระบบ + รหัสตัวซ้ำ/เรียงลำดับ
 *
 * ไฟล์นี้ isomorphic — client form (strength meter, shape check) และ server action ใช้ร่วมกันได้
 * (ไม่ import 'server-only', ไม่ใช้ Buffer/node:crypto — ใช้ TextEncoder + Web Crypto)
 */

export const MIN_PASSWORD_LENGTH = 12;
// bcrypt ตัด input ที่ 72 ไบต์เงียบ ๆ — จำกัดทั้งจำนวนตัวอักษรและไบต์
export const MAX_PASSWORD_LENGTH = 72;

const STATIC_BLOCKLIST = ['password', 'passwd', 'gpoxchange', 'xchangegpo', 'gpo-xchange', 'องค์การเภสัช'];

const SEQUENTIAL_SOURCES = [
  'abcdefghijklmnopqrstuvwxyz',
  '01234567890123456789',
  'qwertyuiopasdfghjklzxcvbnm',
];

/** ตัวซ้ำล้วน หรือ substring ของลำดับ keyboard/ตัวเลข/ตัวอักษร (รวมย้อนกลับ) */
function isTrivial(pw: string): boolean {
  if (pw.length < 4) return false;
  if (/^(.)\1+$/.test(pw)) return true;
  const lower = pw.toLowerCase();
  for (const src of SEQUENTIAL_SOURCES) {
    if (src.includes(lower)) return true;
    if ([...src].reverse().join('').includes(lower)) return true;
  }
  return false;
}

const byteLength = (s: string): number => new TextEncoder().encode(s).length;

/** แตกอีเมล/username/รหัสพนักงาน/ชื่อ ออกเป็นคำย่อย ≥ 4 ตัว ไว้เทียบว่ารหัสผ่านมีคำพวกนี้ปนไหม */
function identifierTokens(identifiers: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of identifiers) {
    if (!raw) continue;
    const s = String(raw).toLowerCase().trim();
    const parts = [s, s.split('@')[0], ...s.split(/[^a-z0-9ก-๙]+/i)];
    for (const chunk of parts) {
      if (chunk && chunk.length >= 4) out.add(chunk);
    }
  }
  return [...out];
}

export interface PasswordCheckResult {
  ok: boolean;
  /** ข้อความภาษาไทยพร้อมแสดงให้ผู้ใช้ (เมื่อ ok = false) */
  error?: string;
}

/**
 * ตรวจ "รูปแบบ" รหัสผ่านล้วน ๆ (ความยาว/ไบต์/ตัวซ้ำ/คำต้องห้าม) — sync, ไม่เรียก network
 * ใช้ได้ทั้ง client และ server. **ไม่รวม** การตรวจ HIBP (ดู isPasswordBreached)
 *
 * @param opts.identifiers อีเมล/username/รหัสพนักงาน/ชื่อ ของเจ้าของบัญชี เพื่อกันรหัสผ่านที่มีคำพวกนี้
 */
export function assertPasswordAllowed(
  password: unknown,
  opts: { identifiers?: readonly string[] } = {},
): PasswordCheckResult {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'กรุณากรอกรหัสผ่าน' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `รหัสผ่านต้องไม่เกิน ${MAX_PASSWORD_LENGTH} ตัวอักษร` };
  }
  if (byteLength(password) > 72) {
    return { ok: false, error: 'รหัสผ่านยาวเกินไป (เกิน 72 ไบต์) — ลดจำนวนอักขระภาษาไทยลง' };
  }
  if (isTrivial(password)) {
    return { ok: false, error: 'รหัสผ่านคาดเดาง่ายเกินไป (เป็นตัวซ้ำหรือเรียงลำดับ)' };
  }
  const lower = password.toLowerCase();
  const banned = [...STATIC_BLOCKLIST, ...identifierTokens(opts.identifiers ?? [])];
  if (banned.some((b) => lower.includes(b))) {
    return { ok: false, error: 'รหัสผ่านต้องไม่มีอีเมล ชื่อผู้ใช้ หรือคำที่เกี่ยวกับระบบอยู่ในนั้น' };
  }
  return { ok: true };
}

/**
 * Zod field สำหรับ form ฝั่ง client (react-hook-form + zodResolver) — เช็ครูปแบบพื้นฐาน
 * (identifier-specific check ทำที่ server เพราะ client ไม่รู้ทุก identifier ล่วงหน้า)
 */
export const passwordField = z.string().superRefine((val, ctx) => {
  const r = assertPasswordAllowed(val);
  if (!r.ok) ctx.addIssue({ code: 'custom', message: r.error ?? 'รหัสผ่านไม่ผ่านเงื่อนไข' });
});

/**
 * ตรวจว่ารหัสผ่านเคยปรากฏใน data breach ผ่าน HaveIBeenPwned range API (k-anonymity)
 * — ส่งแค่ 5 ตัวแรกของ SHA-1 hash ไม่เคยส่งรหัสผ่าน/hash เต็ม
 * — timeout 3s, fail-open (`checkFailed: true`) เมื่อ API ล่ม/ช้า — caller ควรยิง Sentry warning
 *   (fail-open เพราะ HIBP ไม่ใช่เกราะกัน brute-force โดยตรง — ยังมีความยาว 12 + rate limit)
 *
 * เรียกจาก server action เท่านั้น
 */
export async function isPasswordBreached(
  password: string,
): Promise<{ breached: boolean; checkFailed: boolean }> {
  try {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
    const hash = [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HIBP responded ${res.status}`);

    const body = await res.text();
    const breached = body.split('\n').some((line) => {
      const [suf, count] = line.split(':');
      return suf?.trim().toUpperCase() === suffix && Number(count) > 0;
    });
    return { breached, checkFailed: false };
  } catch {
    return { breached: false, checkFailed: true };
  }
}

/**
 * ตรวจรหัสผ่านใหม่ครบชุด (รูปแบบ + HIBP) — ใช้ใน server action ทุกจุดที่ตั้ง/เปลี่ยนรหัสผ่าน
 * คืน `breachCheckFailed: true` ถ้า HIBP ล่ม (fail-open) — caller ควรยิง Sentry warning
 */
export async function validateNewPassword(
  password: string,
  opts: { identifiers?: readonly string[] } = {},
): Promise<{ ok: true; breachCheckFailed: boolean } | { ok: false; error: string }> {
  const shape = assertPasswordAllowed(password, opts);
  if (!shape.ok) return { ok: false, error: shape.error ?? 'รหัสผ่านไม่ผ่านเงื่อนไข' };

  const breach = await isPasswordBreached(password);
  if (breach.breached) {
    return {
      ok: false,
      error: 'รหัสผ่านนี้เคยปรากฏในเหตุการณ์ข้อมูลรั่วไหลจากบริการอื่น กรุณาใช้รหัสผ่านอื่น',
    };
  }
  return { ok: true, breachCheckFailed: breach.checkFailed };
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  hint: string;
}

/** ประเมินความแข็งแรงแบบคร่าว ๆ สำหรับ strength meter ฝั่ง client (ไม่เรียก network) */
export function assessPasswordStrength(password: string): PasswordStrength {
  const labels = ['อ่อนมาก', 'อ่อน', 'พอใช้', 'ดี', 'ดีมาก'];
  if (!password) return { score: 0, label: labels[0], hint: '' };

  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (password.length >= 16) score += 1;
  if (password.length >= 20) score += 1;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9฀-๿]/, /[฀-๿]/]
    .filter((re) => re.test(password)).length;
  if (classes >= 3) score += 1;
  if (isTrivial(password) || password.length < MIN_PASSWORD_LENGTH) score = Math.min(score, 1);

  const clamped = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4;
  const hint =
    password.length < MIN_PASSWORD_LENGTH
      ? `ต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`
      : clamped < 3
        ? 'ลองใช้วลี 3–4 คำที่จำได้ เช่น "แมวส้มชอบนอนหลับ2569"'
        : '';
  return { score: clamped, label: labels[clamped], hint };
}
