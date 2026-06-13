"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { NodeContextMenu } from "./node-context-menu";

// Text (Note) node — free-text context that feeds downstream Prompt nodes. No AI,
// no version log: its content IS its output, read straight from node.data (D19).
export function TextNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const d = data as { text?: string };

  return (
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
    <div
      className={cn(
        "w-56 rounded-lg border border-border bg-card shadow-card",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <StickyNote className="size-3.5 text-primary" />
        <span className="text-eyebrow !text-[0.65rem]">Note</span>
      </div>
      <div className="p-2">
        <textarea
          value={d.text ?? ""}
          onChange={(e) => updateNodeData(id, { text: e.target.value })}
          placeholder="Type notes or context…"
          rows={4}
          className="nodrag w-full resize-none rounded-md bg-transparent px-1.5 py-1 text-sm focus:outline-none"
        />
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-2 !border-card !bg-primary"
      />
    </div>
    </NodeContextMenu>
  );
}
