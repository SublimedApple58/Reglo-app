"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Download, Plus, ReceiptText, Search } from "lucide-react";

import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { downloadCsv } from "@/components/pages/Backoffice/kpi/kpi-format";
import { settleFinanceEntry } from "@/lib/actions/finance.actions";
import type { FinanceEntryRow } from "@/lib/finance/finance-data";
import { shiftMonth, totalsOf, vatPortionCents, type FinanceDirection } from "@/lib/finance/finance-math";
import { cn } from "@/lib/utils";

import { FinanceEntrySheet, type FinanceCategoryOption } from "./FinanceEntrySheet";
import {
  FinCard,
  FinButton,
  FinEmpty,
  FinLabel,
  MonthNav,
  Pill,
  dayMonth,
  euroSmart,
  monthName,
  vatLabel,
} from "./finance-ui";

type DirectionFilter = "all" | FinanceDirection;
type StatusFilter = "all" | "settled" | "due" | "planned";

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csvEuro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function FinanceMovementsPage({
  month,
  today,
  entries,
  categories,
  companies,
}: {
  month: string;
  today: string;
  entries: FinanceEntryRow[];
  categories: FinanceCategoryOption[];
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useFeedbackToast();
  const [isPending, startTransition] = useTransition();
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceEntryRow | null>(null);

  const goMonth = (delta: number) =>
    router.push(`${pathname}?mese=${shiftMonth(month, delta)}`, { scroll: false });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (direction === "all" || e.direction === direction) &&
        (status === "all" || e.status === status) &&
        (categoryId === "all" || e.categoryId === categoryId) &&
        (!q ||
          [e.description, e.companyName, e.invoiceNumber, e.categoryName, e.notes]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q))),
    );
  }, [entries, direction, status, categoryId, query]);

  const totals = useMemo(() => totalsOf(filtered), [filtered]);
  const overdue = filtered.filter((e) => e.status === "due" && e.date < today);
  const isFiltered = direction !== "all" || status !== "all" || categoryId !== "all" || !!query.trim();
  const noData = entries.length === 0;
  const defaultDate = today.startsWith(month) ? today : `${month}-01`;

  const openNew = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (entry: FinanceEntryRow) => {
    setEditing(entry);
    setSheetOpen(true);
  };

  const settle = (entry: FinanceEntryRow) =>
    startTransition(async () => {
      const res = await settleFinanceEntry({ id: entry.id });
      if (!res.success) {
        toast.error({ description: res.message ?? "Non riuscito." });
        return;
      }
      toast.success({
        description: entry.direction === "in" ? "Segnato come incassato." : "Segnato come pagato.",
      });
      router.refresh();
    });

  const exportCsv = () => {
    const header = [
      "Data",
      "Tipo",
      "Descrizione",
      "Categoria",
      "Autoscuola",
      "N. fattura",
      "Stato",
      "Incassato/pagato il",
      "Importo IVA inclusa",
      "Aliquota IVA",
      "Di cui IVA",
      "Note",
    ];
    const rows = filtered.map((e) => [
      e.date,
      e.direction === "in" ? "Entrata" : "Uscita",
      e.description,
      e.categoryName,
      e.companyName ?? "",
      e.invoiceNumber ?? "",
      STATUS_TEXT[e.direction][e.status],
      e.settledOn ?? "",
      csvEuro(e.direction === "in" ? e.amountCents : -e.amountCents),
      e.vatRateBps === null ? "" : `${e.vatRateBps / 100}%`,
      csvEuro(vatPortionCents(e.amountCents, e.vatRateBps)),
      e.notes ?? "",
    ]);
    downloadCsv(
      `reglo-movimenti_${month}.csv`,
      [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\n"),
    );
  };

  return (
    <div className={cn("space-y-4 transition-opacity", isPending && "opacity-70")}>
      {/* Barra: mese + azioni */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav value={month} onPrev={() => goMonth(-1)} onNext={() => goMonth(1)} />
        <div className="flex items-center gap-2">
          <FinButton variant="ghost" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Esporta CSV</span>
          </FinButton>
          <FinButton onClick={openNew}>
            <Plus className="h-4 w-4" /> Movimento
          </FinButton>
        </div>
      </div>

      {/* Totali del mese (dei movimenti filtrati). Mese senza movimenti: niente
          «0 €» finti in fila, ma un trattino — il dato non c'è ancora. */}
      <FinCard className="grid grid-cols-2 divide-[#f2f2f3] md:grid-cols-5 md:divide-x">
        <Total empty={noData} label="Incassato" value={euroSmart(totals.inSettledCents)} />
        <Total empty={noData} label="Pagato" value={euroSmart(totals.outSettledCents)} />
        <Total
          empty={noData}
          label="Saldo"
          value={euroSmart(totals.balanceCents, { sign: true })}
          note="incassato − pagato"
        />
        <Total
          empty={noData}
          label="Da incassare"
          value={euroSmart(totals.inDueCents)}
          note={
            overdue.length > 0 ? (
              <span className="text-[#c2410c]">
                {overdue.length === 1 ? "1 scaduta" : `${overdue.length} scadute`}
              </span>
            ) : totals.outDueCents > 0 ? (
              `da pagare ${euroSmart(totals.outDueCents)}`
            ) : undefined
          }
        />
        <Total
          empty={noData}
          label="IVA da accantonare"
          value={euroSmart(totals.vatToSetAsideCents)}
          note="sugli incassi, meno quella sulle spese"
        />
      </FinCard>

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-[#f1f1f2] p-1">
          {(
            [
              ["all", "Tutti"],
              ["in", "Entrate"],
              ["out", "Uscite"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setDirection(value);
                setCategoryId("all");
              }}
              className={cn(
                "cursor-pointer rounded-[9px] px-3 py-1.5 text-sm",
                direction === value
                  ? "bg-white font-semibold text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  : "text-[#71717a] hover:text-[#111111]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <FilterSelect
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[
            ["all", "Tutti gli stati"],
            ["settled", "Incassati / pagati"],
            ["due", "Da incassare / pagare"],
            ["planned", "Previsti"],
          ]}
        />
        <FilterSelect
          value={categoryId}
          onChange={setCategoryId}
          options={[
            ["all", "Tutte le categorie"],
            ...categories
              .filter((c) => direction === "all" || c.direction === direction)
              .map((c) => [c.id, c.name] as [string, string]),
          ]}
        />
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a1a1aa]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca descrizione, autoscuola, fattura"
            className="h-10 w-full rounded-xl border border-[#e9e9eb] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[#a1a1aa] focus:border-[#111111]"
          />
        </div>
      </div>

      {/* Elenco */}
      <FinCard className="overflow-hidden">
        {filtered.length === 0 ? (
          entries.length === 0 ? (
            <FinEmpty
              icon={<ReceiptText className="h-5 w-5" />}
              title={`Nessun movimento a ${monthName(month)}`}
              body="Registra incassi, spese e fatture da incassare: da qui nascono il margine, la cassa e l'IVA da mettere da parte."
              action={
                <FinButton onClick={openNew}>
                  <Plus className="h-4 w-4" /> Registra il primo movimento
                </FinButton>
              }
            />
          ) : (
            <FinEmpty
              compact
              title="Nessun movimento con questi filtri"
              body={
                <button
                  type="button"
                  className="cursor-pointer font-medium text-[#111111] underline underline-offset-4"
                  onClick={() => {
                    setDirection("all");
                    setStatus("all");
                    setCategoryId("all");
                    setQuery("");
                  }}
                >
                  Togli i filtri
                </button>
              }
            />
          )
        ) : (
          <div>
            <div className="hidden grid-cols-[64px_1fr_150px_160px] gap-4 border-b border-[#f2f2f3] px-6 py-3 md:grid">
              <FinLabel>Data</FinLabel>
              <FinLabel>Movimento</FinLabel>
              <FinLabel>Stato</FinLabel>
              <FinLabel className="text-right">Importo</FinLabel>
            </div>
            {filtered.map((e) => {
              const { day, month: mon } = dayMonth(e.date);
              const isOverdue = e.status === "due" && e.date < today;
              const vat = vatPortionCents(e.amountCents, e.vatRateBps);
              return (
                <div
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEdit(e)}
                  onKeyDown={(ev) => ev.key === "Enter" && openEdit(e)}
                  className="group grid cursor-pointer grid-cols-[52px_1fr_auto] items-center gap-4 border-b border-[#f2f2f3] px-4 py-3.5 last:border-b-0 hover:bg-[#fafafa] md:grid-cols-[64px_1fr_150px_160px] md:px-6"
                >
                  <div className="text-xs leading-tight text-[#71717a]">
                    {mon}
                    <b className="block text-[17px] font-semibold text-[#111111] tabular-nums">{day}</b>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate text-sm font-medium text-[#111111]">
                      {e.direction === "in" ? (
                        <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-[#111111]" />
                      ) : (
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#a1a1aa]" />
                      )}
                      <span className="truncate">{e.description}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[12.5px] text-[#71717a]">
                      {[
                        e.categoryName,
                        e.companyName,
                        e.invoiceNumber ? `fattura ${e.invoiceNumber}` : null,
                        e.recurringExpenseName ? "spesa fissa" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <div className="mt-1.5 md:hidden">
                      <StatusPill entry={e} overdue={isOverdue} />
                    </div>
                  </div>
                  <div className="hidden items-center gap-2 md:flex">
                    <StatusPill entry={e} overdue={isOverdue} />
                    {e.status !== "settled" ? (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          settle(e);
                        }}
                        className="cursor-pointer whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#111111] opacity-0 underline-offset-2 transition-opacity hover:underline group-hover:opacity-100"
                      >
                        {e.direction === "in" ? "Incassato" : "Pagato"} ✓
                      </button>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div
                      className={cn(
                        "text-[15px] font-semibold tabular-nums",
                        e.direction === "out" ? "text-[#3f3f46]" : "text-[#111111]",
                        e.status === "planned" && "text-[#a1a1aa]",
                      )}
                    >
                      {euroSmart(e.direction === "in" ? e.amountCents : -e.amountCents, {
                        sign: e.direction === "in",
                      })}
                    </div>
                    <div className="text-[11.5px] font-medium text-[#a1a1aa] tabular-nums">
                      {vat > 0 ? `di cui IVA ${euroSmart(vat)}` : vatLabel(e.vatRateBps)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </FinCard>

      {filtered.length > 0 ? (
        <p className="px-1 text-xs text-[#a1a1aa]">
          {filtered.length === 1 ? "1 movimento" : `${filtered.length} movimenti`}
          {isFiltered ? ` su ${entries.length} del mese` : ""} · i totali seguono i filtri
        </p>
      ) : null}

      <FinanceEntrySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        entry={editing}
        defaultDate={defaultDate}
        categories={categories}
        companies={companies}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

const STATUS_TEXT = {
  in: { settled: "Incassato", due: "Da incassare", planned: "Previsto" },
  out: { settled: "Pagato", due: "Da pagare", planned: "Previsto" },
} as const;

function StatusPill({ entry, overdue }: { entry: FinanceEntryRow; overdue: boolean }) {
  if (overdue) return <Pill tone="warn">Scaduta</Pill>;
  const text = STATUS_TEXT[entry.direction][entry.status];
  if (entry.status === "settled") return <Pill>{text}</Pill>;
  if (entry.status === "due") return <Pill tone="outline">{text}</Pill>;
  return <Pill tone="dashed">{text}</Pill>;
}

function Total({
  label,
  value,
  note,
  empty,
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="border-b border-[#f2f2f3] px-5 py-4 md:border-b-0">
      <FinLabel>{label}</FinLabel>
      <div
        className={cn(
          "mt-2 text-[22px] font-semibold tracking-[-0.02em] tabular-nums",
          empty ? "text-[#d4d4d8]" : "text-[#111111]",
        )}
      >
        {empty ? "—" : value}
      </div>
      <div className="mt-0.5 min-h-[18px] text-xs text-[#71717a]">{note ?? ""}</div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-10 cursor-pointer rounded-xl border bg-white px-3 pr-8 text-sm outline-none focus:border-[#111111]",
        value === "all" ? "border-[#e9e9eb] text-[#3f3f46]" : "border-[#111111] font-medium text-[#111111]",
      )}
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
