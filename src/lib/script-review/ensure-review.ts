// src/lib/script-review/ensure-review.ts
import "server-only";
import { MAX_CODE_EXTRA, shareCodeFor } from "@/lib/client-review/token";
import { ShareCodeTakenError } from "@/lib/db/client-reviews";
import { getScriptReviewForScript, insertScriptReview, ScriptReviewExistsError } from "@/lib/db/script-reviews";
import type { ScriptReviewRow } from "./wire";

/** The script's one review row, made on its first share (spec 4 §7: one link for every version).
 *  The code is D311's: the first 4 hex characters of the script id, one longer per clash. */
export async function ensureScriptReview(input: { scriptId: string; clientId: string; createdBy: string }): Promise<ScriptReviewRow> {
  const existing = await getScriptReviewForScript(input.scriptId);
  if (existing) return existing;
  for (let extra = 0; extra <= MAX_CODE_EXTRA; extra++) {
    try {
      return await insertScriptReview({ ...input, shareToken: shareCodeFor(input.scriptId, extra) });
    } catch (e) {
      if (e instanceof ShareCodeTakenError) continue;
      if (e instanceof ScriptReviewExistsError) {
        const made = await getScriptReviewForScript(input.scriptId);
        if (made) return made;
      }
      throw e;
    }
  }
  throw new Error("Could not make a link for this script.");
}
