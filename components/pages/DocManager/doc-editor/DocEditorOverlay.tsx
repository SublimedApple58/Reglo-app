"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Tag, Trash2 } from "lucide-react";
import type { PlacedField, ToolId } from "../doc-manager.types";

type DocEditorOverlayProps = {
  fields: PlacedField[];
  selectedTool: ToolId | null;
  overlayRef: React.RefObject<HTMLDivElement>;
  onCanvasClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onCanvasDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onCanvasDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onStartDrag: (field: PlacedField, event: React.MouseEvent<HTMLDivElement>) => void;
  onStartResize: (
    field: PlacedField,
    event: React.MouseEvent<HTMLSpanElement>,
  ) => void;
  onDeleteField: (fieldId: string) => void;
  onRequestBinding: (field: PlacedField) => void;
};

export function DocEditorOverlay({
  fields,
  selectedTool,
  overlayRef,
  onCanvasClick,
  onCanvasDrop,
  onCanvasDragOver,
  onStartDrag,
  onStartResize,
  onDeleteField,
  onRequestBinding,
}: DocEditorOverlayProps): React.ReactElement {
  return (
    <div
      ref={overlayRef}
      className={cn(
        "absolute inset-0 z-10",
        selectedTool ? "cursor-crosshair" : "cursor-default",
      )}
      onClick={onCanvasClick}
      onDrop={onCanvasDrop}
      onDragOver={onCanvasDragOver}
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
          onMouseDown={(event) => onStartDrag(field, event)}
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
              <DropdownMenuItem onSelect={() => onRequestBinding(field)}>
                <Tag className="h-4 w-4" />
                Associa binding key
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onDeleteField(field.id)}
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
              onMouseDown={(event) => onStartResize(field, event)}
              aria-hidden="true"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
