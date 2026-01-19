"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { DocumentCanvas } from "@/components/pages/DocManager/DocumentCanvas";
import { DocumentHeader } from "@/components/pages/DocManager/DocumentHeader";
import { toolItems } from "@/components/pages/DocManager/doc-manager.data";
import type { PlacedField, ToolId } from "@/components/pages/DocManager/doc-manager.types";
import { DocEditorSidebar } from "@/components/pages/DocManager/doc-editor/DocEditorSidebar";
import { DocEditorOverlay } from "@/components/pages/DocManager/doc-editor/DocEditorOverlay";
import { BindingKeyDialog } from "@/components/pages/DocManager/doc-editor/BindingKeyDialog";
import { RichTextDialog } from "@/components/pages/DocManager/doc-editor/RichTextDialog";
import {
  getDocumentConfig,
  saveDocumentFields,
} from "@/lib/actions/document.actions";
import { useAtomValue } from "jotai";
import { userSessionAtom } from "@/atoms/user.store";
import { companyAtom } from "@/atoms/company.store";

type DocEditorWrapperProps = {
  docId?: string;
};

export function DocEditorWrapper({
  docId,
}: DocEditorWrapperProps): React.ReactElement {
  const toast = useFeedbackToast();
  const session = useAtomValue(userSessionAtom);
  const company = useAtomValue(companyAtom);
  const [doc, setDoc] = React.useState<{
    id: string;
    title: string;
    updatedAt: string;
    owner: string;
    previewUrl?: string | null;
  } | null>(null);
  const companyId = company?.id ?? null;
  const [pdfFile, setPdfFile] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [selectedTool, setSelectedTool] = React.useState<ToolId | null>(null);
  const [fields, setFields] = React.useState<PlacedField[]>([]);
  const idCounter = React.useRef(0);
  const overlayRefs = React.useRef<Record<number, React.RefObject<HTMLDivElement>>>(
    {},
  );
  const [bindingDialogOpen, setBindingDialogOpen] = React.useState(false);
  const [bindingFieldId, setBindingFieldId] = React.useState<string | null>(null);
  const [bindingDraft, setBindingDraft] = React.useState("");
  const [textDialogOpen, setTextDialogOpen] = React.useState(false);
  const [textFieldId, setTextFieldId] = React.useState<string | null>(null);
  const [textDraft, setTextDraft] = React.useState("");
  const [dragState, setDragState] = React.useState<{
    id: string;
    page: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [resizeState, setResizeState] = React.useState<{
    id: string;
    page: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const loadRef = React.useRef<string | null>(null);

  const getOverlayRef = React.useCallback(
    (page: number) => {
      if (!overlayRefs.current[page]) {
        overlayRefs.current[page] = React.createRef<HTMLDivElement>();
      }
      return overlayRefs.current[page];
    },
    [],
  );

  const formatUpdatedAt = React.useCallback((iso: string) => {
    const updated = new Date(iso);
    const diffMs = Date.now() - updated.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (Number.isNaN(diffMinutes)) return "Aggiornato ora";
    if (diffMinutes < 1) return "Aggiornato ora";
    if (diffMinutes < 60) return `Aggiornato ${diffMinutes}m fa`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Aggiornato ${diffHours}h fa`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `Aggiornato ${diffDays}gg fa`;
    return `Aggiornato il ${updated.toLocaleDateString("it-IT")}`;
  }, []);

  const extractPlainText = React.useCallback((html: string) => {
    if (!html) return "";
    if (typeof window === "undefined") {
      return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return (parsed.body.textContent ?? "").replace(/\s+/g, " ").trim();
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    const loadDocument = async () => {
      if (!docId) return;
      if (loadRef.current === docId) return;
      if (!companyId) return;

      const configRes = await getDocumentConfig({
        companyId,
        templateId: docId,
      });

      if (!configRes.success || !configRes.data) {
        toast.error({ description: configRes.message ?? "Documento non trovato." });
        return;
      }

      const ownerName = session?.user?.name ?? company?.name ?? "Reglo";

      setDoc({
        id: configRes.data.id,
        title: configRes.data.name,
        updatedAt: formatUpdatedAt(configRes.data.updatedAt.toString()),
        owner: ownerName,
        previewUrl: configRes.data.sourceUrl ?? undefined,
      });
      setPdfFile(configRes.data.sourceUrl ?? null);
      const loadedFields = configRes.data.fields.map((field) => ({
        id: field.id,
        type: field.type as ToolId,
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        bindingKey: field.bindingKey ?? undefined,
        meta: (field.meta as { unit?: "ratio"; html?: string } | null) ?? null,
      }));
      setFields(loadedFields);
      idCounter.current = loadedFields.length;
      loadRef.current = docId;
    };

    loadDocument();
    return () => {
      isMounted = false;
    };
  }, [company?.name, companyId, docId, formatUpdatedAt, session?.user?.name, toast]);

  const clampValue = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const isRatioField = React.useCallback(
    (field: PlacedField) => field.meta?.unit === "ratio",
    [],
  );

  const resolveFieldPixels = React.useCallback(
    (field: PlacedField, bounds: DOMRect) => {
    if (isRatioField(field)) {
      const baseWidth = Math.max(bounds.width, 1);
      const baseHeight = Math.max(bounds.height, 1);
      return {
        x: field.x * baseWidth,
        y: field.y * baseHeight,
        width: field.width * baseWidth,
        height: field.height * baseHeight,
      };
    }

    return {
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
    };
    },
    [isRatioField],
  );

  const toFieldUnits = React.useCallback(
    (
      field: PlacedField,
      bounds: DOMRect,
      next: { x: number; y: number; width: number; height: number },
    ) => {
    if (isRatioField(field)) {
      const baseWidth = Math.max(bounds.width, 1);
      const baseHeight = Math.max(bounds.height, 1);
      return {
        x: next.x / baseWidth,
        y: next.y / baseHeight,
        width: next.width / baseWidth,
        height: next.height / baseHeight,
      };
    }

    return next;
    },
    [isRatioField],
  );

  const getTool = (toolId: ToolId) =>
    toolItems.find((item) => item.id === toolId);

  const addFieldAtPoint = (
    toolId: ToolId,
    clientX: number,
    clientY: number,
    bounds: DOMRect,
    page: number,
  ) => {
    const tool = getTool(toolId);
    if (!tool) return;
    const rawX = clientX - bounds.left - tool.width / 2;
    const rawY = clientY - bounds.top - tool.height / 2;
    const x = clampValue(rawX, 0, Math.max(0, bounds.width - tool.width));
    const y = clampValue(rawY, 0, Math.max(0, bounds.height - tool.height));
    const baseWidth = Math.max(bounds.width, 1);
    const baseHeight = Math.max(bounds.height, 1);
    const widthRatio = tool.width / baseWidth;
    const heightRatio = tool.height / baseHeight;
    const isTextBlock = toolId === "text";
    const defaultHtml = isTextBlock ? "<p>Scrivi qui il testo...</p>" : undefined;
    const nextField: PlacedField = {
      id: `field-${idCounter.current++}`,
      type: toolId,
      page,
      x: x / baseWidth,
      y: y / baseHeight,
      width: widthRatio,
      height: heightRatio,
      meta: {
        unit: "ratio",
        ...(defaultHtml ? { html: defaultHtml } : {}),
      },
    };
    setFields((prev) => prev.concat(nextField));
  };

  const handleCanvasClick = (
    page: number,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (!selectedTool) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    addFieldAtPoint(selectedTool, event.clientX, event.clientY, bounds, page);
  };

  const handleCanvasDrop = (
    page: number,
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    const toolId = event.dataTransfer.getData("application/reglo-doc-tool") as ToolId;
    if (!toolId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    addFieldAtPoint(toolId, event.clientX, event.clientY, bounds, page);
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
    page: number,
    field: PlacedField,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = overlayRefs.current[page]?.current?.getBoundingClientRect();
    if (!bounds) return;
    const current = resolveFieldPixels(field, bounds);
    setDragState({
      id: field.id,
      page,
      offsetX: event.clientX - bounds.left - current.x,
      offsetY: event.clientY - bounds.top - current.y,
    });
  };

  const handleStartResize = (
    page: number,
    field: PlacedField,
    event: React.MouseEvent<HTMLSpanElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = overlayRefs.current[page]?.current?.getBoundingClientRect();
    if (!bounds) return;
    const current = resolveFieldPixels(field, bounds);
    setResizeState({
      id: field.id,
      page,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: current.width,
      startHeight: current.height,
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

  const handleEditTextField = (field: PlacedField) => {
    setTextFieldId(field.id);
    setTextDraft(field.meta?.html ?? "<p>Scrivi qui il testo...</p>");
    setTextDialogOpen(true);
  };

  const handleTextSubmit = (nextHtml: string) => {
    if (!textFieldId) return;
    setFields((prev) =>
      prev.map((field) =>
        field.id === textFieldId
          ? {
              ...field,
              meta: {
                unit: field.meta?.unit ?? "ratio",
                html: nextHtml,
              },
            }
          : field,
      ),
    );
    setTextFieldId(null);
  };

  const handleSave = async () => {
    if (!docId || !companyId || isSaving) return;
    setIsSaving(true);

    const normalizedFields: PlacedField[] = fields.map((field): PlacedField => {
      if (isRatioField(field)) return field;
      const bounds =
        overlayRefs.current[field.page]?.current?.getBoundingClientRect();
      if (!bounds) {
        return field;
      }
      const baseWidth = Math.max(bounds.width, 1);
      const baseHeight = Math.max(bounds.height, 1);
      const nextMeta: PlacedField["meta"] = {
        unit: "ratio",
        ...(field.meta?.html ? { html: field.meta.html } : {}),
      };
      return {
        ...field,
        x: field.x / baseWidth,
        y: field.y / baseHeight,
        width: field.width / baseWidth,
        height: field.height / baseHeight,
        meta: nextMeta,
      };
    });

    const payloadFields = normalizedFields.map((field) => {
      const label = field.type === "text"
        ? extractPlainText(field.meta?.html ?? "") || "Testo"
        : field.bindingKey ?? undefined;
      return {
        type: field.type,
        label,
        bindingKey: field.bindingKey ?? undefined,
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        meta: field.meta ?? undefined,
      };
    });

    const res = await saveDocumentFields({
      companyId,
      templateId: docId,
      fields: payloadFields,
    });

    if (!res.success) {
      toast.error({ description: res.message ?? "Salvataggio fallito." });
      setIsSaving(false);
      return;
    }

    setFields(normalizedFields);
    toast.success({ title: "Salvato", description: "Campi aggiornati." });
    setIsSaving(false);
  };

  React.useEffect(() => {
    if (!dragState && !resizeState) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (dragState) {
        const bounds =
          overlayRefs.current[dragState.page]?.current?.getBoundingClientRect();
        if (!bounds) return;
        setFields((prev) =>
          prev.map((field) => {
            if (field.id !== dragState.id) return field;
            const current = resolveFieldPixels(field, bounds);
            const nextX = clampValue(
              event.clientX - bounds.left - dragState.offsetX,
              0,
              Math.max(0, bounds.width - current.width),
            );
            const nextYValue = clampValue(
              event.clientY - bounds.top - dragState.offsetY,
              0,
              Math.max(0, bounds.height - current.height),
            );
            const updated = toFieldUnits(field, bounds, {
              x: nextX,
              y: nextYValue,
              width: current.width,
              height: current.height,
            });
            return { ...field, x: updated.x, y: updated.y };
          }),
        );
      }

      if (resizeState) {
        const bounds =
          overlayRefs.current[resizeState.page]?.current?.getBoundingClientRect();
        if (!bounds) return;
        setFields((prev) =>
          prev.map((field) => {
            if (field.id !== resizeState.id) return field;
            const tool = getTool(field.type);
            if (!tool?.resizable) return field;
            const deltaX = event.clientX - resizeState.startX;
            const deltaY = event.clientY - resizeState.startY;
            const current = resolveFieldPixels(field, bounds);
            const maxWidth = Math.max(0, bounds.width - current.x);
            const maxHeight = Math.max(0, bounds.height - current.y);
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
            const updated = toFieldUnits(field, bounds, {
              x: current.x,
              y: current.y,
              width: nextWidth,
              height: nextHeight,
            });
            return {
              ...field,
              width: updated.width,
              height: updated.height,
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
  }, [dragState, resizeState, resolveFieldPixels, toFieldUnits]);

  const bindingPlaceholder =
    fields.find((field) => field.id === bindingFieldId)?.bindingKey ??
    "es. customer_name";

  const resolvedDoc = doc ?? {
    id: docId ?? "doc",
    title: "Documento",
    updatedAt: "Aggiornato ora",
    owner: "Reglo",
    previewUrl: undefined,
  };

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
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </>
          }
        />

        <DocumentCanvas
          pdfFile={pdfFile ?? undefined}
          renderOverlay={(pageNumber, _pageRef) => (
            <DocEditorOverlay
              key={`overlay-${pageNumber}`}
              pageNumber={pageNumber}
              fields={fields}
              selectedTool={selectedTool}
              overlayRef={getOverlayRef(pageNumber)}
              onCanvasClick={(event) => handleCanvasClick(pageNumber, event)}
              onCanvasDrop={(event) => handleCanvasDrop(pageNumber, event)}
              onCanvasDragOver={handleCanvasDragOver}
              onStartDrag={(field, event) =>
                handleStartDrag(pageNumber, field, event)
              }
              onStartResize={(field, event) =>
                handleStartResize(pageNumber, field, event)
              }
              onDeleteField={handleDeleteField}
              onRequestBinding={handleRequestBinding}
              onEditText={handleEditTextField}
            />
          )}
        />
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
      <RichTextDialog
        open={textDialogOpen}
        value={textDraft}
        onOpenChange={(open) => {
          setTextDialogOpen(open);
          if (!open) {
            setTextFieldId(null);
          }
        }}
        onSubmit={handleTextSubmit}
      />
    </div>
  );
}
