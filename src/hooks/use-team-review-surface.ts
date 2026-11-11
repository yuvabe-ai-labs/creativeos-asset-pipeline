"use client";

import { useMemo } from "react";
import { useReplyToThread, useResolveThread, useTeamScriptReview } from "@/hooks/queries/script-review";
import { useReviewColumn } from "@/hooks/use-review-column";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import { buildThreads, placeThreads } from "@/lib/script-review/threads";
import type { Part } from "@/lib/script-review/types";
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { ReviewSurface } from "@/components/script-review/review-surface-context";

const NOTHING: ReadonlyMap<string, Part> = new Map();

/** The team's side of a script's review, for every screen that shows its Comments column (the
 *  Visualise board, and the Generate workspace after a Reopen, D489): the review query, the threads
 *  placed on the live script, and Reply and Resolve once something has been shared. One builder, so
 *  the column looks and behaves the same wherever it appears. */
export function useTeamReviewSurface(clientId: string, scriptId: string, doc: ScriptDoc, initialReview: TeamScriptReview) {
  const { data: review } = useTeamScriptReview(clientId, scriptId, initialReview);
  const reply = useReplyToThread(clientId, scriptId);
  const resolve = useResolveThread(clientId, scriptId);
  const column = useReviewColumn();
  const threads = useMemo(() => buildThreads(review?.comments ?? []), [review?.comments]);
  const placed = useMemo(() => placeThreads(threads, doc, review?.removedShots ?? {}), [threads, doc, review?.removedShots]);
  // The team replies and resolves whenever a version exists, approved or not (user, 8 Oct).
  const shared = Boolean(review?.latest);

  const surface: ReviewSurface = {
    ...column,
    mode: "team",
    doc,
    placed,
    commentable: NOTHING,
    onReply: shared
      ? async (commentId, body) => {
          await reply.mutateAsync({ commentId, body });
        }
      : undefined,
    onResolve: shared
      ? async (commentId, resolved) => {
          await resolve.mutateAsync({ commentId, resolved });
        }
      : undefined,
  };
  return { review, placed, shared, surface };
}
