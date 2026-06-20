'use client';

import dynamic from 'next/dynamic'; // 1. import ตัวนี้
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCustomerSession } from '@/app/actions/auth-actions';

// 2. ใช้ dynamic import เพื่อไม่ให้โหลดตอน Build
const FormWizardPage = dynamic(() => import('./FormWizardPage'), {
  ssr: false, // ปิด SSR สำหรับหน้านี้ไปเลย จะได้ไม่ติดเรื่อง Suspense/Prerender
  loading: () => <div>กำลังโหลดฟอร์ม...</div>
});

export default function Page() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      const s = await getCustomerSession();
      if (!s) {
        router.push('/login');
      } else {
        setSession(s);
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  if (loading) return <div>กำลังตรวจสอบสิทธิ์...</div>;

  return <FormWizardPage session={session} />;
}