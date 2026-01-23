import { useCallback, useMemo, useState } from "react";
import type { Edge, Node } from "reactflow";

import { generateWorkflowPreview } from "@/lib/actions/ai.actions";
import type { AiWorkflowPreview } from "@/lib/ai/types";
import {
  primaryNodeStyle,
  secondaryNodeStyle,
} from "@/components/pages/Workflows/Editor/constants";
import type { ManualFieldDefinition, TriggerType } from "@/components/pages/Workflows/Editor/types";

export type AiAttachOption = { id: string; label: string };

type UseWorkflowAiArgs = {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  workflowName: string;
  setWorkflowName: (value: string) => void;
  setTriggerType: (value: TriggerType) => void;
  setTriggerConfig: (value: Record<string, string>) => void;
  setManualFieldDefinitions: (value: ManualFieldDefinition[]) => void;
  setNodes: (value: Node[]) => void;
  setEdges: (value: Edge[]) => void;
  getNextNodeId: () => string;
  toast: { error: (opts: { description: string }) => void };
};

export const useWorkflowAi = ({
  nodes,
  edges,
  selectedNodeId,
  workflowName,
  setWorkflowName,
  setTriggerType,
  setTriggerConfig,
  setManualFieldDefinitions,
  setNodes,
  setEdges,
  getNextNodeId,
  toast,
}: UseWorkflowAiArgs) => {
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [aiAnswers, setAiAnswers] = useState<Record<string, string>>({});
  const [aiPreview, setAiPreview] = useState<AiWorkflowPreview | null>(null);
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiAttachTo, setAiAttachTo] = useState<string | null>(null);
  const [aiLastPrompt, setAiLastPrompt] = useState("");
  const [aiPanelCollapsed, setAiPanelCollapsed] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const buildNodeLookup = useCallback((sourceNodes: Node[]) => {
    const idSet = new Set<string>();
    const labelToIds = new Map<string, string[]>();
    const blockToIds = new Map<string, string[]>();
    const normalize = (value: string) => value.trim().toLowerCase();
    sourceNodes.forEach((node) => {
      if (node.id === "start") return;
      const nodeId = String(node.id ?? "");
      if (!nodeId) return;
      idSet.add(nodeId);
      const data = typeof node.data === "object" && node.data ? node.data : {};
      const labelValue = (data as { label?: string }).label;
      const label: string =
        typeof labelValue === "string" && labelValue.trim().length > 0
          ? labelValue
          : nodeId;
      const blockValue = (data as { blockId?: string }).blockId;
      const blockId: string =
        typeof blockValue === "string" && blockValue.trim().length > 0 ? blockValue : "";
      if (label) {
        const key = normalize(label);
        labelToIds.set(key, [...(labelToIds.get(key) ?? []), nodeId]);
      }
      if (blockId) {
        const key = normalize(blockId);
        blockToIds.set(key, [...(blockToIds.get(key) ?? []), nodeId]);
      }
    });
    return { idSet, labelToIds, blockToIds, normalize };
  }, []);

  const resolveNodeId = useCallback(
    (
      value: string | null | undefined,
      lookup: ReturnType<typeof buildNodeLookup>,
    ) => {
      if (!value) return null;
      if (lookup.idSet.has(value)) return value;
      const key = lookup.normalize(value);
      const labelMatch = lookup.labelToIds.get(key);
      if (labelMatch && labelMatch.length > 0) {
        return labelMatch[labelMatch.length - 1];
      }
      const blockMatch = lookup.blockToIds.get(key);
      if (blockMatch && blockMatch.length > 0) {
        return blockMatch[blockMatch.length - 1];
      }
      return null;
    },
    [],
  );

  const resolveRemoveNodeIds = useCallback(
    (values: string[] | undefined, lookup: ReturnType<typeof buildNodeLookup>) => {
      const ids = new Set<string>();
      (values ?? []).forEach((value) => {
        const resolved = resolveNodeId(value, lookup);
        if (resolved) {
          ids.add(resolved);
        }
      });
      return ids;
    },
    [resolveNodeId],
  );

  const handleAiAnswerChange = useCallback((question: string, value: string) => {
    setAiAnswers((prev) => ({ ...prev, [question]: value }));
  }, []);

  const handleAiPromptChange = useCallback(
    (value: string) => {
      setAiPrompt(value);
      if (aiQuestions.length > 0) {
        setAiQuestions([]);
        setAiAnswers({});
      }
    },
    [aiQuestions.length],
  );

  const handleAiGenerate = useCallback(async () => {
    const basePrompt = aiPrompt.trim() ? aiPrompt : aiLastPrompt;
    if (!basePrompt.trim()) {
      toast.error({ description: "Scrivi un prompt per l'AI." });
      return;
    }
    setAiLoading(true);
    setAiError(null);
    if (aiPrompt.trim()) {
      setAiLastPrompt(aiPrompt);
    }
    setAiPrompt("");
    const existingNodes: Array<{ id: string; label: string; blockId: string }> = nodes
      .filter((node) => node.id !== "start")
      .map((node) => {
        const data = typeof node.data === "object" && node.data ? node.data : {};
        const maybeLabel = (data as { label?: string }).label;
        const rawLabel = typeof maybeLabel === "string" ? maybeLabel : "";
        const label: string = rawLabel.trim() ? rawLabel : node.id;
        const maybeBlockId = (data as { blockId?: string }).blockId;
        const rawBlockId = typeof maybeBlockId === "string" ? maybeBlockId : "";
        const blockId: string = rawBlockId.trim() ? rawBlockId : "start";
        return { id: node.id, label, blockId };
      });
    const res = await generateWorkflowPreview({
      prompt: basePrompt,
      answers: aiQuestions.length > 0 ? aiAnswers : undefined,
      existingNodes,
    });
    if (!res.success) {
      const message =
        "message" in res && typeof res.message === "string"
          ? res.message
          : "Impossibile generare la preview.";
      setAiError(message);
      setAiLoading(false);
      return;
    }
    const preview = res.data as AiWorkflowPreview;
    setAiPreview(preview);
    if (preview.status === "needs_clarification") {
      setAiQuestions(preview.clarifyingQuestions ?? []);
      setAiLoading(false);
      return;
    }
    const lookup = buildNodeLookup(nodes);
    const removalIds = resolveRemoveNodeIds(preview.removeNodes, lookup);
    const resolvedAttach = resolveNodeId(preview.attachTo, lookup);
    let fallbackAttach = "start";
    for (let i = existingNodes.length - 1; i >= 0; i -= 1) {
      const candidate = existingNodes[i]?.id;
      if (candidate && !removalIds.has(candidate)) {
        fallbackAttach = candidate;
        break;
      }
    }
    const defaultAttach =
      (selectedNodeId && !removalIds.has(selectedNodeId) ? selectedNodeId : null) ??
      (resolvedAttach && !removalIds.has(resolvedAttach) ? resolvedAttach : null) ??
      fallbackAttach;
    setAiAttachTo(defaultAttach);
    setAiQuestions([]);
    setAiAnswers({});
    setAiLoading(false);
    setAiPreviewOpen(true);
  }, [
    aiAnswers,
    aiLastPrompt,
    aiPrompt,
    aiQuestions.length,
    buildNodeLookup,
    nodes,
    resolveNodeId,
    resolveRemoveNodeIds,
    selectedNodeId,
    toast,
  ]);

  const applyAiPreview = useCallback(
    (attachToOverride?: string | null) => {
      if (!aiPreview || aiPreview.status !== "ok") {
        return;
      }

      const startNode =
        nodes.find((node) => node.id === "start") ??
        ({
          id: "start",
          type: "input",
          position: { x: 120, y: 120 },
          data: { label: `Start · ${workflowName}` },
          style: primaryNodeStyle,
          deletable: false,
          draggable: false,
        } as Node);

      const lookup = buildNodeLookup(nodes);
      const removalIds = resolveRemoveNodeIds(aiPreview.removeNodes, lookup);
      if (removalIds.has("start")) {
        removalIds.delete("start");
      }
      const baseNodes = nodes.filter((node) => !removalIds.has(node.id));
      const baseEdges = edges.filter(
        (edge) => !removalIds.has(edge.source) && !removalIds.has(edge.target),
      );

      const anchorId = attachToOverride ?? aiAttachTo ?? "start";
      const anchorNode =
        baseNodes.find((node) => node.id === anchorId) ??
        baseNodes.find((node) => node.id === "start") ??
        startNode;

      const anchorPosition = anchorNode.position ?? { x: 120, y: 120 };
      const previewNodes = aiPreview.nodes ?? [];
      const resolvePreviewNodeId = (node: { id: string; label?: string | null; blockId: string }) =>
        resolveNodeId(node.id, lookup) ??
        (node.label ? resolveNodeId(node.label, lookup) : null) ??
        resolveNodeId(node.blockId, lookup);
      const resolvedPreviewIds = previewNodes
        .map((node) => resolvePreviewNodeId(node))
        .filter((value): value is string => Boolean(value));
      const uniqueResolved = new Set(resolvedPreviewIds);
      const existingIds = baseNodes.filter((node) => node.id !== "start").map((node) => node.id);
      const isSnapshotOfExisting =
        previewNodes.length > 0 &&
        resolvedPreviewIds.length === previewNodes.length &&
        uniqueResolved.size === previewNodes.length;
      const matchesRemaining =
        isSnapshotOfExisting && uniqueResolved.size === existingIds.length;
      const shouldReuseExistingNodes = isSnapshotOfExisting;
      const applyRemovalOnly = removalIds.size > 0 && matchesRemaining;
      const shouldSkipNewNodes =
        previewNodes.length === 0 || applyRemovalOnly || shouldReuseExistingNodes;

      let reusedExistingNodes = false;
      if (shouldReuseExistingNodes) {
        const previewEdges = aiPreview.edges ?? [];
        const previewToExisting = new Map<string, string>();
        previewNodes.forEach((node) => {
          const resolved = resolvePreviewNodeId(node);
          if (resolved) previewToExisting.set(node.id, resolved);
        });
        const mappedEdges = previewEdges
          .map((edge, index) => {
            const source = previewToExisting.get(edge.from);
            const target = previewToExisting.get(edge.to);
            if (!source || !target) return null;
            return {
              id: `e-ai-rewire-${index}`,
              source,
              target,
              animated: true,
            } as Edge;
          })
          .filter((edge): edge is Edge => Boolean(edge));
        const existingSet = new Set(existingIds);
        const filteredEdges = previewEdges.length
          ? baseEdges.filter(
              (edge) => !(existingSet.has(edge.source) && existingSet.has(edge.target)),
            )
          : baseEdges;
        const existingStart = baseNodes.find((node) => node.id === "start") ?? startNode;
        const mergedNodes = [
          existingStart,
          ...baseNodes.filter((node) => node.id !== "start"),
        ];
        setNodes(mergedNodes);
        setEdges(previewEdges.length ? [...filteredEdges, ...mappedEdges] : filteredEdges);
        reusedExistingNodes = true;
      }

      const idMap = new Map<string, string>();
      const aiNodes: Node[] = shouldSkipNewNodes
        ? []
        : previewNodes.map((node, index) => {
            const id = `ai-${getNextNodeId()}`;
            idMap.set(node.id, id);
            const config = node.config
              ? Object.fromEntries(
                  Object.entries(node.config).map(([key, value]) => [
                    key,
                    typeof value === "string" ? value : value == null ? "" : String(value),
                  ]),
                )
              : {};
            return {
              id,
              position: { x: anchorPosition.x + 280, y: anchorPosition.y + index * 140 },
              data: {
                label: node.label ?? node.blockId,
                blockId: node.blockId,
                config,
                configTouched: true,
              },
              style: secondaryNodeStyle,
            };
          });

      const previewEdges = shouldSkipNewNodes ? [] : aiPreview.edges ?? [];
      const incoming = new Set(previewEdges.map((edge) => edge.to));
      const aiEdges: Edge[] = [];
      const edgeKeys = new Set<string>();

      previewEdges.forEach((edge, index) => {
        const source = idMap.get(edge.from);
        const target = idMap.get(edge.to);
        if (!source || !target) return;
        const key = `${source}->${target}`;
        if (edgeKeys.has(key)) return;
        edgeKeys.add(key);
        aiEdges.push({
          id: `e-ai-${index}`,
          source,
          target,
          animated: true,
        });
      });

      if (previewEdges.length === 0 && aiNodes.length > 1) {
        for (let i = 0; i < aiNodes.length - 1; i += 1) {
          const source = aiNodes[i].id;
          const target = aiNodes[i + 1].id;
          const key = `${source}->${target}`;
          if (edgeKeys.has(key)) continue;
          edgeKeys.add(key);
          aiEdges.push({
            id: `e-chain-${source}-${target}`,
            source,
            target,
            animated: true,
          });
        }
      }

      previewNodes.forEach((node) => {
        if (!incoming.has(node.id)) {
          const target = idMap.get(node.id);
          if (!target) return;
          const key = `${startNode.id}->${target}`;
          if (edgeKeys.has(key)) return;
          edgeKeys.add(key);
          aiEdges.push({
            id: `e-start-${target}`,
            source: startNode.id,
            target,
            animated: true,
          });
        }
      });

      if (!aiEdges.some((edge) => edge.source === anchorNode.id) && aiNodes.length > 0) {
        const target = aiNodes[0].id;
        const key = `${anchorNode.id}->${target}`;
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          aiEdges.push({
            id: `e-start-${target}`,
            source: anchorNode.id,
            target,
            animated: true,
          });
        }
      }

      const existingStart = baseNodes.find((node) => node.id === "start") ?? startNode;
      const mergedNodes = [
        existingStart,
        ...baseNodes.filter((node) => node.id !== "start"),
        ...aiNodes,
      ];
      const mergedEdges = shouldSkipNewNodes ? baseEdges : [...baseEdges, ...aiEdges];

      if (!reusedExistingNodes) {
        setNodes(mergedNodes);
        setEdges(mergedEdges);
      }

      if (aiPreview.title && workflowName.trim() === "Workflow") {
        setWorkflowName(aiPreview.title);
      }

      const hasExistingNodes = baseNodes.some((node) => node.id !== "start");
      const shouldApplyTrigger = !hasExistingNodes || aiPreview.overrideTrigger;
      if (shouldApplyTrigger && aiPreview.trigger?.type) {
        setTriggerType(aiPreview.trigger.type as TriggerType);
        if (aiPreview.trigger.type === "manual") {
          setTriggerConfig({});
          const manualFields = aiPreview.trigger.manualFields ?? [];
          setManualFieldDefinitions(
            manualFields.map((field, index) => ({
              id: `manual-${index}`,
              key: field.key,
              required: field.required ?? false,
            })),
          );
        }
        if (aiPreview.trigger.type === "document_completed") {
          setTriggerConfig({ templateId: aiPreview.trigger.templateId ?? "" });
          setManualFieldDefinitions([]);
        }
      }

      setAiPreviewOpen(false);
    },
    [
      aiAttachTo,
      aiPreview,
      buildNodeLookup,
      edges,
      getNextNodeId,
      nodes,
      resolveNodeId,
      resolveRemoveNodeIds,
      setEdges,
      setManualFieldDefinitions,
      setNodes,
      setTriggerConfig,
      setTriggerType,
      setWorkflowName,
      workflowName,
    ],
  );

  const aiPreviewAttachOptions = useMemo<AiAttachOption[]>(() => {
    const lookup = buildNodeLookup(nodes);
    const removalIds = aiPreview ? resolveRemoveNodeIds(aiPreview.removeNodes, lookup) : new Set<string>();
    return nodes
      .filter((node) => node.id !== "start" && !removalIds.has(node.id))
      .map((node) => {
        const data = typeof node.data === "object" && node.data ? node.data : {};
        const maybeLabel = (data as { label?: string }).label;
        const rawLabel = typeof maybeLabel === "string" ? maybeLabel : "";
        const label = rawLabel.trim() ? rawLabel : node.id;
        return { id: node.id, label };
      });
  }, [aiPreview, buildNodeLookup, nodes, resolveRemoveNodeIds]);

  const aiPreviewRemovedLabels = useMemo(() => {
    if (!aiPreview) return [] as string[];
    const lookup = buildNodeLookup(nodes);
    const removalIds = resolveRemoveNodeIds(aiPreview.removeNodes, lookup);
    const labelById = new Map<string, string>();
    nodes.forEach((node) => {
      if (node.id === "start") return;
      const data = typeof node.data === "object" && node.data ? node.data : {};
      const maybeLabel = (data as { label?: string }).label;
      const rawLabel = typeof maybeLabel === "string" ? maybeLabel : "";
      const label = rawLabel.trim() ? rawLabel : node.id;
      labelById.set(node.id, label);
    });
    return Array.from(removalIds).map((id) => labelById.get(id) ?? id);
  }, [aiPreview, buildNodeLookup, nodes, resolveRemoveNodeIds]);

  return {
    aiPrompt,
    aiQuestions,
    aiAnswers,
    aiPreview,
    aiPreviewOpen,
    aiAttachTo,
    aiPanelCollapsed,
    aiLoading,
    aiError,
    setAiPanelCollapsed,
    setAiPreviewOpen,
    setAiAttachTo,
    handleAiPromptChange,
    handleAiAnswerChange,
    handleAiGenerate,
    applyAiPreview,
    aiPreviewAttachOptions,
    aiPreviewRemovedLabels,
  };
};
