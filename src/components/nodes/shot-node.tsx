"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import type { ReelScript } from "@/lib/nodes/reel-script";

// Shot node — one shot of a reel, forked from a parsed Script (D21). It carries the
// FULL parent script narrowed to a single shot ("a Script node with one shot"), so
// downstream prompts keep the objective/tone/on-screen/voiceover, not just the shot
// line. Its content IS its output (edit-at-source, D19/D20): no AI, no version log.
export function ShotNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const d = data as {
    script?: ReelScript;
    order?: number;
    seededFrom?: { scriptTitle?: string };
  };
  const shot = d.script?.visual_script?.shots?.[0];
  const description = shot?.description ?? "";

  // Edit-at-source: the editable field is this shot's description, written back into
  // the carried script (the rest of the metadata travels along untouched).
  function setDescription(value: string) {
    const base = d.script ?? {};
    const vs = base.visual_script ?? {};
    const first = vs.shots?.[0] ?? {};
    updateNodeData(id, {
      script: { ...base, visual_script: { ...vs, shots: [{ ...first, description: value }] } },
    });
  }

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
        {shot?.duration && (
          <span className="text-[0.6rem] text-muted-foreground">{shot.duration}</span>
        )}
      </div>
      <div className="p-2">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Shot description…"
          rows={4}
          className="nodrag w-full resize-none rounded-md bg-transparent px-1.5 py-1 text-sm focus:outline-none"
        />
        <p className="px-1.5 pt-1 text-[0.6rem] text-muted-foreground">
          {d.seededFrom?.scriptTitle ? `from “${d.seededFrom.scriptTitle}” · ` : ""}full script context
        </p>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2 !border-2 !border-card !bg-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-2 !border-card !bg-primary"
      />
    </div>
  );
}
