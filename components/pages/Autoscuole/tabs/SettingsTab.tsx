"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Coffee,
  MapPin,
  Moon,
} from "lucide-react";

import { LocationsSection } from "@/components/pages/Autoscuole/locations/LocationsSection";

import { Button } from "@/components/ui/button";
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
import { TimePickerInput } from "@/components/ui/time-picker";
import { PROTO_SELECT_TRIGGER } from "@/components/ui/proto-styles";
import {
  NATIONAL_HOLIDAYS,
  nationalHolidayDateLabel,
} from "@/lib/autoscuole/national-holidays";
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
  { value: "push", label: "Notifica" },
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
export type SettingsSectionKey = "bookings" | "reminders" | "policy" | "locations";

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
  nationalHolidaysEnabled: boolean;
  setNationalHolidaysEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  nationalHolidaysDisabled: string[];
  setNationalHolidaysDisabled: React.Dispatch<React.SetStateAction<string[]>>;
  // Reminders (pane auto-save: ogni modifica persiste subito il campo toccato)
  studentReminderMinutes: string;
  studentReminderMorningEnabled: boolean;
  studentReminderMorningTime: string;
  studentReminderDayBeforeEnabled: boolean;
  studentReminderDayBeforeTime: string;
  instructorReminderMinutes: string;
  instructorReminderEnabled: boolean;
  slotFillChannels: ChannelValue[];
  studentReminderChannels: ChannelValue[];
  instructorReminderChannels: ChannelValue[];
  updateReminderSettings: (patch: {
    studentReminderMinutes?: number;
    instructorReminderMinutes?: number;
    instructorReminderEnabled?: boolean;
    studentReminderMorningEnabled?: boolean;
    studentReminderMorningTime?: string;
    studentReminderDayBeforeEnabled?: boolean;
    studentReminderDayBeforeTime?: string;
    slotFillChannels?: ChannelValue[];
    studentReminderChannels?: ChannelValue[];
    instructorReminderChannels?: ChannelValue[];
  }) => Promise<void>;
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
        {description && (
          <p className="mb-6 max-w-[560px] text-sm font-medium text-[#6a6a6a]">{description}</p>
        )}
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
    <div className="flex w-full items-center justify-between gap-4 rounded-[10px] bg-[#f8f8f8] p-4 text-left">
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        {description && (
          <div className="mt-0.5 text-[13px] font-medium text-[#929292]">{description}</div>
        )}
      </div>
      <InlineToggle checked={checked} onChange={onChange} size="lg" />
    </div>
  );
}

/** Card "Modalità di invio" del proto: canali con check circolari near-black. */
function ChannelCard({
  title,
  info,
  value,
  onChange,
  disabled,
}: {
  title: string;
  /** Testo del tooltip info accanto al titolo (stile proto, dark). */
  info?: string;
  value: ChannelValue[];
  onChange: (next: ChannelValue[]) => void;
  /** Attenua la card quando il promemoria relativo è disattivato. */
  disabled?: boolean;
}) {
  const [infoOpen, setInfoOpen] = React.useState(false);
  return (
    <div
      className={cn(
        "rounded-[12px] border border-[#e8e8e8] bg-white p-4",
        disabled && "pointer-events-none opacity-45",
      )}
    >
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-[13px] font-semibold text-[#222222]">{title}</span>
        {info && (
          <span
            className="relative inline-flex items-center"
            onMouseEnter={() => setInfoOpen(true)}
            onMouseLeave={() => setInfoOpen(false)}
            onClick={() => setInfoOpen((prev) => !prev)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-none cursor-pointer">
              <circle cx="7" cy="7" r="6" stroke="#b0b0b0" strokeWidth="1.2" />
              <path d="M7 6.2v3.3" stroke="#b0b0b0" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="7" cy="4.2" r="0.85" fill="#b0b0b0" />
            </svg>
            {infoOpen && (
              <div className="absolute bottom-[calc(100%+8px)] left-1/2 z-[300] w-[210px] -translate-x-1/2 rounded-[8px] bg-[#222222] px-[11px] py-[9px] text-[11.5px] font-normal leading-[1.45] text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
                {info}
                <span className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent border-t-[#222222]" />
              </div>
            )}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {CHANNEL_OPTIONS.map((channel) => {
          const checked = value.includes(channel.value);
          return (
            <div key={channel.value} className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#555555]">{channel.label}</span>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-label={`${channel.label} — ${title}`}
                onClick={() =>
                  onChange(
                    checked
                      ? value.filter((item) => item !== channel.value)
                      : [...value, channel.value],
                  )
                }
                className={cn(
                  "flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors",
                  checked
                    ? "bg-[#222222]"
                    : "border-[1.5px] border-[#d6d6d6] bg-white hover:border-[#929292]",
                )}
              >
                {checked && <Check className="size-3 text-white" strokeWidth={2.6} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Banner grigio del proto (Promemoria mattutino / giorno prima) con toggle e
 *  orario di invio rivelato quando attivo. */
function ReminderBanner({
  icon: Icon,
  title,
  description,
  checked,
  onToggle,
  timeValue,
  minTime,
  maxTime,
  onTimeChange,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: string | number }>;
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  timeValue: string;
  /** Limiti opzionali: senza, il picker naviga tutte le 24 ore. */
  minTime?: string;
  maxTime?: string;
  onTimeChange: (v: string) => void;
}) {
  return (
    <div className="rounded-[10px] bg-[#f8f8f8] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#222222]">
            <Icon className="size-4 shrink-0" strokeWidth={2} />
            {title}
          </div>
          <div className="mt-0.5 text-[13px] font-medium text-[#929292]">{description}</div>
        </div>
        <InlineToggle checked={checked} onChange={onToggle} size="lg" />
      </div>
      {checked && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-3">
          <span className="text-[13px] font-medium text-[#555555]">Orario di invio</span>
          <TimePickerInput
            value={timeValue}
            onChange={onTimeChange}
            minTime={minTime}
            maxTime={maxTime}
          />
        </div>
      )}
    </div>
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
    <div className="mt-2 overflow-hidden rounded-[10px] border border-[#efefef]">
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
  nationalHolidaysEnabled,
  setNationalHolidaysEnabled,
  nationalHolidaysDisabled,
  setNationalHolidaysDisabled,
  studentReminderMinutes,
  studentReminderMorningEnabled,
  studentReminderMorningTime,
  studentReminderDayBeforeEnabled,
  studentReminderDayBeforeTime,
  instructorReminderMinutes,
  instructorReminderEnabled,
  slotFillChannels,
  studentReminderChannels,
  instructorReminderChannels,
  updateReminderSettings,
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
  // La pane Promemoria è auto-save (come Veicoli): niente bottone Salva.
  const showSaveButton = !section || section === "bookings" || section === "policy";
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
              className="flex cursor-pointer items-center justify-between gap-4 rounded-[10px] bg-[#f8f8f8] p-4"
              onClick={() => setRoundedHoursOnly((prev) => !prev)}
            >
              <div>
                <div className="text-sm font-semibold text-[#222222]">Solo orari tondi</div>
                <div className="mt-0.5 text-[13px] font-medium text-[#929292]">
                  Proponi agli allievi solo orari pieni (16:00, 17:00, ecc.)
                </div>
              </div>
              <InlineToggle checked={roundedHoursOnly} size="lg" />
            </div>

            {/* Festività non prenotabili (preset nazionale, proto) */}
            <div>
              <div
                className="flex cursor-pointer items-center justify-between gap-4 rounded-[10px] bg-[#f8f8f8] p-4"
                onClick={() => setNationalHolidaysEnabled((prev) => !prev)}
              >
                <div>
                  <div className="text-sm font-semibold text-[#222222]">Festività non prenotabili</div>
                  <div className="mt-0.5 text-[13px] font-medium text-[#929292]">
                    I giorni segnati come festivi sul calendario (nazionali e locali) restano chiusi alle prenotazioni.
                  </div>
                </div>
                <InlineToggle checked={nationalHolidaysEnabled} size="lg" />
              </div>
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
        </AccordionSection>
        )}

        {/* ── Promemoria e notifiche (layout proto, auto-save) ── */}
        {show("reminders") && (
        <AccordionSection
          icon={Bell}
          title="Promemoria e notifiche"
          description={standalone ? "" : "Quando e su quali canali inviare promemoria a allievi e istruttori."}
          expanded={expandedSection === "reminders"}
          onToggle={() => toggleSection("reminders")}
          standalone={standalone}
        >
          <div>
            {/* Preavviso a minuti */}
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold text-[#555555]">Promemoria allievo</div>
                <Select
                  value={studentReminderMinutes}
                  onValueChange={(value) =>
                    updateReminderSettings({ studentReminderMinutes: Number(value) })
                  }
                >
                  <SelectTrigger className={PROTO_SELECT_TRIGGER}>
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
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-[#555555]">Promemoria istruttore</div>
                <Select
                  value={instructorReminderEnabled ? instructorReminderMinutes : "off"}
                  onValueChange={(value) =>
                    value === "off"
                      ? updateReminderSettings({ instructorReminderEnabled: false })
                      : updateReminderSettings({
                          instructorReminderEnabled: true,
                          instructorReminderMinutes: Number(value),
                        })
                  }
                >
                  <SelectTrigger className={PROTO_SELECT_TRIGGER}>
                    <SelectValue placeholder="Minuti" />
                  </SelectTrigger>
                  <SelectContent>
                    {REMINDER_OPTIONS.map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {minutes} minuti prima
                      </SelectItem>
                    ))}
                    <SelectItem value="off">Non inviare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Banner promemoria extra */}
            <div className="space-y-3">
              <ReminderBanner
                icon={Coffee}
                title="Promemoria mattutino"
                description="Invia un promemoria la mattina del giorno della guida, in aggiunta al reminder a minuti."
                checked={studentReminderMorningEnabled}
                onToggle={() =>
                  updateReminderSettings({
                    studentReminderMorningEnabled: !studentReminderMorningEnabled,
                  })
                }
                timeValue={studentReminderMorningTime}
                minTime="05:00"
                maxTime="12:00"
                onTimeChange={(value) =>
                  updateReminderSettings({ studentReminderMorningTime: value })
                }
              />
              <ReminderBanner
                icon={Moon}
                title="Promemoria il giorno prima"
                description="Invia un promemoria il giorno prima della guida, all'orario scelto."
                checked={studentReminderDayBeforeEnabled}
                onToggle={() =>
                  updateReminderSettings({
                    studentReminderDayBeforeEnabled: !studentReminderDayBeforeEnabled,
                  })
                }
                timeValue={studentReminderDayBeforeTime}
                onTimeChange={(value) =>
                  updateReminderSettings({ studentReminderDayBeforeTime: value })
                }
              />
            </div>

            {/* Modalità di invio */}
            <div className="mb-2.5 mt-5">
              <div className="text-[13px] font-semibold text-[#222222]">Modalità di invio</div>
              <div className="mt-0.5 text-xs font-medium text-[#929292]">
                Sconsigliamo l&apos;email per la scarsa leggibilità.
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ChannelCard
                title="Promemoria allievo"
                value={studentReminderChannels}
                onChange={(next) => updateReminderSettings({ studentReminderChannels: next })}
              />
              <ChannelCard
                title="Promemoria istruttore"
                value={instructorReminderChannels}
                onChange={(next) => updateReminderSettings({ instructorReminderChannels: next })}
                disabled={!instructorReminderEnabled}
              />
              <ChannelCard
                title="Cancellazioni"
                info="Quando un allievo annulla una guida, invia una notifica per riempire lo slot rimasto libero."
                value={slotFillChannels}
                onChange={(next) => updateReminderSettings({ slotFillChannels: next })}
              />
            </div>

            {/* Rimando a Invia comunicato */}
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[10px] bg-[#f8f8f8] px-4 py-[13px] text-[13px] font-medium text-[#6a6a6a]">
              <span>Per inviare un comunicato personalizzato vai su</span>
              <span className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full border border-[#e0e0e0] bg-white">
                <svg width="14" height="11" viewBox="0 0 18 13" fill="none">
                  <path d="M1 1h16M1 6.5h16M1 12h16" stroke="#222" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </span>
              <ArrowRight className="size-[15px] text-[#bbbbbb]" strokeWidth={2} />
              <span className="inline-flex items-center gap-[5px] font-semibold text-[#222222]">
                <Bell className="size-[15px]" strokeWidth={2} />
                Invia comunicato
              </span>
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

            {/* Per-type cards — chip proto (check azzurra) + limite orario */}
            <div>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.5px] text-[#929292]">
                Configura per tipo di guida
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {LESSON_TYPE_OPTIONS.map((option) => {
                  const constraint = lessonConstraints[option.value] ?? DEFAULT_LESSON_CONSTRAINT;
                  const isRequired = lessonRequiredTypes.includes(option.value);
                  const hasLimit = constraint.enabled;
                  return (
                    <div
                      key={option.value}
                      className={cn(
                        "rounded-[12px] border-[1.5px] p-[13px] transition-colors",
                        isRequired ? "border-[#9fc3f0] bg-[#eaf2fd]" : "border-[#e8e8e8] bg-white",
                      )}
                    >
                      {/* Header proto: cerchio check + label, click = obbligatorio */}
                      <div
                        role="switch"
                        tabIndex={0}
                        aria-checked={isRequired}
                        aria-label={`Segna ${option.label} come obbligatorio`}
                        onClick={() => toggleRequiredType(option.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRequiredType(option.value); } }}
                        className="flex cursor-pointer select-none items-center gap-2.5 px-0.5"
                      >
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full transition-colors",
                            isRequired ? "bg-[#cfe0fb]" : "border-[1.5px] border-[#dcdcdc]",
                          )}
                        >
                          {isRequired && (
                            <Check className="size-3 text-[#1a2b45]" strokeWidth={2.4} />
                          )}
                        </span>
                        <span
                          className={cn(
                            "text-[13.5px] font-semibold",
                            isRequired ? "text-[#1a2b45]" : "text-[#444444]",
                          )}
                        >
                          {option.label}
                        </span>
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
                          "mt-3 flex w-full cursor-pointer items-center justify-between rounded-[8px] px-2.5 py-2 text-xs transition-colors",
                          hasLimit
                            ? "bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                            : "bg-[#f8f8f8] text-[#6a6a6a] hover:bg-[#f2f2f2]",
                          isRequired && !hasLimit && "bg-white/60 hover:bg-white/80",
                        )}
                      >
                        <span className="font-medium">Limite orario</span>
                        <InlineToggle checked={hasLimit} size="sm" />
                      </div>

                      {/* Expanded: days + time window */}
                      {hasLimit && (
                        <div className="mt-3 space-y-2.5 border-t border-black/[0.06] pt-2.5">
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
