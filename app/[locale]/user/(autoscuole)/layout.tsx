import { auth } from "@/auth";
import { AuthDataProvider } from "@/components/providers/auth-data.provider";
import { AutoscuoleShell } from "@/components/Layout/AutoscuoleShell";
import { ServiceGate } from "@/components/ui/service-gate";
import { getCompanyContext } from "@/lib/actions/company.actions";
import type { CompanyInfo, CompanySummary } from "@/atoms/company.store";

export default async function AutoscuoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Risolvi sessione e context aziendale lato server e idrata gli atom al primo
  // render: così la shell (hamburger, nav, gating "solo Segretaria") parte già
  // con i dati dell'account corrente, senza il flash del primo accesso e senza
  // dipendere dalla cache client di next-auth (REG-466).
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
      <AutoscuoleShell>
        <ServiceGate service="AUTOSCUOLE">
          {children}
        </ServiceGate>
      </AutoscuoleShell>
    </AuthDataProvider>
  );
}
