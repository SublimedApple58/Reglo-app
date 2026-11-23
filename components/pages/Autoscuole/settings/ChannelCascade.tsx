"use client";

import * as React from "react";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { SettingsRow, SettingsSection } from "@/components/pages/Autoscuole/settings/settings-rows";

/**
 * "Come avvisiamo allievi e istruttori" — la cascata dei canali (REG-500).
 *
 * Una domanda sola, risposta una volta sola: si prova l'app, poi WhatsApp,
 * poi l'email, e ci si ferma al primo che arriva. Il backend fa davvero così
 * (`lib/autoscuole/channel-cascade.ts`): un messaggio, un canale.
 *
 * Disegno approvato da Tiziano il 22/10 (anteprima v2): tre righe separate e
 * pulite, **senza numeri né filo che le colleghi** — l'ordine lo dice la frase
 * sotto il titolo. L'app non ha un interruttore: è sempre inclusa, e un
 * interruttore bloccato si rileggeva come spegnibile.
 *
 * REG-767: righe native del pane (titolo, una riga grigia, controllo), senza
 * icone, pillole «Attivo» né riquadro informativo.
 *
 * WhatsApp non ha un'attivazione per autoscuola: il mittente è **uno solo,
 * di Reglo**. Finché non è collegato la riga è spenta e non accendibile — è il
 * bug che ha aperto REG-500, una casella che prometteva invii impossibili.
 */

export type CascadeChannel = "push" | "whatsapp" | "email";

export type ChannelAvailability =
  | { state: "ready"; sender?: string | null }
  | { state: "not_configured" }
  | { state: "pending" };

export type ChannelReach = { reachable: number; total: number };

export type ChannelCascadeProps = {
  value: CascadeChannel[];
  onChange: (next: CascadeChannel[]) => void;
  whatsapp: ChannelAvailability;
  /**
   * Numeri reali per riga. `whatsapp` è contato fra chi **non** ha l'app: è
   * l'unico pubblico a cui WhatsApp arriva davvero, nella cascata.
   */
  reach?: Partial<Record<CascadeChannel, ChannelReach>>;
  disabled?: boolean;
};

const ORDER: CascadeChannel[] = ["push", "whatsapp", "email"];

const n = (value: number) => value.toLocaleString("it-IT");

export function ChannelCascade({
  value,
  onChange,
  whatsapp,
  reach,
  disabled,
}: ChannelCascadeProps) {
  const whatsappReady = whatsapp.state === "ready";
  const whatsappOn = whatsappReady && value.includes("whatsapp");
  const emailOn = value.includes("email");

  const toggle = (key: CascadeChannel) => {
    const next = value.includes(key)
      ? value.filter((item) => item !== key)
      : [...value, key];
    // L'app c'è sempre: non si può togliere, e l'ordine è quello della cascata.
    onChange(ORDER.filter((k) => k === "push" || next.includes(k)));
  };

  const pushReach = reach?.push;
  const whatsappReach = reach?.whatsapp;

  return (
    <SettingsSection
      title="Canali"
      description="In quest'ordine, fino al primo che arriva. Ognuno riceve il messaggio una volta sola."
      testId="channel-cascade"
    >
      <SettingsRow
        title="App Reglo"
        description={
          pushReach
            ? `Arriva a ${n(pushReach.reachable)} dei tuoi ${n(pushReach.total)} allievi`
            : "Per chi ha installato l'app"
        }
        control={<span className="text-[13.5px] font-medium text-[#6a6a6a]">Sempre</span>}
      />
      <SettingsRow
        title="WhatsApp"
        dim={!whatsappReady}
        description={
          !whatsappReady
            ? "Non ancora collegato: lo colleghiamo noi."
            : whatsappReach
              ? `Per chi non ha l'app: arriva a ${n(whatsappReach.reachable)} dei ${n(whatsappReach.total)}`
              : "Per chi non ha l'app"
        }
        control={
          <InlineToggle
            checked={whatsappOn}
            size="lg"
            disabled={disabled || !whatsappReady}
            onChange={() => toggle("whatsapp")}
          />
        }
      />
      <SettingsRow
        title="Email"
        description={whatsappReady ? "Per chi non ha né l'app né WhatsApp" : "Per chi non ha l'app"}
        control={
          <InlineToggle
            checked={emailOn}
            size="lg"
            disabled={disabled}
            onChange={() => toggle("email")}
          />
        }
      />
    </SettingsSection>
  );
}
