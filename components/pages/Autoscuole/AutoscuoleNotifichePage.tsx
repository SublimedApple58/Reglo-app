"use client";

import React from "react";
import Image from "next/image";
import { X } from "lucide-react";

import { ComunicatoDialog } from "@/components/Layout/ComunicatoDialog";
import { FadeIn } from "@/components/ui/fade-in";
import { LoadingDots } from "@/components/ui/loading-dots";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  kind: string;
  studentName: string | null;
  startsAt: string | null;
  instructorName: string | null;
  lessonType: string | null;
  read: boolean;
  createdAt: string;
};

const ENDPOINT = "/api/autoscuole/owner-notifications";

const dayFmt = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit",
  minute: "2-digit",
});

/** "dom 20 lug, 15:00" for the cancelled guide. */
function formatGuida(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${dayFmt.format(d)}, ${timeFmt.format(d)}`;
}

/** Compact relative time in Italian: "adesso", "3 ore fa", "ieri", "3 giorni fa". */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "adesso";
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "ora" : "ore"} fa`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ieri";
  return `${days} giorni fa`;
}

function initialsOf(name: string | null): string {
  const t = (name ?? "").trim();
  if (!t) return "·";
  const w = t.split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase() || "·";
}

/**
 * Pagina "Notifiche" (dal menu hamburger) — stile Airbnb.
 * In alto la card "Comunica a tutti" (riusa il ComunicatoDialog esistente),
 * sotto l'elenco degli avvisi ricevuti (annullamenti allievi), con ✕ per riga.
 * Aprire la pagina segna tutte le notifiche come lette (spegne il pallino rosso).
 */
export function AutoscuoleNotifichePage() {
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [comunicatoOpen, setComunicatoOpen] = React.useState(false);

  const loadAndMarkRead = React.useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (payload?.success && payload.data) {
        setItems(payload.data.items ?? []);
        // Aprire la pagina = "prendere atto": segna tutte come lette così il
        // pallino rosso sul menu si spegne.
        if ((payload.data.unreadCount ?? 0) > 0) {
          void fetch(ENDPOINT, { method: "POST" }).catch(() => {});
        }
      }
    } catch {
      // silent — non-blocking
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAndMarkRead();
  }, [loadAndMarkRead]);

  const dismiss = React.useCallback(async (id: string) => {
    // Optimistic: togli la riga subito, poi persisti.
    setItems((prev) => prev.filter((n) => n.id !== id));
    try {
      await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // se fallisce, ricarica lo stato reale
      void loadAndMarkRead();
    }
  }, [loadAndMarkRead]);

  return (
    <FadeIn className="mx-auto w-full max-w-[680px]">
      {/* Titolo pagina */}
      <h1 className="mb-6 text-[30px] font-bold tracking-[-0.5px] text-foreground">
        Notifiche
      </h1>

      {/* Card "Comunica a tutti" — apre il form esistente */}
      <div className="mb-8 flex items-center gap-4 rounded-[18px] border border-border bg-[#f7f7f7] px-5 py-4">
        <Image
          src="/images/menu/bell-gold.png"
          alt=""
          width={52}
          height={52}
          className="h-[52px] w-[52px] shrink-0 object-contain"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold tracking-[-0.2px] text-foreground">
            Comunica a tutti
          </div>
          <p className="mt-0.5 text-[13.5px] font-medium leading-snug text-[#6a6a6a]">
            Invia una notifica agli utenti della tua autoscuola.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setComunicatoOpen(true)}
          className="shrink-0 cursor-pointer rounded-[12px] bg-gradient-to-br from-[#2d2d4a] to-[#1a1a2e] px-5 py-3 text-[14px] font-semibold text-white shadow-[0_6px_18px_rgba(26,26,46,0.35)] transition-opacity hover:opacity-95"
        >
          Invia comunicato
        </button>
      </div>

      {/* Elenco avvisi ricevuti */}
      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingDots className="min-h-[1.5em]" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-5 py-24 text-center">
          <p className="text-[18px] font-semibold text-foreground">
            Ancora nessuna notifica
          </p>
          <p className="mt-2 max-w-[420px] text-[15px] font-medium leading-relaxed text-[#717171]">
            Al momento non hai nessuna notifica. Ti avviseremo non appena ne riceverai una.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((n) => (
            <div
              key={n.id}
              className={cn(
                "group relative flex items-center gap-4 rounded-[14px] px-3 py-4 transition-colors hover:bg-[#f7f7f7]",
                !n.read && "bg-[#fbf8f6]",
              )}
            >
              <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-[#f0f0f0] text-[14px] font-semibold text-[#484848]">
                {initialsOf(n.studentName)}
              </span>
              <div className="min-w-0 flex-1 pr-2">
                <p className="text-[15px] leading-[1.45] text-foreground">
                  <span className="font-semibold">{n.studentName ?? "Un allievo"}</span>{" "}
                  ha annullato la guida di {formatGuida(n.startsAt)}.
                </p>
                <p className="mt-0.5 text-[13px] font-medium text-[#717171]">
                  {relativeTime(n.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(n.id)}
                aria-label="Elimina notifica"
                title="Elimina notifica"
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#717171] transition-colors hover:bg-[#ededed] hover:text-foreground"
              >
                <X className="h-[18px] w-[18px]" strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      <ComunicatoDialog open={comunicatoOpen} onOpenChange={setComunicatoOpen} />
    </FadeIn>
  );
}
