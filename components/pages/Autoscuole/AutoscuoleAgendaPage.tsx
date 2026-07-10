"use client";

import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Plus, SlidersHorizontal, CalendarDays, Users, Send, ChevronLeft, ChevronRight, Check, AlertTriangle, LayoutGrid, Ban, GraduationCap, Search, Loader2, Info, X, Car, Bike } from "lucide-react";

import { PageWrapper } from "@/components/Layout/PageWrapper";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedPill } from "@/components/ui/segmented-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  deleteAutoscuolaAppointment,
  cancelAutoscuolaAppointment,
  updateAutoscuolaAppointmentStatus,
  getInstructorAvailabilityForAgenda,
  createInstructorBlock,
  deleteInstructorBlock,
  deleteInstructorBlockRecurrence,
  createExamEvent,
  addExamStudent,
  removeExamStudent,
  updateExamInstructor,
  updateExamTime,
  cancelExamEvent,
} from "@/lib/actions/autoscuole.actions";
import { getAutoscuolaLocations } from "@/lib/actions/autoscuola-locations.actions";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/fade-in";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { FieldGroup } from "@/components/ui/field-group";
import { TRANSMISSION_LABELS, isMotoLicenseCategory, vehicleServesLicense, type Transmission } from "@/lib/autoscuole/license";
import { instructorTintStyles } from "@/lib/autoscuole/instructor-colors";
import { InlineToggle } from "@/components/ui/inline-toggle";
import {
  OutOfAvailabilitySheet,
  type OutOfAvailabilityAppointment,
} from "@/components/pages/Autoscuole/OutOfAvailabilitySheet";
import {
  EditAppointmentDialog,
  type EditAppointmentDialogAppointment,
} from "@/components/pages/Autoscuole/EditAppointmentDialog";
import { GroupLessonManageDialog } from "@/components/pages/Autoscuole/dialogs/GroupLessonManageDialog";
import { GroupLessonCreateDialog } from "@/components/pages/Autoscuole/dialogs/GroupLessonCreateDialog";

type StudentOption = { id: string; firstName: string; lastName: string; email?: string | null; licenseCategory?: string | null; transmission?: string | null };
type ResourceOption = {
  id: string;
  name: string;
  assignedInstructorId?: string | null;
  poolInstructorIds?: string[] | null;
  licenseCategory?: string | null;
  transmission?: string | null;
  /** Instructor display color (hex) picked by the owner. Null = automatic. */
  color?: string | null;
};
type AppointmentRow = {
  id: string;
  type: string;
  types?: string[];
  rating?: number | null;
  status: string;
  startsAt: string | Date;
  endsAt?: string | Date | null;
  student: StudentOption;
  instructor?: ResourceOption | null;
  vehicle?: ResourceOption | null;
  followVehicle?: ResourceOption | null;
  extraMotoVehicles?: ResourceOption[] | null;
  location?: { id: string; name: string; isDefault: boolean } | null;
  replacedByAppointmentId?: string | null;
  groupLessonId?: string | null;
  groupLessonCapacity?: number | null;
  groupLessonKind?: string | null;
  notes?: string | null;
};

// Group-lesson cards: standard = teal, moto = orange (same style, different
// tint so the two flavours are distinguishable at a glance).
const groupLessonTint = (item: { groupLessonKind?: string | null }) => {
  const moto = item.groupLessonKind === "moto";
  return {
    card: moto
      ? "bg-[#FFEDD5] shadow-[0_5px_14px_rgba(249,115,22,0.22)]"
      : "bg-[#ECFDF5] shadow-[0_5px_14px_rgba(16,185,129,0.22)]",
    badge: moto
      ? "border-orange-200 bg-orange-200/60 text-orange-700"
      : "border-teal-200 bg-teal-200/60 text-teal-700",
    time: moto ? "text-orange-600" : "text-teal-600",
    name: moto ? "text-orange-800" : "text-teal-800",
    detailBadge: moto
      ? "border-orange-200 bg-orange-100 text-orange-700"
      : "border-teal-200 bg-teal-100 text-teal-700",
    label: moto ? "Gruppo moto" : "Gruppo",
  };
};

type ExamGroup = {
  key: string;
  startsAt: string;
  endsAt: string | null;
  instructorId: string | null;
  instructor: ResourceOption | null;
  appointments: AppointmentRow[];
  notes: string | null;
};

type AgendaBootstrapPayload = {
  appointments: AppointmentRow[];
  students: Array<{
    id: string;
    firstName: string;
    lastName: string;
    licenseCategory?: string | null;
    transmission?: string | null;
  }>;
  instructors: ResourceOption[];
  vehicles: ResourceOption[];
  vehiclesEnabled?: boolean;
  followCarRules?: Record<string, { enabled: boolean }>;
  groupLessonsEnabled?: boolean;
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
const SLOT_OPTIONS = ["30", "45", "60", "90", "120"];
// Exams can run longer than a normal guida (theory+practice sessions): up to 3h.
const EXAM_SLOT_OPTIONS = ["30", "45", "60", "90", "120", "150", "180", "210", "240", "270", "300"];
const PIXELS_PER_MINUTE = 1.6;
const totalMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
const calendarHeight = totalMinutes * PIXELS_PER_MINUTE;
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
// Human label for an appointment type (incl. the synthetic group_lesson type).
const formatEventType = (type: string) =>
  type === "group_lesson"
    ? "Guida di gruppo"
    : LESSON_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
const TIME_OPTIONS = Array.from({ length: (DAY_END_HOUR - DAY_START_HOUR) * 4 }, (_, index) => {
  const total = DAY_START_HOUR * 60 + index * 15;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${pad(hours)}:${pad(minutes)}`;
});

type InstructorAvailabilityWeek = {
  instructorId: string;
  instructorName: string;
  days: Record<string, Array<{ startMinutes: number; endMinutes: number }>>;
};

/** Resolved instructor tint: custom hex → inline styles; legacy → classes. */
type InstructorTint = {
  avatarClass?: string;
  avatarStyle?: React.CSSProperties;
  bandClass?: string;
  bandStyle?: React.CSSProperties;
};

// Palette posizionale di fallback (istruttori senza colore scelto). Redesign
// 2026-07: il primo slot è neutro slate — niente più rosa di default.
const INSTRUCTOR_COLORS = [
  { bg: "bg-slate-100/60", border: "border-slate-200/40", text: "text-slate-700", avatar: "bg-slate-200 text-slate-700" },
  { bg: "bg-sky-50/60", border: "border-sky-200/40", text: "text-sky-700", avatar: "bg-sky-100 text-sky-700" },
  { bg: "bg-emerald-50/60", border: "border-emerald-200/40", text: "text-emerald-700", avatar: "bg-emerald-100 text-emerald-700" },
  { bg: "bg-amber-50/60", border: "border-amber-200/40", text: "text-amber-700", avatar: "bg-amber-100 text-amber-700" },
  { bg: "bg-violet-50/60", border: "border-violet-200/40", text: "text-violet-700", avatar: "bg-violet-100 text-violet-700" },
  { bg: "bg-teal-50/60", border: "border-teal-200/40", text: "text-teal-700", avatar: "bg-teal-100 text-teal-700" },
  { bg: "bg-orange-50/60", border: "border-orange-200/40", text: "text-orange-700", avatar: "bg-orange-100 text-orange-700" },
  { bg: "bg-rose-50/60", border: "border-rose-200/40", text: "text-rose-700", avatar: "bg-rose-100 text-rose-700" },
];

type FilterKind = "instructor" | "vehicle" | "type" | "status";

type FilterEditorState = {
  kind: FilterKind;
  value: string[];
};
type FilterOption = {
  value: string;
  label: string;
};

function StudentSearchSelect({
  students,
  value,
  onChange,
}: {
  students: StudentOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const selected = students.find((s) => s.id === value);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return students;
    const q = query.toLowerCase();
    return students.filter(
      (s) =>
        s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q) ||
        (s.email && s.email.toLowerCase().includes(q)),
    );
  }, [students, query]);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        inputRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-primary"
        placeholder="Cerca allievo..."
        value={open ? query : selected ? `${selected.firstName} ${selected.lastName}` : query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
      />
      {open && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full z-[9999] mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-white shadow-lg"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Nessun risultato</div>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors",
                  s.id === value && "bg-muted",
                )}
                onClick={() => {
                  onChange(s.id);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium truncate">{s.firstName} {s.lastName}</span>
                  {s.email && <span className="text-[11px] text-muted-foreground truncate">{s.email}</span>}
                </span>
                {s.licenseCategory ? (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/70">
                    {s.licenseCategory}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Vehicle lines in the agenda detail. A moto guide with companions (follow car
// and/or extra motos) is grouped into "Moto" (primary marked) + "Auto al seguito"
// instead of one cramped line; a single-vehicle guide keeps the "Veicolo" line.
function VehicleDetailLines({
  item,
  vehiclesEnabled,
}: {
  item: {
    vehicle?: ResourceOption | null;
    followVehicle?: ResourceOption | null;
    extraMotoVehicles?: ResourceOption[] | null;
  };
  vehiclesEnabled: boolean;
}) {
  if (!vehiclesEnabled) return null;
  const extras = item.extraMotoVehicles ?? [];
  const follow = item.followVehicle ?? null;
  if (!follow && extras.length === 0) {
    return (
      <div>
        Veicolo: <span className="font-medium text-foreground/85">{item.vehicle?.name ?? "Non assegnato"}</span>
      </div>
    );
  }
  const motoNames = [
    item.vehicle ? `${item.vehicle.name} (principale)` : null,
    ...extras.map((v) => v.name),
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <>
      {motoNames ? (
        <div>
          Moto: <span className="font-medium text-foreground/85">{motoNames}</span>
        </div>
      ) : null}
      {follow ? (
        <div>
          Auto al seguito: <span className="font-medium text-foreground/85">{follow.name}</span>
        </div>
      ) : null}
    </>
  );
}

export function AutoscuoleAgendaPage({
  tabs,
}: {
  tabs?: React.ReactNode;
} = {}) {
  const toast = useFeedbackToast();
  const [appointments, setAppointments] = React.useState<AppointmentRow[]>([]);
  const [manageGroupLessonId, setManageGroupLessonId] = React.useState<string | null>(null);
  const [createGroupLessonOpen, setCreateGroupLessonOpen] = React.useState(false);
  const [students, setStudents] = React.useState<StudentOption[]>([]);
  const [instructors, setInstructors] = React.useState<ResourceOption[]>([]);
  const [vehicles, setVehicles] = React.useState<ResourceOption[]>([]);
  const [vehiclesEnabled, setVehiclesEnabled] = React.useState(true);
  const [followCarRules, setFollowCarRules] = React.useState<
    Record<string, { enabled: boolean }>
  >({});
  const [groupLessonsEnabled, setGroupLessonsEnabled] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [filtersMenuOpen, setFiltersMenuOpen] = React.useState(false);
  // Filtri multi-selezione (redesign 2026-07): array vuoto = nessun filtro.
  // Applicati client-side sul bootstrap già caricato — cambiare filtro non
  // rifà la fetch.
  const [instructorFilter, setInstructorFilter] = React.useState<string[]>([]);
  const [vehicleFilter, setVehicleFilter] = React.useState<string[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<string[]>([]);
  const [typeFilter, setTypeFilter] = React.useState<string[]>([]);
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
  const [editAppointmentTarget, setEditAppointmentTarget] =
    React.useState<EditAppointmentDialogAppointment | null>(null);
  const [form, setForm] = React.useState({
    studentId: "",
    type: "guida",
    types: ["guida"] as string[],
    day: "",
    time: "09:00",
    instructorId: "",
    bookingMode: "auto" as "auto" | "moto",
    vehicleId: "",
    followVehicleId: "",
    extraMotoVehicleIds: [] as string[],
    locationId: "",
    duration: "30",
    notes: "",
  });
  type AgendaLocationOption = {
    id: string;
    name: string;
    address: string | null;
    isDefault: boolean;
    isPrecise: boolean;
  };
  const [agendaLocations, setAgendaLocations] = React.useState<AgendaLocationOption[]>([]);
  const defaultLocationId = React.useMemo(
    () => agendaLocations.find((l) => l.isDefault)?.id ?? "",
    [agendaLocations],
  );
  const [instructorAvailability, setInstructorAvailability] = React.useState<InstructorAvailabilityWeek[]>([]);
  const [outOfAvailAppointments, setOutOfAvailAppointments] = React.useState<OutOfAvailabilityAppointment[]>([]);
  const [outOfAvailSheetOpen, setOutOfAvailSheetOpen] = React.useState(false);
  const [holidays, setHolidays] = React.useState<Array<{ date: string; label: string | null }>>([]);
  const [instructorBlocks, setInstructorBlocks] = React.useState<Array<{
    id: string; instructorId: string; startsAt: string; endsAt: string; reason: string | null; recurrenceGroupId: string | null;
  }>>([]);
  const [blockDialogOpen, setBlockDialogOpen] = React.useState(false);
  const [blockForm, setBlockForm] = React.useState({ instructorId: "", date: "", startTime: "09:00", duration: "60", reason: "", recurring: false, recurringWeeks: 12 });
  const [blockDeleteConfirm, setBlockDeleteConfirm] = React.useState<{ id: string; recurrenceGroupId: string | null } | null>(null);
  const [examDialogOpen, setExamDialogOpen] = React.useState(false);
  const [examForm, setExamForm] = React.useState({ date: "", time: "09:00", duration: "60", timeSet: true, instructorId: "", studentIds: [] as string[], note: "" });
  const [examCreating, setExamCreating] = React.useState(false);
  const [examStudentSearch, setExamStudentSearch] = React.useState("");
  const [examPanelGroup, setExamPanelGroup] = React.useState<ExamGroup | null>(null);
  const [examPanelStudentSearch, setExamPanelStudentSearch] = React.useState("");
  const [examPanelPending, setExamPanelPending] = React.useState(false);
  const [legendOpen, setLegendOpen] = React.useState(false);
  // Google-Calendar-style slot menu: click on an empty agenda slot → ghost
  // block on the grid + popover with the same options as "+ Nuovo", pre-filled
  // with the clicked day/time (and instructor when the column is instructor-
  // specific). colLeft/colRight/ghostTop are viewport coords of the clicked
  // column, used to anchor the popover beside the ghost.
  const [slotMenu, setSlotMenu] = React.useState<{
    day: Date;
    ymd: string;
    time: string;
    instructorId: string | null;
    colLeft: number;
    colRight: number;
    ghostTop: number;
  } | null>(null);
  const [groupLessonPrefill, setGroupLessonPrefill] = React.useState<{ date: string; time: string; instructorId: string | null } | null>(null);
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

  // Separate exam appointments and group them; keep non-exam appointments as-is
  const { regularAppointments, examGroups } = React.useMemo(() => {
    const regular: AppointmentRow[] = [];
    const examMap = new Map<string, AppointmentRow[]>();
    // Collapse group-lesson participant rows into ONE card per groupLessonId
    // (mirrors the mobile agenda). Empty lessons arrive as a single synthetic
    // `gl-empty:` row (0 participants).
    const glMap = new Map<string, AppointmentRow[]>();
    for (const a of appointments) {
      if (a.type === "esame" && a.status !== "cancelled") {
        const key = `${new Date(a.startsAt).toISOString()}|${a.endsAt ? new Date(a.endsAt).toISOString() : ""}`;
        const list = examMap.get(key) ?? [];
        list.push(a);
        examMap.set(key, list);
      } else if (a.type === "group_lesson" && a.status !== "cancelled" && a.groupLessonId) {
        const list = glMap.get(a.groupLessonId) ?? [];
        list.push(a);
        glMap.set(a.groupLessonId, list);
      } else {
        regular.push(a);
      }
    }
    for (const [, appts] of glMap) {
      const rep = appts[0];
      const filled = appts.filter((x) => !String(x.id).startsWith("gl-empty:")).length;
      regular.push({
        ...rep,
        student: { ...rep.student, firstName: `Guida di gruppo · ${filled}/${rep.groupLessonCapacity ?? 3}`, lastName: "" },
      });
    }
    const groups: ExamGroup[] = [];
    for (const [key, appts] of examMap) {
      const first = appts[0];
      groups.push({
        key,
        startsAt: typeof first.startsAt === "string" ? first.startsAt : (first.startsAt as Date).toISOString(),
        endsAt: first.endsAt ? (typeof first.endsAt === "string" ? first.endsAt : (first.endsAt as Date).toISOString()) : null,
        instructorId: first.instructor?.id ?? null,
        instructor: first.instructor ?? null,
        appointments: appts,
        notes: first.notes ?? null,
      });
    }
    return { regularAppointments: regular, examGroups: groups };
  }, [appointments]);

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

      return `/api/autoscuole/agenda/bootstrap?${params.toString()}`;
    },
    [],
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
        // Empty group lessons (0 participants) arrive as synthetic `gl-empty:`
        // rows from the bootstrap action itself (shared with mobile); the
        // `regularAppointments` memo collapses them into one card per lesson.
        setAppointments(payload.data.appointments ?? []);
        setStudents(payload.data.students ?? []);
        setInstructors(payload.data.instructors ?? []);
        setVehicles(payload.data.vehicles ?? []);
        setVehiclesEnabled(payload.data.vehiclesEnabled !== false);
        setFollowCarRules(
          (payload.data.followCarRules as Record<string, { enabled: boolean }>) ?? {},
        );
        setGroupLessonsEnabled(payload.data.groupLessonsEnabled === true);
        setHolidays(payload.data.holidays ?? []);
        setInstructorBlocks((payload.data.instructorBlocks ?? []).map((b: Record<string, unknown>) => ({
          id: b.id as string,
          instructorId: b.instructorId as string,
          startsAt: typeof b.startsAt === "string" ? b.startsAt : (b.startsAt as Date).toISOString(),
          endsAt: typeof b.endsAt === "string" ? b.endsAt : (b.endsAt as Date).toISOString(),
          reason: (b.reason as string | null) ?? null,
          recurrenceGroupId: (b.recurrenceGroupId as string | null) ?? null,
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

  // Load company locations once (sede + custom) for the create-appointment Luogo selector
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getAutoscuolaLocations();
      if (cancelled || !res.success || !res.data) return;
      setAgendaLocations(
        res.data.map((l) => ({
          id: l.id,
          name: l.name,
          address: l.address,
          isDefault: l.isDefault,
          isPrecise: l.isPrecise,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-populate form.locationId with the default sede whenever the dialog opens
  React.useEffect(() => {
    if (createOpen && !form.locationId && defaultLocationId) {
      setForm((prev) => ({ ...prev, locationId: defaultLocationId }));
    }
  }, [createOpen, defaultLocationId, form.locationId]);

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

  // Close the slot menu with Escape.
  React.useEffect(() => {
    if (!slotMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSlotMenu(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slotMenu]);

  // Click on an empty agenda slot → open the slot menu at the pointer, with the
  // time snapped to the 30' slot that was clicked (Google Calendar behaviour).
  const openSlotMenu = React.useCallback((
    event: React.MouseEvent<HTMLDivElement>,
    day: Date,
    instructorId?: string | null,
  ) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-radix-popper-content-wrapper], [role='menu'], button, a")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // rect.top is viewport-relative, so it already accounts for the container scroll.
    const offsetY = event.clientY - rect.top;
    const minutes = Math.max(0, Math.min(totalMinutes - SLOT_MINUTES, offsetY / PIXELS_PER_MINUTE));
    const startMin = Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
    const snapped = startMin + DAY_START_HOUR * 60;
    const normalized = normalizeDay(day);
    setSlotMenu({
      day: normalized,
      ymd: formatYmd(normalized),
      time: `${pad(Math.floor(snapped / 60))}:${pad(snapped % 60)}`,
      instructorId: instructorId ?? null,
      colLeft: rect.left,
      colRight: rect.right,
      ghostTop: rect.top + startMin * PIXELS_PER_MINUTE,
    });
  }, []);

  // Ghost block rendered inside the clicked column while the slot menu is open
  // (neutral look: white + dashed gray border, approved via desktop preview).
  const renderSlotGhost = (day: Date, instructorId: string | null) => {
    const active =
      slotMenu !== null &&
      slotMenu.ymd === formatYmd(day) &&
      slotMenu.instructorId === instructorId;
    const GHOST_MINUTES = 60;
    return (
      <AnimatePresence>
        {active && slotMenu && (() => {
          const [h, m] = slotMenu.time.split(":").map(Number);
          const startMin = h * 60 + m - DAY_START_HOUR * 60;
          const durMin = Math.min(GHOST_MINUTES, totalMinutes - startMin);
          const endTotal = h * 60 + m + durMin;
          const end = `${pad(Math.floor(endTotal / 60) % 24)}:${pad(endTotal % 60)}`;
          return (
            <motion.div
              key="slot-ghost"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="pointer-events-none absolute left-1 right-1 z-30 overflow-hidden rounded-lg border-[1.5px] border-dashed border-gray-400 bg-white/85 px-2 py-1.5 shadow-[0_6px_22px_rgba(16,24,40,0.14)]"
              style={{ top: startMin * PIXELS_PER_MINUTE, height: Math.max(30, durMin * PIXELS_PER_MINUTE - 2) }}
            >
              <div className="text-[11px] font-semibold tabular-nums text-foreground">{slotMenu.time} – {end}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <span className="size-1.5 shrink-0 rounded-full bg-gray-400" />
                Nuovo evento
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    );
  };

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
    // Filtro istruttori attivo → in vista Istruttori restano solo le loro colonne.
    const list = Array.from(instrMap.values()).filter(
      (instr) => instructorFilter.length === 0 || instructorFilter.includes(instr.id),
    );
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [viewMode, instructors, instructorAvailability, dayFocus, instructorFilter]);

  const filtered = React.useMemo(() => {
    return regularAppointments.filter((item) => {
      // Always hide cancelled appointments from the agenda — the cancellation
      // is recorded server-side, but the slot should free up visually.
      if ((item.status ?? "").toLowerCase() === "cancelled") return false;

      // Filtri multi-selezione (vuoto = tutto passa).
      if (instructorFilter.length > 0 && !instructorFilter.includes(item.instructor?.id ?? "")) {
        return false;
      }
      if (vehicleFilter.length > 0) {
        const vehicleIds = [
          item.vehicle?.id,
          item.followVehicle?.id,
          ...(item.extraMotoVehicles ?? []).map((v) => v.id),
        ].filter(Boolean) as string[];
        if (!vehicleIds.some((id) => vehicleFilter.includes(id))) return false;
      }
      if (typeFilter.length > 0) {
        const itemTypes = [item.type, ...(item.types ?? [])];
        if (!itemTypes.some((t) => typeFilter.includes(t))) return false;
      }
      if (statusFilter.length > 0 && !statusFilter.includes((item.status ?? "").toLowerCase())) {
        return false;
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
  }, [appointments, search, rangeStart, rangeEnd, instructorFilter, vehicleFilter, typeFilter, statusFilter]);

  const handleCreate = async () => {
    const isMotoMode = vehiclesEnabled && form.bookingMode === "moto";
    const needFollowCar =
      isMotoMode && Object.values(followCarRules).some((r) => r?.enabled === true);
    if (!form.studentId || !form.day || !form.time || !form.instructorId || (vehiclesEnabled && !form.vehicleId)) {
      toast.info({ description: "Completa tutti i campi richiesti." });
      return;
    }
    // Vehicle⇄student license eligibility (moto hierarchy). BE re-validates.
    if (vehiclesEnabled && form.vehicleId) {
      const st = students.find((s) => s.id === form.studentId);
      const veh = vehicles.find((v) => v.id === form.vehicleId);
      if (st && veh && !vehicleServesLicense(veh, st)) {
        toast.info({ description: "Il veicolo selezionato non è idoneo alla patente dell'allievo." });
        return;
      }
    }
    // Explicit choice required, but "Nessuna auto al seguito" (__none__) is a
    // valid answer: the global rule suggests the follow car, it doesn't force it.
    if (needFollowCar && !form.followVehicleId) {
      toast.info({ description: "Scegli l'auto al seguito (o \"Nessuna\") per la guida moto." });
      return;
    }
    const startDate = buildLocalDateTime(form.day, form.time);
    if (Number.isNaN(startDate.getTime())) {
      toast.error({ description: "Data o orario non validi." });
      return;
    }
    setCreating(true);
    const endsAt = new Date(startDate.getTime() + Number(form.duration) * 60 * 1000);
    const makePayload = (skip?: boolean) => ({
      studentId: form.studentId,
      type: form.types[0] || form.type,
      types: form.types,
      startsAt: startDate.toISOString(),
      endsAt: endsAt.toISOString(),
      instructorId: form.instructorId,
      vehicleId: vehiclesEnabled ? form.vehicleId : null,
      followVehicleId:
        needFollowCar && form.followVehicleId !== "__none__" ? form.followVehicleId : null,
      extraMotoVehicleIds: isMotoMode
        ? form.extraMotoVehicleIds.filter((id) => id !== form.vehicleId)
        : [],
      locationId: form.locationId || null,
      notes: form.notes.trim() || undefined,
      ...(skip ? { skipWeeklyLimitCheck: true } : {}),
    });
    const res = await createAutoscuolaAppointment(makePayload());
    if (!res.success) {
      const code = (res as { code?: string }).code;
      if (code === "WEEKLY_LIMIT_CONFIRM") {
        setCreating(false);
        const confirmed = window.confirm(res.message ?? "L'allievo ha raggiunto il limite settimanale. Procedere comunque?");
        if (!confirmed) return;
        setCreating(true);
        const retryRes = await createAutoscuolaAppointment(makePayload(true));
        if (!retryRes.success) {
          setCreating(false);
          toast.error({ description: retryRes.message ?? "Impossibile creare l'appuntamento." });
          return;
        }
      } else {
        setCreating(false);
        toast.error({
          description: res.message ?? "Impossibile creare l'appuntamento.",
        });
        return;
      }
    }
    setCreating(false);
    setCreateOpen(false);
    setForm({
      studentId: "",
      type: "guida",
      types: ["guida"],
      day: "",
      time: "09:00",
      instructorId: "",
      bookingMode: "auto",
      vehicleId: "",
      followVehicleId: "",
      extraMotoVehicleIds: [],
      locationId: defaultLocationId,
      duration: "30",
      notes: "",
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

  const handleDelete = async (appointmentId: string) => {
    const confirmed = window.confirm("Sei sicuro di voler cancellare questa guida?");
    if (!confirmed) return;
    setPendingEventActionId(appointmentId);
    const res = await deleteAutoscuolaAppointment({ appointmentId });
    if (!res.success) {
      toast.error({
        description: res.message ?? "Impossibile cancellare l'evento.",
      });
      setPendingEventActionId(null);
      return;
    }
    toast.success({ description: res.message ?? "Guida cancellata." });
    await load({ silent: true });
    setPendingEventActionId(null);
  };

  const handleStatusUpdate = async (appointmentId: string, status: "scheduled" | "confirmed" | "proposal" | "checked_in" | "no_show" | "completed" | "cancelled") => {
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

  const handleOpenEdit = (item: AppointmentRow) => {
    setEditAppointmentTarget({
      id: item.id,
      startsAt: item.startsAt,
      endsAt: item.endsAt ?? null,
      status: item.status,
      type: item.type ?? null,
      notes: item.notes ?? null,
      student: {
        firstName: item.student.firstName,
        lastName: item.student.lastName,
        licenseCategory: item.student.licenseCategory ?? null,
        transmission: item.student.transmission ?? null,
      },
      instructor: item.instructor
        ? { id: item.instructor.id, name: item.instructor.name }
        : null,
      vehicle: item.vehicle
        ? { id: item.vehicle.id, name: item.vehicle.name }
        : null,
      followVehicle: item.followVehicle
        ? { id: item.followVehicle.id, name: item.followVehicle.name }
        : null,
      extraMotoVehicles: (item.extraMotoVehicles ?? []).map((v) => ({
        id: v.id,
        name: v.name,
      })),
      location: item.location
        ? { id: item.location.id, name: item.location.name }
        : null,
    });
  };

  const applyFilter = React.useCallback((kind: FilterKind, value: string[]) => {
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
  // Stable instructor → tint mapping (used in both week and day views).
  // Owner-picked hex (instructor.color) wins; otherwise the legacy positional
  // palette by alphabetical index. Custom colors resolve to inline styles,
  // legacy ones to Tailwind classes — consumers apply both.
  const instructorColorMap = React.useMemo(() => {
    const map = new Map<string, InstructorTint>();
    const sorted = [...instructors].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach((instr, idx) => {
      if (instr.color) {
        const tint = instructorTintStyles(instr.color);
        map.set(instr.id, { avatarStyle: tint.avatar, bandStyle: tint.band });
      } else {
        const legacy = INSTRUCTOR_COLORS[idx % INSTRUCTOR_COLORS.length];
        map.set(instr.id, { avatarClass: legacy.avatar, bandClass: legacy.bg });
      }
    });
    return map;
  }, [instructors]);
  // Fallback for ids missing from `instructors` (e.g. availability-only rows).
  const tintFor = React.useCallback(
    (instructorId: string, idx: number): InstructorTint =>
      instructorColorMap.get(instructorId) ?? {
        avatarClass: INSTRUCTOR_COLORS[idx % INSTRUCTOR_COLORS.length].avatar,
        bandClass: INSTRUCTOR_COLORS[idx % INSTRUCTOR_COLORS.length].bg,
      },
    [instructorColorMap],
  );

  // Student license path shown on agenda blocks ("B", "AM", "B autom.", …).
  // Appointment rows carry only name/email, so resolve via the bootstrap
  // students directory (same User-id space).
  const studentLicenseById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) {
      if (!s.licenseCategory) continue;
      map.set(s.id, `${s.licenseCategory}${s.transmission === "automatic" ? " autom." : ""}`);
    }
    return map;
  }, [students]);
  // Group lessons aggregate several students — no single license to show.
  const licenseTagFor = React.useCallback(
    (item: AppointmentRow): string | null =>
      item.type === "group_lesson" ? null : studentLicenseById.get(item.student.id) ?? null,
    [studentLicenseById],
  );

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const visibleDays = viewMode === "week" ? days : [dayFocus];
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
        <div className="mx-auto max-w-7xl space-y-5">
          <PageHeader
            title="Agenda"
            subtitle={(() => {
              const activeCount = filtered.filter((a) => a.status !== "cancelled").length;
              const todayCount = filtered.filter((a) => {
                if (a.status === "cancelled") return false;
                const start = toDate(a.startsAt);
                return start >= todayNormalized && start < addDays(todayNormalized, 1);
              }).length;
              const periodo = viewMode === "week" ? "questa settimana" : "in giornata";
              return viewMode === "week"
                ? [`${todayCount} guide oggi`, `${activeCount} ${periodo}`]
                : [`${activeCount} guide ${periodo}`];
            })()}
          />
          {tabs}
        <div className="flex items-center gap-3">
          {/* Date nav */}
          <div className="flex items-center gap-1">
            <button type="button"
              className="flex size-[30px] cursor-pointer items-center justify-center rounded-full text-[#555] transition-colors hover:bg-[#f2f2f2]"
              onClick={() => viewMode === "week" ? setWeekStart((prev) => addDays(prev, -7)) : setDayFocus((prev) => addDays(prev, -1))}>
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[130px] select-none text-center text-[15px] font-semibold text-foreground">
              {viewMode === "week"
                ? formatRangeLabel(weekStart)
                : dayFocus.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })}
            </span>
            <button type="button"
              className="flex size-[30px] cursor-pointer items-center justify-center rounded-full text-[#555] transition-colors hover:bg-[#f2f2f2]"
              onClick={() => viewMode === "week" ? setWeekStart((prev) => addDays(prev, 7)) : setDayFocus((prev) => addDays(prev, 1))}>
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Period toggle */}
          <SegmentedPill
            value={viewMode}
            onChange={(v) => setViewMode(v)}
            options={[
              { value: "week", label: "Settimana" },
              { value: "day", label: "Giorno" },
            ]}
          />

          {/* Mode toggle */}
          <SegmentedPill
            value={agendaMode}
            onChange={(v) => { if (v !== agendaMode) toggleAgendaMode(); }}
            options={[
              { value: "classic", label: "Classica", icon: <CalendarDays className="size-[13px]" /> },
              { value: "instructor", label: "Istruttori", icon: <Users className="size-[13px]" /> },
            ]}
          />

          <div className="min-w-2 flex-1" />

          {/* Legenda (icona info, proto) */}
          <button
            type="button"
            title="Legenda"
            onClick={() => setLegendOpen(true)}
            className="flex h-[34px] shrink-0 cursor-pointer items-center justify-center rounded-lg px-1.5 text-[#888888] transition-colors hover:bg-[#f0f0f0] hover:text-[#222222]"
          >
            <Info className="size-4" strokeWidth={1.6} />
          </button>

          {/* Filtri (menu unico, proto) */}
          {(() => {
            const hasActiveFilters =
              instructorFilter.length > 0 || vehicleFilter.length > 0 || typeFilter.length > 0 || statusFilter.length > 0;
            const menuEntries: Array<{ kind: FilterKind; label: string; active: boolean; value: string[] }> = [
              { kind: "instructor", label: "Istruttore", active: instructorFilter.length > 0, value: instructorFilter },
              ...(vehiclesEnabled
                ? [{ kind: "vehicle" as FilterKind, label: "Veicolo", active: vehicleFilter.length > 0, value: vehicleFilter }]
                : []),
              { kind: "type", label: "Tipo", active: typeFilter.length > 0, value: typeFilter },
              { kind: "status", label: "Stato", active: statusFilter.length > 0, value: statusFilter },
            ];
            return (
              <DropdownMenu open={filtersMenuOpen} onOpenChange={setFiltersMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="relative flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 transition-colors hover:bg-[#f0f0f0]"
                  >
                    <SlidersHorizontal className="size-4 text-[#888888]" strokeWidth={1.6} />
                    <span className="text-[13px] font-medium text-[#555555]">Filtri</span>
                    {hasActiveFilters && (
                      <span className="absolute right-1 top-1 size-[7px] rounded-full bg-[#1a1a2e]" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[190px] rounded-xl p-1.5 shadow-dropdown">
                  {menuEntries.map((entry) => (
                    <button
                      key={entry.kind}
                      type="button"
                      className="flex w-full cursor-pointer items-center rounded-lg px-3 py-[9px] text-[13px] font-medium text-foreground transition-colors hover:bg-[#f7f7f7]"
                      onClick={() => { setFiltersMenuOpen(false); setFilterEditor({ kind: entry.kind, value: entry.value }); }}
                    >
                      {entry.label}
                      {entry.active && <span className="ml-auto size-[7px] rounded-full bg-[#1a1a2e]" />}
                    </button>
                  ))}
                  {hasActiveFilters && (
                    <>
                      <div className="my-1 border-t border-[#f0f0f0]" />
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center rounded-lg px-3 py-[9px] text-[13px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#eeeef4]"
                        onClick={() => { setFiltersMenuOpen(false); setInstructorFilter([]); setVehicleFilter([]); setTypeFilter([]); setStatusFilter([]); }}
                      >
                        Rimuovi filtri
                      </button>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })()}

          {/* Cerca (espandibile, proto) */}
          {searchOpen ? (
            <motion.div
              initial={{ width: 34, opacity: 0.5 }}
              animate={{ width: 220, opacity: 1 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex h-[38px] shrink-0 items-center gap-2 overflow-hidden rounded-full border-[1.5px] border-[#1a1a2e] bg-white px-3.5 shadow-[0_2px_8px_rgba(26,26,46,0.15)]"
            >
              <Search className="size-[15px] shrink-0 text-[#1a1a2e]" strokeWidth={1.8} />
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18, delay: 0.12 }}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <input
                  autoFocus
                  placeholder="Cerca in agenda…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Escape") { setSearch(""); setSearchOpen(false); } }}
                  className="min-w-0 flex-1 border-none bg-transparent text-sm font-medium text-[#222222] outline-none placeholder:text-[#929292]"
                />
                <button
                  type="button"
                  onClick={() => { setSearch(""); setSearchOpen(false); }}
                  className="flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#ebebeb] transition-colors hover:bg-[#dddddd]"
                >
                  <X className="size-2.5 text-[#555555]" strokeWidth={2} />
                </button>
              </motion.div>
            </motion.div>
          ) : (
            <button
              type="button"
              title="Cerca"
              onClick={() => setSearchOpen(true)}
              className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#888888] transition-colors hover:bg-[#f0f0f0] hover:text-[#222222]"
            >
              <Search className="size-[17px]" strokeWidth={1.6} />
            </button>
          )}

          {/* CTA */}
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Inserisci a mano"
                  className="flex size-[38px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-navy-900 text-white transition-colors hover:bg-navy-800"
                >
                  <Plus className="size-[18px]" strokeWidth={2.2} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-dropdown">
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-[#f7f7f7] transition-colors cursor-pointer"
                  onClick={() => { setCreateStep(0); setCreateOpen(true); }}
                >
                  <Plus className="size-4 text-foreground" strokeWidth={1.7} />
                  Appuntamento
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-[#f7f7f7] transition-colors cursor-pointer"
                  onClick={() => { setExamForm({ date: normalizeDay(dayFocus).toISOString().slice(0, 10), time: "09:00", duration: "60", timeSet: true, instructorId: "", studentIds: [], note: "" }); setExamStudentSearch(""); setExamDialogOpen(true); }}
                >
                  <GraduationCap className="size-4 text-foreground" strokeWidth={1.7} />
                  Esame
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-[#f7f7f7] transition-colors cursor-pointer"
                  onClick={() => { setBlockForm({ instructorId: instructors[0]?.id ?? "", date: normalizeDay(dayFocus).toISOString().slice(0, 10), startTime: "09:00", duration: "60", reason: "", recurring: false, recurringWeeks: 12 }); setBlockDialogOpen(true); }}
                >
                  <Ban className="size-4 text-foreground" strokeWidth={1.7} />
                  Evento bloccante
                </button>
                {groupLessonsEnabled && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-[#f7f7f7] transition-colors cursor-pointer"
                    onClick={() => setCreateGroupLessonOpen(true)}
                  >
                    <Users className="size-4 text-foreground" strokeWidth={1.7} />
                    Guida di gruppo
                  </button>
                )}
                {viewMode === "day" && (
                  <>
                    <div className="my-1 border-t border-[#f0f0f0]" />
                    {holidaySet.has(formatYmd(dayFocus)) ? (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-[#c13515] hover:bg-red-50 transition-colors cursor-pointer"
                        onClick={() => { setRemoveHolidayDate(dayFocus); setRemoveHolidayDialogOpen(true); }}
                      >
                        <Ban className="size-4" strokeWidth={1.7} />
                        Rimuovi festivo
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-[#d97706] hover:bg-[#fffbeb] transition-colors cursor-pointer"
                        onClick={() => { setHolidayDialogDate(dayFocus); setHolidayLabel(""); setHolidayDialogOpen(true); }}
                      >
                        <Ban className="size-4" strokeWidth={1.7} />
                        Segna festivo
                      </button>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
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

        <EditAppointmentDialog
          open={editAppointmentTarget !== null}
          onOpenChange={(open) => {
            if (!open) setEditAppointmentTarget(null);
          }}
          appointment={editAppointmentTarget}
          instructors={instructors}
          vehicles={vehicles.map((v) => ({
            id: v.id,
            name: v.name,
            licenseCategory: v.licenseCategory,
            transmission: v.transmission,
            assignedInstructorId: v.assignedInstructorId,
            poolInstructorIds: v.poolInstructorIds,
          }))}
          vehiclesEnabled={vehiclesEnabled}
          followCarRules={followCarRules}
          locations={agendaLocations}
          onSuccess={() => {
            load({ silent: true });
          }}
        />
        <GroupLessonManageDialog
          open={manageGroupLessonId !== null}
          onOpenChange={(open) => { if (!open) setManageGroupLessonId(null); }}
          groupLessonId={manageGroupLessonId}
          instructors={instructors.map((i) => ({ id: i.id, name: i.name }))}
          vehicles={vehicles.map((v) => ({ id: v.id, name: v.name }))}
          vehiclesEnabled={vehiclesEnabled}
          onChanged={() => { load({ silent: true }); }}
        />
        <GroupLessonCreateDialog
          open={createGroupLessonOpen}
          onOpenChange={(open) => { setCreateGroupLessonOpen(open); if (!open) setGroupLessonPrefill(null); }}
          instructors={instructors.map((i) => ({ id: i.id, name: i.name }))}
          vehiclesEnabled={vehiclesEnabled}
          followCarRules={followCarRules}
          defaultDate={groupLessonPrefill?.date ?? normalizeDay(dayFocus).toISOString().slice(0, 10)}
          defaultTime={groupLessonPrefill?.time ?? null}
          defaultInstructorId={groupLessonPrefill?.instructorId ?? null}
          onCreated={() => { load({ silent: true }); }}
        />

        {/* Slot menu — click on an empty agenda slot (Google Calendar style) */}
        {slotMenu && typeof document !== "undefined" && createPortal(
          (() => {
            const MENU_WIDTH = 248;
            const MENU_HEIGHT = groupLessonsEnabled ? 236 : 200;
            // Anchor beside the clicked column, aligned with the ghost block;
            // flip to the left side when there is no room on the right.
            let left = slotMenu.colRight + 10;
            if (left + MENU_WIDTH > window.innerWidth - 8) left = slotMenu.colLeft - MENU_WIDTH - 10;
            left = Math.max(8, left);
            const top = Math.max(8, Math.min(slotMenu.ghostTop - 4, window.innerHeight - MENU_HEIGHT - 8));
            const instructorName = slotMenu.instructorId
              ? instructors.find((i) => i.id === slotMenu.instructorId)?.name ?? null
              : null;
            const closeAnd = (fn: () => void) => { setSlotMenu(null); fn(); };
            const options: Array<{ key: string; label: string; icon: React.ReactNode; onSelect: () => void }> = [
              {
                key: "appointment",
                label: "Appuntamento",
                icon: <Plus className="size-4 text-foreground" strokeWidth={1.7} />,
                onSelect: () => closeAnd(() => {
                  setForm((prev) => ({ ...prev, day: slotMenu.ymd, time: slotMenu.time, instructorId: slotMenu.instructorId ?? prev.instructorId }));
                  setCreateStep(0);
                  setCreateOpen(true);
                }),
              },
              {
                key: "exam",
                label: "Esame",
                icon: <GraduationCap className="size-4 text-foreground" strokeWidth={1.7} />,
                onSelect: () => closeAnd(() => {
                  setExamForm({ date: slotMenu.ymd, time: slotMenu.time, duration: "60", timeSet: true, instructorId: slotMenu.instructorId ?? "", studentIds: [], note: "" });
                  setExamStudentSearch("");
                  setExamDialogOpen(true);
                }),
              },
              {
                key: "block",
                label: "Evento bloccante",
                icon: <Ban className="size-4 text-foreground" strokeWidth={1.7} />,
                onSelect: () => closeAnd(() => {
                  setBlockForm({ instructorId: slotMenu.instructorId ?? instructors[0]?.id ?? "", date: slotMenu.ymd, startTime: slotMenu.time, duration: "60", reason: "", recurring: false, recurringWeeks: 12 });
                  setBlockDialogOpen(true);
                }),
              },
              ...(groupLessonsEnabled ? [{
                key: "group",
                label: "Guida di gruppo",
                icon: <Users className="size-4 text-foreground" strokeWidth={1.7} />,
                onSelect: () => closeAnd(() => {
                  setGroupLessonPrefill({ date: slotMenu.ymd, time: slotMenu.time, instructorId: slotMenu.instructorId });
                  setCreateGroupLessonOpen(true);
                }),
              }] : []),
            ];
            return (
              <div
                className="fixed inset-0 z-[60]"
                onClick={() => setSlotMenu(null)}
                onContextMenu={(e) => { e.preventDefault(); setSlotMenu(null); }}
                onWheel={() => setSlotMenu(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="absolute rounded-xl border border-border bg-white p-1.5 shadow-dropdown"
                  style={{ left, top, width: MENU_WIDTH }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-1 border-b border-border/60 px-2.5 pb-2 pt-1.5">
                    <div className="text-xs font-semibold capitalize text-foreground">
                      {slotMenu.day.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Ore {slotMenu.time}{instructorName ? ` · ${instructorName}` : ""}
                    </div>
                  </div>
                  {options.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-gray-50"
                      onClick={option.onSelect}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </motion.div>
              </div>
            );
          })(),
          document.body,
        )}
        </div>

        {loading ? (
          <AgendaGridSkeleton columns={viewMode === "week" ? 7 : agendaMode === "instructor" ? 4 : 1} />
        ) : (<FadeIn>
        {/* ── CLASSIC VIEW ── */}
        {agendaMode === "classic" && (
          <div className={cn("relative transition-opacity duration-200", refreshing && "opacity-60")} style={{ height: "calc(100vh - 240px)", minHeight: 400 }}>
            <div ref={calendarScrollRef} className="overflow-y-auto rounded-[14px] border border-[#dddddd] bg-white" style={{ height: "100%" }}>
              {/* Sticky day headers */}
              <div
                className={`sticky top-0 z-30 grid border-b border-[#eeeeee] bg-white/95 backdrop-blur-sm ${viewMode === "week" ? "grid-cols-[56px_repeat(7,1fr)]" : "grid-cols-[56px_1fr]"}`}
              >
                <div className="border-r border-[#eeeeee] bg-[#fafafa]" />
                {visibleDays.map((day) => (
                  <AgendaDayHeader
                    key={day.toISOString()}
                    day={day}
                    isToday={day.getTime() === todayNormalized.getTime()}
                    isHoliday={holidaySet.has(formatYmd(day))}
                  />
                ))}
              </div>
              {/* Calendar body */}
              <div className={`grid ${viewMode === "week" ? "grid-cols-[56px_repeat(7,1fr)]" : "grid-cols-[56px_1fr]"}`}>
                {/* Time gutter */}
                <div className="relative border-r border-[#eeeeee] bg-[#fafafa]" style={{ height: calendarHeight }}>
                  {hourMarks.map((hour) => (
                    <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE }}>
                      <span className="w-full pr-2 text-right text-[11px] leading-none text-[#aaaaaa]">{`${pad(hour)}:00`}</span>
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
                  const isWeekendDay = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <div key={day.toISOString()} className={cn("relative cursor-pointer border-l border-[#eeeeee]", isWeekendDay ? "bg-[#fafafa]" : "bg-white")} style={{ height: calendarHeight }}
                      onClick={(event) => openSlotMenu(event, day)}
                    >
                      {renderSlotGhost(day, null)}
                      {hourMarks.map((hour) => (<div key={hour} className="absolute left-0 right-0 h-px bg-[#f5f5f5]" style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE }} />))}
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
                        const isExam = item.type === "esame";
                        const isGroupLesson = item.type === "group_lesson";
                        const isCompact = height <= 56; const GAP_PX = 2;
                        const licenseTag = licenseTagFor(item);
                        const laneLeft = `calc(${(lane / totalLanes) * 100}% + ${GAP_PX / 2}px)`;
                        const laneWidth = `calc(${(1 / totalLanes) * 100}% - ${GAP_PX}px)`;
                        const isPendingAction = pendingEventActionId === item.id;
                        const glTint = groupLessonTint(item);
                        const cardClassName = isExam
                          ? "bg-[#F5F0FF] shadow-[0_5px_14px_rgba(139,92,246,0.22)]"
                          : isGroupLesson
                            ? glTint.card
                            : statusMeta.className;
                        return (
                          <DropdownMenu key={item.id}>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className={cn("absolute z-10 box-border flex flex-col overflow-hidden rounded-[10px] text-left text-[11px] transition motion-safe:hover:-translate-y-0.5", isCompact ? "gap-0.5 p-1.5" : "gap-1 p-2", isPendingAction ? "pointer-events-none opacity-75" : "", cardClassName)} style={{ top, height, left: laneLeft, width: laneWidth }} onClick={(e) => e.stopPropagation()}>
                                {isPendingAction ? (<><div className="flex items-center justify-between gap-2"><div className="h-3 w-24 animate-pulse rounded-full bg-gray-100" /><div className="h-3 w-14 animate-pulse rounded-full bg-gray-100" /></div><div className="h-3 w-20 animate-pulse rounded-full bg-gray-200" /></>) : (<><div className="flex items-center justify-between gap-2"><div className={cn("min-w-0 truncate whitespace-nowrap font-semibold leading-tight", isExam ? "text-violet-800" : "text-foreground", isCompact ? "text-[10px]" : "text-[11px]")}>{isExam && !isCompact ? "🎓 " : ""}{item.student.firstName} {item.student.lastName}</div><Badge variant="secondary" className={cn("shrink-0 font-medium", isExam ? "border-violet-200 bg-violet-200/60 text-violet-700" : isGroupLesson ? glTint.badge : "border-border bg-white text-foreground/80", isCompact ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]")}>{isExam ? "Esame" : isGroupLesson ? glTint.label : statusMeta.shortLabel}</Badge></div><div className={cn("truncate whitespace-nowrap text-[11px]", isExam ? "text-violet-600" : isGroupLesson ? glTint.time : "text-muted-foreground")}>{formatTimeRange(start, end)}{!isCompact ? ` · ${Math.round(diffMinutes(end, start))}m` : ""}{!isExam && !isGroupLesson ? ` · ${item.type}` : ""}{isCompact && licenseTag ? ` · ${licenseTag}` : ""}</div>{!isCompact && licenseTag ? (<div className={cn("truncate whitespace-nowrap text-[10px] font-semibold", isExam ? "text-violet-700" : "text-foreground/70")}>Patente {licenseTag}</div>) : null}</>)}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" side="right" sideOffset={12} className="w-72 rounded-lg border border-border bg-white p-3 shadow-dropdown">
                              <div className="space-y-2"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Evento</div><div className="rounded-xl border border-border bg-white p-3"><div className="text-sm font-semibold text-foreground">{item.student.firstName} {item.student.lastName}</div><div className="mt-1 text-xs text-muted-foreground">{formatEventType(item.type)} · {formatTimeRange(start, end)}</div><div className="text-xs text-muted-foreground">{start.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}</div><div className="mt-2 space-y-1 text-xs text-muted-foreground"><div>Istruttore: <span className="font-medium text-foreground/85">{item.instructor?.name ?? "Non assegnato"}</span></div><VehicleDetailLines item={item} vehiclesEnabled={vehiclesEnabled} /><div>Luogo: <span className="font-medium text-foreground/85">{item.location?.name ?? "Sede dell'autoscuola"}</span></div>{item.notes?.trim() ? <div>Note: <span className="whitespace-pre-wrap font-medium text-foreground/85">{item.notes}</span></div> : null}</div><div className="mt-2 flex items-center gap-2">{isGroupLesson ? <Badge variant="secondary" className={glTint.detailBadge}>{glTint.label === "Gruppo moto" ? "Guida di gruppo moto" : "Guida di gruppo"}</Badge> : <Badge variant="secondary">{statusMeta.label}</Badge>}{!isGroupLesson && !canUpdateStatus(item) ? <span className="text-[11px] text-muted-foreground">Slot passato o chiuso</span> : null}</div></div></div>
                              {!isGroupLesson && <div className="mt-3 grid grid-cols-2 gap-2">{!isProposalStatus(item) && <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "checked_in")}>Presente</Button>}{!isProposalStatus(item) && <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "no_show")}>Assente</Button>}<Button type="button" variant="outline" size="sm" disabled={!canCompleteStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "completed")}>Completa</Button><Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleCancel(item.id)}>Annulla</Button></div>}
                              {canRescheduleAppointment(item) && !isGroupLesson ? <Button type="button" variant="outline" size="sm" className="mt-2 w-full" disabled={isPendingAction} onClick={() => handleOpenEdit(item)}>Modifica</Button> : null}
                              {isGroupLesson ? (
                                <Button type="button" size="sm" className="mt-1 w-full" disabled={isPendingAction} onClick={() => item.groupLessonId && setManageGroupLessonId(item.groupLessonId)}>Gestisci guida di gruppo</Button>
                              ) : (
                                <Button type="button" variant="ghost" size="sm" className="mt-2 w-full text-rose-700 hover:bg-rose-50 hover:text-rose-700" disabled={isPendingAction} onClick={() => handleDelete(item.id)}>Cancella</Button>
                              )}
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
                              <button type="button" className="absolute left-1 right-1 z-10 box-border flex flex-col items-start justify-center gap-0.5 overflow-hidden rounded-[7px] border border-[#0f172a] bg-[#1e293b] px-2.5 text-left transition hover:bg-[#26334a]" style={{ top: blockTop, height: blockHeight }} onClick={(e) => e.stopPropagation()}>
                                <span className="flex items-baseline gap-1.5"><span className="text-[18px] font-bold leading-none text-white">{group.allItems.length}</span><span className="text-[11px] font-medium leading-none text-white/65">guide</span></span>
                                <span className="text-[10px] text-white/65">{formatTimeRange(earliest, latest)}</span>
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
                                      <div className="text-muted-foreground mt-0.5">{formatEventType(item.type)} · {formatTimeRange(s, e)} · {item.instructor?.name ?? "N/A"}</div>
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
                                  className="absolute left-1 right-1 z-10 box-border flex flex-col overflow-hidden rounded-[10px] bg-[#F3F4F8] p-2 text-left text-[11px] transition hover:bg-[#E7E9F1]"
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
                                <Button type="button" variant="ghost" size="sm" className="mt-2 w-full text-red-600 hover:bg-red-50 hover:text-red-700" disabled={blockDeleting === b.id}
                                  onClick={async () => {
                                    if (b.recurrenceGroupId) {
                                      setBlockDeleteConfirm({ id: b.id, recurrenceGroupId: b.recurrenceGroupId });
                                    } else {
                                      setBlockDeleting(b.id);
                                      const res = await deleteInstructorBlock(b.id);
                                      setBlockDeleting(null);
                                      if (!res.success) { toast.error({ description: res.message ?? "Errore." }); return; }
                                      setInstructorBlocks((prev) => prev.filter((x) => x.id !== b.id));
                                      toast.success({ description: "Evento eliminato." });
                                    }
                                  }}
                                >{blockDeleting === b.id ? "Elimino..." : "Elimina evento"}</Button>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          );
                        })}
                      {/* Exam groups for this day */}
                      {examGroups
                        .filter((eg) => {
                          const egStart = toDate(eg.startsAt);
                          return egStart >= dayStart && egStart < dayEnd;
                        })
                        .map((eg) => {
                          const egStart = toDate(eg.startsAt);
                          const examHasTime = Boolean(eg.endsAt);
                          const egEnd = eg.endsAt ? toDate(eg.endsAt) : new Date(egStart.getTime() + 60 * 60 * 1000);
                          if (!examHasTime) {
                            // Timeless exam — fixed banner at top
                            return (
                              <button
                                key={`exam-${eg.key}`}
                                type="button"
                                className="absolute left-1 right-1 z-20 box-border flex items-center gap-1.5 overflow-hidden rounded-[10px] bg-[#F5F0FF] shadow-[0_5px_14px_rgba(139,92,246,0.22)] px-2 py-1.5 text-left transition hover:bg-[#EDE4FF] cursor-pointer"
                                style={{ top: 0 }}
                                onClick={(e) => { e.stopPropagation(); setExamPanelGroup(eg); setExamPanelStudentSearch(""); }}
                              >
                                <GraduationCap className="size-3 text-violet-600 shrink-0" />
                                <span className="text-[10px] font-bold text-violet-700">Esame</span>
                                <span className="text-[9px] text-violet-500 ml-auto">{eg.appointments.length} all.</span>
                              </button>
                            );
                          }
                          const offsetMin = Math.max(0, diffMinutes(egStart < dayStart ? dayStart : egStart, dayStart));
                          const durMin = Math.max(30, diffMinutes(egEnd > dayEnd ? dayEnd : egEnd, egStart < dayStart ? dayStart : egStart));
                          const top = offsetMin * PIXELS_PER_MINUTE;
                          const height = durMin * PIXELS_PER_MINUTE;
                          return (
                            <button
                              key={`exam-${eg.key}`}
                              type="button"
                              className="absolute left-1 right-1 z-10 box-border flex flex-col overflow-hidden rounded-[10px] bg-[#F5F0FF] shadow-[0_5px_14px_rgba(139,92,246,0.22)] p-2 text-left transition hover:bg-[#EDE4FF] cursor-pointer"
                              style={{ top, height }}
                              onClick={(e) => { e.stopPropagation(); setExamPanelGroup(eg); setExamPanelStudentSearch(""); }}
                            >
                              <div className="flex items-center gap-1.5">
                                <GraduationCap className="size-3.5 text-violet-600 shrink-0" />
                                <span className="text-[11px] font-bold text-violet-700 uppercase tracking-wider">Esame</span>
                                <Badge variant="secondary" className="ml-auto shrink-0 border-violet-200 bg-violet-200/60 text-violet-700 px-1.5 py-0 text-[9px] font-bold">
                                  {eg.appointments.length} {eg.appointments.length === 1 ? "allievo" : "allievi"}
                                </Badge>
                              </div>
                              <div className="mt-1 text-[10px] text-violet-600">
                                {formatTimeRange(egStart, egEnd)}
                                {eg.instructor ? ` · ${eg.instructor.name}` : ""}
                              </div>
                              {height > 60 && (
                                <div className="mt-1 text-[9px] text-violet-500 truncate">
                                  {eg.appointments.map((a) => `${a.student.firstName} ${a.student.lastName.charAt(0)}.`).join(", ")}
                                </div>
                              )}
                            </button>
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
          const weekInstructorsAll = instructorAvailability.length > 0
            ? instructorAvailability
            : instructors.map((i) => ({ instructorId: i.id, instructorName: i.name, days: {} as Record<string, Array<{ startMinutes: number; endMinutes: number }>> }));
          // Filtro istruttori attivo → solo le colonne selezionate.
          const weekInstructors = instructorFilter.length > 0
            ? weekInstructorsAll.filter((i) => instructorFilter.includes(i.instructorId))
            : weekInstructorsAll;
          const instrCount = Math.max(1, weekInstructors.length);
          const totalCols = instrCount * 7; // instructor sub-columns across 7 days

          return (
          <div className={cn("relative transition-opacity duration-200", refreshing && "opacity-60")} style={{ height: "calc(100vh - 240px)", minHeight: 400 }}>
            <div className="flex flex-col overflow-hidden rounded-[14px] border border-[#dddddd] bg-white" style={{ height: "100%" }}>
              {/* Fixed header — scrolls horizontally in sync with body */}
              <div className="overflow-hidden border-b border-border shrink-0" data-agenda-header-wrap>
                <div className="bg-white" style={{ display: "grid", gridTemplateColumns: `56px repeat(${totalCols}, minmax(80px, 1fr))` }}>
                {/* Day header row spanning instructor columns */}
                <div className="row-span-2" />
                {days.map((day) => {
                  const isDayToday = day.getTime() === todayNormalized.getTime();
                  const dayHolidayLabel = holidaySet.get(formatYmd(day));
                  const isDayHoliday = dayHolidayLabel !== undefined;
                  const isWeekendDay = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <div
                      key={`day-${day.toISOString()}`}
                      className={cn(
                        "relative flex h-[52px] cursor-pointer flex-col items-center justify-center gap-px border-l border-[#eeeeee] transition-colors hover:bg-[#f7f7f7]",
                        isDayHoliday ? "bg-[#fffcf0]" : isWeekendDay ? "bg-[#fafafa]" : "bg-white",
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
                      <span className={cn("text-[10px] font-semibold uppercase tracking-[0.5px]", isDayHoliday ? "text-amber-500" : "text-[#aaaaaa]")}>
                        {day.toLocaleDateString("it-IT", { weekday: "short" })}
                      </span>
                      <span
                        className={cn(
                          "flex size-[26px] items-center justify-center rounded-full text-[13px] font-bold",
                          isDayToday ? "bg-[#222222] text-white" : isDayHoliday ? "text-amber-600" : isWeekendDay ? "text-[#999999]" : "text-foreground",
                        )}
                      >
                        {day.getDate()}
                      </span>
                      {isDayHoliday && <span className="absolute right-1.5 top-1 text-[9px] font-semibold uppercase tracking-[0.3px] text-amber-500">{dayHolidayLabel || "festivo"}</span>}
                    </div>
                  );
                })}
                {/* Instructor sub-headers within each day */}
                {days.map((day) =>
                  weekInstructors.map((instr, idx) => {
                    const tint = tintFor(instr.instructorId, idx);
                    const initials = instr.instructorName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
                    return (
                      <div key={`${day.toISOString()}-${instr.instructorId}`} className={cn("flex flex-col items-center gap-0.5 py-1.5 border-l", idx === 0 ? "border-[#dddddd]" : "border-[#f0f0f0]")}>
                        <div className={cn("flex size-5 items-center justify-center rounded-full text-[8px] font-bold", tint.avatarClass)} style={tint.avatarStyle}>{initials}</div>
                        <span className="text-[9px] font-medium text-muted-foreground truncate max-w-full px-0.5">{instr.instructorName.split(" ")[0]}</span>
                      </div>
                    );
                  })
                )}
                </div>
              </div>

              {/* Exam banners row — sticky between header and body */}
              {examGroups.length > 0 && (
                <div className="overflow-hidden border-b border-violet-100 shrink-0" data-agenda-exam-wrap>
                  <div style={{ display: "grid", gridTemplateColumns: `56px repeat(${totalCols}, minmax(80px, 1fr))` }}>
                    <div />
                    {days.map((day, dayIdx) => {
                      const dateKey = formatYmd(day);
                      const dayExams = examGroups.filter((eg) => formatYmd(toDate(eg.startsAt)) === dateKey);
                      return (
                        <div
                          key={`exam-banner-${dateKey}`}
                          className="border-l border-border/40"
                          style={{ gridColumn: `${2 + dayIdx * instrCount} / span ${instrCount}` }}
                        >
                          {dayExams.length > 0 ? (
                            <div className="flex flex-wrap gap-0.5 px-1 py-0.5">
                              {dayExams.map((eg) => {
                                const egStart = toDate(eg.startsAt);
                                const examHasTime = Boolean(eg.endsAt);
                                const egEnd = eg.endsAt ? toDate(eg.endsAt) : new Date(egStart.getTime() + 3600000);
                                return (
                                  <button
                                    key={`exam-hdr-${eg.key}`}
                                    type="button"
                                    onClick={() => { setExamPanelGroup(eg); setExamPanelStudentSearch(""); }}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[9px] font-semibold text-violet-700 hover:bg-violet-100 transition-colors cursor-pointer"
                                  >
                                    <GraduationCap className="size-3 shrink-0" />
                                    <span>Esame {examHasTime ? formatTimeRange(egStart, egEnd) : "· orario da definire"}</span>
                                    <span className="text-violet-500">· {eg.appointments.length} all.</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Scrollable body — syncs horizontal scroll with header + exam row */}
              <div className="overflow-auto flex-1" ref={calendarScrollRef} onScroll={(e) => {
                const parent = e.currentTarget.parentElement;
                const headerWrap = parent?.querySelector<HTMLElement>("[data-agenda-header-wrap]");
                const examWrap = parent?.querySelector<HTMLElement>("[data-agenda-exam-wrap]");
                if (headerWrap) headerWrap.scrollLeft = e.currentTarget.scrollLeft;
                if (examWrap) examWrap.scrollLeft = e.currentTarget.scrollLeft;
              }}>

              {/* Calendar body */}
              <div style={{ display: "grid", gridTemplateColumns: `56px repeat(${totalCols}, minmax(80px, 1fr))` }}>
                {/* Time gutter — sticky left */}
                <div className="sticky left-0 z-20 relative border-r border-[#eeeeee] bg-[#fafafa]" style={{ height: calendarHeight }}>
                  {hourMarks.map((hour) => (
                    <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE }}>
                      <span className="w-full pr-2 text-right text-[11px] leading-none text-[#aaaaaa]">{`${pad(hour)}:00`}</span>
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
                    const tint = tintFor(instr.instructorId, instrIdx);
                    const ranges = instr.days[dateKey] ?? [];
                    const instrAppts = dayAppts.filter((a) => a.instructor?.id === instr.instructorId);

                    return (
                      <div
                        key={`${day.toISOString()}-${instr.instructorId}`}
                        className={cn("relative cursor-pointer overflow-hidden border-l", instrIdx === 0 ? "border-gray-400" : "border-border/30", isColumnHoliday ? "bg-red-50/40" : isDayToday ? "bg-yellow-50/20" : "")}
                        style={{ height: calendarHeight }}
                        onClick={(event) => openSlotMenu(event, day, instr.instructorId)}
                      >
                        {renderSlotGhost(day, instr.instructorId)}
                        {isColumnHoliday && (
                          <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(239,68,68,0.04) 10px, rgba(239,68,68,0.04) 20px)" }}>
                            {instrIdx === 0 && <Ban className="size-6 text-red-300/60" />}
                          </div>
                        )}
                        {/* Availability bands */}
                        {ranges.map((range, ri) => (
                          <div key={ri} className={cn("absolute left-0 right-0", tint.bandClass)} style={{ ...tint.bandStyle, top: range.startMinutes * PIXELS_PER_MINUTE, height: (range.endMinutes - range.startMinutes) * PIXELS_PER_MINUTE }} />
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
                          const isExamInstr = item.type === "esame";
                          const isGroupLessonInstr = item.type === "group_lesson";
                          const isCompact = height <= 40;
                          const licenseTag = licenseTagFor(item);
                          const isPendingAction = pendingEventActionId === item.id;
                          const glTintInstr = groupLessonTint(item);
                          const instrCardClass = isExamInstr
                            ? "bg-[#F5F0FF] shadow-[0_5px_14px_rgba(139,92,246,0.22)]"
                            : isGroupLessonInstr
                              ? glTintInstr.card
                              : statusMeta.className;
                          return (
                            <DropdownMenu key={item.id}>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className={cn("absolute left-0.5 right-0.5 z-10 flex flex-col justify-start overflow-hidden rounded-[8px] text-[9px] leading-tight text-left", isPendingAction ? "pointer-events-none opacity-75" : "", instrCardClass)}
                                  style={{ top, height }}
                                  title={`${isExamInstr ? "🎓 ESAME · " : ""}${item.student.firstName} ${item.student.lastName} · ${formatEventType(item.type)} · ${formatTimeRange(start, end)}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className={cn("p-1", isCompact ? "p-0.5" : "")}>
                                    <div className={cn("font-bold truncate text-[10px]", isExamInstr ? "text-violet-800" : isGroupLessonInstr ? glTintInstr.name : "")}>{isExamInstr ? "🎓 " : ""}{item.student.firstName}{isGroupLessonInstr ? "" : ` ${item.student.lastName.charAt(0)}.`}</div>
                                    <div className={cn("text-[8px] truncate", isExamInstr ? "text-violet-600" : isGroupLessonInstr ? glTintInstr.time : "text-muted-foreground")}>{isExamInstr ? "Esame · " : isGroupLessonInstr ? `${glTintInstr.label} · ` : ""}{formatTimeRange(start, end)}{isCompact && licenseTag ? ` · ${licenseTag}` : ""}</div>
                                    {!isCompact && licenseTag ? (
                                      <div className={cn("text-[9px] font-semibold truncate", isExamInstr ? "text-violet-700" : "text-foreground/70")}>Patente {licenseTag}</div>
                                    ) : null}
                                  </div>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-72 rounded-lg border border-border bg-white p-3 shadow-dropdown">
                                <div className="space-y-2">
                                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Evento</div>
                                  <div className="rounded-xl border border-border bg-white p-3">
                                    <div className="text-sm font-semibold text-foreground">{item.student.firstName} {item.student.lastName}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">{formatEventType(item.type)} · {formatTimeRange(start, end)}</div>
                                    <div className="text-xs text-muted-foreground">{start.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}</div>
                                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                      <div>Istruttore: <span className="font-medium text-foreground/85">{item.instructor?.name ?? "Non assegnato"}</span></div>
                                      <VehicleDetailLines item={item} vehiclesEnabled={vehiclesEnabled} />
                                      <div>Luogo: <span className="font-medium text-foreground/85">{item.location?.name ?? "Sede dell'autoscuola"}</span></div>
                                      {item.notes?.trim() ? <div>Note: <span className="whitespace-pre-wrap font-medium text-foreground/85">{item.notes}</span></div> : null}
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                      {isGroupLessonInstr ? (
                                        <Badge variant="secondary" className={glTintInstr.detailBadge}>{glTintInstr.label === "Gruppo moto" ? "Guida di gruppo moto" : "Guida di gruppo"}</Badge>
                                      ) : (
                                        <Badge variant="secondary">{statusMeta.label}</Badge>
                                      )}
                                      {!isGroupLessonInstr && !canUpdateStatus(item) ? <span className="text-[11px] text-muted-foreground">Slot passato o chiuso</span> : null}
                                    </div>
                                  </div>
                                </div>
                                {!isGroupLessonInstr && (
                                  <div className="mt-3 grid grid-cols-2 gap-2">
                                    {!isProposalStatus(item) && <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "checked_in")}>Presente</Button>}
                                    {!isProposalStatus(item) && <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "no_show")}>Assente</Button>}
                                    <Button type="button" variant="outline" size="sm" disabled={!canCompleteStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "completed")}>Completa</Button>
                                    <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleCancel(item.id)}>Annulla</Button>
                                  </div>
                                )}
                                {canRescheduleAppointment(item) && !isGroupLessonInstr ? <Button type="button" variant="outline" size="sm" className="mt-2 w-full" disabled={isPendingAction} onClick={() => handleOpenEdit(item)}>Modifica</Button> : null}
                              {isGroupLessonInstr ? (
                                <Button type="button" size="sm" className="mt-1 w-full" disabled={isPendingAction} onClick={() => item.groupLessonId && setManageGroupLessonId(item.groupLessonId)}>Gestisci guida di gruppo</Button>
                              ) : (
                                <Button type="button" variant="ghost" size="sm" className="mt-2 w-full text-rose-700 hover:bg-rose-50 hover:text-rose-700" disabled={isPendingAction} onClick={() => handleDelete(item.id)}>Cancella</Button>
                              )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          );
                        })}
                        {/* Exam blocks for this instructor on this day */}
                        {examGroups
                          .filter((eg) => eg.instructorId === instr.instructorId && formatYmd(toDate(eg.startsAt)) === dateKey)
                          .map((eg) => {
                            const egStart = toDate(eg.startsAt);
                            const examHasTime = Boolean(eg.endsAt);
                            if (!examHasTime) {
                              return (
                                <button
                                  key={`exam-instr-${eg.key}`}
                                  type="button"
                                  className="absolute left-0.5 right-0.5 z-20 flex flex-col justify-start overflow-hidden rounded-[8px] bg-[#F5F0FF] shadow-[0_5px_14px_rgba(139,92,246,0.22)] text-[9px] leading-tight text-left cursor-pointer hover:bg-[#EDE4FF] transition-colors"
                                  style={{ top: 0 }}
                                  onClick={(e) => { e.stopPropagation(); setExamPanelGroup(eg); setExamPanelStudentSearch(""); }}
                                >
                                  <div className="px-1 py-0.5 flex items-center gap-0.5">
                                    <GraduationCap className="size-2.5 shrink-0 text-violet-600" />
                                    <span className="font-bold text-[9px] text-violet-700">Esame</span>
                                  </div>
                                </button>
                              );
                            }
                            const egEnd = toDate(eg.endsAt!);
                            const clippedStart = egStart < dayStart ? dayStart : egStart;
                            const clippedEnd = egEnd > dayEnd ? dayEnd : egEnd;
                            const offsetMin = Math.max(0, diffMinutes(clippedStart, dayStart));
                            const durMin = Math.max(15, diffMinutes(clippedEnd, clippedStart));
                            const top = offsetMin * PIXELS_PER_MINUTE;
                            const height = durMin * PIXELS_PER_MINUTE;
                            return (
                              <button
                                key={`exam-instr-${eg.key}`}
                                type="button"
                                className="absolute left-0.5 right-0.5 z-10 flex flex-col justify-start overflow-hidden rounded-[8px] bg-[#F5F0FF] shadow-[0_5px_14px_rgba(139,92,246,0.22)] text-[9px] leading-tight text-left cursor-pointer hover:bg-[#EDE4FF] transition-colors"
                                style={{ top, height }}
                                onClick={(e) => { e.stopPropagation(); setExamPanelGroup(eg); setExamPanelStudentSearch(""); }}
                              >
                                <div className="p-1">
                                  <div className="font-bold text-[10px] text-violet-700 flex items-center gap-0.5">
                                    <GraduationCap className="size-2.5 shrink-0" /> Esame
                                  </div>
                                  <div className="text-[8px] text-violet-500 truncate">{eg.appointments.length} all. · {formatTimeRange(egStart, egEnd)}</div>
                                </div>
                              </button>
                            );
                          })}
                        {/* Instructor blocks for this instructor on this day */}
                        {instructorBlocks
                          .filter((b) => b.instructorId === instr.instructorId && (() => {
                            const bStart = toDate(b.startsAt);
                            return bStart >= dayStart && bStart < dayEnd;
                          })())
                          .map((b) => {
                            const bStart = toDate(b.startsAt);
                            const bEnd = toDate(b.endsAt);
                            const clippedStart = bStart < dayStart ? dayStart : bStart;
                            const clippedEnd = bEnd > dayEnd ? dayEnd : bEnd;
                            const offsetMin = Math.max(0, diffMinutes(clippedStart, dayStart));
                            const durMin = Math.max(15, diffMinutes(clippedEnd, clippedStart));
                            const top = offsetMin * PIXELS_PER_MINUTE;
                            const height = durMin * PIXELS_PER_MINUTE;
                            return (
                              <DropdownMenu key={`block-${b.id}`}>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="absolute left-0.5 right-0.5 z-[8] flex flex-col justify-start overflow-hidden rounded-[8px] bg-[#F3F4F8] text-[9px] leading-tight text-left hover:bg-[#E7E9F1] transition-colors"
                                    style={{ top, height }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="p-1">
                                      <div className="font-semibold truncate text-[10px] text-slate-600">{b.reason || "Blocco"}</div>
                                      <div className="text-[8px] truncate text-slate-400">{formatTimeRange(bStart, bEnd)}</div>
                                    </div>
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-56 rounded-lg border border-border bg-white p-3 shadow-dropdown">
                                  <div className="space-y-2">
                                    <div className="text-xs font-semibold text-foreground">{b.reason || "Blocco"}</div>
                                    <div className="text-xs text-muted-foreground">{instr.instructorName}</div>
                                    <div className="text-xs text-muted-foreground">{formatTimeRange(bStart, bEnd)}</div>
                                  </div>
                                  <Button type="button" variant="ghost" size="sm" className="mt-2 w-full text-red-600 hover:bg-red-50 hover:text-red-700" disabled={blockDeleting === b.id}
                                    onClick={async () => {
                                      if (b.recurrenceGroupId) {
                                        setBlockDeleteConfirm({ id: b.id, recurrenceGroupId: b.recurrenceGroupId });
                                      } else {
                                        setBlockDeleting(b.id);
                                        const res = await deleteInstructorBlock(b.id);
                                        setBlockDeleting(null);
                                        if (!res.success) { toast.error({ description: res.message ?? "Errore." }); return; }
                                        setInstructorBlocks((prev) => prev.filter((x) => x.id !== b.id));
                                        toast.success({ description: "Evento eliminato." });
                                      }
                                    }}
                                  >{blockDeleting === b.id ? "Elimino..." : "Elimina evento"}</Button>
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
          </div>
          );
        })()}

        {/* ── INSTRUCTOR DAY VIEW ── */}
        {agendaMode === "instructor" && viewMode === "day" && (
        <div className={cn("relative transition-opacity duration-200", refreshing && "opacity-60")} style={{ height: "calc(100vh - 240px)", minHeight: 400 }}>
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
          <div
            ref={calendarScrollRef}
            className="overflow-y-auto rounded-[14px] border border-[#dddddd] bg-white"
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
                const tint = tintFor(instr.id, idx);
                const initials = instr.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);
                return (
                  <div
                    key={instr.id}
                    className="flex h-16 flex-col items-center justify-center gap-1 border-l border-[#eeeeee]"
                  >
                    <div className={cn("flex size-8 items-center justify-center rounded-full text-[11px] font-bold", tint.avatarClass)} style={tint.avatarStyle}>
                      {initials}
                    </div>
                    <span className="max-w-[90%] truncate text-[12px] font-medium text-[#444444]">{instr.name}</span>
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
            <div className="relative border-r border-[#eeeeee] bg-[#fafafa]" style={{ height: calendarHeight }}>
              {hourMarks.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 flex items-start"
                  style={{ top: (hour - DAY_START_HOUR) * 60 * PIXELS_PER_MINUTE }}
                >
                  <span className="w-full pr-2 text-right text-[11px] leading-none text-[#aaaaaa]">
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
                const tint = tintFor(instr.id, instrIdx);
                // Filter appointments for this instructor
                const instrAppointments = allDayAppointments.filter(
                  (a) => a.instructor?.id === instr.id,
                );

                return (
                  <div
                    key={instr.id}
                    className="relative cursor-pointer border-l border-[#eeeeee] bg-white"
                    style={{ height: calendarHeight }}
                    onClick={(event) => openSlotMenu(event, day, instr.id)}
                  >
                    {renderSlotGhost(day, instr.id)}
                    {/* Availability bands */}
                    {instr.ranges.map((range, ri) => {
                      const top = range.startMinutes * PIXELS_PER_MINUTE;
                      const height = (range.endMinutes - range.startMinutes) * PIXELS_PER_MINUTE;
                      return (
                        <div
                          key={ri}
                          className={cn("absolute left-0 right-0", tint.bandClass)}
                          style={{ ...tint.bandStyle, top, height }}
                        />
                      );
                    })}
                    {/* Hour grid lines */}
                    {hourMarks.map((hour) => (
                      <div
                        key={hour}
                        className="absolute left-0 right-0 h-px bg-[#f5f5f5]"
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
                      const isExamDay = item.type === "esame";
                      const isGroupLessonDay = item.type === "group_lesson";
                      const isCompact = height <= 56;
                      const licenseTag = licenseTagFor(item);
                      const isPendingAction = pendingEventActionId === item.id;
                      const glTintDay = groupLessonTint(item);
                      const dayCardClass = isExamDay
                        ? "bg-[#F5F0FF] shadow-[0_5px_14px_rgba(139,92,246,0.22)]"
                        : isGroupLessonDay
                          ? glTintDay.card
                          : statusMeta.className;

                      return (
                        <DropdownMenu key={item.id}>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "absolute left-1 right-1 z-10 box-border flex flex-col overflow-hidden rounded-[10px] text-left text-[11px] transition motion-safe:hover:-translate-y-0.5",
                                isCompact ? "gap-0.5 p-1.5" : "gap-1 p-2",
                                isPendingAction ? "pointer-events-none opacity-75" : "",
                                dayCardClass,
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
                                    <div className={cn("min-w-0 truncate whitespace-nowrap font-semibold leading-tight", isExamDay ? "text-violet-800" : isGroupLessonDay ? glTintDay.name : "text-foreground", isCompact ? "text-[10px]" : "text-[11px]")}>
                                      {isExamDay && !isCompact ? "🎓 " : ""}{item.student.firstName} {item.student.lastName}
                                    </div>
                                    <Badge
                                      variant="secondary"
                                      className={cn("shrink-0 font-medium", isExamDay ? "border-violet-200 bg-violet-200/60 text-violet-700" : isGroupLessonDay ? glTintDay.badge : "border-border bg-white text-foreground/80", isCompact ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]")}
                                    >
                                      {isExamDay ? "Esame" : isGroupLessonDay ? glTintDay.label : statusMeta.shortLabel}
                                    </Badge>
                                  </div>
                                  <div className={cn("truncate whitespace-nowrap text-[11px]", isExamDay ? "text-violet-600" : isGroupLessonDay ? glTintDay.time : "text-muted-foreground")}>
                                    {formatTimeRange(start, end)}
                                    {!isCompact ? ` · ${Math.round(diffMinutes(end, start))}m` : ""}
                                    {!isExamDay && !isGroupLessonDay ? ` · ${item.type}` : ""}
                                    {isCompact && licenseTag ? ` · ${licenseTag}` : ""}
                                  </div>
                                  {!isCompact && licenseTag ? (
                                    <div className={cn("truncate whitespace-nowrap text-[10px] font-semibold", isExamDay ? "text-violet-700" : "text-foreground/70")}>
                                      Patente {licenseTag}
                                    </div>
                                  ) : null}
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
                                <div className="mt-1 text-xs text-muted-foreground">{formatEventType(item.type)} · {formatTimeRange(start, end)}</div>
                                <div className="text-xs text-muted-foreground">{start.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}</div>
                                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                  <div>Istruttore: <span className="font-medium text-foreground/85">{item.instructor?.name ?? "Non assegnato"}</span></div>
                                  <VehicleDetailLines item={item} vehiclesEnabled={vehiclesEnabled} />
                                  <div>Luogo: <span className="font-medium text-foreground/85">{item.location?.name ?? "Sede dell'autoscuola"}</span></div>
                                  {item.notes?.trim() ? <div>Note: <span className="whitespace-pre-wrap font-medium text-foreground/85">{item.notes}</span></div> : null}
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                  {isGroupLessonDay ? (
                                    <Badge variant="secondary" className={glTintDay.detailBadge}>{glTintDay.label === "Gruppo moto" ? "Guida di gruppo moto" : "Guida di gruppo"}</Badge>
                                  ) : (
                                    <Badge variant="secondary">{statusMeta.label}</Badge>
                                  )}
                                  {!isGroupLessonDay && !canUpdateStatus(item) ? <span className="text-[11px] text-muted-foreground">Slot passato o chiuso</span> : null}
                                </div>
                              </div>
                            </div>
                            {!isGroupLessonDay && (
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                {!isProposalStatus(item) && <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "checked_in")}>Presente</Button>}
                                {!isProposalStatus(item) && <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "no_show")}>Assente</Button>}
                                <Button type="button" variant="outline" size="sm" disabled={!canCompleteStatus(item) || isPendingAction} onClick={() => handleStatusUpdate(item.id, "completed")}>Completa</Button>
                                <Button type="button" variant="outline" size="sm" disabled={!canUpdateStatus(item) || isPendingAction} onClick={() => handleCancel(item.id)}>Annulla</Button>
                              </div>
                            )}
                            {canRescheduleAppointment(item) && !isGroupLessonDay ? <Button type="button" variant="outline" size="sm" className="mt-2 w-full" disabled={isPendingAction} onClick={() => handleOpenEdit(item)}>Modifica</Button> : null}
                              {isGroupLessonDay ? (
                                <Button type="button" size="sm" className="mt-1 w-full" disabled={isPendingAction} onClick={() => item.groupLessonId && setManageGroupLessonId(item.groupLessonId)}>Gestisci guida di gruppo</Button>
                              ) : (
                                <Button type="button" variant="ghost" size="sm" className="mt-2 w-full text-rose-700 hover:bg-rose-50 hover:text-rose-700" disabled={isPendingAction} onClick={() => handleDelete(item.id)}>Cancella</Button>
                              )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })}
                    {/* Instructor blocks for this instructor on this day */}
                    {instructorBlocks
                      .filter((b) => b.instructorId === instr.id && (() => {
                        const bStart = toDate(b.startsAt);
                        return bStart >= dayStart && bStart < dayEnd;
                      })())
                      .map((b) => {
                        const bStart = toDate(b.startsAt);
                        const bEnd = toDate(b.endsAt);
                        const clippedStart = bStart < dayStart ? dayStart : bStart;
                        const clippedEnd = bEnd > dayEnd ? dayEnd : bEnd;
                        const offsetMin = Math.max(0, diffMinutes(clippedStart, dayStart));
                        const durMin = Math.max(15, diffMinutes(clippedEnd, clippedStart));
                        const top = offsetMin * PIXELS_PER_MINUTE;
                        const height = durMin * PIXELS_PER_MINUTE;
                        return (
                          <DropdownMenu key={`block-${b.id}`}>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="absolute left-1 right-1 z-[8] flex flex-col justify-start overflow-hidden rounded-[10px] bg-[#F3F4F8] p-2 text-left text-[11px] transition hover:bg-[#E7E9F1]"
                                style={{ top, height }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="truncate font-semibold text-slate-700">{b.reason || "Blocco"}</span>
                                <span className="truncate text-[10px] text-slate-500 block">{formatTimeRange(bStart, bEnd)}</span>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" side="right" sideOffset={12} className="w-56 rounded-lg border border-border bg-white p-3 shadow-dropdown">
                              <div className="space-y-2">
                                <div className="text-xs font-semibold text-foreground">{b.reason || "Blocco"}</div>
                                <div className="text-xs text-muted-foreground">{instr.name}</div>
                                <div className="text-xs text-muted-foreground">{formatTimeRange(bStart, bEnd)}</div>
                              </div>
                              <Button type="button" variant="ghost" size="sm" className="mt-2 w-full text-red-600 hover:bg-red-50 hover:text-red-700" disabled={blockDeleting === b.id}
                                onClick={async () => {
                                  if (b.recurrenceGroupId) {
                                    setBlockDeleteConfirm({ id: b.id, recurrenceGroupId: b.recurrenceGroupId });
                                  } else {
                                    setBlockDeleting(b.id);
                                    const res = await deleteInstructorBlock(b.id);
                                    setBlockDeleting(null);
                                    if (!res.success) { toast.error({ description: res.message ?? "Errore." }); return; }
                                    setInstructorBlocks((prev) => prev.filter((x) => x.id !== b.id));
                                    toast.success({ description: "Evento eliminato." });
                                  }
                                }}
                              >{blockDeleting === b.id ? "Elimino..." : "Elimina evento"}</Button>
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
        </FadeIn>)}
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
              <div className="-mx-1 max-h-72 space-y-0.5 overflow-y-auto px-1">
                {getFilterOptions(filterEditor.kind, instructors, vehicles).map((item) => {
                  const checked = filterEditor.value.includes(item.value);
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() =>
                        setFilterEditor((current) =>
                          current
                            ? {
                                ...current,
                                value: checked
                                  ? current.value.filter((v) => v !== item.value)
                                  : [...current.value, item.value],
                              }
                            : current,
                        )
                      }
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-[#f7f7f7]"
                    >
                      <span
                        className={cn(
                          "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                          checked ? "border-navy-900 bg-navy-900" : "border-[#c1c1c1] bg-white",
                        )}
                      >
                        {checked ? (
                          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                            <path d="M3 7.4l2.6 2.6L11 4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : null}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
              <DialogFooter className="items-center gap-2">
                <button
                  type="button"
                  className="mr-auto cursor-pointer text-sm font-semibold text-foreground underline underline-offset-2 hover:opacity-70"
                  onClick={() =>
                    setFilterEditor((current) => (current ? { ...current, value: [] } : current))
                  }
                >
                  Azzera
                </button>
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
                    className="space-y-3"
                  >
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Dettagli</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">Tipo di guida, istruttore, allievo e veicolo</p>
                    </div>
                    {vehiclesEnabled && (
                      <FieldGroup label="Modalità" required>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { value: "auto", label: "Auto", hint: "1 veicolo", icon: Car },
                            { value: "moto", label: "Moto", hint: "+ auto al seguito", icon: Bike },
                          ] as const).map((opt) => {
                            const active = form.bookingMode === opt.value;
                            const Icon = opt.icon;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() =>
                                  setForm((prev) => ({
                                    ...prev,
                                    bookingMode: opt.value,
                                    // Switching mode resets student + vehicle: the eligible
                                    // students differ per class (Auto=B, Moto=moto), so a
                                    // stale selection would be incompatible.
                                    studentId: "",
                                    vehicleId: "",
                                    followVehicleId: "",
                                    extraMotoVehicleIds: [],
                                  }))
                                }
                                className={cn(
                                  "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition-colors cursor-pointer",
                                  active
                                    ? "border-yellow-400 bg-yellow-50"
                                    : "border-border/60 hover:bg-gray-50",
                                )}
                              >
                                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-yellow-700" : "text-muted-foreground")} />
                                <span className="flex min-w-0 items-baseline gap-1.5">
                                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                                  <span className="truncate text-[10px] text-muted-foreground">{opt.hint}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </FieldGroup>
                    )}
                    <FieldGroup label="Tipo guida" required>
                      <div className="flex flex-wrap gap-1.5">
                        {LESSON_TYPE_OPTIONS.map((option) => {
                          const active = form.types.includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setForm((prev) => {
                                  const next = active
                                    ? prev.types.filter((t) => t !== option.value)
                                    : [...prev.types, option.value];
                                  const types = next.length ? next : [option.value];
                                  return { ...prev, types, type: types[0] };
                                })
                              }
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                active
                                  ? "border-yellow-400 bg-yellow-50 text-yellow-700"
                                  : "border-border bg-gray-50 text-muted-foreground hover:bg-gray-100",
                              )}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </FieldGroup>
                    <FieldGroup label="Allievo" required>
                      <StudentSearchSelect
                        students={
                          vehiclesEnabled
                            ? students.filter((s) =>
                                // Hide students of the wrong class for the mode.
                                // Students without a set license stay visible.
                                !s.licenseCategory
                                  ? true
                                  : form.bookingMode === "moto"
                                    ? isMotoLicenseCategory(s.licenseCategory)
                                    : !isMotoLicenseCategory(s.licenseCategory),
                              )
                            : students
                        }
                        value={form.studentId}
                        onChange={(id) => setForm((prev) => ({ ...prev, studentId: id, vehicleId: "", followVehicleId: "", extraMotoVehicleIds: [] }))}
                      />
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
                      {vehiclesEnabled && (
                        <FieldGroup label={form.bookingMode === "moto" ? "Moto" : "Veicolo"} required>
                          <Select
                            value={form.vehicleId}
                            onValueChange={(value) => setForm((prev) => ({ ...prev, vehicleId: value }))}
                          >
                            <SelectTrigger><SelectValue placeholder={form.bookingMode === "moto" ? "Moto" : "Veicolo"} /></SelectTrigger>
                            <SelectContent>
                              {vehicles
                                .filter((vehicle) =>
                                  form.bookingMode === "moto"
                                    ? isMotoLicenseCategory(vehicle.licenseCategory)
                                    : !isMotoLicenseCategory(vehicle.licenseCategory),
                                )
                                .filter((vehicle) => {
                                  // Only vehicles the selected student is eligible for
                                  // (moto hierarchy). No student yet → show all of the mode.
                                  const st = students.find((s) => s.id === form.studentId);
                                  return st ? vehicleServesLicense(vehicle, st) : true;
                                })
                                .map((vehicle) => {
                                const assignedTo = vehicle.assignedInstructorId
                                  ? instructors.find((i) => i.id === vehicle.assignedInstructorId)?.name
                                  : null;
                                const licenseLabel = vehicle.licenseCategory
                                  ? `${vehicle.licenseCategory} · ${
                                      TRANSMISSION_LABELS[
                                        vehicle.transmission as Transmission
                                      ] ?? vehicle.transmission
                                    }`
                                  : null;
                                return (
                                  <SelectItem key={vehicle.id} value={vehicle.id}>
                                    {vehicle.name}
                                    {licenseLabel ? (
                                      <span className="text-muted-foreground"> · {licenseLabel}</span>
                                    ) : null}
                                    {assignedTo ? (
                                      <span className="text-muted-foreground"> · {assignedTo}</span>
                                    ) : null}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </FieldGroup>
                      )}
                      {(() => {
                        const need =
                          vehiclesEnabled &&
                          form.bookingMode === "moto" &&
                          Object.values(followCarRules).some((r) => r?.enabled === true);
                        if (!need) return null;
                        const carOptions = vehicles.filter(
                          (v) => v.licenseCategory === "B" && v.id !== form.vehicleId,
                        );
                        return (
                          <FieldGroup label="Auto al seguito" required>
                            <Select
                              value={form.followVehicleId}
                              onValueChange={(value) =>
                                setForm((prev) => ({ ...prev, followVehicleId: value }))
                              }
                            >
                              <SelectTrigger><SelectValue placeholder="Auto al seguito" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Nessuna auto al seguito</SelectItem>
                                {carOptions.map((vehicle) => (
                                  <SelectItem key={vehicle.id} value={vehicle.id}>
                                    {vehicle.name}
                                    {vehicle.transmission ? (
                                      <span className="text-muted-foreground">
                                        {" · "}
                                        {TRANSMISSION_LABELS[vehicle.transmission as Transmission] ?? vehicle.transmission}
                                      </span>
                                    ) : null}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldGroup>
                        );
                      })()}
                      {(() => {
                        if (!vehiclesEnabled || form.bookingMode !== "moto") {
                          return null;
                        }
                        const extraStudent = students.find((s) => s.id === form.studentId);
                        const motoOptions = vehicles.filter(
                          (v) =>
                            isMotoLicenseCategory(v.licenseCategory) &&
                            v.id !== form.vehicleId &&
                            // Extra motos follow the same moto hierarchy as the
                            // primary: only motos the student is eligible for.
                            (extraStudent ? vehicleServesLicense(v, extraStudent) : true),
                        );
                        if (!motoOptions.length) return null;
                        const toggleExtra = (id: string) =>
                          setForm((prev) => ({
                            ...prev,
                            extraMotoVehicleIds: prev.extraMotoVehicleIds.includes(id)
                              ? prev.extraMotoVehicleIds.filter((x) => x !== id)
                              : [...prev.extraMotoVehicleIds, id],
                          }));
                        return (
                          <FieldGroup label="Moto aggiuntive">
                            <div className="flex flex-wrap gap-2">
                              {motoOptions.map((vehicle) => {
                                const active = form.extraMotoVehicleIds.includes(vehicle.id);
                                return (
                                  <button
                                    key={vehicle.id}
                                    type="button"
                                    onClick={() => toggleExtra(vehicle.id)}
                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                      active
                                        ? "border-pink-500 bg-pink-50 text-pink-700"
                                        : "border-border bg-white text-foreground hover:bg-gray-50"
                                    }`}
                                  >
                                    {vehicle.name}
                                    {vehicle.licenseCategory ? (
                                      <span className={active ? "text-pink-500" : "text-muted-foreground"}>
                                        {" · "}
                                        {vehicle.licenseCategory}
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          </FieldGroup>
                        );
                      })()}
                    </div>
                    {agendaLocations.length > 0 && (
                      <FieldGroup label="Luogo" description="Modificabile dopo la creazione.">
                        <Select
                          value={form.locationId}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, locationId: value }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Sede dell'autoscuola" /></SelectTrigger>
                          <SelectContent>
                            {agendaLocations.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id}>
                                {loc.name}
                                {loc.isDefault ? " · Sede" : loc.isPrecise ? " · Preciso" : " · Generico"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldGroup>
                    )}
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
                      <SummaryRow label="Tipo" value={form.types.map((t) => LESSON_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t).join(", ")} />
                      <SummaryRow label="Allievo" value={
                        students.find((s) => s.id === form.studentId)
                          ? `${students.find((s) => s.id === form.studentId)!.firstName} ${students.find((s) => s.id === form.studentId)!.lastName}`
                          : "—"
                      } />
                      <SummaryRow label="Istruttore" value={instructors.find((i) => i.id === form.instructorId)?.name ?? "—"} />
                      {vehiclesEnabled && <SummaryRow label="Veicolo" value={vehicles.find((v) => v.id === form.vehicleId)?.name ?? "—"} />}
                      {vehiclesEnabled && form.followVehicleId ? (
                        <SummaryRow
                          label="Auto al seguito"
                          value={
                            form.followVehicleId === "__none__"
                              ? "Nessuna"
                              : vehicles.find((v) => v.id === form.followVehicleId)?.name ?? "—"
                          }
                        />
                      ) : null}
                      {vehiclesEnabled && form.extraMotoVehicleIds.length > 0 ? (
                        <SummaryRow
                          label="Moto aggiuntive"
                          value={form.extraMotoVehicleIds
                            .map((id) => vehicles.find((v) => v.id === id)?.name ?? "—")
                            .join(", ")}
                        />
                      ) : null}
                      <SummaryRow
                        label="Luogo"
                        value={agendaLocations.find((l) => l.id === form.locationId)?.name ?? "Sede dell'autoscuola"}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="create-notes" className="text-xs font-medium text-slate-700">
                        Note
                      </label>
                      <Textarea
                        id="create-notes"
                        value={form.notes}
                        onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Note opzionali sulla guida"
                        rows={3}
                        disabled={creating}
                        className="resize-none text-sm"
                      />
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
                      : !form.studentId || !form.instructorId || (vehiclesEnabled && !form.vehicleId)
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
                    (vehiclesEnabled && !form.vehicleId)
                  }
                  onClick={handleCreate}
                >
                  {creating ? "Salvataggio..." : "Conferma"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Recurring Block Delete Confirmation ── */}
      <Dialog open={blockDeleteConfirm !== null} onOpenChange={(open) => { if (!open) setBlockDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Elimina evento ricorrente</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Questo evento fa parte di una ricorrenza. Cosa vuoi eliminare?
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={blockDeleting !== null}
              onClick={async () => {
                if (!blockDeleteConfirm) return;
                setBlockDeleting(blockDeleteConfirm.id);
                const res = await deleteInstructorBlock(blockDeleteConfirm.id);
                setBlockDeleting(null);
                if (!res.success) { toast.error({ description: res.message ?? "Errore." }); return; }
                setInstructorBlocks((prev) => prev.filter((x) => x.id !== blockDeleteConfirm.id));
                setBlockDeleteConfirm(null);
                toast.success({ description: "Singolo evento eliminato." });
              }}
            >
              Solo questo evento
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              disabled={blockDeleting !== null}
              onClick={async () => {
                if (!blockDeleteConfirm?.recurrenceGroupId) return;
                setBlockDeleting(blockDeleteConfirm.id);
                const res = await deleteInstructorBlockRecurrence(blockDeleteConfirm.recurrenceGroupId);
                setBlockDeleting(null);
                if (!res.success) { toast.error({ description: res.message ?? "Errore." }); return; }
                setInstructorBlocks((prev) => prev.filter((x) => x.recurrenceGroupId !== blockDeleteConfirm.recurrenceGroupId));
                setBlockDeleteConfirm(null);
                toast.success({ description: `${(res.data as { deleted: number }).deleted} eventi futuri eliminati.` });
              }}
            >
              Elimina tutta la ricorrenza futura
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setBlockDeleteConfirm(null)} disabled={blockDeleting !== null}>
              Annulla
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Legend Dialog ── */}
      <Dialog open={legendOpen} onOpenChange={setLegendOpen}>
        <DialogContent className="sm:max-w-[420px] p-0">
          <div className="flex items-center gap-3 border-b border-border px-6 pt-5 pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100">
              <Info className="h-4 w-4 text-gray-600" />
            </div>
            <DialogTitle className="text-sm font-semibold">Legenda colori agenda</DialogTitle>
          </div>
          <div className="px-6 py-5 space-y-5">
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Guide normali — per durata</p>
              <div className="space-y-1.5">
                {[
                  { label: "Fino a 30 minuti", className: "bg-[#E3EEFF] shadow-[0_3px_8px_rgba(59,130,246,0.35)]" },
                  { label: "31–45 minuti", className: "bg-[#EAF7CE] shadow-[0_3px_8px_rgba(132,204,22,0.35)]" },
                  { label: "46–60 minuti", className: "bg-[#FCEFC7] shadow-[0_3px_8px_rgba(245,158,11,0.35)]" },
                  { label: "61–90 minuti", className: "bg-[#F9DDF3] shadow-[0_3px_8px_rgba(217,70,239,0.35)]" },
                  { label: "Oltre 90 minuti", className: "bg-[#FBD9DD] shadow-[0_3px_8px_rgba(244,63,94,0.35)]" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className={cn("h-5 w-8 rounded-md", item.className)} />
                    <span className="text-xs text-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Per tipo &amp; stato</p>
              <div className="space-y-1.5">
                {[
                  { label: "Esame", className: "bg-[#F5F0FF] shadow-[0_3px_8px_rgba(139,92,246,0.35)]" },
                  { label: "Guida di gruppo", className: "bg-[#ECFDF5] shadow-[0_3px_8px_rgba(16,185,129,0.35)]" },
                  { label: "Gruppo moto", className: "bg-[#FFEDD5] shadow-[0_3px_8px_rgba(249,115,22,0.35)]" },
                  { label: "Evento bloccante", className: "bg-[#F3F4F8]" },
                  { label: "Annullata / Assente", className: "bg-[#F3F4F8]" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className={cn("h-5 w-8 rounded-md", item.className)} />
                    <span className="text-xs text-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground/70">
                Lo stato della guida (programmata, presente, completata…) è indicato dal badge sul blocco: il colore di sfondo racconta durata o tipo.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Exam Detail Panel ── */}
      <Dialog open={examPanelGroup !== null} onOpenChange={(open) => { if (!open) setExamPanelGroup(null); }}>
        <DialogContent className="sm:max-w-[460px] max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0">
          {examPanelGroup && (() => {
            const eg = examPanelGroup;
            const egStart = toDate(eg.startsAt);
            const examHasTime = Boolean(eg.endsAt);
            const egEnd = eg.endsAt ? toDate(eg.endsAt) : new Date(egStart.getTime() + 60 * 60 * 1000);
            return (
              <>
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-border px-6 pt-5 pb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                    <GraduationCap className="h-5 w-5 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <DialogTitle className="text-sm font-semibold">Esame</DialogTitle>
                    <p className="text-xs text-muted-foreground">
                      {egStart.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}
                      {examHasTime ? ` · ${formatTimeRange(egStart, egEnd)}` : " · Orario da definire"}
                    </p>
                  </div>
                  <Badge variant="secondary" className="border-violet-200 bg-violet-100 text-violet-700 text-xs font-bold">
                    {eg.appointments.length} {eg.appointments.length === 1 ? "allievo" : "allievi"}
                  </Badge>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                  {/* Orario */}
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Orario</p>
                    <div className="flex items-center gap-2">
                      <Select
                        value={examHasTime ? `${String(egStart.getHours()).padStart(2, "0")}:${String(egStart.getMinutes()).padStart(2, "0")}` : "__none__"}
                        onValueChange={async (v) => {
                          if (v === "__none__") {
                            // Remove time
                            setExamPanelPending(true);
                            const dateOnly = new Date(egStart);
                            dateOnly.setHours(0, 0, 0, 0);
                            const res = await updateExamTime({
                              appointmentIds: eg.appointments.map((a) => a.id),
                              startsAt: dateOnly.toISOString(),
                              endsAt: undefined,
                            });
                            setExamPanelPending(false);
                            if (!res.success) { toast.error({ description: res.message ?? "Errore." }); return; }
                            setExamPanelGroup({ ...eg, startsAt: dateOnly.toISOString(), endsAt: null });
                            load({ silent: true });
                          } else {
                            // Set time (default 1h duration)
                            setExamPanelPending(true);
                            const [h, m] = v.split(":").map(Number);
                            const newStart = new Date(egStart);
                            newStart.setHours(h, m, 0, 0);
                            const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
                            const res = await updateExamTime({
                              appointmentIds: eg.appointments.map((a) => a.id),
                              startsAt: newStart.toISOString(),
                              endsAt: newEnd.toISOString(),
                            });
                            setExamPanelPending(false);
                            if (!res.success) { toast.error({ description: res.message ?? "Errore." }); return; }
                            setExamPanelGroup({ ...eg, startsAt: newStart.toISOString(), endsAt: newEnd.toISOString() });
                            load({ silent: true });
                          }
                        }}
                      >
                        <SelectTrigger className="flex-1" disabled={examPanelPending}>
                          <SelectValue placeholder="Da definire" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Da definire</SelectItem>
                          {TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Istruttore */}
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Istruttore accompagnatore</p>
                    <div className="flex items-center gap-2">
                      <Select
                        value={eg.instructorId ?? "__none__"}
                        onValueChange={async (v) => {
                          setExamPanelPending(true);
                          const newInstrId = v === "__none__" ? null : v;
                          const res = await updateExamInstructor({
                            appointmentIds: eg.appointments.map((a) => a.id),
                            instructorId: newInstrId,
                          });
                          setExamPanelPending(false);
                          if (!res.success) { toast.error({ description: res.message ?? "Errore." }); return; }
                          const newInstr = newInstrId ? instructors.find((i) => i.id === newInstrId) ?? null : null;
                          setExamPanelGroup({ ...eg, instructorId: newInstrId, instructor: newInstr });
                          load({ silent: true });
                        }}
                      >
                        <SelectTrigger className="flex-1" disabled={examPanelPending}>
                          <SelectValue placeholder="Nessuno" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nessuno</SelectItem>
                          {instructors.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Allievi */}
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Allievi iscritti</p>
                    <div className="rounded-xl border border-border divide-y divide-border">
                      {eg.appointments.map((a) => (
                        <div key={a.id} className="flex items-center justify-between px-3.5 py-2.5">
                          <span className="text-xs font-medium text-foreground">{a.student.firstName} {a.student.lastName}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-red-500 hover:text-red-700 hover:bg-red-50"
                            disabled={examPanelPending || eg.appointments.length <= 1}
                            onClick={async () => {
                              setExamPanelPending(true);
                              const res = await removeExamStudent(a.id);
                              setExamPanelPending(false);
                              if (!res.success) { toast.error({ description: res.message ?? "Errore." }); return; }
                              const updated = { ...eg, appointments: eg.appointments.filter((x) => x.id !== a.id) };
                              setExamPanelGroup(updated);
                              load({ silent: true });
                              toast.success({ description: "Allievo rimosso dall'esame." });
                            }}
                          >
                            Rimuovi
                          </Button>
                        </div>
                      ))}
                    </div>

                    {/* Aggiungi allievo */}
                    <div className="mt-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          value={examPanelStudentSearch}
                          onChange={(e) => setExamPanelStudentSearch(e.target.value)}
                          placeholder="Aggiungi allievo..."
                          className="pl-9 h-8 text-xs"
                        />
                      </div>
                      {examPanelStudentSearch.trim().length >= 2 && (() => {
                        const q = examPanelStudentSearch.toLowerCase();
                        const existingIds = new Set(eg.appointments.map((a) => a.student.id));
                        const results = students
                          .filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q))
                          .filter((s) => !existingIds.has(s.id))
                          .slice(0, 10);
                        return results.length > 0 ? (
                          <div className="mt-1.5 max-h-[120px] overflow-y-auto rounded-lg border border-border">
                            {results.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                disabled={examPanelPending}
                                onClick={async () => {
                                  setExamPanelPending(true);
                                  const res = await addExamStudent({
                                    studentId: s.id,
                                    startsAt: eg.startsAt,
                                    endsAt: eg.endsAt ?? undefined,
                                    instructorId: eg.instructorId,
                                    notes: eg.notes ?? undefined,
                                  });
                                  setExamPanelPending(false);
                                  if (!res.success) { toast.error({ description: res.message ?? "Errore." }); return; }
                                  const newAppt: AppointmentRow = {
                                    id: (res.data as { appointmentId: string }).appointmentId,
                                    type: "esame",
                                    status: "scheduled",
                                    startsAt: eg.startsAt,
                                    endsAt: eg.endsAt,
                                    student: s,
                                    instructor: eg.instructor,
                                  };
                                  setExamPanelGroup({ ...eg, appointments: [...eg.appointments, newAppt] });
                                  setExamPanelStudentSearch("");
                                  load({ silent: true });
                                  toast.success({ description: `${s.firstName} aggiunto all'esame.` });
                                }}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs hover:bg-violet-50 text-left transition-colors border-b border-border last:border-b-0"
                              >
                                <Plus className="size-3 text-violet-500 shrink-0" />
                                <span className="font-medium">{s.firstName} {s.lastName}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">Nessun allievo trovato</p>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Note */}
                  {eg.notes && (
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Note</p>
                      <p className="text-xs text-muted-foreground">{eg.notes}</p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t border-border px-6 py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                    disabled={examPanelPending}
                    onClick={async () => {
                      setExamPanelPending(true);
                      const res = await cancelExamEvent(eg.appointments.map((a) => a.id));
                      setExamPanelPending(false);
                      if (!res.success) { toast.error({ description: res.message ?? "Errore." }); return; }
                      setExamPanelGroup(null);
                      load({ silent: true });
                      toast.success({ description: "Esame annullato." });
                    }}
                  >
                    {examPanelPending ? "Annullamento..." : "Annulla esame"}
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Exam Creation Dialog ── */}
      <Dialog open={examDialogOpen} onOpenChange={(open) => { if (!examCreating) setExamDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0">
          <div className="flex items-center gap-3 border-b border-border px-6 pt-5 pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-50">
              <GraduationCap className="h-4 w-4 text-yellow-600" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold">Nuovo esame</DialogTitle>
              <p className="text-xs text-muted-foreground">Pianifica un esame per uno o più allievi</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Data e orario */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Quando</p>
              <div className="space-y-3">
                <FieldGroup label="Giorno" required>
                  <DatePicker value={examForm.date} onChange={(v) => setExamForm((f) => ({ ...f, date: v }))} />
                </FieldGroup>
                <div
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-white/70 px-3 py-2 cursor-pointer"
                  onClick={() => setExamForm((f) => ({ ...f, timeSet: !f.timeSet }))}
                >
                  <span className="text-xs text-muted-foreground">{examForm.timeSet ? "Orario specificato" : "Orario da definire"}</span>
                  <InlineToggle checked={examForm.timeSet} size="sm" />
                </div>
                {examForm.timeSet && (
                  <div className="grid grid-cols-2 gap-3">
                    <FieldGroup label="Orario">
                      <Select value={examForm.time} onValueChange={(v) => setExamForm((f) => ({ ...f, time: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FieldGroup>
                    <FieldGroup label="Durata">
                      <Select value={examForm.duration} onValueChange={(v) => setExamForm((f) => ({ ...f, duration: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EXAM_SLOT_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o} min</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FieldGroup>
                  </div>
                )}
              </div>
            </div>

            {/* Istruttore */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Istruttore accompagnatore</p>
              <Select value={examForm.instructorId} onValueChange={(v) => setExamForm((f) => ({ ...f, instructorId: v }))}>
                <SelectTrigger><SelectValue placeholder="Nessuno (facoltativo)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessuno</SelectItem>
                  {instructors.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Allievi */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                Allievi
                {examForm.studentIds.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold text-yellow-700">
                    {examForm.studentIds.length}
                  </span>
                )}
              </p>

              {/* Selected students chips */}
              {examForm.studentIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {examForm.studentIds.map((id) => {
                    const s = students.find((st) => st.id === id);
                    if (!s) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setExamForm((f) => ({ ...f, studentIds: f.studentIds.filter((x) => x !== id) }))}
                        className="flex items-center gap-1.5 rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-[11px] font-medium text-yellow-700 transition-colors hover:bg-yellow-100 hover:border-yellow-300 cursor-pointer"
                      >
                        {s.firstName} {s.lastName}
                        <span className="text-yellow-400 hover:text-yellow-600">&times;</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={examStudentSearch}
                  onChange={(e) => setExamStudentSearch(e.target.value)}
                  placeholder="Cerca allievo per nome..."
                  className="pl-9 h-9 text-xs"
                />
              </div>

              {/* Student results — only shown when searching */}
              {examStudentSearch.trim().length >= 2 && (() => {
                const q = examStudentSearch.toLowerCase();
                const results = students
                  .filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q))
                  .filter((s) => !examForm.studentIds.includes(s.id))
                  .slice(0, 20);
                return (
                  <div className="mt-2 max-h-[160px] overflow-y-auto rounded-xl border border-border">
                    {results.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setExamForm((f) => ({ ...f, studentIds: [...f.studentIds, s.id] }));
                          setExamStudentSearch("");
                        }}
                        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-xs cursor-pointer transition-colors border-b border-border last:border-b-0 hover:bg-yellow-50/60 text-left"
                      >
                        <Plus className="size-3 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">{s.firstName} {s.lastName}</span>
                      </button>
                    ))}
                    {results.length === 0 && (
                      <p className="px-4 py-4 text-center text-xs text-muted-foreground">Nessun allievo trovato</p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Note */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Note</p>
              <Input
                value={examForm.note}
                onChange={(e) => setExamForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Es: Esame pratico patente B, sede Motorizzazione..."
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <p className="text-[11px] text-muted-foreground">
              {examForm.studentIds.length === 0
                ? "Seleziona almeno un allievo"
                : `${examForm.studentIds.length} alliev${examForm.studentIds.length === 1 ? "o" : "i"} selezionat${examForm.studentIds.length === 1 ? "o" : "i"}`}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setExamDialogOpen(false)} disabled={examCreating}>Annulla</Button>
              <Button
                type="button"
                size="sm"
                disabled={examCreating || !examForm.date || !examForm.studentIds.length}
                onClick={async () => {
                  setExamCreating(true);
                  const instrId = examForm.instructorId && examForm.instructorId !== "__none__" ? examForm.instructorId : null;
                  let startsAtIso: string;
                  let endsAtIso: string | undefined;
                  if (examForm.timeSet) {
                    const durationMs = parseInt(examForm.duration, 10) * 60 * 1000;
                    const startsAt = new Date(`${examForm.date}T${examForm.time}:00`);
                    const endsAt = new Date(startsAt.getTime() + durationMs);
                    startsAtIso = startsAt.toISOString();
                    endsAtIso = endsAt.toISOString();
                  } else {
                    startsAtIso = new Date(`${examForm.date}T00:00:00`).toISOString();
                    endsAtIso = undefined;
                  }

                  const res = await createExamEvent({
                    studentIds: examForm.studentIds,
                    startsAt: startsAtIso,
                    endsAt: endsAtIso,
                    instructorId: instrId,
                    notes: examForm.note.trim() || undefined,
                  });

                  setExamCreating(false);
                  if (res.success) {
                    const count = (res.data as { count: number }).count;
                    toast.success({
                      description: `Esame creato per ${count} alliev${count === 1 ? "o" : "i"}.`,
                    });
                    setExamDialogOpen(false);
                    load({ silent: true });
                  } else {
                    toast.error({ description: res.message ?? "Impossibile creare l'esame." });
                  }
                }}
              >
                {examCreating ? (
                  <><Loader2 className="size-3.5 animate-spin mr-1.5" />Creazione...</>
                ) : (
                  <><GraduationCap className="size-3.5 mr-1.5" />Crea esame</>
                )}
              </Button>
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
              <DatePicker value={blockForm.date} onChange={(v) => setBlockForm((f) => ({ ...f, date: v }))} />
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
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Durata</label>
                <Select value={blockForm.duration} onValueChange={(v) => setBlockForm((f) => ({ ...f, duration: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      { value: "15", label: "15 min" },
                      { value: "30", label: "30 min" },
                      { value: "45", label: "45 min" },
                      { value: "60", label: "1 ora" },
                      { value: "90", label: "1h 30m" },
                      { value: "120", label: "2 ore" },
                    ].map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Titolo (opzionale)</label>
              <Input value={blockForm.reason} onChange={(e) => setBlockForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Es: Riunione, Visita medica, Ferie..." />
            </div>
            {/* Ricorrenza */}
            <div className="space-y-2">
              <div
                className="flex items-center justify-between rounded-lg border border-border/60 bg-white/70 px-3 py-2.5 cursor-pointer"
                onClick={() => setBlockForm((f) => ({ ...f, recurring: !f.recurring }))}
              >
                <span className="text-xs font-medium">Evento ricorrente</span>
                <InlineToggle checked={blockForm.recurring} size="sm" />
              </div>
              {blockForm.recurring && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Ripeti per</span>
                  <Input
                    type="number"
                    min={2}
                    max={52}
                    value={blockForm.recurringWeeks}
                    onChange={(e) => setBlockForm((f) => ({ ...f, recurringWeeks: Math.max(2, Math.min(52, Number(e.target.value) || 2)) }))}
                    className="w-16 h-8 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">settimane</span>
                </div>
              )}
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
                const blockStart = new Date(`${blockForm.date}T${blockForm.startTime}:00`);
                const startsAt = blockStart.toISOString();
                const endsAt = new Date(blockStart.getTime() + parseInt(blockForm.duration, 10) * 60 * 1000).toISOString();
                const res = await createInstructorBlock({
                  instructorId: blockForm.instructorId,
                  startsAt,
                  endsAt,
                  reason: blockForm.reason.trim() || undefined,
                  recurring: blockForm.recurring,
                  recurringWeeks: blockForm.recurring ? blockForm.recurringWeeks : undefined,
                });
                setBlockCreating(false);
                if (!res.success) {
                  toast.error({ description: res.message ?? "Errore creazione evento." });
                  return;
                }
                setBlockDialogOpen(false);
                load({ silent: true });
                const count = (res as { count?: number }).count ?? 1;
                toast.success({ description: count > 1 ? `${count} eventi ricorrenti creati.` : "Evento creato." });
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

function canRescheduleAppointment(appointment: AppointmentRow) {
  // Gates the "Modifica" button. Past and completed guides ARE editable (the
  // titolare fixes records after the fact: vehicle, type, notes, time); only
  // cancelled ones are frozen. Field-level limits (e.g. no instructor change
  // on concluded guides) live in EditAppointmentDialog + server actions.
  const status = (appointment.status ?? "").toLowerCase();
  return status !== "cancelled";
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

// Sistema colori unificato web+mobile (Reglo-Colori-Blocchi-Guida, decisioni
// 2026-06-29): guide normali per DURATA (freddo→caldo), esami/gruppi per tipo,
// annullata/assente muted. Stile: NIENTE bordo, sfondo vivo, ombra in tinta
// (opacity .22). Gli override moto/automatico sono stati RIMOSSI; il ≤30 min è
// blu (il teal è riservato alle guide di gruppo). Lo stato vive sul badge.
function getScheduledDurationClass(appointment: AppointmentRow): string {
  const start = toDate(appointment.startsAt);
  const end = getAppointmentEnd(appointment);
  const dur = Math.round(diffMinutes(end, start));
  if (dur <= 30) return "bg-[#E3EEFF] shadow-[0_5px_14px_rgba(59,130,246,0.22)]";
  if (dur <= 45) return "bg-[#EAF7CE] shadow-[0_5px_14px_rgba(132,204,22,0.22)]";
  if (dur <= 60) return "bg-[#FCEFC7] shadow-[0_5px_14px_rgba(245,158,11,0.22)]";
  if (dur <= 90) return "bg-[#F9DDF3] shadow-[0_5px_14px_rgba(217,70,239,0.22)]";
  return "bg-[#FBD9DD] shadow-[0_5px_14px_rgba(244,63,94,0.22)]";
}

function getStatusMeta(
  status: string,
  appointment?: AppointmentRow,
  now: Date = new Date(),
) {
  const normalized = status.toLowerCase();
  const durationClass = appointment ? getScheduledDurationClass(appointment) : "border-yellow-200/70 bg-yellow-50/80";

  if (normalized === "checked_in") {
    if (appointment) {
      const start = toDate(appointment.startsAt);
      const end = getAppointmentEnd(appointment);
      if (now >= start && now < end) {
        return { label: "In corso", shortLabel: "In corso", className: durationClass };
      }
      if (now < start) {
        return { label: "Confermata", shortLabel: "Confermata", className: durationClass };
      }
    }
    return { label: "Presente", shortLabel: "Presente", className: durationClass };
  }
  if (normalized === "confirmed" || normalized === "scheduled") {
    return { label: "Programmata", shortLabel: "Programmata", className: durationClass };
  }
  if (normalized === "completed") {
    // Lo stato vive sul badge, non sullo sfondo: la completata tiene il
    // colore della durata (sistema unificato 2026-06-29).
    return { label: "Completa", shortLabel: "Completata", className: durationClass };
  }
  if (normalized === "no_show") {
    return { label: "Assente", shortLabel: "Assente", className: "bg-[#F3F4F8] text-[#8A90A6]" };
  }
  if (normalized.includes("proposal")) {
    return { label: "Proposta", shortLabel: "Proposta", className: durationClass };
  }
  if (normalized === "pending_review") {
    return { label: "Da confermare", shortLabel: "Da confermare", className: durationClass };
  }
  if (normalized === "cancelled") {
    return { label: "Annullata", shortLabel: "Annullata", className: "bg-[#F3F4F8] text-[#8A90A6] opacity-70 line-through" };
  }
  return { label: "Programmata", shortLabel: "Programmata", className: durationClass };
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
    return instructors.map((item) => ({ value: item.id, label: item.name }));
  }
  if (kind === "vehicle") {
    return vehicles.map((item) => ({ value: item.id, label: item.name }));
  }
  if (kind === "type") {
    return LESSON_TYPE_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    }));
  }
  return [
    { value: "scheduled", label: "In programma" },
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

/**
 * Intestazione colonna giorno del redesign Airbnb: DOW 10px uppercase +
 * numero in cerchio 34px (oggi = pieno scuro), festivo con sole ambra.
 */
// Blocchi-guida finti per colonna (minuti dall'inizio della finestra visibile):
// pattern deterministico che ricalca la densità reale dell'agenda.
const SKELETON_GRID_BLOCKS: Array<Array<{ start: number; duration: number }>> = [
  [{ start: 75, duration: 60 }, { start: 250, duration: 90 }],
  [{ start: 30, duration: 90 }, { start: 210, duration: 60 }, { start: 350, duration: 60 }],
  [{ start: 130, duration: 60 }, { start: 290, duration: 120 }],
  [{ start: 55, duration: 60 }, { start: 190, duration: 90 }, { start: 390, duration: 60 }],
  [{ start: 105, duration: 90 }, { start: 320, duration: 60 }],
  [{ start: 45, duration: 60 }, { start: 240, duration: 60 }],
  [{ start: 160, duration: 90 }, { start: 370, duration: 60 }],
];

/**
 * Skeleton locale della griglia agenda: header giorni + gutter orario +
 * colonne con blocchi-guida shimmer. Mostrato SOLO al primissimo caricamento
 * (i refetch tengono la griglia reale montata, solo attenuata).
 */
function AgendaGridSkeleton({ columns }: { columns: number }) {
  const hourRows = Array.from({ length: 10 }, (_, i) => i);
  const gridTemplateColumns = `56px repeat(${columns}, 1fr)`;
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-white shadow-card"
      style={{ height: "calc(100vh - 240px)", minHeight: 400 }}
    >
      {/* Day headers */}
      <div className="grid border-b border-[#eeeeee]" style={{ gridTemplateColumns }}>
        <div className="border-r border-[#eeeeee] bg-[#fafafa]" />
        {Array.from({ length: columns }).map((_, index) => (
          <div key={index} className="flex flex-col items-center gap-1.5 border-l border-[#eeeeee] py-2">
            <Skeleton className="h-2 w-7 rounded-full" />
            <Skeleton className="size-[34px] rounded-full" />
          </div>
        ))}
      </div>
      {/* Body: time gutter + columns */}
      <div className="relative grid h-full" style={{ gridTemplateColumns }}>
        <div className="relative border-r border-[#eeeeee] bg-[#fafafa]">
          {hourRows.map((row) => (
            <div
              key={row}
              className="absolute left-0 right-0 flex justify-end pr-2"
              style={{ top: row * 60 * PIXELS_PER_MINUTE + 4 }}
            >
              <Skeleton className="h-2.5 w-8 rounded-full" />
            </div>
          ))}
        </div>
        {Array.from({ length: columns }).map((_, colIndex) => (
          <div key={colIndex} className="relative border-l border-[#eeeeee] bg-white">
            {hourRows.map((row) => (
              <div
                key={row}
                className="absolute left-0 right-0 h-px bg-[#f5f5f5]"
                style={{ top: row * 60 * PIXELS_PER_MINUTE }}
              />
            ))}
            {SKELETON_GRID_BLOCKS[colIndex % SKELETON_GRID_BLOCKS.length].map((block, blockIndex) => (
              <Skeleton
                key={blockIndex}
                className="absolute left-[3px] right-[3px] rounded-[10px]"
                style={{
                  top: block.start * PIXELS_PER_MINUTE,
                  height: block.duration * PIXELS_PER_MINUTE - 2,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgendaDayHeader({
  day,
  isToday,
  isHoliday,
}: {
  day: Date;
  isToday: boolean;
  isHoliday: boolean;
}) {
  const dow = day.getDay();
  const isWeekend = dow === 0 || dow === 6;
  return (
    <div
      className={cn(
        "relative flex h-16 flex-col items-center justify-center gap-0.5 border-l border-[#eeeeee]",
        isHoliday ? "bg-[#fffcf0]" : isWeekend ? "bg-[#fafafa]" : "bg-white",
      )}
    >
      <div
        className={cn(
          "text-[10px] font-semibold uppercase tracking-[0.5px]",
          isHoliday ? "text-amber-500" : "text-[#aaaaaa]",
        )}
      >
        {day.toLocaleDateString("it-IT", { weekday: "short" })}
      </div>
      <div
        className={cn(
          "flex size-[34px] items-center justify-center rounded-full text-[17px] font-bold",
          isToday
            ? "bg-[#222222] text-white"
            : isHoliday
              ? "text-amber-600"
              : isWeekend
                ? "text-[#999999]"
                : "text-foreground",
        )}
      >
        {day.getDate()}
      </div>
      {isHoliday ? (
        <span className="absolute right-2 top-1.5 text-[9px] font-semibold uppercase tracking-[0.3px] text-amber-500">
          festivo
        </span>
      ) : null}
    </div>
  );
}

