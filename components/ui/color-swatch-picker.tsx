"use client";

import React from "react";
import { Check, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  INSTRUCTOR_COLOR_CHOICES,
  instructorColorAlpha,
} from "@/lib/autoscuole/instructor-colors";
import { cn } from "@/lib/utils";

/**
 * ColorSwatchPicker — our own color picker (no native browser input): a 7x7
 * icon-button trigger (ResourceCardAction-styled) showing the current color as
 * a dot, opening a curated swatch grid + an "Automatico" reset row.
 *
 * `value` null = automatic (client falls back to the positional palette).
 * `onSelect` is awaited: the trigger shows a spinner until the save resolves.
 */
export function ColorSwatchPicker({
  value,
  onSelect,
  title = "Colore",
  className,
}: {
  value: string | null | undefined;
  onSelect: (hex: string | null) => Promise<void> | void;
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const pick = async (hex: string | null) => {
    setOpen(false);
    setSaving(true);
    try {
      await onSelect(hex);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={title}
          disabled={saving}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition hover:bg-gray-50 hover:text-foreground",
            className,
          )}
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : value ? (
            <span
              className="size-3.5 rounded-full border border-black/10"
              style={{ backgroundColor: value }}
            />
          ) : (
            // Automatic: multi-hue ring hinting "no fixed color yet".
            <span
              className="size-3.5 rounded-full border border-black/10"
              style={{
                background:
                  "conic-gradient(#EC4899, #F59E0B, #10B981, #0EA5E9, #8B5CF6, #EC4899)",
              }}
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[196px] p-2">
        <div className="grid grid-cols-4 gap-1.5">
          {INSTRUCTOR_COLOR_CHOICES.map((choice) => {
            const selected = value?.toUpperCase() === choice.hex.toUpperCase();
            return (
              <button
                key={choice.hex}
                type="button"
                title={choice.name}
                onClick={() => pick(choice.hex)}
                className={cn(
                  "flex h-9 w-full items-center justify-center rounded-lg transition hover:scale-105",
                  selected && "ring-2 ring-offset-1 ring-foreground/40",
                )}
                style={{ backgroundColor: instructorColorAlpha(choice.hex, 0.16) }}
              >
                <span
                  className="flex size-5 items-center justify-center rounded-full"
                  style={{ backgroundColor: choice.hex }}
                >
                  {selected && <Check className="size-3 text-white" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => pick(null)}
          className={cn(
            "mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-gray-50 hover:text-foreground",
            !value && "border-foreground/30 text-foreground",
          )}
        >
          <span
            className="size-3 rounded-full border border-black/10"
            style={{
              background:
                "conic-gradient(#EC4899, #F59E0B, #10B981, #0EA5E9, #8B5CF6, #EC4899)",
            }}
          />
          Automatico
          {!value && <Check className="size-3" />}
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
