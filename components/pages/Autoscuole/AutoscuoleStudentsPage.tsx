"use client";

import React from "react";
import { ChevronLeft, ChevronRight, KeyRound, Ticket, UserPlus, UserRoundPlus, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { PageWrapper } from "@/components/Layout/PageWrapper";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedPill } from "@/components/ui/segmented-pill";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ExpandingSearch } from "@/components/ui/expanding-search";
import { DetailPanel } from "@/components/ui/detail-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  adjustAutoscuolaStudentLessonCredits,
  getAutoscuolaStudentDrivingRegister,
  getAutoscuolaStudentLessonCredits,
  getAutoscuolaStudentsWithProgress,
  getAutoscuolaInstructors,
  assignStudentToInstructor,
  getCompanyInviteCode,
  getPaymentMode,
  toggleStudentBookingBlock,
  toggleWeeklyBookingLimitExempt,
  setExamPriorityOverride,
  setManualPaymentStatus,
  updateStudentGroupLessonOptIn,
} from "@/lib/actions/autoscuole.actions";
import {
  getAutoscuolaSettings,
  getQuizSeatsContext,
  grantQuizSeat,
} from "@/lib/actions/autoscuole-settings.actions";
import { ChangeStudentPhaseDialog } from "@/components/pages/Autoscuole/dialogs/ChangeStudentPhaseDialog";
import { EditStudentLicenseDialog } from "@/components/pages/Autoscuole/dialogs/EditStudentLicenseDialog";
import {
  LICENSE_CATEGORIES,
  LICENSE_CATEGORY_LABELS,
  TRANSMISSIONS,
  TRANSMISSION_LABELS,
  type Transmission,
} from "@/lib/autoscuole/license";
import { createCompanyUser } from "@/lib/actions/user.actions";
import { useAtomValue } from "jotai";
import { companyAtom } from "@/atoms/company.store";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/fade-in";
import { LoadingDots } from "@/components/ui/loading-dots";
import { AutoscuoleLateCancellationsPanel } from "./AutoscuoleLateCancellationsPanel";
import { NeverAccessedListMark } from "./NeverAccessedNudge";

type StudentProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string | Date;
};

type Student = StudentProfile & {
  bookingBlocked?: boolean;
  // Account creato dal titolare ma mai usato (nessun accesso in app) → non
  // riceve promemoria. Guida l'indicatore "cellulare-divieto" nella lista.
  neverAccessed?: boolean;
  assignedInstructorId?: string | null;
  studentPhase?: "AWAITING" | "TEORIA" | "PRATICA" | "PATENTATO";
  licenseCategory?: string | null;
  transmission?: string | null;
  manualUnpaid?: number;
  theoryExamAt?: string | null;
  activeCase: {
    id: string;
    status: string;
    category: string | null;
  } | null;
  summary: {
    completedLessons: number;
    requiredLessons: number;
    remaining: number;
    isCompleted: boolean;
  };
};

type ExtendedSummary = {
  booked: number;
  completed: number;
  cancelled: number;
  upcoming: number;
  manualUnpaid: number;
};

type LessonEntry = {
  id: string;
  type: string;
  types?: string[];
  rating?: number | null;
  status: string;
  startsAt: string | Date;
  durationMinutes: number;
  instructorName: string | null;
  vehicleName: string | null;
  cancelledAt: string | Date | null;
  cancellationKind: string | null;
  cancellationReason: string | null;
  paymentRequired: boolean;
  manualPaymentStatus: string | null;
  creditApplied: boolean;
  lateCancellationAction: string | null;
  notes: string | null;
  createdAt: string | Date | null;
  /** Set when this lesson was a group lesson: seats filled / capacity + kind. */
  group: { filled: number; capacity: number; kind: string } | null;
};

/** Filtri client-side del tab Guide del drawer allievo. */
type LessonFilter = "all" | "upcoming" | "unpaid" | "completed" | "cancelled";

type StudentRegister = {
  student: StudentProfile;
  bookingBlocked?: boolean;
  weeklyBookingLimitExempt?: boolean;
  examPriorityOverride?: boolean | null;
  examPriorityActive?: boolean;
  examDate?: string | null;
  studentPhase?: "AWAITING" | "TEORIA" | "PRATICA" | "PATENTATO";
  licenseCategory?: string | null;
  transmission?: string | null;
  groupLessonsOptIn?: boolean;
  quizSeatGrantedAt?: string | null;
  theoryExamAt?: string | null;
  activeCase: {
    id: string;
    status: string;
    category: string | null;
  } | null;
  summary: {
    completedLessons: number;
    requiredLessons: number;
    remaining: number;
    isCompleted: boolean;
  };
  extendedSummary?: ExtendedSummary;
  byLessonType: Array<{
    type: string;
    count: number;
  }>;
  lessons: LessonEntry[];
};

type StudentCredits = {
  student: StudentProfile;
  availableCredits: number;
  ledger: Array<{
    id: string;
    appointmentId: string | null;
    delta: number;
    reason: string;
    actorUserId: string | null;
    actorName: string | null;
    createdAt: string | Date;
  }>;
};

type PaymentModeState = {
  auto: boolean;
  credits: boolean;
  creditsRequired: boolean;
};

const LESSON_TYPE_LABELS: Record<string, string> = {
  manovre: "Manovre",
  urbano: "Urbano",
  extraurbano: "Extraurbano",
  notturna: "Notturna",
  autostrada: "Autostrada",
  parcheggio: "Parcheggio",
  altro: "Altro",
  guida: "Guida",
  esame: "Esame",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "Completata",
  checked_in: "Presente",
  no_show: "Assente",
  scheduled: "Programmato",
  confirmed: "Programmato",
  cancelled: "Annullata",
  proposal: "Proposta",
};

const formatLabel = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatLessonType = (value: string) =>
  LESSON_TYPE_LABELS[value] ?? formatLabel(value);

const formatStatus = (value: string) =>
  STATUS_LABELS[value] ?? formatLabel(value);

const CREDIT_REASON_LABELS: Record<string, string> = {
  manual_grant: "Assegnazione manuale",
  manual_revoke: "Storno manuale",
  booking_consume: "Prenotazione guida",
  cancel_refund: "Rimborso annullamento",
};

const formatCreditReason = (value: string) =>
  CREDIT_REASON_LABELS[value] ?? formatLabel(value);

const formatDate = (value: string | Date, withTime = false) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("it-IT", withTime ? {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  } : {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

/* ── Redesign helpers ─────────────────────────────────────────────── */

const AVATAR_COLORS = ["#222222", "#3f3f3f", "#6a6a6a", "#460479", "#428bff", "#1a7f50", "#c13515", "#b45309"];

const avatarColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const initialsOf = (firstName: string, lastName: string) =>
  `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

type PillTone = "green" | "red" | "amber" | "violet" | "blue" | "gray" | "pink";

const PILL_TONES: Record<PillTone, string> = {
  green: "border-[#c5e8d4] bg-[#f0faf4] text-[#1a7f50]",
  red: "border-[#fad4cc] bg-[#fff4f2] text-[#c13515]",
  amber: "border-[#f0e060] bg-[#fffce0] text-[#7a6a00]",
  violet: "border-[#e2d0fa] bg-[#f3e8ff] text-[#7c3aed]",
  blue: "border-[#c5d8fa] bg-[#f0f4ff] text-[#1a4fa0]",
  gray: "border-[#dddddd] bg-[#f7f7f7] text-[#929292]",
  pink: "border-[#f0c8df] bg-[#fdf0f6] text-[#92174d]",
};

function Pill({ tone, className, children }: { tone: PillTone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[3px] text-[12px] font-semibold",
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const PHASE_BADGES: Record<NonNullable<Student["studentPhase"]>, { label: string; tone: PillTone }> = {
  AWAITING: { label: "In attesa", tone: "amber" },
  TEORIA: { label: "Teoria", tone: "blue" },
  PRATICA: { label: "Foglio rosa", tone: "pink" },
  PATENTATO: { label: "Patentato", tone: "green" },
};

/** CTA outline compatta delle liste (stile "Dettaglio" del proto) */
const listButtonClass =
  "cursor-pointer select-none whitespace-nowrap rounded-[8px] border border-[#dddddd] bg-white px-3.5 py-[7px] text-[13px] font-medium text-[#222222] transition-colors hover:border-[#cdcdcd] hover:bg-[#f2f2f2] disabled:cursor-default disabled:opacity-50";

/** Link-azione blu inline (proto #428bff) */
const blueLinkClass =
  "cursor-pointer text-[12px] font-medium text-[#428bff] hover:underline disabled:cursor-default disabled:opacity-50";

const sectionLabelClass = "mb-4 text-[12px] font-semibold text-[#929292]";

/** Skeleton primo caricamento: rispecchia la vera lista allievi (toolbar + righe hairline con avatar, testo, pill e bottone) */
function StudentListSkeleton() {
  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-9 w-64 rounded-full" />
        <div className="flex-1" />
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="size-9 rounded-full" />
      </div>
      {/* Righe lista */}
      <div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[2fr_1.5fr_1fr_1fr_110px] items-center gap-3 border-t border-[#ebebeb] px-6 py-5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-36 max-w-full rounded" />
                <Skeleton className="h-3 w-24 max-w-full rounded" />
              </div>
            </div>
            <Skeleton className="h-3.5 w-40 max-w-full rounded" />
            <Skeleton className="h-3.5 w-24 max-w-full rounded" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <div className="flex justify-end">
              <Skeleton className="h-[34px] w-[86px] rounded-[8px]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const getTheoryCountdown = (theoryExamAt: string | null | undefined) => {
  if (!theoryExamAt) return null;
  const exam = new Date(theoryExamAt);
  if (Number.isNaN(exam.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfExam = new Date(exam.getFullYear(), exam.getMonth(), exam.getDate());
  const days = Math.round((startOfExam.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
  let label: string;
  let tone: "imminent" | "soon" | "later" | "expired";
  if (days < 0) {
    label = "Passato";
    tone = "expired";
  } else if (days === 0) {
    label = "Oggi";
    tone = "imminent";
  } else if (days === 1) {
    label = "Domani";
    tone = "imminent";
  } else if (days <= 7) {
    label = `Fra ${days} gg`;
    tone = "imminent";
  } else if (days <= 30) {
    label = `Fra ${days} gg`;
    tone = "soon";
  } else {
    label = `Fra ${days} gg`;
    tone = "later";
  }
  const dateText = exam.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  return { label, tone, dateText };
};

/** Pallino stato pagamenti accanto all'avatar (soglie invariate) */
const unpaidDotColor = (manualUnpaid: number) =>
  manualUnpaid >= 5 ? "#EF4444" : manualUnpaid >= 2 ? "#F59E0B" : manualUnpaid >= 1 ? "#FACC15" : "#22C55E";

function StudentAvatar({ student, size = 40 }: { student: { id: string; firstName: string; lastName: string }; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        background: avatarColor(student.id),
        fontSize: size >= 56 ? 20 : 12,
      }}
    >
      {initialsOf(student.firstName, student.lastName)}
    </div>
  );
}

function EmptyList({ title = "Nessun risultato", subtitle = "Nessun allievo trovato" }: { title?: string; subtitle?: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center border-t border-[#ebebeb] text-center">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="mb-3">
        <circle cx="14" cy="14" r="9" stroke="#dddddd" strokeWidth="2" />
        <path d="M21 21l6 6" stroke="#dddddd" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p className="mb-1 text-sm font-semibold text-foreground">{title}</p>
      <p className="text-[13px] font-medium text-[#929292]">{subtitle}</p>
    </div>
  );
}

const PAGE_SIZE = 25;

/** Pagina corrente della lista, con la pagina clampata al range disponibile. */
function pageSlice<T>(list: T[], page: number): T[] {
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const clamped = Math.min(Math.max(1, page), totalPages);
  return list.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);
}

/** Navigazione pagine "‹ 01 / N ›" in alto a sinistra della tabella (come Utenti). */
function TablePager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex shrink-0 select-none items-center gap-2 text-[13px] font-medium text-[#929292]">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="Pagina precedente"
        className="cursor-pointer px-0.5 text-[#929292] transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40"
      >
        <ChevronLeft className="size-4" strokeWidth={1.8} />
      </button>
      <span>
        {String(page).padStart(2, "0")} / {Math.max(totalPages, 1)}
      </span>
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        aria-label="Pagina successiva"
        className="cursor-pointer px-0.5 text-[#929292] transition-colors hover:text-navy-900 disabled:cursor-default disabled:opacity-40"
      >
        <ChevronRight className="size-4" strokeWidth={1.8} />
      </button>
    </div>
  );
}

type PhaseTab = "attesa" | "teoria" | "pratica" | "patentati";
type PraticaSubTab = "lista" | "cancellazioni";

const PHASE_SUBTITLES: Record<PhaseTab, string> = {
  attesa: "In attesa di attivazione",
  teoria: "In preparazione all'esame teorico",
  pratica: "In preparazione all'esame pratico",
  patentati: "Percorso completato",
};

export function AutoscuoleStudentsPage({
  tabs,
}: {
  tabs?: React.ReactNode;
} = {}) {
  const toast = useFeedbackToast();
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searching, setSearching] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [register, setRegister] = React.useState<StudentRegister | null>(null);
  const [registerLoading, setRegisterLoading] = React.useState(false);
  const [weeklyLimitActive, setWeeklyLimitActive] = React.useState(false);
  const [groupLessonsEnabledGlobal, setGroupLessonsEnabledGlobal] = React.useState(false);
  const [groupOptInSaving, setGroupOptInSaving] = React.useState(false);
  const [examPriorityEnabledGlobal, setExamPriorityEnabledGlobal] = React.useState(false);
  const [exemptSaving, setExemptSaving] = React.useState(false);
  const [examPrioritySaving, setExamPrioritySaving] = React.useState(false);
  const registerRequestRef = React.useRef(0);
  const [credits, setCredits] = React.useState<StudentCredits | null>(null);
  const [creditsLoading, setCreditsLoading] = React.useState(false);
  const [creditsSaving, setCreditsSaving] = React.useState<"grant" | "revoke" | null>(null);
  const [creditsInput, setCreditsInput] = React.useState("1");
  const creditsRequestRef = React.useRef(0);

  const [inviteCode, setInviteCode] = React.useState<string | null>(null);
  const [inviteCodeOpen, setInviteCodeOpen] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  // Crea account allievo
  const company = useAtomValue(companyAtom);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createSaving, setCreateSaving] = React.useState(false);
  const emptyCreateForm = React.useMemo(
    () => ({
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      licenseCategory: "B",
      transmission: "manual",
      assignedInstructorId: "__none__",
      studentPhase: "PRATICA" as "AWAITING" | "TEORIA" | "PRATICA",
    }),
    [],
  );
  const [createForm, setCreateForm] = React.useState(emptyCreateForm);
  const [licenseDefaults, setLicenseDefaults] = React.useState<{
    licenseCategory: string;
    transmission: string;
  }>({ licenseCategory: "B", transmission: "manual" });

  // Payment mode
  const [paymentMode, setPaymentMode] = React.useState<PaymentModeState | null>(null);
  const manualMode = paymentMode !== null && (
    (!paymentMode.auto && !paymentMode.credits) ||
    (paymentMode.credits && !paymentMode.creditsRequired)
  );

  // Instructor clusters
  const [instructorMap, setInstructorMap] = React.useState<Map<string, string>>(new Map());
  const [autonomousInstructors, setAutonomousInstructors] = React.useState<
    Array<{ id: string; name: string; inviteCode: string | null }>
  >([]);
  const [assigningSaving, setAssigningSaving] = React.useState(false);

  // Tabs
  const [phaseTab, setPhaseTab] = React.useState<PhaseTab>("pratica");
  const [praticaSubTab, setPraticaSubTab] = React.useState<PraticaSubTab>("lista");
  const [lateCancellationsCount, setLateCancellationsCount] = React.useState(0);
  const [pages, setPages] = React.useState<Record<PhaseTab, number>>({
    attesa: 1,
    teoria: 1,
    pratica: 1,
    patentati: 1,
  });

  // Panel tabs
  const [drawerTab, setDrawerTab] = React.useState<"summary" | "lessons" | "notes">("summary");
  const [lessonFilter, setLessonFilter] = React.useState<LessonFilter>("all");

  // Booking block toggle
  const [blockSaving, setBlockSaving] = React.useState(false);

  // Phase change dialog
  const [phaseDialogOpen, setPhaseDialogOpen] = React.useState(false);
  const [licenseDialogOpen, setLicenseDialogOpen] = React.useState(false);

  // Quiz seats context (banner + AWAITING grant button)
  type QuizCtx = {
    quizSeats: number;
    used: number;
    available: number;
    phasesEnabled: ("TEORIA" | "PRATICA")[];
    autoAssignQuizOnSignup: boolean;
  };
  const [quizCtx, setQuizCtx] = React.useState<QuizCtx | null>(null);
  const [grantSavingId, setGrantSavingId] = React.useState<string | null>(null);
  const theoryPhaseEnabled = quizCtx?.phasesEnabled.includes("TEORIA") ?? false;

  const refreshQuizCtx = React.useCallback(async () => {
    const res = await getQuizSeatsContext();
    if (res.success) {
      setQuizCtx({
        quizSeats: res.data.quizSeats,
        used: res.data.used,
        available: res.data.available,
        phasesEnabled: res.data.phasesEnabled,
        autoAssignQuizOnSignup: res.data.autoAssignQuizOnSignup,
      });
    }
  }, []);

  React.useEffect(() => {
    void refreshQuizCtx();
  }, [refreshQuizCtx]);

  const handleGrantSeat = async (studentId: string) => {
    setGrantSavingId(studentId);
    try {
      const res = await grantQuizSeat({ studentId });
      if (!res.success) {
        toast.error({ description: res.message ?? "Impossibile assegnare la licenza." });
        return;
      }
      toast.success({ description: res.message ?? "Licenza assegnata." });
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId ? { ...s, studentPhase: "TEORIA" } : s,
        ),
      );
      if (register && register.student.id === studentId) {
        setRegister((prev) => (prev ? { ...prev, studentPhase: "TEORIA" } : prev));
      }
      await refreshQuizCtx();
    } finally {
      setGrantSavingId(null);
    }
  };

  // Group students by phase
  const studentsByPhase = React.useMemo(() => {
    const groups = {
      awaiting: [] as Student[],
      teoria: [] as Student[],
      pratica: [] as Student[],
      patentato: [] as Student[],
    };
    for (const s of students) {
      const phase = s.studentPhase ?? "PRATICA";
      if (phase === "AWAITING") groups.awaiting.push(s);
      else if (phase === "TEORIA") groups.teoria.push(s);
      else if (phase === "PATENTATO") groups.patentato.push(s);
      else groups.pratica.push(s);
    }
    return groups;
  }, [students]);

  // Manual payment toggle
  const [paymentSaving, setPaymentSaving] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    setPages({ attesa: 1, teoria: 1, pratica: 1, patentati: 1 });
  }, [debouncedSearch]);

  const load = React.useCallback(async (isSearch = false) => {
    if (isSearch) setSearching(true); else setLoading(true);
    const res = await getAutoscuolaStudentsWithProgress(debouncedSearch);
    if (!res.success || !res.data) {
      toast.error({
        description: res.message ?? "Impossibile caricare gli allievi.",
      });
      setLoading(false);
      setSearching(false);
      return;
    }
    setStudents(res.data as Student[]);
    setLoading(false);
    setSearching(false);
  }, [debouncedSearch, toast]);

  const selectedStudent = React.useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? null,
    [selectedStudentId, students],
  );

  const loadRegister = React.useCallback(
    async (studentId: string) => {
      const requestId = registerRequestRef.current + 1;
      registerRequestRef.current = requestId;
      setRegisterLoading(true);
      setRegister(null);
      const res = await getAutoscuolaStudentDrivingRegister(studentId);
      if (requestId !== registerRequestRef.current) return;
      if (!res.success || !res.data) {
        toast.error({
          description: res.message ?? "Impossibile caricare il registro guide.",
        });
        setRegisterLoading(false);
        return;
      }
      setRegister(res.data as StudentRegister);
      setRegisterLoading(false);
    },
    [toast],
  );

  const loadCredits = React.useCallback(
    async (studentId: string) => {
      const requestId = creditsRequestRef.current + 1;
      creditsRequestRef.current = requestId;
      setCreditsLoading(true);
      setCredits(null);
      const res = await getAutoscuolaStudentLessonCredits(studentId);
      if (requestId !== creditsRequestRef.current) return;
      if (!res.success || !res.data) {
        toast.error({
          description: res.message ?? "Impossibile caricare i crediti guida.",
        });
        setCreditsLoading(false);
        return;
      }
      setCredits(res.data as StudentCredits);
      setCreditsLoading(false);
    },
    [toast],
  );

  const openStudentDetail = React.useCallback(
    (studentId: string) => {
      setSelectedStudentId(studentId);
      setDrawerTab("summary");
      setLessonFilter("all");
      setPanelOpen(true);
      void loadRegister(studentId);
      void loadCredits(studentId);
    },
    [loadCredits, loadRegister],
  );

  const closeStudentDetail = React.useCallback(() => {
    setPanelOpen(false);
    registerRequestRef.current += 1;
    setSelectedStudentId(null);
    setRegister(null);
    setRegisterLoading(false);
    creditsRequestRef.current += 1;
    setCredits(null);
    setCreditsLoading(false);
    setCreditsSaving(null);
    setCreditsInput("1");
    setDrawerTab("summary");
  }, []);

  const handleAdjustCredits = React.useCallback(
    async (direction: "grant" | "revoke") => {
      if (!selectedStudentId || creditsSaving) return;
      const parsedValue = Number(creditsInput);
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        toast.error({ description: "Inserisci un numero crediti valido." });
        return;
      }
      const delta = Math.max(1, Math.trunc(parsedValue));
      setCreditsSaving(direction);
      const res = await adjustAutoscuolaStudentLessonCredits({
        studentId: selectedStudentId,
        delta,
        reason: direction === "grant" ? "manual_grant" : "manual_revoke",
      });
      if (!res.success || !res.data) {
        toast.error({
          description: res.message ?? "Impossibile aggiornare i crediti.",
        });
        setCreditsSaving(null);
        return;
      }
      toast.success({
        description:
          res.message ??
          (direction === "grant" ? "Crediti assegnati." : "Crediti stornati."),
      });
      await loadCredits(selectedStudentId);
      setCreditsSaving(null);
    },
    [creditsInput, creditsSaving, loadCredits, selectedStudentId, toast],
  );

  const handleToggleBlock = React.useCallback(
    async (blocked: boolean) => {
      if (!selectedStudentId || blockSaving) return;
      setBlockSaving(true);
      const res = await toggleStudentBookingBlock({
        studentId: selectedStudentId,
        blocked,
      });
      setBlockSaving(false);
      if (!res.success) {
        toast.error({ description: res.message ?? "Errore aggiornamento blocco." });
        return;
      }
      toast.success({ description: res.message ?? "Stato aggiornato." });
      // Update local register
      setRegister((prev) => prev ? { ...prev, bookingBlocked: blocked } : prev);
      // Update student in table list
      setStudents((prev) =>
        prev.map((s) =>
          s.id === selectedStudentId ? { ...s, bookingBlocked: blocked } : s,
        ),
      );
    },
    [selectedStudentId, blockSaving, toast],
  );

  const handleSetManualPayment = React.useCallback(
    async (appointmentId: string, status: "paid" | "unpaid") => {
      if (paymentSaving) return;
      setPaymentSaving(appointmentId);
      const res = await setManualPaymentStatus({ appointmentId, status });
      setPaymentSaving(null);
      if (!res.success) {
        toast.error({ description: res.message ?? "Errore aggiornamento." });
        return;
      }
      toast.success({ description: res.message ?? "Stato aggiornato." });
      // Update register locally
      setRegister((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          extendedSummary: prev.extendedSummary
            ? {
                ...prev.extendedSummary,
                manualUnpaid:
                  status === "paid"
                    ? Math.max(0, prev.extendedSummary.manualUnpaid - 1)
                    : prev.extendedSummary.manualUnpaid + 1,
              }
            : prev.extendedSummary,
          lessons: prev.lessons.map((l) =>
            l.id === appointmentId ? { ...l, manualPaymentStatus: status } : l,
          ),
        };
      });
    },
    [paymentSaving, toast],
  );

  const openCreateDialog = React.useCallback(() => {
    setCreateForm({
      ...emptyCreateForm,
      licenseCategory: licenseDefaults.licenseCategory,
      transmission: licenseDefaults.transmission,
      // Fase di partenza: rispecchia la self-registration mobile — se la
      // Teoria è attiva parte da Teoria (posti permettendo) o In attesa.
      studentPhase: theoryPhaseEnabled
        ? quizCtx && quizCtx.autoAssignQuizOnSignup && quizCtx.available > 0
          ? "TEORIA"
          : "AWAITING"
        : "PRATICA",
    });
    setCreateOpen(true);
  }, [emptyCreateForm, licenseDefaults, quizCtx, theoryPhaseEnabled]);

  const handleCreateStudent = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!company?.id || createSaving) return;
      const firstName = createForm.firstName.trim();
      const lastName = createForm.lastName.trim();
      const email = createForm.email.trim();
      if (!firstName || !lastName || !email || !createForm.password) {
        toast.error({ description: "Compila tutti i campi obbligatori." });
        return;
      }
      setCreateSaving(true);
      const res = await createCompanyUser({
        companyId: company.id,
        name: `${firstName} ${lastName}`,
        email,
        password: createForm.password,
        autoscuolaRole: "STUDENT",
        licenseCategory: createForm.licenseCategory,
        transmission: createForm.transmission,
        assignedInstructorId:
          createForm.assignedInstructorId === "__none__" ? null : createForm.assignedInstructorId,
        studentPhase: createForm.studentPhase,
      });
      setCreateSaving(false);
      if (!res.success) {
        toast.error({ description: res.message ?? "Creazione non riuscita." });
        return;
      }
      toast.success({
        title: "Account creato",
        description: `${firstName} ${lastName} può accedere all'app con la sua email.`,
      });
      setCreateOpen(false);
      setCreateForm(emptyCreateForm);
      void load(true);
      if (createForm.studentPhase === "TEORIA") void refreshQuizCtx();
    },
    [company?.id, createForm, createSaving, emptyCreateForm, load, refreshQuizCtx, toast],
  );

  const initialRef = React.useRef(true);
  React.useEffect(() => {
    if (initialRef.current) {
      initialRef.current = false;
      load(false);
    } else {
      load(true);
    }
  }, [load]);

  React.useEffect(() => {
    getCompanyInviteCode().then((res) => {
      if (res.success && res.data) setInviteCode(res.data);
    });
    getAutoscuolaSettings().then((res) => {
      if (res.success && res.data) {
        setWeeklyLimitActive(res.data.weeklyBookingLimitEnabled ?? false);
        setExamPriorityEnabledGlobal(res.data.examPriorityEnabled ?? false);
        setGroupLessonsEnabledGlobal(res.data.groupLessonsEnabled === true);
        setLicenseDefaults({
          licenseCategory: res.data.defaultLicenseCategory ?? "B",
          transmission: res.data.defaultTransmission ?? "manual",
        });
      }
    });
    getAutoscuolaInstructors().then((res) => {
      if (res.success && res.data) {
        setInstructorMap(new Map(res.data.map((i: { id: string; name: string }) => [i.id, i.name])));
        setAutonomousInstructors(
          res.data
            .filter((i: { autonomousMode?: boolean }) => i.autonomousMode)
            .map((i: { id: string; name: string; inviteCode?: string | null }) => ({
              id: i.id,
              name: i.name,
              inviteCode: i.inviteCode ?? null,
            })),
        );
      }
    });
    getPaymentMode().then((res) => {
      if (res.success && res.data) {
        setPaymentMode({
          auto: res.data.autoPaymentsEnabled,
          credits: res.data.lessonCreditFlowEnabled,
          creditsRequired: res.data.lessonCreditsRequired ?? true,
        });
      }
    });
  }, []);

  const phaseTabOptions = React.useMemo(() => {
    const options: Array<{ value: PhaseTab; label: string; count: number }> = [];
    if (theoryPhaseEnabled || studentsByPhase.awaiting.length > 0) {
      options.push({ value: "attesa", label: "In attesa", count: studentsByPhase.awaiting.length });
    }
    if (theoryPhaseEnabled || studentsByPhase.teoria.length > 0) {
      options.push({ value: "teoria", label: "Teoria", count: studentsByPhase.teoria.length });
    }
    options.push({ value: "pratica", label: "Pratica", count: studentsByPhase.pratica.length });
    if (studentsByPhase.patentato.length > 0) {
      options.push({ value: "patentati", label: "Patentati", count: studentsByPhase.patentato.length });
    }
    return options;
  }, [studentsByPhase, theoryPhaseEnabled]);

  // Se il tab attivo sparisce (es. nessun patentato dopo un refetch) torna a Pratica
  React.useEffect(() => {
    if (!phaseTabOptions.some((opt) => opt.value === phaseTab)) {
      setPhaseTab("pratica");
    }
  }, [phaseTab, phaseTabOptions]);

  const copyCode = React.useCallback((code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }, []);

  /* ── Rows ────────────────────────────────────────────────────────── */

  const renderNameCell = (student: Student, options?: { secondLine?: string | null; showDot?: boolean }) => (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative shrink-0">
        <StudentAvatar student={student} />
        {options?.showDot && (
          <span
            className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white"
            style={{ backgroundColor: unpaidDotColor(student.manualUnpaid ?? 0) }}
            title={`${student.manualUnpaid ?? 0} guide da pagare`}
          />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {student.firstName} {student.lastName}
          </span>
          {student.neverAccessed ? (
            <NeverAccessedListMark hasPhone={Boolean(student.phone)} />
          ) : null}
          {student.bookingBlocked && <Pill tone="red">Bloccato</Pill>}
        </div>
        {options?.secondLine ? (
          <p className="mt-0.5 truncate text-[12px] font-medium text-[#929292]">{options.secondLine}</p>
        ) : null}
      </div>
    </div>
  );

  const renderAttesaRows = () => {
    const list = studentsByPhase.awaiting;
    if (list.length === 0) {
      return <EmptyList subtitle={debouncedSearch ? "Nessun allievo trovato" : "Nessun allievo in attesa di attivazione"} />;
    }
    const visible = pageSlice(list, pages.attesa);
    const noSeatsLeft = quizCtx !== null && quizCtx.available <= 0;
    return (
      <div>
        {visible.map((student) => {
          const isSaving = grantSavingId === student.id;
          return (
            <div
              key={student.id}
              className="grid grid-cols-[2fr_1.5fr_1fr_auto] items-center gap-3 border-t border-[#ebebeb] px-6 py-5"
            >
              {renderNameCell(student)}
              <div className="truncate pr-3 text-[13px] font-medium text-[#6a6a6a]">{student.email || "—"}</div>
              <div className="text-[13px] font-medium text-[#929292]">Iscritto il {formatDate(student.createdAt)}</div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className={listButtonClass}
                  disabled={noSeatsLeft || isSaving}
                  title={noSeatsLeft ? "Nessuna licenza disponibile" : "Assegna una licenza quiz"}
                  onClick={() => void handleGrantSeat(student.id)}
                >
                  {isSaving ? "Assegno…" : "Assegna quiz"}
                </button>
                <button type="button" className={listButtonClass} onClick={() => openStudentDetail(student.id)}>
                  Dettaglio
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTeoriaRows = () => {
    const list = studentsByPhase.teoria;
    if (list.length === 0) {
      return <EmptyList subtitle={debouncedSearch ? "Nessun allievo trovato" : "Nessun allievo in fase teoria"} />;
    }
    const visible = pageSlice(list, pages.teoria);
    return (
      <div>
        {visible.map((student) => {
          const countdown = getTheoryCountdown(student.theoryExamAt);
          return (
            <div
              key={student.id}
              className="grid grid-cols-[2fr_1.5fr_1fr_1fr_110px] items-center gap-3 border-t border-[#ebebeb] px-6 py-5"
            >
              {renderNameCell(student, { showDot: true })}
              <div className="truncate pr-3 text-[13px] font-medium text-[#6a6a6a]">{student.email || "—"}</div>
              <div className="text-[13px] font-medium text-foreground">{student.phone || "—"}</div>
              <div>
                {countdown ? (
                  <>
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        countdown.tone === "imminent" ? "text-[#c13515]" : "text-foreground",
                      )}
                    >
                      {countdown.label}
                    </p>
                    <p className="mt-px text-[11px] font-medium text-[#929292]">Esame · {countdown.dateText}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[#929292]">Da fissare</p>
                    <p className="mt-px text-[11px] font-medium text-[#929292]">Esame teoria</p>
                  </>
                )}
              </div>
              <div className="flex justify-end">
                <button type="button" className={listButtonClass} onClick={() => openStudentDetail(student.id)}>
                  Dettaglio
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPraticaRows = () => {
    const list = studentsByPhase.pratica;
    if (list.length === 0) {
      return <EmptyList subtitle={debouncedSearch ? "Nessun allievo trovato" : "Nessun allievo in fase pratica"} />;
    }
    const visible = pageSlice(list, pages.pratica);
    return (
      <div>
        {visible.map((student) => {
          const licenseLabel = student.licenseCategory
            ? `${student.licenseCategory} · ${TRANSMISSION_LABELS[student.transmission as Transmission] ?? student.transmission ?? "—"}`
            : null;
          const instructorLabel = student.assignedInstructorId
            ? instructorMap.get(student.assignedInstructorId) ?? null
            : null;
          const secondLine = [licenseLabel, instructorLabel].filter(Boolean).join(" · ") || null;
          return (
            <div
              key={student.id}
              className="grid grid-cols-[2fr_1.5fr_1fr_1fr_110px] items-center gap-3 border-t border-[#ebebeb] px-6 py-5"
            >
              {renderNameCell(student, { showDot: true, secondLine })}
              <div className="truncate pr-3 text-[13px] font-medium text-[#6a6a6a]">{student.email || "—"}</div>
              <div className="text-[13px] font-medium text-foreground">{student.phone || "—"}</div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {student.summary.completedLessons}/{student.summary.requiredLessons}
                </p>
                <p className="mt-px text-[11px] font-medium text-[#929292]">
                  {student.summary.isCompleted ? "Obbligo completato" : "Guide"}
                </p>
              </div>
              <div className="flex justify-end">
                <button type="button" className={listButtonClass} onClick={() => openStudentDetail(student.id)}>
                  Dettaglio
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPatentatiRows = () => {
    const list = studentsByPhase.patentato;
    if (list.length === 0) {
      return <EmptyList subtitle="Nessun allievo patentato" />;
    }
    const visible = pageSlice(list, pages.patentati);
    return (
      <div>
        {visible.map((student) => (
          <div
            key={student.id}
            className="grid grid-cols-[2fr_1.5fr_1fr_1fr_110px] items-center gap-3 border-t border-[#ebebeb] px-6 py-5"
          >
            {renderNameCell(student)}
            <div className="truncate pr-3 text-[13px] font-medium text-[#6a6a6a]">{student.email || "—"}</div>
            <div className="text-[13px] font-medium text-foreground">{student.phone || "—"}</div>
            <div>
              <Pill tone="green">Patentato</Pill>
            </div>
            <div className="flex justify-end">
              <button type="button" className={listButtonClass} onClick={() => openStudentDetail(student.id)}>
                Dettaglio
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  /* ── Detail panel content ─────────────────────────────────────────── */

  const panelHeaderStudent = selectedStudent ?? register?.student ?? null;

  const renderPanelSummary = () => {
    if (!register) return null;
    const phaseBadge = PHASE_BADGES[register.studentPhase ?? "PRATICA"];
    return (
      <>
        {/* Anagrafica */}
        <section className="border-b border-[#f2f2f2] pb-7">
          <p className={sectionLabelClass}>Anagrafica</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
            <div>
              <p className="mb-0.5 text-[12px] font-medium text-[#929292]">Nome</p>
              <p className="text-sm font-medium text-foreground">
                {register.student.firstName} {register.student.lastName}
              </p>
            </div>
            <div>
              <p className="mb-0.5 text-[12px] font-medium text-[#929292]">Email</p>
              <p className="break-all text-sm font-medium text-foreground">{register.student.email || "—"}</p>
            </div>
            <div>
              <p className="mb-0.5 text-[12px] font-medium text-[#929292]">Telefono</p>
              <p className="text-sm font-medium text-foreground">{register.student.phone || "—"}</p>
            </div>
            <div>
              <p className="mb-0.5 text-[12px] font-medium text-[#929292]">Case attiva</p>
              <p className="text-sm font-medium text-foreground">
                {register.activeCase
                  ? `${register.activeCase.status}${register.activeCase.category ? ` · ${register.activeCase.category}` : ""}`
                  : "Nessuna"}
              </p>
            </div>
            <div>
              <p className="mb-0.5 text-[12px] font-medium text-[#929292]">Percorso patente</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  {register.licenseCategory
                    ? `${register.licenseCategory} · ${
                        TRANSMISSION_LABELS[register.transmission as Transmission] ?? register.transmission ?? "—"
                      }`
                    : "—"}
                </p>
                <button type="button" className={blueLinkClass} onClick={() => setLicenseDialogOpen(true)}>
                  Modifica
                </button>
              </div>
            </div>
            <div>
              <p className="mb-0.5 text-[12px] font-medium text-[#929292]">Fase percorso</p>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={phaseBadge.tone}>{phaseBadge.label}</Pill>
                <button type="button" className={blueLinkClass} onClick={() => setPhaseDialogOpen(true)}>
                  Cambia fase
                </button>
                {register.studentPhase === "AWAITING" && (
                  <button
                    type="button"
                    className={blueLinkClass}
                    disabled={
                      grantSavingId === register.student.id ||
                      (quizCtx !== null && quizCtx.available <= 0)
                    }
                    onClick={() => void handleGrantSeat(register.student.id)}
                    title={
                      quizCtx !== null && quizCtx.available <= 0
                        ? "Nessuna licenza quiz disponibile"
                        : "Assegna licenza quiz e attiva la fase teoria"
                    }
                  >
                    {grantSavingId === register.student.id ? "Assegno…" : "Assegna quiz"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {groupLessonsEnabledGlobal && (
            <div
              className="mt-5 flex cursor-pointer items-center justify-between gap-3 rounded-[10px] bg-[#f8f8f8] p-4"
              onClick={async () => {
                if (groupOptInSaving) return;
                const next = !(register.groupLessonsOptIn ?? false);
                setGroupOptInSaving(true);
                try {
                  const res = await updateStudentGroupLessonOptIn({
                    studentId: register.student.id,
                    optIn: next,
                  });
                  if (res.success) {
                    setRegister((prev) =>
                      prev ? { ...prev, groupLessonsOptIn: next } : prev,
                    );
                    toast.success({ description: res.message ?? "Aggiornato." });
                  } else {
                    toast.error({ description: res.message ?? "Errore." });
                  }
                } catch {
                  toast.error({ description: "Errore aggiornamento." });
                } finally {
                  setGroupOptInSaving(false);
                }
              }}
            >
              <div>
                <p className="text-sm font-semibold text-foreground">Guide di gruppo</p>
                <p className="mt-0.5 text-[12px] font-medium text-[#929292]">
                  {(register.groupLessonsOptIn ?? false)
                    ? "L'allievo può partecipare alle guide di gruppo."
                    : "L'allievo non può partecipare alle guide di gruppo."}
                </p>
              </div>
              <InlineToggle checked={register.groupLessonsOptIn ?? false} size="sm" />
            </div>
          )}
        </section>

        {/* Gestione prenotazioni */}
        <section className="border-b border-[#f2f2f2] py-7">
          <p className={sectionLabelClass}>Gestione prenotazioni</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="mb-1 text-[12px] font-medium text-[#929292]">Prenotazioni</p>
                <Pill tone={register.bookingBlocked ? "red" : "green"}>
                  {register.bookingBlocked ? "Bloccate" : "Attive"}
                </Pill>
              </div>
              <button
                type="button"
                className={blueLinkClass}
                disabled={blockSaving}
                onClick={() => void handleToggleBlock(!register.bookingBlocked)}
              >
                {blockSaving ? "Salvo…" : register.bookingBlocked ? "Sblocca" : "Blocca"}
              </button>
            </div>
            {weeklyLimitActive && (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="mb-1 text-[12px] font-medium text-[#929292]">Limite guide settimanali</p>
                  <Pill tone={register.weeklyBookingLimitExempt ? "blue" : "gray"}>
                    {register.weeklyBookingLimitExempt ? "Esente" : "Soggetto al limite"}
                  </Pill>
                </div>
                <button
                  type="button"
                  className={blueLinkClass}
                  disabled={exemptSaving}
                  onClick={async () => {
                    if (!selectedStudentId || exemptSaving) return;
                    setExemptSaving(true);
                    const res = await toggleWeeklyBookingLimitExempt({
                      studentId: selectedStudentId,
                      exempt: !register.weeklyBookingLimitExempt,
                    });
                    setExemptSaving(false);
                    if (!res.success) {
                      toast.error({ description: res.message ?? "Errore aggiornamento." });
                      return;
                    }
                    setRegister((prev) => prev ? { ...prev, weeklyBookingLimitExempt: !prev.weeklyBookingLimitExempt } : prev);
                    toast.success({ description: register.weeklyBookingLimitExempt ? "Limite riattivato." : "Allievo esente dal limite." });
                  }}
                >
                  {exemptSaving ? "Salvo…" : register.weeklyBookingLimitExempt ? "Riattiva limite" : "Rendi esente"}
                </button>
              </div>
            )}
            {weeklyLimitActive && examPriorityEnabledGlobal && (
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <p className="text-[12px] font-medium text-[#929292]">Priorità esame</p>
                  <span className="text-[10px] font-medium text-[#c1c1c1]">
                    {register.examPriorityOverride === null || register.examPriorityOverride === undefined
                      ? "automatico"
                      : register.examPriorityOverride
                        ? "forzato attivo"
                        : "forzato disattivo"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={register.examPriorityActive ? "blue" : "gray"}>
                    {register.examPriorityActive ? "Priorità attiva" : "Nessuna priorità"}
                  </Pill>
                  <div className="flex items-center gap-1">
                    {([
                      { label: "Auto", value: null },
                      { label: "Forza attivo", value: true },
                      { label: "Forza disattivo", value: false },
                    ] as const).map((opt) => {
                      const active = register.examPriorityOverride === opt.value;
                      return (
                        <button
                          key={String(opt.value)}
                          type="button"
                          disabled={examPrioritySaving}
                          className={cn(
                            "cursor-pointer select-none whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
                            active
                              ? "bg-[#222222] text-white"
                              : "border border-[#dddddd] text-foreground hover:bg-[#f2f2f2]",
                          )}
                          onClick={async () => {
                            if (!selectedStudentId || examPrioritySaving) return;
                            if (register.examPriorityOverride === opt.value) return;
                            setExamPrioritySaving(true);
                            const res = await setExamPriorityOverride({
                              studentId: selectedStudentId,
                              override: opt.value,
                            });
                            setExamPrioritySaving(false);
                            if (!res.success) {
                              toast.error({ description: res.message ?? "Errore aggiornamento." });
                              return;
                            }
                            setRegister((prev) =>
                              prev ? { ...prev, examPriorityOverride: opt.value } : prev,
                            );
                            toast.success({ description: "Priorità esame aggiornata." });
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Istruttore assegnato */}
        {autonomousInstructors.length > 0 && (
          <section className="border-b border-[#f2f2f2] py-7">
            <p className={sectionLabelClass}>Istruttore assegnato</p>
            <Select
              value={selectedStudent?.assignedInstructorId ?? "__none__"}
              onValueChange={async (value) => {
                if (!selectedStudentId || assigningSaving) return;
                setAssigningSaving(true);
                const instrId = value === "__none__" ? null : value;
                const res = await assignStudentToInstructor({
                  studentId: selectedStudentId,
                  instructorId: instrId,
                });
                setAssigningSaving(false);
                if (!res.success) {
                  toast.error({ description: res.message ?? "Errore." });
                  return;
                }
                // Update local state
                setStudents((prev) =>
                  prev.map((s) =>
                    s.id === selectedStudentId
                      ? { ...s, assignedInstructorId: instrId }
                      : s,
                  ),
                );
                toast.success({
                  description: instrId
                    ? `Assegnato a ${instructorMap.get(instrId) ?? "istruttore"}.`
                    : "Rimosso dall'istruttore.",
                });
              }}
            >
              <SelectTrigger className="w-full" disabled={assigningSaving}>
                <SelectValue placeholder="Nessun istruttore" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nessuno (pool generale)</SelectItem>
                {autonomousInstructors.map((instr) => (
                  <SelectItem key={instr.id} value={instr.id}>
                    {instr.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
        )}

        {/* Riepilogo guide — manual mode */}
        {manualMode && register.extendedSummary && (
          <section className="border-b border-[#f2f2f2] py-7">
            <p className={sectionLabelClass}>Riepilogo guide</p>
            <div className="grid grid-cols-4">
              {[
                { label: "Prenotate", value: register.extendedSummary.booked },
                { label: "Completate", value: register.extendedSummary.completed },
                { label: "Annullate", value: register.extendedSummary.cancelled },
                { label: "In programma", value: register.extendedSummary.upcoming },
              ].map((stat, i) => (
                <div key={stat.label} className={cn("py-3 text-center", i < 3 && "border-r border-[#f2f2f2]")}>
                  <p className="text-[22px] font-bold leading-none text-foreground">{stat.value}</p>
                  <p className="mt-1 text-[12px] font-medium text-[#929292]">{stat.label}</p>
                </div>
              ))}
            </div>
            {register.extendedSummary.manualUnpaid > 0 && (
              <div className="mt-3 rounded-[10px] border border-[#f0e060] bg-[#fffce0] px-4 py-2.5">
                <span className="text-sm font-medium text-[#7a6a00]">
                  Da pagare: {register.extendedSummary.manualUnpaid}
                </span>
              </div>
            )}
          </section>
        )}

        {/* Obbligo guide */}
        <section className="border-b border-[#f2f2f2] py-7">
          <p className={cn(sectionLabelClass, "mb-3")}>Obbligo guide</p>
          <div className="mb-2.5 flex items-baseline gap-1">
            <span className="text-[32px] font-bold leading-none tracking-[-1px] text-foreground">
              {register.summary.completedLessons}
            </span>
            <span className="text-base font-medium text-[#929292]">/{register.summary.requiredLessons}</span>
          </div>
          <div className="mb-1.5 h-1 overflow-hidden rounded-[2px] bg-[#f2f2f2]">
            <div
              className="h-full rounded-[2px] bg-navy-900 transition-all"
              style={{
                width: `${Math.min(100, (register.summary.completedLessons / Math.max(1, register.summary.requiredLessons)) * 100)}%`,
              }}
            />
          </div>
          <p className="text-[12px] font-medium text-[#929292]">
            {register.summary.isCompleted
              ? "Obbligo completato"
              : `${register.summary.remaining} rimanenti`}
          </p>
        </section>

        {/* Esame teorico — solo fase teoria */}
        {register.studentPhase === "TEORIA" && (
          <section className="border-b border-[#f2f2f2] py-7">
            <p className={cn(sectionLabelClass, "mb-3")}>Esame teorico</p>
            <div className="flex items-center justify-between gap-3 rounded-[12px] bg-[#f7f7f7] p-4">
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-[#929292]">Data esame</p>
                {(() => {
                  const countdown = getTheoryCountdown(register.theoryExamAt);
                  if (!countdown) {
                    return (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dddddd] bg-white px-2.5 py-[3px]">
                        <span className="size-1.5 rounded-full bg-[#929292]" />
                        <span className="text-[12px] font-semibold text-[#929292]">Da fissare</span>
                      </span>
                    );
                  }
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{countdown.dateText}</span>
                      <Pill tone={countdown.tone === "imminent" ? "red" : countdown.tone === "soon" ? "amber" : "gray"}>
                        {countdown.label}
                      </Pill>
                    </div>
                  );
                })()}
              </div>
              <button
                type="button"
                className="cursor-pointer text-[13px] font-semibold text-[#428bff] hover:underline"
                onClick={() => setPhaseDialogOpen(true)}
              >
                Modifica
              </button>
            </div>
          </section>
        )}

        {/* Tipi guida */}
        {register.byLessonType.length > 0 && (
          <section className="border-b border-[#f2f2f2] py-7">
            <p className={cn(sectionLabelClass, "mb-3")}>Tipi guida completati</p>
            <div className="flex flex-wrap gap-2">
              {register.byLessonType.map((item) => (
                <span
                  key={`${item.type}-${item.count}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#dddddd] bg-white px-3 py-1 text-xs font-medium text-foreground"
                >
                  {formatLessonType(item.type)}
                  <span className="text-[#929292]">{item.count}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Crediti guida — hide in manual mode */}
        {(paymentMode?.auto || paymentMode?.credits) && (
          <section className="py-7">
            <p className={cn(sectionLabelClass, "mb-3")}>Crediti guida</p>
            {creditsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ) : (
              <>
                <div className="mb-3.5 flex items-center justify-between">
                  <div>
                    <p className="mb-0.5 text-[12px] font-medium text-[#929292]">Saldo disponibile</p>
                    <p className="text-2xl font-bold leading-none text-foreground">
                      {credits?.availableCredits ?? 0}
                    </p>
                  </div>
                  <span className="rounded-[4px] border border-[#dddddd] bg-[#f7f7f7] px-2.5 py-1 text-[11px] font-semibold text-[#929292]">
                    {credits?.availableCredits ?? 0} crediti
                  </span>
                </div>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={creditsInput}
                  onChange={(event) => setCreditsInput(event.target.value)}
                  className="mb-2.5"
                  placeholder="Crediti"
                />
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => void handleAdjustCredits("grant")}
                    disabled={creditsSaving !== null}
                    className="w-full"
                  >
                    {creditsSaving === "grant" ? "Assegno…" : "Assegna crediti"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleAdjustCredits("revoke")}
                    disabled={creditsSaving !== null}
                    className="w-full"
                  >
                    {creditsSaving === "revoke" ? "Storno…" : "Storna crediti"}
                  </Button>
                </div>
                {credits?.ledger.length ? (
                  <div className="mt-5">
                    <p className="mb-2.5 text-[12px] font-semibold tracking-[0.3px] text-[#929292]">CRONOLOGIA</p>
                    <div>
                      {credits.ledger.slice(0, 8).map((entry, idx, arr) => (
                        <div
                          key={entry.id}
                          className={cn(
                            "flex items-center justify-between gap-2 py-3",
                            idx < arr.length - 1 && "border-b border-[#f2f2f2]",
                          )}
                        >
                          <div>
                            <p className="text-[13px] font-semibold text-foreground">
                              {formatCreditReason(entry.reason)}
                            </p>
                            <p className="mt-0.5 text-[12px] font-medium text-[#929292]">
                              {formatDate(entry.createdAt, true)}
                              {entry.actorName ? ` · ${entry.actorName}` : ""}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 text-[13px]",
                              entry.delta >= 0 ? "font-bold text-navy-900" : "font-semibold text-[#555555]",
                            )}
                          >
                            {entry.delta >= 0 ? "+" : ""}
                            {entry.delta}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Nessun movimento crediti disponibile.
                  </p>
                )}
              </>
            )}
          </section>
        )}
      </>
    );
  };

  const renderPanelLessons = () => {
    if (!register) return null;
    const sortedLessons = [...register.lessons].sort((a, b) => {
      const aUnpaid = a.manualPaymentStatus !== "paid" && (
        (["completed", "checked_in"].includes(a.status) && manualMode) ||
        a.manualPaymentStatus === "unpaid" ||
        (["cancelled", "no_show"].includes(a.status) && a.lateCancellationAction === "charged" && a.manualPaymentStatus === "unpaid")
      );
      const bUnpaid = b.manualPaymentStatus !== "paid" && (
        (["completed", "checked_in"].includes(b.status) && manualMode) ||
        b.manualPaymentStatus === "unpaid" ||
        (["cancelled", "no_show"].includes(b.status) && b.lateCancellationAction === "charged" && b.manualPaymentStatus === "unpaid")
      );
      if (aUnpaid && !bUnpaid) return -1;
      if (!aUnpaid && bUnpaid) return 1;
      return 0;
    });
    if (!sortedLessons.length) {
      return (
        <div className="pt-8 text-center">
          <p className="text-[13px] font-medium text-[#929292]">Nessuna guida registrata.</p>
        </div>
      );
    }

    // ── Filtri client-side (criteri logici sulle guide già caricate) ──
    const nowMs = Date.now();
    const startMs = (l: LessonEntry) =>
      (l.startsAt instanceof Date ? l.startsAt : new Date(l.startsAt)).getTime();
    // "Da pagare" = solo guide EFFETTUATE non pagate (o annullate con penale non
    // pagata). NON le future programmate (anche se marcate da pagare) e NON quelle
    // coperte da credito (già saldate col pacchetto crediti → mostrano "Coperta da
    // credito", non devono rientrare qui). Stessa definizione usata dal tag/bottone.
    const lessonUnpaid = (l: LessonEntry) =>
      !l.creditApplied &&
      l.manualPaymentStatus !== "paid" &&
      (
        (["completed", "checked_in"].includes(l.status) && manualMode) ||
        (["cancelled", "no_show"].includes(l.status) &&
          l.lateCancellationAction === "charged" &&
          l.manualPaymentStatus === "unpaid")
      );
    const predicates: Record<LessonFilter, (l: LessonEntry) => boolean> = {
      all: () => true,
      upcoming: (l) => ["scheduled", "confirmed"].includes(l.status) && startMs(l) > nowMs,
      unpaid: lessonUnpaid,
      completed: (l) => ["completed", "checked_in"].includes(l.status),
      cancelled: (l) => ["cancelled", "no_show"].includes(l.status),
    };
    // "Da pagare" ha senso solo in modalità pagamento manuale (come i badge).
    const filterDefs: Array<{ value: LessonFilter; label: string }> = [
      { value: "all", label: "Tutte" },
      { value: "upcoming", label: "Future" },
      ...(manualMode ? [{ value: "unpaid" as LessonFilter, label: "Da pagare" }] : []),
      { value: "completed", label: "Completate" },
      { value: "cancelled", label: "Annullate" },
    ];
    const activeFilter = filterDefs.some((f) => f.value === lessonFilter) ? lessonFilter : "all";
    const filteredLessons = sortedLessons.filter(predicates[activeFilter]);

    return (
      <div>
        <div className="mb-4 flex justify-center overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedControl
            value={activeFilter}
            onChange={setLessonFilter}
            options={filterDefs.map((f) => ({
              value: f.value,
              label: f.label,
              count: register.lessons.filter(predicates[f.value]).length,
            }))}
          />
        </div>
        {filteredLessons.length === 0 ? (
          <div className="pt-8 text-center">
            <p className="text-[13px] font-medium text-[#929292]">Nessuna guida per questo filtro.</p>
          </div>
        ) : (
          filteredLessons.map((lesson) => {
          const isCompleted = lesson.status === "completed";
          const isCheckedIn = lesson.status === "checked_in";
          const isCancelled = lesson.status === "cancelled";
          const isNoShow = lesson.status === "no_show";
          const creditsActiveNotRequired = paymentMode?.credits && !paymentMode?.creditsRequired;
          const creditsActiveRequired = paymentMode?.credits && paymentMode?.creditsRequired;
          const showPaymentToggle =
            manualMode &&
            !creditsActiveRequired &&
            (creditsActiveNotRequired
              ? (isCompleted || isCheckedIn)
              : (isCompleted || isCheckedIn || lesson.manualPaymentStatus === "unpaid"));
          const isPenaltyCharged =
            (isCancelled || isNoShow) &&
            lesson.lateCancellationAction === "charged" &&
            lesson.manualPaymentStatus === "unpaid";
          const isPenaltyPaid =
            (isCancelled || isNoShow) &&
            lesson.lateCancellationAction === "charged" &&
            lesson.manualPaymentStatus === "paid";
          const startDate = lesson.startsAt instanceof Date ? lesson.startsAt : new Date(lesson.startsAt);
          const endDate = new Date(startDate.getTime() + lesson.durationMinutes * 60000);
          const isExam = lesson.type === "esame";

          return (
            <div key={lesson.id} className="flex gap-4 border-b border-[#f2f2f2] py-4">
              <div className="min-w-[56px] pt-0.5 text-[12px] font-medium text-[#929292]">
                {startDate.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
              </div>
              <div className="flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {startDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                    {" – "}
                    {endDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {lesson.group ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[12px] font-semibold",
                        lesson.group.kind === "moto"
                          ? "bg-[#FFF4EA] text-[#C2410C]"
                          : "bg-[#ECFDF5] text-[#0f766e]",
                      )}
                    >
                      <Users className="size-3" strokeWidth={2.2} />
                      {lesson.group.kind === "moto" ? "Gruppo moto" : "Guida di gruppo"} ·{" "}
                      {lesson.group.filled}/{lesson.group.capacity}
                    </span>
                  ) : (
                    (lesson.types?.length ? lesson.types : [lesson.type]).map((t: string, i: number) => (
                      <span
                        key={i}
                        className={cn(
                          "rounded-[4px] px-2 py-0.5 text-[12px] font-semibold",
                          isExam ? "bg-[#f3e8ff] text-[#7c3aed]" : "bg-[#f0f4ff] text-[#428bff]",
                        )}
                      >
                        {formatLessonType(t)}
                      </span>
                    ))
                  )}
                </div>
                <p className="mb-2 text-[13px] font-medium text-[#6a6a6a]">
                  {lesson.durationMinutes} min · {lesson.instructorName || "Istruttore n/d"} · {lesson.vehicleName || "Veicolo n/d"}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone={isCompleted || isCheckedIn ? "green" : isCancelled || isNoShow ? "red" : "gray"}>
                    {formatStatus(lesson.status)}
                  </Pill>
                  {isPenaltyCharged && !lesson.creditApplied && (
                    <Pill tone="amber">Da pagare</Pill>
                  )}
                  {isPenaltyCharged && lesson.creditApplied && (
                    <Pill tone="violet">Coperta da credito</Pill>
                  )}
                  {isPenaltyPaid && <Pill tone="green">Pagata</Pill>}
                  {!isPenaltyCharged && !isPenaltyPaid && lesson.creditApplied && (
                    <Pill tone="violet">Coperta da credito</Pill>
                  )}
                  {!isPenaltyCharged && !isPenaltyPaid && !lesson.creditApplied && lesson.manualPaymentStatus === "paid" && manualMode && (
                    <Pill tone="green">Pagata</Pill>
                  )}
                  {!isPenaltyCharged && !isPenaltyPaid && !lesson.creditApplied && manualMode && (isCompleted || isCheckedIn) && lesson.manualPaymentStatus !== "paid" && (
                    <Pill tone="amber">Da pagare</Pill>
                  )}
                  {(showPaymentToggle || isPenaltyCharged || isPenaltyPaid) && !lesson.creditApplied && (
                    <>
                      {lesson.manualPaymentStatus !== "paid" && (
                        <button
                          type="button"
                          className={cn(blueLinkClass, "ml-1")}
                          disabled={paymentSaving === lesson.id}
                          onClick={() => void handleSetManualPayment(lesson.id, "paid")}
                        >
                          {paymentSaving === lesson.id ? "Salvo…" : "Segna pagata"}
                        </button>
                      )}
                      {lesson.manualPaymentStatus === "paid" && (
                        <button
                          type="button"
                          className={cn(blueLinkClass, "ml-1")}
                          disabled={paymentSaving === lesson.id}
                          onClick={() => void handleSetManualPayment(lesson.id, "unpaid")}
                        >
                          {paymentSaving === lesson.id ? "Salvo…" : "Segna da pagare"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
          })
        )}
      </div>
    );
  };

  const renderPanelNotes = () => {
    if (!register) return null;
    if (!register.lessons.length) {
      return (
        <div className="pt-8 text-center">
          <p className="text-[13px] font-medium text-[#929292]">Nessuna guida registrata.</p>
        </div>
      );
    }
    return (
      <div>
        {register.lessons.map((lesson) => {
          const hasNote = !!lesson.notes?.trim();
          const isExam = lesson.type === "esame";
          const startDate = lesson.startsAt instanceof Date ? lesson.startsAt : new Date(lesson.startsAt);
          const endDate = new Date(startDate.getTime() + lesson.durationMinutes * 60000);
          return (
            <div key={lesson.id} className="flex gap-4 border-b border-[#f2f2f2] py-4">
              <div className="min-w-[56px] pt-0.5 text-[12px] font-medium text-[#929292]">
                {startDate.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
              </div>
              <div className="flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {startDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                    {" – "}
                    {endDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {lesson.group ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[12px] font-semibold",
                        lesson.group.kind === "moto"
                          ? "bg-[#FFF4EA] text-[#C2410C]"
                          : "bg-[#ECFDF5] text-[#0f766e]",
                      )}
                    >
                      <Users className="size-3" strokeWidth={2.2} />
                      {lesson.group.kind === "moto" ? "Gruppo moto" : "Guida di gruppo"} ·{" "}
                      {lesson.group.filled}/{lesson.group.capacity}
                    </span>
                  ) : (
                    (lesson.types?.length ? lesson.types : [lesson.type]).map((t: string, i: number) => (
                      <span
                        key={i}
                        className={cn(
                          "rounded-[4px] px-2 py-0.5 text-[12px] font-semibold",
                          isExam ? "bg-[#f3e8ff] text-[#7c3aed]" : "bg-[#f0f4ff] text-[#428bff]",
                        )}
                      >
                        {formatLessonType(t)}
                      </span>
                    ))
                  )}
                  {lesson.rating != null && (
                    <span className="ml-auto flex items-center gap-0.5 text-[10px]">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} className={i < lesson.rating! ? "text-yellow-400" : "text-gray-200"}>★</span>
                      ))}
                    </span>
                  )}
                </div>
                <p className="mb-1.5 text-[13px] font-medium text-[#6a6a6a]">
                  {lesson.instructorName || "Istruttore n/d"} · {lesson.vehicleName || "Veicolo n/d"}
                </p>
                <p
                  className={cn(
                    "text-[13px] leading-relaxed",
                    hasNote ? "font-medium text-foreground" : "font-medium italic text-[#929292]",
                  )}
                >
                  {lesson.notes?.trim() || "Nessuna nota"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <PageWrapper
      title="Allievi"
      subTitle="Allievi sincronizzati dalla Directory utenti."
      hideHero
    >
      <div className="relative w-full space-y-5" data-testid="autoscuole-students-page">
        {tabs}

        <div className="mx-auto max-w-7xl space-y-6">
          <PageHeader
            title="Allievi"
            subtitle={[
              `${students.length} allievi`,
              phaseTab === "pratica" && praticaSubTab === "cancellazioni"
                ? "Cancellazioni tardive da gestire"
                : PHASE_SUBTITLES[phaseTab],
            ]}
          />

          {loading ? (
            <StudentListSkeleton />
          ) : (
            <FadeIn className="space-y-6">
              {/* ── Toolbar ── */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Paginazione tabella, primo elemento a sinistra (come Utenti) */}
                {!(phaseTab === "pratica" && praticaSubTab === "cancellazioni") &&
                  (() => {
                    const activeList =
                      phaseTab === "attesa"
                        ? studentsByPhase.awaiting
                        : phaseTab === "teoria"
                          ? studentsByPhase.teoria
                          : phaseTab === "pratica"
                            ? studentsByPhase.pratica
                            : studentsByPhase.patentato;
                    const totalPages = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
                    const page = Math.min(Math.max(1, pages[phaseTab]), totalPages);
                    return (
                      <TablePager
                        page={page}
                        totalPages={totalPages}
                        onPage={(next) =>
                          setPages((prev) => ({
                            ...prev,
                            [phaseTab]: Math.min(Math.max(1, next), totalPages),
                          }))
                        }
                      />
                    );
                  })()}
                <SegmentedPill
                  value={phaseTab}
                  onChange={(next) => setPhaseTab(next)}
                  options={phaseTabOptions}
                />
                {phaseTab === "pratica" && (
                  <>
                    <div className="mx-1 h-5 w-px shrink-0 bg-[#dddddd]" />
                    {([
                      { key: "lista" as const, label: "Lista", badge: null },
                      {
                        key: "cancellazioni" as const,
                        label: "Cancellazioni tardive",
                        badge: lateCancellationsCount > 0 ? lateCancellationsCount : null,
                      },
                    ]).map((sub) => {
                      const active = praticaSubTab === sub.key;
                      return (
                        <button
                          key={sub.key}
                          type="button"
                          onClick={() => setPraticaSubTab(sub.key)}
                          className={cn(
                            "flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[13px] transition-colors",
                            active
                              ? "bg-[#222222] font-semibold text-white"
                              : "border border-[#dddddd] font-medium text-foreground hover:bg-[#f7f7f7]",
                          )}
                        >
                          {sub.label}
                          {sub.badge != null && (
                            <span
                              className={cn(
                                "rounded-full px-1.5 text-[11px] font-semibold",
                                active ? "bg-white/20 text-white" : "bg-[#f2f2f2] text-[#6a6a6a]",
                              )}
                            >
                              {sub.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </>
                )}

                <div className="flex-1" />

                {inviteCode && (
                  <button
                    type="button"
                    title="Codice autoscuola"
                    onClick={() => setInviteCodeOpen(true)}
                    className="flex size-9 shrink-0 cursor-pointer items-center justify-center text-[#929292] transition-colors hover:text-foreground"
                  >
                    <KeyRound className="size-[21px]" strokeWidth={1.8} />
                  </button>
                )}
                <button
                  type="button"
                  title="Crea account allievo"
                  onClick={openCreateDialog}
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center text-[#929292] transition-colors hover:text-foreground"
                >
                  <UserRoundPlus className="size-[21px]" strokeWidth={1.8} />
                </button>
                <ExpandingSearch
                  open={searchOpen}
                  onOpenChange={setSearchOpen}
                  value={search}
                  onChange={setSearch}
                  placeholder="Cerca allievi"
                />
              </div>

              {/* ── Banner licenze quiz ── */}
              {quizCtx && theoryPhaseEnabled && (phaseTab === "attesa" || phaseTab === "teoria") && (
                <section className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#dddddd] bg-white px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-[#f7f7f7]">
                      <Ticket className="size-4 text-[#6a6a6a]" aria-hidden />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Licenze Quiz Teoria</p>
                      <p className="text-[12px] font-medium text-[#929292]">
                        {quizCtx.autoAssignQuizOnSignup
                          ? "Assegnazione automatica alla registrazione attiva"
                          : "Assegnazione manuale: gli allievi nuovi entrano in attesa"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[11px] font-medium text-[#929292]">Posti usati</p>
                      <p
                        className={cn(
                          "text-base font-bold tabular-nums",
                          quizCtx.available <= 0 ? "text-[#c13515]" : "text-foreground",
                        )}
                      >
                        {quizCtx.used} <span className="font-medium text-[#929292]">/ {quizCtx.quizSeats}</span>
                      </p>
                    </div>
                    {quizCtx.available <= 0 && <Pill tone="red">Posti esauriti</Pill>}
                  </div>
                </section>
              )}

              {/* ── Content ── */}
              <div className="relative">
                <div className={cn("transition-opacity", searching && "pointer-events-none opacity-60")}>
                  {phaseTab === "attesa" && renderAttesaRows()}
                  {phaseTab === "teoria" && renderTeoriaRows()}
                  {phaseTab === "pratica" && praticaSubTab === "lista" && renderPraticaRows()}
                  {phaseTab === "pratica" && praticaSubTab === "cancellazioni" && (
                    <AutoscuoleLateCancellationsPanel onCountChange={setLateCancellationsCount} />
                  )}
                  {phaseTab === "patentati" && renderPatentatiRows()}
                </div>
              </div>
            </FadeIn>
          )}
        </div>
      </div>

      {/* ── Dialog: crea account allievo ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crea account allievo</DialogTitle>
            <DialogDescription>
              Crea direttamente l&apos;account: l&apos;allievo accede all&apos;app con email e password scelte qui.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateStudent} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="create-first-name">Nome</Label>
                <Input
                  id="create-first-name"
                  placeholder="Mario"
                  value={createForm.firstName}
                  onChange={(event) => setCreateForm((p) => ({ ...p, firstName: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-last-name">Cognome</Label>
                <Input
                  id="create-last-name"
                  placeholder="Rossi"
                  value={createForm.lastName}
                  onChange={(event) => setCreateForm((p) => ({ ...p, lastName: event.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="allievo@esempio.com"
                value={createForm.email}
                onChange={(event) => setCreateForm((p) => ({ ...p, email: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Password</Label>
              <Input
                id="create-password"
                type="password"
                placeholder="••••••••"
                value={createForm.password}
                onChange={(event) => setCreateForm((p) => ({ ...p, password: event.target.value }))}
                required
                minLength={6}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Categoria patente</Label>
                <Select
                  value={createForm.licenseCategory}
                  onValueChange={(value) => setCreateForm((p) => ({ ...p, licenseCategory: value }))}
                >
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LICENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat} className="cursor-pointer">
                        {LICENSE_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cambio</Label>
                <Select
                  value={createForm.transmission}
                  onValueChange={(value) => setCreateForm((p) => ({ ...p, transmission: value }))}
                >
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSMISSIONS.map((t) => (
                      <SelectItem key={t} value={t} className="cursor-pointer">
                        {TRANSMISSION_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {theoryPhaseEnabled && (
              <div className="space-y-2">
                <Label>Fase di partenza</Label>
                <Select
                  value={createForm.studentPhase}
                  onValueChange={(value) =>
                    setCreateForm((p) => ({ ...p, studentPhase: value as "AWAITING" | "TEORIA" | "PRATICA" }))
                  }
                >
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AWAITING" className="cursor-pointer">In attesa</SelectItem>
                    <SelectItem
                      value="TEORIA"
                      className="cursor-pointer"
                      disabled={quizCtx !== null && quizCtx.available <= 0}
                    >
                      Teoria{quizCtx !== null && quizCtx.available <= 0 ? " — posti quiz esauriti" : ""}
                    </SelectItem>
                    <SelectItem value="PRATICA" className="cursor-pointer">Foglio rosa</SelectItem>
                  </SelectContent>
                </Select>
                {quizCtx && (
                  <p className="text-xs text-muted-foreground">
                    Teoria consuma una licenza quiz ({quizCtx.available} disponibil{quizCtx.available === 1 ? "e" : "i"}).
                  </p>
                )}
              </div>
            )}
            {autonomousInstructors.length > 0 && (
              <div className="space-y-2">
                <Label>Istruttore assegnato (facoltativo)</Label>
                <Select
                  value={createForm.assignedInstructorId}
                  onValueChange={(value) => setCreateForm((p) => ({ ...p, assignedInstructorId: value }))}
                >
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder="Nessun istruttore" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="cursor-pointer">
                      Nessuno (pool generale)
                    </SelectItem>
                    {autonomousInstructors.map((instr) => (
                      <SelectItem key={instr.id} value={instr.id} className="cursor-pointer">
                        {instr.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={createSaving} className="w-full sm:w-auto">
                {createSaving ? (
                  <LoadingDots />
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Crea account
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: codici di accesso ── */}
      <Dialog open={inviteCodeOpen} onOpenChange={setInviteCodeOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Codice autoscuola</DialogTitle>
            <DialogDescription>
              Condividi questo codice per dare accesso a Reglo. Al momento della registrazione,
              chi utilizza questo codice verrà automaticamente associato alla tua autoscuola.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between rounded-[12px] border border-[#dddddd] bg-[#f7f7f7] px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <KeyRound className="size-4 text-[#929292]" strokeWidth={1.9} />
              <span className="text-[12px] font-medium text-[#929292]">Il tuo codice</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold tracking-[2px] text-foreground">{inviteCode}</span>
              <button
                type="button"
                onClick={() => inviteCode && copyCode(inviteCode)}
                className="cursor-pointer select-none rounded-[8px] border border-[#cfcfdc] bg-navy-50 px-3 py-1.5 text-[13px] font-semibold text-navy-900 transition-colors hover:bg-[#e2e2e8]"
              >
                {copiedCode === inviteCode ? "Copiato!" : "Copia"}
              </button>
            </div>
          </div>
          {autonomousInstructors.some((instr) => instr.inviteCode) && (
            <div className="mt-1">
              <p className="mb-1 text-[12px] font-semibold text-[#929292]">Chiavi istruttori autonomi</p>
              <p className="mb-3 text-[12px] font-medium text-[#929292]">
                Chi si registra con la chiave di un istruttore viene iscritto all&apos;autoscuola e
                assegnato direttamente a lui.
              </p>
              <div className="overflow-hidden rounded-[12px] border border-[#dddddd]">
                {autonomousInstructors
                  .filter((instr) => instr.inviteCode)
                  .map((instr, idx, arr) => (
                    <div
                      key={instr.id}
                      className={cn(
                        "flex items-center justify-between gap-3 bg-white px-4 py-3",
                        idx < arr.length - 1 && "border-b border-[#f2f2f2]",
                      )}
                    >
                      <span className="truncate text-[13px] font-semibold text-foreground">{instr.name}</span>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-[15px] font-bold tracking-[2px] text-foreground">
                          {instr.inviteCode}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyCode(instr.inviteCode!)}
                          className="cursor-pointer select-none rounded-[8px] border border-[#dddddd] bg-white px-2.5 py-1 text-[12px] font-semibold text-foreground transition-colors hover:bg-[#f2f2f2]"
                        >
                          {copiedCode === instr.inviteCode ? "Copiato!" : "Copia"}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Detail panel ── */}
      <DetailPanel
        open={panelOpen}
        onOpenChange={(next) => {
          if (!next) closeStudentDetail();
        }}
        testId="student-detail-panel"
      >
        <div className="border-b border-[#dddddd] px-6 pt-6">
          <div className="relative mb-5 flex flex-col items-center pt-2 text-center">
            <button
              type="button"
              aria-label="Chiudi"
              onClick={closeStudentDetail}
              className="absolute right-0 top-0 flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f2f2f2]"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3l8 8M11 3l-8 8" stroke="#6a6a6a" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            {panelHeaderStudent && <StudentAvatar student={panelHeaderStudent} size={56} />}
            <div className="mt-3">
              <p className="text-lg font-bold tracking-[-0.2px] text-foreground">
                {panelHeaderStudent
                  ? `${panelHeaderStudent.firstName} ${panelHeaderStudent.lastName}`
                  : "Dettaglio allievo"}
              </p>
              <p className="mt-0.5 text-[13px] font-medium text-[#929292]">
                {register?.student.email || register?.student.phone || selectedStudent?.email || ""}
              </p>
              {register?.bookingBlocked && (
                <div className="mt-2 flex justify-center">
                  <Pill tone="red">Prenotazioni bloccate</Pill>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-stretch">
            {([
              { key: "summary" as const, label: "Riepilogo" },
              { key: "lessons" as const, label: "Guide" },
              { key: "notes" as const, label: register ? `Note${register.lessons.filter(l => l.notes?.trim()).length ? ` (${register.lessons.filter(l => l.notes?.trim()).length})` : ""}` : "Note" },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setDrawerTab(tab.key)}
                className={cn(
                  "flex-1 cursor-pointer select-none border-b-2 px-2 py-3 text-center text-sm transition-colors",
                  drawerTab === tab.key
                    ? "border-[#222222] font-semibold text-foreground"
                    : "border-transparent font-medium text-[#6a6a6a] hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {registerLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-56 w-full rounded-2xl" />
            </div>
          ) : register ? (
            <>
              {drawerTab === "summary" && renderPanelSummary()}
              {drawerTab === "lessons" && renderPanelLessons()}
              {drawerTab === "notes" && renderPanelNotes()}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Seleziona un allievo per visualizzare il registro guide.
            </p>
          )}
        </div>
      </DetailPanel>

      {register && selectedStudentId && (
        <ChangeStudentPhaseDialog
          open={phaseDialogOpen}
          onOpenChange={setPhaseDialogOpen}
          studentId={selectedStudentId}
          studentName={`${register.student.firstName} ${register.student.lastName}`}
          currentPhase={register.studentPhase ?? "PRATICA"}
          currentTheoryExamAt={register.theoryExamAt ?? null}
          phasesEnabled={quizCtx?.phasesEnabled}
          hasQuizSeat={Boolean(register.quizSeatGrantedAt)}
          quizSeatsAvailable={quizCtx?.available ?? 0}
          onSuccess={({ phase, theoryExamAt, grantedSeat }) => {
            setRegister((prev) =>
              prev
                ? {
                    ...prev,
                    studentPhase: phase,
                    theoryExamAt,
                    ...(grantedSeat && { quizSeatGrantedAt: new Date().toISOString() }),
                  }
                : prev,
            );
            setStudents((prev) =>
              prev.map((s) =>
                s.id === selectedStudentId ? { ...s, studentPhase: phase } : s,
              ),
            );
            if (grantedSeat) {
              refreshQuizCtx();
            }
          }}
        />
      )}
      {register && selectedStudentId && (
        <EditStudentLicenseDialog
          open={licenseDialogOpen}
          onOpenChange={setLicenseDialogOpen}
          studentId={selectedStudentId}
          studentName={`${register.student.firstName} ${register.student.lastName}`}
          currentLicenseCategory={register.licenseCategory ?? null}
          currentTransmission={register.transmission ?? null}
          onSuccess={({ licenseCategory, transmission }) => {
            setRegister((prev) =>
              prev ? { ...prev, licenseCategory, transmission } : prev,
            );
            setStudents((prev) =>
              prev.map((s) =>
                s.id === selectedStudentId
                  ? { ...s, licenseCategory, transmission }
                  : s,
              ),
            );
          }}
        />
      )}
    </PageWrapper>
  );
}
