"use client";

import { X } from "lucide-react";
import type { DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { WorkflowPalette } from "@/components/pages/Workflows/Editor/palette/WorkflowPalette";
import type {
  BlockDefinition,
  ServiceKey,
} from "@/components/pages/Workflows/Editor/types";

type WorkflowPalettePanelProps = {
  open: boolean;
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
  onClose: () => void;
};

export function WorkflowPalettePanel({
  open,
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
  onClose,
}: WorkflowPalettePanelProps) {
  if (!open) return null;

  return (
    <aside className="w-80 shrink-0 self-start rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Blocchi
          </p>
          <p className="text-xs text-muted-foreground">
            Trascina un blocco nel canvas.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4">
        <WorkflowPalette
          paletteView={paletteView}
          selectedService={selectedService}
          currentService={currentService}
          isSlackConnected={isSlackConnected}
          isFicConnected={isFicConnected}
          onSelectService={onSelectService}
          onChangeView={onChangeView}
          onDragStart={onDragStart}
          onSlackUnavailable={onSlackUnavailable}
          onFicUnavailable={onFicUnavailable}
        />
      </div>
    </aside>
  );
}
