"use client";

import { useEffect, useRef, useState } from "react";

import type { ChartMonth } from "@/lib/finance/finance-overview";

import { euroSmart, monthLabel, monthName } from "./finance-ui";

/**
 * «Entrate e uscite, 12 mesi» dal mockup approvato: barre piene per ciò che è
 * già incassato/pagato, tratteggiate per la previsione, linea della cassa
 * sull'asse di destra. SVG a mano per restare fedeli al disegno.
 */

const W = 1180;
const H = 300;
const LEFT = 50;
const RIGHT = 1150;
const TOP = 30;
const BASE = 240;
const BAR = 26;

/** Passo «tondo» (1, 2, 2,5, 5 × 10ⁿ) per dividere `max` in `parts` intervalli. */
function niceStep(max: number, parts: number) {
  if (max <= 0) return 1;
  const raw = max / parts;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 2.5, 5, 10].find((u) => u * pow >= raw) ?? 10;
  return unit * pow;
}

/** 12.000 € → «12k», 1.500 € → «1,5k», 800 € → «800». */
const shortEuro = (cents: number) => {
  const euros = cents / 100;
  const sign = euros < 0 ? "−" : "";
  const abs = Math.abs(euros);
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}${k.toLocaleString("it-IT", { maximumFractionDigits: k >= 10 ? 0 : 1 })}k`;
  }
  return `${sign}${Math.round(abs)}`;
};

export function FinanceChart({ months }: { months: ChartMonth[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const step = (RIGHT - LEFT) / months.length;
  const cx = (i: number) => LEFT + step * (i + 0.5);

  // Asse sinistro: entrate/uscite (pieno + previsto, impilati).
  const barMax = Math.max(
    1,
    ...months.map((m) => Math.max(m.actualInCents + m.forecastInCents, m.actualOutCents + m.forecastOutCents)),
  );
  const leftStep = niceStep(barMax, 3);
  const leftMax = leftStep * 3;
  const yBar = (v: number) => BASE - (v / leftMax) * (BASE - TOP);

  // Asse destro: cassa.
  const cashValues = months.map((m) => m.cashCents).filter((v): v is number => v !== null);
  const hasCash = cashValues.length > 0;
  const cashHiRaw = Math.max(0, ...cashValues);
  const cashLoRaw = Math.min(0, ...cashValues);
  const cashStep = niceStep(Math.max(cashHiRaw - cashLoRaw, 1), 2);
  const cashHi = Math.max(cashStep, Math.ceil(cashHiRaw / cashStep) * cashStep);
  const cashLo = Math.floor(cashLoRaw / cashStep) * cashStep;
  const yCash = (v: number) => BASE - ((v - cashLo) / (cashHi - cashLo || 1)) * (BASE - TOP);

  const currentIndex = months.findIndex((m) => m.isCurrent);
  const todayX = LEFT + step * (currentIndex + 1);

  const cashPoints = months
    .map((m, i) => (m.cashCents === null ? null : { i, x: cx(i), y: yCash(m.cashCents), v: m.cashCents }))
    .filter((p): p is { i: number; x: number; y: number; v: number } => p !== null);
  const pastCash = cashPoints.filter((p) => p.i <= currentIndex);
  const futureCash = cashPoints.filter((p) => p.i >= currentIndex);
  const todayCash = cashPoints.find((p) => p.i === currentIndex);
  const lastCash = cashPoints[cashPoints.length - 1];

  // Un'etichetta sola sui rinnovi: il mese che ne porta di più.
  const renewalPeak = months.reduce<number | null>(
    (best, m, i) =>
      m.renewalsInCents > 0 && (best === null || m.renewalsInCents > months[best].renewalsInCents) ? i : best,
    null,
  );

  const hovered = hover !== null ? months[hover] : null;

  // Sul telefono il grafico scorre in orizzontale: si apre centrato sul mese
  // in corso, non sui mesi più vecchi (spesso vuoti, prima della partenza).
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth || currentIndex < 0) return;
    el.scrollLeft = (todayX / W) * el.scrollWidth - el.clientWidth / 2;
  }, [currentIndex, todayX]);

  return (
    <div className="relative">
      <div ref={scroller} className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full min-w-[720px] tabular-nums"
          fontFamily="inherit"
          fontSize="12"
          role="img"
          aria-label="Entrate e uscite degli ultimi sei mesi e dei prossimi sei"
        >
          <defs>
            <pattern id="fin-hatch-in" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#fff" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#111" strokeWidth="1.4" />
            </pattern>
            <pattern id="fin-hatch-out" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#fff" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#b9b9c0" strokeWidth="1.4" />
            </pattern>
          </defs>

          {/* Griglia + asse sinistro */}
          {[0, 1, 2, 3].map((k) => {
            const y = yBar(leftStep * k);
            return (
              <g key={k}>
                <line x1={LEFT} x2={RIGHT} y1={y} y2={y} stroke={k === 0 ? "#d9d9dc" : "#f0f0f1"} />
                <text x={40} y={y + 4} fill="#a1a1aa" textAnchor="end">
                  {shortEuro(leftStep * k)}
                </text>
              </g>
            );
          })}

          {/* Asse destro: cassa */}
          {hasCash
            ? Array.from({ length: Math.round((cashHi - cashLo) / cashStep) + 1 }, (_, k) => cashLo + k * cashStep).map(
                (v) => (
                  <text key={v} x={W - 2} y={yCash(v) + 4} fill="#a1a1aa" textAnchor="end" fontSize="11">
                    {shortEuro(v)}
                  </text>
                ),
              )
            : null}

          {/* Barre */}
          {months.map((m, i) => {
            const x = cx(i);
            const inTotal = m.actualInCents + m.forecastInCents;
            const bar = (
              left: number,
              actual: number,
              forecast: number,
              solid: string,
              hatch: string,
              stroke: string,
            ) => (
              <>
                {actual > 0 ? (
                  <rect
                    x={left}
                    y={yBar(actual)}
                    width={BAR}
                    height={Math.max(1, BASE - yBar(actual))}
                    rx={5}
                    fill={solid}
                  />
                ) : null}
                {forecast > 0 ? (
                  <rect
                    x={left}
                    y={yBar(actual + forecast)}
                    width={BAR}
                    height={Math.max(1, yBar(actual) - yBar(actual + forecast))}
                    rx={5}
                    fill={`url(#${hatch})`}
                    stroke={stroke}
                    strokeWidth={1.2}
                  />
                ) : null}
              </>
            );
            return (
              <g key={m.ym} opacity={hover === null || hover === i ? 1 : 0.45}>
                {bar(x - 28, m.actualInCents, m.forecastInCents, "#111111", "fin-hatch-in", "#111111")}
                {bar(x + 2, m.actualOutCents, m.forecastOutCents, "#c9c9cf", "fin-hatch-out", "#b9b9c0")}
                <text
                  x={x}
                  y={262}
                  textAnchor="middle"
                  fill={m.isCurrent ? "#111111" : m.beforeStart ? "#d4d4d8" : "#71717a"}
                  fontWeight={m.isCurrent ? 600 : 400}
                >
                  {monthName(m.ym).slice(0, 3)}
                </text>
                {renewalPeak === i ? (
                  <text
                    x={x - 15}
                    y={Math.max(TOP - 8, yBar(inTotal) - 10)}
                    textAnchor="middle"
                    fill="#111111"
                    fontWeight={600}
                    fontSize="11.5"
                    stroke="#ffffff"
                    strokeWidth={4}
                    paintOrder="stroke"
                  >
                    +{euroSmart(m.renewalsInCents)} rinnovi
                  </text>
                ) : null}
                {/* Area di hover per la colonna intera */}
                <rect
                  x={LEFT + step * i}
                  y={TOP - 14}
                  width={step}
                  height={BASE - TOP + 30}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          })}

          {/* Oggi */}
          {currentIndex >= 0 ? (
            <g pointerEvents="none">
              <line x1={todayX} x2={todayX} y1={18} y2={262} stroke="#111" strokeDasharray="2 4" />
              <text x={todayX + 6} y={22} fill="#111" fontWeight={600}>
                oggi
              </text>
            </g>
          ) : null}

          {/* Cassa */}
          {hasCash ? (
            <g pointerEvents="none" fill="none" stroke="#111" strokeWidth={1.6} opacity={0.55}>
              {pastCash.length > 1 ? <polyline points={pastCash.map((p) => `${p.x},${p.y}`).join(" ")} /> : null}
              {futureCash.length > 1 ? (
                <polyline points={futureCash.map((p) => `${p.x},${p.y}`).join(" ")} strokeDasharray="5 4" />
              ) : null}
              {cashPoints.map((p) => (
                <circle key={p.i} cx={p.x} cy={p.y} r={2.5} fill="#fff" />
              ))}
            </g>
          ) : null}
          {todayCash ? (
            <text x={todayCash.x} y={todayCash.y - 10} textAnchor="middle" fill="#52525b" fontWeight={500} fontSize="11.5">
              cassa {shortEuro(todayCash.v)}
            </text>
          ) : null}
          {lastCash && todayCash && lastCash.i !== todayCash.i ? (
            <text x={lastCash.x} y={lastCash.y - 10} textAnchor="middle" fill="#52525b" fontWeight={500} fontSize="11.5">
              {shortEuro(lastCash.v)}
            </text>
          ) : null}
        </svg>
      </div>

      {hovered ? (
        <div
          className="pointer-events-none absolute top-2 z-10 w-[220px] rounded-xl border border-[#e9e9eb] bg-white px-3.5 py-3 text-[12.5px] shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
          style={{
            left: `${Math.min(Math.max(((cx(hover!) / W) * 100), 12), 82)}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="mb-1.5 font-semibold text-[#111111]">
            {monthLabel(hovered.ym)}
            {hovered.isFuture ? <span className="ml-1.5 font-normal text-[#71717a]">previsione</span> : null}
          </div>
          {hovered.beforeStart ? (
            <div className="text-[#71717a]">Prima dell&apos;inizio dei conti.</div>
          ) : (
            <>
              <TipRow label={hovered.isFuture ? "Entrate attese" : "Incassato"} cents={hovered.isFuture ? hovered.forecastInCents : hovered.actualInCents} />
              {!hovered.isFuture && hovered.forecastInCents > 0 ? (
                <TipRow label="Ancora atteso" cents={hovered.forecastInCents} />
              ) : null}
              <TipRow label={hovered.isFuture ? "Uscite note" : "Pagato"} cents={hovered.isFuture ? hovered.forecastOutCents : hovered.actualOutCents} />
              {!hovered.isFuture && hovered.forecastOutCents > 0 ? (
                <TipRow label="Ancora da pagare" cents={hovered.forecastOutCents} />
              ) : null}
              {hovered.renewalsInCents > 0 ? <TipRow label="di cui rinnovi" cents={hovered.renewalsInCents} muted /> : null}
              {hovered.cashCents !== null ? (
                <TipRow label={hovered.isFuture ? "Cassa stimata" : hovered.isCurrent ? "Cassa oggi" : "Cassa a fine mese"} cents={hovered.cashCents} strong />
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TipRow({ label, cents, muted, strong }: { label: string; cents: number; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className={muted ? "text-[#a1a1aa]" : "text-[#71717a]"}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold text-[#111111]" : "text-[#3f3f46]"}`}>
        {euroSmart(cents)}
      </span>
    </div>
  );
}
