"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { workflowsData, type WorkflowItem } from "./workflows-data";
import { useMemo, useRef, useState, useEffect } from "react";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { useAtomValue, useSetAtom } from "jotai";
import { Workflows } from "@/atoms/TabelsStore";
import { cn } from "@/lib/utils";

type Props = {
  selectable?: boolean;
};

export function WorkflowsTable({ selectable = false }: Props): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setRows = useSetAtom(Workflows.rows);
  const setTotalSelected = useSetAtom(Workflows.workflowsRowsSelected);
  const setSelectedIds = useSetAtom(Workflows.workflowsSelectedIds);
  const deleteRequest = useAtomValue(Workflows.workflowsDeleteRequest);
  const disableRequest = useAtomValue(Workflows.workflowsDisableRequest);
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>(
    {},
  );
  const [visibleRows, setVisibleRows] = useState<WorkflowItem[]>([]);
  const [rows, setRowsData] = useState<WorkflowItem[]>(workflowsData);
  const [isFading, setIsFading] = useState(false);
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
        (row.disabled ? "disattivato" : "").includes(lower);
      const effectiveStatus = row.disabled ? "disattivato" : row.status.toLowerCase();
      const matchesStatus =
        statusFilters.length === 0 || statusFilters.includes(effectiveStatus);
      const matchesOwner =
        ownerFilters.length === 0 || ownerFilters.includes(row.owner.toLowerCase());
      return matchesSearch && matchesStatus && matchesOwner;
    });
  }, [rows, searchTerm, statusFilters, ownerFilters]);

  useEffect(() => {
    setRows(filteredRows.length);
  }, [filteredRows, setRows]);

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
    router.push(`${pathname}/${id}`);
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
    setRowsData((prev) => prev.filter((row) => !selectedIds.includes(row.id)));
    setSelectedItems({});
  }, [deleteRequest, selectedIds]);

  useEffect(() => {
    if (disableRequest === lastDisableRequest.current) return;
    lastDisableRequest.current = disableRequest;
    if (!disableRequest || selectedIds.length === 0) return;
    setRowsData((prev) =>
      prev.map((row) =>
        selectedIds.includes(row.id) ? { ...row, disabled: true } : row,
      ),
    );
    setSelectedItems({});
  }, [disableRequest, selectedIds]);

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
          {visibleRows.map((row) => (
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
                    "inline-flex items-center rounded-full border border-black/5 px-2.5 py-1 text-xs font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.08)]",
                    row.disabled && "bg-neutral-100 text-neutral-500",
                    !row.disabled &&
                      row.status === "Active" &&
                      "bg-emerald-100 text-emerald-700",
                    !row.disabled &&
                      row.status === "Draft" &&
                      "bg-slate-100 text-slate-600",
                    !row.disabled &&
                      row.status === "Paused" &&
                      "bg-amber-100 text-amber-700",
                    !row.disabled &&
                      row.status === "Review" &&
                      "bg-sky-100 text-sky-700",
                  )}
                >
                  {row.disabled ? "Disattivato" : row.status}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="default" onClick={() => handleEdit(row.id)}>
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
