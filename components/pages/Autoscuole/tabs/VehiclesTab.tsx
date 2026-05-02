"use client";

import { Plus, Clock, Pencil, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { ResourceCard, SlotPill, ResourceCardAction } from "@/components/ui/resource-card";

type VehicleDetail = { id: string; name: string; plate: string | null; status: string };
type VehicleWeeklyAvailability = { daysOfWeek: number[]; startMinutes: number; endMinutes: number; ranges?: Array<{ startMinutes: number; endMinutes: number }> };
type AvailabilityRange = { start: Date; end: Date };

export type VehiclesTabProps = {
  vehicles: VehicleDetail[];
  vehicleWeeklyAvailability: Record<string, VehicleWeeklyAvailability>;
  vehicleAvailability: Record<string, AvailabilityRange[]>;
  loading: boolean;
  vehiclesEnabled: boolean;
  setVehiclesEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  openCreateVehicle: () => void;
  openEditVehicle: (vehicle: VehicleDetail) => void;
  openAvailabilityDialog: (vehicle: VehicleDetail) => void;
  handleSaveSettings: () => Promise<void>;
  savingSettings: boolean;
};

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Gio" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
] as const;

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${pad(hours)}:${pad(minutes)}`;
}

function formatTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function diffMinutes(a: Date, b: Date) {
  return (a.getTime() - b.getTime()) / 60000;
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

export default function VehiclesTab({
  vehicles,
  vehicleWeeklyAvailability,
  vehicleAvailability,
  loading,
  vehiclesEnabled,
  setVehiclesEnabled,
  openCreateVehicle,
  openEditVehicle,
  openAvailabilityDialog,
  handleSaveSettings,
  savingSettings,
}: VehiclesTabProps) {
  return (
    <>
      <div className="rounded-2xl border border-border bg-white shadow-card p-4">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setVehiclesEnabled((prev) => !prev)}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">Modulo veicoli</span>
            <span className="text-xs text-muted-foreground">
              {vehiclesEnabled
                ? "Attivo — i veicoli vengono tracciati e assegnati alle guide"
                : "Disattivo — le guide non richiedono un veicolo"}
            </span>
          </div>
          <InlineToggle checked={vehiclesEnabled} size="sm" />
        </div>
      </div>
      {vehiclesEnabled && (
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
      <div className="flex justify-end">
        <Button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="bg-pink-500 text-white hover:bg-pink-600 rounded-full px-6 py-2.5 text-sm font-semibold shadow-md"
        >
          {savingSettings ? "Salvataggio..." : "Salva configurazione"}
        </Button>
      </div>
    </>
  );
}
