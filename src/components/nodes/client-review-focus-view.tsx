"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CommentList } from "@/components/client-review/comment-list";
import { ReviewVideo } from "@/components/client-review/review-video";
import type { NodeClientReview } from "@/lib/client-review/wire";
import { EditableField } from "./editable-field";
import { ClientReviewUpload } from "./client-review-upload";

export function ClientReviewFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  data,
  onTitle,
  onReload,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  data: NodeClientReview | null;
  onTitle: (title: string) => void;
  onReload: () => Promise<void>;
  onUploaded: (next: NodeClientReview) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Fresh comments every time the operator opens the review (spec §5).
  useEffect(() => {
    if (open) void onReload();
  }, [open, onReload]);

  const review = data?.review ?? null;
  const comments = data?.comments ?? [];

  function seek(ms: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
    video.pause();
  }

  // window is read on click, never during render — canvas nodes are also server-rendered.
  async function copyLink() {
    if (!review) return;
    await navigator.clipboard.writeText(`${window.location.origin}${review.sharePath}`);
    toast.success("Link copied");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-7xl px-6 pb-5 pt-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </Button>
            <header className="mt-4 flex items-start justify-between gap-4">
              <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                <EditableField
                  value={title}
                  onCommit={onTitle}
                  placeholder="Untitled cut"
                  className="font-display text-3xl font-semibold tracking-tight"
                />
              </SheetTitle>
              {review && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" onClick={copyLink}>
                    <Copy className="size-4" strokeWidth={1.5} /> Copy link
                  </Button>
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<a href={review.sharePath} target="_blank" rel="noopener noreferrer" />}
                  >
                    <ExternalLink className="size-4" strokeWidth={1.5} /> Open as client
                  </Button>
                </div>
              )}
            </header>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {review ? (
            <div className="mx-auto grid h-full w-full max-w-6xl grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6 px-6 py-4">
              <section className="flex min-h-0 flex-col">
                <p className="text-eyebrow text-muted-foreground">
                  Comments · {comments.length}
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <CommentList comments={comments} onSeek={seek} />
                </div>
              </section>
              <ReviewVideo ref={videoRef} src={review.videoUrl} />
            </div>
          ) : (
            <div className="mx-auto flex h-full max-w-sm flex-col justify-center gap-3 px-6">
              <p className="text-sm text-muted-foreground">
                Upload the edited cut. You&apos;ll get a link to send the client.
              </p>
              <ClientReviewUpload nodeId={nodeId} onUploaded={onUploaded} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
