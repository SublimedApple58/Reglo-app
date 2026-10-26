"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Plus, Search, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";

import { RegloMark } from "@/components/ui/reglo-mark";
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
type Slice = { key: string; label: string; count: number; color: string; hint?: string };
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
/**
 * Palette del deck Reglo: nero e grigi caldi per gli stati «freddi», tre
 * accenti per quelli che contano (oro, salvia, rosso Reglo). Il rosso è solo
 * dell'«Impegno»: nella vista per tipologia non compare. Niente blu.
 */
const RING_STATUS_COLOR: Record<RoundStatus, string> = {
  impegno: "#D7222B",
  interessato: "#6FA05A",
  call: "#B5DBA0",
  risposto: "#C9B27C",
  contattato: "#1a1a1a",
  in_pausa: "#a39a86",
  bloccato: "#5d574a",
  no: "#cfc6b0",
  da_contattare: "#ECE7DC",
};
const RING_CATEGORY_COLOR: Record<RoundCategory, string> = {
  business_angel: "#1a1a1a",
  club_angel: "#5d574a",
  vc_italia: "#6FA05A",
  family_office: "#C9B27C",
  vc_europa: "#B5DBA0",
  altro: "#cfc6b0",
};
/** I toni chiari prendono un filo di contorno per non sparire sul fondo. */
const LIGHT = new Set(["#ECE7DC", "#cfc6b0", "#B5DBA0"]);
const swatch = (s: { color: string }) => ({
  backgroundColor: s.color,
  boxShadow: LIGHT.has(s.color) ? "inset 0 0 0 1px rgba(61,53,40,0.16)" : undefined,
});
/** Numeri grandi come nel deck: Figtree sottile, tracking stretto, cifre tabellari. */
const BIG_NUMBER = "font-normal leading-none tabular-nums tracking-[-0.05em] text-[#111111]";
/** Etichetta di sezione come nel deck: piccola, maiuscola, spaziata. */
const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.16em] text-[#8d8778]";

/** Curva di tutta la pagina: ease-out lungo, niente rimbalzi. */
const EASE = [0.16, 1, 0.3, 1] as const;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 16, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.9, delay, ease: EASE },
});

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
        color: RING_STATUS_COLOR[s],
      }));
    }
    return ROUND_CATEGORIES.filter((c) => summary.byCategory[c].total).map((c) => {
      const b = summary.byCategory[c];
      const started = b.total - b.byStatus.da_contattare;
      return {
        key: c,
        label: CATEGORY_SHORT[c],
        count: b.total,
        color: RING_CATEGORY_COLOR[c],
        hint: `${started} già ${started === 1 ? "avviato" : "avviati"}`,
      };
    });
  }, [mode, summary]);


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

  // Le tappe raggiunte dall'inizio (cumulative): chi ha avuto una call ha anche risposto ed è stato contattato.
  // La legenda invece conta lo stato di oggi, uno per persona. Le due etichette di sezione lo dicono.
  const one = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural);
  const stats = [
    { value: summary.funnel.contacted, label: one(summary.funnel.contacted, "contattato", "contattati") },
    { value: summary.funnel.responded, label: one(summary.funnel.responded, "ha risposto", "hanno risposto") },
    { value: summary.funnel.call, label: one(summary.funnel.call, "call fatta", "call fatte") },
    { value: summary.funnel.interested, label: one(summary.funnel.interested, "interessato", "interessati") },
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
    // Animazioni sempre accese, anche con «Riduci movimento» del sistema: scelta voluta per questa pagina.
    <MotionConfig reducedMotion="never">
    <div>
      <header className="flex items-start justify-between gap-4">
        <motion.div {...rise(0)}>
          <p className="flex items-center gap-2 text-[13px] text-[#6a6a6a]">
            <RegloMark size={18} />
            Round
          </p>
          <h1 className="mt-3 text-[34px] font-medium leading-[1.05] tracking-[-0.035em] text-[#111111] md:text-[44px]">{round.name}.</h1>
        </motion.div>
        <motion.button
          {...rise(0.1)}
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-[#111111] pl-3.5 pr-4 text-[13.5px] font-medium text-white transition-colors hover:bg-[#2b2b2b]"
        >
          <Plus className="h-4 w-4" />
          Aggiungi
        </motion.button>
      </header>

      <div className="mt-8 grid items-start gap-12 md:mt-6 md:grid-cols-[minmax(0,1fr)_360px] md:gap-14 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* La ciambella */}
        <div className="flex flex-col items-center">
          <motion.div {...rise(0.15)} className="relative inline-flex rounded-full bg-[#f1efeb] p-1">
            {(["stato", "tipologia"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={cn(
                  "relative h-9 cursor-pointer rounded-full px-5 text-[13.5px] transition-colors duration-300",
                  mode === m ? "font-medium text-white" : "text-[#6a6a6a] hover:text-[#111111]",
                )}
              >
                {mode === m ? (
                  <motion.span
                    layoutId="round-mode-pill"
                    className="absolute inset-0 rounded-full bg-[#111111]"
                    transition={{ duration: 0.55, ease: EASE }}
                  />
                ) : null}
                <span className="relative">{m === "stato" ? "Per stato" : "Per tipologia"}</span>
              </button>
            ))}
          </motion.div>

          <RoundDonut
            slices={slices}
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

          <motion.p {...rise(0.5)} className={cn(EYEBROW, "mt-6 w-full max-w-[480px]")}>
            Dall&apos;inizio
          </motion.p>
          <dl className="mt-3 grid w-full max-w-[480px] grid-cols-4 gap-4 md:gap-6">
            {stats.map((s, i) => (
              <motion.div key={s.label} className="border-t border-[#e6e0d4] pt-3" {...rise(0.55 + i * 0.08)}>
                <dt className="sr-only">{s.label}</dt>
                <dd className={cn(BIG_NUMBER, "text-[30px] md:text-[38px]")}>
                  <CountUp value={s.value} delay={0.6 + i * 0.08} duration={1.6} />
                </dd>
                <dd className="mt-2 text-[12.5px] leading-snug text-[#6a6a6a]">{s.label}</dd>
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
              initial={{ opacity: 0, scale: 0.96, y: 12, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.97, y: 8, filter: "blur(6px)", transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } }}
              transition={{ duration: 0.7, ease: EASE }}
              style={{ transformOrigin: "left center" }}
            >
              {list}
            </motion.div>
          ) : (
            <motion.div
              key={`legend:${mode}`}
              initial={{ opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.25 } }}
              transition={{ duration: 0.6, ease: EASE }}
            >
            <Legend
              title={mode === "stato" ? "Oggi, per stato" : "Oggi, per tipologia"}
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
          className="max-h-[82dvh] gap-0 rounded-t-[28px] border-t-0 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 data-[state=open]:animate-[round-sheet-up-in_0.6s_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[round-sheet-up-out_0.32s_cubic-bezier(0.4,0,1,1)] [&>button:last-child]:hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetTitle className="sr-only">{panelTitle}</SheetTitle>
          <SheetDescription className="sr-only">Contatti di questa fetta</SheetDescription>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#e6e0d4]" />
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
    </MotionConfig>
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
  const enter = { opacity: 0, y: 8, scale: 0.94, filter: "blur(6px)" };
  const leave = { opacity: 0, y: -6, scale: 0.96, filter: "blur(4px)", transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as const } };
  return (
    <AnimatePresence mode="wait" initial>
      {!slice ? (
        <motion.div
          key="target"
          initial={enter}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={leave}
          transition={{ duration: 0.8, ease: EASE, delay: 0.05 }}
          className="flex flex-col items-center text-center"
        >
          <span className={cn(BIG_NUMBER, "text-[44px] md:text-[60px]")}>{target}</span>
          <span className="mt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[#8d8778]">{committed ? `${committed} impegnati` : "Obiettivo"}</span>
          <span className="mt-1 text-[13px] tabular-nums text-[#6a6a6a]">
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
          <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#6a6a6a]">
            <span className="h-2 w-2 rounded-full" style={swatch(slice)} />
            {slice.label}
          </span>
          <span className={cn(BIG_NUMBER, "mt-2.5 text-[48px] md:text-[64px]")}>
            <CountUp value={slice.count} duration={0.7} />
          </span>
          <span className="mt-2.5 text-[12.5px] tabular-nums text-[#6a6a6a] md:text-[13px]">
            {pct(slice.count, total)} del round{slice.hint ? ` · ${slice.hint}` : ""}
          </span>
          <button
            type="button"
            onClick={() => onOpen(slice.key)}
            className="pointer-events-auto mt-1 inline-flex h-9 cursor-pointer items-center gap-1 rounded-full px-3 text-[12.5px] font-medium text-[#111111] transition-colors hover:bg-[#f1efeb] md:hidden"
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
  title,
  slices,
  total,
  active,
  onActive,
  onOpen,
  excluded,
  onAll,
  onExcluded,
}: {
  title: string;
  slices: Slice[];
  total: number;
  active: string | null;
  onActive: (key: string | null) => void;
  onOpen: (key: string) => void;
  excluded: number;
  onAll: () => void;
  onExcluded: () => void;
}) {
  return (
    <div className="md:pt-11" onPointerLeave={(e) => e.pointerType === "mouse" && onActive(null)}>
      <motion.p {...rise(0.3)} className={cn(EYEBROW, "mb-1")}>
        {title}
      </motion.p>
      <ul className="grid grid-cols-2 gap-x-6 md:grid-cols-1">
        {slices.map((s, i) => (
          <motion.li key={s.key} className="border-b border-[#efebe3]" {...rise(0.35 + i * 0.05)}>
            <button
              type="button"
              onPointerEnter={(e) => e.pointerType === "mouse" && onActive(s.key)}
              onFocus={() => onActive(s.key)}
              onBlur={() => onActive(null)}
              onClick={() => onOpen(s.key)}
              className={cn(
                "group flex h-12 w-full cursor-pointer items-center gap-3 text-left text-[14px] transition-opacity duration-300",
                active && active !== s.key ? "opacity-35" : "opacity-100",
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={swatch(s)} />
              <span className="min-w-0 flex-1 truncate text-[#111111]">{s.label}</span>
              <span className="tabular-nums tracking-[-0.01em] text-[#111111]">{s.count}</span>
              <span className="hidden w-11 text-right tabular-nums text-[#8d8778] md:inline">{pct(s.count, total)}</span>
            </button>
          </motion.li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between pt-1 text-[13px]">
        <button type="button" onClick={onAll} className="-ml-1 inline-flex h-11 cursor-pointer items-center gap-1.5 px-1 text-[#111111] hover:underline hover:underline-offset-4">
          Vedi tutti <span className="tabular-nums text-[#8d8778]">{total}</span>
        </button>
        {excluded ? (
          <button type="button" onClick={onExcluded} className="-mr-1 h-11 cursor-pointer px-1 text-[#8d8778] hover:text-[#111111]">
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
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = norm(query.trim());
    return q ? rows.filter((r) => norm([r.name, r.organization, r.notes].filter(Boolean).join(" ")).includes(q)) : rows;
  }, [rows, query]);

  return (
    <div className="flex max-h-[calc(82dvh-2rem)] flex-col md:max-h-[calc(100dvh-8rem)]">
      <div className="flex items-center gap-3">
        {dot ? <span className="h-2 w-2 shrink-0 rounded-full" style={dot} /> : null}
        <h2 className="min-w-0 flex-1 truncate text-[20px] font-medium tracking-[-0.03em] text-[#111111]">
          {title} <span className="ml-1 font-normal tabular-nums text-[#8d8778]">{rows.length}</span>
        </h2>
        <button
          type="button"
          aria-label="Chiudi la lista"
          onClick={onClose}
          className="-mr-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#6a6a6a] transition-colors hover:bg-[#f1efeb] hover:text-[#111111]"
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
            className="h-11 w-full border-b border-[#e6e0d4] bg-transparent pl-6 text-[14.5px] text-[#111111] outline-none transition-colors placeholder:text-[#b4b4b9] focus:border-[#111111]"
          />
        </label>
      ) : null}

      <ul className="-mx-3 mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        {shown.map((r, i) => (
          <motion.li
            key={r.id}
            initial={{ opacity: 0, y: 14, scale: 0.98, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.6, delay: 0.12 + Math.min(i, 16) * 0.035, ease: EASE }}
          >
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[#f5f4f1]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium tracking-[-0.01em] text-[#111111]">{r.name}</span>
                <span className="block truncate text-[12.5px] text-[#6a6a6a]">
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
