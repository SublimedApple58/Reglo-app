"use client";

import React from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { Plus, ChevronDown, ChevronLeft, ChevronRight, Clock, Settings2, Users, Truck, UserRoundCog } from "lucide-react";

import { PageWrapper } from "@/components/Layout/PageWrapper";
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
import { InlineToggle } from "@/components/ui/inline-toggle";

const SettingsTab = dynamic(() => import("./tabs/SettingsTab"));
const InstructorsTab = dynamic(() => import("./tabs/InstructorsTab"));
const StudentsTab = dynamic(() => import("./tabs/StudentsTab"));
const VehiclesTab = dynamic(() => import("./tabs/VehiclesTab"));
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
import { InstructorHoursDashboard } from "@/components/pages/Autoscuole/InstructorHoursDashboard";

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
  const [configTab, setConfigTab] = React.useState<"settings" | "instructors" | "vehicles" | "students" | "hours">("settings");
  const [expandedSection, setExpandedSection] = React.useState<string | null>("bookings");
  const [date] = React.useState(() => formatDateLocal(new Date()));
  const [loading, setLoading] = React.useState(false);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [availabilityWeeks, setAvailabilityWeeks] = React.useState("4");
  const [studentReminderMinutes, setStudentReminderMinutes] = React.useState("60");
  const [studentReminderMorningEnabled, setStudentReminderMorningEnabled] = React.useState(false);
  const [studentReminderMorningTime, setStudentReminderMorningTime] = React.useState("08:00");
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
  const [allStudents, setAllStudents] = React.useState<Array<{ id: string; firstName: string; lastName: string; assignedInstructorId: string | null }>>([]);
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
        instructorRes.data.map((item) => ({
          id: item.id,
          name: item.name,
          status: item.status,
          autonomousMode: item.autonomousMode,
          settings: item.settings,
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
      setStudentReminderMorningEnabled(res.data.studentReminderMorningEnabled ?? false);
      setStudentReminderMorningTime(res.data.studentReminderMorningTime ?? "08:00");
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
      studentReminderMorningEnabled,
      studentReminderMorningTime,
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
        ? (settings.bookingSlotDurations as number[]).filter((d) => [30, 45, 60, 90, 120].includes(d))
        : [30, 60],
    );
    setClusterRoundedHours(settings.roundedHoursOnly === true);
    // Load new cluster booking settings
    setClusterAppBookingActors(settings.appBookingActors as "students" | "instructors" | "both" | undefined);
    setClusterInstructorBookingMode(settings.instructorBookingMode as "manual_full" | "manual_engine" | undefined);
    setClusterSwapEnabled(typeof settings.swapEnabled === "boolean" ? settings.swapEnabled : undefined);
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
            { key: "hours" as const, label: "Ore guida", icon: Clock },
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
          <SettingsTab
            expandedSection={expandedSection}
            toggleSection={toggleSection}
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
            studentReminderMinutes={studentReminderMinutes}
            setStudentReminderMinutes={setStudentReminderMinutes}
            studentReminderMorningEnabled={studentReminderMorningEnabled}
            setStudentReminderMorningEnabled={setStudentReminderMorningEnabled}
            studentReminderMorningTime={studentReminderMorningTime}
            setStudentReminderMorningTime={setStudentReminderMorningTime}
            instructorReminderMinutes={instructorReminderMinutes}
            setInstructorReminderMinutes={setInstructorReminderMinutes}
            slotFillChannels={slotFillChannels}
            studentReminderChannels={studentReminderChannels}
            instructorReminderChannels={instructorReminderChannels}
            toggleChannel={toggleChannel}
            setSlotFillChannels={setSlotFillChannels}
            setStudentReminderChannels={setStudentReminderChannels}
            setInstructorReminderChannels={setInstructorReminderChannels}
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
        ) : configTab === "instructors" ? (
          <InstructorsTab
            instructors={instructors}
            instructorWeeklyAvailability={instructorWeeklyAvailability}
            instructorAvailability={instructorAvailability}
            openClusterPanel={openClusterPanel}
            openInstructorAvailabilityDialog={openInstructorAvailabilityDialog}
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
        ) : configTab === "students" ? (
          <StudentsTab
            expandedSection={expandedSection}
            toggleSection={toggleSection}
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
            autoCheckinEnabled={autoCheckinEnabled}
            setAutoCheckinEnabled={setAutoCheckinEnabled}
            studentNotesEnabled={studentNotesEnabled}
            setStudentNotesEnabled={setStudentNotesEnabled}
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
        ) : configTab === "hours" ? (
          <InstructorHoursDashboard />
        ) : (
          <VehiclesTab
            vehicles={vehicles}
            vehicleWeeklyAvailability={vehicleWeeklyAvailability}
            vehicleAvailability={vehicleAvailability}
            loading={loading}
            vehiclesEnabled={vehiclesEnabled}
            setVehiclesEnabled={setVehiclesEnabled}
            openCreateVehicle={openCreateVehicle}
            openEditVehicle={openEditVehicle}
            openAvailabilityDialog={openAvailabilityDialog}
            handleSaveSettings={handleSaveSettings}
            savingSettings={savingSettings}
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
                <FieldGroup label="Data inizio">
                  <input
                    type="date"
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none focus:border-primary/40"
                    value={sickLeaveStartDate}
                    onChange={(e) => setSickLeaveStartDate(e.target.value)}
                  />
                </FieldGroup>
                <FieldGroup label="Data fine">
                  <input
                    type="date"
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none focus:border-primary/40"
                    value={sickLeaveEndDate}
                    onChange={(e) => setSickLeaveEndDate(e.target.value)}
                  />
                </FieldGroup>
              </div>
              <div
                className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-4 py-3 cursor-pointer"
                onClick={() => setSickLeaveHalfDay((prev) => !prev)}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Mezza giornata</span>
                  <span className="text-xs text-muted-foreground">
                    La malattia inizia a un orario specifico del primo giorno.
                  </span>
                </div>
                <InlineToggle checked={sickLeaveHalfDay} size="sm" />
              </div>
              {sickLeaveHalfDay && (
                <FieldGroup label="Orario inizio malattia">
                  <Select value={sickLeaveStartTime} onValueChange={setSickLeaveStartTime}>
                    <SelectTrigger><SelectValue placeholder="Orario" /></SelectTrigger>
                    <SelectContent>
                      {["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
              )}
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
    </PageWrapper>
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
