// app/welcome/layout.tsx
import { getCustomerSession } from '@/app/actions/auth-actions';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';
import { ChatWidget } from '@/components/ChatWidget';
import { ChatWidgetErrorBoundary } from '@/components/ChatWidgetErrorBoundary';

export default async function WelcomeLayout({ children }: { children: React.ReactNode }) {
  const session = await getCustomerSession();
  if (!session) redirect('/');

  return (
    // root layout (app/layout.tsx) มี <main pt-[56px]> ครอบ header คงที่สูง 56px
    // อยู่จริง (คอมเมนต์เดิมตรงนี้เข้าใจผิดว่าถูกลบไปแล้ว) — ต้องหัก offset 56px
    // ออกจาก h-screen ไม่งั้น div นี้จะสูงเกิน viewport จริงไป 56px แล้วดันเนื้อหา
    // ท้ายสุด (เช่นปุ่มต่างๆ) ให้จมอยู่ใต้ BottomNav บนมือถือ (บั๊กเดียวกับที่เจอใน
    // app/(authenticated)/layout.tsx)
    <div className="h-[calc(100dvh-56px)] overflow-hidden flex bg-[#f5fbf9]">
      <aside
        className="hidden md:flex w-64 sticky top-0 h-full bg-white/80 backdrop-blur-xl border-r border-teal-50 shadow-sm z-40"
      >
        <Sidebar customer={session} />
      </aside>

      <main className="flex-1 h-full overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      <BottomNav />

      {/* ปุ่มแชทลอย — /welcome เป็นคนละ layout tree จาก (authenticated)
          จึงต้อง mount แยกที่นี่ด้วย ไม่ได้ครอบคลุมมาจากที่นั่นอัตโนมัติ */}
      <ChatWidgetErrorBoundary>
        <ChatWidget />
      </ChatWidgetErrorBoundary>
    </div>
  );
}