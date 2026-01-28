import type { Edge, Node } from "reactflow";

import {
  blockConfigDefinitions,
  endNodeStyle,
  primaryNodeStyle,
  secondaryNodeStyle,
  startNodeStyle,
} from "@/components/pages/Workflows/Editor/constants";

const buildStartNode = (title: string): Node => ({
  id: "start",
  type: "input",
  position: { x: 120, y: 140 },
  data: { label: `Start · ${title}` },
  style: startNodeStyle,
  deletable: false,
  draggable: false,
});

const buildEndNode = (): Node => ({
  id: "end",
  type: "output",
  position: { x: 720, y: 140 },
  data: { label: "Fine" },
  style: endNodeStyle,
  deletable: false,
});

export const buildNodes = (title: string, isNew: boolean): Node[] => {
  const startNode = buildStartNode(title);
  const endNode = buildEndNode();

  if (isNew) {
    return [startNode, endNode];
  }

  return [
    startNode,
    {
      id: "approval",
      position: { x: 360, y: 120 },
      data: { label: "Approvazione responsabile" },
      style: secondaryNodeStyle,
    },
    {
      id: "complete",
      type: "output",
      position: { x: 600, y: 140 },
      data: { label: "Completato" },
      style: primaryNodeStyle,
      deletable: false,
    },
    endNode,
  ];
};

export const buildEdges = (isNew: boolean): Edge[] =>
  isNew
    ? []
    : [
        { id: "e1", source: "start", target: "approval", animated: true },
        { id: "e2", source: "approval", target: "complete", animated: true },
      ];

export const ensureStartEndNodes = (nodes: Node[], title: string): Node[] => {
  const next = [...nodes];
  const startIndex = next.findIndex((node) => node.id === "start");
  if (startIndex >= 0) {
    next[startIndex] = {
      ...next[startIndex],
      type: "input",
      data: { ...(typeof next[startIndex].data === "object" ? next[startIndex].data : {}), label: `Start · ${title}` },
      style: startNodeStyle,
      deletable: false,
      draggable: false,
    };
  } else {
    next.unshift(buildStartNode(title));
  }

  const endIndex = next.findIndex((node) => node.id === "end");
  if (endIndex >= 0) {
    next[endIndex] = {
      ...next[endIndex],
      type: "output",
      data: { ...(typeof next[endIndex].data === "object" ? next[endIndex].data : {}), label: "Fine" },
      style: endNodeStyle,
      deletable: false,
    };
  } else {
    next.push(buildEndNode());
  }
  return next;
};

export const isEndConnected = (edges: Edge[]) => edges.some((edge) => edge.target === "end");

export const getDefaultConfig = (blockId: string) => {
  const definition = blockConfigDefinitions[blockId];
  if (!definition) return {};
  const base = definition.fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = "";
    return acc;
  }, {});
  if (blockId === "fic-create-invoice") {
    base.currency = "EUR";
  }
  return base;
};

export const getMissingFields = (blockId: string, config: Record<string, unknown>) => {
  const definition = blockConfigDefinitions[blockId];
  if (!definition) return [];
  return definition.fields
    .filter((field) => field.required)
    .filter((field) => {
      const value = config[field.key];
      if (value == null) return true;
      if (typeof value === "string") return value.trim().length === 0;
      return false;
    })
    .map((field) => field.label);
};

export const hasMissingConfig = (nodes: Node[]) =>
  nodes.some((node) => {
    if (node.id === "start" || node.id === "end") return false;
    if (node.type === "logicIf" || node.type === "logicLoop") return false;
    if (typeof node.data !== "object" || !node.data) return false;
    if (!("blockId" in node.data)) return false;
    const blockId = (node.data as { blockId?: string }).blockId;
    if (!blockId || !blockConfigDefinitions[blockId]) return false;
    const config =
      "config" in node.data
        ? (node.data as { config?: Record<string, unknown> }).config ?? {}
        : {};
    const missing = getMissingFields(blockId, config);
    return missing.length > 0;
  });

export const isWorkflowDraft = (nodes: Node[], edges: Edge[]) =>
  !isEndConnected(edges) || hasMissingConfig(nodes);
