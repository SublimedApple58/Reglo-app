"use client";

import * as React from "react";
import { GraduationCap, Car, Award, AlertCircle, Hourglass } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateStudentPhase } from "@/lib/actions/autoscuole.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";

export type StudentPhase = "AWAITING" | "TEORIA" | "PRATICA" | "PATENTATO";

const PHASE_OPTIONS: Array<{
  value: StudentPhase;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: "AWAITING",
    label: "In attesa di attivazione",
    description:
      "Si è registrato in app ma il titolare non ha ancora attivato il percorso. Nessun accesso a guide o quiz.",
    Icon: Hourglass,
  },
  {
    value: "TEORIA",
    label: "Teoria",
    description: "Sta studiando per l'esame teorico. Le lezioni di guida sono bloccate.",
    Icon: GraduationCap,
  },
  {
    value: "PRATICA",
    label: "Foglio rosa (pratica)",
    description: "Ha superato l'esame teoria. Può prenotare lezioni di guida.",
    Icon: Car,
  },
  {
    value: "PATENTATO",
    label: "Patentato",
    description: "Percorso completato. L'app non offre più funzionalità attive.",
    Icon: Award,
  },
];

const toDateInputValue = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  currentPhase: StudentPhase;
  currentTheoryExamAt: string | null;
  /**
   * Phases this autoscuola has enabled. Used to filter the visible options.
   * AWAITING / TEORIA are shown only when `'TEORIA'` is included.
   * PRATICA is shown only when `'PRATICA'` is included.
   * PATENTATO is always shown (terminal state).
   * If omitted, all options are shown (legacy callers).
   */
  phasesEnabled?: ("TEORIA" | "PRATICA")[];
  /** Whether the student already has a quiz seat assigned. */
  hasQuizSeat?: boolean;
  /** Number of quiz seats currently available for the autoscuola. */
  quizSeatsAvailable?: number;
  onSuccess: (next: { phase: StudentPhase; theoryExamAt: string | null; grantedSeat?: boolean }) => void;
};

export function ChangeStudentPhaseDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  currentPhase,
  currentTheoryExamAt,
  phasesEnabled,
  hasQuizSeat,
  quizSeatsAvailable = 0,
  onSuccess,
}: Props) {
  const toast = useFeedbackToast();
  const [phase, setPhase] = React.useState<StudentPhase>(currentPhase);
  const [theoryExamDate, setTheoryExamDate] = React.useState<string>(
    toDateInputValue(currentTheoryExamAt),
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setPhase(currentPhase);
      setTheoryExamDate(toDateInputValue(currentTheoryExamAt));
    }
  }, [open, currentPhase, currentTheoryExamAt]);

  const visibleOptions = React.useMemo(() => {
    if (!phasesEnabled) return PHASE_OPTIONS;
    return PHASE_OPTIONS.filter((opt) => {
      if (opt.value === "PATENTATO") return true;
      if (opt.value === "AWAITING" || opt.value === "TEORIA")
        return phasesEnabled.includes("TEORIA");
      if (opt.value === "PRATICA") return phasesEnabled.includes("PRATICA");
      return true;
    });
  }, [phasesEnabled]);

  const isDowngradeToTeoria =
    (phase === "TEORIA" || phase === "AWAITING") &&
    currentPhase !== "TEORIA" &&
    currentPhase !== "AWAITING";

  const needsSeat = phase === "TEORIA" && !hasQuizSeat;
  const canGrantSeat = needsSeat && quizSeatsAvailable > 0;
  const isBlocked = needsSeat && quizSeatsAvailable <= 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await updateStudentPhase({
        studentId,
        phase,
        theoryExamDate:
          phase === "TEORIA" && theoryExamDate
            ? new Date(theoryExamDate).toISOString()
            : phase === "TEORIA"
              ? null
              : undefined,
        ...(needsSeat && { grantSeat: true }),
      });
      if (!res.success) {
        toast.error({ description: res.message ?? "Errore aggiornamento fase." });
        return;
      }
      toast.success({ description: res.message ?? "Fase aggiornata." });
      onSuccess({
        phase,
        theoryExamAt:
          phase === "TEORIA" && theoryExamDate
            ? new Date(theoryExamDate).toISOString()
            : null,
        grantedSeat: needsSeat,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error({ description: (error as Error)?.message ?? "Errore inatteso." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cambia fase del percorso</DialogTitle>
          <DialogDescription>
            Aggiorna la fase di <strong>{studentName}</strong>. L&apos;esperienza in app
            cambierà di conseguenza.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Fase del percorso</Label>
            <Select value={phase} onValueChange={(value) => setPhase(value as StudentPhase)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Seleziona la fase" />
              </SelectTrigger>
              <SelectContent>
                {visibleOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="cursor-pointer">
                    <div className="flex items-center gap-2">
                      <opt.Icon className="h-4 w-4 text-pink-500" aria-hidden />
                      <span className="font-medium">{opt.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {PHASE_OPTIONS.find((o) => o.value === phase)?.description}
            </p>
          </div>

          {phase === "TEORIA" && (
            <div className="space-y-2">
              <Label htmlFor="theory-exam-date">Data esame teoria (opzionale)</Label>
              <Input
                id="theory-exam-date"
                type="date"
                value={theoryExamDate}
                onChange={(event) => setTheoryExamDate(event.target.value)}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Se inserita, l&apos;allievo vedrà un countdown e riceverà reminder pre-esame.
              </p>
            </div>
          )}

          {isDowngradeToTeoria && (
            <div
              role="alert"
              className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                Riportare un allievo in una fase pre-pratica richiede che <strong>non ci siano lezioni
                di guida future prenotate</strong>. Se ce ne sono, cancellale prima di confermare.
              </p>
            </div>
          )}

          {canGrantSeat && (
            <div
              role="alert"
              className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                Spostare l&apos;allievo in Teoria richiede l&apos;utilizzo di una licenza quiz.
                Verrà utilizzata <strong>1 licenza</strong> ({quizSeatsAvailable} disponibil{quizSeatsAvailable === 1 ? "e" : "i"}).
              </p>
            </div>
          )}

          {isBlocked && (
            <div
              role="alert"
              className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                Non ci sono licenze quiz disponibili. Acquista altre licenze per poter spostare
                l&apos;allievo in fase Teoria.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="cursor-pointer"
            >
              Annulla
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || phase === currentPhase || isBlocked}
              className="cursor-pointer"
            >
              {saving ? <LoadingDots /> : "Aggiorna fase"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
