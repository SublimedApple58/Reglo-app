"use client";

import React from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BackofficeKpis } from "@/lib/backoffice/kpi-compute";
import { formatEuro, formatInt } from "./kpi-format";
import { LegendDot } from "./KpiPrimitives";

// ───────────────────────────────────────────────────────────────────────────
// I grafici. Regole comuni, per non ritrovarsi con sei stili diversi:
// - palette dalle variabili --chart-* (navy, grigio, verde + due grigi chiari)
// - niente griglia verticale, orizzontale tratteggiata tenue
// - assi senza linea, tick piccoli in grigio, niente decimali sulle Y
// - tooltip nostro (quello di default stona con tutto il resto)
// - `isAnimationActive` lasciato ai default di recharts (~400ms in ingresso)
// ───────────────────────────────────────────────────────────────────────────

const NAVY = "#111111";
const GREY = "#b6b6c2";
const GREEN = "#22C55E";
const RED = "#e0796f";

const AXIS = {
  tickLine: false as const,
  axisLine: false as const,
  tick: { fontSize: 11, fill: "#9a9a9a" },
};

const GRID = (
  <CartesianGrid stroke="#f0f0f3" strokeDasharray="3 3" vertical={false} />
);

/** Tooltip unico per tutti i grafici: card bianca, righe etichetta → valore. */
function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  total,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string;
  formatter?: (value: number, key: string) => string;
  /** Mostra la somma delle serie in fondo (utile sulle barre impilate). */
  total?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((row) => (row.value ?? 0) !== 0);
  if (!rows.length) return null;
  const sum = rows.reduce((n, row) => n + (row.value ?? 0), 0);
  return (
    <div className="pointer-events-none min-w-[168px] rounded-xl border border-[#ececec] bg-white/97 p-3 shadow-[0_12px_32px_-16px_rgba(17, 17, 17,0.4)] backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9a9a9a]">
        {label}
      </p>
      <div className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div key={row.dataKey ?? row.name} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#6a6a6a]">
              <span className="size-2 rounded-full" style={{ backgroundColor: row.color }} />
              {row.name}
            </span>
            <span className="text-[12.5px] font-semibold tabular-nums text-[#111111]">
              {formatter
                ? formatter(row.value ?? 0, String(row.dataKey ?? ""))
                : formatInt(row.value ?? 0)}
            </span>
          </div>
        ))}
        {total && rows.length > 1 && (
          <div className="flex items-center justify-between gap-4 border-t border-[#f0f0f3] pt-1.5">
            <span className="text-[12px] font-medium text-[#9a9a9a]">Totale</span>
            <span className="text-[12.5px] font-semibold tabular-nums text-[#111111]">
              {formatInt(sum)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Andamento guide: svolte (area piena) vs annullate (linea sottile). */
export function LessonsTrendChart({ series }: { series: BackofficeKpis["activity"]["series"] }) {
  return (
    <ResponsiveContainer width="100%" height={264}>
      <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="kpi-done" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={NAVY} stopOpacity={0.22} />
            <stop offset="100%" stopColor={NAVY} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {GRID}
        <XAxis dataKey="label" {...AXIS} minTickGap={22} />
        <YAxis {...AXIS} allowDecimals={false} width={44} />
        <Tooltip
          cursor={{ stroke: "#e4e4e9", strokeWidth: 1 }}
          content={<ChartTooltip />}
        />
        <Area
          type="monotone"
          dataKey="done"
          name="Guide svolte"
          stroke={NAVY}
          strokeWidth={2}
          fill="url(#kpi-done)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
        />
        <Line
          type="monotone"
          dataKey="cancelled"
          name="Annullate"
          stroke={RED}
          strokeWidth={1.75}
          strokeDasharray="4 3"
          dot={false}
          activeDot={{ r: 3.5, strokeWidth: 2, stroke: "#fff" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const SOURCE_SERIES: Array<{ key: string; name: string; color: string }> = [
  { key: "app", name: "App allievo", color: NAVY },
  { key: "staff", name: "Staff (agenda)", color: "#8a8aa0" },
  { key: "gruppo", name: "Guide di gruppo", color: "#c9c9d6" },
  { key: "esame", name: "Esami", color: "#e2e2ea" },
  { key: "scambio", name: "Scambi", color: GREEN },
  { key: "voce", name: "Segretaria AI", color: "#f4c542" },
  { key: "altro", name: "Storico", color: "#dcdce4" },
];

/** Da dove arrivano le prenotazioni, nel tempo (barre impilate). */
export function BookingSourceChart({
  sources,
}: {
  sources: BackofficeKpis["activity"]["sources"];
}) {
  // Le serie sempre a zero non entrano né nel grafico né nella legenda.
  const active = SOURCE_SERIES.filter((s) =>
    sources.some((point) => (point as unknown as Record<string, number>)[s.key] > 0),
  );
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {active.map((s) => (
          <LegendDot key={s.key} color={s.color} label={s.name} />
        ))}
      </div>
      <ResponsiveContainer width="100%" height={236}>
        <ComposedChart data={sources} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          {GRID}
          <XAxis dataKey="label" {...AXIS} minTickGap={22} />
          <YAxis {...AXIS} allowDecimals={false} width={44} />
          <Tooltip cursor={{ fill: "#f7f7fa" }} content={<ChartTooltip total />} />
          {active.map((s, index) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId="sources"
              fill={s.color}
              maxBarSize={38}
              // Angoli tondi solo in cima alla pila.
              radius={index === active.length - 1 ? [5, 5, 0, 0] : undefined}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Crescita: nuove autoscuole (barre) + MRR cumulato stimato (linea). */
export function GrowthChart({ growth }: { growth: BackofficeKpis["revenue"]["growth"] }) {
  return (
    <ResponsiveContainer width="100%" height={236}>
      <ComposedChart data={growth} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
        {GRID}
        <XAxis dataKey="label" {...AXIS} minTickGap={10} />
        <YAxis yAxisId="left" {...AXIS} allowDecimals={false} width={34} />
        <YAxis
          yAxisId="right"
          orientation="right"
          {...AXIS}
          width={62}
          tickFormatter={(value: number) => formatEuro(value)}
        />
        <Tooltip
          cursor={{ fill: "#f7f7fa" }}
          content={
            <ChartTooltip
              formatter={(value, key) =>
                key === "mrrCents" ? formatEuro(value) : formatInt(value)
              }
            />
          }
        />
        <Bar
          yAxisId="left"
          dataKey="newCompanies"
          name="Nuove autoscuole"
          fill="#dcdce4"
          radius={[5, 5, 0, 0]}
          maxBarSize={30}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="mrrCents"
          name="MRR cumulato"
          stroke={NAVY}
          strokeWidth={2}
          dot={{ r: 2.5, fill: NAVY, strokeWidth: 0 }}
          activeDot={{ r: 4.5, strokeWidth: 2, stroke: "#fff" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Parco app: ciambella iOS / Android con il totale al centro. */
export function DevicesDonut({
  ios,
  android,
  total,
}: {
  ios: number;
  android: number;
  total: number;
}) {
  const data = [
    { name: "iOS", value: ios, color: NAVY },
    { name: "Android", value: android, color: GREY },
  ].filter((row) => row.value > 0);

  if (!data.length) {
    return (
      <div className="flex h-[168px] items-center justify-center text-[13px] font-medium italic text-[#a8a8a8]">
        Nessun dispositivo visto nel periodo.
      </div>
    );
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={168}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={52}
            outerRadius={76}
            paddingAngle={data.length > 1 ? 2 : 0}
            startAngle={90}
            endAngle={-270}
            stroke="none"
          >
            {data.map((row) => (
              <Cell key={row.name} fill={row.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-semibold leading-none tabular-nums text-[#111111]">
          {formatInt(total)}
        </span>
        <span className="mt-1 text-[11px] font-medium text-[#9a9a9a]">dispositivi</span>
      </div>
    </div>
  );
}

export const CHART_COLORS = { NAVY, GREY, GREEN, RED };
