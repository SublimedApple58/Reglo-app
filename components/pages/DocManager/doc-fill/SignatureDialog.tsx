"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type SignatureDialogProps = {
  open: boolean;
  fullName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function SignatureDialog({
  open,
  fullName,
  onOpenChange,
  onConfirm,
}: SignatureDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Firma documento</DialogTitle>
          <DialogDescription>
            Usa il nome dell&apos;utente per generare la firma.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Nome e cognome
            </p>
            <Input value={fullName} disabled />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Anteprima firma
            </p>
            <div className="rounded-md border border-dashed border-primary/40 bg-muted/40 px-4 py-3">
              <span
                className="text-2xl"
                style={{
                  fontFamily: '"Times New Roman", Times, serif',
                  fontStyle: "italic",
                  color: "#2e3359",
                }}
              >
                {fullName}
              </span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={onConfirm}>Inserisci firma</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
