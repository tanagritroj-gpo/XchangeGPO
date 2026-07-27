import { getStaffSession } from '@/app/actions/auth-staff';
import { redirect } from 'next/navigation';

export default async function WhLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();

  if (!session || (session.department !== 'wh' && session.role !== 'manager')) {
    redirect('/');
  }

  return <>{children}</>;
}