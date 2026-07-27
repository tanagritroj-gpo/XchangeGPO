import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loginCustomerByVerifiedEmail } from '@/app/actions/auth-actions';

// Callback ของ Google OAuth — ใช้ Supabase Auth เป็นแค่ตัวยืนยันตัวตนกับ Google
// (แลก code → ได้อีเมลที่ verify แล้ว) จากนั้นผูกเข้ากับ session จริงของแอปทันที
// (ตาราง `sessions` + cookie `customer_session`) แล้ว sign out จาก Supabase Auth
// ไม่ปล่อยให้ session นั้นค้างอยู่คู่ขนาน เพื่อให้มีระบบ session เดียวที่เป็นความจริง
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=auth-failed`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const email = data?.user?.email;

  // เคลียร์ Supabase Auth session ทันทีไม่ว่าผลลัพธ์จะเป็นอย่างไร — ใช้แค่ชั่วคราว
  // เพื่อยืนยันตัวตนกับ Google เท่านั้น ระบบจริงใช้ตาราง `sessions` ของแอปเอง
  await supabase.auth.signOut();

  if (error || !email) {
    return NextResponse.redirect(`${origin}/?error=auth-failed`);
  }

  const result = await loginCustomerByVerifiedEmail(email);
  if (!result.success) {
    return NextResponse.redirect(`${origin}/?error=google-not-registered`);
  }

  return NextResponse.redirect(`${origin}/welcome`);
}
