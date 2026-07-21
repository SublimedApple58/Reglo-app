"use client";

import Image from "next/image";
import { ChevronLeft, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineToggle } from "@/components/ui/inline-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROTO_SELECT_TRIGGER } from "@/components/ui/proto-styles";
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
  defaultLicenseCategory: string;
  defaultTransmission: string;
  followCarMotoEnabled: boolean;
  /** Auto-save: applica e persiste subito il campo modificato. */
  updateVehicleSettings: (patch: {
    vehiclesEnabled?: boolean;
    defaultLicenseCategory?: string;
    defaultTransmission?: string;
    followCarMotoEnabled?: boolean;
  }) => void;
  openCreateVehicle: () => void;
  /** Dettaglio veicolo inline (proto veic-detail-view): stato e azioni. */
  detailView: { vehicleId: string; tab: "disp" | "dettagli" } | null;
  openDetail: (vehicle: VehicleDetail, tab: "disp" | "dettagli") => void;
  closeDetail: () => void;
  setDetailTab: (tab: "disp" | "dettagli") => void;
  /** Contenuti dei tab, costruiti dalla pagina (dove vive lo stato). */
  detailsForm: React.ReactNode;
  availabilityEditor: React.ReactNode;
};

const pad = (value: number) => value.toString().padStart(2, "0");
const formatMinutes = (totalMinutes: number) =>
  `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;

/** Sottotitolo riga veicolo dal proto: "HA996EF · B · Manuale · 00:00–23:30". */
function vehicleSubtitle(vehicle: VehicleDetail, wa: VehicleWeeklyAvailability | null) {
  const parts: string[] = [];
  if (vehicle.plate) parts.push(vehicle.plate);
  parts.push(vehicle.licenseCategory);
  parts.push(TRANSMISSION_LABELS[vehicle.transmission as Transmission] ?? vehicle.transmission);
  if (wa) parts.push(`${formatMinutes(wa.startMinutes)}–${formatMinutes(wa.endMinutes)}`);
  if (vehicle.assignedInstructorId) parts.push("Esclusivo");
  else if (vehicle.poolInstructorIds.length) parts.push(`Pool · ${vehicle.poolInstructorIds.length}`);
  if (vehicle.status === "maintenance") parts.push("In manutenzione");
  if (vehicle.status === "inactive") parts.push("Inattivo");
  return parts.join(" · ");
}

/** Link azione stile "Gestisci" del proto (underline che si ispessisce). */
const MANAGE_LINK =
  "shrink-0 cursor-pointer whitespace-nowrap text-sm font-semibold text-foreground underline underline-offset-2 decoration-1 transition-colors hover:text-black hover:decoration-2";

/**
 * Pane Veicoli dal proto (config-tab-veicoli): riga flat "Modulo veicoli" con
 * toggle, card "Percorso patente di default", riga flat "Auto al seguito",
 * lista veicoli a righe flat con link Gestisci/Disponibilità e riga "Nuovo
 * veicolo" con illustrazione. Le azioni aprono i dialog esistenti.
 */
export default function VehiclesTab({
  vehicles,
  vehicleWeeklyAvailability,
  vehiclesEnabled,
  defaultLicenseCategory,
  defaultTransmission,
  followCarMotoEnabled,
  updateVehicleSettings,
  openCreateVehicle,
  detailView,
  openDetail,
  closeDetail,
  setDetailTab,
  detailsForm,
  availabilityEditor,
}: VehiclesTabProps) {
  // ── Vista DETTAGLIO inline (proto veic-detail-view) ──
  const detailVehicle = detailView
    ? vehicles.find((v) => v.id === detailView.vehicleId) ?? null
    : null;
  if (detailView && detailVehicle) {
    const TABS = [
      { key: "disp" as const, label: "Disponibilità" },
      { key: "dettagli" as const, label: "Dettagli" },
    ];
    return (
      <div>
        <button
          type="button"
          onClick={closeDetail}
          className="mb-3.5 inline-flex cursor-pointer select-none items-center gap-1.5 text-[13px] font-semibold text-[#6a6a6a] transition-colors hover:text-[#222222]"
        >
          <ChevronLeft className="size-4" strokeWidth={1.8} />
          Veicoli
        </button>
        <div className="text-2xl font-bold tracking-[-0.3px] text-[#222222]">{detailVehicle.name}</div>
        <div className="mt-[3px] text-[13.5px] font-medium text-[#929292]">
          Gestisci disponibilità e dati del veicolo
        </div>
        <div className="mb-6 mt-5 flex flex-wrap items-center gap-[26px] border-b border-[#e8e8e8]">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setDetailTab(t.key)}
              className={cn(
                "-mb-px cursor-pointer select-none whitespace-nowrap border-b-[2.5px] px-px pb-3 text-[15px] transition-colors",
                detailView.tab === t.key
                  ? "border-[#222222] font-semibold text-[#222222]"
                  : "border-transparent font-medium text-[#6a6a6a] hover:text-[#222222]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="max-w-[640px]">
          {detailView.tab === "disp" ? availabilityEditor : detailsForm}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Modulo veicoli (riga flat dal proto) ── */}
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-[#eeeeee] py-3.5">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">Modulo veicoli</div>
          <div className="mt-0.5 text-[13px] font-medium leading-normal text-[#929292]">
            {vehiclesEnabled
              ? "Attivo — i veicoli vengono tracciati e assegnati alle guide."
              : "Disattivo — le guide non richiedono un veicolo."}
          </div>
        </div>
        <InlineToggle
          checked={vehiclesEnabled}
          onChange={() => updateVehicleSettings({ vehiclesEnabled: !vehiclesEnabled })}
          size="lg"
        />
      </div>

      {vehiclesEnabled && (
        <>
          {/* ── Percorso patente di default (card dal proto) ── */}
          <div className="mb-5 rounded-[14px] border border-[#dddddd] bg-white px-6 py-5">
            <div className="text-[15px] font-semibold text-foreground">Percorso patente di default</div>
            <div className="mt-0.5 text-[13px] font-medium text-[#929292]">
              Assegnato ai nuovi allievi alla registrazione.
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold text-[#555555]">Categoria</div>
                <Select
                  value={defaultLicenseCategory}
                  onValueChange={(v) => updateVehicleSettings({ defaultLicenseCategory: v })}
                >
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
                <div className="mb-2 text-xs font-semibold text-[#555555]">Cambio</div>
                <Select
                  value={defaultTransmission}
                  onValueChange={(v) => updateVehicleSettings({ defaultTransmission: v })}
                >
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
          </div>

          {/* ── Auto al seguito (riga flat dal proto) ── */}
          <div className="mb-1 flex items-center justify-between gap-4 border-b border-[#eeeeee] py-3.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Auto al seguito (moto)</div>
              <div className="mt-0.5 text-[13px] font-medium leading-normal text-[#929292]">
                Quando attivo, ogni guida moto prenota anche un&apos;auto al seguito; entrambi i
                veicoli risultano occupati in agenda.
              </div>
            </div>
            <InlineToggle
              checked={followCarMotoEnabled}
              onChange={() => updateVehicleSettings({ followCarMotoEnabled: !followCarMotoEnabled })}
              size="lg"
            />
          </div>

          {/* ── Lista veicoli (righe flat dal proto) ── */}
          <div className="max-w-[760px]">
            {vehicles.map((vehicle) => {
              const wa = vehicleWeeklyAvailability[vehicle.id] ?? null;
              return (
                <div
                  key={vehicle.id}
                  data-testid="vehicle-card"
                  className="flex items-start justify-between gap-4 border-b border-[#eeeeee] py-[18px]"
                >
                  <div className={vehicle.status === "inactive" ? "min-w-0 opacity-50" : "min-w-0"}>
                    <div className="text-base font-semibold text-foreground">{vehicle.name}</div>
                    <div className="mt-1 text-[13px] font-medium leading-normal text-[#929292]">
                      {vehicleSubtitle(vehicle, wa)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openDetail(vehicle, "disp")}
                    className={cn(MANAGE_LINK, "pt-0.5")}
                  >
                    Gestisci
                  </button>
                </div>
              );
            })}

            {/* Riga "Nuovo veicolo" con illustrazione (dal proto) */}
            <button
              type="button"
              onClick={openCreateVehicle}
              className="flex cursor-pointer items-center gap-3 py-[18px] text-navy-900 transition-opacity hover:opacity-75"
            >
              <span className="relative size-[46px] shrink-0">
                <Image
                  src="/images/settings/veicolo-nuovo.png"
                  alt=""
                  width={46}
                  height={46}
                  className="block size-[46px] object-contain"
                />
                <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-white bg-navy-900">
                  <Plus className="size-2.5 text-white" strokeWidth={2.6} />
                </span>
              </span>
              <span className="text-sm font-semibold">Nuovo veicolo</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
