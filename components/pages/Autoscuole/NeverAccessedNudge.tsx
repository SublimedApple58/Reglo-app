"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

/**
 * Badge "allievo mai loggato" per i blocchi guida in agenda.
 *
 * Un megafono 3D nell'angolo del blocco quando l'allievo non ha mai fatto
 * accesso in app (account creato dal titolare, mai usato → non riceve i
 * promemoria). Squilla come una campanella una volta all'apertura dell'agenda
 * e a ogni hover (rispetta prefers-reduced-motion via la classe .megaphone-ring
 * in globals.css). Il popover appare all'hover, ci si può entrare senza che
 * sparisca (bridge), e si "fissa" cliccando il megafono. Se l'allievo ha un
 * numero → CTA WhatsApp con messaggio precompilato; altrimenti spiega che non
 * lo si può avvisare da qui.
 */

// Appuntamenti già "squillati" in questo caricamento pagina: evita che il badge
// ri-squilli navigando avanti/indietro; il primo mount di ciascuno squilla una
// volta ("quando apro l'agenda"). L'hover ri-squilla sempre.
const rungAppointments = new Set<string>();

function normalizeItalianWaNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("39")) return digits;
  // Numero nazionale (es. "3331234567" o con 0 iniziale) → aggiungi prefisso IT.
  return "39" + digits.replace(/^0+/, "");
}

function buildWhatsAppMessage(name: string, startsAt: string | Date | null): string {
  if (!startsAt) return `Ciao ${name}!`;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return `Ciao ${name}!`;
  const day = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
  const time = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `Ciao ${name}! Ti ricordo la guida di ${day} alle ${time}. A presto!`;
}

/**
 * Indicatore "mai in app" per la lista allievi: cellulare-divieto 3D con
 * tooltip esplicativo all'hover. Statico (nessuna animazione).
 */
export function NeverAccessedListMark({ hasPhone }: { hasPhone: boolean }) {
  return (
    <span className="group relative inline-flex shrink-0 items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/3d/no-phone-3d.png"
        alt="Non ha mai aperto l'app"
        width={22}
        height={22}
        className="drop-shadow-sm"
      />
      <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 w-52 -translate-x-1/2 translate-y-1 rounded-lg bg-[#1a1a2e] px-3 py-2 text-[11.5px] leading-snug text-white opacity-0 shadow-xl transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
        {hasPhone
          ? "Account creato ma mai usato: non riceve i promemoria delle guide. Contattalo tu."
          : "Account creato ma mai usato. Nessun numero registrato: non puoi avvisarlo da qui."}
      </span>
    </span>
  );
}

function WhatsAppGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.5 15.27L2 22l4.86-1.46A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-2.88.86.86-2.8-.2-.31A8.2 8.2 0 1 1 12 20.2Zm4.5-6.13c-.25-.12-1.47-.72-1.7-.8-.23-.09-.4-.13-.56.12-.17.25-.64.8-.79.97-.14.16-.29.18-.54.06a6.7 6.7 0 0 1-3.35-2.93c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.41-.56-.42h-.48c-.16 0-.42.06-.64.31-.22.25-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.47-.6 1.68-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}

export function NeverAccessedNudge({
  appointmentId,
  studentFirstName,
  phone,
  startsAt,
  size = 20,
}: {
  appointmentId: string;
  studentFirstName: string;
  phone?: string | null;
  startsAt?: string | Date | null;
  size?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const ring = React.useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    el.classList.remove("megaphone-ring");
    // forza il reflow così l'animazione si ri-triggera
    void el.offsetWidth;
    el.classList.add("megaphone-ring");
  }, []);

  // Squillo d'apertura: una volta sola per appuntamento in questo caricamento.
  React.useEffect(() => {
    if (rungAppointments.has(appointmentId)) return;
    rungAppointments.add(appointmentId);
    const t = setTimeout(ring, 120);
    return () => clearTimeout(t);
  }, [appointmentId, ring]);

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    if (pinned) return;
    clearClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  const onBadgeEnter = () => {
    clearClose();
    ring();
    setOpen(true);
  };
  const togglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPinned((p) => {
      const next = !p;
      if (next) setOpen(true);
      else scheduleClose();
      return next;
    });
  };

  const waNumber = phone ? normalizeItalianWaNumber(phone) : null;
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
        buildWhatsAppMessage(studentFirstName, startsAt ?? null),
      )}`
    : null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <button
          type="button"
          aria-label={`${studentFirstName} non ha mai aperto l'app — avvisalo`}
          className="relative block cursor-pointer border-0 bg-transparent p-0 leading-none outline-none"
          style={{ width: size, height: size }}
          onMouseEnter={onBadgeEnter}
          onMouseLeave={scheduleClose}
          onClick={togglePin}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src="/images/3d/megafono-3d.png"
            alt=""
            width={size}
            height={size}
            className="block drop-shadow-sm"
            style={{ width: size, height: size }}
          />
          {pinned ? (
            <span className="absolute -bottom-0.5 -right-0.5 h-[9px] w-[9px] rounded-full border-2 border-white bg-amber-500" />
          ) : null}
        </button>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={10}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={() => {
            setPinned(false);
            setOpen(false);
          }}
          onMouseEnter={clearClose}
          onMouseLeave={scheduleClose}
          className="z-50 w-[228px] rounded-2xl border border-border/70 bg-popover p-3 text-popover-foreground shadow-xl"
        >
          <div className="flex items-center gap-2 pr-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/3d/megafono-3d.png" alt="" width={30} height={30} className="shrink-0 drop-shadow-sm" />
            <div className="min-w-0 leading-tight">
              <div className="text-[13.5px] font-semibold tracking-tight">
                {waHref ? `Avvisa ${studentFirstName}!` : `${studentFirstName} non ha l'app`}
              </div>
              <div className="text-[12px] font-medium text-muted-foreground">
                {"Non ha l'app scaricata"}
              </div>
            </div>
          </div>

          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5",
                "text-[13.5px] font-semibold text-white transition-[filter]",
                "bg-[#25D366] hover:brightness-95",
              )}
            >
              <WhatsAppGlyph />
              Scrivi su WhatsApp
            </a>
          ) : (
            <div className="mt-2.5 rounded-xl border border-dashed border-border bg-muted/50 px-2.5 py-2 text-[12px] text-muted-foreground">
              Nessun numero registrato: non puoi avvisarlo da qui.
            </div>
          )}

          {pinned ? (
            <Popover.Close
              aria-label="Chiudi"
              onClick={() => {
                setPinned(false);
                setOpen(false);
              }}
              className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-md bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            >
              <span className="text-[15px] leading-none">×</span>
            </Popover.Close>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
