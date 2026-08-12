import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/sentry-scrub';

// runtime edge (middleware ฯลฯ) — โปรเจกต์นี้ยังไม่มี middleware.ts จริงจัง แต่ config
// นี้จำเป็นสำหรับ instrumentation.ts ที่เช็ค NEXT_RUNTIME === 'edge' เผื่ออนาคตมี edge
// function เพิ่ม (เช่น middleware auth guard) จะได้ error tracking ครบตั้งแต่ต้น
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  sendDefaultPii: false,
  beforeSend: (event) => scrubSentryEvent(event),
  beforeSendTransaction: (event) => scrubSentryEvent(event),
});
