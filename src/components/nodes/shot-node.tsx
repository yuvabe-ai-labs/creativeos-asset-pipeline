"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";

// Shot node — one shot of a reel, forked from a parsed Script (D21). Its description
// IS its output (edit-at-source, D19/D20): no AI, no version log. Feeds a Prompt.
export function ShotNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const d = data as {
    description?: string;
    duration?: string;
    order?: number;
    seededFrom?: { scriptTitle?: string };
  };

  return (
    <div
      className={cn(
        "w-56 rounded-lg border border-border bg-card shadow-card",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Clapperboard className="size-3.5 text-primary" />
          <span className="text-eyebrow !text-[0.65rem]">Shot{d.order ? ` ${d.order}` : ""}</span>
        </div>
        {d.duration && (
          <span className="text-[0.6rem] text-muted-foreground">{d.duration}</span>
        )}
      </div>
      <div className="p-2">
        <textarea
          value={d.description ?? ""}
          onChange={(e) => updateNodeData(id, { description: e.target.value })}
          placeholder="Shot description…"
          rows={4}
          className="nodrag w-full resize-none rounded-md bg-transparent px-1.5 py-1 text-sm focus:outline-none"
        />
        {d.seededFrom?.scriptTitle && (
          <p className="px-1.5 pt-1 text-[0.6rem] text-muted-foreground">
            from “{d.seededFrom.scriptTitle}”
          </p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-2 !border-card !bg-primary"
      />
    </div>
  );
}
