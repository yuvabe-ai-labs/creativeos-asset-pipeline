"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";

// Placeholder Brief node (1C). The real upload/parse UI arrives in 1E.
// Note it pulls `updateNodeData` directly from the store — React Flow only
// passes a custom node `{ id, data }`, so the store is how the node writes back.
export function BriefNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const title = (data as { title?: string }).title ?? "";

  return (
    <div
      className={cn(
        "w-32 rounded-lg border border-border bg-card shadow-card",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <FileText className="size-3 text-primary" />
        <span className="text-eyebrow !text-[0.6rem]">Brief</span>
      </div>
      <div className="px-2 py-2">
        <input
          className="nodrag w-full bg-transparent font-display text-xs font-medium text-foreground outline-none placeholder:text-muted-foreground/60"
          value={title}
          onChange={(e) => updateNodeData(id, { title: e.target.value })}
          placeholder="Untitled"
        />
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!size-2 !border-2 !border-card !bg-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-2 !border-card !bg-primary"
      />
    </div>
  );
}
