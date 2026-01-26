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
  Eraser,
  Italic,
  List,
  ListOrdered,
  Link2,
  Underline,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [blockStyle, setBlockStyle] = React.useState("p");
  const placeholder = "Scrivi qui il testo del documento...";

  const isEmptyDraft = React.useMemo(() => {
    const sanitized = (draft || "").replace(/\s+/g, "");
    return (
      sanitized === "" ||
      sanitized === "<p></p>" ||
      sanitized === "<p><br></p>" ||
      sanitized === "<div></div>" ||
      sanitized === "<div><br></div>"
    );
  }, [draft]);

  React.useEffect(() => {
    if (!open) return;
    setDraft(value);
    if (editorRef.current) {
      editorRef.current.innerHTML = value || "<p></p>";
    }
    setBlockStyle("p");
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("defaultParagraphSeparator", false, "p");
  }, [open, value]);

  const applyCommand = (command: string, commandValue?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, commandValue);
    setDraft(editorRef.current.innerHTML);
  };

  const handleInput = () => {
    setDraft(editorRef.current?.innerHTML ?? "");
  };

  const handleBlockChange = (nextValue: string) => {
    setBlockStyle(nextValue);
    applyCommand("formatBlock", nextValue);
  };

  const handleLink = () => {
    if (!editorRef.current) return;
    const url = window.prompt("Inserisci il link");
    if (!url) return;
    editorRef.current.focus();
    document.execCommand("createLink", false, url);
    setDraft(editorRef.current.innerHTML);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Modifica testo</DialogTitle>
          <DialogDescription>
            Aggiungi paragrafi o testo semplice. Il contenuto verra inserito nel
            documento finale.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
          <Select value={blockStyle} onValueChange={handleBlockChange}>
            <SelectTrigger className="h-8 w-[160px] bg-white text-xs">
              <SelectValue placeholder="Paragrafo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="p">Paragrafo</SelectItem>
              <SelectItem value="h1">Titolo</SelectItem>
              <SelectItem value="h2">Sottotitolo</SelectItem>
              <SelectItem value="h3">Sezione</SelectItem>
              <SelectItem value="blockquote">Citazione</SelectItem>
            </SelectContent>
          </Select>
          <div className="mx-1 h-4 w-px bg-border" />
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => applyCommand("insertOrderedList")}
            aria-label="Numbered list"
          >
            <ListOrdered className="h-4 w-4" />
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
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleLink}
            aria-label="Insert link"
          >
            <Link2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => applyCommand("removeFormat")}
            aria-label="Clear formatting"
          >
            <Eraser className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          {isEmptyDraft ? (
            <div className="pointer-events-none absolute left-6 top-5 text-sm text-muted-foreground">
              {placeholder}
            </div>
          ) : null}
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            suppressContentEditableWarning
            spellCheck
            className="doc-richtext doc-richtext-editor min-h-[360px] w-full rounded-xl border bg-white px-6 py-4 outline-none"
          />
        </div>
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
