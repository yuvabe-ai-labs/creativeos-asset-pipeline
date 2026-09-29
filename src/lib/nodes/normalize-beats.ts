// D286 — the server's clean-up of a model's scene split. The model is asked to make beat lengths
// add up and to tie a line to a beat only when the script does; this makes both safe whatever it
// returned, so every consumer downstream can rely on them.
import type { ReelScript, ReelShot, SceneBeat, VoLine } from "./reel-script";
import { shotSeconds } from "./group-shots";
import { MIN_CUT_SECONDS } from "./multishot-cuts";
import { sceneFingerprint } from "./scene-beats";

function indexOfLongest(values: number[]): number {
  return values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
}

/** Beat lines, read in beat order, form an in-order subsequence of the scene's lines. */
function tiesAreValid(rowLines: VoLine[], raw: SceneBeat[]): boolean {
  const tied = raw.flatMap((b) => (b.voiceover ?? []).map((l) => l.text));
  let at = 0;
  for (const text of tied) {
    while (at < rowLines.length && rowLines[at].text !== text) at += 1;
    if (at === rowLines.length) return false;
    at += 1;
  }
  return true;
}

/**
 * Lengths: whole seconds, each at least MIN_CUT_SECONDS, summing to the scene's length — the
 * difference goes to (or comes from) the longest beat. A scene too short for its beats' floors
 * keeps the floors: the ladder states that violation later, it is never silently clamped (D237).
 *
 * Lines: a beat keeps only lines tied to it, and only if all ties together follow the scene's
 * order with none repeated or invented. Otherwise every tie is dropped and all of the scene's lines
 * span the sequence — a line over the whole sequence is always speakable; one parked on the wrong
 * 2s cut is not.
 */
export function normalizeBeats(row: ReelShot, raw: SceneBeat[] | undefined): SceneBeat[] {
  const total = Math.max(MIN_CUT_SECONDS, Math.round(shotSeconds(row)));
  const rowLines = row.voiceover;
  const withLines = (b: Omit<SceneBeat, "voiceover">, lines: VoLine[] | undefined): SceneBeat =>
    rowLines === undefined ? b : { ...b, voiceover: lines ?? [] };

  if (!raw || raw.length === 0) {
    return [withLines({ description: row.description ?? "", duration_seconds: total }, rowLines)];
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

  const keepTies = rowLines !== undefined && tiesAreValid(rowLines, raw);
  return raw.map((b, i) =>
    withLines(
      { description: (b.description ?? "").trim(), duration_seconds: seconds[i] },
      keepTies ? b.voiceover : [],
    ),
  );
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
