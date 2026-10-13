"use client";

import * as React from "react";
import { AlertCircle, Check } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRANSMISSION_LABELS, type Transmission } from "@/lib/autoscuole/license";
import { cn } from "@/lib/utils";

/**
 * «Auto al seguito occupata» — il secondo schermo della prenotazione multipla
 * (REG-613).
 *
 * Con una sola auto al seguito per tutte le date, bastava che fosse occupata
 * una volta perche' l'intera prenotazione fallisse, con un messaggio che non
 * diceva nemmeno quale auto fosse. Qui si tengono le date e si cambia la
 * macchina: **il punto e' trovare un'altra auto, non un'altra data**.
 *
 * Le date libere non si elencano — sono gia' riassunte in cima. A schermo c'e'
 * solo quello su cui bisogna decidere.
 */

/** L'id dell'auto sostitutiva, `null` per "senza auto al seguito", `"remove"` per togliere la guida. */
export type ConflictChoice = string | null | "remove";

export type ConflictEntry = {
  index: number;
  startsAt: string;
  endsAt: string;
  conflict?: {
    kind: "instructor" | "block" | "overlap" | "vehicle";
    inGroupLesson?: boolean;
    role?: "primary" | "extra_moto" | "follow";
    vehicleId?: string;
    vehicleName?: string;
    label: string;
  };
  freeFollowCars?: Array<{ id: string; name: string; transmission: string | null }>;
};

export type ConflictStepState = {
  entries: ConflictEntry[];
  freeCount: number;
  suggestedForAll: { id: string; name: string } | null;
  allowPast: boolean;
};

/** Sentinella della Select: "nessuna auto al seguito" e' una risposta valida. */
export const NO_FOLLOW_CAR = "__none__";

/** "ven 17 ott · 09:00 – 10:00" */
const formatSlot = (startsAt: string, endsAt: string) => {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const day = start.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = (d: Date) =>
    d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time(start)} – ${time(end)}`;
};

/** Select piu' compatta della solita (h-11): con tre conflitti la card non deve scorrere. */
const SELECT_CLASS = "h-10 rounded-lg px-3.5 text-[13.5px]";

export function FollowCarConflictPane({
  step,
  choice,
  onChoose,
  onApplyToAll,
}: {
  step: ConflictStepState;
  choice: Record<number, ConflictChoice>;
  /** `undefined` rimette la riga fra quelle senza risposta (Ripristina). */
  onChoose: (index: number, value: ConflictChoice | undefined) => void;
  onApplyToAll: () => void;
}) {
  const conflicts = step.entries.filter((e) => e.conflict);
  const total = step.entries.length;
  const busyName = conflicts.find((e) => e.conflict?.role === "follow")?.conflict?.vehicleName;
  // La scorciatoia ha senso finche' resta qualcosa da sistemare a mano.
  const pendingFollow = conflicts.filter(
    (e) => e.conflict?.role === "follow" && choice[e.index] === undefined,
  );
  const showSuggestion = Boolean(step.suggestedForAll) && pendingFollow.length > 1;
  const anyChoosable = conflicts.some((e) => (e.freeFollowCars?.length ?? 0) > 0);

  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-2.5 rounded-[10px] bg-[#f8f8f8] px-3.5 py-2.5">
        <AlertCircle className="size-[15px] shrink-0 text-[#767676]" strokeWidth={2} />
        <p className="text-[13px] leading-snug">
          <span className="font-semibold text-[#222222]">
            {step.freeCount} guid{step.freeCount === 1 ? "a" : "e"} su {total}{" "}
            {step.freeCount === 1 ? "è libera" : "sono libere"}.
          </span>{" "}
          <span className="font-medium text-[#767676]">
            {busyName
              ? `In ${conflicts.length} dat${conflicts.length === 1 ? "a" : "e"} la ${busyName} è già impegnata.`
              : `In ${conflicts.length} dat${conflicts.length === 1 ? "a serve" : "e serve"} una decisione.`}
          </span>
        </p>
      </div>

      {showSuggestion && step.suggestedForAll ? (
        <div className="flex items-center justify-between gap-3.5 rounded-[10px] border-[1.5px] border-[#222222] px-3.5 py-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-[#222222]">
              Usa la {step.suggestedForAll.name} per tutte e {pendingFollow.length}
            </div>
            <div className="mt-0.5 text-[11.5px] font-medium text-[#767676]">
              È libera in tutte le date in conflitto
            </div>
          </div>
          <button
            type="button"
            onClick={onApplyToAll}
            className="shrink-0 cursor-pointer whitespace-nowrap rounded-full bg-[#222222] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-black"
          >
            Applica a tutte
          </button>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold text-[#555555]">Da sistemare · {conflicts.length}</p>
        <span className="text-[10.5px] font-medium text-[#929292]">
          {anyChoosable
            ? showSuggestion
              ? "oppure scegli data per data"
              : "Scegli un'altra auto"
            : "Serve una decisione"}
        </span>
      </div>

      <div className="space-y-2">
        {conflicts.map((entry) => {
          const answer = choice[entry.index];
          const answered = answer !== undefined;
          const removed = answer === "remove";
          const freeCars = entry.freeFollowCars ?? [];
          const canSwap = entry.conflict?.role === "follow" && freeCars.length > 0;
          // Tinta rossa solo dove non c'e' ancora una risposta: con tutte le
          // righe colorate il rosso smette di voler dire qualcosa.
          const alarming = !answered && !canSwap;
          return (
            <div
              key={entry.index}
              className={cn(
                "rounded-[10px] border bg-white p-2.5 transition-colors",
                alarming ? "border-[#C13515] bg-[#FFF8F7]" : "border-[#dddddd]",
                removed && "opacity-60",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums text-white",
                    removed ? "bg-[#929292]" : "bg-[#222222]",
                  )}
                >
                  {answered ? (
                    <Check className="size-3" strokeWidth={3} aria-label="sistemata" />
                  ) : (
                    entry.index + 1
                  )}
                </span>
                <div className="text-[13px] font-semibold text-[#222222]">
                  {formatSlot(entry.startsAt, entry.endsAt)}
                </div>
              </div>

              {/* Il motivo si legge finche' e' un problema: risolto, sparisce. */}
              {!answered ? (
                <div
                  className={cn(
                    "ml-7 mt-1.5 flex items-start gap-1.5 text-[12px] font-medium",
                    "text-[#C13515]",
                  )}
                >
                  <AlertCircle className="mt-px size-[13px] shrink-0" strokeWidth={2.2} />
                  <span>
                    {canSwap
                      ? `${entry.conflict?.vehicleName ?? "L'auto al seguito"} è già impegnata`
                      : entry.conflict?.role === "follow"
                        ? "Nessuna auto libera a quest'ora"
                        : `${capitalize(entry.conflict?.label ?? "")} — cambiare auto non risolve`}
                  </span>
                </div>
              ) : null}

              {removed ? (
                <div className="ml-7 mt-1.5 flex items-center gap-2.5">
                  <span className="text-[12px] font-medium text-[#767676]">Guida tolta dal gruppo</span>
                  <button
                    type="button"
                    onClick={() => onChoose(entry.index, undefined)}
                    className="cursor-pointer text-[12px] font-semibold text-[#222222] underline underline-offset-2"
                  >
                    Ripristina
                  </button>
                </div>
              ) : canSwap ? (
                <div className="ml-7 mt-2">
                  <Select
                    value={answer === null ? NO_FOLLOW_CAR : (answer ?? "")}
                    onValueChange={(value) =>
                      onChoose(entry.index, value === NO_FOLLOW_CAR ? null : value)
                    }
                  >
                    <SelectTrigger className={SELECT_CLASS} aria-label="Auto al seguito">
                      <SelectValue placeholder="Scegli un'auto libera" />
                    </SelectTrigger>
                    <SelectContent>
                      {freeCars.map((car) => (
                        <SelectItem key={car.id} value={car.id}>
                          {car.name}
                          {car.transmission ? (
                            <span className="text-muted-foreground">
                              {" · "}
                              {TRANSMISSION_LABELS[car.transmission as Transmission] ?? car.transmission}
                            </span>
                          ) : null}
                        </SelectItem>
                      ))}
                      <SelectItem value={NO_FOLLOW_CAR}>Nessuna auto al seguito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : answered ? (
                <div className="ml-7 mt-1.5 text-[12px] font-medium text-[#767676]">
                  Senza auto al seguito
                </div>
              ) : (
                <div className="ml-7 mt-2.5 flex flex-wrap gap-2">
                  {entry.conflict?.role === "follow" ? (
                    <button
                      type="button"
                      onClick={() => onChoose(entry.index, null)}
                      className="cursor-pointer rounded-full border border-[#dddddd] bg-white px-3.5 py-[7px] text-[12px] font-semibold text-[#555555] transition-colors hover:border-[#929292]"
                    >
                      Senza auto al seguito
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onChoose(entry.index, "remove")}
                    className="cursor-pointer rounded-full border border-[#f0c9bf] bg-white px-3.5 py-[7px] text-[12px] font-semibold text-[#C13515] transition-colors hover:bg-[#FFF1F0]"
                  >
                    Togli la guida
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const capitalize = (text: string) =>
  text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
