"use client";

import * as React from "react";
import { Archive, Check, PencilLine, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { DetailPanel } from "@/components/ui/detail-panel";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { sectionLabelClass } from "@/components/pages/Autoscuole/student-detail-ui";
import { setManualPaymentStatus } from "@/lib/actions/autoscuole.actions";
import {
  assignFormerStudentName,
  getAutoscuolaFormerStudentDetail,
  type FormerStudentDetail,
  type FormerStudentLesson,
  type FormerStudentRow,
} from "@/lib/actions/autoscuole-former-students.actions";
import {
  FORMER_STUDENT_NAME_MAX_LENGTH,
  FORMER_STUDENT_REASON_LABELS,
  type FormerStudentReason,
} from "@/lib/autoscuole/former-students";
import { TRANSMISSION_LABELS, type Transmission } from "@/lib/autoscuole/license";

/**
 * REG-629 — «Ex allievi» della pagina Allievi: chi ha lasciato l'autoscuola
 * (account eliminato dall'app o rimosso dall'ufficio). Linguaggio d'archivio:
 * avatar tratteggiato e spento, niente contatti, il saldo in primo piano —
 * l'unica cosa che l'ufficio viene a cercare qui.
 */

const NAMELESS = "Ex allievo senza nome";

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })
    : "—";

const licenseLabel = (row: Pick<FormerStudentRow, "licenseCategory" | "transmission">) =>
  row.licenseCategory
    ? `${row.licenseCategory} · ${TRANSMISSION_LABELS[row.transmission as Transmission] ?? row.transmission ?? "—"}`
    : null;

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

/** Link-azione dell'archivio: nero sottolineato, non il blu delle schede attive. */
const inkLinkClass =
  "cursor-pointer text-[12px] font-semibold text-[#222222] underline decoration-[#cfcfcf] underline-offset-[3px] transition-colors hover:decoration-[#222222] disabled:cursor-default disabled:opacity-50";

export function FormerAvatar({ name, size = 40 }: { name: string | null; size?: number }) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-[#c9c9c9] bg-[#f7f7f7] font-semibold text-[#8a8a8a]"
      style={{ width: size, height: size, fontSize: size >= 72 ? 24 : 12 }}
    >
      {name ? initialsOf(name) : <UserRound className="text-[#b0b0b0]" style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={1.6} />}
    </div>
  );
}

const REASON_CHIP: Record<FormerStudentReason, string> = {
  self_delete: "border-[#222222] bg-white text-[#222222]",
  office_removed: "border-[#dddddd] bg-[#f7f7f7] text-[#555555]",
  unknown: "border-[#e6e6e6] bg-white text-[#929292]",
};

export function FormerReasonChip({ reason }: { reason: FormerStudentReason }) {
  return (
    <span
      data-testid="former-reason-chip"
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[3px] text-[11.5px] font-semibold",
        REASON_CHIP[reason],
      )}
    >
      {FORMER_STUDENT_REASON_LABELS[reason]}
    </span>
  );
}

function Balance({ row, align = "right" }: { row: Pick<FormerStudentRow, "unpaidCount" | "unpaidAmount">; align?: "right" | "left" }) {
  if (row.unpaidCount === 0) {
    return (
      <div className={cn("flex items-center gap-1.5 text-[13px] font-semibold text-[#1a7f50]", align === "right" && "justify-end")}>
        <Check className="size-3.5" strokeWidth={2.4} />
        In pari
      </div>
    );
  }
  return (
    <div className={align === "right" ? "text-right" : undefined} data-testid="former-balance">
      <p className="text-[15px] font-bold tabular-nums text-[#c13515]">
        {row.unpaidAmount > 0 ? euro.format(row.unpaidAmount) : `${row.unpaidCount} ${row.unpaidCount === 1 ? "guida" : "guide"}`}
      </p>
      <p className="text-[12px] font-medium text-[#929292]">
        {row.unpaidAmount > 0
          ? `${row.unpaidCount} ${row.unpaidCount === 1 ? "guida da pagare" : "guide da pagare"}`
          : "da pagare, prezzo non indicato"}
      </p>
    </div>
  );
}

/** Riepilogo in testa al tab: quanto c'è da recuperare e da quanti ex allievi. */
export function FormerStudentsSummary({ rows }: { rows: FormerStudentRow[] }) {
  const debtors = rows.filter((r) => r.unpaidCount > 0);
  const total = debtors.reduce((sum, r) => sum + r.unpaidAmount, 0);
  const lessons = debtors.reduce((sum, r) => sum + r.unpaidCount, 0);
  const nameless = rows.filter((r) => !r.name).length;
  return (
    <section
      data-testid="former-summary"
      className="grid gap-5 rounded-[16px] border border-[#e6e6e6] bg-[#fbfbfa] px-6 py-5 md:grid-cols-[auto_1fr_auto] md:items-center"
    >
      <div>
        <p className="text-[12px] font-semibold text-[#929292]">Da recuperare</p>
        <p className="text-[26px] font-bold leading-tight tabular-nums text-foreground">{euro.format(total)}</p>
      </div>
      <p className="text-[13px] font-medium leading-relaxed text-[#6a6a6a] md:border-l md:border-[#e6e6e6] md:pl-5">
        {debtors.length === 0
          ? "Nessun ex allievo ha guide da pagare."
          : `${debtors.length} ${debtors.length === 1 ? "ex allievo ha" : "ex allievi hanno"} ancora ${lessons} ${lessons === 1 ? "guida" : "guide"} da pagare.`}
        {nameless > 0 && (
          <>
            {" "}
            <span className="text-foreground">
              {nameless} senza nome
            </span>{" "}
            {nameless === 1 ? "va riconosciuto" : "vanno riconosciuti"} dallo storico guide.
          </>
        )}
      </p>
      <p className="flex max-w-[280px] items-start gap-2 text-[12px] font-medium leading-snug text-[#929292]">
        <Archive className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} />
        Contatti, foto e firma sono cancellati. Restano nome, guide e pagamenti per gli obblighi contabili.
      </p>
    </section>
  );
}

export function FormerStudentsRows({
  rows,
  onOpen,
  listButtonClass,
}: {
  rows: FormerStudentRow[];
  onOpen: (userId: string, opts?: { assignName?: boolean }) => void;
  listButtonClass: string;
}) {
  return (
    <div data-testid="former-students-list">
      {rows.map((row) => {
        const license = licenseLabel(row);
        return (
          <div
            key={row.userId}
            data-testid="former-student-row"
            className="grid grid-cols-[2.2fr_1.1fr_1fr_1fr_110px] items-center gap-3 border-t border-[#ebebeb] px-6 py-5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <FormerAvatar name={row.name} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {row.name ? (
                    <span className="truncate text-sm font-semibold text-foreground">{row.name}</span>
                  ) : (
                    <>
                      <span className="truncate text-sm font-semibold italic text-[#929292]">{NAMELESS}</span>
                      <button
                        type="button"
                        data-testid="former-assign-name-link"
                        className={inkLinkClass}
                        onClick={() => onOpen(row.userId, { assignName: true })}
                      >
                        Assegna nome
                      </button>
                    </>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[12px] font-medium text-[#929292]">
                  {[license, `${row.lessonsCount} ${row.lessonsCount === 1 ? "guida" : "guide"} in archivio`].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            <div>
              <FormerReasonChip reason={row.reason} />
              <p className="mt-1 text-[12px] font-medium text-[#929292]">il {shortDate(row.leftAt)}</p>
            </div>
            <div>
              <p className="text-[12px] font-medium text-[#929292]">Ultima guida</p>
              <p className="text-[13px] font-medium text-foreground">{shortDate(row.lastLessonAt)}</p>
            </div>
            <Balance row={row} />
            <div className="flex justify-end">
              <button type="button" className={listButtonClass} onClick={() => onOpen(row.userId)}>
                Scheda
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Scheda ex allievo ───────────────────────────────────────────────── */

const STATUS_LABELS: Record<string, string> = {
  completed: "Completata",
  checked_in: "Presente",
  no_show: "Assente",
  scheduled: "Programmata",
  confirmed: "Programmata",
  cancelled: "Annullata",
  proposal: "Proposta",
};

const TYPE_LABELS: Record<string, string> = {
  guida: "Guida",
  esame: "Esame",
  manovre: "Manovre",
  urbano: "Urbano",
  extraurbano: "Extraurbano",
  notturna: "Notturna",
  autostrada: "Autostrada",
  parcheggio: "Parcheggio",
};

function LessonRow({
  lesson,
  saving,
  onSetPaid,
}: {
  lesson: FormerStudentLesson;
  saving: boolean;
  onSetPaid: (lesson: FormerStudentLesson, status: "paid" | "unpaid") => void;
}) {
  const start = new Date(lesson.startsAt);
  const end = new Date(lesson.endsAt);
  const time = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const automatic = lesson.paymentRequired && lesson.manualPaymentStatus == null;
  const penalty = ["cancelled", "no_show"].includes(lesson.status) && lesson.lateCancellationAction === "charged";
  const paid = lesson.manualPaymentStatus === "paid";
  const type = lesson.isGroup ? "Guida di gruppo" : TYPE_LABELS[lesson.types[0] ?? lesson.type] ?? lesson.type;
  return (
    <div data-testid="former-lesson-row" className="flex gap-4 border-b border-[#f2f2f2] py-4">
      <div className="min-w-[56px] pt-0.5 text-[12px] font-medium text-[#929292]">
        {start.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
        <span className="block text-[11px] text-[#b0b0b0]">{start.getFullYear()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {time(start)} – {time(end)}
          </span>
          <span className="rounded-[4px] bg-[#f2f2f2] px-2 py-0.5 text-[12px] font-semibold text-[#3f3f3f]">
            {penalty ? "Penale annullamento" : type}
          </span>
        </div>
        <p className="text-[13px] font-medium text-[#6a6a6a]">
          {STATUS_LABELS[lesson.status] ?? lesson.status} · {lesson.instructorName || "Istruttore n/d"}
          {lesson.vehicleName ? ` · ${lesson.vehicleName}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        {lesson.amount > 0 && (lesson.unpaid || paid) && (
          <span className={cn("text-[13px] font-bold tabular-nums", lesson.unpaid ? "text-[#c13515]" : "text-foreground")}>
            {euro.format(lesson.amount)}
          </span>
        )}
        {lesson.unpaid && !automatic && (
          <button
            type="button"
            data-testid="former-mark-paid"
            disabled={saving}
            onClick={() => onSetPaid(lesson, "paid")}
            className="cursor-pointer rounded-full bg-[#222222] px-3 py-[5px] text-[12px] font-semibold text-white transition-colors hover:bg-black disabled:cursor-default disabled:opacity-50"
          >
            {saving ? <LoadingDots className="min-h-4" /> : "Segna pagata"}
          </button>
        )}
        {lesson.unpaid && automatic && (
          <span className="text-[12px] font-medium text-[#929292]">Pagamento automatico</span>
        )}
        {paid && (
          <span className="flex items-center gap-2 text-[12px] font-semibold text-[#1a7f50]">
            <Check className="size-3.5" strokeWidth={2.4} />
            Pagata
            <button
              type="button"
              disabled={saving}
              onClick={() => onSetPaid(lesson, "unpaid")}
              className="cursor-pointer font-medium text-[#929292] underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            >
              annulla
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function AssignNameForm({
  userId,
  initial,
  autoFocus,
  onSaved,
  onCancel,
}: {
  userId: string;
  initial: string;
  autoFocus: boolean;
  onSaved: (name: string) => void;
  onCancel?: () => void;
}) {
  const toast = useFeedbackToast();
  const [value, setValue] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => inputRef.current?.focus());
  }, [autoFocus]);
  const trimmed = value.trim();
  const canSave = trimmed.length >= 2 && trimmed !== initial.trim();

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const res = await assignFormerStudentName({ userId, name: trimmed });
    setSaving(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile salvare il nome." });
      return;
    }
    toast.success({ description: "Nome assegnato." });
    onSaved(res.data.name);
  };

  return (
    <form
      data-testid="former-assign-name"
      className="w-full max-w-[400px] rounded-[14px] border border-[#e6e6e6] bg-[#fbfbfa] p-4 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor="former-name" className="mb-1 block text-[13px] font-semibold text-foreground">
        Assegna nome
      </label>
      <p className="mb-3 text-[12px] font-medium leading-snug text-[#929292]">
        Il nome è andato perso con la cancellazione dell&apos;account. Riconoscilo dallo storico guide: lo vedrà solo
        l&apos;ufficio.
      </p>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          id="former-name"
          data-testid="former-assign-name-input"
          value={value}
          maxLength={FORMER_STUDENT_NAME_MAX_LENGTH}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && onCancel) onCancel();
          }}
          placeholder="Nome e cognome"
          disabled={saving}
          className="h-10 min-w-0 flex-1 rounded-[10px] border border-[#dddddd] bg-white px-3 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-[#b0b0b0] focus:border-[#222222] disabled:opacity-60"
        />
        <button
          type="submit"
          data-testid="former-assign-name-save"
          disabled={!canSave || saving}
          className={cn(
            "h-10 min-w-[76px] rounded-full px-4 text-[13px] font-semibold transition-colors",
            canSave ? "cursor-pointer bg-[#222222] text-white hover:bg-black" : "cursor-default bg-[#e6e6e6] text-[#aaaaaa]",
          )}
        >
          {saving ? <LoadingDots className="min-h-5" /> : "Salva"}
        </button>
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} className="mt-2 text-[12px] font-medium text-[#929292] hover:text-foreground">
          Annulla
        </button>
      )}
    </form>
  );
}

export function FormerStudentPanel({
  userId,
  focusAssignName,
  onClose,
  onChanged,
}: {
  userId: string | null;
  focusAssignName: boolean;
  onClose: () => void;
  /** Il saldo o il nome sono cambiati: la lista va ricaricata. */
  onChanged: () => void;
}) {
  const toast = useFeedbackToast();
  const [detail, setDetail] = React.useState<FormerStudentDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [filter, setFilter] = React.useState<"unpaid" | "all">("all");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState(false);

  // onClose/toast cambiano a ogni render del genitore: tenuti in ref, così il
  // caricamento dipende solo dall'allievo aperto (altrimenti ricarica in loop).
  const onCloseRef = React.useRef(onClose);
  const toastRef = React.useRef(toast);
  onCloseRef.current = onClose;
  toastRef.current = toast;

  const load = React.useCallback(async (id: string, keepFilter = false) => {
    const res = await getAutoscuolaFormerStudentDetail(id);
    if (!res.success) {
      toastRef.current.error({ description: res.message ?? "Impossibile aprire la scheda." });
      onCloseRef.current();
      return;
    }
    setDetail(res.data);
    if (!keepFilter) setFilter(res.data.unpaidCount > 0 ? "unpaid" : "all");
  }, []);

  React.useEffect(() => {
    if (!userId) return;
    setDetail(null);
    setEditingName(false);
    setLoading(true);
    void load(userId).finally(() => setLoading(false));
  }, [userId, load]);

  const setPaid = async (lesson: FormerStudentLesson, status: "paid" | "unpaid") => {
    if (!detail) return;
    setSavingId(lesson.id);
    const res = await setManualPaymentStatus({ appointmentId: lesson.id, status });
    if (!res.success) {
      setSavingId(null);
      toast.error({ description: res.message ?? "Impossibile aggiornare il pagamento." });
      return;
    }
    await load(detail.userId, true);
    setSavingId(null);
    toast.success({ description: res.message ?? "Pagamento aggiornato." });
    onChanged();
  };

  const lessons = detail
    ? filter === "unpaid"
      ? detail.lessons.filter((l) => l.unpaid)
      : detail.lessons
    : [];
  const hours = detail ? Math.floor(detail.drivenMinutes / 60) : 0;
  const minutes = detail ? detail.drivenMinutes % 60 : 0;

  return (
    <DetailPanel open={userId != null} onOpenChange={(next) => !next && onClose()} testId="former-student-panel">
      <div className="border-b border-[#dddddd] px-6 pb-6 pt-6">
        <div className="relative flex flex-col items-center pt-2 text-center">
          <button
            type="button"
            aria-label="Chiudi"
            onClick={onClose}
            className="absolute right-0 top-0 flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f2f2f2]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="#6a6a6a" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          {loading || !detail ? (
            <div className="flex h-[188px] items-center justify-center">
              <LoadingDots />
            </div>
          ) : (
            <>
              <FormerAvatar name={detail.name} size={88} />
              <div className="mt-3 flex items-center gap-2">
                {detail.name ? (
                  <h2 className="text-[22px] font-bold text-foreground" data-testid="former-panel-name">
                    {detail.name}
                  </h2>
                ) : (
                  <h2 className="text-[22px] font-bold italic text-[#929292]">{NAMELESS}</h2>
                )}
                {detail.name && !editingName && (
                  <button
                    type="button"
                    aria-label="Modifica nome"
                    title="Modifica nome"
                    onClick={() => setEditingName(true)}
                    className="flex size-7 cursor-pointer items-center justify-center rounded-full text-[#929292] transition-colors hover:bg-[#f2f2f2] hover:text-foreground"
                  >
                    <PencilLine className="size-3.5" strokeWidth={1.8} />
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full bg-[#222222] px-2.5 py-[3px] text-[11.5px] font-semibold text-white">Ex allievo</span>
                <FormerReasonChip reason={detail.reason} />
                <span className="text-[12px] font-medium text-[#929292]">il {shortDate(detail.leftAt)}</span>
              </div>
              {(!detail.name || editingName) && (
                <div className="mt-5 flex w-full justify-center">
                  <AssignNameForm
                    userId={detail.userId}
                    initial={detail.name ?? ""}
                    autoFocus={focusAssignName || editingName}
                    onCancel={detail.name ? () => setEditingName(false) : undefined}
                    onSaved={(name) => {
                      setDetail({ ...detail, name });
                      setEditingName(false);
                      onChanged();
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {detail && !loading && (
        <div className="px-6 pb-10 pt-6">
          {/* Saldo */}
          <section className="mb-7 flex items-end justify-between gap-4 rounded-[16px] border border-[#e6e6e6] px-5 py-4" data-testid="former-panel-balance">
            <div>
              <p className="text-[12px] font-semibold text-[#929292]">Saldo</p>
              {detail.unpaidCount > 0 ? (
                <p className="text-[26px] font-bold leading-tight tabular-nums text-[#c13515]">
                  {detail.unpaidAmount > 0
                    ? euro.format(detail.unpaidAmount)
                    : `${detail.unpaidCount} ${detail.unpaidCount === 1 ? "guida" : "guide"}`}
                </p>
              ) : (
                <p className="flex items-center gap-2 text-[22px] font-bold leading-tight text-[#1a7f50]">
                  <Check className="size-5" strokeWidth={2.4} /> In pari
                </p>
              )}
            </div>
            <p className="pb-1 text-right text-[12px] font-medium text-[#929292]">
              {detail.unpaidCount === 0
                ? "Nessuna guida da pagare"
                : detail.unpaidAmount > 0
                  ? `${detail.unpaidCount} ${detail.unpaidCount === 1 ? "guida da pagare" : "guide da pagare"}`
                  : "da pagare, prezzo non indicato"}
            </p>
          </section>

          {/* Anagrafica rimasta */}
          <section className="mb-7 border-b border-[#f2f2f2] pb-7">
            <p className={sectionLabelClass}>Anagrafica</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
              <Field label="Percorso patente" value={licenseLabel(detail) ?? "—"} />
              <Field label="Iscritto dal" value={shortDate(detail.joinedAt)} />
              <Field
                label="Guide effettuate"
                value={`${detail.completedCount} · ${hours} h${minutes ? ` ${minutes} min` : ""}`}
              />
              <Field label="Ultima guida" value={shortDate(detail.lastLessonAt)} />
              <Field label="Email e telefono" value="Cancellati" muted />
              <Field label="Foto e firma" value="Cancellate" muted />
            </div>
          </section>

          {/* Storico guide */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className={cn(sectionLabelClass, "mb-0")}>Storico guide</p>
              <div className="flex gap-1.5">
                {(
                  [
                    { key: "unpaid" as const, label: "Da pagare", count: detail.unpaidCount },
                    { key: "all" as const, label: "Tutte", count: detail.lessons.length },
                  ]
                ).map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-colors",
                      filter === f.key
                        ? "bg-[#222222] font-semibold text-white"
                        : "border border-[#dddddd] font-medium text-foreground hover:bg-[#f7f7f7]",
                    )}
                  >
                    {f.label}
                    <span className={cn("tabular-nums", filter === f.key ? "text-white/70" : "text-[#929292]")}>{f.count}</span>
                  </button>
                ))}
              </div>
            </div>
            {lessons.length === 0 ? (
              <p className="pt-8 text-center text-[13px] font-medium text-[#929292]">
                {filter === "unpaid" ? "Nessuna guida da pagare." : "Nessuna guida in archivio."}
              </p>
            ) : (
              lessons.map((lesson) => (
                <LessonRow key={lesson.id} lesson={lesson} saving={savingId === lesson.id} onSetPaid={setPaid} />
              ))
            )}
          </section>
        </div>
      )}
    </DetailPanel>
  );
}

function Field({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 text-[12px] font-medium text-[#929292]">{label}</p>
      <p className={cn("text-sm font-medium", muted ? "text-[#b0b0b0]" : "text-foreground")}>{value}</p>
    </div>
  );
}
