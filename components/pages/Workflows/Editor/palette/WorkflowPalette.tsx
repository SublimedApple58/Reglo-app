"use client";

import { ArrowLeft } from "lucide-react";
import type { DragEvent } from "react";
import { cn } from "@/lib/utils";
import type {
  BlockDefinition,
  ServiceKey,
} from "@/components/pages/Workflows/Editor/types";
import { serviceBlocks } from "@/components/pages/Workflows/Editor/constants";

type WorkflowPaletteProps = {
  paletteView: "menu" | "blocks";
  selectedService: ServiceKey;
  currentService: { label: string; blocks: BlockDefinition[] };
  isSlackConnected: boolean;
  isFicConnected: boolean;
  onSelectService: (service: ServiceKey) => void;
  onChangeView: (view: "menu" | "blocks") => void;
  onDragStart: (event: DragEvent, block: BlockDefinition) => void;
  onSlackUnavailable: () => void;
  onFicUnavailable: () => void;
};

export function WorkflowPalette({
  paletteView,
  selectedService,
  currentService,
  isSlackConnected,
  isFicConnected,
  onSelectService,
  onChangeView,
  onDragStart,
  onSlackUnavailable,
  onFicUnavailable,
}: WorkflowPaletteProps) {
  if (paletteView === "menu") {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {(["reglo-actions", "doc-manager"] as ServiceKey[]).map((serviceKey) => {
            const svc = serviceBlocks[serviceKey];
            return (
              <button
                key={svc.label}
                type="button"
                onClick={() => {
                  onSelectService(serviceKey);
                  onChangeView("blocks");
                }}
                className="flex w-full items-center gap-3 rounded-lg bg-white px-3 py-3 text-left text-sm font-medium text-foreground shadow-sm ring-1 ring-black/5 transition hover:-translate-y-[1px] hover:shadow-md"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  R
                </span>
                <span>{svc.label}</span>
              </button>
            );
          })}
        </div>
        <hr className="border-border/60" />
        <div className="space-y-2">
          <p className="text-base font-semibold text-foreground">Integrations</p>
          {(["slack", "fatture-in-cloud"] as ServiceKey[]).map((serviceKey) => {
            const svc = serviceBlocks[serviceKey];
            const isSlack = serviceKey === "slack";
            const isFic = serviceKey === "fatture-in-cloud";
            const disabled =
              (isSlack && !isSlackConnected) || (isFic && !isFicConnected);
            return (
              <button
                key={serviceKey}
                type="button"
                onClick={() => {
                  onSelectService(serviceKey);
                  onChangeView("blocks");
                  if (disabled) {
                    if (isSlack) {
                      onSlackUnavailable();
                    } else {
                      onFicUnavailable();
                    }
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg bg-white px-3 py-3 text-left text-sm font-medium text-foreground shadow-sm ring-1 ring-black/5 transition hover:-translate-y-[1px] hover:shadow-md",
                  disabled ? "opacity-60" : null,
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                  {serviceKey === "slack" ? "S" : "FIC"}
                </span>
                <span>{svc.label}</span>
                {disabled ? (
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-800">
                    Non connesso
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <hr className="border-border/60" />
        <div className="space-y-2">
          <p className="text-base font-semibold text-foreground">Logica</p>
          {(["logic", "flow-control"] as ServiceKey[]).map((serviceKey) => {
            const svc = serviceBlocks[serviceKey];
            return (
              <button
                key={serviceKey}
                type="button"
                onClick={() => {
                  onSelectService(serviceKey);
                  onChangeView("blocks");
                }}
                className="flex w-full items-center gap-3 rounded-lg bg-white px-3 py-3 text-left text-sm font-medium text-foreground shadow-sm ring-1 ring-black/5 transition hover:-translate-y-[1px] hover:shadow-md"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                  {serviceKey === "logic" ? "IF" : "WAIT"}
                </span>
                <span>{svc.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        onClick={() => onChangeView("menu")}
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
      {selectedService === "fatture-in-cloud" && !isFicConnected ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Connetti Fatture in Cloud in Settings per sbloccare questi blocchi.
        </div>
      ) : null}
      <div className="space-y-3">
        {currentService.blocks.map((block) => {
          const isIntegrationDisabled =
            (block.id.startsWith("slack-") && !isSlackConnected) ||
            (block.id.startsWith("fic-") && !isFicConnected);
          const isPlanned = block.status === "planned";
          const isDisabled = isIntegrationDisabled || isPlanned;

          return (
            <div
              key={block.id}
              draggable={!isDisabled}
              onDragStart={(event) => onDragStart(event, block)}
              className={cn(
                "rounded-2xl bg-white px-4 py-3 text-sm font-medium text-foreground shadow-md transition",
                isDisabled
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-grab hover:-translate-y-[1px] hover:shadow-lg active:cursor-grabbing",
              )}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{block.label}</p>
                  {isPlanned ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Soon
                    </span>
                  ) : null}
                </div>
                {block.hint ? (
                  <p className="text-xs text-muted-foreground">{block.hint}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
