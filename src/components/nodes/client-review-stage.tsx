"use client";

import type { Ref } from "react";
import { ReviewVideo } from "@/components/client-review/review-video";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { ReviewVersion } from "@/lib/client-review/wire";

// D497–D498 — the centre of the Client review focus view for the version on screen: the video at
// its own shape (no black bars around a reel) and when it was uploaded. The version's link and
// its Allow download toggle live in the header (ClientReviewLinkActions).
export function ClientReviewStage({
  version,
  videoRef,
}: {
  version: ReviewVersion;
  videoRef: Ref<HTMLVideoElement>;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Keyed by version, so switching versions resets the player. Width follows the video's own
          aspect ratio inside the height cap, so a 9:16 reel is as narrow as it is, not boxed. */}
      <ReviewVideo
        key={version.id}
        ref={videoRef}
        src={version.videoUrl}
        className="h-auto max-h-[56vh] w-auto max-w-full bg-transparent lg:max-h-[56vh]"
      />
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{`v${version.versionNo}`}</span>
        {` · uploaded ${formatRelativeTime(version.createdAt)}`}
      </p>
    </div>
  );
}
