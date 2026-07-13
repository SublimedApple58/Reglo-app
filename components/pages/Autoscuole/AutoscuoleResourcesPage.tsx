"use client";

import React from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Plus, ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";

import {
  BellProtoIcon,
  CalendarProtoIcon,
  CarProtoIcon,
  FoldedMapIcon,
  NotepadProtoIcon,
  PhoneProtoIcon,
  UserRoundProtoIcon,
  UsersProtoIcon,
  type ProtoIcon,
} from "@/components/ui/proto-icons";

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
import { LoadingDots } from "@/components/ui/loading-dots";
import { PROTO_INPUT, PROTO_SELECT_TRIGGER } from "@/components/ui/proto-styles";

// Import statici: i pane dell'overlay restano montati (keep-alive) e non
// devono scaricare chunk al cambio sezione — il lazy-loading qui causava lo
// "scatto" bianco a ogni switch.
import SettingsTab, { type SettingsSectionKey } from "./tabs/SettingsTab";
import InstructorsTab from "./tabs/InstructorsTab";
import BookingsTab from "./tabs/BookingsTab";
import VehiclesTab from "./tabs/VehiclesTab";
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

// Icone 1:1 dal proto (components/ui/proto-icons.tsx): lucide ha varianti
// diverse dagli SVG del proto per quasi tutte le voci della sidebar.
const CONFIG_PANE_GROUPS: Array<
  Array<{ key: ConfigPane; label: string; icon: LucideIcon | ProtoIcon }>
> = [
  [
    { key: "business", label: "Informazioni aziendali", icon: UserRoundProtoIcon },
    { key: "locations", label: "Sede e luoghi", icon: FoldedMapIcon },
  ],
  [
    { key: "bookings", label: "Prenotazioni e allievi", icon: CalendarProtoIcon },
    { key: "policy", label: "Policy tipi guida", icon: NotepadProtoIcon },
    { key: "reminders", label: "Promemoria e notifiche", icon: BellProtoIcon },
  ],
  [
    { key: "instructors", label: "Istruttori", icon: UsersProtoIcon },
    { key: "vehicles", label: "Veicoli", icon: CarProtoIcon },
  ],
  [{ key: "voice", label: "Segretaria", icon: PhoneProtoIcon }],
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
    // "students" (Gestione allievi) e "payments" (Fatturazione e pagamenti)
    // sono i vecchi pane ora fusi in "bookings" (link legacy in giro per l'app).
    const raw = searchParams?.get("pane");
    const pane = raw === "students" || raw === "payments" ? "bookings" : raw;
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
  // Dettaglio istruttore aperto: l'hub ha il suo header, il titolo pane sparisce
  const [instructorsDetailOpen, setInstructorsDetailOpen] = React.useState(false);
  const contentScrollRef = React.useRef<HTMLDivElement>(null);

  const goToPane = React.useCallback((pane: ConfigPane) => {
    setConfigTab(pane);
    contentScrollRef.current?.scrollTo({ top: 0 });
  }, []);
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
  // Task 3: new cluster booking settings
  const [appBookingActors, setAppBookingActors] = React.useState<AppBookingActorsValue>("students");
  const [instructorBookingMode, setInstructorBookingMode] = React.useState<InstructorBookingModeValue>("manual_engine");
  const [instructors, setInstructors] = React.useState<InstructorDetail[]>([]);
  // Sick leave state
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
  const [calendarMonth, setCalendarMonth] = React.useState(() => new Date());
  const [calendarSelectedDate, setCalendarSelectedDate] = React.useState<string | null>(null);
  const [calendarDayRanges, setCalendarDayRanges] = React.useState<Array<{ startMinutes: number; endMinutes: number }>>([{ startMinutes: 9 * 60, endMinutes: 18 * 60 }]);
  const [calendarDayEnabled, setCalendarDayEnabled] = React.useState(true);

  // ── Instructor availability dialog
  // Week override state for instructor dialog
  const weekOptions = React.useMemo(buildWeekOptions, []);
  // Per-day schedule for override weeks: map dayOfWeek → { startMinutes, endMinutes }
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

  // ── Dettaglio veicolo inline (proto veic-detail-view): quale veicolo e tab.
  const [vehicleDetail, setVehicleDetail] = React.useState<
    { vehicleId: string; tab: "disp" | "dettagli" } | null
  >(null);
  // Conferme inline a due step (niente window.confirm).
  const [confirmDeactivateVehicle, setConfirmDeactivateVehicle] = React.useState(false);
  const [confirmDeleteAvail, setConfirmDeleteAvail] = React.useState(false);
  const [confirmResetOverride, setConfirmResetOverride] = React.useState(false);

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

  // ── Auto-save Impostazioni (pattern unico di tutte le pane) ────────────────
  // Applica subito il cambiamento in UI, persiste il SOLO campo toccato via
  // updateAutoscuolaSettings (schema tutto optional) e ripristina il valore
  // precedente + toast se il server rifiuta. Nessun bottone "Salva".
  type SettingsPatch = Parameters<typeof updateAutoscuolaSettings>[0];

  const persistSettings = async (patch: SettingsPatch, rollback: () => void) => {
    const res = await updateAutoscuolaSettings(patch);
    if (!res.success) {
      rollback();
      toast.error({ description: res.message ?? "Impossibile salvare l'impostazione." });
    }
  };

  /** Costruisce un setter auto-save compatibile con Dispatch<SetStateAction<T>>. */
  function persistField<T>(
    current: T,
    apply: (v: T) => void,
    toPatch: (v: T) => SettingsPatch,
  ): React.Dispatch<React.SetStateAction<T>> {
    return (action) => {
      const next =
        typeof action === "function" ? (action as (prev: T) => T)(current) : action;
      if (Object.is(next, current)) return;
      apply(next);
      void persistSettings(toPatch(next), () => apply(current));
    };
  }

  // Generali
  const saveAvailabilityWeeks = persistField(availabilityWeeks, setAvailabilityWeeks, (v) => ({
    availabilityWeeks: Number(v),
  }));
  const saveBookingMinStartDate = persistField(bookingMinStartDate, setBookingMinStartDate, (v) => ({
    bookingMinStartDate: v || null,
  }));
  const saveAppBookingActors = persistField(appBookingActors, setAppBookingActors, (v) => ({
    appBookingActors: v,
    // Il backend pretende la modalità istruttore insieme all'attivazione degli
    // istruttori ("Seleziona la modalità prenotazione istruttore."): il patch
    // singolo campo non basta, alleghiamo il valore corrente della select.
    ...(v === "instructors" || v === "both" ? { instructorBookingMode } : {}),
  }));
  const saveInstructorBookingMode = persistField(
    instructorBookingMode,
    setInstructorBookingMode,
    (v) => ({ instructorBookingMode: v }),
  );
  const saveRoundedHoursOnly = persistField(roundedHoursOnly, setRoundedHoursOnly, (v) => ({
    roundedHoursOnly: v,
  }));
  const saveNationalHolidaysEnabled = persistField(
    nationalHolidaysEnabled,
    setNationalHolidaysEnabled,
    (v) => ({ nationalHolidaysEnabled: v }),
  );
  const saveNationalHolidaysDisabled = persistField(
    nationalHolidaysDisabled,
    setNationalHolidaysDisabled,
    (v) => ({ nationalHolidaysDisabled: v as SettingsPatch["nationalHolidaysDisabled"] }),
  );

  // Limiti
  const saveBookingCutoffEnabled = persistField(bookingCutoffEnabled, setBookingCutoffEnabled, (v) => ({
    bookingCutoffEnabled: v,
  }));
  const saveBookingCutoffTime = persistField(bookingCutoffTime, setBookingCutoffTime, (v) => ({
    bookingCutoffTime: v as SettingsPatch["bookingCutoffTime"],
  }));
  const saveWeeklyBookingLimitEnabled = persistField(
    weeklyBookingLimitEnabled,
    setWeeklyBookingLimitEnabled,
    (v) => ({ weeklyBookingLimitEnabled: v }),
  );
  const saveWeeklyBookingLimit = persistField(weeklyBookingLimit, setWeeklyBookingLimit, (v) => ({
    weeklyBookingLimit: v,
  }));
  const saveExamPriorityEnabled = persistField(examPriorityEnabled, setExamPriorityEnabled, (v) => ({
    examPriorityEnabled: v,
  }));
  const saveExamPriorityDaysBeforeExam = persistField(
    examPriorityDaysBeforeExam,
    setExamPriorityDaysBeforeExam,
    (v) => ({ examPriorityDaysBeforeExam: v }),
  );
  const saveExamPriorityBlockNonExam = persistField(
    examPriorityBlockNonExam,
    setExamPriorityBlockNonExam,
    (v) => ({ examPriorityBlockNonExam: v }),
  );
  const saveExamPriorityPausedUntil = persistField(
    examPriorityPausedUntil,
    setExamPriorityPausedUntil,
    (v) => ({ examPriorityPausedUntil: v }),
  );
  const saveRestrictedTimeRangeEnabled = persistField(
    restrictedTimeRangeEnabled,
    setRestrictedTimeRangeEnabled,
    (v) => ({ restrictedTimeRangeEnabled: v }),
  );
  const saveRestrictedTimeRangeStart = persistField(
    restrictedTimeRangeStart,
    setRestrictedTimeRangeStart,
    (v) => ({ restrictedTimeRangeStart: v }),
  );
  const saveRestrictedTimeRangeEnd = persistField(
    restrictedTimeRangeEnd,
    setRestrictedTimeRangeEnd,
    (v) => ({ restrictedTimeRangeEnd: v }),
  );

  // Guide
  const saveSwapEnabled = persistField(swapEnabled, setSwapEnabled, (v) => ({ swapEnabled: v }));
  const saveSwapNotifyMode = persistField(swapNotifyMode, setSwapNotifyMode, (v) => ({
    swapNotifyMode: v,
  }));
  const saveStudentCancellationEnabled = persistField(
    studentCancellationEnabled,
    setStudentCancellationEnabled,
    (v) => ({ studentCancellationEnabled: v }),
  );
  const saveAutoCheckinEnabled = persistField(autoCheckinEnabled, setAutoCheckinEnabled, (v) => ({
    autoCheckinEnabled: v,
  }));
  const saveGroupLessonsEnabled = persistField(groupLessonsEnabled, setGroupLessonsEnabled, (v) => ({
    groupLessonsEnabled: v,
  }));

  // App allievi
  const saveStudentNotesEnabled = persistField(studentNotesEnabled, setStudentNotesEnabled, (v) => ({
    studentNotesEnabled: v,
  }));
  const saveEmptySlotNotificationEnabled = persistField(
    emptySlotNotificationEnabled,
    setEmptySlotNotificationEnabled,
    (v) => ({ emptySlotNotificationEnabled: v }),
  );
  const saveEmptySlotNotificationTarget = persistField(
    emptySlotNotificationTarget,
    setEmptySlotNotificationTarget,
    (v) => ({ emptySlotNotificationTarget: v }),
  );
  const saveEmptySlotNotificationTimes = persistField(
    emptySlotNotificationTimes,
    setEmptySlotNotificationTimes,
    (v) => ({ emptySlotNotificationTimes: v as SettingsPatch["emptySlotNotificationTimes"] }),
  );
  const saveInstructorPreferenceEnabled = persistField(
    instructorPreferenceEnabled,
    setInstructorPreferenceEnabled,
    (v) => ({ instructorPreferenceEnabled: v }),
  );

  // Policy tipi guida
  const saveLessonPolicyEnabled = persistField(lessonPolicyEnabled, setLessonPolicyEnabled, (v) => ({
    lessonPolicyEnabled: v,
  }));
  const saveLessonRequiredTypesEnabled = persistField(
    lessonRequiredTypesEnabled,
    setLessonRequiredTypesEnabled,
    (v) => ({ lessonRequiredTypesEnabled: v }),
  );


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
    const next = lessonRequiredTypes.includes(type)
      ? lessonRequiredTypes.filter((item) => item !== type)
      : [...lessonRequiredTypes, type];
    setLessonRequiredTypes(next);
    void persistSettings({ lessonRequiredTypes: next }, () =>
      setLessonRequiredTypes(lessonRequiredTypes),
    );
  };

  // I vincoli si salvano come mappa intera (il backend rimpiazza l'oggetto):
  // le guard sotto tengono lo stato sempre valido, così ogni click persiste.
  const serializeLessonConstraints = (map: LessonConstraintMap) => {
    const out = {} as Record<
      LessonTypeValue,
      { daysOfWeek: number[]; startMinutes: number; endMinutes: number } | null
    >;
    for (const option of LESSON_TYPE_OPTIONS) {
      const state = map[option.value];
      out[option.value] = state?.enabled
        ? {
            daysOfWeek: normalizeDays(state.daysOfWeek),
            startMinutes: state.startMinutes,
            endMinutes: state.endMinutes,
          }
        : null;
    }
    return out;
  };

  const applyConstraints = (next: LessonConstraintMap) => {
    setLessonConstraints(next);
    void persistSettings({ lessonTypeConstraints: serializeLessonConstraints(next) }, () =>
      setLessonConstraints(lessonConstraints),
    );
  };

  const toggleConstraintEnabled = (type: LessonTypeValue) => {
    const state = lessonConstraints[type] ?? DEFAULT_LESSON_CONSTRAINT;
    applyConstraints({ ...lessonConstraints, [type]: { ...state, enabled: !state.enabled } });
  };

  const toggleConstraintDay = (type: LessonTypeValue, day: number) => {
    const state = lessonConstraints[type] ?? DEFAULT_LESSON_CONSTRAINT;
    const nextDays = state.daysOfWeek.includes(day)
      ? state.daysOfWeek.filter((item) => item !== day)
      : [...state.daysOfWeek, day];
    if (state.enabled && !nextDays.length) {
      toast.error({ description: "Seleziona almeno un giorno per il limite orario." });
      return;
    }
    applyConstraints({
      ...lessonConstraints,
      [type]: { ...state, daysOfWeek: normalizeDays(nextDays) },
    });
  };

  const updateConstraintWindow = (
    type: LessonTypeValue,
    field: "startMinutes" | "endMinutes",
    value: string,
  ) => {
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) return;
    const state = lessonConstraints[type] ?? DEFAULT_LESSON_CONSTRAINT;
    const nextState = { ...state, [field]: minutes };
    if (nextState.endMinutes <= nextState.startMinutes) {
      toast.error({ description: "L'orario di fine deve essere successivo all'inizio." });
      return;
    }
    applyConstraints({ ...lessonConstraints, [type]: nextState });
  };

  const toggleBookingDuration = (duration: number) => {
    const next = (
      bookingSlotDurations.includes(duration)
        ? bookingSlotDurations.filter((value) => value !== duration)
        : [...bookingSlotDurations, duration]
    ).sort((a, b) => a - b);
    if (!next.length) {
      toast.error({ description: "Seleziona almeno una durata prenotabile." });
      return;
    }
    setBookingSlotDurations(next);
    void persistSettings(
      { bookingSlotDurations: next as SettingsPatch["bookingSlotDurations"] },
      () => setBookingSlotDurations(bookingSlotDurations),
    );
  };

  // ── Instructor availability handlers ──────────────────────────────────────




  // Switch the instructor between default ↔ publication availability mode from
  // the dialog (same setting the cluster panel and the mobile app expose).

  /** Build default per-day schedule from the flat base availability */



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
    const nextVehicle = {
      name: res.data!.name,
      plate: res.data!.plate ?? null,
      status: res.data!.status,
      assignedInstructorId: res.data!.assignedInstructorId ?? null,
      poolInstructorIds: poolIds,
      followsInstructorAvailability: res.data!.followsInstructorAvailability ?? true,
      licenseCategory: res.data!.licenseCategory ?? "B",
      transmission: res.data!.transmission ?? "manual",
    };
    setVehicles((prev) =>
      prev.map((v) => (v.id === editVehicle.id ? { ...v, ...nextVehicle } : v)),
    );
    // Si resta nel dettaglio inline: aggiorna il veicolo in modifica.
    setEditVehicle((prev) => (prev ? { ...prev, ...nextVehicle } : prev));
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
    setConfirmDeactivateVehicle(false);
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
    setEditVehicle((prev) =>
      prev ? { ...prev, status: "inactive", assignedInstructorId: null } : prev,
    );
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
    setEditVehicle((prev) => (prev ? { ...prev, status: "active" } : prev));
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
    toast.success({ description: "Disponibilità salvata." });
    loadAvailability(date);
  };

  const handleResetVehOverride = async () => {
    if (!availVehicle || !vehSelectedWeek) return;
    setConfirmResetOverride(false);
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
    setConfirmDeleteAvail(false);
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
    toast.success({ description: "Disponibilità rimossa." });
    loadAvailability(date);
  };

  /** Salva del pannello disponibilità: default settimanale o override del
   *  giorno selezionato in calendario (logica invariata dal vecchio dialog). */
  const handleAvailabilitySaveClick = async () => {
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
  };

  // ── Dettaglio veicolo inline: apre/chiude e semina entrambi gli editor.
  const openVehicleDetail = (vehicle: VehicleDetail, tab: "disp" | "dettagli") => {
    openEditVehicle(vehicle);
    openAvailabilityDialog(vehicle);
    setConfirmDeactivateVehicle(false);
    setConfirmDeleteAvail(false);
    setConfirmResetOverride(false);
    setVehicleDetail({ vehicleId: vehicle.id, tab });
  };
  const closeVehicleDetail = () => {
    setVehicleDetail(null);
    setEditVehicle(null);
    setAvailVehicle(null);
  };
  const setVehicleDetailTab = (tab: "disp" | "dettagli") =>
    setVehicleDetail((prev) => (prev ? { ...prev, tab } : prev));

  // Label uppercase dei campi veicolo (LBL del proto _paintVeicDettagli).
  const VEIC_LBL = "mb-2 text-[11px] font-bold uppercase tracking-[0.4px] text-[#929292]";

  /** Tab "Dettagli" del dettaglio veicolo inline (ex dialog Modifica veicolo). */
  const renderVehicleDetailsForm = () => {
    if (!editVehicle) return null;
    return (
      <div>
        <div className={VEIC_LBL}>Nome veicolo</div>
        <input
          placeholder="es. Fiat 500"
          value={editVehicleName}
          onChange={(e) => setEditVehicleName(e.target.value)}
          className={cn(PROTO_INPUT, "mb-[18px]")}
        />
        <div className={VEIC_LBL}>Targa (opzionale)</div>
        <input
          placeholder="es. AB123CD"
          value={editVehiclePlate}
          onChange={(e) => setEditVehiclePlate(e.target.value.toUpperCase())}
          className={cn(PROTO_INPUT, "mb-[18px]")}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={VEIC_LBL}>Categoria</div>
            <Select value={editVehicleCategory} onValueChange={setEditVehicleCategory}>
              <SelectTrigger className={PROTO_SELECT_TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LICENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{LICENSE_CATEGORY_LABELS[cat]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className={VEIC_LBL}>Cambio</div>
            <Select value={editVehicleTransmission} onValueChange={setEditVehicleTransmission}>
              <SelectTrigger className={PROTO_SELECT_TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSMISSIONS.map((t) => (
                  <SelectItem key={t} value={t}>{TRANSMISSION_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Modalità di utilizzo: segmented proto + extra per modalità */}
        <div className={cn(VEIC_LBL, "mt-[22px]")}>Modalità di utilizzo</div>
        <div className="flex gap-1 rounded-[10px] bg-[#f4f4f6] p-1">
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
                "flex-1 cursor-pointer rounded-[8px] py-[9px] text-center text-[13.5px] transition-all",
                editVehicleMode === mode
                  ? "bg-white font-semibold text-[#222222] shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                  : "font-medium text-[#888888] hover:text-[#555555]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {editVehicleMode === "open" && (
            <p className="text-[12.5px] font-medium leading-normal text-[#929292]">
              Tutti gli istruttori possono usarlo. È l&apos;impostazione predefinita.
            </p>
          )}
          {editVehicleMode === "pool" && (
            <>
              <p className="mb-2.5 text-[12.5px] font-medium leading-normal text-[#929292]">
                Solo gli istruttori selezionati possono usare questo veicolo.
              </p>
              <div className="flex flex-wrap gap-2">
                {instructors
                  .filter((ins) => ins.status !== "inactive")
                  .map((ins) => {
                    const active = editVehiclePoolIds.includes(ins.id);
                    return (
                      <button
                        key={ins.id}
                        type="button"
                        onClick={() =>
                          setEditVehiclePoolIds((prev) =>
                            active ? prev.filter((id) => id !== ins.id) : [...prev, ins.id],
                          )
                        }
                        className={cn(
                          "cursor-pointer rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition-colors",
                          active
                            ? "border-[#b9ccf5] bg-[#dbe4fb] text-[#26324d]"
                            : "border-[#e0e0e0] bg-white text-[#666666] hover:border-[#c9c9c9]",
                        )}
                      >
                        {ins.name}
                      </button>
                    );
                  })}
              </div>
            </>
          )}
          {editVehicleMode === "exclusive" && (
            <>
              <Select
                value={editVehicleInstructorId || "none"}
                onValueChange={(v) => setEditVehicleInstructorId(v === "none" ? "" : v)}
              >
                <SelectTrigger data-testid="vehicle-exclusive-instructor" className={PROTO_SELECT_TRIGGER}>
                  <SelectValue placeholder="Scegli istruttore" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Scegli istruttore</SelectItem>
                  {instructors
                    .filter((ins) => ins.status !== "inactive")
                    .map((ins) => (
                      <SelectItem key={ins.id} value={ins.id}>{ins.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-[12.5px] font-medium leading-normal text-[#929292]">
                Riservato a un istruttore, nascosto agli altri. Un istruttore può avere più mezzi
                esclusivi (es. la sua auto e la sua moto).
              </p>
            </>
          )}
        </div>

        {editVehicleMode === "exclusive" && editVehicleInstructorId ? (
          <div
            role="switch"
            tabIndex={0}
            aria-checked={editVehicleFollowsAvailability}
            onClick={() => setEditVehicleFollowsAvailability((prev) => !prev)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setEditVehicleFollowsAvailability((prev) => !prev);
              }
            }}
            className="mt-4 flex w-full cursor-pointer select-none items-center justify-between gap-4 rounded-[12px] border-[1.5px] border-[#ededed] px-4 py-[15px]"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                Disponibilità: segue l&apos;istruttore
              </div>
              <div className="mt-0.5 text-[12.5px] font-medium leading-[1.4] text-[#929292]">
                {editVehicleFollowsAvailability
                  ? "Disponibile quando lo è l'istruttore (orari del veicolo ignorati)."
                  : "Usa gli orari propri del veicolo (impostali da Disponibilità)."}
              </div>
            </div>
            <InlineToggle checked={editVehicleFollowsAvailability} size="lg" />
          </div>
        ) : null}

        {/* Stato: riga titolo+descrizione a sinistra, select a destra (proto) */}
        {editVehicle.status !== "inactive" && (
          <div className="mt-[26px] flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-foreground">Stato</div>
              <div className="mt-1 max-w-[460px] text-[13px] font-medium leading-normal text-[#929292]">
                {editVehicle.status === "maintenance"
                  ? "Escluso dalle nuove prenotazioni; gli appuntamenti già fissati restano."
                  : "Il veicolo è prenotabile normalmente."}
              </div>
            </div>
            <Select
              value={editVehicle.status === "maintenance" ? "maintenance" : "active"}
              onValueChange={(v) => void handleSetVehicleMaintenance(v === "maintenance")}
            >
              <SelectTrigger className={cn(PROTO_SELECT_TRIGGER, "w-[220px] shrink-0")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Attivo</SelectItem>
                <SelectItem value="maintenance">Manutenzione</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Disattiva / Riattiva (conferma inline) */}
        <div className="mt-6">
          {editVehicle.status !== "inactive" ? (
            confirmDeactivateVehicle ? (
              <div className="flex items-center justify-between gap-3 rounded-[12px] bg-[#fdf3f1] px-4 py-3">
                <span className="text-[13px] font-medium leading-snug text-[#7a2e1d]">
                  Disattivare &laquo;{editVehicle.name}&raquo;? Gli appuntamenti futuri verranno riprogrammati.
                </span>
                <div className="flex shrink-0 items-center gap-2.5">
                  <button
                    type="button"
                    disabled={savingEditVehicle}
                    onClick={() => setConfirmDeactivateVehicle(false)}
                    className="cursor-pointer px-1 text-[13px] font-semibold text-foreground transition-colors hover:text-[#555555]"
                  >
                    No
                  </button>
                  <button
                    type="button"
                    disabled={savingEditVehicle}
                    onClick={handleDeactivateVehicle}
                    className="flex min-w-[110px] cursor-pointer items-center justify-center rounded-full bg-[#c13515] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#a52d12] disabled:opacity-60"
                  >
                    {savingEditVehicle ? <LoadingDots className="scale-[0.6]" /> : "Sì, disattiva"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={savingEditVehicle}
                onClick={() => setConfirmDeactivateVehicle(true)}
                className="cursor-pointer text-[13.5px] font-semibold text-[#c13515] transition-colors hover:text-[#a52d12] disabled:opacity-50"
              >
                Disattiva veicolo
              </button>
            )
          ) : (
            <button
              type="button"
              disabled={savingEditVehicle}
              onClick={handleReactivateVehicle}
              className="cursor-pointer text-[13.5px] font-semibold text-[#0f7a4d] transition-colors hover:text-[#0a5c3a] disabled:opacity-50"
            >
              Riattiva veicolo
            </button>
          )}
        </div>

        {/* Footer: Salva near-black + Annulla che torna alla lista */}
        <div className="mt-7 flex items-center gap-2.5 border-t border-[#eeeeee] pt-5">
          <button
            type="button"
            data-testid="vehicle-save"
            disabled={savingEditVehicle || !editVehicleName.trim()}
            onClick={handleSaveEditVehicle}
            className="flex min-h-[40px] min-w-[78px] cursor-pointer items-center justify-center rounded-[8px] bg-[#222222] px-[18px] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
          >
            {savingEditVehicle ? <LoadingDots /> : "Salva"}
          </button>
          <button
            type="button"
            disabled={savingEditVehicle}
            onClick={closeVehicleDetail}
            className="cursor-pointer rounded-[8px] px-[18px] py-2.5 text-sm font-semibold text-foreground hover:text-navy-900"
          >
            Annulla
          </button>
        </div>
      </div>
    );
  };

  /** Tab "Disponibilità" del dettaglio veicolo inline (ex dialog disponibilità). */
  const renderVehicleAvailabilityEditor = () => {
    if (!availVehicle) return null;
    const hasWeekly = Boolean(vehicleWeeklyAvailability[availVehicle.id]);
    return (
      <div>
        {availVehicle.assignedInstructorId && availVehicle.followsInstructorAvailability && (
          <div className="mb-5 rounded-[12px] bg-[#f7f8fa] px-4 py-3 text-[12.5px] font-medium leading-normal text-[#6a6a6a]">
            Questo veicolo segue la disponibilità dell&apos;istruttore esclusivo: finché
            l&apos;opzione è attiva (tab Dettagli), gli orari qui sotto vengono ignorati.
          </div>
        )}

        {/* Tipo di pianificazione (segmented proto) */}
        <div className={VEIC_LBL}>Tipo di pianificazione</div>
        <div className="mb-[22px] flex max-w-[320px] gap-1 rounded-[10px] bg-[#f4f4f6] p-1">
          {(
            [
              ["default", "Predefinito"],
              ["calendar", "Calendario"],
            ] as Array<["default" | "calendar", string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setAvailDialogTab(key);
                if (key === "default") setVehSelectedWeek(null);
              }}
              className={cn(
                "flex-1 cursor-pointer rounded-[8px] py-[9px] text-center text-[13.5px] transition-all",
                availDialogTab === key
                  ? "bg-white font-semibold text-[#222222] shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                  : "font-medium text-[#888888] hover:text-[#555555]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {availDialogTab === "default" ? (
          <>
            <div className={VEIC_LBL}>Giorni attivi</div>
            <div className="mb-[22px] flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((day) => {
                const active = availDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleAvailDay(day.value)}
                    className={cn(
                      "cursor-pointer rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition-colors",
                      active
                        ? "border-[#b9ccf5] bg-[#dbe4fb] text-[#26324d]"
                        : "border-[#e0e0e0] bg-white text-[#666666] hover:border-[#c9c9c9]",
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            <div className={VEIC_LBL}>Fasce orarie</div>
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
            defaultAvailability={vehicleWeeklyAvailability[availVehicle.id] ?? null}
          />
        )}

        {/* Footer flat: azione secondaria a sinistra, Salva a destra */}
        <div className="mt-7 flex items-center justify-between gap-3 border-t border-[#eeeeee] pt-5">
          {availDialogTab === "default" ? (
            confirmDeleteAvail ? (
              <div className="flex items-center gap-2.5">
                <span className="text-[13px] font-medium text-[#7a2e1d]">Rimuovere tutta la disponibilità?</span>
                <button
                  type="button"
                  disabled={savingAvailability}
                  onClick={() => setConfirmDeleteAvail(false)}
                  className="cursor-pointer px-1 text-[13px] font-semibold text-foreground hover:text-[#555555]"
                >
                  No
                </button>
                <button
                  type="button"
                  disabled={savingAvailability}
                  onClick={handleDeleteAvailability}
                  className="cursor-pointer text-[13px] font-semibold text-[#c13515] underline underline-offset-2 hover:decoration-2 disabled:opacity-50"
                >
                  Sì, rimuovi
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteAvail(true)}
                disabled={savingAvailability || !hasWeekly}
                className="cursor-pointer text-[13px] font-semibold text-[#c13515] transition-colors hover:text-[#a52d12] disabled:cursor-default disabled:opacity-40"
              >
                Rimuovi disponibilità
              </button>
            )
          ) : confirmResetOverride ? (
            <div className="flex items-center gap-2.5">
              <span className="text-[13px] font-medium text-[#555555]">Tornare al predefinito per questa settimana?</span>
              <button
                type="button"
                disabled={savingAvailability}
                onClick={() => setConfirmResetOverride(false)}
                className="cursor-pointer px-1 text-[13px] font-semibold text-foreground hover:text-[#555555]"
              >
                No
              </button>
              <button
                type="button"
                disabled={savingAvailability}
                onClick={() => { if (calendarSelectedDate) handleResetVehOverride(); }}
                className="cursor-pointer text-[13px] font-semibold text-navy-900 underline underline-offset-2 hover:decoration-2 disabled:opacity-50"
              >
                Sì, ripristina
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmResetOverride(true)}
              disabled={savingAvailability || !calendarSelectedDate}
              className="cursor-pointer text-[13px] font-semibold text-navy-900 transition-colors hover:text-navy-700 disabled:cursor-default disabled:opacity-40"
            >
              Ripristina predefinito
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleAvailabilitySaveClick()}
            disabled={
              savingAvailability ||
              (availDialogTab === "default" &&
                (!availDays.length || vehDefaultRanges.some((r) => r.endMinutes <= r.startMinutes))) ||
              (availDialogTab === "calendar" && !calendarSelectedDate)
            }
            className="flex min-h-[40px] min-w-[78px] cursor-pointer items-center justify-center rounded-[8px] bg-[#222222] px-[18px] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
          >
            {savingAvailability ? <LoadingDots /> : "Salva"}
          </button>
        </div>
      </div>
    );
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
            emptySlotNotificationEnabled={emptySlotNotificationEnabled}
            setEmptySlotNotificationEnabled={saveEmptySlotNotificationEnabled}
            emptySlotNotificationTarget={emptySlotNotificationTarget}
            setEmptySlotNotificationTarget={(v) => saveEmptySlotNotificationTarget(v as "all" | "availability_matching")}
            emptySlotNotificationTimes={emptySlotNotificationTimes}
            setEmptySlotNotificationTimes={saveEmptySlotNotificationTimes}
            lessonPolicyEnabled={lessonPolicyEnabled}
            setLessonPolicyEnabled={saveLessonPolicyEnabled}
            lessonRequiredTypesEnabled={lessonRequiredTypesEnabled}
            setLessonRequiredTypesEnabled={saveLessonRequiredTypesEnabled}
            lessonRequiredTypes={lessonRequiredTypes}
            toggleRequiredType={toggleRequiredType}
            lessonConstraints={lessonConstraints}
            toggleConstraintEnabled={toggleConstraintEnabled}
            toggleConstraintDay={toggleConstraintDay}
            updateConstraintWindow={updateConstraintWindow}
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
        {/* Header full-width: il logo si allinea alla sidebar ancorata a sinistra (Airbnb) */}
        <div className="flex h-full items-center justify-between px-4 lg:px-10">
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

      {/* Layout Airbnb: sidebar ancorata al bordo sinistro (divider full-height),
          contenuto centrato nello spazio rimanente — regge ogni larghezza schermo. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* ── Sidebar ── */}
          <div className="min-h-0 shrink-0 overflow-x-auto border-b border-[#ebebeb] px-4 py-3 lg:w-[400px] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-10 lg:py-12">
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
                            : "font-medium text-[#444444] hover:text-foreground",
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
          <div ref={contentScrollRef} className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[860px] px-6 py-8 lg:px-8 lg:py-12">
            {!(configTab === "instructors" && instructorsDetailOpen) &&
              !(configTab === "vehicles" && vehicleDetail !== null) && (
              <h2 className="mb-9 text-2xl font-bold tracking-[-0.3px] text-foreground">
                {CONFIG_PANE_TITLES[configTab]}
              </h2>
            )}
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
        <KeepAlivePane active={configTab === "instructors"} eager={mountAllPanes}>
          <InstructorsTab
            instructors={instructors}
            setInstructors={setInstructors}
            instructorWeeklyAvailability={instructorWeeklyAvailability}
            setInstructorWeeklyAvailability={setInstructorWeeklyAvailability}
            setInviteInstructorOpen={setInviteInstructorOpen}
            changeInstructorColor={changeInstructorColor}
            refreshAgenda={() => loadAvailability(date)}
            onDetailOpenChange={setInstructorsDetailOpen}
          />
        </KeepAlivePane>
        <KeepAlivePane active={configTab === "bookings"} eager={mountAllPanes}>
          <BookingsTab
            availabilityWeeks={availabilityWeeks}
            setAvailabilityWeeks={saveAvailabilityWeeks}
            bookingMinStartDate={bookingMinStartDate}
            setBookingMinStartDate={saveBookingMinStartDate}
            appBookingActors={appBookingActors}
            setAppBookingActors={(v) => saveAppBookingActors(v as AppBookingActorsValue)}
            instructorBookingMode={instructorBookingMode}
            setInstructorBookingMode={(v) => saveInstructorBookingMode(v as InstructorBookingModeValue)}
            bookingSlotDurations={bookingSlotDurations}
            toggleBookingDuration={toggleBookingDuration}
            roundedHoursOnly={roundedHoursOnly}
            setRoundedHoursOnly={saveRoundedHoursOnly}
            nationalHolidaysEnabled={nationalHolidaysEnabled}
            setNationalHolidaysEnabled={saveNationalHolidaysEnabled}
            nationalHolidaysDisabled={nationalHolidaysDisabled}
            setNationalHolidaysDisabled={saveNationalHolidaysDisabled}
            bookingCutoffEnabled={bookingCutoffEnabled}
            setBookingCutoffEnabled={saveBookingCutoffEnabled}
            bookingCutoffTime={bookingCutoffTime}
            setBookingCutoffTime={saveBookingCutoffTime}
            weeklyBookingLimitEnabled={weeklyBookingLimitEnabled}
            setWeeklyBookingLimitEnabled={saveWeeklyBookingLimitEnabled}
            weeklyBookingLimit={weeklyBookingLimit}
            setWeeklyBookingLimit={saveWeeklyBookingLimit}
            examPriorityEnabled={examPriorityEnabled}
            setExamPriorityEnabled={saveExamPriorityEnabled}
            examPriorityDaysBeforeExam={examPriorityDaysBeforeExam}
            setExamPriorityDaysBeforeExam={saveExamPriorityDaysBeforeExam}
            examPriorityBlockNonExam={examPriorityBlockNonExam}
            setExamPriorityBlockNonExam={saveExamPriorityBlockNonExam}
            examPriorityPausedUntil={examPriorityPausedUntil}
            setExamPriorityPausedUntil={saveExamPriorityPausedUntil}
            restrictedTimeRangeEnabled={restrictedTimeRangeEnabled}
            setRestrictedTimeRangeEnabled={saveRestrictedTimeRangeEnabled}
            restrictedTimeRangeStart={restrictedTimeRangeStart}
            setRestrictedTimeRangeStart={saveRestrictedTimeRangeStart}
            restrictedTimeRangeEnd={restrictedTimeRangeEnd}
            setRestrictedTimeRangeEnd={saveRestrictedTimeRangeEnd}
            swapEnabled={swapEnabled}
            setSwapEnabled={saveSwapEnabled}
            swapNotifyMode={swapNotifyMode}
            setSwapNotifyMode={(v) => saveSwapNotifyMode(v as "all" | "available_only")}
            studentCancellationEnabled={studentCancellationEnabled}
            setStudentCancellationEnabled={saveStudentCancellationEnabled}
            autoCheckinEnabled={autoCheckinEnabled}
            setAutoCheckinEnabled={saveAutoCheckinEnabled}
            studentNotesEnabled={studentNotesEnabled}
            setStudentNotesEnabled={saveStudentNotesEnabled}
            groupLessonsEnabled={groupLessonsEnabled}
            setGroupLessonsEnabled={saveGroupLessonsEnabled}
            instructorPreferenceEnabled={instructorPreferenceEnabled}
            setInstructorPreferenceEnabled={saveInstructorPreferenceEnabled}
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
            detailView={vehicleDetail}
            openDetail={openVehicleDetail}
            closeDetail={closeVehicleDetail}
            setDetailTab={setVehicleDetailTab}
            detailsForm={renderVehicleDetailsForm()}
            availabilityEditor={renderVehicleAvailabilityEditor()}
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


        {/* ── Aggiungi istruttore: crea direttamente l'account (niente invito) */}
        <AdminUsersCreateDialog
          open={inviteInstructorOpen}
          onOpenChange={setInviteInstructorOpen}
          fixedAutoscuolaRole="INSTRUCTOR"
          title="Aggiungi istruttore"
          description="Crea l'account dell'istruttore: potrà accedere subito con email e password."
          onCreated={() => void loadResources()}
        />

        {/* ── Nuovo veicolo: modale stile proto (veicoloModalOpen, come LocationFormDialog) */}
        <Dialog open={createVehicleOpen} onOpenChange={setCreateVehicleOpen}>
          <DialogContent className="max-w-[480px] gap-0 rounded-[20px] p-7 pb-6">
            <div className="mb-[22px] flex flex-col items-center px-2 text-center">
              <Image
                src="/images/settings/veicolo-nuovo.png"
                alt=""
                width={118}
                height={118}
                className="mb-1.5 block size-[118px] select-none object-contain"
              />
              <DialogTitle className="text-[19px] font-bold tracking-[-0.2px] text-foreground">
                Nuovo veicolo
              </DialogTitle>
              <div className="mt-[3px] text-[12.5px] font-medium leading-[1.4] text-[#929292]">
                Aggiungi un veicolo alla flotta della tua autoscuola.
              </div>
            </div>
            <div className="mb-2 text-[13px] font-semibold text-foreground">Nome veicolo</div>
            <input
              placeholder="Es. Polo, T-cross…"
              value={newVehicleName}
              autoFocus
              onChange={(e) => setNewVehicleName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateVehicle()}
              className="w-full rounded-[12px] border-[1.5px] border-[#ededed] bg-[#f7f8fa] px-[15px] py-[13px] text-[15px] font-medium text-foreground outline-none transition-colors placeholder:text-[#c1c1c1] focus:border-[#222222] focus:bg-white"
            />
            <div className="mb-2 mt-4 text-[13px] font-semibold text-foreground">Targa (opzionale)</div>
            <input
              placeholder="Es. AB123CD"
              value={newVehiclePlate}
              onChange={(e) => setNewVehiclePlate(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleCreateVehicle()}
              className="w-full rounded-[12px] border-[1.5px] border-[#ededed] bg-[#f7f8fa] px-[15px] py-[13px] text-[15px] font-medium text-foreground outline-none transition-colors placeholder:text-[#c1c1c1] focus:border-[#222222] focus:bg-white"
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="mb-2 text-[13px] font-semibold text-foreground">Categoria</div>
                <Select value={newVehicleCategory} onValueChange={setNewVehicleCategory}>
                  <SelectTrigger className={PROTO_SELECT_TRIGGER}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LICENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{LICENSE_CATEGORY_LABELS[cat]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="mb-2 text-[13px] font-semibold text-foreground">Cambio</div>
                <Select value={newVehicleTransmission} onValueChange={setNewVehicleTransmission}>
                  <SelectTrigger className={PROTO_SELECT_TRIGGER}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSMISSIONS.map((t) => (
                      <SelectItem key={t} value={t}>{TRANSMISSION_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-[26px] flex items-center justify-end gap-3.5">
              <button
                type="button"
                onClick={() => setCreateVehicleOpen(false)}
                disabled={creatingVehicle}
                className="cursor-pointer select-none px-2 py-[11px] text-sm font-semibold text-foreground transition-colors hover:text-[#555555]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleCreateVehicle}
                disabled={creatingVehicle || !newVehicleName.trim()}
                className={cn(
                  "flex min-w-[150px] select-none items-center justify-center gap-[7px] rounded-[50px] px-[26px] py-3 text-sm font-semibold text-white transition-colors",
                  newVehicleName.trim() && !creatingVehicle
                    ? "cursor-pointer bg-[#1a1a2e] hover:bg-[#2d2d4a]"
                    : "cursor-not-allowed bg-[#c4c4d4]",
                )}
              >
                {creatingVehicle ? <LoadingDots /> : "Aggiungi veicolo"}
              </button>
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
