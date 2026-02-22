"use client";

import React from "react";

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
} from "@/lib/actions/autoscuole.actions";
import { getAvailabilitySlots } from "@/lib/actions/autoscuole-availability.actions";
import {
  getAutoscuolaSettings,
  updateAutoscuolaSettings,
} from "@/lib/actions/autoscuole-settings.actions";

type ResourceOption = { id: string; name: string };
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
  const [appBookingActors, setAppBookingActors] = React.useState<AppBookingActorsValue>("students");
  const [instructorBookingMode, setInstructorBookingMode] = React.useState<InstructorBookingModeValue>("manual_engine");
  const [instructors, setInstructors] = React.useState<ResourceOption[]>([]);
  const [vehicles, setVehicles] = React.useState<ResourceOption[]>([]);
  const [instructorAvailability, setInstructorAvailability] = React.useState<
    Record<string, AvailabilityRange[]>
  >({});
  const [vehicleAvailability, setVehicleAvailability] = React.useState<
    Record<string, AvailabilityRange[]>
  >({});

  const loadResources = React.useCallback(async () => {
    const [instructorRes, vehicleRes] = await Promise.all([
      getAutoscuolaInstructors(),
      getAutoscuolaVehicles(),
    ]);

    if (instructorRes.success && instructorRes.data) {
      setInstructors(
        instructorRes.data.map((item) => ({ id: item.id, name: item.name })),
      );
    }
    if (vehicleRes.success && vehicleRes.data) {
      setVehicles(vehicleRes.data.map((item) => ({ id: item.id, name: item.name })));
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

  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Disponibilità istruttori e veicoli"
      hideHero
      contentWidthClassName="max-w-[1600px]"
    >
      <div className="w-full space-y-5">
        {tabs}
        {!hideNav ? <AutoscuoleNav /> : null}

        <div className="glass-panel glass-strong flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <div className="text-sm font-semibold text-foreground">
              Disponibilità del giorno
            </div>
            <p className="text-xs text-muted-foreground">
              Seleziona una data per vedere gli slot disponibili.
            </p>
          </div>
          <div className="w-[280px]">
            <DatePicker value={date} onChange={setDate} />
          </div>
        </div>

        <div className="glass-panel glass-strong space-y-3 p-4">
          <div>
            <div className="text-sm font-semibold text-foreground">
              Reminder pre-guida
            </div>
            <p className="text-xs text-muted-foreground">
              Definisci con quanto preavviso inviare promemoria a allievo e istruttore.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Settimane disponibilità</div>
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
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Reminder allievo</div>
              <Select value={studentReminderMinutes} onValueChange={setStudentReminderMinutes}>
                <SelectTrigger>
                  <SelectValue placeholder="Minuti" />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {minutes} minuti
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Reminder istruttore</div>
              <Select value={instructorReminderMinutes} onValueChange={setInstructorReminderMinutes}>
                <SelectTrigger>
                  <SelectValue placeholder="Minuti" />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {minutes} minuti
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
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
          <div className="space-y-2 rounded-2xl border border-white/60 bg-white/70 p-3">
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
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      active
                        ? "border-[#324D7A] bg-[#324D7A]/15 text-foreground"
                        : "border-white/70 bg-white/85 text-muted-foreground"
                    }`}
                  >
                    {duration} min
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-3 rounded-2xl border border-white/60 bg-white/70 p-3">
            <div className="text-xs font-medium text-muted-foreground">
              Prenotazioni da app
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
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
                <div className="space-y-1">
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
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? "Salvataggio..." : "Salva impostazioni"}
            </Button>
          </div>
        </div>

        <div className="glass-panel glass-strong space-y-4 p-4">
          <div>
            <div className="text-sm font-semibold text-foreground">Regole tipi guida</div>
            <p className="text-xs text-muted-foreground">
              Regole opzionali su copertura tipi e finestre settimanali per ogni tipo guida.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-xs text-foreground">
              <span>Abilita policy tipi guida</span>
              <Checkbox
                checked={lessonPolicyEnabled}
                onCheckedChange={(checked) => setLessonPolicyEnabled(Boolean(checked))}
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-xs text-foreground">
              <span>Richiedi almeno 1 guida per tipo</span>
              <Checkbox
                checked={lessonRequiredTypesEnabled}
                onCheckedChange={(checked) => setLessonRequiredTypesEnabled(Boolean(checked))}
              />
            </label>
          </div>

          <div className="space-y-2 rounded-2xl border border-white/60 bg-white/70 p-3">
            <div className="text-xs font-medium text-muted-foreground">Tipi obbligatori</div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {LESSON_TYPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-xs"
                >
                  <span>{option.label}</span>
                  <Checkbox
                    checked={lessonRequiredTypes.includes(option.value)}
                    onCheckedChange={() => toggleRequiredType(option.value)}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground">
              Limiti per tipo guida (giorni + fascia oraria)
            </div>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
              {LESSON_TYPE_OPTIONS.map((option) => {
                const constraint = lessonConstraints[option.value] ?? DEFAULT_LESSON_CONSTRAINT;
                return (
                  <div
                    key={option.value}
                    className="space-y-3 rounded-2xl border border-white/60 bg-white/70 p-3"
                  >
                    <label className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-foreground">{option.label}</span>
                      <Checkbox
                        checked={constraint.enabled}
                        onCheckedChange={() => toggleConstraintEnabled(option.value)}
                      />
                    </label>
                    {constraint.enabled ? (
                      <>
                        <div className="grid grid-cols-4 gap-2">
                          {WEEKDAY_OPTIONS.map((day) => (
                            <button
                              key={`${option.value}-${day.value}`}
                              type="button"
                              onClick={() => toggleConstraintDay(option.value, day.value)}
                              className={`rounded-full border px-2 py-1 text-[11px] transition ${
                                constraint.daysOfWeek.includes(day.value)
                                  ? "border-[#324D7A] bg-[#324D7A]/15 text-foreground"
                                  : "border-white/70 bg-white/85 text-muted-foreground"
                              }`}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Select
                            value={String(constraint.startMinutes)}
                            onValueChange={(value) =>
                              updateConstraintWindow(option.value, "startMinutes", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Inizio" />
                            </SelectTrigger>
                            <SelectContent>
                              {START_TIME_OPTIONS.map((minutes) => (
                                <SelectItem key={`${option.value}-start-${minutes}`} value={String(minutes)}>
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
                            <SelectTrigger>
                              <SelectValue placeholder="Fine" />
                            </SelectTrigger>
                            <SelectContent>
                              {END_TIME_OPTIONS.map((minutes) => (
                                <SelectItem key={`${option.value}-end-${minutes}`} value={String(minutes)}>
                                  {formatMinutes(minutes)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">
                        Nessun limite attivo per questo tipo.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Istruttori</h3>
            {loading ? (
              <span className="text-xs text-muted-foreground">Aggiornamento...</span>
            ) : null}
          </div>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            {instructors.map((instructor) => (
              <AvailabilityCard
                key={instructor.id}
                title={instructor.name}
                ranges={instructorAvailability[instructor.id] ?? []}
              />
            ))}
            {!instructors.length ? (
              <EmptyCard label="Nessun istruttore disponibile." />
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Veicoli</h3>
            {loading ? (
              <span className="text-xs text-muted-foreground">Aggiornamento...</span>
            ) : null}
          </div>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            {vehicles.map((vehicle) => (
              <AvailabilityCard
                key={vehicle.id}
                title={vehicle.name}
                ranges={vehicleAvailability[vehicle.id] ?? []}
              />
            ))}
            {!vehicles.length ? <EmptyCard label="Nessun veicolo disponibile." /> : null}
          </div>
        </section>
      </div>
    </ClientPageWrapper>
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
            className="flex items-center justify-between gap-2 text-xs text-foreground"
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
