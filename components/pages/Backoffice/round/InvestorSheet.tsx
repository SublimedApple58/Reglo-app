"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, Trash2 } from "lucide-react";

import {
  EuroInput,
  Field,
  FinButton,
  FinLabel,
  SelectBox,
  centsToInput,
  inputClass,
} from "@/components/pages/Backoffice/finance/finance-ui";
import { DatePickerInput } from "@/components/ui/date-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  addRoundInteraction,
  deleteRoundInteraction,
  excludeRoundInvestor,
  getRoundInvestorDetail,
  readmitRoundInvestor,
  saveRoundInvestor,
} from "@/lib/actions/round.actions";
import { parseEuroToCents } from "@/lib/finance/finance-math";
import {
  CATEGORY_LABEL,
  CHANNEL_LABEL,
  INTERACTION_LABEL,
  LEAD_ROLES,
  LEAD_ROLE_LABEL,
  MANUAL_INTERACTION_KINDS,
  OWNER_LABEL,
  PRIORITIES,
  ROUND_CATEGORIES,
  ROUND_CHANNELS,
  ROUND_OWNERS,
  ROUND_STATUSES,
  STATUS_HINT,
  STATUS_LABEL,
  type InteractionKind,
  type LeadRole,
  type RoundCategory,
  type RoundChannel,
  type RoundOwner,
  type RoundPriority,
  type RoundStatus,
} from "@/lib/round/round-constants";
import type { RoundInteractionRow, RoundInvestorRow } from "@/lib/round/round-data";
import { cn } from "@/lib/utils";

import { OwnerAvatar, StatusDot, shortDate } from "./round-ui";

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
  channel: RoundChannel | "";
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

const blank = (): Draft => ({
  name: "",
  organization: "",
  category: "business_angel",
  subcategory: "",
  city: "",
  email: "",
  phone: "",
  linkedinUrl: "",
  websiteUrl: "",
  channel: "",
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
  channel: r.channel ?? "",
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

const textarea = `${inputClass} h-auto resize-y py-2.5 leading-relaxed`;

/** Una scelta tra pochi valori, a pastiglie (con «nessuno» in fondo). */
function Choice<T extends string>({
  value,
  onChange,
  options,
  noneLabel,
}: {
  value: T | null;
  onChange: (value: T | null) => void;
  options: Array<{ value: T; label: React.ReactNode }>;
  noneLabel?: string;
}) {
  const all: Array<{ value: T | null; label: React.ReactNode }> = noneLabel
    ? [...options, { value: null, label: noneLabel }]
    : options;
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((o) => (
        <button
          key={o.value ?? "none"}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13.5px] transition-colors",
            o.value === value
              ? "border-[#111111] bg-[#111111] font-medium text-white"
              : "border-[#e4e4e7] bg-white text-[#3f3f46] hover:border-[#a1a1aa]",
            o.value === null && o.value !== value && "border-dashed text-[#71717a]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LinkField({
  id,
  label,
  value,
  onChange,
  placeholder,
  href,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  href?: string;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(inputClass, href && value ? "pr-11" : "")}
        />
        {href && value ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Apri ${label}`}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[#71717a] hover:bg-[#f4f4f5] hover:text-[#111111]"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </div>
    </Field>
  );
}

const asHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

export function InvestorSheet({
  open,
  onOpenChange,
  investor,
  today,
  subcategories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investor: RoundInvestorRow | null;
  today: string;
  subcategories: string[];
  onSaved: (id: string | null) => void;
}) {
  const toast = useFeedbackToast();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(blank);
  const [tab, setTab] = useState<"scheda" | "storico">("scheda");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RoundInteractionRow[] | null>(null);
  const [excluding, setExcluding] = useState(false);
  const [reason, setReason] = useState("");
  const [entry, setEntry] = useState<{ kind: InteractionKind; occurredOn: string; body: string }>({
    kind: "messaggio",
    occurredOn: today,
    body: "",
  });

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
    setTab("scheda");
    setEntry({ kind: "messaggio", occurredOn: today, body: "" });
    setDraft(investor ? fromRow(investor) : blank());
    setHistory(null);
    if (investor) void loadHistory(investor.id);
    // Si reimposta quando si apre un'altra scheda, non a ogni refresh della lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, investorId]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = () => {
    setError(null);
    const commitmentCents = draft.commitment.trim() ? parseEuroToCents(draft.commitment) : null;
    if (draft.commitment.trim() && !commitmentCents) return setError("Importo dell'impegno non valido.");
    startTransition(async () => {
      const res = await saveRoundInvestor({
        id: investor?.id,
        name: draft.name,
        organization: draft.organization,
        category: draft.category,
        subcategory: draft.subcategory,
        city: draft.city,
        email: draft.email,
        phone: draft.phone,
        linkedinUrl: draft.linkedinUrl,
        websiteUrl: draft.websiteUrl,
        channel: draft.channel || null,
        channelDetail: draft.channelDetail,
        owner: draft.owner,
        status: draft.status,
        blockedReason: draft.blockedReason,
        leadRole: draft.leadRole,
        priority: draft.priority,
        ticket: draft.ticket,
        fit: draft.fit,
        source: draft.source,
        notes: draft.notes,
        commitmentCents,
        lastContactOn: draft.lastContactOn || null,
        nextStepOn: draft.nextStepOn || null,
        nextStepNote: draft.nextStepNote,
      });
      if (!res.success) return setError(res.message ?? "Salvataggio non riuscito.");
      toast.success({ description: investor ? "Scheda salvata." : "Investitore aggiunto." });
      if (investor) void loadHistory(investor.id);
      onSaved(investor ? null : res.data.id);
    });
  };

  const handleExclude = () => {
    if (!investor) return;
    if (reason.trim().length < 3) return setError("Scrivi il motivo dell'esclusione.");
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

  const handleAddEntry = () => {
    if (!investor) return;
    if (!entry.body.trim()) return setError("Scrivi cosa è successo.");
    setError(null);
    startTransition(async () => {
      const res = await addRoundInteraction({ investorId: investor.id, ...entry });
      if (!res.success) return setError(res.message ?? "Non sono riuscito ad aggiungerlo.");
      setEntry((e) => ({ ...e, body: "" }));
      void loadHistory(investor.id);
      onSaved(null);
    });
  };

  const handleDeleteEntry = (id: string) => {
    if (!investor) return;
    startTransition(async () => {
      const res = await deleteRoundInteraction({ id });
      if (!res.success) return setError(res.message ?? "Eliminazione non riuscita.");
      void loadHistory(investor.id);
    });
  };

  const excluded = investor?.excluded ?? false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-[600px]" onOpenAutoFocus={(e) => e.preventDefault()}>
        {/* Testata */}
        <div className="border-b border-[#f2f2f3] px-5 pb-4 pt-6 sm:px-7">
          <div className="pr-8 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">
            {CATEGORY_LABEL[draft.category]}
            {draft.subcategory ? ` · ${draft.subcategory}` : ""}
          </div>
          <SheetTitle className="mt-1.5 pr-8 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[#111111]">
            {investor ? investor.name : "Nuovo investitore"}
          </SheetTitle>
          <SheetDescription className="mt-1 text-[13.5px] text-[#71717a]">
            {investor
              ? [investor.organization, investor.updatedByName ? `ultima modifica di ${investor.updatedByName}` : null]
                  .filter(Boolean)
                  .join(" · ")
              : "Nome e tipologia bastano: il resto si completa dopo."}
          </SheetDescription>
          {excluded ? (
            <div className="mt-3 rounded-xl border border-[#e9e9eb] bg-[#fafafa] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#3f3f46]">
              <span className="font-semibold">Escluso{investor?.excludedOn ? ` il ${shortDate(investor.excludedOn)}` : ""}:</span>{" "}
              {investor?.excludedReason}
            </div>
          ) : null}
          {investor ? (
            <div className="mt-4 flex gap-1 rounded-xl bg-[#f1f1f2] p-1">
              {(["scheda", "storico"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex-1 cursor-pointer rounded-[9px] px-3 py-1.5 text-sm transition-colors",
                    tab === t
                      ? "bg-white font-semibold text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      : "text-[#71717a] hover:text-[#111111]",
                  )}
                >
                  {t === "scheda" ? "Scheda" : `Storico${history ? ` · ${history.length}` : ""}`}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {tab === "scheda" ? (
            <div className="space-y-7">
              {/* Esito */}
              <section className="space-y-4">
                <FinLabel>Esito del contatto</FinLabel>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {ROUND_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set("status", s)}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-left text-[13.5px] transition-colors",
                        draft.status === s
                          ? "border-[#111111] bg-[#111111] font-medium text-white"
                          : "border-[#e9e9eb] bg-white text-[#3f3f46] hover:border-[#a1a1aa]",
                      )}
                    >
                      <StatusDot status={s} className={draft.status === s ? "ring-2 ring-white/70" : ""} />
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
                <p className="text-[12.5px] text-[#71717a]">{STATUS_HINT[draft.status]}</p>
                {draft.status === "bloccato" ? (
                  <Field label="Cosa lo blocca" htmlFor="rd-blocked">
                    <input
                      id="rd-blocked"
                      value={draft.blockedReason}
                      onChange={(e) => set("blockedReason", e.target.value)}
                      placeholder="Es. Mamacrowd non trova ancora Reglo S.r.l."
                      className={inputClass}
                    />
                  </Field>
                ) : null}
                {draft.status === "impegno" || draft.status === "interessato" || draft.commitment ? (
                  <Field
                    label={draft.status === "impegno" ? "Importo dell'impegno" : "Importo di cui si parla"}
                    htmlFor="rd-commit"
                    hint={draft.status === "impegno" ? "Conta nell'avanzamento verso l'obiettivo." : "Conta solo quando diventa «Impegno»."}
                  >
                    <EuroInput id="rd-commit" value={draft.commitment} onChange={(v) => set("commitment", v)} />
                  </Field>
                ) : null}
                <div className="space-y-4">
                  <Field label="Lead o follower">
                    <Choice
                      value={draft.leadRole}
                      onChange={(v) => set("leadRole", v)}
                      options={LEAD_ROLES.map((r) => ({ value: r, label: LEAD_ROLE_LABEL[r] }))}
                      noneLabel="—"
                    />
                  </Field>
                  <Field label="Priorità">
                    <Choice
                      value={draft.priority}
                      onChange={(v) => set("priority", v)}
                      options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                      noneLabel="—"
                    />
                  </Field>
                </div>
              </section>

              {/* Date */}
              <section className="space-y-4">
                <FinLabel>Date</FinLabel>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Ultimo contatto">
                    <DatePickerInput value={draft.lastContactOn} onChange={(v) => set("lastContactOn", v)} placeholder="Nessuno" />
                  </Field>
                  <Field label="Prossimo passo">
                    <DatePickerInput value={draft.nextStepOn} onChange={(v) => set("nextStepOn", v)} placeholder="Da decidere" />
                  </Field>
                </div>
                <Field label="Cosa fare al prossimo passo" htmlFor="rd-next">
                  <input
                    id="rd-next"
                    value={draft.nextStepNote}
                    onChange={(e) => set("nextStepNote", e.target.value)}
                    placeholder="Es. Ricontattarlo dopo la presentazione"
                    className={inputClass}
                  />
                </Field>
                {(draft.nextStepOn || draft.lastContactOn) && (
                  <div className="flex gap-2">
                    {draft.nextStepOn ? (
                      <button type="button" onClick={() => { set("nextStepOn", ""); set("nextStepNote", ""); }} className="cursor-pointer text-[12.5px] text-[#71717a] underline underline-offset-4 hover:text-[#111111]">
                        Togli il prossimo passo
                      </button>
                    ) : null}
                  </div>
                )}
              </section>

              {/* Chi e come */}
              <section className="space-y-4">
                <FinLabel>Chi se ne occupa e come</FinLabel>
                <Choice
                  value={draft.owner}
                  onChange={(v) => set("owner", v)}
                  options={ROUND_OWNERS.map((o) => ({
                    value: o,
                    label: (
                      <>
                        <OwnerAvatar owner={o} size={22} />
                        {OWNER_LABEL[o]}
                      </>
                    ),
                  }))}
                  noneLabel="Nessuno"
                />
                <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                  <Field label="Canale" htmlFor="rd-channel">
                    <SelectBox id="rd-channel" value={draft.channel} onChange={(e) => set("channel", e.target.value as RoundChannel | "")}>
                      <option value="">Da decidere</option>
                      {ROUND_CHANNELS.map((c) => (
                        <option key={c} value={c}>
                          {CHANNEL_LABEL[c]}
                        </option>
                      ))}
                    </SelectBox>
                  </Field>
                  <Field label="Dettaglio del canale" htmlFor="rd-chdetail">
                    <input
                      id="rd-chdetail"
                      value={draft.channelDetail}
                      onChange={(e) => set("channelDetail", e.target.value)}
                      placeholder="Link del modulo, chi ci presenta…"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </section>

              {/* Anagrafica */}
              <section className="space-y-4">
                <FinLabel>Anagrafica e contatti</FinLabel>
                <Field label="Nome" htmlFor="rd-name">
                  <input id="rd-name" value={draft.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
                </Field>
                <Field label="Organizzazione o ruolo" htmlFor="rd-org">
                  <input id="rd-org" value={draft.organization} onChange={(e) => set("organization", e.target.value)} className={inputClass} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tipologia" htmlFor="rd-cat">
                    <SelectBox id="rd-cat" value={draft.category} onChange={(e) => set("category", e.target.value as RoundCategory)}>
                      {ROUND_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </SelectBox>
                  </Field>
                  <Field label="Sottocategoria" htmlFor="rd-sub">
                    <input
                      id="rd-sub"
                      list="rd-sub-list"
                      value={draft.subcategory}
                      onChange={(e) => set("subcategory", e.target.value)}
                      placeholder="Es. Fondo VC pre-seed/seed"
                      className={inputClass}
                    />
                    <datalist id="rd-sub-list">
                      {subcategories.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <LinkField id="rd-email" label="Email" value={draft.email} onChange={(v) => set("email", v)} href={draft.email ? `mailto:${draft.email}` : undefined} />
                  <Field label="Telefono" htmlFor="rd-phone">
                    <input id="rd-phone" inputMode="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
                  </Field>
                  <LinkField id="rd-li" label="LinkedIn" value={draft.linkedinUrl} onChange={(v) => set("linkedinUrl", v)} href={draft.linkedinUrl ? asHref(draft.linkedinUrl) : undefined} />
                  <LinkField id="rd-web" label="Sito" value={draft.websiteUrl} onChange={(v) => set("websiteUrl", v)} href={draft.websiteUrl ? asHref(draft.websiteUrl) : undefined} />
                </div>
                <Field label="Città" htmlFor="rd-city">
                  <input id="rd-city" value={draft.city} onChange={(e) => set("city", e.target.value)} className={inputClass} />
                </Field>
              </section>

              {/* Profilo */}
              <section className="space-y-4">
                <FinLabel>Profilo</FinLabel>
                <Field label="Ticket tipico" htmlFor="rd-ticket">
                  <input id="rd-ticket" value={draft.ticket} onChange={(e) => set("ticket", e.target.value)} className={inputClass} />
                </Field>
                <Field label="Perché è adatto a Reglo" htmlFor="rd-fit">
                  <textarea id="rd-fit" rows={3} value={draft.fit} onChange={(e) => set("fit", e.target.value)} className={textarea} />
                </Field>
                <Field label="Note" htmlFor="rd-notes">
                  <textarea id="rd-notes" rows={5} value={draft.notes} onChange={(e) => set("notes", e.target.value)} className={textarea} />
                </Field>
                <Field label="Fonte" htmlFor="rd-source">
                  <input id="rd-source" value={draft.source} onChange={(e) => set("source", e.target.value)} className={inputClass} />
                </Field>
              </section>

              {/* Esclusione */}
              {investor && !excluded ? (
                <section className="space-y-3 rounded-2xl border border-[#f2f2f3] p-4">
                  {excluding ? (
                    <>
                      <Field label="Perché lo escludiamo" htmlFor="rd-reason" hint="Obbligatorio: resta nella scheda e nello storico.">
                        <textarea
                          id="rd-reason"
                          autoFocus
                          rows={2}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Es. Conflitto: ha investito in un concorrente"
                          className={textarea}
                        />
                      </Field>
                      <div className="flex justify-end gap-2">
                        <FinButton variant="ghost" onClick={() => setExcluding(false)} disabled={isPending}>
                          Annulla
                        </FinButton>
                        <FinButton onClick={handleExclude} disabled={isPending || reason.trim().length < 3} className="bg-[#c2410c] hover:bg-[#9a3412]">
                          Escludi dal round
                        </FinButton>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px] text-[#71717a]">Non va contattato? Escludilo dicendo perché.</div>
                      <FinButton variant="danger" onClick={() => setExcluding(true)} className="shrink-0 px-3">
                        Escludi
                      </FinButton>
                    </div>
                  )}
                </section>
              ) : null}
              {investor && excluded ? (
                <FinButton variant="ghost" onClick={handleReadmit} disabled={isPending} className="w-full">
                  Riammetti nel round
                </FinButton>
              ) : null}
            </div>
          ) : (
            <History
              history={history}
              entry={entry}
              setEntry={setEntry}
              onAdd={handleAddEntry}
              onDelete={handleDeleteEntry}
              pending={isPending}
            />
          )}
          {error ? <p className="mt-4 text-sm text-[#c2410c]">{error}</p> : null}
        </div>

        {tab === "scheda" ? (
          <div className="flex items-center gap-2 border-t border-[#f2f2f3] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7">
            <div className="ml-auto flex gap-2">
              <FinButton variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
                Chiudi
              </FinButton>
              <FinButton onClick={handleSave} disabled={isPending || !draft.name.trim()}>
                {isPending ? "Salvo…" : investor ? "Salva" : "Aggiungi"}
              </FinButton>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function History({
  history,
  entry,
  setEntry,
  onAdd,
  onDelete,
  pending,
}: {
  history: RoundInteractionRow[] | null;
  entry: { kind: InteractionKind; occurredOn: string; body: string };
  setEntry: (fn: (e: { kind: InteractionKind; occurredOn: string; body: string }) => typeof e) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-2xl border border-[#e9e9eb] p-4">
        <div className="grid grid-cols-[1fr_1fr] gap-3">
          <SelectBox value={entry.kind} onChange={(e) => setEntry((x) => ({ ...x, kind: e.target.value as InteractionKind }))}>
            {MANUAL_INTERACTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {INTERACTION_LABEL[k]}
              </option>
            ))}
          </SelectBox>
          <DatePickerInput value={entry.occurredOn} onChange={(v) => setEntry((x) => ({ ...x, occurredOn: v }))} />
        </div>
        <textarea
          rows={3}
          value={entry.body}
          onChange={(e) => setEntry((x) => ({ ...x, body: e.target.value }))}
          placeholder="Cosa è successo: chi ha scritto, cosa ha risposto, cosa ci siamo detti…"
          className={textarea}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] leading-snug text-[#a1a1aa]">Una risposta o una call segnano anche la tappa dell&apos;imbuto.</span>
          <FinButton onClick={onAdd} disabled={pending || !entry.body.trim()} className="shrink-0">
            Aggiungi
          </FinButton>
        </div>
      </div>

      {history === null ? (
        <p className="text-[13.5px] text-[#a1a1aa]">Carico lo storico…</p>
      ) : history.length ? (
        <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-[#ececee]">
          {history.map((h) => (
            <li key={h.id} className="group relative pl-6">
              <span
                className={cn(
                  "absolute left-0 top-[6px] h-[11px] w-[11px] rounded-full border-2 border-white",
                  h.kind === "stato" ? "bg-[#e4e4e7]" : h.kind === "risposta" || h.kind === "call" ? "bg-[#111111]" : "bg-[#a1a1aa]",
                )}
              />
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold text-[#111111]">{INTERACTION_LABEL[h.kind]}</span>
                <span className="text-[12px] tabular-nums text-[#a1a1aa]">{shortDate(h.occurredOn)}</span>
                {h.authorName ? <span className="truncate text-[12px] text-[#a1a1aa]">· {h.authorName}</span> : null}
                <button
                  type="button"
                  aria-label="Elimina dallo storico"
                  onClick={() => onDelete(h.id)}
                  disabled={pending}
                  className="ml-auto flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#c9c9cf] opacity-100 hover:bg-[#fff7ed] hover:text-[#c2410c] md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className={cn("mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed", h.kind === "stato" ? "text-[#71717a]" : "text-[#3f3f46]")}>
                {h.body}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13.5px] text-[#71717a]">Nessuna voce nello storico.</p>
      )}
    </div>
  );
}
