// src/components/script-review/team/team-review-board.tsx
"use client";

import { VisualiseView } from "@/components/visualise/visualise-view";
import type { BoardData } from "@/hooks/queries/visualise";
import { useTeamReviewSurface } from "@/hooks/use-team-review-surface";
import { threadCount } from "@/lib/script-review/column";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import { PartMarker } from "../part-marker";
import { ReviewColumn } from "../review-column";
import { ReviewSurfaceProvider } from "../review-surface-context";
import { ReviewActions } from "./review-actions";

/** Spec 4 §6 (review board): the team's Visualise view with the review on it — the actions on the
 *  readiness line, a marker on every commented part, and the Comments column with Reply and
 *  Resolve once something has been shared (merge point MP4). */
export function TeamReviewBoard({ clientId, initial, initialReview }: {
  clientId: string;
  initial: BoardData;
  /** Built on the server, so the column is there on the first render (no reflow). */
  initialReview: TeamScriptReview;
}) {
  const { script } = initial;
  const { review, placed, shared, surface } = useTeamReviewSurface(clientId, script.id, script.doc, initialReview);

  return (
    <ReviewSurfaceProvider value={surface}>
      <VisualiseView
        clientId={clientId}
        initial={initial}
        review={{
          actions: <ReviewActions clientId={clientId} script={script} review={review} commentCount={threadCount(placed)} />,
          contextMarker: <PartMarker part={{ kind: "context" }} className="self-end" />,
          // One marker per storyboard tile, its panel's threads counted in (D465).
          shotMarker: (shotId) => <PartMarker part={{ kind: "shot", shotId }} alsoCount={[{ kind: "panel", shotId }]} />,
          castMarker: (castId) => <PartMarker part={{ kind: "cast", castId }} />,
          column: shared ? <ReviewColumn activity={review?.activity ?? []} /> : undefined,
        }}
      />
    </ReviewSurfaceProvider>
  );
}
