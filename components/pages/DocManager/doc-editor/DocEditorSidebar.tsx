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
            "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-medium shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
            isSelected
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-white/70 bg-white/80 text-foreground hover:bg-white",
          )}
        >
          <Icon className="h-4 w-4 text-muted-foreground" />
          {tool.label}
        </button>
      );
    });

  return (
    <aside className="glass-panel flex h-full w-64 shrink-0 flex-col gap-4 px-4 py-5">
      <Link
        href="/user/doc_manager"
        className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        BACK
      </Link>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Tools</h2>
      </div>
      <div className="flex flex-1 flex-col gap-4 text-sm text-muted-foreground">
        <div className="space-y-2">
          <p className="glass-chip w-fit">Fields</p>
          {renderTools(fieldTools)}
        </div>
        <div className="glass-divider" />
        <div className="space-y-2 pt-1">
          <p className="glass-chip w-fit">Text block</p>
          {renderTools(textTools)}
        </div>
        {onOpenAi ? (
          <button
            type="button"
            onClick={onOpenAi}
            disabled={aiDisabled || aiRunning}
          className={cn(
              "mt-auto flex w-full items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
              aiDisabled || aiRunning
                ? "border-white/60 bg-white/50 text-muted-foreground"
                : "border-white/70 bg-white/80 text-foreground hover:bg-white",
            )}
          >
            <Sparkles className="h-4 w-4 text-primary/80" />
            {aiRunning ? "AI in corso..." : "Configura con AI"}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
