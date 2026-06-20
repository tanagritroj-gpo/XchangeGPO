// app/(authenticated)/layout.tsx
import Sidebar from '@/components/Sidebar';
import { getCustomerSession } from '@/app/actions/auth-actions';
import { redirect } from 'next/navigation';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const customer = await getCustomerSession();

  // Guard: ถ้าดึง session ไม่ได้ (หมดอายุหรือยังไม่ login) ให้เด้งกลับไปหน้าหลัก
  if (!customer) {
    redirect('/');
  }

return (
    // ปรับเป็น flex-col ในมือถือ (sm:flex-row)
    <div className="flex flex-col sm:flex-row h-screen overflow-hidden bg-teal-50">
      
      {/* 1. Sidebar: ในมือถือให้ซ่อน หรือย่อขนาดลง */}
      <div className="w-full sm:w-64 flex-shrink-0 bg-white border-b sm:border-b-0 sm:border-r border-slate-200"> 
        <Sidebar customer={customer} />
      </div>
      
      {/* 2. Main Content: ในมือถือให้ scroll ได้อิสระ */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-8"> 
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>
      
    </div>
  );
}