"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clapperboard, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { useGalleryDrawer } from "@/components/canvas/gallery-drawer-context";
import { useGalleryNodeDrop } from "@/hooks/use-gallery-node-drop";
import { NodeContextMenu } from "./node-context-menu";
import { NodeHandle } from "./node-handle";
import { ShotComposeSheet } from "./shot-compose-sheet";
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
import type { ReelScript } from "@/lib/nodes/reel-script";

// Shot node — one shot of a reel, forked from a parsed Script (D21). It carries the
// FULL parent script narrowed to a single shot ("a Script node with one shot"), so
// downstream prompts keep the objective/tone/on-screen/voiceover, not just the shot
// line. Its content IS its output (edit-at-source, D19/D20): no AI, no version log.
export function ShotNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const gallery = useGalleryDrawer();
  const drop = useGalleryNodeDrop(id, {
    x: positionAbsoluteX ?? 0,
    y: positionAbsoluteY ?? 0,
  });
  const [composeOpen, setComposeOpen] = useState(false);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const d = data as {
    script?: ReelScript;
    order?: number;
    shot_type?: string;
    seededFrom?: { scriptTitle?: string };
  };
  const shot = d.script?.visual_script?.shots?.[0];
  const description = shot?.description ?? "";

  function setDescription(value: string) {
    const base = d.script ?? {};
    const vs = base.visual_script ?? {};
    const first = vs.shots?.[0] ?? {};
    updateNodeData(id, {
      script: { ...base, visual_script: { ...vs, shots: [{ ...first, description: value }] } },
    });
  }

  // Open the Composer when opened locally (double-click / Compose) OR when something points
  // `focusedNodeId` here — the tray, guided-flow, or the copilot's open_node. Mirrors the
  // focus-view pattern the other node types use.
  const composeViewOpen = composeOpen || focusedNodeId === id;
  const handleComposeOpenChange = (next: boolean) => {
    setComposeOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null); // consume the signal
  };
  useFocusViewRegistration(id, composeViewOpen);

  return (
    <>
    <NodeContextMenu
      onDuplicate={() => duplicateNode(id)}
      onDelete={() => deleteNode(id)}
      onAddReferenceImage={() =>
        gallery.openDrawer({
          position: { x: positionAbsoluteX ?? 0, y: positionAbsoluteY ?? 0 },
          connectToNodeId: id,
        })
      }
    >
      <div
        onDoubleClick={(e) => {
          e.stopPropagation();
          setComposeOpen(true);
        }}
        onDragOver={drop.onDragOver}
        onDrop={drop.onDrop}
        className={cn(
          "w-56 rounded-lg border border-border bg-card shadow-card",
          "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Clapperboard className="size-3.5 text-primary" />
            <span className="text-eyebrow text-[0.65rem]!">Shot{d.order ? ` ${d.order}` : ""}</span>
            <NodeHandle nodeId={id} nodeType="shot" />
          </div>
          {shot?.duration && (
            <span className="text-[0.6rem] text-muted-foreground">{shot.duration}</span>
          )}
        </div>
        <div className="p-2">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onDoubleClick={(e) => e.stopPropagation()}
            placeholder="Shot description…"
            rows={4}
            className="nodrag w-full resize-none rounded-md bg-transparent px-1.5 py-1 text-sm focus:outline-none"
          />
          <p className="px-1.5 pt-1 text-[0.6rem] text-muted-foreground">
            {d.seededFrom?.scriptTitle ? `from "${d.seededFrom.scriptTitle}" · ` : ""}full script context
          </p>

          <div className="mt-1 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="nodrag flex items-center gap-1 rounded-md border border-dashed border-primary/40 px-2 py-1 text-[0.65rem] text-primary transition-colors hover:bg-primary/5"
            >
              <Sparkles className="size-3" strokeWidth={1.5} /> Compose
            </button>
            <GuidedNextButton sourceId={id} variant="chip" />
          </div>
        </div>
        {/* lineage target (dashed Script->Shot edge) */}
        <Handle
          type="target"
          position={Position.Left}
          className="size-4! border-2! border-card! bg-muted-foreground!"
        />
        {/* image-grounding target (D28) — a File/Draw/Image-Gen image for the composer */}
        <Handle
          id="image"
          type="target"
          position={Position.Bottom}
          className="size-4! border-2! border-card! bg-muted-foreground!"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="size-4! border-2! border-card! bg-primary!"
        />
      </div>
    </NodeContextMenu>

    {/* Outside NodeContextMenu: the portaled sheet still sits in the node's React tree,
        so as a child its contextmenu/dblclick/drop events bubbled into the node card. */}
    <ShotComposeSheet nodeId={id} open={composeViewOpen} onOpenChange={handleComposeOpenChange} />
    </>
  );
}
