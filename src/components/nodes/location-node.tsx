"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useNodeMediaSize } from "@/hooks/use-node-media-size";
import { nodeMediaBox } from "@/lib/canvas/media-fit";
import { useDeleteNode } from "@/hooks/use-delete-node";
import type { LocationNodeData } from "@/lib/scripts/asset-nodes";
import { NodeCardHeader } from "./node-card-header";
import { NodeContextMenu } from "./node-context-menu";
import { NodeMedia } from "./node-media";
import { useNodeConnectionState } from "./use-node-connection-state";

type Measured = { mediaWidth?: number; mediaHeight?: number };

/** D450 — one of a script's locations on the canvas: its plate, as the script had it when it was
 *  added. Wired by Fan out into every clip set there, so a shared set is one node with a line into
 *  each. A source only. */
export function LocationNode({ id, data, selected }: NodeProps) {
  const d = data as LocationNodeData & Measured;
  const media = useNodeMediaSize(id, { width: d.mediaWidth, height: d.mediaHeight }, 16 / 9);
  const box = d.image ? nodeMediaBox(media.ratio, "input") : null;
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const connState = useNodeConnectionState(id, "location");

  return (
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
      <div
        style={box ? { width: box.cardWidth } : undefined}
        className={cn(
          !box && "w-52",
          "group rounded-lg border border-border bg-card shadow-card",
          "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          connState === "invalid" && "pointer-events-none opacity-60",
        )}
      >
        <NodeCardHeader icon={MapPin} nodeId={id} nodeType="location" title={d.name ?? ""} placeholder="Location" />
        {d.image && box && <NodeMedia kind="image" src={d.image.url} alt="" box={box} onMeasured={media.onMeasured} edge />}
        <div className="px-3 py-2.5">
          <p className="line-clamp-2 text-xs text-muted-foreground" title={d.description}>
            {d.image ? d.description || "Location" : "No picture yet: add one in the script"}
          </p>
        </div>
        <Handle type="source" position={Position.Right} className="!size-4 !border-2 !border-card !bg-primary" />
      </div>
    </NodeContextMenu>
  );
}
