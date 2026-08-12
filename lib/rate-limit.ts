import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Fixed-window rate limiter เก็บ state ใน Postgres (ตาราง rate_limits + ฟังก์ชัน increment_rate_limit
 * ดู migration_rate_limits.sql) — เลือกใช้ Postgres แทน Redis/Vercel KV เพื่อให้ self-host ได้
 * โดยไม่ต้องพึ่ง service ภายนอกเพิ่ม เพราะ Postgres มีอยู่แล้วในทุก deployment ของโปรเจกต์นี้
 *
 * @param key         คีย์ที่ใช้แยกโควตา เช่น `track:ip:1.2.3.4` หรือ `track:miss:1.2.3.4`
 * @param limit       จำนวนครั้งสูงสุดที่อนุญาตต่อ window
 * @param windowSeconds ความยาวของ window เป็นวินาที
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const { data, error } = await supabaseAdmin
    .rpc('increment_rate_limit', { p_key: key, p_window_seconds: windowSeconds })
    .maybeSingle();

  // ถ้า rate limit เช็คไม่ได้ (เช่น migration ยังไม่รัน) ให้ "เปิดผ่าน" แทนที่จะบล็อกผู้ใช้ปกติ
  // แต่ log ไว้เพื่อให้รู้ว่าต้องรีบแก้ — fail-open เฉพาะ tracking (ข้อมูล read-only, ความเสี่ยงต่ำกว่า fail-closed ที่ปิดฟีเจอร์ทั้งหมด)
  // ★ ผูกเข้า Sentry ด้วย (พบระหว่าง security audit 11 ส.ค. 2569) — เดิมมีแค่ console.error
  // ที่ไม่มีใครเห็นจริงจนกว่าจะไป grep log เอง ตอนนี้ยิง alert ทันทีที่การป้องกัน brute-force
  // ทั้งระบบหลุดจริงจากปัญหา DB ไม่ใช่แค่บันทึกเงียบๆ
  if (error || !data) {
    console.error('[rate-limit] check failed, failing open:', error?.message);
    // ★ ส่งแค่ "หมวด" ของ key (ส่วนก่อน ':' แรก เช่น "login-customer", "track") ไม่ส่ง
    // key เต็ม เพราะหลาย call site ฝัง email/IP ของผู้ใช้ไว้ในนั้น (เช่น
    // `login-customer:${email}`) — ส่งทั้งก้อนจะหลุด PII เข้า Sentry ตรงๆ
    Sentry.captureMessage('rate-limit check failed, failing open', {
      level: 'error',
      tags: { area: 'rate-limit', keyCategory: key.split(':')[0] },
      extra: { limit, windowSeconds, dbError: error?.message },
    });
    return { allowed: true, remaining: limit };
  }

  const count = (data as { current_count: number }).current_count;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}