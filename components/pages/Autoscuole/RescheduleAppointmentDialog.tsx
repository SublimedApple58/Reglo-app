"use client";

import React from "react";
import { AlertCircle, CalendarDays, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { rescheduleAutoscuolaAppointment } from "@/lib/actions/autoscuole.actions";

type StudentLite = { firstName: string; lastName: string };
type ResourceLite = { name: string };

export type RescheduleAppointmentDialogAppointment = {
  id: string;
  startsAt: string | Date;
  endsAt?: string | Date | null;
  status: string;
  student: StudentLite;
  instructor?: ResourceLite | null;
};

const pad = (n: number) => n.toString().padStart(2, "0");
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 8; h <= 21; h++) {
    for (const m of [0, 15, 30, 45]) {
      out.push(`${pad(h)}:${pad(m)}`);
    }
  }
  return out;
})();

const formatSlotLabel = (d: Date) =>
  d.toLocaleString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const buildDiffLabel = (oldD: Date, newD: Date): string | null => {
  const ms = newD.getTime() - oldD.getTime();
  if (ms === 0) return null;
  const sign = ms > 0 ? "+" : "−";
  const abs = Math.abs(ms);
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minMs = 60 * 1000;
  const days = Math.floor(abs / dayMs);
  const hours = Math.floor((abs - days * dayMs) / hourMs);
  const minutes = Math.floor((abs - days * dayMs - hours * hourMs) / minMs);
  const parts: string[] = [];
  if (days) parts.push(`${sign}${days}g`);
  if (hours) parts.push(`${sign}${hours}h`);
  if (minutes) parts.push(`${sign}${minutes}m`);
  return parts.length ? parts.join(" ") : null;
};

export function RescheduleAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: RescheduleAppointmentDialogAppointment | null;
  onSuccess?: () => void;
}) {
  const toast = useFeedbackToast();

  const originalStart = React.useMemo(
    () => (appointment ? new Date(appointment.startsAt) : null),
    [appointment],
  );
  const originalEnd = React.useMemo(
    () => (appointment?.endsAt ? new Date(appointment.endsAt) : null),
    [appointment],
  );

  const [newDate, setNewDate] = React.useState("");
  const [newTime, setNewTime] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !originalStart) return;
    setNewDate(toDateStr(originalStart));
    setNewTime(toTimeStr(originalStart));
    setServerError(null);
    setPending(false);
  }, [open, originalStart]);

  if (!appointment || !originalStart) return null;

  const newStart = (() => {
    if (!newDate || !newTime) return null;
    const [y, m, d] = newDate.split("-").map(Number);
    const [h, min] = newTime.split(":").map(Number);
    if ([y, m, d, h, min].some((v) => Number.isNaN(v))) return null;
    return new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0, 0, 0);
  })();

  const isSameAsOriginal =
    newStart !== null && newStart.getTime() === originalStart.getTime();

  const durationMs =
    originalEnd !== null
      ? originalEnd.getTime() - originalStart.getTime()
      : 30 * 60 * 1000;
  const newEnd = newStart ? new Date(newStart.getTime() + durationMs) : null;
  const diff = newStart ? buildDiffLabel(originalStart, newStart) : null;

  const isPast = newStart ? newStart.getTime() < Date.now() : false;

  const studentLabel =
    `${appointment.student.firstName} ${appointment.student.lastName}`.trim();
  const subtitle = appointment.instructor?.name
    ? `${studentLabel} · ${appointment.instructor.name}`
    : studentLabel;

  const handleSubmit = async () => {
    if (!newStart || !newEnd) return;
    if (isSameAsOriginal) return;
    setPending(true);
    setServerError(null);
    try {
      const res = await rescheduleAutoscuolaAppointment({
        appointmentId: appointment.id,
        startsAt: newStart.toISOString(),
        endsAt: newEnd.toISOString(),
      });
      if (!res.success) {
        setServerError(res.message ?? "Impossibile spostare la guida.");
        setPending(false);
        return;
      }
      toast.success({ description: "Guida spostata." });
      onSuccess?.();
      onOpenChange(false);
    } catch {
      setServerError("Errore di rete. Riprova.");
      setPending(false);
    }
  };

  const canSubmit =
    newStart !== null && !isSameAsOriginal && !isPast && !pending;

  return (
    <Dialog open={open} onOpenChange={(o) => (!pending ? onOpenChange(o) : undefined)}>
      <DialogContent className="sm:max-w-[480px] gap-0 overflow-hidden p-0">
        <DialogHeader className="p-6 text-left">
          <DialogTitle className="text-[18px] leading-[24px] font-semibold tracking-[-0.01em]">
            Sposta guida
          </DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </DialogHeader>

        <div className="border-t border-border" />

        <div className="flex flex-col gap-5 p-6">
          {/* Current slot */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-slate-50 px-4 py-3">
            <CalendarDays className="size-[18px] shrink-0 text-slate-500" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                Attualmente
              </p>
              <p className="mt-0.5 text-sm font-medium capitalize text-slate-900">
                {formatSlotLabel(originalStart)}
              </p>
            </div>
          </div>

          {/* Pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-slate-700">
                Nuova data
              </label>
              <DatePickerInput
                value={newDate}
                onChange={setNewDate}
                placeholder="Scegli data"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-slate-700">
                Nuovo orario
              </label>
              <Select value={newTime} onValueChange={setNewTime}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="--:--" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          {newStart && !isSameAsOriginal ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-pink-200 bg-pink-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <Sparkles className="size-[18px] shrink-0 text-pink-500" />
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-pink-700">
                    Nuova
                  </p>
                  <p className="mt-0.5 text-sm font-medium capitalize text-slate-900">
                    {formatSlotLabel(newStart)}
                  </p>
                </div>
              </div>
              {diff ? (
                <span className="whitespace-nowrap rounded-full bg-pink-100 px-2.5 py-0.5 text-xs font-medium text-pink-700">
                  {diff}
                </span>
              ) : null}
            </div>
          ) : null}

          {isPast ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <p className="text-[13px] font-medium leading-tight text-amber-900">
                Non puoi spostare la guida a un orario passato.
              </p>
            </div>
          ) : null}

          {serverError ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
              <p className="text-[13px] font-medium leading-tight text-rose-900">
                {serverError}
              </p>
            </div>
          ) : null}
        </div>

        <div className="border-t border-border" />

        <DialogFooter className="gap-2 p-6 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Annulla
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Spostando…
              </>
            ) : (
              "Sposta guida"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
