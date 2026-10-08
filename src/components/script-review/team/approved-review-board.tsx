// src/components/script-review/team/approved-review-board.tsx
"use client";

import { useMemo } from "react";
import { useReplyToThread, useResolveThread, useTeamScriptReview } from "@/hooks/queries/script-review";
import { useReviewColumn } from "@/hooks/use-review-column";
import { threadCount } from "@/lib/script-review/column";
import { buildThreads, placeThreads } from "@/lib/script-review/threads";
import type { Part } from "@/lib/script-review/types";
import { formatShortDay } from "@/lib/script-review/utils";
import type { ScriptVersion } from "@/lib/script-review/wire";
import type { Script } from "@/lib/scripts/schema";
import { FrozenBoard } from "../frozen-board";
import { ReviewColumn } from "../review-column";
import { ReviewSurfaceProvider, type ReviewSurface } from "../review-surface-context";
import { ReviewActions } from "./review-actions";

const NOTHING: ReadonlyMap<string, Part> = new Map();

/** Spec 4 §6 (review board, 4.17): after approval the team sees what the client approved — the
 *  approved version, read-only, as the client's page draws it — with the column (the team still
 *  replies and resolves) and Reopen to Visualise. The record of the sign-off, not the live script. */
export function ApprovedReviewBoard({ clientId, script, version }: { clientId: string; script: Script; version: ScriptVersion }) {
  const { data: review } = useTeamScriptReview(clientId, script.id);
  const reply = useReplyToThread(clientId, script.id);
  const resolve = useResolveThread(clientId, script.id);
  const column = useReviewColumn();
  const threads = useMemo(() => buildThreads(review?.comments ?? []), [review?.comments]);
  const placed = useMemo(() => placeThreads(threads, version.doc, review?.removedShots ?? {}), [threads, version.doc, review?.removedShots]);

  const surface: ReviewSurface = {
    ...column,
    mode: "team",
    doc: version.doc,
    placed,
    commentable: NOTHING,
    onReply: async (commentId, body) => {
      await reply.mutateAsync({ commentId, body });
    },
    onResolve: async (commentId, resolved) => {
      await resolve.mutateAsync({ commentId, resolved });
    },
  };

  return (
    <ReviewSurfaceProvider value={surface}>
      <div className="flex flex-col gap-6">
        <section aria-label="Approved" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 shadow-card">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-eyebrow">Approved</span>
            <span className="text-sm">
              Version {version.number}
              {review?.approval ? ` · approved by ${review.approval.byName} on ${formatShortDay(review.approval.at)}` : ""}
            </span>
          </div>
          <ReviewActions clientId={clientId} script={script} review={review} commentCount={threadCount(placed)} />
        </section>
        <FrozenBoard version={version} stage="approved" column={<ReviewColumn activity={review?.activity ?? []} />} />
      </div>
    </ReviewSurfaceProvider>
  );
}
