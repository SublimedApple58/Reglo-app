type WorkflowNode = {
  type?: string;
  config?: Record<string, unknown>;
};

const triggerTokenRegex = /\{\{\s*trigger\.payload\.([^}\s]+)\s*\}\}/g;

const collectTokensFromValue = (value: unknown, acc: Set<string>) => {
  if (typeof value === "string") {
    const matches = value.matchAll(triggerTokenRegex);
    for (const match of matches) {
      const key = match[1]?.trim();
      if (key) acc.add(key);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTokensFromValue(item, acc));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectTokensFromValue(item, acc),
    );
  }
};

export const collectTriggerPayloadKeys = (definition?: {
  nodes?: WorkflowNode[];
}) => {
  const keys = new Set<string>();
  const nodes = definition?.nodes ?? [];
  nodes.forEach((node) => {
    collectTokensFromValue(node.config, keys);
  });
  return Array.from(keys).filter((key) => !key.startsWith("_"));
};
