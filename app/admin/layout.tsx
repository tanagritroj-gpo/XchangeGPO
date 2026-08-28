import { redirect } from 'next/navigation';
import { getStaffSessionPending } from '@/app/actions/auth-staff';
import { MfaGraceBanner } from '@/components/mfa/MfaGraceBanner';

// Layout ร่วมของทุกหน้า /admin/* — บังคับเรื่อง MFA เพียงจุดเดียว:
//  - session ที่ยังค้างปัจจัยที่สอง (mfa_pending) → เด้งไปหน้าตั้งค่า/ยืนยัน (/mfa-setup)
//  - ยังไม่เปิด MFA แต่ยังอยู่ในช่วงผ่อนผัน → โชว์แถบเตือน
// การเช็ค department / ต้อง login ยังเป็นหน้าที่ของ layout.tsx ในแต่ละ zone เหมือนเดิม
// (getStaffSession() ที่ layout เหล่านั้นเรียกจะคืน null สำหรับ mfa_pending อยู่แล้ว)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getStaffSessionPending();

  if (s?.mfaPending) {
    redirect('/mfa-setup');
  }

  const graceUntil = s && !s.mfa_enabled ? s.mfa_grace_until : null;

  return (
    <>
      {graceUntil && <MfaGraceBanner graceUntil={graceUntil} />}
      {children}
    </>
  );
}
