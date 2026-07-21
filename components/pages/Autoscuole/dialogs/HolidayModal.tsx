"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { SegmentedPill } from "@/components/ui/segmented-pill";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const WEEKDAYS = ["L", "M", "M", "G", "V", "S", "D"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const ymdOf = (d: Date) => ymd(d.getFullYear(), d.getMonth(), d.getDate());
const dateOf = (ds: string) => {
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const dayLabel = (ds: string) =>
  dateOf(ds).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
const dayShort = (ds: string) =>
  dateOf(ds).toLocaleDateString("it-IT", { day: "numeric", month: "long" });

type Mode = "singolo" | "multiplo";
type Step = "select" | "confirm";
type PendingAction = null | "keep" | "cancel";

/**
 * Modale "Segna festivo" dell'agenda — replica del prototipo Desktop.
 * Tab Singolo/Multiplo, calendario a due mesi, selezione giorno o intervallo
 * (click o trascinamento). Alla conferma resta la scelta essenziale
 * mantieni/cancella le guide del periodo (POST /api/autoscuole/holidays con
 * from/to → createHolidayRange). Company-wide (il per-istruttore è la Fase 2).
 */
export function HolidayModal({
  open,
  onClose,
  initialDate,
  existingHolidays,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** Giorno da preselezionare (es. quello cliccato in agenda). */
  initialDate: Date | null;
  /** Chiavi YYYY-MM-DD dei giorni già festivi, evidenziati in ambra. */
  existingHolidays: Map<string, string | null>;
  /** Callback dopo un salvataggio riuscito (ricarica l'agenda). */
  onDone: () => void;
}) {
  const toast = useFeedbackToast();
  const [step, setStep] = React.useState<Step>("select");
  const [mode, setMode] = React.useState<Mode>("singolo");
  const [pickerOffset, setPickerOffset] = React.useState(0);
  const [rangeStart, setRangeStart] = React.useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = React.useState<string | null>(null);
  const [hoverDay, setHoverDay] = React.useState<string | null>(null);
  const [dragAnchor, setDragAnchor] = React.useState<string | null>(null);
  const [dragMoved, setDragMoved] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [pendingAction, setPendingAction] = React.useState<PendingAction>(null);
  const pending = pendingAction !== null;

  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = ymdOf(today);

  React.useEffect(() => {
    if (!open) return;
    const init = initialDate ? ymdOf(initialDate) : null;
    setStep("select");
    setMode("singolo");
    setPickerOffset(0);
    setRangeStart(init);
    setRangeEnd(init);
    setHoverDay(null);
    setDragAnchor(null);
    setDragMoved(false);
    setLabel("");
    setPendingAction(null);
  }, [open, initialDate]);

  // Fine trascinamento ovunque venga rilasciato il mouse.
  React.useEffect(() => {
    if (!open) return;
    const up = () => setDragAnchor(null);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open) return null;

  const baseIndex = today.getFullYear() * 12 + today.getMonth();
  const monthAt = (n: number) => {
    const t = baseIndex + pickerOffset + n;
    return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
  };
  const m1 = monthAt(0);
  const m2 = monthAt(1);
  const canPrev = pickerOffset > 0;

  const isSel = (ds: string | null) => !!ds && (ds === rangeStart || ds === rangeEnd);
  const inRange = (ds: string | null) =>
    !!ds && !!rangeStart && !!rangeEnd && ds > rangeStart && ds < rangeEnd;
  const isConf = (ds: string | null) => !!ds && existingHolidays.has(ds);

  const onDay = (ds: string) => {
    if (mode === "singolo") {
      setRangeStart(ds);
      setRangeEnd(ds);
      return;
    }
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(ds);
      setRangeEnd(null);
    } else if (ds < rangeStart) {
      setRangeEnd(rangeStart);
      setRangeStart(ds);
    } else {
      setRangeEnd(ds);
    }
  };
  // Interazione: in Singolo si clicca un giorno; in Multiplo click-click
  // (auto-ordinato) oppure trascinamento. Il flag dragMoved evita che il
  // click finale del trascinamento venga interpretato come selezione singola.
  const onCellMouseDown = (ds: string) => {
    if (ds < todayStr || mode !== "multiplo") return;
    setDragAnchor(ds);
    setDragMoved(false);
  };
  const onCellMouseEnter = (ds: string) => {
    if (ds < todayStr) {
      setHoverDay(null);
      return;
    }
    setHoverDay(ds);
    if (mode === "multiplo" && dragAnchor && ds !== dragAnchor) {
      setDragMoved(true);
      if (ds >= dragAnchor) {
        setRangeStart(dragAnchor);
        setRangeEnd(ds);
      } else {
        setRangeStart(ds);
        setRangeEnd(dragAnchor);
      }
    }
  };
  const onCellClick = (ds: string) => {
    if (ds < todayStr) return;
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
              disabled={!canPrev}
              onClick={() => canPrev && setPickerOffset((o) => o - 1)}
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
              onClick={() => setPickerOffset((o) => o + 1)}
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
                  const past = !!ds && ds < todayStr;
                  const sel = isSel(ds);
                  const conf = isConf(ds);
                  const hov = !!ds && !sel && !past && hoverDay === ds;
                  return (
                    <div
                      key={ci}
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

  const canConfirm = !!(rangeStart && rangeEnd);
  const infoText =
    mode === "singolo"
      ? rangeStart
        ? `Selezionato: ${dayLabel(rangeStart)}`
        : "Seleziona un giorno"
      : !rangeStart
        ? "Seleziona inizio periodo"
        : !rangeEnd
          ? "Ora seleziona la fine"
          : `${dayShort(rangeStart)} → ${dayShort(rangeEnd)}`;
  const whenText =
    rangeStart && rangeEnd
      ? rangeStart === rangeEnd
        ? `il ${dayLabel(rangeStart)}`
        : `dal ${dayShort(rangeStart)} al ${dayShort(rangeEnd)}`
      : "";

  const submit = async (cancelAppointments: boolean) => {
    if (!rangeStart || !rangeEnd) return;
    setPendingAction(cancelAppointments ? "cancel" : "keep");
    try {
      const res = await fetch("/api/autoscuole/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: rangeStart,
          to: rangeEnd,
          label: label || undefined,
          cancelAppointments,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const cancelled = data.data?.cancelledCount ?? 0;
        toast.success({
          description:
            cancelled > 0
              ? `Festivo aggiunto. ${cancelled} ${cancelled === 1 ? "guida cancellata" : "guide cancellate"}.`
              : "Festivo aggiunto.",
        });
        onDone();
        onClose();
      } else {
        toast.error({ description: data.message ?? "Errore." });
      }
    } catch {
      toast.error({ description: "Errore di rete." });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="relative w-[780px] max-w-[94vw] rounded-[20px] bg-white px-7 pb-5 pt-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            if (!pending) onClose();
          }}
          className="absolute right-3.5 top-3.5 flex size-[30px] items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f0f0f0]"
        >
          <X className="size-3 text-[#6a6a6a]" strokeWidth={1.8} />
        </button>

        {step === "select" ? (
          <>
            <div className="mb-3.5 text-center text-[16px] font-bold text-[#222]">Segna festivo</div>
            <div className="mb-4 flex justify-center">
              <SegmentedPill
                value={mode}
                onChange={(v) => {
                  setMode(v);
                  setRangeStart(null);
                  setRangeEnd(null);
                }}
                options={[
                  { value: "singolo", label: "Singolo" },
                  { value: "multiplo", label: "Multiplo" },
                ]}
              />
            </div>
            <div className="flex gap-5">
              {renderMonth(m1.y, m1.m, true, false, fadeRight, false)}
              {renderMonth(m2.y, m2.m, false, true, false, fadeLeft)}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[#f0f0f0] pt-3.5">
              <div className="text-[13px] text-[#aaa]">{infoText}</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-[18px] border border-[#ddd] px-4 py-2 text-[13px] font-medium text-[#444]"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  disabled={!canConfirm}
                  onClick={() => setStep("confirm")}
                  className={cn(
                    "rounded-[18px] px-4 py-2 text-[13px] font-semibold transition-colors",
                    canConfirm
                      ? "cursor-pointer bg-[#f59e0b] text-white"
                      : "cursor-default bg-[#e0e0e0] text-[#aaa]",
                  )}
                >
                  Conferma
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-1.5 text-center text-[16px] font-bold text-[#222]">
              Confermi la chiusura?
            </div>
            <p className="mx-auto mb-4 max-w-[420px] text-center text-[13px] text-[#6a6a6a]">
              L&apos;autoscuola risulterà chiusa {whenText}. Gli allievi con guide in questo
              periodo verranno avvisati.
            </p>
            <div className="mb-4">
              <label
                htmlFor="holiday-range-label"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Nome festività (opzionale)
              </label>
              <Input
                id="holiday-range-label"
                placeholder="es. Ferragosto, Ferie estive..."
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-lg"
                disabled={pending}
                onClick={() => submit(false)}
              >
                {pendingAction === "keep" ? <LoadingDots className="min-h-5" /> : "Chiudi e mantieni le guide"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="w-full rounded-lg"
                disabled={pending}
                onClick={() => submit(true)}
              >
                {pendingAction === "cancel" ? <LoadingDots className="min-h-5" /> : "Chiudi e cancella le guide"}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setStep("select")}
              disabled={pending}
              className="mx-auto mt-3 block cursor-pointer text-[13px] text-[#6a6a6a] underline underline-offset-2 disabled:opacity-50"
            >
              ← Torna al calendario
            </button>
          </>
        )}
      </div>
    </div>
  );
}
