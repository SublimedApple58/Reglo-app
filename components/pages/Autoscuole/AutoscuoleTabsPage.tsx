"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useAtomValue } from "jotai";

import { companyAtom } from "@/atoms/company.store";
import { isConsortium, isSecretaryOnly } from "@/lib/services";
import { AutoscuoleRinnoviTeaser } from "./AutoscuoleRinnoviTeaser";

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
const ConsorzioSchoolsPage = dynamic(
  () =>
    import("../Consorzio/ConsorzioSchoolsPage").then((module) => ({
      default: module.ConsorzioSchoolsPage,
    })),
  { loading: () => <div className="h-40 w-full animate-pulse rounded-3xl bg-white/40" /> },
);
const ConsorzioBillingPage = dynamic(
  () =>
    import("../Consorzio/ConsorzioBillingPage").then((module) => ({
      default: module.ConsorzioBillingPage,
    })),
  { loading: () => <div className="h-40 w-full animate-pulse rounded-3xl bg-white/40" /> },
);

// Redesign 2026-07: la Dashboard è stata ritirata — l'Agenda è la landing
// (nessun ?tab). Configurazione/Pagamenti vivono nel menu hamburger della
// shell; "rinnovi" è il teaser della feature in arrivo.
type AutoscuoleTabKey =
  | "students"
  | "agenda"
  | "settings"
  | "payments"
  | "rinnovi"
  | "scuole"
  | "fatturazione";

const TAB_KEYS: AutoscuoleTabKey[] = [
  "students",
  "agenda",
  "settings",
  "payments",
  "rinnovi",
  "scuole",
  "fatturazione",
];

// Tab esclusive di una modalità: "scuole"/"fatturazione" esistono solo per il
// consorzio; allievi/segretaria/rinnovi non esistono per il consorzio.
const CONSORTIUM_ONLY_TABS: AutoscuoleTabKey[] = ["scuole", "fatturazione"];
const AUTOSCUOLA_ONLY_TABS: AutoscuoleTabKey[] = ["students", "payments", "rinnovi"];

function normalizeTab(value: string | null): AutoscuoleTabKey {
  if (!value) return "agenda";
  if (value === "disponibilita") return "settings";
  return (TAB_KEYS as string[]).includes(value) ? (value as AutoscuoleTabKey) : "agenda";
}

export function AutoscuoleTabsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const company = useAtomValue(companyAtom);
  const secretaryOnly = isSecretaryOnly(company?.services ?? null);
  const consortium = isConsortium(company?.services ?? null);

  const initialTab = React.useMemo(
    () => normalizeTab(searchParams.get("tab")),
    [searchParams],
  );
  const [activeTab, setActiveTab] = React.useState<AutoscuoleTabKey>(initialTab);

  React.useEffect(() => {
    const tab = normalizeTab(searchParams.get("tab"));
    setActiveTab(tab);
  }, [searchParams]);

  // Modalità "solo Segretaria": le tab dell'autoscuola (agenda/allievi/…) non
  // esistono — reindirizza alla pagina Segretaria. Le Impostazioni restano
  // accessibili (mostreranno solo il pane Segretaria).
  React.useEffect(() => {
    if (secretaryOnly && activeTab !== "settings") {
      router.replace(`/${locale}/user/autoscuole/voice`);
    }
  }, [secretaryOnly, activeTab, router, locale]);

  // Le tab valgono solo nella modalità giusta: fuori modalità → Agenda.
  React.useEffect(() => {
    const wrongMode = consortium
      ? AUTOSCUOLA_ONLY_TABS.includes(activeTab)
      : CONSORTIUM_ONLY_TABS.includes(activeTab);
    if (wrongMode) {
      router.replace(`/${locale}/user/autoscuole?tab=agenda`);
    }
  }, [consortium, activeTab, router, locale]);

  React.useEffect(() => {
    const preloaders: Record<AutoscuoleTabKey, Array<() => Promise<unknown>>> = {
      students: [() => import("./AutoscuoleAgendaPage")],
      agenda: [
        () => import("./AutoscuoleStudentsPage"),
        () => import("./AutoscuoleResourcesPage"),
      ],
      settings: [() => import("./AutoscuoleAgendaPage")],
      payments: [() => import("./AutoscuoleAgendaPage")],
      rinnovi: [() => import("./AutoscuoleAgendaPage")],
      scuole: [() => import("./AutoscuoleAgendaPage")],
      fatturazione: [() => import("./AutoscuoleAgendaPage")],
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

  // Modalità "solo Segretaria": tutto ciò che non è "settings" reindirizza a
  // /voice (effetto sopra) — mostra un placeholder mentre avviene.
  if (secretaryOnly && activeTab !== "settings") {
    return <div className="h-40 w-full animate-pulse rounded-3xl bg-white/40" />;
  }

  return (
    <div className="w-full">
      {activeTab === "students" ? <AutoscuoleStudentsPage tabs={null} /> : null}
      {activeTab === "agenda" ? <AutoscuoleAgendaPage tabs={null} /> : null}
      {activeTab === "settings" ? <AutoscuoleResourcesPage tabs={null} /> : null}
      {activeTab === "payments" ? <AutoscuolePaymentsPage tabs={null} /> : null}
      {activeTab === "rinnovi" ? <AutoscuoleRinnoviTeaser /> : null}
      {activeTab === "scuole" && consortium ? <ConsorzioSchoolsPage /> : null}
      {activeTab === "fatturazione" && consortium ? <ConsorzioBillingPage /> : null}
    </div>
  );
}
