"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * ToggleChip — pill-shaped toggle button (active = azzurro proto, redesign Airbnb).
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
        "cursor-pointer rounded-full border font-medium transition-all duration-150",
        size === "sm"
          ? "px-2 py-0.5 text-[11px]"
          : "px-3 py-1.5 text-xs",
        active
          ? "border-[#9fc3f0] bg-[#cfe0fb] font-semibold text-[#1a2b45]"
          : "border-border bg-white text-muted-foreground hover:border-[#929292] hover:text-foreground",
        disabled && "pointer-events-none opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}
