"use client";

import React from "react";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
import { DatePicker } from "@/components/ui/date-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
const CHANNEL_OPTIONS = [
  { value: "push", label: "Push" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
] as const;
type ChannelValue = (typeof CHANNEL_OPTIONS)[number]["value"];

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

  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Disponibilità istruttori e veicoli"
      hideHero
      contentWidthClassName="max-w-[1600px]"
    >
      <div className="space-y-5">
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
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? "Salvataggio..." : "Salva impostazioni"}
            </Button>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Istruttori</h3>
            {loading ? (
              <span className="text-xs text-muted-foreground">Aggiornamento...</span>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
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
          <div className="grid gap-3 md:grid-cols-2">
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
