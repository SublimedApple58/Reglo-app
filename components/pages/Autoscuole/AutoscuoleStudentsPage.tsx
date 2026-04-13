"use client";

import Link from "next/link";
import React from "react";
import { BookOpen, ExternalLink, FileText, GraduationCap, Loader2, MailPlus, NotebookPen, UserPlus } from "lucide-react";
import { useLocale } from "next-intl";

import { cn } from "@/lib/utils";
import { PageWrapper } from "@/components/Layout/PageWrapper";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  adjustAutoscuolaStudentLessonCredits,
  getAutoscuolaStudentDrivingRegister,
  getAutoscuolaStudentLessonCredits,
  getAutoscuolaStudentsWithProgress,
  getAutoscuolaInstructors,
  getCompanyInviteCode,
  getPaymentMode,
  toggleStudentBookingBlock,
  toggleWeeklyBookingLimitExempt,
  setExamPriorityOverride,
  setManualPaymentStatus,
} from "@/lib/actions/autoscuole.actions";
import { getAutoscuolaSettings } from "@/lib/actions/autoscuole-settings.actions";
import { inviteAutoscuolaStudent } from "@/lib/actions/invite.actions";
import { TableSkeleton } from "@/components/ui/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  InputButton,
  InputButtonAction,
  InputButtonInput,
  InputButtonProvider,
  InputButtonSubmit,
} from "@/components/animate-ui/buttons/input";
import { ManagementBar } from "@/components/animate-ui/ui-elements/management-bar";
import { LottieLoadingOverlay } from "@/components/ui/lottie-loading-overlay";
import { RegloTabs } from "@/components/ui/reglo-tabs";
import { AutoscuoleLateCancellationsPanel } from "./AutoscuoleLateCancellationsPanel";

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
  assignedInstructorId?: string | null;
  manualUnpaid?: number;
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
};

type StudentRegister = {
  student: StudentProfile;
  bookingBlocked?: boolean;
  weeklyBookingLimitExempt?: boolean;
  examPriorityOverride?: boolean | null;
  examPriorityActive?: boolean;
  examDate?: string | null;
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

type SubTab = "students" | "late_cancellations";

export function AutoscuoleStudentsPage({
  tabs,
}: {
  tabs?: React.ReactNode;
} = {}) {
  const locale = useLocale();
  const isMobile = useIsMobile();
  const toast = useFeedbackToast();
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searching, setSearching] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [register, setRegister] = React.useState<StudentRegister | null>(null);
  const [registerLoading, setRegisterLoading] = React.useState(false);
  const [weeklyLimitActive, setWeeklyLimitActive] = React.useState(false);
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

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [invitePlatform, setInvitePlatform] = React.useState<"ios" | "android" | "none">("none");
  const [inviteSending, setInviteSending] = React.useState(false);

  // Payment mode
  const [paymentMode, setPaymentMode] = React.useState<PaymentModeState | null>(null);
  const manualMode = paymentMode !== null && (
    (!paymentMode.auto && !paymentMode.credits) ||
    (paymentMode.credits && !paymentMode.creditsRequired)
  );

  // Instructor clusters
  const [instructorMap, setInstructorMap] = React.useState<Map<string, string>>(new Map());

  // Sub-tabs
  const [activeSubTab, setActiveSubTab] = React.useState<SubTab>("students");
  const [lateCancellationsCount, setLateCancellationsCount] = React.useState(0);

  // Drawer tabs
  const [drawerTab, setDrawerTab] = React.useState<"summary" | "lessons" | "notes">("summary");

  // Booking block toggle
  const [blockSaving, setBlockSaving] = React.useState(false);

  // Manual payment toggle
  const [paymentSaving, setPaymentSaving] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

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

  const handleInvite = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const email = inviteEmail.trim();
      if (!email) {
        toast.error({ description: "Inserisci un indirizzo email." });
        return;
      }
      setInviteSending(true);
      const res = await inviteAutoscuolaStudent({
        email,
        platform: invitePlatform === "none" ? undefined : invitePlatform,
      });
      setInviteSending(false);
      if (!res.success) {
        toast.error({ description: res.message ?? "Invito non riuscito." });
        return;
      }
      toast.success({ title: "Invito inviato", description: `Email inviata a ${email}.` });
      setInviteEmail("");
      setInvitePlatform("none");
      setInviteOpen(false);
    },
    [inviteEmail, invitePlatform, toast],
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
      }
    });
    getAutoscuolaInstructors().then((res) => {
      if (res.success && res.data) {
        setInstructorMap(new Map(res.data.map((i: { id: string; name: string }) => [i.id, i.name])));
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

  const subTabItems = React.useMemo(
    () => [
      { key: "students" as const, label: "Allievi" },
      {
        key: "late_cancellations" as const,
        label: lateCancellationsCount > 0
          ? `Cancellazioni tardive (${lateCancellationsCount})`
          : "Cancellazioni tardive",
      },
    ],
    [lateCancellationsCount],
  );

  return (
    <PageWrapper
      title="Allievi"
      subTitle="Allievi sincronizzati dalla Directory utenti."
    >
      <div className="relative w-full space-y-5">
        {tabs}

        <RegloTabs
          items={subTabItems}
          activeKey={activeSubTab}
          onChange={setActiveSubTab}
          ariaLabel="Sezioni allievi"
        />

        {activeSubTab === "late_cancellations" ? (
          <AutoscuoleLateCancellationsPanel
            onCountChange={setLateCancellationsCount}
          />
        ) : (
          <>
            {inviteCode ? (
              <div className="flex items-center gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-3">
                <span className="text-sm text-muted-foreground">Codice autoscuola:</span>
                <span className="text-base font-bold tracking-wider text-yellow-800">{inviteCode}</span>
                <button
                  type="button"
                  className="ml-auto text-xs font-medium text-pink-500 hover:text-pink-600 transition"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteCode);
                  }}
                >
                  Copia
                </button>
              </div>
            ) : null}

            {loading ? (
              <TableSkeleton rows={6} cols={7} />
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setDebouncedSearch(search);
                    }}
                    className="w-full sm:max-w-sm"
                  >
                    <InputButtonProvider showInput setShowInput={() => {}} className="w-full">
                      <InputButton className="w-full">
                        <InputButtonAction className="hidden" />
                        <InputButtonSubmit
                          onClick={() => {}}
                          type="submit"
                          className="bg-foreground text-background hover:bg-foreground/90"
                        />
                      </InputButton>
                      <InputButtonInput
                        type="text"
                        placeholder="Cerca allievi"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pr-14 text-sm"
                      />
                    </InputButtonProvider>
                  </form>

                  <ManagementBar
                    totalRows={students.length}
                    actions={[
                      {
                        id: "invite-student",
                        label: "Invita allievo",
                        icon: MailPlus,
                        variant: "default",
                        onClick: () => setInviteOpen(true),
                      },
                      {
                        id: "directory",
                        label: "Directory utenti",
                        icon: ExternalLink,
                        variant: "outline" as const,
                        onClick: () => {
                          window.location.href = `/${locale}/admin/users`;
                        },
                      },
                    ]}
                  />
                </div>

                <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Invita allievo</DialogTitle>
                      <DialogDescription>
                        Invia un invito via email. L&apos;allievo riceverà un link per accedere all&apos;app.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleInvite} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="invite-email">Email</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          placeholder="allievo@esempio.com"
                          value={inviteEmail}
                          onChange={(event) => setInviteEmail(event.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Piattaforma</Label>
                        <Select
                          value={invitePlatform}
                          onValueChange={(value) => setInvitePlatform(value as "ios" | "android" | "none")}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona piattaforma" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Non specificata</SelectItem>
                            <SelectItem value="ios">iOS (iPhone)</SelectItem>
                            <SelectItem value="android">Android</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Usato per mostrare il link corretto all&apos;app store nell&apos;email.
                        </p>
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={inviteSending} className="w-full sm:w-auto">
                          {inviteSending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <UserPlus className="mr-2 h-4 w-4" />
                          )}
                          {inviteSending ? "Invio in corso…" : "Invia invito"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>

                {searching ? (
                  <div className="relative">
                    <LottieLoadingOverlay visible />
                    <div className="pointer-events-none opacity-40">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Allievo</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Telefono</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Guide</TableHead>
                            <TableHead className="text-right">Azioni</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell colSpan={6} className="h-48" />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Allievo</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Telefono</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Guide completate</TableHead>
                      <TableHead>Obbligo</TableHead>
                      <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.length ? (
                      students.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div
                                className="size-2.5 shrink-0 rounded-full"
                                style={{
                                  backgroundColor:
                                    (student.manualUnpaid ?? 0) >= 5
                                      ? '#EF4444'   // red — 5+ unpaid
                                      : (student.manualUnpaid ?? 0) >= 2
                                        ? '#F59E0B' // amber — 2-4 unpaid
                                        : (student.manualUnpaid ?? 0) >= 1
                                          ? '#FACC15' // yellow — 1 unpaid
                                          : '#22C55E', // green — all paid
                                }}
                                title={`${student.manualUnpaid ?? 0} guide da pagare`}
                              />
                              <span>{student.firstName} {student.lastName}</span>
                              {student.bookingBlocked && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                  Bloccato
                                </Badge>
                              )}
                              {student.assignedInstructorId && instructorMap.get(student.assignedInstructorId) && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {instructorMap.get(student.assignedInstructorId)}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{student.email || "—"}</TableCell>
                          <TableCell>{student.phone || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {student.status ?? "active"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant={student.summary.isCompleted ? "success" : "outline"}>
                                {student.summary.completedLessons}/{student.summary.requiredLessons}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {student.summary.isCompleted ? "Completato" : "In corso"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedStudentId(student.id);
                                setDrawerOpen(true);
                                void loadRegister(student.id);
                                void loadCredits(student.id);
                              }}
                            >
                              Dettaglio
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                          Nessun allievo trovato.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                )}
              </>
            )}
          </>
        )}
      </div>

      <Drawer
        open={drawerOpen}
        direction={isMobile ? "bottom" : "right"}
        onOpenChange={(nextOpen) => {
          setDrawerOpen(nextOpen);
          if (!nextOpen) {
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
          }
        }}
      >
        <DrawerContent className="data-[vaul-drawer-direction=right]:w-[min(100vw,960px)] data-[vaul-drawer-direction=right]:sm:max-w-4xl h-full">
          {/* Header with student info */}
          <DrawerHeader className="border-b border-border/40 bg-white px-5 py-4">
            <div className="flex items-center gap-3.5">
              {selectedStudent && (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pink-50 ring-1 ring-pink-100">
                  <span className="text-base font-bold text-pink-500">
                    {selectedStudent.firstName.charAt(0)}{selectedStudent.lastName.charAt(0)}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <DrawerTitle className="text-base font-semibold text-foreground">
                  {selectedStudent
                    ? `${selectedStudent.firstName} ${selectedStudent.lastName}`
                    : "Dettaglio allievo"}
                </DrawerTitle>
                <DrawerDescription className="text-xs text-muted-foreground">
                  {register?.student.email || register?.student.phone || "Registro guide allievo"}
                </DrawerDescription>
              </div>
              {register?.bookingBlocked && (
                <Badge variant="destructive" className="shrink-0 text-[10px]">Bloccato</Badge>
              )}
            </div>

            {/* Drawer tabs */}
            {register && (
              <div className="mt-3 flex gap-1 rounded-lg bg-gray-100/80 p-1">
                {([
                  { key: "summary" as const, label: "Riepilogo", icon: BookOpen },
                  { key: "lessons" as const, label: "Guide", icon: FileText },
                  { key: "notes" as const, label: `Note${register.lessons.filter(l => l.notes?.trim()).length ? ` (${register.lessons.filter(l => l.notes?.trim()).length})` : ""}`, icon: NotebookPen },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setDrawerTab(tab.key)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                      drawerTab === tab.key
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </DrawerHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
            {registerLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-56 w-full rounded-2xl" />
              </div>
            ) : register ? (
              <>
                {/* ── TAB: Riepilogo ── */}
                {drawerTab === "summary" && (
                  <>
                    {/* Anagrafica */}
                    <section className="rounded-2xl border border-border/50 bg-white p-4">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                        Anagrafica
                      </p>
                      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Nome</p>
                          <p className="text-sm font-medium text-foreground">
                            {register.student.firstName} {register.student.lastName}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Email</p>
                          <p className="text-sm font-medium text-foreground">{register.student.email || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Telefono</p>
                          <p className="text-sm font-medium text-foreground">{register.student.phone || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Case attiva</p>
                          <p className="text-sm font-medium text-foreground">
                            {register.activeCase
                              ? `${register.activeCase.status}${register.activeCase.category ? ` · ${register.activeCase.category}` : ""}`
                              : "Nessuna"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Prenotazioni</p>
                          <div className="flex items-center gap-2">
                            <Badge variant={register.bookingBlocked ? "destructive" : "secondary"} className="text-[11px]">
                              {register.bookingBlocked ? "Bloccate" : "Attive"}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              disabled={blockSaving}
                              onClick={() => void handleToggleBlock(!register.bookingBlocked)}
                            >
                              {blockSaving
                                ? "Salvo..."
                                : register.bookingBlocked
                                  ? "Sblocca"
                                  : "Blocca"}
                            </Button>
                          </div>
                        </div>
                        {weeklyLimitActive && (
                          <div>
                            <p className="text-[11px] text-muted-foreground">Limite guide settimanali</p>
                            <div className="flex items-center gap-2">
                              <Badge variant={register.weeklyBookingLimitExempt ? "secondary" : "outline"} className="text-[11px]">
                                {register.weeklyBookingLimitExempt ? "Esente" : "Soggetto al limite"}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px]"
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
                                {exemptSaving
                                  ? "Salvo..."
                                  : register.weeklyBookingLimitExempt
                                    ? "Riattiva limite"
                                    : "Rendi esente"}
                              </Button>
                            </div>
                          </div>
                        )}
                        {weeklyLimitActive && examPriorityEnabledGlobal && (
                          <div>
                            <p className="text-[11px] text-muted-foreground">Priorit&agrave; esame</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={register.examPriorityActive ? "secondary" : "outline"} className="text-[11px]">
                                {register.examPriorityActive ? "Priorit\u00e0 attiva" : "Nessuna priorit\u00e0"}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {register.examPriorityOverride === null || register.examPriorityOverride === undefined
                                  ? "(automatico)"
                                  : register.examPriorityOverride
                                    ? "(forzato attivo)"
                                    : "(forzato disattivo)"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 mt-1.5">
                              {([
                                { label: "Auto", value: null },
                                { label: "Forza attivo", value: true },
                                { label: "Forza disattivo", value: false },
                              ] as const).map((opt) => (
                                <Button
                                  key={String(opt.value)}
                                  variant={register.examPriorityOverride === opt.value ? "default" : "ghost"}
                                  size="sm"
                                  className="h-6 px-2 text-[11px]"
                                  disabled={examPrioritySaving}
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
                                    toast.success({ description: "Priorit\u00e0 esame aggiornata." });
                                  }}
                                >
                                  {examPrioritySaving ? "..." : opt.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Stats — manual mode */}
                    {manualMode && register.extendedSummary && (
                      <section className="rounded-2xl border border-border/50 bg-white p-4">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                          Riepilogo guide
                        </p>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {[
                            { label: "Prenotate", value: register.extendedSummary.booked },
                            { label: "Completate", value: register.extendedSummary.completed },
                            { label: "Annullate", value: register.extendedSummary.cancelled },
                            { label: "In programma", value: register.extendedSummary.upcoming },
                          ].map((stat) => (
                            <div key={stat.label} className="rounded-xl bg-gray-50/80 p-3">
                              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                              <p className="text-xl font-semibold text-foreground">{stat.value}</p>
                            </div>
                          ))}
                        </div>
                        {register.extendedSummary.manualUnpaid > 0 && (
                          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                            <span className="text-sm font-medium text-amber-800">
                              Da pagare: {register.extendedSummary.manualUnpaid}
                            </span>
                          </div>
                        )}
                      </section>
                    )}

                    {/* Obbligo guide */}
                    <section className="rounded-2xl border border-border/50 bg-white p-4">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                        Obbligo guide
                      </p>
                      <div className="flex items-end gap-6">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold text-foreground">
                            {register.summary.completedLessons}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            /{register.summary.requiredLessons}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-pink-400 transition-all"
                              style={{
                                width: `${Math.min(100, (register.summary.completedLessons / Math.max(1, register.summary.requiredLessons)) * 100)}%`,
                              }}
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {register.summary.isCompleted
                              ? "Obbligo completato"
                              : `${register.summary.remaining} rimanenti`}
                          </p>
                        </div>
                      </div>
                    </section>

                    {/* Tipi guida */}
                    {register.byLessonType.length > 0 && (
                      <section className="rounded-2xl border border-border/50 bg-white p-4">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                          Tipi guida completati
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {register.byLessonType.map((item) => (
                            <span
                              key={`${item.type}-${item.count}`}
                              className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-foreground ring-1 ring-border/40"
                            >
                              {formatLessonType(item.type)}
                              <span className="text-muted-foreground">{item.count}</span>
                            </span>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Crediti guida — hide in manual mode */}
                    {(paymentMode?.auto || paymentMode?.credits) && (
                      <section className="rounded-2xl border border-border/50 bg-white p-4">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                          Crediti guida
                        </p>
                        {creditsLoading ? (
                          <div className="space-y-2">
                            <Skeleton className="h-6 w-28 rounded-full" />
                            <Skeleton className="h-10 w-full rounded-xl" />
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-[11px] text-muted-foreground">Saldo disponibile</p>
                                <p className="text-2xl font-semibold text-foreground">
                                  {credits?.availableCredits ?? 0}
                                </p>
                              </div>
                              <Badge variant="outline">
                                {credits?.availableCredits ?? 0} crediti
                              </Badge>
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-[140px,1fr,1fr]">
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                value={creditsInput}
                                onChange={(event) => setCreditsInput(event.target.value)}
                                className="bg-gray-50/80"
                                placeholder="Crediti"
                              />
                              <Button
                                onClick={() => void handleAdjustCredits("grant")}
                                disabled={creditsSaving !== null}
                              >
                                {creditsSaving === "grant" ? "Assegno..." : "Assegna crediti"}
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => void handleAdjustCredits("revoke")}
                                disabled={creditsSaving !== null}
                              >
                                {creditsSaving === "revoke" ? "Storno..." : "Storna crediti"}
                              </Button>
                            </div>
                            {credits?.ledger.length ? (
                              <div className="mt-3 space-y-1.5">
                                {credits.ledger.slice(0, 8).map((entry) => (
                                  <div
                                    key={entry.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50/80 p-3"
                                  >
                                    <div className="space-y-0.5">
                                      <p className="text-sm font-medium text-foreground">
                                        {formatCreditReason(entry.reason)}
                                      </p>
                                      <p className="text-[11px] text-muted-foreground">
                                        {formatDate(entry.createdAt, true)}
                                        {entry.actorName ? ` · ${entry.actorName}` : ""}
                                      </p>
                                    </div>
                                    <Badge variant={entry.delta >= 0 ? "secondary" : "outline"}>
                                      {entry.delta >= 0 ? "+" : ""}
                                      {entry.delta}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-sm text-muted-foreground">
                                Nessun movimento crediti disponibile.
                              </p>
                            )}
                          </>
                        )}
                      </section>
                    )}
                  </>
                )}

                {/* ── TAB: Guide ── */}
                {drawerTab === "lessons" && (() => {
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
                  return (
                  <>
                    {sortedLessons.length ? (
                      <div className="space-y-2">
                        {sortedLessons.map((lesson) => {
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

                          return (
                            <div
                              key={lesson.id}
                              className="rounded-2xl border border-border/50 bg-white p-3.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-foreground">
                                  {formatDate(lesson.startsAt, true)}
                                </p>
                                <div className="flex items-center gap-1.5">
                                  {isPenaltyCharged && !lesson.creditApplied && (
                                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-[10px]">
                                      {isNoShow ? "Assente" : "Annullata"} — Da pagare
                                    </Badge>
                                  )}
                                  {isPenaltyCharged && lesson.creditApplied && (
                                    <Badge variant="secondary" className="border-violet-200 bg-violet-50 text-violet-700 text-[10px]">
                                      {isNoShow ? "Assente" : "Annullata"} — Coperta da credito
                                    </Badge>
                                  )}
                                  {isPenaltyPaid && (
                                    <Badge variant="secondary" className="border-green-200 bg-green-50 text-green-700 text-[10px]">
                                      {isNoShow ? "Assente" : "Annullata"} — Pagata
                                    </Badge>
                                  )}
                                  {!isPenaltyCharged && !isPenaltyPaid && lesson.creditApplied && (
                                    <Badge variant="secondary" className="border-violet-200 bg-violet-50 text-violet-700 text-[10px]">
                                      Coperta da credito
                                    </Badge>
                                  )}
                                  {!isPenaltyCharged && !isPenaltyPaid && !lesson.creditApplied && lesson.manualPaymentStatus === "paid" && manualMode && (
                                    <Badge variant="secondary" className="border-green-200 bg-green-50 text-green-700 text-[10px]">
                                      Pagata
                                    </Badge>
                                  )}
                                  {!isPenaltyCharged && !isPenaltyPaid && lesson.manualPaymentStatus === "unpaid" && manualMode && !isCancelled && !isNoShow && (
                                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-[10px]">
                                      Da pagare
                                    </Badge>
                                  )}
                                  <Badge
                                    variant={isCompleted ? "secondary" : "outline"}
                                    className="text-[10px]"
                                  >
                                    {formatStatus(lesson.status)}
                                  </Badge>
                                </div>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {(lesson.types?.length ? lesson.types : [lesson.type]).map((t: string) => formatLessonType(t)).join(", ")} · {lesson.durationMinutes} min · {lesson.instructorName || "Istruttore n/d"} · {lesson.vehicleName || "Veicolo n/d"}
                              </p>
                              {(showPaymentToggle || isPenaltyCharged || isPenaltyPaid) && (
                                <div className="mt-2 flex gap-2">
                                  {(lesson.manualPaymentStatus !== "paid") && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      disabled={paymentSaving === lesson.id}
                                      onClick={() =>
                                        void handleSetManualPayment(lesson.id, "paid")
                                      }
                                    >
                                      {paymentSaving === lesson.id ? "Salvo..." : "Segna pagata"}
                                    </Button>
                                  )}
                                  {lesson.manualPaymentStatus === "paid" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      disabled={paymentSaving === lesson.id}
                                      onClick={() =>
                                        void handleSetManualPayment(lesson.id, "unpaid")
                                      }
                                    >
                                      {paymentSaving === lesson.id ? "Salvo..." : "Segna da pagare"}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <FileText className="mb-2 h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">Nessuna guida registrata.</p>
                      </div>
                    )}
                  </>
                  );
                })()}

                {/* ── TAB: Note ── */}
                {drawerTab === "notes" && (
                  <>
                    {register.lessons.length ? (
                      <div className="relative space-y-0">
                        {register.lessons.map((lesson, idx) => {
                          const hasNote = !!lesson.notes?.trim();
                          const isLast = idx === register.lessons.length - 1;
                          const isExam = lesson.type === "esame";
                          const lessonDate = lesson.startsAt instanceof Date
                            ? lesson.startsAt
                            : new Date(lesson.startsAt);
                          const endDate = lesson.startsAt instanceof Date
                            ? new Date(lesson.startsAt.getTime() + lesson.durationMinutes * 60000)
                            : new Date(new Date(lesson.startsAt).getTime() + lesson.durationMinutes * 60000);

                          return (
                            <div key={lesson.id} className="flex gap-4">
                              {/* Timeline */}
                              <div className="flex w-16 shrink-0 flex-col items-center pt-3.5">
                                <span className="text-[11px] font-semibold text-muted-foreground">
                                  {lessonDate.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                                </span>
                                {!isLast && (
                                  <div className="mt-2 flex-1 border-l border-dashed border-border/60" />
                                )}
                              </div>

                              {/* Card */}
                              {isExam ? (
                                <div className="mb-2.5 flex flex-1 overflow-hidden rounded-2xl border border-violet-200 bg-violet-50/80 shadow-sm shadow-violet-200/50">
                                  <div className="w-1 shrink-0 bg-violet-500" />
                                  <div className="flex-1 p-3.5">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex size-6 items-center justify-center rounded-full bg-violet-500">
                                        <GraduationCap className="size-3.5 text-white" />
                                      </span>
                                      <span className="text-[11px] font-bold uppercase tracking-wider text-violet-700">Esame</span>
                                      <span className="text-xs font-semibold text-violet-400">
                                        {lessonDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                                        {" – "}
                                        {endDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-violet-500">
                                      {lesson.instructorName || "Istruttore n/d"}
                                    </p>
                                    {hasNote && (
                                      <p className="mt-2 text-sm leading-relaxed text-foreground">{lesson.notes!.trim()}</p>
                                    )}
                                  </div>
                                </div>
                              ) : (
                              <div
                                className={cn(
                                  "mb-2.5 flex-1 rounded-2xl border p-3.5",
                                  hasNote
                                    ? "border-border/50 bg-white"
                                    : "border-border/30 bg-gray-50/50",
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-foreground">
                                    {lessonDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                                    {" – "}
                                    {endDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                  {(lesson.types?.length ? lesson.types : [lesson.type]).map((t: string, i: number) => (
                                    <span key={i} className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                                      {formatLessonType(t)}
                                    </span>
                                  ))}
                                  {lesson.rating != null && (
                                    <span className="ml-auto flex items-center gap-0.5 text-[10px]">
                                      {Array.from({ length: 5 }, (_, i) => (
                                        <span key={i} className={i < lesson.rating! ? "text-yellow-400" : "text-gray-200"}>★</span>
                                      ))}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {lesson.instructorName || "Istruttore n/d"} · {lesson.vehicleName || "Veicolo n/d"}
                                </p>
                                <p
                                    className={`mt-2 text-sm leading-relaxed ${
                                      hasNote ? "text-foreground" : "text-muted-foreground/50 italic"
                                    }`}
                                  >
                                    {lesson.notes?.trim() || "Nessuna nota"}
                                  </p>
                              </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <NotebookPen className="mb-2 h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">Nessuna guida registrata.</p>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Seleziona un allievo per visualizzare il registro guide.
              </p>
            )}
          </div>

          <DrawerFooter className="border-t border-border/40 bg-white px-5 py-3">
            <DrawerClose asChild>
              <Button variant="outline" size="sm">Chiudi</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </PageWrapper>
  );
}
