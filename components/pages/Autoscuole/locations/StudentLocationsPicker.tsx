"use client";

import { cn } from "@/lib/utils";
import { sectionLabelClass } from "../student-detail-ui";

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
    <section className="border-b border-[#f2f2f2] py-7" data-testid="student-locations">
      <p className={cn(sectionLabelClass, "flex items-baseline justify-between")}>
        <span>Luoghi</span>
        <span className="font-medium tabular-nums text-[#b0b0b0]" data-testid="student-locations-count">
          {selected.size ? `${selected.size} di ${locations.length}` : "Tutti"}
        </span>
      </p>

      <div
        className={cn(
          "overflow-hidden rounded-[14px] border border-[#e8e8e8] transition-opacity duration-200",
          saving && "opacity-70",
        )}
        aria-busy={saving}
      >
        <div className="grid grid-cols-[1fr_84px] border-b border-[#f2f2f2] bg-[#fafafa] px-4 py-2.5 text-[11px] font-semibold tracking-[0.01em] text-[#a0a0a0]">
          <span>Dove fa guida</span>
          <span className="text-center">Principale</span>
        </div>
        {locations.map((loc) => {
          const on = selected.has(loc.id);
          const primary = on && primaryId === loc.id;
          return (
            <div
              key={loc.id}
              className={cn(
                "grid min-h-[58px] grid-cols-[1fr_84px] items-center border-b border-[#f2f2f2] px-4 transition-colors duration-200 last:border-b-0 hover:bg-[#fbfbfb]",
                EASE,
              )}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={`${loc.name}: dove fa guida`}
                disabled={saving}
                onClick={() => onToggle(loc.id)}
                className="grid min-w-0 cursor-pointer grid-cols-[28px_1fr] items-center rounded-[6px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] disabled:cursor-default"
              >
                <span
                  className={cn(
                    "grid size-[18px] place-items-center rounded-[5px] border-[1.5px] transition-colors duration-[220ms]",
                    EASE,
                    on ? "border-[#111111] bg-[#111111]" : "border-[#c9c9c9]",
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
                <span className="min-w-0 py-2.5">
                  <span className="block truncate text-[14px] font-medium leading-[1.25] text-[#222222]">
                    {loc.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] font-medium text-[#929292]">
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
                  "grid size-[18px] cursor-pointer place-items-center justify-self-center rounded-full border-[1.5px] transition-[border-color,opacity] duration-[220ms] disabled:cursor-default",
                  EASE,
                  primary ? "border-[#111111]" : "border-[#d6d6d6]",
                  !on && "opacity-30",
                )}
              >
                <i
                  className={cn(
                    "size-2 rounded-full bg-[#111111] transition-transform duration-[220ms]",
                    EASE,
                    primary ? "scale-100" : "scale-0",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-3 px-0.5 text-[12px] font-medium leading-[1.5] text-[#929292]">
        {selected.size && primaryName ? (
          <>
            Vede solo le disponibilità di questi luoghi.{" "}
            <b className="font-semibold text-[#222222]">{primaryName}</b> è il principale: precompila il
            luogo quando prenoti una guida.
          </>
        ) : (
          "Nessun luogo scelto: vede le disponibilità di tutti i luoghi."
        )}
      </p>
    </section>
  );
}
