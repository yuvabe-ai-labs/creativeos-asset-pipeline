"use client";

import { useCallback, useState } from "react";
import {
  commitDraft,
  removeDraft,
  type AnnotationDraft,
  type RegionBounds,
} from "@/lib/review-annotations/draft";

// Client-side draft list for the compose flow. Nothing here touches the server —
// drafts ride along with "Request changes" (D211), so an abandoned review costs
// nothing and a failed submit is losslessly retryable.
export function useAnnotationDrafts() {
  const [drafts, setDrafts] = useState<AnnotationDraft[]>([]);

  const commit = useCallback(
    (
      bounds: RegionBounds | null,
      overlayBase64: string,
      note: string,
      extra?: { kind: "video-frame"; timecodeMs: number },
    ) => {
      setDrafts((prev) =>
        commitDraft(prev, {
          seq: 0, // renumbered by commitDraft
          kind: extra?.kind ?? "image",
          timecodeMs: extra?.timecodeMs ?? null,
          overlayBase64,
          note,
          bounds,
        }),
      );
    },
    [],
  );

  const remove = useCallback((seq: number) => {
    setDrafts((prev) => removeDraft(prev, seq));
  }, []);

  const clear = useCallback(() => setDrafts([]), []);

  return { drafts, commit, remove, clear };
}
