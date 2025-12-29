"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  MoreHorizontal,
  PenLine,
  Tag,
  TextCursorInput,
  Trash2,
  Type,
} from "lucide-react";
import { PdfViewer } from "@/components/pages/DocManager/PdfViewer";
import { cn } from "@/lib/utils";

type DocItem = {
  id: string;
  title: string;
  updatedAt: string;
  owner: string;
};

type ToolId = "input" | "sign" | "textarea";

type PlacedField = {
  id: string;
  type: ToolId;
  x: number;
  y: number;
  width: number;
  height: number;
  bindingKey?: string;
};

const toolItems: Array<{
  id: ToolId;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
}> = [
  { id: "input", label: "Add input field", icon: Type, width: 180, height: 18 },
  { id: "sign", label: "Add sign field", icon: PenLine, width: 160, height: 44 },
  {
    id: "textarea",
    label: "Add text area",
    icon: TextCursorInput,
    width: 240,
    height: 110,
    minWidth: 160,
    minHeight: 80,
    resizable: true,
  },
];

const documents: DocItem[] = [
  {
    id: "doc-1",
    title: "Contratto fornitore 2025",
    updatedAt: "Aggiornato 2h fa",
    owner: "Tiziano",
  },
  {
    id: "doc-2",
    title: "Linee guida onboarding",
    updatedAt: "Aggiornato ieri",
    owner: "Ops team",
  },
  {
    id: "doc-3",
    title: "Report trimestrale",
    updatedAt: "Aggiornato 3gg fa",
    owner: "Finance",
  },
  {
    id: "doc-4",
    title: "Checklist ISO",
    updatedAt: "Aggiornato 1 settimana fa",
    owner: "Compliance",
  },
];

export default function DocViewerPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const doc = documents.find((item) => item.id === params?.id);
  const [selectedTool, setSelectedTool] = React.useState<ToolId | null>(null);
  const [fields, setFields] = React.useState<PlacedField[]>([]);
  const idCounter = React.useRef(0);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const [bindingDialogOpen, setBindingDialogOpen] = React.useState(false);
  const [bindingFieldId, setBindingFieldId] = React.useState<string | null>(null);
  const [bindingDraft, setBindingDraft] = React.useState("");
  const [dragState, setDragState] = React.useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [resizeState, setResizeState] = React.useState<{
    id: string;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  if (!doc) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">Documento non trovato</h1>
        <Link
          href="/user/doc_manager"
          className="text-sm font-semibold text-primary"
        >
          Torna ai documenti
        </Link>
      </div>
    );
  }

  const clampValue = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const getTool = (toolId: ToolId) => toolItems.find((item) => item.id === toolId);

  const addFieldAtPoint = (
    toolId: ToolId,
    clientX: number,
    clientY: number,
    bounds: DOMRect,
  ) => {
    const tool = getTool(toolId);
    if (!tool) return;
    const rawX = clientX - bounds.left - tool.width / 2;
    const rawY = clientY - bounds.top - tool.height / 2;
    const x = clampValue(rawX, 0, Math.max(0, bounds.width - tool.width));
    const y = clampValue(rawY, 0, Math.max(0, bounds.height - tool.height));
    const nextField: PlacedField = {
      id: `field-${idCounter.current++}`,
      type: toolId,
      x: Math.round(x),
      y: Math.round(y),
      width: tool.width,
      height: tool.height,
    };
    setFields((prev) => prev.concat(nextField));
  };

  const bindingField = bindingFieldId
    ? fields.find((field) => field.id === bindingFieldId)
    : null;

  const handleBindingSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bindingFieldId) return;
    const nextValue = bindingDraft.trim();
    setFields((prev) =>
      prev.map((field) =>
        field.id === bindingFieldId
          ? { ...field, bindingKey: nextValue || undefined }
          : field,
      ),
    );
    setBindingDialogOpen(false);
    setBindingFieldId(null);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedTool) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    addFieldAtPoint(selectedTool, event.clientX, event.clientY, bounds);
  };

  const handleCanvasDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const toolId = event.dataTransfer.getData("application/reglo-doc-tool") as ToolId;
    if (!toolId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    addFieldAtPoint(toolId, event.clientX, event.clientY, bounds);
  };

  const handleCanvasDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  React.useEffect(() => {
    if (!dragState && !resizeState) return;

    const handleMouseMove = (event: MouseEvent) => {
      const bounds = overlayRef.current?.getBoundingClientRect();
      if (!bounds) return;

      if (dragState) {
        setFields((prev) =>
          prev.map((field) => {
            if (field.id !== dragState.id) return field;
            const nextX = clampValue(
              event.clientX - bounds.left - dragState.offsetX,
              0,
              Math.max(0, bounds.width - field.width),
            );
            const nextY = clampValue(
              event.clientY - bounds.top - dragState.offsetY,
              0,
              Math.max(0, bounds.height - field.height),
            );
            return { ...field, x: Math.round(nextX), y: Math.round(nextY) };
          }),
        );
      }

      if (resizeState) {
        setFields((prev) =>
          prev.map((field) => {
            if (field.id !== resizeState.id) return field;
            const tool = getTool(field.type);
            if (!tool?.resizable) return field;
            const deltaX = event.clientX - resizeState.startX;
            const deltaY = event.clientY - resizeState.startY;
            const maxWidth = Math.max(0, bounds.width - field.x);
            const maxHeight = Math.max(0, bounds.height - field.y);
            const nextWidth = clampValue(
              resizeState.startWidth + deltaX,
              tool.minWidth ?? 120,
              maxWidth,
            );
            const nextHeight = clampValue(
              resizeState.startHeight + deltaY,
              tool.minHeight ?? 80,
              maxHeight,
            );
            return {
              ...field,
              width: Math.round(nextWidth),
              height: Math.round(nextHeight),
            };
          }),
        );
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
      setResizeState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, resizeState]);

  return (
    <div className="flex min-h-[calc(100vh-160px)] w-full gap-6 p-6">
      <aside className="flex h-full w-56 shrink-0 flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm">
        <Link
          href="/user/doc_manager"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          BACK
        </Link>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Tools</h2>
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          {toolItems.map((tool) => {
            const Icon = tool.icon;
            const isSelected = selectedTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/reglo-doc-tool", tool.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => setSelectedTool(isSelected ? null : tool.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2 text-left font-medium transition",
                  isSelected
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {tool.label}
              </button>
            );
          })}
        </div>
        <div className="mt-auto" />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground">Documento</p>
            <h1 className="text-lg font-semibold text-foreground">{doc.title}</h1>
            <p className="text-xs text-muted-foreground">
              {doc.updatedAt} - {doc.owner}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline">Discard</Button>
            <Button>Save</Button>
          </div>
        </header>

        <div className="flex-1 rounded-2xl bg-muted/40 p-6">
          <div className="mx-auto w-full max-w-4xl">
            <div
              className="relative mx-auto w-full overflow-hidden rounded-lg bg-white shadow-sm"
              style={{ aspectRatio: "8.5 / 11" }}
            >
              <PdfViewer />
              <div
                ref={overlayRef}
                className={cn(
                  "absolute inset-0 z-10",
                  selectedTool ? "cursor-crosshair" : "cursor-default",
                )}
                onClick={handleCanvasClick}
                onDrop={handleCanvasDrop}
                onDragOver={handleCanvasDragOver}
                aria-hidden="true"
              >
                {fields.map((field) => (
                  <div
                    key={field.id}
                    className="group absolute cursor-move rounded-md border border-primary/40 bg-primary/10 text-[11px] font-semibold text-primary/80 shadow-sm"
                    style={{
                      left: field.x,
                      top: field.y,
                      width: field.width,
                      height: field.height,
                    }}
                    onMouseDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      event.stopPropagation();
                      const bounds = overlayRef.current?.getBoundingClientRect();
                      if (!bounds) return;
                      setDragState({
                        id: field.id,
                        offsetX: event.clientX - bounds.left - field.x,
                        offsetY: event.clientY - bounds.top - field.y,
                      });
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="absolute right-1 text-primary/70 opacity-0 pointer-events-none transition group-hover:pointer-events-auto group-hover:opacity-100 group-hover:text-primary/90"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          aria-label="Field actions"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" sideOffset={6}>
                        <DropdownMenuItem
                          onSelect={() => {
                            setBindingFieldId(field.id);
                            setBindingDraft(field.bindingKey ?? "");
                            setBindingDialogOpen(true);
                          }}
                        >
                          <Tag className="h-4 w-4" />
                          Associa binding key
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => {
                            setFields((prev) =>
                              prev.filter((item) => item.id !== field.id),
                            );
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Cancella
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <span className="block max-w-full truncate px-2 py-1 leading-none">
                      {field.bindingKey?.trim()
                        ? field.bindingKey
                        : field.type === "input"
                          ? "Input"
                          : field.type === "sign"
                            ? "Sign"
                            : "Text area"}
                    </span>
                    {field.type === "textarea" ? (
                      <span
                        className="absolute bottom-1 right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-primary/60 bg-white/90"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setResizeState({
                            id: field.id,
                            startX: event.clientX,
                            startY: event.clientY,
                            startWidth: field.width,
                            startHeight: field.height,
                          });
                        }}
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <Dialog
        open={bindingDialogOpen}
        onOpenChange={(open) => {
          setBindingDialogOpen(open);
          if (!open) {
            setBindingFieldId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Associa binding key</DialogTitle>
            <DialogDescription>
              Inserisci la chiave da mostrare sul campo selezionato.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleBindingSubmit}>
            <Input
              value={bindingDraft}
              onChange={(event) => setBindingDraft(event.target.value)}
              placeholder={bindingField?.bindingKey ?? "es. customer_name"}
              autoFocus
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBindingDialogOpen(false)}
              >
                Annulla
              </Button>
              <Button type="submit">Salva</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
