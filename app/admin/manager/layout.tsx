import { getStaffSession } from '@/app/actions/auth-staff';
import { redirect } from 'next/navigation';

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();

  if (!session || session.role !== 'manager') {
    redirect('/');
  }

  return <>{children}</>;
}