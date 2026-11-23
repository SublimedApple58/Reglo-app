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
          unico controllo. Si adatta alla larghezza DEL CAMPO (container query,
          non dello schermo): sotto i 440px la fine scende su una riga sua,
          separata da una linea sottile, invece di schiacciare le chip. */}
      {/* REG-776: binario incavato a capsula come i segmentati; quando la
          fine scende su una riga sua il binario resta tondo ma non a capsula. */}
      <div className="@container" data-testid="duration-field">
       <div
        className={cn(
          "flex flex-col rounded-[20px] bg-white shadow-clay-sink @[440px]:flex-row @[440px]:items-center @[440px]:gap-1 @[440px]:rounded-full",
          sm ? "p-[3px]" : "p-1",
        )}
       >
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
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
                  "relative min-w-0 flex-1 cursor-pointer rounded-full font-semibold tabular-nums transition-colors duration-200",
                  sm ? "py-[5px] text-[11.5px]" : "py-[7px] text-[12.5px]",
                  active ? "text-white" : "text-[#8a8a8f] hover:bg-[#f5f5f5] hover:text-[#222222]",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId={`duration-active-${indicatorId}`}
                    className="absolute inset-0 rounded-full bg-[#1e1e1e] shadow-clay-ink-sm"
                    transition={{ type: "tween", duration: 0.22, ease: EASE_OUT }}
                  />
                ) : null}
                <span className="relative">{formatDurationChip(m)}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex shrink-0 items-center justify-between gap-1 border-t border-[#efeff1] pt-1 @[440px]:mt-0 @[440px]:justify-start @[440px]:border-t-0 @[440px]:pt-0">
          <div className="mx-0.5 hidden h-5 w-px shrink-0 bg-[#e6e6e8] @[440px]:block" />
          <span className={cn("pl-2 font-medium text-[#a0a0a5] @[440px]:pl-1", sm ? "text-[11px]" : "text-[12px]")}>
            fine
          </span>
          <TimePickerInput
            freeInput
            value={endTime}
            minTime={minutesToTime(Math.min(startMin + 15, 1440))}
            maxTime="24:00"
            minuteStep={15}
            className={cn(
              "h-auto shrink-0 gap-1.5 rounded-full px-2.5 font-semibold tabular-nums shadow-none transition-colors duration-200 hover:bg-[#f5f5f5]",
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
    </div>
  );
}
