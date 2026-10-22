"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DatePickerInput } from "@/components/ui/date-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { deleteFinanceEntry, saveFinanceEntry } from "@/lib/actions/finance.actions";
import type { FinanceEntryRow } from "@/lib/finance/finance-data";
import {
  DEFAULT_VAT_RATE_BPS,
  VAT_RATE_OPTIONS,
  parseEuroToCents,
  vatPortionCents,
  type FinanceDirection,
  type FinanceStatus,
} from "@/lib/finance/finance-math";

import { Field, FinButton, Segmented, euroSmart, inputClass } from "./finance-ui";

export type FinanceCategoryOption = {
  id: string;
  name: string;
  direction: FinanceDirection;
  archived: boolean;
};

type Draft = {
  direction: FinanceDirection;
  amount: string;
  vat: string; // "null" | bps
  date: string;
  description: string;
  categoryId: string;
  status: FinanceStatus;
  settledOn: string;
  companyId: string;
  invoiceNumber: string;
  notes: string;
};

const centsToInput = (cents: number) =>
  (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: cents % 100 ? 2 : 0 });

const STATUS_LABEL: Record<FinanceDirection, Record<FinanceStatus, string>> = {
  in: { settled: "Incassato", due: "Da incassare", planned: "Previsto" },
  out: { settled: "Pagato", due: "Da pagare", planned: "Previsto" },
};

const STATUS_HINT: Record<FinanceDirection, Record<FinanceStatus, string>> = {
  in: {
    settled: "Soldi già arrivati: conta nelle entrate del mese e nell'IVA da mettere da parte.",
    due: "Fattura emessa, soldi non ancora arrivati.",
    planned: "Entrata attesa, senza fattura.",
  },
  out: {
    settled: "Uscita già pagata.",
    due: "Fattura ricevuta, ancora da pagare.",
    planned: "Uscita attesa.",
  },
};

export function FinanceEntrySheet({
  open,
  onOpenChange,
  entry,
  defaultDate,
  categories,
  companies,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: FinanceEntryRow | null;
  defaultDate: string;
  categories: FinanceCategoryOption[];
  companies: Array<{ id: string; name: string }>;
  onSaved: () => void;
}) {
  const toast = useFeedbackToast();
  const fromSales = Boolean(entry?.salesDealId || entry?.salesAgentId);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const blank = (direction: FinanceDirection): Draft => ({
    direction,
    amount: "",
    vat: direction === "in" ? String(DEFAULT_VAT_RATE_BPS) : "null",
    date: defaultDate,
    description: "",
    categoryId: categories.find((c) => c.direction === direction && !c.archived)?.id ?? "",
    status: "settled",
    settledOn: "",
    companyId: "",
    invoiceNumber: "",
    notes: "",
  });

  const [draft, setDraft] = useState<Draft>(() => blank("in"));

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    setDraft(
      entry
        ? {
            direction: entry.direction,
            amount: centsToInput(entry.amountCents),
            vat: entry.vatRateBps === null ? "null" : String(entry.vatRateBps),
            date: entry.date,
            description: entry.description,
            categoryId: entry.categoryId,
            status: entry.status,
            settledOn: entry.settledOn ?? "",
            companyId: entry.companyId ?? "",
            invoiceNumber: entry.invoiceNumber ?? "",
            notes: entry.notes ?? "",
          }
        : blank("in"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const switchDirection = (direction: FinanceDirection) =>
    setDraft((d) => ({
      ...d,
      direction,
      vat: direction === "in" ? String(DEFAULT_VAT_RATE_BPS) : "null",
      categoryId: categories.find((c) => c.direction === direction && !c.archived)?.id ?? "",
      companyId: direction === "in" ? d.companyId : "",
    }));

  const cents = parseEuroToCents(draft.amount);
  const vatBps = draft.vat === "null" ? null : Number(draft.vat);
  const vatCents = cents ? vatPortionCents(cents, vatBps) : 0;
  const categoryOptions = useMemo(
    () =>
      categories.filter(
        (c) => c.direction === draft.direction && (!c.archived || c.id === draft.categoryId),
      ),
    [categories, draft.direction, draft.categoryId],
  );

  const handleSave = () => {
    setError(null);
    if (!cents) return setError("Scrivi un importo valido, per esempio 1.200 o 49,90.");
    if (!draft.description.trim()) return setError("Scrivi una descrizione.");
    if (!draft.categoryId) return setError("Scegli una categoria.");
    startTransition(async () => {
      const res = await saveFinanceEntry({
        id: entry?.id,
        direction: draft.direction,
        amountCents: cents,
        vatRateBps: vatBps,
        date: draft.date,
        description: draft.description,
        categoryId: draft.categoryId,
        status: draft.status,
        settledOn: draft.status === "settled" ? draft.settledOn || draft.date : null,
        companyId: draft.direction === "in" && draft.companyId ? draft.companyId : null,
        invoiceNumber: draft.invoiceNumber,
        notes: draft.notes,
      });
      if (!res.success) return setError(res.message ?? "Salvataggio non riuscito.");
      toast.success({ description: entry ? "Movimento aggiornato." : "Movimento registrato." });
      onOpenChange(false);
      onSaved();
    });
  };

  const handleDelete = () => {
    if (!entry) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startTransition(async () => {
      const res = await deleteFinanceEntry({ id: entry.id });
      if (!res.success) return setError(res.message ?? "Eliminazione non riuscita.");
      toast.success({ description: "Movimento eliminato." });
      onOpenChange(false);
      onSaved();
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-[460px]">
        <div className="border-b border-[#f2f2f3] px-6 pb-4 pt-6">
          <SheetTitle className="text-lg">{entry ? "Modifica movimento" : "Nuovo movimento"}</SheetTitle>
          <SheetDescription className="mt-1 text-[13px] text-[#71717a]">
            Importo IVA inclusa, come in fattura.
          </SheetDescription>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {fromSales ? (
            <div className="rounded-xl border border-[#e9e9eb] bg-[#fafafa] px-4 py-3 text-[13px] leading-relaxed text-[#3f3f46]">
              {entry?.salesDealId ? "Pagamento di una commissione" : "Pagamento del fisso di un sales"}: si
              modifica dalla tab Vendite. Da qui si può solo eliminare
              {entry?.salesDealId ? " (il contratto torna «da pagare»)." : "."}
            </div>
          ) : null}
          <Segmented
            value={draft.direction}
            onChange={switchDirection}
            options={[
              { value: "in", label: "Entrata" },
              { value: "out", label: "Uscita" },
            ]}
          />

          <div className="grid grid-cols-[1fr_150px] gap-3">
            <Field
              label="Importo"
              htmlFor="fin-amount"
              hint={cents && vatBps ? `di cui IVA ${euroSmart(vatCents)}` : " "}
            >
              <div className="relative">
                <input
                  id="fin-amount"
                  inputMode="decimal"
                  autoFocus
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
            <Field label="IVA" htmlFor="fin-vat">
              <select
                id="fin-vat"
                value={draft.vat}
                onChange={(e) => set("vat", e.target.value)}
                className={inputClass}
              >
                {VAT_RATE_OPTIONS.map((bps) => (
                  <option key={bps} value={String(bps)}>
                    {bps === 0 ? "Senza IVA" : `${bps / 100}%`}
                  </option>
                ))}
                <option value="null">Non registrata</option>
              </select>
            </Field>
          </div>

          <Field label="Descrizione" htmlFor="fin-desc">
            <input
              id="fin-desc"
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={draft.direction === "in" ? "Canone annuale 2026/27" : "Abbonamento Vercel"}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data">
              <DatePickerInput value={draft.date} onChange={(v) => set("date", v)} />
            </Field>
            <Field label="Categoria" htmlFor="fin-cat">
              <select
                id="fin-cat"
                value={draft.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
                className={inputClass}
              >
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Stato" hint={STATUS_HINT[draft.direction][draft.status]}>
            <Segmented
              value={draft.status}
              onChange={(v) => set("status", v)}
              options={(["settled", "due", "planned"] as const).map((s) => ({
                value: s,
                label: STATUS_LABEL[draft.direction][s],
              }))}
            />
          </Field>

          {draft.status === "settled" ? (
            <Field
              label={draft.direction === "in" ? "Incassato il" : "Pagato il"}
              hint="Se è vuoto vale la data del movimento."
            >
              <DatePickerInput
                value={draft.settledOn}
                onChange={(v) => set("settledOn", v)}
                placeholder="Stessa data del movimento"
              />
            </Field>
          ) : null}

          {draft.direction === "in" ? (
            <div className="grid grid-cols-[1fr_130px] gap-3">
              <Field label="Autoscuola" htmlFor="fin-company">
                <select
                  id="fin-company"
                  value={draft.companyId}
                  onChange={(e) => set("companyId", e.target.value)}
                  className={inputClass}
                >
                  <option value="">Nessuna</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="N. fattura" htmlFor="fin-invoice">
                <input
                  id="fin-invoice"
                  value={draft.invoiceNumber}
                  onChange={(e) => set("invoiceNumber", e.target.value)}
                  placeholder="14/2026"
                  className={inputClass}
                />
              </Field>
            </div>
          ) : null}

          <Field label="Note" htmlFor="fin-notes">
            <textarea
              id="fin-notes"
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className={`${inputClass} h-auto resize-none py-2.5`}
            />
          </Field>

          {error ? <p className="text-sm text-[#c2410c]">{error}</p> : null}
        </div>

        <div className="flex items-center gap-2 border-t border-[#f2f2f3] px-6 py-4">
          {entry ? (
            <FinButton variant="danger" onClick={handleDelete} disabled={isPending} className="px-3">
              {confirmDelete ? "Conferma eliminazione" : "Elimina"}
            </FinButton>
          ) : null}
          <div className="ml-auto flex gap-2">
            <FinButton variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Annulla
            </FinButton>
            <FinButton onClick={handleSave} disabled={isPending || fromSales}>
              {isPending ? "Salvo…" : "Salva"}
            </FinButton>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
