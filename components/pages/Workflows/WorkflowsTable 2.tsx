"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { workflowsData, type WorkflowItem } from "./workflows-data";
import { useMemo, useRef, useState, useEffect } from "react";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { useSetAtom } from "jotai";
import { Workflows } from "@/atoms/TabelsStore";

type Props = {
  selectable?: boolean;
};

export function WorkflowsTable({ selectable = false }: Props): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setRows = useSetAtom(Workflows.rows);
  const setTotalSelected = useSetAtom(Workflows.workflowsRowsSelected);
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>(
    {},
  );
  const [visibleRows, setVisibleRows] = useState<WorkflowItem[]>([]);
  const [isFading, setIsFading] = useState(false);
  const isInitialMount = useRef(true);
  const prevSearchTerm = useRef<string | null>(searchParams.get("search"));
  const PAGE_DIMENSION = 20;
  const page = Number(searchParams.get("page")) || 1;
  const searchTerm = searchParams.get("search") || "";

  const rows: WorkflowItem[] = workflowsData;

  const filteredRows = useMemo(() => {
    if (!searchTerm) return rows;
    const lower = searchTerm.toLowerCase();
    return rows.filter(
      (row) =>
        row.title.toLowerCase().includes(lower) ||
        row.owner.toLowerCase().includes(lower) ||
        row.status.toLowerCase().includes(lower),
    );
  }, [rows, searchTerm]);

  useEffect(() => {
    setRows(filteredRows.length);
  }, [filteredRows, setRows]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevSearchTerm.current = searchTerm;
      return;
    }
    if (prevSearchTerm.current !== searchTerm) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", "1");
      router.push(`${pathname}?${params}`);
      prevSearchTerm.current = searchTerm;
    }
  }, [pathname, router, searchParams, searchTerm]);

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
              <TableCell>{row.status}</TableCell>
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
