"use client";

import { useEffect, useState, useTransition } from "react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DatePickerInput } from "@/components/ui/date-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  archiveRecurringExpense,
  payRecurringExpense,
  saveRecurringExpense,
} from "@/lib/actions/finance.actions";
import type { RecurringExpenseRow } from "@/lib/finance/finance-data";
import {
  CADENCE_LABEL,
  VAT_RATE_OPTIONS,
  monthlyEquivalentCents,
  parseEuroToCents,
  vatPortionCents,
  type RecurringCadence,
} from "@/lib/finance/finance-math";

import type { FinanceCategoryOption } from "./FinanceEntrySheet";
import { Field, FinButton, Segmented, euroSmart, fullDate, inputClass } from "./finance-ui";

const centsToInput = (cents: number) =>
  (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: cents % 100 ? 2 : 0 });

type Draft = {
  name: string;
  categoryId: string;
  amount: string;
  vat: string;
  cadence: RecurringCadence;
  dayOfMonth: string;
  startsOn: string;
  endsOn: string;
  notes: string;
};

export function RecurringExpenseSheet({
  open,
  onOpenChange,
  expense,
  today,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: RecurringExpenseRow | null;
  today: string;
  categories: FinanceCategoryOption[];
  onSaved: () => void;
}) {
  const toast = useFeedbackToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const blank = (): Draft => ({
    name: "",
    categoryId: categories.find((c) => !c.archived)?.id ?? "",
    amount: "",
    vat: "null",
    cadence: "monthly",
    dayOfMonth: today.slice(8, 10).replace(/^0/, ""),
    startsOn: today,
    endsOn: "",
    notes: "",
  });
  const [draft, setDraft] = useState<Draft>(blank);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(
      expense
        ? {
            name: expense.name,
            categoryId: expense.categoryId,
            amount: centsToInput(expense.amountCents),
            vat: expense.vatRateBps === null ? "null" : String(expense.vatRateBps),
            cadence: expense.cadence,
            dayOfMonth: String(expense.dayOfMonth),
            startsOn: expense.startsOn,
            endsOn: expense.endsOn ?? "",
            notes: expense.notes ?? "",
          }
        : blank(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const cents = parseEuroToCents(draft.amount);
  const day = Number(draft.dayOfMonth);

  const handleSave = () => {
    setError(null);
    if (!draft.name.trim()) return setError("Dai un nome alla spesa.");
    if (!cents) return setError("Scrivi un importo valido.");
    if (!Number.isInteger(day) || day < 1 || day > 31) return setError("Giorno del mese tra 1 e 31.");
    startTransition(async () => {
      const res = await saveRecurringExpense({
        id: expense?.id,
        name: draft.name,
        categoryId: draft.categoryId,
        amountCents: cents,
        vatRateBps: draft.vat === "null" ? null : Number(draft.vat),
        cadence: draft.cadence,
        dayOfMonth: day,
        startsOn: draft.startsOn,
        endsOn: draft.endsOn || null,
        notes: draft.notes,
      });
      if (!res.success) return setError(res.message ?? "Salvataggio non riuscito.");
      toast.success({ description: expense ? "Spesa fissa aggiornata." : "Spesa fissa aggiunta." });
      onOpenChange(false);
      onSaved();
    });
  };

  const handleArchive = () => {
    if (!expense) return;
    startTransition(async () => {
      const res = await archiveRecurringExpense({ id: expense.id, archived: !expense.archived });
      if (!res.success) return setError(res.message ?? "Non riuscito.");
      toast.success({
        description: expense.archived ? "Spesa fissa ripristinata." : "Spesa fissa archiviata.",
      });
      onOpenChange(false);
      onSaved();
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-[460px]">
        <div className="border-b border-[#f2f2f3] px-6 pb-4 pt-6">
          <SheetTitle className="text-lg">{expense ? "Modifica spesa fissa" : "Nuova spesa fissa"}</SheetTitle>
          <SheetDescription className="mt-1 text-[13px] text-[#71717a]">
            Non crea movimenti da sola: entra nelle previsioni, e quando la paghi la registri.
          </SheetDescription>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Field label="Nome" htmlFor="rec-name">
            <input
              id="rec-name"
              autoFocus
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Vercel, commercialista, fisso Gabriele…"
              className={inputClass}
            />
          </Field>
          <Field label="Categoria" htmlFor="rec-cat">
            <select
              id="rec-cat"
              value={draft.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              className={inputClass}
            >
              {categories
                .filter((c) => !c.archived || c.id === draft.categoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Ogni quanto">
            <Segmented
              value={draft.cadence}
              onChange={(v) => set("cadence", v)}
              options={(["monthly", "quarterly", "annual"] as const).map((c) => ({
                value: c,
                label: CADENCE_LABEL[c].charAt(0).toUpperCase() + CADENCE_LABEL[c].slice(1),
              }))}
            />
          </Field>
          <div className="grid grid-cols-[1fr_150px] gap-3">
            <Field
              label="Importo per scadenza"
              htmlFor="rec-amount"
              hint={
                cents && draft.cadence !== "monthly"
                  ? `circa ${euroSmart(monthlyEquivalentCents(cents, draft.cadence))} al mese`
                  : cents && draft.vat !== "null" && Number(draft.vat) > 0
                    ? `di cui IVA ${euroSmart(vatPortionCents(cents, Number(draft.vat)))}`
                    : " "
              }
            >
              <div className="relative">
                <input
                  id="rec-amount"
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  placeholder="0"
                  className={`${inputClass} pr-8 text-right text-lg font-semibold tabular-nums`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#a1a1aa]">
                  €
                </span>
              </div>
            </Field>
            <Field label="IVA" htmlFor="rec-vat">
              <select
                id="rec-vat"
                value={draft.vat}
                onChange={(e) => set("vat", e.target.value)}
                className={inputClass}
              >
                <option value="null">Non registrata</option>
                {VAT_RATE_OPTIONS.map((bps) => (
                  <option key={bps} value={String(bps)}>
                    {bps === 0 ? "Senza IVA" : `${bps / 100}%`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Field label="Giorno" htmlFor="rec-day">
              <input
                id="rec-day"
                inputMode="numeric"
                value={draft.dayOfMonth}
                onChange={(e) => set("dayOfMonth", e.target.value.replace(/\D/g, "").slice(0, 2))}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
            <Field label="Dal">
              <DatePickerInput value={draft.startsOn} onChange={(v) => set("startsOn", v)} />
            </Field>
          </div>
          <Field label="Fino al" hint="Vuoto = finché non la archivi.">
            <DatePickerInput
              value={draft.endsOn}
              onChange={(v) => set("endsOn", v)}
              placeholder="Senza scadenza"
            />
          </Field>
          <Field label="Note" htmlFor="rec-notes">
            <textarea
              id="rec-notes"
              rows={2}
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              className={`${inputClass} h-auto resize-none py-2.5`}
            />
          </Field>
          {error ? <p className="text-sm text-[#c2410c]">{error}</p> : null}
        </div>
        <div className="flex items-center gap-2 border-t border-[#f2f2f3] px-6 py-4">
          {expense ? (
            <FinButton variant="ghost" onClick={handleArchive} disabled={isPending} className="px-3">
              {expense.archived ? "Ripristina" : "Archivia"}
            </FinButton>
          ) : null}
          <div className="ml-auto flex gap-2">
            <FinButton variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Annulla
            </FinButton>
            <FinButton onClick={handleSave} disabled={isPending}>
              {isPending ? "Salvo…" : "Salva"}
            </FinButton>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** «Registra pagamento»: crea l'uscita vera per una scadenza. */
export function RecurringPaySheet({
  open,
  onOpenChange,
  expense,
  today,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: RecurringExpenseRow | null;
  today: string;
  onSaved: () => void;
}) {
  const toast = useFeedbackToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!open || !expense) return;
    setError(null);
    setDate(expense.nextOn ?? today);
    setPaidOn(today);
    setAmount(centsToInput(expense.amountCents));
  }, [open, expense, today]);

  const cents = parseEuroToCents(amount);

  const handleSave = () => {
    if (!expense) return;
    setError(null);
    if (!cents) return setError("Scrivi un importo valido.");
    startTransition(async () => {
      const res = await payRecurringExpense({ id: expense.id, date, amountCents: cents, settledOn: paidOn });
      if (!res.success) return setError(res.message ?? "Non riuscito.");
      toast.success({ description: "Pagamento registrato tra i movimenti." });
      onOpenChange(false);
      onSaved();
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-[420px]">
        <div className="border-b border-[#f2f2f3] px-6 pb-4 pt-6">
          <SheetTitle className="text-lg">Registra pagamento</SheetTitle>
          <SheetDescription className="mt-1 text-[13px] text-[#71717a]">
            {expense?.name} · diventa un&apos;uscita pagata in Movimenti.
          </SheetDescription>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Field
            label="Scadenza"
            hint={expense?.nextOn ? `La prossima prevista è il ${fullDate(expense.nextOn)}.` : undefined}
          >
            <DatePickerInput value={date} onChange={setDate} />
          </Field>
          <Field label="Importo pagato" htmlFor="pay-amount" hint="Correggilo se questa volta è diverso.">
            <div className="relative">
              <input
                id="pay-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${inputClass} pr-8 text-right text-lg font-semibold tabular-nums`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#a1a1aa]">
                €
              </span>
            </div>
          </Field>
          <Field label="Pagato il">
            <DatePickerInput value={paidOn} onChange={setPaidOn} />
          </Field>
          {error ? <p className="text-sm text-[#c2410c]">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#f2f2f3] px-6 py-4">
          <FinButton variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Annulla
          </FinButton>
          <FinButton onClick={handleSave} disabled={isPending}>
            {isPending ? "Registro…" : "Registra"}
          </FinButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
