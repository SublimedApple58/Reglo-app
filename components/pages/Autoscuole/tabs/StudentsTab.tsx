"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  Calendar,
  ChevronDown,
  CircleMinus,
  CircleX,
  Clock,
  FileText,
  KeyRound,
  Loader2,
  Repeat2,
  Send,
  UserCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";
import {
  getQuizSeatsContext,
  setAutoAssignQuizOnSignup,
  triggerEmptySlotNotification,
} from "@/lib/actions/autoscuole-settings.actions";

export type StudentsTabProps = {
  expandedSection: string | null;
  toggleSection: (key: string) => void;
  bookingCutoffEnabled: boolean;
  setBookingCutoffEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  bookingCutoffTime: string;
  setBookingCutoffTime: (v: string) => void;
  weeklyBookingLimitEnabled: boolean;
  setWeeklyBookingLimitEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  weeklyBookingLimit: number;
  setWeeklyBookingLimit: (v: number) => void;
  examPriorityEnabled: boolean;
  setExamPriorityEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  examPriorityDaysBeforeExam: number;
  setExamPriorityDaysBeforeExam: (v: number) => void;
  examPriorityBlockNonExam: boolean;
  setExamPriorityBlockNonExam: React.Dispatch<React.SetStateAction<boolean>>;
  examPriorityPausedUntil: string | null;
  setExamPriorityPausedUntil: (v: string | null) => void;
  restrictedTimeRangeEnabled: boolean;
  setRestrictedTimeRangeEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  restrictedTimeRangeStart: string;
  setRestrictedTimeRangeStart: (v: string) => void;
  restrictedTimeRangeEnd: string;
  setRestrictedTimeRangeEnd: (v: string) => void;
  swapEnabled: boolean;
  setSwapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  swapNotifyMode: "all" | "available_only";
  setSwapNotifyMode: (v: "all" | "available_only") => void;
  studentCancellationEnabled: boolean;
  setStudentCancellationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  autoCheckinEnabled: boolean;
  setAutoCheckinEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  studentNotesEnabled: boolean;
  setStudentNotesEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  groupLessonsEnabled: boolean;
  setGroupLessonsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  emptySlotNotificationEnabled: boolean;
  setEmptySlotNotificationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  emptySlotNotificationTarget: "all" | "availability_matching";
  setEmptySlotNotificationTarget: (v: "all" | "availability_matching") => void;
  emptySlotNotificationTimes: string[];
  setEmptySlotNotificationTimes: React.Dispatch<React.SetStateAction<string[]>>;
  triggeringNotification: boolean;
  setTriggeringNotification: React.Dispatch<React.SetStateAction<boolean>>;
  instructorPreferenceEnabled: boolean;
  setInstructorPreferenceEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  handleSaveSettings: () => Promise<void>;
  savingSettings: boolean;
  toast: { success: (opts: { description: string }) => void; error: (opts: { description: string }) => void };
};

type GestioneTab = "prenotazioni" | "guide" | "app";

const GESTIONE_TABS: Array<{ key: GestioneTab; label: string }> = [
  { key: "prenotazioni", label: "Prenotazioni" },
  { key: "guide", label: "Guide" },
  { key: "app", label: "App allievi" },
];

const CUTOFF_TIME_OPTIONS = [
  "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30",
  "22:00",
];

const NOTIFICATION_TIME_OPTIONS = [
  "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30",
  "22:00",
];

/** Card accordion del proto #config-tab-gestione: bordo #dddddd, radius 14,
 * icona 36px navy su #eef0f6, chevron che ruota. */
function GestioneCard({
  icon: Icon,
  title,
  description,
  expanded,
  onToggle,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  title: string;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 overflow-hidden rounded-[14px] border border-[#dddddd] bg-white">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="flex w-full cursor-pointer select-none items-center gap-4 px-6 py-5 transition-colors hover:bg-[#fafafa]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#cfcfdc] bg-[#eef0f6]">
          <Icon className="h-4 w-4 text-navy-900" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-[13px] font-medium text-[#929292]">{description}</p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-[#929292] transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, overflow: "visible", transitionEnd: { overflow: "visible" } }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="border-t border-[#f5f5f5] px-6 pb-6 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Riga toggle principale del proto: sfondo #f8f8f8, titolo 14/600, toggle navy. */
function GestioneRow({
  title,
  titleExtra,
  description,
  checked,
  onToggle,
}: {
  title: string;
  titleExtra?: React.ReactNode;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="switch"
      tabIndex={0}
      aria-checked={checked}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-[10px] bg-[#f8f8f8] p-4"
    >
      <div>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {title}
          {titleExtra}
        </div>
        <div className="mt-0.5 text-[13px] font-medium text-[#929292]">{description}</div>
      </div>
      <InlineToggle checked={checked} size="lg" />
    </div>
  );
}

/** Riga toggle annidata (senza sfondo) per i sotto-setting, come nel proto. */
function GestioneSubRow({
  title,
  description,
  checked,
  onToggle,
  control,
}: {
  title: string;
  description: string;
  checked?: boolean;
  onToggle?: () => void;
  control?: React.ReactNode;
}) {
  const interactive = Boolean(onToggle);
  return (
    <div
      role={interactive ? "switch" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-checked={interactive ? checked : undefined}
      onClick={onToggle}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle?.(); } } : undefined}
      className={cn(
        "mt-[18px] flex items-center justify-between gap-4 px-0.5 py-1.5",
        interactive && "cursor-pointer",
      )}
    >
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 text-[13px] font-medium text-[#929292]">{description}</div>
      </div>
      {control ?? <InlineToggle checked={Boolean(checked)} size="lg" />}
    </div>
  );
}

/** Input numerico stile proto: 120px, bordo 1.5px, focus nero. */
function GestioneNumberField({
  label,
  value,
  min,
  max,
  fallback,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  fallback: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="px-0.5 pt-[18px]">
      <div className="mb-[9px] text-sm font-semibold text-foreground">{label}</div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || fallback)))}
        className="w-[120px] rounded-[10px] border-[1.5px] border-[#dddddd] bg-white px-3.5 py-[11px] text-sm font-medium text-foreground outline-none transition-colors focus:border-[#222222]"
      />
    </div>
  );
}

const SELECT_TRIGGER_CLASS =
  "h-11 rounded-[10px] border-[1.5px] border-[#dddddd] px-3.5 text-sm font-medium text-foreground shadow-none hover:border-[#929292] focus:border-[#222222] focus:ring-0";

/** Tooltip informativo (i) come nel proto guide di gruppo. */
function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen((prev) => !prev); }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 cursor-pointer">
        <circle cx="7" cy="7" r="6" stroke="#b0b0b0" strokeWidth="1.2" />
        <path d="M7 6.2v3.3" stroke="#b0b0b0" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="7" cy="4.2" r="0.85" fill="#b0b0b0" />
      </svg>
      {open && (
        <span className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-[240px] -translate-x-1/2 rounded-[8px] bg-[#222222] px-[11px] py-[9px] text-[11.5px] font-normal normal-case leading-[1.45] tracking-normal text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent border-t-[#222222]" />
        </span>
      )}
    </span>
  );
}

/** Modalità registrazione allievi — non presente nel proto ma parte della web
 * app: assegnazione automatica della licenza quiz alla registrazione.
 * Salva subito alla pressione del toggle (nessun "Salva configurazione"). */
function RegistrationCard({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const toast = useFeedbackToast();
  type Ctx = {
    quizSeats: number;
    used: number;
    available: number;
    phasesEnabled: ("TEORIA" | "PRATICA")[];
    autoAssignQuizOnSignup: boolean;
  };
  const [ctx, setCtx] = React.useState<Ctx | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getQuizSeatsContext();
      if (res.success) setCtx(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // Senza fase TEORIA il toggle non ha significato: la card sparisce.
  if (!loading && (!ctx || !ctx.phasesEnabled.includes("TEORIA"))) {
    return null;
  }

  const enabled = ctx?.autoAssignQuizOnSignup ?? false;
  const available = ctx?.available ?? 0;
  const used = ctx?.used ?? 0;
  const quizSeats = ctx?.quizSeats ?? 0;

  const handleToggle = async () => {
    if (saving || loading) return;
    setSaving(true);
    try {
      const res = await setAutoAssignQuizOnSignup({ enabled: !enabled });
      if (!res.success) {
        toast.error({ description: res.message ?? "Impossibile aggiornare." });
        return;
      }
      toast.success({ description: res.message ?? "Modalità aggiornata." });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <GestioneCard
      icon={KeyRound}
      title="Modalità registrazione allievi"
      description="Cosa succede quando un nuovo allievo si registra con il codice autoscuola."
      expanded={expanded}
      onToggle={onToggle}
    >
      <div
        role="switch"
        tabIndex={0}
        aria-checked={enabled}
        onClick={() => void handleToggle()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void handleToggle(); } }}
        className={cn(
          "mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-[10px] bg-[#f8f8f8] p-4",
          (saving || loading) && "pointer-events-none opacity-70",
        )}
      >
        <div>
          <div className="text-sm font-semibold text-foreground">
            Assegnazione automatica della licenza quiz
          </div>
          <div className="mt-0.5 text-[13px] font-medium text-[#929292]">
            {enabled
              ? "I nuovi allievi ricevono subito una licenza quiz (se disponibile) e partono direttamente in fase Teoria."
              : "I nuovi allievi entrano in stato 'In attesa di attivazione'. Devi assegnare la licenza manualmente per farli partire dalla teoria."}
          </div>
          {!enabled && available > 0 && (
            <div className="mt-2 text-xs font-medium text-amber-700">
              Attivando l&apos;auto-assegnazione, gli allievi attualmente in attesa
              riceveranno automaticamente una licenza (fino a {available} posti
              liberi, ordine cronologico di registrazione).
            </div>
          )}
        </div>
        {saving ? (
          <Loader2 className="size-5 shrink-0 animate-spin text-[#929292]" />
        ) : (
          <InlineToggle checked={enabled} size="lg" />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-[12px] border border-[#e8e8e8] px-5 py-4">
        <span className="text-[13px] font-medium text-[#929292]">Licenze quiz</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {loading ? (
            <Loader2 className="size-4 animate-spin text-[#929292]" />
          ) : (
            <>
              {used} <span className="font-medium text-[#929292]">/ {quizSeats}</span> usate
            </>
          )}
        </span>
      </div>
    </GestioneCard>
  );
}

export default function StudentsTab({
  expandedSection,
  toggleSection,
  bookingCutoffEnabled,
  setBookingCutoffEnabled,
  bookingCutoffTime,
  setBookingCutoffTime,
  weeklyBookingLimitEnabled,
  setWeeklyBookingLimitEnabled,
  weeklyBookingLimit,
  setWeeklyBookingLimit,
  examPriorityEnabled,
  setExamPriorityEnabled,
  examPriorityDaysBeforeExam,
  setExamPriorityDaysBeforeExam,
  examPriorityBlockNonExam,
  setExamPriorityBlockNonExam,
  examPriorityPausedUntil,
  setExamPriorityPausedUntil,
  restrictedTimeRangeEnabled,
  setRestrictedTimeRangeEnabled,
  restrictedTimeRangeStart,
  setRestrictedTimeRangeStart,
  restrictedTimeRangeEnd,
  setRestrictedTimeRangeEnd,
  swapEnabled,
  setSwapEnabled,
  swapNotifyMode,
  setSwapNotifyMode,
  studentCancellationEnabled,
  setStudentCancellationEnabled,
  autoCheckinEnabled,
  setAutoCheckinEnabled,
  studentNotesEnabled,
  setStudentNotesEnabled,
  groupLessonsEnabled,
  setGroupLessonsEnabled,
  emptySlotNotificationEnabled,
  setEmptySlotNotificationEnabled,
  emptySlotNotificationTarget,
  setEmptySlotNotificationTarget,
  emptySlotNotificationTimes,
  setEmptySlotNotificationTimes,
  triggeringNotification,
  setTriggeringNotification,
  instructorPreferenceEnabled,
  setInstructorPreferenceEnabled,
  handleSaveSettings,
  savingSettings,
  toast,
}: StudentsTabProps) {
  const [gestioneTab, setGestioneTab] = React.useState<GestioneTab>("prenotazioni");

  const isPaused = Boolean(
    examPriorityPausedUntil && new Date(examPriorityPausedUntil) > new Date(),
  );

  return (
    <div data-testid="gestione-allievi-pane">
      {/* ── Sub-tab Prenotazioni / Guide / App allievi ── */}
      <div className="mb-7 flex flex-wrap items-center gap-8 border-b border-[#e8e8e8]">
        {GESTIONE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setGestioneTab(tab.key)}
            className={cn(
              "-mb-px cursor-pointer select-none whitespace-nowrap border-b-[2.5px] px-px pb-3.5 text-base transition-colors",
              gestioneTab === tab.key
                ? "border-[#222222] font-semibold text-foreground"
                : "border-transparent font-medium text-[#6a6a6a] hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ PRENOTAZIONI ══ */}
      <div className={cn(gestioneTab !== "prenotazioni" && "hidden")}>
        <GestioneCard
          icon={Clock}
          title="Limite prenotazione"
          description="Imposta un orario limite il giorno prima entro cui gli allievi possono prenotare."
          expanded={expandedSection === "bookingCutoff"}
          onToggle={() => toggleSection("bookingCutoff")}
        >
          <GestioneRow
            title="Stop alle prenotazioni last-minute"
            description="Dopo un certo orario, gli allievi non possono più prenotare la guida del giorno dopo. Es: oltre le 19:30 si può prenotare solo da due giorni in avanti."
            checked={bookingCutoffEnabled}
            onToggle={() => setBookingCutoffEnabled((prev) => !prev)}
          />
          {bookingCutoffEnabled && (
            <div className="mt-3.5 pb-1">
              <div className="mb-2 text-xs font-semibold text-[#555555]">Orario di chiusura</div>
              <Select value={bookingCutoffTime} onValueChange={setBookingCutoffTime}>
                <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[200px]")}>
                  <SelectValue placeholder="Orario" />
                </SelectTrigger>
                <SelectContent>
                  {CUTOFF_TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </GestioneCard>

        <GestioneCard
          icon={Calendar}
          title="Limite guide settimanali"
          description="Limita il numero massimo di guide prenotabili da un allievo per settimana."
          expanded={expandedSection === "weeklyLimit"}
          onToggle={() => toggleSection("weeklyLimit")}
        >
          <GestioneRow
            title="Massimo di guide a settimana"
            description="Quante guide può prenotare un allievo in una settimana (lun–dom). Tu e gli istruttori potete sempre superarlo confermando."
            checked={weeklyBookingLimitEnabled}
            onToggle={() => setWeeklyBookingLimitEnabled((prev) => !prev)}
          />
          {weeklyBookingLimitEnabled && (
            <div className="pb-3.5">
              <GestioneNumberField
                label="Guide a settimana per allievo"
                value={weeklyBookingLimit}
                min={1}
                max={50}
                fallback={1}
                onChange={setWeeklyBookingLimit}
              />
              <GestioneSubRow
                title="Precedenza a chi ha l'esame vicino"
                description="Gli allievi con l'esame in arrivo possono prenotare più guide degli altri."
                checked={examPriorityEnabled}
                onToggle={() => setExamPriorityEnabled((prev) => !prev)}
              />
              {examPriorityEnabled && (
                <>
                  <GestioneNumberField
                    label="Giorni prima dell'esame in cui scatta la precedenza"
                    value={examPriorityDaysBeforeExam}
                    min={1}
                    max={60}
                    fallback={14}
                    onChange={setExamPriorityDaysBeforeExam}
                  />
                  <GestioneSubRow
                    title="Riserva i posti a chi ha l'esame"
                    description="Nei giorni di precedenza, chi non ha l'esame può prenotare solo dopo che tutti gli allievi con esame hanno scelto il loro posto."
                    checked={examPriorityBlockNonExam}
                    onToggle={() => setExamPriorityBlockNonExam((prev) => !prev)}
                  />
                  {examPriorityBlockNonExam && (
                    <GestioneSubRow
                      title="Sospendi la riserva per oggi"
                      description={
                        isPaused
                          ? `Riserva in pausa fino al ${new Date(examPriorityPausedUntil!).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`
                          : "Disattiva temporaneamente la riserva dei posti, per gestire un'eccezione."
                      }
                      control={
                        <button
                          type="button"
                          onClick={() => {
                            if (isPaused) {
                              setExamPriorityPausedUntil(null);
                            } else {
                              const until = new Date();
                              until.setHours(23, 59, 59, 999);
                              setExamPriorityPausedUntil(until.toISOString());
                            }
                          }}
                          className={cn(
                            "shrink-0 cursor-pointer select-none whitespace-nowrap rounded-[24px] px-5 py-[11px] text-sm font-semibold transition-colors",
                            isPaused
                              ? "border-[1.5px] border-[#222222] bg-[#222222] text-white hover:border-black hover:bg-black"
                              : "border-[1.5px] border-[#dddddd] bg-white text-foreground hover:border-[#929292] hover:bg-[#f5f5f5]",
                          )}
                        >
                          {isPaused ? "Riattiva ora" : "Pausa fino a stasera"}
                        </button>
                      }
                    />
                  )}
                </>
              )}
            </div>
          )}
        </GestioneCard>

        <GestioneCard
          icon={CircleMinus}
          title="Fascia oraria ristretta"
          description="Definisci una fascia oraria difficile da riempire. Gli allievi disponibili in quella fascia potranno prenotare solo lì."
          expanded={expandedSection === "restrictedTimeRange"}
          onToggle={() => toggleSection("restrictedTimeRange")}
        >
          <GestioneRow
            title="Riempi le fasce più vuote"
            description="Scegli una fascia poco richiesta: chi è disponibile in quell'orario potrà prenotare solo lì, così si riempie."
            checked={restrictedTimeRangeEnabled}
            onToggle={() => setRestrictedTimeRangeEnabled((prev) => !prev)}
          />
          {restrictedTimeRangeEnabled && (
            <div className="flex flex-wrap gap-4 px-0.5 pb-1 pt-[18px]">
              <div>
                <div className="mb-[9px] text-sm font-semibold text-foreground">Inizio fascia</div>
                <Select value={restrictedTimeRangeStart} onValueChange={setRestrictedTimeRangeStart}>
                  <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[180px]")}>
                    <SelectValue placeholder="Inizio" />
                  </SelectTrigger>
                  <SelectContent>
                    {["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="mb-[9px] text-sm font-semibold text-foreground">Fine fascia</div>
                <Select value={restrictedTimeRangeEnd} onValueChange={setRestrictedTimeRangeEnd}>
                  <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[180px]")}>
                    <SelectValue placeholder="Fine" />
                  </SelectTrigger>
                  <SelectContent>
                    {["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </GestioneCard>
      </div>

      {/* ══ GUIDE ══ */}
      <div className={cn(gestioneTab !== "guide" && "hidden")}>
        <GestioneCard
          icon={Repeat2}
          title="Sostituiscimi"
          description="Consenti agli allievi di proporre scambi guide tra loro."
          expanded={expandedSection === "swap"}
          onToggle={() => toggleSection("swap")}
        >
          <GestioneRow
            title="Consenti scambi tra allievi"
            description="Gli allievi potranno proporre ad altri di prendere il loro posto in una guida futura."
            checked={swapEnabled}
            onToggle={() => setSwapEnabled((prev) => !prev)}
          />
          {swapEnabled && (
            <div className="mt-3.5 pb-1">
              <div className="mb-2 text-xs font-semibold text-[#555555]">Modalità notifica</div>
              <Select value={swapNotifyMode} onValueChange={(value) => setSwapNotifyMode(value as "all" | "available_only")}>
                <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[320px] max-w-full")}>
                  <SelectValue placeholder="Modalità" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available_only">Solo allievi disponibili nello slot</SelectItem>
                  <SelectItem value="all">Tutti gli allievi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </GestioneCard>

        <GestioneCard
          icon={CircleX}
          title="Annullamento guide"
          description="Consenti o blocca l'annullamento delle guide da parte degli allievi."
          expanded={expandedSection === "studentCancellation"}
          onToggle={() => toggleSection("studentCancellation")}
        >
          <GestioneRow
            title="Consenti annullamento guide da app"
            description={
              studentCancellationEnabled
                ? "Gli allievi possono annullare le proprie guide dall'app."
                : "Gli allievi non possono annullare le guide. Devono contattare l'autoscuola."
            }
            checked={studentCancellationEnabled}
            onToggle={() => setStudentCancellationEnabled((prev) => !prev)}
          />
        </GestioneCard>

        <GestioneCard
          icon={UserCheck}
          title="Presenza automatica"
          description="Check-in automatico delle guide all'orario di inizio. L'istruttore può segnare solo l'assenza."
          expanded={expandedSection === "autoCheckin"}
          onToggle={() => toggleSection("autoCheckin")}
        >
          <GestioneRow
            title="Presenza automatica"
            description={
              autoCheckinEnabled
                ? "Attivo — le guide si segnano come presenti in automatico."
                : "Disattivo — l'istruttore deve cliccare \"Presente\"."
            }
            checked={autoCheckinEnabled}
            onToggle={() => setAutoCheckinEnabled((prev) => !prev)}
          />
        </GestioneCard>

        <GestioneCard
          icon={UsersRound}
          title="Guide di gruppo"
          description="Guide con 1 istruttore e 1 veicolo per fino a 3 allievi abilitati. Si abilita l'allievo dal suo dettaglio."
          expanded={expandedSection === "groupLessons"}
          onToggle={() => toggleSection("groupLessons")}
        >
          <GestioneRow
            title="Attiva guide di gruppo"
            titleExtra={
              <InfoTooltip text={`Non scala crediti: ogni partecipante avrà una guida "da pagare" al prezzo di una guida normale.`} />
            }
            description="Potrai programmare guide di gruppo dall'agenda e invitare gli allievi abilitati a iscriversi."
            checked={groupLessonsEnabled}
            onToggle={() => setGroupLessonsEnabled((prev) => !prev)}
          />
        </GestioneCard>
      </div>

      {/* ══ APP ALLIEVI ══ */}
      <div className={cn(gestioneTab !== "app" && "hidden")}>
        <GestioneCard
          icon={FileText}
          title="Note allievi"
          description="Consenti agli allievi di vedere le note delle guide dall'app."
          expanded={expandedSection === "studentNotes"}
          onToggle={() => toggleSection("studentNotes")}
        >
          <GestioneRow
            title="Mostra note nell'app allievi"
            description="Gli allievi potranno consultare le note rilasciate dagli istruttori dopo ogni guida, direttamente dalla loro app."
            checked={studentNotesEnabled}
            onToggle={() => setStudentNotesEnabled((prev) => !prev)}
          />
        </GestioneCard>

        <GestioneCard
          icon={Bell}
          title="Notifica slot vuoti"
          description="Notifica automaticamente gli allievi quando ci sono guide disponibili per il giorno dopo."
          expanded={expandedSection === "emptySlotNotification"}
          onToggle={() => toggleSection("emptySlotNotification")}
        >
          <GestioneRow
            title="Notifica slot disponibili domani"
            description="Ogni sera gli allievi riceveranno una notifica push se ci sono guide libere per il giorno dopo."
            checked={emptySlotNotificationEnabled}
            onToggle={() => setEmptySlotNotificationEnabled((prev) => !prev)}
          />
          {emptySlotNotificationEnabled && (
            <>
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold text-[#555555]">Destinatari</div>
                <Select
                  value={emptySlotNotificationTarget}
                  onValueChange={(value) => setEmptySlotNotificationTarget(value as "all" | "availability_matching")}
                >
                  <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[320px] max-w-full")}>
                    <SelectValue placeholder="Destinatari" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="availability_matching">Solo allievi con disponibilità corrispondente</SelectItem>
                    <SelectItem value="all">Tutti gli allievi</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="mt-4">
                <div className="mb-2.5 text-xs font-semibold text-[#555555]">Orari di invio</div>
                <div className="flex flex-wrap gap-2">
                  {NOTIFICATION_TIME_OPTIONS.map((time) => {
                    const active = emptySlotNotificationTimes.includes(time);
                    return (
                      <button
                        key={time}
                        type="button"
                        onClick={() => {
                          setEmptySlotNotificationTimes((prev) => {
                            if (prev.includes(time)) {
                              if (prev.length <= 1) return prev;
                              return prev.filter((t) => t !== time);
                            }
                            return [...prev, time].sort();
                          });
                        }}
                        className={cn(
                          "cursor-pointer select-none rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                          active
                            ? "border-[1.5px] border-[#9fc3f0] bg-[#cfe0fb] text-[#1a2b45]"
                            : "border-[1.5px] border-[#dddddd] bg-white text-[#555555] hover:border-[#929292]",
                        )}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 rounded-[12px] border border-[#e8e8e8] px-5 py-4">
                <div className="mb-1 text-sm font-semibold text-foreground">Invia ora per domani</div>
                <div className="mb-3 text-[13px] font-medium text-[#929292]">
                  Invia subito la notifica di guide disponibili per domani a tutti gli allievi idonei.
                </div>
                <button
                  type="button"
                  disabled={triggeringNotification}
                  onClick={async () => {
                    setTriggeringNotification(true);
                    try {
                      const res = await triggerEmptySlotNotification();
                      if (res.success && res.data) {
                        toast.success({
                          description: `Notifica inviata a ${res.data.notified} alliev${res.data.notified === 1 ? "o" : "i"}.`,
                        });
                      } else {
                        toast.error({
                          description: res.message ?? "Impossibile inviare la notifica.",
                        });
                      }
                    } catch {
                      toast.error({ description: "Impossibile inviare la notifica." });
                    } finally {
                      setTriggeringNotification(false);
                    }
                  }}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-[8px] border-[1.5px] border-[#dddddd] px-4 py-[9px] text-[13px] font-medium text-foreground transition-colors hover:border-[#222222] disabled:pointer-events-none disabled:opacity-60"
                >
                  {triggeringNotification ? (
                    <Loader2 className="size-[13px] animate-spin" />
                  ) : (
                    <Send className="size-[13px]" strokeWidth={1.7} />
                  )}
                  {triggeringNotification ? "Invio in corso..." : "Invia notifica"}
                </button>
              </div>
            </>
          )}
        </GestioneCard>

        <GestioneCard
          icon={UserRoundCheck}
          title="Preferenza istruttore"
          description="Consenti agli allievi di scegliere l'istruttore quando prenotano una guida."
          expanded={expandedSection === "instructorPreference"}
          onToggle={() => toggleSection("instructorPreference")}
        >
          <GestioneRow
            title="Consenti scelta istruttore"
            description="Gli allievi potranno selezionare un istruttore specifico durante la prenotazione. Se non ne selezionano uno, vedranno le proposte di tutti gli istruttori."
            checked={instructorPreferenceEnabled}
            onToggle={() => setInstructorPreferenceEnabled((prev) => !prev)}
          />
        </GestioneCard>

        <RegistrationCard
          expanded={expandedSection === "registration"}
          onToggle={() => toggleSection("registration")}
        />
      </div>

      {/* Save */}
      <div className="mt-8 flex justify-end">
        <Button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="min-w-[180px]"
        >
          {savingSettings ? "Salvataggio..." : "Salva configurazione"}
        </Button>
      </div>
    </div>
  );
}
