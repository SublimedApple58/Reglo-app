"use client";

import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Plus, SlidersHorizontal, Users, Send, ChevronLeft, ChevronRight, Check, AlertTriangle, LayoutGrid, Ban, GraduationCap, Search, Info, Car, Bike, Maximize2, Minimize2, ZoomIn, ZoomOut, History, X, Trash2 } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { PageWrapper } from "@/components/Layout/PageWrapper";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedPill } from "@/components/ui/segmented-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  updateExamNotes,
  cancelExamEvent,
} from "@/lib/actions/autoscuole.actions";
import { getAutoscuolaLocations } from "@/lib/actions/autoscuola-locations.actions";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/fade-in";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { DatePickerInput } from "@/components/ui/date-picker";
import { TimePickerInput } from "@/components/ui/time-picker";
import { CreateEventPopover } from "@/components/pages/Autoscuole/dialogs/CreateEventPopover";
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
import { ExpandingSearch } from "@/components/ui/expanding-search";
import { LoadingDots } from "@/components/ui/loading-dots";
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

type StudentOption = { id: string; firstName: string; lastName: string; email?: string | null; licenseCategory?: string | null; transmission?: string | null; assignedInstructorId?: string | null; lastInstructorId?: string | null };
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
    assignedInstructorId?: string | null;
    lastInstructorId?: string | null;
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
// Chip durata rapide per gli esami; per durate fuori standard c'è il TimePicker "fine".
const EXAM_DURATION_CHIPS = [30, 45, 60, 90, 120, 180, 240];
const fmtExamDuration = (min: number) => {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
};
const examTimeToMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const examMinToTime = (min: number) => {
  const capped = Math.min(Math.max(min, 0), 1440);
  return `${String(Math.floor(capped / 60)).padStart(2, "0")}:${String(capped % 60).padStart(2, "0")}`;
};

/**
 * Imposta la durata con DUE modalità intercambiabili: chip di durata rapide
 * OPPURE l'orario di fine (TimePicker). Entrambe aggiornano `durationMin`.
 * Condiviso da esame (creazione + gestione) e blocca-slot; `chips` personalizza
 * le durate rapide per il contesto.
 */
function DurationField({
  startTime,
  durationMin,
  onDurationChange,
  chips = EXAM_DURATION_CHIPS,
}: {
  startTime: string;
  durationMin: number;
  onDurationChange: (min: number) => void;
  chips?: number[];
}) {
  const startMin = examTimeToMin(startTime);
  const endTime = examMinToTime(startMin + durationMin);
  // Durata "custom" = impostata dal picker fine, nessuna chip corrisponde.
  const customDuration = !chips.includes(durationMin);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[13px] font-semibold text-[#6a6a6a]">Durata</div>
      {/* Una riga sola: chip durata + divisore + picker "fine", stessa cornice →
          i due modi di impostare la fine collaborano in un unico controllo compatto. */}
      <div className="flex items-center gap-1 rounded-[12px] border-[1.5px] border-[#e6e6e8] p-1">
        {chips.map((m) => {
          const active = durationMin === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onDurationChange(m)}
              className={cn(
                "min-w-0 flex-1 cursor-pointer rounded-[8px] py-[7px] text-[12.5px] font-semibold transition-colors",
                active
                  ? "bg-[#222222] text-white"
                  : "text-[#8a8a8f] hover:bg-[#f5f5f5] hover:text-[#222222]",
              )}
            >
              {fmtExamDuration(m)}
            </button>
          );
        })}
        <div className="mx-0.5 h-5 w-px shrink-0 bg-[#e6e6e8]" />
        <TimePickerInput
          value={endTime}
          minTime={examMinToTime(Math.min(startMin + 15, 1440))}
          maxTime="24:00"
          minuteStep={15}
          className={cn(
            "shrink-0 gap-1.5 border-0 px-2 py-[7px] text-[12.5px] font-semibold hover:bg-[#f5f5f5]",
            customDuration ? "bg-[#f2f2f4]" : "bg-transparent",
          )}
          onChange={(t) => {
            const d = examTimeToMin(t) - startMin;
            if (d > 0) onDurationChange(d);
          }}
        />
      </div>
    </div>
  );
}
const BASE_PIXELS_PER_MINUTE = 1.6;
// Scala base della griglia (px per minuto). In fullscreen il componente ombreggia
// questa costante con un fattore di zoom; qui resta la base usata dallo skeleton.
const PIXELS_PER_MINUTE = BASE_PIXELS_PER_MINUTE;
// Preferenze di visualizzazione agenda (giorni + fascia oraria) persistite in
// localStorage, indipendenti dai filtri dati. Si resettano solo con "Ripristina".
// `totalMinutes` è ridefinito nel componente (dipende dalla fascia oraria scelta);
// DAY_START_HOUR/DAY_END_HOUR restano 0/24 qui per gli orari prenotabili completi.
const AGENDA_VIEW_PREFS_KEY = "reglo-agenda-view-prefs";
type AgendaViewPrefs = { days: number[]; startHour: number; endHour: number };
// days = giorni della settimana visibili, convenzione getDay() (0 = domenica).
const DEFAULT_VIEW_PREFS: AgendaViewPrefs = { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 24 };
const WEEKDAY_CHIPS: Array<{ dow: number; label: string }> = [
  { dow: 1, label: "Lun" }, { dow: 2, label: "Mar" }, { dow: 3, label: "Mer" },
  { dow: 4, label: "Gio" }, { dow: 5, label: "Ven" }, { dow: 6, label: "Sab" }, { dow: 0, label: "Dom" },
];
const hourToTime = (h: number) => `${pad(h)}:00`;
const timeToHour = (t: string) => Number.parseInt(t.split(":")[0] ?? "0", 10);
function readAgendaViewPrefs(): AgendaViewPrefs {
  if (typeof window === "undefined") return DEFAULT_VIEW_PREFS;
  try {
    const raw = window.localStorage.getItem(AGENDA_VIEW_PREFS_KEY);
    if (!raw) return DEFAULT_VIEW_PREFS;
    const p = JSON.parse(raw) as Partial<AgendaViewPrefs>;
    const days = Array.isArray(p.days)
      ? p.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : DEFAULT_VIEW_PREFS.days;
    const startHour =
      Number.isInteger(p.startHour) && (p.startHour as number) >= 0 && (p.startHour as number) <= 23
        ? (p.startHour as number)
        : DEFAULT_VIEW_PREFS.startHour;
    let endHour =
      Number.isInteger(p.endHour) && (p.endHour as number) >= 1 && (p.endHour as number) <= 24
        ? (p.endHour as number)
        : DEFAULT_VIEW_PREFS.endHour;
    if (endHour <= startHour) endHour = DEFAULT_VIEW_PREFS.endHour;
    return { days: days.length ? days : DEFAULT_VIEW_PREFS.days, startHour, endHour };
  } catch {
    return DEFAULT_VIEW_PREFS;
  }
}

// Persistenza dei filtri agenda in localStorage: restano applicati tra refresh e
// uscita/rientro nella sezione, si azzerano solo esplicitamente ("Rimuovi filtri").
const AGENDA_FILTERS_KEY = "reglo-agenda-filters";
type PersistedAgendaFilters = { instructor: string[]; vehicle: string[]; status: string[]; type: string[] };
function readAgendaFilters(): PersistedAgendaFilters {
  const empty: PersistedAgendaFilters = { instructor: [], vehicle: [], status: [], type: [] };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(AGENDA_FILTERS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<PersistedAgendaFilters>;
    return {
      instructor: Array.isArray(parsed.instructor) ? parsed.instructor : [],
      vehicle: Array.isArray(parsed.vehicle) ? parsed.vehicle : [],
      status: Array.isArray(parsed.status) ? parsed.status : [],
      type: Array.isArray(parsed.type) ? parsed.type : [],
    };
  } catch {
    return empty;
  }
}
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
  instructors,
  value,
  onChange,
}: {
  students: StudentOption[];
  /** Per mostrare in lista il nome dell'istruttore assegnato all'allievo. */
  instructors?: ResourceOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  // Posizione del flyout: AFFIANCATO alla card del popover (non dentro, dove
  // coprirebbe i campi successivi). A destra della card, o a sinistra se non
  // c'è spazio; allineato verticalmente all'input.
  const [panelPos, setPanelPos] = React.useState<{ left: number; top: number } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const PANEL_W = 340;
  const PANEL_MAX_H = 380;

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

  const openPanel = React.useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const card = input.closest('[role="dialog"]')?.getBoundingClientRect();
    const gap = 14;
    let left = (card ? card.right : rect.right) + gap;
    if (left + PANEL_W > window.innerWidth - 8) {
      left = (card ? card.left : rect.left) - gap - PANEL_W;
    }
    left = Math.max(8, left);
    const top = Math.max(16, Math.min(rect.top, window.innerHeight - PANEL_MAX_H - 16));
    setPanelPos({ left, top });
    setOpen(true);
  }, []);

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
          if (!open) openPanel();
        }}
        onFocus={() => {
          openPanel();
          setQuery("");
        }}
      />
      {open && panelPos &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[60] overflow-y-auto rounded-[14px] border border-[#e3e3e3] bg-white p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
            style={{ left: panelPos.left, top: panelPos.top, width: PANEL_W, maxHeight: PANEL_MAX_H }}
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Nessun risultato</div>
            ) : (
              filtered.map((s) => {
                const assignedInstructor = s.assignedInstructorId
                  ? instructors?.find((i) => i.id === s.assignedInstructorId)
                  : null;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-[9px] px-3 py-2 text-left text-sm transition-colors hover:bg-[#f7f7f7]",
                      s.id === value && "bg-[#f2f2f2]",
                    )}
                    onClick={() => {
                      onChange(s.id);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{s.firstName} {s.lastName}</span>
                      {s.email && <span className="truncate text-[11px] text-muted-foreground">{s.email}</span>}
                      {assignedInstructor && (
                        <span className="mt-px truncate text-[11px] font-medium text-[#555555]">
                          Istruttore · {assignedInstructor.name}
                        </span>
                      )}
                    </span>
                    {s.licenseCategory ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/70">
                        {s.licenseCategory}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>,
          document.body,
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
  const [plusMenuOpen, setPlusMenuOpen] = React.useState(false);
  // Filtri multi-selezione (redesign 2026-07): array vuoto = nessun filtro.
  // Applicati client-side sul bootstrap già caricato — cambiare filtro non
  // rifà la fetch.
  const [instructorFilter, setInstructorFilter] = React.useState<string[]>(() => readAgendaFilters().instructor);
  const [vehicleFilter, setVehicleFilter] = React.useState<string[]>(() => readAgendaFilters().vehicle);
  const [statusFilter, setStatusFilter] = React.useState<string[]>(() => readAgendaFilters().status);
  const [typeFilter, setTypeFilter] = React.useState<string[]>(() => readAgendaFilters().type);
  // Salva i filtri a ogni cambio: persistono tra refresh e uscita/rientro nella
  // sezione. Si azzerano solo con "Rimuovi filtri" (che scrive gli array vuoti).
  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        AGENDA_FILTERS_KEY,
        JSON.stringify({ instructor: instructorFilter, vehicle: vehicleFilter, status: statusFilter, type: typeFilter }),
      );
    } catch {
      /* localStorage non disponibile: ignora */
    }
  }, [instructorFilter, vehicleFilter, statusFilter, typeFilter]);
  // Rimuove dai filtri gli ID che non esistono più (istruttore/veicolo cancellato
  // o cambio autoscuola), così i filtri salvati non svuotano l'agenda per errore.
  React.useEffect(() => {
    if (loading) return;
    if (instructors.length > 0) {
      setInstructorFilter((prev) => {
        const valid = prev.filter((id) => instructors.some((i) => i.id === id));
        return valid.length === prev.length ? prev : valid;
      });
    }
    if (vehicles.length > 0) {
      setVehicleFilter((prev) => {
        const valid = prev.filter((id) => vehicles.some((v) => v.id === id));
        return valid.length === prev.length ? prev : valid;
      });
    }
  }, [loading, instructors, vehicles]);
  const [filterEditor, setFilterEditor] = React.useState<FilterEditorState | null>(null);
  const [viewMode, setViewMode] = React.useState<"week" | "day">("week");
  // Schermo intero: overlay `fixed inset-0` (NON la Fullscreen API del browser,
  // che metterebbe i popup Radix — portati su document.body — sotto al top-layer
  // rendendoli invisibili). z-40 copre header (z-30) e sidebar (z-10) dell'app ma
  // resta sotto a dialog/menu/popover (z-50+), che restano cliccabili. Stessa
  // identica agenda, solo a tutta viewport: il container perde il max-width così
  // le colonne si allargano.
  const [isAgendaFullscreen, setIsAgendaFullscreen] = React.useState(false);
  const toggleAgendaFullscreen = React.useCallback(() => setIsAgendaFullscreen((v) => !v), []);
  React.useEffect(() => {
    if (!isAgendaFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isAgendaFullscreen]);
  // Preferenze di visualizzazione (giorni + fascia oraria): persistite, resettabili
  // solo da "Ripristina". Ombreggiamo DAY_START_HOUR/DAY_END_HOUR/totalMinutes così
  // la griglia si "taglia" alla fascia scelta senza toccare i ~30 punti d'uso, che
  // sono già parametrizzati su queste costanti.
  const [viewPrefs, setViewPrefs] = React.useState<AgendaViewPrefs>(() => readAgendaViewPrefs());
  const [viewPrefsOpen, setViewPrefsOpen] = React.useState(false);
  React.useEffect(() => {
    try {
      window.localStorage.setItem(AGENDA_VIEW_PREFS_KEY, JSON.stringify(viewPrefs));
    } catch {
      /* localStorage non disponibile: ignora */
    }
  }, [viewPrefs]);
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const DAY_START_HOUR = viewPrefs.startHour;
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const DAY_END_HOUR = viewPrefs.endHour;
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const totalMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  // Zoom dell'agenda (attivo solo in fullscreen): scala la densità verticale così
  // i blocchi diventano più alti/leggibili. Ombreggiamo PIXELS_PER_MINUTE così
  // tutti i calcoli (posizioni, altezze, drag/click, auto-scroll) si adeguano da
  // soli. Il testo dei blocchi scala insieme via la CSS var --agenda-fs-scale.
  const [agendaZoom, setAgendaZoom] = React.useState(1.3);
  const agendaZoomFactor = isAgendaFullscreen ? agendaZoom : 1;
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const PIXELS_PER_MINUTE = BASE_PIXELS_PER_MINUTE * agendaZoomFactor;
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const calendarHeight = totalMinutes * PIXELS_PER_MINUTE;
  const agendaFrameClass = isAgendaFullscreen
    ? "agenda-grid-zoom"
    : "rounded-[14px] border border-[#dddddd]";
  const agendaFrameStyle: React.CSSProperties | undefined = isAgendaFullscreen
    ? ({ "--agenda-fs-scale": String(agendaZoomFactor) } as React.CSSProperties)
    : undefined;
  // Larghezza colonne in fullscreen: ogni colonna ha una larghezza minima comoda
  // (base 180px) che scala con lo zoom. Quando le colonne eccedono lo schermo parte
  // lo scroll orizzontale, altrimenti 1fr riempie. Così l'agenda "si apre" in
  // larghezza già di default (soprattutto nel modo istruttori, prima a 80px).
  // Fuori fullscreen fsCols() → undefined → template originale invariato.
  const fsColMin = isAgendaFullscreen ? Math.round(90 * agendaZoom) : 0;
  const fsCols = (n: number) =>
    isAgendaFullscreen ? `56px repeat(${n}, minmax(${fsColMin}px, 1fr))` : undefined;
  const [createOpen, setCreateOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  // Conferma "prenotazione nel passato" (vedi handleCreate): teniamo lo start
  // scelto per mostrarlo nell'alert prima di procedere con allowPast.
  const [pastConfirmOpen, setPastConfirmOpen] = React.useState(false);
  const [pendingPastStart, setPendingPastStart] = React.useState<Date | null>(null);
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
  // Pannello laterale "Aggiungi allievi" (stesso pattern delle guide di gruppo).
  const [examBrowseOpen, setExamBrowseOpen] = React.useState(false);
  React.useEffect(() => {
    if (!examDialogOpen) { setExamBrowseOpen(false); setExamStudentSearch(""); }
  }, [examDialogOpen]);
  const examStudentInitials = (first?: string | null, last?: string | null) =>
    `${(first ?? "").trim()[0] ?? ""}${(last ?? "").trim()[0] ?? ""}`.toUpperCase() || "?";
  const examAddableCount = React.useMemo(
    () => students.reduce((n, st) => (examForm.studentIds.includes(st.id) ? n : n + 1), 0),
    [students, examForm.studentIds],
  );
  const examBrowseList = React.useMemo(() => {
    const q = examStudentSearch.trim().toLowerCase();
    return students
      .filter((s) => !examForm.studentIds.includes(s.id))
      .filter((s) => !q || `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
  }, [students, examForm.studentIds, examStudentSearch]);
  const [examPanelGroup, setExamPanelGroup] = React.useState<ExamGroup | null>(null);
  const [examPanelStudentSearch, setExamPanelStudentSearch] = React.useState("");
  const [examPanelPending, setExamPanelPending] = React.useState(false);
  const [examPanelBrowseOpen, setExamPanelBrowseOpen] = React.useState(false);
  // Modello DRAFT: orario/istruttore/allievi/note si modificano in locale e si
  // applicano con un unico "Salva modifiche" (niente auto-save a ogni tocco).
  const [examNoteDraft, setExamNoteDraft] = React.useState("");
  const [examDraftTime, setExamDraftTime] = React.useState<string | null>(null);
  const [examDraftDurationMin, setExamDraftDurationMin] = React.useState(60);
  const [examDraftInstructorId, setExamDraftInstructorId] = React.useState<string | null>(null);
  const [examDraftStudentIds, setExamDraftStudentIds] = React.useState<string[]>([]);
  // Init i draft solo alla PRIMA apertura (non a ogni update del gruppo).
  const examPanelOpenedRef = React.useRef(false);
  React.useEffect(() => {
    if (examPanelGroup) {
      if (!examPanelOpenedRef.current) {
        const g = examPanelGroup;
        const gs = toDate(g.startsAt);
        setExamNoteDraft(g.notes ?? "");
        setExamDraftTime(g.endsAt ? `${String(gs.getHours()).padStart(2, "0")}:${String(gs.getMinutes()).padStart(2, "0")}` : null);
        setExamDraftDurationMin(g.endsAt ? Math.max(15, Math.round((toDate(g.endsAt).getTime() - gs.getTime()) / 60000)) : 60);
        setExamDraftInstructorId(g.instructorId ?? null);
        setExamDraftStudentIds(g.appointments.map((a) => a.student.id));
        examPanelOpenedRef.current = true;
      }
    } else {
      examPanelOpenedRef.current = false;
      setExamPanelBrowseOpen(false);
      setExamPanelStudentSearch("");
      setExamNoteDraft("");
      setExamDraftTime(null);
      setExamDraftDurationMin(60);
      setExamDraftInstructorId(null);
      setExamDraftStudentIds([]);
    }
  }, [examPanelGroup]);
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
  // Popover di creazione (redesign 2026-07): ancora viewport della card,
  // draft della guida di gruppo (lifted dal dialog figlio per il ghost) e
  // patch slot→gruppo quando si clicca la griglia col popover gruppo aperto.
  const [popoverAnchor, setPopoverAnchor] = React.useState<{ x: number; y: number } | null>(null);
  const plusBtnRef = React.useRef<HTMLButtonElement>(null);
  const [groupDraft, setGroupDraft] = React.useState<{ date: string; time: string; durationMin: number; instructorId: string | null; kind: "standard" | "moto"; capacity: number } | null>(null);
  const [groupSlotPatch, setGroupSlotPatch] = React.useState<{ date: string; time: string; instructorId: string | null; nonce: number } | null>(null);
  const [editDraft, setEditDraft] = React.useState<{ date: string; time: string; durationMin: number; instructorId: string | null } | null>(null);
  const [editSlotPatch, setEditSlotPatch] = React.useState<{ date: string; time: string; instructorId: string | null; nonce: number } | null>(null);
  const anchorFromPlus = React.useCallback(() => {
    const rect = plusBtnRef.current?.getBoundingClientRect();
    setPopoverAnchor(rect ? { x: rect.right, y: rect.bottom + 10 } : null);
  }, []);
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
        // Group by time AND instructor: an exam session is one accompanying
        // instructor + N students. Two exams at the same time with DIFFERENT
        // instructors must stay separate (own card on each instructor column) —
        // keying by time only merged them onto the first instructor (Macchiavello
        // bug, 2026-07-15). Exams without an instructor group under "none".
        const key = `${new Date(a.startsAt).toISOString()}|${a.endsAt ? new Date(a.endsAt).toISOString() : ""}|${a.instructor?.id ?? "none"}`;
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
  }, [loading, PIXELS_PER_MINUTE, DAY_START_HOUR]);

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
    const ymd = formatYmd(normalized);
    const time = `${pad(Math.floor(snapped / 60))}:${pad(snapped % 60)}`;
    // Con un flusso di creazione aperto, il click sulla griglia RIPOSIZIONA il
    // draft (stile Google Calendar) invece di aprire il menu slot.
    if (createOpen) {
      setForm((prev) => ({ ...prev, day: ymd, time, instructorId: instructorId ?? prev.instructorId }));
      return;
    }
    if (examDialogOpen) {
      setExamForm((prev) => ({ ...prev, date: ymd, time, timeSet: true, instructorId: instructorId ?? prev.instructorId }));
      return;
    }
    if (blockDialogOpen) {
      setBlockForm((prev) => ({ ...prev, date: ymd, startTime: time, instructorId: instructorId ?? prev.instructorId }));
      return;
    }
    if (createGroupLessonOpen) {
      setGroupSlotPatch({ date: ymd, time, instructorId: instructorId ?? null, nonce: Date.now() });
      return;
    }
    if (editAppointmentTarget) {
      setEditSlotPatch({ date: ymd, time, instructorId: instructorId ?? null, nonce: Date.now() });
      return;
    }
    setSlotMenu({
      day: normalized,
      ymd,
      time,
      instructorId: instructorId ?? null,
      colLeft: rect.left,
      colRight: rect.right,
      ghostTop: rect.top + startMin * PIXELS_PER_MINUTE,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen, examDialogOpen, blockDialogOpen, createGroupLessonOpen, editAppointmentTarget]);

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

  // Sposta il draft attivo su un nuovo slot (click su griglia o drag del ghost).
  const moveDraftTo = React.useCallback((ymd: string, time: string, instructorId: string | null) => {
    if (createOpen) {
      setForm((prev) => ({ ...prev, day: ymd, time, instructorId: instructorId ?? prev.instructorId }));
    } else if (examDialogOpen) {
      setExamForm((prev) => ({ ...prev, date: ymd, time, timeSet: true, instructorId: instructorId ?? prev.instructorId }));
    } else if (blockDialogOpen) {
      setBlockForm((prev) => ({ ...prev, date: ymd, startTime: time, instructorId: instructorId ?? prev.instructorId }));
    } else if (createGroupLessonOpen) {
      setGroupSlotPatch({ date: ymd, time, instructorId, nonce: Date.now() });
    } else if (editAppointmentTarget) {
      setEditSlotPatch({ date: ymd, time, instructorId, nonce: Date.now() });
    }
  }, [createOpen, examDialogOpen, blockDialogOpen, createGroupLessonOpen, editAppointmentTarget]);

  // Drag del ghost: verticale = orario (scatti di 15'), orizzontale = giorno /
  // colonna istruttore (hit-test su [data-agenda-col-day]).
  const ghostDragRef = React.useRef(false);
  const onGhostPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const node = event.currentTarget;
    const grabOffsetY = event.clientY - node.getBoundingClientRect().top;
    ghostDragRef.current = true;
    node.style.pointerEvents = "none";
    document.body.style.cursor = "grabbing";
    let lastKey = "";
    const onMove = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const col = el?.closest?.("[data-agenda-col-day]") as HTMLElement | null;
      if (!col) return;
      const ymd = col.dataset.agendaColDay as string;
      const instr = col.dataset.agendaColInstructor || null;
      const rect = col.getBoundingClientRect();
      const rawMinutes = (ev.clientY - grabOffsetY - rect.top) / PIXELS_PER_MINUTE;
      const snapped = Math.max(0, Math.min(totalMinutes - 15, Math.round(rawMinutes / 15) * 15)) + DAY_START_HOUR * 60;
      const time = `${pad(Math.floor(snapped / 60))}:${pad(snapped % 60)}`;
      const key = `${ymd}|${time}|${instr ?? ""}`;
      if (key === lastKey) return;
      lastKey = key;
      moveDraftTo(ymd, time, instr);
    };
    const onUp = () => {
      ghostDragRef.current = false;
      node.style.pointerEvents = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [moveDraftTo, PIXELS_PER_MINUTE, DAY_START_HOUR, totalMinutes]);

  // ── Draft ghost: anteprima live dell'evento in creazione ──
  // Derivato dal form del popover attivo; mostra in griglia il blocco che si
  // creerà, già del colore giusto (durata per le guide, viola esame, grigio
  // bloccante, verde/arancio gruppo).
  const draftGhost = React.useMemo<null | {
    ymd: string;
    startMin: number;
    durMin: number;
    instructorId: string | null;
    title: string;
    cardClass: string;
    dotClass: string;
  }>(() => {
    const parseStart = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m - DAY_START_HOUR * 60;
    };
    if (createOpen && form.day && form.time) {
      const dur = parseInt(form.duration, 10) || 30;
      const student = students.find((s) => s.id === form.studentId);
      const cardClass =
        dur <= 30 ? "bg-[#E3EEFF]/80 border-[#8fb8f2]" :
        dur <= 45 ? "bg-[#EAF7CE]/80 border-[#aecb6b]" :
        dur <= 60 ? "bg-[#FCEFC7]/80 border-[#dcb84f]" :
        dur <= 90 ? "bg-[#F9DDF3]/80 border-[#d98cc7]" :
        "bg-[#FBD9DD]/80 border-[#dd8f99]";
      const dotClass =
        dur <= 30 ? "bg-[#3b82f6]" : dur <= 45 ? "bg-[#84cc16]" : dur <= 60 ? "bg-[#f59e0b]" : dur <= 90 ? "bg-[#d946ef]" : "bg-[#f43f5e]";
      return {
        ymd: form.day,
        startMin: parseStart(form.time),
        durMin: dur,
        instructorId: form.instructorId || null,
        title: student ? `${student.firstName} ${student.lastName}` : "Nuova guida",
        cardClass,
        dotClass,
      };
    }
    if (editAppointmentTarget && editDraft?.date && editDraft.time) {
      const dur = editDraft.durationMin || 30;
      const cardClass =
        dur <= 30 ? "bg-[#E3EEFF]/80 border-[#8fb8f2]" :
        dur <= 45 ? "bg-[#EAF7CE]/80 border-[#aecb6b]" :
        dur <= 60 ? "bg-[#FCEFC7]/80 border-[#dcb84f]" :
        dur <= 90 ? "bg-[#F9DDF3]/80 border-[#d98cc7]" :
        "bg-[#FBD9DD]/80 border-[#dd8f99]";
      const dotClass =
        dur <= 30 ? "bg-[#3b82f6]" : dur <= 45 ? "bg-[#84cc16]" : dur <= 60 ? "bg-[#f59e0b]" : dur <= 90 ? "bg-[#d946ef]" : "bg-[#f43f5e]";
      const who = `${editAppointmentTarget.student?.firstName ?? ""} ${editAppointmentTarget.student?.lastName ?? ""}`.trim();
      return {
        ymd: editDraft.date,
        startMin: parseStart(editDraft.time),
        durMin: dur,
        instructorId: editDraft.instructorId,
        title: who || "Guida",
        cardClass,
        dotClass,
      };
    }
    if (examDialogOpen && examForm.date && examForm.timeSet && examForm.time) {
      return {
        ymd: examForm.date,
        startMin: parseStart(examForm.time),
        durMin: parseInt(examForm.duration, 10) || 60,
        instructorId: examForm.instructorId && examForm.instructorId !== "__none__" ? examForm.instructorId : null,
        title: examForm.studentIds.length > 1 ? `Esame · ${examForm.studentIds.length} allievi` : "Esame",
        cardClass: "bg-[#F5F0FF]/80 border-[#b39ddb]",
        dotClass: "bg-[#8b5cf6]",
      };
    }
    if (blockDialogOpen && blockForm.date && blockForm.startTime) {
      return {
        ymd: blockForm.date,
        startMin: parseStart(blockForm.startTime),
        durMin: parseInt(blockForm.duration, 10) || 60,
        instructorId: blockForm.instructorId || null,
        title: blockForm.reason.trim() || "Evento bloccante",
        cardClass: "bg-[#F3F4F8]/85 border-[#b8bcc8]",
        dotClass: "bg-[#9ca3af]",
      };
    }
    if (createGroupLessonOpen && groupDraft?.date && groupDraft.time) {
      const moto = groupDraft.kind === "moto";
      return {
        ymd: groupDraft.date,
        startMin: parseStart(groupDraft.time),
        durMin: groupDraft.durationMin,
        instructorId: groupDraft.instructorId,
        title: `Guida di gruppo · ${groupDraft.capacity} posti`,
        cardClass: moto ? "bg-[#FFEDD5]/80 border-[#e8a75e]" : "bg-[#ECFDF5]/80 border-[#6fc9a3]",
        dotClass: moto ? "bg-[#f97316]" : "bg-[#10b981]",
      };
    }
    return null;
  }, [createOpen, form.day, form.time, form.duration, form.studentId, form.instructorId, students, examDialogOpen, examForm, blockDialogOpen, blockForm, createGroupLessonOpen, groupDraft, editAppointmentTarget, editDraft, DAY_START_HOUR]);

  // L'agenda segue il draft: se il giorno esce dal range visibile naviga da
  // sola, e scrolla verticalmente fino all'orario del ghost.
  React.useEffect(() => {
    if (!draftGhost || ghostDragRef.current) return;
    const target = toDate(`${draftGhost.ymd}T00:00:00`);
    const normalized = normalizeDay(target);
    if (viewMode === "week") {
      const ws = startOfWeek(normalized);
      if (ws.getTime() !== weekStart.getTime()) setWeekStart(ws);
    } else if (normalized.getTime() !== dayFocus.getTime()) {
      setDayFocus(normalized);
    }
    const scroller = calendarScrollRef.current;
    if (scroller) {
      const top = Math.max(0, draftGhost.startMin * PIXELS_PER_MINUTE - 140);
      scroller.scrollTo({ top, behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftGhost?.ymd, draftGhost?.startMin]);

  // Ghost del draft nella colonna giusta. instructorId=null (vista classica)
  // → matcha solo il giorno; nelle viste istruttori matcha la colonna, e se
  // l'istruttore non è ancora scelto appare tratteggiato in tutte (opaco).
  const renderDraftGhost = (day: Date, instructorId: string | null) => {
    if (!draftGhost || draftGhost.ymd !== formatYmd(day)) return null;
    const unassigned = instructorId !== null && draftGhost.instructorId === null;
    if (instructorId !== null && draftGhost.instructorId !== null && draftGhost.instructorId !== instructorId) return null;
    const startMin = Math.max(0, draftGhost.startMin);
    const durMin = Math.min(draftGhost.durMin, totalMinutes - startMin);
    const endTotal = startMin + DAY_START_HOUR * 60 + durMin;
    const startLabel = `${pad(Math.floor((startMin + DAY_START_HOUR * 60) / 60))}:${pad((startMin + DAY_START_HOUR * 60) % 60)}`;
    const endLabel = `${pad(Math.floor(endTotal / 60) % 24)}:${pad(endTotal % 60)}`;
    const height = Math.max(26, durMin * PIXELS_PER_MINUTE - 2);
    const small = height < 40;
    return (
      <motion.div
        key={`draft-ghost-${draftGhost.ymd}-${instructorId ?? "day"}`}
        layout
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: unassigned ? 0.45 : 1, scale: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={cn(
          "absolute left-1 right-1 z-30 cursor-grab touch-none select-none overflow-hidden rounded-lg border-[1.5px] border-dashed px-2 py-1 shadow-[0_6px_22px_rgba(16,24,40,0.16)] active:cursor-grabbing",
          draftGhost.cardClass,
        )}
        style={{ top: startMin * PIXELS_PER_MINUTE, height }}
        onPointerDown={onGhostPointerDown}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[#222222]">
          <span className={cn("size-1.5 shrink-0 rounded-full", draftGhost.dotClass)} />
          {startLabel} – {endLabel}
        </div>
        {!small && (
          <div className="mt-0.5 truncate text-[10.5px] font-medium text-[#555555]">{draftGhost.title}</div>
        )}
      </motion.div>
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

  // Auto-avanzamento del form di creazione: quando un campo obbligatorio viene
  // compilato, scrolla al prossimo ancora vuoto (allievo → istruttore →
  // veicolo) e gli dà il focus. Le note sono facoltative e vengono saltate.
  const createStudentRef = React.useRef<HTMLDivElement>(null);
  const createInstructorRef = React.useRef<HTMLDivElement>(null);
  const createVehicleRef = React.useRef<HTMLDivElement>(null);
  const advanceCreateFocus = (patch: { studentId?: string; instructorId?: string; vehicleId?: string }) => {
    const next = {
      studentId: form.studentId,
      instructorId: form.instructorId,
      vehicleId: form.vehicleId,
      ...patch,
    };
    const target = !next.studentId
      ? createStudentRef.current
      : !next.instructorId
        ? createInstructorRef.current
        : vehiclesEnabled && !next.vehicleId
          ? createVehicleRef.current
          : null;
    if (!target) return;
    // Il delay lascia chiudere il popover della select appena usata (Radix
    // riporta il focus sul proprio trigger alla chiusura: dobbiamo passare dopo).
    window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
    }, 160);
  };

  const handleCreate = async (opts?: { allowPast?: boolean }) => {
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
    // Prenotazione nel passato: non blocchiamo più a priori. Chiediamo conferma
    // esplicita e, se l'utente procede, ripassiamo con allowPast → il BE la crea.
    if (!opts?.allowPast && startDate.getTime() < Date.now()) {
      setPendingPastStart(startDate);
      setPastConfirmOpen(true);
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
      ...(opts?.allowPast ? { allowPast: true } : {}),
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
    // Chiude il menu EVENTO del blocco (Radix, non si chiude da solo aprendo
    // un popover non-modale) prima di mostrare la card di modifica.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    setEditAppointmentTarget({
      id: item.id,
      startsAt: item.startsAt,
      endsAt: item.endsAt ?? null,
      status: item.status,
      type: item.type ?? null,
      types: item.types ?? null,
      rating: item.rating ?? null,
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

  const allWeekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const visibleWeekDays = allWeekDays.filter((d) => viewPrefs.days.includes(d.getDay()));
  const days = visibleWeekDays.length ? visibleWeekDays : allWeekDays;
  const visibleDays = viewMode === "week" ? days : [dayFocus];
  // In fullscreen sopra la griglia resta solo la toolbar (niente header app né
  // titolo), quindi recuperiamo lo spazio verticale liberato.
  const agendaGridHeight = isAgendaFullscreen ? "calc(100vh - 132px)" : "calc(100vh - 240px)";
  const hourMarks = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
    (_, index) => DAY_START_HOUR + index,
  );
  const appointmentsByDay = visibleDays.map((day) => {
    const dayStart = new Date(day);
    dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);
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
      <div
        className={cn(
          "space-y-5",
          isAgendaFullscreen ? "fixed inset-0 z-40 overflow-y-auto bg-white px-6 py-4" : "relative w-full",
        )}
        data-testid="autoscuole-agenda-page"
      >
        <div className={cn("mx-auto space-y-5", isAgendaFullscreen ? "max-w-none" : "max-w-7xl")}>
          {!isAgendaFullscreen && (
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
          )}
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

          {/* Visualizzazione (giorni + fascia oraria) — Popover non-modale, così il
              popover del TimePicker annidato scrolla (niente scroll-lock da Dialog). */}
          <PopoverPrimitive.Root open={viewPrefsOpen} onOpenChange={setViewPrefsOpen} modal={false}>
            <PopoverPrimitive.Trigger asChild>
              <button
                type="button"
                title="Visualizzazione"
                className="relative flex h-[34px] shrink-0 cursor-pointer items-center justify-center rounded-lg px-1.5 text-[#888888] transition-colors hover:bg-[#f0f0f0] hover:text-[#222222]"
              >
                <LayoutGrid className="size-4" strokeWidth={1.6} />
                {(viewPrefs.days.length < 7 || viewPrefs.startHour !== 0 || viewPrefs.endHour !== 24) && (
                  <span className="absolute right-1 top-1 size-[7px] rounded-full bg-[#1a1a2e]" />
                )}
              </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Content
                align="end"
                sideOffset={8}
                collisionPadding={8}
                className="z-[60] w-[320px] rounded-xl border border-[#ebebeb] bg-white p-4 shadow-dropdown outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
              >
                <div className="space-y-4">
                  <div className="text-[15px] font-semibold text-foreground">Visualizzazione</div>
                  <div className="space-y-2">
                    <div className="text-[12.5px] font-semibold text-foreground">Giorni visibili</div>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_CHIPS.map(({ dow, label }) => {
                        const on = viewPrefs.days.includes(dow);
                        return (
                          <button
                            key={dow}
                            type="button"
                            onClick={() =>
                              setViewPrefs((p) => {
                                const next = p.days.includes(dow)
                                  ? p.days.filter((d) => d !== dow)
                                  : [...p.days, dow];
                                return next.length ? { ...p, days: next } : p;
                              })
                            }
                            className={cn(
                              "h-8 min-w-[44px] cursor-pointer rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors",
                              on ? "bg-[#1a1a2e] text-white" : "bg-[#f2f2f2] text-[#888888] hover:bg-[#eaeaea]",
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11.5px] text-muted-foreground">Nascondi i giorni in cui l&apos;autoscuola è chiusa.</p>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[12.5px] font-semibold text-foreground">Orario visibile</div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-muted-foreground">Dalle</span>
                      <TimePickerInput
                        value={hourToTime(viewPrefs.startHour)}
                        minuteStep={60}
                        minTime="00:00"
                        maxTime={hourToTime(viewPrefs.endHour - 1)}
                        onChange={(v) => setViewPrefs((p) => ({ ...p, startHour: timeToHour(v) }))}
                      />
                      <span className="text-[13px] text-muted-foreground">alle</span>
                      <TimePickerInput
                        value={hourToTime(viewPrefs.endHour)}
                        minuteStep={60}
                        minTime={hourToTime(viewPrefs.startHour + 1)}
                        maxTime="24:00"
                        onChange={(v) => setViewPrefs((p) => ({ ...p, endHour: timeToHour(v) }))}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end border-t border-[#f0f0f0] pt-3">
                    <button
                      type="button"
                      className="cursor-pointer text-[13px] font-semibold text-[#1a1a2e] underline underline-offset-2 hover:opacity-70"
                      onClick={() => setViewPrefs(DEFAULT_VIEW_PREFS)}
                    >
                      Ripristina
                    </button>
                  </div>
                </div>
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>

          {/* Zoom (solo in fullscreen) */}
          {isAgendaFullscreen && (
            <div className="flex h-[34px] shrink-0 items-center gap-0.5 rounded-lg border border-[#eeeeee] px-1">
              <button
                type="button"
                title="Riduci zoom"
                onClick={() => setAgendaZoom((z) => Math.max(0.9, Math.round((z - 0.15) * 100) / 100))}
                className="flex size-7 cursor-pointer items-center justify-center rounded-md text-[#555] transition-colors hover:bg-[#f2f2f2]"
              >
                <ZoomOut className="size-4" strokeWidth={1.7} />
              </button>
              <span className="min-w-[40px] select-none text-center text-[12px] font-semibold tabular-nums text-[#555]">
                {Math.round(agendaZoom * 100)}%
              </span>
              <button
                type="button"
                title="Aumenta zoom"
                onClick={() => setAgendaZoom((z) => Math.min(2.2, Math.round((z + 0.15) * 100) / 100))}
                className="flex size-7 cursor-pointer items-center justify-center rounded-md text-[#555] transition-colors hover:bg-[#f2f2f2]"
              >
                <ZoomIn className="size-4" strokeWidth={1.7} />
              </button>
            </div>
          )}

          {/* Schermo intero */}
          <button
            type="button"
            title={isAgendaFullscreen ? "Esci da schermo intero" : "Schermo intero"}
            onClick={toggleAgendaFullscreen}
            className="flex h-[34px] shrink-0 cursor-pointer items-center justify-center rounded-lg px-1.5 text-[#888888] transition-colors hover:bg-[#f0f0f0] hover:text-[#222222]"
          >
            {isAgendaFullscreen ? <Minimize2 className="size-4" strokeWidth={1.6} /> : <Maximize2 className="size-4" strokeWidth={1.6} />}
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
          <ExpandingSearch
            open={searchOpen}
            onOpenChange={setSearchOpen}
            value={search}
            onChange={setSearch}
            placeholder="Cerca in agenda…"
          />

          {/* CTA */}
          <div>
            <DropdownMenu open={plusMenuOpen} onOpenChange={setPlusMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  ref={plusBtnRef}
                  title="Inserisci a mano"
                  className="flex size-[38px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-navy-900 text-white transition-colors hover:bg-navy-800"
                >
                  <Plus className="size-[18px]" strokeWidth={2.2} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-[12px] shadow-dropdown">
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-[8px] px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-[#f7f7f7] transition-colors cursor-pointer"
                  onClick={() => { setPlusMenuOpen(false); anchorFromPlus(); setForm((prev) => ({ ...prev, day: prev.day || formatYmd(normalizeDay(dayFocus)) })); setCreateOpen(true); }}
                >
                  <Plus className="size-4 text-foreground" strokeWidth={1.7} />
                  Appuntamento
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-[8px] px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-[#f7f7f7] transition-colors cursor-pointer"
                  onClick={() => { setPlusMenuOpen(false); anchorFromPlus(); setExamForm({ date: normalizeDay(dayFocus).toISOString().slice(0, 10), time: "09:00", duration: "60", timeSet: true, instructorId: "", studentIds: [], note: "" }); setExamStudentSearch(""); setExamDialogOpen(true); }}
                >
                  <GraduationCap className="size-4 text-foreground" strokeWidth={1.7} />
                  Esame
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-[8px] px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-[#f7f7f7] transition-colors cursor-pointer"
                  onClick={() => { setPlusMenuOpen(false); anchorFromPlus(); setBlockForm({ instructorId: instructors[0]?.id ?? "", date: normalizeDay(dayFocus).toISOString().slice(0, 10), startTime: "09:00", duration: "60", reason: "", recurring: false, recurringWeeks: 12 }); setBlockDialogOpen(true); }}
                >
                  <Ban className="size-4 text-foreground" strokeWidth={1.7} />
                  Evento bloccante
                </button>
                {groupLessonsEnabled && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-[8px] px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-[#f7f7f7] transition-colors cursor-pointer"
                    onClick={() => { setPlusMenuOpen(false); anchorFromPlus(); setCreateGroupLessonOpen(true); }}
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
                        className="flex w-full items-center gap-2.5 rounded-[8px] px-3.5 py-2.5 text-sm font-medium text-[#c13515] hover:bg-red-50 transition-colors cursor-pointer"
                        onClick={() => { setPlusMenuOpen(false); setRemoveHolidayDate(dayFocus); setRemoveHolidayDialogOpen(true); }}
                      >
                        <Ban className="size-4" strokeWidth={1.7} />
                        Rimuovi festivo
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-[8px] px-3.5 py-2.5 text-sm font-medium text-[#d97706] hover:bg-[#fffbeb] transition-colors cursor-pointer"
                        onClick={() => { setPlusMenuOpen(false); setHolidayDialogDate(dayFocus); setHolidayLabel(""); setHolidayDialogOpen(true); }}
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
          <div className="flex items-center justify-between gap-3 rounded-[12px] bg-[#f7f8fa] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <AlertTriangle className="size-[18px] shrink-0 text-[#d97706]" strokeWidth={1.8} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">
                  {outOfAvailAppointments.length} guid{outOfAvailAppointments.length === 1 ? "a" : "e"} fuori
                  disponibilità
                </p>
                <p className="text-[12px] font-medium leading-snug text-[#929292]">
                  Prenotate fuori dagli orari di disponibilità dell&apos;istruttore.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOutOfAvailSheetOpen(true)}
              className="flex shrink-0 cursor-pointer select-none items-center justify-center rounded-full bg-[#1a1a2e] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#2d2d4a]"
            >
              Gestisci
            </button>
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
            if (!open) { setEditAppointmentTarget(null); setEditDraft(null); setEditSlotPatch(null); }
          }}
          appointment={editAppointmentTarget}
          anchor={null}
          onDraftChange={setEditDraft}
          slotPatch={editSlotPatch}
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
          onOpenChange={(open) => { setCreateGroupLessonOpen(open); if (!open) { setGroupLessonPrefill(null); setGroupDraft(null); setGroupSlotPatch(null); } }}
          anchor={popoverAnchor}
          onDraftChange={setGroupDraft}
          slotPatch={groupSlotPatch}
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
            const closeAnd = (fn: () => void) => {
              // Anchor al CENTRO della colonna del ghost: CreateEventPopover la
              // riconosce (data-agenda-col-day) e si affianca sul lato più libero.
              setPopoverAnchor({ x: (slotMenu.colLeft + slotMenu.colRight) / 2, y: Math.max(80, Math.min(slotMenu.ghostTop - 8, window.innerHeight - 420)) });
              setSlotMenu(null);
              fn();
            };
            const options: Array<{ key: string; label: string; icon: React.ReactNode; onSelect: () => void }> = [
              {
                key: "appointment",
                label: "Appuntamento",
                icon: <Plus className="size-4 text-foreground" strokeWidth={1.7} />,
                onSelect: () => closeAnd(() => {
                  setForm((prev) => ({ ...prev, day: slotMenu.ymd, time: slotMenu.time, instructorId: slotMenu.instructorId ?? prev.instructorId }));
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
                  className="absolute rounded-[12px] border border-border bg-white p-1.5 shadow-dropdown"
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
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-gray-50"
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
          <AgendaGridSkeleton columns={viewMode === "week" ? 7 : 4} />
        ) : (<FadeIn>

        {/* ── WEEKLY VIEW (istruttori) ── */}
        {viewMode === "week" && (() => {
          const weekInstructorsAll = instructorAvailability.length > 0
            ? instructorAvailability
            : instructors.map((i) => ({ instructorId: i.id, instructorName: i.name, days: {} as Record<string, Array<{ startMinutes: number; endMinutes: number }>> }));
          // Filtro istruttori attivo → solo le colonne selezionate.
          const weekInstructors = instructorFilter.length > 0
            ? weekInstructorsAll.filter((i) => instructorFilter.includes(i.instructorId))
            : weekInstructorsAll;
          const instrCount = Math.max(1, weekInstructors.length);
          const totalCols = instrCount * days.length; // sotto-colonne istruttore per i giorni visibili

          return (
          <div className={cn("relative transition-opacity duration-200", refreshing && "opacity-60")} style={{ height: agendaGridHeight, minHeight: 400 }}>
            <div className={cn("flex flex-col overflow-hidden bg-white", agendaFrameClass)} style={{ height: "100%", ...agendaFrameStyle }}>
              {/* Fixed header — scrolls horizontally in sync with body */}
              <div className="overflow-hidden border-b border-border shrink-0" data-agenda-header-wrap>
                <div className="bg-white" style={{ display: "grid", gridTemplateColumns: fsCols(totalCols) ?? `56px repeat(${totalCols}, minmax(80px, 1fr))` }}>
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
                  <div style={{ display: "grid", gridTemplateColumns: fsCols(totalCols) ?? `56px repeat(${totalCols}, minmax(80px, 1fr))` }}>
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
              <div style={{ display: "grid", gridTemplateColumns: fsCols(totalCols) ?? `56px repeat(${totalCols}, minmax(80px, 1fr))` }}>
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
                        data-agenda-col-day={dateKey}
                        data-agenda-col-instructor={instr.instructorId}
                        onClick={(event) => openSlotMenu(event, day, instr.instructorId)}
                      >
                        {renderSlotGhost(day, instr.instructorId)}
                        {renderDraftGhost(day, instr.instructorId)}
                        {isColumnHoliday && (
                          <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(239,68,68,0.04) 10px, rgba(239,68,68,0.04) 20px)" }}>
                            {instrIdx === 0 && <Ban className="size-6 text-red-300/60" />}
                          </div>
                        )}
                        {/* Availability bands — offset e clip alla finestra oraria visibile
                            (startMinutes è da mezzanotte, la griglia parte da DAY_START_HOUR). */}
                        {ranges.map((range, ri) => {
                          const s = Math.max(range.startMinutes, DAY_START_HOUR * 60);
                          const e = Math.min(range.endMinutes, DAY_END_HOUR * 60);
                          if (e <= s) return null;
                          return (
                            <div key={ri} className={cn("absolute left-0 right-0", tint.bandClass)} style={{ ...tint.bandStyle, top: (s - DAY_START_HOUR * 60) * PIXELS_PER_MINUTE, height: (e - s) * PIXELS_PER_MINUTE }} />
                          );
                        })}
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
                            <DropdownMenu modal={false} key={item.id}>
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
                              <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-72 overflow-visible border-0 bg-transparent p-0 shadow-none"><DraggableEventPanel>
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
                              </DraggableEventPanel></DropdownMenuContent>
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
                                  <div className="text-[8px] text-violet-500 truncate">{formatTimeRange(egStart, egEnd)}</div>
                                  <div className="mt-0.5 flex flex-col gap-px">
                                    {eg.appointments.map((a) => {
                                      const lic = studentLicenseById.get(a.student.id);
                                      return (
                                        <div key={a.id} className="truncate text-[9px] font-semibold leading-tight text-violet-900/85">
                                          {a.student.firstName} {a.student.lastName}
                                          {lic ? <span className="font-medium text-violet-500"> · {lic}</span> : null}
                                        </div>
                                      );
                                    })}
                                  </div>
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
        {viewMode === "day" && (
        <div className={cn("relative transition-opacity duration-200", refreshing && "opacity-60")} style={{ height: agendaGridHeight, minHeight: 400 }}>
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
            className={cn("bg-white", isAgendaFullscreen ? "overflow-auto" : "overflow-y-auto", agendaFrameClass)}
            style={{ height: "100%", ...agendaFrameStyle }}
          >
          {/* Sticky instructor headers */}
          {(
            <div
              className="sticky top-0 z-30 grid border-b border-border bg-white/95 backdrop-blur-sm text-xs text-muted-foreground"
              style={{ gridTemplateColumns: fsCols(Math.max(1, dayViewInstructors.length)) ?? `56px repeat(${Math.max(1, dayViewInstructors.length)}, 1fr)` }}
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
              gridTemplateColumns: fsCols(Math.max(1, dayViewInstructors.length)) ?? `56px repeat(${Math.max(1, dayViewInstructors.length)}, 1fr)`,
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
                    data-agenda-col-day={formatYmd(day)}
                    data-agenda-col-instructor={instr.id}
                    onClick={(event) => openSlotMenu(event, day, instr.id)}
                  >
                    {renderSlotGhost(day, instr.id)}
                    {renderDraftGhost(day, instr.id)}
                    {/* Availability bands — offset e clip alla finestra oraria visibile
                        (startMinutes è da mezzanotte, la griglia parte da DAY_START_HOUR). */}
                    {instr.ranges.map((range, ri) => {
                      const s = Math.max(range.startMinutes, DAY_START_HOUR * 60);
                      const e = Math.min(range.endMinutes, DAY_END_HOUR * 60);
                      if (e <= s) return null;
                      const top = (s - DAY_START_HOUR * 60) * PIXELS_PER_MINUTE;
                      const height = (e - s) * PIXELS_PER_MINUTE;
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
                        <DropdownMenu modal={false} key={item.id}>
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
                            className="w-72 overflow-visible border-0 bg-transparent p-0 shadow-none"
                          ><DraggableEventPanel>
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
                          </DraggableEventPanel></DropdownMenuContent>
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


      <CreateEventPopover
        open={createOpen}
        onClose={() => { if (!creating) setCreateOpen(false); }}
        title="Nuovo appuntamento"
        subtitle="Il blocco tratteggiato in agenda si aggiorna mentre compili"
        anchor={popoverAnchor}
        footer={
          <>
            <button type="button" className="cursor-pointer text-sm font-semibold text-[#222222] underline underline-offset-2 disabled:opacity-50" disabled={creating} onClick={() => setCreateOpen(false)}>
              Annulla
            </button>
            <button
              type="button"
              disabled={creating || !form.studentId || !form.day || !form.time || !form.instructorId || (vehiclesEnabled && !form.vehicleId)}
              onClick={() => handleCreate()}
              className="flex cursor-pointer items-center gap-2 rounded-[10px] bg-[#222222] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
            >
              {creating ? <LoadingDots className="min-h-5" /> : "Crea guida"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[#555555]">Giorno</p>
              <DatePickerInput value={form.day} onChange={(value) => setForm((prev) => ({ ...prev, day: value }))} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[#555555]">Orario</p>
              <TimePickerInput value={form.time} onChange={(value) => setForm((prev) => ({ ...prev, time: value }))} />
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[#555555]">Durata</p>
            <div className="flex flex-wrap gap-1.5">
              {SLOT_OPTIONS.map((option) => {
                const active = form.duration === option;
                return (
                  <button key={option} type="button" onClick={() => setForm((prev) => ({ ...prev, duration: option }))}
                    className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors", active ? "border-[#222222] bg-[#222222] text-white" : "border-[#dddddd] bg-white text-[#555555] hover:border-[#929292]")}>
                    {option} min
                  </button>
                );
              })}
            </div>
          </div>
          {vehiclesEnabled && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[#555555]">Modalità</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "auto", label: "Auto", hint: "1 veicolo", icon: Car },
                  { value: "moto", label: "Moto", hint: "+ auto al seguito", icon: Bike },
                ] as const).map((opt) => {
                  const active = form.bookingMode === opt.value;
                  const Icon = opt.icon;
                  return (
                    <button key={opt.value} type="button"
                      onClick={() => setForm((prev) => ({ ...prev, bookingMode: opt.value, studentId: "", vehicleId: "", followVehicleId: "", extraMotoVehicleIds: [] }))}
                      className={cn("flex cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] px-3 py-2 text-left transition-colors", active ? "border-[#222222] bg-[#f7f7f7]" : "border-[#dddddd] hover:border-[#929292]")}>
                      <Icon className={cn("size-4 shrink-0", active ? "text-[#222222]" : "text-[#929292]")} />
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="text-sm font-semibold text-[#222222]">{opt.label}</span>
                        <span className="truncate text-[10px] font-medium text-[#929292]">{opt.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[#555555]">Tipo guida</p>
            <div className="flex flex-wrap gap-1.5">
              {LESSON_TYPE_OPTIONS.map((option) => {
                const active = form.types.includes(option.value);
                return (
                  <button key={option.value} type="button"
                    onClick={() =>
                      setForm((prev) => {
                        const next = active ? prev.types.filter((t) => t !== option.value) : [...prev.types, option.value];
                        const types = next.length ? next : [option.value];
                        return { ...prev, types, type: types[0] };
                      })
                    }
                    className={cn("cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors", active ? "border-[#222222] bg-[#222222] text-white" : "border-[#dddddd] bg-white text-[#555555] hover:border-[#929292]")}>
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div ref={createStudentRef}>
            <p className="mb-1.5 text-xs font-semibold text-[#555555]">Allievo</p>
            <StudentSearchSelect
              students={
                vehiclesEnabled
                  ? students.filter((s) =>
                      !s.licenseCategory
                        ? true
                        : form.bookingMode === "moto"
                          ? isMotoLicenseCategory(s.licenseCategory)
                          : !isMotoLicenseCategory(s.licenseCategory),
                    )
                  : students
              }
              instructors={instructors}
              value={form.studentId}
              onChange={(id) => {
                // Preseleziona l'istruttore dell'allievo: quello assegnato, o
                // in mancanza l'ultimo con cui ha guidato. La scelta dell'allievo
                // VINCE su un istruttore già impostato (es. colonna cliccata);
                // solo se l'allievo non ne suggerisce nessuno resta il corrente.
                const student = students.find((s) => s.id === id);
                const preferredInstructorId = [student?.assignedInstructorId, student?.lastInstructorId]
                  .find((candidate) => candidate && instructors.some((i) => i.id === candidate)) ?? "";
                setForm((prev) => ({
                  ...prev,
                  studentId: id,
                  instructorId: preferredInstructorId || prev.instructorId,
                  vehicleId: "",
                  followVehicleId: "",
                  extraMotoVehicleIds: [],
                }));
                if (id) {
                  advanceCreateFocus({
                    studentId: id,
                    instructorId: preferredInstructorId || form.instructorId,
                    vehicleId: "",
                  });
                }
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div ref={createInstructorRef}>
              <p className="mb-1.5 text-xs font-semibold text-[#555555]">Istruttore</p>
              <Select
                value={form.instructorId}
                onValueChange={(value) => {
                  setForm((prev) => ({ ...prev, instructorId: value }));
                  advanceCreateFocus({ instructorId: value });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Istruttore" /></SelectTrigger>
                <SelectContent>
                  {instructors.map((instructor) => (
                    <SelectItem key={instructor.id} value={instructor.id}>{instructor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {vehiclesEnabled && (
              <div ref={createVehicleRef}>
                <p className="mb-1.5 text-xs font-semibold text-[#555555]">{form.bookingMode === "moto" ? "Moto" : "Veicolo"}</p>
                <Select
                  value={form.vehicleId}
                  onValueChange={(value) => {
                    setForm((prev) => ({ ...prev, vehicleId: value }));
                    advanceCreateFocus({ vehicleId: value });
                  }}
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
                        const st = students.find((s) => s.id === form.studentId);
                        return st ? vehicleServesLicense(vehicle, st) : true;
                      })
                      .map((vehicle) => {
                        const assignedTo = vehicle.assignedInstructorId
                          ? instructors.find((i) => i.id === vehicle.assignedInstructorId)?.name
                          : null;
                        const licenseLabel = vehicle.licenseCategory
                          ? `${vehicle.licenseCategory} · ${TRANSMISSION_LABELS[vehicle.transmission as Transmission] ?? vehicle.transmission}`
                          : null;
                        return (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.name}
                            {licenseLabel ? <span className="text-muted-foreground"> · {licenseLabel}</span> : null}
                            {assignedTo ? <span className="text-muted-foreground"> · {assignedTo}</span> : null}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {(() => {
            const need = vehiclesEnabled && form.bookingMode === "moto" && Object.values(followCarRules).some((r) => r?.enabled === true);
            if (!need) return null;
            const carOptions = vehicles.filter((v) => v.licenseCategory === "B" && v.id !== form.vehicleId);
            return (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[#555555]">Auto al seguito</p>
                <Select value={form.followVehicleId} onValueChange={(value) => setForm((prev) => ({ ...prev, followVehicleId: value }))}>
                  <SelectTrigger><SelectValue placeholder="Auto al seguito" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessuna auto al seguito</SelectItem>
                    {carOptions.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.name}
                        {vehicle.transmission ? (
                          <span className="text-muted-foreground"> · {TRANSMISSION_LABELS[vehicle.transmission as Transmission] ?? vehicle.transmission}</span>
                        ) : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}
          {(() => {
            if (!vehiclesEnabled || form.bookingMode !== "moto") return null;
            const extraStudent = students.find((s) => s.id === form.studentId);
            const motoOptions = vehicles.filter(
              (v) => isMotoLicenseCategory(v.licenseCategory) && v.id !== form.vehicleId && (extraStudent ? vehicleServesLicense(v, extraStudent) : true),
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
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[#555555]">Moto aggiuntive</p>
                <div className="flex flex-wrap gap-1.5">
                  {motoOptions.map((vehicle) => {
                    const active = form.extraMotoVehicleIds.includes(vehicle.id);
                    return (
                      <button key={vehicle.id} type="button" onClick={() => toggleExtra(vehicle.id)}
                        className={cn("cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors", active ? "border-[#222222] bg-[#222222] text-white" : "border-[#dddddd] bg-white text-[#555555] hover:border-[#929292]")}>
                        {vehicle.name}
                        {vehicle.licenseCategory ? <span className={active ? "text-white/70" : "text-[#929292]"}> · {vehicle.licenseCategory}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {agendaLocations.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[#555555]">Luogo</p>
              <Select value={form.locationId} onValueChange={(value) => setForm((prev) => ({ ...prev, locationId: value }))}>
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
            </div>
          )}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[#555555]">Note</p>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Note opzionali sulla guida"
              rows={2}
              disabled={creating}
              className="resize-none text-sm"
            />
          </div>
        </div>
      </CreateEventPopover>

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
                  { label: "Cambio automatico", className: "bg-[#CFFAFE] shadow-[0_3px_8px_rgba(6,182,212,0.35)]" },
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
      <Dialog open={examPanelGroup !== null} onOpenChange={(open) => { if (!open) setExamPanelGroup(null); }} modal={false}>
        <DialogContent
          className="max-w-[480px] gap-0 overflow-visible rounded-[20px] p-0"
          onInteractOutside={(e) => e.preventDefault()}
        >
          {examPanelGroup && (() => {
            const eg = examPanelGroup;
            const egStart = toDate(eg.startsAt);
            const examHasTime = Boolean(eg.endsAt);
            const egEnd = eg.endsAt ? toDate(eg.endsAt) : new Date(egStart.getTime() + 60 * 60 * 1000);
            const studentById = new Map(students.map((s) => [s.id, s] as const));
            const draftStudents = examDraftStudentIds
              .map((id) => studentById.get(id))
              .filter((s): s is (typeof students)[number] => Boolean(s));
            const examAddable = students.filter((s) => !examDraftStudentIds.includes(s.id));
            const examQuery = examPanelStudentSearch.trim().toLowerCase();
            const examBrowse = examAddable.filter((s) => !examQuery || `${s.firstName} ${s.lastName}`.toLowerCase().includes(examQuery));
            // Diff draft vs salvato → abilita il bottone unico "Salva modifiche".
            const origTime = examHasTime ? `${String(egStart.getHours()).padStart(2, "0")}:${String(egStart.getMinutes()).padStart(2, "0")}` : null;
            const origInstructorId = eg.instructorId ?? null;
            const origStudentIds = eg.appointments.map((a) => a.student.id);
            const sortIds = (a: string[]) => [...a].sort().join(",");
            const origDurationMin = examHasTime ? Math.max(15, Math.round((egEnd.getTime() - egStart.getTime()) / 60000)) : 60;
            const timeChanged = examDraftTime !== origTime;
            // La durata conta solo quando c'è un orario (con "da definire" non ha senso).
            const durationChanged = examDraftTime !== null && examDraftDurationMin !== origDurationMin;
            const timingChanged = timeChanged || durationChanged;
            const instrChanged = examDraftInstructorId !== origInstructorId;
            const noteChanged = examNoteDraft.trim() !== (eg.notes ?? "").trim();
            const studentsChanged = sortIds(examDraftStudentIds) !== sortIds(origStudentIds);
            const examDirty = timingChanged || instrChanged || noteChanged || studentsChanged;
            // endsAt = start + durata scelta. Preservare la durata è ciò che tiene
            // insieme il gruppo esame (chiave = start|end|istruttore): un allievo
            // aggiunto o un cambio orario mantengono lo stesso [start,end].
            const buildExamStart = () => {
              const base = new Date(egStart);
              if (examDraftTime) {
                const [h, m] = examDraftTime.split(":").map(Number);
                base.setHours(h, m, 0, 0);
                return { startsAt: base.toISOString(), endsAt: new Date(base.getTime() + examDraftDurationMin * 60000).toISOString() as string | undefined };
              }
              base.setHours(0, 0, 0, 0);
              return { startsAt: base.toISOString(), endsAt: undefined as string | undefined };
            };
            const saveExam = async () => {
              if (examDraftStudentIds.length === 0) { toast.error({ description: "L'esame deve avere almeno un allievo." }); return; }
              setExamPanelPending(true);
              try {
                const studentToAppt = new Map(eg.appointments.map((a) => [a.student.id, a.id] as const));
                const removed = origStudentIds.filter((id) => !examDraftStudentIds.includes(id));
                const added = examDraftStudentIds.filter((id) => !origStudentIds.includes(id));
                const { startsAt, endsAt } = buildExamStart();
                for (const sid of removed) {
                  const apptId = studentToAppt.get(sid);
                  if (!apptId) continue;
                  const r = await removeExamStudent(apptId);
                  if (!r.success) { toast.error({ description: r.message ?? "Errore." }); setExamPanelPending(false); return; }
                }
                for (const sid of added) {
                  const r = await addExamStudent({ studentId: sid, startsAt, endsAt, instructorId: examDraftInstructorId, notes: examNoteDraft.trim() || undefined });
                  if (!r.success) { toast.error({ description: r.message ?? "Errore." }); setExamPanelPending(false); return; }
                }
                const keptApptIds = origStudentIds
                  .filter((id) => examDraftStudentIds.includes(id))
                  .map((id) => studentToAppt.get(id))
                  .filter((x): x is string => Boolean(x));
                if (keptApptIds.length) {
                  if (timingChanged) {
                    const r = await updateExamTime({ appointmentIds: keptApptIds, startsAt, endsAt });
                    if (!r.success) { toast.error({ description: r.message ?? "Errore." }); setExamPanelPending(false); return; }
                  }
                  if (instrChanged) {
                    const r = await updateExamInstructor({ appointmentIds: keptApptIds, instructorId: examDraftInstructorId });
                    if (!r.success) { toast.error({ description: r.message ?? "Errore." }); setExamPanelPending(false); return; }
                  }
                  if (noteChanged) {
                    const r = await updateExamNotes({ appointmentIds: keptApptIds, notes: examNoteDraft.trim() || null });
                    if (!r.success) { toast.error({ description: r.message ?? "Errore." }); setExamPanelPending(false); return; }
                  }
                }
                setExamPanelPending(false);
                setExamPanelGroup(null);
                load({ silent: true });
                toast.success({ description: "Esame aggiornato." });
              } catch {
                setExamPanelPending(false);
                toast.error({ description: "Errore durante il salvataggio." });
              }
            };
            return (
              <>
                <div className="flex max-h-[88vh] flex-col rounded-[20px]">
                <div className="min-h-0 flex-1 overflow-y-auto p-7 pb-4">
                {/* Header */}
                <div className="flex items-center gap-2.5 pr-10">
                  <DialogTitle className="text-[19px] font-bold tracking-[-0.2px] text-foreground">Esame</DialogTitle>
                  <span className="shrink-0 rounded-full bg-[#ede9fe] px-2.5 py-1 text-[11px] font-bold tracking-[0.3px] text-[#6d28d9]">
                    {draftStudents.length} {draftStudents.length === 1 ? "allievo" : "allievi"}
                  </span>
                </div>
                <DialogDescription className="mt-1 text-[13px] font-medium leading-normal text-[#929292]">
                  {egStart.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}
                  {examHasTime ? ` · ${formatTimeRange(egStart, egEnd)}` : " · Orario da definire"}
                </DialogDescription>

                <div className="mt-5 space-y-5">
                  {/* Orario — TimePicker (onClear = orario da definire) */}
                  <div>
                    <div className="mb-1.5 text-[13px] font-semibold text-[#6a6a6a]">Orario</div>
                    <TimePickerInput
                      value={examDraftTime}
                      placeholder="Orario da definire"
                      minuteStep={15}
                      className="w-full justify-between py-[11px]"
                      onChange={(t) => setExamDraftTime(t)}
                      onClear={examDraftTime ? () => setExamDraftTime(null) : undefined}
                    />
                  </div>

                  {/* Durata / fine — solo se l'esame ha un orario */}
                  {examDraftTime ? (
                    <DurationField
                      startTime={examDraftTime}
                      durationMin={examDraftDurationMin}
                      onDurationChange={setExamDraftDurationMin}
                    />
                  ) : null}

                  {/* Istruttore */}
                  <div>
                    <div className="mb-1.5 text-[13px] font-semibold text-[#6a6a6a]">Istruttore accompagnatore</div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={examDraftInstructorId ?? "__none__"}
                        onValueChange={(v) => setExamDraftInstructorId(v === "__none__" ? null : v)}
                      >
                        <SelectTrigger className="h-auto w-full rounded-[10px] border-[1.5px] border-[#dddddd] px-3.5 py-[11px]" disabled={examPanelPending}>
                          <SelectValue placeholder="Nessuno" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nessuno</SelectItem>
                          {instructors.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Allievi iscritti */}
                  <div>
                    <div className="mb-3 mt-6 flex items-baseline justify-between gap-3">
                      <span className="text-[15px] font-semibold text-foreground">Allievi iscritti</span>
                      <span className="text-[12.5px] font-medium text-[#929292]">
                        {draftStudents.length} {draftStudents.length === 1 ? "iscritto" : "iscritti"}
                      </span>
                    </div>
                    <div className="rounded-[12px] border-[1.5px] border-[#ededed]">
                      {draftStudents.map((s, idx) => (
                        <div key={s.id} className={cn("flex items-center justify-between gap-2 px-4 py-3", idx > 0 && "border-t border-[#f0f0f0]")}>
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="flex size-9 shrink-0 select-none items-center justify-center rounded-full bg-[#f2f2f2] text-[12px] font-bold text-[#555555]">
                              {examStudentInitials(s.firstName, s.lastName)}
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-sm font-semibold text-foreground">{s.firstName} {s.lastName}</span>
                              {s.licenseCategory ? (
                                <span className="truncate text-[12px] font-medium text-[#929292]">
                                  Patente {s.licenseCategory}{s.transmission === "automatic" ? " · autom." : ""}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <button
                            type="button"
                            title="Rimuovi dall'esame"
                            disabled={examPanelPending || draftStudents.length <= 1}
                            onClick={() => setExamDraftStudentIds((prev) => prev.filter((id) => id !== s.id))}
                            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#c13515] transition-colors hover:bg-[#fdf3f1] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 className="size-4" strokeWidth={1.8} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Aggiungi allievi — trigger del pannello laterale */}
                  <div>
                    <div className="mb-2 mt-6 text-[15px] font-semibold text-foreground">Aggiungi allievi</div>
                    <button
                      type="button"
                      onClick={() => setExamPanelBrowseOpen((v) => !v)}
                      disabled={examAddable.length === 0}
                      className={cn(
                        "inline-flex cursor-pointer select-none items-center gap-2 rounded-full border-[1.5px] px-[22px] py-[11px] text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        examPanelBrowseOpen
                          ? "border-[#222222] bg-[#f7f7f7] text-foreground"
                          : "border-[#dddddd] text-foreground hover:border-[#222222] hover:bg-[#f7f7f7]",
                      )}
                    >
                      <Plus className="size-4" strokeWidth={2} />
                      {examAddable.length > 0 ? `Sfoglia allievi · ${examAddable.length}` : "Tutti gli allievi aggiunti"}
                    </button>
                  </div>

                  {/* Note — editabili */}
                  <div>
                    <div className="mb-1.5 text-[13px] font-semibold text-[#6a6a6a]">Note</div>
                    <textarea
                      value={examNoteDraft}
                      onChange={(e) => setExamNoteDraft(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      disabled={examPanelPending}
                      placeholder="Es: Esame pratico patente B, sede Motorizzazione…"
                      className="w-full resize-y rounded-[10px] border-[1.5px] border-[#dddddd] px-3.5 py-2.5 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-[#c1c1c1] focus:border-[#222222] disabled:opacity-60"
                    />
                  </div>
                </div>
                </div>

                {/* Footer pinnato: "Salva" sempre raggiungibile anche col dialog lungo */}
                <div className="shrink-0 space-y-2 rounded-b-[20px] border-t border-[#f0f0f0] bg-white px-7 py-4">
                    <button
                      type="button"
                      disabled={!examDirty || examPanelPending}
                      onClick={saveExam}
                      className="flex w-full cursor-pointer items-center justify-center rounded-full bg-[#222222] py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {examPanelPending ? <LoadingDots className="min-h-5" /> : "Salva modifiche"}
                    </button>
                    <button
                      type="button"
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
                      className="flex w-full cursor-pointer items-center justify-center rounded-full py-3 text-sm font-semibold text-[#c13515] transition-colors hover:bg-[#fdf3f1] disabled:opacity-60"
                    >
                      Annulla esame
                    </button>
                </div>
                </div>

                {/* Pannello laterale "Aggiungi allievi": card gemella a destra */}
                <AnimatePresence>
                  {examPanelBrowseOpen && (
                    <motion.div
                      key="exam-add-panel"
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="absolute left-[calc(100%+14px)] top-0 flex max-h-[88vh] w-[340px] flex-col rounded-[20px] border border-border bg-white p-6 shadow-card-primary"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[17px] font-bold tracking-[-0.2px] text-foreground">Aggiungi allievi</span>
                        <button
                          type="button"
                          aria-label="Chiudi elenco"
                          onClick={() => setExamPanelBrowseOpen(false)}
                          className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#e9e9e9]"
                        >
                          <X className="size-3.5 text-foreground" strokeWidth={2} />
                        </button>
                      </div>
                      <p className="mt-0.5 text-[12.5px] font-medium text-[#929292]">
                        {draftStudents.length} iscritti · {examAddable.length} da aggiungere
                      </p>
                      <div className="mt-3 flex items-center gap-2.5 rounded-[10px] border-[1.5px] border-[#dddddd] px-3.5 transition-colors focus-within:border-[#222222]">
                        <Search className="size-4 shrink-0 text-[#a8a8a8]" strokeWidth={1.8} />
                        <input
                          value={examPanelStudentSearch}
                          onChange={(e) => setExamPanelStudentSearch(e.target.value)}
                          placeholder="Cerca un allievo"
                          autoFocus
                          className="min-w-0 flex-1 bg-transparent py-[9px] text-sm font-medium text-foreground outline-none placeholder:text-[#c1c1c1]"
                        />
                      </div>
                      <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto rounded-[12px] border-[1.5px] border-[#ededed]">
                        {examBrowse.length === 0 ? (
                          <p className="px-4 py-3.5 text-[12.5px] font-medium text-[#929292]">
                            {examPanelStudentSearch.trim()
                              ? `Nessun allievo trovato per «${examPanelStudentSearch.trim()}».`
                              : "Tutti gli allievi sono già iscritti."}
                          </p>
                        ) : (
                          examBrowse.map((s, idx) => (
                            <div key={s.id} className={cn("flex items-center justify-between gap-3 px-3.5 py-2.5", idx > 0 && "border-t border-[#f0f0f0]")}>
                              <span className="flex min-w-0 items-center gap-2.5">
                                <span className="flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-[#f2f2f2] text-[11px] font-bold text-[#555555]">
                                  {examStudentInitials(s.firstName, s.lastName)}
                                </span>
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate text-sm font-medium text-foreground">{s.firstName} {s.lastName}</span>
                                  {s.licenseCategory ? (
                                    <span className="truncate text-[11.5px] font-medium text-[#929292]">
                                      Patente {s.licenseCategory}{s.transmission === "automatic" ? " · autom." : ""}
                                    </span>
                                  ) : null}
                                </span>
                              </span>
                              <button
                                type="button"
                                disabled={examPanelPending}
                                onClick={() => setExamDraftStudentIds((prev) => (prev.includes(s.id) ? prev : [...prev, s.id]))}
                                className="flex min-w-[88px] shrink-0 cursor-pointer select-none items-center justify-center gap-1 rounded-full border-[1.5px] border-[#dddddd] px-3 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:border-[#222222] hover:bg-[#f7f7f7] disabled:opacity-50"
                              >
                                <Plus className="size-3.5" strokeWidth={2} /> Aggiungi
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Exam Creation Dialog ── */}
      <CreateEventPopover
        open={examDialogOpen}
        onClose={() => { if (!examCreating) setExamDialogOpen(false); }}
        title="Nuovo esame"
        subtitle="Pianifica un esame per uno o più allievi"
        anchor={popoverAnchor}
        sidePanel={
          examBrowseOpen ? (
            <div className="flex max-h-[80vh] w-[320px] flex-col rounded-[20px] border border-[#dddddd] bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.18)]">
              <div className="flex items-center justify-between">
                <span className="text-[17px] font-bold tracking-[-0.2px] text-[#222222]">Aggiungi allievi</span>
                <button
                  type="button"
                  aria-label="Chiudi elenco"
                  onClick={() => setExamBrowseOpen(false)}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#e9e9e9]"
                >
                  <X className="size-3.5 text-[#222222]" strokeWidth={2} />
                </button>
              </div>
              <p className="mt-0.5 text-[12.5px] font-medium text-[#929292]">
                {examForm.studentIds.length} selezionati · {examAddableCount} da aggiungere
              </p>
              <div className="mt-3 flex items-center gap-2.5 rounded-[10px] border-[1.5px] border-[#dddddd] px-3.5 transition-colors focus-within:border-[#222222]">
                <Search className="size-4 shrink-0 text-[#a8a8a8]" strokeWidth={1.8} />
                <input
                  value={examStudentSearch}
                  onChange={(e) => setExamStudentSearch(e.target.value)}
                  placeholder="Cerca un allievo"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent py-[9px] text-sm font-medium text-[#222222] outline-none placeholder:text-[#c1c1c1]"
                />
              </div>
              <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto rounded-[12px] border-[1.5px] border-[#ededed]">
                {examBrowseList.length === 0 ? (
                  <p className="px-4 py-3.5 text-[12.5px] font-medium text-[#929292]">
                    {examStudentSearch.trim()
                      ? `Nessun allievo trovato per «${examStudentSearch.trim()}».`
                      : "Tutti gli allievi sono già stati aggiunti."}
                  </p>
                ) : (
                  examBrowseList.map((st, idx) => (
                    <div
                      key={st.id}
                      className={cn("flex items-center justify-between gap-3 px-3.5 py-2.5", idx > 0 && "border-t border-[#f0f0f0]")}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-[#f2f2f2] text-[11px] font-bold text-[#555555]">
                          {examStudentInitials(st.firstName, st.lastName)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium text-[#222222]">{st.firstName} {st.lastName}</span>
                          {st.licenseCategory ? (
                            <span className="truncate text-[11.5px] font-medium text-[#929292]">
                              Patente {st.licenseCategory}{st.transmission === "automatic" ? " · autom." : ""}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setExamForm((f) => ({ ...f, studentIds: [...f.studentIds, st.id] }))}
                        className="flex min-w-[88px] shrink-0 cursor-pointer select-none items-center justify-center gap-1 rounded-full border-[1.5px] border-[#dddddd] px-3 py-1.5 text-[13px] font-semibold text-[#222222] transition-colors hover:border-[#222222] hover:bg-[#f7f7f7]"
                      >
                        <Plus className="size-3.5" strokeWidth={2} /> Aggiungi
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null
        }
        footer={
          <>
            <p className="text-[11px] font-medium text-[#929292]">
              {examForm.studentIds.length === 0
                ? "Seleziona almeno un allievo"
                : `${examForm.studentIds.length} alliev${examForm.studentIds.length === 1 ? "o" : "i"} selezionat${examForm.studentIds.length === 1 ? "o" : "i"}`}
            </p>
            <button
              type="button"
              disabled={examCreating || !examForm.date || !examForm.studentIds.length}
              className="flex cursor-pointer items-center gap-2 rounded-[10px] bg-[#222222] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
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
                  toast.success({ description: `Esame creato per ${count} alliev${count === 1 ? "o" : "i"}.` });
                  setExamDialogOpen(false);
                  load({ silent: true });
                } else {
                  toast.error({ description: res.message ?? "Impossibile creare l'esame." });
                }
              }}
            >
              {examCreating ? <LoadingDots className="min-h-5" /> : "Crea esame"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[#555555]">Giorno</p>
              <DatePickerInput value={examForm.date} onChange={(v) => setExamForm((f) => ({ ...f, date: v }))} />
            </div>
            {examForm.timeSet && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[#555555]">Orario</p>
                <TimePickerInput value={examForm.time} onChange={(v) => setExamForm((f) => ({ ...f, time: v }))} />
              </div>
            )}
          </div>
          <div
            className="flex cursor-pointer items-center justify-between rounded-[10px] bg-[#f8f8f8] px-3.5 py-2.5"
            onClick={() => setExamForm((f) => ({ ...f, timeSet: !f.timeSet }))}
          >
            <span className="text-[13px] font-medium text-[#555555]">{examForm.timeSet ? "Orario specificato" : "Orario da definire"}</span>
            <InlineToggle checked={examForm.timeSet} size="sm" />
          </div>
          {examForm.timeSet && (
            <DurationField
              startTime={examForm.time}
              durationMin={parseInt(examForm.duration, 10) || 60}
              onDurationChange={(m) => setExamForm((f) => ({ ...f, duration: String(m) }))}
            />
          )}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[#555555]">Istruttore accompagnatore</p>
            <Select value={examForm.instructorId} onValueChange={(v) => setExamForm((f) => ({ ...f, instructorId: v }))}>
              <SelectTrigger><SelectValue placeholder="Nessuno (facoltativo)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nessuno</SelectItem>
                {instructors.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[#555555]">
              Allievi
              {examForm.studentIds.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-[#f2f2f2] px-2 py-0.5 text-[10px] font-bold text-[#222222]">
                  {examForm.studentIds.length}
                </span>
              )}
            </p>
            {examForm.studentIds.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {examForm.studentIds.map((id) => {
                  const s = students.find((st) => st.id === id);
                  if (!s) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setExamForm((f) => ({ ...f, studentIds: f.studentIds.filter((x) => x !== id) }))}
                      className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#222222] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#222222] transition-colors hover:bg-[#f7f7f7]"
                    >
                      {s.firstName} {s.lastName}
                      {s.licenseCategory ? (
                        <span className="font-medium text-[#929292]">· {s.licenseCategory}{s.transmission === "automatic" ? " aut." : ""}</span>
                      ) : null}
                      <span className="text-[#929292]">&times;</span>
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={() => setExamBrowseOpen((v) => !v)}
              disabled={examAddableCount === 0}
              className={cn(
                "inline-flex cursor-pointer select-none items-center gap-2 self-start rounded-full border-[1.5px] px-[18px] py-[9px] text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                examBrowseOpen
                  ? "border-[#222222] bg-[#f7f7f7] text-[#222222]"
                  : "border-[#dddddd] text-[#222222] hover:border-[#222222] hover:bg-[#f7f7f7]",
              )}
            >
              <Plus className="size-4" strokeWidth={2} />
              {examAddableCount > 0 ? `Sfoglia allievi · ${examAddableCount}` : "Tutti gli allievi aggiunti"}
            </button>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[#555555]">Note</p>
            <Input
              value={examForm.note}
              onChange={(e) => setExamForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Es: Esame pratico patente B, sede Motorizzazione..."
            />
          </div>
        </div>
      </CreateEventPopover>

      {/* ── Instructor Block Creation Dialog ── */}
      <CreateEventPopover
        open={blockDialogOpen}
        onClose={() => { if (!blockCreating) setBlockDialogOpen(false); }}
        title="Nuovo evento bloccante"
        subtitle="Blocca l'agenda dell'istruttore per un impegno"
        anchor={popoverAnchor}
        footer={
          <>
            <button type="button" className="cursor-pointer text-sm font-semibold text-[#222222] underline underline-offset-2 disabled:opacity-50" disabled={blockCreating} onClick={() => setBlockDialogOpen(false)}>
              Annulla
            </button>
            <button
              type="button"
              disabled={blockCreating || !blockForm.instructorId || !blockForm.date}
              className="flex cursor-pointer items-center gap-2 rounded-[10px] bg-[#222222] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
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
              {blockCreating ? <LoadingDots className="min-h-5" /> : "Crea evento"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[#555555]">Istruttore</p>
            <Select value={blockForm.instructorId} onValueChange={(v) => setBlockForm((f) => ({ ...f, instructorId: v }))}>
              <SelectTrigger><SelectValue placeholder="Seleziona istruttore" /></SelectTrigger>
              <SelectContent>
                {instructors.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[#555555]">Data</p>
              <DatePickerInput value={blockForm.date} onChange={(v) => setBlockForm((f) => ({ ...f, date: v }))} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[#555555]">Ora inizio</p>
              <TimePickerInput value={blockForm.startTime} onChange={(v) => setBlockForm((f) => ({ ...f, startTime: v }))} />
            </div>
          </div>
          <DurationField
            startTime={blockForm.startTime}
            durationMin={parseInt(blockForm.duration, 10) || 60}
            onDurationChange={(m) => setBlockForm((f) => ({ ...f, duration: String(m) }))}
            chips={[15, 30, 45, 60, 90, 120]}
          />
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[#555555]">Titolo (opzionale)</p>
            <Input value={blockForm.reason} onChange={(e) => setBlockForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Es: Riunione, Visita medica, Ferie..." />
          </div>
          <div className="space-y-2">
            <div
              className="flex cursor-pointer items-center justify-between rounded-[10px] bg-[#f8f8f8] px-3.5 py-2.5"
              onClick={() => setBlockForm((f) => ({ ...f, recurring: !f.recurring }))}
            >
              <span className="text-[13px] font-medium text-[#555555]">Evento ricorrente</span>
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
                  className="h-8 w-16 text-xs"
                />
                <span className="text-xs text-muted-foreground">settimane</span>
              </div>
            )}
          </div>
        </div>
      </CreateEventPopover>

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

      {/* ── Conferma prenotazione nel passato ── */}
      <AlertDialog open={pastConfirmOpen} onOpenChange={setPastConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-1 flex size-11 items-center justify-center rounded-[14px] border border-[#f3e2c0] bg-[#fff8ec]">
              <History className="size-[22px] text-[#e8a020]" strokeWidth={2} />
            </div>
            <AlertDialogTitle>Stai prenotando nel passato</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;orario selezionato è già trascorso. Vuoi prenotare la guida comunque?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingPastStart ? (
            <div className="flex items-center gap-2 rounded-xl border border-[#f3e2c0] bg-[#fff8ec] px-3 py-2 text-sm font-semibold text-[#8a6416]">
              <History className="size-4 shrink-0 text-[#e8a020]" strokeWidth={2} />
              <span className="capitalize">
                {pendingPastStart.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                {" · "}
                {pendingPastStart.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#1a1a2e] hover:bg-[#0f0f22]"
              onClick={() => {
                setPastConfirmOpen(false);
                void handleCreate({ allowPast: true });
              }}
            >
              Prenota comunque
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
  // Presente/Assente restano disponibili anche sulle guide PASSATE e per
  // correggere un esito già dato (no_show / completed): il titolare sistema i
  // record a posteriori — es. annullare un'assenza messa per sbaglio. Nessun
  // limite temporale. Solo 'cancelled' resta escluso (si ripristina con
  // l'azione di annullamento dedicata).
  return normalized !== "cancelled";
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
// Guide a CAMBIO AUTOMATICO: colore dedicato (ciano) che SOSTITUISCE quello di
// durata, così si distinguono a colpo d'occhio. Automatica se il veicolo usato è
// automatico o, in mancanza, se l'allievo segue il percorso automatico.
const AUTOMATIC_CLASS = "bg-[#CFFAFE] shadow-[0_5px_14px_rgba(6,182,212,0.22)]";

function isAutomaticLesson(appointment: AppointmentRow): boolean {
  return (
    appointment.vehicle?.transmission === "automatic" ||
    appointment.student?.transmission === "automatic"
  );
}

function getScheduledDurationClass(appointment: AppointmentRow): string {
  if (isAutomaticLesson(appointment)) return AUTOMATIC_CLASS;
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

/** Rende trascinabile il pannello dettaglio EVENTO dentro i menu Radix. */
function DraggableEventPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      className="cursor-grab rounded-lg border border-border bg-white p-3 shadow-dropdown active:cursor-grabbing"
    >
      {children}
    </motion.div>
  );
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

