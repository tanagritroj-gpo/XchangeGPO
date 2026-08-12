import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  // ★ ปิด Session Replay/User Feedback widget โดยตั้งใจ — ไม่เปิดใช้ตอนนี้เพราะเป็นการ
  // บันทึกหน้าจอผู้ใช้จริง (แม้ default จะ mask text/media ให้อยู่แล้วก็ตาม) ต้องพิจารณา
  // เรื่อง PDPA เพิ่มเติมก่อนถ้าจะเปิดใช้ในอนาคต ไม่ใช่แค่ error+performance monitoring
  // เฉยๆ แบบที่ตั้งใจในรอบนี้
  sendDefaultPii: false,
  beforeSend: (event) => scrubSentryEvent(event),
  beforeSendTransaction: (event) => scrubSentryEvent(event),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
