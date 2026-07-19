// app/welcome/layout.tsx
import { getCustomerSession } from '@/app/actions/auth-actions';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';

export default async function WelcomeLayout({ children }: { children: React.ReactNode }) {
  const session = await getCustomerSession();
  if (!session) redirect('/');

  return (
    // ไม่ต้องใส่ pt ตรงนี้อีก — app/layout.tsx (root) มี <main className="pt-[56px]"> ครอบอยู่แล้ว
    // ใส่ซ้ำจะกลายเป็นเว้นระยะ 2 เท่า (56+56=112px) ตามที่เจอ
    <div className="min-h-screen flex bg-[#f5fbf9]">
      <aside
        className="hidden md:flex w-64 sticky top-[56px] h-[calc(100vh-56px)] bg-white/80 backdrop-blur-xl border-r border-teal-50 shadow-sm z-40"
      >
        <Sidebar customer={session} />
      </aside>

      <main className="flex-1 h-[calc(100vh-56px)] overflow-y-auto pb-20 md:pb-0">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}