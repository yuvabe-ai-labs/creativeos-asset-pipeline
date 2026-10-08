// src/components/script-review/team/script-review-workspace.tsx
"use client";

import { useMemo } from "react";
import { ScriptView } from "@/components/scripts/script-view";
import type { ScriptViewSlots } from "@/components/scripts/script-view-slots";
import { useReplyToThread, useResolveThread, useTeamScriptReview } from "@/hooks/queries/script-review";
import { buildThreads, placeThreads } from "@/lib/script-review/threads";
import type { Part } from "@/lib/script-review/types";
import type { Script } from "@/lib/scripts/schema";
import { ActivityList } from "../activity-list";
import { CastReviewSlot } from "../cast-review-slot";
import { CommentsColumn } from "../comments-column";
import { PartComments } from "../part-comments";
import { ReviewSurfaceProvider, type ReviewSurface } from "../review-surface-context";
import { ShotReviewSlot } from "../shot-review-slot";
import { StageActions } from "./stage-actions";

const NOTHING: ReadonlyMap<string, Part> = new Map();

/** Spec 4 §6: the team's view — the live script with each client comment beside its part, Reply and
 *  Resolve, the same Comments and Activity lists the client sees, and the stage actions.
 *  MERGE POINT (MP4, spec 3): spec 3 turns this page into the Visualise view; this wraps it. */
export function ScriptReviewWorkspace({
  clientId,
  script,
  avatarFaces,
}: {
  clientId: string;
  script: Script;
  avatarFaces: Record<string, string | null>;
}) {
  const { data: review } = useTeamScriptReview(clientId, script.id);
  const reply = useReplyToThread(clientId, script.id);
  const resolve = useResolveThread(clientId, script.id);
  const threads = useMemo(() => buildThreads(review?.comments ?? []), [review?.comments]);
  const placed = useMemo(() => placeThreads(threads, script.doc, review?.removedShots ?? {}), [threads, script.doc, review?.removedShots]);
  // The team replies and resolves whenever a version has been shared, approved or not (user, 8 Oct);
  // only the client's link becomes a record after approval.
  const open = Boolean(review?.latest);

  const surface: ReviewSurface = {
    mode: "team",
    doc: script.doc,
    placed,
    commentable: NOTHING,
    onReply: open
      ? async (commentId, body) => {
          await reply.mutateAsync({ commentId, body });
        }
      : undefined,
    onResolve: open
      ? async (commentId, resolved) => {
          await resolve.mutateAsync({ commentId, resolved });
        }
      : undefined,
  };
  const slots: ScriptViewSlots = {
    context: <PartComments part={{ kind: "context" }} />,
    castMember: (m) => <CastReviewSlot member={m} />,
    shot: (s) => <ShotReviewSlot shot={s} />,
  };

  return (
    <ReviewSurfaceProvider value={surface}>
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <ScriptView script={{ doc: script.doc, stage: review?.stage ?? script.stage }} avatarFaces={avatarFaces} slots={slots} />
        <aside className="flex flex-col gap-8 lg:sticky lg:top-6 lg:self-start">
          <StageActions clientId={clientId} script={script} review={review} />
          <CommentsColumn />
          <ActivityList lines={review?.activity ?? []} />
        </aside>
      </div>
    </ReviewSurfaceProvider>
  );
}
