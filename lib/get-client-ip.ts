/**
 * ดึง IP ของ client จาก request headers — รองรับทั้งกรณีอยู่หลัง proxy/CDN (Vercel,
 * Cloudflare) และ self-host เปล่า ๆ (nginx/traefik)
 *
 * ใช้เป็น rate-limit key (`login-*-ip:`, `register-*-ip:`, `track:ip:` ฯลฯ) และบันทึกลง
 * audit log (`*_password_reset_logs.ip`, `*_account_change_logs.ip`) — **ไม่ได้ใช้ตัดสิน
 * สิทธิ์** เพราะ `x-forwarded-for` ปลอมได้จากฝั่ง client; ตัวตนจริงมาจากตาราง `sessions` เสมอ
 *
 * เดิม copy ฟังก์ชันนี้ไว้ 3 ไฟล์ (auth.ts / auth-actions.ts / auth-staff.ts /
 * tracking-actions.ts) — รวมเป็นจุดเดียวที่นี่ตาม security audit 28 ส.ค. 2569 (§6)
 */
export function getClientIp(headerList: Headers): string {
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = headerList.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}
