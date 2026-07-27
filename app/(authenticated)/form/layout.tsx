// app/form/layout.tsx
import { Suspense } from 'react';
import { getCustomerSession } from '@/app/actions/auth-actions';
import { redirect } from 'next/navigation';

// สร้าง Loading Component ง่ายๆ
function Loading() {
  return <div className="p-8">กำลังตรวจสอบสิทธิ์เข้าใช้งาน...</div>;
}

async function ProtectedContent({ children }: { children: React.ReactNode }) {
  const session = await getCustomerSession();
  if (!session) redirect('/');
  return <>{children}</>;
}

export default function FormLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <ProtectedContent>{children}</ProtectedContent>
    </Suspense>
  );
}