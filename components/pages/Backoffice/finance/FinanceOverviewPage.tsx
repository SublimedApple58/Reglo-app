"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, BarChart3, CalendarClock, Plus, Repeat, Users } from "lucide-react";

import {
  UPCOMING_DAYS,
  cashSummary,
  chartMonths,
  fixedMonthlyCents,
  monthSummary,
  mrrSummary,
  upcomingItems,
  vatSummary,
  type ForecastItem,
  type OverviewInput,
} from "@/lib/finance/finance-overview";
import { shiftMonth } from "@/lib/finance/finance-math";
import { salesMonthSummary } from "@/lib/finance/finance-sales";
import { cn } from "@/lib/utils";

import { FinanceChart } from "./FinanceChart";
import { FinanceEntrySheet, type FinanceCategoryOption } from "./FinanceEntrySheet";
import { OpeningBalanceSheet } from "./OpeningBalanceSheet";
import { RecurringGroupBreakdown, recurringGroups } from "./RecurringSummary";
import { SalesMonthTable } from "./SalesMonthTable";
import {
  FinButton,
  FinCard,
  FinEmpty,
  FinLabel,
  MonthNav,
  Pill,
  dayMonth,
  euroSmart,
  fullDate,
  monthName,
} from "./finance-ui";

const UPCOMING_ROWS = 8;

/** Numero grande senza «€»: il simbolo va a parte, più piccolo e grigio. */
const amountOnly = (cents: number, sign = false) => euroSmart(cents, { sign }).replace(/\s€$/, "");

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function FinanceOverviewPage({
  input,
  categories,
  companies,
}: {
  input: OverviewInput;
  categories: FinanceCategoryOption[];
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [entryOpen, setEntryOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);

  const summary = useMemo(() => monthSummary(input), [input]);
  const mrr = useMemo(() => mrrSummary(input), [input]);
  const cash = useMemo(() => cashSummary(input), [input]);
  const vat = useMemo(() => vatSummary(input), [input]);
  const months = useMemo(() => chartMonths(input), [input]);
  const upcoming = useMemo(() => upcomingItems(input), [input]);
  // Spese fisse: le ricorrenti attive più il fisso dei sales attivi (gruppo «Persone»).
  const groups = useMemo(
    () =>
      recurringGroups([
        ...input.recurring.filter((r) => r.active),
        ...input.agents
          .filter((a) => !a.archived && a.monthlyFixedCents > 0)
          .map((a) => ({ name: `Fisso ${a.name}`, categoryGroup: "persone", monthlyCents: a.monthlyFixedCents })),
      ]),
    [input.recurring, input.agents],
  );
  const fixedMonthly = fixedMonthlyCents(input);
  const sales = useMemo(
    () =>
      salesMonthSummary({
        month: input.month,
        today: input.today,
        agents: input.agents,
        deals: input.deals,
        fixedPayments: input.fixedPayments,
      }),
    [input],
  );

  const goMonth = (delta: number) =>
    startTransition(() => router.push(`/backoffice/finanza?mese=${shiftMonth(input.month, delta)}`));
  const refresh = () => router.refresh();

  const chartHasData = months.some(
    (m) =>
      m.actualInCents + m.actualOutCents + m.forecastInCents + m.forecastOutCents > 0 ||
      m.cashCents !== null,
  );
  const defaultDate = input.month === input.today.slice(0, 7) ? input.today : `${input.month}-01`;

  return (
    <div className={cn("space-y-4 transition-opacity", isPending && "opacity-70")}>
      {/* Barra: mese + azione */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav value={input.month} onPrev={() => goMonth(-1)} onNext={() => goMonth(1)} />
        <FinButton onClick={() => setEntryOpen(true)}>
          <Plus className="h-4 w-4" /> Movimento
        </FinButton>
      </div>

      {/* Hero: margine, MRR, cassa */}
      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr_1fr]">
        <MarginCard summary={summary} onAdd={() => setEntryOpen(true)} />
        <MrrCard mrr={mrr} />
        <CashCard cash={cash} input={input} onEdit={() => setBalanceOpen(true)} />
      </section>

      {/* Grafico 12 mesi */}
      <FinCard className="px-5 pb-[18px] pt-6 sm:px-[26px]">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="mb-1 text-base font-semibold text-[#111111]">Entrate e uscite, 12 mesi</h3>
            <div className="text-[13px] text-[#71717a]">
              Sei mesi chiusi, sei di previsione (rinnovi dei piani, spese fisse, fissi e commissioni dei
              sales).
              {input.openingBalanceCents !== null ? " Cassa sull'asse di destra." : ""}
            </div>
          </div>
          {chartHasData ? (
            <div className="flex flex-wrap gap-x-[22px] gap-y-1.5 whitespace-nowrap text-[13px] text-[#71717a]">
              <LegendDot style={{ background: "#111111" }}>Entrate</LegendDot>
              <LegendDot style={{ background: "#c9c9cf" }}>Uscite</LegendDot>
              <LegendDot style={{ background: "#fff", border: "1.5px dashed #111111" }}>Previsione</LegendDot>
              {input.openingBalanceCents !== null ? (
                <span className="inline-flex items-center">
                  <span className="mr-1.5 inline-block w-3.5 border-t-2 border-[#8a8a92]" />
                  Cassa
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {chartHasData ? (
          <>
            <FinanceChart months={months} />
            {mrr.missingRenewalCount > 0 ? (
              <p className="mt-2 text-[12.5px] text-[#71717a]">
                {mrr.missingRenewalCount === 1
                  ? "1 piano a pagamento non ha la data di rinnovo: non entra nella previsione."
                  : `${mrr.missingRenewalCount} piani a pagamento non hanno la data di rinnovo: non entrano nella previsione.`}
              </p>
            ) : null}
          </>
        ) : (
          <FinEmpty
            compact
            icon={<BarChart3 className="h-5 w-5" />}
            title="Ancora niente da disegnare"
            body="Il grafico si riempie con i movimenti registrati, le spese fisse e i rinnovi dei piani delle autoscuole."
          />
        )}
      </FinCard>

      {/* In arrivo + colonna IVA / spese fisse */}
      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <UpcomingCard items={upcoming} today={input.today} />
        <div className="space-y-4">
          <VatCard vat={vat} month={input.month} />
          <FinCard className="px-[26px] py-[22px]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="mb-1 text-base font-semibold text-[#111111]">Spese fisse</h3>
                <div className="text-[13px] text-[#71717a]">
                  Ricorrenti attive e fissi dei sales, riportate al mese
                </div>
              </div>
              <Link
                href="/backoffice/finanza/spese-fisse"
                className="whitespace-nowrap text-[13px] font-semibold text-[#111111] underline-offset-2 hover:underline"
              >
                Gestisci
              </Link>
            </div>
            {fixedMonthly > 0 ? (
              <>
                <div className="mt-3.5 text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
                  {amountOnly(fixedMonthly)}
                  <small className="ml-1 text-lg font-medium text-[#a1a1aa]">€ / mese</small>
                </div>
                <RecurringGroupBreakdown groups={groups} />
              </>
            ) : (
              <FinEmpty
                compact
                icon={<Repeat className="h-5 w-5" />}
                title="Nessuna spesa fissa"
                body="Stipendi, abbonamenti e consulenze che si ripetono entrano da soli nelle previsioni."
              />
            )}
          </FinCard>
        </div>
      </section>

      <SalesCard summary={sales} hasAgents={input.agents.length > 0} />

      <FinanceEntrySheet
        open={entryOpen}
        onOpenChange={setEntryOpen}
        entry={null}
        defaultDate={defaultDate}
        categories={categories}
        companies={companies}
        onSaved={refresh}
      />
      <OpeningBalanceSheet
        open={balanceOpen}
        onOpenChange={setBalanceOpen}
        today={input.today}
        balanceCents={input.openingBalanceCents}
        date={input.openingDate}
        onSaved={refresh}
      />
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

function BigEmpty({ size = "mid" }: { size?: "big" | "mid" }) {
  return (
    <div
      className={cn(
        "font-semibold leading-none tracking-[-0.02em] text-[#d4d4d8]",
        size === "big" ? "my-4 text-[52px]" : "mb-2.5 mt-4 text-[34px]",
      )}
    >
      —
    </div>
  );
}

function MarginCard({ summary, onAdd }: { summary: ReturnType<typeof monthSummary>; onAdd: () => void }) {
  const { totals } = summary;
  const name = monthName(summary.ym);
  const prevName = monthName(shiftMonth(summary.ym, -1));
  const delta = summary.prevMarginCents === null ? null : summary.marginCents - summary.prevMarginCents;
  const flow = totals.inSettledCents + totals.outSettledCents;

  return (
    <FinCard className="px-[26px] py-6">
      <FinLabel>Margine di {name}</FinLabel>
      {!summary.hasEntries ? (
        <>
          <BigEmpty size="big" />
          <p className="text-[13px] leading-relaxed text-[#71717a]">
            Nessun movimento a {name}. Il margine è quanto incassato meno quanto pagato nel mese.
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-3 cursor-pointer text-[13px] font-semibold text-[#111111] underline-offset-2 hover:underline"
          >
            Registra un movimento
          </button>
        </>
      ) : (
        <>
          <div className="my-4 flex flex-wrap items-baseline gap-x-2 text-[52px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
            <span>
              {amountOnly(summary.marginCents, true)}
              <small className="ml-1 text-2xl font-medium text-[#a1a1aa]">€</small>
            </span>
            {delta !== null && delta !== 0 ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 self-center whitespace-nowrap rounded-[7px] px-[7px] py-[3px] text-xs font-semibold tracking-normal",
                  delta > 0 ? "bg-[#f0fdf4] text-[#15803d]" : "bg-[#fff7ed] text-[#c2410c]",
                )}
              >
                {delta > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {euroSmart(Math.abs(delta))} su {prevName}
              </span>
            ) : null}
          </div>
          <div className="mb-3 mt-[18px] flex h-2 overflow-hidden rounded-full bg-[#f2f2f3]">
            {flow > 0 ? (
              <>
                <i style={{ width: `${(totals.inSettledCents / flow) * 100}%`, background: "#111111" }} />
                <i style={{ width: `${(totals.outSettledCents / flow) * 100}%`, background: "#c9c9cf" }} />
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-[22px] gap-y-1.5 whitespace-nowrap text-[13px] text-[#71717a]">
            <LegendDot style={{ background: "#111111" }}>
              Incassato<b className="ml-1 font-semibold text-[#111111] tabular-nums">{euroSmart(totals.inSettledCents)}</b>
            </LegendDot>
            <LegendDot style={{ background: "#c9c9cf" }}>
              Pagato<b className="ml-1 font-semibold text-[#111111] tabular-nums">{euroSmart(totals.outSettledCents)}</b>
            </LegendDot>
          </div>
          <div className="mt-2 text-[13px] text-[#71717a]">
            {totals.inDueCents > 0 || totals.plannedInCents > 0 ? (
              <>
                {totals.inDueCents > 0 ? (
                  <>
                    da incassare <b className="font-semibold text-[#111111] tabular-nums">{euroSmart(totals.inDueCents)}</b>
                  </>
                ) : null}
                {totals.inDueCents > 0 && totals.plannedInCents > 0 ? " · " : null}
                {totals.plannedInCents > 0 ? (
                  <>
                    previsto <b className="font-semibold text-[#111111] tabular-nums">{euroSmart(totals.plannedInCents)}</b>
                  </>
                ) : null}
                <span className="text-[#a1a1aa]"> · non ancora nel margine</span>
              </>
            ) : (
              "Niente da incassare in sospeso nel mese."
            )}
          </div>
        </>
      )}
    </FinCard>
  );
}

function MrrCard({ mrr }: { mrr: ReturnType<typeof mrrSummary> }) {
  const periods =
    mrr.monthlyCount === 0
      ? "tutti i piani sono annuali"
      : mrr.annualCount === 0
        ? "tutti i piani sono mensili"
        : `${mrr.annualCount} ${mrr.annualCount === 1 ? "annuale" : "annuali"}, ${mrr.monthlyCount} ${mrr.monthlyCount === 1 ? "mensile" : "mensili"}`;
  return (
    <FinCard className="px-[26px] py-6">
      <FinLabel>MRR</FinLabel>
      {mrr.payingCount === 0 ? (
        <>
          <BigEmpty />
          <p className="text-[13px] leading-relaxed text-[#71717a]">
            Nessun piano a pagamento tra le {mrr.companiesCount} autoscuole clienti.
          </p>
        </>
      ) : (
        <>
          <div className="mb-2.5 mt-4 text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
            {amountOnly(mrr.mrrCents)}
            <small className="ml-[3px] text-lg font-medium text-[#a1a1aa]">€</small>
          </div>
          <div className="text-[13px] text-[#71717a]">
            <b className="font-semibold text-[#111111] tabular-nums">{euroSmart(mrr.arrCents)}</b> ARR ·{" "}
            {mrr.payingCount} {mrr.payingCount === 1 ? "piano attivo" : "piani attivi"} su {mrr.companiesCount}{" "}
            autoscuole
          </div>
          <div className="mt-1.5 text-[13px] text-[#71717a]">
            ARPA <b className="font-semibold text-[#111111] tabular-nums">{euroSmart(mrr.arpaCents ?? 0)}</b>/mese ·{" "}
            {periods}
          </div>
          {mrr.missingRenewalCount > 0 ? (
            <div className="mt-2.5">
              <Pill tone="dashed">
                {mrr.missingRenewalCount} senza data di rinnovo · da completare
              </Pill>
            </div>
          ) : null}
        </>
      )}
    </FinCard>
  );
}

function CashCard({
  cash,
  input,
  onEdit,
}: {
  cash: ReturnType<typeof cashSummary>;
  input: OverviewInput;
  onEdit: () => void;
}) {
  return (
    <FinCard className="px-[26px] py-6">
      <FinLabel>Cassa</FinLabel>
      {cash === null ? (
        <>
          <BigEmpty />
          <p className="text-[13px] leading-relaxed text-[#71717a]">
            Scrivi il saldo del conto a una data: da lì la cassa si aggiorna con incassi e pagamenti, e
            si vedono i mesi di autonomia.
          </p>
          <FinButton variant="ghost" className="mt-3 h-9" onClick={onEdit}>
            Imposta il saldo
          </FinButton>
        </>
      ) : (
        <>
          <div
            className={cn(
              "mb-2.5 mt-4 text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums",
              cash.balanceCents < 0 && "text-[#c2410c]",
            )}
          >
            {amountOnly(cash.balanceCents)}
            <small className="ml-[3px] text-lg font-medium text-[#a1a1aa]">€</small>
          </div>
          <div className="text-[13px] text-[#71717a]">
            saldo al {fullDate(input.today)}
            {cash.runwayMonths !== null ? (
              <>
                {" "}
                · <b className="font-semibold text-[#111111]">
                  {cash.runwayMonths} {cash.runwayMonths === 1 ? "mese" : "mesi"}
                </b>{" "}
                di autonomia senza nuovi incassi
              </>
            ) : null}
          </div>
          <div className="mt-1.5 text-[13px] text-[#71717a]">
            {cash.avgBasis?.kind === "history" ? (
              <>
                spesa media <b className="font-semibold text-[#111111] tabular-nums">{euroSmart(cash.avgMonthlyOutCents ?? 0)}</b>
                /mese (
                {cash.avgBasis.months === 1 ? "ultimo mese" : `ultimi ${cash.avgBasis.months}`})
              </>
            ) : cash.avgBasis?.kind === "fixed" ? (
              <>
                spese fisse <b className="font-semibold text-[#111111] tabular-nums">{euroSmart(cash.avgMonthlyOutCents ?? 0)}</b>
                /mese · ancora nessun mese chiuso
              </>
            ) : (
              "Nessuna spesa registrata: autonomia non calcolabile."
            )}
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="mt-2.5 cursor-pointer text-left text-[12px] text-[#a1a1aa] hover:text-[#111111]"
          >
            Partenza {euroSmart(input.openingBalanceCents ?? 0)} al {fullDate(input.openingDate ?? input.today)} ·{" "}
            <span className="font-semibold underline-offset-2 hover:underline">Modifica</span>
          </button>
        </>
      )}
    </FinCard>
  );
}

function VatCard({ vat, month }: { vat: ReturnType<typeof vatSummary>; month: string }) {
  const name = monthName(month);
  const quarterLabel = `${monthName(vat.quarter.firstYm).slice(0, 3)}–${monthName(vat.quarter.lastYm).slice(0, 3)}`;
  const value = vat.month.toSetAsideCents;
  return (
    <FinCard className="px-[26px] py-[22px]">
      <h3 className="mb-1 text-base font-semibold text-[#111111]">IVA da accantonare</h3>
      <div className="text-[13px] text-[#71717a]">
        Di {name}: scorporata dagli incassi, meno quella sulle spese registrate
      </div>
      {!vat.hasData ? (
        <>
          <BigEmpty />
          <p className="text-[13px] text-[#71717a]">Nessun incasso o pagamento registrato a {name}.</p>
        </>
      ) : (
        <>
          <div className="mt-3.5 text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
            {amountOnly(Math.abs(value))}
            <small className="ml-1 text-lg font-medium text-[#a1a1aa]">€{value < 0 ? " a credito" : ""}</small>
          </div>
          <div className="mt-4">
            <VatRow label="IVA sugli incassi" cents={vat.month.onSalesCents} />
            <VatRow label="IVA sulle spese" cents={-vat.month.onPurchasesCents} />
            <VatRow
              label={`Trimestre ${quarterLabel}`}
              hint="finora"
              cents={vat.quarter.toSetAsideCents}
              strong
            />
          </div>
          {vat.outWithoutVatCount > 0 ? (
            <p className="mt-2 text-[12px] text-[#a1a1aa]">
              {vat.outWithoutVatCount === 1
                ? "1 spesa del mese senza IVA registrata: non viene scalata."
                : `${vat.outWithoutVatCount} spese del mese senza IVA registrata: non vengono scalate.`}
            </p>
          ) : null}
        </>
      )}
    </FinCard>
  );
}

function VatRow({ label, hint, cents, strong }: { label: string; hint?: string; cents: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-[#f2f2f3] py-2.5 text-sm first:border-t-0">
      <div>
        {label}
        {hint ? <span className="ml-2 text-[13px] text-[#71717a]">{hint}</span> : null}
      </div>
      <b className={cn("tabular-nums", strong ? "font-semibold" : "font-medium text-[#3f3f46]")}>
        {euroSmart(cents)}
      </b>
    </div>
  );
}

function UpcomingCard({ items, today }: { items: ForecastItem[]; today: string }) {
  const shown = items.slice(0, UPCOMING_ROWS);
  const rest = items.length - shown.length;
  const totalIn = items.filter((i) => i.direction === "in").reduce((t, i) => t + i.amountCents, 0);
  const totalOut = items.filter((i) => i.direction === "out").reduce((t, i) => t + i.amountCents, 0);

  return (
    <FinCard className="px-5 pb-2.5 pt-[22px] sm:px-[26px]">
      <h3 className="mb-1 text-base font-semibold text-[#111111]">In arrivo nei prossimi {UPCOMING_DAYS} giorni</h3>
      <div className="mb-2.5 text-[13px] text-[#71717a]">
        Incassi attesi e uscite già note, in ordine di data.
        {items.length > 0 ? (
          <>
            {" "}
            Entrate <b className="font-semibold text-[#111111] tabular-nums">{euroSmart(totalIn)}</b> · uscite{" "}
            <b className="font-semibold text-[#111111] tabular-nums">{euroSmart(totalOut)}</b>
          </>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <FinEmpty
          compact
          icon={<CalendarClock className="h-5 w-5" />}
          title="Niente in arrivo"
          body={`Nessun incasso atteso, spesa fissa, rinnovo o compenso dei sales nei prossimi ${UPCOMING_DAYS} giorni.`}
        />
      ) : (
        <>
          {shown.map((item) => (
            <UpcomingRow key={item.key} item={item} today={today} />
          ))}
          {rest > 0 ? (
            <div className="border-t border-[#f2f2f3] py-3 text-[13px] text-[#71717a]">
              e altre {rest} {rest === 1 ? "voce" : "voci"} entro {UPCOMING_DAYS} giorni
            </div>
          ) : null}
        </>
      )}
    </FinCard>
  );
}

function UpcomingRow({ item, today }: { item: ForecastItem; today: string }) {
  const { day, month } = dayMonth(item.date);
  const tag =
    item.kind === "renewal"
      ? "rinnovo stimato"
      : item.kind === "recurring"
        ? "spesa fissa"
        : item.kind === "commission"
          ? "commissioni"
          : item.kind === "salary"
            ? "fisso sales"
            : item.status === "planned"
          ? item.direction === "in"
            ? "previsto"
            : "prevista"
          : item.direction === "in"
            ? "da incassare"
            : "da pagare";
  const lateDays = item.overdue ? daysBetween(item.date, today) : 0;
  const sub = [item.sub, item.overdue ? `scaduta da ${lateDays} ${lateDays === 1 ? "giorno" : "giorni"}` : null]
    .filter(Boolean)
    .join(" · ");
  const href =
    item.kind === "open"
      ? `/backoffice/finanza/movimenti?mese=${item.date.slice(0, 7)}`
      : item.kind === "recurring"
        ? "/backoffice/finanza/spese-fisse"
        : item.kind === "commission"
          ? `/backoffice/finanza/vendite?mese=${item.key.replace("com-", "")}`
          : item.kind === "salary"
            ? `/backoffice/finanza/vendite?mese=${item.date.slice(0, 7)}`
            : null;

  const body = (
    <>
      <div className="text-xs leading-tight text-[#71717a]">
        {month}
        <b className="block text-[17px] font-semibold text-[#111111] tabular-nums">{day}</b>
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-[#111111]">{item.title}</div>
        {sub ? <div className="mt-0.5 truncate text-[12.5px] text-[#71717a]">{sub}</div> : null}
      </div>
      <div className="text-right">
        <div
          className={cn(
            "text-[15px] font-semibold tabular-nums",
            item.direction === "out" ? "text-[#3f3f46]" : "text-[#111111]",
          )}
        >
          {euroSmart(item.direction === "out" ? -item.amountCents : item.amountCents)}
        </div>
        <div className="text-[11.5px] font-medium text-[#a1a1aa]">
          {tag}
          {item.overdue ? (
            <span className="ml-1.5">
              <Pill tone="warn">scaduta</Pill>
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  const className =
    "grid grid-cols-[48px_1fr_auto] items-center gap-3.5 border-t border-[#f2f2f3] py-[13px] first:border-t-0 sm:grid-cols-[62px_1fr_auto]";
  return href ? (
    <Link href={href} className={cn(className, "-mx-2 rounded-lg px-2 hover:bg-[#fafafa]")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function LegendDot({ style, children }: { style: React.CSSProperties; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center">
      <span className="mr-1.5 inline-block h-2 w-2 rounded-[2px]" style={style} />
      {children}
    </span>
  );
}

function SalesCard({
  summary,
  hasAgents,
}: {
  summary: ReturnType<typeof salesMonthSummary>;
  hasAgents: boolean;
}) {
  const name = monthName(summary.month);
  const href = `/backoffice/finanza/vendite?mese=${summary.month}`;
  return (
    <FinCard className="px-5 pb-3 pt-[22px] sm:px-[26px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="mb-1 text-base font-semibold text-[#111111]">Vendite di {name}</h3>
          <div className="mb-3 text-[13px] text-[#71717a]">
            Compenso = fisso mensile + commissioni sui contratti chiusi nel mese.
          </div>
        </div>
        <div className="flex items-center gap-4 text-[13px] text-[#71717a]">
          {hasAgents && summary.totals.dealsCount > 0 ? (
            <span>
              {summary.totals.dealsCount} {summary.totals.dealsCount === 1 ? "contratto" : "contratti"} ·{" "}
              <b className="font-semibold text-[#111111] tabular-nums">{euroSmart(summary.totals.valueCents)}</b> di
              valore
            </span>
          ) : null}
          <Link
            href={href}
            className="whitespace-nowrap font-semibold text-[#111111] underline-offset-2 hover:underline"
          >
            Gestisci
          </Link>
        </div>
      </div>
      {!hasAgents ? (
        <FinEmpty
          compact
          icon={<Users className="h-5 w-5" />}
          title="Nessun sales registrato"
          body="Con i sales e i contratti firmati, qui compaiono commissioni, fissi e compenso del mese."
        />
      ) : summary.rows.length === 0 ? (
        <p className="pb-3 text-[13px] text-[#71717a]">Nessun sales attivo a {name}.</p>
      ) : (
        <SalesMonthTable summary={summary} />
      )}
    </FinCard>
  );
}
