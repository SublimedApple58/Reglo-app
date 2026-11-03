"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { updateAutoscuolaSettings } from "@/lib/actions/autoscuole-settings.actions";
import {
  LOCATION_CHANGE_BUFFER_MAX_MINUTES,
  LOCATION_CHANGE_BUFFER_MIN_MINUTES,
  LOCATION_CHANGE_BUFFER_STEP_MINUTES,
  MIN_LOCATIONS_FOR_AVAILABILITY_BY_LOCATION,
  availabilityByLocationEnabled,
  type LocationAvailabilitySettings,
} from "@/lib/autoscuole/location-availability";

const EASE = "ease-[cubic-bezier(.22,.7,.24,1)]";

/**
 * «Disponibilità per luogo» (REG-705) in fondo a Sede e luoghi, sotto
 * «Luoghi diversi per tipo di patente» e con la stessa forma. Acceso, apre la
 * riga «Pausa tra luoghi diversi» (interruttore + minuti).
 *
 * Con la sola sede la card è spenta e non cliccabile: «per luogo» non vuol dire
 * niente con un luogo solo, e il server la tratta comunque come spenta.
 */
export function LocationAvailabilityCard({
  settings,
  activeLocationCount,
  onSaved,
}: {
  settings: LocationAvailabilitySettings;
  activeLocationCount: number;
  /** Riceve solo i campi salvati, da unire allo stato del genitore. */
  onSaved: (patch: Partial<LocationAvailabilitySettings>) => void;
}) {
  const toast = useFeedbackToast();
  const [local, setLocal] = useState(settings);
  const [saving, setSaving] = useState(false);
  const minutesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lo stato locale è la verità dopo il primo render (la card si monta coi
  // setting già letti): riallinearlo al genitore cancellerebbe i minuti ancora
  // in attesa di salvataggio.
  useEffect(() => () => {
    if (minutesTimer.current) clearTimeout(minutesTimer.current);
  }, []);

  const tooFewLocations = activeLocationCount < MIN_LOCATIONS_FOR_AVAILABILITY_BY_LOCATION;
  const enabled = availabilityByLocationEnabled(local.availabilityByLocation, activeLocationCount);

  // Ogni salvataggio tocca SOLO i suoi campi: due salvataggi vicini (interruttore
  // e poi minuti) non devono riportarsi a vicenda valori vecchi. In errore si
  // ripristinano solo i campi di quel salvataggio.
  const save = async (
    patch: Partial<LocationAvailabilitySettings>,
    revert: Partial<LocationAvailabilitySettings>,
  ) => {
    setSaving(true);
    try {
      const res = await updateAutoscuolaSettings(patch);
      if (!res.success) {
        setLocal((l) => ({ ...l, ...revert }));
        toast.error({ description: res.message ?? "Impossibile salvare." });
        return;
      }
      onSaved(patch);
    } catch {
      setLocal((l) => ({ ...l, ...revert }));
      toast.error({ description: "Errore di rete." });
    } finally {
      setSaving(false);
    }
  };

  const toggleMain = () => {
    if (saving || tooFewLocations) return;
    const next = !enabled;
    setLocal((l) => ({ ...l, availabilityByLocation: next }));
    void save({ availabilityByLocation: next }, { availabilityByLocation: !next });
  };

  const togglePause = () => {
    if (saving) return;
    const next = !local.locationChangeBufferEnabled;
    setLocal((l) => ({ ...l, locationChangeBufferEnabled: next }));
    void save({ locationChangeBufferEnabled: next }, { locationChangeBufferEnabled: !next });
  };

  // I minuti si salvano a pausa nei clic: chi va da 30 a 60 non fa sei salvataggi.
  const stepMinutes = (delta: number) => {
    const value = Math.min(
      LOCATION_CHANGE_BUFFER_MAX_MINUTES,
      Math.max(LOCATION_CHANGE_BUFFER_MIN_MINUTES, local.locationChangeBufferMinutes + delta),
    );
    if (value === local.locationChangeBufferMinutes) return;
    const saved = settings.locationChangeBufferMinutes;
    setLocal((l) => ({ ...l, locationChangeBufferMinutes: value }));
    if (minutesTimer.current) clearTimeout(minutesTimer.current);
    minutesTimer.current = setTimeout(() => {
      void save({ locationChangeBufferMinutes: value }, { locationChangeBufferMinutes: saved });
    }, 500);
  };

  const description = tooFewLocations
    ? "Serve almeno un altro luogo oltre alla sede: aggiungilo in «Altri luoghi guida»."
    : enabled
      ? "Ogni fascia di disponibilità può avere un luogo e vale per gli allievi di quel luogo. Fasce senza luogo e allievi senza luoghi valgono per tutti."
      : "Le disponibilità degli istruttori valgono per tutti gli allievi, in qualunque luogo.";

  return (
    <div
      data-testid="location-availability-card"
      className={cn(
        "rounded-[12px] border border-[#e8e8e8] transition-colors duration-200",
        !tooFewLocations && "hover:border-[#d2d2d2]",
      )}
    >
      {/* div role="switch" e non <button>: dentro c'è il bottone di InlineToggle
          (stesso motivo della riga «Luoghi diversi per tipo di patente»). */}
      <div
        role="switch"
        tabIndex={tooFewLocations ? -1 : 0}
        aria-checked={enabled}
        aria-disabled={tooFewLocations}
        aria-busy={saving}
        onClick={toggleMain}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleMain();
          }
        }}
        className={cn(
          "flex w-full select-none items-start justify-between gap-4 p-5 text-left",
          tooFewLocations ? "cursor-default" : "cursor-pointer",
        )}
      >
        <div className="min-w-0">
          <div className={cn("text-sm font-semibold", tooFewLocations ? "text-[#b0b0b0]" : "text-foreground")}>
            Disponibilità per luogo
          </div>
          <div className="mt-0.5 max-w-[460px] text-xs font-medium leading-[1.5] text-[#929292]">
            {description}
          </div>
        </div>
        <InlineToggle checked={enabled} size="lg" disabled={tooFewLocations} />
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-[260ms]",
          EASE,
          enabled ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "mx-5 flex items-center justify-between gap-4 border-t border-[#f2f2f2] pb-5 pt-[18px] transition-opacity duration-[240ms]",
              EASE,
              enabled ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">Pausa tra luoghi diversi</div>
              <div className="mt-0.5 max-w-[360px] text-xs font-medium leading-[1.5] text-[#929292]">
                Tempo minimo tra due guide dello stesso istruttore in luoghi diversi, per spostarsi.
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3.5">
              <div
                className={cn(
                  "flex h-9 items-center rounded-[10px] bg-[#f7f7f7] transition-opacity duration-200",
                  !local.locationChangeBufferEnabled && "pointer-events-none opacity-35",
                )}
              >
                <button
                  type="button"
                  aria-label="Meno minuti"
                  tabIndex={enabled ? 0 : -1}
                  onClick={() => stepMinutes(-LOCATION_CHANGE_BUFFER_STEP_MINUTES)}
                  className="size-9 cursor-pointer rounded-[10px] text-[18px] font-medium text-foreground transition-colors duration-200 hover:bg-[#ececec]"
                >
                  −
                </button>
                <output
                  data-testid="location-change-buffer-minutes"
                  className="min-w-16 text-center text-sm font-semibold tabular-nums text-foreground"
                >
                  {local.locationChangeBufferMinutes} min
                </output>
                <button
                  type="button"
                  aria-label="Più minuti"
                  tabIndex={enabled ? 0 : -1}
                  onClick={() => stepMinutes(LOCATION_CHANGE_BUFFER_STEP_MINUTES)}
                  className="size-9 cursor-pointer rounded-[10px] text-[18px] font-medium text-foreground transition-colors duration-200 hover:bg-[#ececec]"
                >
                  +
                </button>
              </div>
              <div
                role="switch"
                tabIndex={enabled ? 0 : -1}
                aria-label="Pausa tra luoghi diversi"
                aria-checked={local.locationChangeBufferEnabled}
                onClick={togglePause}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    togglePause();
                  }
                }}
                className="cursor-pointer"
              >
                <InlineToggle checked={local.locationChangeBufferEnabled} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
