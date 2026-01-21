import type { Edge, Node } from "reactflow";

import { blockConfigDefinitions, primaryNodeStyle, secondaryNodeStyle } from "@/components/pages/Workflows/Editor/constants";

export const buildNodes = (title: string, isNew: boolean): Node[] => {
  const startNode: Node = {
    id: "start",
    type: "input",
    position: { x: 120, y: 120 },
    data: { label: `Start · ${title}` },
    style: primaryNodeStyle,
    deletable: false,
    draggable: false,
  };

  if (isNew) {
    return [startNode];
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
      position: { x: 600, y: 120 },
      data: { label: "Completato" },
      style: primaryNodeStyle,
      deletable: false,
    },
  ];
};

export const buildEdges = (isNew: boolean): Edge[] =>
  isNew
    ? []
    : [
        { id: "e1", source: "start", target: "approval", animated: true },
        { id: "e2", source: "approval", target: "complete", animated: true },
      ];

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
