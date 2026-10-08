// src/components/script-review/team/stage-actions.tsx
"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMoveScriptStage } from "@/hooks/queries/script-review";
import { errorMessage } from "@/lib/avatars/utils";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import { SHARE_SCOPE_PHRASE, TEAM_STAGE_MOVES, teamMovesFrom, type TeamStageMove } from "@/lib/script-review/constants";
import { scriptSharePathFor } from "@/lib/script-review/paths";
import { formatShortDay } from "@/lib/script-review/utils";
import type { ScriptStage } from "@/lib/scripts/constants";
import type { Script } from "@/lib/scripts/schema";
import { ClientFeedbackCount } from "../client-feedback-count";
import { CopyLinkButton } from "./copy-link-button";
import { ShareDialog } from "./share-dialog";

const HINT: Record<ScriptStage, string> = {
  generate: "Mark the script final, then move it to In review to share it with the client.",
  visualise: "Move the script to In review when it is ready for the client.",
  in_review: "Share it with the client. Each share is a new version on the same link.",
  approved: "Approved.",
};

/** Spec 4 §6: Move to In review, Share / Share again, Copy link, Move back to Visualise, and
 *  Reopen to Visualise after an approval. Share appears only In review. */
export function StageActions({ clientId, script, review }: { clientId: string; script: Script; review: TeamScriptReview | undefined }) {
  const stage = review?.stage ?? script.stage;
  const latest = review?.latest ?? null;
  const move = useMoveScriptStage(clientId, script.id);
  const path = review?.shareToken && latest ? scriptSharePathFor(review.shareToken, script.doc.header.title) : null;

  async function run(m: TeamStageMove) {
    try {
      await move.mutateAsync(m);
    } catch (e) {
      toast.error(errorMessage(e, "Could not move the script."));
    }
  }

  return (
    <section aria-label="Client review" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-eyebrow">Client review</h2>
        <ClientFeedbackCount count={review?.feedbackCount ?? 0} />
      </div>
      <p className="text-sm text-muted-foreground">
        {latest
          ? `Version ${latest.number} · shared ${formatShortDay(latest.sharedAt)} · ${SHARE_SCOPE_PHRASE[latest.scope]}`
          : HINT[stage]}
      </p>
      {review?.approval && (
        <p className="text-sm font-medium">
          Approved by {review.approval.byName} on {formatShortDay(review.approval.at)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {stage === "in_review" && <ShareDialog clientId={clientId} script={script} latest={latest} />}
        {path && <CopyLinkButton path={path} />}
        {teamMovesFrom(stage).map((m) => (
          <Button key={m} variant={m === "to_review" ? "default" : "outline"} size="sm" disabled={move.isPending} onClick={() => void run(m)}>
            {TEAM_STAGE_MOVES[m].label}
          </Button>
        ))}
      </div>
    </section>
  );
}
