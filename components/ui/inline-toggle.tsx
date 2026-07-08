"use client";

import { cn } from "@/lib/utils";

/**
 * InlineToggle — iOS-style toggle switch.
 * Navy when on (redesign Airbnb), gray when off.
 */
export function InlineToggle({
  checked,
  onChange,
  disabled,
  size = "default",
}: {
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
  size?: "sm" | "default" | "lg";
}) {
  const trackSize =
    size === "sm" ? "h-4 w-7" : size === "lg" ? "h-[26px] w-11" : "h-5 w-9";
  const thumbSize =
    size === "sm" ? "h-3 w-3" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const translate =
    size === "sm"
      ? checked ? "translate-x-[13px]" : "translate-x-[2px]"
      : size === "lg"
        ? checked ? "translate-x-[21px]" : "translate-x-[3px]"
        : checked ? "translate-x-[18px]" : "translate-x-[2px]";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200",
        trackSize,
        checked ? "bg-navy-900" : "bg-black/15",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <span
        className={cn(
          "absolute rounded-full bg-white shadow-sm transition-transform duration-200",
          thumbSize,
          translate,
        )}
      />
    </button>
  );
}
