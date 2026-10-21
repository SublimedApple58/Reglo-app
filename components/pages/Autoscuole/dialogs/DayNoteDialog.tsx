"use client";

import * as React from "react";
import { NotebookPen, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/ui/date-picker";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";
import { ymdOf, dateOfYmd } from "@/components/pages/Autoscuole/dialogs/RangeCalendar";
import { DAY_NOTE_MAX_LENGTH } from "@/lib/autoscuole/day-notes";

/**
 * REG-632 — «Nota del giorno»: un'etichetta per tutta l'autoscuola sulla data
 * («Genova quiz»). Stessa cornice del modale «Segna festivo», ma più raccolta:
 * è un promemoria per l'ufficio, non chiude niente. Testo vuoto = toglie la nota.
 */
export function DayNoteDialog({
  open,
  onClose,
  initialDate,
  notes,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Giorno cliccato in agenda; null = oggi, con la data da scegliere. */
  initialDate: Date | null;
  /** Note esistenti per data (YYYY-MM-DD). */
  notes: Map<string, string>;
  onSaved: (date: string, text: string | null) => void;
}) {
  const toast = useFeedbackToast();
  const [date, setDate] = React.useState("");
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState<null | "save" | "remove">(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const ymd = ymdOf(initialDate ?? new Date());
    setDate(ymd);
    setText(notes.get(ymd) ?? "");
    setPending(null);
    requestAnimationFrame(() => inputRef.current?.focus());
    // Le note cambiano solo dopo un salvataggio, a dialog chiuso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const existing = notes.get(date) ?? null;
  const trimmed = text.trim();
  const canSave = !!date && trimmed !== (existing ?? "") && (trimmed.length > 0 || existing !== null);

  const save = async (value: string) => {
    setPending(value ? "save" : "remove");
    try {
      const res = await fetch("/api/autoscuole/day-notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, text: value }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error({ description: data.message ?? "Impossibile salvare la nota." });
        return;
      }
      toast.success({ description: value ? "Nota del giorno salvata." : "Nota del giorno tolta." });
      onSaved(date, value || null);
      onClose();
    } catch {
      toast.error({ description: "Errore di rete." });
    } finally {
      setPending(null);
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
        role="dialog"
        aria-label="Nota del giorno"
        data-testid="day-note-dialog"
        className="relative w-[440px] max-w-[94vw] rounded-[20px] bg-white px-7 pb-5 pt-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Chiudi"
          onClick={() => {
            if (!pending) onClose();
          }}
          className="absolute right-3.5 top-3.5 flex size-[30px] items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f0f0f0]"
        >
          <X className="size-3 text-[#6a6a6a]" strokeWidth={1.8} />
        </button>

        <div className="mb-1 flex items-center justify-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-[#f3f1ec]">
            <NotebookPen className="size-3.5 text-[#5c554c]" strokeWidth={1.8} />
          </span>
          <span className="text-[16px] font-bold text-[#222]">Nota del giorno</span>
        </div>
        <p className="mb-5 text-center text-[13px] first-letter:uppercase text-[#6a6a6a]">
          {date
            ? dateOfYmd(date).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })
            : ""}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave && !pending) void save(trimmed);
          }}
        >
          {!initialDate && (
            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Data</label>
              <DatePickerInput
                value={date}
                onChange={(v) => {
                  setDate(v);
                  setText(notes.get(v) ?? "");
                }}
              />
            </div>
          )}
          <label htmlFor="day-note-text" className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-muted-foreground">
            <span>Nota</span>
            <span className={cn("tabular-nums", text.length >= DAY_NOTE_MAX_LENGTH ? "text-[#c13515]" : "text-[#b0b0b0]")}>
              {text.length}/{DAY_NOTE_MAX_LENGTH}
            </span>
          </label>
          <Input
            ref={inputRef}
            id="day-note-text"
            data-testid="day-note-input"
            placeholder="Es. Genova quiz"
            value={text}
            maxLength={DAY_NOTE_MAX_LENGTH}
            onChange={(e) => setText(e.target.value)}
            disabled={!!pending}
          />
          <p className="mt-2 text-[12px] leading-snug text-[#8a8a8a]">
            La vede tutto l&apos;ufficio, in agenda e in stampa. Non blocca le prenotazioni.
          </p>

          <div className="mt-5 flex items-center justify-between border-t border-[#f0f0f0] pt-3.5">
            {existing !== null ? (
              <button
                type="button"
                data-testid="day-note-remove"
                disabled={!!pending}
                onClick={() => void save("")}
                className="cursor-pointer text-[13px] font-medium text-[#c13515] underline-offset-2 hover:underline disabled:opacity-50"
              >
                {pending === "remove" ? <LoadingDots className="min-h-5" /> : "Togli nota"}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={!!pending}
                className="cursor-pointer rounded-[20px] border border-[#ddd] px-4 py-2 text-[13px] font-medium text-[#444]"
              >
                Annulla
              </button>
              <button
                type="submit"
                data-testid="day-note-save"
                disabled={!canSave || !!pending}
                className={cn(
                  "min-w-[76px] rounded-[20px] px-4 py-2 text-[13px] font-semibold transition-colors",
                  canSave ? "cursor-pointer bg-[#222222] text-white hover:bg-black" : "cursor-default bg-[#e0e0e0] text-[#aaa]",
                )}
              >
                {pending === "save" ? <LoadingDots className="min-h-5" /> : "Salva"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
