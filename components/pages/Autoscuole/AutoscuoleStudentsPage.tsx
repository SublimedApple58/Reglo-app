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

type StudentRegister = {
  student: StudentProfile;
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
  byLessonType: Array<{
    type: string;
    count: number;
  }>;
  lessons: Array<{
    id: string;
    type: string;
    status: string;
    startsAt: string | Date;
    durationMinutes: number;
    instructorName: string | null;
    vehicleName: string | null;
  }>;
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

export function AutoscuoleStudentsPage({
  tabs,
}: {
  tabs?: React.ReactNode;
} = {}) {
  const locale = useLocale();
  const isMobile = useIsMobile();
  const toast = useFeedbackToast();
  const [search, setSearch] = React.useState("");
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loading, setLoading] = React.useState(true);
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

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await getAutoscuolaStudentsWithProgress(search);
    if (!res.success || !res.data) {
      toast.error({
        description: res.message ?? "Impossibile caricare gli allievi.",
      });
      setLoading(false);
      return;
    }
    setStudents(res.data as Student[]);
    setLoading(false);
  }, [search, toast]);

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

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    getCompanyInviteCode().then((res) => {
      if (res.success && res.data) setInviteCode(res.data);
    });
  }, []);

  return (
    <PageWrapper
      title="Allievi"
      subTitle={
        inviteCode
          ? `Allievi sincronizzati dalla Directory utenti. Codice autoscuola: ${inviteCode}`
          : "Allievi sincronizzati dalla Directory utenti."
      }
    >
      <div className="relative w-full space-y-5">
        <LottieLoadingOverlay visible={loading} />
        {tabs}

        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  load();
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
                        {student.firstName} {student.lastName}
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
                  </div>
                </section>

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

                <section className="space-y-3 rounded-[16px] border border-border bg-white p-4 shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Storico guide
                  </p>
                  {register.lessons.length ? (
                    <div className="space-y-2">
                      {register.lessons.map((lesson) => (
                        <div
                          key={lesson.id}
                          className="rounded-2xl border border-white/60 bg-white/70 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              {formatDate(lesson.startsAt, true)}
                            </p>
                            <Badge
                              variant={lesson.status === "completed" ? "secondary" : "outline"}
                            >
                              {formatStatus(lesson.status)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Tipo: {formatLessonType(lesson.type)} · Durata {lesson.durationMinutes} min
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Istruttore: {lesson.instructorName || "Da assegnare"} · Veicolo:{" "}
                            {lesson.vehicleName || "Da assegnare"}
                          </p>
                        </div>
                      ))}
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
