// src/components/script-review/team/review-actions.tsx
"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCan } from "@/components/permissions/use-can";
import { useMoveScriptStage } from "@/hooks/queries/script-review";
import { errorMessage } from "@/lib/avatars/utils";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import { TEAM_STAGE_MOVES, teamMovesFrom, type TeamStageMove } from "@/lib/script-review/constants";
import { scriptSharePathFor } from "@/lib/script-review/paths";
import { formatShortDay } from "@/lib/script-review/utils";
import type { Script } from "@/lib/scripts/schema";
import { ClientFeedbackCount } from "../client-feedback-count";
import { CommentsButton } from "../comments-button";
import { CopyLinkButton } from "./copy-link-button";
import { ShareDialog } from "./share-dialog";

/** Spec 4 §6 (review board): the review's actions on the board's top line — the feedback count and
 *  latest version, Share / Share again (In review), Copy link, the team's stage moves, and below
 *  `xl` the Comments button once something has been shared, and, once approved, Create / Open
 *  canvas (`canvasAction`, D372). A move reloads the page: the stage
 *  decides which board it shows. Move to In review is the share dialog (D349, refined): one element
 *  for both stages, so the dialog and its new link survive the move flipping it to Share again. */
export function ReviewActions({ clientId, script, review, commentCount, canvasAction }: {
  clientId: string;
  script: Script;
  review: TeamScriptReview | undefined;
  commentCount: number;
  canvasAction?: ReactNode;
}) {
  const router = useRouter();
  const stage = review?.stage ?? script.stage;
  const latest = review?.latest ?? null;
  const move = useMoveScriptStage(clientId, script.id);
  // D493: sharing needs client_review.share; a stage move needs client_review.edit, and Move to
  // In review is the share dialog, so it needs both.
  const canShare = useCan("client_review.share", clientId);
  const canMove = useCan("client_review.edit", clientId);
  const path = review?.shareToken && latest ? scriptSharePathFor(review.shareToken, script.doc.header.title) : null;

  async function run(m: TeamStageMove) {
    try {
      await move.mutateAsync({ move: m });
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e, "Could not move the script."));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ClientFeedbackCount count={review?.feedbackCount ?? 0} />
      {latest && (
        <span className="text-xs text-muted-foreground">
          Version {latest.number} · shared {formatShortDay(latest.sharedAt)}
        </span>
      )}
      {canShare && (stage === "in_review" || (stage === "visualise" && canMove)) && (
        <ShareDialog clientId={clientId} script={script} latest={latest} moving={stage === "visualise"} />
      )}
      {canShare && path && <CopyLinkButton path={path} />}
      {canMove && teamMovesFrom(stage).filter((m) => m !== "to_review").map((m) => (
        <Button key={m} variant="outline" size="sm" disabled={move.isPending} onClick={() => void run(m)}>
          {TEAM_STAGE_MOVES[m].label}
        </Button>
      ))}
      {canvasAction}
      {latest && <CommentsButton count={commentCount} />}
    </div>
  );
}
