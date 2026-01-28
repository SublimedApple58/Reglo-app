"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Edge, Node } from "reactflow";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { getWorkflowById, updateWorkflow } from "@/lib/actions/workflow.actions";
import { cn } from "@/lib/utils";
import { isWorkflowDraft } from "@/components/pages/Workflows/Editor/utils";

type WorkflowSummaryDrawerProps = {
  workflowId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type WorkflowDefinitionSummary = {
  trigger?: { type?: string };
  nodes?: Array<{ id: string; type: string; config?: Record<string, unknown> }>;
  edges?: Array<{ from: string; to: string }>;
  canvas?: { nodes?: Node[]; edges?: Edge[] };
};

const triggerLabels: Record<string, string> = {
  manual: "Manuale",
  document_completed: "Template compilato",
  email_inbound: "Email in ingresso",
  slack_message: "Messaggio Slack",
  fic_event: "Fatture in Cloud",
};

const statusLabel = (status: string) =>
  status === "paused" ? "Disattivato" : status === "active" ? "Active" : "Draft";

const getIntegrationLabel = (blockId: string) => {
  if (blockId.startsWith("slack-")) return "Slack";
  if (blockId.startsWith("fic-")) return "Fatture in Cloud";
  if (blockId.startsWith("doc-")) return "Doc manager";
  if (blockId.startsWith("reglo-")) return "Reglo";
  return "";
};

const toDraftNodes = (
  canvasNodes: Node[],
  definitionNodes: Array<{ id: string; type: string; config?: Record<string, unknown> }> = [],
): Node[] => {
  if (canvasNodes.length > 0) return canvasNodes;
  return definitionNodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: { x: 0, y: 0 },
    data: {
      blockId: (node.config as { blockId?: string } | undefined)?.blockId ?? node.type,
      config: (node.config as { settings?: Record<string, unknown> } | undefined)?.settings ?? {},
      label: (node.config as { label?: string } | undefined)?.label ?? node.id,
    },
  }));
};

const toDraftEdges = (
  canvasEdges: Edge[],
  definitionEdges: Array<{ from: string; to: string }> = [],
): Edge[] => {
  if (canvasEdges.length > 0) return canvasEdges;
  return definitionEdges.map((edge, index) => ({
    id: `${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
  }));
};

export function WorkflowSummaryDrawer({
  workflowId,
  open,
  onOpenChange,
}: WorkflowSummaryDrawerProps): React.ReactElement {
  const toast = useFeedbackToast();
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<"draft" | "active" | "paused">("draft");
  const [definition, setDefinition] = React.useState<WorkflowDefinitionSummary | null>(null);

  React.useEffect(() => {
    if (!workflowId || !open) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      const res = await getWorkflowById(workflowId);
      if (!active) return;
      if (!res.success || !res.data) {
        toast.error({ description: res.message ?? "Impossibile caricare il workflow." });
        setLoading(false);
        return;
      }
      setName(res.data.name);
      setStatus(res.data.status as "draft" | "active" | "paused");
      setDefinition(res.data.definition as WorkflowDefinitionSummary);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [open, toast, workflowId]);

  const canvasNodes = React.useMemo(
    () => definition?.canvas?.nodes ?? [],
    [definition],
  );
  const canvasEdges = React.useMemo(
    () => definition?.canvas?.edges ?? [],
    [definition],
  );
  const draftNodes = React.useMemo(
    () => toDraftNodes(canvasNodes, definition?.nodes ?? []),
    [canvasNodes, definition?.nodes],
  );
  const draftEdges = React.useMemo(
    () => toDraftEdges(canvasEdges, definition?.edges ?? []),
    [canvasEdges, definition?.edges],
  );
  const isDraft = React.useMemo(() => isWorkflowDraft(draftNodes, draftEdges), [draftEdges, draftNodes]);

  React.useEffect(() => {
    if (isDraft) {
      setStatus("draft");
    }
  }, [isDraft]);

  const triggerType = definition?.trigger?.type ?? "manual";
  const triggerLabel = triggerLabels[triggerType] ?? "Manuale";
  const blockCount = React.useMemo(() => {
    const nodes = draftNodes.filter((node) => node.id !== "start" && node.id !== "end");
    return nodes.length;
  }, [draftNodes]);
  const integrations = React.useMemo(() => {
    const found = new Set<string>();
    draftNodes.forEach((node) => {
      if (typeof node.data !== "object" || !node.data) return;
      const blockId =
        "blockId" in node.data
          ? (node.data as { blockId?: string }).blockId
          : undefined;
      if (!blockId) return;
      const label = getIntegrationLabel(blockId);
      if (label) found.add(label);
    });
    return Array.from(found);
  }, [draftNodes]);

  const handleSave = async () => {
    if (!workflowId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error({ description: "Inserisci un nome workflow." });
      return;
    }
    setSaving(true);
    const nextStatus = isDraft ? "draft" : status;
    const res = await updateWorkflow({
      id: workflowId,
      name: trimmed,
      status: nextStatus,
    });
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile aggiornare il workflow." });
      setSaving(false);
      return;
    }
    toast.success({
      description: isDraft
        ? "Workflow salvato in bozza."
        : "Workflow aggiornato.",
    });
    setSaving(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-[min(100vw,520px)] data-[vaul-drawer-direction=right]:sm:max-w-lg h-full">
        <DrawerHeader className="border-b border-white/60 bg-white/80 backdrop-blur">
          <DrawerTitle>Dettagli workflow</DrawerTitle>
          <DrawerDescription>
            Rivedi le info principali e gestisci lo stato.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full rounded-full" />
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Nome
                </p>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="rounded-full border-white/50 bg-white/90"
                />
              </div>

              <div className="grid gap-3 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Trigger</span>
                  <span className="font-semibold text-foreground">{triggerLabel}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Blocchi</span>
                  <span className="font-semibold text-foreground">{blockCount}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {integrations.length ? (
                    integrations.map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center rounded-full border border-white/60 bg-white/80 px-3 py-1 font-semibold uppercase tracking-[0.14em]"
                      >
                        {item}
                      </span>
                    ))
                  ) : (
                    <span>Nessuna integrazione</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Stato
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border border-white/60 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-sm",
                      status === "active" && "text-emerald-700",
                      status === "draft" && "text-slate-600",
                      status === "paused" && "text-amber-700",
                    )}
                  >
                    {statusLabel(isDraft ? "draft" : status)}
                  </span>
                  <Select
                    value={status}
                    onValueChange={(value) =>
                      setStatus(value as "draft" | "active" | "paused")
                    }
                    disabled={isDraft}
                  >
                    <SelectTrigger className="h-9 min-w-[150px] rounded-full border-white/50 bg-white/90">
                      <SelectValue placeholder="Stato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft" disabled>
                        Draft
                      </SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isDraft ? (
                  <p className="text-xs text-amber-700">
                    Collega il blocco Fine e configura i blocchi richiesti per
                    attivare il workflow.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => router.push(`${pathname}/${workflowId}`)}
                >
                  Apri block editor
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => router.push(`${pathname}/${workflowId}/runs`)}
                >
                  Run history
                </Button>
              </div>
            </>
          )}
        </div>
        <DrawerFooter className="sticky bottom-0 border-t border-white/60 bg-white/90 backdrop-blur flex-col gap-3 px-6 py-4">
          <Button
            type="button"
            className="w-full rounded-full"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? "Salvataggio..." : "Salva modifiche"}
          </Button>
          <DrawerClose asChild>
            <Button type="button" variant="outline" className="w-full rounded-full">
              Chiudi
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
