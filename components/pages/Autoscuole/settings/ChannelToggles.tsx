"use client";

import * as React from "react";
import { Mail } from "lucide-react";

import { cn } from "@/lib/utils";
import { WHATSAPP_GLYPH_PATH } from "@/components/pages/Autoscuole/NeverAccessedNudge";

/**
 * REG-767 — i canali di una comunicazione, sulla sua riga.
 *
 * Solo icone a contorno (variante 1 approvata da Tiziano il 24/11/2026): nere
 * se accese, grigio chiaro se spente, area di tocco da 44px, passaggio di
 * colore in 200ms. Niente cerchi pieni né pillole. La comunicazione parte su
 * tutti e soli i canali accesi; tutti spenti = non parte.
 */

export type ChannelKey = "push" | "whatsapp" | "email";

/** WhatsApp su questa riga: attivabile, senza modello Meta approvato, o non collegato. */
export type WhatsAppAvailability = "ready" | "no_template" | "not_connected";

const ORDER: ChannelKey[] = ["push", "whatsapp", "email"];

/** L'app: un telefono con il puntino della notifica, a contorno come le altre. */
export function AppChannelIcon({
  className,
  strokeWidth = 2,
}: {
  className?: string;
  strokeWidth?: number | string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M14 2.5H8a2.5 2.5 0 0 0-2.5 2.5v14A2.5 2.5 0 0 0 8 21.5h8a2.5 2.5 0 0 0 2.5-2.5v-8" />
      <path d="M11 18h2" />
      <circle cx="18.5" cy="5" r="2.5" />
    </svg>
  );
}

/** Il logo ufficiale di WhatsApp, a un colore (richiesta di Tiziano, 24/11). */
export function WhatsAppChannelIcon({ className }: { className?: string; strokeWidth?: number | string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d={WHATSAPP_GLYPH_PATH} />
    </svg>
  );
}

export const CHANNEL_META: Record<
  ChannelKey,
  { label: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }> }
> = {
  push: { label: "App", Icon: AppChannelIcon },
  whatsapp: { label: "WhatsApp", Icon: WhatsAppChannelIcon },
  email: { label: "Email", Icon: Mail },
};

const WHATSAPP_REASON: Record<Exclude<WhatsAppAvailability, "ready">, string> = {
  no_template: "WhatsApp non ancora disponibile per questo messaggio: il modello è in attesa di approvazione",
  not_connected: "WhatsApp non ancora collegato",
};

/** Un solo canale, nei suoi tre stati. Usato anche dalla legenda. */
export function ChannelIcon({
  channel,
  state,
  size = "row",
}: {
  channel: ChannelKey;
  state: "on" | "off" | "unavailable";
  size?: "row" | "legend";
}) {
  const { Icon } = CHANNEL_META[channel];
  return (
    <span
      className={cn(
        "relative flex items-center justify-center transition-colors duration-200 ease-out",
        state === "on" && "text-[#222222]",
        state === "off" && "text-[#c4c4c4]",
        state === "unavailable" && "text-[#e0e0e0]",
      )}
    >
      <Icon className={size === "row" ? "size-[21px]" : "size-[17px]"} strokeWidth={1.6} />
      {state === "unavailable" ? (
        <span
          aria-hidden
          className={cn(
            "absolute h-[1.6px] -rotate-45 rounded-full bg-[#e0e0e0]",
            size === "row" ? "w-6" : "w-[19px]",
          )}
        />
      ) : null}
    </span>
  );
}

export function ChannelToggles({
  value,
  onChange,
  whatsapp,
  disabled,
  testId,
}: {
  value: readonly ChannelKey[];
  onChange: (next: ChannelKey[]) => void;
  whatsapp: WhatsAppAvailability;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div className="-mx-2.5 flex items-center" data-testid={testId}>
      {ORDER.map((channel) => {
        const unavailable = channel === "whatsapp" && whatsapp !== "ready";
        const on = !unavailable && value.includes(channel);
        const { label } = CHANNEL_META[channel];
        const title = unavailable
          ? WHATSAPP_REASON[whatsapp as Exclude<WhatsAppAvailability, "ready">]
          : `${label}: ${on ? "acceso" : "spento"}`;
        return (
          <button
            key={channel}
            type="button"
            aria-pressed={on}
            aria-label={title}
            title={title}
            disabled={disabled || unavailable}
            data-channel={channel}
            onClick={() =>
              onChange(
                ORDER.filter((key) => (key === channel ? !on : value.includes(key))).filter(
                  (key) => !(key === "whatsapp" && whatsapp !== "ready"),
                ),
              )
            }
            className={cn(
              "group flex size-11 items-center justify-center rounded-full outline-none",
              "transition-transform duration-200 ease-out active:scale-[0.92]",
              "focus-visible:ring-2 focus-visible:ring-[#222222]/15",
              unavailable ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            <ChannelIcon channel={channel} state={unavailable ? "unavailable" : on ? "on" : "off"} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Le righe «Solo app»: l'icona dell'app e la scritta. Se `onToggle` c'è, l'icona
 * accende e spegne la comunicazione; senza, è fissa (partono sempre).
 */
export function AppOnlyToggle({
  on,
  onToggle,
  testId,
}: {
  on: boolean;
  onToggle?: () => void;
  testId?: string;
}) {
  const icon = <ChannelIcon channel="push" state={on ? "on" : "off"} />;
  return (
    <div className="-ml-2.5 flex items-center" data-testid={testId}>
      {onToggle ? (
        <button
          type="button"
          aria-pressed={on}
          aria-label={`App: ${on ? "acceso" : "spento"}`}
          title={`App: ${on ? "acceso" : "spento"}`}
          onClick={onToggle}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full outline-none transition-transform duration-200 ease-out active:scale-[0.92] focus-visible:ring-2 focus-visible:ring-[#222222]/15"
        >
          {icon}
        </button>
      ) : (
        <span className="flex size-11 items-center justify-center" title="App: sempre">
          {icon}
        </span>
      )}
      <span className="whitespace-nowrap text-[13px] font-medium text-[#6a6a6a]">Solo app</span>
    </div>
  );
}
