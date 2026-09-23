"use client";

import * as React from "react";
import { Bell, Mail, MessageCircle } from "lucide-react";

import { InlineToggle } from "@/components/ui/inline-toggle";
import { cn } from "@/lib/utils";

/**
 * "Come avvisiamo i tuoi allievi" — la cascata dei canali (REG-500).
 *
 * Sostituisce nove interruttori indipendenti (tre card × tre canali) con una
 * domanda sola: si scende la lista e ci si ferma al primo canale disponibile
 * per quella persona. Un messaggio, un canale — prima tre spunte volevano dire
 * tre messaggi allo stesso allievo, e non era scritto da nessuna parte.
 *
 * Stile: righe piatte con `border-b`, `InlineToggle size="lg"`, stessa
 * tipografia di `ReminderBanner` qui sopra. **Niente interruttori inventati per
 * questa pagina**: si riusa quello condiviso di tutta la web app.
 *
 * WhatsApp non ha un'attivazione per autoscuola: il mittente è **uno solo,
 * di Reglo**, collegato una volta a livello di piattaforma. Finché non lo è, la
 * riga è spenta e non accendibile — è il bug che ha aperto REG-500, una casella
 * che prometteva invii impossibili. Il titolare non deve fare niente: quando il
 * mittente è collegato, la riga si accende e basta. (Diverso dalla **voce**, dove
 * ogni autoscuola ha un suo numero e quindi un'attivazione sua.)
 */

export type CascadeChannel = "push" | "whatsapp" | "email";

export type ChannelAvailability =
  | { state: "ready" }
  | { state: "not_configured" }
  | { state: "pending" };

export type ChannelReach = { reachable: number; total: number };

export type ChannelCascadeProps = {
  value: CascadeChannel[];
  onChange: (next: CascadeChannel[]) => void;
  whatsapp: ChannelAvailability;
  /** Numeri reali per riga; omessi, le righe mostrano il testo generico. */
  reach?: Partial<Record<CascadeChannel, ChannelReach>>;
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

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full bg-[#f2f2f2] px-2 py-[3px] text-[11px] font-semibold text-[#777777]">
    {children}
  </span>
);

export function ChannelCascade({
  value,
  onChange,
  whatsapp,
  reach,
  disabled,
}: ChannelCascadeProps) {
  const isAvailable = (key: CascadeChannel) =>
    key !== "whatsapp" || whatsapp.state === "ready";

  const toggle = (key: CascadeChannel) => {
    const next = value.includes(key)
      ? value.filter((item) => item !== key)
      : [...value, key];
    onChange(ROWS.map((row) => row.key).filter((k) => next.includes(k)));
  };

  return (
    <div>
      <div className="mb-1">
        <div className="text-[15px] font-semibold text-[#222222]">
          Come avvisiamo i tuoi allievi
        </div>
        <div className="mt-0.5 text-sm font-medium text-[#929292]">
          Proviamo i canali in ordine. Ogni allievo riceve il messaggio una volta
          sola, sul primo canale disponibile per lui.
        </div>
      </div>

      {ROWS.map((row, index) => {
        const Icon = row.icon;
        const available = isAvailable(row.key);
        const on = value.includes(row.key) && available;
        const counts = reach?.[row.key];

        return (
          <div
            key={row.key}
            className={cn(
              "py-[18px]",
              index < ROWS.length - 1 && "border-b border-[#ebebeb]",
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-[#222222]">
                  <Icon
                    className={cn("size-[17px] shrink-0", !on && "text-[#b4b4b4]")}
                    strokeWidth={2}
                  />
                  <span className={cn(!on && "text-[#8a8a8a]")}>{row.label}</span>
                  {row.locked && <Chip>Sempre attiva</Chip>}
                  {row.key === "whatsapp" && !available && (
                    <Chip>
                      {whatsapp.state === "pending" ? "In attivazione" : "In arrivo"}
                    </Chip>
                  )}
                </div>
                <div className="mt-0.5 text-sm font-medium text-[#929292]">
                  {counts
                    ? `Arriva a ${counts.reachable.toLocaleString("it-IT")} dei tuoi ${counts.total.toLocaleString("it-IT")} allievi`
                    : row.fallbackHint}
                </div>
              </div>

              {row.locked ? (
                // Acceso e non modificabile. NON si passa `disabled`: quello
                // sbiadisce al 40% e si rilegge come spento, che è l'opposto.
                // Si toglie solo l'interazione.
                <span className="pointer-events-none" aria-disabled>
                  <InlineToggle checked size="lg" />
                </span>
              ) : (
                <InlineToggle
                  checked={on}
                  size="lg"
                  disabled={disabled || !available}
                  onChange={() => toggle(row.key)}
                />
              )}
            </div>
          </div>
        );
      })}

      {whatsapp.state !== "ready" && (
        <p className="pt-1 text-sm font-medium text-[#929292]">
          WhatsApp non è ancora attivo su Reglo. Non devi fare niente: quando lo
          collegheremo, questa riga si accenderà da sola.
        </p>
      )}
    </div>
  );
}
