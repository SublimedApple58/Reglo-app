"use client";

import React from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RegloTabs } from "@/components/ui/reglo-tabs";

import { AutoscuoleDashboardPage } from "./AutoscuoleDashboardPage";

const AutoscuoleStudentsPage = dynamic(
  () =>
    import("./AutoscuoleStudentsPage").then((module) => ({
      default: module.AutoscuoleStudentsPage,
    })),
  { loading: () => <div className="h-40 w-full animate-pulse rounded-3xl bg-white/40" /> },
);
const AutoscuoleAgendaPage = dynamic(
  () =>
    import("./AutoscuoleAgendaPage").then((module) => ({
      default: module.AutoscuoleAgendaPage,
    })),
  { loading: () => <div className="h-40 w-full animate-pulse rounded-3xl bg-white/40" /> },
);
const AutoscuoleResourcesPage = dynamic(
  () =>
    import("./AutoscuoleResourcesPage").then((module) => ({
      default: module.AutoscuoleResourcesPage,
    })),
  { loading: () => <div className="h-40 w-full animate-pulse rounded-3xl bg-white/40" /> },
);
const AutoscuolePaymentsPage = dynamic(
  () =>
    import("./AutoscuolePaymentsPage").then((module) => ({
      default: module.AutoscuolePaymentsPage,
    })),
  { loading: () => <div className="h-40 w-full animate-pulse rounded-3xl bg-white/40" /> },
);
const AutoscuoleCommunicationsPage = dynamic(
  () =>
    import("./AutoscuoleCommunicationsPage").then((module) => ({
      default: module.AutoscuoleCommunicationsPage,
    })),
  { loading: () => <div className="h-40 w-full animate-pulse rounded-3xl bg-white/40" /> },
);

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

  React.useEffect(() => {
    const preloaders: Record<AutoscuoleTabKey, Array<() => Promise<unknown>>> = {
      dashboard: [
        () => import("./AutoscuoleStudentsPage"),
        () => import("./AutoscuoleAgendaPage"),
      ],
      students: [() => import("./AutoscuoleAgendaPage")],
      agenda: [
        () => import("./AutoscuolePaymentsPage"),
        () => import("./AutoscuoleResourcesPage"),
      ],
      disponibilita: [() => import("./AutoscuoleAgendaPage")],
      payments: [() => import("./AutoscuoleAgendaPage")],
      comunicazioni: [() => import("./AutoscuolePaymentsPage")],
    };

    const runPrefetch = () => {
      const next = preloaders[activeTab] ?? [];
      next.forEach((loader) => {
        loader().catch(() => undefined);
      });
    };

    if (typeof window === "undefined") return;
    const w = window as Window & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(runPrefetch);
      return () => {
        if (typeof w.cancelIdleCallback === "function") {
          w.cancelIdleCallback(id);
        }
      };
    }

    const timeout = window.setTimeout(runPrefetch, 250);
    return () => window.clearTimeout(timeout);
  }, [activeTab]);

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
