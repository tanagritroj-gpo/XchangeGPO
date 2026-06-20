'use client'; // เปลี่ยนเป็น client component

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCustomerSession } from '@/app/actions/auth-actions';
import FormWizardPage from './FormWizardPage';

export const dynamic = 'force-dynamic';

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

  if (loading) return <div>กำลังโหลด...</div>;

  return <FormWizardPage session={session} />;
}