"use client";

import { useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { NodeContextMenu } from "./node-context-menu";
import type { ImageGenNodeData } from "@/lib/canvas-nodes";
import { ImageGenFocusView } from "./image-gen-focus-view";

export function ImageGenNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode    = useCanvasStore((s) => s.deleteNode);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);

  // Select raw store slices (stable references) and derive the upstream list
  // with useMemo. Returning a freshly-built array of objects straight from the
  // selector breaks useSyncExternalStore caching → infinite-loop error.
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  const upstream = useMemo(() => {
    const sourceIds = edges.filter((e) => e.target === id).map((e) => e.source);
    return nodes.filter((n) => sourceIds.includes(n.id)).map((n) => {
      const d = n.data as Record<string, unknown>;
      return {
        id: n.id,
        type: n.type ?? "",
        fileUrl:
          n.type === "file" || n.type === "draw"
            ? (d.fileUrl as string | undefined)
            : n.type === "image-gen"
              ? (d.parsed as string | undefined)
              : undefined,
        fileKind: n.type === "file" ? (d.fileKind as string | undefined) : undefined,
      };
    });
  }, [nodes, edges, id]);

  const d = data as ImageGenNodeData;
  const title    = d.title ?? "";
  const imageUrl = (d.parsed ?? null) as string | null;
  const [focusOpen, setFocusOpen] = useState(false);

  return (
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
      <div
        onDoubleClick={(e) => { e.stopPropagation(); setFocusOpen(true); }}
        className={cn(
          "w-44 rounded-lg border border-border bg-card shadow-card",
          "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-1.5">
            <ImageIcon className="size-3.5 stroke-[1.5] text-primary" />
            <span className="text-eyebrow !text-[0.65rem]">Image Gen</span>
          </div>
          <span
            className={cn(
              "size-1.5 rounded-full",
              imageUrl ? "bg-primary" : "bg-muted-foreground/40",
            )}
            title={imageUrl ? "Image generated" : "Not generated"}
          />
        </div>

        {/* Body */}
        <div className="px-3 py-3">
          {imageUrl && (
            <div className="mb-2 overflow-hidden rounded-md border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Generated" className="h-16 w-full object-cover" />
            </div>
          )}
          <button
            onClick={() => setFocusOpen(true)}
            className="nodrag -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Open ↗
          </button>
        </div>

        <ImageGenFocusView
          open={focusOpen}
          onOpenChange={setFocusOpen}
          nodeId={id}
          title={title}
          imageUrl={imageUrl}
          modelId={d.modelId}
          params={d.params}
          editInstruction={d.editInstruction}
          editIntent={d.editIntent}
          upstream={upstream}
          onPatch={(patch) => updateNodeData(id, patch)}
        />

        <Handle
          type="target"
          position={Position.Left}
          className="!size-4 !border-2 !border-card !bg-muted-foreground"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!size-4 !border-2 !border-card !bg-primary"
        />
      </div>
    </NodeContextMenu>
  );
}
