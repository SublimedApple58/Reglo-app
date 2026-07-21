"use client";

import * as React from "react";
import { AlertCircle, CalendarDays, Check, CheckCircle2, Clock, Loader2, Star, UserCog, X } from "lucide-react";

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
import { TimePickerInput } from "@/components/ui/time-picker";
import { LoadingDots } from "@/components/ui/loading-dots";
import { isMotoLicenseCategory, vehicleServesLicense, LICENSE_CATEGORY_LABELS, TRANSMISSION_LABELS, type LicenseCategory, type Transmission } from "@/lib/autoscuole/license";
import { instructorCanUseVehicle } from "@/lib/autoscuole/group-moto";
import {
  rescheduleAutoscuolaAppointment,
  updateAutoscuolaAppointmentDetails,
  updateAutoscuolaAppointmentStatus,
} from "@/lib/actions/autoscuole.actions";
import { cn } from "@/lib/utils";

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
  /** Multi lesson-types ("cosa si è fatto"). Falls back to [type] when absent. */
  types?: string[] | null;
  /** Valutazione 1-5 (null = non valutata). */
  rating?: number | null;
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

// Attività della guida ("cosa si è fatto") — multi-selezione come su mobile
// (src/utils/lessonTypes.ts). "guida"/"esame" NON sono attività: sono il tipo
// base, non un dettaglio → non compaiono qui.
const LESSON_TYPE_OPTIONS = [
  { value: "manovre", label: "Manovre" },
  { value: "urbano", label: "Urbano" },
  { value: "extraurbano", label: "Extraurbano" },
  { value: "notturna", label: "Notturna" },
  { value: "autostrada", label: "Autostrada" },
  { value: "parcheggio", label: "Parcheggio" },
  { value: "altro", label: "Altro" },
] as const;
const LESSON_TYPE_VALUES = new Set(LESSON_TYPE_OPTIONS.map((o) => o.value as string));

// Attività iniziali: preferisci types[], altrimenti il singolo type se è
// un'attività (mirror di resolveInitialLessonTypes mobile).
const resolveInitialTypes = (
  types?: string[] | null,
  type?: string | null,
): string[] => {
  const fromArray = (types ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter((t) => LESSON_TYPE_VALUES.has(t));
  if (fromArray.length) return Array.from(new Set(fromArray));
  const single = (type ?? "").trim().toLowerCase();
  return LESSON_TYPE_VALUES.has(single) ? [single] : [];
};

// Esito corrente derivato dallo stato: Presente = checked_in/completed,
// Assente = no_show, altrimenti nessun esito (guida non ancora effettuata).
type Outcome = "checked_in" | "no_show" | null;
const outcomeFromStatus = (status: string): Outcome => {
  const s = status.toLowerCase();
  if (s === "checked_in" || s === "completed") return "checked_in";
  if (s === "no_show") return "no_show";
  return null;
};

// Stelle 1-5 monocrome navy, tap-to-clear (come StarRating mobile).
function StarRatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  const current = value ?? 0;
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= current;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            aria-label={`${star} stell${star === 1 ? "a" : "e"}`}
            onClick={() => onChange(star === current ? null : star)}
            className="cursor-pointer p-0.5 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Star
              className={cn("size-7", filled ? "text-[#1a1a2e]" : "text-[#d7dbe2]")}
              fill={filled ? "#1a1a2e" : "none"}
              strokeWidth={filled ? 0 : 1.6}
            />
          </button>
        );
      })}
    </div>
  );
}

// Stesse durate del form di creazione (SLOT_OPTIONS in AutoscuoleAgendaPage).
// La durata attuale della guida viene comunque aggiunta all'elenco a runtime,
// così esami/guide più lunghe restano visibili e selezionabili.
const DURATION_OPTIONS = [30, 45, 60, 90, 120];

const formatDuration = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return h === 1 ? "1 ora" : `${h} ore`;
  return `${h}h ${m}′`;
};

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

  const originalDurationMin = React.useMemo(() => {
    if (!originalStart || !originalEnd) return 60;
    return Math.max(1, Math.round((originalEnd.getTime() - originalStart.getTime()) / 60000));
  }, [originalStart, originalEnd]);

  const originalInstructorId = appointment?.instructor?.id ?? "";
  const originalLessonTypes = React.useMemo(
    () => resolveInitialTypes(appointment?.types, appointment?.type),
    [appointment],
  );
  const originalRating = appointment?.rating ?? null;
  const currentOutcome = outcomeFromStatus(appointment?.status ?? "");
  const originalVehicleId = appointment?.vehicle?.id ?? "";
  const originalFollowVehicleId = appointment?.followVehicle?.id ?? "";
  const originalExtraMotoVehicleIds = React.useMemo(
    () => (appointment?.extraMotoVehicles ?? []).map((v) => v.id),
    [appointment],
  );
  const originalLocationId = appointment?.location?.id ?? "";
  const originalNotes = appointment?.notes ?? "";

  const [instructorId, setInstructorId] = React.useState(originalInstructorId);
  const [lessonTypes, setLessonTypes] = React.useState<string[]>(originalLessonTypes);
  const [rating, setRating] = React.useState<number | null>(originalRating);
  const [esito, setEsito] = React.useState<Outcome>(currentOutcome);
  const [vehicleId, setVehicleId] = React.useState(originalVehicleId);
  const [followVehicleId, setFollowVehicleId] = React.useState(originalFollowVehicleId);
  const [extraMotoVehicleIds, setExtraMotoVehicleIds] = React.useState<string[]>(
    originalExtraMotoVehicleIds,
  );
  const [locationId, setLocationId] = React.useState(originalLocationId);
  const [notes, setNotes] = React.useState(originalNotes);
  const [durationMin, setDurationMin] = React.useState<number>(originalDurationMin);
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
    setLessonTypes(resolveInitialTypes(appointment.types, appointment.type));
    setRating(appointment.rating ?? null);
    setEsito(outcomeFromStatus(appointment.status ?? ""));
    setVehicleId(appointment.vehicle?.id ?? "");
    setFollowVehicleId(appointment.followVehicle?.id ?? "");
    setExtraMotoVehicleIds((appointment.extraMotoVehicles ?? []).map((v) => v.id));
    setLocationId(appointment.location?.id ?? "");
    setNotes(appointment.notes ?? "");
    const end = appointment.endsAt
      ? new Date(appointment.endsAt)
      : new Date(start.getTime() + 30 * 60 * 1000);
    setDurationMin(Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)));
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

  // La durata ora è modificabile: l'intervallo effettivo deriva dalla durata
  // scelta (non più solo da quella originale). Così sia il reschedule (quando
  // cambia data/ora) sia il check disponibilità usano il nuovo endsAt.
  const durationMs = durationMin * 60 * 1000;

  const effectiveEnd = React.useMemo(
    () => (effectiveStart ? new Date(effectiveStart.getTime() + durationMs) : null),
    [effectiveStart, durationMs],
  );

  const durationChanged = durationMin !== originalDurationMin;

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

  // La durata influenza la disponibilità (e quindi va rivalidata live) solo su
  // guide future/non concluse: sul passato è un record fix e il BE non blocca.
  const durationAffectsAvailability = durationChanged && !originalInPast && !isConcluded;

  const instructorChanged = instructorId !== originalInstructorId && instructorId !== "";

  const sortedTypesKey = (t: string[]) => [...t].sort().join(",");
  const typesChanged = sortedTypesKey(lessonTypes) !== sortedTypesKey(originalLessonTypes);
  const ratingChanged = rating !== originalRating;
  const esitoChanged = esito !== currentOutcome;

  // Esito modificabile: guide non annullate/non proposte e non troppo in
  // anticipo (>10 min prima dell'inizio) — mirror del "correctable" mobile.
  const showEsito =
    normalizedStatus !== "cancelled" &&
    normalizedStatus !== "proposal" &&
    originalStart !== null &&
    originalStart.getTime() - 10 * 60 * 1000 <= Date.now();

  // Valutazione: solo su guide effettuate (checked_in/completed/no_show) — o se
  // l'utente sta impostando ORA un esito Presente/Assente (che le renderà tali).
  const showRating =
    esito !== null || ["checked_in", "completed", "no_show"].includes(normalizedStatus);

  // Live availability check. We re-run whenever either the staged
  // instructor or the staged date/time changes. If neither has changed,
  // there's nothing to verify and the badge stays hidden.
  React.useEffect(() => {
    if (!open || !appointment || !effectiveStart || !effectiveEnd) return;
    // La durata più lunga può creare sovrapposizioni: rivalidiamo anche quando
    // cambia solo la durata (l'endsAt esteso viene già passato all'endpoint).
    if (!instructorChanged && !dateTimeChanged && !durationAffectsAvailability) {
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
    durationAffectsAvailability,
  ]);

  if (!appointment || !originalStart || !originalEnd) return null;

  const studentLabel =
    `${appointment.student.firstName} ${appointment.student.lastName}`.trim();

  // We block the save if the staged combination of instructor + slot can't
  // be verified or is known to conflict. The availability badge already
  // explains the reason in plain language.
  const isAvailabilityBlockingSave =
    (instructorChanged || dateTimeChanged || durationAffectsAvailability) &&
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
    typesChanged ||
    ratingChanged ||
    esitoChanged ||
    vehicleId !== originalVehicleId ||
    effectiveFollowVehicleId !== originalFollowVehicleId ||
    extraMotosChanged ||
    locationId !== originalLocationId ||
    (notes ?? "") !== (originalNotes ?? "") ||
    dateTimeChanged ||
    durationChanged;

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

      // 1.5 Esito / stato (Presente = checked_in, Assente = no_show). PRIMA dei
      // dettagli, così la valutazione supera il controllo di stato del BE (il
      // rating è accettato solo su guide effettuate). Il BE gestisce da solo
      // past→completed e il riaccredito della guida quando si passa a no_show.
      if (esitoChanged && esito) {
        const stRes = await updateAutoscuolaAppointmentStatus({
          appointmentId: appointment.id,
          status: esito,
        });
        if (!stRes.success) {
          const msg = dateTimeChanged
            ? `Guida spostata, ma non sono riuscito ad aggiornare l'esito: ${stRes.message ?? ""}`.trim()
            : stRes.message ?? "Impossibile aggiornare l'esito.";
          setServerError(msg);
          setPending(false);
          if (dateTimeChanged) onSuccess?.();
          return;
        }
      }

      // 2. Update details (istruttore, tipi, valutazione, veicolo, luogo, note).
      const detailsPayload: Parameters<typeof updateAutoscuolaAppointmentDetails>[0] = {
        appointmentId: appointment.id,
      };
      let hasDetails = false;
      if (instructorId !== originalInstructorId && instructorId !== "") {
        detailsPayload.instructorId = instructorId;
        hasDetails = true;
      }
      if (typesChanged && lessonTypes.length) {
        // Multi attività: il BE scrive types[] e type = primo. Se svuoti tutto
        // non inviamo nulla (non si può azzerare il tipo base).
        detailsPayload.lessonTypes = lessonTypes;
        hasDetails = true;
      }
      if (ratingChanged) {
        // Accettato dal BE solo su guide effettuate: garantito dallo step esito
        // qui sopra o dallo stato già effettuato.
        detailsPayload.rating = rating;
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
      // Durata: quando cambia anche data/ora, il nuovo endsAt viaggia già col
      // reschedule (effectiveEnd = start + durata scelta). Se cambia SOLO la
      // durata, la passiamo qui — questo canale è permissivo anche sul passato.
      if (durationChanged && !dateTimeChanged) {
        detailsPayload.durationMin = durationMin;
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
            {pending ? <LoadingDots className="min-h-5" /> : "Salva modifiche"}
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
              <TimePickerInput value={newTime} onChange={setNewTime} />
            </div>
          </div>

          {/* Durata — modificabile (start invariato, cambia solo l'endsAt). */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <Clock className="size-3.5 text-slate-500" aria-hidden />
              Durata
            </label>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set([...DURATION_OPTIONS, originalDurationMin, durationMin]))
                .sort((a, b) => a - b)
                .map((min) => {
                  const active = durationMin === min;
                  return (
                    <button
                      key={min}
                      type="button"
                      disabled={pending}
                      onClick={() => setDurationMin(min)}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {formatDuration(min)}
                    </button>
                  );
                })}
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

          {/* Esito (Presente/Assente) — parità con la "Gestisci guida" mobile.
              Solo su guide effettuate/correggibili. Salva via updateStatus. */}
          {showEsito && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <CheckCircle2 className="size-3.5 text-slate-500" aria-hidden />
                Esito
              </label>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setEsito("checked_in")}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-50",
                    esito === "checked_in"
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  <Check className="size-4" strokeWidth={2.4} />
                  Presente
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setEsito("no_show")}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-50",
                    esito === "no_show"
                      ? "bg-white text-red-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  <X className="size-4" strokeWidth={2.4} />
                  Assente
                </button>
              </div>
              {esito === "no_show" && currentOutcome === "checked_in" && (
                <p className="text-[11px] text-slate-400">
                  Passando ad “Assente” la guida verrà riaccreditata all&apos;allievo.
                </p>
              )}
            </div>
          )}

          {/* Valutazione (1-5) — solo su guide effettuate (vincolo BE). */}
          {showRating && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <Star className="size-3.5 text-slate-500" aria-hidden />
                Valutazione
              </label>
              <StarRatingInput value={rating} onChange={setRating} disabled={pending} />
            </div>
          )}

          {/* Tipo guida — multi "cosa si è fatto" (attività). */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-700">
              Tipo guida · cosa si è fatto
            </label>
            <div className="flex flex-wrap gap-2">
              {LESSON_TYPE_OPTIONS.map((opt) => {
                const on = lessonTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      setLessonTypes((prev) =>
                        on ? prev.filter((t) => t !== opt.value) : [...prev, opt.value],
                      )
                    }
                    className={cn(
                      "cursor-pointer rounded-[10px] border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
                      on
                        ? "border-[#1a1a2e] bg-[#1a1a2e] text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
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
