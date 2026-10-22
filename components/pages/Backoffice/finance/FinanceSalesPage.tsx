"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Plus, Users } from "lucide-react";

import type { SalesAgentRow, SalesDealRow } from "@/lib/finance/finance-data";
import { shiftMonth } from "@/lib/finance/finance-math";
import {
  commissionDueOn,
  percentLabel,
  salesMonthSummary,
  type FixedPayment,
  type SalesMonthRow,
} from "@/lib/finance/finance-sales";
import { cn } from "@/lib/utils";

import { SalesMonthTable } from "./SalesMonthTable";
import { SalesAgentSheet, SalesDealSheet, SalesFixedSheet, type DealCompanyOption } from "./SalesSheets";
import {
  FinButton,
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

const DEAL_GRID = "lg:grid-cols-[96px_minmax(0,1fr)_140px_110px_64px_110px_168px]";

export function FinanceSalesPage({
  month,
  today,
  agents,
  deals,
  fixedPayments,
  companies,
}: {
  month: string;
  today: string;
  agents: SalesAgentRow[];
  deals: SalesDealRow[];
  fixedPayments: FixedPayment[];
  companies: DealCompanyOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [agentSheet, setAgentSheet] = useState<{ open: boolean; agent: SalesAgentRow | null }>({
    open: false,
    agent: null,
  });
  const [dealSheet, setDealSheet] = useState<{ open: boolean; deal: SalesDealRow | null }>({
    open: false,
    deal: null,
  });
  const [fixedAgent, setFixedAgent] = useState<SalesAgentRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const name = monthName(month);
  const currentYm = today.slice(0, 7);
  const summary = useMemo(
    () => salesMonthSummary({ month, today, agents, deals, fixedPayments }),
    [month, today, agents, deals, fixedPayments],
  );
  const monthDeals = summary.deals as SalesDealRow[];
  const unpaidElsewhere = useMemo(
    () =>
      deals
        .filter((d) => !d.paidOn && d.commissionCents > 0 && d.closedOn.slice(0, 7) !== month)
        .sort((a, b) => a.closedOn.localeCompare(b.closedOn)),
    [deals, month],
  );
  const archived = agents.filter((a) => a.archived && !summary.rows.some((r) => r.agent.id === a.id));
  const activeCount = agents.filter((a) => !a.archived).length;
  const monthUnpaid = monthDeals.filter((d) => !d.paidOn && d.commissionCents > 0);

  const goMonth = (delta: number) =>
    startTransition(() => router.push(`/backoffice/finanza/vendite?mese=${shiftMonth(month, delta)}`));
  const refresh = () => router.refresh();
  const agentOf = (row: SalesMonthRow) => agents.find((a) => a.id === row.agent.id) ?? null;
  const defaultDate = month === currentYm ? today : `${month}-01`;

  return (
    <div className={cn("space-y-4 transition-opacity", isPending && "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav value={month} onPrev={() => goMonth(-1)} onNext={() => goMonth(1)} />
        <div className="flex gap-2">
          <FinButton variant="ghost" onClick={() => setAgentSheet({ open: true, agent: null })}>
            <Plus className="h-4 w-4" /> Sales
          </FinButton>
          {agents.length > 0 ? (
            <FinButton onClick={() => setDealSheet({ open: true, deal: null })}>
              <Plus className="h-4 w-4" /> Contratto
            </FinButton>
          ) : null}
        </div>
      </div>

      {agents.length === 0 ? (
        <FinCard>
          <FinEmpty
            icon={<Users className="h-5 w-5" />}
            title="Nessun sales"
            body="Aggiungi chi vende Reglo, con il fisso mensile e la commissione di default: poi si registrano i contratti che firma."
            action={
              <FinButton onClick={() => setAgentSheet({ open: true, agent: null })}>
                <Plus className="h-4 w-4" /> Aggiungi un sales
              </FinButton>
            }
          />
        </FinCard>
      ) : (
        <>
          <FinCard className="grid grid-cols-2 divide-[#f2f2f3] md:grid-cols-5 md:divide-x">
            <FinTotal
              label={`Contratti di ${name}`}
              value={String(summary.totals.dealsCount)}
              empty={summary.totals.dealsCount === 0}
              note={summary.totals.dealsCount === 0 ? "nessuno firmato" : "firmati nel mese"}
            />
            <FinTotal
              label="Valore"
              value={euroSmart(summary.totals.valueCents)}
              empty={summary.totals.dealsCount === 0}
              note="IVA inclusa"
            />
            <FinTotal
              label="Commissioni"
              value={euroSmart(summary.totals.commissionCents)}
              empty={summary.totals.commissionCents === 0}
              note={
                summary.totals.commissionCents === 0
                  ? "maturano alla firma"
                  : monthUnpaid.length === 0
                    ? "tutte pagate"
                    : `da pagare entro il ${fullDate(commissionDueOn(`${month}-01`))}`
              }
            />
            <FinTotal
              label="Fissi"
              value={euroSmart(summary.totals.fixedCents)}
              empty={summary.totals.fixedCents === 0}
              note={
                month < currentYm
                  ? "pagati nel mese"
                  : `${activeCount} ${activeCount === 1 ? "sales attivo" : "sales attivi"}`
              }
            />
            <FinTotal
              className="col-span-2 md:col-span-1"
              label="Compenso"
              value={euroSmart(summary.totals.compensationCents)}
              empty={summary.totals.compensationCents === 0}
              note="fissi + commissioni"
            />
          </FinCard>

          <FinCard className="px-5 pb-3 pt-[22px] sm:px-[26px]">
            <h3 className="mb-1 text-base font-semibold text-[#111111]">Vendite di {name}</h3>
            <div className="mb-3 text-[13px] text-[#71717a]">
              Compenso = fisso mensile + commissioni sui contratti firmati nel mese.
              {month < currentYm ? " Nei mesi chiusi il fisso conta solo se è stato pagato." : null}
            </div>
            <SalesMonthTable
              summary={summary}
              isFutureMonth={month > currentYm}
              onAgent={(row) => setAgentSheet({ open: true, agent: agentOf(row) })}
              onPayFixed={(row) => setFixedAgent(agentOf(row))}
            />
            {archived.length > 0 ? (
              <div className="border-t border-[#f2f2f3] py-3 text-[13px] text-[#71717a]">
                {showArchived ? (
                  <div className="flex flex-wrap items-center gap-2">
                    Archiviati:
                    {archived.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAgentSheet({ open: true, agent: a })}
                        className="cursor-pointer rounded-lg border border-[#e9e9eb] px-2.5 py-1 text-[12.5px] font-medium text-[#3f3f46] hover:border-[#d4d4d8]"
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowArchived(true)}
                    className="cursor-pointer hover:text-[#111111]"
                  >
                    {archived.length === 1 ? "1 sales archiviato" : `${archived.length} sales archiviati`} ·{" "}
                    <span className="font-semibold underline-offset-2 hover:underline">mostra</span>
                  </button>
                )}
              </div>
            ) : null}
          </FinCard>

          <FinCard className="overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-[22px] sm:px-[26px]">
              <div>
                <h3 className="mb-1 text-base font-semibold text-[#111111]">Contratti di {name}</h3>
                <div className="text-[13px] text-[#71717a]">
                  La commissione matura alla firma e si paga entro la fine del mese dopo.
                </div>
              </div>
            </div>
            {monthDeals.length === 0 ? (
              <FinEmpty
                compact
                icon={<FileSignature className="h-5 w-5" />}
                title={`Nessun contratto firmato a ${name}`}
                body="Quando un sales chiude un'autoscuola, registra il contratto: il valore si precompila dal piano."
                action={
                  <FinButton variant="ghost" onClick={() => setDealSheet({ open: true, deal: null })}>
                    <Plus className="h-4 w-4" /> Registra un contratto
                  </FinButton>
                }
              />
            ) : (
              <DealList deals={monthDeals} today={today} onOpen={(d) => setDealSheet({ open: true, deal: d })} />
            )}
          </FinCard>

          {unpaidElsewhere.length > 0 ? (
            <FinCard className="overflow-hidden">
              <div className="px-5 pb-3 pt-[22px] sm:px-[26px]">
                <h3 className="mb-1 text-base font-semibold text-[#111111]">Commissioni ancora da pagare</h3>
                <div className="text-[13px] text-[#71717a]">
                  Contratti di altri mesi. Totale{" "}
                  <b className="font-semibold text-[#111111] tabular-nums">
                    {euroSmart(unpaidElsewhere.reduce((t, d) => t + d.commissionCents, 0))}
                  </b>
                  .
                </div>
              </div>
              <DealList
                deals={unpaidElsewhere}
                today={today}
                onOpen={(d) => setDealSheet({ open: true, deal: d })}
              />
            </FinCard>
          ) : null}
        </>
      )}

      <SalesAgentSheet
        open={agentSheet.open}
        onOpenChange={(open) => setAgentSheet((s) => ({ ...s, open }))}
        agent={agentSheet.agent}
        onSaved={refresh}
      />
      <SalesDealSheet
        open={dealSheet.open}
        onOpenChange={(open) => setDealSheet((s) => ({ ...s, open }))}
        deal={dealSheet.deal}
        agents={agents}
        companies={companies}
        today={today}
        defaultDate={defaultDate}
        onSaved={refresh}
      />
      <SalesFixedSheet
        open={fixedAgent !== null}
        onOpenChange={(open) => !open && setFixedAgent(null)}
        agent={fixedAgent}
        month={month}
        today={today}
        onSaved={refresh}
      />
    </div>
  );
}

function DealList({
  deals,
  today,
  onOpen,
}: {
  deals: SalesDealRow[];
  today: string;
  onOpen: (deal: SalesDealRow) => void;
}) {
  return (
    <>
      <div className={cn("hidden gap-4 border-y border-[#f2f2f3] px-6 py-3 lg:grid", DEAL_GRID)}>
        <FinLabel>Firmato</FinLabel>
        <FinLabel>Autoscuola</FinLabel>
        <FinLabel>Sales</FinLabel>
        <FinLabel className="text-right">Valore</FinLabel>
        <FinLabel className="text-right">%</FinLabel>
        <FinLabel className="text-right">Commissione</FinLabel>
        <FinLabel className="text-right">Pagamento</FinLabel>
      </div>
      {deals.map((d) => {
        const due = commissionDueOn(d.closedOn);
        const overdue = !d.paidOn && d.commissionCents > 0 && due < today;
        return (
          <div
            key={d.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(d)}
            onKeyDown={(e) => e.key === "Enter" && onOpen(d)}
            className={cn(
              "grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 border-t border-[#f2f2f3] px-5 py-3.5 first:border-t-0 hover:bg-[#fafafa] lg:px-6 lg:first:border-t-0",
              DEAL_GRID,
            )}
          >
            <div className="hidden text-sm tabular-nums text-[#3f3f46] lg:block">{shortDate(d.closedOn)}</div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-[#111111]">{d.companyName}</div>
              <div className="truncate text-[12.5px] text-[#71717a] lg:hidden">
                {shortDate(d.closedOn)} · {d.agentName} · {euroSmart(d.contractValueCents)} ·{" "}
                {percentLabel(d.commissionBps)}
              </div>
            </div>
            <div className="hidden truncate text-sm text-[#3f3f46] lg:block">{d.agentName}</div>
            <div className="hidden text-right text-sm tabular-nums lg:block">{euroSmart(d.contractValueCents)}</div>
            <div className="hidden text-right text-sm tabular-nums text-[#71717a] lg:block">
              {percentLabel(d.commissionBps)}
            </div>
            <div className="text-right text-sm font-semibold tabular-nums lg:order-none">
              {d.commissionCents > 0 ? euroSmart(d.commissionCents) : <span className="font-normal text-[#a1a1aa]">—</span>}
              <div className="text-[12px] font-normal lg:hidden">
                <PaymentState deal={d} due={due} overdue={overdue} />
              </div>
            </div>
            <div className="hidden text-right text-[13px] lg:block">
              <PaymentState deal={d} due={due} overdue={overdue} />
            </div>
          </div>
        );
      })}
    </>
  );
}

function PaymentState({ deal, due, overdue }: { deal: SalesDealRow; due: string; overdue: boolean }) {
  if (deal.commissionCents <= 0) return <span className="text-[#a1a1aa]">senza commissione</span>;
  if (deal.paidOn) return <span className="text-[#71717a]">pagata il {shortDate(deal.paidOn)}</span>;
  if (overdue) return <Pill tone="warn">scaduta il {shortDate(due)}</Pill>;
  return <span className="text-[#3f3f46]">entro il {shortDate(due)}</span>;
}

const shortDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"][m - 1]} ${String(y).slice(2)}`;
};
