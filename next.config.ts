import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // ✅ ลบ/comment บรรทัด cacheComponents ออก — ยืนยันแล้วจาก error log
  // ว่า Vercel build error เพราะ flag นี้ขัดแย้งกับ "dynamic" export
  // experimental: {
  //   cacheComponents: true,
  // },
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