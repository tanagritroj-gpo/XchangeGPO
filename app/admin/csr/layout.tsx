import { getStaffSession } from '@/app/actions/auth-staff';
import { redirect } from 'next/navigation';

export default async function CsrLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();

  // ตัดข้อยกเว้น manager ออก — CSR section แยกจาก manager dashboard โดยเด็ดขาด
  // manager มี dashboard ของตัวเองอยู่แล้ว ไม่ต้องเข้ามาปนกับ CSR ตรงนี้
  if (!session || session.department !== 'csr') {
    redirect('/');
  }

  return <>{children}</>;
}