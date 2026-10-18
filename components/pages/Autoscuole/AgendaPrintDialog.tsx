"use client";

import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X, Printer, ArrowLeft } from "lucide-react";
import { LoadingDots } from "@/components/ui/loading-dots";
import {
  ExamPrintSetup,
  ExamPrintSheet,
  examRangeLabel,
} from "@/components/pages/Autoscuole/AgendaExamPrint";
import {
  DEFAULT_EXAM_PRINT_FIELDS,
  type ExamPrintDay,
  type ExamPrintField,
} from "@/lib/autoscuole/exam-print";
import {
  instructorColorAlpha,
  instructorColorText,
} from "@/lib/autoscuole/instructor-colors";

// ─────────────────────────────────────────────────────────────────────────────
// Anteprima di stampa dell'agenda. Ricostruisce una "fotografia" della vista
// corrente (stesso intervallo di date, stessi filtri, stessa modalità
// settimana/giorno) in un foglio pensato per la carta: griglia oraria con
// blocchi posizionati per orario e colorati come in agenda. L'azione
// "Stampa / Salva PDF" chiama semplicemente window.print(): il browser mostra
// l'anteprima PDF, da cui l'utente può salvare o stampare.
//
// Il componente è puro: riceve dati già normalizzati (AgendaPrintData) dalla
// pagina agenda e non conosce nulla dello stato/griglia interattiva.
// ─────────────────────────────────────────────────────────────────────────────

export type AgendaPrintBlock = {
  id: string;
  /** Minuti da mezzanotte (ora locale). */
  startMin: number;
  endMin: number;
  /** "09:00-10:00" */
  timeLabel: string;
  title: string;
  subtitle?: string;
  /** Colore istruttore/tipo in hex (#RRGGBB). */
  colorHex: string;
};

export type AgendaPrintColumn = {
  key: string;
  label: string;
  sublabel?: string;
  /** Oggi (settimana) → intestazione evidenziata. */
  highlight?: boolean;
  blocks: AgendaPrintBlock[];
};

export type AgendaPrintData = {
  rangeLabel: string;
  viewModeLabel: string;
  filtersSummary: string[];
  generatedAt: string;
  startHour: number;
  endHour: number;
  orientation: "portrait" | "landscape";
  columns: AgendaPrintColumn[];
  totalCount: number;
};

type PackedBlock = AgendaPrintBlock & { lane: number; laneCount: number };

/** Assegna corsie ai blocchi sovrapposti nella stessa colonna (packing a
 *  cluster: blocchi che non si toccano restano a larghezza piena). */
function packColumn(blocks: AgendaPrintBlock[]): PackedBlock[] {
  const sorted = [...blocks].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin,
  );
  const out: PackedBlock[] = [];
  let cluster: Array<AgendaPrintBlock & { lane: number }> = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    for (const b of cluster) {
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] > b.startMin) lane++;
      laneEnds[lane] = b.endMin;
      b.lane = lane;
    }
    const laneCount = laneEnds.length;
    for (const b of cluster) out.push({ ...b, laneCount });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const b of sorted) {
    if (cluster.length > 0 && b.startMin >= clusterEnd) flush();
    cluster.push({ ...b, lane: 0 });
    clusterEnd = Math.max(clusterEnd, b.endMin);
  }
  flush();
  return out;
}

const PRINT_ROOT_ID = "agenda-print-root";

/**
 * Sorgente della stampa "Solo esami" (REG-620): periodo proposto all'apertura
 * e caricamento degli esami di un periodo qualsiasi (YYYY-MM-DD inclusi).
 */
export type ExamPrintSource = {
  defaultFrom: string;
  defaultTo: string;
  load: (from: string, to: string) => Promise<ExamPrintDay[]>;
};

type PrintMode = "agenda" | "esami";
type ExamStep = "setup" | "preview";

export function AgendaPrintDialog({
  open,
  data,
  exams,
  onClose,
}: {
  open: boolean;
  data: AgendaPrintData | null;
  exams?: ExamPrintSource;
  onClose: () => void;
}) {
  const [mode, setMode] = React.useState<PrintMode>("agenda");
  const [examStep, setExamStep] = React.useState<ExamStep>("setup");
  const [rangeStart, setRangeStart] = React.useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<ExamPrintField[]>(DEFAULT_EXAM_PRINT_FIELDS);
  const [examDays, setExamDays] = React.useState<ExamPrintDay[] | null>(null);
  const [examLoading, setExamLoading] = React.useState(false);
  const [examError, setExamError] = React.useState<string | null>(null);
  const [examGeneratedAt, setExamGeneratedAt] = React.useState("");

  // Ogni apertura riparte dalla stampa dell'agenda, col periodo proposto.
  React.useEffect(() => {
    if (!open) return;
    setMode("agenda");
    setExamStep("setup");
    setRangeStart(exams?.defaultFrom ?? null);
    setRangeEnd(exams?.defaultTo ?? null);
    setExamDays(null);
    setExamError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const showExamPreview = async () => {
    if (!exams || !rangeStart || !rangeEnd) return;
    setExamLoading(true);
    setExamError(null);
    try {
      const days = await exams.load(rangeStart, rangeEnd);
      setExamDays(days);
      setExamGeneratedAt(
        new Date().toLocaleString("it-IT", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setExamStep("preview");
    } catch {
      setExamError("Non sono riuscito a caricare gli esami. Riprova.");
    } finally {
      setExamLoading(false);
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    // Blocca lo scroll della pagina sotto l'overlay.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !data || typeof document === "undefined") return null;

  const examMode = mode === "esami" && !!exams;
  const examSetup = examMode && examStep === "setup";
  const { startHour, endHour } = data;
  const orientation = examMode ? "portrait" : data.orientation;
  const rangeMinutes = Math.max(60, (endHour - startHour) * 60);

  // Scala verticale: prova a far stare l'intervallo visibile in una pagina;
  // se troppo lungo, riduce fino a un minimo leggibile (poi il browser pagina).
  const targetHeight = orientation === "landscape" ? 470 : 820;
  const pxPerMin = Math.min(
    orientation === "landscape" ? 1.05 : 1.35,
    Math.max(0.5, targetHeight / rangeMinutes),
  );
  const gridHeight = rangeMinutes * pxPerMin;
  const hourMarks = Array.from(
    { length: endHour - startHour + 1 },
    (_, i) => startHour + i,
  );

  const sheetMaxWidth = orientation === "landscape" ? 1120 : 800;
  const canPreview = !!(rangeStart && rangeEnd) && !examLoading;

  return createPortal(
    <>
      {/* @page + regole di stampa: nasconde l'app e riporta il foglio in flusso
          statico (niente position:fixed/absolute, che in stampa si ripete o
          sfora su più pagine). Così esce una sola pagina con l'intestazione. */}
      <style>{`
        @media print {
          @page { size: A4 ${orientation}; margin: 12mm; }
          /* Mostra solo l'overlay del portale, nasconde l'app sotto. */
          body > *:not(.agenda-print-overlay) { display: none !important; }
          .agenda-print-overlay {
            position: static !important;
            display: block !important;
            height: auto !important;
            background: none !important;
            overflow: visible !important;
          }
          .agenda-print-scroll {
            position: static !important;
            flex: none !important;
            height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
          }
          .agenda-print-noprint { display: none !important; }
          #${PRINT_ROOT_ID} {
            position: static !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          #${PRINT_ROOT_ID} .exam-print-row { break-inside: avoid; }
          #${PRINT_ROOT_ID} .exam-print-day h2 { break-after: avoid; }
          #${PRINT_ROOT_ID} * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div
        className="agenda-print-overlay fixed inset-0 z-[700] flex flex-col bg-[#3a3a44]"
        role="dialog"
        aria-modal="true"
        aria-label="Anteprima di stampa dell'agenda"
      >
        {/* Barra strumenti (non stampata) */}
        <div className="agenda-print-noprint flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#2a2a30] px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 text-white">
            <Printer className="size-4 shrink-0" strokeWidth={1.8} />
            <span className="text-[14px] font-semibold">Anteprima di stampa</span>
            <span className="hidden truncate text-[12.5px] text-white/60 lg:inline">
              {examMode
                ? rangeStart && rangeEnd
                  ? `Esami ${examRangeLabel(rangeStart, rangeEnd)}`
                  : "Esami"
                : `${data.rangeLabel} · ${data.viewModeLabel}`}
            </span>
          </div>
          {exams && (
            <div data-testid="print-mode-switch">
              <div
                role="tablist"
                className="inline-flex rounded-full border border-white/15 bg-white/[0.08] p-[3px]"
              >
                {(
                  [
                    { value: "agenda", label: "Agenda" },
                    { value: "esami", label: "Solo esami" },
                  ] as const
                ).map((opt) => {
                  const active = mode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setMode(opt.value);
                        if (opt.value === "esami") setExamStep("setup");
                      }}
                      className={cn(
                        "cursor-pointer select-none whitespace-nowrap rounded-full px-4 py-[7px] text-[13px] transition-colors",
                        active
                          ? "bg-white font-semibold text-[#111111] shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
                          : "font-medium text-white/70 hover:text-white",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex flex-1 items-center justify-end gap-2">
            {examMode && examStep === "preview" && (
              <button
                type="button"
                onClick={() => setExamStep("setup")}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] px-3 py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-white/10"
              >
                <ArrowLeft className="size-4" strokeWidth={1.9} />
                Modifica
              </button>
            )}
            {!examSetup && (
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] bg-white px-4 py-[9px] text-[13px] font-semibold text-[#111111] transition-opacity hover:opacity-90"
              >
                <Printer className="size-4" strokeWidth={1.9} />
                Stampa / Salva PDF
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="flex size-[34px] cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <X className="size-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Area anteprima scrollabile */}
        <div className="agenda-print-scroll flex-1 overflow-auto px-4 py-6">
          {examSetup ? (
            <div
              data-testid="exam-print-setup"
              className="agenda-print-noprint mx-auto w-[780px] max-w-full rounded-[20px] bg-white px-7 pb-5 pt-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
            >
              <div className="mb-6">
                <div className="text-[18px] font-bold tracking-[-0.2px] text-[#222222]">
                  Stampa solo gli esami
                </div>
                <div className="mt-0.5 text-[13px] text-[#6a6a6a]">
                  Una tabella per giorno, un esame per riga in ordine di orario.
                </div>
              </div>
              <ExamPrintSetup
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                onRangeChange={(start, end) => {
                  setRangeStart(start);
                  setRangeEnd(end);
                }}
                fields={fields}
                onFieldsChange={setFields}
              />
              <div className="mt-6 flex items-center justify-between gap-3 border-t border-[#f0f0f0] pt-4">
                <div className="text-[13px] text-[#b42318]">{examError}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("agenda")}
                    className="cursor-pointer rounded-[20px] border border-[#ddd] px-4 py-2 text-[13px] font-medium text-[#444]"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    disabled={!canPreview}
                    onClick={() => void showExamPreview()}
                    className={cn(
                      "inline-flex min-w-[148px] items-center justify-center rounded-[20px] px-4 py-2 text-[13px] font-semibold transition-colors",
                      canPreview
                        ? "cursor-pointer bg-[#111111] text-white hover:bg-[#2a2a2a]"
                        : "cursor-default bg-[#e0e0e0] text-[#aaa]",
                    )}
                  >
                    {examLoading ? <LoadingDots className="min-h-5" /> : "Mostra anteprima"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
          <div
            id={PRINT_ROOT_ID}
            className="mx-auto rounded-[6px] bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
            style={{ maxWidth: sheetMaxWidth }}
          >
            {examMode ? (
              <ExamPrintSheet
                days={examDays ?? []}
                fields={fields}
                rangeLabel={rangeStart && rangeEnd ? examRangeLabel(rangeStart, rangeEnd) : ""}
                generatedAt={examGeneratedAt}
              />
            ) : (
            <>
            {/* Intestazione foglio */}
            <div className="mb-5 flex items-start justify-between gap-6 border-b border-[#e6e6e6] pb-4">
              <div>
                <div className="text-[22px] font-bold leading-tight tracking-[-0.3px] text-[#111111]">
                  Agenda
                </div>
                <div className="mt-1 text-[14px] font-medium text-[#555]">
                  {data.rangeLabel}
                </div>
              </div>
              <div className="text-right text-[11.5px] leading-relaxed text-[#888]">
                <div className="font-semibold text-[#555]">{data.viewModeLabel}</div>
                <div>Generato il {data.generatedAt}</div>
                <div>
                  {data.totalCount}{" "}
                  {data.totalCount === 1 ? "evento" : "eventi"}
                </div>
              </div>
            </div>

            {/* Filtri attivi */}
            {data.filtersSummary.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#999]">
                  Filtri
                </span>
                {data.filtersSummary.map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-[#f1f1f4] px-2.5 py-[3px] text-[11.5px] font-medium text-[#555]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}

            {/* Griglia oraria */}
            {data.totalCount === 0 ? (
              <div className="flex h-[180px] items-center justify-center rounded-lg bg-[#fafafa] text-[13.5px] text-[#999]">
                Nessun evento in questa vista.
              </div>
            ) : (
              <div>
                {/* Riga intestazioni colonne */}
                <div className="flex">
                  <div className="w-[46px] shrink-0" />
                  <div className="flex flex-1 gap-1.5">
                    {data.columns.map((col) => (
                      <div
                        key={col.key}
                        className="flex-1 border-b-2 pb-1.5 text-center"
                        style={{
                          borderColor: col.highlight ? "#111111" : "#e6e6e6",
                        }}
                      >
                        <div
                          className="truncate text-[12.5px] font-semibold"
                          style={{ color: col.highlight ? "#111111" : "#333" }}
                        >
                          {col.label}
                        </div>
                        {col.sublabel && (
                          <div className="truncate text-[10.5px] text-[#999]">
                            {col.sublabel}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Corpo griglia */}
                <div className="flex" style={{ height: gridHeight }}>
                  {/* Asse orario */}
                  <div className="relative w-[46px] shrink-0">
                    {hourMarks.map((h) => (
                      <div
                        key={h}
                        className="absolute right-1.5 -translate-y-1/2 text-[10px] font-medium tabular-nums text-[#aaa]"
                        style={{ top: (h - startHour) * 60 * pxPerMin }}
                      >
                        {h.toString().padStart(2, "0")}:00
                      </div>
                    ))}
                  </div>

                  {/* Colonne */}
                  <div className="relative flex flex-1 gap-1.5">
                    {/* Linee orarie di sfondo (dietro le colonne) */}
                    <div className="pointer-events-none absolute inset-0">
                      {hourMarks.map((h) => (
                        <div
                          key={h}
                          className="absolute left-0 right-0 border-t border-[#f0f0f0]"
                          style={{ top: (h - startHour) * 60 * pxPerMin }}
                        />
                      ))}
                    </div>

                    {data.columns.map((col) => {
                      const packed = packColumn(col.blocks);
                      return (
                        <div
                          key={col.key}
                          className="relative flex-1 rounded-[4px]"
                          style={{
                            backgroundColor: col.highlight
                              ? "rgba(17, 17, 17,0.02)"
                              : undefined,
                          }}
                        >
                          {packed.map((b) => {
                            const top =
                              (b.startMin - startHour * 60) * pxPerMin;
                            const height = Math.max(
                              16,
                              (b.endMin - b.startMin) * pxPerMin - 1.5,
                            );
                            const widthPct = 100 / b.laneCount;
                            const compact = height < 30;
                            return (
                              <div
                                key={b.id}
                                className="agenda-print-block absolute overflow-hidden rounded-[4px] px-1.5 py-[3px] leading-tight"
                                style={{
                                  top,
                                  height,
                                  left: `${b.lane * widthPct}%`,
                                  width: `calc(${widthPct}% - 2px)`,
                                  backgroundColor: instructorColorAlpha(
                                    b.colorHex,
                                    0.14,
                                  ),
                                  borderLeft: `3px solid ${b.colorHex}`,
                                }}
                              >
                                <div
                                  className="truncate text-[9.5px] font-bold"
                                  style={{
                                    color: instructorColorText(b.colorHex),
                                  }}
                                >
                                  {b.title}
                                </div>
                                {!compact && (
                                  <>
                                    <div className="truncate text-[8.5px] font-medium text-[#777]">
                                      {b.timeLabel}
                                    </div>
                                    {b.subtitle && (
                                      <div className="truncate text-[8.5px] text-[#999]">
                                        {b.subtitle}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            </>
            )}
          </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
