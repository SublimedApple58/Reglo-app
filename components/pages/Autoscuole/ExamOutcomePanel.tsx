"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";

import { setExamOutcome } from "@/lib/actions/autoscuole.actions";
import {
  EXAM_OUTCOME_LABELS,
  asExamOutcome,
  type ExamOutcome,
} from "@/lib/autoscuole/exam-outcome";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

/**
 * Modalina laterale "Registra esito".
 *
 * **Riusa lo schema del pannello "Aggiungi allievi"** dell'esame (stessa
 * larghezza 340, stesso `rounded-[20px]`, stessa entrata da x:-14, stessa
 * intestazione con la X, stessa ricerca, stesso elenco bordato): registrare
 * l'esito e scegliere i partecipanti sono due operazioni sorelle e si fanno
 * nello stesso modo. Deciso da Tiziano il 23/09 dopo aver scartato
 * l'espansione dentro la riga.
 *
 * È **una sola** per tutti i punti di ingresso — pannello esame in agenda,
 * dettaglio allievo delle autoscuole, drawer del consorzio — come la server
 * action che ci sta sotto. Se si sdoppiasse, i tre posti divergerebbero al
 * primo ritocco.
 */

export type ExamOutcomeRow = {
  /** Riga appuntamento dell'esame: è lì che vive l'esito. */
  appointmentId: string;
  studentId: string;
  name: string;
  /** Riga sotto il nome: "Patente B · autom.". */
  subtitle?: string | null;
  initials: string;
  examReady?: boolean;
  outcome: ExamOutcome | null;
};

const TONE: Record<ExamOutcome, { border: string; bg: string; ink: string; wash: string }> = {
  idoneo: { border: "#c5e8d4", bg: "#f0faf4", ink: "#1a7f50", wash: "rgba(26,127,80,.07)" },
  respinto: { border: "#fad4cc", bg: "#fff4f2", ink: "#c13515", wash: "rgba(193,53,21,.07)" },
};

function OutcomeButton({
  outcome,
  active,
  disabled,
  onClick,
}: {
  outcome: ExamOutcome;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tone = TONE[outcome];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-1 cursor-pointer select-none rounded-full border-[1.5px] px-3 py-[5px] text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-transparent"
          : "border-[#dddddd] text-foreground hover:border-[#222222] hover:bg-[#f7f7f7]",
      )}
      style={active ? { borderColor: tone.border, background: tone.bg, color: tone.ink } : undefined}
    >
      {EXAM_OUTCOME_LABELS[outcome]}
    </button>
  );
}

export function ExamOutcomePanel({
  open,
  onClose,
  title = "Registra esito",
  subtitle,
  rows,
  /** Numero di patente già noto dell'allievo (uno solo per allievo). */
  licenseNumberByStudent,
  /** Mostra la ricerca solo quando l'elenco è abbastanza lungo da giustificarla. */
  searchable,
  onRegistered,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  rows: ExamOutcomeRow[];
  licenseNumberByStudent?: Record<string, string | null>;
  searchable?: boolean;
  onRegistered?: () => void;
  className?: string;
}) {
  const toast = useFeedbackToast();
  const [query, setQuery] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);
  const [washed, setWashed] = React.useState<string | null>(null);
  const [numbers, setNumbers] = React.useState<Record<string, string>>({});
  /**
   * Esiti **confermati dal server** in questa sessione del pannello.
   *
   * Non è un optimistic update: si scrive solo dopo che la action ha risposto
   * ok. Serve perché le `rows` arrivano dal genitore, che le rilegge da una
   * fonte che può essere in ritardo — in QA la cache Redis dell'agenda serviva
   * il payload vecchio e il pannello restava identico pur avendo salvato. Il
   * bump della cache è il fix vero; questo rende il pannello indipendente dai
   * tempi di chi lo ospita.
   */
  const [confirmed, setConfirmed] = React.useState<Record<string, ExamOutcome | null>>({});

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setWashed(null);
    }
  }, [open]);

  // Il numero digitato non deve sopravvivere a un cambio di esame.
  const rowsKey = rows.map((r) => r.appointmentId).join("|");
  React.useEffect(() => {
    setNumbers({});
    setConfirmed({});
  }, [rowsKey]);

  /** Le righe come le vede l'utente: props + ciò che il server ha confermato. */
  const effective = React.useMemo(
    () =>
      rows.map((r) =>
        r.appointmentId in confirmed ? { ...r, outcome: confirmed[r.appointmentId] } : r,
      ),
    [rows, confirmed],
  );

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return effective;
    return effective.filter((r) => r.name.toLowerCase().includes(q));
  }, [effective, query]);

  const missing = effective.filter((r) => !r.outcome).length;
  const showSearch = searchable ?? rows.length > 6;

  const choose = async (row: ExamOutcomeRow, outcome: ExamOutcome) => {
    // Ri-cliccare l'esito già registrato lo toglie: è il modo per correggere
    // un errore senza dover scegliere l'esito opposto.
    const next = row.outcome === outcome ? null : outcome;
    setPending(row.appointmentId);
    const res = await setExamOutcome({
      appointmentId: row.appointmentId,
      outcome: next,
      licenseNumber: next === "idoneo" ? numbers[row.appointmentId] ?? null : null,
    });
    setPending(null);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile registrare l'esito." });
      return;
    }
    // Il server ha risposto: da qui la riga mostra il valore vero, senza
    // aspettare che il genitore rilegga i dati.
    setConfirmed((prev) => ({ ...prev, [row.appointmentId]: next }));
    if (next) {
      setWashed(row.appointmentId);
      window.setTimeout(() => setWashed((w) => (w === row.appointmentId ? null : w)), 700);
    }
    toast.success({ description: res.message ?? "Esito registrato." });
    onRegistered?.();
  };

  const saveNumber = async (row: ExamOutcomeRow) => {
    const value = numbers[row.appointmentId];
    if (value === undefined) return;
    setPending(row.appointmentId);
    const res = await setExamOutcome({
      appointmentId: row.appointmentId,
      outcome: "idoneo",
      licenseNumber: value,
    });
    setPending(null);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile salvare il numero." });
      return;
    }
    onRegistered?.();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="exam-outcome-panel"
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className={cn(
            "flex max-h-[88vh] w-[340px] flex-col rounded-[20px] border border-border bg-white p-6 shadow-card-primary",
            className,
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[17px] font-bold tracking-[-0.2px] text-foreground">{title}</span>
            <button
              type="button"
              aria-label="Chiudi"
              onClick={onClose}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#e9e9e9]"
            >
              <X className="size-3.5 text-foreground" strokeWidth={2} />
            </button>
          </div>
          <p className="mt-0.5 text-[12.5px] font-medium text-[#929292]">
            {subtitle ??
              `${rows.length} iscritt${rows.length === 1 ? "o" : "i"} · ${
                missing ? `${missing} da registrare` : "tutti registrati"
              }`}
          </p>

          {showSearch && (
            <div className="mt-3 flex items-center gap-2.5 rounded-[10px] border-[1.5px] border-[#dddddd] px-3.5 transition-colors focus-within:border-[#222222]">
              <Search className="size-4 shrink-0 text-[#a8a8a8]" strokeWidth={1.8} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca un allievo"
                className="min-w-0 flex-1 bg-transparent py-[9px] text-sm font-medium text-foreground outline-none placeholder:text-[#c1c1c1]"
              />
            </div>
          )}

          <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto rounded-[12px] border-[1.5px] border-[#ededed]">
            {visible.length === 0 ? (
              <p className="px-4 py-3.5 text-[12.5px] font-medium text-[#929292]">
                {query.trim()
                  ? `Nessun allievo trovato per «${query.trim()}».`
                  : "Nessun allievo iscritto a questo esame."}
              </p>
            ) : (
              visible.map((row, idx) => {
                const busy = pending === row.appointmentId;
                const tone = row.outcome ? TONE[row.outcome] : null;
                const numero =
                  numbers[row.appointmentId] ??
                  licenseNumberByStudent?.[row.studentId] ??
                  "";
                return (
                  <div
                    key={row.appointmentId}
                    className={cn("px-3.5 py-2.5", idx > 0 && "border-t border-[#f0f0f0]")}
                    style={
                      washed === row.appointmentId && tone
                        ? { animation: "examOutcomeWash 620ms cubic-bezier(.22,.61,.36,1) both", ["--exam-wash" as string]: tone.wash }
                        : undefined
                    }
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-[#f2f2f2] text-[11px] font-bold text-[#555555]",
                          row.examReady && "ring-2 ring-[#1a7f50]",
                        )}
                      >
                        {row.initials}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">{row.name}</span>
                        {row.subtitle ? (
                          <span className="truncate text-[11.5px] font-medium text-[#929292]">
                            {row.subtitle}
                          </span>
                        ) : null}
                      </span>
                    </div>

                    <div className="mt-2.5 flex gap-1.5">
                      <OutcomeButton
                        outcome="idoneo"
                        active={row.outcome === "idoneo"}
                        disabled={busy}
                        onClick={() => void choose(row, "idoneo")}
                      />
                      <OutcomeButton
                        outcome="respinto"
                        active={row.outcome === "respinto"}
                        disabled={busy}
                        onClick={() => void choose(row, "respinto")}
                      />
                    </div>

                    {/* Il numero compare SOLO su un idoneo, e resta facoltativo:
                        spesso si conosce giorni dopo. */}
                    <div
                      className="grid transition-[grid-template-rows,opacity,margin-top] duration-[220ms] ease-[cubic-bezier(.22,.61,.36,1)]"
                      style={{
                        gridTemplateRows: row.outcome === "idoneo" ? "1fr" : "0fr",
                        opacity: row.outcome === "idoneo" ? 1 : 0,
                        marginTop: row.outcome === "idoneo" ? 8 : 0,
                      }}
                    >
                      <div className="overflow-hidden">
                        <input
                          value={numero}
                          disabled={busy}
                          onChange={(e) =>
                            setNumbers((prev) => ({ ...prev, [row.appointmentId]: e.target.value }))
                          }
                          onBlur={() => void saveNumber(row)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          placeholder="Numero patente — facoltativo"
                          className="w-full rounded-lg border border-[#e2e2e6] bg-white px-2.5 py-[7px] text-[13px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-[#b0b0b0] focus:border-foreground/40 disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Pastiglia di sola lettura, per le righe fuori dalla modalina. */
export function ExamOutcomePill({ outcome, className }: { outcome: unknown; className?: string }) {
  const value = asExamOutcome(outcome);
  if (!value) return null;
  const tone = TONE[value];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-[3px] text-[12px] font-semibold",
        className,
      )}
      style={{ borderColor: tone.border, background: tone.bg, color: tone.ink }}
    >
      {EXAM_OUTCOME_LABELS[value]}
    </span>
  );
}
