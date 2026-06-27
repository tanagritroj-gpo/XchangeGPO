'use server'

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function loginWithGoogle() {
  const supabase = await createClient();
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // หน้าที่รับค่า callback กลับมา
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    throw new Error('ไม่สามารถเชื่อมต่อ Google ได้ในขณะนี้');
  }

  // Supabase จะจัดการ redirect ไปหน้า Google เอง
  return redirect(data.url);
}