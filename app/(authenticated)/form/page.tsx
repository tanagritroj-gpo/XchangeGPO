import { Suspense } from 'react';
import { getCustomerSession } from '@/app/actions/auth-actions';
import { redirect } from 'next/navigation';
import FormWizardPage from './FormWizardPage';

// สร้าง Wrapper Component เพื่อจัดการ Async ตรงนี้
async function FormWrapper() {
  const session = await getCustomerSession();
  
  if (!session) {
    redirect('/login');
  }

  // ส่ง session ไปให้ FormWizardPage หากกิตต้องการใช้งานข้อมูล Session
  return <FormWizardPage session={session} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div>กำลังเตรียมแบบฟอร์ม...</div>}>
      <FormWrapper />
    </Suspense>
  );
}