"use client";

import * as React from "react";
import { X } from "lucide-react";
import { SegmentedPill } from "@/components/ui/segmented-pill";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";
import { RangeCalendar, dateOfYmd, ymdOf } from "@/components/pages/Autoscuole/dialogs/RangeCalendar";

const dateOf = dateOfYmd;
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
  const [rangeStart, setRangeStart] = React.useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = React.useState<string | null>(null);
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
    setRangeStart(init);
    setRangeEnd(init);
    setLabel("");
    setPendingAction(null);
  }, [open, initialDate]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open) return null;

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
            <RangeCalendar
              mode={mode}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              onChange={(start, end) => {
                setRangeStart(start);
                setRangeEnd(end);
              }}
              minDate={todayStr}
              marked={existingHolidays}
            />
            <div className="mt-4 flex items-center justify-between border-t border-[#f0f0f0] pt-3.5">
              <div className="text-[13px] text-[#aaa]">{infoText}</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-[20px] border border-[#ddd] px-4 py-2 text-[13px] font-medium text-[#444]"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  disabled={!canConfirm}
                  onClick={() => setStep("confirm")}
                  className={cn(
                    "rounded-[20px] px-4 py-2 text-[13px] font-semibold transition-colors",
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
