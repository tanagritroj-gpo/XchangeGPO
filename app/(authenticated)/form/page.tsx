import { getCustomerSession } from '@/app/actions/auth-actions';
import { redirect } from 'next/navigation';
import FormWizardClientWrapper from './FormWizardClientWrapper';

export default async function Page() {
  const session = await getCustomerSession();
  if (!session) redirect('/auth/login');

  return <FormWizardClientWrapper session={session} />;
}