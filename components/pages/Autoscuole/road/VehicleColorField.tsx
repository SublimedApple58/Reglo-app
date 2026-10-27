"use client";

import { CAR_COLORS, type CarColorKey } from "@/lib/autoscuole/road/car-colors";
import { roadCarImages } from "@/lib/autoscuole/road/symbols";
import { cn } from "@/lib/utils";

/** Pallini chiari: la spunta va scura per restare leggibile. */
const LIGHT = new Set<CarColorKey>(["bianco", "argento", "giallo"]);

/**
 * REG-638 Reglo Road — campo «Colore» della scheda veicolo.
 * null = «Auto»: ogni guida prende la tinta del suo istruttore.
 */
export function VehicleColorField({
  value,
  onChange,
  labelClassName,
}: {
  value: CarColorKey | null;
  onChange: (next: CarColorKey | null) => void;
  labelClassName: string;
}) {
  const current = CAR_COLORS.find((c) => c.key === value) ?? null;
  return (
    <div className="mt-[22px]" data-testid="vehicle-color-field">
      <div className={labelClassName}>Colore</div>
      <p className="-mt-0.5 mb-3.5 text-[12.5px] font-medium leading-normal text-[#929292]">
        Serve a Reglo Road per disegnare l&apos;auto sulla mappa, dal vivo e nell&apos;app degli istruttori.
        «Auto» usa la tinta dell&apos;istruttore della guida.
      </p>
      <div className="mb-2.5 flex flex-wrap gap-2.5" role="radiogroup" aria-label="Colore del veicolo">
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          title="Automatico: tinta dell'istruttore"
          onClick={() => onChange(null)}
          className={cn(
            "grid size-[38px] cursor-pointer place-items-center rounded-full bg-white text-[10px] font-semibold text-[#6a6a6a] transition-shadow",
            value === null
              ? "shadow-[0_0_0_2px_#fff,0_0_0_4px_#111111]"
              : "shadow-[inset_0_0_0_1.5px_#dddddd]",
          )}
        >
          Auto
        </button>
        {CAR_COLORS.map((c) => {
          const on = value === c.key;
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={on}
              title={c.label}
              data-testid={`vehicle-color-${c.key}`}
              onClick={() => onChange(c.key)}
              className={cn(
                "grid size-[38px] cursor-pointer place-items-center rounded-full transition-shadow",
                on
                  ? "shadow-[0_0_0_2px_#fff,0_0_0_4px_#111111]"
                  : "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]",
              )}
              style={{ background: c.hex }}
            >
              {on ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    stroke={LIGHT.has(c.key) ? "#111111" : "#ffffff"}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="mb-1 flex items-center gap-4 rounded-[14px] border border-[#eeeeee] px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={roadCarImages(value).threeQuarter}
          alt=""
          className="w-[92px] drop-shadow-[0_6px_8px_rgba(0,0,0,0.18)]"
          draggable={false}
        />
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-foreground">{current ? current.label : "Automatico"}</div>
          <div className="text-[12.5px] font-medium text-[#929292]">
            {current
              ? "Così appare in Road: elenco auto, mappa dal vivo e riepilogo guida."
              : "Ogni guida mostra l'auto nella tinta del suo istruttore."}
          </div>
        </div>
      </div>
    </div>
  );
}
