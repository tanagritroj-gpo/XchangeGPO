import 'server-only';
import { createClient } from '@supabase/supabase-js';

// ★ import 'server-only' กัน client component ไหน import ตัวนี้เข้าไปโดยไม่ตั้งใจ (เช่น
// copy import ผิดตอน refactor) — ปกติ SUPABASE_SERVICE_ROLE_KEY จะไม่หลุดไปเป็นค่าจริงใน
// client bundle อยู่แล้ว (Next.js inline เฉพาะ NEXT_PUBLIC_* เท่านั้น) แต่ถ้าไม่มี guard นี้
// ความผิดพลาดจะเงียบ (พังตอน runtime เพราะ key เป็น undefined) แทนที่จะ error ตั้งแต่ build
// — ให้ตรงกับ pattern เดียวกับ lib/rate-limit.ts ที่มี guard นี้อยู่แล้ว

// สร้างตัวแปรเดียวและ export ออกไปใช้
export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);