"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const WEEKDAYS = ["L", "M", "M", "G", "V", "S", "D"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const ymdOf = (d: Date) => ymd(d.getFullYear(), d.getMonth(), d.getDate());
export const dateOfYmd = (ds: string) => {
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const monthIndexOf = (ds: string) => {
  const [y, m] = ds.split("-").map(Number);
  return y * 12 + (m - 1);
};

/**
 * Calendario a due mesi con selezione di un giorno o di un intervallo
 * (click-click auto-ordinato oppure trascinamento), nato nella modale
 * "Segna festivo" e riusato dalla stampa "Solo esami" (REG-620).
 *
 * - `mode="singolo"`: un click seleziona un giorno (start = end).
 * - `mode="multiplo"`: click inizio + click fine, oppure trascina.
 * - `minDate` (YYYY-MM-DD): i giorni prima sono grigi e non selezionabili,
 *   e non si torna indietro oltre il suo mese. Senza, si naviga liberamente.
 * - `marked`: giorni evidenziati in ambra (es. festivi già segnati).
 */
export function RangeCalendar({
  mode,
  rangeStart,
  rangeEnd,
  onChange,
  minDate = null,
  marked,
}: {
  mode: "singolo" | "multiplo";
  rangeStart: string | null;
  rangeEnd: string | null;
  onChange: (start: string | null, end: string | null) => void;
  minDate?: string | null;
  marked?: { has: (ds: string) => boolean };
}) {
  const todayStr = React.useMemo(() => ymdOf(new Date()), []);
  // Mese mostrato a sinistra: quello dell'inizio selezionato, altrimenti oggi.
  const [leftMonth, setLeftMonth] = React.useState(() => monthIndexOf(rangeStart ?? todayStr));
  const [hoverDay, setHoverDay] = React.useState<string | null>(null);
  const [dragAnchor, setDragAnchor] = React.useState<string | null>(null);
  const [dragMoved, setDragMoved] = React.useState(false);

  // Fine trascinamento ovunque venga rilasciato il mouse.
  React.useEffect(() => {
    const up = () => setDragAnchor(null);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const monthAt = (n: number) => {
    const t = leftMonth + n;
    return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
  };
  const m1 = monthAt(0);
  const m2 = monthAt(1);
  const canPrev = !minDate || leftMonth > monthIndexOf(minDate);
  const isBlocked = (ds: string) => !!minDate && ds < minDate;

  const isSel = (ds: string | null) => !!ds && (ds === rangeStart || ds === rangeEnd);
  const inRange = (ds: string | null) =>
    !!ds && !!rangeStart && !!rangeEnd && ds > rangeStart && ds < rangeEnd;
  const isMarked = (ds: string | null) => !!ds && !!marked?.has(ds);

  const onDay = (ds: string) => {
    if (mode === "singolo") {
      onChange(ds, ds);
      return;
    }
    if (!rangeStart || (rangeStart && rangeEnd)) {
      onChange(ds, null);
    } else if (ds < rangeStart) {
      onChange(ds, rangeStart);
    } else {
      onChange(rangeStart, ds);
    }
  };
  // Interazione: in Singolo si clicca un giorno; in Multiplo click-click
  // (auto-ordinato) oppure trascinamento. Il flag dragMoved evita che il
  // click finale del trascinamento venga interpretato come selezione singola.
  const onCellMouseDown = (ds: string) => {
    if (isBlocked(ds) || mode !== "multiplo") return;
    setDragAnchor(ds);
    setDragMoved(false);
  };
  const onCellMouseEnter = (ds: string) => {
    if (isBlocked(ds)) {
      setHoverDay(null);
      return;
    }
    setHoverDay(ds);
    if (mode === "multiplo" && dragAnchor && ds !== dragAnchor) {
      setDragMoved(true);
      if (ds >= dragAnchor) onChange(dragAnchor, ds);
      else onChange(ds, dragAnchor);
    }
  };
  const onCellClick = (ds: string) => {
    if (isBlocked(ds)) return;
    setDragAnchor(null);
    if (dragMoved) {
      setDragMoved(false);
      return;
    }
    onDay(ds);
  };

  const hasSpanRange = !!(rangeStart && rangeEnd && rangeStart !== rangeEnd);
  const m1Str = `${m1.y}-${pad(m1.m + 1)}`;
  const m2Str = `${m2.y}-${pad(m2.m + 1)}`;
  const fadeRight = hasSpanRange && !!rangeEnd && !rangeEnd.startsWith(m1Str);
  const fadeLeft = hasSpanRange && !!rangeStart && !rangeStart.startsWith(m2Str);

  const renderMonth = (
    y: number,
    m: number,
    showPrev: boolean,
    showNext: boolean,
    fadeR: boolean,
    fadeL: boolean,
  ) => {
    const firstDow = new Date(y, m, 1).getDay();
    const offset = firstDow === 0 ? 6 : firstDow - 1;
    const dim = new Date(y, m + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let r = 0; r < cells.length; r += 7) rows.push(cells.slice(r, r + 7));

    return (
      <div className="min-w-0 flex-1">
        <div className="mb-3.5 flex items-center justify-between">
          {showPrev ? (
            <button
              type="button"
              aria-label="Mese precedente"
              disabled={!canPrev}
              onClick={() => canPrev && setLeftMonth((o) => o - 1)}
              className={cn(
                "flex items-center p-1",
                canPrev ? "cursor-pointer opacity-100" : "cursor-default opacity-20",
              )}
            >
              <ChevronLeft className="size-3.5 text-[#222]" strokeWidth={1.8} />
            </button>
          ) : (
            <div className="w-[22px]" />
          )}
          <div className="text-[14px] font-bold text-[#222]">
            {MONTHS[m]} {y}
          </div>
          {showNext ? (
            <button
              type="button"
              aria-label="Mese successivo"
              onClick={() => setLeftMonth((o) => o + 1)}
              className="flex cursor-pointer items-center p-1"
            >
              <ChevronRight className="size-3.5 text-[#222]" strokeWidth={1.8} />
            </button>
          ) : (
            <div className="w-[22px]" />
          )}
        </div>
        <div className="mb-1.5 grid grid-cols-7">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="py-1 text-center text-[12px] font-semibold text-[#bbb]">
              {d}
            </div>
          ))}
        </div>
        {rows.map((row, ri) => {
          const rowDs = row.map((day) => (day ? ymd(y, m, day) : null));
          let stripStart = 7;
          let stripEnd = -1;
          rowDs.forEach((ds, ci) => {
            if (ds && hasSpanRange && (isSel(ds) || inRange(ds))) {
              if (ci < stripStart) stripStart = ci;
              if (ci > stripEnd) stripEnd = ci;
            }
          });
          const hasStrip = hasSpanRange && stripEnd >= stripStart;
          const isFirstRow = hasStrip && !!rangeStart && rowDs.includes(rangeStart);
          const isLastRow = hasStrip && !!rangeEnd && rowDs.includes(rangeEnd);
          const leftPct = isFirstRow ? ((stripStart + 0.5) / 7) * 100 : 0;
          const rightPct = isLastRow ? ((6.5 - stripEnd) / 7) * 100 : 0;
          const stripRadius =
            isFirstRow && isLastRow
              ? "50px"
              : isFirstRow
                ? "50px 0 0 50px"
                : isLastRow
                  ? "0 50px 50px 0"
                  : "0";
          return (
            <div key={ri} className="relative mb-0.5">
              {hasStrip && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    top: 4,
                    bottom: 4,
                    left: `${leftPct}%`,
                    right: `${rightPct}%`,
                    background: "#ebebeb",
                    borderRadius: stripRadius,
                    zIndex: 0,
                  }}
                />
              )}
              {hasStrip && fadeR && rightPct === 0 && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    top: 4,
                    bottom: 4,
                    left: "100%",
                    width: `${100 / 14}%`,
                    background: "linear-gradient(to right, #ebebeb, transparent)",
                    zIndex: 0,
                  }}
                />
              )}
              {hasStrip && fadeL && leftPct === 0 && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    top: 4,
                    bottom: 4,
                    right: "100%",
                    width: `${100 / 14}%`,
                    background: "linear-gradient(to left, #ebebeb, transparent)",
                    zIndex: 0,
                  }}
                />
              )}
              <div className="relative z-[1] grid grid-cols-7">
                {row.map((day, ci) => {
                  const ds = rowDs[ci];
                  const past = !!ds && isBlocked(ds);
                  const sel = isSel(ds);
                  const conf = isMarked(ds);
                  const hov = !!ds && !sel && !past && hoverDay === ds;
                  return (
                    <div
                      key={ci}
                      data-day={ds ?? undefined}
                      onClick={day && !past && ds ? () => onCellClick(ds) : undefined}
                      onMouseDown={
                        day && !past && ds
                          ? (e) => {
                              e.preventDefault();
                              onCellMouseDown(ds);
                            }
                          : undefined
                      }
                      onMouseEnter={day && !past && ds ? () => onCellMouseEnter(ds) : undefined}
                      onMouseLeave={day ? () => setHoverDay(null) : undefined}
                      className="flex h-[60px] items-center justify-center"
                    >
                      {day ? (
                        <div
                          className="flex size-[50px] shrink-0 select-none items-center justify-center rounded-full text-[18px]"
                          style={{
                            cursor: past ? "default" : "pointer",
                            fontWeight: sel ? 700 : 500,
                            color: sel ? "#fff" : past ? "#ccc" : conf ? "#d97706" : "#222",
                            background: sel ? "#222" : hov ? "#f0f0f0" : "transparent",
                            border: conf && !sel ? "2px solid #f59e0b" : "none",
                            boxSizing: "border-box",
                          }}
                        >
                          {day}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex gap-5">
      {renderMonth(m1.y, m1.m, true, false, fadeRight, false)}
      {renderMonth(m2.y, m2.m, false, true, false, fadeLeft)}
    </div>
  );
}
