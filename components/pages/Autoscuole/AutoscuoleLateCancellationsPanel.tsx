"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { LottieLoadingOverlay } from "@/components/ui/lottie-loading-overlay";
import {
  getLateCancellations,
  resolveLateCancellation,
} from "@/lib/actions/autoscuole.actions";

type LateCancellation = {
  id: string;
  kind: "late_cancellation" | "no_show";
  startsAt: string | Date;
  cancelledAt: string | Date | null;
  createdAt: string | Date;
  timeDeltaMinutes: number | null;
  penaltyCutoffHours: number;
  studentName: string | null;
  studentId: string;
  instructorName: string | null;
  lessonType: string;
  durationMinutes: number;
  studentLateCancellationsCount: number;
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

const formatLessonType = (value: string) =>
  LESSON_TYPE_LABELS[value] ??
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

const formatDateTime = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateOnly = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatNoticeGiven = (timeDeltaMinutes: number, cutoffHours: number) => {
  const hours = Math.floor(Math.abs(timeDeltaMinutes) / 60);
  const mins = Math.abs(timeDeltaMinutes) % 60;
  const given = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
  return `${given} (minimo richiesto: ${cutoffHours}h)`;
};

export function AutoscuoleLateCancellationsPanel({
  onCountChange,
}: {
  onCountChange?: (count: number) => void;
}) {
  const toast = useFeedbackToast();
  const [items, setItems] = React.useState<LateCancellation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [resolving, setResolving] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await getLateCancellations();
    if (!res.success || !res.data) {
      toast.error({
        description:
          res.message ?? "Impossibile caricare le cancellazioni tardive.",
      });
      setLoading(false);
      return;
    }
    setItems(res.data as LateCancellation[]);
    setLoading(false);
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    onCountChange?.(items.length);
  }, [items.length, onCountChange]);

  const handleResolve = React.useCallback(
    async (appointmentId: string, action: "charge" | "dismiss") => {
      if (resolving) return;
      setResolving(appointmentId);
      const res = await resolveLateCancellation({ appointmentId, action });
      setResolving(null);
      if (!res.success) {
        toast.error({ description: res.message ?? "Operazione non riuscita." });
        return;
      }
      toast.success({ description: res.message ?? "Fatto." });
      // Optimistic: remove from list
      setItems((prev) => prev.filter((item) => item.id !== appointmentId));
    },
    [resolving, toast, onCountChange],
  );

  if (loading) {
    return (
      <div className="relative space-y-4">
        <LottieLoadingOverlay visible />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-white p-12 shadow-card">
        <p className="text-sm text-muted-foreground">
          Nessuna cancellazione tardiva o no-show da gestire.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-[16px] border border-border bg-white p-4 shadow-card space-y-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              {item.studentName ?? "Allievo sconosciuto"}
            </p>
            <div className="flex items-center gap-1.5">
              {item.kind === "no_show" && (
                <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                  No-show
                </Badge>
              )}
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                {item.studentLateCancellationsCount} tardiv{item.studentLateCancellationsCount === 1 ? "a" : "e"} (4 sett.)
              </Badge>
            </div>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              <span className="inline-block w-36 font-medium text-foreground">Guida prevista:</span>
              {formatDateTime(item.startsAt)} · {item.durationMinutes} min
            </p>
            <p>
              <span className="inline-block w-36 font-medium text-foreground">Prenotata il:</span>
              {formatDateOnly(item.createdAt)}
            </p>
            {item.kind === "late_cancellation" && (
              <>
                <p>
                  <span className="inline-block w-36 font-medium text-foreground">Annullata il:</span>
                  {item.cancelledAt ? formatDateTime(item.cancelledAt) : "—"}
                </p>
                <p>
                  <span className="inline-block w-36 font-medium text-foreground">Preavviso dato:</span>
                  {item.timeDeltaMinutes != null
                    ? formatNoticeGiven(item.timeDeltaMinutes, item.penaltyCutoffHours)
                    : "—"}
                </p>
              </>
            )}
            {item.kind === "no_show" && (
              <p>
                <span className="inline-block w-36 font-medium text-foreground">Esito:</span>
                Non presentato
              </p>
            )}
            <p>
              <span className="inline-block w-36 font-medium text-foreground">Istruttore:</span>
              {item.instructorName ?? "—"} · Tipo: {formatLessonType(item.lessonType)}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              size="sm"
              disabled={resolving === item.id}
              onClick={() => void handleResolve(item.id, "charge")}
            >
              {resolving === item.id ? "Elaboro..." : "Addebita"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={resolving === item.id}
              onClick={() => void handleResolve(item.id, "dismiss")}
            >
              Non addebitare
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
