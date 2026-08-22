import { getStaffSession } from '@/app/actions/auth-staff';
import { redirect } from 'next/navigation';

// "จัดการบัญชี" ใช้ร่วมกันทุกแผนก (ไม่เหมือน layout.tsx ของ csr/manager/sale/wh/logistics
// ที่เช็ค session.department เจาะจง) — แค่ต้อง login เป็น staff คนไหนก็ได้ ทุกฟังก์ชันจัดการ
// บัญชีจริงยัง authenticate ผ่าน getStaffSession() ของตัวเองอีกชั้นในฝั่ง server action
// (app/actions/auth-staff.ts) อยู่แล้ว — guard นี้แค่กันไม่ให้คนไม่ login เห็น shell ของหน้า
// เฉยๆ ให้ behavior สอดคล้องกับทุกหน้า /admin/* อื่นในระบบ (307 redirect ไปหน้า login)
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();
  if (!session) redirect('/');
  return <>{children}</>;
}
