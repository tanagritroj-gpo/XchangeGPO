import { redirect } from 'next/navigation';
import { getStaffSessionPending } from '@/app/actions/auth-staff';

const DEPT_HOME: Record<string, string> = {
  manager: '/admin/manager',
  csr: '/admin/csr',
  log: '/admin/logistics/dashboard',
  wh: '/admin/wh/dashboard',
  sale: '/admin/sale',
};

// หน้าตั้งค่า MFA แบบบังคับ — เข้าถึงได้ทั้ง session ที่ยัง mfa_pending (ถูกบังคับตอน login)
// และ session สมบูรณ์ในช่วง grace ที่อยากตั้งค่าล่วงหน้า ผู้ที่เปิด MFA แล้วไม่ต้องมาหน้านี้
export default async function MfaSetupLayout({ children }: { children: React.ReactNode }) {
  const s = await getStaffSessionPending();
  if (!s) redirect('/');
  if (s.mfa_enabled && !s.mfaPending) redirect(DEPT_HOME[s.department] ?? '/');
  return <>{children}</>;
}
