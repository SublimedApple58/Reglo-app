"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { listWorkflows, deleteWorkflow, updateWorkflow } from "@/lib/actions/workflow.actions";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useRef, useState, useEffect } from "react";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { useAtomValue, useSetAtom } from "jotai";
import { Workflows } from "@/atoms/TabelsStore";
import { cn } from "@/lib/utils";
import { WorkflowSummaryDrawer } from "@/components/pages/Workflows/WorkflowSummaryDrawer";

type Props = {
  selectable?: boolean;
};

export function WorkflowsTable({ selectable = false }: Props): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useFeedbackToast();
  const setRows = useSetAtom(Workflows.rows);
  const setTotalSelected = useSetAtom(Workflows.workflowsRowsSelected);
  const setSelectedIds = useSetAtom(Workflows.workflowsSelectedIds);
  const deleteRequest = useAtomValue(Workflows.workflowsDeleteRequest);
  const disableRequest = useAtomValue(Workflows.workflowsDisableRequest);
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>(
    {},
  );
  const [visibleRows, setVisibleRows] = useState<{
    id: string;
    title: string;
    owner: string;
    status: string;
  }[]>([]);
  const [rows, setRowsData] = useState<typeof visibleRows>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [isFading, setIsFading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isInitialMount = useRef(true);
  const prevSearchTerm = useRef<string | null>(searchParams.get("search"));
  const lastDeleteRequest = useRef(0);
  const lastDisableRequest = useRef(0);
  const PAGE_DIMENSION = 20;
  const page = Number(searchParams.get("page")) || 1;
  const searchTerm = searchParams.get("search") || "";
  const statusParam = searchParams.get("status") || "";
  const ownerParam = searchParams.get("owner") || "";
  const prevStatusParam = useRef<string | null>(statusParam);
  const prevOwnerParam = useRef<string | null>(ownerParam);

  const statusFilters = useMemo(
    () => statusParam.split(",").filter(Boolean).map((value) => value.toLowerCase()),
    [statusParam],
  );
  const ownerFilters = useMemo(
    () => ownerParam.split(",").filter(Boolean).map((value) => value.toLowerCase()),
    [ownerParam],
  );

  const filteredRows = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    return rows.filter((row) => {
      const matchesSearch =
        !searchTerm ||
        row.title.toLowerCase().includes(lower) ||
        row.owner.toLowerCase().includes(lower) ||
        row.status.toLowerCase().includes(lower) ||
        (row.status.toLowerCase() === "paused" ? "disattivato" : "").includes(lower);
      const effectiveStatus = row.status.toLowerCase();
      const matchesStatus =
        statusFilters.length === 0 ||
        statusFilters.includes(effectiveStatus) ||
        (effectiveStatus === "paused" && statusFilters.includes("disattivato"));
      const matchesOwner =
        ownerFilters.length === 0 || ownerFilters.includes(row.owner.toLowerCase());
      return matchesSearch && matchesStatus && matchesOwner;
    });
  }, [rows, searchTerm, statusFilters, ownerFilters]);

  useEffect(() => {
    setRows(filteredRows.length);
  }, [filteredRows, setRows]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (isMounted) setIsLoading(true);
      const res = await listWorkflows();
      if (!res.success || !res.data) {
        if (isMounted) {
          toast.error({
            description: res.message ?? "Impossibile caricare i workflow.",
          });
          setIsLoading(false);
        }
        return;
      }
      if (!isMounted) return;
      setRowsData(
        res.data.map((workflow) => ({
          id: workflow.id,
          title: workflow.name,
          owner: workflow.owner,
          status: workflow.status,
        })),
      );
      setIsLoading(false);
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [toast]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevSearchTerm.current = searchTerm;
      prevStatusParam.current = statusParam;
      prevOwnerParam.current = ownerParam;
      return;
    }
    if (
      prevSearchTerm.current !== searchTerm ||
      prevStatusParam.current !== statusParam ||
      prevOwnerParam.current !== ownerParam
    ) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", "1");
      router.push(`${pathname}?${params}`);
      prevSearchTerm.current = searchTerm;
      prevStatusParam.current = statusParam;
      prevOwnerParam.current = ownerParam;
    }
  }, [pathname, router, searchParams, searchTerm, statusParam, ownerParam]);

  useEffect(() => {
    setIsFading(true);
    const timer = setTimeout(() => {
      const start = (page - 1) * PAGE_DIMENSION;
      const end = start + PAGE_DIMENSION;
      setVisibleRows(filteredRows.slice(start, end));
      setIsFading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [filteredRows, page]);

  const handleEdit = (id: string) => {
    setSelectedWorkflowId(id);
    setDrawerOpen(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSelectAll = () => {
    const allSelected = visibleRows.every((row) => selectedItems[row.id]);
    const next = { ...selectedItems };
    if (allSelected) {
      visibleRows.forEach((row) => delete next[row.id]);
    } else {
      visibleRows.forEach((row) => {
        next[row.id] = true;
      });
    }
    setSelectedItems(next);
  };

  const totalSelected = Object.values(selectedItems).filter(Boolean).length;

  useEffect(() => {
    setTotalSelected(totalSelected);
  }, [setTotalSelected, totalSelected]);

  const selectedIds = useMemo(
    () => Object.keys(selectedItems).filter((id) => selectedItems[id]),
    [selectedItems],
  );

  useEffect(() => {
    setSelectedIds(selectedIds);
  }, [selectedIds, setSelectedIds]);

  useEffect(() => {
    if (deleteRequest === lastDeleteRequest.current) return;
    lastDeleteRequest.current = deleteRequest;
    if (!deleteRequest || selectedIds.length === 0) return;
    (async () => {
      const results = await Promise.all(
        selectedIds.map(async (id) => ({ id, res: await deleteWorkflow(id) })),
      );
      const failed = results.find((item) => !item.res.success);
      if (failed) {
        toast.error({
          description: failed.res.message ?? "Impossibile eliminare alcuni workflow.",
        });
      }
      setRowsData((prev) => prev.filter((row) => !selectedIds.includes(row.id)));
      setSelectedItems({});
    })();
  }, [deleteRequest, selectedIds, toast]);

  useEffect(() => {
    if (disableRequest === lastDisableRequest.current) return;
    lastDisableRequest.current = disableRequest;
    if (!disableRequest || selectedIds.length === 0) return;
    (async () => {
      const results = await Promise.all(
        selectedIds.map(async (id) => ({
          id,
          res: await updateWorkflow({ id, status: "paused" }),
        })),
      );
      const failed = results.find((item) => !item.res.success);
      if (failed) {
        toast.error({
          description: failed.res.message ?? "Impossibile disattivare alcuni workflow.",
        });
      }
      setRowsData((prev) =>
        prev.map((row) =>
          selectedIds.includes(row.id) ? { ...row, status: "paused" } : row,
        ),
      );
      setSelectedItems({});
    })();
  }, [disableRequest, selectedIds, toast]);

  const allOnPageSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selectedItems[row.id]);

  return (
    <div
      style={{
        transition: "opacity .3s ease-out",
        opacity: isFading ? 0.5 : 1,
      }}
    >
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-[50px] text-center">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all workflows on this page"
                />
              </TableHead>
            )}
            <TableHead>Workflow</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={`workflow-skeleton-${index}`}>
                  {selectable && (
                    <TableCell className="text-center">
                      <Skeleton className="mx-auto h-4 w-4 rounded" />
                    </TableCell>
                  )}
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24 rounded-full" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-8 w-16" />
                  </TableCell>
                </TableRow>
              ))
            : visibleRows.length
              ? visibleRows.map((row) => (
                  <TableRow key={row.id}>
                    {selectable && (
                      <TableCell className="text-center">
                        <Checkbox
                          checked={selectedItems[row.id] || false}
                          onCheckedChange={() => toggleSelect(row.id)}
                          aria-label={`Select workflow ${row.title}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{row.title}</TableCell>
                    <TableCell>{row.owner}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border border-white/60 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-sm",
                          row.status === "active" && "text-emerald-700",
                          row.status === "draft" && "text-slate-600",
                          row.status === "paused" && "text-amber-700",
                        )}
                      >
                        {row.status === "paused"
                          ? "Disattivato"
                          : row.status === "active"
                            ? "Active"
                            : "Draft"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="default"
                        className="rounded-full px-4 text-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                        onClick={() => handleEdit(row.id)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              : (
                  <TableRow>
                    <TableCell
                      colSpan={selectable ? 5 : 4}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Nessun workflow trovato.
                    </TableCell>
                  </TableRow>
                )}
        </TableBody>
      </Table>
      <WorkflowSummaryDrawer
        workflowId={selectedWorkflowId}
        open={drawerOpen}
        onOpenChange={(next) => {
          setDrawerOpen(next);
          if (!next) setSelectedWorkflowId(null);
        }}
      />
    </div>
  );
}
