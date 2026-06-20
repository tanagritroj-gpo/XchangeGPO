import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ✅ ลบ/comment บรรทัด cacheComponents ออก — ยืนยันแล้วจาก error log
  // ว่า Vercel build error เพราะ flag นี้ขัดแย้งกับ "dynamic" export
  // experimental: {
  //   cacheComponents: true,
  // },
};

export default nextConfig;