"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";

import { EuroInput, FinButton, centsToInput } from "@/components/pages/Backoffice/finance/finance-ui";
import { DatePickerInput } from "@/components/ui/date-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  excludeRoundInvestor,
  getRoundInvestorDetail,
  readmitRoundInvestor,
  saveRoundInvestor,
} from "@/lib/actions/round.actions";
import { parseEuroToCents } from "@/lib/finance/finance-math";
import {
  CATEGORY_LABEL,
  CATEGORY_SHORT,
  INTERACTION_LABEL,
  ROUND_CATEGORIES,
  type LeadRole,
  type RoundCategory,
  type RoundChannel,
  type RoundOwner,
  type RoundPriority,
  type RoundStatus,
} from "@/lib/round/round-constants";
import type { RoundInteractionRow, RoundInvestorRow } from "@/lib/round/round-data";
import { cn } from "@/lib/utils";

import { OwnerMenu, StatusMenu, shortDate } from "./round-ui";

/**
 * La scheda essenziale: contatto, stato, prossimo passo, note. Gli altri campi
 * (canale, lead, priorità, ticket…) restano nel database e si salvano come
 * sono, ma non si vedono.
 */

type Draft = {
  name: string;
  organization: string;
  category: RoundCategory;
  subcategory: string;
  city: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  websiteUrl: string;
  channel: RoundChannel | null;
  channelDetail: string;
  owner: RoundOwner | null;
  status: RoundStatus;
  blockedReason: string;
  leadRole: LeadRole | null;
  priority: RoundPriority | null;
  ticket: string;
  fit: string;
  source: string;
  notes: string;
  commitment: string;
  lastContactOn: string;
  nextStepOn: string;
  nextStepNote: string;
};

const blank = (category: RoundCategory): Draft => ({
  name: "",
  organization: "",
  category,
  subcategory: "",
  city: "",
  email: "",
  phone: "",
  linkedinUrl: "",
  websiteUrl: "",
  channel: null,
  channelDetail: "",
  owner: null,
  status: "da_contattare",
  blockedReason: "",
  leadRole: null,
  priority: null,
  ticket: "",
  fit: "",
  source: "",
  notes: "",
  commitment: "",
  lastContactOn: "",
  nextStepOn: "",
  nextStepNote: "",
});

const fromRow = (r: RoundInvestorRow): Draft => ({
  name: r.name,
  organization: r.organization ?? "",
  category: r.category,
  subcategory: r.subcategory ?? "",
  city: r.city ?? "",
  email: r.email ?? "",
  phone: r.phone ?? "",
  linkedinUrl: r.linkedinUrl ?? "",
  websiteUrl: r.websiteUrl ?? "",
  channel: r.channel,
  channelDetail: r.channelDetail ?? "",
  owner: r.owner,
  status: r.status,
  blockedReason: r.blockedReason ?? "",
  leadRole: r.leadRole,
  priority: r.priority,
  ticket: r.ticket ?? "",
  fit: r.fit ?? "",
  source: r.source ?? "",
  notes: r.notes ?? "",
  commitment: r.commitmentCents ? centsToInput(r.commitmentCents) : "",
  lastContactOn: r.lastContactOn ?? "",
  nextStepOn: r.nextStepOn ?? "",
  nextStepNote: r.nextStepNote ?? "",
});

const asHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/** Campo senza bordo: si vede solo al passaggio e quando lo scrivi. */
const bare =
  "h-11 w-full min-w-0 rounded-lg bg-transparent px-3 text-[15px] text-[#111111] outline-none transition-colors placeholder:text-[#c4c4c8] hover:bg-[#f7f7f8] focus:bg-white focus:shadow-[inset_0_0_0_1px_#111111]";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#a1a1aa]">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[104px_minmax(0,1fr)]">
      <span className="text-[13.5px] text-[#71717a]">{label}</span>
      <div className="-mx-3 min-w-0">{children}</div>
    </div>
  );
}

function LinkInput({
  value,
  onChange,
  href,
  placeholder,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  href?: string;
  placeholder: string;
  inputMode?: "email" | "tel" | "url";
}) {
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className={cn(bare, href && value ? "pr-11" : "")}
      />
      {href && value ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Apri"
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[#a1a1aa] hover:text-[#111111]"
        >
          <ArrowUpRight className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  );
}

export function InvestorSheet({
  open,
  onOpenChange,
  investor,
  defaultCategory,
  today,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investor: RoundInvestorRow | null;
  defaultCategory: RoundCategory;
  today: string;
  onSaved: (id: string | null) => void;
}) {
  const toast = useFeedbackToast();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(() => blank(defaultCategory));
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RoundInteractionRow[] | null>(null);
  const [excluding, setExcluding] = useState(false);
  const [reason, setReason] = useState("");

  const investorId = investor?.id ?? null;
  const loadHistory = (id: string) =>
    getRoundInvestorDetail({ id }).then((res) => {
      if (res.success) setHistory(res.data.interactions);
    });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setExcluding(false);
    setReason("");
    setDraft(investor ? fromRow(investor) : blank(defaultCategory));
    setHistory(null);
    if (investor) void loadHistory(investor.id);
    // Si reimposta quando si apre un'altra scheda, non a ogni refresh della lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, investorId]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = () => {
    setError(null);
    const commitmentCents = draft.commitment.trim() ? parseEuroToCents(draft.commitment) : null;
    if (draft.commitment.trim() && !commitmentCents) return setError("Importo non valido.");
    const { commitment: _commitment, ...fields } = draft;
    startTransition(async () => {
      const res = await saveRoundInvestor({
        ...fields,
        id: investor?.id,
        commitmentCents,
        lastContactOn: draft.lastContactOn || null,
        nextStepOn: draft.nextStepOn || null,
      });
      if (!res.success) return setError(res.message ?? "Salvataggio non riuscito.");
      toast.success({ description: investor ? "Salvato." : "Investitore aggiunto." });
      if (investor) void loadHistory(investor.id);
      onSaved(investor ? null : res.data.id);
    });
  };

  const handleExclude = () => {
    if (!investor) return;
    if (reason.trim().length < 3) return setError("Scrivi il motivo.");
    setError(null);
    startTransition(async () => {
      const res = await excludeRoundInvestor({ id: investor.id, reason });
      if (!res.success) return setError(res.message ?? "Esclusione non riuscita.");
      toast.success({ description: `${investor.name} escluso dal round.` });
      onOpenChange(false);
      onSaved(null);
    });
  };

  const handleReadmit = () => {
    if (!investor) return;
    startTransition(async () => {
      const res = await readmitRoundInvestor({ id: investor.id });
      if (!res.success) return setError(res.message ?? "Operazione non riuscita.");
      toast.success({ description: `${investor.name} è di nuovo nel round.` });
      void loadHistory(investor.id);
      onSaved(null);
    });
  };

  const excluded = investor?.excluded ?? false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 border-l-0 sm:max-w-[520px]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex-1 overflow-y-auto px-6 pb-10 pt-12 sm:px-10">
          {/* Chi è */}
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#a1a1aa]">
            {investor ? CATEGORY_LABEL[draft.category] : "Nuovo investitore"}
          </p>
          <SheetTitle asChild>
            <div className="-mx-3 mt-2">
              <input
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Nome"
                aria-label="Nome"
                className={cn(bare, "h-12 text-[24px] font-semibold tracking-[-0.025em]")}
              />
            </div>
          </SheetTitle>
          <SheetDescription asChild>
            <div className="-mx-3">
              <input
                value={draft.organization}
                onChange={(e) => set("organization", e.target.value)}
                placeholder="Organizzazione o ruolo"
                aria-label="Organizzazione o ruolo"
                className={cn(bare, "h-10 text-[15px] text-[#71717a]")}
              />
            </div>
          </SheetDescription>

          {investor ? null : (
            <div className="mt-5 flex flex-wrap gap-1">
              {ROUND_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("category", c)}
                  className={cn(
                    "h-9 cursor-pointer rounded-full px-3 text-[13px] transition-colors",
                    draft.category === c ? "bg-[#111111] text-white" : "text-[#52525b] hover:bg-[#f4f4f5]",
                  )}
                >
                  {CATEGORY_SHORT[c]}
                </button>
              ))}
            </div>
          )}

          {excluded ? (
            <p className="mt-6 text-[13.5px] leading-relaxed text-[#52525b]">
              Escluso{investor?.excludedOn ? ` il ${shortDate(investor.excludedOn)}` : ""}: {investor?.excludedReason}{" "}
              <button
                type="button"
                onClick={handleReadmit}
                disabled={isPending}
                className="cursor-pointer text-[#111111] underline decoration-[#d4d4d8] underline-offset-4 hover:decoration-[#111111]"
              >
                Riammetti
              </button>
            </p>
          ) : null}

          <div className="mt-12 space-y-11">
            <Section title="Stato">
              <div className="flex items-center justify-between gap-3">
                <div className="pl-2.5">
                  <StatusMenu value={draft.status} onChange={(s) => set("status", s)} />
                </div>
                <OwnerMenu value={draft.owner} onChange={(o) => set("owner", o)} showName />
              </div>
              {draft.status === "bloccato" ? (
                <div className="-mx-3 mt-2">
                  <input
                    value={draft.blockedReason}
                    onChange={(e) => set("blockedReason", e.target.value)}
                    placeholder="Cosa lo blocca"
                    className={bare}
                  />
                </div>
              ) : null}
              {draft.status === "impegno" ? (
                <div className="mt-3 max-w-[200px]">
                  <EuroInput value={draft.commitment} onChange={(v) => set("commitment", v)} placeholder="Importo" />
                </div>
              ) : null}
            </Section>

            <Section title="Prossimo passo">
              <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
                <DatePickerInput value={draft.nextStepOn} onChange={(v) => set("nextStepOn", v)} placeholder="Quando" />
                <div className="-mx-3 sm:mx-0">
                  <input
                    value={draft.nextStepNote}
                    onChange={(e) => set("nextStepNote", e.target.value)}
                    placeholder="Cosa fare"
                    className={bare}
                  />
                </div>
              </div>
            </Section>

            <Section title="Contatto">
              <div className="space-y-0.5">
                <Row label="Email">
                  <LinkInput
                    value={draft.email}
                    onChange={(v) => set("email", v)}
                    href={draft.email ? `mailto:${draft.email}` : undefined}
                    placeholder="—"
                    inputMode="email"
                  />
                </Row>
                <Row label="Telefono">
                  <LinkInput value={draft.phone} onChange={(v) => set("phone", v)} placeholder="—" inputMode="tel" />
                </Row>
                <Row label="LinkedIn">
                  <LinkInput
                    value={draft.linkedinUrl}
                    onChange={(v) => set("linkedinUrl", v)}
                    href={draft.linkedinUrl ? asHref(draft.linkedinUrl) : undefined}
                    placeholder="—"
                    inputMode="url"
                  />
                </Row>
              </div>
            </Section>

            <Section title="Note">
              <textarea
                rows={5}
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Cosa sappiamo, cosa ci siamo detti"
                className="w-full resize-y rounded-xl bg-[#f7f7f8] px-4 py-3 text-[14.5px] leading-relaxed text-[#111111] outline-none transition-colors placeholder:text-[#b4b4b9] focus:bg-white focus:shadow-[inset_0_0_0_1px_#111111]"
              />
            </Section>

            {history && history.length ? (
              <details className="group">
                <summary className="flex h-11 cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[#a1a1aa] hover:text-[#111111] [&::-webkit-details-marker]:hidden">
                  Storico <span className="tabular-nums">{history.length}</span>
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <ol className="mt-3 space-y-4">
                  {history.map((h) => (
                    <li key={h.id} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 text-[13.5px]">
                      <span className="tabular-nums text-[#a1a1aa]">{shortDate(h.occurredOn)}</span>
                      <span className="leading-relaxed text-[#52525b]">
                        {h.kind !== "stato" ? <span className="text-[#111111]">{INTERACTION_LABEL[h.kind]} · </span> : null}
                        <span className="whitespace-pre-line">{h.body}</span>
                        {h.authorName ? <span className="text-[#a1a1aa]"> · {h.authorName}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}

            {investor && !excluded ? (
              excluding ? (
                <div className="space-y-3">
                  <div className="-mx-3">
                    <input
                      autoFocus
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Perché lo escludiamo"
                      className={bare}
                    />
                  </div>
                  <div className="flex gap-2">
                    <FinButton onClick={handleExclude} disabled={isPending || reason.trim().length < 3}>
                      Escludi dal round
                    </FinButton>
                    <FinButton variant="ghost" onClick={() => setExcluding(false)} disabled={isPending} className="border-0">
                      Annulla
                    </FinButton>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setExcluding(true)}
                  className="-ml-1 h-11 cursor-pointer px-1 text-[13px] text-[#a1a1aa] hover:text-[#c2410c]"
                >
                  Escludi dal round
                </button>
              )
            ) : null}
          </div>
          {error ? <p className="mt-6 text-[13.5px] text-[#c2410c]">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-1px_0_#f0f0f1] sm:px-10">
          <FinButton variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending} className="border-0">
            Chiudi
          </FinButton>
          <FinButton onClick={handleSave} disabled={isPending || !draft.name.trim()} className="min-w-[96px]">
            {isPending ? "Salvo…" : investor ? "Salva" : "Aggiungi"}
          </FinButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
