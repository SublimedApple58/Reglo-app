import { auth } from '@/auth';
import SideBarWrapper from '@/components/Layout/SideBarWrapper';
import { getCompanyContext } from '@/lib/actions/company.actions';
import type { CompanyInfo, CompanySummary } from '@/atoms/company.store';

export default async function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sessione e azienda dal server al primo render, come nelle altre aree
  // autenticate: la sidebar non parte più dallo stato vuoto (REG-466).
  let initialCompany: CompanyInfo | null = null;
  let initialCompanies: CompanySummary[] = [];
  const [session, ctx] = await Promise.all([auth(), getCompanyContext()]);
  if (ctx.success && ctx.data) {
    initialCompany = ctx.data.current;
    initialCompanies = ctx.data.companies;
  }

  return (
    <SideBarWrapper
      initialSession={session}
      initialCompany={initialCompany}
      initialCompanies={initialCompanies}
    >
      {children}
    </SideBarWrapper>
  );
}
