"use client";

import React from "react";
import { Plus } from "lucide-react";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  createAutoscuolaAppointment,
  cancelAutoscuolaAppointment,
  getAutoscuolaAppointments,
  getAutoscuolaStudents,
  getAutoscuolaInstructors,
  getAutoscuolaVehicles,
  createAutoscuolaVehicle,
  updateAutoscuolaAppointmentStatus,
} from "@/lib/actions/autoscuole.actions";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

type StudentOption = { id: string; firstName: string; lastName: string };
type ResourceOption = { id: string; name: string };
type AppointmentRow = {
  id: string;
  type: string;
  status: string;
  startsAt: string | Date;
  endsAt?: string | Date | null;
  student: StudentOption;
  instructor?: ResourceOption | null;
  vehicle?: ResourceOption | null;
};

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 22;
const SLOT_MINUTES = 30;
const PIXELS_PER_MINUTE = 1.6;

export function AutoscuoleAgendaPage() {
  const toast = useFeedbackToast();
  const [appointments, setAppointments] = React.useState<AppointmentRow[]>([]);
  const [students, setStudents] = React.useState<StudentOption[]>([]);
  const [instructors, setInstructors] = React.useState<ResourceOption[]>([]);
  const [vehicles, setVehicles] = React.useState<ResourceOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [instructorFilter, setInstructorFilter] = React.useState("all");
  const [vehicleFilter, setVehicleFilter] = React.useState("all");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [weekStart, setWeekStart] = React.useState(() => startOfWeek(new Date()));
  const [form, setForm] = React.useState({
    studentId: "",
    type: "guida",
    startsAt: "",
    endsAt: "",
    instructorId: "",
    vehicleId: "",
    sendProposal: false,
  });
  const [durationPreset, setDurationPreset] = React.useState<number | null>(60);
  const [newVehicle, setNewVehicle] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    const [appRes, studentRes, instructorRes, vehicleRes] = await Promise.all([
      getAutoscuolaAppointments(),
      getAutoscuolaStudents(),
      getAutoscuolaInstructors(),
      getAutoscuolaVehicles(),
    ]);
    if (!appRes.success || !appRes.data) {
      toast.error({
        description: appRes.message ?? "Impossibile caricare l'agenda.",
      });
    } else {
      setAppointments(appRes.data);
    }
    if (studentRes.success && studentRes.data) {
      setStudents(
        studentRes.data.map((student) => ({
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
        })),
      );
    }
    if (instructorRes.success && instructorRes.data) {
      const mapped = (instructorRes.data as ResourceOption[]).map((item) => ({
        id: item.id,
        name: item.name,
      }));
      setInstructors(mapped);
    }
    if (vehicleRes.success && vehicleRes.data) {
      const mapped = (vehicleRes.data as ResourceOption[]).map((item) => ({
        id: item.id,
        name: item.name,
      }));
      setVehicles(mapped);
    }
    setLoading(false);
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const weekEnd = addDays(weekStart, 7);

  const filtered = appointments.filter((item) => {
    if (item.status === "cancelled") return false;
    const term = search.trim().toLowerCase();
    if (
      term &&
      !item.student.firstName.toLowerCase().includes(term) &&
      !item.student.lastName.toLowerCase().includes(term) &&
      !item.type.toLowerCase().includes(term)
    ) {
      return false;
    }
    if (instructorFilter !== "all" && item.instructor?.id !== instructorFilter) {
      return false;
    }
    if (vehicleFilter !== "all" && item.vehicle?.id !== vehicleFilter) {
      return false;
    }
    const start = toDate(item.startsAt);
    const end = getAppointmentEnd(item);
    return start < weekEnd && end > weekStart;
  });

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.studentId || !form.startsAt || !form.instructorId || !form.vehicleId) {
      toast.info({ description: "Completa tutti i campi richiesti." });
      return;
    }
    const startDate = toDate(form.startsAt);
    const endDate = form.endsAt ? toDate(form.endsAt) : null;
    if (endDate && endDate <= startDate) {
      toast.error({ description: "L'orario di fine deve essere successivo all'inizio." });
      return;
    }
    const res = await createAutoscuolaAppointment({
      studentId: form.studentId,
      type: form.type,
      startsAt: form.startsAt,
      endsAt: form.endsAt || undefined,
      instructorId: form.instructorId,
      vehicleId: form.vehicleId,
      sendProposal: form.sendProposal,
    });
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile creare l'appuntamento.",
      });
      return;
    }
    setCreateOpen(false);
    setForm({
      studentId: "",
      type: "guida",
      startsAt: "",
      endsAt: "",
      instructorId: "",
      vehicleId: "",
      sendProposal: false,
    });
    setDurationPreset(60);
    toast.success({ description: res.message ?? "Operazione completata." });
    load();
  };

  const handleCancel = async (appointmentId: string) => {
    const res = await cancelAutoscuolaAppointment({ appointmentId });
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile cancellare l'appuntamento.",
      });
      return;
    }
    if (res.data?.rescheduled && res.data?.newStartsAt) {
      toast.success({
        description: `Slot ripianificato: ${new Date(
          res.data.newStartsAt,
        ).toLocaleString("it-IT")}`,
      });
    } else if (res.data?.rescheduled) {
      toast.success({
        description: "Slot ripianificato automaticamente.",
      });
    } else {
      toast.info({
        description: "Nessuno slot disponibile, notifica staff inviata.",
      });
    }
    load();
  };

  const handleStatusUpdate = async (appointmentId: string, status: string) => {
    const res = await updateAutoscuolaAppointmentStatus({ appointmentId, status });
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile aggiornare lo stato.",
      });
      return;
    }
    load();
  };

  const handleAddVehicle = async () => {
    if (!newVehicle.trim()) {
      toast.info({ description: "Inserisci un nome veicolo." });
      return;
    }
    const res = await createAutoscuolaVehicle({ name: newVehicle.trim() });
    if (!res.success || !res.data) {
      toast.error({
        description: res.message ?? "Impossibile creare il veicolo.",
      });
      return;
    }
    setNewVehicle("");
    setForm((prev) => ({ ...prev, vehicleId: res.data.id }));
    load();
  };

  const handleStartChange = (value: string) => {
    setForm((prev) => {
      const next = { ...prev, startsAt: value };
      if (durationPreset) {
        const nextEnd = addMinutesToDateTime(value, durationPreset);
        if (nextEnd) next.endsAt = nextEnd;
      }
      return next;
    });
  };

  const handleEndChange = (value: string) => {
    setDurationPreset(null);
    setForm((prev) => ({ ...prev, endsAt: value }));
  };

  const handleDurationPreset = (minutes: number) => {
    if (!form.startsAt) {
      toast.info({ description: "Seleziona prima un orario di inizio." });
      return;
    }
    const nextEnd = addMinutesToDateTime(form.startsAt, minutes);
    if (!nextEnd) return;
    setDurationPreset(minutes);
    setForm((prev) => ({ ...prev, endsAt: nextEnd }));
  };

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const totalMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const calendarHeight = totalMinutes * PIXELS_PER_MINUTE;
  const hourMarks = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
    (_, index) => DAY_START_HOUR + index,
  );
  const appointmentsByDay = days.map((day) => {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = addDays(dayStart, 1);
    return filtered
      .filter((appointment) => {
        const start = toDate(appointment.startsAt);
        const end = getAppointmentEnd(appointment);
        return start < dayEnd && end > dayStart;
      })
      .sort((a, b) => toDate(a.startsAt).getTime() - toDate(b.startsAt).getTime());
  });

  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Agenda guide ed esami."
      hideHero
    >
      <div className="space-y-5">
        <AutoscuoleNav />

        <div className="glass-panel glass-strong flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[220px]">
              <Input
                placeholder="Cerca appuntamenti"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="border-white/60 bg-white/80"
              />
            </div>
            <Select value={instructorFilter} onValueChange={setInstructorFilter}>
              <SelectTrigger className="min-w-[200px]">
                <SelectValue placeholder="Filtra istruttore" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli istruttori</SelectItem>
                {instructors.map((instructor) => (
                  <SelectItem key={instructor.id} value={instructor.id}>
                    {instructor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
              <SelectTrigger className="min-w-[200px]">
                <SelectValue placeholder="Filtra veicolo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i veicoli</SelectItem>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart((prev) => addDays(prev, -7))}
            >
              ←
            </Button>
            <span className="min-w-[140px] text-center">
              {formatRangeLabel(weekStart)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart((prev) => addDays(prev, 7))}
            >
              →
            </Button>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuovo appuntamento
          </Button>
        </div>

        <div className="glass-panel glass-strong p-4">
          {loading ? (
            <Skeleton className="h-[420px] w-full" />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[980px] space-y-3">
                <div className="grid grid-cols-[80px_repeat(7,minmax(160px,1fr))] gap-3 text-xs text-muted-foreground">
                  <div />
                  {days.map((day) => (
                    <div key={day.toISOString()} className="text-center font-semibold">
                      {day.toLocaleDateString("it-IT", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                      })}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-[80px_repeat(7,minmax(160px,1fr))] gap-3">
                  <div className="relative">
                    <div style={{ height: calendarHeight }} className="relative">
                      {hourMarks.map((hour) => (
                        <div
                          key={hour}
                          className="absolute left-0 right-0 text-[11px] text-muted-foreground"
                          style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE - 6 }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="min-w-[36px]">{`${pad(hour)}:00`}</span>
                            <span className="h-px flex-1 bg-white/40" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {days.map((day, dayIndex) => {
                    const dayStart = new Date(day);
                    dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
                    const dayEnd = new Date(day);
                    dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);
                    const dayAppointments = appointmentsByDay[dayIndex] ?? [];

                    return (
                      <div
                        key={day.toISOString()}
                        className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/70"
                        style={{ height: calendarHeight }}
                      >
                        {hourMarks.map((hour) => (
                          <div
                            key={hour}
                            className="absolute left-0 right-0 h-px bg-white/30"
                            style={{
                              top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE,
                            }}
                          />
                        ))}
                        {dayAppointments.map((item) => {
                          const start = toDate(item.startsAt);
                          const end = getAppointmentEnd(item);
                          const clippedStart = start < dayStart ? dayStart : start;
                          const clippedEnd = end > dayEnd ? dayEnd : end;
                          const offsetMinutes = Math.max(
                            0,
                            diffMinutes(clippedStart, dayStart),
                          );
                          const durationMinutes = Math.max(
                            15,
                            diffMinutes(clippedEnd, clippedStart),
                          );
                          const top = offsetMinutes * PIXELS_PER_MINUTE;
                          const height = durationMinutes * PIXELS_PER_MINUTE;
                          const statusMeta = getStatusMeta(item.status);
                          const showDetails = durationMinutes >= 60;

                          return (
                            <div
                              key={item.id}
                              className={`absolute left-2 right-2 rounded-xl border p-2 text-[11px] shadow-sm ${statusMeta.className}`}
                              style={{ top, height }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-semibold text-foreground">
                                  {item.student.firstName} {item.student.lastName}
                                </div>
                                <Badge variant="secondary">{statusMeta.label}</Badge>
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {item.type} · {formatTimeRange(start, end)} ·{" "}
                                {Math.round(diffMinutes(end, start))}m
                              </div>
                              {showDetails ? (
                                <>
                                  <div className="text-[11px] text-muted-foreground">
                                    {item.instructor?.name
                                      ? `Istruttore: ${item.instructor.name}`
                                      : "Istruttore: —"}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {item.vehicle?.name
                                      ? `Veicolo: ${item.vehicle.name}`
                                      : "Veicolo: —"}
                                  </div>
                                </>
                              ) : null}
                              <div className="mt-2 flex flex-wrap gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => handleStatusUpdate(item.id, "checked_in")}
                                >
                                  Check‑in
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => handleStatusUpdate(item.id, "no_show")}
                                >
                                  No‑show
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => handleStatusUpdate(item.id, "completed")}
                                >
                                  Completa
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => handleCancel(item.id)}
                                >
                                  Cancella
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo appuntamento</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleCreate}>
            <Select
              value={form.studentId}
              onValueChange={(value) => setForm((prev) => ({ ...prev, studentId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona allievo" />
              </SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.firstName} {student.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={form.type}
              onValueChange={(value) => setForm((prev) => ({ ...prev, type: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="guida">Guida</SelectItem>
                <SelectItem value="esame">Esame</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={form.instructorId}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, instructorId: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona istruttore" />
              </SelectTrigger>
              <SelectContent>
                {instructors.map((instructor) => (
                  <SelectItem key={instructor.id} value={instructor.id}>
                    {instructor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Gli istruttori arrivano dagli utenti con ruolo istruttore.
            </p>
            <Select
              value={form.vehicleId}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, vehicleId: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona veicolo" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nuovo veicolo"
                value={newVehicle}
                onChange={(event) => setNewVehicle(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddVehicle}
              >
                Aggiungi
              </Button>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Inizio</div>
              <DateTimePicker value={form.startsAt} onChange={handleStartChange} />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Durata rapida
              </div>
              <div className="flex flex-wrap gap-2">
                {[30, 60, 90, 120].map((minutes) => (
                  <Button
                    key={minutes}
                    type="button"
                    size="sm"
                    variant={durationPreset === minutes ? "default" : "outline"}
                    onClick={() => handleDurationPreset(minutes)}
                  >
                    {minutes} min
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Fine</div>
              <DateTimePicker value={form.endsAt} onChange={handleEndChange} />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-3">
              <span className="text-sm">Manda proposta</span>
              <Checkbox
                checked={form.sendProposal}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, sendProposal: Boolean(checked) }))
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={
                  !form.studentId ||
                  !form.startsAt ||
                  !form.instructorId ||
                  !form.vehicleId
                }
              >
                {form.sendProposal ? "Invia proposta" : "Salva"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ClientPageWrapper>
  );
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function formatRangeLabel(weekStart: Date) {
  const end = addDays(weekStart, 6);
  return `${weekStart.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
  })} - ${end.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
  })}`;
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return new Date("");
  return value instanceof Date ? value : new Date(value);
}

function diffMinutes(a: Date, b: Date) {
  return (a.getTime() - b.getTime()) / 60000;
}

function getAppointmentEnd(appointment: AppointmentRow) {
  const start = toDate(appointment.startsAt);
  const end = appointment.endsAt ? toDate(appointment.endsAt) : null;
  if (end && !Number.isNaN(end.getTime())) return end;
  return new Date(start.getTime() + SLOT_MINUTES * 60 * 1000);
}

function formatTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTimeRange(start: Date, end: Date) {
  return `${formatTime(start)}-${formatTime(end)}`;
}

function addMinutesToDateTime(value: string, minutes: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setMinutes(date.getMinutes() + minutes);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function getStatusMeta(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "checked_in") {
    return { label: "Check‑in", className: "border-emerald-200/70 bg-emerald-100/70" };
  }
  if (normalized === "completed") {
    return { label: "Completa", className: "border-indigo-200/70 bg-indigo-100/70" };
  }
  if (normalized === "no_show") {
    return { label: "No‑show", className: "border-rose-200/70 bg-rose-100/70" };
  }
  if (normalized.includes("proposal")) {
    return { label: "Proposta", className: "border-amber-200/70 bg-amber-100/80" };
  }
  return { label: "In programma", className: "border-sky-200/70 bg-sky-100/70" };
}
