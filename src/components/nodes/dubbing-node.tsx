"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { useNodeCost } from "@/hooks/use-node-cost";
import { useGenerationStatus } from "@/hooks/use-generation-status";
import { dubLanguageLabel, furthestStage, readDubbingOutput, stageUrl, type DubbingOutput } from "@/lib/dubbing/types";
import type { DubbingNodeData } from "@/lib/canvas-nodes";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import { NodeCreditsFooter } from "./node-credits-footer";
import { DubbingFocusView } from "./dubbing-focus-view";

function stateWord(dub: DubbingOutput | null, running: string | null): string {
  if (running === "dub") return "Dubbing…";
  if (running === "lipsync") return "Lip-syncing…";
  if (!dub) return "Not dubbed";
  return dub.lipSynced ? "Lip-synced" : "Dubbed";
}

// D374 — the Dubbing card: the furthest stage of the active dub, its language and state.
// No query or channel of its own (performance rule 1): status comes from the canvas feed, and the
// versions and usage load only once the focus view is open.
export function DubbingNode({ id, data, selected }: NodeProps) {
  const d = data as DubbingNodeData;
  const dub = readDubbingOutput(d.parsed);
  const url = dub ? stageUrl(dub, furthestStage(dub)) : null;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const deleteNode = useDeleteNode();
  const totalCredits = useNodeCost(id);
  const status = useGenerationStatus(id);
  const [focusOpen, setFocusOpen] = useState(false);

  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null);
  };
  useFocusViewRegistration(id, focusViewOpen);

  return (
    <>
      <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
        <div
          onDoubleClick={(e) => { e.stopPropagation(); setFocusOpen(true); }}
          className={cn(
            "w-[320px] rounded-lg border border-border bg-card shadow-card",
            "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
            selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          )}
        >
          <NodeCardHeader icon={Languages} nodeId={id} nodeType="dubbing" title={d.title ?? ""} placeholder="Dubbing" onCommitTitle={(t) => updateNodeData(id, { title: t })} />
          <div className="flex flex-col gap-2 px-3 py-3">
            {url && (
              <div className="overflow-hidden rounded-md border border-border bg-black">
                <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="aspect-video w-full object-contain" />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {dub ? `${dubLanguageLabel(dub.language)} · ` : ""}{stateWord(dub, status.runningKind)}
              </span>
              <Button variant="ghost" onClick={() => setFocusOpen(true)} className="nodrag -mx-1.5 h-auto gap-1 rounded-md border-0 px-1.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 hover:text-primary">
                Open ↗
              </Button>
            </div>
          </div>
          <NodeCreditsFooter totalCredits={totalCredits} hasOutput={Boolean(dub)} />
          <Handle type="target" position={Position.Left} className="!size-4 !border-2 !border-card !bg-muted-foreground" />
        </div>
      </NodeContextMenu>

      {/* Outside NodeContextMenu: the sheet is portaled, but a portal keeps its place in the React
          tree, so as a child of the trigger its events would bubble into the card. */}
      <DubbingFocusView
        open={focusViewOpen}
        onOpenChange={handleFocusOpenChange}
        nodeId={id}
        title={d.title ?? ""}
        language={d.language}
        onPatch={(patch) => updateNodeData(id, patch)}
      />
    </>
  );
}
