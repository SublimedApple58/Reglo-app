"use client";

import { ChevronRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

type WorkflowHeaderProps = {
  onRun: () => void;
  onSave: () => void;
  isRunning: boolean;
  isSaving: boolean;
  triggerLabel: string;
  triggerSubtitle?: string;
  triggerNeedsSetup: boolean;
  onOpenTrigger: () => void;
  paletteOpen: boolean;
  onTogglePalette: () => void;
};

export function WorkflowHeader({
  onRun,
  onSave,
  isRunning,
  isSaving,
  triggerLabel,
  triggerSubtitle,
  triggerNeedsSetup,
  onOpenTrigger,
  paletteOpen,
  onTogglePalette,
}: WorkflowHeaderProps) {
  return (
    <div className="glass-surface flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-[260px] flex-1 flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onOpenTrigger}
          className="flex min-w-[240px] flex-1 items-center justify-between gap-3 rounded-full border border-white/40 bg-white/70 px-4 py-2 text-left text-sm font-semibold text-foreground shadow-inner transition hover:bg-white/80"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="flex flex-col">
              <span>{triggerLabel}</span>
              {triggerSubtitle ? (
                <span className="text-[11px] font-medium text-muted-foreground">
                  {triggerSubtitle}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {triggerNeedsSetup ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Da configurare
              </span>
            ) : null}
            <ChevronRight className="h-4 w-4" />
          </div>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={onRun}
          disabled={isRunning}
        >
          {isRunning ? "Running..." : "Run"}
        </Button>
        <Button
          type="button"
          size="sm"
          className="rounded-full"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="rounded-full"
          onClick={onTogglePalette}
        >
          {paletteOpen ? "Nascondi blocchi" : "Blocchi"}
        </Button>
      </div>
    </div>
  );
}
