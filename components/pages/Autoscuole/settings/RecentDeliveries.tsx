"use client";

import * as React from "react";

import { getRecentDeliveriesAction } from "@/lib/actions/autoscuole-settings.actions";
import type { RecentDelivery } from "@/lib/autoscuole/recent-deliveries";
import { cn } from "@/lib/utils";
import { SettingsSection } from "@/components/pages/Autoscuole/settings/settings-rows";

/**
 * «Ultimi invii» (REG-500): cosa è partito davvero, e su quale canale.
 *
 * Esiste perché il fallimento era muto: per mesi i WhatsApp non partivano e
 * nessuno lo sapeva. Qui l'autoscuola vede l'esito di ogni messaggio — e, se
 * non è arrivato, il perché detto in parole sue.
 *
 * REG-767: lista nativa del pane (niente riquadro), canale scritto in grigio.
 */

const COLLAPSED = 5;

const CHANNEL_LABEL = {
  push: "App",
  whatsapp: "WhatsApp",
  email: "Email",
} as const;

const timeLabel = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })
    : date.toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });
};

export function RecentDeliveries() {
  const [items, setItems] = React.useState<RecentDelivery[] | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void getRecentDeliveriesAction(20).then((res) => {
      if (alive) setItems(res.success ? res.data : []);
    });
    return () => {
      alive = false;
    };
  }, []);

  const visible = items ? (expanded ? items : items.slice(0, COLLAPSED)) : [];

  return (
    <SettingsSection
      title="Ultimi invii"
      testId="recent-deliveries"
      action={
        items && items.length > COLLAPSED ? (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="cursor-pointer text-[13.5px] font-semibold text-[#222222] underline underline-offset-[3px] transition-colors duration-200 hover:text-[#555555]"
          >
            {expanded ? "Mostra meno" : "Vedi tutti"}
          </button>
        ) : null
      }
    >
      {items === null ? (
        <div className="space-y-3 py-4" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-[#f3f3f3]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-4 text-[13.5px] font-medium text-[#929292]">
          Ancora nessun invio.
        </div>
      ) : (
        visible.map((item, index) => (
          <div
            key={`${item.at}-${index}`}
            className="grid grid-cols-[52px_1fr_auto] items-baseline gap-3 py-3 text-[13.5px]"
          >
            <div className="font-medium tabular-nums text-[#929292]">{timeLabel(item.at)}</div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-[#222222]">
                {item.studentName ?? "Allievo"}{" "}
                <span className="font-medium text-[#929292]">· {item.label}</span>
              </div>
              {item.reason ? (
                <div className="mt-px text-[12.5px] font-medium text-[#929292]">
                  {item.reason.charAt(0).toUpperCase() + item.reason.slice(1)}
                </div>
              ) : null}
            </div>
            <div
              className={cn(
                "whitespace-nowrap text-[13px] font-medium",
                item.channel ? "text-[#6a6a6a]" : "text-[#222222]",
              )}
            >
              {item.channel ? CHANNEL_LABEL[item.channel] : "Non arrivato"}
            </div>
          </div>
        ))
      )}
    </SettingsSection>
  );
}
