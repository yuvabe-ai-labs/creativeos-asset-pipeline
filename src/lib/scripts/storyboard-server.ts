import "server-only";
import { getLatestVersion, getScriptReviewForScript } from "@/lib/db/script-reviews";
import type { Script } from "./schema";
import { storyboardFor, type StoryboardPanel } from "./storyboard";

/** D381 — the panels the client approved. Approval only ever approves the LATEST shared version
 *  (`script_review_approve` returns 'stale' otherwise), so an approved script's latest version
 *  holds them, frozen: a panel redrawn or re-picked since is not this one. Named by the script's
 *  own order, the order `printScript` writes. Not approved, never shared, or nothing frozen: [].
 *  A version that cannot be read (getLatestVersion throws on purpose) is also []: the script still
 *  reaches the canvas, as a script without a storyboard (spec §3), rather than not at all. */
export async function loadApprovedStoryboard(script: Script): Promise<StoryboardPanel[]> {
  if (script.stage !== "approved") return [];
  try {
    const review = await getScriptReviewForScript(script.id);
    if (!review) return [];
    const version = await getLatestVersion(review.id);
    return version ? storyboardFor(script.doc, version.visuals.panels) : [];
  } catch (e) {
    console.warn(`[scripts] no storyboard for script ${script.id}: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
