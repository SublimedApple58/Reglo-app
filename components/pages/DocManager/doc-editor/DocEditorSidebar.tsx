"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolId, ToolItem } from "../doc-manager.types";

type DocEditorSidebarProps = {
  tools: ToolItem[];
  selectedTool: ToolId | null;
  onSelectTool: (toolId: ToolId | null) => void;
  onDragTool: (event: React.DragEvent<HTMLButtonElement>, toolId: ToolId) => void;
  onOpenAi?: () => void;
  aiDisabled?: boolean;
  aiRunning?: boolean;
};

export function DocEditorSidebar({
  tools,
  selectedTool,
  onSelectTool,
  onDragTool,
  onOpenAi,
  aiDisabled,
  aiRunning,
}: DocEditorSidebarProps): React.ReactElement {
  const textTools = tools.filter((tool) => tool.id === "text");
  const fieldTools = tools.filter((tool) => tool.id !== "text");

  const renderTools = (items: ToolItem[]) =>
    items.map((tool) => {
      const Icon = tool.icon;
      const isSelected = selectedTool === tool.id;
      return (
        <button
          key={tool.id}
          type="button"
          draggable
          onDragStart={(event) => onDragTool(event, tool.id)}
          onClick={() => onSelectTool(isSelected ? null : tool.id)}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-2 text-left font-medium transition",
            isSelected
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border bg-background text-foreground hover:bg-muted/50",
          )}
        >
          <Icon className="h-4 w-4 text-muted-foreground" />
          {tool.label}
        </button>
      );
    });

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm">
      <Link
        href="/user/doc_manager"
        className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        BACK
      </Link>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Tools</h2>
      </div>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Fields
          </p>
          {renderTools(fieldTools)}
        </div>
        <div className="h-px bg-border/70 my-4" />
        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Text block
          </p>
          {renderTools(textTools)}
        </div>
        {onOpenAi ? (
          <button
            type="button"
            onClick={onOpenAi}
            disabled={aiDisabled || aiRunning}
            className={cn(
              "mt-2 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition",
              aiDisabled || aiRunning
                ? "border-border/60 bg-muted text-muted-foreground"
                : "border-primary/20 bg-primary/5 text-foreground hover:border-primary/30 hover:bg-primary/10",
            )}
          >
            <Sparkles className="h-4 w-4 text-primary/80" />
            {aiRunning ? "AI in corso..." : "Configura con AI"}
          </button>
        ) : null}
      </div>
      <div className="mt-auto" />
    </aside>
  );
}
