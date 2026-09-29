// D286 — a scene's suggested cuts, and whether they still describe the scene.
//
// Type-only imports on purpose: group-shots.ts imports this module for the recommendation, so
// anything here that needed group-shots would be a cycle. The server-side clean-up that DOES need
// `shotSeconds` lives in normalize-beats.ts.
import type { ReelShot, SceneBeat, VoLine } from "./reel-script";

/**
 * Re-split results, keyed by the fingerprint of the row they were split from. Lives on the
 * Script node's own data — never in `parsed`, which is the active version's output (D19).
 * Keyed by fingerprint so a hit is valid by construction.
 */
export type SceneBeatCache = Record<string, SceneBeat[]>;

/** What a Multishot node is seeded from for one scene: its cut rows, and lines spanning them all. */
export type MultishotSeed = { rows: ReelShot[]; sequenceVoiceover?: VoLine[] };

/**
 * What a split depends on: the scene's text, its length and its lines. Anything else on the row
 * (the free-text `duration` label, `clip`, the beats themselves) can change without making the
 * beats wrong. `null` vs `[]` voiceover serialise differently, which keeps "no key" and "no lines"
 * apart.
 */
export function sceneFingerprint(row: ReelShot): string {
  return `${row.duration_seconds ?? ""}|${(row.description ?? "").trim()}|${JSON.stringify(
    row.voiceover ?? null,
  )}`;
}

/**
 * The beats for a scene and whether they describe it as it is now. A cache hit wins over stale
 * row beats; stale row beats are still returned (the badge keeps using them, per D286) but marked
 * `fresh: false` so nothing turns them into cuts.
 */
export function beatsForScene(
  row: ReelShot,
  cache?: SceneBeatCache,
): { beats: SceneBeat[] | undefined; fresh: boolean } {
  const fingerprint = sceneFingerprint(row);
  if (row.beats && row.beatsFor === fingerprint) return { beats: row.beats, fresh: true };
  const cached = cache?.[fingerprint];
  if (cached) return { beats: cached, fresh: true };
  return { beats: row.beats, fresh: false };
}

/**
 * What ONE scene seeds a Multishot node with. With 2+ fresh beats: a cut row per beat, carrying
 * the lines the script tied to it, and the scene's remaining lines as the sequence voiceover — in
 * script order, never split. Otherwise the scene is one cut that keeps all its lines, exactly as
 * before D286. Stale beats describe text the scene no longer has, so they are never used here.
 *
 * Spanning lines are matched in order by text. `normalizeBeats` guarantees the beats' lines are an
 * in-order subsequence of the row's, which is what makes a single forward walk correct.
 */
export function multishotSeedFor(row: ReelShot, cache?: SceneBeatCache): MultishotSeed {
  const { beats, fresh } = beatsForScene(row, cache);
  if (!fresh || !beats || beats.length < 2) return { rows: [row] };

  const rows = beats.map((b) => ({
    description: b.description,
    duration_seconds: b.duration_seconds,
    ...(b.voiceover !== undefined ? { voiceover: b.voiceover } : {}),
  }));

  const tied = beats.flatMap((b) => (b.voiceover ?? []).map((l) => l.text));
  let next = 0;
  const spanning = (row.voiceover ?? []).filter((line) => {
    if (next < tied.length && line.text === tied[next]) {
      next += 1;
      return false;
    }
    return true;
  });

  return spanning.length > 0 ? { rows, sequenceVoiceover: spanning } : { rows };
}

/** The cache after adding one split, keeping only entries some current row still matches. */
export function pruneBeatCache(
  cache: SceneBeatCache | undefined,
  rows: ReelShot[],
  fingerprint: string,
  beats: SceneBeat[],
): SceneBeatCache {
  const live = new Set(rows.map(sceneFingerprint));
  const next: SceneBeatCache = {};
  for (const [key, value] of Object.entries(cache ?? {})) {
    if (live.has(key)) next[key] = value;
  }
  next[fingerprint] = beats;
  return next;
}
