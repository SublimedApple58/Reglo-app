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
  createAutoscuolaInstructor,
  createAutoscuolaVehicle,
  updateAutoscuolaAppointmentStatus,
} from "@/lib/actions/autoscuole.actions";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type StudentOption = { id: string; firstName: string; lastName: string };
type ResourceOption = { id: string; name: string };
type AppointmentRow = {
  id: string;
  type: string;
  status: string;
  startsAt: string | Date;
  student: StudentOption;
  instructor?: ResourceOption | null;
  vehicle?: ResourceOption | null;
};

export function AutoscuoleAgendaPage() {
  const toast = useFeedbackToast();
  const [appointments, setAppointments] = React.useState<AppointmentRow[]>([]);
  const [students, setStudents] = React.useState<StudentOption[]>([]);
  const [instructors, setInstructors] = React.useState<ResourceOption[]>([]);
  const [vehicles, setVehicles] = React.useState<ResourceOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [weekStart, setWeekStart] = React.useState(() => startOfWeek(new Date()));
  const [form, setForm] = React.useState({
    studentId: "",
    type: "guida",
    startsAt: "",
    instructorId: "",
    vehicleId: "",
  });
  const [newInstructor, setNewInstructor] = React.useState("");
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

  const filtered = appointments.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      item.student.firstName.toLowerCase().includes(term) ||
      item.student.lastName.toLowerCase().includes(term) ||
      item.type.toLowerCase().includes(term)
    );
  });

  const visibleAppointments = filtered.filter((item) => item.status !== "cancelled");

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.studentId || !form.startsAt || !form.instructorId || !form.vehicleId) return;
    const res = await createAutoscuolaAppointment({
      studentId: form.studentId,
      type: form.type,
      startsAt: form.startsAt,
      instructorId: form.instructorId,
      vehicleId: form.vehicleId,
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
      instructorId: "",
      vehicleId: "",
    });
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

  const handleAddInstructor = async () => {
    if (!newInstructor.trim()) {
      toast.info({ description: "Inserisci un nome istruttore." });
      return;
    }
    const res = await createAutoscuolaInstructor({ name: newInstructor.trim() });
    if (!res.success || !res.data) {
      toast.error({
        description: res.message ?? "Impossibile creare l'istruttore.",
      });
      return;
    }
    setNewInstructor("");
    setForm((prev) => ({ ...prev, instructorId: res.data.id }));
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

  const slots = buildSlots(7, 21, 30);
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );

  const appointmentMap = new Map<string, AppointmentRow[]>();
  for (const appointment of visibleAppointments) {
    const date = new Date(appointment.startsAt);
    const key = buildSlotKey(date);
    const current = appointmentMap.get(key) ?? [];
    current.push(appointment);
    appointmentMap.set(key, current);
  }

  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Agenda guide ed esami."
      hideHero
    >
      <div className="space-y-5">
        <AutoscuoleNav />

        <div className="glass-panel glass-strong flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-[220px]">
            <Input
              placeholder="Cerca appuntamenti"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="border-white/60 bg-white/80"
            />
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
              <div className="min-w-[980px]">
                <div className="grid grid-cols-[90px_repeat(7,minmax(140px,1fr))] gap-2 text-xs text-muted-foreground">
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
                <div className="mt-3 space-y-2">
                  {slots.map((slot) => (
                    <div
                      key={slot.label}
                      className="grid grid-cols-[90px_repeat(7,minmax(140px,1fr))] gap-2"
                    >
                      <div className="pt-2 text-xs text-muted-foreground">
                        {slot.label}
                      </div>
                      {days.map((day) => {
                        const cellKey = buildSlotKey(
                          new Date(
                            day.getFullYear(),
                            day.getMonth(),
                            day.getDate(),
                            slot.hours,
                            slot.minutes,
                          ),
                        );
                        const items = appointmentMap.get(cellKey) ?? [];
                        return (
                          <div
                            key={`${cellKey}`}
                            className="min-h-[64px] rounded-2xl border border-white/50 bg-white/70 p-2"
                          >
                            {items.map((item) => (
                              <div
                                key={item.id}
                                className="glass-card glass-strong mb-2 flex flex-col gap-1 rounded-xl p-2 text-xs"
                              >
                                <div className="font-semibold text-foreground">
                                  {item.student.firstName} {item.student.lastName}
                                </div>
                                <div className="text-muted-foreground">
                                  {item.type}
                                </div>
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
                                <div className="flex items-center justify-between gap-2">
                                  <Badge variant="secondary">{item.status}</Badge>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => handleCancel(item.id)}
                                  >
                                    Cancella
                                  </Button>
                                </div>
                                <div className="flex flex-wrap gap-1 pt-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() =>
                                      handleStatusUpdate(item.id, "checked_in")
                                    }
                                  >
                                    Check‑in
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() =>
                                      handleStatusUpdate(item.id, "no_show")
                                    }
                                  >
                                    No‑show
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() =>
                                      handleStatusUpdate(item.id, "completed")
                                    }
                                  >
                                    Completa
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
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
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nuovo istruttore"
                value={newInstructor}
                onChange={(event) => setNewInstructor(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddInstructor}
              >
                Aggiungi
              </Button>
            </div>
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
            <DateTimePicker
              value={form.startsAt}
              onChange={(value) => setForm((prev) => ({ ...prev, startsAt: value }))}
            />
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
                Salva
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

function buildSlots(startHour: number, endHour: number, stepMinutes: number) {
  const slots: { label: string; hours: number; minutes: number }[] = [];
  for (let hour = startHour; hour < endHour; hour += 1) {
    for (let minutes = 0; minutes < 60; minutes += stepMinutes) {
      slots.push({ label: `${pad(hour)}:${pad(minutes)}`, hours: hour, minutes });
    }
  }
  return slots;
}

function buildSlotKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
