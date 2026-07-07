"use client";

import Image from "next/image";
import { Plus, Clock, Pencil, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { ResourceCard, SlotPill, ResourceCardAction } from "@/components/ui/resource-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LICENSE_CATEGORIES,
  LICENSE_CATEGORY_LABELS,
  TRANSMISSIONS,
  TRANSMISSION_LABELS,
  type Transmission,
} from "@/lib/autoscuole/license";

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
type VehicleWeeklyAvailability = { daysOfWeek: number[]; startMinutes: number; endMinutes: number; ranges?: Array<{ startMinutes: number; endMinutes: number }> };
type AvailabilityRange = { start: Date; end: Date };

export type VehiclesTabProps = {
  vehicles: VehicleDetail[];
  vehicleWeeklyAvailability: Record<string, VehicleWeeklyAvailability>;
  vehicleAvailability: Record<string, AvailabilityRange[]>;
  loading: boolean;
  vehiclesEnabled: boolean;
  setVehiclesEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  defaultLicenseCategory: string;
  setDefaultLicenseCategory: React.Dispatch<React.SetStateAction<string>>;
  defaultTransmission: string;
  setDefaultTransmission: React.Dispatch<React.SetStateAction<string>>;
  followCarMotoEnabled: boolean;
  setFollowCarMotoEnabled: React.Dispatch<React.SetStateAction<boolean>>;
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
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
        {vehicles.map((vehicle) => {
          const wa = vehicleWeeklyAvailability[vehicle.id] ?? null;
          const ranges = vehicleAvailability[vehicle.id] ?? [];
          const totalMinutes = ranges.reduce((sum, r) => sum + diffMinutes(r.end, r.start), 0);
          return (
            <ResourceCard
              key={vehicle.id}
              testId="vehicle-card"
              name={vehicle.name}
              subtitle={
                <span className="flex items-center gap-1.5">
                  {vehicle.plate ? (
                    <span className="flex items-center gap-1">
                      <Car className="size-3" />
                      {vehicle.plate}
                    </span>
                  ) : null}
                  <span className="rounded-[6px] bg-[#f2f2f2] px-[7px] py-0.5 text-[11px] font-semibold text-[#6a6a6a]">
                    {vehicle.licenseCategory} ·{" "}
                    {TRANSMISSION_LABELS[vehicle.transmission as Transmission] ??
                      vehicle.transmission}
                  </span>
                  {vehicle.assignedInstructorId ? (
                    <span className="rounded-[6px] border border-[#cfcfdc] bg-[#eef0f6] px-[7px] py-0.5 text-[11px] font-semibold text-navy-900">
                      Esclusivo
                    </span>
                  ) : vehicle.poolInstructorIds.length ? (
                    <span className="rounded-[6px] border border-[#cfcfdc] bg-[#eef0f6] px-[7px] py-0.5 text-[11px] font-semibold text-navy-900">
                      Pool · {vehicle.poolInstructorIds.length}
                    </span>
                  ) : (
                    <span className="rounded-[6px] bg-[#f2f2f2] px-[7px] py-0.5 text-[11px] font-semibold text-[#6a6a6a]">
                      Aperto
                    </span>
                  )}
                  {vehicle.status === "maintenance" ? (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      Manutenzione
                    </span>
                  ) : null}
                </span>
              }
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
        {/* Card dashed "Nuovo veicolo" (stile proto) */}
        <button
          type="button"
          onClick={openCreateVehicle}
          className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-[#d5d5d5] bg-transparent p-5 transition-colors hover:border-navy-900 hover:bg-navy-50"
        >
          <span className="relative size-[58px]">
            <span className="flex size-[58px] items-center justify-center overflow-hidden rounded-full bg-[#eef3f7]">
              <Image
                src="/images/settings/veicolo-nuovo.png"
                alt=""
                width={52}
                height={52}
                className="size-[52px] object-contain"
              />
            </span>
            <span className="absolute -bottom-px -right-px flex size-[22px] items-center justify-center rounded-full border-2 border-white bg-navy-900">
              <Plus className="size-3 text-white" strokeWidth={2.4} />
            </span>
          </span>
          <span className="text-sm font-semibold text-navy-900">Nuovo veicolo</span>
        </button>
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
  defaultLicenseCategory,
  setDefaultLicenseCategory,
  defaultTransmission,
  setDefaultTransmission,
  followCarMotoEnabled,
  setFollowCarMotoEnabled,
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
        <div className="rounded-2xl border border-border bg-white shadow-card p-4">
          <div className="flex flex-col gap-0.5 mb-3">
            <span className="text-sm font-semibold">Percorso patente di default</span>
            <span className="text-xs text-muted-foreground">
              Assegnato ai nuovi allievi alla registrazione. Le autoscuole moto
              possono impostarlo una volta sola (es. A1 · Manuale).
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Categoria</label>
              <Select value={defaultLicenseCategory} onValueChange={setDefaultLicenseCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LICENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{LICENSE_CATEGORY_LABELS[cat]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Cambio</label>
              <Select value={defaultTransmission} onValueChange={setDefaultTransmission}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSMISSIONS.map((t) => (
                    <SelectItem key={t} value={t}>{TRANSMISSION_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
      {vehiclesEnabled && (
        <div className="rounded-2xl border border-border bg-white shadow-card p-4">
          <div
            className="flex items-center justify-between gap-3 cursor-pointer"
            onClick={() => setFollowCarMotoEnabled((prev) => !prev)}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">Auto al seguito (moto)</span>
              <span className="text-xs text-muted-foreground">
                Quando attivo, ogni guida moto prenota anche un&apos;auto al seguito;
                entrambi i veicoli risultano occupati in agenda.
              </span>
            </div>
            <InlineToggle checked={followCarMotoEnabled} size="sm" />
          </div>
        </div>
      )}
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
          className="min-w-[180px]"
        >
          {savingSettings ? "Salvataggio..." : "Salva configurazione"}
        </Button>
      </div>
    </>
  );
}
