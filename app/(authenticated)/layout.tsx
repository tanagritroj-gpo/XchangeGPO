import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';
import { ChatWidget } from '@/components/ChatWidget';
import { ChatWidgetErrorBoundary } from '@/components/ChatWidgetErrorBoundary';
import { getCustomerSession } from '@/app/actions/auth-actions';
import { redirect } from 'next/navigation';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const customer = await getCustomerSession();
  if (!customer) redirect('/');

  return (
    <div className="flex h-screen overflow-hidden bg-teal-50">

      <div className="hidden md:flex w-64 flex-shrink-0">
        <Sidebar customer={customer} />
      </div>

      <main className="flex-1 overflow-y-auto pb-20 md:pb-8 p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>

      <BottomNav />

      {/* ปุ่มแชทลอย — mount ที่นี่จุดเดียว ครอบคลุมทุกหน้าใน (authenticated)
          ห่อด้วย error boundary กัน bug ใน ChatWidget ทำทั้งหน้าพังไปด้วย */}
      <ChatWidgetErrorBoundary>
        <ChatWidget />
      </ChatWidgetErrorBoundary>
    </div>
  );
}