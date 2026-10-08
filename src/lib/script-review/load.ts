// src/lib/script-review/load.ts
import "server-only";
import { listScriptComments, listScriptEvents, listVersions } from "@/lib/db/script-reviews";
import { assemblePublic, type PublicScriptReview, type ReviewState } from "./assemble";
import type { ScriptReviewByToken } from "./wire";

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
