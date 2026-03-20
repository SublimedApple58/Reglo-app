"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * ResourceCard — card for instructors/vehicles with availability info.
 * Yellow accent strip for availability section.
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
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-white shadow-card transition-shadow hover:shadow-card-primary",
        inactive && "opacity-55",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">
              {name}
            </span>
            {inactive && (
              <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
                {inactiveLabel}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-1 shrink-0">{actions}</div>
        )}
      </div>

      {/* Availability summary */}
      {availabilitySummary && (
        <div className="px-4 pb-2 text-[11px] text-muted-foreground">
          {availabilitySummary}
        </div>
      )}

      {/* Slots section — yellow accent */}
      <div className="border-t border-border bg-yellow-50/50 px-4 py-2.5 rounded-b-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {slots ?? (
              <span className="text-xs text-muted-foreground">
                {emptyLabel}
              </span>
            )}
          </div>
          {totalLabel && (
            <span className="shrink-0 text-xs tabular-nums text-yellow-700 font-medium">
              {totalLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * SlotPill — time range pill inside ResourceCard.
 */
export function SlotPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-0.5 text-[11px] font-medium text-yellow-700">
      {children}
    </span>
  );
}

/**
 * ResourceCardAction — icon button for ResourceCard header.
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
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition hover:bg-gray-50 hover:text-foreground"
    >
      {children}
    </button>
  );
}
