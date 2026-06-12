'use server';

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// กำหนด Schema ฝั่ง Server ให้ตรงกับหน้าฟอร์มเพื่อความปลอดภัย
const registerSchema = z.object({
  hospital_name: z.string().min(1),
  contact_name: z.string().min(1),
  phone: z.string().min(9),
  email: z.string().email(),
  // signature จะถูกส่งมาจากหน้าฟอร์มในรูปแบบ Base64 string
  signature: z.string().min(1, "กรุณาลงลายเซ็นต์"),
  position: z.string().min(1),
  province: z.string().min(1),
});

export async function registerCustomer(formData: any) {
  const supabase = createClient();
  
  // 1. Validate ข้อมูลฝั่ง Server
  const validated = registerSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง" };
  }

  const { data } = validated;

  // 2. บันทึกเข้าตาราง clients
  const { error } = await supabase
    .from('clients')
    .insert([{
      hospital_name: data.hospital_name,
      province: data.province,
      contact_name: data.contact_name,
      position: data.position,
      phone: data.phone,
      email: data.email,
      signature: data.signature, // เก็บ Base64 ของลายเซ็นต์ที่นี่
      status: 'pending'
    }]);

  if (error) {
    console.error("Supabase Error:", error);
    return { success: false, error: "ไม่สามารถบันทึกข้อมูลได้: " + error.message };
  }

  return { success: true };
}