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
    // root layout (app/layout.tsx) ไม่มี <main pt-[56px]> ครอบอยู่แล้ว
    // (header ถูกลบออกไปแล้ว) จึงไม่ต้องหัก offset 56px จากความสูง/ตำแหน่งใดๆ
    // ในไฟล์นี้อีกต่อไป — ใช้ h-screen เต็มความสูงจริงตรงๆ
    <div className="min-h-screen flex bg-[#f5fbf9]">
      <aside
        className="hidden md:flex w-64 sticky top-0 h-screen bg-white/80 backdrop-blur-xl border-r border-teal-50 shadow-sm z-40"
      >
        <Sidebar customer={session} />
      </aside>

      <main className="flex-1 h-screen overflow-y-auto pb-20 md:pb-0">
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