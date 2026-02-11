"use client";

import Link from "next/link";
import React from "react";
import { ExternalLink } from "lucide-react";
import { useLocale } from "next-intl";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
import { Button } from "@/components/ui/button";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  getAutoscuolaStudentDrivingRegister,
  getAutoscuolaStudentsWithProgress,
} from "@/lib/actions/autoscuole.actions";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

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
  confirmed: "Confermato",
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
  hideNav = false,
  tabs,
}: {
  hideNav?: boolean;
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

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Allievi sincronizzati dalla Directory utenti."
      hideHero
      contentWidthClassName="max-w-[1600px]"
    >
      <div className="space-y-5">
        {tabs}
        {!hideNav ? <AutoscuoleNav /> : null}

        <div className="glass-panel glass-strong space-y-4 p-4">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Fonte unica: Directory utenti (ruolo Allievo).
            </p>
            <p>
              Per aggiungere, rimuovere o aggiornare un allievo usa la Directory. Questa lista si sincronizza automaticamente.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Cerca allievi"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="max-w-sm border-white/60 bg-white/80"
            />
            <Button asChild variant="outline">
              <Link href={`/${locale}/admin/users`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Apri Directory utenti
              </Link>
            </Button>
          </div>
        </div>

        <div className="glass-panel glass-strong p-4">
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
              {loading ? (
                [...Array(4)].map((_, index) => (
                  <TableRow key={`sk-${index}`}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : students.length ? (
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
                        <Badge variant={student.summary.isCompleted ? "secondary" : "outline"}>
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
        </div>
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
                <section className="glass-panel glass-strong space-y-3 p-4">
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

                <section className="glass-panel glass-strong space-y-3 p-4">
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

                <section className="glass-panel glass-strong space-y-3 p-4">
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

                <section className="glass-panel glass-strong space-y-3 p-4">
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
    </ClientPageWrapper>
  );
}
