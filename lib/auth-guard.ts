import { auth } from '@/auth';
import { UserRole } from '@/lib/constants';
import { redirect } from 'next/navigation';

export async function requireRole(role: UserRole) {
  const session = await auth();

  if (session?.user?.role !== role) {
    redirect('/unauthorized');
  }

  return session;
}
