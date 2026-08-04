"use client";

import { useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import type { PostNodeData } from "@/lib/canvas-nodes";
import { PostFocusView } from "./post-focus-view";
import { useNodeConnectionState } from "./use-node-connection-state";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";

export function PostNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const d = data as PostNodeData;
  const [focusOpen, setFocusOpen] = useState(false);
  const connState = useNodeConnectionState(id, "post");

  // Mirrors image-gen-node.tsx's `upstream` computation: resolve connected file/draw/
  // image-gen nodes to their current image URL, so the Post editor can auto-place and
  // reference them. Select raw store slices and derive with useMemo — returning a
  // freshly-built array straight from the selector breaks useSyncExternalStore caching.
  const connectedImageNodes = useMemo(() => {
    const sourceIds = edges.filter((e) => e.target === id).map((e) => e.source);
    return nodes
      .filter((n) => sourceIds.includes(n.id) && ["file", "draw", "image-gen"].includes(n.type ?? ""))
      .map((n) => {
        const d = n.data as Record<string, unknown>;
        return {
          nodeId: n.id,
          url:
            n.type === "file" || n.type === "draw"
              ? (d.fileUrl as string | undefined)
              : n.type === "image-gen"
                ? (d.parsed as string | undefined)
                : undefined,
        };
      })
      .filter((n): n is { nodeId: string; url: string } => Boolean(n.url)); // only nodes that actually have an image yet
  }, [nodes, edges, id]);

  const hasRender = !!d.fileUrl;
  const hasLayers = (d.layers?.length ?? 0) > 0;

  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null);
  };
  useFocusViewRegistration(id, focusViewOpen);

  return (
    <>
    <NodeContextMenu
      onDuplicate={() => duplicateNode(id)}
      onDelete={() => deleteNode(id)}
    >
      <div
        onDoubleClick={(e) => { e.stopPropagation(); setFocusOpen(true); }}
        className={cn(
          "w-56 rounded-lg border border-border bg-card shadow-card",
          "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          connState === "invalid" && "opacity-60 pointer-events-none",
        )}
      >
        <NodeCardHeader
          icon={LayoutTemplate}
          nodeId={id}
          nodeType="post"
          title={d.title ?? ""}
          placeholder="Untitled post"
          onCommitTitle={(t) => updateNodeData(id, { title: t })}
          status={
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold leading-none",
                hasRender ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700",
              )}
            >
              {hasRender ? "Rendered" : "Pending"}
            </span>
          }
        />

        {hasRender ? (
          <div className="overflow-hidden border-b border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={d.fileUrl}
              alt={d.title ?? "post"}
              className="aspect-square w-full object-cover"
            />
          </div>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center border-b border-border bg-muted/20">
            <LayoutTemplate className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
          </div>
        )}

        <div className="px-3 py-3">
          <button
            onClick={() => setFocusOpen(true)}
            className="nodrag -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Open ↗
          </button>
          {!hasLayers && (
            <span className="ml-2 text-xs text-muted-foreground">Empty — connect an image</span>
          )}
        </div>

        <Handle
          type="target"
          position={Position.Left}
          className="size-4! border-2! border-card! bg-muted-foreground!"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="size-4! border-2! border-card! bg-primary!"
        />
      </div>
    </NodeContextMenu>

    <PostFocusView
      open={focusViewOpen}
      onOpenChange={handleFocusOpenChange}
      nodeId={id}
      title={d.title ?? ""}
      format={d.format}
      templateId={d.templateId}
      layers={d.layers}
      connectedImageNodes={connectedImageNodes}
      onPatch={(patch) => updateNodeData(id, patch)}
    />
    </>
  );
}
