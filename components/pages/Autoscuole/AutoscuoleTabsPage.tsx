"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RegloTabs } from "@/components/ui/reglo-tabs";

import { AutoscuoleAgendaPage } from "./AutoscuoleAgendaPage";
import { AutoscuoleCommunicationsPage } from "./AutoscuoleCommunicationsPage";
import { AutoscuoleDashboardPage } from "./AutoscuoleDashboardPage";
import { AutoscuolePaymentsPage } from "./AutoscuolePaymentsPage";
import { AutoscuoleResourcesPage } from "./AutoscuoleResourcesPage";
import { AutoscuoleStudentsPage } from "./AutoscuoleStudentsPage";

type AutoscuoleTabKey =
  | "dashboard"
  | "students"
  | "agenda"
  | "disponibilita"
  | "payments"
  | "comunicazioni";

type TabItem = {
  key: AutoscuoleTabKey;
  label: string;
};

const TAB_ITEMS: TabItem[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "students", label: "Allievi" },
  { key: "agenda", label: "Agenda" },
  { key: "disponibilita", label: "Disponibilita" },
  { key: "payments", label: "Pagamenti" },
  { key: "comunicazioni", label: "Comunicazioni" },
];

function normalizeTab(value: string | null): AutoscuoleTabKey {
  if (!value) return "dashboard";
  const found = TAB_ITEMS.find((item) => item.key === value);
  return found?.key ?? "dashboard";
}

export function AutoscuoleTabsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTab = React.useMemo(
    () => normalizeTab(searchParams.get("tab")),
    [searchParams],
  );
  const [activeTab, setActiveTab] = React.useState<AutoscuoleTabKey>(initialTab);

  React.useEffect(() => {
    const tab = normalizeTab(searchParams.get("tab"));
    setActiveTab(tab);
  }, [searchParams]);

  const selectTab = React.useCallback(
    (tab: AutoscuoleTabKey) => {
      setActiveTab(tab);
      const next = new URLSearchParams(searchParams.toString());
      if (tab === "dashboard") {
        next.delete("tab");
      } else {
        next.set("tab", tab);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const tabsNode = (
    <RegloTabs
      items={TAB_ITEMS}
      activeKey={activeTab}
      onChange={selectTab}
      ariaLabel="Sezioni autoscuole"
    />
  );

  return (
    <div className="w-full">
      {activeTab === "dashboard" ? (
        <AutoscuoleDashboardPage hideNav tabs={tabsNode} />
      ) : null}
      {activeTab === "students" ? (
        <AutoscuoleStudentsPage hideNav tabs={tabsNode} />
      ) : null}
      {activeTab === "agenda" ? (
        <AutoscuoleAgendaPage hideNav tabs={tabsNode} />
      ) : null}
      {activeTab === "disponibilita" ? (
        <AutoscuoleResourcesPage hideNav tabs={tabsNode} />
      ) : null}
      {activeTab === "payments" ? (
        <AutoscuolePaymentsPage hideNav tabs={tabsNode} />
      ) : null}
      {activeTab === "comunicazioni" ? (
        <AutoscuoleCommunicationsPage hideNav tabs={tabsNode} />
      ) : null}
    </div>
  );
}
