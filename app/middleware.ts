import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. ข้ามการตรวจสอบสำหรับ static files และการเรียกใช้งานภายในของ Next.js
  if (
    path.startsWith('/_next') ||
    path.startsWith('/api') || 
    path.includes('.') 
  ) {
    return NextResponse.next();
  }

  // 2. เตรียม Response
  const response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });
  response.headers.set('x-pathname', path);

  // 3. จัดการ Session แบบ Read-Only
  const isProtectedAdmin = path.startsWith('/admin');
  const isProtectedCustomer = path.startsWith('/customer');

  if (isProtectedAdmin || isProtectedCustomer) {
    const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        // แก้ตรงนี้: ให้เขียนคุกกี้กลับไปที่ response เพื่อให้ Action มองเห็น!
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, { ...options, path: '/' });
        });
      },
    },
  }
);

    const { data: { session: googleSession } } = await supabase.auth.getSession();
    const customerSession = request.cookies.get('customer_session');
    const isCustomerLoggedIn = !!googleSession || !!customerSession;
    const staffSession = request.cookies.get('staff_session');

    // ตรวจสอบสิทธิ์
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