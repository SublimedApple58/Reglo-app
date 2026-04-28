"use client";

import React from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
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

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl bg-gray-100"
            />
          ))}
        </div>
      ) : !data?.length ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-gray-50/50 p-8 text-sm text-muted-foreground">
          Nessun istruttore trovato.
        </div>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
          {data.map((entry) => (
            <InstructorHoursCard key={entry.instructorId} entry={entry} />
          ))}
        </div>
      )}
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
      <div className="flex items-end gap-3">
        <span className="text-2xl font-bold text-foreground tabular-nums">
          {formatMinutesAsHours(entry.weekly.totalMinutes)}
        </span>
        <span className="text-xs text-muted-foreground mb-1">questa settimana</span>
        {entry.weekly.outsideWorkingHoursMinutes > 0 && (
          <span className="mb-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
            {formatMinutesAsHours(entry.weekly.outsideWorkingHoursMinutes)} fuori orario
          </span>
        )}
      </div>

      {/* Weekly progress bar */}
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-pink-400 transition-all duration-500"
          style={{ width: `${Math.min(100, (entry.weekly.totalMinutes / (40 * 60)) * 100)}%` }}
        />
      </div>

      {/* Daily breakdown */}
      <div className="space-y-1.5">
        {entry.weekly.byDay.map((day) => (
          <div key={day.date} className="flex items-center gap-2 text-xs">
            <span className="w-14 text-muted-foreground font-medium">
              {day.dayLabel} {day.date.slice(8, 10)}/{day.date.slice(5, 7)}
            </span>
            <div className="flex-1 h-3 rounded-full bg-gray-50 overflow-hidden">
              {day.totalMinutes > 0 && (
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    day.outsideWorkingHoursMinutes > 0 ? "bg-amber-400" : "bg-pink-400",
                  )}
                  style={{ width: `${(day.totalMinutes / maxDayMinutes) * 100}%` }}
                />
              )}
            </div>
            <span className={cn(
              "w-12 text-right tabular-nums",
              day.totalMinutes > 0 ? "text-foreground font-medium" : "text-muted-foreground",
            )}>
              {day.totalMinutes > 0 ? formatMinutesAsHours(day.totalMinutes) : "—"}
            </span>
            {day.outsideWorkingHoursMinutes > 0 && (
              <span className="size-2 rounded-full bg-amber-400 shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Monthly */}
      <div className="border-t border-border/60 pt-3 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{entry.monthly.monthLabel}</span>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground tabular-nums">
            {formatMinutesAsHours(entry.monthly.totalMinutes)}
          </span>
          {entry.monthly.outsideWorkingHoursMinutes > 0 && (
            <span className="text-xs text-amber-600">
              ({formatMinutesAsHours(entry.monthly.outsideWorkingHoursMinutes)} fuori orario)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
