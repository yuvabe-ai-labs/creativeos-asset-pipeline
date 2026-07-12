"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import type { DrawNodeData } from "@/lib/canvas-nodes";
import { DrawFocusView } from "./draw-focus-view";
import { useNodeConnectionState } from "./use-node-connection-state";
import { NodeContextMenu } from "./node-context-menu";
import { NodeTitle } from "./node-title";
import { NodeHandle } from "./node-handle";

export function DrawNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const d = data as DrawNodeData;
  const [focusOpen, setFocusOpen] = useState(false);
  const connState = useNodeConnectionState(id, "draw");

  const hasSketch = !!d.fileUrl;

  return (
    <NodeContextMenu
      onDuplicate={() => duplicateNode(id)}
      onDelete={() => deleteNode(id)}
    >
      <div
        onDoubleClick={(e) => {
          e.stopPropagation();
          setFocusOpen(true);
        }}
        className={cn(
          "group w-44 rounded-lg border border-border bg-card shadow-card",
          "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          connState === "invalid" && "opacity-60 pointer-events-none",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Pencil className="size-3.5 text-primary" strokeWidth={1.5} />
            <span className="text-eyebrow text-[0.65rem]!">Draw</span>
            <NodeHandle nodeId={id} nodeType="draw" />
          </div>
          <span
            className={cn(
              "size-1.5 rounded-full",
              hasSketch ? "bg-primary" : "bg-muted-foreground/40",
            )}
            title={hasSketch ? "Sketch saved" : "Empty"}
          />
        </div>

        {hasSketch && (
          <div className="overflow-hidden border-b border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={d.fileUrl}
              alt={d.title ?? "sketch"}
              className="h-24 w-full object-cover"
            />
          </div>
        )}

        <div className="px-3 py-3">
          <NodeTitle
            value={d.title ?? ""}
            placeholder="Untitled sketch"
            onCommit={(t) => updateNodeData(id, { title: t })}
          />
          <button
            onClick={() => setFocusOpen(true)}
            className="nodrag -mx-1.5 mt-3 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Open ↗
          </button>
        </div>

        <DrawFocusView
          open={focusOpen}
          onOpenChange={setFocusOpen}
          nodeId={id}
          title={d.title ?? ""}
          instructions={d.instructions}
          existingImageUrl={d.fileUrl}
          onPatch={(patch) => updateNodeData(id, patch)}
        />

        <Handle
          type="source"
          position={Position.Right}
          className="size-4! border-2! border-card! bg-primary!"
        />
      </div>
    </NodeContextMenu>
  );
}
