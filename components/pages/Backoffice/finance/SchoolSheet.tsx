"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DatePickerInput } from "@/components/ui/date-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { saveCompanyCommercial } from "@/lib/actions/finance.actions";
import type { CommercialStatus, FinanceSchoolRow } from "@/lib/finance/finance-data";
import { ITALIAN_REGIONS, planNeedsRenewal } from "@/lib/finance/finance-schools";

import type { SalesAgentOption } from "./FinanceSchoolsPage";
import { Field, FinButton, FinLabel, Pill, Segmented, euroSmart, fullDate, inputClass, monthName } from "./finance-ui";

type Draft = {
  status: CommercialStatus;
  vatNumber: string;
  region: string;
  acquiredOn: string;
  churnedOn: string;
  agentId: string;
  notes: string;
};

const selectClass = `${inputClass} cursor-pointer appearance-none pr-9`;

/** Select nativo con la freccia disegnata (appearance-none la toglie). */
function SelectBox(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={`${selectClass} ${props.className ?? ""}`} />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
    </div>
  );
}

export function SchoolSheet({
  open,
  onOpenChange,
  school,
  today,
  month,
  agents,
  onSaved,
  onEditPlan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  school: FinanceSchoolRow | null;
  today: string;
  month: string;
  agents: SalesAgentOption[];
  onSaved: () => void;
  onEditPlan: (company: { id: string; name: string }) => void;
}) {
  const toast = useFeedbackToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    status: "active",
    vatNumber: "",
    region: "",
    acquiredOn: "",
    churnedOn: "",
    agentId: "",
    notes: "",
  });

  useEffect(() => {
    if (!open || !school) return;
    setError(null);
    const c = school.commercial;
    setDraft({
      status: c?.status ?? "active",
      vatNumber: c?.vatNumber ?? "",
      region: c?.region ?? "",
      acquiredOn: c?.acquiredOn ?? "",
      churnedOn: c?.churnedOn ?? "",
      agentId: c?.agentId ?? "",
      notes: c?.notes ?? "",
    });
  }, [open, school]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setError(null);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const handleSave = () => {
    if (!school) return;
    setError(null);
    startTransition(async () => {
      const res = await saveCompanyCommercial({
        companyId: school.id,
        status: draft.status,
        vatNumber: draft.vatNumber || null,
        region: (draft.region || null) as (typeof ITALIAN_REGIONS)[number] | null,
        acquiredOn: draft.acquiredOn || null,
        churnedOn: draft.status === "churned" ? draft.churnedOn || null : null,
        agentId: draft.agentId || null,
        notes: draft.notes || null,
      });
      if (!res.success) return setError(res.message ?? "Non riuscito.");
      toast.success({ description: "Anagrafica salvata." });
      onOpenChange(false);
      onSaved();
    });
  };

  const activeAgents = agents.filter((a) => !a.archived || a.id === draft.agentId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-[480px]">
        <div className="border-b border-[#f2f2f3] px-6 pb-4 pt-6">
          <SheetTitle className="text-lg">{school?.name}</SheetTitle>
          <SheetDescription className="mt-1 text-[13px] text-[#71717a]">
            {school ? `Su Reglo dal ${fullDate(school.registeredOn)}` : null}
            {school && !school.commercial ? " · anagrafica mai compilata" : null}
          </SheetDescription>
        </div>
        {school ? (
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {/* Numeri automatici */}
            <div className="grid grid-cols-4 overflow-hidden rounded-2xl border border-[#e9e9eb]">
              <Stat label="Istruttori" value={school.instructors} />
              <Stat label="Allievi" value={school.students} hint={`${school.activeStudentsMonth} attivi`} />
              <Stat label={`Guide ${monthName(month).slice(0, 3)}`} value={school.lessonsMonth} />
              <Stat label="Guide tot." value={school.lessonsTotal} />
            </div>

            <Field label="Stato commerciale">
              <Segmented
                value={draft.status}
                onChange={(v) => {
                  set("status", v);
                  if (v === "churned" && !draft.churnedOn) set("churnedOn", today);
                }}
                options={[
                  { value: "active", label: "Attiva" },
                  { value: "paused", label: "In pausa" },
                  { value: "churned", label: "Disdetta" },
                ]}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Acquisita il">
                <DatePickerInput
                  value={draft.acquiredOn}
                  onChange={(v) => set("acquiredOn", v)}
                  placeholder="Da indicare"
                />
              </Field>
              {draft.status === "churned" ? (
                <Field label="Disdetta il">
                  <DatePickerInput value={draft.churnedOn} onChange={(v) => set("churnedOn", v)} />
                </Field>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Partita IVA" htmlFor="school-vat">
                <input
                  id="school-vat"
                  inputMode="numeric"
                  value={draft.vatNumber}
                  onChange={(e) => set("vatNumber", e.target.value)}
                  placeholder="11 cifre"
                  className={`${inputClass} tabular-nums`}
                />
              </Field>
              <Field label="Regione" htmlFor="school-region">
                <SelectBox
                  id="school-region"
                  value={draft.region}
                  onChange={(e) => set("region", e.target.value)}
                >
                  <option value="">—</option>
                  {ITALIAN_REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </SelectBox>
              </Field>
            </div>

            <Field
              label="Sales"
              htmlFor="school-agent"
              hint={agents.length === 0 ? "Nessun sales ancora: si aggiungono nella sezione Vendite." : undefined}
            >
              <SelectBox
                id="school-agent"
                value={draft.agentId}
                onChange={(e) => set("agentId", e.target.value)}
                disabled={agents.length === 0}
                className="disabled:cursor-not-allowed disabled:bg-[#fafafa] disabled:text-[#a1a1aa]"
              >
                <option value="">Nessuno</option>
                {activeAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.archived ? " (archiviato)" : ""}
                  </option>
                ))}
              </SelectBox>
            </Field>

            {/* Piano: si legge da qui, si cambia col dialog del backoffice */}
            <div className="rounded-2xl border border-[#e9e9eb] px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <FinLabel>Piano</FinLabel>
                  {school.plan ? (
                    <>
                      <div className="mt-1.5 text-[17px] font-semibold tabular-nums">
                        {euroSmart(school.plan.annualCents)}
                        <span className="ml-1 text-[13px] font-normal text-[#71717a]">
                          l&apos;anno · {school.plan.billingPeriod === "monthly" ? "mensile" : "annuale"}
                        </span>
                      </div>
                      <div className="mt-1 text-[13px] text-[#71717a]">
                        {planNeedsRenewal(school) ? (
                          <Pill tone="dashed">rinnovo da completare</Pill>
                        ) : school.plan.renewsAt ? (
                          `Rinnovo il ${fullDate(school.plan.renewsAt)}`
                        ) : (
                          "Senza rinnovo"
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="mt-1.5 text-[13px] text-[#71717a]">Nessun piano assegnato.</div>
                  )}
                </div>
                <FinButton
                  variant="ghost"
                  className="h-9"
                  onClick={() => onEditPlan({ id: school.id, name: school.name })}
                >
                  {school.plan ? "Modifica piano" : "Assegna piano"}
                </FinButton>
              </div>
            </div>

            <Field label="Note" htmlFor="school-notes">
              <textarea
                id="school-notes"
                rows={3}
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
                className={`${inputClass} h-auto py-2.5`}
              />
            </Field>
            {error ? <p className="text-sm text-[#c2410c]">{error}</p> : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-[#f2f2f3] px-6 py-4">
          <FinButton variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Annulla
          </FinButton>
          <FinButton onClick={handleSave} disabled={isPending || !school}>
            {isPending ? "Salvo…" : "Salva"}
          </FinButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="border-l border-[#f2f2f3] px-3 py-3 first:border-l-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">{label}</div>
      <div className="mt-1 text-[19px] font-semibold tabular-nums">
        {new Intl.NumberFormat("it-IT", { useGrouping: "always" }).format(value)}
      </div>
      {hint ? <div className="text-[11px] text-[#a1a1aa]">{hint}</div> : null}
    </div>
  );
}
