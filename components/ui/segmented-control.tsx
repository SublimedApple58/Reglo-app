"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Segmented control rettangolare del redesign Airbnb (stile toggle "Tipo di
 * pianificazione"): track grigio #f4f4f6, opzione attiva = thumb BIANCO
 * rialzato con angoli morbidi (rounded-[8px]) e ombra leggera. Variante non-pill
 * di {@link SegmentedPill}. Segmenti a larghezza contenuto; usa `fluid` per
 * dividerli equamente (flex-1) quando sono pochi e vuoi occupare tutta la barra.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  fluid,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{
    value: T;
    label: React.ReactNode;
    /** Conteggio grigio accanto alla label */
    count?: number;
  }>;
  fluid?: boolean;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex shrink-0 gap-1 rounded-[10px] bg-[#f4f4f6] p-1", className)}
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
              "flex cursor-pointer select-none items-center justify-center gap-1 whitespace-nowrap rounded-[8px] px-3 py-[7px] text-[13px] font-semibold transition-all",
              fluid && "flex-1",
              active
                ? "bg-white text-[#222222] shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                : "bg-transparent text-[#999999] hover:text-[#666666]",
            )}
          >
            {opt.label}
            {opt.count != null && (
              <span className={cn("text-[12px] font-semibold", active ? "text-[#929292]" : "text-[#c1c1c1]")}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
