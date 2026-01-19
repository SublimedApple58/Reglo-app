"use client";

import type { ReactNode } from "react";

import { CompanyDataProvider } from "@/components/providers/company.provider";
import { IntegrationsProvider } from "@/components/providers/integrations.provider";
import { UserDataProvider } from "@/components/providers/user.provider";

export function AuthDataProvider({ children }: { children: ReactNode }) {
  return (
    <UserDataProvider>
      <CompanyDataProvider>
        <IntegrationsProvider>{children}</IntegrationsProvider>
      </CompanyDataProvider>
    </UserDataProvider>
  );
}
