"use client";

import React from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CalendarDays, Car, CircleUserRound, ClipboardList, CreditCard, PhoneCall, Plus, ChevronDown, ChevronLeft, ChevronRight, Clock, MapPin, Users, UserRoundCog, X, type LucideIcon } from "lucide-react";

import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { FieldGroup } from "@/components/ui/field-group";
import {
  LICENSE_CATEGORIES,
  LICENSE_CATEGORY_LABELS,
  TRANSMISSIONS,
  TRANSMISSION_LABELS,
  type LicenseCategory,
} from "@/lib/autoscuole/license";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { TimePickerInput } from "@/components/ui/time-picker";
import { DatePickerInput } from "@/components/ui/date-picker";

// Import statici: i pane dell'overlay restano montati (keep-alive) e non
// devono scaricare chunk al cambio sezione — il lazy-loading qui causava lo
// "scatto" bianco a ogni switch.
import SettingsTab, { type SettingsSectionKey } from "./tabs/SettingsTab";
import InstructorsTab from "./tabs/InstructorsTab";
import BookingsTab from "./tabs/BookingsTab";
import VehiclesTab from "./tabs/VehiclesTab";
import PaymentsSettingsPane from "./PaymentsSettingsPane";
import { VoiceSettingsPane } from "./VoiceSettingsPane";
import { BusinessInfoPane } from "./tabs/BusinessInfoPane";
import {
  getAutoscuolaInstructors,
  getAutoscuolaVehicles,
  createAutoscuolaVehicle,
  updateAutoscuolaVehicle,
  getAutoscuolaVehicleWeeklyAvailabilities,
  setAutoscuolaVehicleWeeklyAvailability,
  deleteAutoscuolaVehicleWeeklyAvailability,
  getAutoscuolaInstructorWeeklyAvailabilities,
  setAutoscuolaInstructorWeeklyAvailability,
  deleteAutoscuolaInstructorWeeklyAvailability,
  updateAutoscuolaInstructor,
  getAutoscuolaStudentsWithProgress,
} from "@/lib/actions/autoscuole.actions";
import { AdminUsersCreateDialog } from "@/components/pages/AdminUsers/AdminUsersCreateDialog";
import {
  getAvailabilitySlots,
  setWeeklyAvailabilityOverride,
  setRecurringAvailabilityOverride,
  deleteWeeklyAvailabilityOverride,
  getWeeklyAvailabilityOverrides,
} from "@/lib/actions/autoscuole-availability.actions";
import { InstructorPublicationEditor } from "@/components/pages/Autoscuole/InstructorPublicationEditor";

/** Availability mode from the instructor settings JSON ("default" unless explicitly "publication"). */
const readAvailabilityMode = (settings: unknown): "default" | "publication" =>
  settings && typeof settings === "object" && (settings as Record<string, unknown>).availabilityMode === "publication"
    ? "publication"
    : "default";

/** Compute Monday (ISO week start) for a date */
const getWeekStart = (date: Date): Date => {
  const dow = date.getUTCDay(); // 0=Sun..6=Sat
  const daysBack = dow === 0 ? 6 : dow - 1;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysBack));
};
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getAutoscuolaSettings,
  updateAutoscuolaSettings,
  triggerEmptySlotNotification,
} from "@/lib/actions/autoscuole-settings.actions";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/fade-in";

/**
 * Skeleton locale del contenuto pane dell'overlay Impostazioni: righe flat
 * "titolo + descrizione + toggle tondo" separate da hairline, fedeli alle
 * liste reali delle pane (header/sidebar/titolo restano visibili).
 */
function SettingsPaneSkeleton() {
  return (
    <div className="max-w-[640px]">
      <Skeleton className="mb-8 h-4 w-[420px] max-w-full" />
      <div className="flex flex-col">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "flex items-start justify-between gap-6 py-5",
              i < 4 && "border-b border-[#ebebeb]",
            )}
          >
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-44 max-w-full" />
              <Skeleton className="mt-2.5 h-3.5 w-72 max-w-full" />
            </div>
            <Skeleton className="mt-0.5 h-5 w-9 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

type ResourceOption = { id: string; name: string };
type InstructorDetail = { id: string; name: string; status: string; autonomousMode?: boolean; settings?: unknown; color?: string | null; inviteCode?: string | null; _count?: { assignedStudents: number } };
type VehicleDetail = {
  id: string;
  name: string;
  plate: string | null;
  status: string;
  assignedInstructorId: string | null;
  poolInstructorIds: string[];
  followsInstructorAvailability: boolean;
  licenseCategory: string;
  transmission: string;
};

type VehicleUsageMode = "open" | "pool" | "exclusive";

const vehicleUsageMode = (vehicle: {
  assignedInstructorId: string | null;
  poolInstructorIds: string[];
}): VehicleUsageMode =>
  vehicle.assignedInstructorId
    ? "exclusive"
    : vehicle.poolInstructorIds.length
      ? "pool"
      : "open";
type VehicleWeeklyAvailability = { daysOfWeek: number[]; startMinutes: number; endMinutes: number; ranges?: Array<{ startMinutes: number; endMinutes: number }>; rangesByDay?: Record<string, Array<{ startMinutes: number; endMinutes: number }>> };
type AvailabilitySlot = {
  id: string;
  ownerId: string;
  startsAt: string | Date;
  endsAt: string | Date;
  status: string;
};

type AvailabilityRange = {
  start: Date;
  end: Date;
};

const formatDateLocal = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const REMINDER_OPTIONS = [120, 60, 30, 20, 15] as const;
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
type ChannelValue = (typeof CHANNEL_OPTIONS)[number]["value"];
type AppBookingActorsValue = (typeof APP_BOOKING_ACTOR_OPTIONS)[number]["value"];
type InstructorBookingModeValue = (typeof INSTRUCTOR_BOOKING_MODE_OPTIONS)[number]["value"];
const LESSON_TYPE_OPTIONS = [
  { value: "manovre", label: "Manovre" },
  { value: "urbano", label: "Urbano" },
  { value: "extraurbano", label: "Extraurbano" },
  { value: "notturna", label: "Notturna" },
  { value: "autostrada", label: "Autostrada" },
  { value: "parcheggio", label: "Parcheggio" },
  { value: "altro", label: "Altro" },
] as const;
type LessonTypeValue = (typeof LESSON_TYPE_OPTIONS)[number]["value"];


type LessonConstraintState = {
  enabled: boolean;
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
};

type LessonConstraintMap = Record<LessonTypeValue, LessonConstraintState>;

const DEFAULT_LESSON_CONSTRAINT: LessonConstraintState = {
  enabled: false,
  daysOfWeek: [1, 2, 3, 4, 5],
  startMinutes: 9 * 60,
  endMinutes: 18 * 60,
};

const createDefaultLessonConstraintMap = (): LessonConstraintMap =>
  LESSON_TYPE_OPTIONS.reduce((accumulator, option) => {
    accumulator[option.value] = { ...DEFAULT_LESSON_CONSTRAINT };
    return accumulator;
  }, {} as LessonConstraintMap);

const normalizeDays = (days: number[]) =>
  Array.from(new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort(
    (left, right) => left - right,
  );

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Gio" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
] as const;


type WeekOption = { label: string; weekStart: string }; // weekStart = YYYY-MM-DD of Monday

const buildWeekOptions = (): WeekOption[] => {
  const options: WeekOption[] = [];
  const today = new Date();
  // Get this week's Monday
  const dayOfWeek = today.getDay(); // 0=Sun..6=Sat
  const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysBack);
  monday.setHours(0, 0, 0, 0);

  for (let i = 0; i < 12; i++) {
    const weekMonday = new Date(monday);
    weekMonday.setDate(monday.getDate() + i * 7);
    const weekSunday = new Date(weekMonday);
    weekSunday.setDate(weekMonday.getDate() + 6);
    const label = `${weekMonday.getDate()}/${weekMonday.getMonth() + 1} – ${weekSunday.getDate()}/${weekSunday.getMonth() + 1}`;
    const weekStart = `${weekMonday.getFullYear()}-${pad(weekMonday.getMonth() + 1)}-${pad(weekMonday.getDate())}`;
    options.push({ label, weekStart });
  }
  return options;
};

type DayScheduleEntry = {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  startMinutes2?: number | null;
  endMinutes2?: number | null;
};

type OverrideInfo = {
  weekStart: string;
  schedule: DayScheduleEntry[];
};

/** Voci della sidebar dell'overlay "Impostazioni dell'account" (pattern proto #section-configurazione) */
type ConfigPane =
  | "business"
  | "locations"
  | "payments"
  | "bookings"
  | "policy"
  | "reminders"
  | "instructors"
  | "vehicles"
  | "voice";

// Dipendenze dati per pane: chi legge i settings autoscuola, chi le risorse
// (istruttori/veicoli/slot). Business e Fatturazione si caricano da sole.
const PANES_NEEDING_SETTINGS: ConfigPane[] = ["bookings", "policy", "reminders", "locations", "vehicles"];
const PANES_NEEDING_RESOURCES: ConfigPane[] = ["instructors", "vehicles"];

const CONFIG_PANE_GROUPS: Array<Array<{ key: ConfigPane; label: string; icon: LucideIcon }>> = [
  [
    { key: "business", label: "Informazioni aziendali", icon: CircleUserRound },
    { key: "locations", label: "Sede e luoghi", icon: MapPin },
    { key: "payments", label: "Fatturazione e pagamenti", icon: CreditCard },
  ],
  [
    { key: "bookings", label: "Prenotazioni e allievi", icon: CalendarDays },
    { key: "policy", label: "Policy tipi guida", icon: ClipboardList },
    { key: "reminders", label: "Promemoria e notifiche", icon: Bell },
  ],
  [
    { key: "instructors", label: "Istruttori", icon: Users },
    { key: "vehicles", label: "Veicoli", icon: Car },
  ],
  [{ key: "voice", label: "Segretaria", icon: PhoneCall }],
];

/**
 * Keep-alive dei pannelli dell'overlay: monta il contenuto al primo accesso
 * (o subito, se `eager`) e poi lo nasconde via CSS invece di smontarlo. Così
 * le fetch interne di ogni pannello girano UNA volta e il cambio sezione è
 * istantaneo, senza flash bianchi né loader ripetuti.
 */
function KeepAlivePane({
  active,
  eager,
  children,
}: {
  active: boolean;
  eager?: boolean;
  children: React.ReactNode;
}) {
  const mountedRef = React.useRef(false);
  if (active || eager) mountedRef.current = true;
  if (!mountedRef.current) return null;
  return <div className={active ? undefined : "hidden"}>{children}</div>;
}

const CONFIG_PANE_TITLES: Record<ConfigPane, string> = {
  business: "Informazioni aziendali",
  locations: "Sede e luoghi",
  payments: "Fatturazione e pagamenti",
  bookings: "Prenotazioni e allievi",
  policy: "Policy tipi guida",
  reminders: "Promemoria e notifiche",
  instructors: "Istruttori",
  vehicles: "Veicoli",
  voice: "Segretaria AI",
};

export function AutoscuoleResourcesPage({
  tabs,
}: {
  tabs?: React.ReactNode;
} = {}) {
  const toast = useFeedbackToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [configTab, setConfigTab] = React.useState<ConfigPane>(() => {
    // "students" è il vecchio pane Gestione allievi, ora fuso in "bookings"
    // (link legacy in giro per l'app e nelle notifiche).
    const raw = searchParams?.get("pane");
    const pane = raw === "students" ? "bookings" : raw;
    return pane && CONFIG_PANE_GROUPS.flat().some((p) => p.key === pane)
      ? (pane as ConfigPane)
      : "bookings";
  });
  const [expandedSection, setExpandedSection] = React.useState<string | null>("bookings");
  const [date] = React.useState(() => formatDateLocal(new Date()));
  const [loading, setLoading] = React.useState(false);
  // true dopo il primo caricamento: da lì in poi niente più skeleton globale
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(false);
  // true quando getAutoscuolaSettings ha risposto: le pane impostazioni non
  // devono uscire dallo skeleton prima, altrimenti mostrano i default per un
  // attimo e poi "scattano" sui valori reali
  const [settingsLoaded, setSettingsLoaded] = React.useState(false);
  // dopo il primo paint, monta anche i pannelli non ancora visitati (prefetch)
  const [mountAllPanes, setMountAllPanes] = React.useState(false);
  const contentScrollRef = React.useRef<HTMLDivElement>(null);

  const goToPane = React.useCallback((pane: ConfigPane) => {
    setConfigTab(pane);
    contentScrollRef.current?.scrollTo({ top: 0 });
  }, []);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [availabilityWeeks, setAvailabilityWeeks] = React.useState("4");
  const [studentReminderMinutes, setStudentReminderMinutes] = React.useState("60");
  const [studentReminderMorningEnabled, setStudentReminderMorningEnabled] = React.useState(false);
  const [studentReminderMorningTime, setStudentReminderMorningTime] = React.useState("08:00");
  const [studentReminderDayBeforeEnabled, setStudentReminderDayBeforeEnabled] = React.useState(false);
  const [studentReminderDayBeforeTime, setStudentReminderDayBeforeTime] = React.useState("19:00");
  const [instructorReminderMinutes, setInstructorReminderMinutes] = React.useState("60");
  const [instructorReminderEnabled, setInstructorReminderEnabled] = React.useState(true);
  const [slotFillChannels, setSlotFillChannels] = React.useState<ChannelValue[]>([
    "push",
    "whatsapp",
    "email",
  ]);
  const [studentReminderChannels, setStudentReminderChannels] = React.useState<ChannelValue[]>([
    "push",
    "whatsapp",
    "email",
  ]);
  const [instructorReminderChannels, setInstructorReminderChannels] = React.useState<
    ChannelValue[]
  >(["push", "whatsapp", "email"]);
  const [lessonPolicyEnabled, setLessonPolicyEnabled] = React.useState(false);
  const [lessonRequiredTypesEnabled, setLessonRequiredTypesEnabled] = React.useState(false);
  const [lessonRequiredTypes, setLessonRequiredTypes] = React.useState<LessonTypeValue[]>([]);
  const [lessonConstraints, setLessonConstraints] = React.useState<LessonConstraintMap>(
    createDefaultLessonConstraintMap(),
  );
  const [bookingSlotDurations, setBookingSlotDurations] = React.useState<number[]>([30, 60]);
  const [roundedHoursOnly, setRoundedHoursOnly] = React.useState(false);
  const [nationalHolidaysEnabled, setNationalHolidaysEnabled] = React.useState(false);
  const [nationalHolidaysDisabled, setNationalHolidaysDisabled] = React.useState<string[]>([]);
  const [swapEnabled, setSwapEnabled] = React.useState(false);
  const [swapNotifyMode, setSwapNotifyMode] = React.useState<"all" | "available_only">("available_only");
  const [studentCancellationEnabled, setStudentCancellationEnabled] = React.useState(true);
  const [bookingCutoffEnabled, setBookingCutoffEnabled] = React.useState(false);
  const [bookingCutoffTime, setBookingCutoffTime] = React.useState<string>("18:00");
  const [weeklyBookingLimitEnabled, setWeeklyBookingLimitEnabled] = React.useState(false);
  const [weeklyBookingLimit, setWeeklyBookingLimit] = React.useState(3);
  const [examPriorityEnabled, setExamPriorityEnabled] = React.useState(false);
  const [examPriorityDaysBeforeExam, setExamPriorityDaysBeforeExam] = React.useState(14);
  const [examPriorityBlockNonExam, setExamPriorityBlockNonExam] = React.useState(false);
  const [examPriorityPausedUntil, setExamPriorityPausedUntil] = React.useState<string | null>(null);
  const [restrictedTimeRangeEnabled, setRestrictedTimeRangeEnabled] = React.useState(false);
  const [restrictedTimeRangeStart, setRestrictedTimeRangeStart] = React.useState("08:00");
  const [restrictedTimeRangeEnd, setRestrictedTimeRangeEnd] = React.useState("13:00");
  const [emptySlotNotificationEnabled, setEmptySlotNotificationEnabled] = React.useState(false);
  const [emptySlotNotificationTarget, setEmptySlotNotificationTarget] = React.useState<"all" | "availability_matching">("availability_matching");
  const [emptySlotNotificationTimes, setEmptySlotNotificationTimes] = React.useState<string[]>(["18:00"]);
  const [triggeringNotification, setTriggeringNotification] = React.useState(false);
  const [instructorPreferenceEnabled, setInstructorPreferenceEnabled] = React.useState(false);
  const [studentNotesEnabled, setStudentNotesEnabled] = React.useState(false);
  const [autoCheckinEnabled, setAutoCheckinEnabled] = React.useState(false);
  const [vehiclesEnabled, setVehiclesEnabled] = React.useState(true);
  const [defaultLicenseCategory, setDefaultLicenseCategory] = React.useState<string>("B");
  const [defaultTransmission, setDefaultTransmission] = React.useState<string>("manual");
  const [followCarMotoEnabled, setFollowCarMotoEnabled] = React.useState(false);
  const [groupLessonsEnabled, setGroupLessonsEnabled] = React.useState(false);
  const [bookingMinStartDate, setBookingMinStartDate] = React.useState<string>("");

  // ── Instructor cluster panel state
  const [clusterInstructor, setClusterInstructor] = React.useState<InstructorDetail | null>(null);
  const [clusterAutonomous, setClusterAutonomous] = React.useState(false);
  const [clusterDurations, setClusterDurations] = React.useState<number[]>([30, 60]);
  const [clusterRoundedHours, setClusterRoundedHours] = React.useState(false);
  const [clusterStudentIds, setClusterStudentIds] = React.useState<string[]>([]);
  const [clusterSaving, setClusterSaving] = React.useState(false);
  const [clusterStudentSearch, setClusterStudentSearch] = React.useState("");
  // Task 3: new cluster booking settings
  const [clusterAppBookingActors, setClusterAppBookingActors] = React.useState<"students" | "instructors" | "both" | undefined>(undefined);
  const [clusterInstructorBookingMode, setClusterInstructorBookingMode] = React.useState<"manual_full" | "manual_engine" | undefined>(undefined);
  const [clusterSwapEnabled, setClusterSwapEnabled] = React.useState<boolean | undefined>(undefined);
  const [clusterStudentCancellationEnabled, setClusterStudentCancellationEnabled] = React.useState<boolean | undefined>(undefined);
  const [clusterSwapNotifyMode, setClusterSwapNotifyMode] = React.useState<"all" | "available_only" | undefined>(undefined);
  const [clusterBookingCutoffEnabled, setClusterBookingCutoffEnabled] = React.useState<boolean | undefined>(undefined);
  const [clusterBookingCutoffTime, setClusterBookingCutoffTime] = React.useState<string | undefined>(undefined);
  const [clusterWeeklyLimitEnabled, setClusterWeeklyLimitEnabled] = React.useState<boolean | undefined>(undefined);
  const [clusterWeeklyLimit, setClusterWeeklyLimit] = React.useState<number | undefined>(undefined);
  const [clusterEmptySlotEnabled, setClusterEmptySlotEnabled] = React.useState<boolean | undefined>(undefined);
  const [clusterEmptySlotTarget, setClusterEmptySlotTarget] = React.useState<"all" | "availability_matching" | undefined>(undefined);
  const [clusterEmptySlotTimes, setClusterEmptySlotTimes] = React.useState<string[] | undefined>(undefined);
  const [clusterRestrictedTimeEnabled, setClusterRestrictedTimeEnabled] = React.useState<boolean | undefined>(undefined);
  const [clusterRestrictedTimeStart, setClusterRestrictedTimeStart] = React.useState<string | undefined>(undefined);
  const [clusterRestrictedTimeEnd, setClusterRestrictedTimeEnd] = React.useState<string | undefined>(undefined);
  const [clusterWeeklyAbsenceEnabled, setClusterWeeklyAbsenceEnabled] = React.useState<boolean | undefined>(undefined);
  const [clusterWorkingHoursStart, setClusterWorkingHoursStart] = React.useState<string | undefined>(undefined);
  const [clusterWorkingHoursEnd, setClusterWorkingHoursEnd] = React.useState<string | undefined>(undefined);
  const [clusterAvailabilityMode, setClusterAvailabilityMode] = React.useState<"default" | "publication">("default");
  const [allStudents, setAllStudents] = React.useState<Array<{ id: string; firstName: string; lastName: string; assignedInstructorId: string | null; licenseCategory: string | null; transmission: string | null }>>([]);
  const [appBookingActors, setAppBookingActors] = React.useState<AppBookingActorsValue>("students");
  const [instructorBookingMode, setInstructorBookingMode] = React.useState<InstructorBookingModeValue>("manual_engine");
  const [instructors, setInstructors] = React.useState<InstructorDetail[]>([]);
  // Sick leave state
  const [sickLeaveInstructor, setSickLeaveInstructor] = React.useState<InstructorDetail | null>(null);
  const [sickLeaveStartDate, setSickLeaveStartDate] = React.useState("");
  const [sickLeaveEndDate, setSickLeaveEndDate] = React.useState("");
  const [sickLeaveHalfDay, setSickLeaveHalfDay] = React.useState(false);
  const [sickLeaveStartTime, setSickLeaveStartTime] = React.useState("14:00");
  const [sickLeaveSaving, setSickLeaveSaving] = React.useState(false);
  const [instructorWeeklyAvailability, setInstructorWeeklyAvailability] = React.useState<
    Record<string, VehicleWeeklyAvailability>
  >({});
  const [vehicles, setVehicles] = React.useState<VehicleDetail[]>([]);
  const [vehicleWeeklyAvailability, setVehicleWeeklyAvailability] = React.useState<
    Record<string, VehicleWeeklyAvailability>
  >({});

  // ── Shared availability dialog state
  const [availDialogTab, setAvailDialogTab] = React.useState<"default" | "calendar">("default");
  // Mode of the instructor currently open in the availability dialog
  // (publication → week-by-week editor, default → Predefinito/Calendario tabs).
  const [availInstructorMode, setAvailInstructorMode] = React.useState<"default" | "publication">("default");
  const [availModeSwitching, setAvailModeSwitching] = React.useState(false);
  const [calendarMonth, setCalendarMonth] = React.useState(() => new Date());
  const [calendarSelectedDate, setCalendarSelectedDate] = React.useState<string | null>(null);
  const [calendarDayRanges, setCalendarDayRanges] = React.useState<Array<{ startMinutes: number; endMinutes: number }>>([{ startMinutes: 9 * 60, endMinutes: 18 * 60 }]);
  const [calendarDayEnabled, setCalendarDayEnabled] = React.useState(true);
  const [recurringOverride, setRecurringOverride] = React.useState(false);

  // ── Instructor availability dialog
  const [availInstructor, setAvailInstructor] = React.useState<InstructorDetail | null>(null);
  const [instrDays, setInstrDays] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [instrStartMinutes, setInstrStartMinutes] = React.useState(9 * 60);
  const [instrEndMinutes, setInstrEndMinutes] = React.useState(18 * 60);
  const [instrDefaultRanges, setInstrDefaultRanges] = React.useState<Array<{ startMinutes: number; endMinutes: number }>>([{ startMinutes: 9 * 60, endMinutes: 18 * 60 }]);
  const [savingInstrAvailability, setSavingInstrAvailability] = React.useState(false);
  // Week override state for instructor dialog
  const [instrSelectedWeek, setInstrSelectedWeek] = React.useState<string | null>(null); // null = "Predefinito"
  const [instrOverrides, setInstrOverrides] = React.useState<OverrideInfo[]>([]);
  const weekOptions = React.useMemo(buildWeekOptions, []);
  // Per-day schedule for override weeks: map dayOfWeek → { startMinutes, endMinutes }
  const [instrDaySchedule, setInstrDaySchedule] = React.useState<DayScheduleEntry[]>([]);
  const [instructorAvailability, setInstructorAvailability] = React.useState<
    Record<string, AvailabilityRange[]>
  >({});
  const [vehicleAvailability, setVehicleAvailability] = React.useState<
    Record<string, AvailabilityRange[]>
  >({});

  // ── Invite instructor dialog
  const [inviteInstructorOpen, setInviteInstructorOpen] = React.useState(false);

  // ── Create vehicle dialog
  const [createVehicleOpen, setCreateVehicleOpen] = React.useState(false);
  const [newVehicleName, setNewVehicleName] = React.useState("");
  const [newVehiclePlate, setNewVehiclePlate] = React.useState("");
  const [newVehicleCategory, setNewVehicleCategory] = React.useState("B");
  const [newVehicleTransmission, setNewVehicleTransmission] = React.useState("manual");
  const [creatingVehicle, setCreatingVehicle] = React.useState(false);

  // ── Edit vehicle dialog
  const [editVehicle, setEditVehicle] = React.useState<VehicleDetail | null>(null);
  const [editVehicleName, setEditVehicleName] = React.useState("");
  const [editVehiclePlate, setEditVehiclePlate] = React.useState("");
  const [editVehicleInstructorId, setEditVehicleInstructorId] = React.useState<string>("");
  const [editVehicleMode, setEditVehicleMode] = React.useState<VehicleUsageMode>("open");
  const [editVehiclePoolIds, setEditVehiclePoolIds] = React.useState<string[]>([]);
  const [editVehicleFollowsAvailability, setEditVehicleFollowsAvailability] =
    React.useState(true);
  const [editVehicleCategory, setEditVehicleCategory] = React.useState<string>("B");
  const [editVehicleTransmission, setEditVehicleTransmission] = React.useState<string>("manual");
  const [savingEditVehicle, setSavingEditVehicle] = React.useState(false);

  // ── Availability edit dialog
  const [availVehicle, setAvailVehicle] = React.useState<VehicleDetail | null>(null);
  const [availDays, setAvailDays] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [availStartMinutes, setAvailStartMinutes] = React.useState(9 * 60);
  const [availEndMinutes, setAvailEndMinutes] = React.useState(18 * 60);
  const [vehDefaultRanges, setVehDefaultRanges] = React.useState<Array<{ startMinutes: number; endMinutes: number }>>([{ startMinutes: 9 * 60, endMinutes: 18 * 60 }]);
  const [savingAvailability, setSavingAvailability] = React.useState(false);
  // Week override state for vehicle dialog
  const [vehSelectedWeek, setVehSelectedWeek] = React.useState<string | null>(null);
  const [vehOverrides, setVehOverrides] = React.useState<OverrideInfo[]>([]);
  const [vehDaySchedule, setVehDaySchedule] = React.useState<DayScheduleEntry[]>([]);

  const loadResources = React.useCallback(async () => {
    const [instructorRes, vehicleRes, instrWeeklyRes, vehicleWeeklyRes] = await Promise.all([
      getAutoscuolaInstructors(),
      getAutoscuolaVehicles(),
      getAutoscuolaInstructorWeeklyAvailabilities(),
      getAutoscuolaVehicleWeeklyAvailabilities(),
    ]);

    if (instructorRes.success && instructorRes.data) {
      setInstructors(
        instructorRes.data.map((item) => ({
          id: item.id,
          name: item.name,
          status: item.status,
          autonomousMode: item.autonomousMode,
          settings: item.settings,
          color: item.color ?? null,
          _count: item._count,
        })),
      );
    }
    if (instrWeeklyRes.success && instrWeeklyRes.data) {
      setInstructorWeeklyAvailability(instrWeeklyRes.data);
    }
    if (vehicleRes.success && vehicleRes.data) {
      setVehicles(
        vehicleRes.data.map((item) => ({
          id: item.id,
          name: item.name,
          plate: item.plate ?? null,
          status: item.status,
          assignedInstructorId: item.assignedInstructorId ?? null,
          poolInstructorIds: item.poolInstructorIds ?? [],
          followsInstructorAvailability: item.followsInstructorAvailability ?? true,
          licenseCategory: item.licenseCategory ?? "B",
          transmission: item.transmission ?? "manual",
        })),
      );
    }
    if (vehicleWeeklyRes.success && vehicleWeeklyRes.data) {
      setVehicleWeeklyAvailability(vehicleWeeklyRes.data);
    }
  }, []);

  const loadAvailability = React.useCallback(
    async (targetDate: string) => {
      setLoading(true);
      const [instructorSlots, vehicleSlots] = await Promise.all([
        getAvailabilitySlots({ ownerType: "instructor", date: targetDate }),
        getAvailabilitySlots({ ownerType: "vehicle", date: targetDate }),
      ]);

      if (!instructorSlots.success) {
        toast.error({
          description:
            instructorSlots.message ?? "Impossibile caricare le disponibilità.",
        });
      } else {
        const ranges = buildAvailabilityMap(instructorSlots.data ?? []);
        setInstructorAvailability(ranges);
      }

      if (!vehicleSlots.success) {
        toast.error({
          description:
            vehicleSlots.message ?? "Impossibile caricare le disponibilità.",
        });
      } else {
        const ranges = buildAvailabilityMap(vehicleSlots.data ?? []);
        setVehicleAvailability(ranges);
      }

      setLoading(false);
      setHasLoadedOnce(true);
      // Dal frame successivo monta anche i pannelli non visitati, così le loro
      // fetch partono in background e il cambio sezione è istantaneo.
      setTimeout(() => setMountAllPanes(true), 150);
    },
    [toast],
  );

  const loadSettings = React.useCallback(async () => {
    const res = await getAutoscuolaSettings();
    if (!res.success || !res.data) {
      toast.error({
        description: res.message ?? "Impossibile caricare le impostazioni autoscuola.",
      });
      // sblocca comunque lo skeleton: meglio i default con il toast d'errore
      // che uno skeleton infinito
      setSettingsLoaded(true);
      return;
    }
    setAvailabilityWeeks(String(res.data.availabilityWeeks));
    setBookingMinStartDate(res.data.bookingMinStartDate ?? "");
    setStudentReminderMinutes(String(res.data.studentReminderMinutes));
    setStudentReminderMorningEnabled(res.data.studentReminderMorningEnabled ?? false);
    setStudentReminderMorningTime(res.data.studentReminderMorningTime ?? "08:00");
    setStudentReminderDayBeforeEnabled(res.data.studentReminderDayBeforeEnabled ?? false);
    setStudentReminderDayBeforeTime(res.data.studentReminderDayBeforeTime ?? "19:00");
    setInstructorReminderMinutes(String(res.data.instructorReminderMinutes));
    setInstructorReminderEnabled(res.data.instructorReminderEnabled !== false);
    setSlotFillChannels(res.data.slotFillChannels as ChannelValue[]);
    setStudentReminderChannels(res.data.studentReminderChannels as ChannelValue[]);
    setInstructorReminderChannels(res.data.instructorReminderChannels as ChannelValue[]);
    const nextConstraints = createDefaultLessonConstraintMap();
    for (const option of LESSON_TYPE_OPTIONS) {
      const constraint = res.data.lessonTypeConstraints?.[option.value];
      if (!constraint) continue;
      nextConstraints[option.value] = {
        enabled: true,
        daysOfWeek: normalizeDays(constraint.daysOfWeek),
        startMinutes: constraint.startMinutes,
        endMinutes: constraint.endMinutes,
      };
    }
    setLessonPolicyEnabled(Boolean(res.data.lessonPolicyEnabled));
    setLessonRequiredTypesEnabled(Boolean(res.data.lessonRequiredTypesEnabled));
    setLessonRequiredTypes(
      (res.data.lessonRequiredTypes ?? []).filter((value): value is LessonTypeValue =>
        LESSON_TYPE_OPTIONS.some((option) => option.value === value),
      ),
    );
    setLessonConstraints(nextConstraints);
    setBookingSlotDurations((res.data.bookingSlotDurations ?? [30, 60]).slice().sort((a, b) => a - b));
    setRoundedHoursOnly(res.data.roundedHoursOnly ?? false);
    setNationalHolidaysEnabled(res.data.nationalHolidaysEnabled ?? false);
    setNationalHolidaysDisabled(res.data.nationalHolidaysDisabled ?? []);
    setSwapEnabled(res.data.swapEnabled ?? false);
    setSwapNotifyMode(res.data.swapNotifyMode ?? "available_only");
    setStudentCancellationEnabled(res.data.studentCancellationEnabled !== false);
    setBookingCutoffEnabled(res.data.bookingCutoffEnabled ?? false);
    setBookingCutoffTime(res.data.bookingCutoffTime ?? "18:00");
    setWeeklyBookingLimitEnabled(res.data.weeklyBookingLimitEnabled ?? false);
    setWeeklyBookingLimit(res.data.weeklyBookingLimit ?? 3);
    setExamPriorityEnabled(res.data.examPriorityEnabled ?? false);
    setExamPriorityDaysBeforeExam(res.data.examPriorityDaysBeforeExam ?? 14);
    setExamPriorityBlockNonExam(res.data.examPriorityBlockNonExam ?? false);
    setExamPriorityPausedUntil(res.data.examPriorityPausedUntil ?? null);
    setRestrictedTimeRangeEnabled(res.data.restrictedTimeRangeEnabled ?? false);
    setRestrictedTimeRangeStart(res.data.restrictedTimeRangeStart ?? "08:00");
    setRestrictedTimeRangeEnd(res.data.restrictedTimeRangeEnd ?? "13:00");
    setEmptySlotNotificationEnabled(res.data.emptySlotNotificationEnabled ?? false);
    setEmptySlotNotificationTarget(res.data.emptySlotNotificationTarget ?? "availability_matching");
    setEmptySlotNotificationTimes(res.data.emptySlotNotificationTimes ?? ["18:00"]);
    setInstructorPreferenceEnabled(res.data.instructorPreferenceEnabled ?? false);
    setStudentNotesEnabled(res.data.studentNotesEnabled ?? false);
    setAutoCheckinEnabled(res.data.autoCheckinEnabled ?? false);
    setVehiclesEnabled(res.data.vehiclesEnabled !== false);
    setDefaultLicenseCategory(res.data.defaultLicenseCategory ?? "B");
    setDefaultTransmission(res.data.defaultTransmission ?? "manual");
    setFollowCarMotoEnabled(res.data.followCarMotoEnabled === true);
    setGroupLessonsEnabled(res.data.groupLessonsEnabled === true);

    setAppBookingActors(
      APP_BOOKING_ACTOR_OPTIONS.some((option) => option.value === res.data.appBookingActors)
        ? (res.data.appBookingActors as AppBookingActorsValue)
        : "students",
    );
    setInstructorBookingMode(
      INSTRUCTOR_BOOKING_MODE_OPTIONS.some(
        (option) => option.value === res.data.instructorBookingMode,
      )
        ? (res.data.instructorBookingMode as InstructorBookingModeValue)
        : "manual_engine",
    );
    setSettingsLoaded(true);
  }, [toast]);

  // ── Orchestrazione caricamento ──
  // Priorità alla pane aperta: al mount partono solo le fetch dei SUOI dati;
  // il resto parte in background appena la primaria ha risposto. Se l'utente
  // cambia pane prima che il background sia partito, la fetch mancante viene
  // anticipata subito. Le ref memorizzano la promise in-flight (idempotenza).
  const settingsPromiseRef = React.useRef<Promise<void> | null>(null);
  const resourcesPromiseRef = React.useRef<Promise<void> | null>(null);

  const ensureSettings = React.useCallback(() => {
    settingsPromiseRef.current ??= loadSettings();
    return settingsPromiseRef.current;
  }, [loadSettings]);

  const ensureResources = React.useCallback(() => {
    resourcesPromiseRef.current ??= Promise.all([
      loadResources(),
      loadAvailability(date),
    ]).then(() => undefined);
    return resourcesPromiseRef.current;
  }, [loadResources, loadAvailability, date]);

  React.useEffect(() => {
    const primary: Array<Promise<void>> = [];
    if (PANES_NEEDING_SETTINGS.includes(configTab)) primary.push(ensureSettings());
    if (PANES_NEEDING_RESOURCES.includes(configTab)) primary.push(ensureResources());
    Promise.allSettled(primary).then(() => {
      ensureSettings();
      ensureResources();
    });
    // solo al mount: configTab qui è la pane iniziale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (PANES_NEEDING_SETTINGS.includes(configTab)) ensureSettings();
    if (PANES_NEEDING_RESOURCES.includes(configTab)) ensureResources();
  }, [configTab, ensureSettings, ensureResources]);

  const handleSaveSettings = async () => {
    const parsedWeeks = Number(availabilityWeeks);
    const parsedStudentReminder = Number(studentReminderMinutes);
    const parsedInstructorReminder = Number(instructorReminderMinutes);

    if (Number.isNaN(parsedWeeks) || parsedWeeks < 1 || parsedWeeks > 12) {
      toast.error({ description: "Settimane disponibilità non valide (1-12)." });
      return;
    }
    if (!REMINDER_OPTIONS.includes(parsedStudentReminder as (typeof REMINDER_OPTIONS)[number])) {
      toast.error({ description: "Preavviso reminder allievo non valido." });
      return;
    }
    if (
      !REMINDER_OPTIONS.includes(
        parsedInstructorReminder as (typeof REMINDER_OPTIONS)[number],
      )
    ) {
      toast.error({ description: "Preavviso reminder istruttore non valido." });
      return;
    }
    if (!slotFillChannels.length) {
      toast.error({ description: "Seleziona almeno un canale per slot-fill." });
      return;
    }
    if (!studentReminderChannels.length) {
      toast.error({ description: "Seleziona almeno un canale per reminder allievo." });
      return;
    }
    if (!instructorReminderChannels.length) {
      toast.error({ description: "Seleziona almeno un canale per reminder istruttore." });
      return;
    }
    if (!bookingSlotDurations.length) {
      toast.error({ description: "Seleziona almeno una durata prenotabile per l'allievo." });
      return;
    }
    if (
      (appBookingActors === "instructors" || appBookingActors === "both") &&
      !instructorBookingMode
    ) {
      toast.error({ description: "Seleziona la modalità prenotazione istruttore." });
      return;
    }
    if (lessonRequiredTypesEnabled && !lessonRequiredTypes.length) {
      toast.error({ description: "Seleziona almeno un tipo guida obbligatorio." });
      return;
    }

    const lessonTypeConstraints = {} as Record<
      LessonTypeValue,
      { daysOfWeek: number[]; startMinutes: number; endMinutes: number } | null
    >;
    for (const option of LESSON_TYPE_OPTIONS) {
      const state = lessonConstraints[option.value];
      if (!state?.enabled) {
        lessonTypeConstraints[option.value] = null;
        continue;
      }
      const daysOfWeek = normalizeDays(state.daysOfWeek);
      if (!daysOfWeek.length) {
        toast.error({ description: `Seleziona almeno un giorno per ${option.label}.` });
        return;
      }
      if (
        !Number.isInteger(state.startMinutes) ||
        !Number.isInteger(state.endMinutes) ||
        state.startMinutes < 0 ||
        state.startMinutes > 1410 ||
        state.endMinutes < 30 ||
        state.endMinutes > 1440 ||
        state.startMinutes % 30 !== 0 ||
        state.endMinutes % 30 !== 0 ||
        state.endMinutes <= state.startMinutes
      ) {
        toast.error({ description: `Intervallo non valido per ${option.label}.` });
        return;
      }
      lessonTypeConstraints[option.value] = {
        daysOfWeek,
        startMinutes: state.startMinutes,
        endMinutes: state.endMinutes,
      };
    }

    setSavingSettings(true);
    const res = await updateAutoscuolaSettings({
      availabilityWeeks: parsedWeeks,
      bookingMinStartDate: bookingMinStartDate || null,
      studentReminderMinutes:
        parsedStudentReminder as (typeof REMINDER_OPTIONS)[number],
      studentReminderMorningEnabled,
      studentReminderMorningTime,
      studentReminderDayBeforeEnabled,
      studentReminderDayBeforeTime,
      instructorReminderMinutes:
        parsedInstructorReminder as (typeof REMINDER_OPTIONS)[number],
      slotFillChannels,
      studentReminderChannels,
      instructorReminderChannels,
      lessonPolicyEnabled,
      lessonRequiredTypesEnabled,
      lessonRequiredTypes,
      lessonTypeConstraints,
      bookingSlotDurations,
      roundedHoursOnly,
      nationalHolidaysEnabled,
      nationalHolidaysDisabled,
      swapEnabled,
      swapNotifyMode,
      studentCancellationEnabled,
      bookingCutoffEnabled,
      bookingCutoffTime: bookingCutoffTime as "12:00" | "14:00" | "16:00" | "18:00" | "20:00" | "22:00",
      weeklyBookingLimitEnabled,
      weeklyBookingLimit,
      examPriorityEnabled,
      examPriorityDaysBeforeExam,
      examPriorityPausedUntil,
      examPriorityBlockNonExam,
      restrictedTimeRangeEnabled,
      restrictedTimeRangeStart,
      restrictedTimeRangeEnd,
      emptySlotNotificationEnabled,
      emptySlotNotificationTarget,
      emptySlotNotificationTimes: emptySlotNotificationTimes as ("08:00" | "08:30" | "09:00" | "09:30" | "10:00" | "10:30" | "11:00" | "11:30" | "12:00" | "12:30" | "13:00" | "13:30" | "14:00" | "14:30" | "15:00" | "15:30" | "16:00" | "16:30" | "17:00" | "17:30" | "18:00" | "18:30" | "19:00" | "19:30" | "20:00" | "20:30" | "21:00" | "21:30" | "22:00")[],
      instructorPreferenceEnabled,
      studentNotesEnabled,
      autoCheckinEnabled,
      vehiclesEnabled,
      defaultLicenseCategory: defaultLicenseCategory as LicenseCategory,
      defaultTransmission: defaultTransmission as "manual" | "automatic",
      followCarMotoEnabled,
      groupLessonsEnabled,
      appBookingActors,
      instructorBookingMode,
    });
    setSavingSettings(false);

    if (!res.success || !res.data) {
      toast.error({
        description: res.message ?? "Impossibile aggiornare le impostazioni autoscuola.",
      });
      return;
    }

    setAvailabilityWeeks(String(res.data.availabilityWeeks));
    setStudentReminderMinutes(String(res.data.studentReminderMinutes));
    setStudentReminderMorningEnabled(res.data.studentReminderMorningEnabled ?? false);
    setStudentReminderMorningTime(res.data.studentReminderMorningTime ?? "08:00");
    setInstructorReminderMinutes(String(res.data.instructorReminderMinutes));
    setInstructorReminderEnabled(res.data.instructorReminderEnabled !== false);
    setSlotFillChannels(res.data.slotFillChannels as ChannelValue[]);
    setStudentReminderChannels(res.data.studentReminderChannels as ChannelValue[]);
    setInstructorReminderChannels(res.data.instructorReminderChannels as ChannelValue[]);
    const nextConstraints = createDefaultLessonConstraintMap();
    for (const option of LESSON_TYPE_OPTIONS) {
      const constraint = res.data.lessonTypeConstraints?.[option.value];
      if (!constraint) continue;
      nextConstraints[option.value] = {
        enabled: true,
        daysOfWeek: normalizeDays(constraint.daysOfWeek),
        startMinutes: constraint.startMinutes,
        endMinutes: constraint.endMinutes,
      };
    }
    setLessonPolicyEnabled(Boolean(res.data.lessonPolicyEnabled));
    setLessonRequiredTypesEnabled(Boolean(res.data.lessonRequiredTypesEnabled));
    setLessonRequiredTypes(
      (res.data.lessonRequiredTypes ?? []).filter((value): value is LessonTypeValue =>
        LESSON_TYPE_OPTIONS.some((option) => option.value === value),
      ),
    );
    setLessonConstraints(nextConstraints);
    setBookingSlotDurations((res.data.bookingSlotDurations ?? [30, 60]).slice().sort((a, b) => a - b));
    setRoundedHoursOnly(res.data.roundedHoursOnly ?? false);
    setNationalHolidaysEnabled(res.data.nationalHolidaysEnabled ?? false);
    setNationalHolidaysDisabled(res.data.nationalHolidaysDisabled ?? []);
    setSwapEnabled(res.data.swapEnabled ?? false);
    setSwapNotifyMode(res.data.swapNotifyMode ?? "available_only");
    setStudentCancellationEnabled(res.data.studentCancellationEnabled !== false);
    setBookingCutoffEnabled(res.data.bookingCutoffEnabled ?? false);
    setBookingCutoffTime(res.data.bookingCutoffTime ?? "18:00");
    setWeeklyBookingLimitEnabled(res.data.weeklyBookingLimitEnabled ?? false);
    setWeeklyBookingLimit(res.data.weeklyBookingLimit ?? 3);
    setInstructorPreferenceEnabled(res.data.instructorPreferenceEnabled ?? false);
    setStudentNotesEnabled(res.data.studentNotesEnabled ?? false);
    setAutoCheckinEnabled(res.data.autoCheckinEnabled ?? false);
    setVehiclesEnabled(res.data.vehiclesEnabled !== false);
    setAppBookingActors(
      APP_BOOKING_ACTOR_OPTIONS.some((option) => option.value === res.data.appBookingActors)
        ? (res.data.appBookingActors as AppBookingActorsValue)
        : "students",
    );
    setInstructorBookingMode(
      INSTRUCTOR_BOOKING_MODE_OPTIONS.some(
        (option) => option.value === res.data.instructorBookingMode,
      )
        ? (res.data.instructorBookingMode as InstructorBookingModeValue)
        : "manual_engine",
    );
    toast.success({ description: "Impostazioni autoscuola aggiornate." });
  };

  // Auto-save della pane Veicoli: applica subito il cambiamento in UI,
  // persiste il solo campo toccato e ripristina i valori precedenti se il
  // salvataggio fallisce (la pane non ha più il bottone "Salva configurazione").
  const updateVehicleSettings = async (patch: {
    vehiclesEnabled?: boolean;
    defaultLicenseCategory?: string;
    defaultTransmission?: string;
    followCarMotoEnabled?: boolean;
  }) => {
    const prev = {
      vehiclesEnabled,
      defaultLicenseCategory,
      defaultTransmission,
      followCarMotoEnabled,
    };
    if (patch.vehiclesEnabled !== undefined) setVehiclesEnabled(patch.vehiclesEnabled);
    if (patch.defaultLicenseCategory !== undefined)
      setDefaultLicenseCategory(patch.defaultLicenseCategory);
    if (patch.defaultTransmission !== undefined)
      setDefaultTransmission(patch.defaultTransmission);
    if (patch.followCarMotoEnabled !== undefined)
      setFollowCarMotoEnabled(patch.followCarMotoEnabled);

    const res = await updateAutoscuolaSettings({
      ...(patch.vehiclesEnabled !== undefined
        ? { vehiclesEnabled: patch.vehiclesEnabled }
        : {}),
      ...(patch.defaultLicenseCategory !== undefined
        ? { defaultLicenseCategory: patch.defaultLicenseCategory as LicenseCategory }
        : {}),
      ...(patch.defaultTransmission !== undefined
        ? { defaultTransmission: patch.defaultTransmission as "manual" | "automatic" }
        : {}),
      ...(patch.followCarMotoEnabled !== undefined
        ? { followCarMotoEnabled: patch.followCarMotoEnabled }
        : {}),
    });
    if (!res.success) {
      setVehiclesEnabled(prev.vehiclesEnabled);
      setDefaultLicenseCategory(prev.defaultLicenseCategory);
      setDefaultTransmission(prev.defaultTransmission);
      setFollowCarMotoEnabled(prev.followCarMotoEnabled);
      toast.error({
        description: res.message ?? "Impossibile salvare le impostazioni veicoli.",
      });
    }
  };

  // Auto-save della pane Promemoria e notifiche (stesso pattern della pane
  // Veicoli): applica subito il cambiamento in UI, persiste il solo campo
  // toccato e ripristina i valori precedenti se il salvataggio fallisce.
  const updateReminderSettings = async (patch: {
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
  }) => {
    if (
      (patch.slotFillChannels && !patch.slotFillChannels.length) ||
      (patch.studentReminderChannels && !patch.studentReminderChannels.length) ||
      (patch.instructorReminderChannels && !patch.instructorReminderChannels.length)
    ) {
      toast.error({ description: "Seleziona almeno un canale di invio." });
      return;
    }
    const prev = {
      studentReminderMinutes,
      instructorReminderMinutes,
      instructorReminderEnabled,
      studentReminderMorningEnabled,
      studentReminderMorningTime,
      studentReminderDayBeforeEnabled,
      studentReminderDayBeforeTime,
      slotFillChannels,
      studentReminderChannels,
      instructorReminderChannels,
    };
    if (patch.studentReminderMinutes !== undefined)
      setStudentReminderMinutes(String(patch.studentReminderMinutes));
    if (patch.instructorReminderMinutes !== undefined)
      setInstructorReminderMinutes(String(patch.instructorReminderMinutes));
    if (patch.instructorReminderEnabled !== undefined)
      setInstructorReminderEnabled(patch.instructorReminderEnabled);
    if (patch.studentReminderMorningEnabled !== undefined)
      setStudentReminderMorningEnabled(patch.studentReminderMorningEnabled);
    if (patch.studentReminderMorningTime !== undefined)
      setStudentReminderMorningTime(patch.studentReminderMorningTime);
    if (patch.studentReminderDayBeforeEnabled !== undefined)
      setStudentReminderDayBeforeEnabled(patch.studentReminderDayBeforeEnabled);
    if (patch.studentReminderDayBeforeTime !== undefined)
      setStudentReminderDayBeforeTime(patch.studentReminderDayBeforeTime);
    if (patch.slotFillChannels !== undefined) setSlotFillChannels(patch.slotFillChannels);
    if (patch.studentReminderChannels !== undefined)
      setStudentReminderChannels(patch.studentReminderChannels);
    if (patch.instructorReminderChannels !== undefined)
      setInstructorReminderChannels(patch.instructorReminderChannels);

    const res = await updateAutoscuolaSettings({
      ...(patch.studentReminderMinutes !== undefined
        ? { studentReminderMinutes: patch.studentReminderMinutes as (typeof REMINDER_OPTIONS)[number] }
        : {}),
      ...(patch.instructorReminderMinutes !== undefined
        ? { instructorReminderMinutes: patch.instructorReminderMinutes as (typeof REMINDER_OPTIONS)[number] }
        : {}),
      ...(patch.instructorReminderEnabled !== undefined
        ? { instructorReminderEnabled: patch.instructorReminderEnabled }
        : {}),
      ...(patch.studentReminderMorningEnabled !== undefined
        ? { studentReminderMorningEnabled: patch.studentReminderMorningEnabled }
        : {}),
      ...(patch.studentReminderMorningTime !== undefined
        ? { studentReminderMorningTime: patch.studentReminderMorningTime }
        : {}),
      ...(patch.studentReminderDayBeforeEnabled !== undefined
        ? { studentReminderDayBeforeEnabled: patch.studentReminderDayBeforeEnabled }
        : {}),
      ...(patch.studentReminderDayBeforeTime !== undefined
        ? { studentReminderDayBeforeTime: patch.studentReminderDayBeforeTime }
        : {}),
      ...(patch.slotFillChannels !== undefined ? { slotFillChannels: patch.slotFillChannels } : {}),
      ...(patch.studentReminderChannels !== undefined
        ? { studentReminderChannels: patch.studentReminderChannels }
        : {}),
      ...(patch.instructorReminderChannels !== undefined
        ? { instructorReminderChannels: patch.instructorReminderChannels }
        : {}),
    });
    if (!res.success) {
      setStudentReminderMinutes(prev.studentReminderMinutes);
      setInstructorReminderMinutes(prev.instructorReminderMinutes);
      setInstructorReminderEnabled(prev.instructorReminderEnabled);
      setStudentReminderMorningEnabled(prev.studentReminderMorningEnabled);
      setStudentReminderMorningTime(prev.studentReminderMorningTime);
      setStudentReminderDayBeforeEnabled(prev.studentReminderDayBeforeEnabled);
      setStudentReminderDayBeforeTime(prev.studentReminderDayBeforeTime);
      setSlotFillChannels(prev.slotFillChannels);
      setStudentReminderChannels(prev.studentReminderChannels);
      setInstructorReminderChannels(prev.instructorReminderChannels);
      toast.error({
        description: res.message ?? "Impossibile salvare le impostazioni promemoria.",
      });
    }
  };

  const toggleRequiredType = (type: LessonTypeValue) => {
    setLessonRequiredTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    );
  };

  const toggleConstraintEnabled = (type: LessonTypeValue) => {
    setLessonConstraints((current) => ({
      ...current,
      [type]: {
        ...(current[type] ?? DEFAULT_LESSON_CONSTRAINT),
        enabled: !(current[type]?.enabled ?? false),
      },
    }));
  };

  const toggleConstraintDay = (type: LessonTypeValue, day: number) => {
    setLessonConstraints((current) => {
      const state = current[type] ?? DEFAULT_LESSON_CONSTRAINT;
      const nextDays = state.daysOfWeek.includes(day)
        ? state.daysOfWeek.filter((item) => item !== day)
        : [...state.daysOfWeek, day];
      return {
        ...current,
        [type]: {
          ...state,
          daysOfWeek: normalizeDays(nextDays),
        },
      };
    });
  };

  const updateConstraintWindow = (
    type: LessonTypeValue,
    field: "startMinutes" | "endMinutes",
    value: string,
  ) => {
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) return;
    setLessonConstraints((current) => {
      const state = current[type] ?? DEFAULT_LESSON_CONSTRAINT;
      return {
        ...current,
        [type]: {
          ...state,
          [field]: minutes,
        },
      };
    });
  };

  const toggleBookingDuration = (duration: number) => {
    setBookingSlotDurations((current) => {
      const next = current.includes(duration)
        ? current.filter((value) => value !== duration)
        : [...current, duration];
      return next.sort((a, b) => a - b);
    });
  };

  // ── Instructor availability handlers ──────────────────────────────────────

  /** (Re)load the daily overrides of an instructor into `instrOverrides`,
   * grouped by ISO week. Called on dialog open AND after a recurring save so
   * the calendar dots reflect the just-saved state immediately. */
  const loadInstrOverrides = (instructorId: string) => {
    getWeeklyAvailabilityOverrides({
      ownerType: "instructor",
      ownerId: instructorId,
    }).then((res) => {
      if (res.success && res.data) {
        const byWeek = new Map<string, DayScheduleEntry[]>();
        for (const o of res.data) {
          const d = new Date(o.date);
          const ws = getWeekStart(d);
          const key = ws.toISOString().slice(0, 10);
          const list = byWeek.get(key) ?? [];
          const dayOfWeek = d.getUTCDay();
          const ranges = Array.isArray(o.ranges) ? o.ranges as Array<{ startMinutes: number; endMinutes: number }> : [];
          const first = ranges[0];
          const second = ranges[1];
          list.push({
            dayOfWeek,
            startMinutes: first?.startMinutes ?? 0,
            endMinutes: first?.endMinutes ?? 0,
            startMinutes2: second?.startMinutes ?? null,
            endMinutes2: second?.endMinutes ?? null,
          });
          byWeek.set(key, list);
        }
        setInstrOverrides(
          Array.from(byWeek.entries()).map(([weekStart, schedule]) => ({ weekStart, schedule })),
        );
      }
    });
  };

  const openInstructorAvailabilityDialog = (instructor: InstructorDetail) => {
    const current = instructorWeeklyAvailability[instructor.id];
    setAvailInstructorMode(readAvailabilityMode(instructor.settings));
    setAvailDialogTab("default");
    setCalendarSelectedDate(null);
    setCalendarMonth(new Date());
    setRecurringOverride(false);
    setAvailInstructor(instructor);
    setInstrDays(current?.daysOfWeek ?? [1, 2, 3, 4, 5]);
    setInstrStartMinutes(current?.startMinutes ?? 9 * 60);
    setInstrEndMinutes(current?.endMinutes ?? 18 * 60);
    setInstrDefaultRanges(
      current?.ranges?.length ? current.ranges : [{ startMinutes: current?.startMinutes ?? 9 * 60, endMinutes: current?.endMinutes ?? 18 * 60 }],
    );
    setInstrSelectedWeek(null);
    setInstrDaySchedule([]);
    // Load daily overrides for this instructor and group them by week
    loadInstrOverrides(instructor.id);
  };

  const toggleInstrDay = (day: number) => {
    setInstrDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  };

  // Switch the instructor between default ↔ publication availability mode from
  // the dialog (same setting the cluster panel and the mobile app expose).
  const handleSwitchAvailabilityMode = async () => {
    if (!availInstructor) return;
    const next = availInstructorMode === "publication" ? "default" : "publication";
    const label =
      next === "publication"
        ? "PUBBLICAZIONE: l'istruttore compila e pubblica la disponibilità settimana per settimana; gli allievi prenotano solo le settimane pubblicate."
        : "PREDEFINITA: settimana tipo valida ogni settimana, con eccezioni dal calendario.";
    if (!window.confirm(`Cambiare la modalità disponibilità di ${availInstructor.name}?\n\n${label}`)) return;
    setAvailModeSwitching(true);
    const existingSettings =
      availInstructor.settings && typeof availInstructor.settings === "object"
        ? (availInstructor.settings as Record<string, unknown>)
        : {};
    const updatedSettings = { ...existingSettings, availabilityMode: next } as Parameters<
      typeof updateAutoscuolaInstructor
    >[0]["settings"] & Record<string, unknown>;
    const res = await updateAutoscuolaInstructor({
      instructorId: availInstructor.id,
      settings: updatedSettings,
    });
    setAvailModeSwitching(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile cambiare modalità." });
      return;
    }
    setAvailInstructorMode(next);
    setAvailInstructor((prev) => (prev ? { ...prev, settings: updatedSettings } : prev));
    setInstructors((prev) =>
      prev.map((i) => (i.id === availInstructor.id ? { ...i, settings: updatedSettings } : i)),
    );
    toast.success({
      description: `Modalità disponibilità: ${next === "publication" ? "Pubblicazione" : "Predefinita"}.`,
    });
  };

  /** Build default per-day schedule from the flat base availability */
  const buildDefaultDaySchedule = (instructorId: string): DayScheduleEntry[] => {
    const current = instructorWeeklyAvailability[instructorId];
    if (!current) return WEEKDAY_OPTIONS.map((d) => ({ dayOfWeek: d.value, startMinutes: 9 * 60, endMinutes: 18 * 60 })).filter((d) => [1,2,3,4,5].includes(d.dayOfWeek));
    return current.daysOfWeek.map((dow) => ({
      dayOfWeek: dow,
      startMinutes: current.startMinutes,
      endMinutes: current.endMinutes,
    }));
  };

  const openClusterPanel = async (instructor: InstructorDetail) => {
    setClusterInstructor(instructor);
    setClusterAutonomous(instructor.autonomousMode ?? false);
    setClusterStudentSearch("");
    const settings = (instructor.settings ?? {}) as Record<string, unknown>;
    setClusterDurations(
      Array.isArray(settings.bookingSlotDurations)
        ? (settings.bookingSlotDurations as number[]).filter((d) => [30, 45, 60, 90, 120].includes(d))
        : [30, 60],
    );
    setClusterRoundedHours(settings.roundedHoursOnly === true);
    // Load new cluster booking settings
    setClusterAppBookingActors(settings.appBookingActors as "students" | "instructors" | "both" | undefined);
    setClusterInstructorBookingMode(settings.instructorBookingMode as "manual_full" | "manual_engine" | undefined);
    setClusterSwapEnabled(typeof settings.swapEnabled === "boolean" ? settings.swapEnabled : undefined);
    setClusterStudentCancellationEnabled(typeof settings.studentCancellationEnabled === "boolean" ? settings.studentCancellationEnabled : undefined);
    setClusterSwapNotifyMode(settings.swapNotifyMode as "all" | "available_only" | undefined);
    setClusterBookingCutoffEnabled(typeof settings.bookingCutoffEnabled === "boolean" ? settings.bookingCutoffEnabled : undefined);
    setClusterBookingCutoffTime(settings.bookingCutoffTime as string | undefined);
    setClusterWeeklyLimitEnabled(typeof settings.weeklyBookingLimitEnabled === "boolean" ? settings.weeklyBookingLimitEnabled : undefined);
    setClusterWeeklyLimit(typeof settings.weeklyBookingLimit === "number" ? settings.weeklyBookingLimit : undefined);
    setClusterEmptySlotEnabled(typeof settings.emptySlotNotificationEnabled === "boolean" ? settings.emptySlotNotificationEnabled : undefined);
    setClusterEmptySlotTarget(settings.emptySlotNotificationTarget as "all" | "availability_matching" | undefined);
    setClusterEmptySlotTimes(Array.isArray(settings.emptySlotNotificationTimes) ? settings.emptySlotNotificationTimes as string[] : undefined);
    setClusterRestrictedTimeEnabled(typeof settings.restrictedTimeRangeEnabled === "boolean" ? settings.restrictedTimeRangeEnabled : undefined);
    setClusterRestrictedTimeStart(settings.restrictedTimeRangeStart as string | undefined);
    setClusterRestrictedTimeEnd(settings.restrictedTimeRangeEnd as string | undefined);
    setClusterWeeklyAbsenceEnabled(typeof settings.weeklyAbsenceEnabled === "boolean" ? settings.weeklyAbsenceEnabled : undefined);
    setClusterWorkingHoursStart(typeof settings.workingHoursStart === "string" ? settings.workingHoursStart : undefined);
    setClusterWorkingHoursEnd(typeof settings.workingHoursEnd === "string" ? settings.workingHoursEnd : undefined);
    setClusterAvailabilityMode(settings.availabilityMode === "publication" ? "publication" : "default");
    const studRes = await getAutoscuolaStudentsWithProgress();
    if (studRes.success && studRes.data) {
      setAllStudents(studRes.data.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        assignedInstructorId: (s as Record<string, unknown>).assignedInstructorId as string | null,
        licenseCategory: s.licenseCategory ?? null,
        transmission: s.transmission ?? null,
      })));
      setClusterStudentIds(
        studRes.data
          .filter((s) => (s as Record<string, unknown>).assignedInstructorId === instructor.id)
          .map((s) => s.id),
      );
    }
  };

  const saveClusterSettings = async () => {
    if (!clusterInstructor) return;
    setClusterSaving(true);
    const res = await updateAutoscuolaInstructor({
      instructorId: clusterInstructor.id,
      autonomousMode: clusterAutonomous,
      settings: {
        ...(clusterAutonomous ? {
          bookingSlotDurations: clusterDurations,
          roundedHoursOnly: clusterRoundedHours,
          appBookingActors: clusterAppBookingActors,
          instructorBookingMode: clusterInstructorBookingMode,
          swapEnabled: clusterSwapEnabled,
          studentCancellationEnabled: clusterStudentCancellationEnabled,
          swapNotifyMode: clusterSwapNotifyMode,
          bookingCutoffEnabled: clusterBookingCutoffEnabled,
          bookingCutoffTime: clusterBookingCutoffTime,
          weeklyBookingLimitEnabled: clusterWeeklyLimitEnabled,
          weeklyBookingLimit: clusterWeeklyLimit,
          emptySlotNotificationEnabled: clusterEmptySlotEnabled,
          emptySlotNotificationTarget: clusterEmptySlotTarget,
          emptySlotNotificationTimes: clusterEmptySlotTimes,
          restrictedTimeRangeEnabled: clusterRestrictedTimeEnabled,
          restrictedTimeRangeStart: clusterRestrictedTimeStart,
          restrictedTimeRangeEnd: clusterRestrictedTimeEnd,
          weeklyAbsenceEnabled: clusterWeeklyAbsenceEnabled,
        } : {}),
        workingHoursStart: clusterWorkingHoursStart,
        workingHoursEnd: clusterWorkingHoursEnd,
        availabilityMode: clusterAvailabilityMode,
      },
      assignStudentIds: clusterAutonomous ? clusterStudentIds : [],
    });
    setClusterSaving(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Errore salvataggio." });
      return;
    }
    toast.success({ description: "Impostazioni istruttore salvate." });
    const instrRes = await getAutoscuolaInstructors();
    if (instrRes.success && instrRes.data) {
      setInstructors(instrRes.data);
    }
    setClusterInstructor(null);
  };

  // Save the instructor display color (null = back to automatic palette).
  // Awaited by ColorSwatchPicker, which spins on the trigger until we resolve.
  const changeInstructorColor = async (instructor: InstructorDetail, color: string | null) => {
    const res = await updateAutoscuolaInstructor({ instructorId: instructor.id, color });
    if (!res.success) {
      toast.error({ description: res.message ?? "Errore salvataggio colore." });
      return;
    }
    setInstructors((prev) =>
      prev.map((item) => (item.id === instructor.id ? { ...item, color } : item)),
    );
  };

  const handleSelectInstrWeek = (weekStart: string | null) => {
    setInstrSelectedWeek(weekStart);
    if (!availInstructor) return;
    if (weekStart === null) {
      // "Predefinito" selected — load the flat default
      const current = instructorWeeklyAvailability[availInstructor.id];
      setInstrDays(current?.daysOfWeek ?? [1, 2, 3, 4, 5]);
      setInstrStartMinutes(current?.startMinutes ?? 9 * 60);
      setInstrEndMinutes(current?.endMinutes ?? 18 * 60);
      setInstrDaySchedule([]);
    } else {
      // Specific week selected — load override schedule or build from default
      const override = instrOverrides.find((o) => o.weekStart === weekStart);
      if (override) {
        setInstrDaySchedule(override.schedule);
      } else {
        setInstrDaySchedule(buildDefaultDaySchedule(availInstructor.id));
      }
    }
  };

  const handleSaveInstructorAvailability = async () => {
    if (!availInstructor) return;
    if (!instrDays.length) {
      toast.error({ description: "Seleziona almeno un giorno." });
      return;
    }
    const invalidRange = instrDefaultRanges.some((r) => r.endMinutes <= r.startMinutes);
    if (invalidRange) {
      toast.error({ description: "Una o più fasce orarie non sono valide." });
      return;
    }
    setSavingInstrAvailability(true);
    const res = await setAutoscuolaInstructorWeeklyAvailability({
      instructorId: availInstructor.id,
      daysOfWeek: instrDays,
      startMinutes: instrDefaultRanges[0]?.startMinutes ?? 9 * 60,
      endMinutes: instrDefaultRanges[0]?.endMinutes ?? 18 * 60,
      ranges: instrDefaultRanges,
    });
    setSavingInstrAvailability(false);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile salvare la disponibilità." });
      return;
    }
    setInstructorWeeklyAvailability((prev) => ({
      ...prev,
      [availInstructor.id]: res.data!,
    }));
    setAvailInstructor(null);
    toast.success({ description: "Disponibilità salvata." });
    loadAvailability(date);
  };

  const handleResetInstrOverride = async () => {
    if (!availInstructor || !instrSelectedWeek) return;
    if (!window.confirm("Rimuovere l'override per questa settimana e tornare alla disponibilità predefinita?")) return;
    setSavingInstrAvailability(true);
    const res = await deleteWeeklyAvailabilityOverride({
      ownerType: "instructor",
      ownerId: availInstructor.id,
      weekStart: instrSelectedWeek,
    });
    setSavingInstrAvailability(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile rimuovere l'override." });
      return;
    }
    setInstrOverrides((prev) => prev.filter((o) => o.weekStart !== instrSelectedWeek));
    // Reset form to default
    const current = instructorWeeklyAvailability[availInstructor.id];
    setInstrDays(current?.daysOfWeek ?? [1, 2, 3, 4, 5]);
    setInstrStartMinutes(current?.startMinutes ?? 9 * 60);
    setInstrEndMinutes(current?.endMinutes ?? 18 * 60);
    toast.success({ description: "Override rimosso, settimana tornata al predefinito." });
    loadAvailability(date);
  };

  const handleDeleteInstructorAvailability = async () => {
    if (!availInstructor) return;
    if (!window.confirm("Rimuovere tutta la disponibilità settimanale di questo istruttore?")) return;
    setSavingInstrAvailability(true);
    const res = await deleteAutoscuolaInstructorWeeklyAvailability(availInstructor.id);
    setSavingInstrAvailability(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile rimuovere la disponibilità." });
      return;
    }
    setInstructorWeeklyAvailability((prev) => {
      const next = { ...prev };
      delete next[availInstructor.id];
      return next;
    });
    setAvailInstructor(null);
    toast.success({ description: "Disponibilità rimossa." });
    loadAvailability(date);
  };

  // ── Vehicle management handlers ───────────────────────────────────────────

  const openCreateVehicle = () => {
    setNewVehicleName("");
    setNewVehiclePlate("");
    setNewVehicleCategory(defaultLicenseCategory || "B");
    setNewVehicleTransmission(defaultTransmission || "manual");
    setCreateVehicleOpen(true);
  };

  const handleCreateVehicle = async () => {
    const name = newVehicleName.trim();
    if (!name) {
      toast.error({ description: "Inserisci il nome del veicolo." });
      return;
    }
    setCreatingVehicle(true);
    const res = await createAutoscuolaVehicle({
      name,
      plate: newVehiclePlate.trim() || undefined,
      licenseCategory: newVehicleCategory as (typeof LICENSE_CATEGORIES)[number],
      transmission: newVehicleTransmission as (typeof TRANSMISSIONS)[number],
    });
    setCreatingVehicle(false);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile creare il veicolo." });
      return;
    }
    setVehicles((prev) => [
      ...prev,
      {
        id: res.data!.id,
        name: res.data!.name,
        plate: res.data!.plate ?? null,
        status: res.data!.status,
        assignedInstructorId: res.data!.assignedInstructorId ?? null,
        poolInstructorIds: [],
        followsInstructorAvailability: res.data!.followsInstructorAvailability ?? true,
        licenseCategory: res.data!.licenseCategory ?? newVehicleCategory,
        transmission: res.data!.transmission ?? newVehicleTransmission,
      },
    ]);
    setCreateVehicleOpen(false);
    toast.success({ description: `Veicolo "${res.data.name}" aggiunto.` });
  };

  const openEditVehicle = (vehicle: VehicleDetail) => {
    setEditVehicle(vehicle);
    setEditVehicleName(vehicle.name);
    setEditVehiclePlate(vehicle.plate ?? "");
    setEditVehicleInstructorId(vehicle.assignedInstructorId ?? "");
    setEditVehicleMode(vehicleUsageMode(vehicle));
    setEditVehiclePoolIds(vehicle.poolInstructorIds ?? []);
    setEditVehicleFollowsAvailability(vehicle.followsInstructorAvailability);
    setEditVehicleCategory(vehicle.licenseCategory ?? "B");
    setEditVehicleTransmission(vehicle.transmission ?? "manual");
  };

  const handleSaveEditVehicle = async () => {
    if (!editVehicle) return;
    const name = editVehicleName.trim();
    if (!name) {
      toast.error({ description: "Inserisci il nome del veicolo." });
      return;
    }
    // Usage mode → payload: exclusive binds one instructor; pool sets the list;
    // open clears both.
    const exclusiveId =
      editVehicleMode === "exclusive" ? editVehicleInstructorId || null : null;
    const poolIds = editVehicleMode === "pool" ? editVehiclePoolIds : [];
    if (editVehicleMode === "exclusive" && !exclusiveId) {
      toast.error({ description: "Scegli l'istruttore esclusivo." });
      return;
    }
    if (editVehicleMode === "pool" && poolIds.length === 0) {
      toast.error({ description: "Seleziona almeno un istruttore nel pool." });
      return;
    }
    setSavingEditVehicle(true);
    const res = await updateAutoscuolaVehicle({
      vehicleId: editVehicle.id,
      name,
      plate: editVehiclePlate.trim() || null,
      assignedInstructorId: exclusiveId,
      poolInstructorIds: poolIds,
      followsInstructorAvailability:
        editVehicleMode === "exclusive" ? editVehicleFollowsAvailability : false,
      licenseCategory: editVehicleCategory as LicenseCategory,
      transmission: editVehicleTransmission as "manual" | "automatic",
    });
    setSavingEditVehicle(false);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile aggiornare il veicolo." });
      return;
    }
    setVehicles((prev) =>
      prev.map((v) =>
        v.id === editVehicle.id
          ? {
              ...v,
              name: res.data!.name,
              plate: res.data!.plate ?? null,
              status: res.data!.status,
              assignedInstructorId: res.data!.assignedInstructorId ?? null,
              poolInstructorIds: poolIds,
              followsInstructorAvailability:
                res.data!.followsInstructorAvailability ?? true,
              licenseCategory: res.data!.licenseCategory ?? "B",
              transmission: res.data!.transmission ?? "manual",
            }
          : v,
      ),
    );
    setEditVehicle(null);
    toast.success({ description: "Veicolo aggiornato." });
  };

  const handleSetVehicleMaintenance = async (toMaintenance: boolean) => {
    if (!editVehicle) return;
    setSavingEditVehicle(true);
    const res = await updateAutoscuolaVehicle({
      vehicleId: editVehicle.id,
      status: toMaintenance ? "maintenance" : "active",
    });
    setSavingEditVehicle(false);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile aggiornare lo stato." });
      return;
    }
    const nextStatus = res.data.status;
    setEditVehicle((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    setVehicles((prev) =>
      prev.map((v) => (v.id === editVehicle.id ? { ...v, status: nextStatus } : v)),
    );
  };

  const handleDeactivateVehicle = async () => {
    if (!editVehicle) return;
    if (!window.confirm(`Disattivare "${editVehicle.name}"? Gli appuntamenti futuri verranno riprogrammati.`)) return;
    setSavingEditVehicle(true);
    const res = await updateAutoscuolaVehicle({
      vehicleId: editVehicle.id,
      status: "inactive",
    });
    setSavingEditVehicle(false);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile disattivare il veicolo." });
      return;
    }
    setVehicles((prev) =>
      prev.map((v) =>
        v.id === editVehicle.id
          ? { ...v, status: "inactive", assignedInstructorId: null }
          : v,
      ),
    );
    setEditVehicle(null);
    toast.success({ description: "Veicolo disattivato." });
  };

  const handleReactivateVehicle = async () => {
    if (!editVehicle) return;
    setSavingEditVehicle(true);
    const res = await updateAutoscuolaVehicle({
      vehicleId: editVehicle.id,
      status: "active",
    });
    setSavingEditVehicle(false);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile riattivare il veicolo." });
      return;
    }
    setVehicles((prev) =>
      prev.map((v) =>
        v.id === editVehicle.id ? { ...v, status: "active" } : v,
      ),
    );
    setEditVehicle(null);
    toast.success({ description: "Veicolo riattivato." });
  };

  const openAvailabilityDialog = (vehicle: VehicleDetail) => {
    const current = vehicleWeeklyAvailability[vehicle.id];
    setAvailDialogTab("default");
    setCalendarSelectedDate(null);
    setCalendarMonth(new Date());
    setAvailVehicle(vehicle);
    setAvailDays(current?.daysOfWeek ?? [1, 2, 3, 4, 5]);
    setAvailStartMinutes(current?.startMinutes ?? 9 * 60);
    setAvailEndMinutes(current?.endMinutes ?? 18 * 60);
    setVehDefaultRanges(
      current?.ranges?.length ? current.ranges : [{ startMinutes: current?.startMinutes ?? 9 * 60, endMinutes: current?.endMinutes ?? 18 * 60 }],
    );
    setVehSelectedWeek(null);
    setVehDaySchedule([]);
    // Load daily overrides for this vehicle and group them by week
    getWeeklyAvailabilityOverrides({
      ownerType: "vehicle",
      ownerId: vehicle.id,
    }).then((res) => {
      if (res.success && res.data) {
        const byWeek = new Map<string, DayScheduleEntry[]>();
        for (const o of res.data) {
          const d = new Date(o.date);
          const ws = getWeekStart(d);
          const key = ws.toISOString().slice(0, 10);
          const list = byWeek.get(key) ?? [];
          const dayOfWeek = d.getUTCDay();
          const ranges = Array.isArray(o.ranges) ? o.ranges as Array<{ startMinutes: number; endMinutes: number }> : [];
          const first = ranges[0];
          const second = ranges[1];
          list.push({
            dayOfWeek,
            startMinutes: first?.startMinutes ?? 0,
            endMinutes: first?.endMinutes ?? 0,
            startMinutes2: second?.startMinutes ?? null,
            endMinutes2: second?.endMinutes ?? null,
          });
          byWeek.set(key, list);
        }
        setVehOverrides(
          Array.from(byWeek.entries()).map(([weekStart, schedule]) => ({ weekStart, schedule })),
        );
      }
    });
  };

  const toggleAvailDay = (day: number) => {
    setAvailDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  };

  const buildDefaultVehDaySchedule = (vehicleId: string): DayScheduleEntry[] => {
    const current = vehicleWeeklyAvailability[vehicleId];
    if (!current) return [1,2,3,4,5].map((dow) => ({ dayOfWeek: dow, startMinutes: 9 * 60, endMinutes: 18 * 60 }));
    return current.daysOfWeek.map((dow) => ({
      dayOfWeek: dow,
      startMinutes: current.startMinutes,
      endMinutes: current.endMinutes,
    }));
  };

  const handleSelectVehWeek = (weekStart: string | null) => {
    setVehSelectedWeek(weekStart);
    if (!availVehicle) return;
    if (weekStart === null) {
      const current = vehicleWeeklyAvailability[availVehicle.id];
      setAvailDays(current?.daysOfWeek ?? [1, 2, 3, 4, 5]);
      setAvailStartMinutes(current?.startMinutes ?? 9 * 60);
      setAvailEndMinutes(current?.endMinutes ?? 18 * 60);
      setVehDaySchedule([]);
    } else {
      const override = vehOverrides.find((o) => o.weekStart === weekStart);
      if (override) {
        setVehDaySchedule(override.schedule);
      } else {
        setVehDaySchedule(buildDefaultVehDaySchedule(availVehicle.id));
      }
    }
  };

  const handleSaveAvailability = async () => {
    if (!availVehicle) return;
    if (!availDays.length) {
      toast.error({ description: "Seleziona almeno un giorno." });
      return;
    }
    const invalidRange = vehDefaultRanges.some((r) => r.endMinutes <= r.startMinutes);
    if (invalidRange) {
      toast.error({ description: "Una o più fasce orarie non sono valide." });
      return;
    }
    setSavingAvailability(true);
    const res = await setAutoscuolaVehicleWeeklyAvailability({
      vehicleId: availVehicle.id,
      daysOfWeek: availDays,
      startMinutes: vehDefaultRanges[0]?.startMinutes ?? 9 * 60,
      endMinutes: vehDefaultRanges[0]?.endMinutes ?? 18 * 60,
      ranges: vehDefaultRanges,
    });
    setSavingAvailability(false);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile salvare la disponibilità." });
      return;
    }
    setVehicleWeeklyAvailability((prev) => ({
      ...prev,
      [availVehicle.id]: res.data!,
    }));
    setAvailVehicle(null);
    toast.success({ description: "Disponibilità salvata." });
    loadAvailability(date);
  };

  const handleResetVehOverride = async () => {
    if (!availVehicle || !vehSelectedWeek) return;
    if (!window.confirm("Rimuovere l'override per questa settimana e tornare alla disponibilità predefinita?")) return;
    setSavingAvailability(true);
    const res = await deleteWeeklyAvailabilityOverride({
      ownerType: "vehicle",
      ownerId: availVehicle.id,
      weekStart: vehSelectedWeek,
    });
    setSavingAvailability(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile rimuovere l'override." });
      return;
    }
    setVehOverrides((prev) => prev.filter((o) => o.weekStart !== vehSelectedWeek));
    const current = vehicleWeeklyAvailability[availVehicle.id];
    setAvailDays(current?.daysOfWeek ?? [1, 2, 3, 4, 5]);
    setAvailStartMinutes(current?.startMinutes ?? 9 * 60);
    setAvailEndMinutes(current?.endMinutes ?? 18 * 60);
    toast.success({ description: "Override rimosso, settimana tornata al predefinito." });
    loadAvailability(date);
  };

  const handleDeleteAvailability = async () => {
    if (!availVehicle) return;
    if (!window.confirm("Rimuovere tutta la disponibilità settimanale di questo veicolo?")) return;
    setSavingAvailability(true);
    const res = await deleteAutoscuolaVehicleWeeklyAvailability(availVehicle.id);
    setSavingAvailability(false);
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile rimuovere la disponibilità." });
      return;
    }
    setVehicleWeeklyAvailability((prev) => {
      const next = { ...prev };
      delete next[availVehicle.id];
      return next;
    });
    setAvailVehicle(null);
    toast.success({ description: "Disponibilità rimossa." });
    loadAvailability(date);
  };

  const toggleSection = (key: string) =>
    setExpandedSection((prev) => (prev === key ? null : key));

  // Skeleton per-pane: la pane corrente compare appena arrivano i SUOI dati,
  // senza aspettare le altre fetch (che continuano in background come prefetch).
  const paneReady =
    (!PANES_NEEDING_SETTINGS.includes(configTab) || settingsLoaded) &&
    (!PANES_NEEDING_RESOURCES.includes(configTab) || hasLoadedOnce);

  // Le sezioni impostazioni (Promemoria/Policy/Sede) sono rese una alla
  // volta come pannello dell'overlay.
  const renderSettingsSection = (section: SettingsSectionKey) => (
          <SettingsTab
            section={section}
            expandedSection={expandedSection}
            toggleSection={toggleSection}
            studentReminderMinutes={studentReminderMinutes}
            studentReminderMorningEnabled={studentReminderMorningEnabled}
            studentReminderMorningTime={studentReminderMorningTime}
            studentReminderDayBeforeEnabled={studentReminderDayBeforeEnabled}
            studentReminderDayBeforeTime={studentReminderDayBeforeTime}
            instructorReminderMinutes={instructorReminderMinutes}
            instructorReminderEnabled={instructorReminderEnabled}
            slotFillChannels={slotFillChannels}
            studentReminderChannels={studentReminderChannels}
            instructorReminderChannels={instructorReminderChannels}
            updateReminderSettings={updateReminderSettings}
            lessonPolicyEnabled={lessonPolicyEnabled}
            setLessonPolicyEnabled={setLessonPolicyEnabled}
            lessonRequiredTypesEnabled={lessonRequiredTypesEnabled}
            setLessonRequiredTypesEnabled={setLessonRequiredTypesEnabled}
            lessonRequiredTypes={lessonRequiredTypes}
            toggleRequiredType={toggleRequiredType}
            lessonConstraints={lessonConstraints}
            toggleConstraintEnabled={toggleConstraintEnabled}
            toggleConstraintDay={toggleConstraintDay}
            updateConstraintWindow={updateConstraintWindow}
            handleSaveSettings={handleSaveSettings}
            savingSettings={savingSettings}
          />
  );

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-white"
      data-testid="autoscuole-settings-page"
    >
      {tabs}
      {/* ── Header overlay ── */}
      <div className="h-[72px] shrink-0 border-b border-[#dddddd]">
        {/* Stesso container della top bar principale: logo sempre nello stesso punto */}
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-4 lg:px-10">
        <Image
          src="/images/nav/logo-reglo-tight.png"
          alt="Reglo"
          width={30}
          height={30}
          className="select-none object-contain"
        />
        <button
          type="button"
          onClick={() => router.push(`${pathname}?tab=agenda`)}
          className="cursor-pointer select-none rounded-full bg-[#f2f2f2] px-[22px] py-2 text-sm font-medium text-foreground transition-colors hover:bg-[#e8e8e8]"
        >
          Fatto
        </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 justify-center overflow-hidden">
        <div className="grid min-h-0 w-full max-w-[1280px] grid-rows-[auto_1fr] lg:grid-rows-1 grid-cols-1 lg:grid-cols-[380px_1fr]">
          {/* ── Sidebar ── */}
          <div className="min-h-0 overflow-x-auto border-b border-[#ebebeb] px-4 py-3 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-0 lg:py-12 lg:pr-10">
            <h1 className="mb-8 hidden text-[28px] font-bold tracking-[-0.6px] text-foreground lg:block">
              Impostazioni dell&apos;account
            </h1>
            <nav className="flex gap-1 lg:flex-col lg:gap-0.5">
              {CONFIG_PANE_GROUPS.map((group, groupIndex) => (
                <React.Fragment key={groupIndex}>
                  {groupIndex > 0 && <div className="my-1.5 hidden h-px bg-[#ebebeb] lg:mx-1 lg:block" />}
                  {group.map((pane) => {
                    const active = configTab === pane.key;
                    return (
                      <button
                        key={pane.key}
                        type="button"
                        onClick={() => goToPane(pane.key)}
                        className={cn(
                          "flex shrink-0 cursor-pointer select-none items-center gap-3 whitespace-nowrap rounded-[10px] px-4 py-2.5 text-[14px] transition-colors lg:gap-4 lg:px-5 lg:py-4 lg:text-[17px]",
                          active
                            ? "bg-[#f2f2f2] font-semibold text-foreground"
                            : "font-medium text-[#444444] hover:bg-[#ebebeb] hover:text-foreground",
                        )}
                      >
                        <pane.icon className="size-5 shrink-0 lg:size-6" strokeWidth={1.9} />
                        {pane.label}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
            </nav>
          </div>

          {/* ── Content ── */}
          <div ref={contentScrollRef} className="relative min-h-0 overflow-y-auto px-6 py-8 lg:py-12 lg:pl-12 lg:pr-8">
            <h2 className="mb-9 text-2xl font-bold tracking-[-0.3px] text-foreground">
              {CONFIG_PANE_TITLES[configTab]}
            </h2>
            {!paneReady && <SettingsPaneSkeleton />}
            <div className={paneReady ? undefined : "hidden"}>
          <FadeIn>
        <KeepAlivePane active={configTab === "business"} eager={mountAllPanes}>
          <BusinessInfoPane />
        </KeepAlivePane>
        {(["policy", "reminders", "locations"] as const).map((section) => (
          <KeepAlivePane key={section} active={configTab === section} eager={mountAllPanes}>
            {renderSettingsSection(section)}
          </KeepAlivePane>
        ))}
        <KeepAlivePane active={configTab === "payments"} eager={mountAllPanes}>
          <PaymentsSettingsPane />
        </KeepAlivePane>
        <KeepAlivePane active={configTab === "instructors"} eager={mountAllPanes}>
          <InstructorsTab
            instructors={instructors}
            instructorWeeklyAvailability={instructorWeeklyAvailability}
            instructorAvailability={instructorAvailability}
            openClusterPanel={openClusterPanel}
            openInstructorAvailabilityDialog={openInstructorAvailabilityDialog}
            changeInstructorColor={changeInstructorColor}
            setSickLeaveInstructor={setSickLeaveInstructor}
            setSickLeaveStartDate={setSickLeaveStartDate}
            setSickLeaveEndDate={setSickLeaveEndDate}
            setSickLeaveHalfDay={setSickLeaveHalfDay}
            setSickLeaveStartTime={setSickLeaveStartTime}
            setInviteInstructorOpen={setInviteInstructorOpen}
            clusterInstructor={clusterInstructor}
            setClusterInstructor={setClusterInstructor}
            clusterAutonomous={clusterAutonomous}
            setClusterAutonomous={setClusterAutonomous}
            clusterDurations={clusterDurations}
            setClusterDurations={setClusterDurations}
            clusterRoundedHours={clusterRoundedHours}
            setClusterRoundedHours={setClusterRoundedHours}
            clusterAppBookingActors={clusterAppBookingActors}
            setClusterAppBookingActors={setClusterAppBookingActors}
            clusterInstructorBookingMode={clusterInstructorBookingMode}
            setClusterInstructorBookingMode={setClusterInstructorBookingMode}
            clusterSwapEnabled={clusterSwapEnabled}
            setClusterSwapEnabled={setClusterSwapEnabled}
            clusterStudentCancellationEnabled={clusterStudentCancellationEnabled}
            setClusterStudentCancellationEnabled={setClusterStudentCancellationEnabled}
            clusterSwapNotifyMode={clusterSwapNotifyMode}
            setClusterSwapNotifyMode={setClusterSwapNotifyMode}
            clusterBookingCutoffEnabled={clusterBookingCutoffEnabled}
            setClusterBookingCutoffEnabled={setClusterBookingCutoffEnabled}
            clusterBookingCutoffTime={clusterBookingCutoffTime}
            setClusterBookingCutoffTime={setClusterBookingCutoffTime}
            clusterWeeklyLimitEnabled={clusterWeeklyLimitEnabled}
            setClusterWeeklyLimitEnabled={setClusterWeeklyLimitEnabled}
            clusterWeeklyLimit={clusterWeeklyLimit}
            setClusterWeeklyLimit={setClusterWeeklyLimit}
            clusterEmptySlotEnabled={clusterEmptySlotEnabled}
            setClusterEmptySlotEnabled={setClusterEmptySlotEnabled}
            clusterEmptySlotTarget={clusterEmptySlotTarget}
            setClusterEmptySlotTarget={setClusterEmptySlotTarget}
            clusterEmptySlotTimes={clusterEmptySlotTimes}
            setClusterEmptySlotTimes={setClusterEmptySlotTimes}
            clusterRestrictedTimeEnabled={clusterRestrictedTimeEnabled}
            setClusterRestrictedTimeEnabled={setClusterRestrictedTimeEnabled}
            clusterRestrictedTimeStart={clusterRestrictedTimeStart}
            setClusterRestrictedTimeStart={setClusterRestrictedTimeStart}
            clusterRestrictedTimeEnd={clusterRestrictedTimeEnd}
            setClusterRestrictedTimeEnd={setClusterRestrictedTimeEnd}
            clusterWeeklyAbsenceEnabled={clusterWeeklyAbsenceEnabled}
            setClusterWeeklyAbsenceEnabled={setClusterWeeklyAbsenceEnabled}
            clusterWorkingHoursStart={clusterWorkingHoursStart}
            setClusterWorkingHoursStart={setClusterWorkingHoursStart}
            clusterWorkingHoursEnd={clusterWorkingHoursEnd}
            setClusterWorkingHoursEnd={setClusterWorkingHoursEnd}
            clusterAvailabilityMode={clusterAvailabilityMode}
            setClusterAvailabilityMode={setClusterAvailabilityMode}
            allStudents={allStudents}
            clusterStudentIds={clusterStudentIds}
            setClusterStudentIds={setClusterStudentIds}
            clusterStudentSearch={clusterStudentSearch}
            setClusterStudentSearch={setClusterStudentSearch}
            saveClusterSettings={saveClusterSettings}
            clusterSaving={clusterSaving}
          />
        </KeepAlivePane>
        <KeepAlivePane active={configTab === "bookings"} eager={mountAllPanes}>
          <BookingsTab
            availabilityWeeks={availabilityWeeks}
            setAvailabilityWeeks={setAvailabilityWeeks}
            bookingMinStartDate={bookingMinStartDate}
            setBookingMinStartDate={setBookingMinStartDate}
            appBookingActors={appBookingActors}
            setAppBookingActors={(v) => setAppBookingActors(v as AppBookingActorsValue)}
            instructorBookingMode={instructorBookingMode}
            setInstructorBookingMode={(v) => setInstructorBookingMode(v as InstructorBookingModeValue)}
            bookingSlotDurations={bookingSlotDurations}
            toggleBookingDuration={toggleBookingDuration}
            roundedHoursOnly={roundedHoursOnly}
            setRoundedHoursOnly={setRoundedHoursOnly}
            nationalHolidaysEnabled={nationalHolidaysEnabled}
            setNationalHolidaysEnabled={setNationalHolidaysEnabled}
            nationalHolidaysDisabled={nationalHolidaysDisabled}
            setNationalHolidaysDisabled={setNationalHolidaysDisabled}
            bookingCutoffEnabled={bookingCutoffEnabled}
            setBookingCutoffEnabled={setBookingCutoffEnabled}
            bookingCutoffTime={bookingCutoffTime}
            setBookingCutoffTime={setBookingCutoffTime}
            weeklyBookingLimitEnabled={weeklyBookingLimitEnabled}
            setWeeklyBookingLimitEnabled={setWeeklyBookingLimitEnabled}
            weeklyBookingLimit={weeklyBookingLimit}
            setWeeklyBookingLimit={setWeeklyBookingLimit}
            examPriorityEnabled={examPriorityEnabled}
            setExamPriorityEnabled={setExamPriorityEnabled}
            examPriorityDaysBeforeExam={examPriorityDaysBeforeExam}
            setExamPriorityDaysBeforeExam={setExamPriorityDaysBeforeExam}
            examPriorityBlockNonExam={examPriorityBlockNonExam}
            setExamPriorityBlockNonExam={setExamPriorityBlockNonExam}
            examPriorityPausedUntil={examPriorityPausedUntil}
            setExamPriorityPausedUntil={setExamPriorityPausedUntil}
            restrictedTimeRangeEnabled={restrictedTimeRangeEnabled}
            setRestrictedTimeRangeEnabled={setRestrictedTimeRangeEnabled}
            restrictedTimeRangeStart={restrictedTimeRangeStart}
            setRestrictedTimeRangeStart={setRestrictedTimeRangeStart}
            restrictedTimeRangeEnd={restrictedTimeRangeEnd}
            setRestrictedTimeRangeEnd={setRestrictedTimeRangeEnd}
            swapEnabled={swapEnabled}
            setSwapEnabled={setSwapEnabled}
            swapNotifyMode={swapNotifyMode}
            setSwapNotifyMode={(v) => setSwapNotifyMode(v as "all" | "available_only")}
            studentCancellationEnabled={studentCancellationEnabled}
            setStudentCancellationEnabled={setStudentCancellationEnabled}
            autoCheckinEnabled={autoCheckinEnabled}
            setAutoCheckinEnabled={setAutoCheckinEnabled}
            studentNotesEnabled={studentNotesEnabled}
            setStudentNotesEnabled={setStudentNotesEnabled}
            groupLessonsEnabled={groupLessonsEnabled}
            setGroupLessonsEnabled={setGroupLessonsEnabled}
            emptySlotNotificationEnabled={emptySlotNotificationEnabled}
            setEmptySlotNotificationEnabled={setEmptySlotNotificationEnabled}
            emptySlotNotificationTarget={emptySlotNotificationTarget}
            setEmptySlotNotificationTarget={(v) => setEmptySlotNotificationTarget(v as "all" | "availability_matching")}
            emptySlotNotificationTimes={emptySlotNotificationTimes}
            setEmptySlotNotificationTimes={setEmptySlotNotificationTimes}
            triggeringNotification={triggeringNotification}
            setTriggeringNotification={setTriggeringNotification}
            instructorPreferenceEnabled={instructorPreferenceEnabled}
            setInstructorPreferenceEnabled={setInstructorPreferenceEnabled}
            handleSaveSettings={handleSaveSettings}
            savingSettings={savingSettings}
            toast={toast}
          />
        </KeepAlivePane>
        <KeepAlivePane active={configTab === "vehicles"} eager={mountAllPanes}>
          <VehiclesTab
            vehicles={vehicles}
            vehicleWeeklyAvailability={vehicleWeeklyAvailability}
            vehicleAvailability={vehicleAvailability}
            loading={loading}
            vehiclesEnabled={vehiclesEnabled}
            defaultLicenseCategory={defaultLicenseCategory}
            defaultTransmission={defaultTransmission}
            followCarMotoEnabled={followCarMotoEnabled}
            updateVehicleSettings={updateVehicleSettings}
            openCreateVehicle={openCreateVehicle}
            openEditVehicle={openEditVehicle}
            openAvailabilityDialog={openAvailabilityDialog}
          />
        </KeepAlivePane>
        <KeepAlivePane active={configTab === "voice"} eager={mountAllPanes}>
          <VoiceSettingsPane />
        </KeepAlivePane>
          </FadeIn>
            </div>
          </div>
        </div>
      </div>

        {/* ── Instructor availability dialog */}
        <Dialog open={Boolean(availInstructor)} onOpenChange={(open) => !open && setAvailInstructor(null)}>
          <DialogContent className={cn("gap-0 p-0 overflow-y-hidden overflow-x-clip", availInstructorMode === "publication" ? "sm:max-w-[560px]" : "sm:max-w-[480px]")}>
            <DialogTitle className="sr-only">Disponibilità — {availInstructor?.name}</DialogTitle>
            <div className="px-6 pt-5 pb-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">Disponibilità — {availInstructor?.name}</h3>
              {/* Mode badge + switch (mirrors the mobile availability-mode setting) */}
              <div className="mt-2 flex items-center gap-2">
                {availInstructorMode === "publication" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#9fc3f0] bg-[#eaf2fd] px-2.5 py-1 text-[11px] font-semibold text-[#1a2b45]">
                    <span className="size-1.5 rounded-full bg-[#1a2b45]" />
                    Modalità pubblicazione
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e0e0e0] bg-[#f7f7f7] px-2.5 py-1 text-[11px] font-semibold text-[#6a6a6a]">
                    <span className="size-1.5 rounded-full bg-[#b0b0b0]" />
                    Modalità predefinita
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSwitchAvailabilityMode}
                  disabled={availModeSwitching}
                  className="cursor-pointer text-[11px] font-medium text-[#6a6a6a] underline underline-offset-2 transition-colors hover:text-[#222222] disabled:opacity-50"
                >
                  {availModeSwitching ? "Cambio..." : "Cambia modalità"}
                </button>
              </div>
              {/* Tab switcher (default mode only) */}
              {availInstructorMode === "default" && (
                <div className="mt-3 flex max-w-[260px] items-center gap-1 rounded-full bg-[#f2f2f2] p-1">
                  <button type="button" onClick={() => { setAvailDialogTab("default"); setInstrSelectedWeek(null); }} className={cn("flex-1 cursor-pointer rounded-full px-3 py-1.5 text-xs transition-colors", availDialogTab === "default" ? "bg-white font-semibold text-[#222222] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "font-medium text-[#6a6a6a] hover:text-[#222222]")}>
                    Predefinito
                  </button>
                  <button type="button" onClick={() => setAvailDialogTab("calendar")} className={cn("flex-1 cursor-pointer rounded-full px-3 py-1.5 text-xs transition-colors", availDialogTab === "calendar" ? "bg-white font-semibold text-[#222222] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "font-medium text-[#6a6a6a] hover:text-[#222222]")}>
                    Calendario
                  </button>
                </div>
              )}
            </div>

            {/* min-w-0: DialogContent is a grid — without it the week rail's
                intrinsic width expands the item past the dialog and the whole
                content bleeds/scrolls horizontally. */}
            <div className="min-w-0 px-6 py-5 space-y-4">
              {availInstructorMode === "publication" && availInstructor ? (
                <InstructorPublicationEditor
                  instructorId={availInstructor.id}
                  base={instructorWeeklyAvailability[availInstructor.id] ?? null}
                  onChanged={() => loadAvailability(date)}
                />
              ) : availDialogTab === "default" ? (
                <>
                  <FieldGroup label="Giorni attivi">
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_OPTIONS.map((day) => (
                        <ToggleChip key={day.value} active={instrDays.includes(day.value)} onClick={() => toggleInstrDay(day.value)}>
                          {day.label}
                        </ToggleChip>
                      ))}
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Fasce orarie">
                    <TimeRangeRows
                      ranges={instrDefaultRanges}
                      onChange={(next) => {
                        setInstrDefaultRanges(next);
                        if (next.length) {
                          setInstrStartMinutes(next[0].startMinutes);
                          setInstrEndMinutes(next[0].endMinutes);
                        }
                      }}
                    />
                  </FieldGroup>
                </>
              ) : (
                <>
                  <AvailabilityCalendar
                    calendarMonth={calendarMonth}
                    setCalendarMonth={setCalendarMonth}
                    selectedDate={calendarSelectedDate}
                    setSelectedDate={(d) => { setCalendarSelectedDate(d); setRecurringOverride(false); }}
                    overrides={instrOverrides}
                    ranges={calendarDayRanges}
                    setRanges={setCalendarDayRanges}
                    dayEnabled={calendarDayEnabled}
                    setDayEnabled={setCalendarDayEnabled}
                    defaultAvailability={availInstructor ? instructorWeeklyAvailability[availInstructor.id] ?? null : null}
                  />
                  {calendarSelectedDate && calendarDayEnabled && (
                    <div
                      className="flex cursor-pointer items-center justify-between gap-4 rounded-[10px] bg-[#f8f8f8] p-4"
                      onClick={() => setRecurringOverride((prev) => !prev)}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">Disponibilità ricorrente</span>
                        <span className="text-xs text-muted-foreground">
                          Applica a tutti i {WEEKDAY_OPTIONS.find((w) => w.value === new Date(calendarSelectedDate).getUTCDay())?.label ?? ""} dal {new Date(calendarSelectedDate).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" })} in poi
                        </span>
                      </div>
                      <InlineToggle checked={recurringOverride} size="lg" />
                    </div>
                  )}
                </>
              )}
            </div>

            {availInstructorMode === "publication" ? (
              <div className="flex items-center justify-end border-t border-border px-6 py-4">
                <Button type="button" variant="outline" size="sm" onClick={() => setAvailInstructor(null)}>Chiudi</Button>
              </div>
            ) : (
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              {availDialogTab === "default" ? (
                <button type="button" onClick={handleDeleteInstructorAvailability} disabled={savingInstrAvailability || !availInstructor || !instructorWeeklyAvailability[availInstructor?.id ?? ""]} className="cursor-pointer text-[13px] font-medium text-[#c13515] transition-colors hover:text-[#9a2810] disabled:opacity-40">
                  Rimuovi disponibilità
                </button>
              ) : (
                <button type="button" onClick={() => { if (calendarSelectedDate && availInstructor) { const weekStart = getWeekStart(new Date(calendarSelectedDate)).toISOString().slice(0, 10); handleResetInstrOverride(); } }} disabled={savingInstrAvailability || !calendarSelectedDate} className="text-xs text-navy-900 hover:text-navy-700 hover:underline disabled:opacity-40">
                  Ripristina predefinito
                </button>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setAvailInstructor(null)} disabled={savingInstrAvailability}>Annulla</Button>
                <Button type="button" size="sm" onClick={async () => {
                  if (availDialogTab === "calendar" && calendarSelectedDate && availInstructor) {
                    const dateObj = new Date(calendarSelectedDate);
                    const ws = getWeekStart(dateObj);
                    const weekStartStr = ws.toISOString().slice(0, 10);
                    const dayOfWeek = dateObj.getUTCDay();

                    if (!calendarDayEnabled) {
                      // Save empty schedule = day off
                      setSavingInstrAvailability(true);
                      const res = await setWeeklyAvailabilityOverride({
                        ownerType: "instructor",
                        ownerId: availInstructor.id,
                        weekStart: weekStartStr,
                        schedule: [{ dayOfWeek, startMinutes: 0, endMinutes: 0 }],
                      });
                      setSavingInstrAvailability(false);
                      if (!res.success) { toast.error({ description: res.message ?? "Errore salvataggio." }); return; }
                      loadInstrOverrides(availInstructor.id);
                    } else if (recurringOverride) {
                      // Recurring: apply to all future weeks for this day of week
                      setSavingInstrAvailability(true);
                      const res = await setRecurringAvailabilityOverride({
                        ownerType: "instructor",
                        ownerId: availInstructor.id,
                        dayOfWeek,
                        ranges: calendarDayRanges,
                        // Start from the selected day, not from the nearest
                        // future occurrence of the weekday.
                        fromDate: dateObj.toISOString().slice(0, 10),
                      });
                      setSavingInstrAvailability(false);
                      if (!res.success) { toast.error({ description: res.message ?? "Errore salvataggio." }); return; }
                      // Refresh the calendar dots with the just-saved weeks —
                      // without this the dialog showed no trace of the save.
                      loadInstrOverrides(availInstructor.id);
                    } else {
                      const schedule: DayScheduleEntry[] = [{
                        dayOfWeek,
                        startMinutes: calendarDayRanges[0].startMinutes,
                        endMinutes: calendarDayRanges[0].endMinutes,
                        ...(calendarDayRanges.length > 1 ? { startMinutes2: calendarDayRanges[1].startMinutes, endMinutes2: calendarDayRanges[1].endMinutes } : {}),
                      }];
                      setSavingInstrAvailability(true);
                      const res = await setWeeklyAvailabilityOverride({
                        ownerType: "instructor",
                        ownerId: availInstructor.id,
                        weekStart: weekStartStr,
                        schedule,
                      });
                      setSavingInstrAvailability(false);
                      if (!res.success) { toast.error({ description: res.message ?? "Errore salvataggio." }); return; }
                      // Update local overrides
                      setInstrOverrides((prev) => {
                        const filtered = prev.filter((o) => o.weekStart !== weekStartStr);
                        return [...filtered, { weekStart: weekStartStr, schedule }];
                      });
                    }
                    toast.success({ description: "Override salvato." });
                    loadAvailability(date);
                  } else {
                    handleSaveInstructorAvailability();
                  }
                }} disabled={savingInstrAvailability || (availDialogTab === "default" && (!instrDays.length || instrDefaultRanges.some((r) => r.endMinutes <= r.startMinutes))) || (availDialogTab === "calendar" && !calendarSelectedDate)}>
                  {savingInstrAvailability ? "Salvataggio..." : "Salva"}
                </Button>
              </div>
            </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Aggiungi istruttore: crea direttamente l'account (niente invito) */}
        <AdminUsersCreateDialog
          open={inviteInstructorOpen}
          onOpenChange={setInviteInstructorOpen}
          fixedAutoscuolaRole="INSTRUCTOR"
          title="Aggiungi istruttore"
          description="Crea l'account dell'istruttore: potrà accedere subito con email e password."
          onCreated={() => void loadResources()}
        />

        {/* ── Create vehicle dialog */}
        <Dialog open={createVehicleOpen} onOpenChange={setCreateVehicleOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Nuovo veicolo</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nome *</label>
                <Input
                  placeholder="es. Fiat 500"
                  value={newVehicleName}
                  onChange={(e) => setNewVehicleName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateVehicle()}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Targa (opzionale)</label>
                <Input
                  placeholder="es. AB123CD"
                  value={newVehiclePlate}
                  onChange={(e) => setNewVehiclePlate(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateVehicle()}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Categoria patente">
                  <Select value={newVehicleCategory} onValueChange={setNewVehicleCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LICENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {LICENSE_CATEGORY_LABELS[cat]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Cambio">
                  <Select value={newVehicleTransmission} onValueChange={setNewVehicleTransmission}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSMISSIONS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TRANSMISSION_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateVehicleOpen(false)} disabled={creatingVehicle}>
                Annulla
              </Button>
              <Button onClick={handleCreateVehicle} disabled={creatingVehicle || !newVehicleName.trim()}>
                {creatingVehicle ? "Creazione..." : "Crea veicolo"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Edit vehicle dialog */}
        <Dialog open={Boolean(editVehicle)} onOpenChange={(open) => !open && setEditVehicle(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Modifica veicolo</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nome *</label>
                <Input
                  placeholder="es. Fiat 500"
                  value={editVehicleName}
                  onChange={(e) => setEditVehicleName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Targa (opzionale)</label>
                <Input
                  placeholder="es. AB123CD"
                  value={editVehiclePlate}
                  onChange={(e) => setEditVehiclePlate(e.target.value.toUpperCase())}
                />
              </div>

              {/* ── Categoria patente + cambio ── */}
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Categoria patente">
                  <Select
                    value={editVehicleCategory}
                    onValueChange={setEditVehicleCategory}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LICENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {LICENSE_CATEGORY_LABELS[cat]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Cambio">
                  <Select
                    value={editVehicleTransmission}
                    onValueChange={setEditVehicleTransmission}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSMISSIONS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TRANSMISSION_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
              </div>

              {/* ── Modalità di utilizzo (Aperto / Pool / Esclusivo) ── */}
              <FieldGroup label="Modalità di utilizzo">
                <div className="flex gap-1 rounded-xl border border-border bg-muted/60 p-1">
                  {(
                    [
                      ["open", "Aperto"],
                      ["pool", "Pool"],
                      ["exclusive", "Esclusivo"],
                    ] as Array<[VehicleUsageMode, string]>
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      data-testid={`vehicle-mode-${mode}`}
                      data-active={editVehicleMode === mode}
                      onClick={() => setEditVehicleMode(mode)}
                      className={cn(
                        "flex-1 cursor-pointer rounded-lg py-2 text-[13px] transition-all duration-150",
                        editVehicleMode === mode
                          ? "bg-white font-semibold text-foreground shadow-sm"
                          : "font-medium text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {editVehicleMode === "open" && (
                  <span className="text-xs text-muted-foreground">
                    Tutti gli istruttori possono usarlo. È l&apos;impostazione predefinita.
                  </span>
                )}

                {editVehicleMode === "pool" && (
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">
                      Solo gli istruttori selezionati possono usare questo veicolo.
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {instructors
                        .filter((ins) => ins.status !== "inactive")
                        .map((ins) => {
                          const active = editVehiclePoolIds.includes(ins.id);
                          return (
                            <ToggleChip
                              key={ins.id}
                              active={active}
                              onClick={() =>
                                setEditVehiclePoolIds((prev) =>
                                  active
                                    ? prev.filter((id) => id !== ins.id)
                                    : [...prev, ins.id],
                                )
                              }
                            >
                              {ins.name}
                            </ToggleChip>
                          );
                        })}
                    </div>
                  </div>
                )}

                {editVehicleMode === "exclusive" && (
                  <div className="space-y-2">
                    <Select
                      value={editVehicleInstructorId || "none"}
                      onValueChange={(v) =>
                        setEditVehicleInstructorId(v === "none" ? "" : v)
                      }
                    >
                      <SelectTrigger data-testid="vehicle-exclusive-instructor">
                        <SelectValue placeholder="Scegli istruttore" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Scegli istruttore</SelectItem>
                        {instructors
                          .filter((ins) => ins.status !== "inactive")
                          .map((ins) => (
                            <SelectItem key={ins.id} value={ins.id}>
                              {ins.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      Riservato a un istruttore, nascosto agli altri. Un istruttore
                      può avere più mezzi esclusivi (es. la sua auto e la sua moto).
                    </span>
                  </div>
                )}
              </FieldGroup>

              {editVehicleMode === "exclusive" && editVehicleInstructorId ? (
                <div
                  className="flex cursor-pointer items-center justify-between gap-4 rounded-[10px] bg-[#f8f8f8] p-4"
                  onClick={() => setEditVehicleFollowsAvailability((prev) => !prev)}
                >
                  <div className="flex flex-col gap-0.5 pr-3">
                    <span className="text-sm font-medium">
                      Disponibilità: segue l&apos;istruttore
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {editVehicleFollowsAvailability
                        ? "Disponibile quando lo è l'istruttore (orari del veicolo ignorati)."
                        : "Usa gli orari propri del veicolo (impostali da Disponibilità)."}
                    </span>
                  </div>
                  <InlineToggle checked={editVehicleFollowsAvailability} size="lg" />
                </div>
              ) : null}

              {/* ── Stato: Attivo / Manutenzione ── */}
              {editVehicle && editVehicle.status !== "inactive" && (
                <FieldGroup label="Stato">
                  <div className="flex gap-2">
                    {(
                      [
                        ["active", "Attivo"],
                        ["maintenance", "Manutenzione"],
                      ] as Array<[string, string]>
                    ).map(([value, label]) => {
                      const active = (editVehicle.status ?? "active") === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={savingEditVehicle}
                          onClick={() =>
                            handleSetVehicleMaintenance(value === "maintenance")
                          }
                          className={cn(
                            "cursor-pointer rounded-full border px-4 py-2 text-[13px] font-medium transition-colors duration-150 disabled:opacity-50",
                            active && value === "active" &&
                              "border-foreground bg-foreground text-white",
                            active && value === "maintenance" &&
                              "border-amber-300 bg-amber-100 text-amber-800",
                            !active && "border-border bg-white text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {editVehicle.status === "maintenance" && (
                    <span className="text-xs text-muted-foreground">
                      Escluso dalle nuove prenotazioni; gli appuntamenti già fissati restano.
                    </span>
                  )}
                </FieldGroup>
              )}

              {editVehicle && (
                <div className="pt-1">
                  {editVehicle.status !== "inactive" ? (
                    <button
                      type="button"
                      onClick={handleDeactivateVehicle}
                      disabled={savingEditVehicle}
                      className="text-xs text-red-500 hover:text-red-600 hover:underline disabled:opacity-50"
                    >
                      Disattiva veicolo
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleReactivateVehicle}
                      disabled={savingEditVehicle}
                      className="text-xs text-emerald-600 hover:text-emerald-700 hover:underline disabled:opacity-50"
                    >
                      Riattiva veicolo
                    </button>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditVehicle(null)} disabled={savingEditVehicle}>
                Annulla
              </Button>
              <Button data-testid="vehicle-save" onClick={handleSaveEditVehicle} disabled={savingEditVehicle || !editVehicleName.trim()}>
                {savingEditVehicle ? "Salvataggio..." : "Salva"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Vehicle availability dialog */}
        <Dialog open={Boolean(availVehicle)} onOpenChange={(open) => !open && setAvailVehicle(null)}>
          <DialogContent className="sm:max-w-[480px] gap-0 p-0 overflow-hidden">
            <DialogTitle className="sr-only">Disponibilità — {availVehicle?.name}</DialogTitle>
            <div className="px-6 pt-5 pb-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">Disponibilità — {availVehicle?.name}</h3>
              <div className="mt-3 flex items-center gap-1 rounded-xl bg-gray-100 p-1 max-w-[240px]">
                <button type="button" onClick={() => { setAvailDialogTab("default"); setVehSelectedWeek(null); }} className={cn("flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", availDialogTab === "default" ? "bg-white text-foreground border border-[#e0e0e0] shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  Predefinito
                </button>
                <button type="button" onClick={() => setAvailDialogTab("calendar")} className={cn("flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", availDialogTab === "calendar" ? "bg-white text-foreground border border-[#e0e0e0] shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  Calendario
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {availDialogTab === "default" ? (
                <>
                  <FieldGroup label="Giorni attivi">
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_OPTIONS.map((day) => (
                        <ToggleChip key={day.value} active={availDays.includes(day.value)} onClick={() => toggleAvailDay(day.value)}>
                          {day.label}
                        </ToggleChip>
                      ))}
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Fasce orarie">
                    <TimeRangeRows
                      ranges={vehDefaultRanges}
                      onChange={(next) => {
                        setVehDefaultRanges(next);
                        if (next.length) {
                          setAvailStartMinutes(next[0].startMinutes);
                          setAvailEndMinutes(next[0].endMinutes);
                        }
                      }}
                    />
                  </FieldGroup>
                </>
              ) : (
                <AvailabilityCalendar
                  calendarMonth={calendarMonth}
                  setCalendarMonth={setCalendarMonth}
                  selectedDate={calendarSelectedDate}
                  setSelectedDate={setCalendarSelectedDate}
                  overrides={vehOverrides}
                  ranges={calendarDayRanges}
                  setRanges={setCalendarDayRanges}
                  dayEnabled={calendarDayEnabled}
                  setDayEnabled={setCalendarDayEnabled}
                  defaultAvailability={availVehicle ? vehicleWeeklyAvailability[availVehicle.id] ?? null : null}
                />
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              {availDialogTab === "default" ? (
                <button type="button" onClick={handleDeleteAvailability} disabled={savingAvailability || !availVehicle || !vehicleWeeklyAvailability[availVehicle?.id ?? ""]} className="text-xs text-red-500 hover:text-red-600 hover:underline disabled:opacity-40">
                  Rimuovi disponibilità
                </button>
              ) : (
                <button type="button" onClick={() => { if (calendarSelectedDate && availVehicle) handleResetVehOverride(); }} disabled={savingAvailability || !calendarSelectedDate} className="text-xs text-navy-900 hover:text-navy-700 hover:underline disabled:opacity-40">
                  Ripristina predefinito
                </button>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setAvailVehicle(null)} disabled={savingAvailability}>Annulla</Button>
                <Button type="button" size="sm" onClick={async () => {
                  if (availDialogTab === "calendar" && calendarSelectedDate && availVehicle) {
                    const dateObj = new Date(calendarSelectedDate);
                    const ws = getWeekStart(dateObj);
                    const weekStartStr = ws.toISOString().slice(0, 10);
                    const dayOfWeek = dateObj.getUTCDay();

                    if (!calendarDayEnabled) {
                      setSavingAvailability(true);
                      const res = await setWeeklyAvailabilityOverride({
                        ownerType: "vehicle",
                        ownerId: availVehicle.id,
                        weekStart: weekStartStr,
                        schedule: [{ dayOfWeek, startMinutes: 0, endMinutes: 0 }],
                      });
                      setSavingAvailability(false);
                      if (!res.success) { toast.error({ description: res.message ?? "Errore salvataggio." }); return; }
                    } else {
                      const schedule: DayScheduleEntry[] = [{
                        dayOfWeek,
                        startMinutes: calendarDayRanges[0].startMinutes,
                        endMinutes: calendarDayRanges[0].endMinutes,
                        ...(calendarDayRanges.length > 1 ? { startMinutes2: calendarDayRanges[1].startMinutes, endMinutes2: calendarDayRanges[1].endMinutes } : {}),
                      }];
                      setSavingAvailability(true);
                      const res = await setWeeklyAvailabilityOverride({
                        ownerType: "vehicle",
                        ownerId: availVehicle.id,
                        weekStart: weekStartStr,
                        schedule,
                      });
                      setSavingAvailability(false);
                      if (!res.success) { toast.error({ description: res.message ?? "Errore salvataggio." }); return; }
                      setVehOverrides((prev) => {
                        const filtered = prev.filter((o) => o.weekStart !== weekStartStr);
                        return [...filtered, { weekStart: weekStartStr, schedule }];
                      });
                    }
                    toast.success({ description: "Override salvato." });
                    loadAvailability(date);
                  } else {
                    handleSaveAvailability();
                  }
                }} disabled={savingAvailability || (availDialogTab === "default" && (!availDays.length || vehDefaultRanges.some((r) => r.endMinutes <= r.startMinutes))) || (availDialogTab === "calendar" && !calendarSelectedDate)}>
                  {savingAvailability ? "Salvataggio..." : "Salva"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Sick leave dialog ── */}
        <Dialog open={Boolean(sickLeaveInstructor)} onOpenChange={(open) => !open && setSickLeaveInstructor(null)}>
          <DialogContent className="sm:max-w-[420px] gap-0 p-0 overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-border">
              <DialogHeader>
                <DialogTitle>🤒 Malattia — {sickLeaveInstructor?.name}</DialogTitle>
              </DialogHeader>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-semibold text-[#555555]">Data inizio</div>
                  <DatePickerInput value={sickLeaveStartDate} onChange={setSickLeaveStartDate} />
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold text-[#555555]">Data fine</div>
                  <DatePickerInput value={sickLeaveEndDate} onChange={setSickLeaveEndDate} />
                </div>
              </div>
              <div className="rounded-[10px] bg-[#f8f8f8] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-[#222222]">Mezza giornata</div>
                    <div className="mt-0.5 text-[13px] font-medium text-[#929292]">
                      La malattia inizia a un orario specifico del primo giorno.
                    </div>
                  </div>
                  <InlineToggle
                    checked={sickLeaveHalfDay}
                    onChange={() => setSickLeaveHalfDay((prev) => !prev)}
                    size="lg"
                  />
                </div>
                {sickLeaveHalfDay && (
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-3">
                    <span className="text-[13px] font-medium text-[#555555]">Orario inizio malattia</span>
                    <TimePickerInput
                      value={sickLeaveStartTime}
                      onChange={setSickLeaveStartTime}
                      minTime="06:00"
                      maxTime="20:00"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <Button variant="outline" onClick={() => setSickLeaveInstructor(null)}>
                Annulla
              </Button>
              <Button
                disabled={sickLeaveSaving || !sickLeaveStartDate || !sickLeaveEndDate}
                onClick={async () => {
                  if (!sickLeaveInstructor) return;
                  setSickLeaveSaving(true);
                  try {
                    const res = await fetch("/api/autoscuole/instructor-sick-leave", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        instructorId: sickLeaveInstructor.id,
                        startDate: sickLeaveStartDate,
                        endDate: sickLeaveEndDate,
                        startTime: sickLeaveHalfDay ? sickLeaveStartTime : undefined,
                      }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      toast.success({ description: `Malattia registrata. ${data.data.appointmentsCancelled} guide cancellate.` });
                      setSickLeaveInstructor(null);
                    } else {
                      toast.error({ description: data.message ?? "Errore." });
                    }
                  } catch {
                    toast.error({ description: "Errore nel salvataggio." });
                  } finally {
                    setSickLeaveSaving(false);
                  }
                }}
              >
                {sickLeaveSaving ? "Salvataggio..." : "Conferma malattia"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
    </div>
  );
}

/* InstructorCard, VehicleCard, AvailabilityCard, EmptyCard removed — now uses ResourceCard from @/components/ui/resource-card */

function buildAvailabilityMap(slots: AvailabilitySlot[]) {
  const grouped: Record<string, AvailabilityRange[]> = {};
  const openSlots = slots
    .filter((slot) => slot.status === "open")
    .sort((a, b) => toDate(a.startsAt).getTime() - toDate(b.startsAt).getTime());

  for (const slot of openSlots) {
    const ownerId = slot.ownerId;
    const start = toDate(slot.startsAt);
    const end = toDate(slot.endsAt);
    if (!grouped[ownerId]) grouped[ownerId] = [];
    const ranges = grouped[ownerId];
    const last = ranges[ranges.length - 1];
    if (last && last.end.getTime() === start.getTime()) {
      last.end = end;
    } else {
      ranges.push({ start, end });
    }
  }

  return grouped;
}

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function diffMinutes(a: Date, b: Date) {
  return (a.getTime() - b.getTime()) / 60000;
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function formatTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${pad(hours)}:${pad(minutes)}`;
}

// ── Mini Calendar for availability overrides ──────────────────────────────────

const CAL_DAY_NAMES = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"];

type TimeRange = { startMinutes: number; endMinutes: number };

/** Editor fasce orarie (TimePicker inizio–fine, × per rimuovere, + per
 *  aggiungere): usato dai dialog disponibilità istruttore/veicolo. */
function TimeRangeRows({
  ranges,
  onChange,
}: {
  ranges: { startMinutes: number; endMinutes: number }[];
  onChange: (next: { startMinutes: number; endMinutes: number }[]) => void;
}) {
  const toTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return (
    <div className="space-y-2">
      {ranges.map((range, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <TimePickerInput
            value={toTime(range.startMinutes)}
            onChange={(t) =>
              onChange(ranges.map((r, i) => (i === idx ? { ...r, startMinutes: toMinutes(t) } : r)))
            }
          />
          <span className="text-sm font-medium text-[#929292]">–</span>
          <TimePickerInput
            value={toTime(range.endMinutes)}
            onChange={(t) =>
              onChange(ranges.map((r, i) => (i === idx ? { ...r, endMinutes: toMinutes(t) } : r)))
            }
          />
          {ranges.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(ranges.filter((_, i) => i !== idx))}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#929292] transition-colors hover:bg-[#f2f2f2] hover:text-[#222222]"
              aria-label="Rimuovi fascia"
            >
              <X className="size-3.5" strokeWidth={2.2} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...ranges, { startMinutes: 14 * 60, endMinutes: 18 * 60 }])}
        className="flex cursor-pointer items-center gap-1.5 pt-0.5 text-[13px] font-semibold text-[#222222] transition-opacity hover:opacity-70"
      >
        <Plus className="size-3.5" strokeWidth={2.2} />
        Aggiungi fascia
      </button>
    </div>
  );
}

function AvailabilityCalendar({
  calendarMonth,
  setCalendarMonth,
  selectedDate,
  setSelectedDate,
  overrides,
  ranges,
  setRanges,
  dayEnabled,
  setDayEnabled,
  defaultAvailability,
}: {
  calendarMonth: Date;
  setCalendarMonth: React.Dispatch<React.SetStateAction<Date>>;
  selectedDate: string | null;
  setSelectedDate: (date: string | null) => void;
  overrides: OverrideInfo[];
  ranges: TimeRange[];
  setRanges: React.Dispatch<React.SetStateAction<TimeRange[]>>;
  dayEnabled: boolean;
  setDayEnabled: (v: boolean) => void;
  defaultAvailability: VehicleWeeklyAvailability | null;
}) {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calDays: Array<{ day: number; dateStr: string } | null> = [];
  for (let i = 0; i < startOffset; i++) calDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    calDays.push({ day: d, dateStr: `${year}-${pad(month + 1)}-${pad(d)}` });
  }

  const overrideDates = new Set<string>();
  for (const o of overrides) {
    for (const entry of o.schedule) {
      // Reconstruct date from weekStart + dayOfWeek
      const ws = new Date(o.weekStart);
      const dayOffset = entry.dayOfWeek === 0 ? 6 : entry.dayOfWeek - 1;
      const d = new Date(ws);
      d.setDate(d.getDate() + dayOffset);
      overrideDates.add(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    }
  }

  const handleSelectDay = (dateStr: string) => {
    setSelectedDate(dateStr);
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay();
    const ws = getWeekStart(dateObj).toISOString().slice(0, 10);
    const override = overrides.find((o) => o.weekStart === ws);
    const entry = override?.schedule.find((e) => e.dayOfWeek === dayOfWeek);
    if (entry) {
      // Build ranges from override entry
      const r: TimeRange[] = [{ startMinutes: entry.startMinutes, endMinutes: entry.endMinutes }];
      if (entry.startMinutes2 != null && entry.endMinutes2 != null) {
        r.push({ startMinutes: entry.startMinutes2, endMinutes: entry.endMinutes2 });
      }
      setRanges(r);
      setDayEnabled(true);
    } else if (defaultAvailability) {
      setRanges([{ startMinutes: defaultAvailability.startMinutes, endMinutes: defaultAvailability.endMinutes }]);
      setDayEnabled(defaultAvailability.daysOfWeek.includes(dayOfWeek));
    } else {
      setRanges([{ startMinutes: 9 * 60, endMinutes: 18 * 60 }]);
      setDayEnabled(true);
    }
  };

  const monthLabel = new Date(year, month).toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const selectedDateObj = selectedDate ? new Date(selectedDate) : null;
  const selectedDayLabel = selectedDateObj
    ? selectedDateObj.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })
    : null;
  const hasOverrideOnSelected = selectedDate ? overrideDates.has(selectedDate) : false;

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground capitalize">{monthLabel}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mese precedente"
            onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Mese successivo"
            onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {CAL_DAY_NAMES.map((name) => (
          <div key={name} className="text-[10px] font-semibold uppercase text-muted-foreground py-1">{name}</div>
        ))}
        {calDays.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} />;
          const isToday = cell.dateStr === todayStr;
          const isSelected = cell.dateStr === selectedDate;
          const hasOverride = overrideDates.has(cell.dateStr);
          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => handleSelectDay(cell.dateStr)}
              className={cn(
                "relative flex h-8 w-8 mx-auto cursor-pointer items-center justify-center rounded-full text-xs font-medium transition-colors",
                isSelected
                  ? "bg-navy-900 text-white"
                  : isToday
                    ? "bg-[#eeeef4] text-navy-900 border border-[#cfcfdc]"
                    : "text-foreground hover:bg-gray-100",
              )}
            >
              {cell.day}
              {hasOverride && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-navy-900" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day editor */}
      {selectedDate && selectedDayLabel && (
        <div className="rounded-xl border border-border bg-gray-50/50 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground capitalize">{selectedDayLabel}</span>
            {hasOverrideOnSelected && (
              <span className="rounded-full bg-[#eeeef4] border border-[#cfcfdc] px-2 py-0.5 text-[10px] font-medium text-navy-900">Override</span>
            )}
          </div>
          <div
            role="switch"
            tabIndex={0}
            aria-checked={dayEnabled}
            onClick={() => setDayEnabled(!dayEnabled)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDayEnabled(!dayEnabled); } }}
            className={cn(
              "flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition-colors",
              dayEnabled ? "border-[#cfcfdc] bg-[#eeeef4]" : "border-border bg-white",
            )}
          >
            <span className="text-xs font-medium text-foreground">Disponibile</span>
            <InlineToggle checked={dayEnabled} size="sm" />
          </div>
          {dayEnabled && (
            <TimeRangeRows ranges={ranges} onChange={(next) => setRanges(() => next)} />
          )}
        </div>
      )}
    </div>
  );
}
