import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * พฤติกรรมเมื่อเช็ค rate limit ไม่สำเร็จ (RPC error / ตาราง `rate_limits` ล่ม / migration ยังไม่รัน):
 *
 * - `'closed'` (**ค่าเริ่มต้น — secure by default**): ปฏิเสธคำขอ (`allowed: false`)
 *   ใช้กับทุก flow ที่ rate limit เป็น "การป้องกันความปลอดภัย" จริง — login, reset password,
 *   register, เปลี่ยน credential, ส่งอีเมล, สร้างคำร้อง ฯลฯ ถ้า DB มีปัญหาจนเช็คโควตาไม่ได้
 *   การป้องกัน brute-force / credential-stuffing / spam ของ flow นั้นก็หลุดพร้อมกัน — ปิดไว้ก่อน
 *   ปลอดภัยกว่า (ส่วนใหญ่ flow พวกนี้ต้องแตะ DB อยู่แล้ว ถ้า DB ล่มก็ทำงานต่อไม่ได้อยู่ดี)
 *
 * - `'open'`: อนุญาตให้ผ่าน (`allowed: true`)
 *   ใช้เฉพาะจุดที่ rate limit เป็นแค่ "กันกดรัว" ของฟีเจอร์ read-only ที่ public พึ่งพา —
 *   หน้าติดตามสถานะ (`track:*`) การบล็อกผู้ใช้ทุกคนตอน DB สะดุดชั่วคราวเสียหายมากกว่า
 *   ความเสี่ยง enumeration ในช่วงสั้น ๆ นั้น
 *
 * ทั้งสองโหมดยิง Sentry alert ทันทีที่ fallback ทำงาน (การป้องกันหลุดจริงจากปัญหา DB
 * ไม่ใช่แค่บันทึกเงียบ ๆ) — พบว่าจำเป็นระหว่าง security audit 11 ส.ค. 2569 และแยกโหมดชัดเจน
 * ระหว่าง audit 28 ส.ค. 2569 (เดิม fail-open ทุกกรณีรวม login/reset/register ด้วย)
 */
interface RateLimitOptions {
  failMode?: 'open' | 'closed';
}

/**
 * Fixed-window rate limiter เก็บ state ใน Postgres (ตาราง rate_limits + ฟังก์ชัน increment_rate_limit
 * ดู migration_rate_limits.sql) — เลือกใช้ Postgres แทน Redis/Vercel KV เพื่อให้ self-host ได้
 * โดยไม่ต้องพึ่ง service ภายนอกเพิ่ม เพราะ Postgres มีอยู่แล้วในทุก deployment ของโปรเจกต์นี้
 *
 * @param key          คีย์ที่ใช้แยกโควตา เช่น `track:ip:1.2.3.4` หรือ `login-staff:someuser`
 * @param limit        จำนวนครั้งสูงสุดที่อนุญาตต่อ window
 * @param windowSeconds ความยาวของ window เป็นวินาที
 * @param options      `failMode` — พฤติกรรมเมื่อเช็คไม่สำเร็จ (ดู {@link RateLimitOptions});
 *                     ค่าเริ่มต้น `'closed'` — จุดที่ต้องการ `'open'` ต้องระบุชัดเจนที่ call site
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const failMode = options.failMode ?? 'closed';

  let data: unknown = null;
  let error: { message?: string } | null = null;
  try {
    ({ data, error } = await supabaseAdmin
      .rpc('increment_rate_limit', { p_key: key, p_window_seconds: windowSeconds })
      .maybeSingle());
  } catch (thrown) {
    // network/throw จาก supabase-js ก็คือ "เช็คไม่ได้" เหมือน { error } — เข้า fallback path
    // เดียวกัน ไม่ปล่อยให้ reject ทะลุไป caller (บาง call site ไม่มี try/catch ครอบ)
    error = { message: thrown instanceof Error ? thrown.message : String(thrown) };
  }

  if (error || !data) {
    const failingOpen = failMode === 'open';
    console.error(
      `[rate-limit] check failed, failing ${failingOpen ? 'open' : 'closed'}:`,
      error?.message,
    );
    // ★ ส่งแค่ "หมวด" ของ key (ส่วนก่อน ':' แรก เช่น "login-customer", "track") ไม่ส่ง
    // key เต็ม เพราะหลาย call site ฝัง email/IP ของผู้ใช้ไว้ในนั้น (เช่น
    // `login-customer:${email}`) — ส่งทั้งก้อนจะหลุด PII เข้า Sentry ตรงๆ
    Sentry.captureMessage(`rate-limit check failed, failing ${failingOpen ? 'open' : 'closed'}`, {
      level: 'error',
      tags: { area: 'rate-limit', keyCategory: key.split(':')[0], failMode },
      extra: { limit, windowSeconds, dbError: error?.message },
    });
    return failingOpen
      ? { allowed: true, remaining: limit }
      : { allowed: false, remaining: 0 };
  }

  const count = (data as { current_count: number }).current_count;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}
