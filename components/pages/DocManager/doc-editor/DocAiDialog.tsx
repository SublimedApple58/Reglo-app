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
      <DialogContent className="max-w-lg glass-panel">
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
            className="min-h-[120px] border-white/60 bg-white/80"
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
            className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isRunning}
            className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            {isRunning ? "Analisi in corso..." : "Avvia AI"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
