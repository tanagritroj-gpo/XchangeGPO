import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next();
  const path = request.nextUrl.pathname;

  // 1. ตรวจสอบ Session ฝั่งลูกค้า (Google Auth / OTP)
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); },
    },
  });
  const { data: { session: googleSession } } = await supabase.auth.getSession();
  const customerSession = request.cookies.get('customer_session');
  const isCustomerLoggedIn = !!googleSession || !!customerSession;

  // 2. ตรวจสอบ Session ฝั่งพนักงาน (จากคุกกี้ staff_session ของกิต)
  const staffSession = request.cookies.get('staff_session');

  // --- Logic การคุมประตู ---

  // โซนพนักงาน (เช็คว่าต้องอยู่ใน /admin)
  if (path.startsWith('/admin')) {
    // ถ้าพยายามเข้าหน้า Login ของ Admin ให้ปล่อยผ่าน
    if (path === '/admin/login') return response;
    // ถ้าไม่มี session พนักงาน ให้ดีดไปหน้า Login ของ Admin
    if (!staffSession) return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // โซนลูกค้า (เช็คว่าต้องอยู่ใน (authenticated)/customer)
  if (path.startsWith('/customer')) {
    if (!isCustomerLoggedIn) return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}