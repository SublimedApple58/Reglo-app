"use client";

import React from "react";
import { Plus, SlidersHorizontal } from "lucide-react";

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
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  createAutoscuolaAppointment,
  cancelAutoscuolaAppointment,
  deleteAutoscuolaAppointment,
  getAutoscuolaAppointments,
  getAutoscuolaStudents,
  getAutoscuolaInstructors,
  getAutoscuolaVehicles,
  updateAutoscuolaAppointmentStatus,
} from "@/lib/actions/autoscuole.actions";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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
const SLOT_OPTIONS = ["30", "60"];
const PIXELS_PER_MINUTE = 1.6;
const TIME_OPTIONS = Array.from({ length: (DAY_END_HOUR - DAY_START_HOUR) * 2 }, (_, index) => {
  const total = DAY_START_HOUR * 60 + index * 30;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${pad(hours)}:${pad(minutes)}`;
});

type FilterKind = "instructor" | "vehicle" | "type" | "status";

type FilterEditorState = {
  kind: FilterKind;
  value: string;
};
type FilterOption = {
  value: string;
  label: string;
};

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
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [filterEditor, setFilterEditor] = React.useState<FilterEditorState | null>(null);
  const [viewMode, setViewMode] = React.useState<"week" | "day">("week");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [weekStart, setWeekStart] = React.useState(() => startOfWeek(new Date()));
  const [dayFocus, setDayFocus] = React.useState(() => normalizeDay(new Date()));
  const [pendingEventActionId, setPendingEventActionId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    studentId: "",
    day: "",
    time: "09:00",
    instructorId: "",
    vehicleId: "",
    sendProposal: false,
    duration: "30",
  });

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
  const rangeStart = viewMode === "week" ? weekStart : dayFocus;
  const rangeEnd = viewMode === "week" ? weekEnd : addDays(dayFocus, 1);

  const filtered = appointments.filter((item) => {
    if ((item.status ?? "").toLowerCase() === "cancelled") return false;
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
    if (statusFilter !== "all" && item.status !== statusFilter) {
      return false;
    }
    if (typeFilter !== "all" && item.type !== typeFilter) {
      return false;
    }
    const start = toDate(item.startsAt);
    const end = getAppointmentEnd(item);
    return start < rangeEnd && end > rangeStart;
  });

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.studentId || !form.day || !form.time || !form.instructorId || !form.vehicleId) {
      toast.info({ description: "Completa tutti i campi richiesti." });
      return;
    }
    const startDate = buildLocalDateTime(form.day, form.time);
    if (Number.isNaN(startDate.getTime())) {
      toast.error({ description: "Data o orario non validi." });
      return;
    }
    const endsAt = new Date(startDate.getTime() + Number(form.duration) * 60 * 1000);
    const res = await createAutoscuolaAppointment({
      studentId: form.studentId,
      type: "guida",
      startsAt: startDate.toISOString(),
      endsAt: endsAt.toISOString(),
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
      day: "",
      time: "09:00",
      instructorId: "",
      vehicleId: "",
      sendProposal: false,
      duration: "30",
    });
    toast.success({ description: res.message ?? "Operazione completata." });
    load();
  };

  const handleCancel = async (appointmentId: string) => {
    setPendingEventActionId(appointmentId);
    const res = await cancelAutoscuolaAppointment({ appointmentId });
    setPendingEventActionId(null);
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile annullare l'appuntamento.",
      });
      return;
    }
    setAppointments((current) => current.filter((item) => item.id !== appointmentId));
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

  const handleDelete = async (appointmentId: string) => {
    setPendingEventActionId(appointmentId);
    const res = await deleteAutoscuolaAppointment({ appointmentId });
    setPendingEventActionId(null);
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile cancellare l'evento.",
      });
      return;
    }
    setAppointments((current) => current.filter((item) => item.id !== appointmentId));
    toast.success({ description: res.message ?? "Evento cancellato." });
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
  const applyFilter = React.useCallback((kind: FilterKind, value: string) => {
    if (kind === "instructor") {
      setInstructorFilter(value);
      return;
    }
    if (kind === "vehicle") {
      setVehicleFilter(value);
      return;
    }
    if (kind === "type") {
      setTypeFilter(value);
      return;
    }
    setStatusFilter(value);
  }, []);

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const visibleDays = viewMode === "week" ? days : [dayFocus];
  const totalMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const calendarHeight = totalMinutes * PIXELS_PER_MINUTE;
  const hourMarks = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
    (_, index) => DAY_START_HOUR + index,
  );
  const appointmentsByDay = visibleDays.map((day) => {
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[220px]">
              <Input
                placeholder="Cerca appuntamenti"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="border-white/60 bg-white/80"
              />
            </div>
            <FilterTag
              label="Istruttore"
              value={instructorFilter}
              allValue="all"
              onClick={() => setFilterEditor({ kind: "instructor", value: instructorFilter })}
              displayValue={
                instructorFilter === "all"
                  ? null
                  : instructors.find((item) => item.id === instructorFilter)?.name ??
                    "Selezionato"
              }
            />
            <FilterTag
              label="Veicolo"
              value={vehicleFilter}
              allValue="all"
              onClick={() => setFilterEditor({ kind: "vehicle", value: vehicleFilter })}
              displayValue={
                vehicleFilter === "all"
                  ? null
                  : vehicles.find((item) => item.id === vehicleFilter)?.name ?? "Selezionato"
              }
            />
            <FilterTag
              label="Tipo"
              value={typeFilter}
              allValue="all"
              onClick={() => setFilterEditor({ kind: "type", value: typeFilter })}
              displayValue={typeFilter === "all" ? null : typeFilter === "guida" ? "Guida" : "Esame"}
            />
            <FilterTag
              label="Stato"
              value={statusFilter}
              allValue="all"
              onClick={() => setFilterEditor({ kind: "status", value: statusFilter })}
              displayValue={statusFilter === "all" ? null : getStatusMeta(statusFilter).label}
            />
            {(instructorFilter !== "all" ||
              vehicleFilter !== "all" ||
              typeFilter !== "all" ||
              statusFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-full"
                onClick={() => {
                  setInstructorFilter("all");
                  setVehicleFilter("all");
                  setTypeFilter("all");
                  setStatusFilter("all");
                }}
              >
                Reset filtri
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/70 p-1">
              <Button
                variant={viewMode === "week" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("week")}
              >
                Settimana
              </Button>
              <Button
                variant={viewMode === "day" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("day")}
              >
                Giorno
              </Button>
            </div>
            {viewMode === "week" ? (
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
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDayFocus((prev) => addDays(prev, -1))}
                >
                  ←
                </Button>
                <span className="min-w-[140px] text-center">
                  {dayFocus.toLocaleDateString("it-IT", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDayFocus((prev) => addDays(prev, 1))}
                >
                  →
                </Button>
              </div>
            )}
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
            <div className="overflow-x-auto overflow-y-hidden overscroll-y-none">
              <div className="min-w-[980px] space-y-3">
                <div
                  className={`grid gap-3 text-xs text-muted-foreground ${
                    viewMode === "week"
                      ? "grid-cols-[80px_repeat(7,minmax(160px,1fr))]"
                      : "grid-cols-[80px_minmax(240px,1fr)]"
                  }`}
                >
                  <div />
                  {visibleDays.map((day) => (
                    <div key={day.toISOString()} className="text-center font-semibold">
                      {day.toLocaleDateString("it-IT", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                      })}
                    </div>
                  ))}
                </div>
                <div
                  className={`grid gap-3 ${
                    viewMode === "week"
                      ? "grid-cols-[80px_repeat(7,minmax(160px,1fr))]"
                      : "grid-cols-[80px_minmax(240px,1fr)]"
                  }`}
                >
                  <div className="relative">
                    <div style={{ height: calendarHeight }} className="relative">
                      {hourMarks.map((hour) => (
                        <div
                          key={hour}
                          className="absolute left-0 right-0 text-[11px] text-muted-foreground"
                          style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="min-w-[36px]">{`${pad(hour)}:00`}</span>
                            <span className="h-px flex-1 bg-white/40" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {visibleDays.map((day, dayIndex) => {
                    const dayStart = new Date(day);
                    dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
                    const dayEnd = new Date(day);
                    dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);
                    const dayAppointments = appointmentsByDay[dayIndex] ?? [];

                    return (
                      <div
                        key={day.toISOString()}
                        className="relative overflow-hidden rounded-2xl border border-white/60 bg-[linear-gradient(transparent_29px,rgba(255,255,255,0.55)_30px)] bg-[length:100%_30px] shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_14px_36px_-28px_rgba(50,78,122,0.55)]"
                        style={{ height: calendarHeight }}
                        onClick={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          const offsetY = event.clientY - rect.top;
                          const minutes = Math.max(
                            0,
                            Math.min(totalMinutes, offsetY / PIXELS_PER_MINUTE),
                          );
                          const rounded = Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
                          const slotTime = new Date(dayStart.getTime() + rounded * 60 * 1000);
                          setForm((prev) => ({
                            ...prev,
                            day: formatYmd(slotTime),
                            time: `${pad(slotTime.getHours())}:${pad(slotTime.getMinutes())}`,
                          }));
                          setCreateOpen(true);
                        }}
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

                          const isPendingAction = pendingEventActionId === item.id;
                          return (
                            <DropdownMenu key={item.id}>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className={`absolute left-2 right-2 flex flex-col gap-1 overflow-hidden rounded-xl border p-2 text-left text-[11px] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${statusMeta.className}`}
                                  style={{ top, height }}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 truncate whitespace-nowrap font-semibold leading-tight text-foreground">
                                      {item.student.firstName} {item.student.lastName}
                                    </div>
                                    <Badge
                                      variant="secondary"
                                      className="shrink-0 border border-white/70 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80"
                                    >
                                      {statusMeta.shortLabel}
                                    </Badge>
                                  </div>
                                  <div className="truncate whitespace-nowrap text-[11px] text-muted-foreground">
                                    {item.type} · {formatTimeRange(start, end)} ·{" "}
                                    {Math.round(diffMinutes(end, start))}m
                                  </div>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="start"
                                side="right"
                                sideOffset={12}
                                className="w-72 rounded-2xl border border-white/70 bg-white/95 p-3 shadow-[0_20px_55px_-35px_rgba(50,78,122,0.45)]"
                              >
                                <div className="space-y-2">
                                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Evento
                                  </div>
                                  <div className="rounded-xl border border-white/70 bg-white/80 p-3">
                                    <div className="text-sm font-semibold text-foreground">
                                      {item.student.firstName} {item.student.lastName}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {item.type} · {formatTimeRange(start, end)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {start.toLocaleDateString("it-IT", {
                                        weekday: "long",
                                        day: "2-digit",
                                        month: "long",
                                      })}
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                      <Badge variant="secondary">{statusMeta.label}</Badge>
                                      {!canUpdateStatus(item) ? (
                                        <span className="text-[11px] text-muted-foreground">
                                          Slot passato o chiuso
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!canUpdateStatus(item) || isPendingAction}
                                    onClick={() => handleStatusUpdate(item.id, "checked_in")}
                                  >
                                    Check‑in
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!canUpdateStatus(item) || isPendingAction}
                                    onClick={() => handleStatusUpdate(item.id, "no_show")}
                                  >
                                    No‑show
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!canCompleteStatus(item) || isPendingAction}
                                    onClick={() => handleStatusUpdate(item.id, "completed")}
                                  >
                                    Completa
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!canUpdateStatus(item) || isPendingAction}
                                    onClick={() => handleCancel(item.id)}
                                  >
                                    Annulla
                                  </Button>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 w-full text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                                  disabled={isPendingAction}
                                  onClick={() => handleDelete(item.id)}
                                >
                                  Cancella definitivamente
                                </Button>
                              </DropdownMenuContent>
                            </DropdownMenu>
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

      <Dialog
        open={Boolean(filterEditor)}
        onOpenChange={(open) => {
          if (!open) setFilterEditor(null);
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>
              {getFilterTitle(filterEditor?.kind ?? "status")}
            </DialogTitle>
          </DialogHeader>
          {filterEditor ? (
            <div className="space-y-4">
              <Select
                value={filterEditor.value}
                onValueChange={(value) =>
                  setFilterEditor((current) =>
                    current ? { ...current, value } : current,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona filtro" />
                </SelectTrigger>
                <SelectContent>
                  {getFilterOptions(filterEditor.kind, instructors, vehicles).map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setFilterEditor(null)}>
                  Chiudi
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    applyFilter(filterEditor.kind, filterEditor.value);
                    setFilterEditor(null);
                  }}
                >
                  Applica
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo appuntamento</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Giorno</div>
              <DatePicker
                value={form.day}
                onChange={(value) => setForm((prev) => ({ ...prev, day: value }))}
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Orario</div>
              <Select
                value={form.time}
                onValueChange={(value) => setForm((prev) => ({ ...prev, time: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona orario" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Durata</div>
              <Select
                value={form.duration}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, duration: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Durata" />
                </SelectTrigger>
                <SelectContent>
                  {SLOT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                  !form.day ||
                  !form.time ||
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

function normalizeDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function canUpdateStatus(appointment: AppointmentRow) {
  const endTime = getAppointmentEnd(appointment);
  const isPast = endTime.getTime() < Date.now();
  const normalized = (appointment.status ?? "").toLowerCase();
  return !isPast && !["cancelled", "completed", "no_show"].includes(normalized);
}

function canCompleteStatus(appointment: AppointmentRow) {
  const endTime = getAppointmentEnd(appointment);
  const isPast = endTime.getTime() < Date.now();
  return !isPast && (appointment.status ?? "").toLowerCase() === "checked_in";
}

function formatTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTimeRange(start: Date, end: Date) {
  return `${formatTime(start)}-${formatTime(end)}`;
}

function formatYmd(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildLocalDateTime(day: string, time: string) {
  if (!day || !time) return new Date("");
  const [hoursRaw, minutesRaw] = time.split(":").map(Number);
  if (Number.isNaN(hoursRaw) || Number.isNaN(minutesRaw)) return new Date("");
  const date = new Date(day);
  date.setHours(hoursRaw, minutesRaw, 0, 0);
  return date;
}

function getStatusMeta(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "checked_in") {
    return {
      label: "Check‑in",
      shortLabel: "Check‑in",
      className: "border-emerald-200/70 bg-emerald-100/70",
    };
  }
  if (normalized === "completed") {
    return {
      label: "Completa",
      shortLabel: "Completata",
      className: "border-indigo-200/70 bg-indigo-100/70",
    };
  }
  if (normalized === "no_show") {
    return {
      label: "No‑show",
      shortLabel: "No‑show",
      className: "border-rose-200/70 bg-rose-100/70",
    };
  }
  if (normalized.includes("proposal")) {
    return {
      label: "Proposta",
      shortLabel: "Proposta",
      className: "border-amber-200/70 bg-amber-100/80",
    };
  }
  return {
    label: "In programma",
    shortLabel: "In agenda",
    className: "border-sky-200/70 bg-sky-100/70",
  };
}

function getFilterTitle(kind: FilterKind) {
  if (kind === "instructor") return "Filtra per istruttore";
  if (kind === "vehicle") return "Filtra per veicolo";
  if (kind === "type") return "Filtra per tipo";
  return "Filtra per stato";
}

function getFilterOptions(
  kind: FilterKind,
  instructors: ResourceOption[],
  vehicles: ResourceOption[],
): FilterOption[] {
  if (kind === "instructor") {
    return [
      { value: "all", label: "Tutti gli istruttori" },
      ...instructors.map((item) => ({ value: item.id, label: item.name })),
    ];
  }
  if (kind === "vehicle") {
    return [
      { value: "all", label: "Tutti i veicoli" },
      ...vehicles.map((item) => ({ value: item.id, label: item.name })),
    ];
  }
  if (kind === "type") {
    return [
      { value: "all", label: "Tutti i tipi" },
      { value: "guida", label: "Guida" },
      { value: "esame", label: "Esame" },
    ];
  }
  return [
    { value: "all", label: "Tutti gli stati" },
    { value: "scheduled", label: "In programma" },
    { value: "proposal", label: "Proposta" },
    { value: "checked_in", label: "Check‑in" },
    { value: "completed", label: "Completata" },
    { value: "no_show", label: "No‑show" },
  ];
}

function FilterTag({
  label,
  value,
  allValue,
  onClick,
  displayValue,
}: {
  label: string;
  value: string;
  allValue: string;
  onClick: () => void;
  displayValue?: string | null;
}) {
  const active = value !== allValue;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition",
        active
          ? "border-white/80 bg-white/85 text-foreground shadow-sm"
          : "border-dashed border-white/70 bg-white/50 text-muted-foreground hover:bg-white/70",
      )}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      <span>{label}</span>
      {displayValue ? (
        <span className="rounded-full bg-[#AFE2D4]/35 px-2 py-0.5 text-[11px] font-medium text-foreground">
          {displayValue}
        </span>
      ) : null}
    </button>
  );
}
