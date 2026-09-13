"use client";

import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import type { InvestorKpis } from "@/lib/investor/investor-kpi";

// ───────────────────────────────────────────────────────────────────────────
// Grafici della pagina investor, disegnati per il DITO prima che per il mouse:
// nessun tooltip in hover (sul telefono non esiste), pochissimi tick, i numeri
// che contano stampati fuori dal grafico invece che nascosti dentro.
// ───────────────────────────────────────────────────────────────────────────

const INK = "#12121c";

const AXIS = {
  tickLine: false as const,
  axisLine: false as const,
  tick: { fontSize: 11, fill: "#9a9aa8" },
};

/** Andamento delle guide svolte: solo forma, l'ampiezza la dà il numero sopra. */
export function InvestorLessonsChart({ series }: { series: InvestorKpis["series"] }) {
  // Su schermo stretto un tick ogni quattro punti basta e avanza.
  const interval = Math.max(0, Math.ceil(series.length / 6) - 1);
  return (
    <ResponsiveContainer width="100%" height={180}>
      {/* Margini laterali: senza, la prima e l'ultima etichetta dell'asse
          finiscono tagliate a metà sul bordo dello schermo. */}
      <AreaChart data={series} margin={{ top: 6, right: 14, bottom: 0, left: 14 }}>
        <defs>
          <linearGradient id="investor-lessons" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={INK} stopOpacity={0.18} />
            <stop offset="100%" stopColor={INK} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" {...AXIS} interval={interval} minTickGap={8} padding={{ left: 6, right: 6 }} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={INK}
          strokeWidth={2}
          fill="url(#investor-lessons)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Crescita: barre delle nuove autoscuole + linea dell'MRR cumulato. */
export function InvestorGrowthChart({ growth }: { growth: InvestorKpis["growth"] }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={growth} margin={{ top: 8, right: 14, bottom: 0, left: 14 }}>
        <XAxis dataKey="label" {...AXIS} interval={1} minTickGap={6} />
        <YAxis yAxisId="left" hide />
        <YAxis yAxisId="right" orientation="right" hide />
        <Bar
          yAxisId="left"
          dataKey="newCompanies"
          fill="#e6e6ec"
          radius={[6, 6, 0, 0]}
          maxBarSize={26}
          isAnimationActive={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="mrrCents"
          stroke={INK}
          strokeWidth={2.25}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
