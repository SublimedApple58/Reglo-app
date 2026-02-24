"use client";

import React from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import {
  Users,
  CalendarCheck,
  ClipboardList,
  AlertTriangle,
  ArrowRight,
  CarFront,
  CalendarClock,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";

import { getAutoscuolaOverview } from "@/lib/actions/autoscuole.actions";
import { AutoscuoleNav } from "./AutoscuoleNav";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

type Overview = {
  studentsCount: number;
  activeCasesCount: number;
  upcomingAppointmentsCount: number;
  overdueInstallmentsCount: number;
};

export function AutoscuoleDashboardPage({
  hideNav = false,
  tabs,
}: {
  hideNav?: boolean;
  tabs?: React.ReactNode;
} = {}) {
  const locale = useLocale();
  const toast = useFeedbackToast();
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(true);

  const todayLabel = React.useMemo(
    () =>
      new Intl.DateTimeFormat("it-IT", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(new Date()),
    [],
  );

  const focusItems = React.useMemo(() => {
    if (!overview) return [];
    const studentsWithoutCase = Math.max(overview.studentsCount - overview.activeCasesCount, 0);
    return [
      {
        key: "scheduling",
        title: "Copertura agenda",
        description:
          overview.upcomingAppointmentsCount === 0
            ? "Nessuna guida pianificata nei prossimi 7 giorni."
            : `${overview.upcomingAppointmentsCount} guide già pianificate nei prossimi 7 giorni.`,
        tone: overview.upcomingAppointmentsCount === 0 ? "warning" : "ok",
      },
      {
        key: "billing",
        title: "Incassi da presidiare",
        description:
          overview.overdueInstallmentsCount > 0
            ? `${overview.overdueInstallmentsCount} rate scadute da recuperare.`
            : "Nessuna rata scaduta, situazione incassi sotto controllo.",
        tone: overview.overdueInstallmentsCount > 0 ? "danger" : "ok",
      },
      {
        key: "cases",
        title: "Pratiche allievi",
        description:
          studentsWithoutCase > 0
            ? `${studentsWithoutCase} allievi senza pratica attiva.`
            : "Tutti gli allievi risultano coperti da pratica attiva.",
        tone: studentsWithoutCase > 0 ? "warning" : "ok",
      },
    ] as const;
  }, [overview]);

  const quickActions = React.useMemo(
    () => [
      {
        key: "agenda",
        title: "Agenda guide",
        description: "Programma o ripianifica appuntamenti.",
        href: `/${locale}/user/autoscuole?tab=agenda`,
        icon: CalendarClock,
      },
      {
        key: "students",
        title: "Allievi",
        description: "Anagrafica, registro guide e crediti.",
        href: `/${locale}/user/autoscuole?tab=students`,
        icon: Users,
      },
      {
        key: "resources",
        title: "Disponibilità",
        description: "Orari istruttori, veicoli e regole guida.",
        href: `/${locale}/user/autoscuole?tab=disponibilita`,
        icon: SlidersHorizontal,
      },
      {
        key: "payments",
        title: "Pagamenti",
        description: "Stato addebiti, insoluti e fatture.",
        href: `/${locale}/user/autoscuole?tab=payments`,
        icon: WalletCards,
      },
    ],
    [locale],
  );

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const res = await getAutoscuolaOverview();
      if (!active) return;
      if (!res.success || !res.data) {
        toast.error({
          description: res.message ?? "Impossibile caricare i dati autoscuole.",
        });
        setLoading(false);
        return;
      }
      setOverview(res.data);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [toast]);

  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Dashboard operativa per gestione allievi, pratiche e appuntamenti."
      hideHero
      contentWidthClassName="max-w-[1600px]"
    >
      <div className="w-full space-y-5" data-testid="autoscuole-dashboard-page">
        {tabs}
        {!hideNav ? <AutoscuoleNav /> : null}

        <section className="glass-panel glass-strong p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Centro operativo
              </p>
              <h2 className="text-xl font-semibold text-foreground">
                Dashboard autoscuola
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Vista rapida su guide, pratiche e incassi.
              </p>
            </div>
            <div className="glass-card px-4 py-3 min-w-[220px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Oggi
              </p>
              <p className="mt-1 text-sm font-medium capitalize">{todayLabel}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Priorità: ridurre slot vuoti e chiudere rate scadute.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Allievi in autoscuola"
              value={overview?.studentsCount ?? 0}
              loading={loading}
              icon={<Users className="h-4 w-4" />}
              accent="bg-[#a9d9d1]"
            />
            <MetricCard
              title="Pratiche attive"
              value={overview?.activeCasesCount ?? 0}
              loading={loading}
              icon={<ClipboardList className="h-4 w-4" />}
              accent="bg-[#c9d9f2]"
            />
            <MetricCard
              title="Guide prossimi 7 giorni"
              value={overview?.upcomingAppointmentsCount ?? 0}
              loading={loading}
              icon={<CalendarCheck className="h-4 w-4" />}
              accent="bg-[#e1ecfb]"
            />
            <MetricCard
              title="Rate scadute"
              value={overview?.overdueInstallmentsCount ?? 0}
              loading={loading}
              icon={<AlertTriangle className="h-4 w-4" />}
              accent="bg-[#f7e9d5]"
            />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
          <div className="glass-panel glass-strong p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Focus operativo
              </p>
              <h3 className="mt-1 text-lg font-semibold">Cosa presidiare adesso</h3>
            </div>
            {loading
              ? [0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-[76px] w-full rounded-2xl" />
                ))
              : focusItems.map((item) => (
                  <div
                    key={item.key}
                    className={cn(
                      "glass-card glass-soft rounded-2xl p-4 border",
                      item.tone === "danger"
                        ? "border-rose-200/80 bg-rose-50/55"
                        : item.tone === "warning"
                          ? "border-amber-200/80 bg-amber-50/55"
                          : "border-emerald-200/80 bg-emerald-50/45",
                    )}
                  >
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                ))}
          </div>

          <div className="glass-panel glass-strong p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Azioni rapide
              </p>
              <h3 className="mt-1 text-lg font-semibold">Navigazione autoscuola</h3>
            </div>
            <div className="grid gap-3">
              {quickActions.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="glass-card glass-soft group rounded-2xl border border-border/50 p-4 transition hover:-translate-y-0.5 hover:border-[#324d7a]/35"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-[#324d7a]/10 text-[#324d7a]">
                      <item.icon className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#324d7a]">
                    Apri sezione
                    <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="glass-panel glass-strong p-6">
          <div className="flex items-center gap-2">
            <CarFront className="h-4 w-4 text-[#324d7a]" />
            <p className="text-sm text-muted-foreground">
              Obiettivo operativo Reglo Autoscuole: saturare la disponibilità istruttori/veicoli e ridurre i buchi agenda.
            </p>
          </div>
        </section>
      </div>
    </ClientPageWrapper>
  );
}

function MetricCard({
  title,
  value,
  loading,
  icon,
  accent,
}: {
  title: string;
  value: number;
  loading: boolean;
  icon: React.ReactElement;
  accent: string;
}) {
  return (
    <div className="glass-card glass-strong p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </p>
          <div className="mt-2">
            {loading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-semibold text-foreground">{value}</p>
            )}
          </div>
        </div>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full ${accent} shadow-inner`}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}
