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
  // base64 PNG data URI จาก SignaturePad (canvas.toDataURL()) ไม่ใช่ URL —
  // ตรวจ + upload ฝั่ง server เอง แทนการเชื่อ URL ที่ client อ้างว่าเป็นไฟล์ของเรา
  signature_url: z.string().startsWith('data:image/png;base64,'),
});

export async function registerCustomer(payload: unknown) {
  try {
    const parsed = RegisterSchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false, error: 'ข้อมูลที่กรอกไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' };
    }
    const data = parsed.data;

    const allowed = await checkRateLimit(`register:${data.email}`, 3600, 3);
    if (!allowed.allowed) {
      return { success: false, error: 'พยายามลงทะเบียนถี่เกินไป กรุณาลองใหม่ภายหลัง' };
    }

    const base64Data = data.signature_url.split(',')[1] ?? '';
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
      return { success: false, error: 'ไฟล์ลายเซ็นไม่ถูกต้องหรือมีขนาดใหญ่เกินไป' };
    }

    const signaturePath = `registration/${crypto.randomUUID()}.png`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('signatures')
      .upload(signaturePath, buffer, { contentType: 'image/png' });

    if (uploadErr) {
      console.error('Registration signature upload failed:', uploadErr);
      return { success: false, error: 'บันทึกลายเซ็นไม่สำเร็จ กรุณาลองใหม่' };
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
          // เก็บ path ภายใน bucket ไม่ใช่ public URL — bucket นี้เป็น private แล้ว
          signature_url: signaturePath,
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