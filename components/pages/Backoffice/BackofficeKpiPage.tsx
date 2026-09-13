"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Download, Info } from "lucide-react";

import { getBackofficeKpis } from "@/lib/actions/backoffice-kpi.actions";
import type { BackofficeKpis } from "@/lib/backoffice/kpi-compute";
import { DatePickerInput } from "@/components/ui/date-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import {
  BookingSourceChart,
  CHART_COLORS,
  DevicesDonut,
  GrowthChart,
  LessonsTrendChart,
} from "./kpi/KpiCharts";
import { InvestorLinksPanel } from "./kpi/InvestorLinksPanel";
import { KpiCard, KpiSection, LegendDot } from "./kpi/KpiPrimitives";
import {
  COMPANY_KIND_LABEL,
  buildKpiCsv,
  downloadCsv,
  formatEuro,
  formatInt,
  formatPercent,
  formatRangeLabel,
  formatRelativeDay,
} from "./kpi/kpi-format";

// ───────────────────────────────────────────────────────────────────────────
// Backoffice → KPI. Una pagina sola, filtrata per periodo, che risponde a tre
// domande in quest'ordine: quanto vale l'azienda, quanto viene usato il
// prodotto, chi lo sta usando (e chi no).
// ───────────────────────────────────────────────────────────────────────────

type PresetKey = "oggi" | "7g" | "30g" | "mese" | "trimestre" | "anno" | "custom";

const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const shiftDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/** I preset producono SEMPRE un intervallo esplicito: il filtro è una cosa sola. */
const presetRange = (preset: Exclude<PresetKey, "custom">) => {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  switch (preset) {
    case "oggi":
      return { from: ymd(today), to: ymd(today) };
    case "7g":
      return { from: ymd(shiftDays(today, -6)), to: ymd(today) };
    case "30g":
      return { from: ymd(shiftDays(today, -29)), to: ymd(today) };
    case "mese":
      return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
    case "trimestre":
      return { from: ymd(shiftDays(today, -89)), to: ymd(today) };
    case "anno":
      return { from: ymd(new Date(today.getFullYear(), 0, 1)), to: ymd(today) };
  }
};

const PRESETS: Array<{ value: PresetKey; label: string }> = [
  { value: "oggi", label: "Oggi" },
  { value: "7g", label: "7 giorni" },
  { value: "30g", label: "30 giorni" },
  { value: "mese", label: "Mese" },
  { value: "trimestre", label: "Trimestre" },
  { value: "anno", label: "Anno" },
  { value: "custom", label: "Personalizzato" },
];

/** Quale preset corrisponde a un intervallo (per ripristinarlo da URL). */
const presetFor = (from: string, to: string): PresetKey => {
  for (const preset of PRESETS) {
    if (preset.value === "custom") continue;
    const range = presetRange(preset.value as Exclude<PresetKey, "custom">);
    if (range.from === from && range.to === to) return preset.value;
  }
  return "custom";
};

export function BackofficeKpiPage({
  initialKpis,
  initialRange,
}: {
  initialKpis: BackofficeKpis | null;
  initialRange: { from: string; to: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useFeedbackToast();
  const reduce = useReducedMotion();

  const [range, setRange] = React.useState(initialRange);
  const [kpis, setKpis] = React.useState<BackofficeKpis | null>(initialKpis);
  const [loading, setLoading] = React.useState(false);
  const preset = presetFor(range.from, range.to);
  const [showCustom, setShowCustom] = React.useState(preset === "custom");

  // Ricarica quando cambia l'intervallo. Il primo giro è già servito dal server
  // (nessun flash di scheletri all'ingresso).
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (initialKpis) return;
    }
    let active = true;
    setLoading(true);
    getBackofficeKpis(range).then((res) => {
      if (!active) return;
      setLoading(false);
      if (!res.success || !res.data) {
        toast.error({ description: res.message ?? "Impossibile calcolare i KPI." });
        return;
      }
      setKpis(res.data);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  // L'intervallo vive nell'URL: un link a un periodo si incolla in chat.
  const applyRange = React.useCallback(
    (next: { from: string; to: string }) => {
      setRange(next);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("da", next.from);
      params.set("a", next.to);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const onPreset = (value: PresetKey) => {
    if (value === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    applyRange(presetRange(value));
  };

  const exportCsv = () => {
    if (!kpis) return;
    downloadCsv(`reglo-kpi_${kpis.range.from}_${kpis.range.to}.csv`, buildKpiCsv(kpis));
  };

  const head = kpis?.headline;
  const activity = kpis?.activity;
  const doneSeries = activity?.series.map((p) => p.done) ?? [];
  const bookedSeries = activity?.series.map((p) => p.booked) ?? [];
  const maxLessons = Math.max(1, ...(kpis?.companies.map((c) => c.lessons) ?? [1]));
  const maxFeature = Math.max(1, ...(kpis?.features.map((f) => f.companies) ?? [1]));
  const maxVersion = Math.max(1, ...(kpis?.app.versions.map((v) => v.count) ?? [1]));
  const specialKinds = (kpis?.companies ?? []).filter((c) => c.kind !== "autoscuola");

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 lg:px-6">
      {/* ── Testata ── */}
      <motion.header
        initial={reduce ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3"
      >
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-foreground">KPI</h1>
          <p className="text-sm text-muted-foreground">
            {kpis ? (
              <>
                {formatRangeLabel(kpis.range.from, kpis.range.to)}
                <span className="mx-2 text-[#d5d5dd]">·</span>
                <span className="text-[#9a9a9a]">
                  confronto con {formatRangeLabel(kpis.range.previousFrom, kpis.range.previousTo)}
                </span>
              </>
            ) : (
              "Andamento di Reglo nel periodo scelto."
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!kpis}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-semibold text-foreground transition-colors hover:border-[#929292] disabled:cursor-default disabled:opacity-50"
        >
          <Download className="size-4" strokeWidth={2} />
          Esporta CSV
        </button>
      </motion.header>

      {/* ── Filtro periodo (resta in vista mentre si scorre) ── */}
      <div className="sticky top-16 z-20 -mx-4 mt-5 border-b border-[#eeeef2] bg-[#fbfbfc] px-4 py-3 shadow-[0_6px_16px_-14px_rgba(26,26,46,0.5)] lg:-mx-6 lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            value={showCustom ? "custom" : preset}
            onChange={onPreset}
            options={PRESETS}
          />
          {showCustom && (
            <motion.div
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex items-center gap-2"
            >
              <DatePickerInput
                value={range.from}
                onChange={(value) => applyRange({ from: value, to: range.to < value ? value : range.to })}
                className="h-9 w-[168px]"
              />
              <span className="text-[13px] font-medium text-[#9a9a9a]">→</span>
              <DatePickerInput
                value={range.to}
                onChange={(value) => applyRange({ from: range.from > value ? value : range.from, to: value })}
                className="h-9 w-[168px]"
              />
            </motion.div>
          )}
          {loading && (
            <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[#9a9a9a]">
              <span className="size-1.5 animate-pulse rounded-full bg-[#1a1a2e]" />
              aggiorno…
            </span>
          )}
        </div>
      </div>

      {/* ── Card principali, in DUE gruppi ──────────────────────────────────
           MRR e autoscuole attive sono uno stato di ADESSO: non cambiano col
           filtro, e messe nella stessa griglia delle altre sembravano "MRR
           degli ultimi 30 giorni". Separate per etichetta, non per colore. */}
      <div className={cn("mt-7", loading && "opacity-60 transition-opacity")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9a9aa8]">
          Adesso
          <span className="ml-2 font-medium normal-case tracking-normal text-[#b4b4bd]">
            non cambia col periodo
          </span>
        </p>
      </div>
      <div className={cn("mt-3 grid gap-3 sm:grid-cols-2", loading && "opacity-60 transition-opacity")}>
        <KpiCard
          index={0}
          label="MRR"
          value={(head?.mrrCents ?? 0) / 100}
          suffix="€"
          loading={!kpis}
          hint={
            kpis
              ? `${formatEuro(head?.arrCents ?? 0)} ARR · piani registrati su ${head?.plansCovered ?? 0} di ${head?.companiesTotal ?? 0} autoscuole`
              : undefined
          }
        />
        <KpiCard
          index={1}
          label="Autoscuole attive"
          value={head?.activeCompanies ?? 0}
          loading={!kpis}
          hint={kpis ? `su ${head?.companiesTotal ?? 0} registrate` : undefined}
        />
      </div>

      <div className={cn("mt-8", loading && "opacity-60 transition-opacity")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9a9aa8]">
          Nel periodo
          {kpis && (
            <span className="ml-2 font-medium normal-case tracking-normal text-[#b4b4bd]">
              {formatRangeLabel(kpis.range.from, kpis.range.to)}
            </span>
          )}
        </p>
      </div>
      <div className={cn("mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4", loading && "opacity-60 transition-opacity")}>
        <KpiCard
          index={2}
          label="Guide svolte"
          value={head?.lessonsDone?.current ?? 0}
          delta={head?.lessonsDone}
          loading={!kpis}
          spark={doneSeries}
        />
        <KpiCard
          index={3}
          label="Media guide al giorno"
          value={head?.lessonsPerDay?.current ?? 0}
          decimals={1}
          delta={head?.lessonsPerDay}
          loading={!kpis}
          hint={kpis ? `su ${kpis.range.days} giorni di periodo` : undefined}
        />
        <KpiCard
          index={4}
          label="Prenotate dall'app"
          value={(head?.appShare?.current ?? 0) * 100}
          decimals={1}
          suffix="%"
          delta={head?.appShare}
          loading={!kpis}
          hint={
            kpis
              ? `${formatInt(activity?.booked?.current ?? 0)} prenotazioni nel periodo`
              : undefined
          }
        />
        <KpiCard
          index={5}
          label="Istruttori attivi"
          value={head?.activeInstructors?.current ?? 0}
          delta={head?.activeInstructors}
          loading={!kpis}
          hint={
            kpis
              ? `${kpis.revenue.seatsUsed} in agenda su ${kpis.revenue.seatsSold} posti a piano`
              : undefined
          }
        />
      </div>

      {/* ── Andamento ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <KpiSection
          className="lg:col-span-2"
          title="Andamento delle guide"
          subtitle="Guide che si svolgono nel periodo. Le annullate sono contate nel giorno in cui si sarebbero dovute svolgere."
          aside={
            kpis && (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                <LegendDot color={CHART_COLORS.NAVY} label="Svolte" value={formatInt(head?.lessonsDone?.current ?? 0)} />
                <LegendDot color={CHART_COLORS.RED} label="Annullate" value={formatInt(activity?.cancelled ?? 0)} />
              </div>
            )
          }
        >
          {kpis ? <LessonsTrendChart series={activity!.series} /> : <Skeleton className="h-[264px] w-full rounded-xl" />}
        </KpiSection>

        <KpiSection title="Qualità del periodo" subtitle="Cosa è successo davvero alle guide messe in agenda.">
          {kpis ? (
            <dl className="divide-y divide-[#f2f2f5]">
              {[
                {
                  label: "Guide prenotate",
                  value: formatInt(activity!.booked?.current ?? 0),
                  hint: "nuove prenotazioni create nel periodo",
                },
                {
                  label: "Tasso di annullamento",
                  value: formatPercent(activity!.cancelRate, 1),
                  hint: `${formatInt(activity!.cancelled)} guide annullate`,
                  alarm: activity!.cancelRate > 0.25,
                },
                {
                  label: "No show",
                  value: formatInt(activity!.noShow),
                  hint: "allievi non presentati",
                },
                {
                  label: "Allievi attivi",
                  value: formatInt(activity!.activeStudents),
                  hint: `${formatInt(activity!.newStudents)} nuovi iscritti nel periodo`,
                },
                {
                  label: "Nuove autoscuole",
                  value: formatInt(kpis.headline.newCompanies),
                  hint: "entrate nel periodo",
                },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <dt className="text-[13.5px] font-semibold text-[#1a1a2e]">{row.label}</dt>
                    <dd className="mt-0.5 text-[12px] font-medium text-[#9a9a9a]">{row.hint}</dd>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-[17px] font-semibold tabular-nums text-[#1a1a2e]",
                      row.alarm && "text-[#b42318]",
                    )}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </dl>
          ) : (
            <div className="space-y-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          )}
        </KpiSection>
      </div>

      {/* ── Canali ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <KpiSection
          className="lg:col-span-2"
          title="Da dove arrivano le prenotazioni"
          subtitle="Per data di prenotazione, non di guida: è la domanda, non il calendario."
        >
          {kpis ? <BookingSourceChart sources={activity!.sources} /> : <Skeleton className="h-[236px] w-full rounded-xl" />}
        </KpiSection>

        <KpiSection title="Totali per canale" subtitle="Nel periodo scelto.">
          {kpis ? (
            activity!.sourceTotals.length ? (
              <ul className="space-y-3">
                {activity!.sourceTotals.map((source) => {
                  const total = activity!.sourceTotals.reduce((n, s) => n + s.count, 0) || 1;
                  const share = source.count / total;
                  return (
                    <li key={source.key}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13px] font-medium text-[#4a4a55]">
                          {source.label}
                        </span>
                        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#1a1a2e]">
                          {formatInt(source.count)}
                          <span className="ml-1.5 text-[11.5px] font-medium text-[#9a9a9a]">
                            {formatPercent(share)}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f2f2f5]">
                        <motion.div
                          className="h-full rounded-full bg-[#1a1a2e]"
                          initial={reduce ? false : { width: 0 }}
                          animate={{ width: `${Math.max(share * 100, 2)}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-[13px] font-medium italic text-[#a8a8a8]">
                Nessuna prenotazione nel periodo.
              </p>
            )
          ) : (
            <Skeleton className="h-[200px] w-full rounded-xl" />
          )}
        </KpiSection>
      </div>

      {/* ── Crescita ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <KpiSection
          className="lg:col-span-2"
          title="Crescita"
          subtitle="Ultimi 12 mesi, indipendente dal filtro. L'MRR cumulato è una stima: ogni piano conta dalla data in cui è stato registrato in backoffice."
        >
          {kpis ? <GrowthChart growth={kpis.revenue.growth} /> : <Skeleton className="h-[236px] w-full rounded-xl" />}
        </KpiSection>

        <KpiSection title="Ricavi" subtitle="Dai piani registrati in backoffice.">
          {kpis ? (
            <dl className="divide-y divide-[#f2f2f5]">
              {[
                { label: "MRR", value: formatEuro(kpis.headline.mrrCents), hint: "ricorrente mensile" },
                { label: "ARR", value: formatEuro(kpis.headline.arrCents), hint: "proiezione annua" },
                {
                  label: "ARPA",
                  value: formatEuro(kpis.revenue.arpaCents),
                  hint: "media per autoscuola pagante",
                },
                {
                  label: "Una tantum",
                  value: formatEuro(kpis.revenue.oneOffCents),
                  hint: `${kpis.revenue.oneOffCount} acquisti di licenze nel periodo`,
                },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                  <div>
                    <dt className="text-[13.5px] font-semibold text-[#1a1a2e]">{row.label}</dt>
                    <dd className="mt-0.5 text-[12px] font-medium text-[#9a9a9a]">{row.hint}</dd>
                  </div>
                  <span className="shrink-0 text-[17px] font-semibold tabular-nums text-[#1a1a2e]">
                    {row.value}
                  </span>
                </div>
              ))}
            </dl>
          ) : (
            <Skeleton className="h-[200px] w-full rounded-xl" />
          )}
        </KpiSection>
      </div>

      {/* ── Autoscuole ── */}
      <KpiSection
        className="mt-4"
        title="Autoscuole nel periodo"
        subtitle={
          specialKinds.length
            ? "Gli account di tipo diverso (Solo Segretaria, Consorzio) sono inclusi in tutti i conteggi e nelle medie: qui sono etichettati perché per natura fanno pochissime guide."
            : "Ordinate per guide svolte nel periodo."
        }
        bodyClassName="px-0 pb-2"
      >
        {kpis ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#f0f0f3] text-[11px] font-semibold uppercase tracking-[0.07em] text-[#9a9a9a]">
                  <th className="px-6 py-2.5 font-semibold">Autoscuola</th>
                  <th className="py-2.5 pr-4 font-semibold">Guide svolte</th>
                  <th className="py-2.5 pr-4 text-right font-semibold">Annullate</th>
                  <th className="py-2.5 pr-4 text-right font-semibold">Allievi attivi</th>
                  <th className="py-2.5 pr-4 text-right font-semibold">Quota app</th>
                  <th className="px-6 py-2.5 text-right font-semibold">Ultima guida</th>
                </tr>
              </thead>
              <tbody>
                {kpis.companies.map((company) => {
                  const idle = company.lessons === 0;
                  return (
                    <tr
                      key={company.id}
                      className={cn(
                        "border-b border-[#f6f6f8] transition-colors last:border-0 hover:bg-[#fafafb]",
                        idle && "text-[#9a9a9a]",
                      )}
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn("truncate text-[13.5px] font-semibold", idle ? "text-[#6a6a6a]" : "text-[#1a1a2e]")}>
                            {company.name}
                          </span>
                          {company.kind !== "autoscuola" && (
                            <span className="shrink-0 rounded-full bg-[#f2f2f5] px-2 py-0.5 text-[10.5px] font-semibold text-[#6a6a6a]">
                              {COMPANY_KIND_LABEL[company.kind]}
                            </span>
                          )}
                          {!company.active && (
                            <span className="shrink-0 rounded-full bg-[#fdecec] px-2 py-0.5 text-[10.5px] font-semibold text-[#b42318]">
                              Disattivata
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-[#f2f2f5]">
                            <motion.div
                              className={cn("h-full rounded-full", idle ? "bg-[#e4e4e9]" : "bg-[#1a1a2e]")}
                              initial={reduce ? false : { width: 0 }}
                              animate={{ width: `${(company.lessons / maxLessons) * 100}%` }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-[13px] font-semibold tabular-nums">
                            {formatInt(company.lessons)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right text-[13px] tabular-nums">
                        {formatInt(company.cancelled)}
                      </td>
                      <td className="py-3 pr-4 text-right text-[13px] tabular-nums">
                        {formatInt(company.activeStudents)}
                      </td>
                      <td className="py-3 pr-4 text-right text-[13px] tabular-nums">
                        {company.appShare === null ? "—" : formatPercent(company.appShare)}
                      </td>
                      <td className="px-6 py-3 text-right text-[12.5px] font-medium">
                        {formatRelativeDay(company.lastActivityAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-2 px-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        )}
      </KpiSection>

      {/* ── Feature + app ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <KpiSection
          className="lg:col-span-2"
          title="Uso delle funzionalità"
          subtitle="Quante autoscuole hanno usato ogni funzionalità nel periodo, e quante volte."
        >
          {kpis ? (
            <ul className="space-y-3.5">
              {kpis.features.map((feature) => (
                <li key={feature.key} className={cn(feature.companies === 0 && "opacity-55")}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold text-[#1a1a2e]">
                      {feature.label}
                      <span className="ml-2 text-[12px] font-medium text-[#9a9a9a]">
                        {feature.description}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#1a1a2e]">
                      {feature.companies}
                      <span className="ml-1 text-[11.5px] font-medium text-[#9a9a9a]">
                        autoscuole · {formatInt(feature.events)} volte
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f2f2f5]">
                    <motion.div
                      className="h-full rounded-full bg-[#1a1a2e]"
                      initial={reduce ? false : { width: 0 }}
                      animate={{ width: `${(feature.companies / maxFeature) * 100}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Skeleton className="h-[240px] w-full rounded-xl" />
          )}
        </KpiSection>

        <KpiSection
          title="Parco app"
          subtitle="Dispositivi che hanno aperto l'app nel periodo."
        >
          {kpis ? (
            <>
              <DevicesDonut ios={kpis.app.ios} android={kpis.app.android} total={kpis.app.devices} />
              {kpis.app.devices > 0 && (
                <div className="mt-3 flex justify-center gap-4">
                  <LegendDot color={CHART_COLORS.NAVY} label="iOS" value={formatInt(kpis.app.ios)} />
                  <LegendDot color={CHART_COLORS.GREY} label="Android" value={formatInt(kpis.app.android)} />
                </div>
              )}
              {kpis.app.versions.length > 0 && (
                <ul className="mt-5 space-y-2 border-t border-[#f2f2f5] pt-4">
                  {kpis.app.versions.slice(0, 5).map((version) => (
                    <li key={version.version} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 text-[12.5px] font-semibold tabular-nums text-[#4a4a55]">
                        {version.version}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f2f2f5]">
                        <motion.div
                          className="h-full rounded-full bg-[#c9c9d6]"
                          initial={reduce ? false : { width: 0 }}
                          animate={{ width: `${(version.count / maxVersion) * 100}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-[#1a1a2e]">
                        {version.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <Skeleton className="h-[260px] w-full rounded-xl" />
          )}
        </KpiSection>
      </div>

      {/* ── Link investor (pagina pubblica a token) ── */}
      <InvestorLinksPanel />

      {/* ── Nota metodologica: i limiti si dicono, non si nascondono ── */}
      <p className="mt-6 flex items-start gap-2 text-[12px] font-medium leading-relaxed text-[#9a9a9a]">
        <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
        <span>
          MRR e ARR vengono dai piani registrati a mano in backoffice, non dal fatturato.
          Le guide più vecchie del campo &quot;canale di prenotazione&quot; finiscono in
          &quot;Storico&quot;. Lo storico dei cambi di stato delle autoscuole non è tracciato:
          per questo &quot;Autoscuole attive&quot; è una fotografia di adesso e non ha confronto
          col periodo precedente.
        </span>
      </p>
    </div>
  );
}
