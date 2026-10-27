"use client";

import * as React from "react";
import { IconMotorbike } from "@tabler/icons-react";
import { ArrowLeftRight, ArrowRight, Check, ChevronDown, Info, RotateCw } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingDots } from "@/components/ui/loading-dots";
import { motoChoicesForSeat, type FleetVehicle, type MotoChangePlan, type MotoSeat } from "@/lib/autoscuole/group-moto";
import { cn } from "@/lib/utils";

/**
 * REG-636 — per-participant moto of a moto group lesson (web roster).
 *
 * `GroupMotoTrigger` replaces the old read-only "Honda CB500F · A2" line under
 * the student's name: a light orange trigger that opens a menu with ONLY the
 * fleet motos serving the student's license (current → free → held by a
 * sibling, i.e. a swap) plus "A rotazione". `GroupMotoSwapConfirm` is the
 * inline confirm the dialog shows under the row when the pick is a swap.
 */

export type FleetMoto = FleetVehicle & { name: string };

/** "Luca B." — the short form used for the holder in the menu. */
export const shortStudentName = (displayName: string) => {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || "Allievo";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
};
/** "Luca" — the first word of the displayed name, for the swap confirm. */
export const firstStudentName = (displayName: string) => displayName.trim().split(/\s+/)[0] || "Allievo";

const initials = (displayName: string) =>
  displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "A";

function MotoLabel({ moto }: { moto: FleetMoto }) {
  return (
    <>
      {moto.name}
      {moto.licenseCategory ? <span className="font-medium text-[#929292]"> · {moto.licenseCategory}</span> : null}
    </>
  );
}

export function GroupMotoTrigger({
  appointmentId,
  fleet,
  seats,
  displayNames,
  saving,
  disabled,
  onPick,
}: {
  appointmentId: string;
  fleet: FleetMoto[];
  seats: MotoSeat[];
  /** appointmentId → the student's name as displayed in the roster. */
  displayNames: Map<string, string>;
  saving: boolean;
  disabled: boolean;
  onPick: (vehicleId: string | null) => void;
}) {
  const seat = seats.find((s) => s.appointmentId === appointmentId);
  const current = seat?.vehicleId ? fleet.find((m) => m.id === seat.vehicleId) ?? null : null;
  const { choices, incompatibleVehicleIds } = motoChoicesForSeat({ fleet, seats, appointmentId });
  const studentName = displayNames.get(appointmentId) ?? "Allievo";
  const incompatible = incompatibleVehicleIds
    .map((id) => fleet.find((m) => m.id === id))
    .filter((m): m is FleetMoto => Boolean(m));
  const onRotation = !seat?.vehicleId;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          data-testid={`moto-trigger-${appointmentId}`}
          className={cn(
            "group -ml-[7px] mt-[3px] inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-[1.5px] border-transparent py-[3px] pl-[7px] pr-2 text-[12.5px] font-medium transition-colors disabled:cursor-default disabled:opacity-60",
            onRotation
              ? "text-[#6a6a6a] hover:bg-[#f5f5f5] data-[state=open]:border-[#e5e5e5] data-[state=open]:bg-[#f5f5f5]"
              : "text-[#C2410C] hover:bg-[#FFF4EA] data-[state=open]:border-[#FCD9B8] data-[state=open]:bg-[#FFF4EA]",
          )}
        >
          {saving ? (
            <LoadingDots className="scale-[0.55]" />
          ) : (
            <>
              {current ? (
                <IconMotorbike className="size-[15px] shrink-0" stroke={1.8} />
              ) : (
                <RotateCw className="size-[13px] shrink-0" strokeWidth={2} />
              )}
              {current ? (
                <span>
                  {current.name}
                  {current.licenseCategory ? <span className="text-[#d9864f]"> · {current.licenseCategory}</span> : null}
                </span>
              ) : (
                <span>A rotazione</span>
              )}
              <ChevronDown className="size-[13px] shrink-0 opacity-75" strokeWidth={2.2} />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-testid="moto-menu"
        align="start"
        sideOffset={6}
        className="w-[316px] rounded-[14px] border-[#ececec] bg-white p-1.5 shadow-[0_2px_4px_rgba(0,0,0,.04),0_16px_36px_-8px_rgba(0,0,0,.18)]"
      >
        <p className="px-2.5 pb-1.5 pt-2 text-[11.5px] font-semibold text-[#929292]">
          {seat?.license.licenseCategory ? `Moto per patente ${seat.license.licenseCategory}` : "Moto della guida"}
        </p>
        {choices.map((c) => {
          const moto = fleet.find((m) => m.id === c.vehicleId)!;
          const holderName = c.holderAppointmentId ? displayNames.get(c.holderAppointmentId) ?? "Allievo" : "";
          return (
            <DropdownMenuItem
              key={c.vehicleId}
              data-testid={`moto-option-${c.vehicleId}`}
              onSelect={() => {
                if (c.state !== "current") onPick(c.vehicleId);
              }}
              className="cursor-pointer gap-2.5 rounded-[9px] px-2.5 py-2 focus:bg-[#f7f7f7]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-[#222222]">
                  <MotoLabel moto={moto} />
                </span>
                {c.state === "current" ? (
                  <span className="mt-px block text-xs font-medium text-[#929292]">
                    Assegnata a {firstStudentName(studentName)}
                  </span>
                ) : c.state === "free" ? (
                  <span className="mt-px flex items-center gap-[5px] text-xs font-medium text-[#3f7d4f]">
                    <span className="size-1.5 rounded-full bg-current" />
                    Libera
                  </span>
                ) : (
                  <span className="mt-px flex items-center gap-[5px] text-xs font-medium text-[#C2410C]">
                    <ArrowLeftRight className="size-3 text-[#C2410C]" strokeWidth={2} />
                    Con {shortStudentName(holderName)} · scambio
                  </span>
                )}
              </span>
              {c.state === "current" ? (
                <Check className="size-4 text-[#222222]" strokeWidth={2.4} />
              ) : c.state === "taken" ? (
                <span className="flex size-[18px] items-center justify-center rounded-full bg-[#f2f2f2] text-[8.5px] font-semibold text-[#555555]">
                  {initials(holderName)}
                </span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="mx-1 my-[5px] bg-[#f0f0f0]" />
        <DropdownMenuItem
          data-testid="moto-option-rotation"
          onSelect={() => {
            if (!onRotation) onPick(null);
          }}
          className="cursor-pointer gap-2.5 rounded-[9px] px-2.5 py-2 focus:bg-[#f7f7f7]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold text-[#222222]">A rotazione</span>
            <span className="mt-px block text-xs font-medium text-[#929292]">Nessuna moto fissa, si alterna</span>
          </span>
          {onRotation ? <Check className="size-4 text-[#222222]" strokeWidth={2.4} /> : null}
        </DropdownMenuItem>
        {incompatible.length ? (
          <p className="px-2.5 py-1.5 text-[11.5px] font-medium leading-[1.4] text-[#a3a3a3]">
            {incompatible.length === 1 ? (
              <>
                La {incompatible[0].name}
                {incompatible[0].licenseCategory ? ` (${incompatible[0].licenseCategory})` : ""} non compare:{" "}
                {firstStudentName(studentName)} non può guidarla.
              </>
            ) : (
              <>
                {incompatible.length} moto della guida non compaiono: {firstStudentName(studentName)} non può
                guidarle.
              </>
            )}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Copy shared with mobile: who ends up on what, and why someone goes to rotation. */
export function describeMotoSwap(args: {
  plan: Extract<MotoChangePlan, { kind: "swap" }>;
  moverName: string;
  otherName: string;
  pickedMoto: FleetMoto;
  fleet: FleetMoto[];
  otherLicenseCategory: string | null;
}) {
  const { plan, moverName, otherName, pickedMoto, fleet, otherLicenseCategory } = args;
  const otherNext = plan.otherNextVehicleId ? fleet.find((m) => m.id === plan.otherNextVehicleId) ?? null : null;
  const blocked = plan.otherBlockedVehicleId ? fleet.find((m) => m.id === plan.otherBlockedVehicleId) ?? null : null;
  const cleanSwap = Boolean(otherNext);
  const title = cleanSwap
    ? `Scambiare le moto con ${otherName}?`
    : `Dare a ${moverName} la moto di ${otherName}?`;
  let warning: string | null = null;
  if (!cleanSwap) {
    warning = blocked
      ? `${otherName} passerà ad A rotazione: non può guidare la ${blocked.name}${
          blocked.licenseCategory ? ` (${blocked.licenseCategory})` : ""
        }${otherLicenseCategory ? `, la sua patente è ${otherLicenseCategory}` : ""}.`
      : `${otherName} passerà ad A rotazione: ${moverName} non ha una moto fissa da cedere in cambio.`;
  }
  return { title, otherNext, cleanSwap, warning, pickedMoto };
}

export function GroupMotoSwapConfirm({
  moverName,
  otherName,
  description,
  busy,
  onConfirm,
  onCancel,
}: {
  moverName: string;
  otherName: string;
  description: ReturnType<typeof describeMotoSwap>;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { title, otherNext, cleanSwap, warning, pickedMoto } = description;
  const row = (name: string, target: React.ReactNode, rotation = false) => (
    <div className="grid grid-cols-[22px_92px_18px_1fr] items-center gap-2 text-[13px] font-medium">
      <span className="flex size-[22px] items-center justify-center rounded-full border border-[#f1e3d6] bg-white text-[9.5px] font-semibold text-[#555555]">
        {initials(name)}
      </span>
      <span className="truncate">{firstStudentName(name)}</span>
      <ArrowRight className="size-4 text-[#d9a27c]" strokeWidth={2} />
      <span className={cn("font-semibold", rotation && "font-medium text-[#6a6a6a]")}>{target}</span>
    </div>
  );
  return (
    <div
      data-testid="moto-swap-confirm"
      className="mt-3 rounded-xl border-[1.5px] border-[#FCD9B8] bg-[#FFFAF5] p-3.5 animate-in fade-in-0 slide-in-from-top-1 duration-200"
    >
      <p className="mb-2.5 text-sm font-semibold text-foreground">{title}</p>
      <div className="flex flex-col gap-2">
        {row(moverName, <MotoLabel moto={pickedMoto} />)}
        {row(otherName, otherNext ? <MotoLabel moto={otherNext} /> : "A rotazione", !otherNext)}
      </div>
      {warning ? (
        <p className="mt-3 flex items-start gap-2 rounded-[9px] border border-[#f6dcc6] bg-white px-[11px] py-[9px] text-[12.5px] font-medium leading-[1.45] text-[#7c3a10]">
          <Info className="mt-px size-[15px] shrink-0 text-[#C2410C]" strokeWidth={2} />
          <span>{warning}</span>
        </p>
      ) : null}
      <div className="mt-3.5 flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="flex min-h-[34px] min-w-[86px] cursor-pointer items-center justify-center rounded-full bg-[#111111] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
        >
          {busy ? <LoadingDots className="scale-[0.6]" /> : cleanSwap ? "Scambia" : "Conferma"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="cursor-pointer px-3 py-2 text-[13px] font-semibold text-foreground underline underline-offset-[3px] hover:decoration-2"
        >
          Annulla
        </button>
      </div>
    </div>
  );
}
