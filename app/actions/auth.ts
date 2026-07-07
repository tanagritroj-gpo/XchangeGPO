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
    const parsed = RegisterSchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false, error: 'ข้อมูลที่กรอกไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' };
    }
    const data = parsed.data;

    const allowed = await checkRateLimit(`register:${data.email}`, 3600, 3);
    if (!allowed) {
      return { success: false, error: 'พยายามลงทะเบียนถี่เกินไป กรุณาลองใหม่ภายหลัง' };
    }

    // 3. ตรวจสอบว่า signature_url เป็นไฟล์จาก storage ของระบบเราเองจริง
    const storageBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!storageBase || !data.signature_url.startsWith(storageBase)) {
      return { success: false, error: 'ข้อมูลลายเซ็นไม่ถูกต้อง' };
    }

    const { data: inserted, error } = await supabaseAdmin
      .from('clients')
      .insert([
        {
          hospital_name: data.hospital_name,
          province: data.province,
          contact_name: data.contact_name,
          position: data.position,
          phone: data.phone,
          email: data.email,
          signature_url: data.signature_url,
          pdpa_consented_at: new Date().toISOString(),
          status: 'pending',
        }
      ])
      .select();

    if (error) throw error;

    return { success: true, data: inserted };

  } catch (error: any) {
    console.error("Registration Error:", error);
    return {
      success: false,
      error: error.code === '23505' ? "อีเมลนี้ได้ทำการลงทะเบียนไปแล้ว" : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"
    };
  }
}