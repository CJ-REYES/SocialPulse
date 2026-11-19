import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/features/auth/session';

export default async function HomePage() {
  const ctx = await getAuthenticatedContext();
  if (ctx) {
    redirect('/dashboard');
  }
  redirect('/login');
}
