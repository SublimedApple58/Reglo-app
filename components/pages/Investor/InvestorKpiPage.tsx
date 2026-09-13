"use client";

import React from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

import { fetchInvestorKpis } from "@/lib/actions/investor-public.actions";
import { RegloMark } from "@/components/ui/reglo-mark";
import type { InvestorKpis, InvestorPeriodKey } from "@/lib/investor/investor-kpi";
import { INVESTOR_PERIODS } from "@/lib/investor/investor-kpi";
import { cn } from "@/lib/utils";

import { InvestorGrowthChart, InvestorLessonsChart } from "./InvestorCharts";

// ───────────────────────────────────────────────────────────────────────────
// "Reglo in numeri" — pagina a link, pensata prima per il telefono.
// Regole che tengono insieme tutta la pagina:
// - una colonna su mobile, mai tabelle: si scorre, si legge, si chiude;
// - i numeri sono i protagonisti (clamp fino a 64px) e salgono quando entrano
//   in campo, non al caricamento di roba che sta sotto la piega;
// - niente hover da nessuna parte: sul telefono non esiste;
// - tutto il movimento si spegne con prefers-reduced-motion.
// ───────────────────────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat("it-IT");
const formatInt = (value: number) => nf.format(Math.round(value));
const formatEuro = (cents: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
const formatDecimal = (value: number) =>
  new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
const formatPercent = (value: number) =>
  `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(value * 100)}%`;

/** Conta fino al valore quando la sezione entra in campo. */
function useCountUpInView(value: number, active: boolean, decimals = 0) {
  const reduce = useReducedMotion();
  const [shown, setShown] = React.useState(reduce ? value : 0);
  // Da dove parte l'animazione: 0 la prima volta, il valore già a schermo
  // quando cambia il periodo (così i numeri scorrono, non sbattono a zero).
  const fromRef = React.useRef(reduce ? value : 0);

  React.useEffect(() => {
    if (reduce || !active) {
      if (reduce) setShown(value);
      return;
    }
    const from = fromRef.current;
    const delta = value - from;
    if (Math.abs(delta) < 0.0001) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + delta * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, active, reduce]);

  React.useEffect(() => {
    if (reduce) fromRef.current = value;
  }, [value, reduce]);

  return decimals > 0 ? shown : Math.round(shown);
}

/** Sezione: entra dal basso una volta sola e dà il via ai contatori dentro. */
function Section({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow?: string;
  title?: string;
  children: (inView: boolean) => React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-12% 0px" });
  const reduce = useReducedMotion();
  return (
    <motion.section
      ref={ref}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={cn("border-t border-[#ededf1] pt-9 sm:pt-12", className)}
    >
      {eyebrow && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a9aa8]">
          {eyebrow}
        </p>
      )}
      {title && (
        <h2 className="mt-2 text-[19px] font-semibold tracking-[-0.01em] text-[#12121c] sm:text-[22px]">
          {title}
        </h2>
      )}
      {children(inView)}
    </motion.section>
  );
}

/** Il numero grande di una sezione. */
function BigNumber({
  value,
  active,
  decimals = 0,
  prefix,
  suffix,
  caption,
  currency,
}: {
  value: number;
  active: boolean;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  caption?: React.ReactNode;
  currency?: boolean;
}) {
  const animated = useCountUpInView(value, active, decimals);
  const text = currency
    ? formatEuro(animated * 100)
    : animated.toLocaleString("it-IT", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
  return (
    <div>
      <div
        className="font-semibold leading-[0.95] tracking-[-0.035em] text-[#12121c] tabular-nums"
        style={{ fontSize: "clamp(42px, 13vw, 68px)" }}
      >
        {prefix}
        {text}
        {suffix && (
          <span className="ml-1 align-baseline text-[0.42em] font-semibold text-[#9a9aa8]">
            {suffix}
          </span>
        )}
      </div>
      {caption && (
        <p className="mt-2.5 text-[15px] font-medium leading-snug text-[#6a6a78]">{caption}</p>
      )}
    </div>
  );
}

/** Coppia etichetta/valore, due o tre per riga. */
function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-[#f7f7f9] px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9a9aa8]">
        {label}
      </p>
      <p className="mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.02em] text-[#12121c] tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[12.5px] font-medium text-[#8a8a98]">{hint}</p>}
    </div>
  );
}

/** Variazione sul periodo precedente, in chiaro. */
function Trend({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous <= 0 && current <= 0) return null;
  const up = current >= previous;
  const ratio = previous === 0 ? null : (current - previous) / Math.abs(previous);
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold",
        up ? "bg-[#e8f6ee] text-[#15703c]" : "bg-[#fdeceb] text-[#a93226]",
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.75} />
      {ratio === null ? "nuovo" : `${formatPercent(Math.abs(ratio))}`}
      <span className="font-medium opacity-70">{label}</span>
    </span>
  );
}

export function InvestorKpiPage({
  kpis: initialKpis,
  label,
  basePath,
  token,
}: {
  kpis: InvestorKpis;
  label: string;
  basePath: string;
  token: string;
}) {
  const reduce = useReducedMotion();
  // Il periodo si cambia SENZA ricaricare: si rifà solo il calcolo e i numeri
  // scorrono al nuovo valore. La pagina è servita dal server al primo giro
  // (funziona anche senza JS), da lì in poi aggiorna in posto.
  const [kpis, setKpis] = React.useState(initialKpis);
  const [pending, setPending] = React.useState<InvestorPeriodKey | null>(null);
  React.useEffect(() => setKpis(initialKpis), [initialKpis]);

  const changePeriod = React.useCallback(
    (next: InvestorPeriodKey) => {
      if (next === kpis.period.key || pending) return;
      setPending(next);
      // L'URL resta condivisibile senza far navigare Next: history diretta.
      window.history.replaceState(null, "", `${basePath}?p=${next}`);
      fetchInvestorKpis(token, next)
        .then((res) => {
          if (res.success && res.data) setKpis(res.data);
        })
        .finally(() => setPending(null));
    },
    [basePath, kpis.period.key, pending, token],
  );
  const updated = new Date(kpis.updatedAt).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const peak = kpis.series.reduce(
    (best, point) => (point.value > best.value ? point : best),
    { label: "", value: 0 },
  );

  return (
    <main className="min-h-svh bg-white">
      {/* Larghezza da lettura: su desktop non si allarga a dismisura, resta un
          documento. Padding inferiore generoso per la home bar di iOS. */}
      <div className="mx-auto w-full max-w-[720px] px-5 pb-[max(72px,env(safe-area-inset-bottom))] pt-8 sm:px-8 sm:pt-14">
        {/* ── Testata ── */}
        <motion.header
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-2.5">
            <RegloMark size={30} />
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#12121c]">
              Reglo
            </span>
          </div>
          <h1
            className="mt-7 font-semibold leading-[1.02] tracking-[-0.035em] text-[#12121c]"
            style={{ fontSize: "clamp(34px, 10vw, 54px)" }}
          >
            Reglo in numeri
          </h1>
          <p className="mt-4 max-w-[46ch] text-[16.5px] font-medium leading-relaxed text-[#6a6a78]">
            Il gestionale delle autoscuole italiane: agenda, allievi, guide e pagamenti
            in un posto solo. Questi sono i numeri della piattaforma, aggiornati al {updated}.
          </p>
        </motion.header>

        {/* ── ADESSO: stato di oggi, NON tocca il filtro. Sta sopra lo
             switcher apposta: la posizione dice più di qualsiasi didascalia. ── */}
        <Section eyebrow={`Stato di oggi · ${updated}`} className="mt-9 border-t-0 pt-0 sm:mt-12 sm:pt-0">
          {(inView) => (
            <>
              <div className="mt-5 grid gap-7 sm:grid-cols-2 sm:gap-6">
                <BigNumber
                  value={kpis.revenue.mrrCents / 100}
                  active={inView}
                  currency
                  caption="di ricavo ricorrente al mese (MRR)"
                />
                <BigNumber
                  value={kpis.customers.active}
                  active={inView}
                  caption={`autoscuole attive su ${kpis.customers.total} registrate`}
                />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <MiniStat label="ARR" value={formatEuro(kpis.revenue.arrCents)} hint="proiezione annua" />
                <MiniStat
                  label="ARPA"
                  value={formatEuro(kpis.revenue.arpaCents)}
                  hint="al mese per autoscuola pagante"
                />
                <MiniStat
                  label="Allievi"
                  value={formatInt(kpis.usage.studentsAllTime)}
                  hint="registrati dall'inizio"
                />
                <MiniStat
                  label="Guide"
                  value={formatInt(kpis.usage.lessonsAllTime)}
                  hint="gestite dall'inizio"
                />
              </div>
            </>
          )}
        </Section>

        {/* ── Periodo: link veri, così la pagina resta servita dal server ── */}
        <div className="mt-12 border-t border-[#ededf1] pt-9 sm:mt-16 sm:pt-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a9aa8]">
            Nel periodo scelto
          </p>
          <h2 className="mt-2 text-[19px] font-semibold tracking-[-0.01em] text-[#12121c] sm:text-[22px]">
            Negli ultimi {kpis.period.label}
          </h2>
          <p className="mt-2 max-w-[46ch] text-[14.5px] font-medium leading-relaxed text-[#8a8a98]">
            Da qui in giù i numeri seguono il periodo scelto. Quelli qui sopra sono
            lo stato di oggi e non cambiano.
          </p>
        </div>
        <nav
          aria-label="Periodo"
          className="mt-5 flex gap-1.5 rounded-[14px] bg-[#f4f4f6] p-1.5"
        >
          {INVESTOR_PERIODS.map((period) => {
            const active = period.key === kpis.period.key;
            const loading = pending === period.key;
            return (
              <button
                key={period.key}
                type="button"
                onClick={() => changePeriod(period.key)}
                aria-current={active ? "page" : undefined}
                aria-busy={loading}
                className={cn(
                  "flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] text-[14.5px] font-semibold transition-all duration-200",
                  active
                    ? "bg-white text-[#12121c] shadow-[0_1px_3px_rgba(18,18,28,0.12)]"
                    : "text-[#7a7a88] hover:text-[#12121c]",
                )}
              >
                {period.label}
                {loading && (
                  <span className="size-1.5 animate-pulse rounded-full bg-[#12121c]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Mentre ricalcola i numeri restano a schermo, solo un po' indietro:
            niente scheletri, niente salti di altezza, niente ricarica. */}
        <div
          className={cn(
            "mt-10 space-y-10 transition-opacity duration-300 sm:mt-14 sm:space-y-14",
            pending && "opacity-45",
          )}
        >
          {/* ── Ricavi ── */}
          {/* ── Volume ── */}
          <Section eyebrow="Attività" title="Guide gestite">
            {(inView) => (
              <>
                <div className="mt-5">
                  <BigNumber
                    value={kpis.usage.lessonsDone}
                    active={inView}
                    caption={`guide svolte negli ultimi ${kpis.period.label}`}
                  />
                  <div className="mt-4">
                    <Trend
                      current={kpis.usage.lessonsDone}
                      previous={kpis.usage.lessonsPrevious}
                      label={`sui ${kpis.period.label} precedenti`}
                    />
                  </div>
                </div>
                <div className="mt-7 rounded-2xl bg-[#fafafb] p-4 pt-5">
                  <div className="flex items-baseline justify-between gap-3 px-1">
                    <span className="text-[13px] font-semibold text-[#12121c]">Andamento</span>
                    {peak.value > 0 && (
                      <span className="text-[12.5px] font-medium text-[#8a8a98]">
                        picco {formatInt(peak.value)} guide · {peak.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <InvestorLessonsChart series={kpis.series} />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MiniStat
                    label="Media al giorno"
                    value={formatDecimal(kpis.usage.lessonsPerDay)}
                    hint="guide su tutta la piattaforma"
                  />
                  <MiniStat
                    label="Nuove autoscuole"
                    value={formatInt(kpis.customers.newInPeriod)}
                    hint={`entrate negli ultimi ${kpis.period.label}`}
                  />
                </div>
              </>
            )}
          </Section>

          {/* ── Prodotto ── */}
          <Section eyebrow="Prodotto" title="L'allievo prenota da solo">
            {(inView) => (
              <>
                <p className="mt-3 max-w-[46ch] text-[15.5px] font-medium leading-relaxed text-[#6a6a78]">
                  La quota di guide prenotate dall&apos;allievo in autonomia dall&apos;app,
                  invece che dalla segreteria al telefono. È la parte di lavoro che
                  Reglo toglie dalle spalle dell&apos;autoscuola.
                </p>
                <div className="mt-6">
                  <BigNumber
                    value={kpis.usage.appShare * 100}
                    active={inView}
                    decimals={1}
                    suffix="%"
                    caption="delle prenotazioni arriva dall'app allievo"
                  />
                  <div className="mt-4">
                    <Trend
                      current={kpis.usage.appShare}
                      previous={kpis.usage.appSharePrevious}
                      label={`sui ${kpis.period.label} precedenti`}
                    />
                  </div>
                  {/* Barra di riempimento: la percentuale si capisce anche di sguardo. */}
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#f0f0f3]">
                    {/* A zero la barra resta vuota: un minimo di larghezza qui
                        diventerebbe un pallino, che sembra un errore. */}
                    {kpis.usage.appShare > 0 && (
                      <motion.div
                        className="h-full rounded-full bg-[#12121c]"
                        initial={reduce ? false : { width: 0 }}
                        animate={inView ? { width: `${Math.max(kpis.usage.appShare * 100, 3)}%` } : undefined}
                        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                      />
                    )}
                  </div>
                </div>
                <div className="mt-7 grid grid-cols-2 gap-3">
                  <MiniStat
                    label="Allievi attivi"
                    value={formatInt(kpis.usage.activeStudents)}
                    hint={`${formatInt(kpis.usage.studentsAllTime)} registrati dall'inizio`}
                  />
                  <MiniStat
                    label="Istruttori"
                    value={formatInt(kpis.usage.activeInstructors)}
                    hint="al lavoro nel periodo"
                  />
                </div>
              </>
            )}
          </Section>

          {/* ── Adozione ── */}
          {kpis.features.length > 0 && (
            <Section eyebrow="Adozione" title="Cosa usano le autoscuole">
              {(inView) => (
                <ul className="mt-5 space-y-3">
                  {kpis.features.map((feature, index) => {
                    const share = feature.companies / Math.max(1, kpis.customers.active);
                    return (
                      <li key={feature.label}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[15px] font-semibold text-[#12121c]">
                            {feature.label}
                          </span>
                          <span className="shrink-0 text-[14px] font-semibold tabular-nums text-[#12121c]">
                            {feature.companies}
                            <span className="ml-1 text-[12.5px] font-medium text-[#8a8a98]">
                              su {kpis.customers.active}
                            </span>
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f0f0f3]">
                          <motion.div
                            className="h-full rounded-full bg-[#c9c9d4]"
                            initial={reduce ? false : { width: 0 }}
                            animate={inView ? { width: `${Math.min(100, share * 100)}%` } : undefined}
                            transition={{
                              duration: 0.7,
                              ease: [0.22, 1, 0.36, 1],
                              delay: 0.1 + index * 0.06,
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          )}

          {/* ── Crescita: terzo orologio, dichiarato ── */}
          <Section eyebrow="Crescita" title="Ultimi 12 mesi">
            {() => (
              <>
                <p className="mt-3 max-w-[46ch] text-[15px] font-medium leading-relaxed text-[#6a6a78]">
                  Indipendente dal periodo scelto sopra: autoscuole entrate mese per
                  mese e ricavo ricorrente cumulato.
                </p>
                <div className="mt-6 rounded-2xl bg-[#fafafb] p-4 pt-5">
                  <div className="flex items-baseline justify-between gap-3 px-1">
                    <span className="text-[13px] font-semibold text-[#12121c]">
                      Nuove autoscuole e MRR
                    </span>
                    <span className="text-[12.5px] font-medium text-[#8a8a98]">
                      barre: autoscuole · linea: MRR
                    </span>
                  </div>
                  <div className="mt-2">
                    <InvestorGrowthChart growth={kpis.growth} />
                  </div>
                </div>
              </>
            )}
          </Section>
        </div>

        {/* ── Piede: il nome del destinatario è stampato apposta ── */}
        <footer className="mt-14 border-t border-[#ededf1] pt-7">
          <p className="text-[13px] font-medium leading-relaxed text-[#8a8a98]">
            Documento riservato, preparato per <span className="font-semibold text-[#12121c]">{label}</span>.
            Dati aggregati della piattaforma Reglo al {updated}, aggiornati in tempo reale
            a ogni apertura. Da non diffondere.
          </p>
        </footer>
      </div>
    </main>
  );
}
