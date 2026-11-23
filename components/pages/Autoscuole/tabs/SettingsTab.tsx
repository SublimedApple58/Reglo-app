"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  Check,
  ChevronDown,
  ClipboardList,
  MapPin,
  Plus,
  X,
} from "lucide-react";

import { LocationsSection } from "@/components/pages/Autoscuole/locations/LocationsSection";
import { LoadingDots } from "@/components/ui/loading-dots";
import { SuccessOverlay } from "@/components/ui/success-overlay";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { triggerEmptySlotNotification } from "@/lib/actions/autoscuole-settings.actions";

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
import { cn } from "@/lib/utils";
import {
  ChannelCascade,
  type ChannelReach,
} from "@/components/pages/Autoscuole/settings/ChannelCascade";
import { RecentDeliveries } from "@/components/pages/Autoscuole/settings/RecentDeliveries";
import { WhatsAppWelcomeSection } from "@/components/pages/Autoscuole/settings/WhatsAppWelcomeSection";
import {
  SETTINGS_SELECT_TRIGGER,
  SettingsReveal,
  SettingsRow,
  SettingsSection,
  SettingsSubRow,
} from "@/components/pages/Autoscuole/settings/settings-rows";

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
// Mezz'ore accettate dal backend per gli invii della notifica slot vuoti
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
  /** Account consorzio: cambia la lista patenti del picker "Sede e luoghi". */
  consortium?: boolean;
  // Reminders (pane auto-save: ogni modifica persiste subito il campo toccato)
  studentReminderMinutes: string;
  studentReminderMorningEnabled: boolean;
  studentReminderMorningTime: string;
  studentReminderDayBeforeEnabled: boolean;
  studentReminderDayBeforeTime: string;
  /** REG-758: avviso «guida fissata» all'allievo. */
  studentCreationNoticeEnabled: boolean;
  /** REG-767: testo del «Messaggio di benvenuto» (già risolto). */
  studentWelcomeWhatsappTemplate: string;
  saveStudentWelcomeWhatsappTemplate: (next: string | null) => Promise<boolean>;
  instructorReminderMinutes: string;
  instructorReminderEnabled: boolean;
  slotFillChannels: ChannelValue[];
  studentReminderChannels: ChannelValue[];
  instructorReminderChannels: ChannelValue[];
  /** WhatsApp è collegato davvero? Se no, la riga non è accendibile (REG-500). */
  whatsappAvailable?: boolean;
  /** Il numero da cui partono i WhatsApp, mostrato sotto la riga. */
  whatsappSender?: string | null;
  /** Quanti allievi raggiunge ogni canale; omessi, le righe mostrano il testo generico. */
  channelReach?: Partial<Record<ChannelValue, ChannelReach>>;
  updateReminderSettings: (patch: {
    studentReminderMinutes?: number;
    instructorReminderMinutes?: number;
    instructorReminderEnabled?: boolean;
    studentReminderMorningEnabled?: boolean;
    studentReminderMorningTime?: string;
    studentReminderDayBeforeEnabled?: boolean;
    studentReminderDayBeforeTime?: string;
    studentCreationNoticeEnabled?: boolean;
    slotFillChannels?: ChannelValue[];
    studentReminderChannels?: ChannelValue[];
    instructorReminderChannels?: ChannelValue[];
  }) => Promise<void>;
  // Notifica slot vuoti (card del proto nel pane reminders; spostata da
  // "Prenotazioni e allievi > App allievi" il 2026-07-12)
  emptySlotNotificationEnabled: boolean;
  setEmptySlotNotificationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  emptySlotNotificationTarget: "all" | "availability_matching";
  setEmptySlotNotificationTarget: (v: "all" | "availability_matching") => void;
  emptySlotNotificationTimes: string[];
  setEmptySlotNotificationTimes: React.Dispatch<React.SetStateAction<string[]>>;
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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0f0f0]">
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

/** «Posti liberi per domani» (ex «Notifica slot disponibili domani»): riga con
 *  interruttore; acceso, sotto compaiono destinatari, orari e l'invio subito.
 *  REG-767: stesso linguaggio delle altre righe del pane, niente card. */
function EmptySlotNotificationSection({
  enabled,
  setEnabled,
  target,
  setTarget,
  times,
  setTimes,
}: {
  enabled: boolean;
  setEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  target: "all" | "availability_matching";
  setTarget: (v: "all" | "availability_matching") => void;
  times: string[];
  setTimes: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const toast = useFeedbackToast();
  const [sending, setSending] = React.useState(false);
  // Overlay di esito del proto ("Notifica inviata!")
  const [sentOverlay, setSentOverlay] = React.useState(false);

  return (
    <SettingsRow
      testId="empty-slot-row"
      title="Posti liberi per domani"
      description="La sera prima, una notifica nell'app se ci sono guide libere."
      control={
        <InlineToggle checked={enabled} onChange={() => setEnabled((prev) => !prev)} size="lg" />
      }
    >
      <SuccessOverlay
        open={sentOverlay}
        onClose={() => setSentOverlay(false)}
        image="/images/settings/notifica-inviata.png"
        title="Notifica inviata!"
        subtitle="Gli allievi idonei riceveranno la notifica a breve."
        blend
      />
      <SettingsReveal open={enabled}>
        <SettingsSubRow label="A chi">
          <Select
            value={target}
            onValueChange={(value) => setTarget(value as "all" | "availability_matching")}
          >
            <SelectTrigger className={cn(SETTINGS_SELECT_TRIGGER, "sm:w-[280px]")}>
              <SelectValue placeholder="Destinatari" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="availability_matching">Chi è disponibile a quell&apos;ora</SelectItem>
              <SelectItem value="all">Tutti gli allievi</SelectItem>
            </SelectContent>
          </Select>
        </SettingsSubRow>

        <SettingsSubRow label="Orari">
          {/* Un TimePicker per ogni invio della giornata: la "x" toglie
              l'orario (min 1), il "+" ne aggiunge un altro. Il backend
              accetta solo mezz'ore tra 08:00 e 22:00. */}
          <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
            {times.map((time) => (
              <div key={time} className="group relative">
                <TimePickerInput
                  value={time}
                  minTime="08:00"
                  maxTime="22:00"
                  minuteStep={30}
                  onChange={(next) => {
                    setTimes((prev) => {
                      if (prev.includes(next)) {
                        toast.error({
                          description: `Le ${next} sono già tra gli orari di invio.`,
                        });
                        return prev;
                      }
                      return prev.map((t) => (t === time ? next : t)).sort();
                    });
                  }}
                />
                {times.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Rimuovi orario ${time}`}
                    onClick={() => setTimes((prev) => prev.filter((t) => t !== time))}
                    className="absolute -right-1.5 -top-1.5 flex size-[18px] cursor-pointer items-center justify-center rounded-full bg-[#222222] text-white opacity-0 shadow-sm transition-opacity duration-200 hover:bg-black focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <X className="size-3" strokeWidth={2.4} />
                  </button>
                )}
              </div>
            ))}
            {times.length < NOTIFICATION_TIME_OPTIONS.length && (
              <button
                type="button"
                aria-label="Aggiungi orario di invio"
                onClick={() =>
                  setTimes((prev) => {
                    // Primo slot libero dopo l'ultimo orario scelto (poi da capo)
                    const last = prev[prev.length - 1];
                    const free = [
                      ...NOTIFICATION_TIME_OPTIONS.filter((t) => t > last),
                      ...NOTIFICATION_TIME_OPTIONS,
                    ].find((t) => !prev.includes(t));
                    return free ? [...prev, free].sort() : prev;
                  })
                }
                className="flex size-[38px] cursor-pointer items-center justify-center rounded-full border-[1.5px] border-dashed border-[#c9c9c9] text-[#222222] transition-colors duration-200 hover:border-[#222222] hover:bg-[#fafafa]"
              >
                <Plus className="size-4" strokeWidth={2.2} />
              </button>
            )}
          </div>
        </SettingsSubRow>

        <SettingsSubRow label="Per domani, adesso">
          <button
            type="button"
            disabled={sending}
            onClick={async () => {
              setSending(true);
              try {
                const res = await triggerEmptySlotNotification();
                if (res.success && res.data) {
                  setSentOverlay(true);
                } else {
                  toast.error({
                    description: res.message ?? "Impossibile inviare la notifica.",
                  });
                }
              } catch {
                toast.error({ description: "Impossibile inviare la notifica." });
              } finally {
                setSending(false);
              }
            }}
            className="inline-flex h-10 min-w-[136px] shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-[#dddddd] px-5 text-sm font-semibold text-[#222222] transition-colors duration-200 hover:border-[#222222] disabled:pointer-events-none disabled:opacity-60"
          >
            {sending ? <LoadingDots className="min-h-[1.5em] scale-[0.8]" /> : "Invia ora"}
          </button>
        </SettingsSubRow>
      </SettingsReveal>
    </SettingsRow>
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
  studentCreationNoticeEnabled,
  studentWelcomeWhatsappTemplate,
  saveStudentWelcomeWhatsappTemplate,
  instructorReminderMinutes,
  instructorReminderEnabled,
  studentReminderChannels,
  whatsappAvailable = false,
  whatsappSender = null,
  channelReach,
  updateReminderSettings,
  emptySlotNotificationEnabled,
  setEmptySlotNotificationEnabled,
  emptySlotNotificationTarget,
  setEmptySlotNotificationTarget,
  emptySlotNotificationTimes,
  setEmptySlotNotificationTimes,
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
  consortium = false,
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
          {/* REG-767: pane rifatto sull'impianto di «Prenotazioni e allievi» —
              sezioni con un titolo, righe titolo + riga grigia + controllo,
              divisori sottili. Il comportamento dei promemoria è quello di prima. */}
          <div className="space-y-10" data-testid="reminders-pane">
            <SettingsSection title="Allievi">
              <SettingsRow
                title="Promemoria prima della guida"
                stackOnMobile
                control={
                  <Select
                    value={studentReminderMinutes}
                    onValueChange={(value) =>
                      updateReminderSettings({ studentReminderMinutes: Number(value) })
                    }
                  >
                    <SelectTrigger className={SETTINGS_SELECT_TRIGGER} aria-label="Promemoria allievo">
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
                }
              />
              <SettingsRow
                title="La mattina della guida"
                description="Un promemoria in più, all'orario che scegli."
                control={
                  <InlineToggle
                    checked={studentReminderMorningEnabled}
                    onChange={() =>
                      updateReminderSettings({
                        studentReminderMorningEnabled: !studentReminderMorningEnabled,
                      })
                    }
                    size="lg"
                  />
                }
              >
                <SettingsReveal open={studentReminderMorningEnabled}>
                  <SettingsSubRow label="Orario">
                    <TimePickerInput
                      value={studentReminderMorningTime}
                      onChange={(value) =>
                        updateReminderSettings({ studentReminderMorningTime: value })
                      }
                      minTime="05:00"
                      maxTime="12:00"
                    />
                  </SettingsSubRow>
                </SettingsReveal>
              </SettingsRow>
              <SettingsRow
                title="Il giorno prima"
                description="Un promemoria la sera prima, all'orario che scegli."
                control={
                  <InlineToggle
                    checked={studentReminderDayBeforeEnabled}
                    onChange={() =>
                      updateReminderSettings({
                        studentReminderDayBeforeEnabled: !studentReminderDayBeforeEnabled,
                      })
                    }
                    size="lg"
                  />
                }
              >
                <SettingsReveal open={studentReminderDayBeforeEnabled}>
                  <SettingsSubRow label="Orario">
                    <TimePickerInput
                      value={studentReminderDayBeforeTime}
                      onChange={(value) =>
                        updateReminderSettings({ studentReminderDayBeforeTime: value })
                      }
                    />
                  </SettingsSubRow>
                </SettingsReveal>
              </SettingsRow>
              {/* REG-758: avviso alla creazione, raggruppato (vedi creation-notice.ts). */}
              <SettingsRow
                title="Guida fissata"
                description="Avviso quando la segreteria, un istruttore o la voce fissa una guida. Più guide di fila, un messaggio solo."
                control={
                  <InlineToggle
                    checked={studentCreationNoticeEnabled}
                    onChange={() =>
                      updateReminderSettings({
                        studentCreationNoticeEnabled: !studentCreationNoticeEnabled,
                      })
                    }
                    size="lg"
                  />
                }
              />
              <EmptySlotNotificationSection
                enabled={emptySlotNotificationEnabled}
                setEnabled={setEmptySlotNotificationEnabled}
                target={emptySlotNotificationTarget}
                setTarget={setEmptySlotNotificationTarget}
                times={emptySlotNotificationTimes}
                setTimes={setEmptySlotNotificationTimes}
              />
            </SettingsSection>

            <SettingsSection title="Istruttori">
              <SettingsRow
                title="Promemoria prima della guida"
                stackOnMobile
                control={
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
                    <SelectTrigger className={SETTINGS_SELECT_TRIGGER} aria-label="Promemoria istruttore">
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
                }
              />
            </SettingsSection>

            {/* La cascata (REG-500): una scelta sola scrive sia i canali degli
                allievi sia quelli degli istruttori. */}
            <ChannelCascade
              value={studentReminderChannels}
              onChange={(next) =>
                updateReminderSettings({
                  studentReminderChannels: next,
                  instructorReminderChannels: next,
                })
              }
              whatsapp={
                whatsappAvailable
                  ? { state: "ready", sender: whatsappSender }
                  : { state: "not_configured" }
              }
              reach={channelReach}
            />

            <RecentDeliveries />

            {/* REG-767: «Messaggio di benvenuto» (scheda allievo e conferma di creazione). */}
            <WhatsAppWelcomeSection
              value={studentWelcomeWhatsappTemplate}
              consortium={consortium}
              onSave={saveStudentWelcomeWhatsappTemplate}
            />

            <p className="text-[13.5px] font-medium text-[#929292]">
              Per scrivere a tutti gli allievi usa «Invia comunicato», dal menu.
            </p>
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
                        isRequired ? "border-[#b0b0b0] bg-[#f0f0f0]" : "border-[#e8e8e8] bg-white",
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
                            isRequired ? "bg-[#e6e6e6]" : "border-[1.5px] border-[#dcdcdc]",
                          )}
                        >
                          {isRequired && (
                            <Check className="size-3 text-[#111111]" strokeWidth={2.4} />
                          )}
                        </span>
                        <span
                          className={cn(
                            "text-[13.5px] font-semibold",
                            isRequired ? "text-[#111111]" : "text-[#444444]",
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
          // Sottotitolo dentro LocationsSection: nell'onboarding non deve vedersi
          description=""
          expanded={expandedSection === "locations"}
          onToggle={() => toggleSection("locations")}
          standalone={standalone}
        >
          <LocationsSection consortium={consortium} />
        </AccordionSection>
        )}
      </div>

    </>
  );
}

export default SettingsTab;
