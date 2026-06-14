'use server'

import { createClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';

export async function registerStaff(payload: any) {
  const supabase = await createClient();

  try {
    // 1. Hash รหัสผ่าน
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(payload.password, salt);

    // 2. กำหนด Role อัตโนมัติ (manager คือ Admin, อื่นๆ คือ staff)
    const userRole = payload.department === 'manager' ? 'manager' : 'staff';

    // 3. บันทึกลงตาราง staff_users
    const { error } = await supabase
      .from('staff_users')
      .insert([
        {
          employee_id: payload.employee_id, // เพิ่ม field รหัสพนักงาน
          username: payload.username,
          password_hash: hashedPassword,
          full_name: payload.full_name,
          department: payload.department,
          is_approved: false, // บังคับให้เป็น false เพื่อรอ Manager อนุมัติ
          role: userRole
        }
      ]);

    // 4. ตรวจสอบ Error
    if (error) {
      if (error.code === '23505') {
        // รหัส 23505 คือ unique violation (เช่น username หรือ employee_id ซ้ำ)
        throw new Error("Username หรือรหัสพนักงานนี้ถูกใช้งานแล้ว");
      }
      throw error;
    }

    return { success: true };
    
  } catch (error: any) {
    console.error("Staff Registration Error:", error);
    return { success: false, error: error.message };
  }
}