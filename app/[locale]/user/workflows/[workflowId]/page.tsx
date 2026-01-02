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
  addEdge,
  type Edge,
  type Node,
  type ReactFlowInstance,
  type NodeChange,
  type Connection,
} from "reactflow";
import "reactflow/dist/style.css";
import { ArrowLeft } from "lucide-react";

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
    position: { x: 120, y: 120 },
    data: { label: `Start · ${title}` },
    style: primaryNodeStyle,
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
      position: { x: 600, y: 120 },
      data: { label: "Completato" },
      style: primaryNodeStyle,
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

type ServiceKey = "teamsystem" | "slack" | "doc-manager" | "reglo-actions";

const serviceBlocks: Record<
  ServiceKey,
  { label: string; blocks: { id: string; label: string }[]; group: "integrations" | "docs" }
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
  const idCounter = useRef(0);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const currentService = serviceBlocks[selectedService];

  const onDragStart = useCallback((event: React.DragEvent, nodeLabel: string) => {
    event.dataTransfer.setData("application/reactflow", nodeLabel);
    event.dataTransfer.effectAllowed = "move";
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const label = event.dataTransfer.getData("application/reactflow");
      if (!label || !reactFlowInstance) return;

      const bounds = flowWrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newId = `ts-node-${idCounter.current++}`;
      const newNode: Node = {
        id: newId,
        position,
        data: { label },
        style: secondaryNodeStyle,
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, animated: true, style: { strokeWidth: 1.5 } }, eds)),
    [],
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
                    {selectedService === "slack" ? "S" : selectedService === "teamsystem" ? "TS" : "R"}
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
                      onDragStart={(e) => onDragStart(e, block.label)}
                      className="cursor-grab rounded-2xl bg-white px-4 py-3 text-sm font-medium text-foreground shadow-md transition hover:-translate-y-[1px] hover:shadow-lg active:cursor-grabbing"
                    >
                      {block.label}
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
                onInit={setReactFlowInstance}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodesChange={onNodesChange}
                onConnect={onConnect}
              >
                {/* <MiniMap /> */}
                <Controls />
                <Background gap={16} size={1} />
              </ReactFlow>
            </div>
          </div>
        </div>
      </div>
    </ClientPageWrapper>
  );
}
