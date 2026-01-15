"use client";

import React from "react";
import { listWorkflowRuns } from "@/lib/actions/workflow.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type WorkflowRunHistoryProps = {
  workflowId: string;
  refreshKey?: number;
};

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function WorkflowRunHistory({
  workflowId,
  refreshKey,
}: WorkflowRunHistoryProps): React.ReactElement {
  const toast = useFeedbackToast();
  const [runs, setRuns] = React.useState<
    {
      id: string;
      status: string;
      startedAt: string | null;
      finishedAt: string | null;
      createdAt: string;
    }[]
  >([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (isMounted) setIsLoading(true);
      const res = await listWorkflowRuns(workflowId);
      if (!res.success || !res.data) {
        if (isMounted) {
          toast.error({
            description: res.message ?? "Impossibile caricare i run.",
          });
          setIsLoading(false);
        }
        return;
      }
      if (!isMounted) return;
      setRuns(res.data);
      setIsLoading(false);
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [refreshKey, toast, workflowId]);

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3">
        <p className="text-sm font-semibold text-foreground">Run history</p>
        <p className="text-xs text-muted-foreground">
          Ultime esecuzioni del workflow.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Stato</TableHead>
            <TableHead>Avvio</TableHead>
            <TableHead>Fine</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 3 }).map((_, index) => (
                <TableRow key={`run-skeleton-${index}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                </TableRow>
              ))
            : runs.length
              ? runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium capitalize">
                      {run.status.replace("_", " ")}
                    </TableCell>
                    <TableCell>{formatDate(run.startedAt)}</TableCell>
                    <TableCell>{formatDate(run.finishedAt)}</TableCell>
                  </TableRow>
                ))
              : (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Nessuna esecuzione registrata.
                    </TableCell>
                  </TableRow>
                )}
        </TableBody>
      </Table>
    </div>
  );
}
