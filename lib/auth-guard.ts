import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import { UserRole } from '@/lib/constants';
import { redirect } from 'next/navigation';

const buildSignInPath = (locale?: string) =>
  locale ? `/${locale}/sign-in` : '/sign-in';

export async function requireUserAndCompany(locale?: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(buildSignInPath(locale));
  }

  const membership = await prisma.companyMember.findFirst({
    where: { userId },
    select: { companyId: true, role: true },
  });

  if (!membership) {
    redirect(buildSignInPath(locale));
  }

  return { session, membership };
}

export async function requireCompanyAdmin(locale?: string) {
  const { session, membership } = await requireUserAndCompany(locale);
  const isAdmin = membership.role === 'admin';

  if (!isAdmin) {
    redirect('/unauthorized');
  }

  return { session, membership };
}

export async function requireRole(role: UserRole) {
  const { session, membership } = await requireUserAndCompany();

  if (role === UserRole.ADMIN && membership.role !== 'admin') {
    redirect('/unauthorized');
  }

  return session;
}
