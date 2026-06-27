import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // เมื่อแลกเปลี่ยน code สำเร็จ ให้ส่งไปหน้า welcome ของลูกค้า
      return NextResponse.redirect(`${origin}/welcome`);
    }
  }

  // ถ้าผิดพลาด ส่งกลับไปหน้า login
  return NextResponse.redirect(`${origin}/?error=auth-failed`);
}