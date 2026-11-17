"use client";

import * as React from "react";
import { motion } from "motion/react";

import { TimePickerInput } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import {
  DURATION_CHIPS,
  durationFromEndTime,
  formatDurationChip,
  minutesToTime,
  timeToMinutes,
} from "@/lib/autoscuole/lesson-duration";

/**
 * Campo «Durata» condiviso: chip di durata rapide OPPURE l'orario di fine
 * (TimePicker). Entrambe le strade aggiornano `durationMin`.
 *
 * Nato per esami e blocchi dentro l'agenda; con REG-757 vale anche per le
 * guide (creazione in agenda, prenotazione multipla, EditAppointmentDialog,
 * ProposeSlotDialog del consorzio), così una guida CQC può durare 3 o 4 ore o
 * finire a un orario qualunque. La fine non supera le 24:00: una guida non
 * scavalca la mezzanotte.
 */

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function DurationField({
  startTime,
  durationMin,
  onDurationChange,
  chips = DURATION_CHIPS,
  label = "Durata",
  labelClassName,
  size = "md",
  disabled = false,
}: {
  startTime: string;
  durationMin: number;
  onDurationChange: (min: number) => void;
  chips?: number[];
  /** null = nessuna etichetta (la mette il contenitore). */
  label?: React.ReactNode | null;
  labelClassName?: string;
  /** "sm" per gli spazi stretti (riga della prenotazione multipla). */
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const indicatorId = React.useId();
  const startMin = timeToMinutes(startTime);
  const endTime = minutesToTime(startMin + durationMin);
  // Durata "custom" = impostata dal picker fine, nessuna chip corrisponde.
  const customDuration = !chips.includes(durationMin);
  const sm = size === "sm";

  return (
    <div className={cn("flex flex-col gap-1.5", disabled && "pointer-events-none opacity-50")}>
      {label !== null ? (
        <div className={cn("text-[13px] font-semibold text-[#6a6a6a]", labelClassName)}>{label}</div>
      ) : null}
      {/* Una cornice sola: chip + divisore + picker "fine" collaborano in un
          unico controllo. Sotto i ~360px le chip vanno a capo invece di
          schiacciarsi. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-1 rounded-[12px] border-[1.5px] border-[#e6e6e8] bg-white p-1",
          sm && "rounded-[10px] border p-[3px]",
        )}
        data-testid="duration-field"
      >
        <div className="flex min-w-0 flex-[1_1_260px] items-center gap-0.5">
          {chips.map((m) => {
            const active = durationMin === m;
            return (
              <button
                key={m}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => onDurationChange(m)}
                className={cn(
                  "relative min-w-0 flex-1 cursor-pointer rounded-[8px] font-semibold tabular-nums transition-colors duration-200",
                  sm ? "py-[5px] text-[11.5px]" : "py-[7px] text-[12.5px]",
                  active ? "text-white" : "text-[#8a8a8f] hover:bg-[#f5f5f5] hover:text-[#222222]",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId={`duration-active-${indicatorId}`}
                    className="absolute inset-0 rounded-[8px] bg-[#222222]"
                    transition={{ type: "tween", duration: 0.22, ease: EASE_OUT }}
                  />
                ) : null}
                <span className="relative">{formatDurationChip(m)}</span>
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="mx-0.5 h-5 w-px shrink-0 bg-[#e6e6e8]" />
          <span className={cn("pl-1 font-medium text-[#a0a0a5]", sm ? "text-[11px]" : "text-[12px]")}>
            fine
          </span>
          <TimePickerInput
            freeInput
            value={endTime}
            minTime={minutesToTime(Math.min(startMin + 15, 1440))}
            maxTime="24:00"
            minuteStep={15}
            className={cn(
              "shrink-0 gap-1.5 border-0 px-2 font-semibold tabular-nums transition-colors duration-200 hover:bg-[#f5f5f5]",
              sm ? "py-[5px] text-[11.5px]" : "py-[7px] text-[12.5px]",
              customDuration ? "bg-[#f2f2f4] text-[#222222]" : "bg-transparent",
            )}
            onChange={(t) => {
              const d = durationFromEndTime(startTime, t);
              if (d) onDurationChange(d);
            }}
          />
        </div>
      </div>
    </div>
  );
}
