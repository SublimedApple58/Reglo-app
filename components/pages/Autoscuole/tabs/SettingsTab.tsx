"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CalendarDays, Check, ChevronDown, ClipboardList } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
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

export type SettingsTabProps = {
  expandedSection: string | null;
  toggleSection: (key: string) => void;
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

function AccordionSection({
  icon: Icon,
  title,
  description,
  expanded,
  onToggle,
  isFirst,
  isLast,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  children: React.ReactNode;
}) {
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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-50">
            <Icon className="h-4 w-4 text-yellow-600" />
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
          ? "border-yellow-200 bg-yellow-50 hover:bg-yellow-100/50"
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
}: SettingsTabProps) {
  return (
    <>
      {/* Accordion settings card */}
      <div className="rounded-2xl border border-border bg-white shadow-card">
        {/* ── Prenotazioni ── */}
        <AccordionSection
          icon={CalendarDays}
          title="Prenotazioni"
          description="Durate, attori e settimane di disponibilità visibili in app."
          expanded={expandedSection === "bookings"}
          onToggle={() => toggleSection("bookings")}
          isFirst
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

        {/* ── Reminder e notifiche ── */}
        <AccordionSection
          icon={Bell}
          title="Reminder e notifiche"
          description="Quando e su quali canali inviare promemoria a allievi e istruttori."
          expanded={expandedSection === "reminders"}
          onToggle={() => toggleSection("reminders")}
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

        {/* ── Policy tipi guida ── */}
        <AccordionSection
          icon={ClipboardList}
          title="Policy tipi guida"
          description="Regole opzionali su copertura tipi e finestre settimanali per ogni tipo guida."
          expanded={expandedSection === "policy"}
          onToggle={() => toggleSection("policy")}
          isLast
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
                        hasLimit ? "border-yellow-200" : "border-border",
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
                            ? "bg-yellow-50 text-foreground"
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
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="min-w-[180px]"
        >
          {savingSettings ? "Salvataggio..." : "Salva configurazione"}
        </Button>
      </div>
    </>
  );
}

export default SettingsTab;
