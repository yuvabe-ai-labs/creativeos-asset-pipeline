// src/components/script-review/team/team-review-board.tsx
"use client";

import { useMemo } from "react";
import { VisualiseView } from "@/components/visualise/visualise-view";
import type { BoardData } from "@/hooks/queries/visualise";
import { useReplyToThread, useResolveThread, useTeamScriptReview } from "@/hooks/queries/script-review";
import { useReviewColumn } from "@/hooks/use-review-column";
import { threadCount } from "@/lib/script-review/column";
import { buildThreads, placeThreads } from "@/lib/script-review/threads";
import type { Part } from "@/lib/script-review/types";
import { PartMarker } from "../part-marker";
import { ReviewColumn } from "../review-column";
import { ReviewSurfaceProvider, type ReviewSurface } from "../review-surface-context";
import { ReviewActions } from "./review-actions";

const NOTHING: ReadonlyMap<string, Part> = new Map();

/** Spec 4 §6 (review board): the team's Visualise view with the review on it — the actions on the
 *  readiness line, a marker on every commented part, and the Comments column with Reply and
 *  Resolve once something has been shared (merge point MP4). */
export function TeamReviewBoard({ clientId, initial }: { clientId: string; initial: BoardData }) {
  const { script } = initial;
  const { data: review } = useTeamScriptReview(clientId, script.id);
  const reply = useReplyToThread(clientId, script.id);
  const resolve = useResolveThread(clientId, script.id);
  const column = useReviewColumn();
  const threads = useMemo(() => buildThreads(review?.comments ?? []), [review?.comments]);
  const placed = useMemo(() => placeThreads(threads, script.doc, review?.removedShots ?? {}), [threads, script.doc, review?.removedShots]);
  // The team replies and resolves whenever a version exists, approved or not (user, 8 Oct).
  const shared = Boolean(review?.latest);

  const surface: ReviewSurface = {
    ...column,
    mode: "team",
    doc: script.doc,
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

  return (
    <ReviewSurfaceProvider value={surface}>
      <VisualiseView
        clientId={clientId}
        initial={initial}
        review={{
          actions: <ReviewActions clientId={clientId} script={script} review={review} commentCount={threadCount(placed)} />,
          contextMarker: <PartMarker part={{ kind: "context" }} className="self-end" />,
          shotMarker: (shotId) => <PartMarker part={{ kind: "shot", shotId }} />,
          castMarker: (castId) => <PartMarker part={{ kind: "cast", castId }} />,
          viewMarker: (castId, view) => <PartMarker part={{ kind: "view", castId, view }} className="self-center" />,
          panelMarker: (shotId) => <PartMarker part={{ kind: "panel", shotId }} className="self-start" />,
          column: shared ? <ReviewColumn activity={review?.activity ?? []} /> : undefined,
        }}
      />
    </ReviewSurfaceProvider>
  );
}
