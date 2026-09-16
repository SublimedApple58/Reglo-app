"use client";

import type { Session } from "next-auth";
import type { ReactNode } from "react";

import { CompanyDataProvider } from "@/components/providers/company.provider";
import { IntegrationsProvider } from "@/components/providers/integrations.provider";
import { JotaiStoreProvider } from "@/components/providers/jotai-store.provider";
import { UserDataProvider } from "@/components/providers/user.provider";
import type { CompanyInfo, CompanySummary } from "@/atoms/company.store";

export function AuthDataProvider({
  children,
  initialSession,
  initialCompany,
  initialCompanies,
}: {
  children: ReactNode;
  initialSession?: Session | null;
  initialCompany?: CompanyInfo | null;
  initialCompanies?: CompanySummary[];
}) {
  return (
    // Lo store jotai sta QUI, non nel modulo: uno per richiesta server e uno per
    // ogni ingresso nell'area autenticata. Vedi jotai-store.provider.tsx.
    <JotaiStoreProvider>
      <UserDataProvider initialSession={initialSession}>
        <CompanyDataProvider
          initialCompany={initialCompany}
          initialCompanies={initialCompanies}
        >
          <IntegrationsProvider>{children}</IntegrationsProvider>
        </CompanyDataProvider>
      </UserDataProvider>
    </JotaiStoreProvider>
  );
}
