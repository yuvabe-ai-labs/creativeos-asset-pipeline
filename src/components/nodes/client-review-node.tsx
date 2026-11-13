"use client";

import { useEffect, useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useNodeMediaSize } from "@/hooks/use-node-media-size";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { nodeMediaBox } from "@/lib/canvas/media-fit";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useNodeClientReview } from "@/hooks/queries/client-reviews";
import type { ClientReviewNodeData } from "@/lib/canvas-nodes";
import { useClientFeedback, type FeedbackRequest } from "@/components/canvas/client-feedback-drawer/client-feedback-context";
import { ClientReviewFocusView } from "./client-review-focus-view";
import { NodeCardHeader } from "./node-card-header";
import { NodeContextMenu } from "./node-context-menu";
import { NodeMedia } from "./node-media";

// D309 + D495–D498: terminal node (no handles) — the cuts a client reviews, one version per
// upload, each at its own link. Clicking the card opens its focus view. The card shows the
// newest version and its comment count.
export function ClientReviewNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const { request, closeFeedback } = useClientFeedback();
  const { setCenter } = useReactFlow();
  const d = data as ClientReviewNodeData;
  const { data: current, isPending: loading, isError, refetch } = useNodeClientReview(id);
  const [focusOpen, setFocusOpen] = useState(false);
  // The version the focus view shows; null is the newest.
  const [viewedVersionNo, setViewedVersionNo] = useState<number | null>(null);
  const [handledRequest, setHandledRequest] = useState<FeedbackRequest | null>(null);

  // D500 — a request naming a version (a row in the Client feedback chip) switches the view to
  // it. Adjusted while rendering, not in an effect, so the view opens on that version at once.
  const ownRequest = request?.nodeId === id ? request : null;
  if (ownRequest && ownRequest !== handledRequest) {
    setHandledRequest(ownRequest);
    if (ownRequest.versionNo !== null) setViewedVersionNo(ownRequest.versionNo);
  }

  // The header's Client feedback chip and "Open Client review" in the add menu ask for this node
  // (ClientFeedbackProvider, outside the canvas store): bring it into view if asked, then hand it
  // to the store's shared focus signal (as the copilot's open_node does) and consume the request.
  useEffect(() => {
    if (!ownRequest) return;
    if (ownRequest.fly) setCenter((positionAbsoluteX ?? 0) + 112, (positionAbsoluteY ?? 0) + 100, { zoom: 1, duration: 500 });
    setFocusedNodeId(id);
    closeFeedback();
  }, [ownRequest, id, positionAbsoluteX, positionAbsoluteY, setCenter, setFocusedNodeId, closeFeedback]);

  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null);
  };
  useFocusViewRegistration(id, focusViewOpen);

  const latest = current?.review?.versions[0] ?? null;
  const count = latest ? (current?.comments.filter((c) => c.versionId === latest.id).length ?? 0) : 0;
  // D384 — the cut at its own shape, no black bars.
  const media = useNodeMediaSize(id, { width: d.mediaWidth, height: d.mediaHeight }, 16 / 9);
  const box = latest ? nodeMediaBox(media.ratio, "input") : null;
  const commitTitle = (t: string) => updateNodeData(id, { title: t });

  return (
    <>
      <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
        <div
          onClick={(e) => {
            // A click on a control inside the card (the inline title) is that control's own
            // action; without this, renaming the title also opened the focus view.
            if ((e.target as HTMLElement).closest("button, input, textarea, a")) return;
            setFocusOpen(true);
          }}
          style={box ? { width: box.cardWidth } : undefined}
          className={cn(
            !box && "w-56",
            // D310: the client accent — amber border + a pale amber header band — so client-facing
            // work reads apart from generation nodes. Selection keeps the purple ring (brand focus).
            "group cursor-pointer overflow-hidden rounded-lg border border-client/70 bg-card shadow-card",
            "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
            selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          )}
        >
          <div className="border-b border-client/40 bg-client/15 [&_svg]:text-client-text">
            <NodeCardHeader
              icon={MessageSquareText}
              nodeId={id}
              nodeType="client-review"
              title={d.title ?? ""}
              placeholder="Untitled cut"
              onCommitTitle={commitTitle}
            />
          </div>
          {latest && box && (
            <NodeMedia kind="video" src={latest.videoUrl} alt={d.title || "Cut"} box={box} onMeasured={media.onMeasured} edge />
          )}
          <div className="flex items-center justify-between gap-2 px-3 py-3">
            {latest ? (
              <>
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{`v${latest.versionNo}`}</span>
                  {` · ${count} ${count === 1 ? "comment" : "comments"}`}
                </span>
                <span className="text-xs font-medium text-client-text">Open →</span>
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
            ) : (
              <>
                <span className="text-xs text-muted-foreground">No cut yet</span>
                <span className="text-xs font-medium text-primary">Upload first version →</span>
              </>
            )}
          </div>
        </div>
      </NodeContextMenu>
      <ClientReviewFocusView
        open={focusViewOpen}
        onOpenChange={handleFocusOpenChange}
        nodeId={id}
        title={d.title ?? ""}
        onCommitTitle={commitTitle}
        viewedVersionNo={viewedVersionNo}
        onViewVersion={setViewedVersionNo}
      />
    </>
  );
}
