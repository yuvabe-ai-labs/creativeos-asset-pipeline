// D286 — the server's clean-up of a model's scene split. The model is asked to make beat lengths
// add up; this makes it true whatever it returned, so every consumer downstream can rely on it.
import type { ReelScript, ReelShot, SceneBeat } from "./reel-script";
import { shotSeconds } from "./group-shots";
import { MIN_CUT_SECONDS } from "./multishot-cuts";
import { sceneFingerprint } from "./scene-beats";

function indexOfLongest(values: number[]): number {
  return values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
}

/**
 * Whole seconds, each at least MIN_CUT_SECONDS, summing to the scene's length — the difference
 * goes to (or comes from) the longest beat. A scene too short for its beats' floors keeps the
 * floors: the ladder states that violation later, it is never silently clamped (D237).
 *
 * Only `description` and `duration_seconds` survive: beats are visual only, so anything else a
 * model returns (a stray voiceover from an older prompt) is dropped here.
 */
export function normalizeBeats(row: ReelShot, raw: SceneBeat[] | undefined): SceneBeat[] {
  const total = Math.max(MIN_CUT_SECONDS, Math.round(shotSeconds(row)));
  if (!raw || raw.length === 0) {
    return [{ description: row.description ?? "", duration_seconds: total }];
  }

  const seconds = raw.map((b) =>
    Math.max(MIN_CUT_SECONDS, Math.round(Number(b.duration_seconds) || 0)),
  );
  let diff = total - seconds.reduce((sum, s) => sum + s, 0);
  while (diff !== 0) {
    const i = indexOfLongest(seconds);
    if (diff > 0) {
      seconds[i] += diff;
      diff = 0;
    } else {
      const room = seconds[i] - MIN_CUT_SECONDS;
      if (room <= 0) break;
      const take = Math.min(room, -diff);
      seconds[i] -= take;
      diff += take;
    }
  }

  return raw.map((b, i) => ({
    description: (b.description ?? "").trim(),
    duration_seconds: seconds[i],
  }));
}

/** Normalise every row's beats and stamp the fingerprint of the row as the parse returned it. */
export function stampSceneBeats(script: ReelScript): ReelScript {
  const shots = script.visual_script?.shots;
  if (!shots) return script;
  return {
    ...script,
    visual_script: {
      ...script.visual_script,
      shots: shots.map((s) => ({
        ...s,
        beats: normalizeBeats(s, s.beats),
        beatsFor: sceneFingerprint(s),
      })),
    },
  };
}
