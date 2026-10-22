"use client";

import { useEffect, useState, useTransition } from "react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DatePickerInput } from "@/components/ui/date-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  deleteSalesAgent,
  deleteSalesDeal,
  paySalesFixed,
  saveSalesAgent,
  saveSalesDeal,
} from "@/lib/actions/finance.actions";
import type { SalesAgentRow, SalesDealRow } from "@/lib/finance/finance-data";
import { parseEuroToCents } from "@/lib/finance/finance-math";
import { commissionCentsOf, commissionDueOn } from "@/lib/finance/finance-sales";

import {
  EuroInput,
  Field,
  FinButton,
  Segmented,
  SelectBox,
  bpsToInput,
  centsToInput,
  euroSmart,
  fullDate,
  inputClass,
  monthName,
  parsePercentToBps,
} from "./finance-ui";

/** Autoscuola sceglibile in un contratto, col valore del piano per precompilare. */
export type DealCompanyOption = { id: string; name: string; planAnnualCents: number | null };

function SheetShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-[460px]">
        <div className="border-b border-[#f2f2f3] px-6 pb-4 pt-6">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          <SheetDescription className="mt-1 text-[13px] text-[#71717a]">{description}</SheetDescription>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex items-center gap-2 border-t border-[#f2f2f3] px-6 py-4">{footer}</div>
      </SheetContent>
    </Sheet>
  );
}

function Footer({
  isPending,
  onCancel,
  onSave,
  saveLabel = "Salva",
  onDelete,
  confirmDelete,
}: {
  isPending: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  onDelete?: () => void;
  confirmDelete?: boolean;
}) {
  return (
    <>
      {onDelete ? (
        <FinButton variant="danger" onClick={onDelete} disabled={isPending} className="px-3">
          {confirmDelete ? "Conferma eliminazione" : "Elimina"}
        </FinButton>
      ) : null}
      <div className="ml-auto flex gap-2">
        <FinButton variant="ghost" onClick={onCancel} disabled={isPending}>
          Annulla
        </FinButton>
        <FinButton onClick={onSave} disabled={isPending}>
          {isPending ? "Salvo…" : saveLabel}
        </FinButton>
      </div>
    </>
  );
}

// ── Sales ───────────────────────────────────────────────────────────────────

export function SalesAgentSheet({
  open,
  onOpenChange,
  agent,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: SalesAgentRow | null;
  onSaved: () => void;
}) {
  const toast = useFeedbackToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [fixed, setFixed] = useState("");
  const [percent, setPercent] = useState("");
  const [archived, setArchived] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    setName(agent?.name ?? "");
    setEmail(agent?.email ?? "");
    setFixed(agent && agent.monthlyFixedCents > 0 ? centsToInput(agent.monthlyFixedCents) : "");
    setPercent(agent && agent.defaultCommissionBps > 0 ? bpsToInput(agent.defaultCommissionBps) : "");
    setArchived(agent?.archived ?? false);
  }, [open, agent]);

  const handleSave = () => {
    setError(null);
    const fixedCents = fixed.trim() ? parseEuroToCents(fixed) : 0;
    if (fixedCents === null) return setError("Scrivi il fisso, per esempio 700 o 700,50.");
    const bps = percent.trim() ? parsePercentToBps(percent) : 0;
    if (bps === null) return setError("Scrivi la percentuale, per esempio 12,5.");
    startTransition(async () => {
      const res = await saveSalesAgent({
        id: agent?.id,
        name,
        email: email || null,
        monthlyFixedCents: fixedCents,
        defaultCommissionBps: bps,
        archived,
      });
      if (!res.success) return setError(res.message ?? "Non riuscito.");
      toast.success({ description: agent ? "Sales aggiornato." : "Sales aggiunto." });
      onOpenChange(false);
      onSaved();
    });
  };

  const handleDelete = () => {
    if (!agent) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startTransition(async () => {
      const res = await deleteSalesAgent({ id: agent.id });
      if (!res.success) return setError(res.message ?? "Eliminazione non riuscita.");
      toast.success({ description: "Sales eliminato." });
      onOpenChange(false);
      onSaved();
    });
  };

  return (
    <SheetShell
      open={open}
      onOpenChange={onOpenChange}
      title={agent ? agent.name : "Nuovo sales"}
      description="Il fisso entra tra le uscite di ogni mese; la percentuale precompila i contratti."
      footer={
        <Footer
          isPending={isPending}
          onCancel={() => onOpenChange(false)}
          onSave={handleSave}
          onDelete={agent && agent.dealsCount === 0 ? handleDelete : undefined}
          confirmDelete={confirmDelete}
        />
      }
    >
      <Field label="Nome" htmlFor="agent-name">
        <input
          id="agent-name"
          autoFocus={!agent}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Email" htmlFor="agent-email" hint="Facoltativa.">
        <input
          id="agent-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fisso mensile" htmlFor="agent-fixed" hint="Vuoto = senza fisso.">
          <EuroInput id="agent-fixed" value={fixed} onChange={setFixed} />
        </Field>
        <Field label="Commissione" htmlFor="agent-percent" hint="Sul valore del contratto.">
          <div className="relative">
            <input
              id="agent-percent"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="0"
              className={`${inputClass} pr-8 text-right font-semibold tabular-nums`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#a1a1aa]">%</span>
          </div>
        </Field>
      </div>
      <Field
        label="Stato"
        hint={archived ? "Archiviato: niente più fisso previsto; i suoi contratti restano." : undefined}
      >
        <Segmented
          value={archived ? "archived" : "active"}
          onChange={(v) => setArchived(v === "archived")}
          options={[
            { value: "active", label: "Attivo" },
            { value: "archived", label: "Archiviato" },
          ]}
        />
      </Field>
      {agent && agent.dealsCount > 0 ? (
        <p className="text-[12.5px] text-[#71717a]">
          {agent.dealsCount === 1 ? "1 contratto firmato" : `${agent.dealsCount} contratti firmati`}: per toglierlo
          dalla squadra, archivialo.
        </p>
      ) : null}
      {error ? <p className="text-sm text-[#c2410c]">{error}</p> : null}
    </SheetShell>
  );
}

// ── Contratto ───────────────────────────────────────────────────────────────

type DealDraft = {
  closedOn: string;
  agentId: string;
  companyId: string;
  value: string;
  percent: string;
  commission: string;
  paidOn: string;
  notes: string;
};

export function SalesDealSheet({
  open,
  onOpenChange,
  deal,
  agents,
  companies,
  today,
  defaultDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: SalesDealRow | null;
  agents: SalesAgentRow[];
  companies: DealCompanyOption[];
  today: string;
  defaultDate: string;
  onSaved: () => void;
}) {
  const toast = useFeedbackToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState<DealDraft>({
    closedOn: defaultDate,
    agentId: "",
    companyId: "",
    value: "",
    percent: "",
    commission: "",
    paidOn: "",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    if (deal) {
      setDraft({
        closedOn: deal.closedOn,
        agentId: deal.agentId,
        companyId: deal.companyId ?? "",
        value: centsToInput(deal.contractValueCents),
        percent: bpsToInput(deal.commissionBps),
        commission: centsToInput(deal.commissionCents),
        paidOn: deal.paidOn ?? "",
        notes: deal.notes ?? "",
      });
    } else {
      const only = agents.filter((a) => !a.archived);
      const agent = only.length === 1 ? only[0] : null;
      setDraft({
        closedOn: defaultDate,
        agentId: agent?.id ?? "",
        companyId: "",
        value: "",
        percent: agent ? bpsToInput(agent.defaultCommissionBps) : "",
        commission: "",
        paidOn: "",
        notes: "",
      });
    }
  }, [open, deal, agents, defaultDate]);

  /** Valore e percentuale cambiano → la commissione si ricalcola (resta modificabile). */
  const recompute = (next: DealDraft): DealDraft => {
    const value = parseEuroToCents(next.value);
    const bps = parsePercentToBps(next.percent);
    return value !== null && bps !== null
      ? { ...next, commission: centsToInput(commissionCentsOf(value, bps)) }
      : next;
  };

  const update = (patch: Partial<DealDraft>, recalc = false) => {
    setError(null);
    setDraft((d) => (recalc ? recompute({ ...d, ...patch }) : { ...d, ...patch }));
  };

  const pickCompany = (companyId: string) => {
    const company = companies.find((c) => c.id === companyId);
    // Il valore si precompila dal piano dell'autoscuola (€/anno), se c'è.
    const prefill = company?.planAnnualCents ? centsToInput(company.planAnnualCents) : null;
    update({ companyId, ...(prefill && (!draft.value || !deal) ? { value: prefill } : {}) }, true);
  };

  const pickAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    update(
      { agentId, ...(agent && !deal ? { percent: bpsToInput(agent.defaultCommissionBps) } : {}) },
      true,
    );
  };

  const company = companies.find((c) => c.id === draft.companyId);
  const shownAgents = agents.filter((a) => !a.archived || a.id === draft.agentId);
  const shownCompanies =
    deal?.companyId && !companies.some((c) => c.id === deal.companyId)
      ? [...companies, { id: deal.companyId, name: deal.companyName, planAnnualCents: null }]
      : companies;

  const handleSave = () => {
    setError(null);
    if (!draft.agentId) return setError("Scegli il sales.");
    if (!draft.companyId) return setError("Scegli l'autoscuola.");
    const value = parseEuroToCents(draft.value);
    if (!value) return setError("Scrivi il valore del contratto, per esempio 1.560.");
    const bps = draft.percent.trim() ? parsePercentToBps(draft.percent) : 0;
    if (bps === null) return setError("Scrivi la percentuale, per esempio 12,5.");
    const commission = draft.commission.trim() ? parseEuroToCents(draft.commission) : 0;
    if (commission === null) return setError("Scrivi l'importo della commissione.");
    startTransition(async () => {
      const res = await saveSalesDeal({
        id: deal?.id,
        agentId: draft.agentId,
        companyId: draft.companyId,
        closedOn: draft.closedOn,
        contractValueCents: value,
        commissionBps: bps,
        commissionCents: commission,
        paidOn: draft.paidOn || null,
        notes: draft.notes || null,
      });
      if (!res.success) return setError(res.message ?? "Non riuscito.");
      toast.success({ description: deal ? "Contratto aggiornato." : "Contratto registrato." });
      onOpenChange(false);
      onSaved();
    });
  };

  const handleDelete = () => {
    if (!deal) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startTransition(async () => {
      const res = await deleteSalesDeal({ id: deal.id });
      if (!res.success) return setError(res.message ?? "Eliminazione non riuscita.");
      toast.success({ description: "Contratto eliminato." });
      onOpenChange(false);
      onSaved();
    });
  };

  const due = draft.closedOn ? commissionDueOn(draft.closedOn) : null;

  return (
    <SheetShell
      open={open}
      onOpenChange={onOpenChange}
      title={deal ? "Modifica contratto" : "Nuovo contratto"}
      description="La commissione matura alla firma e si paga entro la fine del mese dopo."
      footer={
        <Footer
          isPending={isPending}
          onCancel={() => onOpenChange(false)}
          onSave={handleSave}
          onDelete={deal ? handleDelete : undefined}
          confirmDelete={confirmDelete}
        />
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Firmato il">
          <DatePickerInput value={draft.closedOn} onChange={(v) => update({ closedOn: v })} />
        </Field>
        <Field label="Sales" htmlFor="deal-agent">
          <SelectBox id="deal-agent" value={draft.agentId} onChange={(e) => pickAgent(e.target.value)}>
            <option value="">Scegli…</option>
            {shownAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.archived ? " (archiviato)" : ""}
              </option>
            ))}
          </SelectBox>
        </Field>
      </div>
      <Field
        label="Autoscuola"
        htmlFor="deal-company"
        hint={
          company
            ? company.planAnnualCents
              ? `Piano registrato: ${euroSmart(company.planAnnualCents)} l'anno, IVA inclusa.`
              : "Nessun piano registrato: scrivi tu il valore."
            : undefined
        }
      >
        <SelectBox id="deal-company" value={draft.companyId} onChange={(e) => pickCompany(e.target.value)}>
          <option value="">Scegli…</option>
          {shownCompanies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectBox>
      </Field>
      <Field label="Valore del contratto" htmlFor="deal-value" hint="IVA inclusa, come il piano.">
        <EuroInput id="deal-value" value={draft.value} onChange={(v) => update({ value: v }, true)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Commissione %" htmlFor="deal-percent">
          <div className="relative">
            <input
              id="deal-percent"
              inputMode="decimal"
              value={draft.percent}
              onChange={(e) => update({ percent: e.target.value }, true)}
              placeholder="0"
              className={`${inputClass} pr-8 text-right font-semibold tabular-nums`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#a1a1aa]">%</span>
          </div>
        </Field>
        <Field label="Importo commissione" htmlFor="deal-commission">
          <EuroInput
            id="deal-commission"
            value={draft.commission}
            onChange={(v) => update({ commission: v })}
          />
        </Field>
      </div>
      <Field
        label="Commissione pagata il"
        hint={
          draft.paidOn
            ? "Diventa un movimento pagato in Movimenti, e la cassa scende di questo importo."
            : due
              ? `Da pagare entro il ${fullDate(due)}. Vuoto finché non è pagata.`
              : undefined
        }
      >
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <DatePickerInput
              value={draft.paidOn}
              onChange={(v) => update({ paidOn: v })}
              placeholder="Non ancora pagata"
            />
          </div>
          {draft.paidOn ? (
            <FinButton variant="ghost" className="h-11 px-3" onClick={() => update({ paidOn: "" })}>
              Togli
            </FinButton>
          ) : (
            <FinButton variant="ghost" className="h-11 px-3" onClick={() => update({ paidOn: today })}>
              Oggi
            </FinButton>
          )}
        </div>
      </Field>
      <Field label="Note" htmlFor="deal-notes">
        <textarea
          id="deal-notes"
          rows={2}
          value={draft.notes}
          onChange={(e) => update({ notes: e.target.value })}
          className={`${inputClass} h-auto resize-none py-2.5`}
        />
      </Field>
      {error ? <p className="text-sm text-[#c2410c]">{error}</p> : null}
    </SheetShell>
  );
}

// ── Fisso del mese ──────────────────────────────────────────────────────────

export function SalesFixedSheet({
  open,
  onOpenChange,
  agent,
  month,
  today,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: { id: string; name: string; monthlyFixedCents: number } | null;
  month: string;
  today: string;
  onSaved: () => void;
}) {
  const toast = useFeedbackToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);

  useEffect(() => {
    if (!open || !agent) return;
    setError(null);
    setAmount(centsToInput(agent.monthlyFixedCents));
    setPaidOn(today);
  }, [open, agent, today]);

  const handleSave = () => {
    if (!agent) return;
    setError(null);
    const cents = parseEuroToCents(amount);
    if (!cents) return setError("Scrivi l'importo pagato.");
    startTransition(async () => {
      const res = await paySalesFixed({ agentId: agent.id, month, amountCents: cents, paidOn });
      if (!res.success) return setError(res.message ?? "Non riuscito.");
      toast.success({ description: "Fisso registrato come pagato." });
      onOpenChange(false);
      onSaved();
    });
  };

  return (
    <SheetShell
      open={open}
      onOpenChange={onOpenChange}
      title={agent ? `Fisso di ${monthName(month)} · ${agent.name}` : "Fisso"}
      description="Diventa un movimento pagato in Movimenti, nel mese a cui si riferisce."
      footer={
        <Footer isPending={isPending} onCancel={() => onOpenChange(false)} onSave={handleSave} saveLabel="Segna pagato" />
      }
    >
      <Field label="Importo" htmlFor="fixed-amount" hint={agent ? `Fisso previsto: ${euroSmart(agent.monthlyFixedCents)}.` : undefined}>
        <EuroInput id="fixed-amount" value={amount} onChange={setAmount} autoFocus />
      </Field>
      <Field label="Pagato il">
        <DatePickerInput value={paidOn} onChange={setPaidOn} />
      </Field>
      {error ? <p className="text-sm text-[#c2410c]">{error}</p> : null}
    </SheetShell>
  );
}
