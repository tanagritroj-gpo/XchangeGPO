// app/welcome/layout.tsx
import { Suspense } from 'react';
import { getCustomerSession } from '@/app/actions/auth-actions';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';

async function SidebarWrapper() {
  const session = await getCustomerSession();
  if (!session) redirect('/');
  return <Sidebar customer={session} />;
}

async function BottomNavWrapper() {
  const session = await getCustomerSession();
  if (!session) return null;
  return <BottomNav customerId={session?.id || ''} />;
}

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-[#f5fbf9]">

      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-64 h-screen sticky top-0 bg-white/80 backdrop-blur-xl border-r border-teal-50 shadow-sm z-50">
        <Suspense fallback={<div className="p-6 text-sm text-teal-600">Loading...</div>}>
          <SidebarWrapper />
        </Suspense>
      </aside>

      {/* Main content — pb-20 กัน bottom nav บัง */}
      <main className="flex-1 h-screen overflow-y-auto pb-20 md:pb-0">
        {children}
      </main>

      {/* Bottom nav — mobile only */}
      <Suspense fallback={null}>
        <BottomNavWrapper />
      </Suspense>
    </div>
  );
}