"use client";

import type { ReactNode } from "react";

import { CompanyDataProvider } from "@/components/providers/company.provider";
import { IntegrationsProvider } from "@/components/providers/integrations.provider";
import { UserDataProvider } from "@/components/providers/user.provider";
import type { CompanyInfo, CompanySummary } from "@/atoms/company.store";

export function AuthDataProvider({
  children,
  initialCompany,
  initialCompanies,
}: {
  children: ReactNode;
  initialCompany?: CompanyInfo | null;
  initialCompanies?: CompanySummary[];
}) {
  return (
    <UserDataProvider>
      <CompanyDataProvider
        initialCompany={initialCompany}
        initialCompanies={initialCompanies}
      >
        <IntegrationsProvider>{children}</IntegrationsProvider>
      </CompanyDataProvider>
    </UserDataProvider>
  );
}
