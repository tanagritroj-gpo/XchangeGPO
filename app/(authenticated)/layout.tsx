import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';
import { getCustomerSession } from '@/app/actions/auth-actions';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const customer = await getCustomerSession();
  if (!customer) redirect('/');

  // ดึง pathname มาเช็คว่าอยู่ใน /form หรือไม่
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';
  const isFormPage = pathname.startsWith('/form');

  return (
    <div className="flex h-screen overflow-hidden bg-teal-50">

      {/* ซ่อน sidebar ถ้าอยู่หน้า form */}
      {!isFormPage && (
        <div className="hidden md:flex w-64 flex-shrink-0">
          <Sidebar customer={customer} />
        </div>
      )}

      <main className={`flex-1 overflow-y-auto pb-20 md:pb-8 ${isFormPage ? 'p-4 md:p-8' : 'p-4 md:p-8'}`}>
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>

      {!isFormPage && <BottomNav customerId={customer?.id || ''} />}
    </div>
  );
}