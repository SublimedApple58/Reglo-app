"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * ResourceCard — card istruttori/veicoli nello stile del redesign Airbnb
 * (proto #config-tab-istruttori): hairline #dddddd radius 14, nome 16/700,
 * azioni = icone nude in alto a destra, riga disponibilità grigia, footer
 * con pill navy delle fasce + minuti totali in bold.
 */
export function ResourceCard({
  name,
  subtitle,
  inactive,
  inactiveLabel = "Inattivo",
  actions,
  availabilitySummary,
  slots,
  totalLabel,
  emptyLabel = "Nessuno slot oggi.",
  className,
  testId,
}: {
  name: string;
  subtitle?: React.ReactNode;
  inactive?: boolean;
  inactiveLabel?: string;
  actions?: React.ReactNode;
  availabilitySummary?: React.ReactNode;
  slots?: React.ReactNode;
  totalLabel?: string;
  emptyLabel?: string;
  className?: string;
  /** Optional test hook (e.g. e2e). Rendered as data-testid on the card root. */
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-[14px] border border-[#dddddd] bg-white p-5",
        inactive && "opacity-55",
        className,
      )}
    >
      {/* Header: nome + azioni nude */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-base font-bold text-foreground">
              {name}
            </span>
            {inactive && (
              <span className="shrink-0 rounded-full border border-[#fad4cc] bg-[#fff4f2] px-2 py-0.5 text-[10px] font-semibold text-[#c13515]">
                {inactiveLabel}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="mt-0.5 text-xs font-medium text-[#929292]">
              {subtitle}
            </div>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2.5">{actions}</div>
        )}
      </div>

      {/* Riga disponibilità settimanale */}
      {availabilitySummary && (
        <div className="mb-3.5 text-xs font-medium text-[#929292]">
          {availabilitySummary}
        </div>
      )}

      {/* Footer: pill fasce + minuti totali */}
      {slots ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">{slots}</div>
          {totalLabel && (
            <span className="shrink-0 text-[13px] font-bold tabular-nums text-foreground">
              {totalLabel}
            </span>
          )}
        </div>
      ) : (
        <div className="rounded-[8px] bg-[#f8f8f8] p-3 text-center text-[13px] font-medium text-[#929292]">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

/**
 * SlotPill — pill azzurra della fascia oraria dentro ResourceCard (stile proto).
 */
export function SlotPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[#cfe0fb] bg-[#eaf2fd] px-2.5 py-1 text-xs font-semibold text-[#1a2b45]">
      {children}
    </span>
  );
}

/**
 * ResourceCardAction — icona-azione nuda nell'header della card (stile proto:
 * grigia, diventa scura in hover, nessun box).
 */
export function ResourceCardAction({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex cursor-pointer items-center justify-center text-[#929292] transition-colors hover:text-foreground"
    >
      {children}
    </button>
  );
}
