"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CalendarDays, Check, ChevronDown, ClipboardList, KeyRound, Loader2, MapPin } from "lucide-react";

import { LocationsSection } from "@/components/pages/Autoscuole/locations/LocationsSection";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import {
  getQuizSeatsContext,
  setAutoAssignQuizOnSignup,
} from "@/lib/actions/autoscuole-settings.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldGroup } from "@/components/ui/field-group";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { DatePickerInput } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ChannelValue = "push" | "whatsapp" | "email";
type LessonTypeValue = "manovre" | "urbano" | "extraurbano" | "notturna" | "autostrada" | "parcheggio" | "altro";
type LessonConstraintState = { enabled: boolean; daysOfWeek: number[]; startMinutes: number; endMinutes: number };
type LessonConstraintMap = Record<LessonTypeValue, LessonConstraintState>;

// ── Constants ─────────────────────────────────────────────────────────────────

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
const CHANNEL_OPTIONS = [
  { value: "push", label: "Push" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
] as const;
const REMINDER_OPTIONS = [120, 60, 30, 20, 15] as const;
const LESSON_TYPE_OPTIONS = [
  { value: "manovre", label: "Manovre" },
  { value: "urbano", label: "Urbano" },
  { value: "extraurbano", label: "Extraurbano" },
  { value: "notturna", label: "Notturna" },
  { value: "autostrada", label: "Autostrada" },
  { value: "parcheggio", label: "Parcheggio" },
  { value: "altro", label: "Altro" },
] as const;
const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Gio" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
] as const;
const START_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => index * 30);
const END_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => (index + 1) * 30);

const DEFAULT_LESSON_CONSTRAINT: LessonConstraintState = {
  enabled: false,
  daysOfWeek: [1, 2, 3, 4, 5],
  startMinutes: 9 * 60,
  endMinutes: 18 * 60,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${pad(hours)}:${pad(minutes)}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

/** Chiavi delle sezioni renderizzabili in modalità standalone (overlay Impostazioni) */
export type SettingsSectionKey = "bookings" | "reminders" | "policy" | "locations" | "registration";

export type SettingsTabProps = {
  expandedSection: string | null;
  toggleSection: (key: string) => void;
  /**
   * Se valorizzata, renderizza SOLO quella sezione senza chrome accordion
   * (usata dall'overlay "Impostazioni dell'account" del redesign).
   */
  section?: SettingsSectionKey;
  // Booking settings
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
  // Reminders
  studentReminderMinutes: string;
  setStudentReminderMinutes: (v: string) => void;
  studentReminderMorningEnabled: boolean;
  setStudentReminderMorningEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  studentReminderMorningTime: string;
  setStudentReminderMorningTime: (v: string) => void;
  studentReminderDayBeforeEnabled: boolean;
  setStudentReminderDayBeforeEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  studentReminderDayBeforeTime: string;
  setStudentReminderDayBeforeTime: (v: string) => void;
  instructorReminderMinutes: string;
  setInstructorReminderMinutes: (v: string) => void;
  slotFillChannels: ChannelValue[];
  studentReminderChannels: ChannelValue[];
  instructorReminderChannels: ChannelValue[];
  toggleChannel: (channel: ChannelValue, setter: React.Dispatch<React.SetStateAction<ChannelValue[]>>) => void;
  setSlotFillChannels: React.Dispatch<React.SetStateAction<ChannelValue[]>>;
  setStudentReminderChannels: React.Dispatch<React.SetStateAction<ChannelValue[]>>;
  setInstructorReminderChannels: React.Dispatch<React.SetStateAction<ChannelValue[]>>;
  // Policy
  lessonPolicyEnabled: boolean;
  setLessonPolicyEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  lessonRequiredTypesEnabled: boolean;
  setLessonRequiredTypesEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  lessonRequiredTypes: LessonTypeValue[];
  toggleRequiredType: (t: LessonTypeValue) => void;
  lessonConstraints: LessonConstraintMap;
  toggleConstraintEnabled: (t: LessonTypeValue) => void;
  toggleConstraintDay: (t: LessonTypeValue, d: number) => void;
  updateConstraintWindow: (t: LessonTypeValue, field: "startMinutes" | "endMinutes", v: string) => void;
  // Save
  handleSaveSettings: () => Promise<void>;
  savingSettings: boolean;
};

// ── Sub-components (local) ────────────────────────────────────────────────────

/**
 * Self-contained accordion section for the "Modalità registrazione allievi"
 * setting. Fetches its own quiz-seats context (so it can show the live
 * counter + preview the FIFO promotion when toggling ON) and persists
 * autoAssignQuizOnSignup through its own server action.
 *
 * Visible only when the autoscuola has 'TEORIA' in phasesEnabled — otherwise
 * the toggle has no semantic meaning.
 */
function RegistrationModeSection({
  expanded,
  onToggle,
  standalone,
}: {
  expanded: boolean;
  onToggle: () => void;
  standalone?: boolean;
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

  // If TEORIA is not part of the autoscuola's journey, the toggle has no
  // meaning — hide the entire section.
  if (!loading && (!ctx || !ctx.phasesEnabled.includes("TEORIA"))) {
    return null;
  }

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    try {
      const res = await setAutoAssignQuizOnSignup({ enabled: next });
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

  const enabled = ctx?.autoAssignQuizOnSignup ?? false;
  const available = ctx?.available ?? 0;
  const used = ctx?.used ?? 0;
  const quizSeats = ctx?.quizSeats ?? 0;

  return (
    <AccordionSection
      icon={KeyRound}
      title="Modalità registrazione allievi"
      description="Cosa succede quando un nuovo allievo si registra con il codice autoscuola."
      expanded={expanded}
      onToggle={onToggle}
      isLast
      standalone={standalone}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Assegnazione automatica della licenza quiz alla registrazione
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {enabled
                  ? "I nuovi allievi ricevono subito una licenza quiz (se disponibile) e partono direttamente in fase Teoria."
                  : "I nuovi allievi entrano in stato 'In attesa di attivazione'. Devi assegnare la licenza manualmente per farli partire dalla teoria."}
              </p>
              {!enabled && available > 0 && (
                <p className="mt-2 text-[11px] text-amber-700">
                  Attivando l&apos;auto-assegnazione, gli allievi attualmente in attesa
                  riceveranno automaticamente una licenza (fino a {available} posti
                  liberi, ordine cronologico di registrazione).
                </p>
              )}
            </div>
            <Checkbox
              checked={enabled}
              disabled={saving || loading}
              onCheckedChange={(checked) => void handleToggle(Boolean(checked))}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-gray-50/60 px-4 py-3 text-xs">
          <span className="text-muted-foreground">Licenze quiz</span>
          <span className="font-medium text-foreground tabular-nums">
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                {used} <span className="text-muted-foreground">/ {quizSeats}</span> usate
              </>
            )}
          </span>
        </div>
      </div>
    </AccordionSection>
  );
}

function AccordionSection({
  icon: Icon,
  title,
  description,
  expanded,
  onToggle,
  isFirst,
  isLast,
  standalone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  /** Rende solo il contenuto, senza header cliccabile né bordi (overlay Impostazioni) */
  standalone?: boolean;
  children: React.ReactNode;
}) {
  if (standalone) {
    return (
      <div>
        <p className="mb-6 max-w-[560px] text-sm font-medium text-[#6a6a6a]">{description}</p>
        {children}
      </div>
    );
  }
  return (
    <div className={cn(!isFirst && "border-t border-border")}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-gray-50/50",
          isFirst && "rounded-t-2xl",
          isLast && !expanded && "rounded-b-2xl",
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef0f6]">
            <Icon className="h-4 w-4 text-navy-900" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
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
            <div className={cn("px-5 pb-5", isLast && "rounded-b-2xl")}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PolicySwitch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}) {
  return (
    <div
      role="switch"
      tabIndex={0}
      aria-checked={checked}
      onClick={onChange}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(); } }}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-all duration-150",
        checked
          ? "border-[#cfcfdc] bg-[#eeeef4] hover:bg-[#e2e2e8]"
          : "border-border bg-white hover:bg-gray-50",
      )}
    >
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <InlineToggle checked={checked} />
    </div>
  );
}

function ChannelGroup({
  title,
  value,
  onToggle,
}: {
  title: string;
  value: ChannelValue[];
  onToggle: (channel: ChannelValue) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-gray-50/50 p-3">
      <div className="text-xs font-medium text-foreground">{title}</div>
      <div className="space-y-2">
        {CHANNEL_OPTIONS.map((channel) => (
          <label
            key={channel.value}
            className="flex cursor-pointer items-center justify-between gap-2 text-xs text-foreground"
          >
            <span>{channel.label}</span>
            <Checkbox
              checked={value.includes(channel.value)}
              onCheckedChange={() => onToggle(channel.value)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function SettingsTab({
  expandedSection,
  toggleSection,
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
  studentReminderMinutes,
  setStudentReminderMinutes,
  studentReminderMorningEnabled,
  setStudentReminderMorningEnabled,
  studentReminderMorningTime,
  setStudentReminderMorningTime,
  studentReminderDayBeforeEnabled,
  setStudentReminderDayBeforeEnabled,
  studentReminderDayBeforeTime,
  setStudentReminderDayBeforeTime,
  instructorReminderMinutes,
  setInstructorReminderMinutes,
  slotFillChannels,
  studentReminderChannels,
  instructorReminderChannels,
  toggleChannel,
  setSlotFillChannels,
  setStudentReminderChannels,
  setInstructorReminderChannels,
  lessonPolicyEnabled,
  setLessonPolicyEnabled,
  lessonRequiredTypesEnabled,
  setLessonRequiredTypesEnabled,
  lessonRequiredTypes,
  toggleRequiredType,
  lessonConstraints,
  toggleConstraintEnabled,
  toggleConstraintDay,
  updateConstraintWindow,
  handleSaveSettings,
  savingSettings,
  section,
}: SettingsTabProps) {
  const standalone = Boolean(section);
  const show = (key: SettingsSectionKey) => !section || section === key;
  const showSaveButton = !section || section === "bookings" || section === "reminders" || section === "policy";
  return (
    <>
      {/* Accordion settings card (chrome solo in modalità tab legacy) */}
      <div className={standalone ? undefined : "rounded-2xl border border-border bg-white shadow-card"}>
        {/* ── Prenotazioni ── */}
        {show("bookings") && (
        <AccordionSection
          icon={CalendarDays}
          title="Prenotazioni"
          description="Durate, attori e settimane di disponibilità visibili in app."
          expanded={expandedSection === "bookings"}
          onToggle={() => toggleSection("bookings")}
          isFirst
          standalone={standalone}
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
              <FieldGroup label="Settimane di disponibilità">
                <Select value={availabilityWeeks} onValueChange={setAvailabilityWeeks}>
                  <SelectTrigger>
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
              </FieldGroup>

              <FieldGroup
                label="Prenotazioni aperte dal"
                description="Lascia vuoto per nessun limite."
              >
                <div className="flex items-center gap-2">
                  <DatePickerInput
                    value={bookingMinStartDate}
                    onChange={setBookingMinStartDate}
                    placeholder="Nessun limite"
                  />
                  {bookingMinStartDate ? (
                    <button
                      type="button"
                      onClick={() => setBookingMinStartDate("")}
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition"
                    >
                      Rimuovi
                    </button>
                  ) : null}
                </div>
              </FieldGroup>

              <FieldGroup label="Chi può prenotare">
                <Select
                  value={appBookingActors}
                  onValueChange={(value) =>
                    setAppBookingActors(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona policy" />
                  </SelectTrigger>
                  <SelectContent>
                    {APP_BOOKING_ACTOR_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>

              {appBookingActors === "instructors" || appBookingActors === "both" ? (
                <FieldGroup label="Modalità istruttore">
                  <Select
                    value={instructorBookingMode}
                    onValueChange={(value) =>
                      setInstructorBookingMode(value)
                    }
                  >
                    <SelectTrigger>
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
                </FieldGroup>
              ) : null}

            </div>

            <FieldGroup label="Durata prenotazione allievo">
              <div className="flex flex-wrap gap-2">
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
            </FieldGroup>

            <div
              className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
              onClick={() => setRoundedHoursOnly((prev) => !prev)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Solo orari tondi</span>
                <span className="text-xs text-muted-foreground">
                  Proponi agli allievi solo orari pieni (16:00, 17:00, ecc.)
                </span>
              </div>
              <InlineToggle checked={roundedHoursOnly} size="sm" />
            </div>
          </div>
        </AccordionSection>
        )}

        {/* ── Reminder e notifiche ── */}
        {show("reminders") && (
        <AccordionSection
          icon={Bell}
          title="Reminder e notifiche"
          description="Quando e su quali canali inviare promemoria a allievi e istruttori."
          expanded={expandedSection === "reminders"}
          onToggle={() => toggleSection("reminders")}
          standalone={standalone}
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
              <FieldGroup label="Reminder allievo">
                <Select
                  value={studentReminderMinutes}
                  onValueChange={setStudentReminderMinutes}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Minuti" />
                  </SelectTrigger>
                  <SelectContent>
                    {REMINDER_OPTIONS.map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {minutes} minuti prima
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>
              <FieldGroup label="Reminder istruttore">
                <Select
                  value={instructorReminderMinutes}
                  onValueChange={setInstructorReminderMinutes}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Minuti" />
                  </SelectTrigger>
                  <SelectContent>
                    {REMINDER_OPTIONS.map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {minutes} minuti prima
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>
            </div>

            {/* Morning reminder */}
            <div className="max-w-2xl space-y-3">
              <div
                className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                onClick={() => setStudentReminderMorningEnabled((prev) => !prev)}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Reminder mattina del giorno</span>
                  <span className="text-xs text-muted-foreground">
                    Invia un promemoria la mattina del giorno della guida, in aggiunta al reminder a minuti.
                  </span>
                </div>
                <InlineToggle checked={studentReminderMorningEnabled} size="sm" />
              </div>
              {studentReminderMorningEnabled && (
                <FieldGroup label="Orario invio">
                  <Select value={studentReminderMorningTime} onValueChange={setStudentReminderMorningTime}>
                    <SelectTrigger><SelectValue placeholder="Orario" /></SelectTrigger>
                    <SelectContent>
                      {["06:00","06:30","07:00","07:30","08:00","08:30","09:00","09:30","10:00"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
              )}
            </div>

            {/* Day-before reminder */}
            <div className="max-w-2xl space-y-3">
              <div
                className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                onClick={() => setStudentReminderDayBeforeEnabled((prev) => !prev)}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Reminder il giorno prima</span>
                  <span className="text-xs text-muted-foreground">
                    Invia un promemoria il giorno prima della guida, all&apos;orario scelto.
                  </span>
                </div>
                <InlineToggle checked={studentReminderDayBeforeEnabled} size="sm" />
              </div>
              {studentReminderDayBeforeEnabled && (
                <FieldGroup label="Orario invio">
                  <Select value={studentReminderDayBeforeTime} onValueChange={setStudentReminderDayBeforeTime}>
                    <SelectTrigger><SelectValue placeholder="Orario" /></SelectTrigger>
                    <SelectContent>
                      {["16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <ChannelGroup
                title="Slot fill"
                value={slotFillChannels}
                onToggle={(channel) =>
                  toggleChannel(channel, setSlotFillChannels)
                }
              />
              <ChannelGroup
                title="Reminder allievo"
                value={studentReminderChannels}
                onToggle={(channel) =>
                  toggleChannel(channel, setStudentReminderChannels)
                }
              />
              <ChannelGroup
                title="Reminder istruttore"
                value={instructorReminderChannels}
                onToggle={(channel) =>
                  toggleChannel(channel, setInstructorReminderChannels)
                }
              />
            </div>
          </div>
        </AccordionSection>
        )}

        {/* ── Policy tipi guida ── */}
        {show("policy") && (
        <AccordionSection
          icon={ClipboardList}
          title="Policy tipi guida"
          description="Regole opzionali su copertura tipi e finestre settimanali per ogni tipo guida."
          expanded={expandedSection === "policy"}
          onToggle={() => toggleSection("policy")}
          standalone={standalone}
        >
          <div className="space-y-5">
            {/* Global toggles */}
            <div className="space-y-2">
              <PolicySwitch
                checked={lessonPolicyEnabled}
                onChange={() => setLessonPolicyEnabled((v) => !v)}
                label="Abilita policy tipi guida"
                description="Attiva le regole di copertura e orario per i tipi di guida"
              />
              <PolicySwitch
                checked={lessonRequiredTypesEnabled}
                onChange={() => setLessonRequiredTypesEnabled((v) => !v)}
                label="Richiedi almeno 1 guida per tipo"
                description="Ogni allievo deve completare almeno una guida per ogni tipo selezionato"
              />
            </div>

            {/* Per-type cards — unified required + limit in one card */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Configura per tipo di guida
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {LESSON_TYPE_OPTIONS.map((option) => {
                  const constraint = lessonConstraints[option.value] ?? DEFAULT_LESSON_CONSTRAINT;
                  const isRequired = lessonRequiredTypes.includes(option.value);
                  const hasLimit = constraint.enabled;
                  return (
                    <div
                      key={option.value}
                      className={cn(
                        "rounded-xl border bg-white p-3 transition-all duration-200",
                        hasLimit ? "border-[#cfcfdc]" : "border-border",
                      )}
                    >
                      {/* Header: name + pill actions */}
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex-1 text-sm font-semibold text-foreground">
                          {option.label}
                        </span>
                        <ToggleChip
                          active={isRequired}
                          onClick={() => toggleRequiredType(option.value)}
                          size="sm"
                          aria-label={`Segna ${option.label} come obbligatorio`}
                        >
                          {isRequired && <Check className="inline size-2.5 mr-0.5" />}
                          Obbl.
                        </ToggleChip>
                      </div>

                      {/* Limite orario toggle row */}
                      <div
                        role="switch"
                        tabIndex={0}
                        aria-checked={hasLimit}
                        aria-label={`Limite orario per ${option.label}`}
                        onClick={() => toggleConstraintEnabled(option.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleConstraintEnabled(option.value); } }}
                        className={cn(
                          "flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-all duration-150",
                          hasLimit
                            ? "bg-[#eeeef4] text-foreground"
                            : "bg-gray-50 text-muted-foreground hover:bg-gray-100",
                        )}
                      >
                        <span className="font-medium">Limite orario</span>
                        <InlineToggle checked={hasLimit} size="sm" />
                      </div>

                      {/* Expanded: days + time window */}
                      {hasLimit && (
                        <div className="mt-3 space-y-2.5 border-t border-border pt-2.5">
                          <div className="flex flex-wrap gap-1">
                            {WEEKDAY_OPTIONS.map((day) => (
                              <ToggleChip
                                key={`${option.value}-${day.value}`}
                                active={constraint.daysOfWeek.includes(day.value)}
                                onClick={() => toggleConstraintDay(option.value, day.value)}
                                size="sm"
                              >
                                {day.label}
                              </ToggleChip>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Select
                              value={String(constraint.startMinutes)}
                              onValueChange={(value) =>
                                updateConstraintWindow(option.value, "startMinutes", value)
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Inizio" />
                              </SelectTrigger>
                              <SelectContent>
                                {START_TIME_OPTIONS.map((minutes) => (
                                  <SelectItem
                                    key={`${option.value}-start-${minutes}`}
                                    value={String(minutes)}
                                  >
                                    {formatMinutes(minutes)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={String(constraint.endMinutes)}
                              onValueChange={(value) =>
                                updateConstraintWindow(option.value, "endMinutes", value)
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Fine" />
                              </SelectTrigger>
                              <SelectContent>
                                {END_TIME_OPTIONS.map((minutes) => (
                                  <SelectItem
                                    key={`${option.value}-end-${minutes}`}
                                    value={String(minutes)}
                                  >
                                    {formatMinutes(minutes)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </AccordionSection>
        )}

        {/* ── Sede e luoghi ── */}
        {show("locations") && (
        <AccordionSection
          icon={MapPin}
          title="Sede e luoghi"
          description="Sede dell'autoscuola e luoghi extra per le guide. Mostrati agli allievi nel dettaglio della guida."
          expanded={expandedSection === "locations"}
          onToggle={() => toggleSection("locations")}
          standalone={standalone}
        >
          <LocationsSection />
        </AccordionSection>
        )}

        {/* ── Modalità registrazione allievi (solo se TEORIA è attiva) ── */}
        {show("registration") && (
        <RegistrationModeSection
          expanded={expandedSection === "registration"}
          onToggle={() => toggleSection("registration")}
          standalone={standalone}
        />
        )}
      </div>

      {/* Save button */}
      {showSaveButton && (
        <div className={cn("flex justify-end", standalone && "mt-8")}>
          <Button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="min-w-[180px]"
          >
            {savingSettings ? "Salvataggio..." : "Salva configurazione"}
          </Button>
        </div>
      )}
    </>
  );
}

export default SettingsTab;
