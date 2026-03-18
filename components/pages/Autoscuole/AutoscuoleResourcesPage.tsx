"use client";

import React from "react";
import { Bell, CalendarDays, ClipboardList, CalendarSearch, Check, Plus, Pencil, Clock, Car } from "lucide-react";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
import { DatePicker } from "@/components/ui/date-picker";
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
} from "@/lib/actions/autoscuole.actions";
import { AdminUsersInviteDialog } from "@/components/pages/AdminUsers/AdminUsersInviteDialog";
import {
  getAvailabilitySlots,
  setWeeklyAvailabilityOverride,
  deleteWeeklyAvailabilityOverride,
  getWeeklyAvailabilityOverrides,
  getWeekStart,
} from "@/lib/actions/autoscuole-availability.actions";
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
} from "@/lib/actions/autoscuole-settings.actions";
import { cn } from "@/lib/utils";

type ResourceOption = { id: string; name: string };
type InstructorDetail = { id: string; name: string; status: string };
type VehicleDetail = { id: string; name: string; plate: string | null; status: string };
type VehicleWeeklyAvailability = { daysOfWeek: number[]; startMinutes: number; endMinutes: number };
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

type OverrideInfo = {
  weekStart: string;
  daysOfWeek: number[];
  startMinutes: number;
  endMinutes: number;
};

export function AutoscuoleResourcesPage({
  hideNav = false,
  tabs,
}: {
  hideNav?: boolean;
  tabs?: React.ReactNode;
} = {}) {
  const toast = useFeedbackToast();
  const [date, setDate] = React.useState(() => formatDateLocal(new Date()));
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
  const [bookingMinStartDate, setBookingMinStartDate] = React.useState<string>("");
  const [appBookingActors, setAppBookingActors] = React.useState<AppBookingActorsValue>("students");
  const [instructorBookingMode, setInstructorBookingMode] = React.useState<InstructorBookingModeValue>("manual_engine");
  const [instructors, setInstructors] = React.useState<InstructorDetail[]>([]);
  const [instructorWeeklyAvailability, setInstructorWeeklyAvailability] = React.useState<
    Record<string, VehicleWeeklyAvailability>
  >({});
  const [vehicles, setVehicles] = React.useState<VehicleDetail[]>([]);
  const [vehicleWeeklyAvailability, setVehicleWeeklyAvailability] = React.useState<
    Record<string, VehicleWeeklyAvailability>
  >({});

  // ── Instructor availability dialog
  const [availInstructor, setAvailInstructor] = React.useState<InstructorDetail | null>(null);
  const [instrDays, setInstrDays] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [instrStartMinutes, setInstrStartMinutes] = React.useState(9 * 60);
  const [instrEndMinutes, setInstrEndMinutes] = React.useState(18 * 60);
  const [savingInstrAvailability, setSavingInstrAvailability] = React.useState(false);
  // Week override state for instructor dialog
  const [instrSelectedWeek, setInstrSelectedWeek] = React.useState<string | null>(null); // null = "Predefinito"
  const [instrOverrides, setInstrOverrides] = React.useState<OverrideInfo[]>([]);
  const weekOptions = React.useMemo(buildWeekOptions, []);
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
  const [savingAvailability, setSavingAvailability] = React.useState(false);
  // Week override state for vehicle dialog
  const [vehSelectedWeek, setVehSelectedWeek] = React.useState<string | null>(null);
  const [vehOverrides, setVehOverrides] = React.useState<OverrideInfo[]>([]);

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
    setAvailInstructor(instructor);
    setInstrDays(current?.daysOfWeek ?? [1, 2, 3, 4, 5]);
    setInstrStartMinutes(current?.startMinutes ?? 9 * 60);
    setInstrEndMinutes(current?.endMinutes ?? 18 * 60);
    setInstrSelectedWeek(null);
    // Load overrides for this instructor
    getWeeklyAvailabilityOverrides({
      ownerType: "instructor",
      ownerId: instructor.id,
    }).then((res) => {
      if (res.success && res.data) {
        setInstrOverrides(
          res.data.map((o) => ({
            weekStart: new Date(o.weekStart).toISOString().slice(0, 10),
            daysOfWeek: o.daysOfWeek,
            startMinutes: o.startMinutes,
            endMinutes: o.endMinutes,
          })),
        );
      }
    });
  };

  const toggleInstrDay = (day: number) => {
    setInstrDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  };

  const handleSelectInstrWeek = (weekStart: string | null) => {
    setInstrSelectedWeek(weekStart);
    if (!availInstructor) return;
    if (weekStart === null) {
      // "Predefinito" selected — load the default
      const current = instructorWeeklyAvailability[availInstructor.id];
      setInstrDays(current?.daysOfWeek ?? [1, 2, 3, 4, 5]);
      setInstrStartMinutes(current?.startMinutes ?? 9 * 60);
      setInstrEndMinutes(current?.endMinutes ?? 18 * 60);
    } else {
      // Specific week selected — load override if it exists, otherwise pre-fill from default
      const override = instrOverrides.find((o) => o.weekStart === weekStart);
      if (override) {
        setInstrDays(override.daysOfWeek);
        setInstrStartMinutes(override.startMinutes);
        setInstrEndMinutes(override.endMinutes);
      } else {
        const current = instructorWeeklyAvailability[availInstructor.id];
        setInstrDays(current?.daysOfWeek ?? [1, 2, 3, 4, 5]);
        setInstrStartMinutes(current?.startMinutes ?? 9 * 60);
        setInstrEndMinutes(current?.endMinutes ?? 18 * 60);
      }
    }
  };

  const handleSaveInstructorAvailability = async () => {
    if (!availInstructor) return;
    if (!instrDays.length) {
      toast.error({ description: "Seleziona almeno un giorno." });
      return;
    }
    if (instrEndMinutes <= instrStartMinutes) {
      toast.error({ description: "L'orario di fine deve essere dopo quello di inizio." });
      return;
    }
    setSavingInstrAvailability(true);

    if (instrSelectedWeek) {
      // Save as override for the specific week
      const res = await setWeeklyAvailabilityOverride({
        ownerType: "instructor",
        ownerId: availInstructor.id,
        weekStart: instrSelectedWeek,
        daysOfWeek: instrDays,
        startMinutes: instrStartMinutes,
        endMinutes: instrEndMinutes,
      });
      setSavingInstrAvailability(false);
      if (!res.success) {
        toast.error({ description: res.message ?? "Impossibile salvare l'override." });
        return;
      }
      // Update local override list
      setInstrOverrides((prev) => {
        const filtered = prev.filter((o) => o.weekStart !== instrSelectedWeek);
        return [...filtered, { weekStart: instrSelectedWeek, daysOfWeek: instrDays, startMinutes: instrStartMinutes, endMinutes: instrEndMinutes }];
      });
      setAvailInstructor(null);
      toast.success({ description: "Override settimanale salvato." });
    } else {
      // Save as default
      const res = await setAutoscuolaInstructorWeeklyAvailability({
        instructorId: availInstructor.id,
        daysOfWeek: instrDays,
        startMinutes: instrStartMinutes,
        endMinutes: instrEndMinutes,
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
    }
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
    setAvailVehicle(vehicle);
    setAvailDays(current?.daysOfWeek ?? [1, 2, 3, 4, 5]);
    setAvailStartMinutes(current?.startMinutes ?? 9 * 60);
    setAvailEndMinutes(current?.endMinutes ?? 18 * 60);
    setVehSelectedWeek(null);
    getWeeklyAvailabilityOverrides({
      ownerType: "vehicle",
      ownerId: vehicle.id,
    }).then((res) => {
      if (res.success && res.data) {
        setVehOverrides(
          res.data.map((o) => ({
            weekStart: new Date(o.weekStart).toISOString().slice(0, 10),
            daysOfWeek: o.daysOfWeek,
            startMinutes: o.startMinutes,
            endMinutes: o.endMinutes,
          })),
        );
      }
    });
  };

  const toggleAvailDay = (day: number) => {
    setAvailDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  };

  const handleSelectVehWeek = (weekStart: string | null) => {
    setVehSelectedWeek(weekStart);
    if (!availVehicle) return;
    if (weekStart === null) {
      const current = vehicleWeeklyAvailability[availVehicle.id];
      setAvailDays(current?.daysOfWeek ?? [1, 2, 3, 4, 5]);
      setAvailStartMinutes(current?.startMinutes ?? 9 * 60);
      setAvailEndMinutes(current?.endMinutes ?? 18 * 60);
    } else {
      const override = vehOverrides.find((o) => o.weekStart === weekStart);
      if (override) {
        setAvailDays(override.daysOfWeek);
        setAvailStartMinutes(override.startMinutes);
        setAvailEndMinutes(override.endMinutes);
      } else {
        const current = vehicleWeeklyAvailability[availVehicle.id];
        setAvailDays(current?.daysOfWeek ?? [1, 2, 3, 4, 5]);
        setAvailStartMinutes(current?.startMinutes ?? 9 * 60);
        setAvailEndMinutes(current?.endMinutes ?? 18 * 60);
      }
    }
  };

  const handleSaveAvailability = async () => {
    if (!availVehicle) return;
    if (!availDays.length) {
      toast.error({ description: "Seleziona almeno un giorno." });
      return;
    }
    if (availEndMinutes <= availStartMinutes) {
      toast.error({ description: "L'orario di fine deve essere dopo quello di inizio." });
      return;
    }
    setSavingAvailability(true);

    if (vehSelectedWeek) {
      const res = await setWeeklyAvailabilityOverride({
        ownerType: "vehicle",
        ownerId: availVehicle.id,
        weekStart: vehSelectedWeek,
        daysOfWeek: availDays,
        startMinutes: availStartMinutes,
        endMinutes: availEndMinutes,
      });
      setSavingAvailability(false);
      if (!res.success) {
        toast.error({ description: res.message ?? "Impossibile salvare l'override." });
        return;
      }
      setVehOverrides((prev) => {
        const filtered = prev.filter((o) => o.weekStart !== vehSelectedWeek);
        return [...filtered, { weekStart: vehSelectedWeek, daysOfWeek: availDays, startMinutes: availStartMinutes, endMinutes: availEndMinutes }];
      });
      setAvailVehicle(null);
      toast.success({ description: "Override settimanale salvato." });
    } else {
      const res = await setAutoscuolaVehicleWeeklyAvailability({
        vehicleId: availVehicle.id,
        daysOfWeek: availDays,
        startMinutes: availStartMinutes,
        endMinutes: availEndMinutes,
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
    }
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

  return (
    <ClientPageWrapper
      title="Configurazione"
      subTitle="Disponibilità, prenotazioni, reminder e policy per la tua autoscuola"
      hideHero
      contentWidthClassName="max-w-[1600px]"
    >
      <div className="w-full space-y-5">
        {tabs}
        {!hideNav ? <AutoscuoleNav /> : null}

        {/* Row 1: Prenotazioni + Reminder e notifiche */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Prenotazioni */}
          <ConfigSection
            icon={CalendarDays}
            title="Prenotazioni"
            description="Durate, attori e settimane di disponibilità visibili in app."
          >
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  Settimane di disponibilità
                </div>
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
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  Prenotazioni aperte dal
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={bookingMinStartDate}
                    onChange={(e) => setBookingMinStartDate(e.target.value)}
                    className="max-w-[200px]"
                  />
                  {bookingMinStartDate ? (
                    <button
                      type="button"
                      onClick={() => setBookingMinStartDate("")}
                      className="text-xs text-muted-foreground hover:text-foreground transition"
                    >
                      Rimuovi
                    </button>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Gli allievi non potranno prenotare prima di questa data. Lascia vuoto per nessun limite.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Durata prenotazione allievo
                </div>
                <div className="flex flex-wrap gap-2">
                  {BOOKING_DURATION_OPTIONS.map((duration) => {
                    const active = bookingSlotDurations.includes(duration);
                    return (
                      <button
                        key={duration}
                        type="button"
                        onClick={() => toggleBookingDuration(duration)}
                        className={cn(
                          "cursor-pointer rounded-full border px-3 py-1.5 text-xs transition",
                          active
                            ? "border-[#324D7A] bg-[#324D7A]/15 text-foreground"
                            : "border-white/70 bg-white/85 text-muted-foreground hover:bg-white hover:text-foreground",
                        )}
                      >
                        {duration} min
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  Chi può prenotare
                </div>
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
              </div>

              {appBookingActors === "instructors" || appBookingActors === "both" ? (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">
                    Modalità istruttore
                  </div>
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
                </div>
              ) : null}
            </div>
          </ConfigSection>

          {/* Reminder e notifiche */}
          <ConfigSection
            icon={Bell}
            title="Reminder e notifiche"
            description="Quando e su quali canali inviare promemoria a allievi e istruttori."
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">
                    Reminder allievo
                  </div>
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
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">
                    Reminder istruttore
                  </div>
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
                </div>
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
          </ConfigSection>
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

        {/* Policy tipi guida */}
        <ConfigSection
          icon={ClipboardList}
          title="Policy tipi guida"
          description="Regole opzionali su copertura tipi e finestre settimanali per ogni tipo guida."
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
                        "rounded-2xl border bg-white/70 p-3 transition-all duration-200",
                        hasLimit ? "border-[#324D7A]/25" : "border-white/60",
                      )}
                    >
                      {/* Header: name + pill actions */}
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex-1 text-sm font-semibold text-foreground">
                          {option.label}
                        </span>
                        {/* Obbligatorio pill */}
                        <button
                          type="button"
                          onClick={() => toggleRequiredType(option.value)}
                          aria-label={`Segna ${option.label} come obbligatorio`}
                          className={cn(
                            "flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-150",
                            isRequired
                              ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300/60"
                              : "bg-black/5 text-muted-foreground hover:bg-black/10",
                          )}
                        >
                          {isRequired && <Check className="size-2.5" />}
                          Obbl.
                        </button>
                      </div>

                      {/* Limite orario toggle row */}
                      <button
                        type="button"
                        onClick={() => toggleConstraintEnabled(option.value)}
                        aria-label={`Limite orario per ${option.label}`}
                        className={cn(
                          "flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-all duration-150",
                          hasLimit
                            ? "bg-[#324D7A]/10 text-foreground"
                            : "bg-white/50 text-muted-foreground hover:bg-white/80",
                        )}
                      >
                        <span className="font-medium">Limite orario</span>
                        <InlineSwitch checked={hasLimit} />
                      </button>

                      {/* Expanded: days + time window */}
                      {hasLimit && (
                        <div className="mt-3 space-y-2.5 border-t border-white/50 pt-2.5">
                          <div className="flex flex-wrap gap-1">
                            {WEEKDAY_OPTIONS.map((day) => (
                              <button
                                key={`${option.value}-${day.value}`}
                                type="button"
                                onClick={() => toggleConstraintDay(option.value, day.value)}
                                className={cn(
                                  "cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all duration-150",
                                  constraint.daysOfWeek.includes(day.value)
                                    ? "border-[#324D7A] bg-[#324D7A]/15 text-[#324D7A]"
                                    : "border-white/70 bg-white/80 text-muted-foreground hover:bg-white hover:text-foreground",
                                )}
                              >
                                {day.label}
                              </button>
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
        </ConfigSection>

        {/* Disponibilità del giorno */}
        <div className="glass-panel glass-strong flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 rounded-xl bg-white/80 p-2 shadow-sm ring-1 ring-white/60">
              <CalendarSearch className="size-4 text-foreground/70" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">
                Disponibilità del giorno
              </div>
              <p className="text-xs text-muted-foreground">
                Seleziona una data per vedere gli slot disponibili di istruttori e veicoli.
              </p>
            </div>
          </div>
          <div className="w-[280px]">
            <DatePicker value={date} onChange={setDate} />
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Istruttori</h3>
            <div className="flex items-center gap-2">
              {loading ? (
                <span className="text-xs text-muted-foreground">Aggiornamento...</span>
              ) : null}
              <button
                type="button"
                onClick={() => setInviteInstructorOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-[#324D7A]/30 bg-[#324D7A]/10 px-3 py-1.5 text-xs font-medium text-[#324D7A] transition hover:bg-[#324D7A]/20"
              >
                <Plus className="size-3.5" />
                Invita istruttore
              </button>
            </div>
          </div>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            {instructors.map((instructor) => (
              <InstructorCard
                key={instructor.id}
                instructor={instructor}
                weeklyAvailability={instructorWeeklyAvailability[instructor.id] ?? null}
                ranges={instructorAvailability[instructor.id] ?? []}
                onEditAvailability={() => openInstructorAvailabilityDialog(instructor)}
              />
            ))}
            {!instructors.length ? (
              <EmptyCard label="Nessun istruttore disponibile." />
            ) : null}
          </div>
        </section>

        {/* ── Instructor availability dialog */}
        <Dialog open={Boolean(availInstructor)} onOpenChange={(open) => !open && setAvailInstructor(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Disponibilità settimanale — {availInstructor?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Week selector strip */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Settimana</div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => handleSelectInstrWeek(null)}
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-150",
                      instrSelectedWeek === null
                        ? "border-[#324D7A] bg-[#324D7A]/15 text-[#324D7A]"
                        : "border-white/70 bg-white/80 text-muted-foreground hover:bg-white hover:text-foreground",
                    )}
                  >
                    Predefinito
                  </button>
                  {weekOptions.map((wo) => {
                    const hasOverride = instrOverrides.some((o) => o.weekStart === wo.weekStart);
                    return (
                      <button
                        key={wo.weekStart}
                        type="button"
                        onClick={() => handleSelectInstrWeek(wo.weekStart)}
                        className={cn(
                          "relative shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-150",
                          instrSelectedWeek === wo.weekStart
                            ? "border-[#324D7A] bg-[#324D7A]/15 text-[#324D7A]"
                            : "border-white/70 bg-white/80 text-muted-foreground hover:bg-white hover:text-foreground",
                        )}
                      >
                        {wo.label}
                        {hasOverride && (
                          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#324D7A]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Giorni attivi</div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_OPTIONS.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleInstrDay(day.value)}
                      className={cn(
                        "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-150",
                        instrDays.includes(day.value)
                          ? "border-[#324D7A] bg-[#324D7A]/15 text-[#324D7A]"
                          : "border-white/70 bg-white/80 text-muted-foreground hover:bg-white hover:text-foreground",
                      )}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Orario</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Inizio</div>
                    <Select
                      value={String(instrStartMinutes)}
                      onValueChange={(v) => setInstrStartMinutes(Number(v))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {START_TIME_OPTIONS.map((m) => (
                          <SelectItem key={`instr-start-${m}`} value={String(m)}>
                            {formatMinutes(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Fine</div>
                    <Select
                      value={String(instrEndMinutes)}
                      onValueChange={(v) => setInstrEndMinutes(Number(v))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {END_TIME_OPTIONS.map((m) => (
                          <SelectItem key={`instr-end-${m}`} value={String(m)}>
                            {formatMinutes(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
              {instrSelectedWeek ? (
                <button
                  type="button"
                  onClick={handleResetInstrOverride}
                  disabled={savingInstrAvailability || !instrOverrides.some((o) => o.weekStart === instrSelectedWeek)}
                  className="order-last text-xs text-amber-600 hover:text-amber-700 hover:underline disabled:opacity-40 sm:order-first"
                >
                  Ripristina predefinito
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDeleteInstructorAvailability}
                  disabled={savingInstrAvailability || !availInstructor || !instructorWeeklyAvailability[availInstructor?.id ?? ""]}
                  className="order-last text-xs text-red-500 hover:text-red-600 hover:underline disabled:opacity-40 sm:order-first"
                >
                  Rimuovi disponibilità
                </button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setAvailInstructor(null)}
                  disabled={savingInstrAvailability}
                >
                  Annulla
                </Button>
                <Button
                  onClick={handleSaveInstructorAvailability}
                  disabled={savingInstrAvailability || !instrDays.length || instrEndMinutes <= instrStartMinutes}
                >
                  {savingInstrAvailability ? "Salvataggio..." : "Salva"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Invite instructor dialog */}
        <AdminUsersInviteDialog
          open={inviteInstructorOpen}
          onOpenChange={setInviteInstructorOpen}
          initialAutoscuolaRole="INSTRUCTOR"
        />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Veicoli</h3>
            <div className="flex items-center gap-2">
              {loading ? (
                <span className="text-xs text-muted-foreground">Aggiornamento...</span>
              ) : null}
              <button
                type="button"
                onClick={openCreateVehicle}
                className="flex items-center gap-1.5 rounded-full border border-[#324D7A]/30 bg-[#324D7A]/10 px-3 py-1.5 text-xs font-medium text-[#324D7A] transition hover:bg-[#324D7A]/20"
              >
                <Plus className="size-3.5" />
                Nuovo veicolo
              </button>
            </div>
          </div>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            {vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                weeklyAvailability={vehicleWeeklyAvailability[vehicle.id] ?? null}
                ranges={vehicleAvailability[vehicle.id] ?? []}
                onEdit={() => openEditVehicle(vehicle)}
                onEditAvailability={() => openAvailabilityDialog(vehicle)}
              />
            ))}
            {!vehicles.length ? <EmptyCard label="Nessun veicolo disponibile." /> : null}
          </div>
        </section>

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

        {/* ── Availability edit dialog */}
        <Dialog open={Boolean(availVehicle)} onOpenChange={(open) => !open && setAvailVehicle(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Disponibilità settimanale — {availVehicle?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Week selector strip */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Settimana</div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => handleSelectVehWeek(null)}
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-150",
                      vehSelectedWeek === null
                        ? "border-[#324D7A] bg-[#324D7A]/15 text-[#324D7A]"
                        : "border-white/70 bg-white/80 text-muted-foreground hover:bg-white hover:text-foreground",
                    )}
                  >
                    Predefinito
                  </button>
                  {weekOptions.map((wo) => {
                    const hasOverride = vehOverrides.some((o) => o.weekStart === wo.weekStart);
                    return (
                      <button
                        key={wo.weekStart}
                        type="button"
                        onClick={() => handleSelectVehWeek(wo.weekStart)}
                        className={cn(
                          "relative shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-150",
                          vehSelectedWeek === wo.weekStart
                            ? "border-[#324D7A] bg-[#324D7A]/15 text-[#324D7A]"
                            : "border-white/70 bg-white/80 text-muted-foreground hover:bg-white hover:text-foreground",
                        )}
                      >
                        {wo.label}
                        {hasOverride && (
                          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#324D7A]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Giorni attivi</div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_OPTIONS.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleAvailDay(day.value)}
                      className={cn(
                        "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-150",
                        availDays.includes(day.value)
                          ? "border-[#324D7A] bg-[#324D7A]/15 text-[#324D7A]"
                          : "border-white/70 bg-white/80 text-muted-foreground hover:bg-white hover:text-foreground",
                      )}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Orario</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Inizio</div>
                    <Select
                      value={String(availStartMinutes)}
                      onValueChange={(v) => setAvailStartMinutes(Number(v))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {START_TIME_OPTIONS.map((m) => (
                          <SelectItem key={`avail-start-${m}`} value={String(m)}>
                            {formatMinutes(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Fine</div>
                    <Select
                      value={String(availEndMinutes)}
                      onValueChange={(v) => setAvailEndMinutes(Number(v))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {END_TIME_OPTIONS.map((m) => (
                          <SelectItem key={`avail-end-${m}`} value={String(m)}>
                            {formatMinutes(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
              {vehSelectedWeek ? (
                <button
                  type="button"
                  onClick={handleResetVehOverride}
                  disabled={savingAvailability || !vehOverrides.some((o) => o.weekStart === vehSelectedWeek)}
                  className="order-last text-xs text-amber-600 hover:text-amber-700 hover:underline disabled:opacity-40 sm:order-first"
                >
                  Ripristina predefinito
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDeleteAvailability}
                  disabled={savingAvailability || !availVehicle || !vehicleWeeklyAvailability[availVehicle?.id ?? ""]}
                  className="order-last text-xs text-red-500 hover:text-red-600 hover:underline disabled:opacity-40 sm:order-first"
                >
                  Rimuovi disponibilità
                </button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setAvailVehicle(null)}
                  disabled={savingAvailability}
                >
                  Annulla
                </Button>
                <Button
                  onClick={handleSaveAvailability}
                  disabled={savingAvailability || !availDays.length || availEndMinutes <= availStartMinutes}
                >
                  {savingAvailability ? "Salvataggio..." : "Salva"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ClientPageWrapper>
  );
}

function ConfigSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-panel glass-strong space-y-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 rounded-xl bg-white/80 p-2 shadow-sm ring-1 ring-white/60">
          <Icon className="size-4 text-foreground/70" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {children}
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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition-all duration-150",
        checked
          ? "border-[#324D7A]/30 bg-[#324D7A]/8 hover:bg-[#324D7A]/10"
          : "border-white/60 bg-white/70 hover:bg-white/90",
      )}
    >
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <InlineSwitch checked={checked} />
    </button>
  );
}

function InlineSwitch({ checked }: { checked: boolean }) {
  return (
    <div
      className={cn(
        "relative flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200",
        checked ? "bg-[#324D7A]" : "bg-black/20",
      )}
    >
      <div
        className={cn(
          "absolute h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      />
    </div>
  );
}

function InstructorCard({
  instructor,
  weeklyAvailability,
  ranges,
  onEditAvailability,
}: {
  instructor: InstructorDetail;
  weeklyAvailability: VehicleWeeklyAvailability | null;
  ranges: AvailabilityRange[];
  onEditAvailability: () => void;
}) {
  const totalMinutes = ranges.reduce((sum, range) => sum + diffMinutes(range.end, range.start), 0);
  const isInactive = instructor.status === "inactive";

  return (
    <div className={cn("glass-panel glass-strong space-y-2 p-4", isInactive && "opacity-60")}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{instructor.name}</span>
            {isInactive && (
              <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                Inattivo
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onEditAvailability}
          title="Modifica disponibilità"
          className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/60 bg-white/60 text-muted-foreground transition hover:bg-white hover:text-foreground"
        >
          <Clock className="size-3.5" />
        </button>
      </div>

      {/* Weekly availability summary */}
      {weeklyAvailability ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>
            {formatMinutes(weeklyAvailability.startMinutes)}–{formatMinutes(weeklyAvailability.endMinutes)}
          </span>
          <span>·</span>
          <span>
            {weeklyAvailability.daysOfWeek
              .map((d) => WEEKDAY_OPTIONS.find((w) => w.value === d)?.label ?? "")
              .filter(Boolean)
              .join(", ")}
          </span>
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground/60 italic">Nessuna disponibilità settimanale</div>
      )}

      {/* Today's slots */}
      <div className="flex items-center justify-between border-t border-white/40 pt-2">
        <div className="flex flex-wrap gap-1.5">
          {ranges.map((range) => (
            <span
              key={`${range.start.toISOString()}-${range.end.toISOString()}`}
              className="rounded-full border border-white/60 bg-white/80 px-2.5 py-0.5 text-[11px] text-foreground"
            >
              {formatTime(range.start)}–{formatTime(range.end)}
            </span>
          ))}
          {!ranges.length ? (
            <span className="text-xs text-muted-foreground">Nessuno slot oggi.</span>
          ) : null}
        </div>
        {totalMinutes > 0 && (
          <div className="shrink-0 pl-2 text-xs text-muted-foreground">
            {Math.round(totalMinutes)} min
          </div>
        )}
      </div>
    </div>
  );
}

function VehicleCard({
  vehicle,
  weeklyAvailability,
  ranges,
  onEdit,
  onEditAvailability,
}: {
  vehicle: VehicleDetail;
  weeklyAvailability: VehicleWeeklyAvailability | null;
  ranges: AvailabilityRange[];
  onEdit: () => void;
  onEditAvailability: () => void;
}) {
  const totalMinutes = ranges.reduce((sum, range) => sum + diffMinutes(range.end, range.start), 0);
  const isInactive = vehicle.status === "inactive";

  return (
    <div className={cn("glass-panel glass-strong space-y-2 p-4", isInactive && "opacity-60")}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{vehicle.name}</span>
            {isInactive && (
              <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                Inattivo
              </span>
            )}
          </div>
          {vehicle.plate && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Car className="size-3" />
              {vehicle.plate}
            </div>
          )}
        </div>
        {/* Action icons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEditAvailability}
            title="Modifica disponibilità"
            className="flex size-7 items-center justify-center rounded-lg border border-white/60 bg-white/60 text-muted-foreground transition hover:bg-white hover:text-foreground"
          >
            <Clock className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onEdit}
            title="Modifica veicolo"
            className="flex size-7 items-center justify-center rounded-lg border border-white/60 bg-white/60 text-muted-foreground transition hover:bg-white hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Weekly availability summary */}
      {weeklyAvailability ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>
            {formatMinutes(weeklyAvailability.startMinutes)}–{formatMinutes(weeklyAvailability.endMinutes)}
          </span>
          <span>·</span>
          <span>
            {weeklyAvailability.daysOfWeek
              .map((d) => WEEKDAY_OPTIONS.find((w) => w.value === d)?.label ?? "")
              .filter(Boolean)
              .join(", ")}
          </span>
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground/60 italic">Nessuna disponibilità settimanale</div>
      )}

      {/* Today's slots */}
      <div className="flex items-center justify-between border-t border-white/40 pt-2">
        <div className="flex flex-wrap gap-1.5">
          {ranges.map((range) => (
            <span
              key={`${range.start.toISOString()}-${range.end.toISOString()}`}
              className="rounded-full border border-white/60 bg-white/80 px-2.5 py-0.5 text-[11px] text-foreground"
            >
              {formatTime(range.start)}–{formatTime(range.end)}
            </span>
          ))}
          {!ranges.length ? (
            <span className="text-xs text-muted-foreground">Nessuno slot oggi.</span>
          ) : null}
        </div>
        {totalMinutes > 0 && (
          <div className="shrink-0 pl-2 text-xs text-muted-foreground">
            {Math.round(totalMinutes)} min
          </div>
        )}
      </div>
    </div>
  );
}

function AvailabilityCard({
  title,
  ranges,
}: {
  title: string;
  ranges: AvailabilityRange[];
}) {
  const totalMinutes = ranges.reduce((sum, range) => sum + diffMinutes(range.end, range.start), 0);
  return (
    <div className="glass-panel glass-strong space-y-2 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">
          {totalMinutes ? `${Math.round(totalMinutes)} min` : "0 min"}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {ranges.map((range) => (
          <span
            key={`${range.start.toISOString()}-${range.end.toISOString()}`}
            className="rounded-full border border-white/60 bg-white/80 px-3 py-1 text-xs text-foreground"
          >
            {formatTime(range.start)} - {formatTime(range.end)}
          </span>
        ))}
        {!ranges.length ? (
          <span className="text-xs text-muted-foreground">Nessuna disponibilità.</span>
        ) : null}
      </div>
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="glass-panel glass-strong flex items-center justify-center p-6 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

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
    <div className="space-y-2 rounded-2xl border border-white/60 bg-white/70 p-3">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
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
