"use client";

import React from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { InstructorHoursEntry } from "@/lib/actions/autoscuole.actions";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const dow = d.getUTCDay();
  const daysBack = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}

function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

function formatMinutesAsHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function InstructorHoursDashboard() {
  const [weekStart, setWeekStart] = React.useState(() => getWeekStart(new Date()));
  const [data, setData] = React.useState<InstructorHoursEntry[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchData = React.useCallback(async (ws: Date) => {
    setLoading(true);
    try {
      const monthStart = `${ws.toISOString().slice(0, 7)}-01`;
      const res = await fetch(
        `/api/autoscuole/instructor-hours?weekStart=${formatDateISO(ws)}&monthStart=${monthStart}`,
      );
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData(weekStart);
  }, [weekStart, fetchData]);

  const navigateWeek = (delta: number) => {
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setUTCDate(next.getUTCDate() + delta * 7);
      return next;
    });
  };

  const isThisWeek = formatDateISO(weekStart) === formatDateISO(getWeekStart(new Date()));

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => navigateWeek(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold text-foreground">
          {isThisWeek ? "Questa settimana" : formatWeekLabel(weekStart)}
        </span>
        <Button variant="outline" size="sm" onClick={() => navigateWeek(1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {data === null && loading ? (
        // First load: faithful skeleton of the instructor cards (name, weekly
        // total, column chart, monthly footer).
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
          {[0, 1, 2].map((i) => (
            <InstructorHoursCardSkeleton key={i} />
          ))}
        </div>
      ) : !data?.length ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-gray-50/50 p-8 text-sm text-muted-foreground">
          Nessun istruttore trovato.
        </div>
      ) : (
        // Refetch (week navigation): keep the content visible, just dimmed.
        <FadeIn>
          <div
            className={cn(
              "grid gap-4 transition-opacity [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]",
              loading && "opacity-60",
            )}
          >
            {data.map((entry) => (
              <InstructorHoursCard key={entry.instructorId} entry={entry} />
            ))}
          </div>
        </FadeIn>
      )}
    </div>
  );
}

/** Skeleton fedele a InstructorHoursCard: header, totale, grafico a colonne, footer mese. */
function InstructorHoursCardSkeleton() {
  const barHeights = [45, 70, 55, 90, 60, 30, 18];
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-card">
      <Skeleton className="h-5 w-40" />
      <div className="flex items-end gap-3">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="mb-1 h-3.5 w-28" />
      </div>
      <div className="flex h-28 items-end justify-between gap-1.5 pt-2">
        {barHeights.map((height, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <Skeleton className="w-full rounded-b-none rounded-t-md" style={{ height: `${height}%` }} />
            <Skeleton className="mt-0.5 h-2.5 w-6" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border/60 pt-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}

function InstructorHoursCard({ entry }: { entry: InstructorHoursEntry }) {
  const maxDayMinutes = Math.max(...entry.weekly.byDay.map((d) => d.totalMinutes), 1);

  return (
    <div className="rounded-2xl border border-border bg-white shadow-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{entry.instructorName}</span>
          {entry.workingHoursStart && entry.workingHoursEnd && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-muted-foreground">
              <Clock className="size-3" />
              {entry.workingHoursStart}–{entry.workingHoursEnd}
            </span>
          )}
        </div>
      </div>

      {/* Weekly total */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
        <span className="text-2xl font-bold text-foreground tabular-nums">
          {formatMinutesAsHours(entry.weekly.totalMinutes)}
        </span>
        <span className="text-xs text-muted-foreground mb-1">questa settimana</span>
        {entry.weekly.outsideWorkingHoursMinutes > 0 && (
          <span className="mb-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
            {formatMinutesAsHours(entry.weekly.outsideWorkingHoursMinutes)} fuori orario
          </span>
        )}
        {entry.weekly.lateCancellationMinutes > 0 && (
          <span className="mb-1 inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 border border-rose-200">
            {formatMinutesAsHours(entry.weekly.lateCancellationMinutes)} cancellazioni tardive
          </span>
        )}
      </div>

      {/* Column chart */}
      <div className="flex items-end justify-between gap-1.5 h-28 pt-2">
        {entry.weekly.byDay.map((day) => {
          const heightPct = maxDayMinutes > 0 ? (day.totalMinutes / maxDayMinutes) * 100 : 0;
          const hasOutside = day.outsideWorkingHoursMinutes > 0;
          return (
            <div key={day.date} className="flex flex-col items-center flex-1 gap-1 h-full justify-end">
              {day.totalMinutes > 0 && (
                <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                  {formatMinutesAsHours(day.totalMinutes)}
                </span>
              )}
              <div
                className={cn(
                  "w-full rounded-t-md transition-all duration-500 min-h-[4px]",
                  day.totalMinutes === 0
                    ? "bg-gray-100"
                    : hasOutside
                      ? "bg-amber-400"
                      : "bg-pink-400",
                )}
                style={{ height: day.totalMinutes > 0 ? `${Math.max(heightPct, 8)}%` : "4px" }}
              />
              <span className="text-[10px] font-medium text-muted-foreground mt-0.5">
                {day.dayLabel}
              </span>
            </div>
          );
        })}
      </div>

      {/* Monthly */}
      <div className="border-t border-border/60 pt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">{entry.monthly.monthLabel}</span>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          <span className="font-semibold text-foreground tabular-nums">
            {formatMinutesAsHours(entry.monthly.totalMinutes)}
          </span>
          {entry.monthly.outsideWorkingHoursMinutes > 0 && (
            <span className="text-xs text-amber-600">
              ({formatMinutesAsHours(entry.monthly.outsideWorkingHoursMinutes)} fuori orario)
            </span>
          )}
          {entry.monthly.lateCancellationMinutes > 0 && (
            <span className="text-xs text-rose-600">
              ({formatMinutesAsHours(entry.monthly.lateCancellationMinutes)} cancellazioni tardive)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
