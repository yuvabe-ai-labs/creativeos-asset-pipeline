"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import type { DrawNodeData } from "@/lib/canvas-nodes";
import { DrawFocusView } from "./draw-focus-view";
import { useNodeConnectionState } from "./use-node-connection-state";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";

export function DrawNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const d = data as DrawNodeData;
  const [focusOpen, setFocusOpen] = useState(false);
  const connState = useNodeConnectionState(id, "draw");

  const hasSketch = !!d.fileUrl;

  // Open locally (double-click / "Open ↗") OR when a shared signal points here — the
  // Generation Tray, guided flow, or the copilot's open_node (setFocusedNodeId).
  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null); // consume the signal
  };
  useFocusViewRegistration(id, focusViewOpen);

  return (
    <>
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
        <NodeCardHeader
          icon={Pencil}
          nodeId={id}
          nodeType="draw"
          title={d.title ?? ""}
          placeholder="Untitled sketch"
          onCommitTitle={(t) => updateNodeData(id, { title: t })}
          status={
            <span
              className={cn(
                "size-1.5 rounded-full",
                hasSketch ? "bg-primary" : "bg-muted-foreground/40",
              )}
              title={hasSketch ? "Sketch saved" : "Empty"}
            />
          }
        />

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
          <Button
            variant="ghost"
            onClick={() => setFocusOpen(true)}
            className="nodrag -mx-1.5 h-auto gap-1 rounded-md border-0 px-1.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 hover:text-primary"
          >
            Open ↗
          </Button>
        </div>

        <Handle
          type="source"
          position={Position.Right}
          className="size-4! border-2! border-card! bg-primary!"
        />
      </div>
    </NodeContextMenu>

    {/* Outside NodeContextMenu: the portaled sheet still sits in the node's React tree,
        so as a child its contextmenu/dblclick/drop events bubbled into the node card. */}
    <DrawFocusView
      open={focusViewOpen}
      onOpenChange={handleFocusOpenChange}
      nodeId={id}
      title={d.title ?? ""}
      instructions={d.instructions}
      existingImageUrl={d.fileUrl}
      onPatch={(patch) => updateNodeData(id, patch)}
    />
    </>
  );
}
