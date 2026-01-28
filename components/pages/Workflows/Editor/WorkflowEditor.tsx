"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ReactFlow, {
  Background,
  Controls,
  applyEdgeChanges,
  applyNodeChanges,
  addEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { useAtomValue } from "jotai";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { WorkflowHeader } from "@/components/pages/Workflows/Editor/layout/WorkflowHeader";
import { startWorkflowRun, updateWorkflow } from "@/lib/actions/workflow.actions";
import { integrationConnectionsAtom } from "@/atoms/integrations.store";
import {
  blockConfigDefinitions,
  primaryNodeStyle,
  secondaryNodeStyle,
  serviceBlocks,
  triggerOptions,
} from "@/components/pages/Workflows/Editor/constants";
import type {
  BlockDefinition,
  Condition,
  LogicNodeData,
  ManualFieldDefinition,
  RunPayloadField,
  ServiceKey,
  TriggerType,
  VariableOption,
} from "@/components/pages/Workflows/Editor/types";
import {
  buildEdges,
  buildNodes,
  getDefaultConfig,
  getMissingFields,
  isWorkflowDraft,
} from "@/components/pages/Workflows/Editor/utils";
import { tokenRegex } from "@/components/pages/Workflows/Editor/shared/token-utils";
import { WorkflowPalettePanel } from "@/components/pages/Workflows/Editor/panels/WorkflowPalettePanel";
import { WorkflowAiPanel } from "@/components/pages/Workflows/Editor/panels/WorkflowAiPanel";
import { BlockConfigDialog } from "@/components/pages/Workflows/Editor/dialogs/BlockConfigDialog";
import { AiPreviewDialog } from "@/components/pages/Workflows/Editor/dialogs/AiPreviewDialog";
import { TriggerDialog } from "@/components/pages/Workflows/Editor/dialogs/TriggerDialog";
import { RunPayloadDialog } from "@/components/pages/Workflows/Editor/dialogs/RunPayloadDialog";
import { LogicDialog } from "@/components/pages/Workflows/Editor/dialogs/LogicDialog";
import { LogicIfNode } from "@/components/pages/Workflows/Editor/nodes/LogicIfNode";
import { LogicLoopNode } from "@/components/pages/Workflows/Editor/nodes/LogicLoopNode";
import { LogicMergeNode } from "@/components/pages/Workflows/Editor/nodes/LogicMergeNode";
import { useDocumentTemplates } from "@/components/pages/Workflows/Editor/hooks/useDocumentTemplates";
import { useIntegrationOptions } from "@/components/pages/Workflows/Editor/hooks/useIntegrationOptions";
import { useWorkflowLoader } from "@/components/pages/Workflows/Editor/hooks/useWorkflowLoader";
import { useWorkflowAi } from "@/components/pages/Workflows/Editor/hooks/useWorkflowAi";

type ConfigTouchedNodeData = {
  blockId?: string;
  config?: Record<string, unknown>;
  label?: string;
  configTouched?: boolean;
};

type LogicDialogState = {
  block: BlockDefinition;
  position: { x: number; y: number };
} | null;

export function WorkflowEditor(): React.ReactElement {
  const params = useParams<{ workflowId: string }>();
  const searchParams = useSearchParams();
  const workflowId = params?.workflowId;
  const isNew = searchParams.get("mode") === "new";
  const nameParam = searchParams.get("name");

  const toast = useFeedbackToast();
  const [workflowName, setWorkflowName] = useState(() => {
    if (isNew && nameParam) return nameParam;
    return "Workflow";
  });
  const [workflowStatus, setWorkflowStatus] = useState("draft");
  const [selectedService, setSelectedService] = useState<ServiceKey>("slack");
  const [paletteView, setPaletteView] = useState<"menu" | "blocks">("menu");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [nodes, setNodes] = useState<Node[]>(() => buildNodes(workflowName, true));
  const [edges, setEdges] = useState<Edge[]>(() => buildEdges(true));
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [logicDialogOpen, setLogicDialogOpen] = useState(false);
  const [logicCondition, setLogicCondition] = useState<Condition>({
    op: "eq",
    left: "",
    right: "",
  });
  const [logicIterations, setLogicIterations] = useState("");
  const [waitTimeout, setWaitTimeout] = useState("24h");
  const [pendingLogic, setPendingLogic] = useState<LogicDialogState>(null);
  const idCounter = useRef(0);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const currentService = serviceBlocks[selectedService];
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({});
  const [configTarget, setConfigTarget] = useState<{ nodeId: string; blockId: string } | null>(
    null,
  );
  const [triggerType, setTriggerType] = useState<TriggerType>("manual");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, string>>({});
  const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
  const manualFieldId = useRef(0);
  const [manualFieldDefinitions, setManualFieldDefinitions] = useState<ManualFieldDefinition[]>([
    { id: `field-${manualFieldId.current++}`, key: "", required: true },
  ]);
  const emailFieldId = useRef(0);
  const [emailFieldDefinitions, setEmailFieldDefinitions] = useState<ManualFieldDefinition[]>([]);
  const slackFieldId = useRef(0);
  const [slackFieldDefinitions, setSlackFieldDefinitions] = useState<ManualFieldDefinition[]>([]);
  const [runPayloadDialogOpen, setRunPayloadDialogOpen] = useState(false);
  const [runPayloadFields, setRunPayloadFields] = useState<RunPayloadField[]>([]);
  const integrationConnections = useAtomValue(integrationConnectionsAtom);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedBlockId =
    selectedNode &&
    typeof selectedNode.data === "object" &&
    selectedNode.data &&
    "blockId" in selectedNode.data
      ? (selectedNode.data as { blockId?: string }).blockId ?? null
      : null;
  const selectedBlockDefinition = selectedBlockId
    ? blockConfigDefinitions[selectedBlockId]
    : undefined;
  const selectedBlockHasConfig = Boolean(selectedBlockDefinition);
  const configBlockId = configTarget?.blockId ?? null;
  const activeConfigDefinition = configBlockId
    ? blockConfigDefinitions[configBlockId]
    : undefined;
  const integrationState = useMemo(() => {
    if (!integrationConnections) return {};
    const map: Record<string, { status: string; displayName?: string | null }> = {};
    integrationConnections.forEach((connection) => {
      map[connection.provider] = {
        status: connection.status,
        displayName: connection.displayName,
      };
    });
    return map;
  }, [integrationConnections]);
  const isSlackConnected = integrationState["slack"]?.status === "connected";
  const isFicConnected = integrationState["fatture-in-cloud"]?.status === "connected";
  const { documentTemplateOptions, templateBindingKeys } = useDocumentTemplates();
  const {
    slackChannelOptions,
    slackChannelLoading,
    slackChannelError,
    ficClientOptions,
    ficClientLoading,
    ficClientError,
    ficVatTypeOptions,
    ficVatTypeLoading,
    ficVatTypeError,
    ficPaymentMethodOptions,
    ficPaymentMethodLoading,
    ficPaymentMethodError,
    emailSenderOptions,
    emailSenderLoading,
    emailSenderError,
  } = useIntegrationOptions({ isSlackConnected, isFicConnected });
  useWorkflowLoader({
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
  });
  const triggerTemplateMissing =
    triggerType === "document_completed" && !triggerConfig.templateId?.trim();
  const triggerEmailMissing =
    triggerType === "email_inbound" && !triggerConfig.address?.trim();
  const triggerSlackMissing = triggerType === "slack_message" && !isSlackConnected;
  const triggerSummaryLabel = useMemo(() => {
    if (triggerType === "document_completed") return "Template compilato";
    if (triggerType === "email_inbound") return "Email in ingresso";
    if (triggerType === "slack_message") return "Messaggio Slack";
    if (triggerType === "fic_event") return "Fatture in Cloud";
    return "Manuale";
  }, [triggerType]);
  const triggerSummarySubtitle = useMemo(() => {
    if (triggerType === "document_completed") {
      const templateId = triggerConfig.templateId;
      if (!templateId) return undefined;
      return (
        documentTemplateOptions.find((option) => option.value === templateId)?.label ??
        "Template selezionato"
      );
    }
    if (triggerType === "email_inbound") {
      const address = triggerConfig.address?.trim();
      if (!address) return undefined;
      return address;
    }
    if (triggerType === "slack_message") {
      const channelId = triggerConfig.channelId;
      if (!channelId || channelId === "all") return "Tutti i canali";
      const channelLabel =
        slackChannelOptions.find((option) => option.value === channelId)?.label ?? channelId;
      return channelLabel;
    }
    return undefined;
  }, [
    documentTemplateOptions,
    slackChannelOptions,
    triggerConfig.address,
    triggerConfig.channelId,
    triggerConfig.templateId,
    triggerType,
  ]);
  const triggerNeedsSetup =
    triggerType !== "manual" &&
    (triggerTemplateMissing || triggerEmailMissing || triggerSlackMissing);
  const triggerFieldKeys = useMemo(() => {
    if (triggerType === "document_completed") {
      return templateBindingKeys[triggerConfig.templateId ?? ""] ?? [];
    }
    if (triggerType === "email_inbound") {
      return emailFieldDefinitions
        .map((field) => field.key.trim())
        .filter(Boolean);
    }
    if (triggerType === "slack_message") {
      return slackFieldDefinitions
        .map((field) => field.key.trim())
        .filter(Boolean);
    }
    return manualFieldDefinitions
      .map((field) => field.key.trim())
      .filter(Boolean);
  }, [
    emailFieldDefinitions,
    manualFieldDefinitions,
    slackFieldDefinitions,
    templateBindingKeys,
    triggerConfig.templateId,
    triggerType,
  ]);

  const variableOptions = useMemo<VariableOption[]>(() => {
    const base = triggerFieldKeys.map((field) => ({
      label: field,
      token: `trigger.payload.${field}`,
    }));
    if (triggerType === "email_inbound") {
      return [
        ...base,
        { label: "Email · Mittente", token: "trigger.payload._email.from" },
        { label: "Email · Destinatario", token: "trigger.payload._email.to" },
        { label: "Email · Oggetto", token: "trigger.payload._email.subject" },
        { label: "Email · Testo", token: "trigger.payload._email.text" },
      ];
    }
    if (triggerType === "slack_message") {
      return [
        ...base,
        { label: "Slack · Canale", token: "trigger.payload._slack.channel" },
        { label: "Slack · Autore", token: "trigger.payload._slack.user" },
        { label: "Slack · Testo", token: "trigger.payload._slack.text" },
        { label: "Slack · Timestamp", token: "trigger.payload._slack.ts" },
      ];
    }
    return base;
  }, [triggerFieldKeys, triggerType]);

  useEffect(() => {
    if (!configDialogOpen || configBlockId !== "reglo-email" || !emailSenderOptions.length) {
      return;
    }
    if (configDraft.from?.trim()) return;
    setConfigDraft((prev) => ({
      ...prev,
      from: prev.from?.trim() || emailSenderOptions[0].value,
    }));
  }, [configDialogOpen, configBlockId, configDraft.from, emailSenderOptions]);

  useEffect(() => {
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
    if (configTarget && !nodes.some((node) => node.id === configTarget.nodeId)) {
      setConfigDialogOpen(false);
      setConfigTarget(null);
    }
  }, [configTarget, nodes, selectedNodeId]);

  const invalidTriggerTokens = useMemo(() => {
    const allowed = new Set(triggerFieldKeys.map((key) => `trigger.payload.${key}`));
    if (triggerType === "email_inbound") {
      allowed.add("trigger.payload._email.subject");
      allowed.add("trigger.payload._email.from");
      allowed.add("trigger.payload._email.to");
      allowed.add("trigger.payload._email.text");
    }
    if (triggerType === "slack_message") {
      allowed.add("trigger.payload._slack.channel");
      allowed.add("trigger.payload._slack.user");
      allowed.add("trigger.payload._slack.text");
      allowed.add("trigger.payload._slack.ts");
    }
    const invalid = new Set<string>();
    const checkValue = (value?: string) => {
      if (!value) return;
      for (const match of value.matchAll(tokenRegex)) {
        const token = match[1]?.trim();
        if (!token) continue;
        if (token.startsWith("trigger.payload.") && !allowed.has(token)) {
          invalid.add(token.replace("trigger.payload.", ""));
        }
      }
    };
    nodes.forEach((node) => {
      if (node.type === "logicIf" || node.type === "logicLoop") {
        const data = node.data as LogicNodeData | undefined;
        if (data?.condition) {
          checkValue(data.condition.left);
          checkValue(data.condition.right);
        }
        return;
      }
      if (typeof node.data === "object" && node.data && "config" in node.data) {
        const config = (node.data as { config?: Record<string, unknown> }).config ?? {};
        Object.values(config).forEach((value) => {
          if (typeof value === "string") {
            checkValue(value);
          }
        });
      }
    });
    return Array.from(invalid);
  }, [nodes, triggerFieldKeys, triggerType]);

  const templateBindingConflicts = useMemo(() => {
    if (triggerType !== "document_completed") return [];
    const incomingKeys = new Set(triggerFieldKeys);
    const conflicts: Array<{ nodeId: string; label: string }> = [];
    nodes.forEach((node) => {
      if (typeof node.data !== "object" || !node.data) return;
      const data = node.data as ConfigTouchedNodeData;
      if (data.blockId !== "doc-compile-template") return;
      const templateId = (data.config?.templateId as string | undefined) ?? "";
      if (!templateId) return;
      const templateKeys = templateBindingKeys[templateId] ?? [];
      if (templateKeys.length === 0) {
        conflicts.push({ nodeId: node.id, label: data.label ?? "Compila template" });
        return;
      }
      const hasMatch = templateKeys.some((key) => incomingKeys.has(key));
      if (!hasMatch) {
        conflicts.push({ nodeId: node.id, label: data.label ?? "Compila template" });
      }
    });
    return conflicts;
  }, [nodes, templateBindingKeys, triggerFieldKeys, triggerType]);

  const warnings = useMemo(() => {
    return nodes
      .filter((node) => node.type !== "logicIf" && node.type !== "logicLoop")
      .map((node) => {
        const data = node.data as ConfigTouchedNodeData | undefined;
        const blockId = data?.blockId;
        if (!blockId) return null;
        if (!data?.configTouched) return null;
        const missing = getMissingFields(blockId, data?.config ?? {});
        if (missing.length === 0) return null;
        return {
          nodeId: node.id,
          label: data?.label ?? node.id,
          missing,
        };
      })
      .filter(Boolean) as { nodeId: string; label: string; missing: string[] }[];
  }, [nodes]);

  const workflowIsDraft = useMemo(() => isWorkflowDraft(nodes, edges), [edges, nodes]);

  React.useEffect(() => {
    if (isNew) {
      setTriggerDialogOpen(true);
    }
  }, [isNew]);

  const handleSave = async () => {
    if (!workflowId || isSaving) return;
    if (!workflowName.trim()) {
      toast.error({ description: "Inserisci un nome workflow." });
      return;
    }
    let resolvedTriggerType = triggerType;
    let resolvedTriggerConfig = triggerConfig;
    if (triggerType === "document_completed" && triggerTemplateMissing) {
      resolvedTriggerType = "manual";
      resolvedTriggerConfig = {};
      setTriggerType("manual");
      setTriggerConfig({});
      toast.error({
        description:
          "Trigger non configurato: salvato come Manuale finche' non selezioni un template.",
      });
    }
    if (triggerType === "email_inbound" && triggerEmailMissing) {
      resolvedTriggerType = "manual";
      resolvedTriggerConfig = {};
      setTriggerType("manual");
      setTriggerConfig({});
      toast.error({
        description:
          "Trigger email non configurato: salvato come Manuale finche' non scegli un indirizzo.",
      });
    }
    if (triggerType === "slack_message" && triggerSlackMissing) {
      resolvedTriggerType = "manual";
      resolvedTriggerConfig = {};
      setTriggerType("manual");
      setTriggerConfig({});
      toast.error({
        description: "Slack non connesso: trigger salvato come Manuale.",
      });
    }
    const saveTriggerConfig: Record<string, unknown> = {
      ...resolvedTriggerConfig,
    };
    if (resolvedTriggerType === "manual") {
      const manualFields = manualFieldDefinitions
        .map((field) => field.key.trim())
        .filter(Boolean);
      const manualFieldMeta: Array<{ key: string; required: boolean }> = manualFieldDefinitions
        .map((field) => ({
          key: field.key.trim(),
          required: field.required,
        }))
        .filter((field) => field.key.length > 0);
      saveTriggerConfig.manualFields = manualFields;
      saveTriggerConfig.manualFieldMeta = manualFieldMeta;
    }
    if (resolvedTriggerType === "email_inbound") {
      const emailFields = emailFieldDefinitions
        .map((field) => field.key.trim())
        .filter(Boolean);
      const emailFieldMeta: Array<{ key: string; required: boolean }> =
        emailFieldDefinitions
          .map((field) => ({
            key: field.key.trim(),
            required: field.required,
          }))
          .filter((field) => field.key.length > 0);
      saveTriggerConfig.emailFields = emailFields;
      saveTriggerConfig.emailFieldMeta = emailFieldMeta;
    }
    if (resolvedTriggerType === "slack_message") {
      const slackFields = slackFieldDefinitions
        .map((field) => field.key.trim())
        .filter(Boolean);
      const slackFieldMeta: Array<{ key: string; required: boolean }> =
        slackFieldDefinitions
          .map((field) => ({
            key: field.key.trim(),
            required: field.required,
          }))
          .filter((field) => field.key.length > 0);
      saveTriggerConfig.slackFields = slackFields;
      saveTriggerConfig.slackFieldMeta = slackFieldMeta;
    }
    const cleanedTriggerConfig = Object.fromEntries(
      Object.entries(saveTriggerConfig).filter(([_, value]) => {
        if (value == null) return false;
        if (typeof value === "string") return value.trim().length > 0;
        return true;
      }),
    ) as Record<string, unknown>;
    setIsSaving(true);
    const serializedNodes = nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
      style: node.style,
    }));
    const serializedEdges = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      animated: edge.animated,
      style: edge.style,
    }));
    const runtimeNodes = nodes.filter((node) => node.id !== "end").map((node) => {
      const data = node.data as LogicNodeData | undefined;
      const label =
        typeof node.data === "object" && node.data && "label" in node.data
          ? (node.data as { label?: string }).label ?? ""
          : "";
      const blockId =
        typeof node.data === "object" && node.data && "blockId" in node.data
          ? (node.data as { blockId?: string }).blockId
          : undefined;
      const blockConfig =
        typeof node.data === "object" && node.data && "config" in node.data
          ? (node.data as { config?: Record<string, unknown> }).config ?? {}
          : {};

      if (node.type === "wait") {
        const timeout =
          typeof node.data === "object" && node.data && "timeout" in node.data
            ? (node.data as { timeout?: string }).timeout
            : undefined;
        return {
          id: node.id,
          type: "wait",
          config: {
            timeout,
            label,
          },
        };
      }

      if (node.type === "logicIf") {
        return {
          id: node.id,
          type: "logicIf",
          config: {
            condition: data?.condition,
            label,
          },
        };
      }

      if (node.type === "logicLoop") {
        return {
          id: node.id,
          type: "logicLoop",
          config: {
            mode: data?.loopKind ?? "for",
            iterations: data?.iterations,
            condition: data?.condition,
            label,
          },
        };
      }

      return {
        id: node.id,
        type: blockId ?? node.type ?? "standard",
        config: {
          label,
          blockId,
          settings: blockConfig,
        },
      };
    });
    const runtimeEdges = edges
      .filter((edge) => edge.source !== "end" && edge.target !== "end")
      .map((edge) => ({
      from: edge.source,
      to: edge.target,
      condition: edge.sourceHandle ? { branch: edge.sourceHandle } : null,
    }));
    const nextStatus = workflowIsDraft ? "draft" : (workflowStatus as "draft" | "active" | "paused");
    if (workflowIsDraft && workflowStatus !== "draft") {
      setWorkflowStatus("draft");
    }
    const res = await updateWorkflow({
      id: workflowId,
      name: workflowName,
      status: nextStatus,
      definition: {
        trigger: { type: resolvedTriggerType, config: cleanedTriggerConfig },
        nodes: runtimeNodes,
        edges: runtimeEdges,
        canvas: { nodes: serializedNodes, edges: serializedEdges },
      },
    });
    if (!res.success) {
      toast.error({ description: res.message ?? "Salvataggio fallito." });
      setIsSaving(false);
      return;
    }
    toast.success({
      description: workflowIsDraft ? "Workflow salvato in bozza." : "Workflow salvato.",
    });
    setIsSaving(false);
  };

  const handleRun = async () => {
    if (!workflowId || isRunning) return;
    setIsRunning(true);
    let triggerPayload: unknown;
    if (triggerType === "manual") {
      const manualFields = manualFieldDefinitions
        .map((field) => field.key.trim())
        .filter(Boolean);
      const manualFieldMeta = manualFieldDefinitions
        .map((field) => ({
          key: field.key.trim(),
          required: field.required,
        }))
        .filter((field) => field.key.length > 0);
      if (manualFields.length > 0) {
        setRunPayloadFields(
          manualFieldMeta.map((field) => ({
            id: `payload-${manualFieldId.current++}`,
            key: field.key,
            required: field.required,
            value: "",
          })),
        );
        setRunPayloadDialogOpen(true);
        setIsRunning(false);
        return;
      }
    } else if (triggerType === "document_completed" && Object.keys(triggerConfig).length > 0) {
      triggerPayload = { ...triggerConfig };
    }
    const res = await startWorkflowRun({ workflowId, triggerType, triggerPayload });
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile avviare il workflow." });
      setIsRunning(false);
      return;
    }
    toast.success({ description: "Workflow avviato." });
    setIsRunning(false);
  };

  const handleRunWithPayload = async () => {
    if (!workflowId) return;
    setIsRunning(true);
    const payload = runPayloadFields.reduce<Record<string, string>>((acc, field) => {
      if (!field.key.trim()) return acc;
      acc[field.key.trim()] = field.value;
      return acc;
    }, {});
    const missingRequired = runPayloadFields.some(
      (field) => field.required && !field.value.trim(),
    );
    if (missingRequired) {
      toast.error({ description: "Completa tutti i campi obbligatori." });
      setIsRunning(false);
      return;
    }
    const res = await startWorkflowRun({
      workflowId,
      triggerType: "manual",
      triggerPayload: payload,
    });
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile avviare il workflow." });
      setIsRunning(false);
      return;
    }
    toast.success({ description: "Workflow avviato." });
    setIsRunning(false);
    setRunPayloadDialogOpen(false);
  };

  const handleTogglePalette = useCallback(() => {
    setPaletteOpen((prev) => !prev);
  }, []);

  const normalizeConfig = useCallback((config: Record<string, unknown>) => {
    return Object.fromEntries(
      Object.entries(config).map(([key, value]) => [
        key,
        typeof value === "string" ? value : value == null ? "" : String(value),
      ]),
    );
  }, []);

  const openConfigForNode = useCallback(
    (nodeId: string, blockId: string) => {
      const baseConfig = getDefaultConfig(blockId);
      const node = nodes.find((item) => item.id === nodeId);
      const existingConfig =
        node &&
        typeof node.data === "object" &&
        node.data &&
        "config" in node.data
          ? (node.data as { config?: Record<string, string> }).config ?? {}
          : {};
      setSelectedNodeId(nodeId);
      setConfigDraft({
        ...baseConfig,
        ...normalizeConfig(existingConfig as Record<string, unknown>),
      });
      setConfigTarget({ nodeId, blockId });
      setConfigDialogOpen(true);
    },
    [normalizeConfig, nodes],
  );

  const openConfigDialog = () => {
    if (!selectedBlockId || !selectedBlockHasConfig || !selectedNode) return;
    openConfigForNode(selectedNode.id, selectedBlockId);
  };

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (typeof node.data !== "object" || !node.data) return;
      if (!("blockId" in node.data)) return;
      const blockId = (node.data as { blockId?: string }).blockId;
      if (!blockId || !blockConfigDefinitions[blockId]) return;
      openConfigForNode(node.id, blockId);
    },
    [openConfigForNode],
  );

  const handleConfigSave = () => {
    if (!configTarget) {
      setConfigDialogOpen(false);
      return;
    }
    const { nodeId, blockId } = configTarget;
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          data: {
            ...(typeof node.data === "object" ? node.data : {}),
            config: configDraft,
            blockId,
            configTouched: true,
          },
        };
      }),
    );
    setConfigDialogOpen(false);
  };

  const handleConfigClose = () => {
    if (configTarget) {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === configTarget.nodeId
            ? {
                ...node,
                data: {
                  ...(typeof node.data === "object" ? node.data : {}),
                  configTouched: true,
                },
              }
            : node,
        ),
      );
    }
    setConfigDialogOpen(false);
    setConfigTarget(null);
  };

  const nodeTypes = useMemo(
    () => ({
      logicIf: LogicIfNode,
      logicLoop: LogicLoopNode,
      logicMerge: LogicMergeNode,
    }),
    [],
  );

  const onDragStart = useCallback(
    (event: React.DragEvent, block: BlockDefinition) => {
      if (block.status === "planned") {
        event.preventDefault();
        toast.info({ description: "Questo blocco è in arrivo." });
        return;
      }
      if (block.id.startsWith("slack-") && !isSlackConnected) {
        event.preventDefault();
        toast.error({ description: "Connetti Slack per usare questi blocchi." });
        return;
      }
      if (block.id.startsWith("fic-") && !isFicConnected) {
        event.preventDefault();
        toast.error({
          description: "Connetti Fatture in Cloud per usare questi blocchi.",
        });
        return;
      }
      event.dataTransfer.setData("application/reactflow", JSON.stringify(block));
      event.dataTransfer.effectAllowed = "move";
    },
    [isFicConnected, isSlackConnected, toast],
  );

  const resetLogicDialog = () => {
    setLogicCondition({ op: "eq", left: "", right: "" });
    setLogicIterations("");
    setWaitTimeout("24h");
    setPendingLogic(null);
    setLogicDialogOpen(false);
  };

  const addNode = useCallback((node: Node) => {
    setNodes((nds) => nds.concat(node));
  }, []);

  const getNextNodeId = useCallback(() => {
    const existingIds = new Set(nodes.map((node) => node.id));
    let next = idCounter.current;
    let candidate = `ts-node-${next}`;
    while (existingIds.has(candidate)) {
      next += 1;
      candidate = `ts-node-${next}`;
    }
    idCounter.current = next + 1;
    return candidate;
  }, [nodes]);

  const {
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
  } = useWorkflowAi({
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
  });

  const addStandardNode = useCallback(
    (block: BlockDefinition, position: { x: number; y: number }) => {
      const newId = getNextNodeId();
      const blockId = block.id;
      const config = getDefaultConfig(blockId);
      addNode({
        id: newId,
        type: blockId === "wait" ? "wait" : undefined,
        position,
        data: {
          label: block.label,
          blockId,
          config,
          configTouched: false,
        },
        style: secondaryNodeStyle,
      });
      return newId;
    },
    [addNode, getNextNodeId],
  );

  const addLogicNode = (
    type: "logicIf" | "logicLoop" | "logicMerge",
    data: LogicNodeData,
    position: { x: number; y: number },
  ) => {
    const newId = getNextNodeId();
    addNode({
      id: newId,
      type,
      position,
      data,
    });
  };

  const addLogicIfWithMerge = (data: LogicNodeData, position: { x: number; y: number }) => {
    const ifId = getNextNodeId();
    const mergeId = getNextNodeId();
    const mergePosition = { x: position.x, y: position.y + 200 };

    setNodes((nds) =>
      nds.concat([
        {
          id: ifId,
          type: "logicIf",
          position,
          data,
        },
        {
          id: mergeId,
          type: "logicMerge",
          position: mergePosition,
          data: { label: "End if", meta: "End if" },
        },
      ]),
    );

    setEdges((eds) =>
      eds.concat([
        {
          id: `edge-${ifId}-yes-${mergeId}`,
          source: ifId,
          sourceHandle: "yes",
          target: mergeId,
          targetHandle: "left",
          animated: true,
          style: { strokeWidth: 1.5 },
        },
        {
          id: `edge-${ifId}-no-${mergeId}`,
          source: ifId,
          sourceHandle: "no",
          target: mergeId,
          targetHandle: "right",
          animated: true,
          style: { strokeWidth: 1.5 },
        },
      ]),
    );
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/reactflow");
      if (!raw || !reactFlowInstance) return;

      const bounds = flowWrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let block: BlockDefinition = {
        id: `block-${Date.now()}`,
        label: raw,
        kind: "standard",
      };
      try {
        block = JSON.parse(raw);
      } catch {
        // fallback to raw label
      }

      if (block.status === "planned") {
        toast.info({ description: "Questo blocco è in arrivo." });
        return;
      }

      if (block.kind && block.kind !== "standard") {
        setPendingLogic({ block, position });
        setLogicDialogOpen(true);
        setLogicCondition({ op: "eq", left: "", right: "" });
        setLogicIterations("");
        return;
      }

      const newNodeId = addStandardNode(block, position);
      if (blockConfigDefinitions[block.id]) {
        openConfigForNode(newNodeId, block.id);
      }
    },
    [reactFlowInstance, addStandardNode, openConfigForNode, toast],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceId = connection.source;
      const targetId = connection.target;
      if (!sourceId || !targetId) return;

      const sourceNode = nodes.find((node) => node.id === sourceId);
      const targetNode = nodes.find((node) => node.id === targetId);
      const branch = connection.sourceHandle;

      setEdges((eds) => {
        const baseEdge = {
          ...connection,
          source: sourceId,
          target: targetId,
          animated: true,
          style: { strokeWidth: 1.5 },
        };

        const findMergePath = (startId: string, edges: Edge[]) => {
          let current = startId;
          const visited = new Set<string>();
          let firstEdge: Edge | undefined;

          while (true) {
            const edge = edges.find((item) => item.source === current);
            if (!edge) return null;
            if (!firstEdge) firstEdge = edge;

            const target = nodes.find((node) => node.id === edge.target);
            if (target?.type === "logicMerge") {
              return {
                mergeId: edge.target,
                mergeHandle: edge.targetHandle,
                nextEdge: firstEdge,
              };
            }

            if (visited.has(edge.target)) return null;
            visited.add(edge.target);
            current = edge.target;
          }
        };

        if (sourceNode?.type === "logicIf" && (branch === "yes" || branch === "no")) {
          let mergeId: string | undefined;
          const existingEdge = eds.find(
            (edge) => edge.source === sourceNode.id && edge.sourceHandle === branch,
          );
          if (existingEdge) {
            const directTarget = nodes.find((node) => node.id === existingEdge.target);
            if (directTarget?.type === "logicMerge") {
              mergeId = directTarget.id;
            } else {
              const downstreamEdge = eds.find((edge) => edge.source === existingEdge.target);
              const downstreamTarget = nodes.find((node) => node.id === downstreamEdge?.target);
              if (downstreamTarget?.type === "logicMerge") {
                mergeId = downstreamTarget.id;
              }
            }
          }

          if (!mergeId) {
            const mergeEdge = eds.find((edge) => {
              if (edge.source !== sourceNode.id) return false;
              const target = nodes.find((node) => node.id === edge.target);
              return target?.type === "logicMerge";
            });
            mergeId = mergeEdge?.target;
          }

          let nextEdges = eds.filter(
            (edge) => !(edge.source === sourceNode.id && edge.sourceHandle === branch),
          );
          nextEdges = addEdge(baseEdge, nextEdges);

          if (mergeId && targetId !== mergeId) {
            nextEdges = nextEdges.filter(
              (edge) => !(edge.source === targetId && edge.target === mergeId),
            );
            nextEdges = addEdge(
              {
                id: `edge-${targetId}-${mergeId}-${branch}`,
                source: targetId,
                target: mergeId,
                targetHandle: branch === "yes" ? "left" : "right",
                animated: true,
                style: { strokeWidth: 1.5 },
              },
              nextEdges,
            );
          }

          return nextEdges;
        }

        const mergePath = findMergePath(sourceId, eds);
        if (mergePath && targetNode?.type !== "logicMerge") {
          const { nextEdge, mergeHandle } = mergePath;

          let nextEdges = eds;
          if (nextEdge) {
            nextEdges = nextEdges.filter((edge) => edge.id !== nextEdge.id);
          }
          nextEdges = addEdge(baseEdge, nextEdges);

          if (nextEdge && nextEdge.target !== targetId) {
            const nextTarget = nodes.find((node) => node.id === nextEdge.target);
            nextEdges = nextEdges.filter(
              (edge) => !(edge.source === targetId && edge.target === nextEdge.target),
            );
            nextEdges = addEdge(
              {
                id: `edge-${targetId}-${nextEdge.target}`,
                source: targetId,
                target: nextEdge.target,
                targetHandle:
                  nextTarget?.type === "logicMerge" ? mergeHandle ?? undefined : undefined,
                animated: true,
                style: { strokeWidth: 1.5 },
              },
              nextEdges,
            );
          }

          return nextEdges;
        }

        return addEdge(baseEdge, eds);
      });
    },
    [nodes],
  );

  const logicSubmitDisabled = useMemo(() => {
    if (pendingLogic?.block.id === "wait") {
      return !waitTimeout.trim();
    }
    if (pendingLogic?.block.kind === "for") {
      return Number(logicIterations) < 1;
    }
    return !logicCondition.left.trim() || !logicCondition.right.trim();
  }, [logicCondition.left, logicCondition.right, logicIterations, pendingLogic, waitTimeout]);

  const handleLogicSubmit = () => {
    if (!pendingLogic) return;
    const { block, position } = pendingLogic;
    if (block.id === "wait") {
      const newNodeId = addStandardNode(block, position);
      setNodes((prev) =>
        prev.map((node) =>
          node.id === newNodeId
            ? {
                ...node,
                data: {
                  label: "Metti in pausa",
                  blockId: "wait",
                  timeout: waitTimeout,
                  config: { timeout: waitTimeout },
                  configTouched: true,
                },
                type: "wait",
              }
            : node,
        ),
      );
      resetLogicDialog();
      return;
    }
    if (block.kind === "if") {
      const label = `${logicCondition.left} ${logicCondition.op} ${logicCondition.right}`;
      addLogicIfWithMerge(
        {
          label,
          meta: "Condizione",
          condition: logicCondition,
        },
        position,
      );
      resetLogicDialog();
      return;
    }
    if (block.kind === "while") {
      const label = `${logicCondition.left} ${logicCondition.op} ${logicCondition.right}`;
      addLogicNode(
        "logicLoop",
        {
          label: `Ripeti finche' ${label}`,
          meta: "Ripetizione",
          loopKind: "while",
          condition: logicCondition,
        },
        position,
      );
      resetLogicDialog();
      return;
    }
    if (block.kind === "for") {
      const iterations = Number(logicIterations.trim());
      addLogicNode(
        "logicLoop",
        {
          label: `Ripeti ${logicIterations.trim()} volte`,
          meta: "Ripetizione",
          loopKind: "for",
          iterations: Number.isFinite(iterations) ? iterations : undefined,
        },
        position,
      );
      resetLogicDialog();
      return;
    }
    resetLogicDialog();
  };

  return (
    <ClientPageWrapper title={workflowName} parentTitle="Workflows" enableBackNavigation>
      <div className="relative flex h-full flex-col gap-4">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 right-10 h-56 w-56 rounded-full bg-[#a9d9d1]/35 blur-3xl animate-[float-slow_16s_ease-in-out_infinite]" />
          <div className="absolute bottom-8 left-16 h-64 w-64 rounded-full bg-[#60579e]/18 blur-3xl animate-[float-slower_20s_ease-in-out_infinite]" />
          <div className="absolute top-40 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-[#e5e4f0]/60 blur-2xl animate-[float-slow_14s_ease-in-out_infinite]" />
        </div>
        <WorkflowHeader
          workflowName={workflowName}
          onRun={handleRun}
          onSave={handleSave}
          isRunning={isRunning}
          isSaving={isSaving}
          triggerLabel={triggerSummaryLabel}
          triggerSubtitle={triggerSummarySubtitle}
          triggerNeedsSetup={triggerNeedsSetup}
          onOpenTrigger={() => setTriggerDialogOpen(true)}
          paletteOpen={paletteOpen}
          onTogglePalette={handleTogglePalette}
        />
        {invalidTriggerTokens.length > 0 ? (
          <div className="glass-panel border-amber-200/70 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Alcuni dati non sono piu validi.</p>
            <p className="text-xs text-amber-800">
              Hai usato variabili che non esistono piu nel trigger selezionato.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-amber-900">
              {invalidTriggerTokens.map((token) => (
                <span
                  key={token}
                  className="rounded-full border border-amber-200 bg-white px-3 py-1"
                >
                  {token}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {templateBindingConflicts.length > 0 ? (
          <div className="glass-panel border-amber-200/70 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Template non allineati ai dati in ingresso.</p>
            <p className="text-xs text-amber-800">
              Alcuni template nel flusso non hanno binding key compatibili con il
              trigger selezionato.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-amber-900">
              {templateBindingConflicts.map((conflict) => (
                <span
                  key={conflict.nodeId}
                  className="rounded-full border border-amber-200 bg-white px-3 py-1"
                >
                  {conflict.label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <div className="glass-panel border-amber-200/70 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Attenzione: alcuni blocchi sono incompleti.</p>
            <p className="text-xs text-amber-800">
              Puoi salvare il workflow, ma le azioni potrebbero fallire.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-amber-900">
              {warnings.map((warning) => (
                <span
                  key={warning.nodeId}
                  className="rounded-full border border-amber-200 bg-white px-3 py-1"
                >
                  {warning.label}: {warning.missing.join(", ")}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-1 gap-4">
          <WorkflowPalettePanel
            open={paletteOpen}
            paletteView={paletteView}
            selectedService={selectedService}
            currentService={currentService}
            isSlackConnected={isSlackConnected}
            isFicConnected={isFicConnected}
            onSelectService={setSelectedService}
            onChangeView={setPaletteView}
            onDragStart={onDragStart}
            onSlackUnavailable={() =>
              toast.error({ description: "Connetti Slack per usare questi blocchi." })
            }
            onFicUnavailable={() =>
              toast.error({
                description: "Connetti Fatture in Cloud per usare questi blocchi.",
              })
            }
            onClose={() => setPaletteOpen(false)}
          />
          <div className="glass-panel relative flex min-h-[560px] flex-1 p-4">
            {!paletteOpen ? (
              <div className="absolute left-4 top-4 z-10">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={handleTogglePalette}
                >
                  Aggiungi blocchi
                </Button>
              </div>
            ) : null}
            {selectedBlockHasConfig ? (
              <div className="absolute right-4 top-4 z-10">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={openConfigDialog}
                >
                  Configura blocco
                </Button>
              </div>
            ) : null}
            <div
              ref={flowWrapperRef}
              className="flex-1 rounded-2xl bg-white/45 backdrop-blur"
            >
              <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                nodeTypes={nodeTypes}
                onInit={setReactFlowInstance}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                onNodeDoubleClick={handleNodeDoubleClick}
                onPaneClick={() => setSelectedNodeId(null)}
                deleteKeyCode={["Backspace"]}
              >
                <Controls />
                <Background gap={16} size={1} />
              </ReactFlow>
            </div>
          </div>
          <WorkflowAiPanel
            collapsed={aiPanelCollapsed}
            onToggle={() => setAiPanelCollapsed((prev) => !prev)}
            prompt={aiPrompt}
            onPromptChange={handleAiPromptChange}
            onGenerate={handleAiGenerate}
            loading={aiLoading}
            questions={aiQuestions}
            answers={aiAnswers}
            onAnswerChange={handleAiAnswerChange}
            error={aiError}
            preview={aiPreview}
            onOpenPreview={() => setAiPreviewOpen(true)}
          />
        </div>
      </div>

      <BlockConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        definition={activeConfigDefinition}
        configDraft={configDraft}
        setConfigDraft={setConfigDraft}
        onClose={handleConfigClose}
        onSave={handleConfigSave}
        documentTemplateOptions={documentTemplateOptions}
        variableOptions={variableOptions}
        slackChannelOptions={slackChannelOptions}
        slackChannelLoading={slackChannelLoading}
        slackChannelError={slackChannelError}
        emailSenderOptions={emailSenderOptions}
        emailSenderLoading={emailSenderLoading}
        emailSenderError={emailSenderError}
        ficClientOptions={ficClientOptions}
        ficClientLoading={ficClientLoading}
        ficClientError={ficClientError}
        ficVatTypeOptions={ficVatTypeOptions}
        ficVatTypeLoading={ficVatTypeLoading}
        ficVatTypeError={ficVatTypeError}
        ficPaymentMethodOptions={ficPaymentMethodOptions}
        ficPaymentMethodLoading={ficPaymentMethodLoading}
        ficPaymentMethodError={ficPaymentMethodError}
        blockId={configBlockId ?? undefined}
      />

      <AiPreviewDialog
        open={aiPreviewOpen}
        onOpenChange={setAiPreviewOpen}
        preview={aiPreview}
        attachOptions={aiPreviewAttachOptions}
        attachTo={aiAttachTo ?? "start"}
        onAttachChange={(value) => setAiAttachTo(value)}
        onApply={() => applyAiPreview(aiAttachTo)}
        onRegenerate={() => setAiPreviewOpen(false)}
        removedLabels={aiPreviewRemovedLabels}
      />

      <TriggerDialog
        open={triggerDialogOpen}
        onOpenChange={setTriggerDialogOpen}
        triggerOptions={triggerOptions}
        triggerType={triggerType}
        setTriggerType={setTriggerType}
        triggerConfig={triggerConfig}
        setTriggerConfig={setTriggerConfig}
        manualFieldDefinitions={manualFieldDefinitions}
        setManualFieldDefinitions={setManualFieldDefinitions}
        manualFieldIdRef={manualFieldId}
        emailFieldDefinitions={emailFieldDefinitions}
        setEmailFieldDefinitions={setEmailFieldDefinitions}
        emailFieldIdRef={emailFieldId}
        slackFieldDefinitions={slackFieldDefinitions}
        setSlackFieldDefinitions={setSlackFieldDefinitions}
        slackFieldIdRef={slackFieldId}
        slackChannelOptions={slackChannelOptions}
        slackChannelLoading={slackChannelLoading}
        slackChannelError={slackChannelError}
        documentTemplateOptions={documentTemplateOptions}
        triggerTemplateMissing={triggerTemplateMissing}
        onUnavailableTrigger={() => toast.error({ description: "Trigger in arrivo." })}
      />

      <RunPayloadDialog
        open={runPayloadDialogOpen}
        onOpenChange={setRunPayloadDialogOpen}
        runPayloadFields={runPayloadFields}
        setRunPayloadFields={setRunPayloadFields}
        onSubmit={handleRunWithPayload}
        isRunning={isRunning}
      />

      <LogicDialog
        open={logicDialogOpen}
        onOpenChange={setLogicDialogOpen}
        pendingLogic={pendingLogic}
        logicCondition={logicCondition}
        setLogicCondition={setLogicCondition}
        logicIterations={logicIterations}
        setLogicIterations={setLogicIterations}
        waitTimeout={waitTimeout}
        setWaitTimeout={setWaitTimeout}
        variableOptions={variableOptions}
        onCancel={resetLogicDialog}
        onSubmit={handleLogicSubmit}
        submitDisabled={logicSubmitDisabled}
      />
    </ClientPageWrapper>
  );
}
