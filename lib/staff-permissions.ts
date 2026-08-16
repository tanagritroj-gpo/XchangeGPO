// เช็คสิทธิ์ "ต้องเป็นแผนกนี้ หรือเป็น manager" — เดิมก็อปวางแยกกันใน wh-actions.ts /
// logistics-actions.ts / sla-actions.ts / notification-actions.ts / manager-actions.ts
// (getManagerOrCsrSession) รวมเป็นจุดเดียวที่นี่ ★ ไม่รวม csr-actions.ts เพราะ getCSRSession
// ที่นั่นเช็คจาก department ล้วนๆ โดยตั้งใจไม่สนใจ role (ดูคอมเมนต์ "authorization guard
// uses department, not role" ใน csr-actions.test.ts) — ต่างจาก pattern ด้านล่างนี้
//
// อยู่นอกไฟล์ 'use server' โดยตั้งใจ — Next.js บังคับว่าทุก export จากไฟล์ 'use server'
// ต้องเป็น async function (ไม่งั้น `next build` fail ทันทีด้วย "Server Actions must be
// async functions") แต่ฟังก์ชันนี้เป็น pure function ล้วนๆ ไม่มี await ข้างในเลย
// (ไม่เรียก cookies()/DB เอง — caller เป็นคน await getStaffSession() เองแล้วส่ง session
// เข้ามา) ทำให้เทสต์ import ตัวจริงมาใช้ตรงๆ ได้โดยไม่ต้อง mock เลย
export function assertDepartmentAccess<T extends { role: string; department: string }>(
  session: T | null,
  department: 'csr' | 'log' | 'wh' | 'sale'
): T {
  if (!session) throw new Error("ไม่ได้ Login");
  if (session.role !== 'manager' && session.department !== department) {
    throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  }
  return session;
}
