import type { ReelScript } from "@/lib/nodes/reel-script";
import { shotSeconds, OMNI_MIN_SECONDS, OMNI_MAX_SECONDS } from "@/lib/nodes/group-shots";

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
  return Math.min(OMNI_MAX_SECONDS, Math.max(OMNI_MIN_SECONDS, Math.round(total)));
}
