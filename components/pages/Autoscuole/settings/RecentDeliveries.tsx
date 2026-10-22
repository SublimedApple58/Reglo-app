"use client";

import * as React from "react";
import { Bell, Mail, MessageCircle, XCircle } from "lucide-react";

import { getRecentDeliveriesAction } from "@/lib/actions/autoscuole-settings.actions";
import type { RecentDelivery } from "@/lib/autoscuole/recent-deliveries";
import { cn } from "@/lib/utils";

/**
 * «Ultimi invii» (REG-500): cosa è partito davvero, e su quale canale.
 *
 * Esiste perché il fallimento era muto: per mesi i WhatsApp non partivano e
 * nessuno lo sapeva. Qui l'autoscuola vede l'esito di ogni messaggio — e, se
 * non è arrivato, il perché detto in parole sue.
 */

const COLLAPSED = 5;

const CHANNEL = {
  push: { icon: Bell, label: "App" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp" },
  email: { icon: Mail, label: "Email" },
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
    <div className="mt-[26px] overflow-hidden rounded-[14px] border border-[#ebebeb]">
      <div className="flex items-center justify-between border-b border-[#ebebeb] px-4 py-3.5">
        <div>
          <div className="text-[15px] font-semibold text-[#222222]">Ultimi invii</div>
          <div className="text-[13px] font-medium text-[#929292]">
            Cosa è partito davvero, e su quale canale
          </div>
        </div>
        {items && items.length > COLLAPSED ? (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-[13px] font-semibold text-[#222222] underline underline-offset-[3px]"
          >
            {expanded ? "Mostra meno" : "Vedi tutti"}
          </button>
        ) : null}
      </div>

      {items === null ? (
        <div className="space-y-2 px-4 py-3.5" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-[#f3f3f3]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-3.5 text-[13px] font-medium text-[#929292]">
          Ancora nessun invio registrato.
        </div>
      ) : (
        visible.map((item, index) => {
          const channel = item.channel ? CHANNEL[item.channel] : null;
          const Icon = channel?.icon ?? XCircle;
          return (
            <div
              key={`${item.at}-${index}`}
              className={cn(
                "grid grid-cols-[54px_1fr_auto] items-center gap-3 px-4 py-[11px] text-[13px]",
                index > 0 && "border-t border-[#f3f3f3]",
              )}
            >
              <div className="font-medium tabular-nums text-[#929292]">{timeLabel(item.at)}</div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-[#222222]">
                  {item.studentName ?? "Allievo"}{" "}
                  <span className="font-medium text-[#929292]">· {item.label}</span>
                </div>
                {item.reason ? (
                  <div className="mt-px text-xs font-medium text-[#929292]">
                    {item.reason.charAt(0).toUpperCase() + item.reason.slice(1)}
                  </div>
                ) : null}
              </div>
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold",
                  channel ? "text-[#222222]" : "text-[#8a8a8a]",
                )}
              >
                <Icon className="size-3.5" strokeWidth={2} />
                {channel?.label ?? "Non arrivato"}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
