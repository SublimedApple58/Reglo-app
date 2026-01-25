"use client";

import React from "react";
import { getWorkflowRunDetails, listWorkflowRuns } from "@/lib/actions/workflow.actions";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { X } from "lucide-react";

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

const formatJson = (value: unknown) => {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [detailsRunId, setDetailsRunId] = React.useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [detailsData, setDetailsData] = React.useState<{
    id: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    triggerWarnings: string[];
    steps: Array<{
      id: string;
      nodeId: string;
      label: string;
      status: string;
      attempt: number;
      startedAt: string | null;
      finishedAt: string | null;
      error: unknown;
      output: unknown;
    }>;
  } | null>(null);

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

  React.useEffect(() => {
    if (!detailsOpen || !detailsRunId) return;
    let active = true;
    const loadDetails = async () => {
      setDetailsLoading(true);
      const res = await getWorkflowRunDetails(detailsRunId);
      if (!active) return;
      if (!res.success || !res.data) {
        toast.error({
          description: res.message ?? "Impossibile caricare i dettagli del run.",
        });
        setDetailsLoading(false);
        return;
      }
      setDetailsData(res.data);
      setDetailsLoading(false);
    };
    loadDetails();
    return () => {
      active = false;
    };
  }, [detailsOpen, detailsRunId, toast]);

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
            <TableHead></TableHead>
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
                  <TableCell>
                    <Skeleton className="h-8 w-20" />
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
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDetailsRunId(run.id);
                          setDetailsOpen(true);
                        }}
                      >
                        Dettagli
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Nessuna esecuzione registrata.
                    </TableCell>
                  </TableRow>
                )}
        </TableBody>
      </Table>

      <Drawer
        open={detailsOpen}
        onOpenChange={(nextOpen) => {
          setDetailsOpen(nextOpen);
          if (!nextOpen) {
            setDetailsRunId(null);
            setDetailsData(null);
          }
        }}
        direction="right"
      >
        <DrawerContent className="data-[vaul-drawer-direction=right]:w-[min(100vw,820px)] data-[vaul-drawer-direction=right]:sm:max-w-4xl h-full">
          <DrawerHeader className="border-b">
            <div className="flex items-center justify-between gap-3">
              <div>
                <DrawerTitle>Dettagli run</DrawerTitle>
                <DrawerDescription>
                  {detailsData
                    ? `Stato: ${detailsData.status.replace("_", " ")}`
                    : "Caricamento dettagli..."}
                </DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon">
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          {detailsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : detailsData ? (
            <div className="space-y-4 p-6">
              <div className="text-xs text-muted-foreground">
                Avvio: {formatDate(detailsData.startedAt)} · Fine:{" "}
                {formatDate(detailsData.finishedAt)}
              </div>
              {detailsData.triggerWarnings?.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="font-semibold">Warning trigger</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {detailsData.triggerWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="space-y-3">
                {detailsData.steps.map((step) => {
                  const error =
                    step.error && typeof step.error === "object" && step.error !== null
                      ? (step.error as { message?: string }).message ?? formatJson(step.error)
                      : step.error
                        ? String(step.error)
                        : null;
                  return (
                    <div
                      key={step.id}
                      className="rounded-xl border border-border/70 bg-muted/20 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {step.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {step.nodeId}
                          </p>
                        </div>
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          {step.status.replace("_", " ")}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Tentativo: {step.attempt} · Avvio: {formatDate(step.startedAt)} ·
                        Fine: {formatDate(step.finishedAt)}
                      </div>
                      {error ? (
                        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          {error}
                        </div>
                      ) : null}
                      {step.output ? (
                        <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/90 p-3 text-xs text-white">
                          {formatJson(step.output)}
                        </pre>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              Nessun dettaglio disponibile.
            </p>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
