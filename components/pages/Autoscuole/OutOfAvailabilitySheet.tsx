"use client";

import React from "react";
import { AlertTriangle, X, Calendar, User, Car } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeedbackToast } from "@/components/ui/feedback-toast";

export type OutOfAvailabilityAppointment = {
  id: string;
  startsAt: string | Date;
  endsAt: string | Date;
  type: string;
  status: string;
  studentName: string;
  instructorName: string | null;
  vehicleName: string | null;
  outOfAvailabilityFor: ("instructor" | "vehicle")[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointments: OutOfAvailabilityAppointment[];
  onActionComplete: () => void;
};

export function OutOfAvailabilitySheet({
  open,
  onOpenChange,
  appointments,
  onActionComplete,
}: Props) {
  const toast = useFeedbackToast();
  const [loadingId, setLoadingId] = React.useState<string | null>(null);

  const handleAction = async (
    appointmentId: string,
    action: "cancel" | "reposition" | "approve",
  ) => {
    setLoadingId(appointmentId);
    try {
      let url: string;
      if (action === "cancel") {
        url = `/api/autoscuole/appointments/${appointmentId}/permanent-cancel`;
      } else if (action === "reposition") {
        url = `/api/autoscuole/appointments/${appointmentId}/reposition`;
      } else {
        url = `/api/autoscuole/appointments/${appointmentId}/approve-override`;
      }

      const res = await fetch(url, { method: "POST" });
      const data = await res.json();

      if (!data.success) {
        toast.error({ description: data.message ?? "Errore durante l'operazione." });
        return;
      }

      toast.success({
        description:
          action === "cancel"
            ? "Guida cancellata."
            : action === "reposition"
              ? "Guida cancellata e riposizionamento avviato."
              : "Guida mantenuta.",
      });
      onActionComplete();
    } catch {
      toast.error({ description: "Errore di rete." });
    } finally {
      setLoadingId(null);
    }
  };

  const formatDate = (d: string | Date) => {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString("it-IT", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  };

  const formatTime = (d: string | Date) => {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto p-0">
        <SheetHeader className="sticky top-0 z-10 border-b border-border bg-white px-5 py-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-5 text-yellow-500" />
              Guide fuori disponibilità ({appointments.length})
            </SheetTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Queste guide sono programmate fuori dalla disponibilità dell&apos;istruttore o del veicolo.
          </p>
        </SheetHeader>

        <div className="space-y-3 p-5">
          {appointments.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nessuna guida fuori disponibilità.
            </div>
          )}

          {appointments.map((apt) => {
            const isLoading = loadingId === apt.id;
            const reasons = apt.outOfAvailabilityFor;

            return (
              <div
                key={apt.id}
                className="rounded-xl border border-border bg-white p-4 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {apt.studentName}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {reasons.includes("instructor") && reasons.includes("vehicle") ? (
                      <Badge variant="outline" className="border-pink-200 bg-pink-50 text-pink-700 text-xs">
                        Entrambi
                      </Badge>
                    ) : reasons.includes("instructor") ? (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-xs">
                        Istruttore
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-xs">
                        Veicolo
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="mb-3 space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    {formatDate(apt.startsAt)} &middot; {formatTime(apt.startsAt)} – {formatTime(apt.endsAt)}
                  </div>
                  {apt.instructorName && (
                    <div className="flex items-center gap-1.5">
                      <User className="size-3.5" />
                      {apt.instructorName}
                    </div>
                  )}
                  {apt.vehicleName && (
                    <div className="flex items-center gap-1.5">
                      <Car className="size-3.5" />
                      {apt.vehicleName}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={isLoading}
                    onClick={() => handleAction(apt.id, "reposition")}
                  >
                    Cancella e riposiziona
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-red-600 hover:text-red-700"
                    disabled={isLoading}
                    onClick={() => handleAction(apt.id, "cancel")}
                  >
                    Cancella
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs"
                    disabled={isLoading}
                    onClick={() => handleAction(apt.id, "approve")}
                  >
                    Mantieni
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
