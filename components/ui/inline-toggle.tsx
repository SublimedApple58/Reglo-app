"use client";

import { cn } from "@/lib/utils";

/**
 * InlineToggle — interruttore «clay» (REG-774, come `ClayToggle` del mobile):
 * binario incavato che si riempie di nero, pallino bianco in rilievo, 200 ms.
 */
export function InlineToggle({
  checked,
  onChange,
  disabled,
  size = "default",
  decorative = false,
}: {
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
  size?: "sm" | "default" | "lg" | "xl";
  /**
   * Solo il disegno, dentro un controllo che fa già da interruttore (un
   * `<button role="switch">` con l'etichetta): uno span nascosto ai lettori,
   * così non c'è un bottone dentro un bottone.
   */
  decorative?: boolean;
}) {
  const trackSize =
    size === "sm" ? "h-4 w-7" : size === "lg" ? "h-[26px] w-11" : size === "xl" ? "h-8 w-[52px]" : "h-5 w-9";
  const thumbSize =
    size === "sm" ? "h-3 w-3" : size === "lg" ? "h-5 w-5" : size === "xl" ? "h-[26px] w-[26px]" : "h-4 w-4";
  const translate =
    size === "sm"
      ? checked ? "translate-x-[13px]" : "translate-x-[2px]"
      : size === "lg"
        ? checked ? "translate-x-[21px]" : "translate-x-[3px]"
        : size === "xl"
          ? checked ? "translate-x-[23px]" : "translate-x-[3px]"
          : checked ? "translate-x-[18px]" : "translate-x-[2px]";

  const trackClass = cn(
    "relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-out",
    trackSize,
    checked
      ? "bg-[#111111] shadow-[inset_0_2px_4px_rgba(0,0,0,0.45)]"
      : "bg-[#e9e9e9] shadow-clay-sink",
    disabled && "pointer-events-none opacity-40",
  );
  const thumb = (
    <span
      className={cn(
        "absolute rounded-full bg-white shadow-clay-thumb transition-transform duration-200 ease-out",
        thumbSize,
        translate,
      )}
    />
  );

  if (decorative) {
    return (
      <span aria-hidden className={trackClass}>
        {thumb}
      </span>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={trackClass}
    >
      {thumb}
    </button>
  );
}
