"use client";

import { useEffect, useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { Link2, Loader2, MessageSquareText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useNodeMediaSize } from "@/hooks/use-node-media-size";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { nodeMediaBox } from "@/lib/canvas/media-fit";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useNodeClientReview } from "@/hooks/queries/client-reviews";
import { useClientReviewUpload } from "@/hooks/use-client-review-upload";
import { copyVersionLink } from "@/lib/client-review/copy-link";
import type { ClientReviewNodeData } from "@/lib/canvas-nodes";
import { useClientFeedback, type FeedbackRequest } from "@/components/canvas/client-feedback-drawer/client-feedback-context";
import { useCanvasPermissions } from "@/components/permissions/client-permissions";
import { ClientReviewFocusView } from "./client-review-focus-view";
import { NodeCardHeader } from "./node-card-header";
import { NodeContextMenu } from "./node-context-menu";
import { NodeMedia } from "./node-media";

// D309 + D495–D498: terminal node (no handles) — the cuts a client reviews, one version per
// upload, each at its own link. Clicking the card opens its focus view. The card shows the
// newest version and its comment count. Right-click: Upload new version (file picker; the card shows
// a skeleton and Uploading… until it is saved) and Copy the newest version's link.
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
  // Spec §5: uploading the cut makes the client's review link, so the prompt to upload needs Share.
  const editable = useCanvasEditable();
  const { share: canShare } = useCanvasPermissions();
  const canShareCut = editable && canShare;
  // The version the focus view shows; null is the newest.
  const [viewedVersionNo, setViewedVersionNo] = useState<number | null>(null);
  const [handledRequest, setHandledRequest] = useState<FeedbackRequest | null>(null);
  // One upload per node, shared by the right-click menu and the focus view's button. The card
  // shows a skeleton while it runs; once saved, the (open or next-opened) focus view shows the
  // new version. Uploading from the card does not open the focus view.
  const upload = useClientReviewUpload(id, {
    onUploaded: (versionNo) => setViewedVersionNo(versionNo),
  });

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

  const review = current?.review ?? null;
  const latest = review?.versions[0] ?? null;
  const count = latest ? (current?.comments.filter((c) => c.versionId === latest.id).length ?? 0) : 0;
  // D384 — the cut at its own shape, no black bars.
  const media = useNodeMediaSize(id, { width: d.mediaWidth, height: d.mediaHeight }, 16 / 9);
  // While uploading, the media area holds a skeleton (at the current cut's shape, or 16:9 for the first).
  const box = latest || upload.uploading ? nodeMediaBox(media.ratio, "input") : null;
  const commitTitle = (t: string) => updateNodeData(id, { title: t });

  return (
    <>
      <NodeContextMenu
        onDuplicate={() => duplicateNode(id)}
        onDelete={() => deleteNode(id)}
        extraItems={
          <>
            <ContextMenuItem disabled={!canShareCut || upload.uploading || !current} onClick={upload.choose}>
              <Upload className="mr-2 size-3.5" strokeWidth={1.5} />
              {latest ? "Upload new version" : "Upload first version"}
            </ContextMenuItem>
            {latest && review && (
              <ContextMenuItem
                onClick={() => void copyVersionLink(review.shareToken, latest.title || d.title || "", latest)}
              >
                <Link2 className="mr-2 size-3.5" strokeWidth={1.5} />
                {`Copy v${latest.versionNo} link`}
              </ContextMenuItem>
            )}
          </>
        }
      >
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
          {upload.uploading && box ? (
            <div
              aria-label="Uploading cut"
              className="relative overflow-hidden border-b border-border"
              style={{ width: box.mediaWidth, height: box.mediaHeight }}
            >
              <Skeleton className="absolute inset-0 rounded-none" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-primary">
                <Loader2 className="size-5 animate-spin" strokeWidth={1.5} />
                <span className="text-xs font-medium">Uploading…</span>
              </div>
            </div>
          ) : (
            latest &&
            box && (
              <NodeMedia kind="video" src={latest.videoUrl} alt={d.title || "Cut"} box={box} onMeasured={media.onMeasured} edge />
            )
          )}
          <div className="flex items-center justify-between gap-2 px-3 py-3">
            {upload.uploading ? (
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{`v${(latest?.versionNo ?? 0) + 1}`}</span>
                {" · uploading"}
              </span>
            ) : latest ? (
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
            ) : canShareCut ? (
              // The empty node's one action: pick the first cut right here.
              <Button
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  upload.choose();
                }}
                className="nodrag h-auto w-full gap-2 border border-dashed border-primary/40 py-2.5 text-primary hover:bg-primary/5 hover:text-primary"
              >
                <Upload className="size-4" strokeWidth={1.5} />
                Upload first version
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">No cut yet</span>
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
        upload={upload}
      />
      {upload.input}
    </>
  );
}
