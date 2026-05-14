"use client";

import * as React from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Loader2, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { updateAutoscuolaAppointmentDetails } from "@/lib/actions/autoscuole.actions";

type StudentLite = { firstName: string; lastName: string };
type InstructorOption = { id: string; name: string };
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

const formatSlotLabel = (start: Date, end: Date) => {
  const dayPart = start.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${dayPart} · ${fmtTime(start)}–${fmtTime(end)}`;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: EditAppointmentDialogAppointment | null;
  instructors: InstructorOption[];
  locations: LocationOption[];
  onSuccess?: () => void;
};

export function EditAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  instructors,
  locations,
  onSuccess,
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
  const originalLocationId = appointment?.location?.id ?? "";
  const originalNotes = appointment?.notes ?? "";

  const [instructorId, setInstructorId] = React.useState(originalInstructorId);
  const [lessonType, setLessonType] = React.useState(originalLessonType);
  const [locationId, setLocationId] = React.useState(originalLocationId);
  const [notes, setNotes] = React.useState(originalNotes);
  const [availability, setAvailability] = React.useState<Availability>({ status: "idle" });
  const [pending, setPending] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Reset state when dialog opens with a (different) appointment.
  React.useEffect(() => {
    if (!open || !appointment) return;
    setInstructorId(appointment.instructor?.id ?? "");
    setLessonType(appointment.type ?? "guida");
    setLocationId(appointment.location?.id ?? "");
    setNotes(appointment.notes ?? "");
    setAvailability({ status: "idle" });
    setServerError(null);
    setPending(false);
  }, [open, appointment]);

  const instructorChanged = instructorId !== originalInstructorId && instructorId !== "";

  // Live availability check whenever the instructor selection changes to a
  // different (and non-empty) instructor. Debounced via cancellation token.
  React.useEffect(() => {
    if (!open || !appointment || !originalStart || !originalEnd) return;
    if (!instructorChanged) {
      setAvailability({ status: "idle" });
      return;
    }

    let cancelled = false;
    setAvailability({ status: "checking" });

    const params = new URLSearchParams({
      instructorId,
      startsAt: originalStart.toISOString(),
      endsAt: originalEnd.toISOString(),
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
  }, [open, appointment, originalStart, originalEnd, instructorId, instructorChanged]);

  if (!appointment || !originalStart || !originalEnd) return null;

  const studentLabel =
    `${appointment.student.firstName} ${appointment.student.lastName}`.trim();
  const slotLabel = formatSlotLabel(originalStart, originalEnd);

  const isInstructorBlockingSave =
    instructorChanged &&
    (availability.status === "checking" ||
      availability.status === "unavailable" ||
      availability.status === "error");

  const hasChanges =
    instructorId !== originalInstructorId ||
    lessonType !== originalLessonType ||
    locationId !== originalLocationId ||
    (notes ?? "") !== (originalNotes ?? "");

  const canSubmit = hasChanges && !pending && !isInstructorBlockingSave;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setPending(true);
    setServerError(null);
    try {
      const payload: Parameters<typeof updateAutoscuolaAppointmentDetails>[0] = {
        appointmentId: appointment.id,
      };
      if (instructorId !== originalInstructorId && instructorId !== "") {
        payload.instructorId = instructorId;
      }
      if (lessonType !== originalLessonType) {
        payload.lessonType = lessonType;
      }
      if (locationId !== originalLocationId) {
        // Empty string from <Select> means "no location" → null on the wire.
        payload.locationId = locationId === "" ? null : locationId;
      }
      if ((notes ?? "") !== (originalNotes ?? "")) {
        payload.notes = notes;
      }

      const res = await updateAutoscuolaAppointmentDetails(payload);
      if (!res.success) {
        setServerError(res.message ?? "Impossibile salvare le modifiche.");
        setPending(false);
        return;
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
  const AvailabilityBadge: React.FC = () => {
    if (!instructorChanged) return null;
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
          <span>Disponibile a quest'orario</span>
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
    <Dialog open={open} onOpenChange={(o) => (!pending ? onOpenChange(o) : undefined)}>
      <DialogContent className="sm:max-w-[480px] gap-0 overflow-hidden p-0">
        <DialogHeader className="p-6 text-left">
          <DialogTitle className="text-[18px] leading-[24px] font-semibold tracking-[-0.01em]">
            Modifica guida
          </DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">{studentLabel}</p>
        </DialogHeader>

        <div className="border-t border-border" />

        <div className="flex flex-col gap-5 p-6">
          {/* Slot read-only summary */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-slate-50 px-4 py-3">
            <CalendarDays className="size-[18px] shrink-0 text-slate-500" aria-hidden />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                Quando
              </p>
              <p className="mt-0.5 text-sm font-medium capitalize text-slate-900">
                {slotLabel}
              </p>
            </div>
          </div>

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
              disabled={pending}
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
            <AvailabilityBadge />
          </div>

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
                    Sede dell'autoscuola
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

        <DialogFooter className="gap-2 border-t border-border p-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Annulla
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="cursor-pointer"
          >
            {pending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            {pending ? "Salvataggio…" : "Salva modifiche"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
