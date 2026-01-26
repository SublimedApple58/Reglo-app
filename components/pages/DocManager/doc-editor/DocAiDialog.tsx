"use client";

import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type DocAiDialogProps = {
  open: boolean;
  prompt: string;
  isRunning: boolean;
  onPromptChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function DocAiDialog({
  open,
  prompt,
  isRunning,
  onPromptChange,
  onOpenChange,
  onConfirm,
}: DocAiDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configura documento con AI</DialogTitle>
          <DialogDescription>
            L&apos;AI analizzerà il documento e aggiungerà i campi in automatico. I
            campi verranno aggiunti a quelli esistenti.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Prompt opzionale (per aggiungere testo)
          </label>
          <Textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Es. aggiungi un paragrafo di introduzione sopra alla firma"
            className="min-h-[120px]"
            disabled={isRunning}
          />
          <p className="text-xs text-muted-foreground">
            Lascia vuoto per creare solo campi compilabili. I blocchi di testo
            vengono creati solo se lo chiedi qui.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isRunning}
          >
            Annulla
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isRunning}>
            {isRunning ? "Analisi in corso..." : "Avvia AI"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
