"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, Clock, GraduationCap, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TeoriaAffectedStudent } from "@/lib/actions/backoffice.actions";

export type TeoriaResolutionAction = "move_to_pratica" | "keep_in_teoria";

export type TeoriaResolution = {
  memberId: string;
  action: TeoriaResolutionAction;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  students: TeoriaAffectedStudent[];
  isSubmitting: boolean;
  onConfirm: (resolutions: TeoriaResolution[]) => Promise<void> | void;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function BackofficeResolveTeoriaDeactivationDialog({
  open,
  onOpenChange,
  companyName,
  students,
  isSubmitting,
  onConfirm,
}: Props) {
  const [perStudent, setPerStudent] = useState<Record<string, TeoriaResolutionAction>>({});
  const [bulkAction, setBulkAction] = useState<TeoriaResolutionAction>("move_to_pratica");

  // Reset state on open
  React.useEffect(() => {
    if (open) {
      const initial: Record<string, TeoriaResolutionAction> = {};
      for (const s of students) initial[s.id] = "move_to_pratica";
      setPerStudent(initial);
      setBulkAction("move_to_pratica");
    }
  }, [open, students]);

  const applyBulk = (action: TeoriaResolutionAction) => {
    setBulkAction(action);
    const next: Record<string, TeoriaResolutionAction> = {};
    for (const s of students) next[s.id] = action;
    setPerStudent(next);
  };

  const setForStudent = (id: string, action: TeoriaResolutionAction) => {
    setPerStudent((prev) => ({ ...prev, [id]: action }));
  };

  const movedCount = useMemo(
    () => Object.values(perStudent).filter((a) => a === "move_to_pratica").length,
    [perStudent],
  );
  const keptCount = students.length - movedCount;

  const handleConfirm = async () => {
    const resolutions: TeoriaResolution[] = students.map((s) => ({
      memberId: s.id,
      action: perStudent[s.id] ?? "move_to_pratica",
    }));
    await onConfirm(resolutions);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <DialogTitle className="text-base">
              Disattivare TEORIA su {companyName}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Ci sono <strong>{students.length}</strong>{" "}
            {students.length === 1 ? "allievo coinvolto" : "allievi coinvolti"}. Decidi cosa fare
            per ciascuno. La licenza quiz (se assegnata) resta valida a vita e non viene
            revocata.
          </DialogDescription>
        </DialogHeader>

        {/* Bulk action */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-gray-50/60 px-6 py-3">
          <span className="text-xs font-medium text-muted-foreground">Applica a tutti:</span>
          <div className="flex rounded-lg border border-border bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => applyBulk("move_to_pratica")}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1.5 font-medium transition-colors",
                bulkAction === "move_to_pratica"
                  ? "bg-[#222222] text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Passa a PRATICA
            </button>
            <button
              type="button"
              onClick={() => applyBulk("keep_in_teoria")}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1.5 font-medium transition-colors",
                bulkAction === "keep_in_teoria"
                  ? "bg-[#222222] text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Mantieni in fase attuale
            </button>
          </div>
        </div>

        {/* Students list */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {students.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nessun allievo da gestire.
            </p>
          ) : (
            <ul className="space-y-2">
              {students.map((student) => {
                const action = perStudent[student.id] ?? "move_to_pratica";
                return (
                  <li
                    key={student.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                        <GraduationCap className="h-3.5 w-3.5 text-gray-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {student.name ?? student.email}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-1.5 py-0.5 font-semibold",
                              student.phase === "TEORIA"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700",
                            )}
                          >
                            {student.phase}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(student.createdAt)}
                          </span>
                          {student.quizSeatGrantedAt && (
                            <span className="text-emerald-600">seat attivo</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Select
                      value={action}
                      onValueChange={(v) =>
                        setForStudent(student.id, v as TeoriaResolutionAction)
                      }
                    >
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="move_to_pratica">Passa a PRATICA</SelectItem>
                        <SelectItem value="keep_in_teoria">Mantieni in fase attuale</SelectItem>
                      </SelectContent>
                    </Select>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 border-t border-border bg-gray-50/60 px-6 py-3">
          <p className="text-xs text-muted-foreground">
            {movedCount} a PRATICA · {keptCount} mantenuti
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Annulla
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Conferma e disattiva TEORIA
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
