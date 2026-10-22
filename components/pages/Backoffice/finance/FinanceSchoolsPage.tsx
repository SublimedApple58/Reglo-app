"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Search } from "lucide-react";

import { BackofficeCompanyPlanDialog } from "@/components/pages/Backoffice/BackofficeCompanyPlanDialog";
import type { FinanceSchoolRow } from "@/lib/finance/finance-data";
import { shiftMonth } from "@/lib/finance/finance-math";
import { planNeedsRenewal, schoolState, schoolsTotals, type SchoolState } from "@/lib/finance/finance-schools";
import { cn } from "@/lib/utils";

import { SchoolSheet } from "./SchoolSheet";
import {
  FilterSelect,
  FinCard,
  FinEmpty,
  FinLabel,
  FinTotal,
  MonthNav,
  Pill,
  euroSmart,
  fullDate,
  monthName,
} from "./finance-ui";

export type SalesAgentOption = { id: string; name: string; archived: boolean };

const STATE_LABEL: Record<SchoolState, string> = {
  active: "Attiva",
  paused: "In pausa",
  churned: "Disdetta",
  incomplete: "da completare",
};

export function StatePill({ state }: { state: SchoolState }) {
  if (state === "incomplete") return <Pill tone="dashed">{STATE_LABEL[state]}</Pill>;
  if (state === "active") return <Pill>{STATE_LABEL[state]}</Pill>;
  return <Pill tone="outline">{STATE_LABEL[state]}</Pill>;
}

const GRID =
  "lg:grid-cols-[minmax(0,1fr)_104px_120px_112px_128px_76px_96px_84px_84px]";

const nf = (n: number) => new Intl.NumberFormat("it-IT", { useGrouping: "always" }).format(n);

type StateFilter = "all" | SchoolState;
type PlanFilter = "all" | "with" | "without" | "renewal";

export function FinanceSchoolsPage({
  month,
  today,
  schools,
  agents,
}: {
  month: string;
  today: string;
  schools: FinanceSchoolRow[];
  agents: SalesAgentOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<StateFilter>("all");
  const [agent, setAgent] = useState("all");
  const [plan, setPlan] = useState<PlanFilter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<FinanceSchoolRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [planCompany, setPlanCompany] = useState<{ id: string; name: string } | null>(null);

  const name = monthName(month);
  const all = useMemo(() => schoolsTotals(schools), [schools]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return schools.filter((s) => {
      if (state !== "all" && schoolState(s) !== state) return false;
      if (agent === "none" && s.commercial?.agentId) return false;
      if (agent !== "all" && agent !== "none" && s.commercial?.agentId !== agent) return false;
      if (plan === "with" && !s.plan) return false;
      if (plan === "without" && s.plan) return false;
      if (plan === "renewal" && !planNeedsRenewal(s)) return false;
      if (!q) return true;
      return [s.name, s.commercial?.vatNumber, s.commercial?.region, s.commercial?.agentName]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [schools, state, agent, plan, query]);
  const shown = useMemo(() => schoolsTotals(filtered), [filtered]);

  const goMonth = (delta: number) =>
    startTransition(() =>
      router.push(`/backoffice/finanza/autoscuole?mese=${shiftMonth(month, delta)}`),
    );
  const openSchool = (s: FinanceSchoolRow) => {
    setEditing(s);
    setSheetOpen(true);
  };

  const stateCounts: Array<[StateFilter, string, number]> = [
    ["all", "Tutte", all.count],
    ["active", "Attive", all.active],
    ["paused", "In pausa", all.paused],
    ["churned", "Disdette", all.churned],
    ["incomplete", "Da completare", all.incomplete],
  ];

  return (
    <div className={cn("space-y-4 transition-opacity", isPending && "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav value={month} onPrev={() => goMonth(-1)} onNext={() => goMonth(1)} />
        <p className="text-[13px] text-[#71717a]">
          Le autoscuole arrivano dalla piattaforma: qui si completa l&apos;anagrafica commerciale.
        </p>
      </div>

      {schools.length === 0 ? (
        <FinCard>
          <FinEmpty
            icon={<Building2 className="h-5 w-5" />}
            title="Nessuna autoscuola cliente"
            body="Qui compaiono le autoscuole iscritte a Reglo, senza quelle di prova, quelle demo e le consorziate."
          />
        </FinCard>
      ) : (
        <>
          <FinCard className="grid grid-cols-2 divide-[#f2f2f3] md:grid-cols-5 md:divide-x">
            <FinTotal
              label="Autoscuole"
              value={nf(all.count)}
              note={`${all.active} ${all.active === 1 ? "attiva" : "attive"} · ${all.paused} in pausa · ${all.churned} ${all.churned === 1 ? "disdetta" : "disdette"}`}
            />
            <FinTotal
              label="Valore piani"
              value={`${euroSmart(all.planAnnualCents)}`}
              note={
                all.plansToComplete > 0 ? (
                  <span>
                    l&apos;anno · <b className="font-semibold text-[#111111]">{all.plansToComplete}</b> senza rinnovo
                  </span>
                ) : (
                  "l'anno, disdette escluse"
                )
              }
            />
            <FinTotal label="Istruttori" value={nf(all.instructors)} note="che possono stare in agenda" />
            <FinTotal
              label="Allievi"
              value={nf(all.students)}
              note={`${nf(all.activeStudentsMonth)} con guide a ${name}`}
            />
            <FinTotal
              className="col-span-2 md:col-span-1"
              label={`Guide di ${name}`}
              value={nf(all.lessonsMonth)}
              note={`${nf(all.lessonsTotal)} in totale`}
            />
          </FinCard>

          {/* Filtri */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-[#f1f1f2] p-1">
              {stateCounts.map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setState(value)}
                  className={cn(
                    "cursor-pointer whitespace-nowrap rounded-[9px] px-3 py-1.5 text-sm",
                    state === value
                      ? "bg-white font-semibold text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      : "text-[#71717a] hover:text-[#111111]",
                  )}
                >
                  {label}
                  <span className="ml-1.5 text-[12px] font-medium text-[#a1a1aa] tabular-nums">{count}</span>
                </button>
              ))}
            </div>
            <FilterSelect
              value={agent}
              onChange={setAgent}
              options={[
                ["all", "Tutti i sales"],
                ["none", "Senza sales"],
                ...agents.map((a) => [a.id, a.name] as [string, string]),
              ]}
            />
            <FilterSelect
              value={plan}
              onChange={(v) => setPlan(v as PlanFilter)}
              options={[
                ["all", "Tutti i piani"],
                ["with", "Con piano"],
                ["without", "Senza piano"],
                ["renewal", "Rinnovo da completare"],
              ]}
            />
            <div className="relative ml-auto w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a1a1aa]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca nome, P.IVA, regione, sales"
                className="h-10 w-full rounded-xl border border-[#e9e9eb] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[#a1a1aa] focus:border-[#111111]"
              />
            </div>
          </div>

          {/* Elenco */}
          <FinCard className="overflow-hidden">
            <div className={cn("hidden gap-4 border-b border-[#f2f2f3] px-6 py-3 lg:grid", GRID)}>
              <FinLabel>Autoscuola</FinLabel>
              <FinLabel>Stato</FinLabel>
              <FinLabel>Sales</FinLabel>
              <FinLabel className="text-right">Piano / anno</FinLabel>
              <FinLabel>Rinnovo</FinLabel>
              <FinLabel className="text-right">Istrutt.</FinLabel>
              <FinLabel className="text-right">Allievi</FinLabel>
              <FinLabel className="text-right">Guide {name.slice(0, 3)}</FinLabel>
              <FinLabel className="text-right">Guide tot.</FinLabel>
            </div>
            {filtered.length === 0 ? (
              <FinEmpty compact title="Nessuna autoscuola con questi filtri" body="Cambia i filtri o la ricerca." />
            ) : (
              filtered.map((s) => <SchoolRow key={s.id} school={s} today={today} onOpen={openSchool} />)
            )}
            {filtered.length > 0 ? (
              <div
                className={cn(
                  "grid grid-cols-[1fr_auto] items-center gap-4 border-t border-[#e9e9eb] bg-[#fafafa] px-4 py-3.5 text-sm font-semibold tabular-nums lg:px-6",
                  GRID,
                )}
              >
                <div>
                  Totale <span className="font-normal text-[#71717a]">· {filtered.length} {filtered.length === 1 ? "autoscuola" : "autoscuole"}</span>
                </div>
                <div className="hidden lg:block" />
                <div className="hidden lg:block" />
                <div className="text-right">
                  {euroSmart(shown.planAnnualCents)}
                  <span className="font-normal text-[#71717a] lg:hidden"> l&apos;anno</span>
                </div>
                <div className="hidden lg:block" />
                <div className="hidden text-right lg:block">{nf(shown.instructors)}</div>
                <div className="hidden text-right lg:block">{nf(shown.students)}</div>
                <div className="hidden text-right lg:block">{nf(shown.lessonsMonth)}</div>
                <div className="hidden text-right lg:block">{nf(shown.lessonsTotal)}</div>
              </div>
            ) : null}
          </FinCard>
          <p className="text-[12px] text-[#a1a1aa]">
            Numeri d&apos;uso contati come nei KPI: istruttori che possono stare in agenda, guide
            svolte per data della guida. Il valore dei piani è IVA inclusa; le disdette non entrano
            nel totale in alto.
          </p>
        </>
      )}

      <SchoolSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        school={editing}
        today={today}
        month={month}
        agents={agents}
        onSaved={() => router.refresh()}
        onEditPlan={(company) => {
          setSheetOpen(false);
          setPlanCompany(company);
        }}
      />
      <BackofficeCompanyPlanDialog
        company={planCompany}
        onOpenChange={(open) => {
          if (open) return;
          setPlanCompany(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function SchoolRow({
  school: s,
  today,
  onOpen,
}: {
  school: FinanceSchoolRow;
  today: string;
  onOpen: (s: FinanceSchoolRow) => void;
}) {
  const state = schoolState(s);
  const sub = [s.commercial?.region, s.commercial?.vatNumber ? `P.IVA ${s.commercial.vatNumber}` : null]
    .filter(Boolean)
    .join(" · ");
  const renewalSoon = s.plan?.renewsAt && s.plan.renewsAt >= today;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(s)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(s)}
      className={cn(
        "grid cursor-pointer grid-cols-[1fr_auto] items-center gap-4 border-t border-[#f2f2f3] px-4 py-3.5 first:border-t-0 hover:bg-[#fafafa] lg:px-6",
        GRID,
        state === "churned" && "text-[#71717a]",
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-[#111111]">{s.name}</div>
        <div className="truncate text-[12.5px] text-[#71717a]">
          {sub || (s.commercial ? null : <span className="text-[#a1a1aa]">anagrafica da completare</span>)}
          <span className="lg:hidden">
            {sub || !s.commercial ? " · " : null}
            {s.lessonsMonth} guide nel mese
          </span>
        </div>
      </div>
      <div className="hidden lg:block">
        <StatePill state={state} />
      </div>
      <div className="hidden truncate text-sm text-[#3f3f46] lg:block">
        {s.commercial?.agentName ?? <span className="text-[#a1a1aa]">—</span>}
      </div>
      <div className="text-right text-sm font-semibold tabular-nums">
        {s.plan ? (
          s.plan.annualCents > 0 ? (
            euroSmart(s.plan.annualCents)
          ) : (
            <span className="font-normal text-[#71717a]">gratuito</span>
          )
        ) : (
          <span className="font-normal text-[#a1a1aa]">nessun piano</span>
        )}
        <div className="mt-0.5 lg:hidden">
          <StatePill state={state} />
        </div>
      </div>
      <div className="hidden text-sm lg:block">
        {planNeedsRenewal(s) ? (
          <Pill tone="dashed">da completare</Pill>
        ) : s.plan?.renewsAt ? (
          <span className={renewalSoon ? "text-[#3f3f46]" : "text-[#a1a1aa]"}>{fullDate(s.plan.renewsAt)}</span>
        ) : (
          <span className="text-[#a1a1aa]">—</span>
        )}
      </div>
      <Num value={s.instructors} />
      <div className="hidden text-right text-sm tabular-nums lg:block">
        {nf(s.students)}
        {s.activeStudentsMonth > 0 ? (
          <div className="text-[11.5px] text-[#a1a1aa]">{nf(s.activeStudentsMonth)} attivi</div>
        ) : null}
      </div>
      <Num value={s.lessonsMonth} />
      <Num value={s.lessonsTotal} />
    </div>
  );
}

function Num({ value }: { value: number }) {
  return (
    <div className={cn("hidden text-right text-sm tabular-nums lg:block", value === 0 && "text-[#a1a1aa]")}>
      {nf(value)}
    </div>
  );
}
