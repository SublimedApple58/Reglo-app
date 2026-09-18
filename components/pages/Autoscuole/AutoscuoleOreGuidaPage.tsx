"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, BookOpen, Download } from "lucide-react";

import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { InstructorHoursEntry } from "@/lib/actions/autoscuole.actions";
import { sumOccupancy, type AgendaOccupancy } from "@/lib/autoscuole/agenda-occupancy";
import { buildOreGuidaCsv, downloadCsv } from "./ore-guida-export";

/**
 * Ore guida — overlay standalone (proto `section-ore`): raggiungibile SOLO
 * dal menu hamburger, non più dalla sidebar Impostazioni. Header 72px con
 * logo/Fatto (stesso container della top bar), titolo + "Totale ore · Xh",
 * navigazione settimana, card istruttore con barre navy e card separata
 * "Cancellazioni tardive".
 */

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
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
  if (h === 0 && m > 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Scala fissa del proto: 2h30 di guida = colonna piena (52px). */
const BAR_FULL_MINUTES = 150;
const BAR_MAX_HEIGHT = 52;

const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function AutoscuoleOreGuidaPage() {
  const router = useRouter();
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
      // ignora: resta lo stato precedente
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
  const teamTotalMinutes = (data ?? []).reduce((sum, e) => sum + e.weekly.totalMinutes, 0);
  const teamTheoryMinutes = (data ?? []).reduce((sum, e) => sum + e.weekly.theoryMinutes, 0);
  const lateList = (data ?? []).filter((e) => e.monthly.lateCancellationMinutes > 0);
  const teamOccupancy = React.useMemo(
    () => sumOccupancy((data ?? []).map((e) => e.weekly.occupancy)),
    [data],
  );
  const weekLabel = isThisWeek ? "Questa settimana" : formatWeekLabel(weekStart);

  const handleExport = () => {
    if (!data?.length) return;
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const weekStartISO = formatDateISO(weekStart);
    downloadCsv(
      `reglo-ore-guida_${weekStartISO}.csv`,
      buildOreGuidaCsv({
        entries: data,
        weekStartISO,
        weekEndISO: formatDateISO(weekEnd),
        weekLabel: formatWeekLabel(weekStart),
      }),
    );
  };

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-white"
      data-testid="autoscuole-ore-guida-page"
    >
      {/* ── Header overlay ── */}
      <div className="h-[72px] shrink-0 border-b border-[#dddddd]">
        {/* Stesso container della top bar principale: logo sempre nello stesso punto */}
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-4 lg:px-10">
          <Image
            src="/images/nav/logo-reglo-tight.png"
            alt="Reglo"
            width={30}
            height={30}
            className="select-none object-contain"
          />
          <button
            type="button"
            onClick={() => router.push("/user/autoscuole")}
            className="cursor-pointer select-none rounded-full bg-[#f2f2f2] px-[22px] py-2 text-sm font-medium text-foreground transition-colors hover:bg-[#e8e8e8]"
          >
            Fatto
          </button>
        </div>
      </div>

      {/* ── Contenuto ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1280px] px-6 py-12 lg:px-10">
          {/* Titolo + totale team + navigazione settimana (riga proto) */}
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-[-0.3px] text-foreground">Ore guida</h1>
              <div className="mt-1.5 text-sm font-medium text-[#929292]">
                Totale ore · {formatMinutesAsHours(teamTotalMinutes)}
                {teamTheoryMinutes > 0 && (
                  <span className="text-[#4f46e5]"> · Teoria {formatMinutesAsHours(teamTheoryMinutes)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleExport}
                disabled={!data?.length}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dddddd] bg-white px-[15px] py-[7px] text-[13px] font-semibold text-[#222222] transition-colors hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="size-3.5" strokeWidth={2} />
                Esporta
              </button>
              <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigateWeek(-1)}
                aria-label="Settimana precedente"
                className="flex size-8 cursor-pointer items-center justify-center rounded-full text-[#222222] transition-colors hover:bg-[#f2f2f2]"
              >
                <ChevronLeft className="size-4" strokeWidth={2} />
              </button>
              <span className="min-w-[130px] select-none whitespace-nowrap text-center text-[15px] font-semibold text-[#222222]">
                {weekLabel}
              </span>
              <button
                type="button"
                onClick={() => navigateWeek(1)}
                aria-label="Settimana successiva"
                className="flex size-8 cursor-pointer items-center justify-center rounded-full text-[#222222] transition-colors hover:bg-[#f2f2f2]"
              >
                <ChevronRight className="size-4" strokeWidth={2} />
              </button>
              </div>
            </div>
          </div>

          {data?.length ? <AgendaOccupancyBand occupancy={teamOccupancy} /> : null}

          {data === null && loading ? (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <HoursCardSkeleton key={i} />
              ))}
            </div>
          ) : !data?.length ? (
            <div className="flex items-center justify-center rounded-[14px] border border-dashed border-[#d5d5d5] p-10 text-sm font-medium text-[#929292]">
              Nessun istruttore trovato.
            </div>
          ) : (
            <FadeIn>
              <div
                className={cn(
                  "grid gap-3.5 transition-opacity sm:grid-cols-2 xl:grid-cols-3",
                  loading && "opacity-60",
                )}
              >
                {data.map((entry) => (
                  <InstructorHoursCard
                    key={entry.instructorId}
                    entry={entry}
                    weekLabel={weekLabel}
                  />
                ))}
                {lateList.length > 0 && <LateCancellationsCard entries={lateList} />}
              </div>
            </FadeIn>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Banda "Agenda occupata" (REG-444): quante delle ore che gli istruttori
 * dichiarano in agenda sono davvero prese. Il rapporto è sui TOTALI, non la
 * media dei rapporti, così un istruttore con due ore dichiarate non pesa come
 * uno che ne ha quaranta.
 */
function AgendaOccupancyBand({ occupancy }: { occupancy: AgendaOccupancy }) {
  const freeMinutes = Math.max(0, occupancy.availableMinutes - occupancy.busyMinutes);
  const percent = Math.round(occupancy.ratio * 100);
  const hasAvailability = occupancy.availableMinutes > 0;

  return (
    <div className="mb-3.5 flex items-start gap-10 rounded-[14px] border border-[#dddddd] bg-white px-[22px] py-[18px]">
      <div className="w-[250px] flex-none">
        <div className="text-[13px] font-semibold uppercase tracking-[0.1px] text-[#929292]">
          Agenda occupata
        </div>
        <div className="mt-[7px] text-[30px] font-extrabold leading-none tracking-[-1px] text-[#222222]">
          {hasAvailability ? `${percent}%` : "—"}
        </div>
        <div className="mt-1.5 text-[13px] font-medium text-[#929292]">
          {hasAvailability
            ? `${formatMinutesAsHours(occupancy.busyMinutes)} occupate su ${formatMinutesAsHours(occupancy.availableMinutes)} disponibili`
            : "Nessuna fascia di disponibilità in agenda questa settimana"}
        </div>
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-[#f0f0f0]">
          <span
            className="block h-full bg-[#111111]"
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
        <div className="mt-[11px] flex flex-wrap gap-5 text-[12.5px] font-medium text-[#929292]">
          <span>
            <span className="mr-1.5 inline-block size-2 translate-y-px rounded-[2px] bg-[#111111]" />
            Occupate <b className="font-bold text-[#222222]">{formatMinutesAsHours(occupancy.busyMinutes)}</b>
          </span>
          <span>
            <span className="mr-1.5 inline-block size-2 translate-y-px rounded-[2px] bg-[#ebebeb]" />
            Libere <b className="font-bold text-[#222222]">{formatMinutesAsHours(freeMinutes)}</b>
          </span>
          {occupancy.outsideMinutes > 0 && (
            <span>
              <span className="mr-1.5 inline-block size-2 translate-y-px rounded-[2px] border border-dashed border-[#c4c4c4]" />
              Fuori fascia{" "}
              <b className="font-bold text-[#222222]">{formatMinutesAsHours(occupancy.outsideMinutes)}</b>
            </span>
          )}
        </div>
        <p className="mt-3.5 max-w-[680px] text-[12px] font-medium leading-[1.5] text-[#b0b0b0]">
          Le ore disponibili sono le fasce che gli istruttori hanno in agenda, al netto di ferie,
          malattia, lezioni teoriche, blocchi e giorni di chiusura. Sono occupate tutte le guide,
          gli esami e le guide di gruppo non annullati, comprese quelle ancora da svolgere: le ore
          occupate non coincidono con le ore di guida già svolte qui sopra. Quello che cade fuori
          dalle fasce dichiarate è contato a parte e non entra nel rapporto.
        </p>
      </div>
    </div>
  );
}

/** Riga "Agenda occupata" dentro la card del singolo istruttore. */
function InstructorOccupancyRow({ occupancy }: { occupancy: AgendaOccupancy }) {
  const percent = Math.round(occupancy.ratio * 100);

  // Tre stati diversi, e vanno detti diversamente: chi non ha proprio fasce in
  // agenda, chi le aveva ma se le è mangiate tutte fra ferie e malattia, e chi
  // ha ore vere da riempire.
  if (occupancy.availableMinutes <= 0) {
    const allBlocked = occupancy.declaredMinutes > 0;
    return (
      <div className="border-t border-[#f5f5f5] pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium text-[#929292]">Agenda occupata</span>
          <span className="shrink-0 text-[13px] font-medium text-[#c1c1c1]">
            {allBlocked ? "Non disponibile" : "Nessuna fascia"}
          </span>
        </div>
        <div className="mt-1.5 text-[12px] font-medium text-[#b0b0b0]">
          {allBlocked
            ? "Le fasce di questa settimana sono coperte da ferie, malattia o blocchi."
            : "Non ha fasce di disponibilità in agenda questa settimana."}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-[#f5f5f5] pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-[#929292]">Agenda occupata</span>
        <span className="shrink-0 text-[13px] font-bold text-[#222222]">{percent}%</span>
      </div>
      <div className="mt-[7px] h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]">
        <span
          className="block h-full bg-[#111111]"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <div className="mt-1.5 text-[12px] font-medium text-[#b0b0b0]">
        {formatMinutesAsHours(occupancy.busyMinutes)} su{" "}
        {formatMinutesAsHours(occupancy.availableMinutes)} disponibili
        {occupancy.outsideMinutes > 0 &&
          ` · ${formatMinutesAsHours(occupancy.outsideMinutes)} fuori fascia`}
      </div>
    </div>
  );
}

function HoursCardSkeleton() {
  const barHeights = [45, 70, 55, 90, 60, 30, 18];
  return (
    <div className="flex flex-col rounded-[14px] border border-[#dddddd] bg-white p-5">
      <Skeleton className="mb-3 h-5 w-36" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="mb-4 mt-2 h-3.5 w-28" />
      <div className="mb-2 flex h-[52px] items-end gap-[3px]">
        {barHeights.map((height, i) => (
          <Skeleton key={i} className="flex-1 rounded-b-none rounded-t-[3px]" style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className="mt-3 border-t border-[#f5f5f5] pt-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-8" />
        </div>
        <Skeleton className="mt-[7px] h-1.5 w-full rounded-full" />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[#f5f5f5] pt-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}

/** Card istruttore del proto: nome, totale settimana, barre navy, riga mese. */
function InstructorHoursCard({ entry, weekLabel }: { entry: InstructorHoursEntry; weekLabel: string }) {
  return (
    <div className="flex flex-col rounded-[14px] border border-[#dddddd] bg-white p-5">
      <div className="mb-2 text-base font-bold text-[#222222]">{entry.instructorName}</div>
      <div className="mb-4">
        <span className="text-[30px] font-extrabold leading-none tracking-[-1px] text-[#222222]">
          {formatMinutesAsHours(entry.weekly.totalMinutes)}
        </span>
        <div className="mt-[5px] text-[13px] font-medium text-[#929292]">{weekLabel}</div>
        {entry.weekly.theoryMinutes > 0 && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#E6E9FF] px-2.5 py-1 text-[12px] font-semibold text-[#3730a3]">
            <BookOpen className="size-3.5" strokeWidth={2} />
            Lezione teorica · {formatMinutesAsHours(entry.weekly.theoryMinutes)}
          </div>
        )}
      </div>
      <div className="mb-2 flex h-[52px] items-end gap-[3px]">
        {entry.weekly.byDay.map((day) => {
          const height =
            day.totalMinutes <= 0
              ? 3
              : Math.min(
                  BAR_MAX_HEIGHT,
                  Math.max(8, Math.round((day.totalMinutes / BAR_FULL_MINUTES) * BAR_MAX_HEIGHT)),
                );
          return (
            <div
              key={day.date}
              title={day.totalMinutes > 0 ? `${day.dayLabel}: ${formatMinutesAsHours(day.totalMinutes)}` : undefined}
              className={cn(
                "flex-1 rounded-t-[3px]",
                day.totalMinutes > 0 ? "bg-[#111111]" : "bg-[#f7f7f7]",
              )}
              style={{ height: `${height}px` }}
            />
          );
        })}
      </div>
      <div className="mb-3.5 flex justify-between text-[10px] font-medium text-[#c1c1c1]">
        {DAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <InstructorOccupancyRow occupancy={entry.weekly.occupancy} />
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#f5f5f5] pt-3">
        <span className="text-[13px] font-medium text-[#929292]">{entry.monthly.monthLabel}</span>
        <span className="shrink-0 text-sm font-bold text-[#222222]">
          {formatMinutesAsHours(entry.monthly.totalMinutes)}
        </span>
      </div>
    </div>
  );
}

/** Card "Cancellazioni tardive" del proto: ore del mese per istruttore, in rosso. */
function LateCancellationsCard({ entries }: { entries: InstructorHoursEntry[] }) {
  const [infoOpen, setInfoOpen] = React.useState(false);
  return (
    <div className="flex flex-col rounded-[14px] border border-[#dddddd] bg-white p-5">
      <div className="mb-4 flex items-center gap-1.5">
        <span className="text-base font-bold text-[#222222]">Cancellazioni tardive</span>
        <span
          className="relative inline-flex items-center"
          onMouseEnter={() => setInfoOpen(true)}
          onMouseLeave={() => setInfoOpen(false)}
          onClick={() => setInfoOpen((prev) => !prev)}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-none cursor-pointer">
            <circle cx="7" cy="7" r="6" stroke="#b0b0b0" strokeWidth="1.2" />
            <path d="M7 6.2v3.3" stroke="#b0b0b0" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="7" cy="4.2" r="0.85" fill="#b0b0b0" />
          </svg>
          {infoOpen && (
            <div className="absolute bottom-[calc(100%+8px)] left-1/2 z-[300] w-[235px] -translate-x-1/2 rounded-[8px] bg-[#222222] px-[11px] py-[9px] text-[11.5px] font-normal leading-[1.45] text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
              <b className="font-semibold">Cancellazioni tardive:</b> non dipende dagli istruttori,
              sono gli allievi che annullano la guida oltre il preavviso.
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent border-t-[#222222]" />
            </div>
          )}
        </span>
      </div>
      <div>
        {entries.map((entry) => (
          <div
            key={entry.instructorId}
            className="flex items-center justify-between gap-3 border-t border-[#f5f5f5] py-[11px] first:border-t-0"
          >
            <span className="min-w-0 truncate text-sm font-semibold text-[#222222]">
              {entry.instructorName}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[13px] font-bold text-[#c0444a]">
              {formatMinutesAsHours(entry.monthly.lateCancellationMinutes)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
