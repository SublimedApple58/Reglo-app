import { auth } from '@/auth';
import { requireCompanyAdmin } from '@/lib/auth-guard';
import { AuthDataProvider } from '@/components/providers/auth-data.provider';
import { AutoscuoleShell } from '@/components/Layout/AutoscuoleShell';
import { getCompanyContext } from '@/lib/actions/company.actions';
import type { CompanyInfo, CompanySummary } from '@/atoms/company.store';

export default async function AdminLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  await requireCompanyAdmin(locale);

  // Stessa shell dell'area autoscuole: stessi dati server al primo render, così
  // nav e hamburger non passano dallo stato vuoto (REG-466).
  let initialCompany: CompanyInfo | null = null;
  let initialCompanies: CompanySummary[] = [];
  const [session, ctx] = await Promise.all([auth(), getCompanyContext()]);
  if (ctx.success && ctx.data) {
    initialCompany = ctx.data.current;
    initialCompanies = ctx.data.companies;
  }

  return (
    <AuthDataProvider
      initialSession={session}
      initialCompany={initialCompany}
      initialCompanies={initialCompanies}
    >
      <AutoscuoleShell>{children}</AutoscuoleShell>
    </AuthDataProvider>
  );
}
