import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // เก็บ trace เพื่อดู performance ของ server actions/API routes — sample rate ต่ำใน
  // production กันเปลืองโควต้า (event volume) ของ Sentry เต็มที่ใน dev เพื่อ debug ง่าย
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  // ★ ต้องปิดเสมอ — Sentry จะแนบ IP/cookie/header ให้อัตโนมัติถ้าเปิด ระบบนี้มี PII
  // ลูกค้าตาม PDPA ต้องกรองเองผ่าน beforeSend (scrubSentryEvent) แทน ไม่ใช้ default ของ SDK
  sendDefaultPii: false,
  beforeSend: (event) => scrubSentryEvent(event),
  beforeSendTransaction: (event) => scrubSentryEvent(event),
});
