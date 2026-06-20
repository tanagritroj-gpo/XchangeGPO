// app/form/layout.tsx
import { Suspense } from 'react';
import { getCustomerSession } from '@/app/actions/auth-actions';
import { redirect } from 'next/navigation';

async function ProtectedContent({ children }: { children: React.ReactNode }) {
  const session = await getCustomerSession();
  if (!session) redirect('/auth');
  return <>{children}</>;
}

export default function FormLayout({ children }: { children: React.ReactNode }) {
  return (
    // ย้าย Suspense มาครอบ ProtectedContent แบบนี้ถูกต้องแล้วครับ
    <Suspense fallback={<div className="p-8">กำลังตรวจสอบสิทธิ์...</div>}>
      <ProtectedContent>{children}</ProtectedContent>
    </Suspense>
  );
}