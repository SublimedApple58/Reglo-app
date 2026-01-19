"use client";

import type { Dispatch, SetStateAction } from "react";

import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type WorkflowHeaderProps = {
  workflowName: string;
  onWorkflowNameChange: Dispatch<SetStateAction<string>>;
  workflowStatus: string;
  onWorkflowStatusChange: Dispatch<SetStateAction<string>>;
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
  workflowName,
  onWorkflowNameChange,
  workflowStatus,
  onWorkflowStatusChange,
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
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm">
      <div className="min-w-[240px] space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Workflow name
        </p>
        <Input
          value={workflowName}
          onChange={(event) => onWorkflowNameChange(event.target.value)}
          placeholder="Nome workflow"
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={onOpenTrigger}
          className="flex min-w-[220px] items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3 py-2 text-left shadow-sm transition hover:bg-accent"
        >
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Trigger
            </p>
            <p className="text-sm font-semibold text-foreground">{triggerLabel}</p>
            {triggerSubtitle ? (
              <p className="text-xs text-muted-foreground">{triggerSubtitle}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {triggerNeedsSetup ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Da configurare
              </span>
            ) : null}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Status
          </p>
          <Select value={workflowStatus} onValueChange={onWorkflowStatusChange}>
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
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={onRun} disabled={isRunning}>
            {isRunning ? "Running..." : "Run now"}
          </Button>
          <Button type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save workflow"}
          </Button>
          <Button type="button" variant="outline" onClick={onTogglePalette}>
            {paletteOpen ? "Nascondi blocchi" : "Aggiungi blocchi"}
          </Button>
        </div>
      </div>
    </div>
  );
}
