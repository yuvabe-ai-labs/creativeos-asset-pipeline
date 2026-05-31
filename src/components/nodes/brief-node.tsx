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
        "w-64 rounded-xl border border-border bg-card shadow-card",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <FileText className="size-4 text-primary" />
        <span className="text-eyebrow">Brief</span>
      </div>
      <div className="px-3 py-3">
        <input
          className="nodrag w-full bg-transparent font-display text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/60"
          value={title}
          onChange={(e) => updateNodeData(id, { title: e.target.value })}
          placeholder="Untitled brief"
        />
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!size-2.5 !border-2 !border-card !bg-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2.5 !border-2 !border-card !bg-primary"
      />
    </div>
  );
}
