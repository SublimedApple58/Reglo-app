"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Plus, Search, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  CATEGORY_LABEL,
  CATEGORY_SHORT,
  ROUND_CATEGORIES,
  STATUS_LABEL,
  summarize,
  type RoundCategory,
  type RoundStatus,
} from "@/lib/round/round-constants";
import type { RoundInfo, RoundInvestorRow } from "@/lib/round/round-data";
import { cn } from "@/lib/utils";

import { InvestorSheet } from "./InvestorSheet";
import { CountUp, RoundDonut } from "./RoundDonut";
import { OwnerAvatar, StatusDot } from "./round-ui";

/**
 * Il round in una ciambella. Si apre senza liste: al passaggio su una fetta
 * compaiono conteggio e percentuale, al clic (e solo allora) la lista di quei
 * contatti. Su telefono il primo tocco mostra i numeri, il secondo la lista,
 * che arriva come foglio dal basso.
 */

type Mode = "stato" | "tipologia";
type Slice = { key: string; label: string; count: number; color: string; dark: string; hint?: string };
type Panel = { kind: "slice"; key: string } | { kind: "tutti" } | { kind: "esclusi" };

/** Il giro della ciambella per stato: dal più avanti al non ancora partito. */
const RING_STATUSES: RoundStatus[] = [
  "impegno",
  "interessato",
  "call",
  "risposto",
  "contattato",
  "in_pausa",
  "bloccato",
  "no",
  "da_contattare",
];
/** Palette viva ma sobria: [chiaro, scuro] di ogni gradiente. */
const RING_STATUS_COLOR: Record<RoundStatus, [string, string]> = {
  impegno: ["#6ee7b7", "#047857"],
  interessato: ["#5eead4", "#0f766e"],
  call: ["#c4b5fd", "#6d28d9"],
  risposto: ["#f0abfc", "#c026d3"],
  contattato: ["#7dd3fc", "#0369a1"],
  in_pausa: ["#fde68a", "#d97706"],
  bloccato: ["#fda4af", "#e11d48"],
  no: ["#e4e4e7", "#a1a1aa"],
  da_contattare: ["#f6f6f7", "#d4d4d8"],
};
const RING_CATEGORY_COLOR: Record<RoundCategory, [string, string]> = {
  business_angel: ["#c4b5fd", "#6d28d9"],
  club_angel: ["#f9a8d4", "#db2777"],
  vc_italia: ["#7dd3fc", "#0369a1"],
  family_office: ["#fde68a", "#d97706"],
  vc_europa: ["#6ee7b7", "#047857"],
  altro: ["#fda4af", "#e11d48"],
};
const swatch = (s: { color: string; dark: string }) => ({
  backgroundImage: `linear-gradient(135deg, ${s.color}, ${s.dark})`,
  boxShadow: `0 0 0 3px ${s.color}33`,
});

/** Curva di tutta la pagina: ease-out lungo, niente rimbalzi. */
const EASE = [0.16, 1, 0.3, 1] as const;
const rise = (delay: number, reduce: boolean | null) =>
  reduce
    ? {}
    : {
        initial: { opacity: 0, y: 16, filter: "blur(6px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        transition: { duration: 0.9, delay, ease: EASE },
      };

const LIST_ORDER: RoundStatus[] = [...RING_STATUSES.slice(0, 5), "bloccato", "in_pausa", "da_contattare", "no"];
const byProgress = (a: RoundInvestorRow, b: RoundInvestorRow) =>
  LIST_ORDER.indexOf(a.status) - LIST_ORDER.indexOf(b.status) || a.name.localeCompare(b.name, "it");

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** «1 M€», «250 k€». */
const compactEuro = (cents: number) => {
  const eur = cents / 100;
  if (eur >= 1_000_000) return `${(eur / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 2 })} M€`;
  if (eur >= 1_000) return `${Math.round(eur / 1_000).toLocaleString("it-IT")} k€`;
  return `${Math.round(eur).toLocaleString("it-IT")} €`;
};
const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}

export function RoundPage({
  round,
  investors,
  today,
}: {
  round: RoundInfo;
  investors: RoundInvestorRow[];
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const desktop = useIsDesktop();

  const [mode, setMode] = useState<Mode>("stato");
  const [active, setActive] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [creating, setCreating] = useState(false);

  const openId = params.get("scheda");
  const openRow = openId ? (investors.find((i) => i.id === openId) ?? null) : null;
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("scheda", id);
    else next.delete("scheda");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const summary = useMemo(() => summarize(investors), [investors]);
  const live = useMemo(() => investors.filter((i) => !i.excluded), [investors]);

  const slices: Slice[] = useMemo(() => {
    if (mode === "stato") {
      return RING_STATUSES.filter((s) => summary.byStatus[s]).map((s) => ({
        key: s,
        label: STATUS_LABEL[s],
        count: summary.byStatus[s],
        color: RING_STATUS_COLOR[s][0],
        dark: RING_STATUS_COLOR[s][1],
      }));
    }
    return ROUND_CATEGORIES.filter((c) => summary.byCategory[c].total).map((c) => {
      const b = summary.byCategory[c];
      const started = b.total - b.byStatus.da_contattare;
      return {
        key: c,
        label: CATEGORY_SHORT[c],
        count: b.total,
        color: RING_CATEGORY_COLOR[c][0],
        dark: RING_CATEGORY_COLOR[c][1],
        hint: `${started} già ${started === 1 ? "avviato" : "avviati"}`,
      };
    });
  }, [mode, summary]);

  const reduce = useReducedMotion();

  // Alone sotto l'anello: i colori delle fette, nello stesso ordine.
  const halo = useMemo(() => {
    const tot = slices.reduce((a, b) => a + b.count, 0) || 1;
    let a = 0;
    const stops = slices.map((s) => {
      const from = (a / tot) * 360;
      a += s.count;
      return `${s.dark} ${from.toFixed(1)}deg ${((a / tot) * 360).toFixed(1)}deg`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [slices]);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setActive(null);
    setPanel(null);
  };

  const panelRows = useMemo(() => {
    if (!panel) return [];
    if (panel.kind === "esclusi") return investors.filter((i) => i.excluded).sort((a, b) => a.name.localeCompare(b.name, "it"));
    if (panel.kind === "tutti") return [...live].sort(byProgress);
    return live
      .filter((i) => (mode === "stato" ? i.status === panel.key : i.category === panel.key))
      .sort(byProgress);
  }, [panel, investors, live, mode]);

  const panelTitle = !panel
    ? ""
    : panel.kind === "esclusi"
      ? "Esclusi"
      : panel.kind === "tutti"
        ? "Tutti gli investitori"
        : mode === "stato"
          ? STATUS_LABEL[panel.key as RoundStatus]
          : CATEGORY_LABEL[panel.key as RoundCategory];
  const panelSlice = panel?.kind === "slice" ? slices.find((s) => s.key === panel.key) : undefined;

  const openSlice = (key: string) => {
    setActive(key);
    setPanel({ kind: "slice", key });
  };
  const closePanel = () => {
    setPanel(null);
    setActive(null);
  };

  const stats = [
    { value: summary.funnel.contacted, label: "contattati" },
    { value: summary.funnel.responded, label: summary.funnel.responded === 1 ? "risposta" : "risposte" },
    { value: summary.funnel.call, label: "call" },
    { value: summary.funnel.interested, label: summary.funnel.interested === 1 ? "interessato" : "interessati" },
  ];

  const list = panel ? (
    <ContactList
      key={`${mode}:${panel.kind}:${panel.kind === "slice" ? panel.key : ""}`}
      title={panelTitle}
      swatch={panelSlice ? swatch(panelSlice) : undefined}
      rows={panelRows}
      showStatus={!(panel.kind === "slice" && mode === "stato")}
      excluded={panel.kind === "esclusi"}
      onOpen={(id) => setOpen(id)}
      onClose={closePanel}
    />
  ) : null;

  return (
    <div>
      <header className="flex items-start justify-between gap-4">
        <motion.div {...rise(0, reduce)}>
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#a1a1aa]">Round</p>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.025em] text-[#111111]">{round.name}</h1>
        </motion.div>
        <motion.button
          {...rise(0.1, reduce)}
          type="button"
          onClick={() => setCreating(true)}
          className="-mr-2 inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13.5px] text-[#52525b] transition-colors hover:bg-[#f4f4f5] hover:text-[#111111]"
        >
          <Plus className="h-4 w-4" />
          Aggiungi
        </motion.button>
      </header>

      <div className="mt-8 grid items-start gap-12 md:mt-6 md:grid-cols-[minmax(0,1fr)_360px] md:gap-14 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* La ciambella */}
        <div className="flex flex-col items-center">
          <motion.div {...rise(0.15, reduce)} className="relative inline-flex rounded-full bg-[#f4f4f5] p-1">
            {(["stato", "tipologia"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={cn(
                  "relative h-9 cursor-pointer rounded-full px-5 text-[13.5px] transition-colors duration-300",
                  mode === m ? "font-medium text-[#111111]" : "text-[#71717a] hover:text-[#111111]",
                )}
              >
                {mode === m ? (
                  <motion.span
                    layoutId="round-mode-pill"
                    className="absolute inset-0 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                    transition={{ duration: 0.55, ease: EASE }}
                  />
                ) : null}
                <span className="relative">{m === "stato" ? "Per stato" : "Per tipologia"}</span>
              </button>
            ))}
          </motion.div>

          <RoundDonut
            slices={slices}
            halo={halo}
            total={summary.total}
            active={active}
            selected={panel?.kind === "slice" ? panel.key : null}
            onActive={setActive}
            onOpen={openSlice}
            center={
              <DonutCenter
                slice={slices.find((s) => s.key === active) ?? null}
                total={summary.total}
                target={compactEuro(round.targetCents)}
                committed={summary.committedCents ? compactEuro(summary.committedCents) : null}
                onOpen={openSlice}
              />
            }
          />

          <dl className="mt-2 grid w-full max-w-[460px] grid-cols-4 gap-2">
            {stats.map((s, i) => (
              <motion.div key={s.label} className="text-center" {...rise(0.55 + i * 0.08, reduce)}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="text-[28px] font-medium leading-none tracking-[-0.035em] tabular-nums text-[#111111] md:text-[34px]">
                  <CountUp value={s.value} delay={0.6 + i * 0.08} duration={1.6} />
                </dd>
                <dd className="mt-2 text-[12.5px] text-[#71717a]">{s.label}</dd>
              </motion.div>
            ))}
          </dl>
        </div>

        {/* A destra la legenda; al clic su una fetta la lista ne prende il posto */}
        <div className="md:sticky md:top-24">
          <AnimatePresence mode="wait" initial={false}>
          {desktop && list ? (
            <motion.div
              key={`list:${mode}:${panel?.kind}:${panel?.kind === "slice" ? panel.key : ""}`}
              initial={reduce ? false : { opacity: 0, scale: 0.96, y: 12, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
              exit={reduce ? undefined : { opacity: 0, scale: 0.97, y: 8, filter: "blur(6px)", transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } }}
              transition={{ duration: 0.7, ease: EASE }}
              style={{ transformOrigin: "left center" }}
            >
              {list}
            </motion.div>
          ) : (
            <motion.div
              key={`legend:${mode}`}
              initial={reduce ? false : { opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={reduce ? undefined : { opacity: 0, filter: "blur(4px)", transition: { duration: 0.25 } }}
              transition={{ duration: 0.6, ease: EASE }}
            >
            <Legend
              slices={slices}
              total={summary.total}
              active={active}
              onActive={setActive}
              onOpen={openSlice}
              excluded={summary.excluded}
              onAll={() => setPanel({ kind: "tutti" })}
              onExcluded={() => setPanel({ kind: "esclusi" })}
            />
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>

      {/* Telefono: la lista come foglio dal basso */}
      <Sheet open={!desktop && !!panel} onOpenChange={(o) => !o && closePanel()}>
        <SheetContent
          side="bottom"
          className="max-h-[82dvh] gap-0 rounded-t-[28px] border-t-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 data-[state=open]:animate-[round-sheet-up-in_0.6s_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[round-sheet-up-out_0.32s_cubic-bezier(0.4,0,1,1)] [&>button:last-child]:hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetTitle className="sr-only">{panelTitle}</SheetTitle>
          <SheetDescription className="sr-only">Contatti di questa fetta</SheetDescription>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#e4e4e7]" />
          {!desktop ? list : null}
        </SheetContent>
      </Sheet>

      <InvestorSheet
        open={creating || !!openRow}
        investor={creating ? null : openRow}
        defaultCategory={mode === "tipologia" && panel?.kind === "slice" ? (panel.key as RoundCategory) : "business_angel"}
        today={today}
        onOpenChange={(o) => {
          if (o) return;
          setCreating(false);
          setOpen(null);
        }}
        onSaved={(id) => {
          setCreating(false);
          router.refresh();
          if (id) setOpen(id);
        }}
      />
    </div>
  );
}

// ── Centro della ciambella ───────────────────────────────────────────────────

function DonutCenter({
  slice,
  total,
  target,
  committed,
  onOpen,
}: {
  slice: Slice | null;
  total: number;
  target: string;
  committed: string | null;
  onOpen: (key: string) => void;
}) {
  const reduce = useReducedMotion();
  const enter = reduce ? false : { opacity: 0, y: 8, scale: 0.94, filter: "blur(6px)" };
  const leave = reduce ? undefined : { opacity: 0, y: -6, scale: 0.96, filter: "blur(4px)", transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as const } };
  return (
    <AnimatePresence mode="wait" initial={!reduce}>
      {!slice ? (
        <motion.div
          key="target"
          initial={enter}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={leave}
          transition={{ duration: 0.8, ease: EASE, delay: 0.05 }}
          className="flex flex-col items-center text-center"
        >
          <span className="text-[30px] font-semibold leading-none tracking-[-0.045em] text-[#111111] md:text-[46px]">{target}</span>
          <span className="mt-2 text-[12.5px] text-[#71717a] md:text-[13px]">{committed ? `${committed} impegnati` : "obiettivo"}</span>
          <span className="mt-0.5 text-[12px] tabular-nums text-[#a1a1aa] md:text-[12.5px]">
            <CountUp value={total} delay={0.5} /> investitori
          </span>
        </motion.div>
      ) : (
        <motion.div
          key={slice.key}
          initial={enter}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={leave}
          transition={{ duration: 0.45, ease: EASE }}
          className="flex flex-col items-center text-center"
        >
          <span className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-[#71717a]">
            <span className="h-2 w-2 rounded-full" style={swatch(slice)} />
            {slice.label}
          </span>
          <span className="mt-1 text-[32px] font-semibold leading-none tracking-[-0.045em] tabular-nums text-[#111111] md:text-[48px]">
            <CountUp value={slice.count} duration={0.7} />
          </span>
          <span className="mt-1.5 text-[12px] tabular-nums text-[#71717a] md:text-[13px]">
            {pct(slice.count, total)} del round{slice.hint ? ` · ${slice.hint}` : ""}
          </span>
          <button
            type="button"
            onClick={() => onOpen(slice.key)}
            className="pointer-events-auto mt-1 inline-flex h-9 cursor-pointer items-center gap-1 rounded-full px-3 text-[12.5px] font-medium text-[#111111] transition-colors hover:bg-[#f4f4f5] md:hidden"
          >
            Vedi chi sono <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Legenda ───────────────────────────────────────────────────────────────────

function Legend({
  slices,
  total,
  active,
  onActive,
  onOpen,
  excluded,
  onAll,
  onExcluded,
}: {
  slices: Slice[];
  total: number;
  active: string | null;
  onActive: (key: string | null) => void;
  onOpen: (key: string) => void;
  excluded: number;
  onAll: () => void;
  onExcluded: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="md:pt-16" onPointerLeave={(e) => e.pointerType === "mouse" && onActive(null)}>
      <ul className="grid grid-cols-2 gap-x-6 md:grid-cols-1">
        {slices.map((s, i) => (
          <motion.li key={s.key} {...rise(0.35 + i * 0.05, reduce)}>
            <button
              type="button"
              onPointerEnter={(e) => e.pointerType === "mouse" && onActive(s.key)}
              onFocus={() => onActive(s.key)}
              onBlur={() => onActive(null)}
              onClick={() => onOpen(s.key)}
              className={cn(
                "group flex h-11 w-full cursor-pointer items-center gap-3 text-left text-[14px] transition-opacity duration-300",
                active && active !== s.key ? "opacity-40" : "opacity-100",
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={swatch(s)} />
              <span className="min-w-0 flex-1 truncate text-[#111111]">{s.label}</span>
              <span className="tabular-nums text-[#111111]">{s.count}</span>
              <span className="hidden w-10 text-right tabular-nums text-[#a1a1aa] md:inline">{pct(s.count, total)}</span>
            </button>
          </motion.li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-between border-t border-[#f0f0f1] pt-2 text-[13px]">
        <button type="button" onClick={onAll} className="-ml-1 inline-flex h-11 cursor-pointer items-center gap-1.5 px-1 text-[#111111] hover:underline hover:underline-offset-4">
          Vedi tutti <span className="tabular-nums text-[#a1a1aa]">{total}</span>
        </button>
        {excluded ? (
          <button type="button" onClick={onExcluded} className="-mr-1 h-11 cursor-pointer px-1 text-[#a1a1aa] hover:text-[#111111]">
            {excluded} esclusi
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── Lista di una fetta ────────────────────────────────────────────────────────

function ContactList({
  title,
  swatch: dot,
  rows,
  showStatus,
  excluded,
  onOpen,
  onClose,
}: {
  title: string;
  swatch?: React.CSSProperties;
  rows: RoundInvestorRow[];
  showStatus: boolean;
  excluded: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = norm(query.trim());
    return q ? rows.filter((r) => norm([r.name, r.organization, r.notes].filter(Boolean).join(" ")).includes(q)) : rows;
  }, [rows, query]);

  return (
    <div className="flex max-h-[calc(82dvh-2rem)] flex-col md:max-h-[calc(100dvh-8rem)]">
      <div className="flex items-center gap-3">
        {dot ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={dot} /> : null}
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.02em] text-[#111111]">
          {title} <span className="ml-1 font-normal tabular-nums text-[#a1a1aa]">{rows.length}</span>
        </h2>
        <button
          type="button"
          aria-label="Chiudi la lista"
          onClick={onClose}
          className="-mr-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#71717a] transition-colors hover:bg-[#f4f4f5] hover:text-[#111111]"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      {rows.length > 8 ? (
        <label className="relative mt-2 block">
          <span className="sr-only">Cerca</span>
          <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a1a1aa]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca un nome"
            className="h-11 w-full border-b border-[#f0f0f1] bg-transparent pl-6 text-[14.5px] text-[#111111] outline-none transition-colors placeholder:text-[#b4b4b9] focus:border-[#111111]"
          />
        </label>
      ) : null}

      <ul className="-mx-3 mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        {shown.map((r, i) => (
          <motion.li
            key={r.id}
            initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.6, delay: 0.12 + Math.min(i, 16) * 0.035, ease: EASE }}
          >
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[#f7f7f8]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium tracking-[-0.01em] text-[#111111]">{r.name}</span>
                <span className="block truncate text-[12.5px] text-[#71717a]">
                  {excluded
                    ? r.excludedReason
                    : r.status === "bloccato" && r.blockedReason
                      ? r.blockedReason
                      : (r.organization ?? "")}
                </span>
              </span>
              {showStatus && !excluded ? (
                <span className="hidden items-center gap-1.5 whitespace-nowrap text-[12.5px] text-[#52525b] sm:inline-flex">
                  <StatusDot status={r.status} />
                  {STATUS_LABEL[r.status]}
                </span>
              ) : null}
              {showStatus && !excluded ? <StatusDot status={r.status} className="sm:hidden" /> : null}
              <OwnerAvatar owner={r.owner} size={24} />
            </button>
          </motion.li>
        ))}
        {shown.length === 0 ? <li className="px-3 py-10 text-center text-[13.5px] text-[#a1a1aa]">Nessun nome trovato.</li> : null}
      </ul>
    </div>
  );
}
