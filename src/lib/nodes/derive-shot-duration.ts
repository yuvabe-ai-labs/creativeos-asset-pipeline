import type { ReelScript } from "@/lib/nodes/reel-script";
import { shotSeconds } from "@/lib/nodes/group-shots";

/**
 * A SINGLE TAKE's window — deliberately not the multishot pack window (D258).
 *
 * Narrower and separately named on purpose. This clamps the duration requested of a single-take
 * video model for one Shot node, where 30s is on offer from no provider. It borrowed group-shots'
 * OMNI_* constants until those became the 30s pack ceiling; sharing them past that point would
 * have started requesting takes nothing can generate.
 */
const SHOT_MIN_SECONDS = 3;
const SHOT_MAX_SECONDS = 10;

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
