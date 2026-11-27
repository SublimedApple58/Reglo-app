"use client";

import React from "react";

import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import { getQuizSeatsContext, setSignupStartPhase } from "@/lib/actions/autoscuole-settings.actions";
import type { SignupStartPhase } from "@/lib/autoscuole/signup-start-phase";
import { cn } from "@/lib/utils";

/**
 * REG-815 — «Chi si registra dall'app parte da»: In attesa / Teoria / Foglio rosa.
 * Prende il posto dell'interruttore «Assegnazione automatica della licenza quiz».
 * Scelta singola a tre righe, salva subito; la selezione si sposta sulla
 * risposta del backend (sulla riga scelta, intanto, i puntini di attesa).
 * Nascosta senza fase Teoria: lì chi si registra parte già in Foglio rosa.
 */

type Seats = { quizSeats: number; used: number; available: number };

const seatsText = ({ quizSeats, used }: Seats) =>
  quizSeats === 0
    ? "Nessuna licenza quiz disponibile."
    : `${used} di ${quizSeats} licenze quiz usate.`;

function options(current: SignupStartPhase, seats: Seats | null) {
  const promote =
    current !== "TEORIA" && seats !== null && seats.available > 0
      ? " Scegliendola, chi è già in attesa passa in Teoria finché ci sono licenze libere."
      : "";
  return [
    {
      value: "AWAITING" as const,
      label: "In attesa",
      hint: "Entra in attesa di attivazione: decidi tu quando farlo partire.",
    },
    {
      value: "TEORIA" as const,
      label: "Teoria",
      hint: `Riceve subito una licenza quiz, se ce n'è una libera; altrimenti resta in attesa.${
        seats ? ` ${seatsText(seats)}` : ""
      }${promote}`,
    },
    {
      value: "PRATICA" as const,
      label: "Foglio rosa",
      hint: "Parte dalle guide e può prenotare subito. Non usa licenze quiz.",
    },
  ];
}

/** Solo presentazione: le tre righe. */
export function SignupStartPhaseChoice({
  value,
  seats,
  pending,
  disabled,
  onSelect,
}: {
  value: SignupStartPhase | null;
  seats: Seats | null;
  /** Riga in salvataggio: mostra i puntini al posto del pallino. */
  pending?: SignupStartPhase | null;
  disabled?: boolean;
  onSelect: (phase: SignupStartPhase) => void;
}) {
  const title = "Chi si registra dall'app parte da";
  return (
    <div className="max-w-[680px]">
      <div className="text-[15px] font-semibold text-foreground">{title}</div>
      <p className="mt-0.5 text-[13.5px] font-medium leading-relaxed text-[#6a6a6a]">
        Vale per i nuovi allievi che si iscrivono con un codice dell&apos;autoscuola. Chi è già iscritto
        non cambia.
      </p>
      <div role="radiogroup" aria-label={title} className="mt-2 divide-y divide-[#efefef]">
        {options(value ?? "AWAITING", seats).map((option) => {
          const selected = value === option.value;
          const saving = pending === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => !selected && onSelect(option.value)}
              data-testid={`signup-start-phase-${option.value}`}
              className={cn(
                "reglo-focus-ring group flex w-full items-center gap-5 py-4 text-left",
                disabled ? "cursor-default" : "cursor-pointer",
              )}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[15px] transition-colors duration-200 ease-out",
                    selected ? "font-semibold text-foreground" : "font-medium text-[#3a3a3a]",
                  )}
                >
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[13px] font-medium leading-relaxed text-[#8a8a8a]">
                  {option.hint}
                </span>
              </span>
              <span className="flex size-[22px] shrink-0 items-center justify-center">
                {saving ? (
                  <LoadingDots className="text-[#929292]" />
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "size-[22px] rounded-full transition-[box-shadow,transform] duration-200 ease-out",
                      selected
                        ? "shadow-[inset_0_0_0_7px_#111111]"
                        : "shadow-[inset_0_0_0_1.5px_#c4c4c4] group-hover:shadow-[inset_0_0_0_1.5px_#8a8a8a] group-active:scale-90",
                    )}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SignupStartPhaseSection() {
  const toast = useFeedbackToast();
  const [ctx, setCtx] = React.useState<
    (Seats & { phasesEnabled: ("TEORIA" | "PRATICA")[]; signupStartPhase: SignupStartPhase }) | null
  >(null);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState<SignupStartPhase | null>(null);

  const refresh = React.useCallback(async () => {
    const res = await getQuizSeatsContext();
    if (res.success) setCtx(res.data);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!loading && (!ctx || !ctx.phasesEnabled.includes("TEORIA"))) return null;

  const select = async (phase: SignupStartPhase) => {
    if (pending || loading) return;
    setPending(phase);
    try {
      const res = await setSignupStartPhase({ phase });
      if (!res.success) {
        toast.error({ description: res.message ?? "Impossibile aggiornare." });
        return;
      }
      toast.success({ description: res.message });
      await refresh();
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="py-6" data-testid="signup-start-phase-section">
      <SignupStartPhaseChoice
        value={ctx?.signupStartPhase ?? null}
        seats={ctx}
        pending={pending}
        disabled={loading || pending !== null}
        onSelect={(phase) => void select(phase)}
      />
    </div>
  );
}
