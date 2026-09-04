"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Layers, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import { MultishotFocusView } from "./multishot-focus-view";
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
import { clampTotal, totalOf, type MultishotCut } from "@/lib/nodes/multishot-cuts";
import { OMNI_MIN_SECONDS, OMNI_MAX_SECONDS } from "@/lib/nodes/group-shots";
import type { MultishotNodeData } from "@/lib/canvas-nodes";

/** Where Kling caps its own Custom Multi-Shot. A quality signal, not a hard limit. */
const SOFT_CUT_LIMIT = 6;

/**
 * D230 — a Multishot node's clip length simply IS the sum of its cuts (operator request
 * 2026-09-03; see multishot-cuts.ts's header). There is no Total control, so the card just
 * shows the ladder's length and cut count — no "allocated/total" ratio, because there is
 * nothing separate left for the ladder to disagree with.
 *
 * The card is a read-only preview: the per-cut sliders and text editing all live
 * in `MultishotFocusView`, opened via "Open ↗" or a double-click — the same pattern every other
 * node's focus view uses. "Add cut" is deferred, not just hidden here: see `addCut` in
 * multishot-cuts.ts for why it is kept despite having no caller today.
 *
 * Deliberately bare otherwise: no multishot toggle (that lives in the Script now), no beat
 * switcher, and no Composer. The Shot node's four conditional controls on a 224px card are
 * exactly what splitting the node type was meant to end.
 */
export function MultishotNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const [focusOpen, setFocusOpen] = useState(false);
  const d = data as MultishotNodeData;

  const cuts = d.cuts ?? [];
  // `totalSeconds` is the stored mirror of the ladder's own length, not an independent field —
  // falls back to a fresh totalOf(cuts) only for data seeded before this field existed.
  const total = d.totalSeconds ?? totalOf(cuts);
  const outsideOmniWindow = total < OMNI_MIN_SECONDS || total > OMNI_MAX_SECONDS;

  // There is no Total control any more, so `totalSeconds` is once again just `totalOf(cuts)` —
  // every write that changes `cuts` MUST write both in the same call, or the stored mirror goes
  // stale. (There used to be a coupling ban here — dragging one cut moving a separate Total was
  // exactly what the operator objected to — but there is no separate Total left to move.)
  const setCuts = (next: MultishotCut[]) =>
    updateNodeData(id, { cuts: next, totalSeconds: clampTotal(totalOf(next)) });

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
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
      <div
        onDoubleClick={(e) => {
          e.stopPropagation();
          setFocusOpen(true);
        }}
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
                outsideOmniWindow ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {total}s · {cuts.length} cuts
            </span>
          }
        />
        <div className="p-2">
          {/* Read-only preview — numbered lines, no editing. Editing lives in the focus view. */}
          <div className="nodrag max-h-28 space-y-0.5 overflow-y-auto">
            {cuts.map((cut, i) => (
              <div key={cut.id} className="flex items-center gap-1.5 rounded px-1.5 py-0.5">
                <span className="w-3 shrink-0 text-[0.6rem] text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[0.65rem] text-foreground/80">
                  {cut.text.trim() || "Untitled cut"}
                </span>
                <span className="shrink-0 text-[0.6rem] tabular-nums text-muted-foreground">
                  {cut.seconds}s
                </span>
              </div>
            ))}
          </div>

          {cuts.length > SOFT_CUT_LIMIT && (
            <p className="mt-1.5 flex items-center gap-1 px-1.5 text-[0.6rem] text-muted-foreground">
              <TriangleAlert className="size-3 shrink-0" strokeWidth={1.5} />
              {cuts.length} cuts in {total}s — past about {SOFT_CUT_LIMIT} the cuts stop reading.
            </p>
          )}

          <p className="px-1.5 pt-1.5 text-[0.6rem] text-muted-foreground">
            {d.seededFrom?.scriptTitle ? `from "${d.seededFrom.scriptTitle}" · ` : ""}full script
            context
          </p>

          <div className="mt-1.5 flex items-center gap-1.5">
            <Button
              variant="ghost"
              onClick={() => setFocusOpen(true)}
              className="nodrag -mx-1.5 h-auto gap-1 rounded-md border-0 px-1.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 hover:text-primary"
            >
              Open ↗
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

    {/* Outside NodeContextMenu: the portaled sheet still sits in the node's React tree,
        so as a child its contextmenu/dblclick/drop events bubbled into the node card. */}
    <MultishotFocusView
      open={focusViewOpen}
      onOpenChange={handleFocusOpenChange}
      order={d.order}
      cuts={cuts}
      scriptTitle={d.seededFrom?.scriptTitle}
      onChange={setCuts}
    />
    </>
  );
}
