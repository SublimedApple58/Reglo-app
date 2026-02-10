"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { AutoscuoleAgendaPage } from "./AutoscuoleAgendaPage";
import { AutoscuoleCasesPage } from "./AutoscuoleCasesPage";
import { AutoscuoleCommunicationsPage } from "./AutoscuoleCommunicationsPage";
import { AutoscuoleDashboardPage } from "./AutoscuoleDashboardPage";
import { AutoscuoleDeadlinesPage } from "./AutoscuoleDeadlinesPage";
import { AutoscuoleDocumentsPage } from "./AutoscuoleDocumentsPage";
import { AutoscuolePaymentsPage } from "./AutoscuolePaymentsPage";
import { AutoscuoleResourcesPage } from "./AutoscuoleResourcesPage";
import { AutoscuoleStudentsPage } from "./AutoscuoleStudentsPage";

type AutoscuoleTabKey =
  | "dashboard"
  | "students"
  | "cases"
  | "agenda"
  | "disponibilita"
  | "scadenze"
  | "documents"
  | "payments"
  | "comunicazioni";

type TabItem = {
  key: AutoscuoleTabKey;
  label: string;
};

const TAB_ITEMS: TabItem[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "students", label: "Allievi" },
  { key: "cases", label: "Pratiche" },
  { key: "agenda", label: "Agenda" },
  { key: "disponibilita", label: "Disponibilita" },
  { key: "scadenze", label: "Scadenze" },
  { key: "documents", label: "Documenti" },
  { key: "payments", label: "Pagamenti" },
  { key: "comunicazioni", label: "Comunicazioni" },
];

function normalizeTab(value: string | null): AutoscuoleTabKey {
  if (!value) return "dashboard";
  const found = TAB_ITEMS.find((item) => item.key === value);
  return found?.key ?? "dashboard";
}

function createMountedState(initial: AutoscuoleTabKey) {
  return TAB_ITEMS.reduce(
    (acc, item) => ({ ...acc, [item.key]: item.key === initial }),
    {} as Record<AutoscuoleTabKey, boolean>,
  );
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
  const [mountedTabs, setMountedTabs] = React.useState<Record<AutoscuoleTabKey, boolean>>(
    () => createMountedState(initialTab),
  );

  React.useEffect(() => {
    const tab = normalizeTab(searchParams.get("tab"));
    setActiveTab(tab);
    setMountedTabs((prev) => ({ ...prev, [tab]: true }));
  }, [searchParams]);

  const selectTab = React.useCallback(
    (tab: AutoscuoleTabKey) => {
      setActiveTab(tab);
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
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

  return (
    <div className="space-y-4">
      <div className="glass-panel glass-strong p-2 shadow-[0_12px_30px_-24px_rgba(50,77,122,0.45)]">
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
          {TAB_ITEMS.map((item) => {
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => selectTab(item.key)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "border-[#324D7A] bg-[#324D7A] text-white shadow-[0_8px_18px_-10px_rgba(50,77,122,0.65)]"
                    : "border-white/70 bg-white/70 text-[#324D7A] hover:border-[#AFE2D4] hover:bg-[#AFE2D4]/45",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {mountedTabs.dashboard ? (
        <div className={activeTab === "dashboard" ? "block" : "hidden"}>
          <AutoscuoleDashboardPage hideNav />
        </div>
      ) : null}
      {mountedTabs.students ? (
        <div className={activeTab === "students" ? "block" : "hidden"}>
          <AutoscuoleStudentsPage hideNav />
        </div>
      ) : null}
      {mountedTabs.cases ? (
        <div className={activeTab === "cases" ? "block" : "hidden"}>
          <AutoscuoleCasesPage hideNav />
        </div>
      ) : null}
      {mountedTabs.agenda ? (
        <div className={activeTab === "agenda" ? "block" : "hidden"}>
          <AutoscuoleAgendaPage hideNav />
        </div>
      ) : null}
      {mountedTabs.disponibilita ? (
        <div className={activeTab === "disponibilita" ? "block" : "hidden"}>
          <AutoscuoleResourcesPage hideNav />
        </div>
      ) : null}
      {mountedTabs.scadenze ? (
        <div className={activeTab === "scadenze" ? "block" : "hidden"}>
          <AutoscuoleDeadlinesPage hideNav />
        </div>
      ) : null}
      {mountedTabs.documents ? (
        <div className={activeTab === "documents" ? "block" : "hidden"}>
          <AutoscuoleDocumentsPage hideNav />
        </div>
      ) : null}
      {mountedTabs.payments ? (
        <div className={activeTab === "payments" ? "block" : "hidden"}>
          <AutoscuolePaymentsPage hideNav />
        </div>
      ) : null}
      {mountedTabs.comunicazioni ? (
        <div className={activeTab === "comunicazioni" ? "block" : "hidden"}>
          <AutoscuoleCommunicationsPage hideNav />
        </div>
      ) : null}
    </div>
  );
}

