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
import { Button } from "@/components/ui/button";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  Underline,
} from "lucide-react";

type RichTextDialogProps = {
  open: boolean;
  value: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: string) => void;
};

export function RichTextDialog({
  open,
  value,
  onOpenChange,
  onSubmit,
}: RichTextDialogProps): React.ReactElement {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    if (!open) return;
    setDraft(value);
    if (editorRef.current) {
      editorRef.current.innerHTML = value || "<p>Testo</p>";
    }
  }, [open, value]);

  const applyCommand = (command: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false);
    setDraft(editorRef.current.innerHTML);
  };

  const handleInput = () => {
    setDraft(editorRef.current?.innerHTML ?? "");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifica testo</DialogTitle>
          <DialogDescription>
            Aggiungi paragrafi o testo semplice. Il contenuto verra inserito nel
            documento finale.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => applyCommand("bold")}
            aria-label="Bold"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => applyCommand("italic")}
            aria-label="Italic"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => applyCommand("underline")}
            aria-label="Underline"
          >
            <Underline className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => applyCommand("insertUnorderedList")}
            aria-label="Bulleted list"
          >
            <List className="h-4 w-4" />
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => applyCommand("justifyLeft")}
            aria-label="Align left"
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => applyCommand("justifyCenter")}
            aria-label="Align center"
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => applyCommand("justifyRight")}
            aria-label="Align right"
          >
            <AlignRight className="h-4 w-4" />
          </Button>
        </div>
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          suppressContentEditableWarning
          className="min-h-[220px] w-full rounded-lg border bg-white px-3 py-2 text-sm leading-relaxed outline-none"
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSubmit(draft);
              onOpenChange(false);
            }}
          >
            Salva testo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
