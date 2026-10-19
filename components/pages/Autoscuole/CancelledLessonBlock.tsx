"use client";

import React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CalendarX2, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  cancellationNoticeLabel,
  cancelledByLabel,
  isShortNotice,
  lateCancellationLabel,
  type CancelledByRole,
} from "@/lib/autoscuole/cancelled-lesson-blocks";

// ─────────────────────────────────────────────────────────────────────────────
// Blocco "guida annullata" dell'agenda (REG-623). Rigato e tratteggiato, così
// non si confonde con le guide vere né con il grigio pieno dell'assente.
// Passando sopra compare la X (togli dall'agenda); al click si apre il
// riquadro con i dettagli dell'annullamento e «Assegna sostituto».
// Il blocco non sa quando sparire: lo decide findCancelledLessonBlocks, che
// non lo restituisce più appena l'orario è occupato da un'altra guida.
// ─────────────────────────────────────────────────────────────────────────────

export type CancelledLessonInfo = {
  id: string;
  type: string;
  startsAt: string | Date;
  endsAt?: string | Date | null;
  instructor?: { id: string; name: string } | null;
  vehicle?: { id: string; name: string } | null;
  cancelledAt?: string | Date | null;
  cancelledBy?: { name: string | null; role: CancelledByRole } | null;
  lateCancellationAction?: string | null;
  penaltyCutoffAt?: string | Date | null;
  creditRefundedAt?: string | Date | null;
  slotFillOffer?: { sentAt: string | Date; expiresAt: string | Date; declined: number } | null;
};

const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));
const hhmm = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (d: Date) => {
  const s = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const whenLabel = (d: Date) =>
  `${d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}, ${hhmm(d)}`;

/** Fondo rigato: si legge "vuoto" senza sembrare disabilitato. */
const HATCH =
  "repeating-linear-gradient(135deg, rgba(0,0,0,0.045) 0 5px, rgba(255,255,255,0) 5px 10px), #ffffff";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-[7px] text-[12.5px]">
      <span className="shrink-0 text-[#8a8a8a]">{label}</span>
      <span className="min-w-0 text-right font-medium text-[#222222]">{children}</span>
    </div>
  );
}

export function CancelledLessonBlock({
  item,
  studentName,
  studentNameShort,
  typeLabel,
  vehiclesEnabled,
  top,
  height,
  compact,
  dense,
  onDismiss,
  onAssignSubstitute,
}: {
  item: CancelledLessonInfo;
  studentName: string;
  studentNameShort: string;
  typeLabel: string;
  vehiclesEnabled: boolean;
  top: number;
  height: number;
  /** Blocco basso (≤ 40px): una riga sola. */
  compact: boolean;
  /** Colonna stretta della settimana: testi più piccoli. */
  dense: boolean;
  onDismiss: () => void;
  onAssignSubstitute: (anchor: { x: number; y: number }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const blockRef = React.useRef<HTMLButtonElement>(null);
  const start = toDate(item.startsAt);
  const end = item.endsAt ? toDate(item.endsAt) : new Date(start.getTime() + 60 * 60 * 1000);
  const timeRange = `${hhmm(start)} – ${hhmm(end)}`;
  const cancelledAt = item.cancelledAt ? toDate(item.cancelledAt) : null;
  const notice = cancellationNoticeLabel(start, cancelledAt);
  const short = isShortNotice(start, cancelledAt);
  const late = lateCancellationLabel(item.lateCancellationAction);
  // Tardiva ma senza decisione: sta ancora in «Cancellazioni tardive».
  const pendingLate =
    !late &&
    !!cancelledAt &&
    !!item.penaltyCutoffAt &&
    cancelledAt > toDate(item.penaltyCutoffAt) &&
    item.cancelledBy?.role === "student";
  const offer = item.slotFillOffer;
  const offerExpired = offer ? toDate(offer.expiresAt).getTime() < Date.now() : false;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div
          className="group/cancelled absolute left-0.5 right-0.5 z-[11]"
          style={{ top, height }}
          data-cancelled-block={item.id}
        >
          <PopoverPrimitive.Trigger asChild>
            <button
              ref={blockRef}
              type="button"
              aria-label={`Guida annullata · ${studentName} · ${timeRange}`}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex h-full w-full flex-col overflow-hidden rounded-[8px] border-[1.5px] border-dashed text-left transition-[border-color,box-shadow]",
                open
                  ? "border-[#6a6a6a] shadow-[0_6px_18px_rgba(0,0,0,0.10)]"
                  : "border-[#c4c4c4] hover:border-[#8a8a8a]",
                compact ? "px-1 py-0.5" : dense ? "p-1" : "px-2 py-1.5",
              )}
              style={{ background: HATCH }}
            >
              <span
                className={cn(
                  "flex min-w-0 items-center gap-1 font-bold uppercase text-[#8a8a8a]",
                  dense ? "text-[7.5px] tracking-[0.07em]" : "text-[9px] tracking-[0.08em]",
                )}
              >
                <CalendarX2 className={cn("shrink-0", dense ? "size-2.5" : "size-3")} strokeWidth={2.4} aria-hidden />
                <span className="truncate">{compact ? `Annullata · ${studentNameShort}` : "Annullata"}</span>
              </span>
              {!compact && (
                <>
                  <span
                    className={cn(
                      "truncate font-semibold text-[#555555]",
                      dense ? "text-[10px]" : "text-[12px]",
                    )}
                  >
                    {studentNameShort}
                  </span>
                  <span className={cn("truncate tabular-nums text-[#929292]", dense ? "text-[8px]" : "text-[10.5px]")}>
                    {timeRange}
                  </span>
                </>
              )}
            </button>
          </PopoverPrimitive.Trigger>
          <button
            type="button"
            title="Togli dall'agenda"
            aria-label="Togli dall'agenda"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className={cn(
              "absolute right-1 top-1 z-[12] size-[18px] items-center justify-center rounded-full bg-white text-[#6a6a6a] shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-colors hover:bg-[#222222] hover:text-white",
              open ? "hidden" : "hidden group-hover/cancelled:flex",
            )}
          >
            <X className="size-3" strokeWidth={2.6} />
          </button>
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="right"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          onClick={(e) => e.stopPropagation()}
          data-testid="cancelled-lesson-card"
          className="z-[70] w-[320px] rounded-[16px] border border-[#ebebeb] bg-white p-4 shadow-[0_18px_48px_rgba(0,0,0,0.16)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#bdbdbd] px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#6a6a6a]">
              <CalendarX2 className="size-3" strokeWidth={2.4} aria-hidden />
              Guida annullata
            </span>
            <PopoverPrimitive.Close
              aria-label="Chiudi"
              className="flex size-7 cursor-pointer items-center justify-center rounded-full text-[#8a8a8a] transition-colors hover:bg-[#f2f2f2] hover:text-[#222222]"
            >
              <X className="size-4" strokeWidth={2.2} />
            </PopoverPrimitive.Close>
          </div>

          <div className="mt-3">
            <div className="text-[17px] font-bold leading-tight tracking-[-0.2px] text-[#222222]">{studentName}</div>
            <div className="mt-1 text-[13px] text-[#6a6a6a]">
              {dayLabel(start)} · <span className="tabular-nums">{timeRange}</span>
            </div>
          </div>

          <div className="mt-3 divide-y divide-[#f0f0f0] border-y border-[#f0f0f0]">
            <Row label="Istruttore">{item.instructor?.name ?? "—"}</Row>
            {vehiclesEnabled ? <Row label="Veicolo">{item.vehicle?.name ?? "Nessuno"}</Row> : null}
            <Row label="Tipo">{typeLabel}</Row>
          </div>

          <div className="mt-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#a0a0a0]">Annullamento</div>
          <div className="divide-y divide-[#f0f0f0]">
            <Row label="Quando">{cancelledAt ? whenLabel(cancelledAt) : "—"}</Row>
            <Row label="Da chi">{cancelledByLabel(item.cancelledBy)}</Row>
            <Row label="Preavviso">
              <span className="inline-flex items-center gap-1.5">
                {notice ?? "—"}
                {short ? (
                  <span className="rounded-full bg-[#fff1f2] px-1.5 py-[1px] text-[10px] font-semibold text-[#be123c]">
                    meno di 24 ore
                  </span>
                ) : null}
              </span>
            </Row>
            {late ? <Row label="Penale">{late}</Row> : null}
            {pendingLate ? <Row label="Penale">Da decidere in Cancellazioni tardive</Row> : null}
            {item.creditRefundedAt ? <Row label="Credito">Guida restituita all&apos;allievo</Row> : null}
            {offer ? (
              <Row label="Posto">
                {offerExpired
                  ? `Offerto agli allievi, nessuno l'ha preso${offer.declined ? ` (${offer.declined} no)` : ""}`
                  : `Offerto agli allievi alle ${hhmm(toDate(offer.sentAt))}, in attesa`}
              </Row>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              const rect = blockRef.current?.getBoundingClientRect();
              setOpen(false);
              onAssignSubstitute(
                rect
                  ? { x: (rect.left + rect.right) / 2, y: Math.max(80, Math.min(rect.top - 8, window.innerHeight - 420)) }
                  : { x: window.innerWidth / 2, y: 120 },
              );
            }}
            className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-[#222222] px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-black"
          >
            <UserPlus className="size-4" strokeWidth={2.2} />
            Assegna sostituto
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDismiss();
            }}
            className="mt-1.5 w-full cursor-pointer rounded-[10px] px-4 py-2 text-[13px] font-semibold text-[#555555] transition-colors hover:bg-[#f5f5f5] hover:text-[#222222]"
          >
            Togli dall&apos;agenda
          </button>
          <p className="mt-1 text-center text-[11px] leading-snug text-[#a0a0a0]">
            Toglie solo il blocco: la guida resta annullata nello storico.
          </p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
