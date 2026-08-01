import { getStaffSession } from '@/app/actions/auth-staff';
import { redirect } from 'next/navigation';

export default async function SaleLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();

  if (!session || (session.department !== 'sale' && session.role !== 'manager')) {
    redirect('/');
  }

  return <>{children}</>;
}
