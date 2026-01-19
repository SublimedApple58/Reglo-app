import { GitBranch } from "lucide-react";
import { Handle, Position, type NodeProps } from "reactflow";

import { cn } from "@/lib/utils";
import type { LogicNodeData } from "@/components/pages/Workflows/Editor/types";

export function LogicIfNode({ data, selected }: NodeProps<LogicNodeData>) {
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
        <span>Se si</span>
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
