"use client";

import { SidebarProvider } from "@/components/animate-ui/radix/sidebar";
import React from "react";
import { AppSidebar } from "./AppSidebar";
import { AuthDataProvider } from "@/components/providers/auth-data.provider";

export default function SideBarWrapper({
  children,
}: {
  children: React.ReactNode;
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
        <AuthDataProvider>
          <AppSidebar variant="sidebar" />
          {children}
        </AuthDataProvider>
      </SidebarProvider>
    </main>
  );
}
