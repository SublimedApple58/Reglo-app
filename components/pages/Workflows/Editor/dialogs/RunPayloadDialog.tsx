"use client";

import type { Dispatch, SetStateAction } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RunPayloadField } from "@/components/pages/Workflows/Editor/types";

type RunPayloadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runPayloadFields: RunPayloadField[];
  setRunPayloadFields: Dispatch<SetStateAction<RunPayloadField[]>>;
  onSubmit: () => void;
  isRunning: boolean;
};

export function RunPayloadDialog({
  open,
  onOpenChange,
  runPayloadFields,
  setRunPayloadFields,
  onSubmit,
  isRunning,
}: RunPayloadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Inserisci dati del trigger</DialogTitle>
          <DialogDescription>
            Completa i valori richiesti prima di avviare il workflow.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {runPayloadFields.map((field, index) => (
            <div key={field.id} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {field.key} {field.required ? "*" : ""}
              </p>
              <Input
                value={field.value}
                onChange={(event) =>
                  setRunPayloadFields((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="Inserisci valore"
              />
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={onSubmit} disabled={isRunning}>
            {isRunning ? "Avvio..." : "Avvia workflow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
