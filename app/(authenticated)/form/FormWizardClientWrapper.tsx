'use client';

import dynamic from 'next/dynamic';

const FormWizardPage = dynamic(() => import('./FormWizardPage'), {
  ssr: false,
  loading: () => <div>กำลังโหลดฟอร์ม...</div>,
});

export default function FormWizardClientWrapper({ session }: { session: any }) {
  return <FormWizardPage session={session} />;
}