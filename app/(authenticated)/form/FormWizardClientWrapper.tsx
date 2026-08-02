'use client';

import dynamic from 'next/dynamic';
import type { CustomerSessionInfo } from './form-types';

const FormWizardPage = dynamic(() => import('./FormWizardPage'), {
  ssr: false,
  loading: () => <div>กำลังโหลดฟอร์ม...</div>,
});

export default function FormWizardClientWrapper({ session }: { session: CustomerSessionInfo }) {
  return <FormWizardPage session={session} />;
}