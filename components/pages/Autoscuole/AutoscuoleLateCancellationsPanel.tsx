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
      <div className="flex min-h-[280px] flex-col items-center justify-center border-t border-[#ebebeb] text-center">
        <p className="text-sm font-semibold text-foreground">Tutto in ordine</p>
        <p className="mt-1 text-[13px] font-medium text-[#929292]">
          Nessuna cancellazione tardiva o no-show da gestire.
        </p>
      </div>
    );
  }

  const infoField = (label: string, value: React.ReactNode, valueClassName = "text-[#222222]") => (
    <div>
      <p className="mb-0.5 text-[12px] font-medium text-[#929292]">{label}</p>
      <p className={`text-[13px] font-medium ${valueClassName}`}>{value}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <div key={item.id} className="rounded-[14px] border border-[#dddddd] bg-white p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <p className="text-base font-semibold text-foreground">
              {item.studentName ?? "Allievo sconosciuto"}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {item.kind === "no_show" && (
                <Badge variant="outline" className="rounded-full border-[#f0e060] bg-[#fffce0] text-[#7a6a00]">
                  Assente
                </Badge>
              )}
              <Badge variant="outline" className="rounded-full border-[#fad4cc] bg-[#fff4f2] text-[#c13515]">
                {item.studentLateCancellationsCount} tardiv{item.studentLateCancellationsCount === 1 ? "a" : "e"} (4 sett.)
              </Badge>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {infoField("Guida prevista", `${formatDateTime(item.startsAt)} · ${item.durationMinutes} min`)}
            {infoField("Prenotata il", formatDateOnly(item.createdAt))}
            {item.kind === "late_cancellation" && (
              <>
                {infoField("Annullata il", item.cancelledAt ? formatDateTime(item.cancelledAt) : "—")}
                {infoField(
                  "Preavviso dato",
                  item.timeDeltaMinutes != null
                    ? formatNoticeGiven(item.timeDeltaMinutes, item.penaltyCutoffHours)
                    : "—",
                  "text-[#c13515]",
                )}
              </>
            )}
            {item.kind === "no_show" && infoField("Esito", "Non presentato", "text-[#c13515]")}
            {infoField("Istruttore", `${item.instructorName ?? "—"} · ${formatLessonType(item.lessonType)}`)}
          </div>

          <div className="flex items-center gap-2.5 border-t border-[#f2f2f2] pt-5">
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
