import { useEffect } from "react";
import type { Edge, Node } from "reactflow";

import { getWorkflowById } from "@/lib/actions/workflow.actions";
import {
  buildEdges,
  buildNodes,
  ensureStartEndNodes,
} from "@/components/pages/Workflows/Editor/utils";
import type {
  ManualFieldDefinition,
  TriggerType,
} from "@/components/pages/Workflows/Editor/types";

export const useWorkflowLoader = ({
  workflowId,
  isNew,
  toast,
  setWorkflowName,
  setWorkflowStatus,
  setTriggerType,
  setTriggerConfig,
  setManualFieldDefinitions,
  setEmailFieldDefinitions,
  setSlackFieldDefinitions,
  setNodes,
  setEdges,
  idCounter,
  manualFieldId,
  emailFieldId,
  slackFieldId,
}: {
  workflowId?: string;
  isNew: boolean;
  toast: { error: (opts: { description: string }) => void };
  setWorkflowName: (value: string) => void;
  setWorkflowStatus: (value: string) => void;
  setTriggerType: (value: TriggerType) => void;
  setTriggerConfig: (value: Record<string, string>) => void;
  setManualFieldDefinitions: (value: ManualFieldDefinition[]) => void;
  setEmailFieldDefinitions: (value: ManualFieldDefinition[]) => void;
  setSlackFieldDefinitions: (value: ManualFieldDefinition[]) => void;
  setNodes: (value: Node[]) => void;
  setEdges: (value: Edge[]) => void;
  idCounter: React.MutableRefObject<number>;
  manualFieldId: React.MutableRefObject<number>;
  emailFieldId: React.MutableRefObject<number>;
  slackFieldId: React.MutableRefObject<number>;
}) => {
  useEffect(() => {
    let isMounted = true;
    const loadWorkflow = async () => {
      if (!workflowId) return;
      if (isNew) return;
      const res = await getWorkflowById(workflowId);
      if (!res.success || !res.data) {
        if (isMounted) {
          toast.error({ description: res.message ?? "Workflow non trovato." });
        }
        return;
      }
      if (!isMounted) return;
      setWorkflowName(res.data.name);
      setWorkflowStatus(res.data.status);
      const definition = res.data.definition as {
        canvas?: { nodes?: Node[]; edges?: Edge[] };
        trigger?: { type?: string; config?: Record<string, unknown> };
      } | null;
      const canvasNodes = definition?.canvas?.nodes ?? [];
      const canvasEdges = definition?.canvas?.edges ?? [];
      const trigger = definition?.trigger;
      const incomingTriggerType =
        trigger?.type === "manual" ||
        trigger?.type === "document_completed" ||
        trigger?.type === "email_inbound" ||
        trigger?.type === "slack_message" ||
        trigger?.type === "fic_event"
          ? trigger.type
          : "manual";
      setTriggerType(incomingTriggerType);
      const incomingTriggerConfig =
        trigger?.config && typeof trigger.config === "object"
          ? Object.entries(trigger.config).reduce<Record<string, string>>((acc, [key, value]) => {
              if (
                key === "manualFields" ||
                key === "manualFieldMeta" ||
                key === "emailFields" ||
                key === "emailFieldMeta" ||
                key === "slackFields" ||
                key === "slackFieldMeta"
              ) {
                return acc;
              }
              acc[key] = typeof value === "string" ? value : JSON.stringify(value);
              return acc;
            }, {})
          : {};
      setTriggerConfig(incomingTriggerConfig);
      const manualFields =
        trigger?.config && typeof trigger.config === "object"
          ? (trigger.config as { manualFields?: string[] }).manualFields
          : undefined;
      const manualFieldMeta =
        trigger?.config && typeof trigger.config === "object"
          ? (trigger.config as { manualFieldMeta?: Array<{ key: string; required: boolean }> })
              .manualFieldMeta
          : undefined;
      const emailFields =
        trigger?.config && typeof trigger.config === "object"
          ? (trigger.config as { emailFields?: string[] }).emailFields
          : undefined;
      const emailFieldMeta =
        trigger?.config && typeof trigger.config === "object"
          ? (trigger.config as { emailFieldMeta?: Array<{ key: string; required: boolean }> })
              .emailFieldMeta
          : undefined;
      const slackFields =
        trigger?.config && typeof trigger.config === "object"
          ? (trigger.config as { slackFields?: string[] }).slackFields
          : undefined;
      const slackFieldMeta =
        trigger?.config && typeof trigger.config === "object"
          ? (trigger.config as { slackFieldMeta?: Array<{ key: string; required: boolean }> })
              .slackFieldMeta
          : undefined;
      if (manualFieldMeta && Array.isArray(manualFieldMeta) && manualFieldMeta.length > 0) {
        setManualFieldDefinitions(
          manualFieldMeta.map((field) => ({
            id: `field-${manualFieldId.current++}`,
            key: field.key,
            required: field.required,
          })),
        );
      } else if (manualFields && Array.isArray(manualFields) && manualFields.length > 0) {
        setManualFieldDefinitions(
          manualFields.map((field) => ({
            id: `field-${manualFieldId.current++}`,
            key: field,
            required: true,
          })),
        );
      }
      if (emailFieldMeta && Array.isArray(emailFieldMeta) && emailFieldMeta.length > 0) {
        setEmailFieldDefinitions(
          emailFieldMeta.map((field) => ({
            id: `email-field-${emailFieldId.current++}`,
            key: field.key,
            required: field.required,
          })),
        );
      } else if (emailFields && Array.isArray(emailFields) && emailFields.length > 0) {
        setEmailFieldDefinitions(
          emailFields.map((field) => ({
            id: `email-field-${emailFieldId.current++}`,
            key: field,
            required: true,
          })),
        );
      } else {
        setEmailFieldDefinitions([]);
      }
      if (slackFieldMeta && Array.isArray(slackFieldMeta) && slackFieldMeta.length > 0) {
        setSlackFieldDefinitions(
          slackFieldMeta.map((field) => ({
            id: `slack-field-${slackFieldId.current++}`,
            key: field.key,
            required: field.required,
          })),
        );
      } else if (slackFields && Array.isArray(slackFields) && slackFields.length > 0) {
        setSlackFieldDefinitions(
          slackFields.map((field) => ({
            id: `slack-field-${slackFieldId.current++}`,
            key: field,
            required: true,
          })),
        );
      } else {
        setSlackFieldDefinitions([]);
      }
      if (canvasNodes.length > 0) {
        setNodes(ensureStartEndNodes(canvasNodes, res.data.name));
        setEdges(canvasEdges);
      } else {
        setNodes(buildNodes(res.data.name, true));
        setEdges(buildEdges(true));
      }
      const nextId = canvasNodes.reduce((max, node) => {
        const match = /^ts-node-(\d+)$/.exec(node.id);
        if (!match) return max;
        const value = Number(match[1]);
        if (!Number.isFinite(value)) return max;
        return Math.max(max, value);
      }, -1);
      idCounter.current = Math.max(nextId + 1, 0);
    };
    loadWorkflow();
    return () => {
      isMounted = false;
    };
  }, [
    idCounter,
    isNew,
    manualFieldId,
    setEdges,
    setManualFieldDefinitions,
    setNodes,
    setTriggerConfig,
    setTriggerType,
    setWorkflowName,
    setWorkflowStatus,
    toast,
    workflowId,
    emailFieldId,
    setEmailFieldDefinitions,
    slackFieldId,
    setSlackFieldDefinitions,
  ]);
};
