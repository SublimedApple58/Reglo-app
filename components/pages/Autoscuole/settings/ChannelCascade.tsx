"use client";

import * as React from "react";
import { Bell, Check, Info, Mail, MessageCircle } from "lucide-react";

import { InlineToggle } from "@/components/ui/inline-toggle";
import { cn } from "@/lib/utils";

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

const Strong = ({ children }: { children: React.ReactNode }) => (
  <span className="font-semibold text-[#222222]">{children}</span>
);

const Status = ({ on }: { on: boolean }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full py-[3px] pl-2 pr-[9px] text-[11px] font-semibold",
      on ? "bg-[#111111] text-white" : "bg-[#f2f2f2] text-[#777777]",
    )}
  >
    <i className={cn("block size-1.5 rounded-full", on ? "bg-white" : "bg-[#b4b4b4]")} />
    {on ? "Attivo" : "Non disponibile"}
  </span>
);

function Row({
  icon: Icon,
  label,
  dim,
  badge,
  children,
  action,
  first,
}: {
  icon: typeof Bell;
  label: string;
  dim?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
  action: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto] items-center gap-3.5 py-4",
        !first && "border-t border-[#ebebeb]",
      )}
    >
      <div className="min-w-0">
        <div
          className={cn(
            "flex items-center gap-2 text-[15px] font-semibold",
            dim ? "text-[#8a8a8a]" : "text-[#222222]",
          )}
        >
          <Icon
            className={cn("size-[17px] shrink-0", dim && "text-[#b4b4b4]")}
            strokeWidth={2}
          />
          <span>{label}</span>
          {badge}
        </div>
        {children}
      </div>
      {action}
    </div>
  );
}

const Meta = ({ children, small }: { children: React.ReactNode; small?: boolean }) => (
  <div
    className={cn(
      "mt-0.5 font-medium text-[#929292]",
      small ? "text-xs leading-[18px]" : "text-sm leading-5",
    )}
  >
    {children}
  </div>
);

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
    <div>
      <div className="text-[15px] font-semibold text-[#222222]">
        Come avvisiamo allievi e istruttori
      </div>
      <div className="mt-0.5 text-sm font-medium leading-5 text-[#929292]">
        Proviamo i canali in quest&apos;ordine e ci fermiamo al primo che arriva.
      </div>

      <div className="mt-3.5">
        <Row
          first
          icon={Bell}
          label="App Reglo"
          action={
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#222222]">
              <Check className="size-[15px]" strokeWidth={2.4} />
              Sempre inclusa
            </span>
          }
        >
          <Meta>
            {pushReach ? (
              <>
                Gratis · arriva a <Strong>{n(pushReach.reachable)}</Strong> dei tuoi{" "}
                {n(pushReach.total)} allievi
              </>
            ) : (
              "Gratis, per chi ha installato l'app"
            )}
          </Meta>
        </Row>

        <Row
          icon={MessageCircle}
          label="WhatsApp"
          dim={!whatsappReady}
          badge={<Status on={whatsappReady} />}
          action={
            <InlineToggle
              checked={whatsappOn}
              size="lg"
              disabled={disabled || !whatsappReady}
              onChange={() => toggle("whatsapp")}
            />
          }
        >
          {whatsappReady ? (
            <>
              <Meta>
                {whatsappReach ? (
                  <>
                    Per chi non ha l&apos;app · arriva a{" "}
                    <Strong>{n(whatsappReach.reachable)}</Strong> dei {n(whatsappReach.total)}{" "}
                    senza app
                  </>
                ) : (
                  "Per chi non ha l'app"
                )}
              </Meta>
              {whatsapp.state === "ready" && whatsapp.sender ? (
                <Meta small>Dal numero di Reglo, {whatsapp.sender}</Meta>
              ) : null}
            </>
          ) : (
            <Meta>Lo colleghiamo noi: non devi fare niente.</Meta>
          )}
        </Row>

        <Row
          icon={Mail}
          label="Email"
          action={
            <InlineToggle
              checked={emailOn}
              size="lg"
              disabled={disabled}
              onChange={() => toggle("email")}
            />
          }
        >
          <Meta>
            {whatsappReady ? "Per chi non ha né l'app né WhatsApp" : "Per chi non ha l'app"}
          </Meta>
        </Row>
      </div>

      <div className="mt-1 flex items-start gap-2.5 rounded-xl bg-[#f7f7f7] px-3.5 py-3 text-[13px] leading-[19px] text-[#555555]">
        <Info className="mt-px size-4 shrink-0" strokeWidth={2} />
        <div>
          Ogni persona riceve il messaggio{" "}
          <span className="font-semibold text-[#222222]">una volta sola</span>. Gli inviti
          alle guide di gruppo e i posti liberi arrivano solo come notifica dell&apos;app.
        </div>
      </div>
    </div>
  );
}
