"use client";

import type { SalesMonthRow, SalesMonthSummary } from "@/lib/finance/finance-sales";
import { cn } from "@/lib/utils";

import { Pill, euroSmart, fullDate } from "./finance-ui";

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "·";

const dash = <span className="font-normal text-[#a1a1aa]">—</span>;

/**
 * La tabella «Vendite del mese» del mockup: per sales contratti, valore,
 * commissioni, fisso e compenso, con il totale in fondo. In Panoramica è in
 * sola lettura; in Vendite le righe aprono il sales e il fisso si segna pagato.
 */
export function SalesMonthTable({
  summary,
  isFutureMonth,
  onAgent,
  onPayFixed,
}: {
  summary: SalesMonthSummary;
  isFutureMonth?: boolean;
  onAgent?: (row: SalesMonthRow) => void;
  onPayFixed?: (row: SalesMonthRow) => void;
}) {
  const withStatus = Boolean(onPayFixed);
  const grid = withStatus
    ? "grid-cols-[minmax(0,1fr)_72px_110px_110px_100px_116px_128px]"
    : "grid-cols-[minmax(0,1fr)_72px_110px_110px_100px_116px]";
  const { totals } = summary;

  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <div className={cn(withStatus ? "min-w-[760px]" : "min-w-[620px]")}>
        <div
          className={cn(
            "grid gap-3 pb-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]",
            grid,
          )}
        >
          <div className="text-left">Sales</div>
          <div>Contratti</div>
          <div>Valore</div>
          <div>Commissioni</div>
          <div>Fisso</div>
          <div>Compenso</div>
          {withStatus ? <div>Fisso del mese</div> : null}
        </div>
        {summary.rows.map((row) => (
          <div
            key={row.agent.id}
            role={onAgent ? "button" : undefined}
            tabIndex={onAgent ? 0 : undefined}
            onClick={onAgent ? () => onAgent(row) : undefined}
            onKeyDown={onAgent ? (e) => e.key === "Enter" && onAgent(row) : undefined}
            className={cn(
              "grid items-center gap-3 border-t border-[#f2f2f3] py-[11px] text-right text-sm tabular-nums",
              grid,
              onAgent && "-mx-2 cursor-pointer rounded-lg px-2 hover:bg-[#fafafa]",
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5 text-left">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f1f1f2] text-xs font-semibold text-[#111111]">
                {initial(row.agent.name)}
              </span>
              <span className="truncate font-medium text-[#111111]">{row.agent.name}</span>
              {row.agent.archived ? <Pill tone="outline">archiviato</Pill> : null}
            </div>
            <div className={row.dealsCount === 0 ? "text-[#a1a1aa]" : undefined}>{row.dealsCount}</div>
            <div>{row.valueCents > 0 ? euroSmart(row.valueCents) : dash}</div>
            <div>{row.commissionCents > 0 ? euroSmart(row.commissionCents) : dash}</div>
            <div>{row.fixedCents !== null && row.fixedCents > 0 ? euroSmart(row.fixedCents) : dash}</div>
            <div className="font-semibold text-[#111111]">
              {row.compensationCents > 0 ? euroSmart(row.compensationCents) : dash}
            </div>
            {withStatus ? (
              <div onClick={(e) => e.stopPropagation()}>
                {row.fixedPaid ? (
                  <span className="text-[12.5px] text-[#71717a]">pagato il {shortDate(row.fixedPaid.paidOn)}</span>
                ) : row.agent.archived || !row.agent.monthlyFixedCents ? (
                  <span className="text-[12.5px] text-[#a1a1aa]">senza fisso</span>
                ) : isFutureMonth ? (
                  <span className="text-[12.5px] text-[#a1a1aa]">previsto</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPayFixed?.(row)}
                    className="cursor-pointer rounded-lg border border-[#e9e9eb] bg-white px-2.5 py-1 text-[12.5px] font-semibold text-[#111111] hover:border-[#d4d4d8] hover:bg-[#fafafa]"
                  >
                    Segna pagato
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ))}
        <div
          className={cn(
            "grid items-center gap-3 border-t border-[#e9e9eb] py-[11px] text-right text-sm font-bold tabular-nums",
            grid,
          )}
        >
          <div className="text-left">Totale</div>
          <div>{totals.dealsCount}</div>
          <div>{totals.valueCents > 0 ? euroSmart(totals.valueCents) : dash}</div>
          <div>{totals.commissionCents > 0 ? euroSmart(totals.commissionCents) : dash}</div>
          <div>{totals.fixedCents > 0 ? euroSmart(totals.fixedCents) : dash}</div>
          <div>{totals.compensationCents > 0 ? euroSmart(totals.compensationCents) : dash}</div>
          {withStatus ? <div /> : null}
        </div>
      </div>
    </div>
  );
}

const shortDate = (ymd: string) => fullDate(ymd).replace(/ \d{4}$/, "");
