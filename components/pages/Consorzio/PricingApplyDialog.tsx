"use client";

import * as React from "react";
import { Info } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/ui/loading-dots";
import type { PricingChange } from "@/lib/consorzio/pricing-change";
import { cn } from "@/lib/utils";

/**
 * "Da quando vale il nuovo prezzo?"
 *
 * Compare solo quando serve: almeno una cifra del listino è cambiata **e**
 * ci sono voci già passate che non hanno ancora un prezzo scritto. Su un
 * listino nuovo, o senza passato da riscrivere, si salva e basta.
 *
 * Nasce dal QA del 23/09: Tiziano ha impostato la tariffa esame a 20 € e si è
 * visto ricalcolare un esame già registrato. Non era un ricalcolo — il prezzo
 * di quell'esame non era mai stato scritto da nessuna parte — ma il risultato
 * per chi guarda è lo stesso, e nessuno l'aveva chiesto.
 */

export type PricingImpact = {
  changes: PricingChange[];
  modeChanged: boolean;
  lessons: number;
  exams: number;
  courses: number;
  total: number;
};

const euro = (value: number): string =>
  Number.isInteger(value) ? `€${value}` : `€${value.toFixed(2)}`;

function formatAmount(change: PricingChange, value: number | null): React.ReactNode {
  if (value === null) {
    // "€0 barrato" racconterebbe una cosa falsa: che qualcuno aveva scelto
    // zero. Una tariffa non impostata non è una tariffa a zero.
    return <span className="font-normal text-[#a8a8a8]">non impostata</span>;
  }
  return change.unit === "pct" ? `${value}%` : euro(value);
}

/** "10 esami e 5 guide", senza le voci che non esistono. */
function describeAffected({ lessons, exams, courses }: PricingImpact): string {
  const parts: string[] = [];
  if (exams) parts.push(`${exams} ${exams === 1 ? "esame" : "esami"}`);
  if (lessons) parts.push(`${lessons} ${lessons === 1 ? "guida" : "guide"}`);
  if (courses) parts.push(`${courses} ${courses === 1 ? "percorso" : "percorsi"}`);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

function Option({
  title,
  description,
  active,
  onSelect,
}: {
  title: string;
  description: React.ReactNode;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 rounded-[14px] border-[1.5px] p-4 text-left transition-colors",
        active
          ? "border-[#222222] bg-[#fafafa] shadow-[0_2px_10px_rgba(0,0,0,0.06)]"
          : "border-[#dddddd] bg-white hover:border-[#bdbdbd] hover:bg-[#fafafa]",
      )}
    >
      <span
        className={cn(
          "relative mt-0.5 size-[18px] shrink-0 rounded-full border-[1.5px] transition-colors",
          active ? "border-[#222222]" : "border-[#cfcfcf]",
        )}
      >
        {active && <span className="absolute inset-[3.5px] rounded-full bg-[#222222]" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-[12.5px] font-medium leading-[1.45] text-[#929292]">
          {description}
        </span>
      </span>
    </button>
  );
}

export function PricingApplyDialog({
  open,
  impact,
  saving,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  impact: PricingImpact | null;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (applyTo: "future" | "past") => void;
}) {
  const [applyTo, setApplyTo] = React.useState<"future" | "past">("future");

  React.useEffect(() => {
    // Il default prudente si ripresenta a ogni apertura: la scelta di
    // riscrivere il passato va rifatta ogni volta, non ereditata.
    if (open) setApplyTo("future");
  }, [open]);

  if (!impact) return null;
  const affected = describeAffected(impact);
  const quante = impact.changes.length + (impact.modeChanged ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Da quando vale il nuovo prezzo?</DialogTitle>
          <DialogDescription>
            Hai cambiato {quante === 1 ? "una voce" : `${quante} voci`} del listino. Decidi se il
            nuovo prezzo vale solo d&apos;ora in poi o anche per quello che è già stato fatto.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-[12px] border-[1.5px] border-[#ededed]">
          {impact.changes.map((change, idx) => (
            <div
              key={change.key}
              className={cn(
                "flex items-center justify-between gap-3 px-3.5 py-2.5",
                idx > 0 && "border-t border-[#f0f0f0]",
              )}
            >
              <span className="text-[13px] font-medium text-[#6a6a6a]">{change.label}</span>
              <span className="text-[13px] font-semibold tabular-nums text-foreground">
                <span className={change.from === null ? undefined : "font-normal text-[#a8a8a8] line-through"}>
                  {formatAmount(change, change.from)}
                </span>
                <span className="mx-1.5 text-[#c1c1c1]">→</span>
                {formatAmount(change, change.to)}
              </span>
            </div>
          ))}
          {impact.modeChanged && (
            <div
              className={cn(
                "flex items-center justify-between gap-3 px-3.5 py-2.5",
                impact.changes.length > 0 && "border-t border-[#f0f0f0]",
              )}
            >
              <span className="text-[13px] font-medium text-[#6a6a6a]">Costo assenza · criterio</span>
              <span className="text-[13px] font-semibold text-foreground">è cambiato</span>
            </div>
          )}
        </div>

        <div className="space-y-2" role="radiogroup">
          <Option
            title="Solo da ora in poi"
            active={applyTo === "future"}
            onSelect={() => setApplyTo("future")}
            description={
              <>
                {affected ? (
                  <>
                    <b className="font-semibold text-[#6a6a6a]">{affected}</b> già
                    {impact.total === 1 ? " passata" : " passate"} restano al prezzo di prima.{" "}
                  </>
                ) : null}
                Il nuovo listino vale da adesso.
              </>
            }
          />
          <Option
            title="Anche alle voci già passate"
            active={applyTo === "past"}
            onSelect={() => setApplyTo("past")}
            description={
              <>
                {affected ? (
                  <>
                    <b className="font-semibold text-[#6a6a6a]">{affected}</b> già
                    {impact.total === 1 ? " passata" : " passate"} e non ancora
                    {impact.total === 1 ? " saldata" : " saldate"} passano al nuovo prezzo.{" "}
                  </>
                ) : null}
                È il comportamento di oggi.
              </>
            }
          />
        </div>

        <p className="flex items-start gap-2 text-[12px] font-medium leading-[1.45] text-[#929292]">
          <Info className="mt-0.5 size-3.5 shrink-0 text-[#a8a8a8]" strokeWidth={2} />
          Le voci <b className="font-semibold text-[#6a6a6a]">già saldate</b> non cambiano mai, in
          nessuno dei due casi.
        </p>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={onCancel}
            className="cursor-pointer"
          >
            Annulla
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => onConfirm(applyTo)}
            className="cursor-pointer"
          >
            {saving ? <LoadingDots /> : "Salva le tariffe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
