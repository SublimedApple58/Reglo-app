"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, BookOpen, Download } from "lucide-react";

import { useAtomValue } from "jotai";

import { companyAtom } from "@/atoms/company.store";
import { isAffiliateWithoutReglo } from "@/lib/services";
import { LockedSection, LOCKED_SECTIONS } from "./locked/LockedSection";
import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DatePickerInput } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import type { InstructorHoursRange } from "@/lib/actions/autoscuole.actions";
import { sumOccupancy, type AgendaOccupancy } from "@/lib/autoscuole/agenda-occupancy";
import { buildOreGuidaCsv, downloadCsv } from "./ore-guida-export";

/**
 * Ore guida — overlay standalone (proto `section-ore`): raggiungibile SOLO
 * dal menu hamburger, non più dalla sidebar Impostazioni.
 *
 * Dal 2026-09-18 (REG-444) il report non è più settimana-per-settimana: c'è un
 * selettore di periodo (settimana / mese / 30 giorni / personalizzato) con le
 * frecce che fanno scorrere il periodo scelto, e dentro ogni card il rapporto
 * fra ore dichiarate in agenda e ore davvero occupate.
 */

// ── Periodo ─────────────────────────────────────────────────────────────────

type PresetKey = "settimana" | "mese" | "30g" | "custom";
type Range = { from: string; to: string };

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const shiftDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/** Mezzogiorno: nessun cambio di ora legale riesce a spostarlo di giorno. */
const todayNoon = () => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
};

const mondayOf = (date: Date) => {
  const d = new Date(date);
  const dow = d.getDay();
  return shiftDays(d, dow === 0 ? -6 : -(dow - 1));
};

/** I preset producono SEMPRE un intervallo esplicito: il filtro è una cosa sola. */
const presetRange = (preset: Exclude<PresetKey, "custom">): Range => {
  const today = todayNoon();
  switch (preset) {
    case "settimana": {
      const monday = mondayOf(today);
      return { from: ymd(monday), to: ymd(shiftDays(monday, 6)) };
    }
    case "mese": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1, 12);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0, 12);
      return { from: ymd(first), to: ymd(last) };
    }
    case "30g":
      return { from: ymd(shiftDays(today, -29)), to: ymd(today) };
  }
};

const PRESETS: Array<{ value: PresetKey; label: string }> = [
  { value: "settimana", label: "Settimana" },
  { value: "mese", label: "Mese" },
  { value: "30g", label: "30 giorni" },
  { value: "custom", label: "Personalizzato" },
];

const parseYmd = (value: string) => new Date(`${value}T12:00:00`);
const spanDays = (range: Range) =>
  Math.round((parseYmd(range.to).getTime() - parseYmd(range.from).getTime()) / 86_400_000) + 1;

/**
 * Le frecce fanno scorrere il periodo COME È FATTO: una settimana salta di
 * sette giorni, un mese di un mese (non di trenta giorni), tutto il resto della
 * propria durata. Scorrere un mese di 30 giorni disallineerebbe subito il
 * primo del mese, ed è la cosa che si nota di più.
 */
const stepRange = (range: Range, preset: PresetKey, direction: 1 | -1): Range => {
  if (preset === "mese") {
    const first = parseYmd(range.from);
    const shifted = new Date(first.getFullYear(), first.getMonth() + direction, 1, 12);
    const last = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0, 12);
    return { from: ymd(shifted), to: ymd(last) };
  }
  const days = spanDays(range) * direction;
  return {
    from: ymd(shiftDays(parseYmd(range.from), days)),
    to: ymd(shiftDays(parseYmd(range.to), days)),
  };
};

/** "14 – 20 set", con mese e anno ripetuti solo quando cambiano. */
const formatRangeLabel = (range: Range) => {
  const start = parseYmd(range.from);
  const end = parseYmd(range.to);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const endLabel = end.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    ...(sameYear && end.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
  if (range.from === range.to) return endLabel;
  const startLabel = start.toLocaleDateString("it-IT", {
    day: "numeric",
    ...(sameMonth ? {} : { month: "short" }),
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${startLabel} – ${endLabel}`;
};

/** Il nome del periodo quando coincide con un preset di oggi, se no le date. */
const periodLabel = (range: Range, preset: PresetKey) => {
  if (preset !== "custom") {
    const current = presetRange(preset);
    if (current.from === range.from && current.to === range.to) {
      return { settimana: "Questa settimana", mese: "Questo mese", "30g": "Ultimi 30 giorni" }[
        preset
      ];
    }
  }
  return formatRangeLabel(range);
};

// ── Formattazione ───────────────────────────────────────────────────────────

function formatMinutesAsHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0 && m > 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "oggi alle 10:30" / "il 12 set alle 18:00": dove si è fermata la misura. */
const formatMeasuredUntil = (iso: string) => {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const isToday = ymd(date) === ymd(new Date());
  if (isToday) return `oggi alle ${time}`;
  return `il ${date.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} alle ${time}`;
};

const BAR_MAX_HEIGHT = 52;
const BAR_MIN_HEIGHT = 8;

type Meta = { measuredUntil: string | null; partial: boolean };

/**
 * Consorziata senza Reglo: il report non esiste per lei (REG-429). Il
 * controllo sta nel wrapper — dentro, gli hook devono restare incondizionati.
 */
export function AutoscuoleOreGuidaPage() {
  const company = useAtomValue(companyAtom);
  if (isAffiliateWithoutReglo(company?.services ?? null)) {
    return <LockedSection {...LOCKED_SECTIONS.oreGuida} />;
  }
  return <AutoscuoleOreGuidaPageInner />;
}

function AutoscuoleOreGuidaPageInner() {

  const router = useRouter();
  const [preset, setPreset] = React.useState<PresetKey>("settimana");
  const [range, setRange] = React.useState<Range>(() => presetRange("settimana"));
  const [data, setData] = React.useState<InstructorHoursRange[] | null>(null);
  const [meta, setMeta] = React.useState<Meta>({ measuredUntil: null, partial: false });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/autoscuole/instructor-hours?from=${range.from}&to=${range.to}`)
      .then((res) => res.json())
      .then((json) => {
        if (!active || !json.success) return;
        setData(json.data);
        setMeta({ measuredUntil: json.measuredUntil ?? null, partial: Boolean(json.partial) });
      })
      .catch(() => {
        // ignora: resta lo stato precedente
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range.from, range.to]);

  const onPreset = (next: PresetKey) => {
    setPreset(next);
    if (next !== "custom") setRange(presetRange(next));
  };

  // Memoizzata: `data ?? []` creerebbe un array nuovo a ogni render e i useMemo
  // qui sotto non memorizzerebbero niente.
  const entries = React.useMemo(() => data ?? [], [data]);
  const label = periodLabel(range, preset);
  const teamTotalMinutes = entries.reduce((sum, e) => sum + e.total.totalMinutes, 0);
  const teamTheoryMinutes = entries.reduce((sum, e) => sum + e.total.theoryMinutes, 0);
  const lateList = entries.filter((e) => e.total.lateCancellationMinutes > 0);
  const teamOccupancy = React.useMemo(
    () => sumOccupancy(entries.map((e) => e.occupancy)),
    [entries],
  );
  // Scala comune a tutte le card: barre alte uguali vogliono dire ore uguali,
  // altrimenti l'istruttore fermo sembra pieno quanto quello che lavora.
  const barFullMinutes = React.useMemo(() => {
    const max = Math.max(0, ...entries.flatMap((e) => e.buckets.map((b) => b.totalMinutes)));
    return max > 0 ? max : 60;
  }, [entries]);

  const handleExport = () => {
    if (!entries.length) return;
    downloadCsv(
      `reglo-ore-guida_${range.from}_${range.to}.csv`,
      buildOreGuidaCsv({ entries, range, periodLabel: label, meta }),
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
          {/* Titolo + totale team + export */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-[-0.3px] text-foreground">Ore guida</h1>
              <div className="mt-1.5 text-sm font-medium text-[#929292]">
                Totale ore · {formatMinutesAsHours(teamTotalMinutes)}
                {teamTheoryMinutes > 0 && (
                  <span className="text-[#4f46e5]">
                    {" "}
                    · Teoria {formatMinutesAsHours(teamTheoryMinutes)}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={!entries.length}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dddddd] bg-white px-[15px] py-[7px] text-[13px] font-semibold text-[#222222] transition-colors hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="size-3.5" strokeWidth={2} />
              Esporta
            </button>
          </div>

          {/* ── Filtro periodo ── */}
          <div className="mb-6 mt-5 flex flex-wrap items-center gap-3 border-y border-[#f0f0f0] py-3">
            <SegmentedControl value={preset} onChange={onPreset} options={PRESETS} />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRange((prev) => stepRange(prev, preset, -1))}
                aria-label="Periodo precedente"
                className="flex size-8 cursor-pointer items-center justify-center rounded-full text-[#222222] transition-colors hover:bg-[#f2f2f2]"
              >
                <ChevronLeft className="size-4" strokeWidth={2} />
              </button>
              <span className="min-w-[150px] select-none whitespace-nowrap text-center text-[15px] font-semibold text-[#222222]">
                {label}
              </span>
              <button
                type="button"
                onClick={() => setRange((prev) => stepRange(prev, preset, 1))}
                aria-label="Periodo successivo"
                className="flex size-8 cursor-pointer items-center justify-center rounded-full text-[#222222] transition-colors hover:bg-[#f2f2f2]"
              >
                <ChevronRight className="size-4" strokeWidth={2} />
              </button>
            </div>
            {preset === "custom" && (
              <div className="flex items-center gap-2">
                <DatePickerInput
                  value={range.from}
                  onChange={(value) =>
                    setRange((prev) => ({ from: value, to: prev.to < value ? value : prev.to }))
                  }
                  className="h-9 w-[160px]"
                />
                <span className="text-[13px] font-medium text-[#9a9a9a]">→</span>
                <DatePickerInput
                  value={range.to}
                  onChange={(value) =>
                    setRange((prev) => ({ from: prev.from > value ? value : prev.from, to: value }))
                  }
                  className="h-9 w-[160px]"
                />
              </div>
            )}
            {loading && data !== null && (
              <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[#9a9a9a]">
                <span className="size-1.5 animate-pulse rounded-full bg-[#111111]" />
                aggiorno…
              </span>
            )}
          </div>

          {entries.length > 0 && <AgendaOccupancyBand occupancy={teamOccupancy} meta={meta} />}

          {data === null && loading ? (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <HoursCardSkeleton key={i} />
              ))}
            </div>
          ) : !entries.length ? (
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
                {entries.map((entry) => (
                  <InstructorHoursCard
                    key={entry.instructorId}
                    entry={entry}
                    periodLabel={label}
                    barFullMinutes={barFullMinutes}
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
function AgendaOccupancyBand({
  occupancy,
  meta,
}: {
  occupancy: AgendaOccupancy;
  meta: Meta;
}) {
  const freeMinutes = Math.max(0, occupancy.availableMinutes - occupancy.busyMinutes);
  const percent = Math.round(occupancy.ratio * 100);
  const notStarted = meta.measuredUntil === null;
  const hasAvailability = occupancy.availableMinutes > 0;

  return (
    <div className="mb-3.5 flex items-start gap-10 rounded-[14px] border border-[#dddddd] bg-white px-[22px] py-[18px]">
      <div className="w-[250px] flex-none">
        <div className="text-[13px] font-semibold uppercase tracking-[0.1px] text-[#929292]">
          Agenda occupata
        </div>
        <div className="mt-[7px] text-[30px] font-extrabold leading-none tracking-[-1px] text-[#222222]">
          {notStarted || !hasAvailability ? "—" : `${percent}%`}
        </div>
        <div className="mt-1.5 text-[13px] font-medium text-[#929292]">
          {notStarted
            ? "Il periodo non è ancora iniziato"
            : hasAvailability
              ? `${formatMinutesAsHours(occupancy.busyMinutes)} occupate su ${formatMinutesAsHours(occupancy.availableMinutes)} disponibili`
              : "Nessuna fascia di disponibilità in agenda nel periodo"}
        </div>
      </div>
      {notStarted ? (
        // Barra, legenda e spiegazioni su un periodo che deve ancora arrivare
        // sarebbero solo rumore: non c'è niente da misurare, e basta dirlo.
        <p className="min-w-0 flex-1 pt-2 text-[12.5px] font-medium leading-[1.5] text-[#b0b0b0]">
          {"L'occupazione si misura sulle ore già trascorse. Scegli un periodo che è già cominciato per vedere quante delle ore dichiarate in agenda sono state occupate."}
        </p>
      ) : (
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
            Occupate{" "}
            <b className="font-bold text-[#222222]">
              {formatMinutesAsHours(occupancy.busyMinutes)}
            </b>
          </span>
          <span>
            <span className="mr-1.5 inline-block size-2 translate-y-px rounded-[2px] bg-[#ebebeb]" />
            Libere <b className="font-bold text-[#222222]">{formatMinutesAsHours(freeMinutes)}</b>
          </span>
          {occupancy.outsideMinutes > 0 && (
            <span>
              <span className="mr-1.5 inline-block size-2 translate-y-px rounded-[2px] border border-dashed border-[#c4c4c4]" />
              Fuori fascia{" "}
              <b className="font-bold text-[#222222]">
                {formatMinutesAsHours(occupancy.outsideMinutes)}
              </b>
            </span>
          )}
        </div>
        <p className="mt-3.5 max-w-[700px] text-[12px] font-medium leading-[1.5] text-[#b0b0b0]">
          Si contano solo le ore <b className="font-semibold">già trascorse</b>
          {meta.partial && meta.measuredUntil
            ? ` (misurato fino a ${formatMeasuredUntil(meta.measuredUntil)})`
            : ""}
          : quelle che devono ancora venire non sono né occupate né perse. Le ore disponibili
          sono le fasce in agenda al netto di ferie, malattia, lezioni teoriche, blocchi e
          chiusure; sono occupate tutte le guide, gli esami e le guide di gruppo non annullati —
          anche quelli non ancora svolti, per questo le ore occupate non coincidono con le ore
          di guida qui sopra.
          {occupancy.outsideMinutes > 0 &&
            " Quello che cade fuori dalle fasce dichiarate è contato a parte e non entra nel rapporto."}
        </p>
        </div>
      )}
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
      <div className="mt-auto border-t border-[#f5f5f5] pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium text-[#929292]">Agenda occupata</span>
          <span className="shrink-0 text-[13px] font-medium text-[#c1c1c1]">
            {allBlocked ? "Non disponibile" : "Nessuna fascia"}
          </span>
        </div>
        <div className="mt-1.5 text-[12px] font-medium text-[#b0b0b0]">
          {allBlocked
            ? "Le fasce del periodo sono coperte da ferie, malattia o blocchi."
            : "Non ha fasce di disponibilità in agenda nel periodo."}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-auto border-t border-[#f5f5f5] pt-3">
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
          <Skeleton
            key={i}
            className="flex-1 rounded-b-none rounded-t-[3px]"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="mt-3 border-t border-[#f5f5f5] pt-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-8" />
        </div>
        <Skeleton className="mt-[7px] h-1.5 w-full rounded-full" />
      </div>
    </div>
  );
}

/**
 * Quante etichette stanno sotto le barre senza accavallarsi. Con sette bucket
 * ci stanno tutte; con tredici settimane no, e mostrarne una ogni tot è meglio
 * che stamparle tutte illeggibili.
 */
const labelEvery = (count: number) => (count <= 7 ? 1 : Math.ceil(count / 7));

/** Card istruttore: nome, totale del periodo, barre, riga "Agenda occupata". */
function InstructorHoursCard({
  entry,
  periodLabel,
  barFullMinutes,
}: {
  entry: InstructorHoursRange;
  periodLabel: string;
  barFullMinutes: number;
}) {
  const step = labelEvery(entry.buckets.length);
  return (
    <div className="flex flex-col rounded-[14px] border border-[#dddddd] bg-white p-5">
      <div className="mb-2 text-base font-bold text-[#222222]">{entry.instructorName}</div>
      <div className="mb-4">
        <span className="text-[30px] font-extrabold leading-none tracking-[-1px] text-[#222222]">
          {formatMinutesAsHours(entry.total.totalMinutes)}
        </span>
        <div className="mt-[5px] text-[13px] font-medium text-[#929292]">{periodLabel}</div>
        {entry.total.theoryMinutes > 0 && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#E6E9FF] px-2.5 py-1 text-[12px] font-semibold text-[#3730a3]">
            <BookOpen className="size-3.5" strokeWidth={2} />
            Lezione teorica · {formatMinutesAsHours(entry.total.theoryMinutes)}
          </div>
        )}
      </div>
      <div className="mb-2 flex h-[52px] items-end gap-[3px]">
        {entry.buckets.map((bucket) => {
          const height =
            bucket.totalMinutes <= 0
              ? 3
              : Math.min(
                  BAR_MAX_HEIGHT,
                  Math.max(
                    BAR_MIN_HEIGHT,
                    Math.round((bucket.totalMinutes / barFullMinutes) * BAR_MAX_HEIGHT),
                  ),
                );
          return (
            <div
              key={bucket.key}
              title={
                bucket.totalMinutes > 0
                  ? `${bucket.label}: ${formatMinutesAsHours(bucket.totalMinutes)}`
                  : undefined
              }
              className={cn(
                "min-w-[2px] flex-1 rounded-t-[3px]",
                bucket.totalMinutes > 0 ? "bg-[#111111]" : "bg-[#f7f7f7]",
              )}
              style={{ height: `${height}px` }}
            />
          );
        })}
      </div>
      <div className="mb-3.5 flex text-[10px] font-medium text-[#c1c1c1]">
        {entry.buckets.map((bucket, i) => (
          <span key={bucket.key} className="min-w-0 flex-1 truncate text-center">
            {i % step === 0 ? bucket.label : ""}
          </span>
        ))}
      </div>
      <InstructorOccupancyRow occupancy={entry.occupancy} />
    </div>
  );
}

/** Card "Cancellazioni tardive" del proto: ore del periodo per istruttore, in rosso. */
function LateCancellationsCard({ entries }: { entries: InstructorHoursRange[] }) {
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
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="flex-none cursor-pointer"
          >
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
              {formatMinutesAsHours(entry.total.lateCancellationMinutes)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
