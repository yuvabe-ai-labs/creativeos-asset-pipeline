import "server-only";
import type { CallerContext } from "@/lib/dal-logic";
import { getLatestVersion, shareVersion } from "@/lib/db/script-reviews";
import type { Script } from "@/lib/scripts/schema";
import { teamActorName } from "./actor";
import type { ShareScope } from "./constants";
import { ensureScriptReview } from "./ensure-review";
import { diffVersions } from "./version";
import { collectVisuals } from "./visuals";

export type SharedVersion = { number: number; scope: ShareScope; sharedAt: string };
export type ShareNowResult = { ok: true; version: SharedVersion; shareToken: string } | { ok: false; error: string; status: number };

const NOT_IN_REVIEW = "Move the script to In review to share it.";

/** Spec 4 §3 steps 2–4: freezes the script as it is now, with what the scope includes, as the next
 *  version on the script's one link. Used by Share and by the move into In review (D349, refined),
 *  so both freeze a version the same way. The database refuses unless the script is In review. */
export async function shareNow(input: { clientId: string; script: Script; scope: ShareScope; caller: CallerContext }): Promise<ShareNowResult> {
  const { clientId, script, scope, caller } = input;
  const [review, actorName] = await Promise.all([
    ensureScriptReview({ scriptId: script.id, clientId, createdBy: caller.userId }),
    teamActorName(caller),
  ]);
  const prev = await getLatestVersion(review.id);
  const next = { scope, doc: script.doc, visuals: await collectVisuals(clientId, script, scope) };
  const result = await shareVersion({
    reviewId: review.id,
    expectedLatest: prev?.number ?? 0,
    ...next,
    changes: diffVersions(prev, next),
    sharedBy: caller.userId,
    actorName,
  });
  if (result.status !== "ok") {
    return {
      ok: false,
      error: result.status === "stale" ? "Someone else shared a version just now. Reload, then share again." : NOT_IN_REVIEW,
      status: 409,
    };
  }
  const { number, sharedAt } = result.version;
  return { ok: true, version: { number, scope: result.version.scope, sharedAt }, shareToken: review.share_token };
}
