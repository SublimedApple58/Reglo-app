"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Plus, Repeat } from "lucide-react";

import type { RecurringExpenseRow } from "@/lib/finance/finance-data";
import { CADENCE_LABEL, occurrencesBetween } from "@/lib/finance/finance-math";
import { cn } from "@/lib/utils";

import type { FinanceCategoryOption } from "./FinanceEntrySheet";
import { RecurringExpenseSheet, RecurringPaySheet } from "./RecurringExpenseSheets";
import { RecurringGroupBreakdown, recurringGroups } from "./RecurringSummary";
import {
  FinButton,
  FinCard,
  FinEmpty,
  FinLabel,
  Pill,
  dayMonth,
  euroSmart,
  fullDate,
} from "./finance-ui";

const UPCOMING_DAYS = 60;

const addDays = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

export function FinanceRecurringPage({
  today,
  expenses,
  categories,
}: {
  today: string;
  expenses: RecurringExpenseRow[];
  categories: FinanceCategoryOption[];
}) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringExpenseRow | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState<RecurringExpenseRow | null>(null);

  const active = expenses.filter((e) => e.active);
  const inactive = expenses.filter((e) => !e.active);
  const monthlyTotal = active.reduce((sum, e) => sum + e.monthlyCents, 0);

  const groups = useMemo(() => recurringGroups(active), [active]);

  const upcoming = useMemo(() => {
    const until = addDays(today, UPCOMING_DAYS);
    return active
      .flatMap((e) =>
        occurrencesBetween(e, today, until)
          .filter((date) => !e.lastPaidOn || date > e.lastPaidOn)
          .map((date) => ({ date, expense: e })),
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);
  }, [active, today]);

  const openNew = () => {
    setEditing(null);
    setEditOpen(true);
  };
  const openEdit = (e: RecurringExpenseRow) => {
    setEditing(e);
    setEditOpen(true);
  };
  const openPay = (e: RecurringExpenseRow) => {
    setPaying(e);
    setPayOpen(true);
  };
  const refresh = () => router.refresh();

  const sheets = (
    <>
      <RecurringExpenseSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        expense={editing}
        today={today}
        categories={categories}
        onSaved={refresh}
      />
      <RecurringPaySheet
        open={payOpen}
        onOpenChange={setPayOpen}
        expense={paying}
        today={today}
        onSaved={refresh}
      />
    </>
  );

  if (expenses.length === 0) {
    return (
      <>
        <FinCard>
          <FinEmpty
            icon={<Repeat className="h-5 w-5" />}
            title="Nessuna spesa fissa"
            body="Aggiungi stipendi, abbonamenti e consulenze che si ripetono: entrano da sole nelle previsioni, senza registrarle ogni mese in anticipo."
            action={
              <FinButton onClick={openNew}>
                <Plus className="h-4 w-4" /> Aggiungi la prima spesa fissa
              </FinButton>
            }
          />
        </FinCard>
        {sheets}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <FinButton onClick={openNew}>
          <Plus className="h-4 w-4" /> Spesa fissa
        </FinButton>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* Totale al mese per gruppo — dal mockup «Spese fisse» */}
        <FinCard className="p-6">
          <h3 className="text-base font-semibold text-[#111111]">Al mese</h3>
          <div className="text-[13px] text-[#71717a]">Spese fisse attive, riportate al mese</div>
          <div className="mt-3.5 text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
            {euroSmart(monthlyTotal).replace(" €", "")}
            <small className="ml-1 text-lg font-medium text-[#a1a1aa]">€ / mese</small>
          </div>
          {monthlyTotal > 0 ? (
            <RecurringGroupBreakdown groups={groups} />
          ) : (
            <p className="mt-4 text-[13px] text-[#71717a]">Nessuna spesa fissa attiva oggi.</p>
          )}
        </FinCard>

        {/* Prossime scadenze */}
        <FinCard className="px-6 pb-3 pt-6">
          <h3 className="text-base font-semibold text-[#111111]">Prossime scadenze</h3>
          <div className="mb-2 text-[13px] text-[#71717a]">Nei prossimi {UPCOMING_DAYS} giorni</div>
          {upcoming.length === 0 ? (
            <FinEmpty
              compact
              icon={<CalendarClock className="h-5 w-5" />}
              title="Niente in scadenza"
              body={`Nessuna spesa fissa cade nei prossimi ${UPCOMING_DAYS} giorni.`}
            />
          ) : (
            upcoming.map(({ date, expense }) => {
              const { day, month } = dayMonth(date);
              return (
                <div
                  key={`${expense.id}-${date}`}
                  className="grid grid-cols-[48px_1fr_auto] items-center gap-3 border-t border-[#f2f2f3] py-3 first:border-t-0"
                >
                  <div className="text-xs leading-tight text-[#71717a]">
                    {month}
                    <b className="block text-[17px] font-semibold text-[#111111] tabular-nums">{day}</b>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{expense.name}</div>
                    <div className="truncate text-[12.5px] text-[#71717a]">
                      {expense.categoryName} · {CADENCE_LABEL[expense.cadence]}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[15px] font-semibold text-[#3f3f46] tabular-nums">
                      {euroSmart(-expense.amountCents)}
                    </div>
                    <button
                      type="button"
                      onClick={() => openPay(expense)}
                      className="cursor-pointer text-[11.5px] font-semibold text-[#111111] underline-offset-2 hover:underline"
                    >
                      Registra pagamento
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </FinCard>
      </div>

      {/* Elenco */}
      <FinCard className="overflow-hidden">
        <div className="hidden grid-cols-[1fr_110px_120px_110px_150px_170px] gap-4 border-b border-[#f2f2f3] px-6 py-3 md:grid">
          <FinLabel>Spesa</FinLabel>
          <FinLabel>Cadenza</FinLabel>
          <FinLabel className="text-right">Importo</FinLabel>
          <FinLabel className="text-right">Al mese</FinLabel>
          <FinLabel>Prossima</FinLabel>
          <FinLabel className="text-right">Ultimo pagamento</FinLabel>
        </div>
        {active.length === 0 ? (
          <FinEmpty compact title="Nessuna spesa fissa attiva" body="Quelle archiviate o finite sono qui sotto." />
        ) : (
          active.map((e) => <RecurringRow key={e.id} expense={e} onEdit={openEdit} onPay={openPay} />)
        )}
        {inactive.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="w-full cursor-pointer border-t border-[#f2f2f3] px-6 py-3 text-left text-[13px] font-medium text-[#71717a] hover:text-[#111111]"
            >
              {showArchived ? "Nascondi" : "Mostra"} archiviate o finite ({inactive.length})
            </button>
            {showArchived
              ? inactive.map((e) => <RecurringRow key={e.id} expense={e} onEdit={openEdit} onPay={openPay} muted />)
              : null}
          </>
        ) : null}
      </FinCard>

      {sheets}
    </div>
  );
}

function RecurringRow({
  expense: e,
  onEdit,
  onPay,
  muted,
}: {
  expense: RecurringExpenseRow;
  onEdit: (e: RecurringExpenseRow) => void;
  onPay: (e: RecurringExpenseRow) => void;
  muted?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(e)}
      onKeyDown={(ev) => ev.key === "Enter" && onEdit(e)}
      className={cn(
        "grid cursor-pointer grid-cols-[1fr_auto] items-center gap-4 border-t border-[#f2f2f3] px-4 py-3.5 first:border-t-0 hover:bg-[#fafafa] md:grid-cols-[1fr_110px_120px_110px_150px_170px] md:px-6",
        muted && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-[#111111]">{e.name}</div>
        <div className="truncate text-[12.5px] text-[#71717a]">
          {e.categoryName}
          {e.archived ? " · archiviata" : e.endsOn ? ` · fino al ${fullDate(e.endsOn)}` : ""}
        </div>
      </div>
      <div className="hidden text-sm capitalize text-[#3f3f46] md:block">{CADENCE_LABEL[e.cadence]}</div>
      <div className="text-right text-[15px] font-semibold tabular-nums md:text-sm md:font-medium">
        {euroSmart(e.amountCents)}
        <div className="text-[11.5px] font-normal text-[#71717a] md:hidden">{CADENCE_LABEL[e.cadence]}</div>
      </div>
      <div className="hidden text-right text-sm font-semibold tabular-nums md:block">
        {euroSmart(e.monthlyCents)}
      </div>
      <div className="hidden text-sm text-[#3f3f46] md:block">
        {e.nextOn ? fullDate(e.nextOn) : <span className="text-[#a1a1aa]">—</span>}
      </div>
      <div className="hidden items-center justify-end gap-2 md:flex">
        {e.lastPaidOn ? (
          <span className="text-[13px] text-[#71717a]">{fullDate(e.lastPaidOn)}</span>
        ) : (
          <Pill tone="dashed">mai registrato</Pill>
        )}
        {!muted ? (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onPay(e);
            }}
            title="Registra pagamento"
            className="flex h-7 cursor-pointer items-center rounded-lg border border-[#e9e9eb] bg-white px-2 text-[12px] font-semibold text-[#111111] hover:border-[#d4d4d8]"
          >
            Paga
          </button>
        ) : null}
      </div>
    </div>
  );
}
