"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { workflowsData } from "@/components/pages/Workflows/workflows-data";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
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

type ServiceKey = "teamsystem" | "slack" | "doc-manager" | "reglo-actions" | "logic";

type BlockKind = "standard" | "if" | "for" | "while";

type BlockDefinition = {
  id: string;
  label: string;
  kind?: BlockKind;
  hint?: string;
};

type LogicNodeData = {
  label: string;
  meta?: string;
};

const serviceBlocks: Record<
  ServiceKey,
  { label: string; blocks: BlockDefinition[]; group: "integrations" | "docs" | "logic" }
> = {
  teamsystem: {
    label: "TeamSystem",
    group: "integrations",
    blocks: [
      { id: "ts-fattura", label: "Registra fattura fornitore" },
      { id: "ts-prima-nota", label: "Invia prima nota" },
      { id: "ts-magazzino", label: "Aggiorna movimenti magazzino" },
      { id: "ts-scadenze", label: "Genera scadenze pagamento" },
      { id: "ts-conto", label: "Aggiorna piano dei conti" },
      { id: "ts-iva", label: "Liquidazione IVA mensile" },
    ],
  },
  slack: {
    label: "Slack",
    group: "integrations",
    blocks: [
      { id: "slack-message", label: "Invia messaggio canale" },
      { id: "slack-thread", label: "Rispondi in thread" },
      { id: "slack-reminder", label: "Crea reminder" },
      { id: "slack-upload", label: "Pubblica file" },
      { id: "slack-notify", label: "Notifica stato workflow" },
    ],
  },
  "doc-manager": {
    label: "Doc manager",
    group: "docs",
    blocks: [
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
};

export default function WorkflowDetailPage(): React.ReactElement {
  const params = useParams<{ workflowId: string }>();
  const searchParams = useSearchParams();
  const workflowId = params?.workflowId;
  const isNew = searchParams.get("mode") === "new";
  const nameParam = searchParams.get("name");

  const workflow = useMemo(
    () => workflowsData.find((item) => item.id === workflowId),
    [workflowId],
  );

  const title = useMemo(() => {
    if (isNew && nameParam) {
      return nameParam;
    }
    return workflow?.title ?? "Workflow";
  }, [isNew, nameParam, workflow?.title]);
  const [selectedService, setSelectedService] = useState<ServiceKey>("teamsystem");
  const [paletteView, setPaletteView] = useState<"menu" | "blocks">("menu");
  const [nodes, setNodes] = useState<Node[]>(() => buildNodes(title, isNew));
  const [edges, setEdges] = useState<Edge[]>(() => buildEdges(isNew));
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [logicDialogOpen, setLogicDialogOpen] = useState(false);
  const [logicCondition, setLogicCondition] = useState("");
  const [logicIterations, setLogicIterations] = useState("");
  const [pendingLogic, setPendingLogic] = useState<{
    block: BlockDefinition;
    position: { x: number; y: number };
  } | null>(null);
  const idCounter = useRef(0);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const currentService = serviceBlocks[selectedService];

  const nodeTypes = useMemo(
    () => ({
      logicIf: LogicIfNode,
      logicLoop: LogicLoopNode,
      logicMerge: LogicMergeNode,
    }),
    [],
  );

  const onDragStart = useCallback((event: React.DragEvent, block: BlockDefinition) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(block));
    event.dataTransfer.effectAllowed = "move";
  }, []);

  const resetLogicDialog = () => {
    setLogicCondition("");
    setLogicIterations("");
    setPendingLogic(null);
    setLogicDialogOpen(false);
  };

  const addNode = (node: Node) => {
    setNodes((nds) => nds.concat(node));
  };

  const addStandardNode = (label: string, position: { x: number; y: number }) => {
  const newId = `ts-node-${idCounter.current++}`;
  addNode({
    id: newId,
    position,
    data: { label },
    style: secondaryNodeStyle,
  });
};

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
        setLogicCondition("");
        setLogicIterations("");
        return;
      }

      addStandardNode(block.label, position);
    },
    [reactFlowInstance],
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
    <ClientPageWrapper title={title} parentTitle="Workflows" enableBackNavigation>
      <div className="flex h-full flex-col gap-4">
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
                  {(["slack", "teamsystem"] as ServiceKey[]).map((svc) => (
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
                        {svc === "slack" ? "S" : "TS"}
                      </span>
                      <span>{serviceBlocks[svc].label}</span>
                    </button>
                  ))}
                </div>
                <hr className="border-border/60" />
                <div className="space-y-2">
                  <p className="text-base font-semibold text-foreground">Logica</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedService("logic");
                      setPaletteView("blocks");
                    }}
                    className="flex w-full items-center gap-3 rounded-lg bg-white px-3 py-3 text-left text-sm font-medium text-foreground shadow-sm ring-1 ring-black/5 transition hover:-translate-y-[1px] hover:shadow-md"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      IF
                    </span>
                    <span>{serviceBlocks.logic.label}</span>
                  </button>
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
                      : selectedService === "teamsystem"
                        ? "TS"
                        : selectedService === "logic"
                          ? "IF"
                          : "R"}
                  </span>
                  <div>
                    <p className="text-base font-semibold text-foreground">{currentService.label}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {currentService.blocks.map((block) => (
                    <div
                      key={block.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, block)}
                      className="cursor-grab rounded-2xl bg-white px-4 py-3 text-sm font-medium text-foreground shadow-md transition hover:-translate-y-[1px] hover:shadow-lg active:cursor-grabbing"
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
                deleteKeyCode={["Backspace"]}
              >
                <Controls />
                <Background gap={16} size={1} />
              </ReactFlow>
            </div>
          </div>
        </div>
      </div>

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
          {pendingLogic?.block.kind === "for" ? (
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
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Condizione
              </p>
              <Input
                value={logicCondition}
                onChange={(event) => setLogicCondition(event.target.value)}
                placeholder="Es. il totale supera 500€"
              />
              <p className="text-xs text-muted-foreground">
                Scrivi la condizione in linguaggio semplice.
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
                pendingLogic?.block.kind === "for"
                  ? Number(logicIterations) < 1
                  : !logicCondition.trim()
              }
              onClick={() => {
                if (!pendingLogic) return;
                const { block, position } = pendingLogic;
                if (block.kind === "if") {
                  addLogicIfWithMerge({ label: logicCondition.trim(), meta: "Condizione" }, position);
                  resetLogicDialog();
                  return;
                }
                if (block.kind === "while") {
                  addLogicNode(
                    "logicLoop",
                    { label: `Ripeti finché ${logicCondition.trim()}`, meta: "Ripetizione" },
                    position,
                  );
                  resetLogicDialog();
                  return;
                }
                if (block.kind === "for") {
                  addLogicNode(
                    "logicLoop",
                    { label: `Ripeti ${logicIterations.trim()} volte`, meta: "Ripetizione" },
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
