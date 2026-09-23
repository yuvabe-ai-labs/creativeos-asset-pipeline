import type { ReelScript } from "@/lib/nodes/reel-script";
import { shotSeconds } from "@/lib/nodes/group-shots";

/** Past this, the default single-take models (Veo 8s, Omni 10s) cannot hold a take. Not a clamp
 * (D277) — just the threshold `generation-bracket.tsx` uses to recommend multishot. */
export const SHOT_MAX_SECONDS = 10;

/**
 * The duration a Shot's own beats add up to.
 *
 * Returns null when there is nothing to derive from, so the caller keeps the param's own default
 * rather than inventing a number — an undefined script is not a 3-second shot.
 */
export function deriveShotDuration(script: ReelScript | null | undefined): number | null {
  const shots = script?.visual_script?.shots ?? [];
  if (shots.length === 0) return null;
  const total = shots.reduce((sum, shot) => sum + shotSeconds(shot), 0);
  // D277 — NOT clamped to a model's window. The script states the length; a model that cannot
  // take it reports that itself (checkLadder, the video params' own limits). Clamping here handed
  // a 14s scene to a 10s request with nothing said.
  return Math.round(total);
}
