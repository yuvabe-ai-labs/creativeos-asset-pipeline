// src/lib/script-review/load.ts
import "server-only";
import { getLatestVersion, getScriptReviewForScript, listScriptComments, listScriptEvents, listVersions } from "@/lib/db/script-reviews";
import type { Script } from "@/lib/scripts/schema";
import { assemblePublic, assembleTeam, type PublicScriptReview, type ReviewState, type TeamScriptReview } from "./assemble";
import type { ScriptReviewByToken, ScriptVersion } from "./wire";

/** Everything a payload needs. A script with no review row yet still has its stage-move events. */
export async function loadReviewState(reviewId: string | null, scriptId: string): Promise<ReviewState> {
  const [versions, comments, events] = await Promise.all([
    reviewId ? listVersions(reviewId) : Promise.resolve([]),
    reviewId ? listScriptComments(reviewId) : Promise.resolve([]),
    listScriptEvents(scriptId),
  ]);
  return { versions, comments, events };
}

/** Shared by the public page (first, server-rendered load) and GET /api/r/s/[token]. It never reads
 *  the live script: the client only ever sees what was shared (spec 4 §3 step 3). */
export async function buildPublicScriptReview(review: ScriptReviewByToken): Promise<PublicScriptReview | null> {
  const state = await loadReviewState(review.id, review.script_id);
  return assemblePublic(state, { stage: review.stage, fromName: review.orgName, forName: review.clientName });
}

/** Spec 4 §6 (review board, 4.17): the version an approved script's page shows — the latest share,
 *  which is the one approved (a share needs In review, so none can follow an approval). Null for a
 *  script approved without a review, such as a seeded one: its page keeps spec 1's view. */
export async function loadApprovedVersion(scriptId: string): Promise<ScriptVersion | null> {
  const review = await getScriptReviewForScript(scriptId);
  return review ? getLatestVersion(review.id) : null;
}

/** The team's review of a script, built on the server for the script page's first render (as the
 *  client page is), so the board draws its Comments column at once instead of reflowing when the
 *  review query lands. The same payload as GET …/scripts/:scriptId/review. */
export async function loadTeamReview(script: Pick<Script, "id" | "stage" | "doc">): Promise<TeamScriptReview> {
  const review = await getScriptReviewForScript(script.id);
  const state = await loadReviewState(review?.id ?? null, script.id);
  return assembleTeam(state, { stage: script.stage, shareToken: review?.share_token ?? null, liveDoc: script.doc });
}
