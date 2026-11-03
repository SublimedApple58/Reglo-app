"use client";

import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RangeLocationOption = {
  id: string;
  name: string;
  address: string | null;
  isPrecise: boolean;
};

/** Pin del luogo, stesso disegno dell'anteprima approvata (REG-705c). */
function PinGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path
        d="M8 14.2s4.6-4.1 4.6-7.6A4.6 4.6 0 0 0 3.4 6.6c0 3.5 4.6 7.6 4.6 7.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="6.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/**
 * Luogo di una fascia di disponibilità (REG-705c): bottone su fondo tenue con
 * pin, nome e chevron; menu con «Tutti i luoghi» in cima e i luoghi con
 * l'indirizzo, spunta su quello scelto. `null` = la fascia vale per tutti i luoghi.
 */
export function RangeLocationSelect({
  value,
  locations,
  onChange,
  disabled,
  label,
}: {
  value: string | null | undefined;
  locations: RangeLocationOption[];
  onChange: (locationId: string | null) => void;
  disabled?: boolean;
  /** Etichetta accessibile, es. «Luogo della fascia 08:00–13:00». */
  label: string;
}) {
  const current = value ? locations.find((l) => l.id === value) ?? null : null;
  const item =
    "flex cursor-pointer items-center justify-between gap-3 rounded-[9px] px-3 py-2.5 text-[14px] font-medium text-[#222222] outline-none transition-colors duration-150 focus:bg-[#f6f6f6] data-[highlighted]:bg-[#f6f6f6]";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={label}
        data-testid="range-location-select"
        className={cn(
          "inline-flex h-10 min-w-0 max-w-[280px] cursor-pointer items-center gap-2 rounded-[10px] bg-[#f7f7f7] px-3 text-[14px] font-medium outline-none transition-colors duration-200 hover:bg-[#efefef] focus-visible:ring-2 focus-visible:ring-[#111111]/15 data-[state=open]:bg-[#efefef] disabled:cursor-default disabled:opacity-50",
          current ? "text-[#222222]" : "text-[#6a6a6a]",
        )}
      >
        <PinGlyph className="size-[15px] shrink-0" />
        <span className="truncate">{current?.name ?? "Tutti i luoghi"}</span>
        <ChevronDown className="size-3 shrink-0" strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="z-[210] w-[290px] rounded-[14px] border-0 bg-white p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_18px_40px_-12px_rgba(0,0,0,0.25)]"
      >
        <DropdownMenuItem className={item} onSelect={() => onChange(null)}>
          <div className="min-w-0">
            <div>Tutti i luoghi</div>
            <div className="mt-px text-[12px] font-medium text-[#9a9a9a]">Vale per ogni allievo</div>
          </div>
          {!current ? <Check className="size-3.5 shrink-0 text-[#111111]" strokeWidth={2.4} /> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="mx-2 my-1 bg-[#f0f0f0]" />
        {locations.map((loc) => (
          <DropdownMenuItem key={loc.id} className={item} onSelect={() => onChange(loc.id)}>
            <div className="min-w-0">
              <div className="truncate">{loc.name}</div>
              <div className="mt-px truncate text-[12px] font-medium text-[#9a9a9a]">
                {loc.isPrecise && loc.address ? loc.address : "Posizione generica"}
              </div>
            </div>
            {current?.id === loc.id ? (
              <Check className="size-3.5 shrink-0 text-[#111111]" strokeWidth={2.4} />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
