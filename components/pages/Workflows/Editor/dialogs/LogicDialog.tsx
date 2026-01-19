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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TokenInput } from "@/components/pages/Workflows/Editor/shared/token-input";
import type {
  BlockDefinition,
  Condition,
  VariableOption,
} from "@/components/pages/Workflows/Editor/types";

type LogicDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingLogic: { block: BlockDefinition; position: { x: number; y: number } } | null;
  logicCondition: Condition;
  setLogicCondition: Dispatch<SetStateAction<Condition>>;
  logicIterations: string;
  setLogicIterations: Dispatch<SetStateAction<string>>;
  waitTimeout: string;
  setWaitTimeout: Dispatch<SetStateAction<string>>;
  variableOptions: VariableOption[];
  onCancel: () => void;
  onSubmit: () => void;
  submitDisabled: boolean;
};

export function LogicDialog({
  open,
  onOpenChange,
  pendingLogic,
  logicCondition,
  setLogicCondition,
  logicIterations,
  setLogicIterations,
  waitTimeout,
  setWaitTimeout,
  variableOptions,
  onCancel,
  onSubmit,
  submitDisabled,
}: LogicDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configura blocco logico</DialogTitle>
          <DialogDescription>
            Inserisci i dati per rendere il blocco chiaro e comprensibile.
          </DialogDescription>
        </DialogHeader>
        {pendingLogic?.block.id === "wait" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Timeout
            </p>
            <Input
              value={waitTimeout}
              onChange={(event) => setWaitTimeout(event.target.value)}
              placeholder="24h"
            />
            <p className="text-xs text-muted-foreground">
              Es: 30m, 24h, 7d. Se scade, il run fallisce.
            </p>
          </div>
        ) : pendingLogic?.block.kind === "for" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Numero di iterazioni
            </p>
            <Input
              type="number"
              min={1}
              value={logicIterations}
              onChange={(event) => setLogicIterations(event.target.value)}
              placeholder="Es. 5"
            />
            <p className="text-xs text-muted-foreground">
              Il blocco sara&apos; mostrato come &quot;Ripeti X volte&quot;.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Condizione
            </p>
            <div className="grid gap-2">
              <TokenInput
                value={logicCondition.left}
                onChange={(value) =>
                  setLogicCondition((prev) => ({
                    ...prev,
                    left: value,
                  }))
                }
                placeholder="Dato da verificare"
                variables={variableOptions}
              />
              <Select
                value={logicCondition.op}
                onValueChange={(value) =>
                  setLogicCondition((prev) => ({
                    ...prev,
                    op: value as Condition["op"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Operatore" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eq">uguale</SelectItem>
                  <SelectItem value="neq">diverso</SelectItem>
                  <SelectItem value="gt">maggiore</SelectItem>
                  <SelectItem value="gte">maggiore o uguale</SelectItem>
                  <SelectItem value="lt">minore</SelectItem>
                  <SelectItem value="lte">minore o uguale</SelectItem>
                  <SelectItem value="contains">contiene</SelectItem>
                </SelectContent>
              </Select>
              <TokenInput
                value={logicCondition.right}
                onChange={(value) =>
                  setLogicCondition((prev) => ({
                    ...prev,
                    right: value,
                  }))
                }
                placeholder="Valore di confronto"
                variables={variableOptions}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Puoi inserire dati dinamici dal trigger o dagli step precedenti.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Annulla
          </Button>
          <Button type="button" disabled={submitDisabled} onClick={onSubmit}>
            Inserisci blocco
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
