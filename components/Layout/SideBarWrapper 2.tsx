"use client";

import { SidebarProvider } from "@/components/animate-ui/radix/sidebar";
import React from "react";
import { AppSidebar } from "./AppSidebar";

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
        <AppSidebar variant="inset" />
        {children}
      </SidebarProvider>
    </main>
  );
}
