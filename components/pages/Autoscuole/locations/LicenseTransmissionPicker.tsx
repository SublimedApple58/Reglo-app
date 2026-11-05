"use client";

import { cn } from "@/lib/utils";
import {
  TRANSMISSIONLESS_CATEGORIES,
  type LessonTransmission,
} from "@/lib/autoscuole/location-for-license";

/**
 * «Patenti e cambio» della modale luogo (REG-725, anteprima approvata da
 * Tiziano il 05/11). Sopra la griglia di tasti delle patenti (squadrati, non
 * pillole); sotto, per ogni patente scelta, una riga con il cambio:
 * Entrambi · Manuale · Automatico.
 *
 * Le righe restano sempre nel DOM e si aprono in altezza (grid-rows 0fr→1fr,
 * 260 ms): niente salti quando si accende o spegne un tasto. Il cursore del
 * controllo segmentato scorre in 240 ms. Curva senza overshoot e nessuna
 * eccezione per «Riduci movimento» (regola fissa di Tiziano).
 */

/** Nome breve della patente nella riga del cambio. */
const CATEGORY_NAMES: Record<string, string> = {
  B: "Auto",
  BE: "Auto con rimorchio",
  AMQ: "Quadriciclo leggero",
  B1: "Quadriciclo",
  AM: "Ciclomotore",
  A1: "Moto 125",
  A2: "Moto 35 kW",
  A: "Moto",
  C: "Camion",
  C1: "Camion fino a 7,5 t",
  C1E: "C1 con rimorchio",
  CE: "Camion con rimorchio",
  D: "Autobus",
  D1: "Minibus",
  D1E: "D1 con rimorchio",
  DE: "Autobus con rimorchio",
};

type Choice = "both" | LessonTransmission;
const CHOICES: Array<{ value: Choice; label: string }> = [
  { value: "both", label: "Entrambi" },
  { value: "manual", label: "Manuale" },
  { value: "automatic", label: "Automatico" },
];

const EASE = "ease-[cubic-bezier(0.2,0.7,0.2,1)]";

function otherPlacesLabel(names: readonly string[] | undefined): string {
  if (!names?.length) return "Solo qui";
  if (names.length === 1) return `Anche su ${names[0]}`;
  return `Anche su ${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

export type LicenseTransmissionPickerProps = {
  groups: Array<{ label: string; categories: readonly string[] }>;
  categories: string[];
  transmissions: Record<string, LessonTransmission>;
  onCategoriesChange: (next: string[]) => void;
  onTransmissionsChange: (next: Record<string, LessonTransmission>) => void;
  /** Patente → nomi degli ALTRI luoghi che la fanno (questo escluso). */
  otherPlaces: Record<string, string[]>;
};

export function LicenseTransmissionPicker({
  groups,
  categories,
  transmissions,
  onCategoriesChange,
  onTransmissionsChange,
  otherPlaces,
}: LicenseTransmissionPickerProps) {
  const order = groups.flatMap((g) => g.categories);
  const withGear = order.filter((c) => !TRANSMISSIONLESS_CATEGORIES.includes(c));
  const anyGear = categories.some((c) => withGear.includes(c));
  // La riga sottile tra una patente e l'altra, non sopra la prima visibile.
  const firstShown = withGear.find((c) => categories.includes(c));

  const toggle = (category: string) => {
    if (categories.includes(category)) {
      onCategoriesChange(categories.filter((c) => c !== category));
      if (transmissions[category]) {
        const rest = { ...transmissions };
        delete rest[category];
        onTransmissionsChange(rest);
      }
    } else {
      onCategoriesChange([...categories, category]);
    }
  };

  const choose = (category: string, value: Choice) => {
    const next = { ...transmissions };
    if (value === "both") delete next[category];
    else next[category] = value;
    onTransmissionsChange(next);
  };

  return (
    <>
      <div className="mt-5 flex items-baseline justify-between gap-2.5">
        <div className="text-[13px] font-semibold text-foreground">Patenti e cambio</div>
        {categories.length > 0 && (
          <div className="text-xs font-medium text-[#a3a3a3]" data-testid="location-license-count">
            {categories.length} {categories.length === 1 ? "patente" : "patenti"}
          </div>
        )}
      </div>
      <div className="mt-2 overflow-hidden rounded-[14px] border-[1.5px] border-[#ededed]">
        <div className="flex flex-wrap gap-x-5 gap-y-3.5 px-3.5 pb-3.5 pt-[13px]">
          {groups.map((group) => (
            <div key={group.label} className="min-w-0">
              <div className="mb-1.5 text-[11px] font-medium text-[#a8a8a8]">{group.label}</div>
              <div className="flex flex-wrap gap-[5px]">
                {group.categories.map((category) => {
                  const active = categories.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggle(category)}
                      aria-pressed={active}
                      data-testid={`location-license-${category}`}
                      className={cn(
                        "flex h-[30px] min-w-10 cursor-pointer select-none items-center justify-center rounded-[8px] px-[11px] text-[12.5px] font-semibold transition-[background-color,color,box-shadow] duration-200",
                        EASE,
                        active
                          ? "bg-[#111111] text-white shadow-[0_2px_6px_rgba(17,17,17,0.2)] hover:bg-[#2b2b2b]"
                          : "bg-[#f4f5f7] text-[#5f5f5f] hover:bg-[#e9eaee] hover:text-[#333333]",
                      )}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ── Cambio, una riga per patente scelta ── */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-[260ms]",
            EASE,
            anyGear ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="border-t-[1.5px] border-[#ededed] pb-1.5">
              <div className="flex items-baseline justify-between px-3.5 pb-0.5 pt-3">
                <span className="text-xs font-semibold text-[#444444]">Cambio</span>
                <span className="text-[11.5px] font-medium text-[#a3a3a3]">per ogni patente scelta</span>
              </div>
              {withGear.map((category) => {
                const on = categories.includes(category);
                const value: Choice = transmissions[category] ?? "both";
                const index = CHOICES.findIndex((c) => c.value === value);
                return (
                  <div
                    key={category}
                    aria-hidden={!on}
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-[260ms]",
                      EASE,
                      on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="overflow-hidden">
                      <div
                        className={cn(
                          "flex min-h-[54px] flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5 sm:flex-nowrap",
                          category !== firstShown && "border-t border-[#f2f2f2]",
                        )}
                        data-testid={`location-gear-row-${category}`}
                      >
                        <span className="w-[30px] shrink-0 text-sm font-semibold text-foreground">
                          {category}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-foreground">
                            {CATEGORY_NAMES[category] ?? category}
                          </div>
                          <div className="mt-px text-[11.5px] font-medium leading-[1.35] text-[#a3a3a3]">
                            {otherPlacesLabel(otherPlaces[category])}
                          </div>
                        </div>
                        <div
                          role="radiogroup"
                          aria-label={`Cambio ${category}`}
                          className="relative ml-[42px] grid w-full shrink-0 grid-cols-3 rounded-[9px] bg-[#efeff1] p-0.5 sm:ml-0 sm:w-[228px]"
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "absolute bottom-0.5 left-0.5 top-0.5 w-[calc((100%-4px)/3)] rounded-[7px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.06)] transition-transform duration-[240ms]",
                              EASE,
                            )}
                            style={{ transform: `translateX(${index * 100}%)` }}
                          />
                          {CHOICES.map((choice) => (
                            <button
                              key={choice.value}
                              type="button"
                              role="radio"
                              aria-checked={choice.value === value}
                              tabIndex={on ? 0 : -1}
                              onClick={() => choose(category, choice.value)}
                              data-testid={`location-gear-${category}-${choice.value}`}
                              className={cn(
                                "relative z-[1] h-7 cursor-pointer text-[11.5px] transition-colors duration-200",
                                choice.value === value
                                  ? "font-semibold text-foreground"
                                  : "font-medium text-[#6a6a6a] hover:text-[#333333]",
                              )}
                            >
                              {choice.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-[9px] text-[11.5px] font-medium leading-[1.45] text-[#a3a3a3]">
        Una patente può stare in più luoghi. Creando una guida si precompila il luogo che fa la
        sua patente e il suo cambio.
      </div>
    </>
  );
}
