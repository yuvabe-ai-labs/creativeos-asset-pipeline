"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useReactFlow } from "@xyflow/react";
import { Copy, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { CommentList } from "@/components/client-review/comment-list";
import { ReviewVideo } from "@/components/client-review/review-video";
import { EditableField } from "@/components/nodes/editable-field";
import { ClientReviewUpload } from "@/components/nodes/client-review-upload";
import { clientReviewKeys, useNodeClientReview } from "@/hooks/queries/client-reviews";
import type { ClientReviewNodeData } from "@/lib/canvas-nodes";
import { sharePathFor } from "@/lib/client-review/paths";
import type { NodeClientReview } from "@/lib/client-review/wire";
import { useClientFeedback } from "./client-feedback-context";

// D309 — the client feedback drawer. Right side, vertical: the cut on top, the client's
// comments under it; clicking a comment's timecode scrubs the video there.
//
// NON-MODAL with no backdrop, like the gallery and review drawers, so a designer can read
// feedback and keep working on the canvas at the same time. It stays open until closed;
// clicking another Client review node swaps what it shows (ClientFeedbackProvider).
export function ClientFeedbackDrawer() {
  const { nodeId, fly, closeFeedback, consumeFly } = useClientFeedback();
  const { setCenter, getNode } = useReactFlow();
  // The node can be deleted while its feedback is open — then there is nothing to show.
  const node = useCanvasStore((s) => (nodeId ? s.nodes.find((n) => n.id === nodeId) : undefined));
  const open = !!nodeId && !!node;

  // Opened from the header chip: bring the node into view (same fly as the review drawer).
  useEffect(() => {
    if (!fly || !nodeId) return;
    const n = getNode(nodeId);
    if (n) setCenter(n.position.x + 112, n.position.y + 100, { zoom: 1, duration: 500 });
    consumeFly();
  }, [fly, nodeId, getNode, setCenter, consumeFly]);

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) closeFeedback();
      }}
      modal={false}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        noOverlay
        className="flex w-full flex-col gap-0 p-0 shadow-lg data-[side=right]:sm:max-w-md"
      >
        {open && (
          // Keyed by node so switching nodes resets the player and scroll position.
          <FeedbackPanel
            key={nodeId}
            nodeId={nodeId}
            title={(node.data as ClientReviewNodeData).title ?? ""}
            onClose={closeFeedback}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function FeedbackPanel({
  nodeId,
  title,
  onClose,
}: {
  nodeId: string;
  title: string;
  onClose: () => void;
}) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const editable = useCanvasEditable();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { data, isPending: loading, isError, refetch } = useNodeClientReview(nodeId);

  // Fresh comments whenever a node's feedback is brought up (spec §5) — and the header
  // chip's canvas total with them, so the two never disagree.
  useEffect(() => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ["client-review", "canvas"] });
  }, [refetch, queryClient]);

  const review = data?.review ?? null;
  const comments = data?.comments ?? [];
  // Built from the live title, so Copy link / Open as client follow a rename immediately.
  const sharePath = review ? sharePathFor(review.shareToken, title) : null;

  function seek(ms: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
    video.pause();
  }

  // window is read on click, never during render — canvas components are server-rendered too.
  async function copyLink() {
    if (!sharePath) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${sharePath}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — copy it from Open as client.");
    }
  }

  const handleUploaded = (next: NodeClientReview) => {
    queryClient.setQueryData(clientReviewKeys.node(nodeId), next);
    void queryClient.invalidateQueries({ queryKey: ["client-review", "canvas"] });
  };

  return (
    <>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b px-5 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-eyebrow text-muted-foreground">Client feedback</p>
          <SheetTitle className="mt-1 p-0 font-display text-xl font-semibold tracking-tight">
            <EditableField
              value={title}
              onCommit={(t) => updateNodeData(nodeId, { title: t })}
              placeholder="Untitled cut"
              className="font-display text-xl font-semibold tracking-tight"
            />
          </SheetTitle>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close feedback">
          <X className="size-4" strokeWidth={1.5} />
        </Button>
      </header>

      {review ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-3 px-5 pt-4">
            <ReviewVideo ref={videoRef} src={review.videoUrl} className="max-h-[45dvh] lg:max-h-[45dvh]" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyLink} className="flex-1">
                <Copy className="size-3.5" strokeWidth={1.5} /> Copy link
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                nativeButton={false}
                render={<a href={sharePath ?? undefined} target="_blank" rel="noopener noreferrer" />}
              >
                <ExternalLink className="size-3.5" strokeWidth={1.5} /> Open as client
              </Button>
            </div>
          </div>
          <p className="text-eyebrow shrink-0 px-5 pb-1 pt-5 text-muted-foreground">
            Comments · {comments.length}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <CommentList comments={comments} onSeek={seek} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-3 px-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError || !data ? (
            <>
              <p className="text-sm text-muted-foreground">Couldn&apos;t load the review.</p>
              <Button variant="ghost" onClick={() => void refetch()}>
                Retry
              </Button>
            </>
          ) : !editable ? (
            <p className="text-sm text-muted-foreground">No cut uploaded yet.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Upload the edited cut. You&apos;ll get a link to send the client.
              </p>
              <ClientReviewUpload nodeId={nodeId} onUploaded={handleUploaded} />
            </>
          )}
        </div>
      )}
    </>
  );
}
