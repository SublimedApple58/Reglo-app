"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Segmentato a capsula. REG-774: come `ClaySegmented` del mobile, binario
 * bianco incavato e cursore nero con volume; misure invariate (padding 7px
 * 14px, 13px 600/500), colori in 200 ms.
 */
export function SegmentedPill<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "default",
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{
    value: T;
    label: React.ReactNode;
    icon?: React.ReactNode;
    /** Conteggio grigio accanto alla label (stile tab Allievi del proto) */
    count?: number;
  }>;
  className?: string;
  /** «sm»: dentro una riga (es. Priorità esame nel dettaglio allievo, REG-775). */
  size?: "default" | "sm";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex shrink-0 rounded-full bg-white p-[3px] shadow-clay-sink",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex cursor-pointer select-none items-center gap-1 whitespace-nowrap rounded-full transition-colors duration-200 ease-out",
              size === "sm" ? "px-3 py-[5px] text-[12.5px]" : "px-3.5 py-[7px] text-[13px]",
              active
                ? "bg-[#1e1e1e] font-semibold text-white shadow-clay-ink"
                : "font-medium text-[#6a6a6a] hover:bg-[#f2f2f2]",
            )}
          >
            {opt.icon}
            {opt.label}
            {opt.count != null && (
              <span
                className={cn(
                  "text-[12px] font-semibold",
                  active ? "text-white/60" : "text-[#b0b0b0]",
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
