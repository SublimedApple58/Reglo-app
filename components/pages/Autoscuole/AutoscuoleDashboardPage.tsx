"use client";

import React from "react";
import { Users, CalendarCheck, ClipboardList, AlertTriangle } from "lucide-react";

import { getAutoscuolaOverview } from "@/lib/actions/autoscuole.actions";
import { AutoscuoleNav } from "./AutoscuoleNav";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeedbackToast } from "@/components/ui/feedback-toast";

type Overview = {
  studentsCount: number;
  activeCasesCount: number;
  upcomingAppointmentsCount: number;
  overdueInstallmentsCount: number;
};

export function AutoscuoleDashboardPage({
  hideNav = false,
}: {
  hideNav?: boolean;
} = {}) {
  const toast = useFeedbackToast();
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(true);

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
    >
      <div className="space-y-5">
        {!hideNav ? <AutoscuoleNav /> : null}

        <section className="glass-panel glass-strong p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Overview
              </p>
              <h2 className="text-xl font-semibold text-foreground">
                Stato autoscuola
              </h2>
              <p className="text-sm text-muted-foreground">
                Indicatori principali aggiornati in tempo reale.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Allievi attivi"
              value={overview?.studentsCount ?? 0}
              loading={loading}
              icon={<Users className="h-4 w-4" />}
              accent="bg-[#a9d9d1]"
            />
            <MetricCard
              title="Pratiche in corso"
              value={overview?.activeCasesCount ?? 0}
              loading={loading}
              icon={<ClipboardList className="h-4 w-4" />}
              accent="bg-[#c9d9f2]"
            />
            <MetricCard
              title="Appuntamenti 7 giorni"
              value={overview?.upcomingAppointmentsCount ?? 0}
              loading={loading}
              icon={<CalendarCheck className="h-4 w-4" />}
              accent="bg-[#e1ecfb]"
            />
            <MetricCard
              title="Rate in ritardo"
              value={overview?.overdueInstallmentsCount ?? 0}
              loading={loading}
              icon={<AlertTriangle className="h-4 w-4" />}
              accent="bg-[#f7e9d5]"
            />
          </div>
        </section>

        <section className="glass-panel glass-strong p-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Prossimi step
            </p>
            <p className="text-sm text-muted-foreground">
              Importa i primi allievi con CSV oppure aggiungili manualmente
              per iniziare le automazioni autoscuola.
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
