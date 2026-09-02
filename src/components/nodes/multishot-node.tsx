"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Layers, Plus, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import { MultishotCutStrip } from "./multishot-cut-strip";
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
import { addCut, totalOf, type MultishotCut } from "@/lib/nodes/multishot-cuts";
import { OMNI_MAX_SECONDS, OMNI_MIN_SECONDS } from "@/lib/nodes/group-shots";
import type { MultishotNodeData } from "@/lib/canvas-nodes";

/** Where Kling caps its own Custom Multi-Shot. A quality signal, not a hard limit. */
const SOFT_CUT_LIMIT = 6;

/**
 * D209 — a Multishot node is a fixed budget of seconds divided into cuts.
 *
 * Deliberately bare: no multishot toggle (that lives in the Script now), no beat switcher, and
 * no Composer. The Shot node's four conditional controls on a 224px card are exactly what
 * splitting the node type was meant to end.
 */
export function MultishotNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const d = data as MultishotNodeData;

  const cuts = d.cuts ?? [];
  const budget = d.totalSeconds ?? totalOf(cuts);
  const outOfWindow = budget < OMNI_MIN_SECONDS || budget > OMNI_MAX_SECONDS;

  const setCuts = (next: MultishotCut[]) => updateNodeData(id, { cuts: next });

  return (
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
      <div
        className={cn(
          "w-80 rounded-lg border border-border bg-card shadow-card",
          "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        <NodeCardHeader
          icon={Layers}
          nodeId={id}
          nodeType="multishot"
          title={`Multishot${d.order ? ` ${d.order}` : ""}`}
          status={
            <span
              className={cn(
                "text-[0.6rem] tabular-nums",
                outOfWindow ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {budget}s · {cuts.length} cuts
            </span>
          }
        />
        <div className="p-2">
          <MultishotCutStrip cuts={cuts} onChange={setCuts} />

          {cuts.length > SOFT_CUT_LIMIT && (
            <p className="mt-1.5 flex items-center gap-1 px-1.5 text-[0.6rem] text-muted-foreground">
              <TriangleAlert className="size-3 shrink-0" strokeWidth={1.5} />
              {cuts.length} cuts in {budget}s — past about {SOFT_CUT_LIMIT} the cuts stop reading.
            </p>
          )}

          <p className="px-1.5 pt-1.5 text-[0.6rem] text-muted-foreground">
            {d.seededFrom?.scriptTitle ? `from "${d.seededFrom.scriptTitle}" · ` : ""}full script
            context
          </p>

          <div className="mt-1.5 flex items-center gap-1.5">
            <Button
              variant="ghost"
              onClick={() => setCuts(addCut(cuts))}
              className="nodrag h-auto gap-1 rounded-md border border-dashed border-primary/40 px-2 py-1 text-[0.65rem] text-primary hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5"
            >
              <Plus className="size-3" strokeWidth={1.5} /> Add cut
            </Button>
            <GuidedNextButton sourceId={id} variant="chip" />
          </div>
        </div>

        {/* Lineage target (dashed Script->Multishot edge). No image handle: there is no
            Composer to ground, and references reach the sequence at the prompt node. */}
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
  );
}
