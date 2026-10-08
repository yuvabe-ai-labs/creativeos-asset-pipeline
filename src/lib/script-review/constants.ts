// src/lib/script-review/constants.ts
// Script copilot spec 4 — client review of a script (D348–D357). Limits shared with the video
// review links (D309) are imported from @/lib/client-review/constants where used, never redeclared.
import { AVATAR_VIEWS, AVATAR_VIEW_LABELS } from "@/lib/avatars/constants";
import type { AvatarViewId } from "@/lib/avatars/schema";
import type { ScriptStage } from "@/lib/scripts/constants";

/** What a share includes (spec 4 §3 step 2). */
export const SHARE_SCOPES = ["script", "avatars", "panels"] as const;
export type ShareScope = (typeof SHARE_SCOPES)[number];

export const SHARE_SCOPE_LABEL: Record<ShareScope, string> = {
  script: "Script only",
  avatars: "Script and avatars",
  panels: "Script, avatars and panels",
};

/** The same, as words inside a sentence: "Shared, version 1 · the script". */
export const SHARE_SCOPE_PHRASE: Record<ShareScope, string> = {
  script: "the script",
  avatars: "the script and avatars",
  panels: "the script, avatars and panels",
};

export function isShareScope(value: unknown): value is ShareScope {
  return typeof value === "string" && (SHARE_SCOPES as readonly string[]).includes(value);
}

export function scopeIncludes(scope: ShareScope, what: "avatars" | "panels"): boolean {
  return what === "avatars" ? scope !== "script" : scope === "panels";
}

/** Spec 4 §8: Approve appears only on a full share. */
export const FULL_SHARE: ShareScope = "panels";

/** Spec 3 owns the four views (D340); spec 4 comments on each. Spec 3's list, under spec 4's names. */
export { AVATAR_VIEWS };
export type AvatarView = AvatarViewId;
export const AVATAR_VIEW_LABEL: Record<AvatarView, string> = AVATAR_VIEW_LABELS;

export function isAvatarView(value: unknown): value is AvatarView {
  return typeof value === "string" && (AVATAR_VIEWS as readonly string[]).includes(value);
}

export const SCRIPT_REVIEW_EVENT_KINDS = ["moved_to_review", "moved_back", "shared", "approved", "reopened"] as const;
export type ScriptReviewEventKind = (typeof SCRIPT_REVIEW_EVENT_KINDS)[number];

export function isScriptReviewEventKind(value: unknown): value is ScriptReviewEventKind {
  return typeof value === "string" && (SCRIPT_REVIEW_EVENT_KINDS as readonly string[]).includes(value);
}

/** Spec 4 §3 and §8: the stage moves the team makes here. "reopen" is spec 4's Approved → Visualise,
 *  labelled so it never reads as spec 3's Reopen (Visualise → Generate). In review → Approved is the
 *  client's, through the approve route, never a team move. */
export const TEAM_STAGE_MOVES = {
  to_review: { from: "visualise", to: "in_review", event: "moved_to_review", label: "Move to In review" },
  back_to_visualise: { from: "in_review", to: "visualise", event: "moved_back", label: "Move back to Visualise" },
  reopen: { from: "approved", to: "visualise", event: "reopened", label: "Reopen to Visualise" },
} as const satisfies Record<string, { from: ScriptStage; to: ScriptStage; event: ScriptReviewEventKind; label: string }>;

export type TeamStageMove = keyof typeof TEAM_STAGE_MOVES;

export function isTeamStageMove(value: unknown): value is TeamStageMove {
  return typeof value === "string" && (Object.keys(TEAM_STAGE_MOVES) as string[]).includes(value);
}

export function teamMovesFrom(stage: ScriptStage): TeamStageMove[] {
  return (Object.keys(TEAM_STAGE_MOVES) as TeamStageMove[]).filter((m) => TEAM_STAGE_MOVES[m].from === stage);
}

export const APPROVED_RECORD_ERROR = "This reel is approved. The link is now a record and takes no more comments.";
export const STALE_VERSION_ERROR = "A newer version was shared. Reload to see it.";
export const COMMENT_LIMIT_ERROR = "This review has reached its comment limit.";
export const PART_NOT_IN_VERSION_ERROR = "That part is not in this version.";
