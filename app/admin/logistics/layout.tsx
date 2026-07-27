// app/admin/logistics/layout.tsx
import { getStaffSession } from '@/app/actions/auth-staff';
import { redirect } from 'next/navigation';

export default async function LogisticsLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();
  if (!session || (session.department !== 'log' && session.role !== 'manager')) {
    redirect('/');
  }
  return <>{children}</>;
}