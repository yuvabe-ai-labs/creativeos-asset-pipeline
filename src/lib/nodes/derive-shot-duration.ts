import type { ReelScript } from "@/lib/nodes/reel-script";
import { shotSeconds } from "@/lib/nodes/group-shots";

/**
 * Gemini Omni's single-take window — deliberately not the multishot pack window (D258).
 *
 * This is the range of the ONE duration D216 pre-fills: `migrateVideoModelState` applies the
 * derived value only when Video Gen's model is the Omni provider, whose slider is 3–10s. Other
 * single-take models are not bounded by it — Seedance 2.5's slider reaches 30s — they simply get
 * no derived default. It borrowed group-shots' OMNI_* constants until those became the 30s pack
 * ceiling; sharing them past that point would have pre-filled durations Omni cannot generate.
 */
const SHOT_MIN_SECONDS = 3;
/** Past this, the default single-take models (Veo 8s, Omni 10s) cannot hold a take. */
export const SHOT_MAX_SECONDS = 10;

/**
 * The duration a Shot's own beats add up to, clamped to what the model accepts.
 *
 * Returns null when there is nothing to derive from, so the caller keeps the param's own default
 * rather than inventing a number — an undefined script is not a 3-second shot.
 */
export function deriveShotDuration(script: ReelScript | null | undefined): number | null {
  const shots = script?.visual_script?.shots ?? [];
  if (shots.length === 0) return null;
  const total = shots.reduce((sum, shot) => sum + shotSeconds(shot), 0);
  return Math.min(SHOT_MAX_SECONDS, Math.max(SHOT_MIN_SECONDS, Math.round(total)));
}
