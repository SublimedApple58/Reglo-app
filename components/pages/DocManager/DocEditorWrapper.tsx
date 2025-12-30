"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { DocumentCanvas } from "@/components/pages/DocManager/DocumentCanvas";
import { DocumentHeader } from "@/components/pages/DocManager/DocumentHeader";
import {
  documents,
  pdfSource,
  toolItems,
} from "@/components/pages/DocManager/doc-manager.data";
import type { PlacedField, ToolId } from "@/components/pages/DocManager/doc-manager.types";
import { DocEditorSidebar } from "@/components/pages/DocManager/doc-editor/DocEditorSidebar";
import { DocEditorOverlay } from "@/components/pages/DocManager/doc-editor/DocEditorOverlay";
import { BindingKeyDialog } from "@/components/pages/DocManager/doc-editor/BindingKeyDialog";

type DocEditorWrapperProps = {
  docId?: string;
};

export function DocEditorWrapper({
  docId,
}: DocEditorWrapperProps): React.ReactElement {
  const doc = documents.find((item) => item.id === docId);
  const resolvedDoc = doc ?? {
    id: docId ?? "doc",
    title: "Documento mock",
    updatedAt: "Aggiornato ora",
    owner: "Reglo",
  };
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

  const clampValue = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const getTool = (toolId: ToolId) =>
    toolItems.find((item) => item.id === toolId);

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

  const handleToolDrag = (
    event: React.DragEvent<HTMLButtonElement>,
    toolId: ToolId,
  ) => {
    event.dataTransfer.setData("application/reglo-doc-tool", toolId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleStartDrag = (
    field: PlacedField,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
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
  };

  const handleStartResize = (
    field: PlacedField,
    event: React.MouseEvent<HTMLSpanElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setResizeState({
      id: field.id,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: field.width,
      startHeight: field.height,
    });
  };

  const handleDeleteField = (fieldId: string) => {
    setFields((prev) => prev.filter((item) => item.id !== fieldId));
  };

  const handleRequestBinding = (field: PlacedField) => {
    setBindingFieldId(field.id);
    setBindingDraft(field.bindingKey ?? "");
    setBindingDialogOpen(true);
  };

  const handleBindingSubmit = () => {
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
            const nextYValue = clampValue(
              event.clientY - bounds.top - dragState.offsetY,
              0,
              Math.max(0, bounds.height - field.height),
            );
            return { ...field, x: Math.round(nextX), y: Math.round(nextYValue) };
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

  const bindingPlaceholder =
    fields.find((field) => field.id === bindingFieldId)?.bindingKey ??
    "es. customer_name";

  return (
    <div className="flex min-h-[calc(100vh-160px)] w-full gap-6 p-6">
      <DocEditorSidebar
        tools={toolItems}
        selectedTool={selectedTool}
        onSelectTool={setSelectedTool}
        onDragTool={handleToolDrag}
      />

      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <DocumentHeader
          title={resolvedDoc.title}
          subtitle="Documento"
          meta={`${resolvedDoc.updatedAt} - ${resolvedDoc.owner}`}
          actions={
            <>
              <Button variant="outline">Discard</Button>
              <Button>Save</Button>
            </>
          }
        />

        <DocumentCanvas pdfFile={doc?.previewUrl ?? pdfSource}>
          <DocEditorOverlay
            fields={fields}
            selectedTool={selectedTool}
            overlayRef={overlayRef}
            onCanvasClick={handleCanvasClick}
            onCanvasDrop={handleCanvasDrop}
            onCanvasDragOver={handleCanvasDragOver}
            onStartDrag={handleStartDrag}
            onStartResize={handleStartResize}
            onDeleteField={handleDeleteField}
            onRequestBinding={handleRequestBinding}
          />
        </DocumentCanvas>
      </section>

      <BindingKeyDialog
        open={bindingDialogOpen}
        value={bindingDraft}
        placeholder={bindingPlaceholder}
        onChange={setBindingDraft}
        onOpenChange={(open) => {
          setBindingDialogOpen(open);
          if (!open) {
            setBindingFieldId(null);
          }
        }}
        onSubmit={handleBindingSubmit}
      />
    </div>
  );
}
