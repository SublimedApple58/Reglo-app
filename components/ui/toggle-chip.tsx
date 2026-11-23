"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * ToggleChip — chip di scelta a capsula. REG-776: accesa è nera come le altre
 * chip di scelta (tipi guida in agenda), spenta bianca col bordo.
 * Used for day selectors, duration selectors, filter chips.
 */
export function ToggleChip({
  active,
  onClick,
  children,
  size = "default",
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "cursor-pointer rounded-full border font-medium transition-colors duration-200 ease-out",
        size === "sm"
          ? "px-2 py-0.5 text-[11px]"
          : "px-3 py-1.5 text-xs",
        active
          ? "border-transparent bg-[#1e1e1e] font-semibold text-white shadow-clay-ink-sm"
          : "border-border bg-white text-muted-foreground hover:border-[#929292] hover:text-foreground",
        disabled && "pointer-events-none opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}
