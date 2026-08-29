/**
 * Account lockout — ปิด audit §P1-4 / Go-Live Gate G1-4
 *
 * ทำงานคู่กับ rate limit (ที่กันการยิงถี่เป็น burst) — lockout กันการเดารหัสผ่าน
 * แบบ "ช้าแต่ต่อเนื่อง" ที่หลบ rate-limit window ได้ (rate limit reset ทุก 5 นาที =
 * เดาได้ ~120 ครั้ง/ชม./บัญชี ถ้าไม่มี lockout)
 *
 * เก็บ state บนแถวผู้ใช้เอง (`failed_login_count`, `locked_until` — migration
 * 20260828133725) ทั้ง `staff_users` และ `b2b_customers` — บัญชีที่ "ไม่มีจริง"
 * ล็อกไม่ได้ (ไม่มีแถว) พึ่ง per-IP + per-username rate limit ตามมาตรฐาน
 *
 * นโยบาย (ยืนยันโดยผู้ใช้ 28 ส.ค. 2569):
 *  - ล้มเหลวสะสมถึง 5 ครั้ง → ล็อก 15 นาที
 *  - ครั้งที่ 6 → 30 นาที · ครั้งที่ ≥ 7 → 60 นาที (cap)
 *  - login สำเร็จ / reset password ผ่าน OTP → เคลียร์ทั้ง count และ lock
 *  - แสดงข้อความ lockout ต่อผู้ใช้ตรง ๆ (ช่วยคนปกติ — attacker รู้อยู่แล้วว่ากำลัง fail)
 */

export const LOCKOUT_THRESHOLD = 5;

/** นาทีที่จะล็อก เมื่อ failedCount (นับรวมครั้งล่าสุดแล้ว) — 0 = ยังไม่ถึงเกณฑ์ */
export function lockDurationMinutes(failedCount: number): number {
  if (failedCount < LOCKOUT_THRESHOLD) return 0;
  if (failedCount === LOCKOUT_THRESHOLD) return 15;
  if (failedCount === LOCKOUT_THRESHOLD + 1) return 30;
  return 60;
}

/** สถานะล็อก ณ ปัจจุบันจากค่า `locked_until` ใน DB */
export function lockStatus(lockedUntil: string | null | undefined): {
  locked: boolean;
  minutesLeft: number;
} {
  if (!lockedUntil) return { locked: false, minutesLeft: 0 };
  const msLeft = new Date(lockedUntil).getTime() - Date.now();
  if (msLeft <= 0) return { locked: false, minutesLeft: 0 };
  return { locked: true, minutesLeft: Math.ceil(msLeft / 60_000) };
}

/** ข้อความแจ้งผู้ใช้เมื่อบัญชีถูกล็อก */
export function lockedMessage(minutesLeft: number): string {
  return `บัญชีถูกล็อกชั่วคราวเนื่องจากกรอกรหัสผ่านผิดหลายครั้ง กรุณาลองใหม่ในอีก ${minutesLeft} นาที หรือรีเซ็ตรหัสผ่าน`;
}

/**
 * คำนวณผลลัพธ์หลัง login "ล้มเหลว" 1 ครั้ง — คืนค่าที่จะเขียนกลับลงแถวผู้ใช้
 * (caller เป็นคนสั่ง update จริง เพราะชื่อตารางต่างกัน staff vs customer)
 */
export function recordFailure(currentCount: number): {
  failed_login_count: number;
  locked_until: string | null;
  justLocked: boolean;
} {
  const failed_login_count = currentCount + 1;
  const mins = lockDurationMinutes(failed_login_count);
  return {
    failed_login_count,
    locked_until: mins > 0 ? new Date(Date.now() + mins * 60_000).toISOString() : null,
    justLocked: mins > 0,
  };
}

/** ค่าที่ต้องเขียนกลับเมื่อ login สำเร็จ หรือ reset password สำเร็จ */
export const CLEARED = { failed_login_count: 0, locked_until: null } as const;
