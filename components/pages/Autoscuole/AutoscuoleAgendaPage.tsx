"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import Lottie from "lottie-react";
import { Plus, SlidersHorizontal, CalendarDays, Users, Send, ChevronLeft, ChevronRight, Check, AlertTriangle } from "lucide-react";
import carAnimation from "@/assets/Car.json";

import { PageWrapper } from "@/components/Layout/PageWrapper";
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
  permanentlyCancelAutoscuolaAppointment,
  updateAutoscuolaAppointmentStatus,
} from "@/lib/actions/autoscuole.actions";
import { AgendaSkeleton } from "@/components/ui/page-skeleton";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LottieLoadingOverlay } from "@/components/ui/lottie-loading-overlay";
import { FieldGroup } from "@/components/ui/field-group";
import { InlineToggle } from "@/components/ui/inline-toggle";
import {
  OutOfAvailabilitySheet,
  type OutOfAvailabilityAppointment,
} from "@/components/pages/Autoscuole/OutOfAvailabilitySheet";

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

type AgendaBootstrapPayload = {
  appointments: AppointmentRow[];
  students: Array<{
    id: string;
    firstName: string;
    lastName: string;
  }>;
  instructors: ResourceOption[];
  vehicles: ResourceOption[];
  meta: {
    from: string | Date;
    to: string | Date;
    generatedAt: string | Date;
    count: number;
    cache?: boolean;
  };
};

const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;
const SLOT_MINUTES = 30;
const SLOT_OPTIONS = ["30", "60", "90", "120"];
const PIXELS_PER_MINUTE = 1.6;
const LESSON_TYPE_OPTIONS = [
  { value: "guida", label: "Guida" },
  { value: "manovre", label: "Manovre" },
  { value: "urbano", label: "Urbano" },
  { value: "extraurbano", label: "Extraurbano" },
  { value: "notturna", label: "Notturna" },
  { value: "autostrada", label: "Autostrada" },
  { value: "parcheggio", label: "Parcheggio" },
  { value: "altro", label: "Altro" },
  { value: "esame", label: "Esame" },
] as const;
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

export function AutoscuoleAgendaPage({
  tabs,
}: {
  tabs?: React.ReactNode;
} = {}) {
  const toast = useFeedbackToast();
  const [appointments, setAppointments] = React.useState<AppointmentRow[]>([]);
  const [students, setStudents] = React.useState<StudentOption[]>([]);
  const [instructors, setInstructors] = React.useState<ResourceOption[]>([]);
  const [vehicles, setVehicles] = React.useState<ResourceOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [instructorFilter, setInstructorFilter] = React.useState("all");
  const [vehicleFilter, setVehicleFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [filterEditor, setFilterEditor] = React.useState<FilterEditorState | null>(null);
  const [viewMode, setViewMode] = React.useState<"week" | "day">("week");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createStep, setCreateStep] = React.useState(0);
  const [creating, setCreating] = React.useState(false);
  const [weekStart, setWeekStart] = React.useState(() => startOfWeek(new Date()));
  const [dayFocus, setDayFocus] = React.useState(() => normalizeDay(new Date()));
  const [pendingEventActionId, setPendingEventActionId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    studentId: "",
    type: "guida",
    day: "",
    time: "09:00",
    instructorId: "",
    vehicleId: "",
    sendProposal: false,
    duration: "30",
  });
  const [outOfAvailAppointments, setOutOfAvailAppointments] = React.useState<OutOfAvailabilityAppointment[]>([]);
  const [outOfAvailSheetOpen, setOutOfAvailSheetOpen] = React.useState(false);
  const [nowTick, setNowTick] = React.useState(() => Date.now());
  const todayNormalized = React.useMemo(() => normalizeDay(new Date(nowTick)), [nowTick]);
  const bootstrapRequestRef = React.useRef(0);
  const calendarScrollRef = React.useRef<HTMLDivElement>(null);
  const hasAutoScrolled = React.useRef(false);

  const weekEnd = React.useMemo(() => addDays(weekStart, 7), [weekStart]);
  const rangeStart = React.useMemo(
    () => (viewMode === "week" ? weekStart : dayFocus),
    [dayFocus, viewMode, weekStart],
  );
  const rangeEnd = React.useMemo(
    () => (viewMode === "week" ? weekEnd : addDays(dayFocus, 1)),
    [dayFocus, viewMode, weekEnd],
  );

  const buildAgendaBootstrapUrl = React.useCallback(
    (from: Date, to: Date) => {
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        limit: "500",
      });

      if (instructorFilter !== "all") params.set("instructorId", instructorFilter);
      if (vehicleFilter !== "all") params.set("vehicleId", vehicleFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);

      return `/api/autoscuole/agenda/bootstrap?${params.toString()}`;
    },
    [instructorFilter, statusFilter, typeFilter, vehicleFilter],
  );

  const load = React.useCallback(async (options?: {
    silent?: boolean;
    prefetch?: boolean;
    from?: Date;
    to?: Date;
  }) => {
    const silent = options?.silent ?? false;
    const prefetch = options?.prefetch ?? false;
    const from = options?.from ?? rangeStart;
    const to = options?.to ?? rangeEnd;
    if (!prefetch) {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
    }
    const requestId = prefetch
      ? bootstrapRequestRef.current
      : ++bootstrapRequestRef.current;

    try {
      const response = await fetch(buildAgendaBootstrapUrl(from, to), {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: AgendaBootstrapPayload; message?: string }
        | null;
      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(payload?.message ?? "Impossibile caricare l'agenda.");
      }

      if (!prefetch && requestId === bootstrapRequestRef.current) {
        setAppointments(payload.data.appointments ?? []);
        setStudents(payload.data.students ?? []);
        setInstructors(payload.data.instructors ?? []);
        setVehicles(payload.data.vehicles ?? []);
      }
    } catch (error) {
      if (!prefetch) {
        toast.error({
          description:
            error instanceof Error ? error.message : "Impossibile caricare l'agenda.",
        });
      }
    } finally {
      if (!prefetch) {
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    }
  }, [buildAgendaBootstrapUrl, rangeEnd, rangeStart, toast]);

  const loadOutOfAvailability = React.useCallback(async () => {
    try {
      const res = await fetch("/api/autoscuole/appointments/out-of-availability", { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (payload?.success && Array.isArray(payload.data)) {
        setOutOfAvailAppointments(payload.data);
      }
    } catch {
      // silent — non-blocking
    }
  }, []);

  const hasLoadedOnce = React.useRef(false);
  React.useEffect(() => {
    // First load: full skeleton. Subsequent (week navigation): silent with grid-only indicator.
    const silent = hasLoadedOnce.current;
    load({ silent, from: rangeStart, to: rangeEnd }).then(() => {
      hasLoadedOnce.current = true;
      loadOutOfAvailability();
    });
  }, [load, loadOutOfAvailability, rangeEnd, rangeStart]);

  React.useEffect(() => {
    const prefetchFrom = viewMode === "week" ? rangeEnd : addDays(rangeStart, 1);
    const prefetchTo = viewMode === "week" ? addDays(rangeEnd, 7) : addDays(rangeEnd, 1);
    const handle = setTimeout(() => {
      load({ silent: true, prefetch: true, from: prefetchFrom, to: prefetchTo }).catch(
        () => undefined,
      );
    }, 250);
    return () => clearTimeout(handle);
  }, [load, rangeEnd, rangeStart, viewMode]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to current time on first load
  React.useEffect(() => {
    if (!loading && calendarScrollRef.current && !hasAutoScrolled.current) {
      hasAutoScrolled.current = true;
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60;
      const scrollTarget = currentMinutes * PIXELS_PER_MINUTE - calendarScrollRef.current.clientHeight / 3;
      calendarScrollRef.current.scrollTop = Math.max(0, scrollTarget);
    }
  }, [loading]);

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
    const start = toDate(item.startsAt);
    const end = getAppointmentEnd(item);
    return start < rangeEnd && end > rangeStart;
  });

  const handleCreate = async () => {
    if (!form.studentId || !form.day || !form.time || !form.instructorId || !form.vehicleId) {
      toast.info({ description: "Completa tutti i campi richiesti." });
      return;
    }
    const startDate = buildLocalDateTime(form.day, form.time);
    if (Number.isNaN(startDate.getTime())) {
      toast.error({ description: "Data o orario non validi." });
      return;
    }
    setCreating(true);
    const endsAt = new Date(startDate.getTime() + Number(form.duration) * 60 * 1000);
    const res = await createAutoscuolaAppointment({
      studentId: form.studentId,
      type: form.type,
      startsAt: startDate.toISOString(),
      endsAt: endsAt.toISOString(),
      instructorId: form.instructorId,
      vehicleId: form.vehicleId,
      sendProposal: form.sendProposal,
    });
    if (!res.success) {
      setCreating(false);
      toast.error({
        description: res.message ?? "Impossibile creare l'appuntamento.",
      });
      return;
    }
    setCreating(false);
    setCreateOpen(false);
    setForm({
      studentId: "",
      type: "guida",
      day: "",
      time: "09:00",
      instructorId: "",
      vehicleId: "",
      sendProposal: false,
      duration: "30",
    });
    toast.success({ description: res.message ?? "Operazione completata." });
    if (Array.isArray((res as { warnings?: string[] }).warnings) && (res as { warnings?: string[] }).warnings?.length) {
      toast.info({
        description: (res as { warnings?: string[] }).warnings?.join(" "),
      });
    }
    load({ silent: true });
  };

  const handleCancel = async (appointmentId: string) => {
    const confirmed = window.confirm("Sei sicuro di voler annullare questa guida?");
    if (!confirmed) return;
    setPendingEventActionId(appointmentId);
    const res = await cancelAutoscuolaAppointment({ appointmentId });
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile annullare l'appuntamento.",
      });
      setPendingEventActionId(null);
      return;
    }
    toast.success({
      description: "Guida annullata.",
    });
    await load({ silent: true });
    setPendingEventActionId(null);
  };

  const handlePermanentCancel = async (appointmentId: string) => {
    const confirmed = window.confirm("Sei sicuro di voler eliminare definitivamente questa guida? Non verrà riposizionata.");
    if (!confirmed) return;
    setPendingEventActionId(appointmentId);
    const res = await permanentlyCancelAutoscuolaAppointment({ appointmentId });
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile eliminare l'appuntamento.",
      });
      setPendingEventActionId(null);
      return;
    }
    toast.success({ description: "Guida eliminata definitivamente." });
    await load({ silent: true });
    setPendingEventActionId(null);
  };

  const handleDelete = async (appointmentId: string) => {
    setPendingEventActionId(appointmentId);
    const res = await deleteAutoscuolaAppointment({ appointmentId });
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile cancellare l'evento.",
      });
      setPendingEventActionId(null);
      return;
    }
    if (res.data?.proposalCreated && res.data?.proposalStartsAt) {
      toast.success({
        description: `Guida riposizionata: proposta inviata per ${new Date(
          res.data.proposalStartsAt,
        ).toLocaleString("it-IT")}.`,
      });
    } else if (res.data?.queued) {
      toast.info({
        description: "Guida cancellata. Ricerca nuovo slot in corso.",
      });
    } else {
      toast.success({ description: res.message ?? "Evento cancellato." });
    }
    await load({ silent: true });
    setPendingEventActionId(null);
  };

  const handleStatusUpdate = async (appointmentId: string, status: string) => {
    setPendingEventActionId(appointmentId);
    const res = await updateAutoscuolaAppointmentStatus({ appointmentId, status });
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile aggiornare lo stato.",
      });
      setPendingEventActionId(null);
      return;
    }
    await load({ silent: true });
    setPendingEventActionId(null);
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
    <PageWrapper
      title="Agenda"
      subTitle="Agenda guide ed esami."
    >
      <div className="relative w-full space-y-5" data-testid="autoscuole-agenda-page">
        <LottieLoadingOverlay visible={loading} />
        {tabs}

        {loading ? (
          <AgendaSkeleton />
        ) : (
          <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[220px]">
              <Input
                placeholder="Cerca appuntamenti"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="border-border bg-white"
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
              displayValue={
                typeFilter === "all"
                  ? null
                  : LESSON_TYPE_OPTIONS.find((option) => option.value === typeFilter)?.label ??
                    typeFilter
              }
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
            <div className="flex items-center gap-1 rounded-full border border-border bg-gray-50 p-1">
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
                  aria-label="Settimana precedente"
                  onClick={() => setWeekStart((prev) => addDays(prev, -7))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="min-w-[140px] text-center">
                  {formatRangeLabel(weekStart)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Settimana successiva"
                  onClick={() => setWeekStart((prev) => addDays(prev, 7))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Giorno precedente"
                  onClick={() => setDayFocus((prev) => addDays(prev, -1))}
                >
                  <ChevronLeft className="size-4" />
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
                  aria-label="Giorno successivo"
                  onClick={() => setDayFocus((prev) => addDays(prev, 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
          <Button onClick={() => { setCreateStep(0); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Nuovo appuntamento
          </Button>
        </div>

        {outOfAvailAppointments.length > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-3">
            <AlertTriangle className="size-5 shrink-0 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">
              <strong>{outOfAvailAppointments.length}</strong> guid{outOfAvailAppointments.length === 1 ? "a" : "e"} fuori disponibilità
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto border-yellow-300 bg-white text-yellow-800 hover:bg-yellow-100"
              onClick={() => setOutOfAvailSheetOpen(true)}
            >
              Gestisci
            </Button>
          </div>
        )}

        <OutOfAvailabilitySheet
          open={outOfAvailSheetOpen}
          onOpenChange={setOutOfAvailSheetOpen}
          appointments={outOfAvailAppointments}
          onActionComplete={() => {
            loadOutOfAvailability();
            load({ silent: true });
          }}
        />

        {/* ── Calendar scroll container ── */}
        <div className="relative" style={{ height: "calc(100vh - 280px)", minHeight: 400 }}>
          {/* Grid-only loading overlay — positioned over the container, not inside the scroll */}
          <AnimatePresence>
            {refreshing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-white/50"
              >
                <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-2xl border border-border bg-white px-8 py-5 shadow-card">
                  <Lottie animationData={carAnimation} loop style={{ width: 140, height: 140 }} />
                  <span className="text-sm font-medium text-muted-foreground">Caricamento...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div
            ref={calendarScrollRef}
            className="overflow-y-auto rounded-2xl border border-border bg-white shadow-card"
            style={{ height: "100%" }}
          >
          {/* Sticky day headers */}
          <div
            className={`sticky top-0 z-30 grid border-b border-border bg-white/95 backdrop-blur-sm text-xs text-muted-foreground ${
              viewMode === "week"
                ? "grid-cols-[56px_repeat(7,1fr)]"
                : "grid-cols-[56px_1fr]"
            }`}
          >
            <div />
            {visibleDays.map((day) => {
              const isDayToday = day.getTime() === todayNormalized.getTime();
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "py-2.5 text-center text-xs font-semibold transition-colors border-l border-border/50",
                    isDayToday
                      ? "bg-yellow-50 text-yellow-700"
                      : "text-muted-foreground",
                  )}
                >
                  {day.toLocaleDateString("it-IT", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                  })}
                </div>
              );
            })}
          </div>

          {/* Calendar body: time gutter + day columns */}
          <div
            className={`grid ${
              viewMode === "week"
                ? "grid-cols-[56px_repeat(7,1fr)]"
                : "grid-cols-[56px_1fr]"
            }`}
          >
            {/* Time gutter */}
            <div className="relative" style={{ height: calendarHeight }}>
              {hourMarks.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 flex items-start"
                  style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE }}
                >
                  <span className="w-full pr-2 text-right text-[11px] leading-none text-muted-foreground/70">
                    {`${pad(hour)}:00`}
                  </span>
                </div>
              ))}
              {/* Current time label in gutter */}
              {(() => {
                const now = new Date(nowTick);
                const mins = now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60;
                const todayInView = visibleDays.some(
                  (d) => d.getTime() === todayNormalized.getTime(),
                );
                if (!todayInView || mins < 0 || mins > totalMinutes) return null;
                return (
                  <div
                    className="absolute left-0 right-0 z-20 flex items-center"
                    style={{ top: mins * PIXELS_PER_MINUTE }}
                  >
                    <span className="w-full pr-1 text-right text-[10px] font-semibold tabular-nums text-red-500">
                      {`${pad(now.getHours())}:${pad(now.getMinutes())}`}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Day columns */}
            {visibleDays.map((day, dayIndex) => {
              const dayStart = new Date(day);
              dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
              const dayEnd = new Date(day);
              dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);
              const dayAppointments = appointmentsByDay[dayIndex] ?? [];
              const { laneMap, overflowGroups } = computeLanes(dayAppointments);
              const isDayToday = day.getTime() === todayNormalized.getTime();
              const now = new Date(nowTick);
              const nowMinutes = now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60;
              const showNowLine = isDayToday && nowMinutes >= 0 && nowMinutes <= totalMinutes;

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "relative cursor-pointer border-l border-border/50",
                    isDayToday ? "bg-yellow-50/30" : "",
                  )}
                  style={{ height: calendarHeight }}
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("[data-radix-popper-content-wrapper], [role='menu'], button, a")) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const offsetY = event.clientY - rect.top + (calendarScrollRef.current?.scrollTop ?? 0) - 40;
                    const minutes = Math.max(
                      0,
                      Math.min(totalMinutes, offsetY / PIXELS_PER_MINUTE),
                    );
                    const rounded = Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
                    const hours = Math.floor(rounded / 60);
                    const mins = rounded % 60;
                    setForm((prev) => ({
                      ...prev,
                      day: formatYmd(day),
                      time: `${pad(hours)}:${pad(mins)}`,
                    }));
                    setCreateStep(0);
                    setCreateOpen(true);
                  }}
                >
                  {/* Hour grid lines */}
                  {hourMarks.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 h-px bg-border/40"
                      style={{
                        top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE,
                      }}
                    />
                  ))}
                  {/* Red "now" line */}
                  {showNowLine && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
                      style={{ top: nowMinutes * PIXELS_PER_MINUTE }}
                    >
                      <span className="size-2 shrink-0 rounded-full bg-red-500" />
                      <span className="h-[1.5px] flex-1 bg-red-500" />
                    </div>
                  )}
                  {/* Appointments */}
                  {dayAppointments.map((item) => {
                    const laneInfo = laneMap.get(item.id);
                    const lane = laneInfo?.lane ?? 0;
                    const totalLanes = laneInfo?.totalLanes ?? 1;

                    // Skip ALL events that belong to an overflow cluster — they're shown as a summary block
                    if (totalLanes > MAX_VISIBLE_LANES) return null;

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
                    const statusMeta = getStatusMeta(item.status, item, new Date(nowTick));
                    const isCompact = height <= 56;

                    const GAP_PX = 2;
                    const laneLeft = `calc(${(lane / totalLanes) * 100}% + ${GAP_PX / 2}px)`;
                    const laneWidth = `calc(${(1 / totalLanes) * 100}% - ${GAP_PX}px)`;

                    const isPendingAction = pendingEventActionId === item.id;
                    return (
                      <DropdownMenu key={item.id}>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "absolute z-10 box-border flex flex-col overflow-hidden rounded-lg border text-left text-[11px] shadow-sm transition motion-safe:hover:-translate-y-0.5 hover:shadow-md",
                              isCompact ? "gap-0.5 p-1.5" : "gap-1 p-2",
                              isPendingAction ? "pointer-events-none opacity-75" : "",
                              statusMeta.className,
                            )}
                            style={{ top, height, left: laneLeft, width: laneWidth }}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                          >
                            {isPendingAction ? (
                              <>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="h-3 w-24 animate-pulse rounded-full bg-gray-100" />
                                  <div className="h-3 w-14 animate-pulse rounded-full bg-gray-100" />
                                </div>
                                <div className="h-3 w-20 animate-pulse rounded-full bg-gray-200" />
                              </>
                            ) : (
                              <>
                                <div className="flex items-center justify-between gap-2">
                                  <div
                                    className={cn(
                                      "min-w-0 truncate whitespace-nowrap font-semibold leading-tight text-foreground",
                                      isCompact ? "text-[10px]" : "text-[11px]",
                                    )}
                                  >
                                    {item.student.firstName} {item.student.lastName}
                                  </div>
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      "shrink-0 border border-border bg-white font-medium text-foreground/80",
                                      isCompact
                                        ? "px-1.5 py-0 text-[9px]"
                                        : "px-2 py-0.5 text-[10px]",
                                    )}
                                  >
                                    {statusMeta.shortLabel}
                                  </Badge>
                                </div>
                                <div className="truncate whitespace-nowrap text-[11px] text-muted-foreground">
                                  {item.type} · {formatTimeRange(start, end)}
                                  {!isCompact
                                    ? ` · ${Math.round(diffMinutes(end, start))}m`
                                    : ""}
                                </div>
                              </>
                            )}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          side="right"
                          sideOffset={12}
                          className="w-72 rounded-lg border border-border bg-white p-3 shadow-dropdown"
                        >
                          <div className="space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Evento
                            </div>
                            <div className="rounded-xl border border-border bg-white p-3">
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
                              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                <div>
                                  Istruttore:{" "}
                                  <span className="font-medium text-foreground/85">
                                    {item.instructor?.name ?? "Non assegnato"}
                                  </span>
                                </div>
                                <div>
                                  Veicolo:{" "}
                                  <span className="font-medium text-foreground/85">
                                    {item.vehicle?.name ?? "Non assegnato"}
                                  </span>
                                </div>
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
                            Cancella e riposiziona
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={isPendingAction}
                            onClick={() => handlePermanentCancel(item.id)}
                          >
                            Elimina definitivamente
                          </Button>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  })}
                  {/* Summary blocks for clusters with >2 simultaneous events */}
                  {overflowGroups.map((group) => {
                    const blockTop = (group.topMinutes - DAY_START_HOUR * 60) * PIXELS_PER_MINUTE;
                    const blockHeight = Math.max(30, group.spanMinutes * PIXELS_PER_MINUTE);
                    const earliest = toDate(group.allItems[0].startsAt);
                    const latest = group.allItems.reduce((acc, a) => {
                      const e = getAppointmentEnd(a);
                      return e > acc ? e : acc;
                    }, earliest);
                    return (
                      <DropdownMenu key={`overflow-${group.clusterId}`}>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="absolute left-1 right-1 z-10 box-border flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border border-pink-200 bg-pink-50 text-left shadow-sm transition hover:bg-pink-100 hover:shadow-md"
                            style={{ top: blockTop, height: blockHeight }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[12px] font-bold text-pink-600">
                              {group.allItems.length} guide
                            </span>
                            <span className="text-[10px] text-pink-500/80">
                              {formatTimeRange(earliest, latest)}
                            </span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          side="right"
                          sideOffset={12}
                          className="w-80 rounded-lg border border-border bg-white p-3 shadow-dropdown"
                        >
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {group.allItems.length} guide sovrapposte
                          </div>
                          <div className="space-y-1.5 max-h-72 overflow-y-auto">
                            {group.allItems.map((item) => {
                              const s = toDate(item.startsAt);
                              const e = getAppointmentEnd(item);
                              const meta = getStatusMeta(item.status, item, new Date(nowTick));
                              const itemPending = pendingEventActionId === item.id;
                              return (
                                <DropdownMenu key={item.id}>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className={cn(
                                        "w-full rounded-lg border p-2.5 text-left text-xs transition hover:shadow-sm",
                                        itemPending ? "pointer-events-none opacity-75" : "",
                                        meta.className,
                                      )}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-foreground truncate">
                                          {item.student.firstName} {item.student.lastName}
                                        </span>
                                        <Badge
                                          variant="secondary"
                                          className="shrink-0 border border-border bg-white px-1.5 py-0 text-[9px] font-medium text-foreground/80"
                                        >
                                          {meta.shortLabel}
                                        </Badge>
                                      </div>
                                      <div className="text-muted-foreground mt-0.5">
                                        {item.type} · {formatTimeRange(s, e)} · {item.instructor?.name ?? "N/A"}
                                      </div>
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="start"
                                    side="right"
                                    sideOffset={8}
                                    className="w-72 rounded-lg border border-border bg-white p-3 shadow-dropdown"
                                  >
                                    <div className="space-y-2">
                                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                        Evento
                                      </div>
                                      <div className="rounded-xl border border-border bg-white p-3">
                                        <div className="text-sm font-semibold text-foreground">
                                          {item.student.firstName} {item.student.lastName}
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                          {item.type} · {formatTimeRange(s, e)}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {s.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}
                                        </div>
                                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                          <div>Istruttore: <span className="font-medium text-foreground/85">{item.instructor?.name ?? "Non assegnato"}</span></div>
                                          <div>Veicolo: <span className="font-medium text-foreground/85">{item.vehicle?.name ?? "Non assegnato"}</span></div>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                          <Badge variant="secondary">{meta.label}</Badge>
                                          {!canUpdateStatus(item) ? <span className="text-[11px] text-muted-foreground">Slot passato o chiuso</span> : null}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                      <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || itemPending} onClick={() => handleStatusUpdate(item.id, "checked_in")}>Check‑in</Button>
                                      <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || itemPending} onClick={() => handleStatusUpdate(item.id, "no_show")}>No‑show</Button>
                                      <Button type="button" variant="outline" size="sm" disabled={!canCompleteStatus(item) || itemPending} onClick={() => handleStatusUpdate(item.id, "completed")}>Completa</Button>
                                      <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || itemPending} onClick={() => handleCancel(item.id)}>Annulla</Button>
                                    </div>
                                    <Button type="button" variant="ghost" size="sm" className="mt-2 w-full text-rose-700 hover:bg-rose-50 hover:text-rose-700" disabled={itemPending} onClick={() => handleDelete(item.id)}>Cancella e riposiziona</Button>
                                    <Button type="button" variant="ghost" size="sm" className="w-full text-red-600 hover:bg-red-50 hover:text-red-700" disabled={itemPending} onClick={() => handlePermanentCancel(item.id)}>Elimina definitivamente</Button>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              );
                            })}
                          </div>
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
          </>
        )}
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
        <DialogContent className="sm:max-w-[420px] gap-0 p-0 overflow-hidden">
          <DialogTitle className="sr-only">Nuovo appuntamento</DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-0 border-b border-border px-6 pt-5 pb-4">
            {[
              { icon: CalendarDays, label: "Quando" },
              { icon: Users, label: "Chi" },
              { icon: Send, label: "Conferma" },
            ].map((s, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <div className={cn("mx-2 h-px flex-1 transition-colors", i <= createStep ? "bg-yellow-300" : "bg-border")} />
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (i < createStep) setCreateStep(i);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                    i === createStep
                      ? "border-yellow-300 bg-yellow-50 text-yellow-700"
                      : i < createStep
                        ? "cursor-pointer border-yellow-200 bg-yellow-50/50 text-yellow-600"
                        : "border-border bg-white text-muted-foreground",
                  )}
                >
                  {i < createStep ? (
                    <Check className="size-3" />
                  ) : (
                    <s.icon className="size-3" />
                  )}
                  {s.label}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div>
            {/* Step content area — fixed height for smooth transitions */}
            <div className="relative min-h-[220px] px-6 py-5">
              <AnimatePresence mode="wait" initial={false}>
                {/* Step 1: Quando */}
                {createStep === 0 && (
                  <motion.div
                    key="step-0"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Quando</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">Scegli giorno, orario e durata della guida</p>
                    </div>
                    <FieldGroup label="Giorno" required>
                      <DatePicker
                        value={form.day}
                        onChange={(value) => setForm((prev) => ({ ...prev, day: value }))}
                      />
                    </FieldGroup>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldGroup label="Orario" required>
                        <Select
                          value={form.time}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, time: value }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Orario" /></SelectTrigger>
                          <SelectContent>
                            {TIME_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>{option}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldGroup>
                      <FieldGroup label="Durata">
                        <Select
                          value={form.duration}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, duration: value }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Durata" /></SelectTrigger>
                          <SelectContent>
                            {SLOT_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>{option} min</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldGroup>
                    </div>
                  </motion.div>
                )}

                {/* Step 2: Chi */}
                {createStep === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Dettagli</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">Tipo di guida, istruttore, allievo e veicolo</p>
                    </div>
                    <FieldGroup label="Tipo guida" required>
                      <Select
                        value={form.type}
                        onValueChange={(value) => setForm((prev) => ({ ...prev, type: value }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Seleziona tipo" /></SelectTrigger>
                        <SelectContent>
                          {LESSON_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldGroup>
                    <FieldGroup label="Allievo" required>
                      <Select
                        value={form.studentId}
                        onValueChange={(value) => setForm((prev) => ({ ...prev, studentId: value }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Seleziona allievo" /></SelectTrigger>
                        <SelectContent>
                          {students.map((student) => (
                            <SelectItem key={student.id} value={student.id}>
                              {student.firstName} {student.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldGroup>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldGroup label="Istruttore" required>
                        <Select
                          value={form.instructorId}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, instructorId: value }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Istruttore" /></SelectTrigger>
                          <SelectContent>
                            {instructors.map((instructor) => (
                              <SelectItem key={instructor.id} value={instructor.id}>{instructor.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldGroup>
                      <FieldGroup label="Veicolo" required>
                        <Select
                          value={form.vehicleId}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, vehicleId: value }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Veicolo" /></SelectTrigger>
                          <SelectContent>
                            {vehicles.map((vehicle) => (
                              <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldGroup>
                    </div>
                  </motion.div>
                )}

                {/* Step 3: Conferma */}
                {createStep === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Riepilogo</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">Controlla i dati e conferma</p>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border bg-gray-50/50 p-3">
                      <SummaryRow label="Giorno" value={form.day || "—"} />
                      <SummaryRow label="Orario" value={`${form.time} · ${form.duration} min`} />
                      <SummaryRow label="Tipo" value={LESSON_TYPE_OPTIONS.find((o) => o.value === form.type)?.label ?? form.type} />
                      <SummaryRow label="Allievo" value={
                        students.find((s) => s.id === form.studentId)
                          ? `${students.find((s) => s.id === form.studentId)!.firstName} ${students.find((s) => s.id === form.studentId)!.lastName}`
                          : "—"
                      } />
                      <SummaryRow label="Istruttore" value={instructors.find((i) => i.id === form.instructorId)?.name ?? "—"} />
                      <SummaryRow label="Veicolo" value={vehicles.find((v) => v.id === form.vehicleId)?.name ?? "—"} />
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setForm((prev) => ({ ...prev, sendProposal: !prev.sendProposal }))}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setForm((prev) => ({ ...prev, sendProposal: !prev.sendProposal })); } }}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-left transition",
                        form.sendProposal
                          ? "border-yellow-200 bg-yellow-50"
                          : "border-border bg-white",
                      )}
                    >
                      <div>
                        <div className="text-sm font-medium text-foreground">Invia come proposta</div>
                        <div className="text-xs text-muted-foreground">L&apos;allievo potrà accettare o rifiutare</div>
                      </div>
                      <InlineToggle checked={form.sendProposal} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer — always visible */}
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              {createStep > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreateStep((s) => s - 1)}
                >
                  <ChevronLeft className="mr-1 size-3.5" />
                  Indietro
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                  Annulla
                </Button>
              )}

              {createStep < 2 ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    createStep === 0
                      ? !form.day || !form.time
                      : !form.studentId || !form.instructorId || !form.vehicleId
                  }
                  onClick={() => setCreateStep((s) => s + 1)}
                >
                  Avanti
                  <ChevronRight className="ml-1 size-3.5" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    creating ||
                    !form.studentId ||
                    !form.day ||
                    !form.time ||
                    !form.instructorId ||
                    !form.vehicleId
                  }
                  onClick={handleCreate}
                >
                  {creating ? "Salvataggio..." : form.sendProposal ? "Invia proposta" : "Conferma"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </PageWrapper>
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

const MAX_VISIBLE_LANES = 2;

type LaneInfo = { lane: number; totalLanes: number; clusterId: number };
type OverflowGroup = {
  clusterId: number;
  /** Earliest start among ALL items in the cluster (minutes from day start) */
  topMinutes: number;
  /** Span of the cluster (minutes) */
  spanMinutes: number;
  /** Number of events beyond the visible lanes */
  overflowCount: number;
  /** All events in this cluster (for popover) */
  allItems: AppointmentRow[];
};
type LaneResult = {
  laneMap: Map<string, LaneInfo>;
  overflowGroups: OverflowGroup[];
};

/**
 * Compute horizontal "lanes" for overlapping appointments within a single day.
 * When a cluster has more than MAX_VISIBLE_LANES events, the extras are collapsed
 * into an overflow badge.
 */
function computeLanes(appointments: AppointmentRow[]): LaneResult {
  const laneMap = new Map<string, LaneInfo>();
  const overflowGroups: OverflowGroup[] = [];
  if (!appointments.length) return { laneMap, overflowGroups };

  const sorted = [...appointments].sort((a, b) => {
    const diff = toDate(a.startsAt).getTime() - toDate(b.startsAt).getTime();
    if (diff !== 0) return diff;
    return (
      (getAppointmentEnd(b).getTime() - toDate(b.startsAt).getTime()) -
      (getAppointmentEnd(a).getTime() - toDate(a.startsAt).getTime())
    );
  });

  // 1. Build clusters — groups of mutually-overlapping events
  const clusters: AppointmentRow[][] = [];
  let currentCluster: AppointmentRow[] = [];
  let clusterEnd = 0;

  for (const appt of sorted) {
    const start = toDate(appt.startsAt).getTime();
    const end = getAppointmentEnd(appt).getTime();

    if (currentCluster.length === 0 || start < clusterEnd) {
      currentCluster.push(appt);
      clusterEnd = Math.max(clusterEnd, end);
    } else {
      clusters.push(currentCluster);
      currentCluster = [appt];
      clusterEnd = end;
    }
  }
  if (currentCluster.length) clusters.push(currentCluster);

  // 2. Within each cluster, greedily assign lanes
  for (let ci = 0; ci < clusters.length; ci++) {
    const cluster = clusters[ci];
    const lanes: number[] = [];

    for (const appt of cluster) {
      const start = toDate(appt.startsAt).getTime();
      const end = getAppointmentEnd(appt).getTime();

      let assignedLane = -1;
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] <= start) {
          assignedLane = i;
          lanes[i] = end;
          break;
        }
      }
      if (assignedLane === -1) {
        assignedLane = lanes.length;
        lanes.push(end);
      }

      laneMap.set(appt.id, { lane: assignedLane, totalLanes: 0, clusterId: ci });
    }

    const totalLanes = lanes.length;
    for (const appt of cluster) {
      laneMap.get(appt.id)!.totalLanes = totalLanes;
    }

    // 3. If cluster overflows, record the overflow group
    if (totalLanes > MAX_VISIBLE_LANES) {
      const starts = cluster.map((a) => toDate(a.startsAt).getTime());
      const ends = cluster.map((a) => getAppointmentEnd(a).getTime());
      const earliest = Math.min(...starts);
      const latest = Math.max(...ends);
      overflowGroups.push({
        clusterId: ci,
        topMinutes: (earliest - normalizeDay(new Date(earliest)).getTime()) / 60000,
        spanMinutes: (latest - earliest) / 60000,
        overflowCount: cluster.filter((a) => laneMap.get(a.id)!.lane >= MAX_VISIBLE_LANES).length,
        allItems: cluster,
      });
    }
  }

  return { laneMap, overflowGroups };
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

function getStatusMeta(
  status: string,
  appointment?: AppointmentRow,
  now: Date = new Date(),
) {
  const normalized = status.toLowerCase();
  if (normalized === "checked_in") {
    if (appointment) {
      const start = toDate(appointment.startsAt);
      const end = getAppointmentEnd(appointment);
      if (now >= start && now < end) {
        return {
          label: "In corso",
          shortLabel: "In corso",
          className: "border-emerald-300/80 bg-emerald-200/85",
        };
      }
      if (now < start) {
        return {
          label: "Confermata",
          shortLabel: "Confermata",
          className: "border-emerald-200/80 bg-emerald-100/85",
        };
      }
    }
    return {
      label: "Check‑in",
      shortLabel: "Check‑in",
      className: "border-emerald-200/70 bg-emerald-100/70",
    };
  }
  if (normalized === "confirmed" || normalized === "scheduled") {
    return {
      label: "Programmata",
      shortLabel: "Programmata",
      className: "border-sky-200/70 bg-sky-100/75",
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
      ...LESSON_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      })),
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
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
        "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition",
        active
          ? "border-yellow-200 bg-yellow-50 text-yellow-700 shadow-sm"
          : "border-dashed border-border bg-white text-muted-foreground hover:bg-gray-50",
      )}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      <span>{label}</span>
      {displayValue ? (
        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-700">
          {displayValue}
        </span>
      ) : null}
    </button>
  );
}
