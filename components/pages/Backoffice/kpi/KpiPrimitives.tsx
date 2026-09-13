"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import type { KpiDelta } from "@/lib/actions/backoffice-kpi.actions";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────────
// Primitivi della sezione KPI. Il registro è quello del backoffice (bianco,
// bordi tenui, navy) ma con più aria e qualche dettaglio in più: numeri che
// salgono, sparkline, hover che solleva appena la card.
// Tutto il movimento rispetta `prefers-reduced-motion`.
// ───────────────────────────────────────────────────────────────────────────

/** Conta fino al valore: dà peso al numero senza distrarre (600ms, ease-out). */
export function useCountUp(value: number, decimals = 0) {
  const reduce = useReducedMotion();
  const [shown, setShown] = React.useState(value);
  const fromRef = React.useRef(value);

  React.useEffect(() => {
    if (reduce) {
      setShown(value);
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
    const duration = 620;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic: parte deciso e si posa, niente rimbalzi.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + delta * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduce]);

  React.useEffect(() => {
    if (reduce) fromRef.current = value;
  }, [value, reduce]);

  return decimals > 0 ? shown : Math.round(shown);
}

/** Variazione rispetto al periodo precedente. Neutra quando non è confrontabile. */
export function DeltaPill({
  delta,
  /** true quando scendere è una buona notizia (annullamenti, no show). */
  inverted,
  className,
}: {
  delta: KpiDelta;
  inverted?: boolean;
  className?: string;
}) {
  if (!delta) return null;
  const { current, previous } = delta;
  if (previous === 0 && current === 0) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-[12px] font-medium text-[#9a9a9a]", className)}>
        <Minus className="size-3" strokeWidth={2.5} />
        invariato
      </span>
    );
  }
  // Da zero a qualcosa la percentuale non significa niente: si dice "nuovo".
  const ratio = previous === 0 ? null : (current - previous) / Math.abs(previous);
  const up = current >= previous;
  const good = inverted ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums",
        good ? "bg-[#e9f7ef] text-[#137333]" : "bg-[#fdecec] text-[#b42318]",
        className,
      )}
      title={`Periodo precedente: ${previous.toLocaleString("it-IT", { maximumFractionDigits: 1 })}`}
    >
      <Icon className="size-3" strokeWidth={2.75} />
      {ratio === null
        ? "nuovo"
        : `${Math.abs(ratio * 100).toLocaleString("it-IT", { maximumFractionDigits: ratio < 0.1 ? 1 : 0 })}%`}
    </span>
  );
}

/** Sparkline: la forma del periodo, senza assi né numeri. */
export function Sparkline({
  values,
  className,
  stroke = "#1a1a2e",
}: {
  values: number[];
  className?: string;
  stroke?: string;
}) {
  const reduce = useReducedMotion();
  const gradientId = React.useId();
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const width = 100;
  const height = 28;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M ${points.join(" L ")}`;
  const area = `${line} L ${width},${height} L 0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-full", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.16} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      {/* Solo un dissolvenza: animare `pathLength` qui NON si può — con
          preserveAspectRatio="none" il tratteggio è calcolato in unità utente
          e la linea resta tagliata a metà larghezza. */}
      <motion.path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      />
    </svg>
  );
}

/** Card KPI: etichetta, numero grande, variazione, una riga di contesto. */
export function KpiCard({
  label,
  value,
  decimals = 0,
  suffix,
  prefix,
  delta,
  invertedDelta,
  hint,
  spark,
  sparkStroke,
  loading,
  index = 0,
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  delta?: KpiDelta;
  invertedDelta?: boolean;
  hint?: React.ReactNode;
  spark?: number[];
  sparkStroke?: string;
  loading?: boolean;
  index?: number;
}) {
  const reduce = useReducedMotion();
  const animated = useCountUp(loading ? 0 : value, decimals);
  const formatted = animated.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.045, 0.3), ease: "easeOut" }}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#ececec] bg-white p-5 transition-shadow duration-200 hover:shadow-[0_10px_30px_-18px_rgba(26,26,46,0.35)]"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#9a9a9a]">
          {label}
        </p>
        <div className="mt-2.5 flex items-end gap-2.5">
          {loading ? (
            <Skeleton className="h-9 w-24" />
          ) : (
            <span className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-[#1a1a2e] tabular-nums">
              {prefix}
              {formatted}
              {suffix && (
                // "%" attaccato al numero, "€" staccato: è la convenzione italiana.
                <span
                  className={cn(
                    "text-lg font-semibold text-[#9a9a9a]",
                    suffix === "%" ? "ml-0.5" : "ml-1.5",
                  )}
                >
                  {suffix}
                </span>
              )}
            </span>
          )}
          {!loading && delta && <DeltaPill delta={delta} inverted={invertedDelta} className="mb-1" />}
        </div>
      </div>

      {/* Riga di contesto: altezza riservata anche quando è vuota, così la
          griglia non balla tra una card e l'altra. */}
      <div className="mt-3 min-h-[34px]">
        {spark && spark.length > 1 ? (
          <Sparkline values={spark} stroke={sparkStroke} />
        ) : hint ? (
          <p className="text-[12.5px] font-medium leading-snug text-[#8a8a8a]">{hint}</p>
        ) : null}
      </div>
    </motion.div>
  );
}

/** Contenitore di una sezione: titolo, occhiello, azione a destra. */
export function KpiSection({
  title,
  subtitle,
  aside,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn("rounded-2xl border border-[#ececec] bg-white", className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#1a1a2e]">{title}</h2>
          {subtitle && (
            <p className="mt-1 max-w-[62ch] text-[12.5px] font-medium leading-normal text-[#9a9a9a]">
              {subtitle}
            </p>
          )}
        </div>
        {aside}
      </header>
      <div className={cn("px-6 pb-6 pt-4", bodyClassName)}>{children}</div>
    </motion.section>
  );
}

/** Pillola-legenda con pallino colorato: usata sopra i grafici. */
export function LegendDot({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#6a6a6a]">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
      {value && <span className="font-semibold tabular-nums text-[#1a1a2e]">{value}</span>}
    </span>
  );
}
