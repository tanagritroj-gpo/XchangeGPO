'use server'

import { z } from 'zod';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';

const RegisterSchema = z.object({
  hospital_name: z.string().min(1).max(200),
  province: z.string().min(1).max(100),
  contact_name: z.string().min(1).max(100),
  position: z.string().min(1).max(100),
  phone: z.string().regex(/^[0-9+\-\s]{9,15}$/, 'รูปแบบเบอร์โทรไม่ถูกต้อง'),
  email: z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  signature_url: z.string().url(),
});

export async function registerCustomer(payload: unknown) {
  try {
    // 1. Validate input ก่อนทุกอย่าง
    const parsed = RegisterSchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false, error: 'ข้อมูลที่กรอกไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' };
    }
    const data = parsed.data;

    // 2. Rate limit ป้องกัน spam registration (3 ครั้ง/ชม. ต่ออีเมล)
    const allowed = await checkRateLimit(`register:${data.email}`, 3600, 3);
    if (!allowed) {
      return { success: false, error: 'พยายามลงทะเบียนถี่เกินไป กรุณาลองใหม่ภายหลัง' };
    }

    // 3. ตรวจสอบว่า signature_url เป็นไฟล์จาก storage ของระบบเราเองจริง
    const storageBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!storageBase || !data.signature_url.startsWith(storageBa