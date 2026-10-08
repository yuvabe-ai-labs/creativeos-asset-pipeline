import type { ScriptStage } from "@/lib/scripts/constants";

// Spec 3 — the rules for what Visualise may change, in one place.

/** D346 — cast links, panels and picks change while the script is at Visualise, and while it
 *  is In review (spec 4: editing stays allowed; each share is a frozen copy). */
export const VISUALISE_STAGES = ["visualise", "in_review"] as const satisfies readonly ScriptStage[];

export function isVisualiseStage(stage: ScriptStage): boolean {
  return (VISUALISE_STAGES as readonly ScriptStage[]).includes(stage);
}

/** D346 — why an avatar cannot be archived, or null when no live script uses it. */
export function archiveRefusal(usedIn: string[]): string | null {
  if (usedIn.length === 0) return null;
  if (usedIn.length === 1) {
    return `This avatar is in ${usedIn[0]}, so it can't be archived. Change it in that script first.`;
  }
  return `This avatar is in ${usedIn.length} scripts (${usedIn.join(", ")}), so it can't be archived. Change it in those scripts first.`;
}
