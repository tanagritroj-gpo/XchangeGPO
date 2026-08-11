import type { Event as SentryEvent } from '@sentry/nextjs';

/**
 * ระบบนี้เก็บ PII ลูกค้า/พนักงานเยอะ (อีเมล, เบอร์โทร, ที่อยู่, ลายเซ็น, ชื่อ) ตาม PDPA
 * ก่อนส่ง error event ออกไปที่ Sentry (third-party) ต้องกรองข้อมูลพวกนี้ออกก่อนเสมอ —
 * ใช้ควบคู่กับ sendDefaultPii: false ใน Sentry.init() ของทุก runtime (client/server/edge)
 * ไม่ใช่พึ่ง flag นั้นอย่างเดียว เพราะ field พวกนี้อาจหลุดมาผ่าน breadcrumb/extra/context
 * ที่โค้ดจุดอื่นแนบเข้ามาทีหลังได้ (เช่นใครเผลอ Sentry.setContext('customer', {...}))
 * scrub แบบ recursive ตรงนี้เป็นเกราะสุดท้ายก่อนออกจากแอปจริงๆ
 */
const SENSITIVE_KEY_PATTERN =
  /email|phone|password|otp|token|signature|address|addr_|hospital|contact_name|customer|ip_address|cookie|authorization/i;

function scrubValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((v) => scrubValue(v, seen));

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[Filtered]' : scrubValue(val, seen);
  }
  return result;
}

export function scrubSentryEvent<T extends SentryEvent>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      const headers = { ...event.request.headers };
      delete headers.Cookie;
      delete headers.cookie;
      delete headers.Authorization;
      delete headers.authorization;
      event.request.headers = headers;
    }
    if (event.request.data) {
      event.request.data = scrubValue(event.request.data, new WeakSet()) as typeof event.request.data;
    }
  }

  if (event.extra) {
    event.extra = scrubValue(event.extra, new WeakSet()) as typeof event.extra;
  }

  if (event.contexts) {
    for (const key of Object.keys(event.contexts)) {
      // เก็บ context มาตรฐานของ Sentry เอง (trace/runtime/app/os/device) ไว้ตามเดิม —
      // ไม่มี PII อยู่แล้ว และจำเป็นต่อการ debug (เช่น trace id เชื่อม transaction)
      if (['trace', 'runtime', 'app', 'os', 'device', 'culture'].includes(key)) continue;
      event.contexts[key] = scrubValue(event.contexts[key], new WeakSet()) as Record<string, unknown>;
    }
  }

  // ระบบนี้ไม่มี Supabase Auth เป็นตัวตนหลัก (custom session table) และไม่ควรส่ง
  // email/ชื่อจริงของลูกค้าหรือพนักงานออกไปที่ Sentry เก็บได้แค่ id เท่านั้น
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      data: b.data ? (scrubValue(b.data, new WeakSet()) as typeof b.data) : b.data,
    }));
  }

  return event;
}
