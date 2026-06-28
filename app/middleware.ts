import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. ข้ามการตรวจสอบสำหรับ static files และการเรียกใช้งานภายในของ Next.js
  if (
    path.startsWith('/_next') ||
    path.startsWith('/api') || // Server Actions มักจะวิ่งผ่าน /api หรือ route handlers
    path.includes('.') // ข้ามไฟล์ที่มีนามสกุล เช่น .ico, .png
  ) {
    return NextResponse.next();
  }

  // 2. เตรียม Response พร้อมส่ง x-pathname
  const response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });
  response.headers.set('x-pathname', path);

  // 3. จัดการเรื่อง Session (ทำเฉพาะเส้นทางที่จำเป็น เพื่อลดภาระของ Middleware)
  // เราจะเช็คแค่ path ที่สำคัญเท่านั้น เพื่อไม่ให้ไปขวาง Action อื่นๆ
  const isProtectedAdmin = path.startsWith('/admin');
  const isProtectedCustomer = path.startsWith('/customer');

  if (isProtectedAdmin || isProtectedCustomer) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) { 
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); 
        },
      },
    });

    const { data: { session: googleSession } } = await supabase.auth.getSession();
    const customerSession = request.cookies.get('customer_session');
    const isCustomerLoggedIn = !!googleSession || !!customerSession;
    const staffSession = request.cookies.get('staff_session');

    if (isProtectedAdmin) {
      if (path !== '/admin/login' && !staffSession) {
        return NextResponse.redirect(new URL('/admin/login', request.url));
      }
    }

    if (isProtectedCustomer) {
      if (!isCustomerLoggedIn) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};