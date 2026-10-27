"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { motion } from "motion/react";
import { History, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentHistoryEvent, PaymentHistoryKind } from "@/lib/autoscuole/payment-history";

/**
 * REG-637 — "quando e da chi" sotto le etichette pagamento di una guida, nel
 * tab Guide del dettaglio allievo.
 *
 * - Una riga discreta con l'ultimo gesto: «Segnata pagata · 12 ott, 18:40 ·
 *   Mario Rossi». Compare solo se racconta lo stato ATTUALE: se dopo l'ultimo
 *   gesto la guida è cambiata da sola (annullo, penale) la riga tacerebbe il
 *   vero e la nascondiamo.
 * - Con almeno 2 eventi, «Storico» apre la timeline completa.
 * - Guide senza storico (segnate prima di REG-637): niente, come prima.
 */

const KIND_LABEL: Record<PaymentHistoryKind, string> = {
  paid: "Segnata pagata",
  unpaid: "Segnata da pagare",
  cleared: "Stato pagamento rimosso",
  credit_applied: "Coperta da credito",
  credit_refunded: "Credito restituito",
};

const KIND_DOT: Record<PaymentHistoryKind, string> = {
  paid: "bg-[#1a7f50]",
  unpaid: "bg-[#c9a200]",
  cleared: "bg-[#b0b0b0]",
  credit_applied: "bg-[#7c3aed]",
  credit_refunded: "bg-[#b0b0b0]",
};

const ROME = "Europe/Rome";

const formatWhen = (iso: string, withYear: boolean) => {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: ROME,
  }).format(d);
  const time = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ROME,
  }).format(d);
  return { day: day.replace(".", ""), time };
};

const romeYear = (d: Date) =>
  new Intl.DateTimeFormat("it-IT", { year: "numeric", timeZone: ROME }).format(d);

/** L'ultimo gesto è ancora vero? Altrimenti la riga mentirebbe. */
export const lastEventMatchesState = (
  event: PaymentHistoryEvent,
  state: { manualPaymentStatus: string | null; creditApplied: boolean },
) => {
  switch (event.kind) {
    case "paid":
      return state.manualPaymentStatus === "paid" && !state.creditApplied;
    case "unpaid":
      return state.manualPaymentStatus === "unpaid" && !state.creditApplied;
    case "cleared":
      return state.manualPaymentStatus == null && !state.creditApplied;
    case "credit_applied":
      return state.creditApplied;
    case "credit_refunded":
      return !state.creditApplied;
  }
};

export function LessonPaymentTrail({
  history,
  manualPaymentStatus,
  creditApplied,
  lessonLabel,
}: {
  history: PaymentHistoryEvent[] | undefined;
  manualPaymentStatus: string | null;
  creditApplied: boolean;
  /** Es. «mar 17 set · 16:00», sottotitolo dello storico. */
  lessonLabel: string;
}) {
  if (!history?.length) return null;
  const last = history[0];
  const showLine = lastEventMatchesState(last, { manualPaymentStatus, creditApplied });
  const showHistory = history.length >= 2;
  if (!showLine && !showHistory) return null;

  const thisYear = romeYear(new Date());
  const when = formatWhen(last.at, romeYear(new Date(last.at)) !== thisYear);

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-[18px] text-[#6a6a6a]"
      data-testid="lesson-payment-trail"
    >
      {showLine && (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", KIND_DOT[last.kind])} />
          <span className="font-medium text-[#222222]">{KIND_LABEL[last.kind]}</span>
          <span aria-hidden className="text-[#c4c4c4]">·</span>
          <span className="tabular-nums">
            {when.day}, {when.time}
          </span>
          {last.actorName && (
            <>
              <span aria-hidden className="text-[#c4c4c4]">·</span>
              <span className="truncate">{last.actorName}</span>
            </>
          )}
        </span>
      )}
      {showHistory && (
        <PaymentHistoryPopover history={history} lessonLabel={lessonLabel} thisYear={thisYear} />
      )}
    </div>
  );
}

function PaymentHistoryPopover({
  history,
  lessonLabel,
  thisYear,
}: {
  history: PaymentHistoryEvent[];
  lessonLabel: string;
  thisYear: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          data-testid="lesson-payment-history-trigger"
          className={cn(
            "group inline-flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 -mx-1.5 font-medium text-[#222222] transition-colors hover:bg-[#f2f2f2]",
            open && "bg-[#f2f2f2]",
          )}
        >
          <History className="size-3 text-[#8a8a8a] transition-colors group-hover:text-[#222222]" strokeWidth={2.3} aria-hidden />
          Storico
          <span className="tabular-nums text-[#8a8a8a]">{history.length}</span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          data-testid="lesson-payment-history"
          // z-[210]: sopra il DetailPanel del dettaglio allievo (z-[200]).
          className="z-[210] w-[312px] origin-[var(--radix-popover-content-transform-origin)] rounded-[16px] border border-[#ebebeb] bg-white shadow-[0_18px_48px_rgba(0,0,0,0.14)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold leading-tight tracking-[-0.15px] text-[#222222]">
                Storico pagamento
              </div>
              <div className="mt-1 truncate text-[12.5px] text-[#6a6a6a]">{lessonLabel}</div>
            </div>
            <PopoverPrimitive.Close
              aria-label="Chiudi"
              className="-mr-1 -mt-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#8a8a8a] transition-colors hover:bg-[#f2f2f2] hover:text-[#222222]"
            >
              <X className="size-4" strokeWidth={2.2} />
            </PopoverPrimitive.Close>
          </div>
          <div className="h-px bg-[#f0f0f0]" />
          <ol className="max-h-[320px] overflow-y-auto px-4 py-3">
            {history.map((event, i) => {
              const when = formatWhen(event.at, romeYear(new Date(event.at)) !== thisYear);
              const latest = i === 0;
              const lastItem = i === history.length - 1;
              return (
                <motion.li
                  key={event.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: 0.04 + i * 0.035, ease: [0.22, 1, 0.36, 1] }}
                  className="relative grid grid-cols-[14px_1fr] gap-x-3"
                >
                  <span className="relative flex justify-center">
                    <span
                      aria-hidden
                      className={cn(
                        "relative z-[1] mt-[5px] size-2 rounded-full",
                        latest ? KIND_DOT[event.kind] : "border-[1.5px] border-[#cfcfcf] bg-white",
                        latest && "ring-[3px] ring-white",
                      )}
                    />
                    {!lastItem && (
                      <span aria-hidden className="absolute bottom-[-6px] top-[15px] w-px bg-[#ececec]" />
                    )}
                  </span>
                  <div className={cn("min-w-0", !lastItem && "pb-3.5")}>
                    <div
                      className={cn(
                        "text-[13.5px] leading-[18px]",
                        latest ? "font-semibold text-[#222222]" : "font-medium text-[#3d3d3d]",
                      )}
                    >
                      {KIND_LABEL[event.kind]}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] leading-[17px] text-[#6a6a6a]">
                      <span className="tabular-nums">
                        {when.day} · {when.time}
                      </span>
                      {event.actorName && (
                        <>
                          <span aria-hidden className="mx-1 text-[#c4c4c4]">·</span>
                          {event.actorName}
                        </>
                      )}
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
