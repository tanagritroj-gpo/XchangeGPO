import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
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