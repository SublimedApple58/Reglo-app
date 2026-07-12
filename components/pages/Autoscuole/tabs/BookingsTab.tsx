"use client";

import React from "react";
import { ChevronDown, Loader2, Plus, Send, X } from "lucide-react";
import { TimePickerInput } from "@/components/ui/time-picker";
import { DatePickerInput } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import PaymentsSettingsPane from "@/components/pages/Autoscuole/PaymentsSettingsPane";
import { cn } from "@/lib/utils";
import {
  NATIONAL_HOLIDAYS,
  nationalHolidayDateLabel,
} from "@/lib/autoscuole/national-holidays";
import {
  getQuizSeatsContext,
  setAutoAssignQuizOnSignup,
  triggerEmptySlotNotification,
} from "@/lib/actions/autoscuole-settings.actions";

export type BookingsTabProps = {
  // Generali (motore prenotazioni)
  availabilityWeeks: string;
  setAvailabilityWeeks: (v: string) => void;
  bookingMinStartDate: string;
  setBookingMinStartDate: (v: string) => void;
  appBookingActors: string;
  setAppBookingActors: (v: string) => void;
  instructorBookingMode: string;
  setInstructorBookingMode: (v: string) => void;
  bookingSlotDurations: number[];
  toggleBookingDuration: (d: number) => void;
  roundedHoursOnly: boolean;
  setRoundedHoursOnly: React.Dispatch<React.SetStateAction<boolean>>;
  nationalHolidaysEnabled: boolean;
  setNationalHolidaysEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  nationalHolidaysDisabled: string[];
  setNationalHolidaysDisabled: React.Dispatch<React.SetStateAction<string[]>>;
  // Limiti
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
  // Guide
  swapEnabled: boolean;
  setSwapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  swapNotifyMode: "all" | "available_only";
  setSwapNotifyMode: (v: "all" | "available_only") => void;
  studentCancellationEnabled: boolean;
  setStudentCancellationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  autoCheckinEnabled: boolean;
  setAutoCheckinEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  groupLessonsEnabled: boolean;
  setGroupLessonsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  // App allievi
  studentNotesEnabled: boolean;
  setStudentNotesEnabled: React.Dispatch<React.SetStateAction<boolean>>;
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
  toast: { success: (opts: { description: string }) => void; error: (opts: { description: string }) => void };
};

type SubTab = "generali" | "limiti" | "guide" | "app" | "crediti";

const SUB_TABS: Array<{ key: SubTab; label: string }> = [
  { key: "generali", label: "Generali" },
  { key: "limiti", label: "Limiti" },
  { key: "guide", label: "Guide" },
  { key: "app", label: "App allievi" },
  { key: "crediti", label: "Crediti e prezzi" },
];

const BOOKING_DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;
const APP_BOOKING_ACTOR_OPTIONS = [
  { value: "students", label: "Solo allievi" },
  { value: "instructors", label: "Solo istruttori" },
  { value: "both", label: "Entrambi" },
] as const;
const INSTRUCTOR_BOOKING_MODE_OPTIONS = [
  { value: "manual_full", label: "Manuale totale" },
  { value: "manual_engine", label: "Manuale + motore annullamenti" },
] as const;

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

/** Riga setting flat (stile lista Airbnb): titolo 600 + descrizione grigia,
 * toggle navy grande a destra. Solo il toggle è cliccabile. */
function SettingRow({
  title,
  titleExtra,
  description,
  checked,
  onToggle,
  control,
  nested,
}: {
  title: string;
  titleExtra?: React.ReactNode;
  description: string;
  checked?: boolean;
  onToggle?: () => void;
  /** Sostituisce il toggle (es. select, bottone pausa) */
  control?: React.ReactNode;
  /** Riga annidata sotto un setting padre (spaziatura ridotta) */
  nested?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-6", nested && "mt-5")}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          {title}
          {titleExtra}
        </div>
        <div className="mt-0.5 max-w-[680px] text-[13.5px] font-medium leading-relaxed text-[#6a6a6a]">
          {description}
        </div>
      </div>
      {control ?? <InlineToggle checked={Boolean(checked)} onChange={onToggle} size="lg" />}
    </div>
  );
}

/** Campo con etichetta grigia sopra (select / input), come nei mock. */
function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 text-xs font-semibold text-[#555555]">{label}</div>
      {children}
    </div>
  );
}

const SELECT_TRIGGER_CLASS =
  "h-11 max-w-full rounded-[10px] border-[1.5px] border-[#dddddd] px-3.5 text-sm font-medium text-foreground shadow-none hover:border-[#929292] focus:border-[#222222] focus:ring-0";

/** Input numerico auto-save: modifica libera, commit (clamp + save) su blur/Invio. */
function NumberField({
  value,
  min,
  max,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Math.max(min, Math.min(max, Number(draft) || min));
    setDraft(String(parsed));
    onCommit(parsed);
  };
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="w-[120px] rounded-[10px] border-[1.5px] border-[#dddddd] bg-white px-3.5 py-[11px] text-sm font-medium text-foreground outline-none transition-colors focus:border-[#222222]"
    />
  );
}

/** Tooltip informativo (i) sul titolo, come nel proto guide di gruppo. */
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

/** Icone delle festività nazionali (path SVG dal proto, stile lucide). */
function HolidayIcon({ id }: { id: string }) {
  const paths: Record<string, React.ReactNode> = {
    capodanno: (<><path d="M5.8 11.3 2 22l10.7-3.79" /><path d="M4 3h.01" /><path d="M22 8h.01" /><path d="M15 2h.01" /><path d="M22 20h.01" /><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10" /><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17" /><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7" /><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z" /></>),
    epifania: (<><path d="M6 3h11a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M7 8v6a5 5 0 0 0 5 5h3a3 3 0 0 0 1.1-5.8L15 12V8" /></>),
    pasqua: <path d="M12 22c6.23-.05 7.87-5.57 7.5-10-.36-4.34-3.95-9.96-7.5-10-3.55.04-7.14 5.66-7.5 10-.37 4.43 1.27 9.95 7.5 10z" />,
    pasquetta: (<><path d="M13 16a3 3 0 0 1 2.24 5" /><path d="M18 12h.01" /><path d="M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3" /><path d="M20 8.54V4a2 2 0 1 0-4 0v3" /><path d="M7.612 12.524a3 3 0 1 0-1.6 4.3" /></>),
    liberazione: (<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></>),
    lavoro: (<><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><rect x="2" y="6" width="20" height="14" rx="2" /></>),
    repubblica: (<><line x1="3" y1="22" x2="21" y2="22" /><line x1="6" y1="18" x2="6" y2="11" /><line x1="10" y1="18" x2="10" y2="11" /><line x1="14" y1="18" x2="14" y2="11" /><line x1="18" y1="18" x2="18" y2="11" /><polygon points="12 2 20 7 4 7" /></>),
    ferragosto: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></>),
    ognissanti: (<><path d="M12 2.5c1.4 1.7 2 2.7 2 3.7a2 2 0 0 1-4 0c0-1 .6-2 2-3.7z" /><path d="M12 8v1.5" /><path d="M9 10.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 10.5V21H9z" /></>),
    immacolata: (<><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" /></>),
    natale: (<><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" /></>),
    stefano: (<><path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" /><path d="M3 11v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0Z" /><path d="M5 18v2" /><path d="M19 18v2" /></>),
  };
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {paths[id] ?? <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}

/** Card collassabile "Mostra festività" del proto: lista preset con toggle. */
function NationalHolidaysCard({
  disabledIds,
  onToggle,
}: {
  disabledIds: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const year = new Date().getFullYear();
  const activeCount = NATIONAL_HOLIDAYS.length - disabledIds.length;
  return (
    <div className="mt-4 overflow-hidden rounded-[10px] border border-[#efefef]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full cursor-pointer select-none items-center justify-between bg-white px-3.5 py-3 transition-colors hover:bg-[#fafafa]"
      >
        <span className="text-[13px] font-semibold text-[#555555]">
          Mostra festività ({activeCount})
        </span>
        <ChevronDown
          className={cn("size-4 text-[#929292] transition-transform", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-px border-t border-[#efefef] p-1.5">
          {NATIONAL_HOLIDAYS.map((holiday) => {
            const active = !disabledIds.includes(holiday.id);
            return (
              <div
                key={holiday.id}
                className="flex cursor-pointer items-center justify-between rounded-[8px] px-3 py-2.5 transition-colors hover:bg-[#f7f7f7]"
                onClick={() => onToggle(holiday.id)}
              >
                <div className={cn("flex items-center gap-3", active ? "text-[#6a6a6a]" : "text-[#c0c0c0]")}>
                  <HolidayIcon id={holiday.id} />
                  <div className="flex flex-col gap-px">
                    <span className={cn("text-[15px] font-semibold", active ? "text-[#222222]" : "text-[#a0a0a0]")}>
                      {holiday.label}
                    </span>
                    <span className={cn("text-[13px] font-medium", active ? "text-[#929292]" : "text-[#c0c0c0]")}>
                      {nationalHolidayDateLabel(holiday, year)}
                    </span>
                  </div>
                </div>
                <InlineToggle checked={active} size="lg" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Modalità registrazione allievi — non presente nei mock ma parte della web
 * app: assegnazione automatica della licenza quiz alla registrazione.
 * Salva subito alla pressione del toggle. Nascosta senza fase TEORIA. */
function RegistrationSection() {
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
    <div className="py-6">
      <SettingRow
        title="Assegnazione automatica della licenza quiz"
        description={
          enabled
            ? "I nuovi allievi ricevono subito una licenza quiz (se disponibile) e partono direttamente in fase Teoria."
            : "I nuovi allievi entrano in stato 'In attesa di attivazione'. Devi assegnare la licenza manualmente per farli partire dalla teoria."
        }
        checked={enabled}
        onToggle={() => void handleToggle()}
        control={
          saving || loading ? <LoadingDots className="shrink-0 text-[#929292]" /> : undefined
        }
      />
      {!enabled && available > 0 && (
        <p className="mt-2.5 max-w-[680px] text-xs font-medium leading-relaxed text-amber-700">
          Attivando l&apos;auto-assegnazione, gli allievi attualmente in attesa riceveranno
          automaticamente una licenza (fino a {available} posti liberi, ordine cronologico
          di registrazione).
        </p>
      )}
      <div className="mt-5 flex max-w-[320px] items-center justify-between rounded-[12px] border border-[#e8e8e8] px-4 py-3">
        <span className="text-[13px] font-medium text-[#6a6a6a]">Licenze quiz</span>
        <span className="text-[13px] font-semibold tabular-nums text-foreground">
          {loading ? (
            <Loader2 className="size-4 animate-spin text-[#929292]" />
          ) : (
            <>
              {used} <span className="font-medium text-[#929292]">/ {quizSeats}</span> usate
            </>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * Pane unificato "Prenotazioni e allievi": fonde il vecchio pane Prenotazioni
 * (configurazione motore) e Gestione allievi (regole verso gli allievi) in
 * quattro sub-tab: Generali / Limiti / Guide / App allievi.
 */
export default function BookingsTab({
  availabilityWeeks,
  setAvailabilityWeeks,
  bookingMinStartDate,
  setBookingMinStartDate,
  appBookingActors,
  setAppBookingActors,
  instructorBookingMode,
  setInstructorBookingMode,
  bookingSlotDurations,
  toggleBookingDuration,
  roundedHoursOnly,
  setRoundedHoursOnly,
  nationalHolidaysEnabled,
  setNationalHolidaysEnabled,
  nationalHolidaysDisabled,
  setNationalHolidaysDisabled,
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
  toast,
}: BookingsTabProps) {
  const [subTab, setSubTab] = React.useState<SubTab>("generali");

  const isPaused = Boolean(
    examPriorityPausedUntil && new Date(examPriorityPausedUntil) > new Date(),
  );

  return (
    <div data-testid="bookings-pane">
      {/* ── Sub-tab Generali / Limiti / Guide / App allievi ── */}
      <div className="flex flex-wrap items-center gap-8 border-b border-[#e8e8e8]">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSubTab(tab.key)}
            className={cn(
              "-mb-px cursor-pointer select-none whitespace-nowrap border-b-[2.5px] px-px pb-3 text-[15px] transition-colors",
              subTab === tab.key
                ? "border-[#222222] font-semibold text-foreground"
                : "border-transparent font-medium text-[#6a6a6a] hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ GENERALI ══ */}
      <div className={cn("divide-y divide-[#ebebeb]", subTab !== "generali" && "hidden")}>
        <div className="py-6">
          <SettingRow
            title="Chi può prenotare dall'app"
            description="Scegli chi può prenotare le guide in autonomia: gli allievi dalla loro app, gli istruttori dalla propria, o entrambi."
            control={
              <Select value={appBookingActors} onValueChange={setAppBookingActors}>
                <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[200px]")}>
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent>
                  {APP_BOOKING_ACTOR_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          {(appBookingActors === "instructors" || appBookingActors === "both") && (
            <FieldBlock label="Modalità istruttore">
              <Select value={instructorBookingMode} onValueChange={setInstructorBookingMode}>
                <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[320px]")}>
                  <SelectValue placeholder="Seleziona modalità" />
                </SelectTrigger>
                <SelectContent>
                  {INSTRUCTOR_BOOKING_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldBlock>
          )}
        </div>

        <div className="py-6">
          <SettingRow
            title="Settimane di disponibilità"
            description="Quante settimane di calendario gli allievi vedono e possono prenotare in app."
            control={
              <Select value={availabilityWeeks} onValueChange={setAvailabilityWeeks}>
                <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[200px]")}>
                  <SelectValue placeholder="Settimane" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, idx) => idx + 1).map((weeks) => (
                    <SelectItem key={weeks} value={String(weeks)}>
                      {weeks} settimane
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        </div>

        <div className="py-6">
          <SettingRow
            title="Prenotazioni aperte dal"
            description="Prima di questa data il calendario resta chiuso alle prenotazioni."
            control={
              // "Rimuovi" vive DENTRO il bordo dell'input (come nel proto):
              // sibling assoluto sopra il trigger, che resta un <button> singolo.
              <div className="relative shrink-0">
                <DatePickerInput
                  value={bookingMinStartDate}
                  onChange={setBookingMinStartDate}
                  placeholder="Lascia vuoto per nessun limite."
                  // Stessa metrica delle select del pane (h-11, radius 10, bordo 1.5)
                  className={cn(
                    "h-11 w-[270px] rounded-[10px] border-[1.5px] px-3.5",
                    bookingMinStartDate && "pr-[76px]",
                  )}
                />
                {bookingMinStartDate ? (
                  <button
                    type="button"
                    onClick={() => setBookingMinStartDate("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-xs font-medium text-[#6a6a6a] transition hover:text-foreground"
                  >
                    Rimuovi
                  </button>
                ) : null}
              </div>
            }
          />
        </div>

        <div className="py-6">
          <div className="text-[15px] font-semibold text-foreground">
            Durata prenotazione allievo
          </div>
          <div className="mt-0.5 max-w-[680px] text-[13.5px] font-medium leading-relaxed text-[#6a6a6a]">
            Le durate tra cui un allievo può scegliere quando prenota una guida.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {BOOKING_DURATION_OPTIONS.map((duration) => (
              <ToggleChip
                key={duration}
                active={bookingSlotDurations.includes(duration)}
                onClick={() => toggleBookingDuration(duration)}
              >
                {duration} min
              </ToggleChip>
            ))}
          </div>
        </div>

        <div className="py-6">
          <SettingRow
            title="Solo orari tondi"
            description="Proponi agli allievi solo orari pieni (16:00, 17:00, ecc.)"
            checked={roundedHoursOnly}
            onToggle={() => setRoundedHoursOnly((prev) => !prev)}
          />
        </div>

        <div className="py-6">
          <SettingRow
            title="Festività non prenotabili"
            description="I giorni segnati come festivi sul calendario (nazionali e locali) restano chiusi alle prenotazioni."
            checked={nationalHolidaysEnabled}
            onToggle={() => setNationalHolidaysEnabled((prev) => !prev)}
          />
          {nationalHolidaysEnabled && (
            <NationalHolidaysCard
              disabledIds={nationalHolidaysDisabled}
              onToggle={(id) =>
                setNationalHolidaysDisabled((prev) =>
                  prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
                )
              }
            />
          )}
        </div>
      </div>

      {/* ══ LIMITI ══ */}
      <div className={cn("divide-y divide-[#ebebeb]", subTab !== "limiti" && "hidden")}>
        <div className="py-6">
          <SettingRow
            title="Stop alle prenotazioni last-minute"
            description="Dopo un certo orario, gli allievi non possono più prenotare la guida del giorno dopo. Es: oltre le 19:30 si può prenotare solo da due giorni in avanti."
            checked={bookingCutoffEnabled}
            onToggle={() => setBookingCutoffEnabled((prev) => !prev)}
          />
          {bookingCutoffEnabled && (
            <FieldBlock label="Orario di chiusura">
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
            </FieldBlock>
          )}
        </div>

        <div className="py-6">
          <SettingRow
            title="Massimo di guide a settimana"
            description="Quante guide può prenotare un allievo in una settimana (lun–dom). Tu e gli istruttori potete sempre superarlo confermando."
            checked={weeklyBookingLimitEnabled}
            onToggle={() => setWeeklyBookingLimitEnabled((prev) => !prev)}
          />
          {weeklyBookingLimitEnabled && (
            <>
              <FieldBlock label="Guide a settimana per allievo">
                <NumberField value={weeklyBookingLimit} min={1} max={50} onCommit={setWeeklyBookingLimit} />
              </FieldBlock>
              <SettingRow
                nested
                title="Precedenza a chi ha l'esame vicino"
                description="Gli allievi con l'esame in arrivo possono prenotare più guide degli altri."
                checked={examPriorityEnabled}
                onToggle={() => setExamPriorityEnabled((prev) => !prev)}
              />
              {examPriorityEnabled && (
                <>
                  <FieldBlock label="Giorni prima dell'esame in cui scatta la precedenza">
                    <NumberField value={examPriorityDaysBeforeExam} min={1} max={60} onCommit={setExamPriorityDaysBeforeExam} />
                  </FieldBlock>
                  <SettingRow
                    nested
                    title="Riserva i posti a chi ha l'esame"
                    description="Nei giorni di precedenza, chi non ha l'esame può prenotare solo dopo che tutti gli allievi con esame hanno scelto il loro posto."
                    checked={examPriorityBlockNonExam}
                    onToggle={() => setExamPriorityBlockNonExam((prev) => !prev)}
                  />
                  {examPriorityBlockNonExam && (
                    <SettingRow
                      nested
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
                            "shrink-0 cursor-pointer select-none whitespace-nowrap rounded-full px-[18px] py-2.5 text-[13px] font-semibold transition-colors",
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
            </>
          )}
        </div>

        <div className="py-6">
          <SettingRow
            title="Riempi le fasce più vuote"
            description="Scegli una fascia poco richiesta: chi è disponibile in quell'orario potrà prenotare solo lì, così si riempie."
            checked={restrictedTimeRangeEnabled}
            onToggle={() => setRestrictedTimeRangeEnabled((prev) => !prev)}
          />
          {restrictedTimeRangeEnabled && (
            <div className="flex flex-wrap gap-5">
              <FieldBlock label="Inizio fascia">
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
              </FieldBlock>
              <FieldBlock label="Fine fascia">
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
              </FieldBlock>
            </div>
          )}
        </div>
      </div>

      {/* ══ GUIDE ══ */}
      <div className={cn("divide-y divide-[#ebebeb]", subTab !== "guide" && "hidden")}>
        <div className="py-6">
          <SettingRow
            title="Consenti scambi tra allievi"
            description="Gli allievi potranno proporre ad altri di prendere il loro posto in una guida futura."
            checked={swapEnabled}
            onToggle={() => setSwapEnabled((prev) => !prev)}
          />
          {swapEnabled && (
            <FieldBlock label="Modalità notifica">
              <Select value={swapNotifyMode} onValueChange={(value) => setSwapNotifyMode(value as "all" | "available_only")}>
                <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[320px]")}>
                  <SelectValue placeholder="Modalità" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available_only">Solo allievi disponibili nello slot</SelectItem>
                  <SelectItem value="all">Tutti gli allievi</SelectItem>
                </SelectContent>
              </Select>
            </FieldBlock>
          )}
        </div>

        <div className="py-6">
          <SettingRow
            title="Consenti annullamento guide da app"
            description={
              studentCancellationEnabled
                ? "Gli allievi possono annullare le proprie guide direttamente dall'app."
                : "Gli allievi non possono annullare le guide. Devono contattare l'autoscuola."
            }
            checked={studentCancellationEnabled}
            onToggle={() => setStudentCancellationEnabled((prev) => !prev)}
          />
        </div>

        <div className="py-6">
          <SettingRow
            title="Presenza automatica"
            description={
              autoCheckinEnabled
                ? "Attivo — le guide si segnano come presenti in automatico all'orario di inizio."
                : "Disattivo — l'istruttore deve cliccare \"Presente\"."
            }
            checked={autoCheckinEnabled}
            onToggle={() => setAutoCheckinEnabled((prev) => !prev)}
          />
        </div>

        <div className="py-6">
          <SettingRow
            title="Attiva guide di gruppo"
            titleExtra={
              <InfoTooltip text={`Non scala crediti: ogni partecipante avrà una guida "da pagare" al prezzo di una guida normale.`} />
            }
            description="Potrai programmare guide di gruppo dall'agenda e invitare gli allievi abilitati a iscriversi."
            checked={groupLessonsEnabled}
            onToggle={() => setGroupLessonsEnabled((prev) => !prev)}
          />
        </div>
      </div>

      {/* ══ APP ALLIEVI ══ */}
      <div className={cn("divide-y divide-[#ebebeb]", subTab !== "app" && "hidden")}>
        <div className="py-6">
          <SettingRow
            title="Mostra note nell'app allievi"
            description="Gli allievi potranno consultare le note rilasciate dagli istruttori dopo ogni guida, direttamente dalla loro app."
            checked={studentNotesEnabled}
            onToggle={() => setStudentNotesEnabled((prev) => !prev)}
          />
        </div>

        <div className="py-6">
          <SettingRow
            title="Notifica slot disponibili domani"
            description="Ogni sera gli allievi riceveranno una notifica push se ci sono guide libere per il giorno dopo."
            checked={emptySlotNotificationEnabled}
            onToggle={() => setEmptySlotNotificationEnabled((prev) => !prev)}
          />
          {emptySlotNotificationEnabled && (
            <>
              <FieldBlock label="Destinatari">
                <Select
                  value={emptySlotNotificationTarget}
                  onValueChange={(value) => setEmptySlotNotificationTarget(value as "all" | "availability_matching")}
                >
                  <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[320px]")}>
                    <SelectValue placeholder="Destinatari" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="availability_matching">Solo allievi con disponibilità corrispondente</SelectItem>
                    <SelectItem value="all">Tutti gli allievi</SelectItem>
                  </SelectContent>
                </Select>
              </FieldBlock>

              <FieldBlock label="Orari di invio">
                {/* Un TimePicker per ogni invio della giornata: la "x" toglie
                    l'orario (min 1), il "+" ne aggiunge un altro. Il backend
                    accetta solo mezz'ore tra 08:00 e 22:00. */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {emptySlotNotificationTimes.map((time) => (
                    <div key={time} className="group relative">
                      <TimePickerInput
                        value={time}
                        minTime="08:00"
                        maxTime="22:00"
                        minuteStep={30}
                        onChange={(next) => {
                          setEmptySlotNotificationTimes((prev) => {
                            if (prev.includes(next)) {
                              toast.error({ description: `Le ${next} sono già tra gli orari di invio.` });
                              return prev;
                            }
                            return prev.map((t) => (t === time ? next : t)).sort();
                          });
                        }}
                      />
                      {emptySlotNotificationTimes.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Rimuovi orario ${time}`}
                          onClick={() =>
                            setEmptySlotNotificationTimes((prev) => prev.filter((t) => t !== time))
                          }
                          className="absolute -right-1.5 -top-1.5 flex size-[18px] cursor-pointer items-center justify-center rounded-full bg-[#222222] text-white opacity-0 shadow-sm transition-opacity hover:bg-black focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <X className="size-3" strokeWidth={2.4} />
                        </button>
                      )}
                    </div>
                  ))}
                  {emptySlotNotificationTimes.length < NOTIFICATION_TIME_OPTIONS.length && (
                    <button
                      type="button"
                      aria-label="Aggiungi orario di invio"
                      onClick={() =>
                        setEmptySlotNotificationTimes((prev) => {
                          // Primo slot libero dopo l'ultimo orario scelto (poi da capo)
                          const last = prev[prev.length - 1];
                          const free = [
                            ...NOTIFICATION_TIME_OPTIONS.filter((t) => t > last),
                            ...NOTIFICATION_TIME_OPTIONS,
                          ].find((t) => !prev.includes(t));
                          return free ? [...prev, free].sort() : prev;
                        })
                      }
                      className="flex size-[38px] cursor-pointer items-center justify-center rounded-full border-[1.5px] border-dashed border-[#c9c9c9] text-[#222222] transition-colors hover:border-[#222222] hover:bg-[#fafafa]"
                    >
                      <Plus className="size-4" strokeWidth={2.2} />
                    </button>
                  )}
                </div>
              </FieldBlock>

              <div className="mt-5 rounded-[12px] border border-[#e8e8e8] px-5 py-4">
                <div className="text-sm font-semibold text-foreground">Invia ora per domani</div>
                <div className="mt-1 text-[13px] font-medium text-[#929292]">
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
                  className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-[8px] border-[1.5px] border-[#dddddd] px-4 py-[9px] text-[13px] font-medium text-foreground transition-colors hover:border-[#222222] disabled:pointer-events-none disabled:opacity-60"
                >
                  {triggeringNotification ? (
                    <LoadingDots className="min-h-[1.5em] scale-[0.8]" />
                  ) : (
                    <>
                      <Send className="size-[13px]" strokeWidth={1.7} />
                      Invia notifica
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="py-6">
          <SettingRow
            title="Consenti scelta istruttore"
            description="Gli allievi potranno selezionare un istruttore specifico durante la prenotazione. Se non ne selezionano uno, vedranno le proposte di tutti gli istruttori."
            checked={instructorPreferenceEnabled}
            onToggle={() => setInstructorPreferenceEnabled((prev) => !prev)}
          />
        </div>

        <RegistrationSection />
      </div>

      {/* ══ CREDITI E PREZZI ══ */}
      {/* Ex pane "Fatturazione e pagamenti": self-contained, auto-save. */}
      <div className={cn("pt-6", subTab !== "crediti" && "hidden")}>
        <PaymentsSettingsPane />
      </div>
    </div>
  );
}
