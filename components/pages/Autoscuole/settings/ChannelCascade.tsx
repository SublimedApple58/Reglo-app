"use client";

import * as React from "react";
import { Bell, Check, Mail, MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * "Come avvisiamo i tuoi allievi" — la cascata dei canali (REG-500).
 *
 * Sostituisce nove interruttori indipendenti (tre card × tre canali) con
 * **una domanda sola**. Tre cose la rendono diversa dalla matrice di prima:
 *
 * 1. **Un messaggio, un canale.** Prima tre spunte mandavano tre messaggi allo
 *    stesso allievo; qui si scende la lista e ci si ferma al primo canale
 *    disponibile per quella persona. Meno rumore per l'allievo e, per inciso,
 *    un terzo dei costi su WhatsApp.
 * 2. **I numeri veri accanto a ogni riga.** "Arriva a 863 dei tuoi 1.216
 *    allievi" spiega la scelta meglio di qualunque testo d'aiuto, e rende
 *    evidente perché serve un ripiego.
 * 3. **Un canale non collegato non è spuntabile.** È il bug che ha aperto
 *    REG-500: WhatsApp si poteva accendere anche quando non poteva mandare
 *    niente, e falliva in silenzio.
 */

export type CascadeChannel = "push" | "whatsapp" | "email";

export type ChannelAvailability =
  | { state: "ready" }
  | { state: "not_configured" }
  | { state: "pending" };

export type ChannelReach = { reachable: number; total: number };

export type ChannelCascadeProps = {
  /** Canali attivi, in ordine di priorità. `push` è sempre presente. */
  value: CascadeChannel[];
  onChange: (next: CascadeChannel[]) => void;
  whatsapp: ChannelAvailability;
  /** Numeri reali per riga; omessi, le righe restano senza contatore. */
  reach?: Partial<Record<CascadeChannel, ChannelReach>>;
  onActivateWhatsapp?: () => void;
  disabled?: boolean;
};

const ROWS: Array<{
  key: CascadeChannel;
  label: string;
  icon: typeof Bell;
  fallbackHint: string;
  /** `push` non si spegne: è gratis ed è il canale dell'app. */
  locked?: boolean;
}> = [
  {
    key: "push",
    label: "App Reglo",
    icon: Bell,
    fallbackHint: "Gratis, per chi ha installato l'app",
    locked: true,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    fallbackHint: "Per chi non ha l'app",
  },
  {
    key: "email",
    label: "Email",
    icon: Mail,
    fallbackHint: "Se non abbiamo un numero di telefono",
  },
];

const StateChip = ({ availability }: { availability: ChannelAvailability }) => {
  if (availability.state === "ready") return null;
  const pending = availability.state === "pending";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-[3px] text-[11px] font-semibold",
        pending ? "bg-[#FFF4D6] text-[#8A6100]" : "bg-[#F2F2F2] text-[#777777]",
      )}
    >
      {pending ? "In attivazione" : "Non attivo"}
    </span>
  );
};

export function ChannelCascade({
  value,
  onChange,
  whatsapp,
  reach,
  onActivateWhatsapp,
  disabled,
}: ChannelCascadeProps) {
  const isOn = (key: CascadeChannel) => value.includes(key);

  const toggle = (key: CascadeChannel) => {
    const next = isOn(key) ? value.filter((item) => item !== key) : [...value, key];
    // L'ordine della cascata è quello di ROWS, non quello dei clic.
    onChange(ROWS.map((row) => row.key).filter((key) => next.includes(key)));
  };

  // Si numerano solo i canali accesi, così il numero dice davvero "sei il
  // secondo tentativo", non "sei la seconda riga".
  const rank = (key: CascadeChannel) =>
    value.indexOf(key) >= 0 ? value.indexOf(key) + 1 : null;

  return (
    <div>
      <div className="mb-2.5">
        <div className="text-[13px] font-semibold text-[#222222]">
          Come avvisiamo i tuoi allievi
        </div>
        <div className="mt-0.5 text-xs font-medium text-[#929292]">
          Proviamo i canali in ordine. Ogni allievo riceve il messaggio{" "}
          <span className="font-semibold text-[#555555]">una volta sola</span>, sul
          primo canale disponibile per lui.
        </div>
      </div>

      <ol className="overflow-hidden rounded-[12px] border border-[#e8e8e8] bg-white">
        {ROWS.map((row, index) => {
          const Icon = row.icon;
          const available = row.key !== "whatsapp" || whatsapp.state === "ready";
          const on = isOn(row.key) && available;
          const position = on ? rank(row.key) : null;
          const counts = reach?.[row.key];
          const interactive = !disabled && !row.locked && available;

          return (
            <li
              key={row.key}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                index > 0 && "border-t border-[#f0f0f0]",
                !available && "bg-[#fcfcfc]",
              )}
            >
              {/* Larghezza fissa: accendere o spegnere una riga non deve far
                  saltare l'allineamento di quelle sotto. */}
              <span
                aria-hidden
                className={cn(
                  "flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                  position ? "bg-[#111111] text-white" : "bg-[#f2f2f2] text-[#c4c4c4]",
                )}
              >
                {position ?? "—"}
              </span>

              <Icon
                className={cn("size-[18px] shrink-0", on ? "text-[#222222]" : "text-[#b4b4b4]")}
                strokeWidth={1.9}
                aria-hidden
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-[13.5px] font-semibold",
                      on ? "text-[#222222]" : "text-[#8a8a8a]",
                    )}
                  >
                    {row.label}
                  </span>
                  {row.key === "whatsapp" && <StateChip availability={whatsapp} />}
                  {row.locked && (
                    <span className="rounded-full bg-[#F2F2F2] px-2 py-[3px] text-[11px] font-semibold text-[#777777]">
                      Sempre attiva
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs font-medium text-[#8a8a8a]">
                  {counts
                    ? `Arriva a ${counts.reachable.toLocaleString("it-IT")} dei tuoi ${counts.total.toLocaleString("it-IT")} allievi`
                    : row.fallbackHint}
                </div>
              </div>

              {row.key === "whatsapp" && whatsapp.state === "not_configured" ? (
                <button
                  type="button"
                  onClick={onActivateWhatsapp}
                  disabled={disabled}
                  className="h-[34px] shrink-0 cursor-pointer rounded-[8px] border border-[#e0e0e0] px-3 text-[12.5px] font-semibold text-[#222222] transition-colors duration-200 hover:bg-[#f7f7f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] disabled:opacity-40"
                >
                  Attiva
                </button>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={row.label}
                  disabled={!interactive}
                  onClick={() => toggle(row.key)}
                  className={cn(
                    "relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]",
                    on ? "bg-[#111111]" : "bg-[#e2e2e2]",
                    interactive ? "cursor-pointer" : "cursor-default opacity-55",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-[3px] size-[20px] rounded-full bg-white shadow-sm transition-[left] duration-200",
                      on ? "left-[21px]" : "left-[3px]",
                    )}
                  >
                    {on && (
                      <Check
                        className="absolute inset-0 m-auto size-[12px] text-[#111111]"
                        strokeWidth={3}
                        aria-hidden
                      />
                    )}
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {whatsapp.state === "not_configured" && (
        <p className="mt-2 text-xs font-medium text-[#929292]">
          WhatsApp non è ancora collegato: finché non lo è, non possiamo prometterti
          che i messaggi partano.
        </p>
      )}
    </div>
  );
}
