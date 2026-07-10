"use client";

import * as React from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Loader2, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { CreateEventPopover } from "@/components/pages/Autoscuole/dialogs/CreateEventPopover";
import { isMotoLicenseCategory, vehicleServesLicense, LICENSE_CATEGORY_LABELS, TRANSMISSION_LABELS, type LicenseCategory, type Transmission } from "@/lib/autoscuole/license";
import { instructorCanUseVehicle } from "@/lib/autoscuole/group-moto";
import {
  rescheduleAutoscuolaAppointment,
  updateAutoscuolaAppointmentDetails,
} from "@/lib/actions/autoscuole.actions";

type StudentLite = {
  firstName: string;
  lastName: string;
  // Pursued license — filters the eligible primary moto (moto hierarchy).
  licenseCategory?: string | null;
  transmission?: string | null;
};
type InstructorOption = { id: string; name: string };
type VehicleOption = {
  id: string;
  name: string;
  licenseCategory?: string | null;
  transmission?: string | null;
  // Pool/exclusivity — filters pickers to vehicles the instructor can use.
  assignedInstructorId?: string | null;
  poolInstructorIds?: string[] | null;
};
type LocationOption = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type EditAppointmentDialogAppointment = {
  id: string;
  startsAt: string | Date;
  endsAt?: string | Date | null;
  status: string;
  type: string | null;
  notes?: string | null;
  student: StudentLite;
  instructor?: { id?: string | null; name: string } | null;
  vehicle?: { id: string; name: string } | null;
  followVehicle?: { id: string; name: string } | null;
  extraMotoVehicles?: { id: string; name: string }[] | null;
  location?: { id: string; name: string } | null;
};

type Availability =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | {
      status: "unavailable";
      reason: "OVERLAP" | "BLOCK" | "HOLIDAY" | "INSTRUCTOR_INACTIVE";
      detail: string;
    }
  | { status: "error"; detail: string };

const LESSON_TYPE_OPTIONS = [
  { value: "guida", label: "Guida" },
  { value: "manovre", label: "Manovre" },
  { value: "urbano", label: "Urbano" },
  { value: "extraurbano", label: "Extraurbano" },
  { value: "notturna", label: "Notturna" },
  { value: "autostrada", label: "Autostrada" },
  { value: "parcheggio", label: "Parcheggio" },
  { value: "altro", label: "Altro" },
] as const;

const pad = (n: number) => n.toString().padStart(2, "0");
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 15, 30, 45]) {
      out.push(`${pad(h)}:${pad(m)}`);
    }
  }
  return out;
})();

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: EditAppointmentDialogAppointment | null;
  instructors: InstructorOption[];
  vehicles?: VehicleOption[];
  vehiclesEnabled?: boolean;
  followCarRules?: Record<string, { enabled: boolean }>;
  locations: LocationOption[];
  onSuccess?: () => void;
  /** Ancora viewport della card popover. */
  anchor?: { x: number; y: number } | null;
  /** Draft (data/ora/durata/istruttore) per il blocco ghost in agenda. */
  onDraftChange?: (draft: { date: string; time: string; durationMin: number; instructorId: string | null } | null) => void;
  /** Click/drag su uno slot della griglia col popover aperto → sposta il draft. */
  slotPatch?: { date: string; time: string; instructorId: string | null; nonce: number } | null;
};

export function EditAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  instructors,
  vehicles = [],
  vehiclesEnabled = true,
  followCarRules = {},
  locations,
  onSuccess,
  anchor,
  onDraftChange,
  slotPatch,
}: Props) {
  const toast = useFeedbackToast();

  const originalStart = React.useMemo(
    () => (appointment ? new Date(appointment.startsAt) : null),
    [appointment],
  );
  const originalEnd = React.useMemo(() => {
    if (!appointment || !originalStart) return null;
    if (appointment.endsAt) return new Date(appointment.endsAt);
    // Default duration fallback: 30 min if endsAt is missing.
    return new Date(originalStart.getTime() + 30 * 60 * 1000);
  }, [appointment, originalStart]);

  const originalInstructorId = appointment?.instructor?.id ?? "";
  const originalLessonType = appointment?.type ?? "guida";
  const originalVehicleId = appointment?.vehicle?.id ?? "";
  const originalFollowVehicleId = appointment?.followVehicle?.id ?? "";
  const originalExtraMotoVehicleIds = React.useMemo(
    () => (appointment?.extraMotoVehicles ?? []).map((v) => v.id),
    [appointment],
  );
  const originalLocationId = appointment?.location?.id ?? "";
  const originalNotes = appointment?.notes ?? "";

  const [instructorId, setInstructorId] = React.useState(originalInstructorId);
  const [lessonType, setLessonType] = React.useState(originalLessonType);
  const [vehicleId, setVehicleId] = React.useState(originalVehicleId);
  const [followVehicleId, setFollowVehicleId] = React.useState(originalFollowVehicleId);
  const [extraMotoVehicleIds, setExtraMotoVehicleIds] = React.useState<string[]>(
    originalExtraMotoVehicleIds,
  );
  const [locationId, setLocationId] = React.useState(originalLocationId);
  const [notes, setNotes] = React.useState(originalNotes);
  // Date/time staging — start from the appointment's current slot.
  const [newDate, setNewDate] = React.useState<string>(
    originalStart ? toDateStr(originalStart) : "",
  );
  const [newTime, setNewTime] = React.useState<string>(
    originalStart ? toTimeStr(originalStart) : "",
  );
  const [availability, setAvailability] = React.useState<Availability>({ status: "idle" });
  const [pending, setPending] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Reset state when dialog opens with a (different) appointment.
  React.useEffect(() => {
    if (!open || !appointment) return;
    const start = new Date(appointment.startsAt);
    setInstructorId(appointment.instructor?.id ?? "");
    setLessonType(appointment.type ?? "guida");
    setVehicleId(appointment.vehicle?.id ?? "");
    setFollowVehicleId(appointment.followVehicle?.id ?? "");
    setExtraMotoVehicleIds((appointment.extraMotoVehicles ?? []).map((v) => v.id));
    setLocationId(appointment.location?.id ?? "");
    setNotes(appointment.notes ?? "");
    setNewDate(toDateStr(start));
    setNewTime(toTimeStr(start));
    setAvailability({ status: "idle" });
    setServerError(null);
    setPending(false);
  }, [open, appointment]);

  // Effective slot: either the original or the user's staged date/time.
  // We preserve the lesson duration when the time/date changes.
  const effectiveStart = React.useMemo(() => {
    if (!newDate || !newTime) return null;
    const [y, m, d] = newDate.split("-").map(Number);
    const [h, min] = newTime.split(":").map(Number);
    if ([y, m, d, h, min].some((v) => Number.isNaN(v))) return null;
    return new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0, 0, 0);
  }, [newDate, newTime]);

  const durationMs = React.useMemo(() => {
    if (!originalStart || !originalEnd) return 60 * 60 * 1000;
    return originalEnd.getTime() - originalStart.getTime();
  }, [originalStart, originalEnd]);

  const effectiveEnd = React.useMemo(
    () => (effectiveStart ? new Date(effectiveStart.getTime() + durationMs) : null),
    [effectiveStart, durationMs],
  );

  const dateTimeChanged = React.useMemo(() => {
    if (!effectiveStart || !originalStart) return false;
    return effectiveStart.getTime() !== originalStart.getTime();
  }, [effectiveStart, originalStart]);

  // Ghost live in agenda: comunica il draft al parent a ogni modifica.
  React.useEffect(() => {
    if (!onDraftChange) return;
    if (!open || !appointment) { onDraftChange(null); return; }
    onDraftChange({ date: newDate, time: newTime, durationMin: Math.round(durationMs / 60000), instructorId: instructorId || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appointment, newDate, newTime, durationMs, instructorId]);

  // Click/drag su slot della griglia col popover aperto → sposta il draft.
  React.useEffect(() => {
    if (!slotPatch || !open) return;
    setNewDate(slotPatch.date);
    setNewTime(slotPatch.time);
    if (slotPatch.instructorId) setInstructorId(slotPatch.instructorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotPatch?.nonce]);

  // Past/completed guides ARE editable (the titolare fixes records after the
  // fact: wrong vehicle, wrong time, missing notes). The only forbidden move
  // is dragging a FUTURE guide into the past by accident — a guide that
  // already lives in the past can be moved freely between past slots.
  const normalizedStatus = (appointment?.status ?? "").toLowerCase();
  const isConcluded = ["completed", "no_show", "cancelled"].includes(normalizedStatus);
  const originalInPast = originalStart ? originalStart.getTime() < Date.now() : false;

  const isNewSlotInPast =
    dateTimeChanged && !originalInPast && !isConcluded && effectiveStart
      ? effectiveStart.getTime() < Date.now()
      : false;

  const instructorChanged = instructorId !== originalInstructorId && instructorId !== "";

  // Live availability check. We re-run whenever either the staged
  // instructor or the staged date/time changes. If neither has changed,
  // there's nothing to verify and the badge stays hidden.
  React.useEffect(() => {
    if (!open || !appointment || !effectiveStart || !effectiveEnd) return;
    if (!instructorChanged && !dateTimeChanged) {
      setAvailability({ status: "idle" });
      return;
    }
    // We always validate the instructor that's going to own the lesson:
    // if the user only moved the slot, we check the CURRENT instructor;
    // if the user picked a different one, we check that one.
    const targetInstructorId = instructorId || originalInstructorId;
    if (!targetInstructorId) {
      setAvailability({ status: "idle" });
      return;
    }

    let cancelled = false;
    setAvailability({ status: "checking" });

    const params = new URLSearchParams({
      instructorId: targetInstructorId,
      startsAt: effectiveStart.toISOString(),
      endsAt: effectiveEnd.toISOString(),
      excludeAppointmentId: appointment.id,
    });

    fetch(`/api/autoscuole/instructor-availability?${params.toString()}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (!res?.success) {
          setAvailability({
            status: "error",
            detail: res?.message ?? "Impossibile verificare la disponibilità.",
          });
          return;
        }
        const data = res.data as
          | { available: true }
          | {
              available: false;
              reason: "OVERLAP" | "BLOCK" | "HOLIDAY" | "INSTRUCTOR_INACTIVE";
              detail: string;
            };
        if (data.available) {
          setAvailability({ status: "available" });
        } else {
          setAvailability({
            status: "unavailable",
            reason: data.reason,
            detail: data.detail,
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAvailability({
          status: "error",
          detail: "Errore di rete durante la verifica disponibilità.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    appointment,
    effectiveStart,
    effectiveEnd,
    instructorId,
    originalInstructorId,
    instructorChanged,
    dateTimeChanged,
  ]);

  if (!appointment || !originalStart || !originalEnd) return null;

  const studentLabel =
    `${appointment.student.firstName} ${appointment.student.lastName}`.trim();

  // We block the save if the staged combination of instructor + slot can't
  // be verified or is known to conflict. The availability badge already
  // explains the reason in plain language.
  const isAvailabilityBlockingSave =
    (instructorChanged || dateTimeChanged) &&
    (availability.status === "checking" ||
      availability.status === "unavailable" ||
      availability.status === "error");

  // Pickers only offer vehicles this lesson's instructor can use (exclusivity /
  // pool — the instructor drives the follow car and the lesson is theirs),
  // mirroring the mobile manage-lesson flow.
  const usableByInstructor = (v: VehicleOption) =>
    !instructorId ||
    instructorCanUseVehicle(
      { assignedInstructorId: v.assignedInstructorId ?? null, poolInstructorIds: v.poolInstructorIds ?? [] },
      instructorId,
    );
  // The PRIMARY moto/vehicle is driven by the student → must serve their license
  // (moto hierarchy). Permissive when the student's license is unknown.
  const studentEligible = (v: VehicleOption) =>
    appointment?.student?.licenseCategory && appointment?.student?.transmission
      ? vehicleServesLicense(
          { licenseCategory: v.licenseCategory ?? null, transmission: v.transmission ?? null },
          { licenseCategory: appointment.student.licenseCategory, transmission: appointment.student.transmission },
        )
      : true;
  // Primary picker: instructor-usable + student-eligible. Always keep the
  // currently-assigned vehicle in the list so the Select can render it.
  const primaryVehicleOptions = vehicles.filter(
    (v) => v.id === vehicleId || (usableByInstructor(v) && studentEligible(v)),
  );
  // Friendly license label shown next to each vehicle in the pickers.
  const licLabel = (c?: string | null) =>
    c ? LICENSE_CATEGORY_LABELS[c as LicenseCategory] ?? c : "";
  // Transmission label — shown for follow cars (all category B, so the useful
  // distinction is manual vs automatic).
  const transLabel = (t?: string | null) =>
    t ? TRANSMISSION_LABELS[t as Transmission] ?? t : "";

  // Follow car (auto al seguito): only relevant when the selected primary
  // vehicle is a moto AND the company enabled the rule for that category.
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const needsFollowCar =
    vehiclesEnabled &&
    !!selectedVehicle &&
    isMotoLicenseCategory(selectedVehicle.licenseCategory) &&
    followCarRules[selectedVehicle.licenseCategory ?? ""]?.enabled === true;
  const followCarOptions = vehicles.filter(
    (v) =>
      v.licenseCategory === "B" &&
      v.id !== vehicleId &&
      (v.id === followVehicleId || usableByInstructor(v)),
  );
  // When the primary isn't a follow-car moto, the follow car is implicitly
  // cleared (a follow without a moto primary makes no sense).
  const effectiveFollowVehicleId = needsFollowCar ? followVehicleId : "";

  // Extra motos are only meaningful when the primary is a moto. When it isn't,
  // they are implicitly cleared. Extra motos are just additional reserved
  // vehicles → any company moto the instructor can use (NOT filtered by the
  // student's license — matches the backend + the mobile flow).
  const primaryIsMoto =
    vehiclesEnabled &&
    !!selectedVehicle &&
    isMotoLicenseCategory(selectedVehicle.licenseCategory);
  // Extra motos must ALSO serve the student's license (same moto hierarchy as the
  // primary — equal-or-lower category), on top of instructor-usability. Already
  // selected ones are always kept so an existing set never silently drops.
  const extraMotoOptions = vehicles.filter(
    (v) =>
      isMotoLicenseCategory(v.licenseCategory) &&
      v.id !== vehicleId &&
      (extraMotoVehicleIds.includes(v.id) || (usableByInstructor(v) && studentEligible(v))),
  );
  const effectiveExtraMotoVehicleIds = primaryIsMoto
    ? extraMotoVehicleIds.filter((id) => id !== vehicleId)
    : [];
  const sortedKey = (ids: string[]) => [...ids].sort().join(",");
  const extraMotosChanged =
    sortedKey(effectiveExtraMotoVehicleIds) !==
    sortedKey(originalExtraMotoVehicleIds);

  const hasChanges =
    instructorId !== originalInstructorId ||
    lessonType !== originalLessonType ||
    vehicleId !== originalVehicleId ||
    effectiveFollowVehicleId !== originalFollowVehicleId ||
    extraMotosChanged ||
    locationId !== originalLocationId ||
    (notes ?? "") !== (originalNotes ?? "") ||
    dateTimeChanged;

  // The global follow-car rule suggests the auto al seguito but doesn't force
  // it: owner/instructor may explicitly save a moto guide with "Nessuna".
  const canSubmit =
    hasChanges &&
    !pending &&
    !isAvailabilityBlockingSave &&
    !isNewSlotInPast;

  const handleSubmit = async () => {
    if (!canSubmit || !effectiveStart || !effectiveEnd) return;
    setPending(true);
    setServerError(null);
    try {
      // 1. Reschedule first (if date/time changed). Reschedule uses the
      // current instructor — that's fine because availability has been
      // pre-checked client-side against the eventual instructor + slot.
      if (dateTimeChanged) {
        const reRes = await rescheduleAutoscuolaAppointment({
          appointmentId: appointment.id,
          startsAt: effectiveStart.toISOString(),
          endsAt: effectiveEnd.toISOString(),
        });
        if (!reRes.success) {
          setServerError(reRes.message ?? "Impossibile spostare la guida.");
          setPending(false);
          return;
        }
      }

      // 2. Update details (instructor swap, lesson type, location, notes).
      const detailsPayload: Parameters<typeof updateAutoscuolaAppointmentDetails>[0] = {
        appointmentId: appointment.id,
      };
      let hasDetails = false;
      if (instructorId !== originalInstructorId && instructorId !== "") {
        detailsPayload.instructorId = instructorId;
        hasDetails = true;
      }
      if (lessonType !== originalLessonType) {
        detailsPayload.lessonType = lessonType;
        hasDetails = true;
      }
      if (vehicleId !== originalVehicleId) {
        // Empty string from <Select> means "no vehicle" → null on the wire.
        detailsPayload.vehicleId = vehicleId === "" ? null : vehicleId;
        hasDetails = true;
      }
      if (effectiveFollowVehicleId !== originalFollowVehicleId) {
        // Auto al seguito — null clears it (incl. when the primary stopped
        // being a follow-car moto).
        detailsPayload.followVehicleId =
          effectiveFollowVehicleId === "" ? null : effectiveFollowVehicleId;
        hasDetails = true;
      }
      if (extraMotosChanged) {
        // Replaces the full set of extra motos (empty clears them).
        detailsPayload.extraMotoVehicleIds = effectiveExtraMotoVehicleIds;
        hasDetails = true;
      }
      if (locationId !== originalLocationId) {
        // Empty string from <Select> means "no location" → null on the wire.
        detailsPayload.locationId = locationId === "" ? null : locationId;
        hasDetails = true;
      }
      if ((notes ?? "") !== (originalNotes ?? "")) {
        detailsPayload.notes = notes;
        hasDetails = true;
      }

      if (hasDetails) {
        const upRes = await updateAutoscuolaAppointmentDetails(detailsPayload);
        if (!upRes.success) {
          // If we already rescheduled, the slot moved successfully but the
          // detail update failed. Surface a partial-success message so the
          // titolare knows what to retry.
          const msg = dateTimeChanged
            ? `Guida spostata, ma non sono riuscito a salvare gli altri campi: ${upRes.message ?? ""}`.trim()
            : upRes.message ?? "Impossibile salvare le modifiche.";
          setServerError(msg);
          setPending(false);
          if (dateTimeChanged) onSuccess?.(); // reload the agenda anyway
          return;
        }
      }

      toast.success({ description: "Guida aggiornata." });
      onSuccess?.();
      onOpenChange(false);
    } catch {
      setServerError("Errore di rete. Riprova.");
      setPending(false);
    }
  };

  // ── Inline availability badge ─────────────────────────────────────
  // Shown whenever EITHER the instructor or the slot has been staged to a
  // different value than the original — both routes change the conflict
  // calculus and the titolare needs visual confirmation before saving.
  const AvailabilityBadge: React.FC = () => {
    if (!instructorChanged && !dateTimeChanged) return null;
    if (availability.status === "checking") {
      return (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          <span>Verifica disponibilità…</span>
        </div>
      );
    }
    if (availability.status === "available") {
      return (
        <div
          role="status"
          className="mt-2 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
        >
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
          <span>Disponibile a quest&apos;orario</span>
        </div>
      );
    }
    if (availability.status === "unavailable") {
      return (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{availability.detail}</span>
        </div>
      );
    }
    if (availability.status === "error") {
      return (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{availability.detail}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <CreateEventPopover
      open={open}
      onClose={() => { if (!pending) onOpenChange(false); }}
      title="Modifica guida"
      subtitle={studentLabel}
      anchor={anchor ?? null}
      width={440}
      footer={
        <>
          <button type="button" className="cursor-pointer text-sm font-semibold text-[#222222] underline underline-offset-2 disabled:opacity-50" disabled={pending} onClick={() => onOpenChange(false)}>
            Annulla
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="flex cursor-pointer items-center gap-2 rounded-[10px] bg-[#222222] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Salva modifiche
          </button>
        </>
      }
    >
        <div className="flex flex-col gap-5">
          {/* Date + time pickers — together they replace the old "Sposta" dialog. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <CalendarDays className="size-3.5 text-slate-500" aria-hidden />
                Data
              </label>
              <DatePickerInput
                value={newDate}
                onChange={setNewDate}
                placeholder="Scegli data"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-slate-700">Orario</label>
              <Select
                value={newTime}
                onValueChange={setNewTime}
                disabled={pending}
              >
                <SelectTrigger className="h-10 cursor-pointer">
                  <SelectValue placeholder="--:--" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t} className="cursor-pointer">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isNewSlotInPast && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700"
            >
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              <span>Non puoi spostare la guida nel passato.</span>
            </div>
          )}

          {/* Instructor */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="edit-instructor"
              className="flex items-center gap-1.5 text-xs font-medium text-slate-700"
            >
              <UserCog className="size-3.5 text-slate-500" aria-hidden />
              Istruttore
            </label>
            <Select
              value={instructorId || undefined}
              onValueChange={(v) => setInstructorId(v)}
              disabled={pending || isConcluded}
            >
              <SelectTrigger id="edit-instructor" className="h-10 cursor-pointer">
                <SelectValue placeholder="Seleziona istruttore" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {instructors.map((it) => (
                  <SelectItem key={it.id} value={it.id} className="cursor-pointer">
                    {it.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isConcluded && (
              <p className="text-[11px] text-muted-foreground">
                L&apos;istruttore non si può cambiare su una guida già conclusa.
              </p>
            )}
          </div>

          {/* Combined availability badge (covers instructor swap AND/OR slot move) */}
          <AvailabilityBadge />

          {/* Vehicle — company resource, editable also on past/completed guides
              (the titolare fixes the record after the fact). */}
          {vehiclesEnabled && vehicles.length > 0 && (
            <div className="flex flex-col gap-2">
              <label
                htmlFor="edit-vehicle"
                className="text-xs font-medium text-slate-700"
              >
                Veicolo
              </label>
              <Select
                value={vehicleId || "__none__"}
                onValueChange={(v) => setVehicleId(v === "__none__" ? "" : v)}
                disabled={pending}
              >
                <SelectTrigger id="edit-vehicle" className="h-10 cursor-pointer">
                  <SelectValue placeholder="Da assegnare" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__" className="cursor-pointer">
                    Da assegnare
                  </SelectItem>
                  {primaryVehicleOptions.map((v) => (
                    <SelectItem key={v.id} value={v.id} className="cursor-pointer">
                      {v.name}
                      {v.licenseCategory ? (
                        <span className="ml-2 text-xs text-muted-foreground">{licLabel(v.licenseCategory)}</span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Follow car (auto al seguito) — shown only for a moto primary whose
              category has the rule enabled. Required when shown. */}
          {needsFollowCar && (
            <div className="flex flex-col gap-2">
              <label
                htmlFor="edit-follow-vehicle"
                className="text-xs font-medium text-slate-700"
              >
                Auto al seguito
              </label>
              <Select
                value={followVehicleId || "__none__"}
                onValueChange={(v) => setFollowVehicleId(v === "__none__" ? "" : v)}
                disabled={pending}
              >
                <SelectTrigger id="edit-follow-vehicle" className="h-10 cursor-pointer">
                  <SelectValue placeholder="Seleziona auto al seguito" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__" className="cursor-pointer">
                    Nessuna
                  </SelectItem>
                  {followCarOptions.map((v) => (
                    <SelectItem key={v.id} value={v.id} className="cursor-pointer">
                      {v.name}
                      {v.transmission ? (
                        <span className="ml-2 text-xs text-muted-foreground">{transLabel(v.transmission)}</span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!followVehicleId && (
                <p className="text-[11px] text-muted-foreground">
                  Guida moto senza auto al seguito.
                </p>
              )}
            </div>
          )}

          {/* Extra motos — a moto guida occupying more than one moto. Shown only
              when the primary vehicle is a moto and other motos exist. */}
          {primaryIsMoto && extraMotoOptions.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-slate-700">
                Moto aggiuntive
              </label>
              <div className="flex flex-wrap gap-2">
                {extraMotoOptions.map((v) => {
                  const active = extraMotoVehicleIds.includes(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        setExtraMotoVehicleIds((prev) =>
                          prev.includes(v.id)
                            ? prev.filter((x) => x !== v.id)
                            : [...prev, v.id],
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-pink-500 bg-pink-50 text-pink-700"
                          : "border-border bg-white text-foreground hover:bg-gray-50"
                      }`}
                    >
                      {v.name}
                      {v.licenseCategory ? (
                        <span className={`ml-1.5 ${active ? "text-pink-500" : "text-muted-foreground"}`}>
                          · {licLabel(v.licenseCategory)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lesson type */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="edit-lesson-type"
              className="text-xs font-medium text-slate-700"
            >
              Tipo guida
            </label>
            <Select
              value={lessonType || undefined}
              onValueChange={(v) => setLessonType(v)}
              disabled={pending}
            >
              <SelectTrigger id="edit-lesson-type" className="h-10 cursor-pointer">
                <SelectValue placeholder="Seleziona tipo" />
              </SelectTrigger>
              <SelectContent>
                {LESSON_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="cursor-pointer">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          {locations.length > 0 && (
            <div className="flex flex-col gap-2">
              <label
                htmlFor="edit-location"
                className="text-xs font-medium text-slate-700"
              >
                Luogo
              </label>
              <Select
                value={locationId || "__none__"}
                onValueChange={(v) => setLocationId(v === "__none__" ? "" : v)}
                disabled={pending}
              >
                <SelectTrigger id="edit-location" className="h-10 cursor-pointer">
                  <SelectValue placeholder="Sede dell'autoscuola" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="cursor-pointer">
                    Sede dell&apos;autoscuola
                  </SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id} className="cursor-pointer">
                      {loc.name}
                      {loc.isDefault ? " · default" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notes */}
          <div className="flex flex-col gap-2">
            <label htmlFor="edit-notes" className="text-xs font-medium text-slate-700">
              Note
            </label>
            <Textarea
              id="edit-notes"
              value={notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Note opzionali sulla guida"
              rows={3}
              disabled={pending}
              className="resize-none text-sm"
            />
          </div>

          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{serverError}</span>
            </div>
          )}
        </div>

    </CreateEventPopover>
  );
}
