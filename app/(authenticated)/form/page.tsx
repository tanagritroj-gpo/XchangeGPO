import { Suspense } from 'react';
import { getCustomerSession } from '@/app/actions/auth-actions';
import { redirect } from 'next/navigation';
import FormWizardPage from './FormWizardPage';

// เพิ่ม Loading Component ง่ายๆ เข้าไปครับ
function LoadingFallback() {
  return (
    <div className="w-full h-[60vh] flex items-center justify-center">
      <p className="text-teal-700 font-bold">กำลังตรวจสอบสิทธิ์และเตรียมแบบฟอร์ม...</p>
    </div>
  );
}

export default async function Page() {
  const session = await getCustomerSession();
  
  if (!session) {
    redirect('/login');
  }

  return (
    // ครอบด้วย Suspense เพื่อให้ Next.js ไม่มองว่าเป็นการดึงข้อมูลที่ขัดจังหวะการ Render
    <Suspense fallback={<LoadingFallback />}>
      <FormWizardPage />
    </Suspense>
  );
}