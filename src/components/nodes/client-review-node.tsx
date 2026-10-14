"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type NodeProps } from "@xyflow/react";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { clientReviewKeys, useNodeClientReview } from "@/hooks/queries/client-reviews";
import type { ClientReviewNodeData } from "@/lib/canvas-nodes";
import type { NodeClientReview } from "@/lib/client-review/wire";
import { ClientReviewUpload } from "./client-review-upload";
import { NodeCardHeader } from "./node-card-header";
import { NodeContextMenu } from "./node-context-menu";
import { useClientFeedback } from "@/components/canvas/client-feedback-drawer/client-feedback-context";

// D309: terminal node (no handles) — the cut a client reviews by public link. Clicking the
// card opens the client feedback drawer (right side, non-modal) for this node; there is no
// full-screen focus view, so feedback and the canvas stay on screen together.
export function ClientReviewNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const { nodeId: feedbackNodeId, openFeedback } = useClientFeedback();
  const d = data as ClientReviewNodeData;
  const queryClient = useQueryClient();
  const { data: current, isPending: loading, isError, refetch } = useNodeClientReview(id);
  const editable = useCanvasEditable();

  // The shared "open this node" signal (generation tray, copilot open_node) opens the
  // drawer here, since this node has no focus view. Consume it so it doesn't re-fire.
  useEffect(() => {
    if (focusedNodeId !== id) return;
    openFeedback(id, { fly: true });
    setFocusedNodeId(null);
  }, [focusedNodeId, id, openFeedback, setFocusedNodeId]);

  const handleUploaded = (next: NodeClientReview) => {
    queryClient.setQueryData(clientReviewKeys.node(id), next);
    void queryClient.invalidateQueries({ queryKey: ["client-review", "canvas"] });
  };

  const count = current?.comments.length ?? 0;
  const cut = current?.review ?? null;
  const showingFeedback = feedbackNodeId === id;

  return (
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
      <div
        onClick={(e) => {
          // A click on a control inside the card (the inline title, the ref handle) is that
          // control's own action. Without this, clicking the title to rename it bubbled up
          // here and opened the drawer on top of the edit.
          if ((e.target as HTMLElement).closest("button, input, textarea, a")) return;
          openFeedback(id);
        }}
        className={cn(
          // D310: the client accent — amber border + a pale amber header band — so client-facing
          // work reads apart from generation nodes. Selection keeps the purple ring (brand focus).
          "group w-56 cursor-pointer overflow-hidden rounded-lg border border-client/70 bg-card shadow-card",
          "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          showingFeedback && !selected && "ring-2 ring-client/60",
        )}
      >
        <div className="border-b border-client/40 bg-client/15 [&_svg]:text-client-text">
        <NodeCardHeader
          icon={MessageSquareText}
          nodeId={id}
          nodeType="client-review"
          title={d.title ?? ""}
          placeholder="Untitled cut"
          onCommitTitle={(t) => updateNodeData(id, { title: t })}
        />
        </div>
        {cut && (
          <div className="overflow-hidden border-b border-border bg-black">
            <video
              src={`${cut.videoUrl}#t=0.1`}
              preload="metadata"
              muted
              playsInline
              className="h-32 w-full object-contain"
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          {cut ? (
            <>
              <span className="text-xs text-muted-foreground">
                {count} {count === 1 ? "comment" : "comments"}
              </span>
              <span className="text-xs font-medium text-client-text">Feedback →</span>
            </>
          ) : loading ? (
            <span className="text-xs text-muted-foreground">Loading…</span>
          ) : isError && !current ? (
            <>
              <span className="text-xs text-muted-foreground">Couldn&apos;t load.</span>
              <Button
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  void refetch();
                }}
                className="nodrag -mx-1.5 h-auto rounded-md px-1.5 py-1 text-xs"
              >
                Retry
              </Button>
            </>
          ) : editable ? (
            // Upload from the card without also opening the drawer.
            <div className="w-full" onClick={(e) => e.stopPropagation()}>
              <ClientReviewUpload nodeId={id} onUploaded={handleUploaded} />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No cut uploaded yet.</span>
          )}
        </div>
      </div>
    </NodeContextMenu>
  );
}
