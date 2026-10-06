"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PublicReview } from "@/lib/client-review/wire";
import {
  PREPAINT_SCRIPT, browserStore, clearReviewerName, readReviewerName, saveReviewerName,
} from "@/lib/client-review/reviewer-name";
import { CommentComposer } from "./comment-composer";
import { CommentList } from "./comment-list";
import { NameGate } from "./name-gate";
import { ReviewVideo } from "./review-video";
import { editComment, fetchReview, postComment } from "./review-api";

export function ClientReviewPage({ token, initial }: { token: string; initial: PublicReview }) {
  const [review, setReview] = useState(initial);
  const [name, setName] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // The pre-paint script may already have set data-reviewer="known". Reading the name
  // here moves React's own value from "unknown" to "known", so a later "change" (back to
  // "unknown") is a real DOM update — the attribute can't get stuck on "known".
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe read of localStorage (D279)
    setName(readReviewerName(browserStore()));
  }, []);

  const refresh = useCallback(async () => {
    setReview(await fetchReview(token));
  }, [token]);

  function seek(ms: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
    video.pause();
  }

  async function handlePost(body: string, timecodeMs: number) {
    if (!name) return;
    await postComment(token, { authorName: name, body, timecodeMs });
    await refresh();
  }

  async function handleEdit(id: string, body: string) {
    if (!name) return;
    await editComment(token, id, { editorName: name, body });
    await refresh();
  }

  return (
    <div
      data-reviewer={name ? "known" : "unknown"}
      suppressHydrationWarning
      className="group/review flex min-h-dvh flex-col"
    >
      <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />

      <div className="group-data-[reviewer=known]/review:hidden">
        <NameGate title={review.title} onSubmit={(n) => setName(saveReviewerName(browserStore(), n))} />
      </div>

      <div className="hidden flex-1 flex-col group-data-[reviewer=known]/review:flex lg:mx-auto lg:w-full lg:max-w-6xl lg:px-6 lg:py-6">
        <header className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3 lg:px-0">
          <h1 className="font-display text-xl font-semibold tracking-tight lg:text-2xl">{review.title || "Your cut"}</h1>
          <p className="shrink-0 text-sm text-muted-foreground">
            {name}{" · "}
            <Button
              variant="link"
              onClick={() => { clearReviewerName(browserStore()); setName(null); }}
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
