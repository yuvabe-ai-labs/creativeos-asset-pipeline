import type { ReelScript } from "@/lib/nodes/reel-script";
import { shotSeconds } from "@/lib/nodes/group-shots";
import { clampTotal, totalOf, type MultishotCut } from "@/lib/nodes/multishot-cuts";

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
  return clampTotal(total);
}

/**
 * The same, for a Multishot node: the ladder's budget IS the duration the request should ask
 * for. `totalOf` and the ladder's own ceiling already keep the two equal by construction (D209),
 * so this is a read, not a second opinion — and clamping through `clampTotal` is what the ladder
 * itself uses when seeding a total.
 *
 * Returns null on an empty ladder, for the same reason the shot path does: no cuts is not a
 * 3-second video, and the caller should keep the model spec's own default.
 */
export function deriveMultishotDuration(cuts: MultishotCut[] | null | undefined): number | null {
  if (!cuts || cuts.length === 0) return null;
  return clampTotal(totalOf(cuts));
}
