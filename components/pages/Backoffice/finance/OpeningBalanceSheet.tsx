"use client";

import { useEffect, useState, useTransition } from "react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DatePickerInput } from "@/components/ui/date-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { saveFinanceOpeningBalance } from "@/lib/actions/finance.actions";
import { parseEuroToCents } from "@/lib/finance/finance-math";

import { Field, FinButton, inputClass } from "./finance-ui";

const centsToInput = (cents: number) =>
  `${cents < 0 ? "−" : ""}${(Math.abs(cents) / 100).toLocaleString("it-IT", {
    minimumFractionDigits: cents % 100 ? 2 : 0,
  })}`;

/** «1.234,50», anche negativo («−1.234» se il conto è in rosso). */
const parseSigned = (input: string) => {
  const trimmed = input.trim();
  const negative = /^[-−]/.test(trimmed);
  const cents = parseEuroToCents(trimmed.replace(/^[-−]\s*/, ""));
  return cents === null ? null : negative ? -cents : cents;
};

export function OpeningBalanceSheet({
  open,
  onOpenChange,
  today,
  balanceCents,
  date,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  balanceCents: number | null;
  date: string | null;
  onSaved: () => void;
}) {
  const toast = useFeedbackToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [on, setOn] = useState(today);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAmount(balanceCents === null ? "" : centsToInput(balanceCents));
    setOn(date ?? today);
  }, [open, balanceCents, date, today]);

  const handleSave = () => {
    setError(null);
    const cents = parseSigned(amount);
    if (cents === null) return setError("Scrivi il saldo del conto, per esempio 12.500 o 12.500,40.");
    if (!on) return setError("Scegli la data del saldo.");
    startTransition(async () => {
      const res = await saveFinanceOpeningBalance({ balanceCents: cents, date: on });
      if (!res.success) return setError(res.message ?? "Non riuscito.");
      toast.success({ description: "Saldo di partenza salvato." });
      onOpenChange(false);
      onSaved();
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-[420px]">
        <div className="border-b border-[#f2f2f3] px-6 pb-4 pt-6">
          <SheetTitle className="text-lg">Saldo di partenza</SheetTitle>
          <SheetDescription className="mt-1 text-[13px] text-[#71717a]">
            Il saldo del conto a una data. Da lì la cassa si aggiorna con ogni incasso e pagamento
            registrato.
          </SheetDescription>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Field label="Saldo del conto" htmlFor="opening-amount" hint="Come da estratto conto. Negativo con il segno meno.">
            <div className="relative">
              <input
                id="opening-amount"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className={`${inputClass} pr-8 text-right text-lg font-semibold tabular-nums`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#a1a1aa]">
                €
              </span>
            </div>
          </Field>
          <Field
            label="Alla data"
            hint="I movimenti incassati o pagati prima di questa data non cambiano la cassa."
          >
            <DatePickerInput value={on} onChange={setOn} />
          </Field>
          {error ? <p className="text-sm text-[#c2410c]">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#f2f2f3] px-6 py-4">
          <FinButton variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Annulla
          </FinButton>
          <FinButton onClick={handleSave} disabled={isPending}>
            {isPending ? "Salvo…" : "Salva saldo"}
          </FinButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
