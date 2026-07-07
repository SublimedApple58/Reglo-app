"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Segmented control a pillola del redesign Airbnb: track #f2f2f2 con bordo
 * chiaro, opzione attiva = thumb bianco con ombra leggera. Valori presi 1:1
 * dal prototipo (padding 7px 14px, radius 50px, 13px 600/500).
 */
export function SegmentedPill<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: React.ReactNode; icon?: React.ReactNode }>;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex shrink-0 rounded-full border-[1.5px] border-[#e0e0e0] bg-[#f2f2f2] p-[3px]",
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
              "flex cursor-pointer select-none items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-[7px] text-[13px] transition-colors",
              active
                ? "bg-white font-semibold text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.10)]"
                : "font-medium text-[#6a6a6a] hover:bg-[#e8e8e8]",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
