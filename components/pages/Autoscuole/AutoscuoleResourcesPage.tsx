"use client";

import React from "react";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
import { DatePicker } from "@/components/ui/date-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  getAutoscuolaInstructors,
  getAutoscuolaVehicles,
} from "@/lib/actions/autoscuole.actions";
import { getAvailabilitySlots } from "@/lib/actions/autoscuole-availability.actions";

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

export function AutoscuoleResourcesPage() {
  const toast = useFeedbackToast();
  const [date, setDate] = React.useState(() => formatDateLocal(new Date()));
  const [loading, setLoading] = React.useState(false);
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
    loadAvailability(date);
  }, [date, loadAvailability]);

  return (
    <ClientPageWrapper title="Autoscuole" subTitle="Disponibilità istruttori e veicoli" hideHero>
      <div className="space-y-5">
        <AutoscuoleNav />

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
