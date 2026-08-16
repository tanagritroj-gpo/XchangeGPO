import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// ★ พบระหว่าง system assessment (16 ส.ค. 2569) ว่าไม่มี security header ใดๆ เลย — เพิ่มชุดนี้
// เข้าไปหลังตรวจสอบโค้ดจริงแล้วว่าไม่มีจุดไหนพึ่งพฤติกรรมที่ header พวกนี้จะไปบล็อก:
// ไม่มี dangerouslySetInnerHTML ที่ไหนในโปรเจกต์, ไม่มี browser Supabase client (lib/supabase/client.ts)
// ถูก import ใช้งานจริงที่ไหนเลย (ดึงข้อมูลผ่าน server action หมด ไม่มี client-side fetch ตรงไป
// Supabase REST), ไม่มี next-themes ThemeProvider ห่ออยู่ (เลยไม่มี inline FOUC-script ให้กังวล),
// กล้องถ่ายรูปใบส่งของ (Step2Items.tsx) ใช้ <input type="file" capture> ให้ OS เปิดแอปกล้องเอง
// ไม่ใช้ getUserMedia() ในหน้าเว็บตรงๆ จึงปิด Permissions-Policy camera ได้โดยไม่กระทบฟีเจอร์นี้
//
// ★ ตั้งใจไม่ใส่ Content-Security-Policy ในชุดนี้ — ลองใส่ไปแล้วรอบแรก (16 ส.ค. 2569) เจอปัญหา
// จริงตอน dev 2 อย่าง (React dev mode ต้องใช้ eval(), Turbopack HMR ต้องใช้ WebSocket ที่
// connect-src 'self' ไม่ครอบคลุมแน่นอนทุกเบราว์เซอร์) แก้ไปเป็น CSP-เฉพาะ-production แล้ว แต่
// ทีมตัดสินใจว่าไม่คุ้มความเสี่ยง เพราะยังไม่เคยทดสอบผ่านทุก flow ที่ต้อง login (CSR/คลัง/
// โลจิสติกส์/manager/แชทบอท) จริง — ไม่มีคนเชี่ยวชาญ CSP คอยดูแลต่อ ถ้าจะกลับมาทำอีกครั้งในอนาคต
// ดูรายละเอียด/allowlist ที่เคยตั้งไว้ + เหตุผลเต็มๆ ใน 02-valuation-uat.md (หัวข้อ security
// headers) และแนะนำให้เริ่มด้วย Content-Security-Policy-Report-Only ก่อนสลับเป็นบังคับจริง
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // max-age 2 ปี — ตั้งยาวเพราะโดเมนนี้ใช้ HTTPS อยู่แล้วผ่าน Vercel เป็นปกติ ไม่มี fallback
  // เป็น HTTP ให้ต้องเผื่อ ไม่ใส่ preload (การ submit เข้า HSTS preload list ของเบราว์เซอร์
  // เป็นการตัดสินใจแยกที่ควรทำอย่างตั้งใจ ไม่ใช่ผลพลอยได้จากการตั้ง header นี้)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },

  // ✅ ลบ/comment บรรทัด cacheComponents ออก — ยืนยันแล้วจาก error log
  // ว่า Vercel build error เพราะ flag นี้ขัดแย้งกับ "dynamic" export
  // experimental: {
  //   cacheComponents: true,
  // },

  experimental: {
    // ★ default 1MB ไม่พอสำหรับ createReturnRequest ที่ตอนนี้แนบได้ทั้งลายเซ็น (base64
    // สูงสุด ~2.7MB) + รูปใบส่งของสูงสุด 5 รูป (บีบอัดฝั่ง client แล้วเหลือ ~2MB/รูปดิบเป็น
    // safety net ดู lib/delivery-photo-limits.ts) — base64 encode เพิ่ม overhead ~33% ทำให้
    // worst case จริงคือ 2.7MB (ลายเซ็น) + 5 × ~2.7MB (รูป, 2MB ดิบ→base64) ≈ 16.0MB ซึ่งชนขอบ
    // 16mb เดิมพอดี (แทบไม่มี margin) — ตั้ง 24mb ให้มี headroom จริงจาก worst case ที่คำนวณได้
    // โดยไม่ปล่อยเปิดกว้างเกินจำเป็น
    serverActions: {
      bodySizeLimit: '24mb',
    },
  },
};

// authToken มาจาก SENTRY_AUTH_TOKEN ที่ยังไม่ได้ตั้ง (ข้ามไว้ก่อนตามที่ตกลงกัน) — ไม่มี
// token ก็ build ผ่านได้ปกติ แค่ไม่ได้ upload source map ให้ stack trace อ่านง่ายเท่านั้น
// เพิ่ม env var นี้เมื่อไหร่ก็ทำงานได้เลยไม่ต้องแก้โค้ดจุดนี้อีก
export default withSentryConfig(nextConfig, {
  org: 'gpo-f6',
  project: 'gpo-xchange-portal',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});