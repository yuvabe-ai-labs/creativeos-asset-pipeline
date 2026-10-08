"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useEditComment, usePostComment, usePublicReview } from "@/hooks/queries/client-reviews";
import type { PublicReview } from "@/lib/client-review/wire";
import {
  PREPAINT_SCRIPT, browserStore, clearReviewerName, readReviewerName, saveReviewerName,
} from "@/lib/client-review/reviewer-name";
import { CommentComposer } from "./comment-composer";
import { CommentList } from "./comment-list";
import { NameGate } from "./name-gate";
import { ReviewVideo } from "./review-video";

// True while the HTML is being produced on the server and while React hydrates it; false for
// every render React does purely in the browser (Fast Refresh, an error-boundary retry).
const noSubscribe = () => () => {};
function useIsServerOrHydrating(): boolean {
  return useSyncExternalStore(noSubscribe, () => false, () => true);
}

export function ClientReviewPage({ token, initial }: { token: string; initial: PublicReview }) {
  const { data: review } = usePublicReview(token, initial);
  const postComment = usePostComment(token);
  const editComment = useEditComment(token);
  const [name, setName] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const serverPass = useIsServerOrHydrating();

  // The pre-paint script may already have set data-reviewer="known". Reading the name
  // here moves React's own value from "unknown" to "known", so a later "change" (back to
  // "unknown") is a real DOM update — the attribute can't get stuck on "known".
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration sync from localStorage; useSyncExternalStore would drop a session-only name when storage is blocked (D309)
    setName(readReviewerName(browserStore()));
  }, []);

  function seek(ms: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
    video.pause();
  }

  // Only the POST/PATCH itself can reject here: the mutation shows the returned comment at
  // once and refetches best-effort, so a failed refresh never prompts a duplicate retry.
  async function handlePost(body: string, timecodeMs: number) {
    if (!name) throw new Error("Enter your name first.");
    await postComment.mutateAsync({ authorName: name, body, timecodeMs });
  }

  async function handleEdit(id: string, body: string) {
    if (!name) throw new Error("Enter your name first.");
    await editComment.mutateAsync({ commentId: id, editorName: name, body });
  }

  return (
    <div
      data-reviewer={name ? "known" : "unknown"}
      suppressHydrationWarning
      className="group/review flex min-h-dvh flex-col"
    >
      {/* The pre-paint name check only has work to do in the server HTML, before first paint.
          After hydration it is dropped, so React never CREATES a <script> in the browser —
          React 19 flags that (such scripts never run). The attribute it set stays put. */}
      {serverPass && <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />}

      <div className="group-data-[reviewer=known]/review:hidden">
        <NameGate title={review.title} onSubmit={(n) => setName(saveReviewerName(browserStore(), n))} />
      </div>

      <div className="hidden flex-1 flex-col group-data-[reviewer=known]/review:flex lg:mx-auto lg:w-full lg:max-w-6xl lg:px-6 lg:py-6">
        <header className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3 lg:px-0">
          <h1 className="font-display text-xl font-semibold tracking-tight lg:text-2xl">{review.title || "Your cut"}</h1>
          <p className="shrink-0 text-sm text-muted-foreground">
            {name && <>{name}{" · "}</>}
            <Button
              variant="link"
              onClick={() => { videoRef.current?.pause(); clearReviewerName(browserStore()); setName(null); }}
              className="h-auto p-0 text-sm"
            >
              change
            </Button>
          </p>
        </header>

        <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
          <div className="sticky top-0 z-10 bg-background px-4 pb-3 lg:static lg:px-0">
            <ReviewVideo ref={videoRef} src={review.videoUrl} />
          </div>
          <section className="flex flex-1 flex-col lg:max-h-[80dvh] lg:rounded-xl lg:border lg:border-border lg:shadow-card">
            <p className="text-eyebrow px-4 pt-3 text-muted-foreground">
              {review.comments.length} {review.comments.length === 1 ? "comment" : "comments"}
            </p>
            <div className="flex-1 overflow-y-auto px-4">
              <CommentList comments={review.comments} onSeek={seek} onEdit={handleEdit} />
            </div>
            <CommentComposer videoRef={videoRef} onPost={handlePost} />
          </section>
        </div>
      </div>
    </div>
  );
}
