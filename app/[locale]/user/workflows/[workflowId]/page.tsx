"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  getWorkflowById,
  startWorkflowRun,
  updateWorkflow,
} from "@/lib/actions/workflow.actions";
import { listDocumentTemplates } from "@/lib/actions/document.actions";
import { getIntegrationConnections } from "@/lib/actions/integration.actions";
import { WorkflowRunHistory } from "@/components/pages/Workflows/WorkflowRunHistory";
import ReactFlow, {
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Handle,
  Position,
  type Edge,
  type EdgeChange,
  type Node,
  type ReactFlowInstance,
  type NodeChange,
  type Connection,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { ArrowLeft, GitBranch, Repeat, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const primaryNodeStyle = {
  borderRadius: 14,
  padding: "12px 16px",
  border: "1px solid rgba(50, 78, 122, 0.2)",
  background: "#e9f2f2",
  color: "#324e7a",
  fontWeight: 600,
  boxShadow: "0 10px 18px -16px rgba(50, 78, 122, 0.4)",
};

const secondaryNodeStyle = {
  ...primaryNodeStyle,
  background: "#e5e4f0",
  border: "1px solid rgba(96, 87, 158, 0.25)",
};

const buildNodes = (title: string, isNew: boolean): Node[] => {
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

const buildEdges = (isNew: boolean): Edge[] =>
  isNew
    ? []
    : [
        { id: "e1", source: "start", target: "approval", animated: true },
        { id: "e2", source: "approval", target: "complete", animated: true },
      ];

type ServiceKey =
  | "fatture-in-cloud"
  | "slack"
  | "doc-manager"
  | "reglo-actions"
  | "logic"
  | "flow-control";

type BlockKind = "standard" | "if" | "for" | "while";

type BlockDefinition = {
  id: string;
  label: string;
  kind?: BlockKind;
  hint?: string;
};

type BlockConfigField = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "select";
  options?: string[];
  optionsSource?: "templates";
  hint?: string;
};

type BlockConfigDefinition = {
  title: string;
  description?: string;
  fields: BlockConfigField[];
};

type Condition = {
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains";
  left: string;
  right: string;
};

type LogicNodeData = {
  label: string;
  meta?: string;
  condition?: Condition;
  loopKind?: "for" | "while";
  iterations?: number;
};

const serviceBlocks: Record<
  ServiceKey,
  { label: string; blocks: BlockDefinition[]; group: "integrations" | "docs" | "logic" }
> = {
  "fatture-in-cloud": {
    label: "Fatture in Cloud",
    group: "integrations",
    blocks: [
      { id: "fic-create-invoice", label: "Crea fattura" },
      { id: "fic-update-status", label: "Aggiorna stato fattura" },
    ],
  },
  slack: {
    label: "Slack",
    group: "integrations",
    blocks: [
      { id: "slack-channel-message", label: "Invia messaggio a canale" },
      { id: "slack-user-message", label: "Scrivi a utente" },
    ],
  },
  "doc-manager": {
    label: "Doc manager",
    group: "docs",
    blocks: [
      { id: "doc-compile-template", label: "Compila template" },
      { id: "doc-upload", label: "Carica documento" },
      { id: "doc-validate", label: "Valida documento" },
      { id: "doc-route", label: "Instrada per approvazione" },
      { id: "doc-archive", label: "Archivia in repository" },
      { id: "doc-tag", label: "Applica tag e classificazione" },
    ],
  },
  "reglo-actions": {
    label: "Reglo actions",
    group: "docs",
    blocks: [
      { id: "reglo-sync", label: "Sincronizza metadati" },
      { id: "reglo-route", label: "Instrada al reparto corretto" },
      { id: "reglo-validate", label: "Valida policy interne" },
      { id: "reglo-notify", label: "Notifica stakeholder" },
      { id: "reglo-log", label: "Logga evento in audit trail" },
    ],
  },
  logic: {
    label: "Blocchi logici",
    group: "logic",
    blocks: [
      {
        id: "logic-if",
        label: "Condizione (if)",
        kind: "if",
        hint: "Esegui solo se la condizione è vera.",
      },
      {
        id: "logic-for",
        label: "Ripeti (for)",
        kind: "for",
        hint: "Esegui per un numero di volte definito.",
      },
      {
        id: "logic-while",
        label: "Ripeti finché",
        kind: "while",
        hint: "Continua finché la condizione resta vera.",
      },
    ],
  },
  "flow-control": {
    label: "Flow control",
    group: "logic",
    blocks: [
      {
        id: "wait",
        label: "Metti in pausa",
        hint: "Attende un evento esterno prima di proseguire.",
      },
    ],
  },
};

const blockConfigDefinitions: Record<string, BlockConfigDefinition> = {
  "slack-channel-message": {
    title: "Messaggio in canale",
    description: "Invia un messaggio al canale scelto.",
    fields: [
      {
        key: "channel",
        label: "Canale",
        placeholder: "#general o ID canale",
        required: true,
      },
      {
        key: "message",
        label: "Messaggio",
        placeholder: "Scrivi il testo da inviare",
        required: true,
        hint: "Puoi usare variabili come {{trigger.payload.*}} o {{steps.nodeId.output.*}}.",
      },
    ],
  },
  "slack-user-message": {
    title: "Messaggio a utente",
    description: "Invia un DM a un utente del workspace.",
    fields: [
      {
        key: "user",
        label: "Utente",
        placeholder: "Email o ID utente Slack",
        required: true,
      },
      {
        key: "message",
        label: "Messaggio",
        placeholder: "Scrivi il testo da inviare",
        required: true,
        hint: "Puoi usare variabili come {{trigger.payload.*}} o {{steps.nodeId.output.*}}.",
      },
    ],
  },
  "doc-compile-template": {
    title: "Compila template",
    description: "Genera una compilazione pubblica a partire da un template.",
    fields: [
      {
        key: "templateId",
        label: "Template",
        type: "select",
        required: true,
        optionsSource: "templates",
      },
      {
        key: "requestName",
        label: "Nome compilazione",
        placeholder: "Es. Contratto Mario Rossi",
        required: true,
        hint: "Supporta variabili come {{trigger.payload.*}} o {{steps.nodeId.output.*}}.",
      },
    ],
  },
  "fic-create-invoice": {
    title: "Crea fattura",
    description: "Crea una nuova fattura di vendita.",
    fields: [
      {
        key: "customer",
        label: "Cliente",
        placeholder: "Nome cliente o ID",
        required: true,
      },
      {
        key: "amount",
        label: "Importo",
        placeholder: "Es. 1200.00",
        required: true,
      },
      {
        key: "currency",
        label: "Valuta",
        placeholder: "EUR",
        required: true,
      },
      {
        key: "description",
        label: "Descrizione",
        placeholder: "Descrizione breve della fattura",
      },
      {
        key: "dueDate",
        label: "Scadenza",
        placeholder: "YYYY-MM-DD",
      },
    ],
  },
  "fic-update-status": {
    title: "Aggiorna stato fattura",
    description: "Aggiorna lo stato di una fattura esistente.",
    fields: [
      {
        key: "invoiceId",
        label: "ID fattura",
        placeholder: "ID o riferimento",
        required: true,
      },
      {
        key: "status",
        label: "Nuovo stato",
        type: "select",
        required: true,
        options: ["Pagata", "In sospeso", "Annullata"],
      },
    ],
  },
};

const getDefaultConfig = (blockId: string) => {
  const definition = blockConfigDefinitions[blockId];
  if (!definition) return {};
  return definition.fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = "";
    return acc;
  }, {});
};

const getMissingFields = (blockId: string, config: Record<string, unknown>) => {
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

export default function WorkflowDetailPage(): React.ReactElement {
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
  const [selectedService, setSelectedService] =
    useState<ServiceKey>("slack");
  const [paletteView, setPaletteView] = useState<"menu" | "blocks">("menu");
  const [nodes, setNodes] = useState<Node[]>(() => buildNodes(workflowName, true));
  const [edges, setEdges] = useState<Edge[]>(() => buildEdges(true));
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runHistoryKey, setRunHistoryKey] = useState(0);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [logicDialogOpen, setLogicDialogOpen] = useState(false);
  const [logicCondition, setLogicCondition] = useState<Condition>({
    op: "eq",
    left: "",
    right: "",
  });
  const [logicIterations, setLogicIterations] = useState("");
  const [waitTimeout, setWaitTimeout] = useState("24h");
  const [pendingLogic, setPendingLogic] = useState<{
    block: BlockDefinition;
    position: { x: number; y: number };
  } | null>(null);
  const idCounter = useRef(0);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const currentService = serviceBlocks[selectedService];
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({});
  const [configBlockId, setConfigBlockId] = useState<string | null>(null);
  const [configNodeId, setConfigNodeId] = useState<string | null>(null);
  const [documentTemplateOptions, setDocumentTemplateOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [integrationConnections, setIntegrationConnections] = useState<
    Record<string, { status: string; displayName?: string | null }>
  >({});
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
  const selectedBlockConfig =
    selectedNode &&
    typeof selectedNode.data === "object" &&
    selectedNode.data &&
    "config" in selectedNode.data
      ? (selectedNode.data as { config?: Record<string, string> }).config ?? {}
      : {};
  const selectedBlockDefinition = selectedBlockId
    ? blockConfigDefinitions[selectedBlockId]
    : undefined;
  const selectedBlockHasConfig = Boolean(selectedBlockDefinition);
  const activeConfigDefinition = configBlockId
    ? blockConfigDefinitions[configBlockId]
    : undefined;
  const isSlackConnected = integrationConnections["slack"]?.status === "connected";

  const warnings = useMemo(() => {
    return nodes
      .filter((node) => node.type !== "logicIf" && node.type !== "logicLoop")
      .map((node) => {
        const data = node.data as
          | {
              blockId?: string;
              config?: Record<string, unknown>;
              label?: string;
              configTouched?: boolean;
            }
          | undefined;
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

  React.useEffect(() => {
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
      } | null;
      const canvasNodes = definition?.canvas?.nodes ?? [];
      const canvasEdges = definition?.canvas?.edges ?? [];
      if (canvasNodes.length > 0) {
        setNodes(canvasNodes);
        setEdges(canvasEdges);
      } else {
        setNodes(buildNodes(res.data.name, true));
        setEdges(buildEdges(true));
      }
      idCounter.current = canvasNodes.length;
    };
    loadWorkflow();
    return () => {
      isMounted = false;
    };
  }, [isNew, toast, workflowId]);

  React.useEffect(() => {
    let isMounted = true;
    const loadTemplates = async () => {
      const res = await listDocumentTemplates();
      if (!res.success || !res.data || !isMounted) return;
      setDocumentTemplateOptions(
        res.data.documents.map((template) => ({
          label: template.title,
          value: template.id,
        })),
      );
    };
    loadTemplates();
    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    const loadConnections = async () => {
      const res = await getIntegrationConnections();
      if (!res.success || !res.data || !isMounted) return;
      const map: Record<string, { status: string; displayName?: string | null }> = {};
      res.data.forEach(
        (connection: { provider: string; status: string; displayName?: string | null }) => {
        map[connection.provider] = {
          status: connection.status,
          displayName: connection.displayName,
        };
      },
      );
      setIntegrationConnections(map);
    };
    loadConnections();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async () => {
    if (!workflowId || isSaving) return;
    if (!workflowName.trim()) {
      toast.error({ description: "Inserisci un nome workflow." });
      return;
    }
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
    const runtimeNodes = nodes.map((node) => {
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
    const runtimeEdges = edges.map((edge) => ({
      from: edge.source,
      to: edge.target,
      condition: edge.sourceHandle ? { branch: edge.sourceHandle } : null,
    }));
    const res = await updateWorkflow({
      id: workflowId,
      name: workflowName,
      status: workflowStatus as "draft" | "active" | "paused",
      definition: {
        trigger: { type: "manual", config: {} },
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
    toast.success({ description: "Workflow salvato." });
    setIsSaving(false);
  };

  const handleRun = async () => {
    if (!workflowId || isRunning) return;
    setIsRunning(true);
    const res = await startWorkflowRun({ workflowId });
    if (!res.success) {
      toast.error({ description: res.message ?? "Impossibile avviare il workflow." });
      setIsRunning(false);
      return;
    }
    toast.success({ description: "Workflow avviato." });
    setRunHistoryKey((prev) => prev + 1);
    setIsRunning(false);
  };

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
        ...(existingConfig as Record<string, string>),
      });
      setConfigBlockId(blockId);
      setConfigNodeId(nodeId);
      setConfigDialogOpen(true);
    },
    [nodes],
  );

  const openConfigDialog = () => {
    if (!selectedBlockId || !selectedBlockHasConfig || !selectedNode) return;
    openConfigForNode(selectedNode.id, selectedBlockId);
  };

  const handleConfigSave = () => {
    if (!configNodeId || !configBlockId) {
      setConfigDialogOpen(false);
      return;
    }
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== configNodeId) return node;
        return {
          ...node,
          data: {
            ...(typeof node.data === "object" ? node.data : {}),
            config: configDraft,
            blockId: configBlockId,
            configTouched: true,
          },
        };
      }),
    );
    setConfigDialogOpen(false);
  };

  const handleConfigClose = () => {
    if (configNodeId) {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === configNodeId
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
    setConfigBlockId(null);
    setConfigNodeId(null);
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
      if (block.id.startsWith("slack-") && !isSlackConnected) {
        event.preventDefault();
        toast.error({ description: "Connetti Slack per usare questi blocchi." });
        return;
      }
      event.dataTransfer.setData("application/reactflow", JSON.stringify(block));
      event.dataTransfer.effectAllowed = "move";
    },
    [isSlackConnected, toast],
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

  const addStandardNode = useCallback(
    (block: BlockDefinition, position: { x: number; y: number }) => {
      const newId = `ts-node-${idCounter.current++}`;
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
    [addNode],
  );

  const addLogicNode = (
    type: "logicIf" | "logicLoop" | "logicMerge",
    data: LogicNodeData,
    position: { x: number; y: number },
  ) => {
    const newId = `ts-node-${idCounter.current++}`;
    addNode({
      id: newId,
      type,
      position,
      data,
    });
  };

  const addLogicIfWithMerge = (data: LogicNodeData, position: { x: number; y: number }) => {
    const ifId = `ts-node-${idCounter.current++}`;
    const mergeId = `ts-node-${idCounter.current++}`;
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
    [reactFlowInstance, addStandardNode, openConfigForNode],
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
                targetHandle: nextTarget?.type === "logicMerge" ? mergeHandle ?? undefined : undefined,
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

  return (
    <ClientPageWrapper title={workflowName} parentTitle="Workflows" enableBackNavigation>
      <div className="flex h-full flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[240px] space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Workflow name
            </p>
            <Input
              value={workflowName}
              onChange={(event) => setWorkflowName(event.target.value)}
              placeholder="Nome workflow"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Status
              </p>
              <Select
                value={workflowStatus}
                onValueChange={(value) => setWorkflowStatus(value)}
              >
                <SelectTrigger className="min-w-[160px]">
                  <SelectValue placeholder="Seleziona stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedBlockHasConfig ? (
              <Button type="button" variant="outline" onClick={openConfigDialog}>
                Configura blocco
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={handleRun} disabled={isRunning}>
              {isRunning ? "Running..." : "Run now"}
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save workflow"}
            </Button>
          </div>
        </div>
        {warnings.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
          <aside className="w-80 shrink-0 self-start space-y-4 rounded-xl  bg-card p-4 shadow-sm">
            {paletteView === "menu" ? (
              <div className="space-y-4">
                <div className="space-y-3">
                  {[serviceBlocks["reglo-actions"], serviceBlocks["doc-manager"]].map((svc) => (
                    <button
                      key={svc.label}
                      type="button"
                      onClick={() => {
                        setSelectedService(svc.label === "Reglo actions" ? "reglo-actions" : "doc-manager");
                        setPaletteView("blocks");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg bg-white px-3 py-3 text-left text-sm font-medium text-foreground shadow-sm ring-1 ring-black/5 transition hover:-translate-y-[1px] hover:shadow-md"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">R</span>
                      <span>{svc.label}</span>
                    </button>
                  ))}
                </div>
                <hr className="border-border/60" />
                <div className="space-y-2">
                  <p className="text-base font-semibold text-foreground">Integrations</p>
                  {(["slack", "fatture-in-cloud"] as ServiceKey[]).map((svc) => (
                    <button
                      key={svc}
                      type="button"
                      onClick={() => {
                        if (svc === "slack" && !isSlackConnected) {
                          toast.error({
                            description: "Connetti Slack per usare questi blocchi.",
                          });
                          return;
                        }
                        setSelectedService(svc);
                        setPaletteView("blocks");
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg bg-white px-3 py-3 text-left text-sm font-medium text-foreground shadow-sm ring-1 ring-black/5 transition",
                        svc === "slack" && !isSlackConnected
                          ? "cursor-not-allowed opacity-50"
                          : "hover:-translate-y-[1px] hover:shadow-md",
                      )}
                      disabled={svc === "slack" && !isSlackConnected}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                        {svc === "slack" ? "S" : "FIC"}
                      </span>
                      <span>{serviceBlocks[svc].label}</span>
                    </button>
                  ))}
                </div>
                <hr className="border-border/60" />
                <div className="space-y-2">
                  <p className="text-base font-semibold text-foreground">Logica</p>
                  {(["logic", "flow-control"] as ServiceKey[]).map((svc) => (
                    <button
                      key={svc}
                      type="button"
                      onClick={() => {
                        setSelectedService(svc);
                        setPaletteView("blocks");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg bg-white px-3 py-3 text-left text-sm font-medium text-foreground shadow-sm ring-1 ring-black/5 transition hover:-translate-y-[1px] hover:shadow-md"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                        {svc === "logic" ? "IF" : "WAIT"}
                      </span>
                      <span>{serviceBlocks[svc].label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
                  onClick={() => setPaletteView("menu")}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-black/5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                    {selectedService === "slack"
                      ? "S"
                      : selectedService === "fatture-in-cloud"
                        ? "FIC"
                        : selectedService === "logic"
                          ? "IF"
                          : selectedService === "flow-control"
                            ? "WAIT"
                            : "R"}
                  </span>
                  <div>
                    <p className="text-base font-semibold text-foreground">{currentService.label}</p>
                  </div>
                </div>
                {selectedService === "slack" && !isSlackConnected ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    Connetti Slack in Settings per sbloccare questi blocchi.
                  </div>
                ) : null}
                <div className="space-y-3">
                  {currentService.blocks.map((block) => (
                    <div
                      key={block.id}
                      draggable={!(block.id.startsWith("slack-") && !isSlackConnected)}
                      onDragStart={(e) => onDragStart(e, block)}
                      className={cn(
                        "rounded-2xl bg-white px-4 py-3 text-sm font-medium text-foreground shadow-md transition",
                        block.id.startsWith("slack-") && !isSlackConnected
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-grab hover:-translate-y-[1px] hover:shadow-lg active:cursor-grabbing",
                      )}
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{block.label}</p>
                        {block.hint ? (
                          <p className="text-xs text-muted-foreground">{block.hint}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
          <div className="relative flex min-h-[560px] flex-1 rounded-xl border bg-card p-4 shadow-sm">
            <div ref={flowWrapperRef} className="flex-1 rounded-lg bg-background">
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
                deleteKeyCode={["Backspace"]}
              >
                <Controls />
                <Background gap={16} size={1} />
              </ReactFlow>
            </div>
          </div>
        </div>
        {workflowId ? (
          <WorkflowRunHistory workflowId={workflowId} refreshKey={runHistoryKey} />
        ) : null}
      </div>

      <Dialog
        open={configDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleConfigClose();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{activeConfigDefinition?.title ?? "Configura blocco"}</DialogTitle>
            {activeConfigDefinition?.description ? (
              <DialogDescription>{activeConfigDefinition.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="space-y-4">
            {activeConfigDefinition?.fields.map((field) => {
              const selectOptions =
                field.optionsSource === "templates"
                  ? documentTemplateOptions
                  : (field.options ?? []).map((option) => ({
                      label: option,
                      value: option,
                    }));
              return (
              <div key={field.key} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {field.label}
                  {field.required ? " *" : ""}
                </p>
                {field.type === "select" ? (
                  <Select
                    value={configDraft[field.key] ?? ""}
                    onValueChange={(value) =>
                      setConfigDraft((prev) => ({ ...prev, [field.key]: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona valore" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={configDraft[field.key] ?? ""}
                    onChange={(event) =>
                      setConfigDraft((prev) => ({
                        ...prev,
                        [field.key]: event.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                  />
                )}
                {field.hint ? (
                  <p className="text-xs text-muted-foreground">{field.hint}</p>
                ) : null}
              </div>
            );
            })}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleConfigClose}>
              Chiudi
            </Button>
            <Button onClick={handleConfigSave}>Salva configurazione</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={logicDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetLogicDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configura blocco logico</DialogTitle>
            <DialogDescription>
              Inserisci i dati per rendere il blocco chiaro e comprensibile.
            </DialogDescription>
          </DialogHeader>
          {pendingLogic?.block.id === "wait" ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Timeout
              </p>
              <Input
                value={waitTimeout}
                onChange={(event) => setWaitTimeout(event.target.value)}
                placeholder="24h"
              />
              <p className="text-xs text-muted-foreground">
                Es: 30m, 24h, 7d. Se scade, il run fallisce.
              </p>
            </div>
          ) : pendingLogic?.block.kind === "for" ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Numero di iterazioni
              </p>
              <Input
                type="number"
                min={1}
                value={logicIterations}
                onChange={(event) => setLogicIterations(event.target.value)}
                placeholder="Es. 5"
              />
              <p className="text-xs text-muted-foreground">
                Il blocco sarà mostrato come “Ripeti X volte”.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Condizione
              </p>
              <div className="grid gap-2">
                <Input
                  value={logicCondition.left}
                  onChange={(event) =>
                    setLogicCondition((prev) => ({
                      ...prev,
                      left: event.target.value,
                    }))
                  }
                  placeholder="{{trigger.payload.amount}}"
                />
                <Select
                  value={logicCondition.op}
                  onValueChange={(value) =>
                    setLogicCondition((prev) => ({
                      ...prev,
                      op: value as Condition["op"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Operatore" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eq">uguale</SelectItem>
                    <SelectItem value="neq">diverso</SelectItem>
                    <SelectItem value="gt">maggiore</SelectItem>
                    <SelectItem value="gte">maggiore o uguale</SelectItem>
                    <SelectItem value="lt">minore</SelectItem>
                    <SelectItem value="lte">minore o uguale</SelectItem>
                    <SelectItem value="contains">contiene</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={logicCondition.right}
                  onChange={(event) =>
                    setLogicCondition((prev) => ({
                      ...prev,
                      right: event.target.value,
                    }))
                  }
                  placeholder="1000"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Puoi usare variabili tipo {"{{trigger.payload.*}}"} o {"{{steps.nodeId.output.*}}"}.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetLogicDialog}>
              Annulla
            </Button>
            <Button
              type="button"
              disabled={
                pendingLogic?.block.id === "wait"
                  ? !waitTimeout.trim()
                  : pendingLogic?.block.kind === "for"
                    ? Number(logicIterations) < 1
                    : !logicCondition.left.trim() || !logicCondition.right.trim()
              }
              onClick={() => {
                if (!pendingLogic) return;
                const { block, position } = pendingLogic;
                if (block.id === "wait") {
                  const newNodeId = addStandardNode(block, position);
                  setNodes((prev) =>
                    prev.map((node, index) =>
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
                      label: `Ripeti finché ${label}`,
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
              }}
            >
              Inserisci blocco
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageWrapper>
  );
}

function LogicIfNode({ data, selected }: NodeProps<LogicNodeData>) {
  return (
    <div
      className={cn(
        "relative min-w-[220px] rounded-2xl border bg-[#e9f2f2] px-4 py-3 text-[#324e7a] shadow-md",
        selected && "ring-2 ring-[#a9d9d1]",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-[#324e7a] shadow-sm">
            <GitBranch className="h-4 w-4" />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {data.meta ?? "Condizione"}
          </p>
        </div>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-[#324e7a]">
          IF
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold">Se {data.label}</p>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Se sì</span>
        <span>Se no</span>
      </div>
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="h-2.5 w-2.5 -translate-x-1/2 border-2 border-white bg-[#324e7a]"
        style={{ left: "50%" }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="yes"
        className="h-2.5 w-2.5 border-2 border-white bg-[#2f9b85]"
        style={{ top: "55%" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="no"
        className="h-2.5 w-2.5 border-2 border-white bg-[#d27c6b]"
        style={{ top: "55%" }}
      />
    </div>
  );
}

function LogicLoopNode({ data, selected }: NodeProps<LogicNodeData>) {
  return (
    <div
      className={cn(
        "relative min-w-[220px] rounded-2xl border bg-[#e5e4f0] px-4 py-3 text-[#324e7a] shadow-md",
        selected && "ring-2 ring-[#60579e]/30",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-[#324e7a] shadow-sm">
            <Repeat className="h-4 w-4" />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {data.meta ?? "Ripetizione"}
          </p>
        </div>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-[#324e7a]">
          LOOP
        </span>
      </div>
      <p className="mt-1 text-xs font-semibold">{data.label}</p>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Ripeti</span>
        <span>Prosegui</span>
      </div>
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="h-2.5 w-2.5 -translate-x-1/2 border-2 border-white bg-[#60579e]"
        style={{ left: "50%" }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="loop"
        className="h-2.5 w-2.5 border-2 border-white bg-[#60579e]"
        style={{ top: "55%" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="next"
        className="h-2.5 w-2.5 border-2 border-white bg-[#324e7a]"
        style={{ top: "55%" }}
      />
    </div>
  );
}
function LogicMergeNode({ data, selected }: NodeProps<LogicNodeData>) {
  return (
    <div
      className={cn(
        "relative min-w-[160px] rounded-xl border border-dashed bg-[#f6faf9] px-3 py-2 text-[#324e7a] shadow-sm",
        selected && "ring-2 ring-[#a9d9d1]",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-[#324e7a] shadow-sm">
            <GitMerge className="h-3.5 w-3.5" />
          </span>
          {/* <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {data.meta ?? "End if"}
          </p> */}
        </div>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-[#324e7a]">
          END IF
        </span>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="h-2.5 w-2.5 border-2 border-white bg-[#2f9b85]"
        style={{ top: "55%" }}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right"
        className="h-2.5 w-2.5 border-2 border-white bg-[#d27c6b]"
        style={{ top: "55%" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="h-2.5 w-2.5 -translate-x-1/2 border-2 border-white bg-[#324e7a]"
        style={{ left: "50%" }}
      />
    </div>
  );
}
