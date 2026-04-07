"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import Lottie from "lottie-react";
import { Plus, SlidersHorizontal, CalendarDays, Users, Send, ChevronLeft, ChevronRight, Check, AlertTriangle, LayoutGrid, Ban } from "lucide-react";
import carAnimation from "@/assets/Car.json";

import { PageWrapper } from "@/components/Layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
  getInstructorAvailabilityForAgenda,
  createInstructorBlock,
  deleteInstructorBlock,
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
  replacedByAppointmentId?: string | null;
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
  holidays?: Array<{ date: string; label: string | null }>;
  instructorBlocks?: Array<Record<string, unknown>>;
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

type InstructorAvailabilityWeek = {
  instructorId: string;
  instructorName: string;
  days: Record<string, Array<{ startMinutes: number; endMinutes: number }>>;
};

const INSTRUCTOR_COLORS = [
  { bg: "bg-pink-50/60", border: "border-pink-200/40", text: "text-pink-700", avatar: "bg-pink-100 text-pink-700" },
  { bg: "bg-sky-50/60", border: "border-sky-200/40", text: "text-sky-700", avatar: "bg-sky-100 text-sky-700" },
  { bg: "bg-emerald-50/60", border: "border-emerald-200/40", text: "text-emerald-700", avatar: "bg-emerald-100 text-emerald-700" },
  { bg: "bg-amber-50/60", border: "border-amber-200/40", text: "text-amber-700", avatar: "bg-amber-100 text-amber-700" },
  { bg: "bg-violet-50/60", border: "border-violet-200/40", text: "text-violet-700", avatar: "bg-violet-100 text-violet-700" },
  { bg: "bg-rose-50/60", border: "border-rose-200/40", text: "text-rose-700", avatar: "bg-rose-100 text-rose-700" },
  { bg: "bg-teal-50/60", border: "border-teal-200/40", text: "text-teal-700", avatar: "bg-teal-100 text-teal-700" },
  { bg: "bg-orange-50/60", border: "border-orange-200/40", text: "text-orange-700", avatar: "bg-orange-100 text-orange-700" },
];

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
  const [agendaMode, setAgendaMode] = React.useState<"instructor" | "classic">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("reglo-agenda-mode") as "instructor" | "classic") || "instructor";
    }
    return "instructor";
  });
  const toggleAgendaMode = React.useCallback(() => {
    setAgendaMode((prev) => {
      const next = prev === "instructor" ? "classic" : "instructor";
      localStorage.setItem("reglo-agenda-mode", next);
      return next;
    });
  }, []);
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
  const [instructorAvailability, setInstructorAvailability] = React.useState<InstructorAvailabilityWeek[]>([]);
  const [outOfAvailAppointments, setOutOfAvailAppointments] = React.useState<OutOfAvailabilityAppointment[]>([]);
  const [outOfAvailSheetOpen, setOutOfAvailSheetOpen] = React.useState(false);
  const [holidays, setHolidays] = React.useState<Array<{ date: string; label: string | null }>>([]);
  const [instructorBlocks, setInstructorBlocks] = React.useState<Array<{
    id: string; instructorId: string; startsAt: string; endsAt: string; reason: string | null;
  }>>([]);
  const [blockDialogOpen, setBlockDialogOpen] = React.useState(false);
  const [blockForm, setBlockForm] = React.useState({ instructorId: "", date: "", startTime: "09:00", endTime: "10:00", reason: "" });
  const [blockCreating, setBlockCreating] = React.useState(false);
  const [blockDeleting, setBlockDeleting] = React.useState<string | null>(null);
  const [holidayDialogOpen, setHolidayDialogOpen] = React.useState(false);
  const [holidayDialogDate, setHolidayDialogDate] = React.useState<Date | null>(null);
  const [holidayLabel, setHolidayLabel] = React.useState("");
  const [holidayPending, setHolidayPending] = React.useState(false);
  const [removeHolidayDialogOpen, setRemoveHolidayDialogOpen] = React.useState(false);
  const [removeHolidayDate, setRemoveHolidayDate] = React.useState<Date | null>(null);
  const [nowTick, setNowTick] = React.useState(() => Date.now());
  const todayNormalized = React.useMemo(() => normalizeDay(new Date(nowTick)), [nowTick]);
  const bootstrapRequestRef = React.useRef(0);
  const calendarScrollRef = React.useRef<HTMLDivElement>(null);
  const hasAutoScrolled = React.useRef(false);

  const holidaySet = React.useMemo(() => {
    const set = new Map<string, string | null>();
    for (const h of holidays) {
      const d = new Date(h.date);
      set.set(formatYmd(d), h.label);
    }
    return set;
  }, [holidays]);

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
        setHolidays(payload.data.holidays ?? []);
        setInstructorBlocks((payload.data.instructorBlocks ?? []).map((b: Record<string, unknown>) => ({
          id: b.id as string,
          instructorId: b.instructorId as string,
          startsAt: typeof b.startsAt === "string" ? b.startsAt : (b.startsAt as Date).toISOString(),
          endsAt: typeof b.endsAt === "string" ? b.endsAt : (b.endsAt as Date).toISOString(),
          reason: (b.reason as string | null) ?? null,
        })));
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

  // Fetch instructor availability for the visible range
  React.useEffect(() => {
    let cancelled = false;
    const from = viewMode === "week" ? weekStart : dayFocus;
    const to = viewMode === "week" ? addDays(weekStart, 7) : addDays(dayFocus, 1);
    getInstructorAvailabilityForAgenda({ from: formatYmd(from), to: formatYmd(to) }).then((res) => {
      if (cancelled) return;
      setInstructorAvailability(res.success && res.data ? res.data : []);
    });
    return () => { cancelled = true; };
  }, [viewMode, dayFocus, weekStart]);

  // Build instructor columns for day view
  const dayViewInstructors = React.useMemo(() => {
    if (viewMode !== "day") return [];
    const dateKey = formatYmd(dayFocus);
    const instrMap = new Map<string, { id: string; name: string; ranges: Array<{ startMinutes: number; endMinutes: number }> }>();
    for (const instr of instructors) {
      instrMap.set(instr.id, { id: instr.id, name: instr.name, ranges: [] });
    }
    for (const avail of instructorAvailability) {
      const existing = instrMap.get(avail.instructorId);
      const ranges = avail.days[dateKey] ?? [];
      if (existing) {
        existing.ranges = ranges;
      } else {
        instrMap.set(avail.instructorId, { id: avail.instructorId, name: avail.instructorName, ranges });
      }
    }
    return Array.from(instrMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [viewMode, instructors, instructorAvailability, dayFocus]);

  const filtered = React.useMemo(() => {
    // Build a set of active (non-cancelled) appointments keyed by instructor id + time overlap
    const activeByInstructor = new Map<string, { start: Date; end: Date }[]>();
    for (const item of appointments) {
      if ((item.status ?? "").toLowerCase() === "cancelled") continue;
      if (!item.instructor?.id) continue;
      const start = toDate(item.startsAt);
      const end = getAppointmentEnd(item);
      const list = activeByInstructor.get(item.instructor.id) ?? [];
      list.push({ start, end });
      activeByInstructor.set(item.instructor.id, list);
    }

    return appointments.filter((item) => {
      const isCancelled = (item.status ?? "").toLowerCase() === "cancelled";

      // Hide cancelled appointments that have been replaced
      if (isCancelled) {
        // Explicitly replaced via repositioning
        if (item.replacedByAppointmentId) return false;
        // Implicitly replaced: another active appointment overlaps the same instructor slot
        if (item.instructor?.id) {
          const slots = activeByInstructor.get(item.instructor.id);
          if (slots) {
            const cStart = toDate(item.startsAt);
            const cEnd = getAppointmentEnd(item);
            if (slots.some((s) => s.start < cEnd && s.end > cStart)) return false;
          }
        }
      }

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
  }, [appointments, search, rangeStart, rangeEnd]);

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
  // Stable instructor → color mapping (used in both week and day views)
  const instructorColorMap = React.useMemo(() => {
    const map = new Map<string, typeof INSTRUCTOR_COLORS[0]>();
    const sorted = [...instructors].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach((instr, idx) => {
      map.set(instr.id, INSTRUCTOR_COLORS[idx % INSTRUCTOR_COLORS.length]);
    });
    return map;
  }, [instructors]);

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
      hideHero
    >
      <div className="relative w-full space-y-5" data-testid="autoscuole-agenda-page">
        <LottieLoadingOverlay visible={loading} />
        <div className="mx-auto max-w-7xl space-y-5">
          <header className="space-y-1.5">
            <h1 className="ds-section-primary text-foreground">Agenda</h1>
            <p className="text-sm text-muted-foreground">Agenda guide ed esami.</p>
          </header>
          {tabs}
          {loading && <AgendaSkeleton />}
          {!loading && (<>
        <div className="flex items-center gap-3">
          {/* Date nav */}
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="size-8 p-0"
              onClick={() => viewMode === "week" ? setWeekStart((prev) => addDays(prev, -7)) : setDayFocus((prev) => addDays(prev, -1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-[140px] text-center text-sm font-semibold text-foreground">
              {viewMode === "week"
                ? formatRangeLabel(weekStart)
                : dayFocus.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })}
            </span>
            <Button variant="ghost" size="sm" className="size-8 p-0"
              onClick={() => viewMode === "week" ? setWeekStart((prev) => addDays(prev, 7)) : setDayFocus((prev) => addDays(prev, 1))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Period toggle */}
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-gray-50 p-0.5">
            <Button variant={viewMode === "week" ? "default" : "ghost"} size="sm" className="h-7 px-3 text-xs"
              onClick={() => setViewMode("week")}>Settimana</Button>
            <Button variant={viewMode === "day" ? "default" : "ghost"} size="sm" className="h-7 px-3 text-xs"
              onClick={() => setViewMode("day")}>Giorno</Button>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-gray-50 p-0.5">
            <Button variant={agendaMode === "classic" ? "default" : "ghost"} size="sm" className="h-7 gap-1 px-2.5 text-xs"
              onClick={() => { if (agendaMode !== "classic") toggleAgendaMode(); }}>
              <CalendarDays className="size-3" />Classica
            </Button>
            <Button variant={agendaMode === "instructor" ? "default" : "ghost"} size="sm" className="h-7 gap-1 px-2.5 text-xs"
              onClick={() => { if (agendaMode !== "instructor") toggleAgendaMode(); }}>
              <Users className="size-3" />Istruttori
            </Button>
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Filters */}
          <div className="flex items-center gap-1.5">
            <FilterTag label="Istruttore" value={instructorFilter} allValue="all"
              onClick={() => setFilterEditor({ kind: "instructor", value: instructorFilter })}
              displayValue={instructorFilter === "all" ? null : instructors.find((item) => item.id === instructorFilter)?.name ?? "Selezionato"} />
            <FilterTag label="Veicolo" value={vehicleFilter} allValue="all"
              onClick={() => setFilterEditor({ kind: "vehicle", value: vehicleFilter })}
              displayValue={vehicleFilter === "all" ? null : vehicles.find((item) => item.id === vehicleFilter)?.name ?? "Selezionato"} />
            <FilterTag label="Tipo" value={typeFilter} allValue="all"
              onClick={() => setFilterEditor({ kind: "type", value: typeFilter })}
              displayValue={typeFilter === "all" ? null : LESSON_TYPE_OPTIONS.find((option) => option.value === typeFilter)?.label ?? typeFilter} />
            <FilterTag label="Stato" value={statusFilter} allValue="all"
              onClick={() => setFilterEditor({ kind: "status", value: statusFilter })}
              displayValue={statusFilter === "all" ? null : getStatusMeta(statusFilter).label} />
            {(instructorFilter !== "all" || vehicleFilter !== "all" || typeFilter !== "all" || statusFilter !== "all") && (
              <Button variant="ghost" size="sm" className="h-7 rounded-full text-xs px-2"
                onClick={() => { setInstructorFilter("all"); setVehicleFilter("all"); setTypeFilter("all"); setStatusFilter("all"); }}>
                Reset
              </Button>
            )}
          </div>

          {/* Holiday toggle (day view) */}
          {viewMode === "day" && (
            <div className="flex items-center gap-1.5">
              <div className="h-5 w-px bg-border" />
              {holidaySet.has(formatYmd(dayFocus)) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => { setRemoveHolidayDate(dayFocus); setRemoveHolidayDialogOpen(true); }}
                >
                  <Ban className="size-3" /> Rimuovi festivo
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-xs"
                  onClick={() => { setHolidayDialogDate(dayFocus); setHolidayLabel(""); setHolidayDialogOpen(true); }}
                >
                  <Ban className="size-3" /> Segna festivo
                </Button>
              )}
            </div>
          )}

          {/* Spacer + CTA */}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setBlockForm({ instructorId: instructors[0]?.id ?? "", date: normalizeDay(dayFocus).toISOString().slice(0, 10), startTime: "09:00", endTime: "10:00", reason: "" }); setBlockDialogOpen(true); }}>
              <Ban className="mr-1.5 size-3.5" />
              Nuovo evento
            </Button>
            <Button size="sm" onClick={() => { setCreateStep(0); setCreateOpen(true); }}>
              <Plus className="mr-1.5 size-3.5" />
              Nuovo appuntamento
            </Button>
          </div>
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
          </>)}
        </div>

        {!loading && (<>
        {/* ── CLASSIC VIEW ── */}
        {agendaMode === "classic" && (
          <div className="relative" style={{ height: "calc(100vh - 240px)", minHeight: 400 }}>
            <div ref={calendarScrollRef} className="overflow-y-auto rounded-2xl border border-border bg-white shadow-card" style={{ height: "100%" }}>
              {/* Sticky day headers */}
              <div
                className={`sticky top-0 z-30 grid border-b border-border bg-white/95 backdrop-blur-sm text-xs text-muted-foreground ${viewMode === "week" ? "grid-cols-[56px_repeat(7,1fr)]" : "grid-cols-[56px_1fr]"}`}
              >
                <div />
                {visibleDays.map((day) => {
                  const isDayToday = day.getTime() === todayNormalized.getTime();
                  return (
                    <div key={day.toISOString()} className={cn("py-2.5 text-center text-xs font-semibold transition-colors border-l border-border/50", isDayToday ? "bg-yellow-50 text-yellow-700" : "text-muted-foreground")}>
                      {day.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })}
                    </div>
                  );
                })}
              </div>
              {/* Calendar body */}
              <div className={`grid ${viewMode === "week" ? "grid-cols-[56px_repeat(7,1fr)]" : "grid-cols-[56px_1fr]"}`}>
                {/* Time gutter */}
                <div className="relative" style={{ height: calendarHeight }}>
                  {hourMarks.map((hour) => (
                    <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE }}>
                      <span className="w-full pr-2 text-right text-[11px] leading-none text-muted-foreground/70">{`${pad(hour)}:00`}</span>
                    </div>
                  ))}
                  {(() => {
                    const now = new Date(nowTick);
                    const mins = now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60;
                    const todayInView = visibleDays.some((d) => d.getTime() === todayNormalized.getTime());
                    if (!todayInView || mins < 0 || mins > totalMinutes) return null;
                    return (
                      <div className="absolute left-0 right-0 z-20 flex items-center" style={{ top: mins * PIXELS_PER_MINUTE }}>
                        <span className="w-full pr-1 text-right text-[10px] font-semibold tabular-nums text-red-500">{`${pad(now.getHours())}:${pad(now.getMinutes())}`}</span>
                      </div>
                    );
                  })()}
                </div>
                {/* Day columns */}
                {visibleDays.map((day, dayIndex) => {
                  const dayStart = new Date(day); dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
                  const dayEnd = new Date(day); dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);
                  const dayAppointments = appointmentsByDay[dayIndex] ?? [];
                  const { laneMap, overflowGroups } = computeLanes(dayAppointments);
                  const isDayToday = day.getTime() === todayNormalized.getTime();
                  const now = new Date(nowTick);
                  const nowMinutes = now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60;
                  const showNowLine = isDayToday && nowMinutes >= 0 && nowMinutes <= totalMinutes;
                  return (
                    <div key={day.toISOString()} className={cn("relative cursor-pointer border-l border-border/50", isDayToday ? "bg-yellow-50/30" : "")} style={{ height: calendarHeight }}
                      onClick={(event) => {
                        const target = event.target as HTMLElement;
                        if (target.closest("[data-radix-popper-content-wrapper], [role='menu'], button, a")) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        const offsetY = event.clientY - rect.top + (calendarScrollRef.current?.scrollTop ?? 0) - 40;
                        const minutes = Math.max(0, Math.min(totalMinutes, offsetY / PIXELS_PER_MINUTE));
                        const rounded = Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
                        setForm((prev) => ({ ...prev, day: formatYmd(day), time: `${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}` }));
                        setCreateStep(0); setCreateOpen(true);
                      }}
                    >
                      {hourMarks.map((hour) => (<div key={hour} className="absolute left-0 right-0 h-px bg-border/40" style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE }} />))}
                      {showNowLine && (<div className="pointer-events-none absolute left-0 right-0 z-20 flex items-center" style={{ top: nowMinutes * PIXELS_PER_MINUTE }}><span className="size-2 shrink-0 rounded-full bg-red-500" /><span className="h-[1.5px] flex-1 bg-red-500" /></div>)}
                      {dayAppointments.map((item) => {
                        const laneInfo = laneMap.get(item.id);
                        const lane = laneInfo?.lane ?? 0;
                        const totalLanes = laneInfo?.totalLanes ?? 1;
                        if (totalLanes > MAX_VISIBLE_LANES) return null;
                        const start = toDate(item.startsAt); const end = getAppointmentEnd(item);
                        const clippedStart = start < dayStart ? dayStart : start; const clippedEnd = end > dayEnd ? dayEnd : end;
                        const offsetMinutes = Math.max(0, diffMinutes(clippedStart, dayStart));
                        const durationMinutes = Math.max(15, diffMinutes(clippedEnd, clippedStart));
                        const top = offsetMinutes * PIXELS_PER_MINUTE; const height = durationMinutes * PIXELS_PER_MINUTE;
                        const statusMeta = getStatusMeta(item.status, item, new Date(nowTick));
                        const isCompact = height <= 56; const GAP_PX = 2;
                        const laneLeft = `calc(${(lane / totalLanes) * 100}% + ${GAP_PX / 2}px)`;
                        const laneWidth = `calc(${(1 / totalLanes) * 100}% - ${GAP_PX}px)`;
                        const isPendingAction = pendingEventActionId === item.id;
                        return (
                          <DropdownMenu key={item.id}>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className={cn("absolute z-10 box-border flex flex-col overflow-hidden rounded-lg border text-left text-[11px] shadow-sm transition motion-safe:hover:-translate-y-0.5 hover:shadow-md", isCompact ? "gap-0.5 p-1.5" : "gap-1 p-2", isPendingAction ? "pointer-events-none opacity-75" : "", statusMeta.className)} style={{ top, height, left: laneLeft, width: laneWidth }} onClick={(e) => e.stopPropagation()}>
                                {isPendingAction ? (<><div className="flex items-center justify-between gap-2"><div className="h-3 w-24 animate-pulse rounded-full bg-gray-100" /><div className="h-3 w-14 animate-pulse rounded-full bg-gray-100" /></div><div className="h-3 w-20 animate-pulse rounded-full bg-gray-200" /></>) : (<><div className="flex items-center justify-between gap-2"><div className={cn("min-w-0 truncate whitespace-nowrap font-semibold leading-tight text-foreground", isCompact ? "text-[10px]" : "text-[11px]")}>{item.student.firstName} {item.student.lastName}</div><Badge variant="secondary" className={cn("shrink-0 border border-border bg-white font-medium text-foreground/80", isCompact ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]")}>{statusMeta.shortLabel}</Badge></div><div className="truncate whitespace-nowrap text-[11px] text-muted-foreground">{item.type} · {formatTimeRange(start, end)}{!isCompact ? ` · ${Math.round(diffMinutes(end, start))}m` : ""}</div></>)}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" side="right" sideOffset={12} className="w-72 rounded-lg border border-border bg-white p-3 shadow-dropdown">
                              <div className="space-y-2"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Evento</div><div className="rounded-xl border border-border bg-white p-3"><div className="text-sm font-semibold text-foreground">{item.student.firstName} {item.student.lastName}</div><div className="mt-1 text-xs text-muted-foreground">{item.type} · {formatTimeRange(start, end)}</div><div className="text-xs text-muted-foreground">{start.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}</div><div className="mt-2 space-y-1 text-xs text-muted-foreground"><div>Istruttore: <span className="font-medium text-foreground/85">{item.instructor?.name ?? "Non assegnato"}</span></div><div>Veicolo: <span className="font-medium text-foreground/85">{item.vehicle?.name ?? "Non assegnato"}</span></div></div><div className="mt-2 flex items-center gap-2"><Badge variant="secondary">{statusMeta.label}</Badge>{!canUpdateStatus(item) ? <span className="text-[11px] text-muted-foreground">Slot passato o chiuso</span> : null}</div></div></div>
                              <div className="mt-3 grid grid-cols-2 gap-2">{!isProposalStatus(item) && <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "checked_in")}>Presente</Button>}{!isProposalStatus(item) && <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "no_show")}>Assente</Button>}<Button type="button" variant="outline" size="sm" disabled={!canCompleteStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "completed")}>Completa</Button><Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleCancel(item.id)}>Annulla</Button></div>
                              <Button type="button" variant="ghost" size="sm" className="mt-2 w-full text-rose-700 hover:bg-rose-50 hover:text-rose-700" disabled={isPendingAction} onClick={() => handleDelete(item.id)}>Cancella e riposiziona</Button>
                              <Button type="button" variant="ghost" size="sm" className="w-full text-red-600 hover:bg-red-50 hover:text-red-700" disabled={isPendingAction} onClick={() => handlePermanentCancel(item.id)}>Elimina definitivamente</Button>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        );
                      })}
                      {overflowGroups.map((group) => {
                        const blockTop = (group.topMinutes - DAY_START_HOUR * 60) * PIXELS_PER_MINUTE;
                        const blockHeight = Math.max(30, group.spanMinutes * PIXELS_PER_MINUTE);
                        const earliest = toDate(group.allItems[0].startsAt);
                        const latest = group.allItems.reduce((acc, a) => { const e = getAppointmentEnd(a); return e > acc ? e : acc; }, earliest);
                        return (
                          <DropdownMenu key={`overflow-${group.clusterId}`}>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className="absolute left-1 right-1 z-10 box-border flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border border-pink-200 bg-pink-50 text-left shadow-sm transition hover:bg-pink-100 hover:shadow-md" style={{ top: blockTop, height: blockHeight }} onClick={(e) => e.stopPropagation()}>
                                <span className="text-[12px] font-bold text-pink-600">{group.allItems.length} guide</span>
                                <span className="text-[10px] text-pink-500/80">{formatTimeRange(earliest, latest)}</span>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" side="right" sideOffset={12} className="w-80 rounded-lg border border-border bg-white p-3 shadow-dropdown">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group.allItems.length} guide sovrapposte</div>
                              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                                {group.allItems.map((item) => {
                                  const s = toDate(item.startsAt); const e = getAppointmentEnd(item);
                                  const meta = getStatusMeta(item.status, item, new Date(nowTick));
                                  return (
                                    <div key={item.id} className={cn("rounded-lg border p-2.5 text-xs", meta.className)}>
                                      <div className="flex items-center justify-between gap-2"><span className="font-semibold text-foreground truncate">{item.student.firstName} {item.student.lastName}</span><Badge variant="secondary" className="shrink-0 border border-border bg-white px-1.5 py-0 text-[9px] font-medium text-foreground/80">{meta.shortLabel}</Badge></div>
                                      <div className="text-muted-foreground mt-0.5">{item.type} · {formatTimeRange(s, e)} · {item.instructor?.name ?? "N/A"}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        );
                      })}
                      {/* Instructor blocks for this day */}
                      {instructorBlocks
                        .filter((b) => {
                          const bStart = toDate(b.startsAt);
                          return bStart >= dayStart && bStart < dayEnd;
                        })
                        .map((b) => {
                          const bStart = toDate(b.startsAt);
                          const bEnd = toDate(b.endsAt);
                          const offsetMin = Math.max(0, diffMinutes(bStart < dayStart ? dayStart : bStart, dayStart));
                          const durMin = Math.max(15, diffMinutes(bEnd > dayEnd ? dayEnd : bEnd, bStart < dayStart ? dayStart : bStart));
                          const top = offsetMin * PIXELS_PER_MINUTE;
                          const height = durMin * PIXELS_PER_MINUTE;
                          const instrName = instructors.find((i) => i.id === b.instructorId)?.name ?? "";
                          return (
                            <DropdownMenu key={`block-${b.id}`}>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="absolute left-1 right-1 z-10 box-border flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-slate-100 p-2 text-left text-[11px] shadow-sm transition hover:bg-slate-200 hover:shadow-md"
                                  style={{ top, height }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="truncate font-semibold text-slate-700">{b.reason || "Blocco"}</span>
                                  <span className="truncate text-[10px] text-slate-500">{instrName} · {formatTimeRange(bStart, bEnd)}</span>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" side="right" sideOffset={12} className="w-56 rounded-lg border border-border bg-white p-3 shadow-dropdown">
                                <div className="space-y-2">
                                  <div className="text-xs font-semibold text-foreground">{b.reason || "Blocco"}</div>
                                  <div className="text-xs text-muted-foreground">{instrName}</div>
                                  <div className="text-xs text-muted-foreground">{formatTimeRange(bStart, bEnd)}</div>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 w-full text-red-600 hover:bg-red-50 hover:text-red-700"
                                  disabled={blockDeleting === b.id}
                                  onClick={async () => {
                                    setBlockDeleting(b.id);
                                    const res = await deleteInstructorBlock(b.id);
                                    setBlockDeleting(null);
                                    if (!res.success) { toast.error({ description: res.message ?? "Errore eliminazione." }); return; }
                                    setInstructorBlocks((prev) => prev.filter((x) => x.id !== b.id));
                                    toast.success({ description: "Blocco eliminato." });
                                  }}
                                >
                                  {blockDeleting === b.id ? "Elimino..." : "Elimina blocco"}
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

        {/* ── INSTRUCTOR WEEKLY VIEW ── */}
        {agendaMode === "instructor" && viewMode === "week" && (() => {
          const weekInstructors = instructorAvailability.length > 0
            ? instructorAvailability
            : instructors.map((i) => ({ instructorId: i.id, instructorName: i.name, days: {} as Record<string, Array<{ startMinutes: number; endMinutes: number }>> }));
          const instrCount = Math.max(1, weekInstructors.length);
          const totalCols = instrCount * 7; // instructor sub-columns across 7 days

          return (
          <div className="relative" style={{ height: "calc(100vh - 240px)", minHeight: 400 }}>
            <AnimatePresence>
              {refreshing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                  className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-white/50">
                  <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-2xl border border-border bg-white px-8 py-5 shadow-card">
                    <Lottie animationData={carAnimation} loop style={{ width: 100, height: 100 }} />
                    <span className="text-sm font-medium text-muted-foreground">Caricamento...</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={calendarScrollRef} className="overflow-auto bg-white" style={{ height: "100%" }}>
              {/* Two-row sticky header: Day names → Instructor names */}
              <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-border" style={{ display: "grid", gridTemplateColumns: `56px repeat(${totalCols}, minmax(80px, 1fr))` }}>
                {/* Day header row spanning instructor columns */}
                <div className="row-span-2" />
                {days.map((day) => {
                  const isDayToday = day.getTime() === todayNormalized.getTime();
                  const dayHolidayLabel = holidaySet.get(formatYmd(day));
                  const isDayHoliday = dayHolidayLabel !== undefined;
                  return (
                    <div
                      key={`day-${day.toISOString()}`}
                      className={cn(
                        "text-center text-xs font-semibold py-1.5 border-l border-border cursor-pointer hover:bg-gray-50 transition-colors",
                        isDayHoliday ? "bg-red-50 text-red-600" : isDayToday ? "bg-yellow-50 text-yellow-700" : "text-muted-foreground",
                      )}
                      style={{ gridColumn: `span ${instrCount}` }}
                      onClick={() => { setDayFocus(normalizeDay(day)); setViewMode("day"); }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (isDayHoliday) {
                          setRemoveHolidayDate(normalizeDay(day));
                          setRemoveHolidayDialogOpen(true);
                        } else {
                          setHolidayDialogDate(normalizeDay(day));
                          setHolidayLabel("");
                          setHolidayDialogOpen(true);
                        }
                      }}
                    >
                      <span>{day.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })}</span>
                      {isDayHoliday && <span className="ml-1 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700">{dayHolidayLabel || "Festivo"}</span>}
                    </div>
                  );
                })}
                {/* Instructor sub-headers within each day */}
                {days.map((day) =>
                  weekInstructors.map((instr, idx) => {
                    const color = INSTRUCTOR_COLORS[idx % INSTRUCTOR_COLORS.length];
                    const initials = instr.instructorName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
                    return (
                      <div key={`${day.toISOString()}-${instr.instructorId}`} className="flex flex-col items-center gap-0.5 py-1.5 border-l border-border/40">
                        <div className={cn("flex size-5 items-center justify-center rounded-full text-[8px] font-bold", color.avatar)}>{initials}</div>
                        <span className="text-[9px] font-medium text-muted-foreground truncate max-w-full px-0.5">{instr.instructorName.split(" ")[0]}</span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Calendar body */}
              <div style={{ display: "grid", gridTemplateColumns: `56px repeat(${totalCols}, minmax(80px, 1fr))` }}>
                {/* Time gutter */}
                <div className="relative" style={{ height: calendarHeight }}>
                  {hourMarks.map((hour) => (
                    <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE }}>
                      <span className="w-full pr-2 text-right text-[11px] leading-none text-muted-foreground/70">{`${pad(hour)}:00`}</span>
                    </div>
                  ))}
                  {/* Now label */}
                  {(() => {
                    const now = new Date(nowTick);
                    const mins = now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60;
                    if (mins < 0 || mins > totalMinutes) return null;
                    return (
                      <div className="absolute left-0 right-0 z-20 flex items-center" style={{ top: mins * PIXELS_PER_MINUTE }}>
                        <span className="w-full pr-1 text-right text-[10px] font-semibold tabular-nums text-red-500">{`${pad(now.getHours())}:${pad(now.getMinutes())}`}</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Day × Instructor columns */}
                {days.map((day, dayIndex) => {
                  const dayStart = new Date(day);
                  dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
                  const dayEnd = new Date(day);
                  dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);
                  const dateKey = formatYmd(day);
                  const isDayToday = day.getTime() === todayNormalized.getTime();
                  const now = new Date(nowTick);
                  const nowMinutes = now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60;
                  const showNowLine = isDayToday && nowMinutes >= 0 && nowMinutes <= totalMinutes;
                  const dayAppts = appointmentsByDay[dayIndex] ?? [];
                  const isColumnHoliday = holidaySet.has(dateKey);

                  return weekInstructors.map((instr, instrIdx) => {
                    const color = INSTRUCTOR_COLORS[instrIdx % INSTRUCTOR_COLORS.length];
                    const ranges = instr.days[dateKey] ?? [];
                    const instrAppts = dayAppts.filter((a) => a.instructor?.id === instr.instructorId);

                    return (
                      <div
                        key={`${day.toISOString()}-${instr.instructorId}`}
                        className={cn("relative border-l border-border/40", isColumnHoliday ? "bg-red-50/40" : isDayToday ? "bg-yellow-50/20" : "")}
                        style={{ height: calendarHeight }}
                      >
                        {isColumnHoliday && (
                          <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(239,68,68,0.04) 10px, rgba(239,68,68,0.04) 20px)" }}>
                            {instrIdx === 0 && <Ban className="size-6 text-red-300/60" />}
                          </div>
                        )}
                        {/* Availability bands */}
                        {ranges.map((range, ri) => (
                          <div key={ri} className={cn("absolute left-0 right-0", color.bg)} style={{ top: range.startMinutes * PIXELS_PER_MINUTE, height: (range.endMinutes - range.startMinutes) * PIXELS_PER_MINUTE }} />
                        ))}
                        {/* Hour grid lines */}
                        {hourMarks.map((hour) => (
                          <div key={hour} className="absolute left-0 right-0 h-px bg-border/30" style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE }} />
                        ))}
                        {/* Now line */}
                        {showNowLine && (
                          <div className="pointer-events-none absolute left-0 right-0 z-20 flex items-center" style={{ top: nowMinutes * PIXELS_PER_MINUTE }}>
                                                        <span className="h-px flex-1 bg-red-500/70" />
                          </div>
                        )}
                        {/* Appointments */}
                        {instrAppts.map((item) => {
                          const start = toDate(item.startsAt);
                          const end = getAppointmentEnd(item);
                          const clippedStart = start < dayStart ? dayStart : start;
                          const clippedEnd = end > dayEnd ? dayEnd : end;
                          const offsetMin = Math.max(0, diffMinutes(clippedStart, dayStart));
                          const durMin = Math.max(15, diffMinutes(clippedEnd, clippedStart));
                          const top = offsetMin * PIXELS_PER_MINUTE;
                          const height = durMin * PIXELS_PER_MINUTE;
                          const statusMeta = getStatusMeta(item.status, item, new Date(nowTick));
                          const isCompact = height <= 40;
                          const isPendingAction = pendingEventActionId === item.id;
                          return (
                            <DropdownMenu key={item.id}>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className={cn("absolute left-0.5 right-0.5 z-10 overflow-hidden rounded-xl border text-[9px] leading-tight text-left", isPendingAction ? "pointer-events-none opacity-75" : "", statusMeta.className)}
                                  style={{ top, height }}
                                  title={`${item.student.firstName} ${item.student.lastName} · ${item.type} · ${formatTimeRange(start, end)}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className={cn("p-1", isCompact ? "p-0.5" : "")}>
                                    <div className="font-bold truncate text-[10px]">{item.student.firstName} {item.student.lastName.charAt(0)}.</div>
                                    <div className="text-[8px] text-muted-foreground truncate">{formatTimeRange(start, end)}</div>
                                  </div>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-72 rounded-lg border border-border bg-white p-3 shadow-dropdown">
                                <div className="space-y-2">
                                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Evento</div>
                                  <div className="rounded-xl border border-border bg-white p-3">
                                    <div className="text-sm font-semibold text-foreground">{item.student.firstName} {item.student.lastName}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">{item.type} · {formatTimeRange(start, end)}</div>
                                    <div className="text-xs text-muted-foreground">{start.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}</div>
                                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                      <div>Istruttore: <span className="font-medium text-foreground/85">{item.instructor?.name ?? "Non assegnato"}</span></div>
                                      <div>Veicolo: <span className="font-medium text-foreground/85">{item.vehicle?.name ?? "Non assegnato"}</span></div>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                      <Badge variant="secondary">{statusMeta.label}</Badge>
                                      {!canUpdateStatus(item) ? <span className="text-[11px] text-muted-foreground">Slot passato o chiuso</span> : null}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  {!isProposalStatus(item) && <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "checked_in")}>Presente</Button>}
                                  {!isProposalStatus(item) && <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "no_show")}>Assente</Button>}
                                  <Button type="button" variant="outline" size="sm" disabled={!canCompleteStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "completed")}>Completa</Button>
                                  <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleCancel(item.id)}>Annulla</Button>
                                </div>
                                <Button type="button" variant="ghost" size="sm" className="mt-2 w-full text-rose-700 hover:bg-rose-50 hover:text-rose-700" disabled={isPendingAction} onClick={() => handleDelete(item.id)}>Cancella e riposiziona</Button>
                                <Button type="button" variant="ghost" size="sm" className="w-full text-red-600 hover:bg-red-50 hover:text-red-700" disabled={isPendingAction} onClick={() => handlePermanentCancel(item.id)}>Elimina definitivamente</Button>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          );
                        })}
                      </div>
                    );
                  });
                })}
              </div>
            </div>
          </div>
          );
        })()}

        {/* ── INSTRUCTOR DAY VIEW ── */}
        {agendaMode === "instructor" && viewMode === "day" && (
        <div className="relative" style={{ height: "calc(100vh - 240px)", minHeight: 400 }}>
          {/* Holiday banner */}
          {holidaySet.has(formatYmd(dayFocus)) && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-2 mb-2">
              <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                <Ban className="size-4" />
                Giorno festivo{holidaySet.get(formatYmd(dayFocus)) ? ` — ${holidaySet.get(formatYmd(dayFocus))}` : ""}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-100 hover:text-red-700"
                onClick={() => {
                  setRemoveHolidayDate(dayFocus);
                  setRemoveHolidayDialogOpen(true);
                }}
              >
                Rimuovi festivo
              </Button>
            </div>
          )}
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
            className="overflow-y-auto bg-white"
            style={{ height: "100%" }}
          >
          {/* Sticky instructor headers */}
          {(
            <div
              className="sticky top-0 z-30 grid border-b border-border bg-white/95 backdrop-blur-sm text-xs text-muted-foreground"
              style={{ gridTemplateColumns: `56px repeat(${Math.max(1, dayViewInstructors.length)}, 1fr)` }}
            >
              <div />
              {dayViewInstructors.length > 0 ? dayViewInstructors.map((instr, idx) => {
                const color = INSTRUCTOR_COLORS[idx % INSTRUCTOR_COLORS.length];
                const initials = instr.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);
                return (
                  <div
                    key={instr.id}
                    className="flex flex-col items-center gap-1 py-2.5 border-l border-border/50"
                  >
                    <div className={cn("flex size-7 items-center justify-center rounded-full text-[10px] font-bold", color.avatar)}>
                      {initials}
                    </div>
                    <span className="text-[11px] font-semibold text-foreground truncate max-w-[90%]">{instr.name}</span>
                  </div>
                );
              }) : (
                <div className="py-2.5 text-center text-xs text-muted-foreground border-l border-border/50">
                  Nessun istruttore
                </div>
              )}
            </div>
          )}

          {/* Calendar body: time gutter + columns */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: `56px repeat(${Math.max(1, dayViewInstructors.length)}, 1fr)`,
            }}
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





            {/* Day view: Instructor columns */}
            {viewMode === "day" && (() => {
              const day = dayFocus;
              const dayStart = new Date(day);
              dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
              const dayEnd = new Date(day);
              dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);
              const isDayToday = day.getTime() === todayNormalized.getTime();
              const now = new Date(nowTick);
              const nowMinutes = now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60;
              const showNowLine = isDayToday && nowMinutes >= 0 && nowMinutes <= totalMinutes;
              const allDayAppointments = appointmentsByDay[0] ?? [];

              return dayViewInstructors.map((instr, instrIdx) => {
                const color = INSTRUCTOR_COLORS[instrIdx % INSTRUCTOR_COLORS.length];
                // Filter appointments for this instructor
                const instrAppointments = allDayAppointments.filter(
                  (a) => a.instructor?.id === instr.id,
                );

                return (
                  <div
                    key={instr.id}
                    className="relative cursor-pointer border-l border-border/50"
                    style={{ height: calendarHeight }}
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest("[data-radix-popper-content-wrapper], [role='menu'], button, a")) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const offsetY = event.clientY - rect.top + (calendarScrollRef.current?.scrollTop ?? 0) - 40;
                      const minutes = Math.max(0, Math.min(totalMinutes, offsetY / PIXELS_PER_MINUTE));
                      const rounded = Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
                      const hours = Math.floor(rounded / 60);
                      const mins = rounded % 60;
                      setForm((prev) => ({
                        ...prev,
                        day: formatYmd(day),
                        time: `${pad(hours)}:${pad(mins)}`,
                        instructorId: instr.id,
                      }));
                      setCreateStep(0);
                      setCreateOpen(true);
                    }}
                  >
                    {/* Availability bands */}
                    {instr.ranges.map((range, ri) => {
                      const top = range.startMinutes * PIXELS_PER_MINUTE;
                      const height = (range.endMinutes - range.startMinutes) * PIXELS_PER_MINUTE;
                      return (
                        <div
                          key={ri}
                          className={cn("absolute left-0 right-0", color.bg)}
                          style={{ top, height }}
                        />
                      );
                    })}
                    {/* Hour grid lines */}
                    {hourMarks.map((hour) => (
                      <div
                        key={hour}
                        className="absolute left-0 right-0 h-px bg-border/40"
                        style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE }}
                      />
                    ))}
                    {/* Red "now" line */}
                    {showNowLine && (
                      <div
                        className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
                        style={{ top: nowMinutes * PIXELS_PER_MINUTE }}
                      >
                                                <span className="h-[1.5px] flex-1 bg-red-500" />
                      </div>
                    )}
                    {/* Appointments for this instructor */}
                    {instrAppointments.map((item) => {
                      const start = toDate(item.startsAt);
                      const end = getAppointmentEnd(item);
                      const clippedStart = start < dayStart ? dayStart : start;
                      const clippedEnd = end > dayEnd ? dayEnd : end;
                      const offsetMinutes = Math.max(0, diffMinutes(clippedStart, dayStart));
                      const durationMinutes = Math.max(15, diffMinutes(clippedEnd, clippedStart));
                      const top = offsetMinutes * PIXELS_PER_MINUTE;
                      const height = durationMinutes * PIXELS_PER_MINUTE;
                      const statusMeta = getStatusMeta(item.status, item, new Date(nowTick));
                      const isCompact = height <= 56;
                      const isPendingAction = pendingEventActionId === item.id;

                      return (
                        <DropdownMenu key={item.id}>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "absolute left-1 right-1 z-10 box-border flex flex-col overflow-hidden rounded-lg border text-left text-[11px] shadow-sm transition motion-safe:hover:-translate-y-0.5 hover:shadow-md",
                                isCompact ? "gap-0.5 p-1.5" : "gap-1 p-2",
                                isPendingAction ? "pointer-events-none opacity-75" : "",
                                statusMeta.className,
                              )}
                              style={{ top, height }}
                              onClick={(event) => event.stopPropagation()}
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
                                    <div className={cn("min-w-0 truncate whitespace-nowrap font-semibold leading-tight text-foreground", isCompact ? "text-[10px]" : "text-[11px]")}>
                                      {item.student.firstName} {item.student.lastName}
                                    </div>
                                    <Badge
                                      variant="secondary"
                                      className={cn("shrink-0 border border-border bg-white font-medium text-foreground/80", isCompact ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]")}
                                    >
                                      {statusMeta.shortLabel}
                                    </Badge>
                                  </div>
                                  <div className="truncate whitespace-nowrap text-[11px] text-muted-foreground">
                                    {item.type} · {formatTimeRange(start, end)}
                                    {!isCompact ? ` · ${Math.round(diffMinutes(end, start))}m` : ""}
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
                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Evento</div>
                              <div className="rounded-xl border border-border bg-white p-3">
                                <div className="text-sm font-semibold text-foreground">{item.student.firstName} {item.student.lastName}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{item.type} · {formatTimeRange(start, end)}</div>
                                <div className="text-xs text-muted-foreground">{start.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}</div>
                                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                  <div>Istruttore: <span className="font-medium text-foreground/85">{item.instructor?.name ?? "Non assegnato"}</span></div>
                                  <div>Veicolo: <span className="font-medium text-foreground/85">{item.vehicle?.name ?? "Non assegnato"}</span></div>
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                  <Badge variant="secondary">{statusMeta.label}</Badge>
                                  {!canUpdateStatus(item) ? <span className="text-[11px] text-muted-foreground">Slot passato o chiuso</span> : null}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              {!isProposalStatus(item) && <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "checked_in")}>Presente</Button>}
                              {!isProposalStatus(item) && <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "no_show")}>Assente</Button>}
                              <Button type="button" variant="outline" size="sm" disabled={!canCompleteStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "completed")}>Completa</Button>
                              <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleCancel(item.id)}>Annulla</Button>
                            </div>
                            <Button type="button" variant="ghost" size="sm" className="mt-2 w-full text-rose-700 hover:bg-rose-50 hover:text-rose-700" disabled={isPendingAction} onClick={() => handleDelete(item.id)}>Cancella e riposiziona</Button>
                            <Button type="button" variant="ghost" size="sm" className="w-full text-red-600 hover:bg-red-50 hover:text-red-700" disabled={isPendingAction} onClick={() => handlePermanentCancel(item.id)}>Elimina definitivamente</Button>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        </div>
        </div>
        )}
        </>)}
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

      {/* ── Instructor Block Creation Dialog ── */}
      <Dialog open={blockDialogOpen} onOpenChange={(open) => { if (!blockCreating) setBlockDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo evento bloccante</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Istruttore</label>
              <Select value={blockForm.instructorId} onValueChange={(v) => setBlockForm((f) => ({ ...f, instructorId: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleziona istruttore" /></SelectTrigger>
                <SelectContent>
                  {instructors.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Data</label>
              <Input type="date" value={blockForm.date} onChange={(e) => setBlockForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Ora inizio</label>
                <Select value={blockForm.startTime} onValueChange={(v) => setBlockForm((f) => ({ ...f, startTime: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 48 }, (_, i) => { const h = Math.floor(i * 30 / 60); const m = (i * 30) % 60; const v = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; return <SelectItem key={v} value={v}>{v}</SelectItem>; })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Ora fine</label>
                <Select value={blockForm.endTime} onValueChange={(v) => setBlockForm((f) => ({ ...f, endTime: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 48 }, (_, i) => { const h = Math.floor((i + 1) * 30 / 60); const m = ((i + 1) * 30) % 60; const v = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; return <SelectItem key={v} value={v}>{v}</SelectItem>; })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Titolo (opzionale)</label>
              <Input value={blockForm.reason} onChange={(e) => setBlockForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Es: Riunione, Visita medica, Ferie..." />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setBlockDialogOpen(false)} disabled={blockCreating}>Annulla</Button>
            <Button
              type="button"
              size="sm"
              disabled={blockCreating || !blockForm.instructorId || !blockForm.date}
              onClick={async () => {
                setBlockCreating(true);
                const startsAt = new Date(`${blockForm.date}T${blockForm.startTime}:00`).toISOString();
                const endsAt = new Date(`${blockForm.date}T${blockForm.endTime}:00`).toISOString();
                const res = await createInstructorBlock({
                  instructorId: blockForm.instructorId,
                  startsAt,
                  endsAt,
                  reason: blockForm.reason.trim() || undefined,
                });
                setBlockCreating(false);
                if (!res.success) {
                  toast.error({ description: res.message ?? "Errore creazione evento." });
                  return;
                }
                const d = res.data as { id: string; instructorId: string; startsAt: Date; endsAt: Date; reason: string | null };
                setInstructorBlocks((prev) => [...prev, {
                  id: d.id,
                  instructorId: d.instructorId,
                  startsAt: d.startsAt instanceof Date ? d.startsAt.toISOString() : String(d.startsAt),
                  endsAt: d.endsAt instanceof Date ? d.endsAt.toISOString() : String(d.endsAt),
                  reason: d.reason,
                }]);
                setBlockDialogOpen(false);
                toast.success({ description: "Evento creato." });
              }}
            >
              {blockCreating ? "Creazione..." : "Crea evento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Holiday Creation Dialog ── */}
      <Dialog open={holidayDialogOpen} onOpenChange={(open) => { if (!holidayPending) setHolidayDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Segna come festivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {holidayDialogDate?.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <div>
              <label htmlFor="holiday-label" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Nome festività (opzionale)
              </label>
              <Input
                id="holiday-label"
                placeholder="es. Ferragosto, Ferie estive..."
                value={holidayLabel}
                onChange={(e) => setHolidayLabel(e.target.value)}
                disabled={holidayPending}
              />
            </div>
            {(() => {
              const dayApptCount = holidayDialogDate
                ? appointments.filter((a) => {
                    const d = new Date(a.startsAt);
                    return formatYmd(d) === formatYmd(holidayDialogDate) && a.status !== "cancelled";
                  }).length
                : 0;
              if (dayApptCount > 0) {
                return (
                  <p className="text-sm text-amber-600">
                    <AlertTriangle className="mr-1 inline size-4" />
                    {dayApptCount === 1
                      ? "C'è 1 guida prenotata questo giorno."
                      : `Ci sono ${dayApptCount} guide prenotate questo giorno.`}
                  </p>
                );
              }
              return null;
            })()}
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-lg"
              disabled={holidayPending}
              onClick={async () => {
                if (!holidayDialogDate) return;
                setHolidayPending(true);
                try {
                  const res = await fetch("/api/autoscuole/holidays", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ date: formatYmd(holidayDialogDate), label: holidayLabel || undefined, cancelAppointments: false }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    toast.success({ description: "Giorno festivo aggiunto." });
                    setHolidayDialogOpen(false);
                    load({ silent: true });
                  } else {
                    toast.error({ description: data.message ?? "Errore." });
                  }
                } catch { toast.error({ description: "Errore di rete." }); }
                finally { setHolidayPending(false); }
              }}
            >
              Chiudi e mantieni guide
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full rounded-lg"
              disabled={holidayPending}
              onClick={async () => {
                if (!holidayDialogDate) return;
                setHolidayPending(true);
                try {
                  const res = await fetch("/api/autoscuole/holidays", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ date: formatYmd(holidayDialogDate), label: holidayLabel || undefined, cancelAppointments: true }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    const count = data.data?.cancelledCount ?? 0;
                    toast.success({
                      description: count > 0
                        ? `Giorno festivo aggiunto. ${count} ${count === 1 ? "guida cancellata" : "guide cancellate"}.`
                        : "Giorno festivo aggiunto.",
                    });
                    setHolidayDialogOpen(false);
                    load({ silent: true });
                  } else {
                    toast.error({ description: data.message ?? "Errore." });
                  }
                } catch { toast.error({ description: "Errore di rete." }); }
                finally { setHolidayPending(false); }
              }}
            >
              Chiudi e cancella guide
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Holiday Removal AlertDialog ── */}
      <AlertDialog open={removeHolidayDialogOpen} onOpenChange={setRemoveHolidayDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere il giorno festivo?</AlertDialogTitle>
            <AlertDialogDescription>
              La disponibilità normale verrà ripristinata per il{" "}
              {removeHolidayDate?.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!removeHolidayDate) return;
                try {
                  const res = await fetch("/api/autoscuole/holidays", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ date: formatYmd(removeHolidayDate) }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    toast.success({ description: "Giorno festivo rimosso." });
                    load({ silent: true });
                  } else {
                    toast.error({ description: data.message ?? "Errore." });
                  }
                } catch { toast.error({ description: "Errore di rete." }); }
              }}
            >
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

function isProposalStatus(appointment: AppointmentRow) {
  return (appointment.status ?? "").toLowerCase() === "proposal";
}

function canUpdateStatus(appointment: AppointmentRow) {
  const normalized = (appointment.status ?? "").toLowerCase();
  // pending_review can be acted on at any time (no time window)
  if (normalized === "pending_review") return true;
  const endTime = getAppointmentEnd(appointment);
  const isPast = endTime.getTime() < Date.now();
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
      label: "Presente",
      shortLabel: "Presente",
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
      label: "Assente",
      shortLabel: "Assente",
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
  if (normalized === "pending_review") {
    return {
      label: "Da confermare",
      shortLabel: "Da confermare",
      className: "border-orange-200/70 bg-orange-100/80",
    };
  }
  if (normalized === "cancelled") {
    return {
      label: "Annullata",
      shortLabel: "Annullata",
      className: "border-gray-200/70 bg-gray-100/60 opacity-60 line-through",
    };
  }
  return {
    label: "Programmata",
    shortLabel: "Programmata",
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
    { value: "checked_in", label: "Presente" },
    { value: "completed", label: "Completata" },
    { value: "no_show", label: "Assente" },
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
