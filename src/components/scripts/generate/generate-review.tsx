"use client";

import type { ReactNode } from "react";
import { CommentsButton } from "@/components/script-review/comments-button";
import { ReviewColumn } from "@/components/script-review/review-column";
import { ReviewSurfaceProvider, useReviewSurface } from "@/components/script-review/review-surface-context";
import { useTeamScriptReview } from "@/hooks/queries/script-review";
import { useTeamReviewSurface } from "@/hooks/use-team-review-surface";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import { threadCount } from "@/lib/script-review/column";
import type { ScriptDoc } from "@/lib/scripts/schema";

// D489 — a reopened script keeps its review beside the copilot: the Visualise board's own Comments
// column, the same components fed by the same hook (useTeamReviewSurface).

export function GenerateReviewProvider({ clientId, scriptId, doc, initialReview, children }: {
  clientId: string;
  scriptId: string;
  doc: ScriptDoc;
  initialReview: TeamScriptReview;
  children: ReactNode;
}) {
  const { surface } = useTeamReviewSurface(clientId, scriptId, doc, initialReview);
  return <ReviewSurfaceProvider value={surface}>{children}</ReviewSurfaceProvider>;
}

/** From `xl`, the column beside the script; below it, the sheet the Comments button opens. */
export function GenerateReviewColumn({ clientId, scriptId }: { clientId: string; scriptId: string }) {
  const { data: review } = useTeamScriptReview(clientId, scriptId);
  return <ReviewColumn activity={review?.activity ?? []} />;
}

/** Below `xl`, the way into the column, as on the board. */
export function GenerateCommentsButton() {
  const { placed } = useReviewSurface();
  return <CommentsButton count={threadCount(placed)} />;
}
