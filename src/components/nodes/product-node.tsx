"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useNodeMediaSize } from "@/hooks/use-node-media-size";
import { nodeMediaBox } from "@/lib/canvas/media-fit";
import { useDeleteNode } from "@/hooks/use-delete-node";
import type { ProductNodeData } from "@/lib/scripts/asset-nodes";
import { NodeCardHeader } from "./node-card-header";
import { NodeContextMenu } from "./node-context-menu";
import { NodeMedia } from "./node-media";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { useNodeConnectionState } from "./use-node-connection-state";

type Measured = { mediaWidth?: number; mediaHeight?: number };

/** D450 — one of a script's products on the canvas: its main picture and how many angles it has,
 *  as the script had them when it was added. Wired by Fan out into every clip that shows it; each
 *  of those clips' prompt and video read all its pictures. A source only. */
export function ProductNode({ id, data, selected }: NodeProps) {
  const d = data as ProductNodeData & Measured;
  const main = d.images?.[0];
  const media = useNodeMediaSize(id, { width: d.mediaWidth, height: d.mediaHeight }, 1);
  const box = main ? nodeMediaBox(media.ratio, "input") : null;
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const connState = useNodeConnectionState(id, "product");
  const angles = (d.images?.length ?? 0) - 1;
  // Double-click: every picture of the product, full screen, its angles a step apart.
  const [zoomed, setZoomed] = useState<number | null>(null);
  const images = d.images ?? [];
  const count = images.length;

  return (
    <>
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
      <div
        onDoubleClick={(e) => {
          if (!main) return;
          e.stopPropagation();
          setZoomed(0);
        }}
        style={box ? { width: box.cardWidth } : undefined}
        className={cn(
          !box && "w-44",
          "group rounded-lg border border-border bg-card shadow-card",
          "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          connState === "invalid" && "pointer-events-none opacity-60",
        )}
      >
        <NodeCardHeader icon={Package} nodeId={id} nodeType="product" title={d.name ?? ""} placeholder="Product" />
        {main && box && <NodeMedia kind="image" src={main.url} alt="" box={box} onMeasured={media.onMeasured} edge />}
        <div className="px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            {!main ? "No picture yet: add one in the script" : angles > 0 ? `Product · ${angles + 1} pictures` : "Product"}
          </p>
        </div>
        <Handle type="source" position={Position.Right} className="!size-4 !border-2 !border-card !bg-primary" />
      </div>
    </NodeContextMenu>
    {zoomed !== null && images[zoomed] && (
      <FullScreenImageZoom
        imageUrl={images[zoomed].url}
        title={count > 1 ? `${d.name ?? "Product"} · ${zoomed + 1} of ${count}` : d.name}
        onClose={() => setZoomed(null)}
        onPrev={zoomed > 0 ? () => setZoomed(zoomed - 1) : undefined}
        onNext={zoomed < count - 1 ? () => setZoomed(zoomed + 1) : undefined}
      />
    )}
    </>
  );
}
