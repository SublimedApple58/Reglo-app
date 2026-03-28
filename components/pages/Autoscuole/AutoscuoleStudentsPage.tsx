"use client";

import Link from "next/link";
import React from "react";
import { ExternalLink, Loader2, MailPlus, UserPlus } from "lucide-react";
import { useLocale } from "next-intl";

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
  getCompanyInviteCode,
  getPaymentMode,
  toggleStudentBookingBlock,
  setManualPaymentStatus,
} from "@/lib/actions/autoscuole.actions";
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
  lateCancellationAction: string | null;
  createdAt: string | Date | null;
};

type StudentRegister = {
  student: StudentProfile;
  bookingBlocked?: boolean;
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
  checked_in: "Check-in",
  no_show: "No-show",
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
  const manualMode = paymentMode !== null && !paymentMode.auto && !paymentMode.credits;

  // Sub-tabs
  const [activeSubTab, setActiveSubTab] = React.useState<SubTab>("students");
  const [lateCancellationsCount, setLateCancellationsCount] = React.useState(0);

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
    getPaymentMode().then((res) => {
      if (res.success && res.data) {
        setPaymentMode({
          auto: res.data.autoPaymentsEnabled,
          credits: res.data.lessonCreditFlowEnabled,
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
                            <TableHead>Guide completate</TableHead>
                            <TableHead>Obbligo</TableHead>
                            <TableHead className="text-right">Azioni</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell colSpan={7} className="h-48" />
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
                            <span>{student.firstName} {student.lastName}</span>
                            {student.bookingBlocked && (
                              <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">
                                Bloccato
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{student.email || "—"}</TableCell>
                          <TableCell>{student.phone || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {student.status ?? "active"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {student.summary.completedLessons}
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
                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
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
          }
        }}
      >
        <DrawerContent className="data-[vaul-drawer-direction=right]:w-[min(100vw,960px)] data-[vaul-drawer-direction=right]:sm:max-w-4xl h-full">
          <DrawerHeader className="border-b border-white/60 bg-white/80 backdrop-blur">
            <DrawerTitle>Registro guide allievo</DrawerTitle>
            <DrawerDescription>
              {selectedStudent
                ? `${selectedStudent.firstName} ${selectedStudent.lastName}`
                : "Dettaglio allievo"}
            </DrawerDescription>
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
                {/* Anagrafica */}
                <section className="space-y-3 rounded-[16px] border border-border bg-white p-4 shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Anagrafica
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Nome</p>
                      <p className="font-medium text-foreground">
                        {register.student.firstName} {register.student.lastName}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium text-foreground">{register.student.email || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Telefono</p>
                      <p className="font-medium text-foreground">{register.student.phone || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Case attiva</p>
                      <p className="font-medium text-foreground">
                        {register.activeCase
                          ? `${register.activeCase.status}${register.activeCase.category ? ` · ${register.activeCase.category}` : ""}`
                          : "Nessuna"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Prenotazioni</p>
                      <div className="flex items-center gap-2">
                        <Badge variant={register.bookingBlocked ? "destructive" : "secondary"}>
                          {register.bookingBlocked ? "Bloccate" : "Attive"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
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
                  </div>
                </section>

                {/* Stats section — only in manual mode */}
                {manualMode && register.extendedSummary && (
                  <section className="space-y-3 rounded-[16px] border border-border bg-white p-4 shadow-card">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Riepilogo guide
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Prenotate</p>
                        <p className="text-2xl font-semibold text-foreground">
                          {register.extendedSummary.booked}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Completate</p>
                        <p className="text-2xl font-semibold text-foreground">
                          {register.extendedSummary.completed}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Annullate</p>
                        <p className="text-2xl font-semibold text-foreground">
                          {register.extendedSummary.cancelled}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">In programma</p>
                        <p className="text-2xl font-semibold text-foreground">
                          {register.extendedSummary.upcoming}
                        </p>
                      </div>
                    </div>
                    {register.extendedSummary.manualUnpaid > 0 && (
                      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                        <span className="text-sm font-medium text-amber-800">
                          Da pagare: {register.extendedSummary.manualUnpaid}
                        </span>
                      </div>
                    )}
                  </section>
                )}

                {/* Crediti guida — hide in manual mode */}
                {(paymentMode?.auto || paymentMode?.credits) && (
                  <section className="space-y-3 rounded-[16px] border border-border bg-white p-4 shadow-card">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
                            <p className="text-xs text-muted-foreground">Saldo disponibile</p>
                            <p className="text-2xl font-semibold text-foreground">
                              {credits?.availableCredits ?? 0}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {credits?.availableCredits ?? 0} crediti
                          </Badge>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[140px,1fr,1fr]">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={creditsInput}
                            onChange={(event) => setCreditsInput(event.target.value)}
                            className="border-white/60 bg-white/80"
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
                          <div className="space-y-2">
                            {credits.ledger.slice(0, 8).map((entry) => (
                              <div
                                key={entry.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/70 p-3"
                              >
                                <div className="space-y-1">
                                  <p className="text-sm font-medium text-foreground">
                                    {formatCreditReason(entry.reason)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
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
                          <p className="text-sm text-muted-foreground">
                            Nessun movimento crediti disponibile.
                          </p>
                        )}
                      </>
                    )}
                  </section>
                )}

                <section className="space-y-3 rounded-[16px] border border-border bg-white p-4 shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Stato obbligo guide
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Completate</p>
                      <p className="text-2xl font-semibold text-foreground">
                        {register.summary.completedLessons}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Rimanenti</p>
                      <p className="text-2xl font-semibold text-foreground">
                        {register.summary.remaining}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Obbligo</p>
                      <p className="text-2xl font-semibold text-foreground">
                        {register.summary.requiredLessons}
                      </p>
                    </div>
                  </div>
                  <Badge variant={register.summary.isCompleted ? "secondary" : "outline"}>
                    {register.summary.completedLessons}/{register.summary.requiredLessons} ·{" "}
                    {register.summary.isCompleted ? "Completato" : "In corso"}
                  </Badge>
                </section>

                <section className="space-y-3 rounded-[16px] border border-border bg-white p-4 shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Tipi guida completati
                  </p>
                  {register.byLessonType.length ? (
                    <div className="flex flex-wrap gap-2">
                      {register.byLessonType.map((item) => (
                        <Badge key={`${item.type}-${item.count}`} variant="outline">
                          {formatLessonType(item.type)} · {item.count}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nessuna guida completata per questo allievo.
                    </p>
                  )}
                </section>

                {/* Storico guide */}
                <section className="space-y-3 rounded-[16px] border border-border bg-white p-4 shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Storico guide
                  </p>
                  {register.lessons.length ? (
                    <div className="space-y-2">
                      {register.lessons.map((lesson) => {
                        const isCompleted = lesson.status === "completed";
                        const isCancelled = lesson.status === "cancelled";
                        const showPaymentToggle =
                          manualMode &&
                          (isCompleted || lesson.manualPaymentStatus === "unpaid");
                        const isCancelledCharged =
                          isCancelled &&
                          lesson.lateCancellationAction === "charged" &&
                          lesson.manualPaymentStatus === "unpaid";

                        return (
                          <div
                            key={lesson.id}
                            className="rounded-2xl border border-white/60 bg-white/70 p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground">
                                {formatDate(lesson.startsAt, true)}
                              </p>
                              <div className="flex items-center gap-1.5">
                                {isCancelledCharged && (
                                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                    Annullata — Da pagare
                                  </Badge>
                                )}
                                {!isCancelledCharged && lesson.manualPaymentStatus === "paid" && manualMode && (
                                  <Badge variant="secondary" className="border-green-200 bg-green-50 text-green-700">
                                    Pagata
                                  </Badge>
                                )}
                                {!isCancelledCharged && lesson.manualPaymentStatus === "unpaid" && manualMode && !isCancelled && (
                                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                    Da pagare
                                  </Badge>
                                )}
                                <Badge
                                  variant={isCompleted ? "secondary" : "outline"}
                                >
                                  {formatStatus(lesson.status)}
                                </Badge>
                              </div>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Tipo: {formatLessonType(lesson.type)} · Durata {lesson.durationMinutes} min
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Istruttore: {lesson.instructorName || "Da assegnare"} · Veicolo:{" "}
                              {lesson.vehicleName || "Da assegnare"}
                            </p>
                            {(showPaymentToggle || isCancelledCharged) && (
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
                    <p className="text-sm text-muted-foreground">
                      Nessuna guida registrata.
                    </p>
                  )}
                </section>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Seleziona un allievo per visualizzare il registro guide.
              </p>
            )}
          </div>

          <DrawerFooter className="border-t border-white/60 bg-white/90 backdrop-blur">
            <DrawerClose asChild>
              <Button variant="outline">Chiudi</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </PageWrapper>
  );
}
