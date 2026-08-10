"use client";

import { useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import type { PostNodeData } from "@/lib/canvas-nodes";
import { renderState, RENDER_STATE_LABELS } from "@/lib/post/render-state";
import { POST_FORMATS, resolveFormat } from "@/lib/post/formats";
import { Button } from "@/components/ui/button";
import { PostFocusView } from "./post-focus-view";
import { PostLayersPreview } from "./post-layers-preview";
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

  // Re-key on the resolved ids+urls, not on the whole nodes/edges arrays: otherwise moving
  // ANY node on the board hands post-focus-view a new array identity and re-runs its
  // auto-place effect.
  const connectedSignature = connectedImageNodes.map((c) => `${c.nodeId}:${c.url}`).join("|");
  const stableConnectedImageNodes = useMemo(
    () => connectedImageNodes,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connectedSignature],
  );

  const format = resolveFormat(d.format);
  const spec = POST_FORMATS[format];
  const state = renderState({
    fileUrl: d.fileUrl,
    renderedAt: d.renderedAt,
    layersUpdatedAt: d.layersUpdatedAt,
  });
  const layerCount = d.layers?.length ?? 0;

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
                state === "exported" && "bg-primary/10 text-primary",
                state === "stale" && "bg-amber-100 text-amber-700",
                state === "draft" && "bg-muted text-muted-foreground",
              )}
            >
              {RENDER_STATE_LABELS[state]}
            </span>
          }
        />

        <div
          className="flex items-center justify-center overflow-hidden border-b border-border bg-muted/20"
          style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
        >
          {/* The exported PNG is the truest preview — real fonts, real photo — but only while
              it still matches the design. Once edited past it (or before the first Download),
              fall back to rendering the layers live, which is always current. Previously the
              card stayed blank until you exported, so a post you'd spent real time on looked
              untouched; and after an edit it kept showing a composition you'd moved on from. */}
          {d.fileUrl && state === "exported" ? (
            // object-contain, not cover: the card must show the composition that was made,
            // not a centre-crop of it (D126).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={d.fileUrl}
              alt={d.title ?? "post"}
              className="size-full object-contain"
            />
          ) : d.thumbnail ? (
            // Captured from the real Konva stage when the editor last closed (D136), so this
            // is the design exactly as it was drawn — not the DOM preview's approximation of
            // it, which renders every shape primitive as a rectangle and ignores rotation.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={d.thumbnail}
              alt={d.title ?? "post"}
              className="size-full object-contain"
            />
          ) : layerCount > 0 ? (
            <div className="size-full">
              <PostLayersPreview
                layers={d.layers ?? []}
                format={format}
                resolveNodeImageUrl={(nodeId) =>
                  connectedImageNodes.find((c) => c.nodeId === nodeId)?.url
                }
              />
            </div>
          ) : (
            <LayoutTemplate className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
          )}
        </div>

        <div className="space-y-1 px-3 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFocusOpen(true)}
            className="nodrag -mx-1.5 h-auto gap-1 px-1.5 py-1 text-xs font-medium text-primary"
          >
            Open ↗
          </Button>
          <p className="text-[0.6rem] text-muted-foreground">
            {layerCount === 0
              ? "Empty — open to start"
              : `${spec.shortLabel} · ${layerCount} layer${layerCount === 1 ? "" : "s"}`}
          </p>
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
      autoPlacedNodeIds={d.autoPlacedNodeIds}
      connectedImageNodes={stableConnectedImageNodes}
      onPatch={(patch) => {
        // Stamp the edit time here rather than at each call site: every path that changes the
        // design — editor edits, template application, undo, redo — funnels through this one
        // onPatch, so one rule covers them all and none can forget. Patches that carry no
        // layers (a title rename, the auto-place bookkeeping) are not design edits and must
        // not mark the render stale.
        const stamped = "layers" in patch
          ? { ...patch, layersUpdatedAt: new Date().toISOString() }
          : patch;
        updateNodeData(id, stamped);
      }}
    />
    </>
  );
}
