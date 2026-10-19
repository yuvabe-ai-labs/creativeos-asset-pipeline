import "server-only";
import { getPickedPanels } from "@/lib/script-review/bridge";
import type { Script } from "./schema";
import { storyboardFor, type StoryboardPanel } from "./storyboard";

/** D385 (refining D381) — an approved script's storyboard as it is now: each shot's current pick,
 *  not the panels frozen in the approved version, because the designer may change the storyboard
 *  after approval. Named by the script's own order, the order `printScript` writes; a pick for a
 *  shot the script no longer has is left out. Not approved, or no picks: []. A storyboard that
 *  cannot be read is also []: the script still reaches the canvas, as a script without a
 *  storyboard (spec §3), rather than not at all. */
export async function loadCurrentStoryboard(script: Script): Promise<StoryboardPanel[]> {
  if (script.stage !== "approved") return [];
  try {
    return storyboardFor(script.doc, await getPickedPanels(script.id));
  } catch (e) {
    console.warn(`[scripts] no storyboard for script ${script.id}: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
