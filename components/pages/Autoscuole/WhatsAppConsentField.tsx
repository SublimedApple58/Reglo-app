"use client";

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";

/**
 * Consenso agli avvisi WhatsApp, quando è l'autoscuola a inserire il numero al
 * posto dell'allievo (REG-500). Spuntato di default: è la situazione normale
 * di chi lascia il cellulare in segreteria per essere avvisato delle guide.
 * Se l'allievo non vuole, la segreteria toglie la spunta e da Reglo non gli
 * arriva nessun WhatsApp.
 */
export function WhatsAppConsentField({
  id,
  checked,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 pt-1">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        className="mt-[2px]"
      />
      <span className="text-[13px] leading-[18px] text-[#555555]">
        L&apos;allievo accetta di ricevere su WhatsApp gli avvisi sulle sue guide (promemoria,
        spostamenti, annullamenti). Può smettere in qualsiasi momento rispondendo STOP.
      </span>
    </label>
  );
}
