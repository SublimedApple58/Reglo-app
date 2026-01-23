"use client";

import { useMemo } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { primaryNodeStyle, secondaryNodeStyle } from "@/components/pages/Workflows/Editor/constants";
import type { AiWorkflowPreview } from "@/lib/ai/types";

type AiPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: AiWorkflowPreview | null;
  onApply: () => void;
  onRegenerate: () => void;
  attachOptions?: Array<{ id: string; label: string }>;
  attachTo?: string | null;
  onAttachChange?: (value: string) => void;
  removedLabels?: string[];
};

export function AiPreviewDialog({
  open,
  onOpenChange,
  preview,
  onApply,
  onRegenerate,
  attachOptions = [],
  attachTo,
  onAttachChange,
  removedLabels = [],
}: AiPreviewDialogProps) {
  const { nodes, edges } = useMemo(() => {
    if (!preview?.nodes?.length) return { nodes: [], edges: [] };
    const previewNodes: Node[] = [];
    const previewEdges: Edge[] = [];

    previewNodes.push({
      id: "ai-trigger",
      position: { x: 0, y: 0 },
      data: { label: preview.trigger?.type === "document_completed" ? "Trigger: Template" : "Trigger: Manuale" },
      style: primaryNodeStyle,
    });

    const idMap = new Map<string, string>();
    preview.nodes.forEach((node, index) => {
      const id = `ai-${node.id}`;
      idMap.set(node.id, id);
      previewNodes.push({
        id,
        position: { x: 0, y: 120 + index * 120 },
        data: { label: node.label ?? node.blockId },
        style: secondaryNodeStyle,
      });
    });

    const incoming = new Set(preview.edges?.map((edge) => edge.to) ?? []);
    preview.nodes.forEach((node) => {
      if (!incoming.has(node.id)) {
        previewEdges.push({
          id: `ai-edge-trigger-${node.id}`,
          source: "ai-trigger",
          target: idMap.get(node.id) ?? "",
          animated: true,
        });
      }
    });

    preview.edges?.forEach((edge, index) => {
      const source = idMap.get(edge.from);
      const target = idMap.get(edge.to);
      if (!source || !target) return;
      previewEdges.push({
        id: `ai-edge-${index}`,
        source,
        target,
        animated: true,
      });
    });

    return { nodes: previewNodes, edges: previewEdges };
  }, [preview]);

  const showGraph = preview?.status === "ok" || preview?.status === "blocked";
  const canAttach = attachOptions.length > 0 && preview?.status === "ok";
  const effectiveRemoved = removedLabels.length > 0 ? removedLabels : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{preview?.title ?? "Preview workflow"}</DialogTitle>
          <DialogDescription>{preview?.summary ?? "Anteprima generata da AI."}</DialogDescription>
        </DialogHeader>

        {preview?.status === "not_possible" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {preview.message ?? "Questo workflow non e' disponibile."}
          </div>
        ) : null}

        {preview?.status === "needs_clarification" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Servono ancora chiarimenti prima di generare il workflow.
          </div>
        ) : null}

        {showGraph ? (
          <div className="mt-4 h-[360px] rounded-xl border bg-muted/20">
            <ReactFlow nodes={nodes} edges={edges} nodesDraggable={false} nodesConnectable={false} fitView>
              <Controls />
              <Background gap={16} size={1} />
            </ReactFlow>
          </div>
        ) : null}

        {canAttach ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Attacca a
            </p>
            <Select value={attachTo ?? ""} onValueChange={onAttachChange}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona un blocco" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="start">Start</SelectItem>
                {attachOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {effectiveRemoved.length > 0 ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            <p className="font-semibold">Blocchi da rimuovere</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {effectiveRemoved.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {preview?.warnings?.length ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <p className="font-semibold">Note AI</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {preview?.missingIntegrations?.length ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <p className="font-semibold">Servizi da connettere</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {preview.missingIntegrations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onRegenerate}>
            Modifica prompt
          </Button>
          <Button onClick={onApply} disabled={preview?.status !== "ok"}>
            Applica al canvas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
