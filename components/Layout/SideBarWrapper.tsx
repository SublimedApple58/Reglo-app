"use client";

import { SidebarProvider } from "@/components/animate-ui/radix/sidebar";
import React from "react";
import type { Session } from "next-auth";
import { AppSidebar } from "./AppSidebar";
import { AuthDataProvider } from "@/components/providers/auth-data.provider";
import type { CompanyInfo, CompanySummary } from "@/atoms/company.store";

export default function SideBarWrapper({
  children,
  initialSession,
  initialCompany,
  initialCompanies,
}: {
  children: React.ReactNode;
  initialSession?: Session | null;
  initialCompany?: CompanyInfo | null;
  initialCompanies?: CompanySummary[];
}): React.ReactElement {
  return (
    <main>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AuthDataProvider
          initialSession={initialSession}
          initialCompany={initialCompany}
          initialCompanies={initialCompanies}
        >
          <AppSidebar variant="sidebar" />
          {children}
        </AuthDataProvider>
      </SidebarProvider>
    </main>
  );
}
