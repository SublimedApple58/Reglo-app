"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CalendarCheck, CalendarDays, ClipboardList, Check, Plus, Pencil, Clock, Car, ChevronDown, ChevronLeft, ChevronRight, FileText, Loader2, Send, Settings2, Users, Truck, UserRoundCog } from "lucide-react";

import { PageWrapper } from "@/components/Layout/PageWrapper";
import { DatePicker, DatePickerInput } from "@/components/ui/date-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "@/components/ui/section-card";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { FieldGroup } from "@/components/ui/field-group";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { ResourceCard, SlotPill, ResourceCardAction } from "@/components/ui/resource-card";
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
import { AdminUsersInviteDialog } from "@/components/pages/AdminUsers/AdminUsersInviteDialog";
import {
  getAvailabilitySlots,
  setWeeklyAvailabilityOverride,
  setRecurringAvailabilityOverride,
  deleteWeeklyAvailabilityOverride,
  getWeeklyAvailabilityOverrides,
} from "@/lib/actions/autoscuole-availability.actions";

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
import { LottieLoadingOverlay } from "@/components/ui/lottie-loading-overlay";
import { SettingsSkeleton } from "@/components/ui/page-skeleton";

type ResourceOption = { id: string; name: string };
type InstructorDetail = { id: string; name: string; status: string; autonomousMode?: boolean; settings?: unknown; _count?: { assignedStudents: number } };
type VehicleDetail = { id: string; name: string; plate: string | null; status: string };
type VehicleWeeklyAvailability = { daysOfWeek: number[]; startMinutes: number; endMinutes: number; ranges?: Array<{ startMinutes: number; endMinutes: number }> };
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
const BOOKING_DURATION_OPTIONS = [30, 60, 90, 120] as const;
const APP_BOOKING_ACTOR_OPTIONS = [
  { value: "students", label: "Solo allievi" },
  { value: "instructors", label: "Solo istruttori" },
  { value: "both", label: "Entrambi" },
] as const;
const INSTRUCTOR_BOOKING_MODE_OPTIONS = [
  { value: "manual_full", label: "Manuale totale" },
  { value: "manual_engine", label: "Manuale + motore annullamenti" },
  { value: "guided_proposal", label: "Guidata con proposta" },
] as const;
const STUDENT_BOOKING_MODE_OPTIONS = [
  { value: "engine", label: "Motore (proposta automatica)" },
  { value: "free_choice", label: "Scelta libera" },
] as const;
const CHANNEL_OPTIONS = [
  { value: "push", label: "Push" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
] as const;
type ChannelValue = (typeof CHANNEL_OPTIONS)[number]["value"];
type AppBookingActorsValue = (typeof APP_BOOKING_ACTOR_OPTIONS)[number]["value"];
type InstructorBookingModeValue = (typeof INSTRUCTOR_BOOKING_MODE_OPTIONS)[number]["value"];
type StudentBookingModeValue = (typeof STUDENT_BOOKING_MODE_OPTIONS)[number]["value"];

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

const START_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => index * 30);
const END_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => (index + 1) * 30);

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

export function AutoscuoleResourcesPage({
  tabs,
}: {
  tabs?: React.ReactNode;
} = {}) {
  const toast = useFeedbackToast();
  const [configTab, setConfigTab] = React.useState<"settings" | "instructors" | "vehicles" | "students">("settings");
  const [expandedSection, setExpandedSection] = React.useState<string | null>("bookings");
  const [date] = React.useState(() => formatDateLocal(new Date()));
  const [loading, setLoading] = React.useState(false);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [availabilityWeeks, setAvailabilityWeeks] = React.useState("4");
  const [studentReminderMinutes, setStudentReminderMinutes] = React.useState("60");
  const [instructorReminderMinutes, setInstructorReminderMinutes] = React.useState("60");
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
  const [swapEnabled, setSwapEnabled] = React.useState(false);
  const [swapNotifyMode, setSwapNotifyMode] = React.useState<"all" | "available_only">("available_only");
  const [bookingCutoffEnabled, setBookingCutoffEnabled] = React.useState(false);
  const [bookingCutoffTime, setBookingCutoffTime] = React.useState<string>("18:00");
  const [weeklyBookingLimitEnabled, setWeeklyBookingLimitEnabled] = React.useState(false);
  const [weeklyBookingLimit, setWeeklyBookingLimit] = React.useState(3);
  const [examPriorityEnabled, setExamPriorityEnabled] = React.useState(false);
  const [examPriorityLimit, setExamPriorityLimit] = React.useState(5);
  const [emptySlotNotificationEnabled, setEmptySlotNotificationEnabled] = React.useState(false);
  const [emptySlotNotificationTarget, setEmptySlotNotificationTarget] = React.useState<"all" | "availability_matching">("availability_matching");
  const [emptySlotNotificationTimes, setEmptySlotNotificationTimes] = React.useState<string[]>(["18:00"]);
  const [triggeringNotification, setTriggeringNotification] = React.useState(false);
  const [instructorPreferenceEnabled, setInstructorPreferenceEnabled] = React.useState(false);
  const [studentNotesEnabled, setStudentNotesEnabled] = React.useState(false);
  const [bookingMinStartDate, setBookingMinStartDate] = React.useState<string>("");

  // ── Instructor cluster panel state
  const [clusterInstructor, setClusterInstructor] = React.useState<InstructorDetail | null>(null);
  const [clusterAutonomous, setClusterAutonomous] = React.useState(false);
  const [clusterDurations, setClusterDurations] = React.useState<number[]>([30, 60]);
  const [clusterRoundedHours, setClusterRoundedHours] = React.useState(false);
  const [clusterStudentIds, setClusterStudentIds] = React.useState<string[]>([]);
  const [clusterSaving, setClusterSaving] = React.useState(false);
  const [clusterStudentSearch, setClusterStudentSearch] = React.useState("");
  const [allStudents, setAllStudents] = React.useState<Array<{ id: string; firstName: string; lastName: string; assignedInstructorId: string | null }>>([]);
  const [appBookingActors, setAppBookingActors] = React.useState<AppBookingActorsValue>("students");
  const [instructorBookingMode, setInstructorBookingMode] = React.useState<InstructorBookingModeValue>("manual_engine");
  const [studentBookingMode, setStudentBookingMode] = React.useState<StudentBookingModeValue>("engine");
  const [instructors, setInstructors] = React.useState<InstructorDetail[]>([]);
  const [instructorWeeklyAvailability, setInstructorWeeklyAvailability] = React.useState<
    Record<string, VehicleWeeklyAvailability>
  >({});
  const [vehicles, setVehicles] = React.useState<VehicleDetail[]>([]);
  const [vehicleWeeklyAvailability, setVehicleWeeklyAvailability] = React.useState<
    Record<string, VehicleWeeklyAvailability>
  >({});

  // ── Shared availability dialog state
  const [availDialogTab, setAvailDialogTab] = React.useState<"default" | "calendar">("default");
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
  const [creatingVehicle, setCreatingVehicle] = React.useState(false);

  // ── Edit vehicle dialog
  const [editVehicle, setEditVehicle] = React.useState<VehicleDetail | null>(null);
  const [editVehicleName, setEditVehicleName] = React.useState("");
  const [editVehiclePlate, setEditVehiclePlate] = React.useState("");
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
        instructorRes.data.map((item) => ({ id: item.id, name: item.name, status: item.status })),
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
    },
    [toast],
  );

  React.useEffect(() => {
    loadResources();
  }, [loadResources]);

  React.useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      const res = await getAutoscuolaSettings();
      if (!active) return;
      if (!res.success || !res.data) {
        toast.error({
          description: res.message ?? "Impossibile caricare le impostazioni autoscuola.",
        });
        return;
      }
      setAvailabilityWeeks(String(res.data.availabilityWeeks));
      setBookingMinStartDate(res.data.bookingMinStartDate ?? "");
      setStudentReminderMinutes(String(res.data.studentReminderMinutes));
      setInstructorReminderMinutes(String(res.data.instructorReminderMinutes));
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
      setSwapEnabled(res.data.swapEnabled ?? false);
      setSwapNotifyMode(res.data.swapNotifyMode ?? "available_only");
      setBookingCutoffEnabled(res.data.bookingCutoffEnabled ?? false);
      setBookingCutoffTime(res.data.bookingCutoffTime ?? "18:00");
      setWeeklyBookingLimitEnabled(res.data.weeklyBookingLimitEnabled ?? false);
      setWeeklyBookingLimit(res.data.weeklyBookingLimit ?? 3);
      setExamPriorityEnabled(res.data.examPriorityEnabled ?? false);
      setExamPriorityLimit(res.data.examPriorityLimit ?? 5);
      setEmptySlotNotificationEnabled(res.data.emptySlotNotificationEnabled ?? false);
      setEmptySlotNotificationTarget(res.data.emptySlotNotificationTarget ?? "availability_matching");
      setEmptySlotNotificationTimes(res.data.emptySlotNotificationTimes ?? ["18:00"]);
      setInstructorPreferenceEnabled(res.data.instructorPreferenceEnabled ?? false);
      setStudentNotesEnabled(res.data.studentNotesEnabled ?? false);

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
      setStudentBookingMode(
        STUDENT_BOOKING_MODE_OPTIONS.some(
          (option) => option.value === res.data.studentBookingMode,
        )
          ? (res.data.studentBookingMode as StudentBookingModeValue)
          : "engine",
      );
    };
    loadSettings();
    return () => {
      active = false;
    };
  }, [toast]);

  React.useEffect(() => {
    loadAvailability(date);
  }, [date, loadAvailability]);

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
      swapEnabled,
      swapNotifyMode,
      bookingCutoffEnabled,
      bookingCutoffTime: bookingCutoffTime as "12:00" | "14:00" | "16:00" | "18:00" | "20:00" | "22:00",
      weeklyBookingLimitEnabled,
      weeklyBookingLimit,
      examPriorityEnabled,
      examPriorityLimit,
      emptySlotNotificationEnabled,
      emptySlotNotificationTarget,
      emptySlotNotificationTimes: emptySlotNotificationTimes as ("08:00" | "08:30" | "09:00" | "09:30" | "10:00" | "10:30" | "11:00" | "11:30" | "12:00" | "12:30" | "13:00" | "13:30" | "14:00" | "14:30" | "15:00" | "15:30" | "16:00" | "16:30" | "17:00" | "17:30" | "18:00" | "18:30" | "19:00" | "19:30" | "20:00" | "20:30" | "21:00" | "21:30" | "22:00")[],
      instructorPreferenceEnabled,
      studentNotesEnabled,
      appBookingActors,
      instructorBookingMode,
      studentBookingMode,
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
    setInstructorReminderMinutes(String(res.data.instructorReminderMinutes));
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
    setSwapEnabled(res.data.swapEnabled ?? false);
    setSwapNotifyMode(res.data.swapNotifyMode ?? "available_only");
    setBookingCutoffEnabled(res.data.bookingCutoffEnabled ?? false);
    setBookingCutoffTime(res.data.bookingCutoffTime ?? "18:00");
    setWeeklyBookingLimitEnabled(res.data.weeklyBookingLimitEnabled ?? false);
    setWeeklyBookingLimit(res.data.weeklyBookingLimit ?? 3);
    setInstructorPreferenceEnabled(res.data.instructorPreferenceEnabled ?? false);
    setStudentNotesEnabled(res.data.studentNotesEnabled ?? false);
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
    setStudentBookingMode(
      STUDENT_BOOKING_MODE_OPTIONS.some(
        (option) => option.value === res.data.studentBookingMode,
      )
        ? (res.data.studentBookingMode as StudentBookingModeValue)
        : "engine",
    );
    toast.success({ description: "Impostazioni autoscuola aggiornate." });
  };

  const toggleChannel = (
    channel: ChannelValue,
    setter: React.Dispatch<React.SetStateAction<ChannelValue[]>>,
  ) => {
    setter((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    );
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

  const openInstructorAvailabilityDialog = (instructor: InstructorDetail) => {
    const current = instructorWeeklyAvailability[instructor.id];
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
    getWeeklyAvailabilityOverrides({
      ownerType: "instructor",
      ownerId: instructor.id,
    }).then((res) => {
      if (res.success && res.data) {
        // Group daily overrides by ISO week start (Monday)
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

  const toggleInstrDay = (day: number) => {
    setInstrDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
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
        ? (settings.bookingSlotDurations as number[]).filter((d) => [30, 60, 90, 120].includes(d))
        : [30, 60],
    );
    setClusterRoundedHours(settings.roundedHoursOnly === true);
    const studRes = await getAutoscuolaStudentsWithProgress();
    if (studRes.success && studRes.data) {
      setAllStudents(studRes.data.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        assignedInstructorId: (s as Record<string, unknown>).assignedInstructorId as string | null,
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
      settings: clusterAutonomous ? { bookingSlotDurations: clusterDurations, roundedHoursOnly: clusterRoundedHours } : undefined,
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
    });
    setCreatingVehicle(false);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile creare il veicolo." });
      return;
    }
    setVehicles((prev) => [
      ...prev,
      { id: res.data!.id, name: res.data!.name, plate: res.data!.plate ?? null, status: res.data!.status },
    ]);
    setCreateVehicleOpen(false);
    toast.success({ description: `Veicolo "${res.data.name}" aggiunto.` });
  };

  const openEditVehicle = (vehicle: VehicleDetail) => {
    setEditVehicle(vehicle);
    setEditVehicleName(vehicle.name);
    setEditVehiclePlate(vehicle.plate ?? "");
  };

  const handleSaveEditVehicle = async () => {
    if (!editVehicle) return;
    const name = editVehicleName.trim();
    if (!name) {
      toast.error({ description: "Inserisci il nome del veicolo." });
      return;
    }
    setSavingEditVehicle(true);
    const res = await updateAutoscuolaVehicle({
      vehicleId: editVehicle.id,
      name,
      plate: editVehiclePlate.trim() || null,
    });
    setSavingEditVehicle(false);
    if (!res.success || !res.data) {
      toast.error({ description: res.message ?? "Impossibile aggiornare il veicolo." });
      return;
    }
    setVehicles((prev) =>
      prev.map((v) =>
        v.id === editVehicle.id
          ? { ...v, name: res.data!.name, plate: res.data!.plate ?? null, status: res.data!.status }
          : v,
      ),
    );
    setEditVehicle(null);
    toast.success({ description: "Veicolo aggiornato." });
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
        v.id === editVehicle.id ? { ...v, status: "inactive" } : v,
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

  return (
    <PageWrapper
      title="Configurazione"
      subTitle="Gestisci prenotazioni, notifiche e risorse"
    >
      <div className="relative w-full space-y-5">
        <LottieLoadingOverlay visible={loading} />
        {tabs}

        {/* Sub-tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-border bg-white p-1.5 shadow-card">
          {([
            { key: "settings" as const, label: "Impostazioni", icon: Settings2 },
            { key: "instructors" as const, label: "Istruttori", icon: Users },
            { key: "vehicles" as const, label: "Veicoli", icon: Truck },
            { key: "students" as const, label: "Gestione allievi", icon: UserRoundCog },
          ]).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setConfigTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                configTab === tab.key
                  ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                  : "text-muted-foreground hover:text-foreground hover:bg-gray-50",
              )}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <SettingsSkeleton />
        ) : configTab === "settings" ? (
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
                      setAppBookingActors(value as AppBookingActorsValue)
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
                        setInstructorBookingMode(value as InstructorBookingModeValue)
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

                {appBookingActors !== "instructors" ? (
                  <FieldGroup label="Modalità allievo">
                    <Select
                      value={studentBookingMode}
                      onValueChange={(value) =>
                        setStudentBookingMode(value as StudentBookingModeValue)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona modalità" />
                      </SelectTrigger>
                      <SelectContent>
                        {STUDENT_BOOKING_MODE_OPTIONS.map((option) => (
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
        ) : configTab === "instructors" ? (
          <>
        <div className="flex items-center justify-between">
          <div />
          <Button
            size="sm"
            onClick={() => setInviteInstructorOpen(true)}
          >
            <Plus className="size-3.5 mr-1.5" />
            Invita istruttore
          </Button>
        </div>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            {instructors.map((instructor) => {
              const wa = instructorWeeklyAvailability[instructor.id] ?? null;
              const ranges = instructorAvailability[instructor.id] ?? [];
              const totalMinutes = ranges.reduce((sum, r) => sum + diffMinutes(r.end, r.start), 0);
              return (
                <ResourceCard
                  key={instructor.id}
                  name={instructor.name}
                  inactive={instructor.status === "inactive"}
                  subtitle={
                    instructor.autonomousMode
                      ? `Autonomo · ${instructor._count?.assignedStudents ?? 0} allievi`
                      : undefined
                  }
                  actions={
                    <>
                      <ResourceCardAction
                        onClick={() => openClusterPanel(instructor)}
                        title="Gestione autonoma"
                      >
                        <Settings2 className="size-3.5" />
                      </ResourceCardAction>
                      <ResourceCardAction
                        onClick={() => openInstructorAvailabilityDialog(instructor)}
                        title="Modifica disponibilità"
                      >
                        <Clock className="size-3.5" />
                      </ResourceCardAction>
                    </>
                  }
                  availabilitySummary={
                    wa ? (
                      <span>
                        {formatMinutes(wa.startMinutes)}–{formatMinutes(wa.endMinutes)} ·{" "}
                        {wa.daysOfWeek
                          .map((d) => WEEKDAY_OPTIONS.find((w) => w.value === d)?.label ?? "")
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    ) : (
                      <span className="italic opacity-60">Nessuna disponibilità settimanale</span>
                    )
                  }
                  slots={
                    ranges.length > 0
                      ? ranges.map((range) => (
                          <SlotPill key={`${range.start.toISOString()}-${range.end.toISOString()}`}>
                            {formatTime(range.start)}–{formatTime(range.end)}
                          </SlotPill>
                        ))
                      : undefined
                  }
                  totalLabel={totalMinutes > 0 ? `${Math.round(totalMinutes)} min` : undefined}
                />
              );
            })}
            {!instructors.length ? (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-gray-50/50 p-6 text-sm text-muted-foreground">
                Nessun istruttore disponibile.
              </div>
            ) : null}
          </div>

          {/* ── Cluster panel dialog ── */}
          <Dialog open={Boolean(clusterInstructor)} onOpenChange={(open) => !open && setClusterInstructor(null)}>
            <DialogContent className="sm:max-w-[520px] gap-0 p-0 overflow-hidden max-h-[80vh] overflow-y-auto">
              <div className="px-6 pt-5 pb-4 border-b border-border">
                <DialogHeader>
                  <DialogTitle>Gestione autonoma — {clusterInstructor?.name}</DialogTitle>
                </DialogHeader>
              </div>
              <div className="px-6 py-5 space-y-5">
                <div
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                  onClick={() => setClusterAutonomous((prev) => !prev)}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Modalità autonoma</span>
                    <span className="text-xs text-muted-foreground">
                      L&apos;istruttore gestisce i propri allievi e impostazioni.
                    </span>
                  </div>
                  <InlineToggle checked={clusterAutonomous} size="sm" />
                </div>

                {clusterAutonomous ? (
                  <>
                    <FieldGroup label="Durata guide">
                      <div className="flex flex-wrap gap-1.5">
                        {BOOKING_DURATION_OPTIONS.map((dur) => (
                          <ToggleChip
                            key={dur}
                            active={clusterDurations.includes(dur)}
                            onClick={() =>
                              setClusterDurations((prev) =>
                                prev.includes(dur) ? prev.filter((d) => d !== dur) : [...prev, dur].sort((a, b) => a - b),
                              )
                            }
                            size="sm"
                          >
                            {dur} min
                          </ToggleChip>
                        ))}
                      </div>
                    </FieldGroup>

                    <div
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                      onClick={() => setClusterRoundedHours((prev) => !prev)}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">Solo orari tondi</span>
                        <span className="text-xs text-muted-foreground">
                          Proponi solo slot che iniziano a ore piene.
                        </span>
                      </div>
                      <InlineToggle checked={clusterRoundedHours} size="sm" />
                    </div>

                    <FieldGroup label={`Allievi assegnati (${clusterStudentIds.length})`}>
                      <Input
                        placeholder="Cerca allievo..."
                        value={clusterStudentSearch}
                        onChange={(e) => setClusterStudentSearch(e.target.value)}
                        className="mb-2"
                      />
                      <div className="space-y-0.5 max-h-[280px] overflow-y-auto rounded-xl border border-border/60 bg-gray-50/30">
                        {(() => {
                          const q = clusterStudentSearch.toLowerCase().trim();
                          const filtered = q
                            ? allStudents.filter((s) =>
                                `${s.firstName} ${s.lastName}`.toLowerCase().includes(q),
                              )
                            : allStudents;
                          // Sort: assigned first, then alphabetically
                          const sorted = [...filtered].sort((a, b) => {
                            const aAssigned = clusterStudentIds.includes(a.id) ? 0 : 1;
                            const bAssigned = clusterStudentIds.includes(b.id) ? 0 : 1;
                            if (aAssigned !== bAssigned) return aAssigned - bAssigned;
                            return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
                          });
                          if (!sorted.length) {
                            return (
                              <div className="px-3 py-4 text-center text-xs text-muted-foreground italic">
                                {q ? "Nessun risultato." : "Nessun allievo trovato."}
                              </div>
                            );
                          }
                          return sorted.map((student) => {
                            const isAssignedHere = clusterStudentIds.includes(student.id);
                            const assignedToOther =
                              !isAssignedHere &&
                              student.assignedInstructorId &&
                              student.assignedInstructorId !== clusterInstructor?.id;
                            const otherInstructorName = assignedToOther
                              ? instructors.find((i) => i.id === student.assignedInstructorId)?.name
                              : null;
                            return (
                              <div
                                key={student.id}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                                  isAssignedHere
                                    ? "bg-yellow-50/80"
                                    : "hover:bg-white",
                                )}
                                onClick={() => {
                                  setClusterStudentIds((prev) =>
                                    prev.includes(student.id)
                                      ? prev.filter((id) => id !== student.id)
                                      : [...prev, student.id],
                                  );
                                }}
                              >
                                <Checkbox checked={isAssignedHere} className="pointer-events-none" />
                                <span className="text-sm flex-1 truncate">
                                  {student.firstName} {student.lastName}
                                </span>
                                {assignedToOther ? (
                                  <span className="text-[10px] shrink-0 bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                                    {otherInstructorName ?? "altro"}
                                  </span>
                                ) : null}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </FieldGroup>
                  </>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
                <Button variant="outline" onClick={() => setClusterInstructor(null)}>
                  Annulla
                </Button>
                <Button onClick={saveClusterSettings} disabled={clusterSaving}>
                  {clusterSaving ? "Salvataggio..." : "Salva"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </>
        ) : configTab === "students" ? (
          <>
          {/* ── Gestione allievi tab ── */}
          <div className="rounded-2xl border border-border bg-white shadow-card">
            <AccordionSection
              icon={Clock}
              title="Limite prenotazione"
              description="Imposta un orario limite il giorno prima entro cui gli allievi possono prenotare."
              expanded={expandedSection === "bookingCutoff"}
              onToggle={() => toggleSection("bookingCutoff")}
              isFirst
            >
              <div className="space-y-5 max-w-2xl">
                <div
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                  onClick={() => setBookingCutoffEnabled((prev) => !prev)}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Attiva limite prenotazione giorno prima</span>
                    <span className="text-xs text-muted-foreground">
                      Gli allievi non potranno prenotare guide dopo l&apos;orario limite del giorno precedente. Le prenotazioni per il giorno stesso saranno bloccate.
                    </span>
                  </div>
                  <InlineToggle checked={bookingCutoffEnabled} size="sm" />
                </div>

                {bookingCutoffEnabled ? (
                  <FieldGroup label="Orario limite">
                    <Select value={bookingCutoffTime} onValueChange={setBookingCutoffTime}>
                      <SelectTrigger>
                        <SelectValue placeholder="Orario" />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          "12:00", "12:30", "13:00", "13:30",
                          "14:00", "14:30", "15:00", "15:30",
                          "16:00", "16:30", "17:00", "17:30",
                          "18:00", "18:30", "19:00", "19:30",
                          "20:00", "20:30", "21:00", "21:30",
                          "22:00",
                        ].map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                ) : null}
              </div>
            </AccordionSection>
            <AccordionSection
              icon={CalendarCheck}
              title="Limite guide settimanali"
              description="Limita il numero massimo di guide prenotabili da un allievo per settimana."
              expanded={expandedSection === "weeklyLimit"}
              onToggle={() => toggleSection("weeklyLimit")}
            >
              <div className="space-y-5 max-w-2xl">
                <div
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                  onClick={() => setWeeklyBookingLimitEnabled((prev) => !prev)}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Attiva limite settimanale</span>
                    <span className="text-xs text-muted-foreground">
                      Gli allievi non potranno prenotare pi&ugrave; di un certo numero di guide a settimana (lun-dom). Titolare e istruttori possono scavalcare il limite con conferma.
                    </span>
                  </div>
                  <InlineToggle checked={weeklyBookingLimitEnabled} size="sm" />
                </div>

                {weeklyBookingLimitEnabled ? (
                  <>
                    <FieldGroup label="Guide massime per settimana">
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={weeklyBookingLimit}
                        onChange={(e) => setWeeklyBookingLimit(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                        className="w-24"
                      />
                    </FieldGroup>

                    <div
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                      onClick={() => setExamPriorityEnabled((prev) => !prev)}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">Priorit&agrave; esame</span>
                        <span className="text-xs text-muted-foreground">
                          Gli allievi con un esame di guida entro 2 settimane possono prenotare pi&ugrave; guide.
                        </span>
                      </div>
                      <InlineToggle checked={examPriorityEnabled} size="sm" />
                    </div>

                    {examPriorityEnabled ? (
                      <FieldGroup label="Guide massime per settimana (priorit&agrave; esame)">
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={examPriorityLimit}
                          onChange={(e) => setExamPriorityLimit(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                          className="w-24"
                        />
                      </FieldGroup>
                    ) : null}
                  </>
                ) : null}
              </div>
            </AccordionSection>
            <AccordionSection
              icon={UserRoundCog}
              title="Sostituiscimi"
              description="Consenti agli allievi di proporre scambi guide tra loro."
              expanded={expandedSection === "swap"}
              onToggle={() => toggleSection("swap")}
            >
              <div className="space-y-5 max-w-2xl">
                <div
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                  onClick={() => setSwapEnabled((prev) => !prev)}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Consenti scambi tra allievi</span>
                    <span className="text-xs text-muted-foreground">
                      Gli allievi potranno proporre ad altri di prendere il loro posto in una guida futura.
                    </span>
                  </div>
                  <InlineToggle checked={swapEnabled} size="sm" />
                </div>

                {swapEnabled ? (
                  <FieldGroup label="Modalità notifica">
                    <Select value={swapNotifyMode} onValueChange={(value) => setSwapNotifyMode(value as "all" | "available_only")}>
                      <SelectTrigger>
                        <SelectValue placeholder="Modalità" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available_only">Solo allievi disponibili nello slot</SelectItem>
                        <SelectItem value="all">Tutti gli allievi</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                ) : null}
              </div>
            </AccordionSection>
            <AccordionSection
              icon={FileText}
              title="Note allievi"
              description="Consenti agli allievi di vedere le note delle guide dall'app."
              expanded={expandedSection === "studentNotes"}
              onToggle={() => toggleSection("studentNotes")}
            >
              <div className="space-y-5 max-w-2xl">
                <div
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                  onClick={() => setStudentNotesEnabled((prev) => !prev)}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Mostra note nell&apos;app allievi</span>
                    <span className="text-xs text-muted-foreground">
                      Gli allievi potranno consultare le note rilasciate dagli istruttori dopo ogni guida, direttamente dalla loro app.
                    </span>
                  </div>
                  <InlineToggle checked={studentNotesEnabled} size="sm" />
                </div>
              </div>
            </AccordionSection>
            <AccordionSection
              icon={Bell}
              title="Notifica slot vuoti"
              description="Notifica automaticamente gli allievi quando ci sono guide disponibili per il giorno dopo."
              expanded={expandedSection === "emptySlotNotification"}
              onToggle={() => toggleSection("emptySlotNotification")}
            >
              <div className="space-y-5 max-w-2xl">
                <div
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                  onClick={() => setEmptySlotNotificationEnabled((prev) => !prev)}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Notifica slot disponibili domani</span>
                    <span className="text-xs text-muted-foreground">
                      Ogni sera gli allievi riceveranno una notifica push se ci sono guide libere per il giorno dopo.
                    </span>
                  </div>
                  <InlineToggle checked={emptySlotNotificationEnabled} size="sm" />
                </div>

                {emptySlotNotificationEnabled ? (
                  <>
                    <FieldGroup label="Destinatari">
                      <Select value={emptySlotNotificationTarget} onValueChange={(value) => setEmptySlotNotificationTarget(value as "all" | "availability_matching")}>
                        <SelectTrigger>
                          <SelectValue placeholder="Destinatari" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="availability_matching">Solo allievi con disponibilità corrispondente</SelectItem>
                          <SelectItem value="all">Tutti gli allievi</SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldGroup>

                    <FieldGroup label="Orari di invio">
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          "08:00", "08:30", "09:00", "09:30",
                          "10:00", "10:30", "11:00", "11:30",
                          "12:00", "12:30", "13:00", "13:30",
                          "14:00", "14:30", "15:00", "15:30",
                          "16:00", "16:30", "17:00", "17:30",
                          "18:00", "18:30", "19:00", "19:30",
                          "20:00", "20:30", "21:00", "21:30",
                          "22:00",
                        ] as const).map((time) => (
                          <ToggleChip
                            key={time}
                            active={emptySlotNotificationTimes.includes(time)}
                            onClick={() => {
                              setEmptySlotNotificationTimes((prev) => {
                                if (prev.includes(time)) {
                                  if (prev.length <= 1) return prev;
                                  return prev.filter((t) => t !== time);
                                }
                                return [...prev, time].sort();
                              });
                            }}
                          >
                            {time}
                          </ToggleChip>
                        ))}
                      </div>
                    </FieldGroup>

                    <div className="rounded-xl border border-border/60 bg-white/70 px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium">Invia ora per domani</span>
                        <span className="text-xs text-muted-foreground">
                          Invia subito la notifica di guide disponibili per domani a tutti gli allievi idonei.
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1 w-fit"
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
                        >
                          {triggeringNotification ? (
                            <Loader2 className="size-4 animate-spin mr-1.5" />
                          ) : (
                            <Send className="size-4 mr-1.5" />
                          )}
                          {triggeringNotification ? "Invio in corso…" : "Invia notifica"}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </AccordionSection>
            <AccordionSection
              icon={Users}
              title="Preferenza istruttore"
              description="Consenti agli allievi di scegliere l'istruttore quando prenotano una guida."
              expanded={expandedSection === "instructorPreference"}
              onToggle={() => toggleSection("instructorPreference")}
              isLast
            >
              <div className="space-y-5 max-w-2xl">
                <div
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                  onClick={() => setInstructorPreferenceEnabled((prev) => !prev)}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Consenti scelta istruttore</span>
                    <span className="text-xs text-muted-foreground">
                      Gli allievi potranno selezionare un istruttore specifico durante la prenotazione. Se non ne selezionano uno, vedranno le proposte di tutti gli istruttori.
                    </span>
                  </div>
                  <InlineToggle checked={instructorPreferenceEnabled} size="sm" />
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
        ) : (
          /* ── Veicoli tab ── */
          <VehiclesTabContent
            vehicles={vehicles}
            vehicleWeeklyAvailability={vehicleWeeklyAvailability}
            vehicleAvailability={vehicleAvailability}
            loading={loading}
            openCreateVehicle={openCreateVehicle}
            openEditVehicle={openEditVehicle}
            openAvailabilityDialog={openAvailabilityDialog}
          />
        )}

        {/* ── Instructor availability dialog */}
        <Dialog open={Boolean(availInstructor)} onOpenChange={(open) => !open && setAvailInstructor(null)}>
          <DialogContent className="sm:max-w-[480px] gap-0 p-0 overflow-hidden">
            <DialogTitle className="sr-only">Disponibilità — {availInstructor?.name}</DialogTitle>
            <div className="px-6 pt-5 pb-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">Disponibilità — {availInstructor?.name}</h3>
              {/* Tab switcher */}
              <div className="mt-3 flex items-center gap-1 rounded-xl bg-gray-100 p-1 max-w-[240px]">
                <button type="button" onClick={() => { setAvailDialogTab("default"); setInstrSelectedWeek(null); }} className={cn("flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", availDialogTab === "default" ? "bg-yellow-50 text-yellow-700 border border-yellow-200 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  Predefinito
                </button>
                <button type="button" onClick={() => setAvailDialogTab("calendar")} className={cn("flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", availDialogTab === "calendar" ? "bg-yellow-50 text-yellow-700 border border-yellow-200 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
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
                        <ToggleChip key={day.value} active={instrDays.includes(day.value)} onClick={() => toggleInstrDay(day.value)}>
                          {day.label}
                        </ToggleChip>
                      ))}
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Fasce orarie">
                    <div className="space-y-2">
                      {instrDefaultRanges.map((range, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Select value={String(range.startMinutes)} onValueChange={(v) => { const val = Number(v); setInstrDefaultRanges((prev) => prev.map((r, i) => i === idx ? { ...r, startMinutes: val } : r)); if (idx === 0) setInstrStartMinutes(val); }}>
                            <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{START_TIME_OPTIONS.map((m) => (<SelectItem key={`is-${idx}-${m}`} value={String(m)}>{formatMinutes(m)}</SelectItem>))}</SelectContent>
                          </Select>
                          <span className="text-xs text-muted-foreground">–</span>
                          <Select value={String(range.endMinutes)} onValueChange={(v) => { const val = Number(v); setInstrDefaultRanges((prev) => prev.map((r, i) => i === idx ? { ...r, endMinutes: val } : r)); if (idx === 0) setInstrEndMinutes(val); }}>
                            <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{END_TIME_OPTIONS.map((m) => (<SelectItem key={`ie-${idx}-${m}`} value={String(m)}>{formatMinutes(m)}</SelectItem>))}</SelectContent>
                          </Select>
                          {instrDefaultRanges.length > 1 && (
                            <button type="button" onClick={() => setInstrDefaultRanges((prev) => prev.filter((_, i) => i !== idx))} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors" aria-label="Rimuovi fascia">×</button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => setInstrDefaultRanges((prev) => [...prev, { startMinutes: 14 * 60, endMinutes: 18 * 60 }])} className="flex items-center gap-1 text-xs font-medium text-yellow-600 hover:text-yellow-700 transition-colors">
                        <Plus className="size-3" />
                        Aggiungi fascia
                      </button>
                    </div>
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
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                      onClick={() => setRecurringOverride((prev) => !prev)}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">Disponibilità ricorrente</span>
                        <span className="text-xs text-muted-foreground">
                          Applica a tutti i {WEEKDAY_OPTIONS.find((w) => w.value === new Date(calendarSelectedDate).getUTCDay())?.label ?? ""} futuri
                        </span>
                      </div>
                      <InlineToggle checked={recurringOverride} size="sm" />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              {availDialogTab === "default" ? (
                <button type="button" onClick={handleDeleteInstructorAvailability} disabled={savingInstrAvailability || !availInstructor || !instructorWeeklyAvailability[availInstructor?.id ?? ""]} className="text-xs text-red-500 hover:text-red-600 hover:underline disabled:opacity-40">
                  Rimuovi disponibilità
                </button>
              ) : (
                <button type="button" onClick={() => { if (calendarSelectedDate && availInstructor) { const weekStart = getWeekStart(new Date(calendarSelectedDate)).toISOString().slice(0, 10); handleResetInstrOverride(); } }} disabled={savingInstrAvailability || !calendarSelectedDate} className="text-xs text-yellow-600 hover:text-yellow-700 hover:underline disabled:opacity-40">
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
                    } else if (recurringOverride) {
                      // Recurring: apply to all future weeks for this day of week
                      setSavingInstrAvailability(true);
                      const res = await setRecurringAvailabilityOverride({
                        ownerType: "instructor",
                        ownerId: availInstructor.id,
                        dayOfWeek,
                        ranges: calendarDayRanges,
                      });
                      setSavingInstrAvailability(false);
                      if (!res.success) { toast.error({ description: res.message ?? "Errore salvataggio." }); return; }
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
          </DialogContent>
        </Dialog>

        {/* ── Invite instructor dialog */}
        <AdminUsersInviteDialog
          open={inviteInstructorOpen}
          onOpenChange={setInviteInstructorOpen}
          initialAutoscuolaRole="INSTRUCTOR"
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
              {editVehicle && (
                <div className="pt-1">
                  {editVehicle.status === "active" ? (
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
              <Button onClick={handleSaveEditVehicle} disabled={savingEditVehicle || !editVehicleName.trim()}>
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
                <button type="button" onClick={() => { setAvailDialogTab("default"); setVehSelectedWeek(null); }} className={cn("flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", availDialogTab === "default" ? "bg-yellow-50 text-yellow-700 border border-yellow-200 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  Predefinito
                </button>
                <button type="button" onClick={() => setAvailDialogTab("calendar")} className={cn("flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", availDialogTab === "calendar" ? "bg-yellow-50 text-yellow-700 border border-yellow-200 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
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
                    <div className="space-y-2">
                      {vehDefaultRanges.map((range, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Select value={String(range.startMinutes)} onValueChange={(v) => { const val = Number(v); setVehDefaultRanges((prev) => prev.map((r, i) => i === idx ? { ...r, startMinutes: val } : r)); if (idx === 0) setAvailStartMinutes(val); }}>
                            <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{START_TIME_OPTIONS.map((m) => (<SelectItem key={`vs-${idx}-${m}`} value={String(m)}>{formatMinutes(m)}</SelectItem>))}</SelectContent>
                          </Select>
                          <span className="text-xs text-muted-foreground">–</span>
                          <Select value={String(range.endMinutes)} onValueChange={(v) => { const val = Number(v); setVehDefaultRanges((prev) => prev.map((r, i) => i === idx ? { ...r, endMinutes: val } : r)); if (idx === 0) setAvailEndMinutes(val); }}>
                            <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{END_TIME_OPTIONS.map((m) => (<SelectItem key={`ve-${idx}-${m}`} value={String(m)}>{formatMinutes(m)}</SelectItem>))}</SelectContent>
                          </Select>
                          {vehDefaultRanges.length > 1 && (
                            <button type="button" onClick={() => setVehDefaultRanges((prev) => prev.filter((_, i) => i !== idx))} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors" aria-label="Rimuovi fascia">×</button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => setVehDefaultRanges((prev) => [...prev, { startMinutes: 14 * 60, endMinutes: 18 * 60 }])} className="flex items-center gap-1 text-xs font-medium text-yellow-600 hover:text-yellow-700 transition-colors">
                        <Plus className="size-3" />
                        Aggiungi fascia
                      </button>
                    </div>
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
                <button type="button" onClick={() => { if (calendarSelectedDate && availVehicle) handleResetVehOverride(); }} disabled={savingAvailability || !calendarSelectedDate} className="text-xs text-yellow-600 hover:text-yellow-700 hover:underline disabled:opacity-40">
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
      </div>
    </PageWrapper>
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

function VehiclesTabContent({
  vehicles,
  vehicleWeeklyAvailability,
  vehicleAvailability,
  loading,
  openCreateVehicle,
  openEditVehicle,
  openAvailabilityDialog,
}: {
  vehicles: VehicleDetail[];
  vehicleWeeklyAvailability: Record<string, VehicleWeeklyAvailability>;
  vehicleAvailability: Record<string, AvailabilityRange[]>;
  loading: boolean;
  openCreateVehicle: () => void;
  openEditVehicle: (vehicle: VehicleDetail) => void;
  openAvailabilityDialog: (vehicle: VehicleDetail) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div />
        <Button size="sm" onClick={openCreateVehicle}>
          <Plus className="size-3.5 mr-1.5" />
          Nuovo veicolo
        </Button>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        {vehicles.map((vehicle) => {
          const wa = vehicleWeeklyAvailability[vehicle.id] ?? null;
          const ranges = vehicleAvailability[vehicle.id] ?? [];
          const totalMinutes = ranges.reduce((sum, r) => sum + diffMinutes(r.end, r.start), 0);
          return (
            <ResourceCard
              key={vehicle.id}
              name={vehicle.name}
              subtitle={vehicle.plate ? (
                <span className="flex items-center gap-1">
                  <Car className="size-3" />
                  {vehicle.plate}
                </span>
              ) : undefined}
              inactive={vehicle.status === "inactive"}
              actions={
                <>
                  <ResourceCardAction
                    onClick={() => openAvailabilityDialog(vehicle)}
                    title="Modifica disponibilità"
                  >
                    <Clock className="size-3.5" />
                  </ResourceCardAction>
                  <ResourceCardAction
                    onClick={() => openEditVehicle(vehicle)}
                    title="Modifica veicolo"
                  >
                    <Pencil className="size-3.5" />
                  </ResourceCardAction>
                </>
              }
              availabilitySummary={
                wa ? (
                  <span>
                    {formatMinutes(wa.startMinutes)}–{formatMinutes(wa.endMinutes)} ·{" "}
                    {wa.daysOfWeek
                      .map((d) => WEEKDAY_OPTIONS.find((w) => w.value === d)?.label ?? "")
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                ) : (
                  <span className="italic opacity-60">Nessuna disponibilità settimanale</span>
                )
              }
              slots={
                ranges.length > 0
                  ? ranges.map((range) => (
                      <SlotPill key={`${range.start.toISOString()}-${range.end.toISOString()}`}>
                        {formatTime(range.start)}–{formatTime(range.end)}
                      </SlotPill>
                    ))
                  : undefined
              }
              totalLabel={totalMinutes > 0 ? `${Math.round(totalMinutes)} min` : undefined}
            />
          );
        })}
        {!vehicles.length ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-gray-50/50 p-6 text-sm text-muted-foreground">
            Nessun veicolo disponibile.
          </div>
        ) : null}
      </div>
    </>
  );
}

/* ConfigSection removed — now uses AccordionSection */

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

// ── Mini Calendar for availability overrides ──────────────────────────────────

const CAL_DAY_NAMES = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"];

type TimeRange = { startMinutes: number; endMinutes: number };

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
                  ? "bg-yellow-400 text-white"
                  : isToday
                    ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                    : "text-foreground hover:bg-gray-100",
              )}
            >
              {cell.day}
              {hasOverride && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-yellow-400" />
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
              <span className="rounded-full bg-yellow-100 border border-yellow-200 px-2 py-0.5 text-[10px] font-medium text-yellow-700">Override</span>
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
              dayEnabled ? "border-yellow-200 bg-yellow-50" : "border-border bg-white",
            )}
          >
            <span className="text-xs font-medium text-foreground">Disponibile</span>
            <InlineToggle checked={dayEnabled} size="sm" />
          </div>
          {dayEnabled && (
            <div className="space-y-2">
              {ranges.map((range, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select value={String(range.startMinutes)} onValueChange={(v) => setRanges((prev) => prev.map((r, i) => i === idx ? { ...r, startMinutes: Number(v) } : r))}>
                    <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{START_TIME_OPTIONS.map((m) => (<SelectItem key={`cd-s-${idx}-${m}`} value={String(m)}>{formatMinutes(m)}</SelectItem>))}</SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">–</span>
                  <Select value={String(range.endMinutes)} onValueChange={(v) => setRanges((prev) => prev.map((r, i) => i === idx ? { ...r, endMinutes: Number(v) } : r))}>
                    <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{END_TIME_OPTIONS.map((m) => (<SelectItem key={`cd-e-${idx}-${m}`} value={String(m)}>{formatMinutes(m)}</SelectItem>))}</SelectContent>
                  </Select>
                  {ranges.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRanges((prev) => prev.filter((_, i) => i !== idx))}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
                      aria-label="Rimuovi fascia"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRanges((prev) => [...prev, { startMinutes: 14 * 60, endMinutes: 18 * 60 }])}
                className="flex items-center gap-1 text-xs font-medium text-yellow-600 hover:text-yellow-700 transition-colors"
              >
                <Plus className="size-3" />
                Aggiungi fascia
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
