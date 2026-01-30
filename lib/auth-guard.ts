import { UserRole } from '@/lib/constants';
import { redirect } from 'next/navigation';
import { ACTIVE_COMPANY_REQUIRED, getActiveCompanyContext } from '@/lib/company-context';
import { validateBackofficeCookie } from '@/lib/backoffice-auth';

const buildSignInPath = (locale?: string) =>
  locale ? `/${locale}/sign-in` : '/sign-in';
const buildSelectCompanyPath = (locale?: string) =>
  locale ? `/${locale}/select-company` : '/select-company';

export async function requireUserAndCompany(locale?: string) {
  try {
    const { session, membership } = await getActiveCompanyContext();
    return { session, membership };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === ACTIVE_COMPANY_REQUIRED) {
      redirect(buildSelectCompanyPath(locale));
    }
    redirect(buildSignInPath(locale));
  }
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

export async function requireGlobalAdmin(locale?: string) {
  const isValid = await validateBackofficeCookie();

  if (!isValid) {
    const target = locale ? `/${locale}/backoffice-sign-in` : '/backoffice-sign-in';
    redirect(target);
  }
}
