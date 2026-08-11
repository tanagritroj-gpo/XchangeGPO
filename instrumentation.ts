import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// จับ error ที่เกิดใน server component/route handler render lifecycle ที่ Next.js
// เพิ่งเปิด hook นี้ให้ตั้งแต่ v15 — ไม่ครอบคลุม server action errors (ดู try/catch เดิม
// ในแต่ละ action ที่ log ไว้อยู่แล้ว) แต่ครอบคลุม error ที่หลุดจาก React render/RSC เอง
export const onRequestError = Sentry.captureRequestError;
