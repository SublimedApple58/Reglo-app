import { GitMerge } from "lucide-react";
import { Handle, Position, type NodeProps } from "reactflow";

import { cn } from "@/lib/utils";
import type { LogicNodeData } from "@/components/pages/Workflows/Editor/types";

export function LogicMergeNode({ data, selected }: NodeProps<LogicNodeData>) {
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
