"use client";

import { X } from "lucide-react";
import type { DragEvent } from "react";
import React from "react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { WorkflowPalette } from "@/components/pages/Workflows/Editor/palette/WorkflowPalette";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setIsReady(false);
      return;
    }
    const timer = setTimeout(() => setIsReady(true), 220);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <motion.aside
      aria-hidden={!open}
      className="glass-panel shrink-0 self-start overflow-hidden"
      animate={{
        width: open ? 320 : 0,
        opacity: open ? 1 : 0,
        padding: open ? 16 : 0,
      }}
      transition={{ duration: 0.22, ease: "linear" }}
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      {isReady ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Blocchi
              </p>
              <p className="text-xs text-muted-foreground">
                Trascina un blocco nel canvas.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
              onClick={onClose}
            >
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
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-3 w-20 rounded-full" />
              <Skeleton className="h-3 w-40 rounded-full" />
            </div>
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>
      )}
    </motion.aside>
  );
}
