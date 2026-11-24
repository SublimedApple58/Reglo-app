"use client";

import { usePathname } from "next/navigation";

import { UnderlineTabs } from "@/components/ui/underline-tabs";

const TABS = [
  { href: "/backoffice/finanza", label: "Panoramica", exact: true },
  { href: "/backoffice/finanza/movimenti", label: "Movimenti", exact: false },
  { href: "/backoffice/finanza/spese-fisse", label: "Spese fisse", exact: false },
  { href: "/backoffice/finanza/autoscuole", label: "Autoscuole", exact: false },
  { href: "/backoffice/finanza/vendite", label: "Vendite", exact: false },
] as const;

export function FinanceTabs() {
  const pathname = usePathname() ?? "";
  const current = pathname.replace(/^\/[a-z]{2}(?=\/)/, "");
  const active =
    TABS.find((tab) => (tab.exact ? current === tab.href : current.startsWith(tab.href)))?.href ?? "";
  // REG-778: la tab bar condivisa; a 390 px scorre invece di troncare.
  return (
    <UnderlineTabs
      ariaLabel="Sezioni di Finanza"
      className="mb-7"
      items={TABS.map((tab) => ({ key: tab.href, label: tab.label, href: tab.href }))}
      value={active}
    />
  );
}
