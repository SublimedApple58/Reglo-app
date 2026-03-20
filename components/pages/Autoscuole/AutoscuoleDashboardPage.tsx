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
  CalendarClock,
  SlidersHorizontal,
  WalletCards,
  CircleDot,
} from "lucide-react";

import {
  getAutoscuolaOverview,
  getAutoscuolaInstructorsDashboard,
} from "@/lib/actions/autoscuole.actions";
import { PageWrapper } from "@/components/Layout/PageWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";
import { LottieLoadingOverlay } from "@/components/ui/lottie-loading-overlay";
import { DashboardSkeleton } from "@/components/ui/page-skeleton";

type Overview = {
  studentsCount: number;
  todayAppointmentsCount: number;
  upcomingAppointmentsCount: number;
  activeInstructorsCount: number;
};

type InstructorDashboard = {
  id: string;
  name: string;
  status: string;
  liveStatus: "busy" | "blocked" | "free" | "inactive";
  blockReason: string | null;
  currentLesson: { studentName: string | null; endsAt: string } | null;
  nextLesson: { studentName: string | null; startsAt: string } | null;
  todayCount: number;
};

export function AutoscuoleDashboardPage({
  tabs,
}: {
  tabs?: React.ReactNode;
} = {}) {
  const locale = useLocale();
  const toast = useFeedbackToast();
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [instructors, setInstructors] = React.useState<InstructorDashboard[]>([]);
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
        title: "Configurazione",
        description: "Disponibilità, regole guida e policy.",
        href: `/${locale}/user/autoscuole?tab=settings`,
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
      const [overviewRes, instructorsRes] = await Promise.all([
        getAutoscuolaOverview(),
        getAutoscuolaInstructorsDashboard(),
      ]);
      if (!active) return;
      if (overviewRes.success && overviewRes.data) {
        setOverview(overviewRes.data);
      } else {
        toast.error({ description: overviewRes.message ?? "Impossibile caricare i dati." });
      }
      if (instructorsRes.success && instructorsRes.data) {
        setInstructors(instructorsRes.data);
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [toast]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  return (
    <PageWrapper
      title="Dashboard"
      subTitle={`Vista rapida su guide, pratiche e incassi — ${todayLabel}`}
    >
      <div className="relative w-full space-y-6" data-testid="autoscuole-dashboard-page">
        <LottieLoadingOverlay visible={loading} />
        {tabs}

        {loading ? (
          <DashboardSkeleton />
        ) : (
        <>
        {/* Metriche */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Allievi"
            value={overview?.studentsCount ?? 0}
            loading={loading}
            icon={<Users className="h-4 w-4 text-primary" />}
          />
          <MetricCard
            title="Guide oggi"
            value={overview?.todayAppointmentsCount ?? 0}
            loading={loading}
            icon={<CalendarClock className="h-4 w-4 text-primary" />}
          />
          <MetricCard
            title="Prossimi 7 giorni"
            value={overview?.upcomingAppointmentsCount ?? 0}
            loading={loading}
            icon={<CalendarCheck className="h-4 w-4 text-primary" />}
          />
          <MetricCard
            title="Istruttori attivi"
            value={overview?.activeInstructorsCount ?? 0}
            loading={loading}
            icon={<CircleDot className="h-4 w-4 text-positive" />}
          />
        </div>

        {/* Istruttori + Azioni rapide */}
        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <section className="space-y-3">
            <h3 className="ds-section-tertiary text-foreground">Istruttori</h3>
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-[72px] w-full" />
                ))}
              </div>
            ) : instructors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun istruttore configurato.</p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border bg-white shadow-card">
                {instructors.map((inst) => (
                  <div key={inst.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={cn(
                          "flex h-2.5 w-2.5 shrink-0 rounded-full",
                          inst.liveStatus === "busy" && "bg-primary",
                          inst.liveStatus === "free" && "bg-positive",
                          inst.liveStatus === "blocked" && "bg-yellow-400",
                          inst.liveStatus === "inactive" && "bg-muted-foreground/40",
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {inst.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {inst.liveStatus === "busy" && inst.currentLesson
                            ? `In guida con ${inst.currentLesson.studentName ?? "allievo"} — fino alle ${formatTime(inst.currentLesson.endsAt)}`
                            : inst.liveStatus === "blocked"
                              ? inst.blockReason ?? "Blocco attivo"
                              : inst.liveStatus === "inactive"
                                ? "Inattivo"
                                : inst.nextLesson
                                  ? `Prossima guida: ${formatTime(inst.nextLesson.startsAt)} con ${inst.nextLesson.studentName ?? "allievo"}`
                                  : "Nessuna guida oggi"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant={
                          inst.liveStatus === "busy"
                            ? "default"
                            : inst.liveStatus === "free"
                              ? "success"
                              : inst.liveStatus === "blocked"
                                ? "warning"
                                : "outline"
                        }
                      >
                        {inst.liveStatus === "busy"
                          ? "In guida"
                          : inst.liveStatus === "free"
                            ? "Libero"
                            : inst.liveStatus === "blocked"
                              ? "Blocco"
                              : "Inattivo"}
                      </Badge>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {inst.todayCount} oggi
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="ds-section-tertiary text-foreground">Navigazione rapida</h3>
            <div className="grid gap-3">
              {quickActions.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-white p-4 transition hover:border-primary/30 hover:shadow-card"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-50 text-yellow-600">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </section>
        </div>
        </>
        )}
      </div>
    </PageWrapper>
  );
}

function MetricCard({
  title,
  value,
  loading,
  icon,
}: {
  title: string;
  value: number;
  loading: boolean;
  icon: React.ReactElement;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-white p-4 shadow-card">
      <div>
        <p className="ds-caption text-muted-foreground uppercase">{title}</p>
        <div className="mt-2">
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="text-2xl font-semibold text-foreground">{value}</p>
          )}
        </div>
      </div>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-50">
        {icon}
      </span>
    </div>
  );
}
