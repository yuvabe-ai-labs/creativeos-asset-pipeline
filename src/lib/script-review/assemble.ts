// src/lib/script-review/assemble.ts
// The two payloads, from one review state. Pure.
import type { ScriptStage } from "@/lib/scripts/constants";
import type { ScriptDoc } from "@/lib/scripts/schema";
import { buildActivity } from "./activity";
import { FULL_SHARE, type ShareScope } from "./constants";
import { removedShots } from "./threads";
import type { ActivityLine, RemovedShot, ScriptComment, ScriptReviewEvent, VersionVisuals } from "./types";
import type { ScriptVersion } from "./wire";

export type ReviewState = { versions: ScriptVersion[]; comments: ScriptComment[]; events: ScriptReviewEvent[] };
export type Approval = { byName: string; at: string };

/** The approval of this version, if it has one. After a reopen the old approval stays in the
 *  activity, but the next share has none until the client approves it (spec 4 §8). */
export function approvalOf(events: ScriptReviewEvent[], versionNumber: number | null): Approval | null {
  if (versionNumber === null) return null;
  const e = [...events].reverse().find((x) => x.kind === "approved" && x.versionNumber === versionNumber);
  return e ? { byName: e.actorName, at: e.createdAt } : null;
}

/** Spec 4 §8: once the version on screen is approved the link is a read-only record. */
export function commentsOpen(latest: ScriptVersion | null, approval: Approval | null): boolean {
  return latest !== null && approval === null;
}

/** Spec 4 §8: Approve on a full share, while the script is In review, once. */
export function canApprove(stage: ScriptStage, latest: ScriptVersion | null, approval: Approval | null): boolean {
  return stage === "in_review" && latest?.scope === FULL_SHARE && approval === null;
}

/** Spec 4 §6: client comments plus approvals, a total with no seen-state (as D310). */
export function feedbackCount(comments: ScriptComment[], events: ScriptReviewEvent[]): number {
  return comments.filter((c) => c.authorKind === "client").length + events.filter((e) => e.kind === "approved").length;
}

/** The client's page. Deliberately no org, client, script, review or version ids (D309 §3). */
export type PublicScriptReview = {
  fromName: string;
  forName: string;
  version: { number: number; scope: ShareScope; sharedAt: string; doc: ScriptDoc; visuals: VersionVisuals };
  comments: ScriptComment[];
  removedShots: Record<string, RemovedShot>;
  activity: ActivityLine[];
  approval: Approval | null;
  commentsOpen: boolean;
  canApprove: boolean;
};

export type TeamScriptReview = {
  stage: ScriptStage;
  /** The share CODE, not a finished link: the link carries the live title (D311; commit 732d3424). */
  shareToken: string | null;
  latest: { number: number; scope: ShareScope; sharedAt: string } | null;
  comments: ScriptComment[];
  removedShots: Record<string, RemovedShot>;
  activity: ActivityLine[];
  approval: Approval | null;
  commentsOpen: boolean;
  feedbackCount: number;
};

export function assemblePublic(
  state: ReviewState,
  ctx: { stage: ScriptStage; fromName: string; forName: string },
): PublicScriptReview | null {
  const latest = state.versions.at(-1) ?? null;
  if (!latest) return null;
  const approval = approvalOf(state.events, latest.number);
  return {
    fromName: ctx.fromName,
    forName: ctx.forName,
    version: { number: latest.number, scope: latest.scope, sharedAt: latest.sharedAt, doc: latest.doc, visuals: latest.visuals },
    comments: state.comments,
    removedShots: removedShots(state.versions, latest.doc),
    activity: buildActivity(state.events, state.comments),
    approval,
    commentsOpen: commentsOpen(latest, approval),
    canApprove: canApprove(ctx.stage, latest, approval),
  };
}

export function assembleTeam(
  state: ReviewState,
  ctx: { stage: ScriptStage; shareToken: string | null; liveDoc: ScriptDoc },
): TeamScriptReview {
  const latest = state.versions.at(-1) ?? null;
  const approval = approvalOf(state.events, latest?.number ?? null);
  return {
    stage: ctx.stage,
    shareToken: ctx.shareToken,
    latest: latest ? { number: latest.number, scope: latest.scope, sharedAt: latest.sharedAt } : null,
    comments: state.comments,
    removedShots: removedShots(state.versions, ctx.liveDoc),
    activity: buildActivity(state.events, state.comments),
    approval,
    commentsOpen: commentsOpen(latest, approval),
    feedbackCount: feedbackCount(state.comments, state.events),
  };
}

/** The library card's count (spec 4 §6), the same rule as feedbackCount, for every script at once. */
export function tallyFeedback(commentScriptIds: string[], approvalScriptIds: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of [...commentScriptIds, ...approvalScriptIds]) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}
