"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { LoadingDots } from "@/components/ui/loading-dots";
import { bandLocationConflicts, type BandAppointment } from "@/lib/autoscuole/band-location";
import {
  setAgendaBandLocation,
  type BandLocationSnapshot,
} from "@/lib/actions/autoscuole-band-location.actions";

export type BandMenuLocation = {
  id: string;
  name: string;
  address: string | null;
  isPrecise: boolean;
};

export type BandMenuAppointment = BandAppointment & {
  /** «Alice Verdi · 09:30–10:30» */
  label: string;
};

export type BandLocationChange = {
  snapshot: BandLocationSnapshot;
  fromName: string;
  toName: string;
  everyWeekday: boolean;
  keptOverrides: number;
};

const ALL = "Tutti i luoghi";
const pad = (n: number) => String(n).padStart(2, "0");
const hm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const weekdayName = (d: Date) => d.toLocaleDateString("it-IT", { weekday: "long" });

function AlertGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="mt-px size-3.5 shrink-0" fill="none" stroke="#111111" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M8 4.8v3.6M8 10.9v.1" />
    </svg>
  );
}

/**
 * REG-717 — scritta del luogo sulla fascia che apre il menu compatto per
 * cambiarlo (anteprime approvate il 04/11/2026, agenda-cambio-luogo). A riposo
 * è la stessa scritta grigia di REG-705; al passaggio si scurisce con un fondo
 * appena accennato e mostra la freccina.
 */
export function BandLocationMenu({
  label,
  size,
  top,
  instructorId,
  instructorName,
  day,
  band,
  locations,
  defaultLocationId,
  appointments,
  onChanged,
  onError,
}: {
  label: string;
  size: "day" | "week";
  top: number;
  instructorId: string;
  instructorName: string;
  day: Date;
  band: { startMinutes: number; endMinutes: number; locationId: string | null; inWeekly: boolean };
  locations: BandMenuLocation[];
  defaultLocationId: string | null;
  appointments: BandMenuAppointment[];
  onChanged: (change: BandLocationChange) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [everyWeekday, setEveryWeekday] = React.useState(false);
  const [pending, setPending] = React.useState<string | null | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setPending(undefined);
      setEveryWeekday(false);
    }
  }, [open]);

  const current = band.locationId;
  const nameOf = (id: string | null) => (id ? (locations.find((l) => l.id === id)?.name ?? ALL) : ALL);
  const conflicts = pending === undefined ? [] : bandLocationConflicts(appointments, band, pending, defaultLocationId);

  const apply = async (locationId: string | null) => {
    setBusy(true);
    const res = await setAgendaBandLocation({
      instructorId,
      date: ymd(day),
      startMinutes: band.startMinutes,
      endMinutes: band.endMinutes,
      locationId,
      everyWeekday,
    });
    setBusy(false);
    if (!res.success) {
      onError(res.message);
      return;
    }
    setOpen(false);
    onChanged({
      snapshot: res.data.snapshot,
      fromName: nameOf(current),
      toName: nameOf(locationId),
      everyWeekday,
      keptOverrides: res.data.keptOverrides,
    });
  };

  const pick = (locationId: string | null) => {
    if (busy) return;
    if (locationId === current) {
      setOpen(false);
      return;
    }
    if (bandLocationConflicts(appointments, band, locationId, defaultLocationId).length) {
      setPending(locationId);
      return;
    }
    void apply(locationId);
  };

  const conflictPlaces = Array.from(new Set(conflicts.map((c) => nameOf(c.locationId ?? defaultLocationId))));
  const conflictTitle =
    conflicts.length === 1
      ? `1 guida resta a ${conflictPlaces[0]}`
      : conflictPlaces.length === 1
        ? `${conflicts.length} guide restano a ${conflictPlaces[0]}`
        : `${conflicts.length} guide restano negli altri luoghi`;

  const item =
    "flex w-full cursor-pointer items-center justify-between gap-3 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] font-medium text-[#222222] outline-none transition-colors duration-150 hover:bg-[#f6f6f6] focus-visible:bg-[#f6f6f6]";
  const options: Array<{ id: string | null; name: string; sub: string }> = [
    { id: null, name: ALL, sub: "Vale per ogni allievo" },
    ...locations.map((l) => ({
      id: l.id,
      name: l.name,
      sub: l.isPrecise && l.address ? l.address : "Posizione generica",
    })),
  ];
  const dayLabel = day.toLocaleDateString("it-IT", { weekday: "long", day: "numeric" });
  const weekday = weekdayName(day);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          title={label}
          aria-label={`Luogo della fascia ${hm(band.startMinutes)}–${hm(band.endMinutes)}: ${label}`}
          data-agenda-band-location
          className={cn(
            "group/band absolute z-[2] inline-flex max-w-[calc(100%-10px)] cursor-pointer items-center gap-[3px] rounded-[6px] font-medium leading-[14px] outline-none animate-in fade-in-0 duration-200",
            "transition-[color,background-color,box-shadow] duration-200 ease-out",
            "hover:bg-white/75 hover:text-[#111111] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.06)]",
            "focus-visible:bg-white/75 focus-visible:text-[#111111] focus-visible:shadow-[0_0_0_1px_rgba(0,0,0,0.06)]",
            "data-[state=open]:bg-white/75 data-[state=open]:text-[#111111] data-[state=open]:shadow-[0_0_0_1px_rgba(0,0,0,0.06)]",
            size === "day" ? "left-1 h-5 px-1 text-[10.5px]" : "left-0.5 h-[18px] px-1 text-[10px]",
            current ? "text-[#111111]/[0.58]" : "text-[#111111]/[0.38]",
          )}
          style={{ top: top - 3 }}
        >
          <span key={label} className="truncate animate-in fade-in-0 duration-200">
            {label}
          </span>
          <ChevronDown
            className="size-[9px] shrink-0 -translate-y-px opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover/band:translate-y-0 group-hover/band:opacity-100 group-focus-visible/band:opacity-100 group-data-[state=open]/band:translate-y-0 group-data-[state=open]/band:opacity-100"
            strokeWidth={2.4}
          />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid="band-location-menu"
          className="relative z-[210] w-[264px] origin-[var(--radix-popover-content-transform-origin)] rounded-[14px] bg-white p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_18px_40px_-12px_rgba(0,0,0,0.28)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] duration-200"
        >
          <div className="px-2.5 pb-1.5 pt-2">
            <div className="text-[12px] font-semibold text-[#111111]">
              Luogo della fascia {hm(band.startMinutes)}–{hm(band.endMinutes)}
            </div>
            <div className="mt-px truncate text-[11.5px] font-medium text-[#9a9a9a]">
              {instructorName} · {day.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>
          {options.map((o, i) => (
            <React.Fragment key={o.id ?? "all"}>
              {i === 1 && <div className="mx-2 my-1 h-px bg-[#f0f0f0]" />}
              <button
                type="button"
                className={cn(item, pending === o.id && "bg-[#f6f6f6]")}
                onClick={() => pick(o.id)}
                disabled={busy}
                data-testid="band-location-option"
              >
                <div className="min-w-0">
                  <div className="truncate">{o.name}</div>
                  <div className="mt-px truncate text-[11.5px] font-medium text-[#9a9a9a]">{o.sub}</div>
                </div>
                {o.id === current ? <Check className="size-3.5 shrink-0 text-[#111111]" strokeWidth={2.4} /> : null}
              </button>
              {pending === o.id && conflicts.length > 0 && (
                <div
                  className="mx-1 mb-1 mt-0.5 rounded-[10px] bg-[#f7f7f7] px-2.5 pb-2 pt-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-200"
                  data-testid="band-location-warning"
                >
                  <div className="flex items-start gap-[7px] text-[12.5px] font-semibold text-[#111111]">
                    <AlertGlyph />
                    <span>{conflictTitle}</span>
                  </div>
                  <ul className="ml-[21px] mt-1.5 list-disc space-y-0.5 text-[11.5px] font-medium leading-[1.5] text-[#6a6a6a]">
                    {conflicts.slice(0, 4).map((c) => (
                      <li key={c.id}>{c.label}</li>
                    ))}
                    {conflicts.length > 4 && <li>e altre {conflicts.length - 4}</li>}
                  </ul>
                  <p className="ml-[21px] mt-1.5 text-[11.5px] font-medium leading-[1.45] text-[#9a9a9a]">
                    Le guide già prenotate non si spostano. Il nuovo luogo vale per le prossime prenotazioni.
                  </p>
                  <div className="mt-2.5 flex justify-end gap-1.5">
                    <button
                      type="button"
                      className="h-[30px] cursor-pointer rounded-[9px] px-3 text-[12.5px] font-medium text-[#222222] transition-colors duration-150 hover:bg-black/[0.04]"
                      onClick={() => setPending(undefined)}
                      disabled={busy}
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-[30px] min-w-[128px] cursor-pointer items-center justify-center rounded-[9px] bg-[#111111] px-3 text-[12.5px] font-medium text-white transition-opacity duration-150 hover:opacity-90"
                      onClick={() => void apply(o.id)}
                      disabled={busy}
                      data-testid="band-location-confirm"
                    >
                      {busy ? <LoadingDots className="scale-[0.5]" /> : "Cambia comunque"}
                    </button>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
          <div className="mx-2 my-1 h-px bg-[#f0f0f0]" />
          <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1 text-[12px] font-medium">
            <span className={cn("transition-colors duration-200", everyWeekday ? "text-[#9a9a9a]" : "text-[#6a6a6a]")}>
              Solo {dayLabel}
            </span>
            {band.inWeekly && (
              <button
                type="button"
                role="switch"
                aria-checked={everyWeekday}
                onClick={() => setEveryWeekday((v) => !v)}
                disabled={busy}
                data-testid="band-location-every-weekday"
                className="inline-flex cursor-pointer items-center gap-[7px] text-[#222222]"
              >
                Ogni {weekday}
                <span
                  className={cn(
                    "relative h-4 w-7 rounded-full transition-colors duration-200 ease-out",
                    everyWeekday ? "bg-[#111111]" : "bg-[#e4e4e4]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-0.5 top-0.5 size-3 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-200 ease-out",
                      everyWeekday && "translate-x-3",
                    )}
                  />
                </span>
              </button>
            )}
          </div>
          {busy && pending === undefined && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[14px] bg-white/60 animate-in fade-in-0 duration-150">
              <LoadingDots className="scale-[0.6]" />
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
