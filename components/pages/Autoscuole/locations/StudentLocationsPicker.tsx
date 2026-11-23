"use client";

import { cn } from "@/lib/utils";
import { DetailSection } from "../student-detail-sheet";

const EASE = "ease-[cubic-bezier(.22,.7,.24,1)]";

export type PickerLocation = {
  id: string;
  name: string;
  address: string | null;
  isPrecise: boolean;
};

/**
 * Luoghi dell'allievo nella scheda (REG-705), con «Disponibilità per luogo»
 * accesa. A sinistra dove fa guida (scelta multipla), a destra il principale
 * (REG-392), attivo solo sui luoghi scelti. Nessun luogo = tutti i luoghi.
 *
 * Il componente disegna e basta: salvataggi e stato li tiene la pagina.
 */
export function StudentLocationsPicker({
  locations,
  selectedIds,
  primaryId,
  saving,
  onToggle,
  onSetPrimary,
}: {
  locations: PickerLocation[];
  selectedIds: string[];
  primaryId: string | null;
  saving: boolean;
  onToggle: (locationId: string) => void;
  onSetPrimary: (locationId: string) => void;
}) {
  const selected = new Set(selectedIds);
  const primaryName = locations.find((l) => l.id === primaryId)?.name ?? null;

  return (
    <DetailSection
      title="Luoghi"
      testId="student-locations"
      aside={
        <span data-testid="student-locations-count">
          {selected.size ? `${selected.size} di ${locations.length}` : "Tutti"}
        </span>
      }
      foot={
        selected.size && primaryName ? (
          <>
            Vede solo le disponibilità di questi luoghi.{" "}
            <b className="font-semibold text-[#222222]">{primaryName}</b> è il principale: precompila il
            luogo quando prenoti una guida.
          </>
        ) : (
          "Nessun luogo scelto: vede le disponibilità di tutti i luoghi."
        )
      }
    >
      <div
        className={cn("divide-y divide-[#efefef] transition-opacity duration-200", saving && "opacity-70")}
        aria-busy={saving}
      >
        {locations.map((loc) => {
          const on = selected.has(loc.id);
          const primary = on && primaryId === loc.id;
          return (
            <div key={loc.id} className="flex min-h-[60px] items-center gap-3">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={`${loc.name}: dove fa guida`}
                disabled={saving}
                onClick={() => onToggle(loc.id)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5 rounded-[8px] py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] disabled:cursor-default"
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-[6px] transition-[background-color,box-shadow] duration-[220ms]",
                    EASE,
                    on ? "bg-[#111111] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]" : "bg-white shadow-clay-sink",
                  )}
                >
                  <svg
                    viewBox="0 0 12 12"
                    className={cn(
                      "size-[11px] transition-[opacity,transform] duration-[220ms]",
                      EASE,
                      on ? "scale-100 opacity-100" : "scale-[.6] opacity-0",
                    )}
                    aria-hidden
                  >
                    <path d="M2.5 6.3 5 8.7 9.6 3.5" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium leading-[1.3] text-[#222222]">
                    {loc.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] font-medium text-[#6a6a6a]">
                    {loc.isPrecise && loc.address ? loc.address : "Posizione generica"}
                  </span>
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={primary}
                aria-label={`${loc.name}: principale`}
                disabled={!on || saving}
                onClick={() => onSetPrimary(loc.id)}
                className={cn(
                  "flex w-[68px] shrink-0 cursor-pointer flex-col items-center gap-1 py-2 transition-opacity duration-[220ms] disabled:cursor-default",
                  EASE,
                  !on && "opacity-35",
                )}
              >
                <span className="grid size-5 place-items-center rounded-full bg-white shadow-clay-sink">
                  <i
                    className={cn(
                      "size-2.5 rounded-full bg-[#111111] transition-transform duration-[220ms]",
                      EASE,
                      primary ? "scale-100" : "scale-0",
                    )}
                  />
                </span>
                <span className="text-[11px] font-medium text-[#929292]">Principale</span>
              </button>
            </div>
          );
        })}
      </div>
    </DetailSection>
  );
}
