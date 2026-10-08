"use client";

import { useEffect, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCutTimecode } from "@/lib/client-review/utils";
import { COMMENT_BODY_MAX } from "@/lib/client-review/constants";
import { toTimecodeMs } from "@/lib/client-review/validate";

// Spec §4: the timestamp is the PAUSED frame. Focusing the box pauses the video; the
// chip follows the playhead while paused (scrubbing counts) and never drifts while
// typing, because typing never resumes playback. Post sends the paused position.
export function CommentComposer({
  videoRef,
  onPost,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  onPost: (body: string, timecodeMs: number) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [stampMs, setStampMs] = useState(0);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => setStampMs(toTimecodeMs(video.currentTime));
    sync();
    video.addEventListener("timeupdate", sync);
    video.addEventListener("seeked", sync);
    return () => {
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("seeked", sync);
    };
  }, [videoRef]);

  function pauseForWriting() {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setStampMs(toTimecodeMs(video.currentTime));
  }

  async function post() {
    if (!body.trim() || posting) return; // posting guard: one comment per tap
    const video = videoRef.current;
    const at = video ? toTimecodeMs(video.currentTime) : stampMs;
    setPosting(true);
    setError(null);
    try {
      await onPost(body, at);
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post the comment.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
      <p className="text-eyebrow text-muted-foreground">at {formatCutTimecode(stampMs)}</p>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={pauseForWriting}
        maxLength={COMMENT_BODY_MAX}
        placeholder={`Comment at ${formatCutTimecode(stampMs)}`}
        className="min-h-16 text-base md:text-base"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={post} disabled={posting || !body.trim()}>
          {posting ? "Posting…" : "Post"}
        </Button>
      </div>
    </div>
  );
}
