'use server'

import { createClient } from '@/lib/supabase/server';

export async function loginWithGoogle() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // หน้าที่รับค่า callback กลับมา
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  // เดิมเรียก redirect() ในนี้ตรงๆ แต่เพราะถูกเรียกผ่าน onClick (ไม่ใช่ <form action>)
  // และปลายทางเป็น cross-origin (accounts.google.com) ทำให้ promise ฝั่ง client
  // reject ได้เองบางครั้งก่อนที่ redirect จริงจะไปถึง — เลยขึ้น alert ผิดพลาดทั้งที่เข้าระบบได้ปกติ
  // แก้โดยส่ง url กลับไปให้ client เป็นคน navigate เอง
  if (error || !data.url) {
    return { success: false as const, error: 'ไม่สามารถเชื่อมต่อ Google ได้ในขณะนี้' };
  }

  return { success: true as const, url: data.url };
}