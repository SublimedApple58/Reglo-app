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
  // Risolvi il context aziendale lato server e idrata gli atom al primo render:
  // così la shell (nav, hamburger, gating "solo Segretaria") parte già con i
  // dati giusti, senza il flash "tutto visibile" del primo accesso.
  let initialCompany: CompanyInfo | null = null;
  let initialCompanies: CompanySummary[] = [];
  const ctx = await getCompanyContext();
  if (ctx.success && ctx.data) {
    initialCompany = ctx.data.current;
    initialCompanies = ctx.data.companies;
  }

  return (
    <AuthDataProvider
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
