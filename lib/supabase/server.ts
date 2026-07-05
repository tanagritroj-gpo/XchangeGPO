import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  // สำคัญ: ต้อง await cookies() เพราะเป็น Promise ใน Next.js 15+
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { 
                ...options, 
                path: '/', // <--- เพิ่มตรงนี้ครับ บังคับให้ใช้ทั่วทั้งโปรเจกต์
                sameSite: 'lax', // แนะนำให้ใส่เพิ่มเพื่อความปลอดภัยและเสถียรภาพ
                secure: process.env.NODE_ENV === 'production' 
              })
            );
          } catch (error) {
            console.error("Cookie set failed:", error);
          }
        },
      },
    }
  );
}