// app/welcome/layout.tsx
import { getCustomerSession } from '@/app/actions/auth-actions';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';

export default async function WelcomeLayout({ children }: { children: React.ReactNode }) {
  const session = await getCustomerSession();
  if (!session) redirect('/');

  return (
    <div className="min-h-screen flex bg-[#f5fbf9]">
      <aside className="hidden md:flex w-64 h-screen sticky top-0 bg-white/80 backdrop-blur-xl border-r border-teal-50 shadow-sm z-50">
        <Sidebar customer={session} />
      </aside>

      <main className="flex-1 h-screen overflow-y-auto pb-20 md:pb-0">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}