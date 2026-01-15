export type WorkflowNode = {
  id: string;
  type: string;
  config?: Record<string, unknown>;
};

export type WorkflowEdge = {
  from: string;
  to: string;
  condition?: Record<string, unknown> | null;
};

export function computeExecutionOrder(definition?: {
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}) {
  const nodes = definition?.nodes ?? [];
  const edges = definition?.edges ?? [];
  if (nodes.length === 0) return [];

  const incomingCount = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  nodes.forEach((node) => incomingCount.set(node.id, 0));

  edges.forEach((edge) => {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
  });

  const startNodes = nodes.filter((node) => (incomingCount.get(node.id) ?? 0) === 0);
  const visited = new Set<string>();
  const order: string[] = [];

  const walk = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    order.push(nodeId);
    const next = outgoing.get(nodeId) ?? [];
    if (next.length > 0) {
      walk(next[0]);
    }
  };

  startNodes.forEach((node) => walk(node.id));

  nodes.forEach((node) => {
    if (!visited.has(node.id)) order.push(node.id);
  });

  return order;
}

export type Condition = {
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains";
  left: string;
  right: string;
};

type RunContext = {
  triggerPayload?: unknown;
  stepOutputs: Record<string, unknown>;
};

const resolvePath = (value: unknown, path: string) => {
  if (!path) return undefined;
  const parts = path.split(".").filter(Boolean);
  let current: any = value;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
};

const parseValue = (raw: string) => {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const number = Number(trimmed);
  if (!Number.isNaN(number) && `${number}` === trimmed) {
    return number;
  }
  return trimmed;
};

export const resolveExpression = (value: string, context: RunContext) => {
  const trimmed = value.trim();
  const match = trimmed.match(/^\{\{\s*([^}]+)\s*\}\}$/);
  if (match) {
    const path = match[1];
    if (path.startsWith("trigger.")) {
      return resolvePath(context.triggerPayload, path.replace(/^trigger\./, ""));
    }
    if (path.startsWith("steps.")) {
      const parts = path.replace(/^steps\./, "").split(".");
      const stepId = parts.shift();
      if (!stepId) return undefined;
      const output = context.stepOutputs[stepId];
      return resolvePath(output, parts.join("."));
    }
    return resolvePath(context, path);
  }
  return parseValue(trimmed);
};

export const evaluateCondition = (condition: Condition, context: RunContext) => {
  const leftValue = resolveExpression(condition.left, context);
  const rightValue = resolveExpression(condition.right, context);

  switch (condition.op) {
    case "eq":
      return leftValue === rightValue;
    case "neq":
      return leftValue !== rightValue;
    case "gt":
      return Number(leftValue) > Number(rightValue);
    case "gte":
      return Number(leftValue) >= Number(rightValue);
    case "lt":
      return Number(leftValue) < Number(rightValue);
    case "lte":
      return Number(leftValue) <= Number(rightValue);
    case "contains":
      if (Array.isArray(leftValue)) {
        return leftValue.includes(rightValue as never);
      }
      if (typeof leftValue === "string") {
        return leftValue.includes(String(rightValue));
      }
      return false;
    default:
      return false;
  }
};

export const getNextNodeId = (
  nodeId: string,
  edges: WorkflowEdge[],
  branch?: string | null,
) => {
  const outgoing = edges.filter((edge) => edge.from === nodeId);
  if (outgoing.length === 0) return null;
  if (branch) {
    const matched = outgoing.find(
      (edge) => (edge.condition as { branch?: string } | null)?.branch === branch,
    );
    if (matched) return matched.to;
  }
  return outgoing[0].to;
};
