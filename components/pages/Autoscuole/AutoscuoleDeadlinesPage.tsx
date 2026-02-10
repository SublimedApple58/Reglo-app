"use client";

import React from "react";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { getAutoscuolaDeadlines } from "@/lib/actions/autoscuole.actions";

type DeadlineItem = {
  id: string;
  caseId: string;
  studentId: string;
  studentName: string;
  deadlineType: string;
  deadlineDate: Date;
  status: "overdue" | "soon" | "ok";
  caseStatus: string;
};

const deadlineLabel = (value: string) => {
  if (value === "MEDICAL_EXPIRES") return "Visita medica";
  if (value === "PINK_SHEET_EXPIRES") return "Foglio rosa";
  return "Scadenza";
};

const statusBadge = (status: DeadlineItem["status"]) => {
  if (status === "overdue") return { label: "Scaduto", variant: "destructive" as const };
  if (status === "soon") return { label: "In scadenza", variant: "secondary" as const };
  return { label: "Ok", variant: "outline" as const };
};

export function AutoscuoleDeadlinesPage({
  hideNav = false,
}: {
  hideNav?: boolean;
} = {}) {
  const toast = useFeedbackToast();
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<DeadlineItem[]>([]);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const res = await getAutoscuolaDeadlines();
      if (!active) return;
      if (!res.success || !res.data) {
        toast.error({
          description: res.message ?? "Impossibile caricare le scadenze.",
        });
        setLoading(false);
        return;
      }
      setItems(res.data as DeadlineItem[]);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [toast]);

  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Scadenze critiche e promemoria automatici."
      hideHero
    >
      <div className="space-y-5">
        {!hideNav ? <AutoscuoleNav /> : null}

        <section className="glass-panel glass-strong p-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Scadenze
            </p>
            <p className="text-sm text-muted-foreground">
              Monitoraggio foglio rosa, visite mediche e altre scadenze con alert automatici allo staff.
            </p>
          </div>

          <div className="mt-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Allievo</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Pratica</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <TableRow key={`deadline-sk-${index}`}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : items.length ? (
                  items.map((item) => {
                    const badge = statusBadge(item.status);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.studentName}</TableCell>
                        <TableCell>{deadlineLabel(item.deadlineType)}</TableCell>
                        <TableCell>
                          {new Date(item.deadlineDate).toLocaleDateString("it-IT")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.caseStatus}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      Nessuna scadenza trovata.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </ClientPageWrapper>
  );
}
