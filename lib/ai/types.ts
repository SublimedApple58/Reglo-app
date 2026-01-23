export type AiWorkflowTrigger = {
  type: "manual" | "document_completed";
  templateId?: string;
  manualFields?: Array<{ key: string; required?: boolean }>;
};

export type AiWorkflowNode = {
  id: string;
  blockId: string;
  label?: string;
  config?: Record<string, string | number | boolean | null>;
};

export type AiWorkflowEdge = {
  from: string;
  to: string;
};

export type AiWorkflowPreview = {
  status: "ok" | "needs_clarification" | "not_possible" | "blocked";
  title?: string;
  summary?: string;
  message?: string;
  trigger?: AiWorkflowTrigger;
  overrideTrigger?: boolean;
  nodes?: AiWorkflowNode[];
  edges?: AiWorkflowEdge[];
  attachTo?: string;
  removeNodes?: string[];
  clarifyingQuestions?: string[];
  warnings?: string[];
  missingIntegrations?: string[];
};
