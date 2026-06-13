'use server'

import { createClient } from '@/lib/supabase/server';
// app/actions/auth.ts
export async function registerCustomer(payload: any) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('clients')
      .insert([
        {
          hospital_name: payload.hospital_name,
          province: payload.province,
          contact_name: payload.contact_name,
          position: payload.position,
          phone: payload.phone,
          email: payload.email,
          signature_url: payload.signature_url, // <--- แก้จาก signature เป็น signature_url
          pdpa_consented_at: new Date().toISOString(),
          status: 'pending'
        }
      ])
      .select()

    if (error) throw error

    return { success: true, data }
    
  } catch (error: any) {
    console.error("Registration Error:", error)
    return { 
        success: false, 
        // เพิ่ม log ให้เห็นชัดๆ ว่า Error รหัสอะไร
        error: error.code === '23505' ? "อีเมลนี้ได้ทำการลงทะเบียนไปแล้ว" : error.message 
    }
  }
}