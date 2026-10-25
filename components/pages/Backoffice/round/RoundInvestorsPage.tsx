"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, X } from "lucide-react";

import { FinButton, FinCard, FinEmpty, FilterSelect } from "@/components/pages/Backoffice/finance/finance-ui";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { quickUpdateRoundInvestor } from "@/lib/actions/round.actions";
import {
  CATEGORY_LABEL,
  LEAD_ROLES,
  LEAD_ROLE_LABEL,
  OWNER_LABEL,
  PRIORITIES,
  ROUND_CATEGORIES,
  ROUND_OWNERS,
  ROUND_STATUSES,
  STATUS_LABEL,
  isOneOf,
  type RoundCategory,
  type RoundOwner,
  type RoundStatus,
} from "@/lib/round/round-constants";
import type { RoundInvestorRow } from "@/lib/round/round-data";
import { cn } from "@/lib/utils";

import { InvestorSheet } from "./InvestorSheet";
import { LeadBadge, NextStep, OwnerMenu, PriorityTag, StatusMenu, StatusStack, shortDate } from "./round-ui";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const SORTS = [
  ["nome", "Ordina per nome"],
  ["prossimo", "Per prossimo passo"],
  ["contatto", "Per ultimo contatto"],
] as const;
type Sort = (typeof SORTS)[number][0];

export function RoundInvestorsPage({ investors, today }: { investors: RoundInvestorRow[]; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useFeedbackToast();
  const [, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>(isOneOf(ROUND_STATUSES, params.get("stato")) ? params.get("stato")! : "all");
  const [category, setCategory] = useState<string>(
    isOneOf(ROUND_CATEGORIES, params.get("tipologia")) ? params.get("tipologia")! : "all",
  );
  const [owner, setOwner] = useState<string>("all");
  const [role, setRole] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [showExcluded, setShowExcluded] = useState(false);
  const [sort, setSort] = useState<Sort>(params.get("ordine") === "prossimo" ? "prossimo" : "nome");

  const openId = params.get("scheda");
  const [creating, setCreating] = useState(false);
  const openRow = openId ? (investors.find((i) => i.id === openId) ?? null) : null;

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("scheda", id);
    else next.delete("scheda");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return investors.filter((i) => {
      if (i.excluded !== showExcluded) return false;
      if (status !== "all" && i.status !== status) return false;
      if (category !== "all" && i.category !== category) return false;
      if (owner !== "all" && (owner === "none" ? i.owner !== null : i.owner !== owner)) return false;
      if (role !== "all" && (role === "none" ? i.leadRole !== null : i.leadRole !== role)) return false;
      if (priority !== "all" && i.priority !== priority) return false;
      if (q) {
        const hay = norm(
          [i.name, i.organization, i.subcategory, i.notes, i.email, i.city, i.channelDetail].filter(Boolean).join(" "),
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [investors, query, status, category, owner, role, priority, showExcluded]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sort === "prossimo") list.sort((a, b) => (a.nextStepOn ?? "9999").localeCompare(b.nextStepOn ?? "9999"));
    else if (sort === "contatto") list.sort((a, b) => (b.lastContactOn ?? "").localeCompare(a.lastContactOn ?? ""));
    else list.sort((a, b) => a.name.localeCompare(b.name, "it"));
    return list;
  }, [filtered, sort]);

  const groups = useMemo(() => {
    return ROUND_CATEGORIES.map((c) => {
      const rows = sorted.filter((i) => i.category === c);
      const subs = new Map<string, RoundInvestorRow[]>();
      for (const r of rows) {
        const key = r.subcategory ?? "";
        subs.set(key, [...(subs.get(key) ?? []), r]);
      }
      const byStatus = Object.fromEntries(ROUND_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<
        RoundStatus,
        number
      >;
      return {
        category: c,
        rows,
        byStatus,
        subs: [...subs.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "it"))),
      };
    }).filter((g) => g.rows.length);
  }, [sorted]);

  const excludedCount = investors.filter((i) => i.excluded).length;
  const filtersOn =
    !!query || status !== "all" || category !== "all" || owner !== "all" || role !== "all" || priority !== "all";

  const quick = (id: string, patch: { status?: RoundStatus; owner?: RoundOwner | null }) => {
    setPendingId(id);
    startTransition(async () => {
      const res = await quickUpdateRoundInvestor({ id, ...patch });
      if (!res.success) toast.error({ description: res.message ?? "Modifica non riuscita." });
      router.refresh();
      setPendingId(null);
    });
  };

  const resetFilters = () => {
    setQuery("");
    setStatus("all");
    setCategory("all");
    setOwner("all");
    setRole("all");
    setPriority("all");
  };

  return (
    <div className="space-y-5">
      {/* Barra strumenti */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a1a1aa]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca nome, organizzazione, note…"
              className="h-11 w-full rounded-xl border border-[#e9e9eb] bg-white pl-9 pr-9 text-[15px] outline-none transition-colors placeholder:text-[#a1a1aa] focus:border-[#111111]"
            />
            {query ? (
              <button
                type="button"
                aria-label="Svuota la ricerca"
                onClick={() => setQuery("")}
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-[#a1a1aa] hover:text-[#111111]"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2 md:ml-auto">
            <div className="flex flex-1 gap-1 rounded-xl bg-[#f1f1f2] p-1 md:flex-none">
              {[false, true].map((ex) => (
                <button
                  key={String(ex)}
                  type="button"
                  onClick={() => setShowExcluded(ex)}
                  className={cn(
                    "flex-1 cursor-pointer whitespace-nowrap rounded-[9px] px-3 py-1.5 text-sm transition-colors",
                    showExcluded === ex
                      ? "bg-white font-semibold text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      : "text-[#71717a] hover:text-[#111111]",
                  )}
                >
                  {ex ? `Esclusi ${excludedCount}` : `Nel round ${investors.length - excludedCount}`}
                </button>
              ))}
            </div>
            <FinButton onClick={() => setCreating(true)} className="h-11 px-3.5 sm:px-4">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Aggiungi</span>
            </FinButton>
          </div>
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          <FilterSelect
            value={status}
            onChange={setStatus}
            options={[["all", "Tutti gli stati"], ...ROUND_STATUSES.map((s) => [s, STATUS_LABEL[s]] as [string, string])]}
          />
          <FilterSelect
            value={category}
            onChange={setCategory}
            options={[["all", "Tutte le tipologie"], ...ROUND_CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]] as [string, string])]}
          />
          <FilterSelect
            value={owner}
            onChange={setOwner}
            options={[
              ["all", "Chiunque"],
              ...ROUND_OWNERS.map((o) => [o, OWNER_LABEL[o]] as [string, string]),
              ["none", "Nessuno assegnato"],
            ]}
          />
          <FilterSelect
            value={role}
            onChange={setRole}
            options={[
              ["all", "Lead e follower"],
              ...LEAD_ROLES.map((r) => [r, LEAD_ROLE_LABEL[r]] as [string, string]),
              ["none", "Non valutato"],
            ]}
          />
          <FilterSelect
            value={priority}
            onChange={setPriority}
            options={[["all", "Ogni priorità"], ...PRIORITIES.map((p) => [p, `Priorità ${p}`] as [string, string])]}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-10 cursor-pointer rounded-xl border border-[#e9e9eb] bg-white px-3 pr-8 text-sm text-[#3f3f46] outline-none focus:border-[#111111]"
          >
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          {filtersOn ? (
            <button
              type="button"
              onClick={resetFilters}
              className="h-10 shrink-0 cursor-pointer whitespace-nowrap px-2 text-sm font-medium text-[#111111] underline decoration-[#d4d4d8] underline-offset-4 hover:decoration-[#111111]"
            >
              Togli i filtri
            </button>
          ) : null}
        </div>
        <div className="text-[12.5px] tabular-nums text-[#71717a]">
          {filtered.length} {filtered.length === 1 ? "investitore" : "investitori"}
          {showExcluded ? " esclusi" : ""}
        </div>
      </div>

      {groups.length ? (
        groups.map((g) => (
          <FinCard key={g.category} className="overflow-hidden">
            <div className="flex flex-col gap-2.5 border-b border-[#f2f2f3] px-4 py-4 sm:flex-row sm:items-center sm:px-5">
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-[#111111]">{CATEGORY_LABEL[g.category as RoundCategory]}</h2>
                <span className="text-[13px] font-semibold tabular-nums text-[#a1a1aa]">{g.rows.length}</span>
              </div>
              {showExcluded ? null : (
                <StatusStack byStatus={g.byStatus} total={g.rows.length} className="h-1.5 sm:ml-auto sm:w-48" />
              )}
            </div>

            {g.subs.map(([sub, rows]) => (
              <div key={sub || "none"}>
                <div className="flex items-baseline gap-2 bg-[#fafafa] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a] sm:px-5">
                  <span className="truncate">{sub || "Senza sottocategoria"}</span>
                  <span className="tabular-nums text-[#a1a1aa]">{rows.length}</span>
                </div>
                <ul className="divide-y divide-[#f2f2f3]">
                  {rows.map((r) => (
                    <InvestorRow
                      key={r.id}
                      row={r}
                      today={today}
                      pending={pendingId === r.id}
                      onOpen={() => setOpen(r.id)}
                      onStatus={(s) => quick(r.id, { status: s })}
                      onOwner={(o) => quick(r.id, { owner: o })}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </FinCard>
        ))
      ) : (
        <FinCard>
          <FinEmpty
            compact
            icon={<Search className="h-5 w-5" />}
            title={showExcluded ? "Nessun escluso" : "Nessun investitore con questi filtri"}
            body={filtersOn ? "Prova a togliere qualche filtro." : "Aggiungi il primo contatto con «Aggiungi»."}
          />
        </FinCard>
      )}

      <InvestorSheet
        open={creating || !!openRow}
        investor={creating ? null : openRow}
        today={today}
        subcategories={[...new Set(investors.map((i) => i.subcategory).filter(Boolean) as string[])].sort()}
        onOpenChange={(o) => {
          if (o) return;
          setCreating(false);
          setOpen(null);
        }}
        onSaved={(id) => {
          setCreating(false);
          router.refresh();
          if (id) setOpen(id);
        }}
      />
    </div>
  );
}

function InvestorRow({
  row,
  today,
  pending,
  onOpen,
  onStatus,
  onOwner,
}: {
  row: RoundInvestorRow;
  today: string;
  pending: boolean;
  onOpen: () => void;
  onStatus: (s: RoundStatus) => void;
  onOwner: (o: RoundOwner | null) => void;
}) {
  return (
    <li
      onClick={onOpen}
      className={cn(
        "grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-[#fafafa] sm:px-5",
        "md:grid-cols-[minmax(0,1fr)_168px_52px_150px_104px] md:py-2.5",
        pending && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[14px] font-medium text-[#111111]">{row.name}</span>
          <PriorityTag priority={row.priority} />
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-[#71717a]">
          {row.excluded ? row.excludedReason : row.status === "bloccato" && row.blockedReason ? (
            <span className="text-[#9a3412]">{row.blockedReason}</span>
          ) : (
            (row.organization ?? "—")
          )}
        </div>
      </div>

      <div className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:justify-self-start">
        <StatusMenu value={row.status} onChange={onStatus} disabled={pending} size="sm" />
      </div>

      <div className="hidden md:block">
        <OwnerMenu value={row.owner} onChange={onOwner} disabled={pending} />
      </div>

      <div className="hidden min-w-0 items-center gap-1.5 md:flex">
        <LeadBadge role={row.leadRole} />
      </div>

      <div className="hidden text-right text-[13px] md:block">
        {row.nextStepOn ? (
          <NextStep ymd={row.nextStepOn} today={today} compact />
        ) : row.lastContactOn ? (
          <span className="tabular-nums text-[#a1a1aa]" title="Ultimo contatto">
            {shortDate(row.lastContactOn)}
          </span>
        ) : (
          <span className="text-[#d4d4d8]">—</span>
        )}
      </div>

      {/* Telefono: chi, ruolo e prossimo passo su una riga sola */}
      <div className="col-span-2 flex items-center gap-2 md:hidden" onClick={(e) => e.stopPropagation()}>
        <OwnerMenu value={row.owner} onChange={onOwner} disabled={pending} showName />
        <LeadBadge role={row.leadRole} />
        {row.nextStepOn ? (
          <span className="ml-auto text-[12.5px]">
            <NextStep ymd={row.nextStepOn} today={today} compact />
          </span>
        ) : null}
      </div>
    </li>
  );
}
