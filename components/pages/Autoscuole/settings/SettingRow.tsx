"use client";

import * as React from "react";

import { InlineToggle } from "@/components/ui/inline-toggle";
import { cn } from "@/lib/utils";

/** Select delle righe impostazione: stessa metrica dei campi incavati (h-11, 14px). */
export const SETTING_SELECT_TRIGGER_CLASS =
  "h-11 max-w-full rounded-[14px] border-0 bg-white px-3.5 text-sm font-medium text-foreground shadow-clay-sink focus:ring-0 focus-visible:shadow-clay-focus data-[state=open]:shadow-clay-focus";

/**
 * Riga setting flat (stile lista Airbnb): titolo 600 + descrizione grigia,
 * toggle grande a destra. Solo il toggle è cliccabile.
 *
 * `stack` (REG-780): sotto i 640px il controllo va a tutta riga sotto il
 * testo, così una select non tronca il valore.
 */
export function SettingRow({
  title,
  titleExtra,
  description,
  checked,
  onToggle,
  control,
  nested,
  stack,
}: {
  title: string;
  titleExtra?: React.ReactNode;
  description: string;
  checked?: boolean;
  onToggle?: () => void;
  /** Sostituisce il toggle (es. select, bottone pausa) */
  control?: React.ReactNode;
  /** Riga annidata sotto un setting padre (spaziatura ridotta) */
  nested?: boolean;
  /** Sotto sm il controllo va sotto il testo, a tutta riga. */
  stack?: boolean;
}) {
  return (
    <div
      className={cn(
        stack
          ? "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          : "flex items-center justify-between gap-6",
        nested && "mt-5",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          {title}
          {titleExtra}
        </div>
        <div className="mt-0.5 max-w-[680px] text-[13.5px] font-medium leading-relaxed text-[#6a6a6a]">
          {description}
        </div>
      </div>
      {control ?? <InlineToggle checked={Boolean(checked)} onChange={onToggle} size="lg" />}
    </div>
  );
}
