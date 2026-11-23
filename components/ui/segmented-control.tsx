"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Segmentato compatto (stile toggle "Tipo di pianificazione"). REG-774: come
 * `ClaySegmented` del mobile, binario bianco incavato e cursore nero con
 * volume, a capsula come {@link SegmentedPill}. Segmenti a larghezza contenuto; usa `fluid` per
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
      className={cn("inline-flex shrink-0 gap-1 rounded-full bg-white p-1 shadow-clay-sink", className)}
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
              "flex cursor-pointer select-none items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 py-[7px] text-[13px] font-semibold transition-colors duration-200 ease-out",
              fluid && "flex-1",
              active
                ? "bg-[#1e1e1e] text-white shadow-clay-ink-sm"
                : "bg-transparent text-[#6a6a6a] hover:text-[#222222]",
            )}
          >
            {opt.label}
            {opt.count != null && (
              <span className={cn("text-[12px] font-semibold", active ? "text-white/60" : "text-[#b0b0b0]")}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
