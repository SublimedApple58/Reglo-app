"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Loader2 } from "lucide-react";
import { DatePickerInput } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { TimePickerInput } from "@/components/ui/time-picker";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { useAtomValue } from "jotai";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import PaymentsSettingsPane from "@/components/pages/Autoscuole/PaymentsSettingsPane";
import {
  LICENSE_PATH_BUCKETS as LICENSE_PATH_BUCKET_KEYS,
  LICENSE_PATH_BUCKET_CATEGORIES,
  LICENSE_PATH_BUCKET_LABELS,
} from "@/lib/autoscuole/license";
import { ConsorzioPrezziPane } from "@/components/pages/Consorzio/ConsorzioPrezziPane";
import { companyAtom } from "@/atoms/company.store";
import { isConsortium } from "@/lib/services";
import { cn } from "@/lib/utils";
import {
  LAST_MINUTE_HOURS_MAX,
  LAST_MINUTE_HOURS_MIN,
  resolveStudentBookingMode,
  type StudentBookingExceptions,
  type StudentBookingExceptionsByPath,
} from "@/lib/autoscuole/student-booking-policy";
import type { LicensePathBucket } from "@/lib/autoscuole/license";
import {
  NATIONAL_HOLIDAYS,
  nationalHolidayDateLabel,
} from "@/lib/autoscuole/national-holidays";
import {
  getQuizSeatsContext,
  setAutoAssignQuizOnSignup,
} from "@/lib/actions/autoscuole-settings.actions";

/** I quattro campi che compongono «Prenotazione degli allievi dall'app». */
export type StudentBookingSettingsValue = {
  appBookingActors: string;
  appBookingActorsByPath: { moto?: string; auto?: string; pro?: string };
  studentBookingExceptions: StudentBookingExceptions;
  studentBookingExceptionsByPath: StudentBookingExceptionsByPath;
};

export type BookingsTabProps = {
  // Generali (motore prenotazioni)
  availabilityWeeks: string;
  setAvailabilityWeeks: (v: string) => void;
  bookingMinStartDate: string;
  setBookingMinStartDate: (v: string) => void;
  appBookingActors: string;
  setAppBookingActors: (v: string) => void;
  // REG-426: per-license-path override map ({} = nessun override, vale il default).
  appBookingActorsByPath: { moto?: string; auto?: string; pro?: string };
  setAppBookingActorsByPath: (next: { moto?: string; auto?: string; pro?: string }) => void;
  // Prenotazione allievi «solo eccezioni» (default + per percorso). Le modifiche
  // passano tutte da `onStudentBookingChange` (un solo salvataggio).
  studentBookingExceptions: StudentBookingExceptions;
  studentBookingExceptionsByPath: StudentBookingExceptionsByPath;
  onStudentBookingChange: (next: StudentBookingSettingsValue) => void;
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
  lessonBufferEnabled: boolean;
  setLessonBufferEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  lessonBufferMinutes: number;
  setLessonBufferMinutes: (v: number) => void;
  weeklyBookingLimitEnabled: boolean;
  setWeeklyBookingLimitEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  weeklyBookingLimit: number;
  setWeeklyBookingLimit: (v: number) => void;
  autoBookingBlockEnabled: boolean;
  setAutoBookingBlockEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  autoBookingBlockThreshold: number;
  setAutoBookingBlockThreshold: (v: number) => void;
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
  groupLessonsDiscoveryEnabled: boolean;
  setGroupLessonsDiscoveryEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  motoGroupExactCategoryOnly: boolean;
  setMotoGroupExactCategoryOnly: React.Dispatch<React.SetStateAction<boolean>>;
  // App allievi
  studentNotesEnabled: boolean;
  setStudentNotesEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  instructorPreferenceEnabled: boolean;
  setInstructorPreferenceEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  toast: { success: (opts: { description: string }) => void; error: (opts: { description: string }) => void };
};

type SubTab = "generali" | "limiti" | "guide" | "app" | "crediti" | "prezzi";

const SUB_TABS: Array<{ key: SubTab; label: string }> = [
  { key: "generali", label: "Generali" },
  { key: "limiti", label: "Limiti" },
  { key: "guide", label: "Guide" },
  { key: "app", label: "App allievi" },
  { key: "crediti", label: "Crediti e prezzi" },
];

// Modalità consorzio: "Crediti e prezzi" (pagamenti allievo/Stripe) non esiste;
// al suo posto c'è "Prezzi" (tariffe orarie verso le autoscuole consorziate).
const CONSORTIUM_SUB_TABS: Array<{ key: SubTab; label: string }> = [
  { key: "generali", label: "Generali" },
  { key: "limiti", label: "Limiti" },
  { key: "guide", label: "Guide" },
  { key: "app", label: "App allievi" },
  { key: "prezzi", label: "Prezzi" },
];

const BOOKING_DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;
const APP_BOOKING_ACTOR_OPTIONS = [
  { value: "students", label: "Solo allievi" },
  { value: "instructors", label: "Solo istruttori" },
  { value: "both", label: "Entrambi" },
] as const;
// REG-426: license-path buckets for the per-path "chi prenota" override.
// Le didascalie arrivano da `lib/autoscuole/license.ts`: erano ricopiate a mano
// qui, e una patente nuova (REG-588) le avrebbe lasciate a mentire.
const LICENSE_PATH_BUCKETS = LICENSE_PATH_BUCKET_KEYS.map((key) => ({
  key,
  label: LICENSE_PATH_BUCKET_LABELS[key],
  cats: LICENSE_PATH_BUCKET_CATEGORIES[key],
}));
const INSTRUCTOR_BOOKING_MODE_OPTIONS = [
  { value: "manual_full", label: "Manuale totale" },
  { value: "manual_engine", label: "Manuale + motore annullamenti" },
] as const;

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
  step,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  /** Quando c'è, il valore digitato viene arrotondato al multiplo più vicino. */
  step?: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const raw = Number(draft) || min;
    const stepped = step && step > 0 ? Math.round(raw / step) * step : raw;
    const parsed = Math.max(min, Math.min(max, stepped));
    setDraft(String(parsed));
    onCommit(parsed);
  };
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
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

type StudentBookingModeValue = "open" | "exceptions" | "closed";

const STUDENT_BOOKING_MODE_OPTIONS: Array<{ value: StudentBookingModeValue; label: string }> = [
  { value: "open", label: "Attiva" },
  { value: "exceptions", label: "Solo eccezioni" },
  { value: "closed", label: "Disattiva" },
];

const EXCEPTION_ROWS: Array<{
  key: "slotFill" | "groupSeats" | "lastMinute";
  title: string;
  description: string;
}> = [
  {
    key: "slotFill",
    title: "Slot liberato da un annullamento",
    description: "Quando un allievo annulla, gli altri ricevono una notifica: il primo che conferma prende il posto.",
  },
  {
    key: "groupSeats",
    title: "Posti liberi nelle guide di gruppo",
    description: "Quando si libera un posto in una guida di gruppo, chi partecipa alle guide di gruppo può prenderlo.",
  },
  {
    key: "lastMinute",
    title: "Ultimo minuto",
    description: "Gli allievi possono prenotare da soli i posti ancora vuoti nelle prossime ore.",
  },
];

const modeOf = (actors: string | undefined, ex: StudentBookingExceptions): StudentBookingModeValue =>
  resolveStudentBookingMode(
    (actors === "students" || actors === "both" || actors === "instructors" ? actors : "students"),
    ex,
  );

/** Passa a «Solo eccezioni» senza lasciare l'elenco vuoto (sarebbe «Disattiva»). */
export const toExceptions = (ex: StudentBookingExceptions): StudentBookingExceptions => ({
  ...ex,
  enabled: true,
  slotFill: ex.slotFill || (!ex.groupSeats && !ex.lastMinute),
});

/** Ore dell'ultimo minuto: si salva all'uscita dal campo, valore limitato 1–168. */
function LastMinuteHoursInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(draft));
    if (!Number.isFinite(n) || draft.trim() === "") {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(LAST_MINUTE_HOURS_MAX, Math.max(LAST_MINUTE_HOURS_MIN, n));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <div className="mt-3 flex items-center gap-3">
      <input
        type="number"
        inputMode="numeric"
        min={LAST_MINUTE_HOURS_MIN}
        max={LAST_MINUTE_HOURS_MAX}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label="Ore dell'ultimo minuto"
        className="h-11 w-[96px] rounded-[10px] border-[1.5px] border-[#dddddd] bg-white px-3.5 text-[15px] font-medium text-foreground outline-none transition focus:border-[#222222]"
      />
      <span className="text-[14px] font-medium text-[#6a6a6a]">ore prima della guida</span>
    </div>
  );
}

/** Elenco eccezioni (riquadro bordato del prototipo). `compact` = dentro una riga percorso.
 * Usato anche dal gruppo autonomo (InstructorsTab). */
export function ExceptionsList({
  value,
  onChange,
  compact,
}: {
  value: StudentBookingExceptions;
  onChange: (next: StudentBookingExceptions) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn(!compact && "mt-4 rounded-[14px] border border-[#dddddd] bg-white")}>
      {EXCEPTION_ROWS.map((row, i) => {
        const checked = value[row.key];
        const toggle = () => {
          const next = { ...value, [row.key]: !checked };
          // Spegnere l'ultima eccezione equivale a «Disattiva».
          if (!next.slotFill && !next.groupSeats && !next.lastMinute) next.enabled = false;
          onChange(next);
        };
        return (
          <div
            key={row.key}
            className={cn(
              compact ? "py-3 pl-10 pr-5" : "px-5 py-4",
              i > 0 && !compact && "border-t border-[#f0f0f0]",
            )}
          >
            <div className="flex items-center justify-between gap-6">
              <div className="min-w-0">
                <div className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-[15px]")}>
                  {row.title}
                </div>
                {!compact ? (
                  <div className="mt-0.5 max-w-[620px] text-[13.5px] font-medium leading-relaxed text-[#6a6a6a]">
                    {row.description}
                  </div>
                ) : null}
              </div>
              <InlineToggle checked={checked} onChange={toggle} size="lg" />
            </div>
            <AnimatePresence initial={false}>
              {row.key === "lastMinute" && checked ? (
                <motion.div
                  key="hours"
                  initial={{ height: 0, opacity: 0, overflow: "hidden" }}
                  animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
                  exit={{ height: 0, opacity: 0, overflow: "hidden" }}
                  transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <LastMinuteHoursInput
                    value={value.lastMinuteHours}
                    onCommit={(hours) => onChange({ ...value, lastMinuteHours: hours })}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/**
 * «Prenotazione degli allievi dall'app»: Attiva / Solo eccezioni / Disattiva,
 * con eccezioni per percorso patente. Sotto il cofano resta `appBookingActors`
 * (+ per percorso) e `studentBookingExceptions` (+ per percorso).
 */
function StudentBookingField({
  value,
  onChange,
  onOpenLimits,
}: {
  value: StudentBookingSettingsValue;
  onChange: (next: StudentBookingSettingsValue) => void;
  onOpenLimits: () => void;
}) {
  const byPath = value.appBookingActorsByPath;
  const perPath = Boolean(byPath.moto || byPath.auto || byPath.pro);
  const defaultMode = modeOf(value.appBookingActors, value.studentBookingExceptions);
  const bucketActors = (key: LicensePathBucket) => byPath[key] ?? value.appBookingActors;
  const bucketExceptions = (key: LicensePathBucket) =>
    value.studentBookingExceptionsByPath[key] ?? value.studentBookingExceptions;
  const bucketMode = (key: LicensePathBucket) => modeOf(bucketActors(key), bucketExceptions(key));

  // «Anche gli istruttori» vale per tutto ciò che è «Attiva».
  const openActors = perPath
    ? LICENSE_PATH_BUCKETS.filter((b) => bucketMode(b.key) === "open").map((b) => bucketActors(b.key))
    : defaultMode === "open"
      ? [value.appBookingActors]
      : [];
  const instructorsToo = openActors.length > 0 && openActors.every((a) => a === "both");
  const openValue = instructorsToo || (openActors.length === 0 && value.appBookingActors !== "students")
    ? "both"
    : "students";

  const applyMode = (
    mode: StudentBookingModeValue,
    ex: StudentBookingExceptions,
  ): { actors: string; exceptions: StudentBookingExceptions } => {
    if (mode === "open") return { actors: openValue, exceptions: ex };
    if (mode === "exceptions") return { actors: "instructors", exceptions: toExceptions(ex) };
    return { actors: "instructors", exceptions: { ...ex, enabled: false } };
  };

  const setDefaultMode = (v: string) => {
    if (v === "per_path") {
      // Parte da tre percorsi uguali al valore attuale.
      const ex = value.studentBookingExceptions;
      onChange({
        ...value,
        appBookingActorsByPath: { moto: value.appBookingActors, auto: value.appBookingActors, pro: value.appBookingActors },
        studentBookingExceptionsByPath: { moto: ex, auto: ex, pro: ex },
      });
      return;
    }
    const next = applyMode(v as StudentBookingModeValue, value.studentBookingExceptions);
    onChange({
      appBookingActors: next.actors,
      studentBookingExceptions: next.exceptions,
      appBookingActorsByPath: {},
      studentBookingExceptionsByPath: {},
    });
  };

  const setBucket = (key: LicensePathBucket, actors: string, exceptions: StudentBookingExceptions) =>
    onChange({
      ...value,
      appBookingActorsByPath: { ...byPath, [key]: actors },
      studentBookingExceptionsByPath: { ...value.studentBookingExceptionsByPath, [key]: exceptions },
    });

  const setInstructorsToo = (on: boolean) => {
    const actors = on ? "both" : "students";
    if (!perPath) {
      onChange({ ...value, appBookingActors: actors });
      return;
    }
    const nextByPath = { ...byPath };
    for (const b of LICENSE_PATH_BUCKETS) {
      if (bucketMode(b.key) === "open") nextByPath[b.key] = actors;
    }
    onChange({ ...value, appBookingActorsByPath: nextByPath });
  };

  return (
    <>
      <SettingRow
        title="Prenotazione degli allievi dall'app"
        description="Attiva: gli allievi prenotano quando vogliono. Solo eccezioni: prenotano solo nei casi che scegli tu. Disattiva: le guide le fissano solo istruttori e segreteria."
        control={
          <Select value={perPath ? "per_path" : defaultMode} onValueChange={setDefaultMode}>
            <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[280px]")}>
              <SelectValue placeholder="Seleziona" />
            </SelectTrigger>
            <SelectContent>
              {STUDENT_BOOKING_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
              <SelectItem value="per_path">Differenzia per percorso patente…</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <AnimatePresence initial={false} mode="wait">
        {perPath ? (
          <motion.div
            key="per-path"
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="mt-4 rounded-[14px] border border-[#dddddd] bg-white">
              {LICENSE_PATH_BUCKETS.map((bucket, i) => {
                const mode = bucketMode(bucket.key);
                const ex = bucketExceptions(bucket.key);
                return (
                  <div key={bucket.key} className={cn(i > 0 && "border-t border-[#f0f0f0]")}>
                    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">{bucket.label}</div>
                        <div className="mt-0.5 text-[12px] font-medium text-[#a0a0a0]">{bucket.cats}</div>
                      </div>
                      <Select
                        value={mode}
                        onValueChange={(v) => {
                          const next = applyMode(v as StudentBookingModeValue, ex);
                          setBucket(bucket.key, next.actors, next.exceptions);
                        }}
                      >
                        <SelectTrigger className={cn(SELECT_TRIGGER_CLASS, "w-[200px]")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STUDENT_BOOKING_MODE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <AnimatePresence initial={false}>
                      {mode === "exceptions" ? (
                        <motion.div
                          key="exceptions"
                          initial={{ height: 0, opacity: 0, overflow: "hidden" }}
                          animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
                          exit={{ height: 0, opacity: 0, overflow: "hidden" }}
                          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                          className="border-t border-[#f0f0f0] pb-2"
                        >
                          <ExceptionsList
                            compact
                            value={ex}
                            onChange={(nextEx) =>
                              setBucket(bucket.key, nextEx.enabled ? "instructors" : bucketActors(bucket.key), nextEx)
                            }
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : defaultMode === "exceptions" ? (
          <motion.div
            key="exceptions"
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <ExceptionsList
              value={value.studentBookingExceptions}
              onChange={(nextEx) => onChange({ ...value, studentBookingExceptions: nextEx })}
            />
          </motion.div>
        ) : defaultMode === "closed" ? (
          <motion.div
            key="closed"
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="mt-4 rounded-[14px] border border-[#dddddd] bg-white px-5 py-4 text-[13.5px] font-medium leading-relaxed text-[#6a6a6a]">
              Gli allievi non possono prenotare in nessun caso e non ricevono notifiche di posti liberi. Le guide le
              fissano istruttori e segreteria.
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {openActors.length > 0 ? (
        <div className="mt-6">
          <SettingRow
            title="Anche gli istruttori prenotano dall'app"
            description={
              perPath
                ? "Vale per i percorsi con prenotazione attiva. Con «Solo eccezioni» e «Disattiva» gli istruttori prenotano sempre."
                : "Gli istruttori possono fissare le guide degli allievi dal telefono."
            }
            checked={instructorsToo}
            onToggle={() => setInstructorsToo(!instructorsToo)}
          />
        </div>
      ) : null}

      {perPath || defaultMode === "exceptions" ? (
        <p className="mt-5 text-[13.5px] font-medium text-[#6a6a6a]">
          Gli scambi tra allievi non dipendono da qui: si attivano in{" "}
          <button
            type="button"
            onClick={onOpenLimits}
            className="cursor-pointer text-foreground underline underline-offset-2"
          >
            Limiti
          </button>
          .
        </p>
      ) : null}
    </>
  );
}

export default function BookingsTab({
  availabilityWeeks,
  setAvailabilityWeeks,
  bookingMinStartDate,
  setBookingMinStartDate,
  appBookingActors,
  setAppBookingActors,
  appBookingActorsByPath,
  setAppBookingActorsByPath: _setAppBookingActorsByPath,
  studentBookingExceptions,
  studentBookingExceptionsByPath,
  onStudentBookingChange,
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
  lessonBufferEnabled,
  setLessonBufferEnabled,
  lessonBufferMinutes,
  setLessonBufferMinutes,
  weeklyBookingLimitEnabled,
  setWeeklyBookingLimitEnabled,
  weeklyBookingLimit,
  setWeeklyBookingLimit,
  autoBookingBlockEnabled,
  setAutoBookingBlockEnabled,
  autoBookingBlockThreshold,
  setAutoBookingBlockThreshold,
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
  groupLessonsDiscoveryEnabled,
  setGroupLessonsDiscoveryEnabled,
  motoGroupExactCategoryOnly,
  setMotoGroupExactCategoryOnly,
  instructorPreferenceEnabled,
  setInstructorPreferenceEnabled,
  toast,
}: BookingsTabProps) {
  const [subTab, setSubTab] = React.useState<SubTab>("generali");
  const company = useAtomValue(companyAtom);
  const consortium = isConsortium(company?.services ?? null);
  const subTabs = consortium ? CONSORTIUM_SUB_TABS : SUB_TABS;

  const isPaused = Boolean(
    examPriorityPausedUntil && new Date(examPriorityPausedUntil) > new Date(),
  );

  return (
    <div data-testid="bookings-pane">
      {/* ── Sub-tab Generali / Limiti / Guide / App allievi ── */}
      <div className="flex flex-wrap items-center gap-8 border-b border-[#e8e8e8]">
        {subTabs.map((tab) => (
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
          <StudentBookingField
            value={{
              appBookingActors,
              appBookingActorsByPath: appBookingActorsByPath ?? {},
              studentBookingExceptions,
              studentBookingExceptionsByPath,
            }}
            onChange={onStudentBookingChange}
            onOpenLimits={() => setSubTab("limiti")}
          />
          {(() => {
            // La modalità istruttore serve se gli istruttori sono coinvolti in un
            // valore qualsiasi (default o uno dei percorsi).
            const byPath = appBookingActorsByPath ?? {};
            const perPath = Boolean(byPath.moto || byPath.auto || byPath.pro);
            const instructorsInvolved = perPath
              ? [byPath.moto, byPath.auto, byPath.pro].some((v) => v === "instructors" || v === "both")
              : appBookingActors === "instructors" || appBookingActors === "both";
            if (!instructorsInvolved) return null;
            return (
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
            );
          })()}
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
              <TimePickerInput
                value={bookingCutoffTime}
                onChange={setBookingCutoffTime}
                minTime="12:00"
                maxTime="22:00"
                minuteStep={30}
                placeholder="Orario"
                className="w-[200px] justify-between py-[11px]"
              />
            </FieldBlock>
          )}
        </div>

        <div className="py-6">
          <SettingRow
            title="Pausa tra una guida e l'altra"
            description="Dopo ogni guida l'agenda dell'istruttore resta bloccata per il tempo che scegli: cambio allievo, rientro, due minuti di fiato. La guida dopo si può prendere solo passata la pausa."
            checked={lessonBufferEnabled}
            onToggle={() => setLessonBufferEnabled((prev) => !prev)}
          />
          {lessonBufferEnabled && (
            <FieldBlock label="Minuti di pausa">
              <NumberField
                value={lessonBufferMinutes}
                min={5}
                max={60}
                step={5}
                onCommit={setLessonBufferMinutes}
              />
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
                <TimePickerInput
                  value={restrictedTimeRangeStart}
                  onChange={setRestrictedTimeRangeStart}
                  minTime="06:00"
                  maxTime="14:00"
                  minuteStep={60}
                  placeholder="Inizio"
                  className="w-[180px] justify-between py-[11px]"
                />
              </FieldBlock>
              <FieldBlock label="Fine fascia">
                <TimePickerInput
                  value={restrictedTimeRangeEnd}
                  onChange={setRestrictedTimeRangeEnd}
                  minTime="09:00"
                  maxTime="16:00"
                  minuteStep={60}
                  placeholder="Fine"
                  className="w-[180px] justify-between py-[11px]"
                />
              </FieldBlock>
            </div>
          )}
        </div>

        <div className="py-6">
          <SettingRow
            title="Blocca chi ha troppe guide da pagare"
            titleExtra={
              <InfoTooltip text="Usa lo stesso blocco del blocco manuale. L'allievo viene sbloccato in automatico quando torna sotto soglia. Se lo sblocchi tu a mano, non verrà ribloccato per lo stesso debito residuo." />
            }
            description="Quando un allievo supera il numero di guide da pagare non ancora saldate, le sue prenotazioni vengono bloccate automaticamente finché non salda."
            checked={autoBookingBlockEnabled}
            onToggle={() => setAutoBookingBlockEnabled((prev) => !prev)}
          />
          {autoBookingBlockEnabled && (
            <FieldBlock label="Guide da pagare non saldate che fanno scattare il blocco">
              <NumberField
                value={autoBookingBlockThreshold}
                min={1}
                max={50}
                onCommit={setAutoBookingBlockThreshold}
              />
            </FieldBlock>
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

        {groupLessonsEnabled && (
          <div className="py-6">
            <SettingRow
              title="Gruppi visibili agli allievi"
              description={
                groupLessonsDiscoveryEnabled
                  ? "Gli allievi abilitati vedono i gruppi con posti liberi nell'app e possono iscriversi da soli."
                  : "Disattivo — gli allievi vedono solo i gruppi in cui li inserisci tu (niente lista né inviti)."
              }
              checked={groupLessonsDiscoveryEnabled}
              onToggle={() => setGroupLessonsDiscoveryEnabled((prev) => !prev)}
            />
          </div>
        )}

        {groupLessonsEnabled && (
          <div className="py-6">
            <SettingRow
              title="Guide di gruppo moto: solo moto della categoria esatta"
              titleExtra={
                <InfoTooltip text="Vale solo per l'iscrizione autonoma dell'allievo dall'app. L'istruttore da app e il titolare da web possono iscrivere i ragazzi come sempre, senza questo vincolo." />
              }
              description={
                motoGroupExactCategoryOnly
                  ? "L'allievo può iscriversi da solo a una guida di gruppo moto solo se è libera una moto della sua categoria esatta — mai una inferiore, anche se resterebbero posti liberi."
                  : "Disattivo — l'allievo può iscriversi anche se resta libera solo una moto di categoria inferiore (guida a rotazione)."
              }
              checked={motoGroupExactCategoryOnly}
              onToggle={() => setMotoGroupExactCategoryOnly((prev) => !prev)}
            />
          </div>
        )}
      </div>

      {/* ══ APP ALLIEVI ══ */}
      <div className={cn("divide-y divide-[#ebebeb]", subTab !== "app" && "hidden")}>
        <div className="py-6">
          <SettingRow
            title="Mostra note e percorsi nell'app allievi"
            description="Dopo ogni guida gli allievi vedono nella loro app le note dell'istruttore e, con Reglo Road, il percorso fatto e le segnalazioni sul punto."
            checked={studentNotesEnabled}
            onToggle={() => setStudentNotesEnabled((prev) => !prev)}
          />
        </div>

        {/* "Notifica slot disponibili domani" è stata spostata nel pane
            "Promemoria e notifiche" (card Notifica slot vuoti, 2026-07-12) */}

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
      {!consortium && (
        <div className={cn("pt-6", subTab !== "crediti" && "hidden")}>
          <PaymentsSettingsPane />
        </div>
      )}

      {/* ══ PREZZI (solo consorzio) ══ */}
      {consortium && (
        <div className={cn("pt-6", subTab !== "prezzi" && "hidden")}>
          <ConsorzioPrezziPane />
        </div>
      )}
    </div>
  );
}
