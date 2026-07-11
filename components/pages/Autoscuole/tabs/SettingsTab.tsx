"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  ClipboardList,
  Coffee,
  MapPin,
  Moon,
} from "lucide-react";

import { LocationsSection } from "@/components/pages/Autoscuole/locations/LocationsSection";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { TimePickerInput } from "@/components/ui/time-picker";
import { PROTO_SELECT_TRIGGER } from "@/components/ui/proto-styles";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ChannelValue = "push" | "whatsapp" | "email";
type LessonTypeValue = "manovre" | "urbano" | "extraurbano" | "notturna" | "autostrada" | "parcheggio" | "altro";
type LessonConstraintState = { enabled: boolean; daysOfWeek: number[]; startMinutes: number; endMinutes: number };
type LessonConstraintMap = Record<LessonTypeValue, LessonConstraintState>;

// ── Constants ─────────────────────────────────────────────────────────────────

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
export type SettingsSectionKey = "reminders" | "policy" | "locations";

export type SettingsTabProps = {
  expandedSection: string | null;
  toggleSection: (key: string) => void;
  /**
   * Se valorizzata, renderizza SOLO quella sezione senza chrome accordion
   * (usata dall'overlay "Impostazioni dell'account" del redesign).
   */
  section?: SettingsSectionKey;
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

// ── Main component ────────────────────────────────────────────────────────────

function SettingsTab({
  expandedSection,
  toggleSection,
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
  section,
}: SettingsTabProps) {
  const standalone = Boolean(section);
  const show = (key: SettingsSectionKey) => !section || section === key;
  return (
    <>
      {/* Accordion settings card (chrome solo in modalità tab legacy) */}
      <div className={standalone ? undefined : "rounded-2xl border border-border bg-white shadow-card"}>
        {/* ── Promemoria e notifiche (layout proto, auto-save) ── */}
        {show("reminders") && (
        <AccordionSection
          icon={Bell}
          title="Promemoria e notifiche"
          description={standalone ? "" : "Quando e su quali canali inviare promemoria a allievi e istruttori."}
          expanded={expandedSection === "reminders"}
          onToggle={() => toggleSection("reminders")}
          isFirst
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

    </>
  );
}

export default SettingsTab;
