import { getStaffSession } from '@/app/actions/auth-staff';
import { redirect } from 'next/navigation';

export default async function CsrLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();

  if (!session || (session.department !== 'csr' && session.role !== 'manager')) {
    redirect('/admin/login');
  }

  return <>{children}</>;
}