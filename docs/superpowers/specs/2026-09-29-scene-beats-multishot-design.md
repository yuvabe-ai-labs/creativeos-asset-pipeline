# Scene beats: the parser pre-splits each scene for multishot

**Date:** 2026-09-29 · **ADR:** D286 (refines D278) · **Status:** approved design

## Problem

Since grouping v3 (D278) every parsed scene is one row and one generation. Two consequences:

1. **Turning multishot on does not split anything.** `setGenerationMode` builds cuts from the
   generation's script rows — one row — so the Multishot node arrives with a single cut and the
   operator splits the scene by hand.
2. **The recommendation never fires.** `describeGenerations` hard-codes
   `recommendMultishot: false` under v3, because the only signal it had ("this generation spans
   more than one row") can no longer be true. A scene that is plainly a montage gets no nudge.

D278 rejected letting the parser decide where cuts fall inside a scene. This design reverses that
rejection in a bounded way: the parser *suggests* cuts, stores them out of sight, and they are
applied only when the operator turns multishot on.

## Decisions

- **Split rule: script-signalled only.** A scene is split only where the script itself implies
  cuts — a montage, "A → B → C", "quick cuts of X, Y, Z", "cut to", several distinct camera
  setups. A continuous action is exactly one beat. The parser never invents shots and never
  splits to fit a model's window.
- **Stale badge policy: keep the old badge, re-split on toggle.** Editing a scene does not trigger
  any call. The badge keeps reflecting the last split; turning multishot on checks freshness and
  re-splits that one scene if it changed.

## 1. Data: `beats` on each scene row

`ReelShot` (`src/lib/nodes/reel-script.ts`) gains two optional fields:

```ts
/** D286 — the parser's suggested cut list for this scene. Internal: never rendered on the Script. */
beats?: SceneBeat[];
/** D286 — fingerprint of the row (description, duration_seconds, voiceover) the beats were split from. */
beatsFor?: string;

export type SceneBeat = { description: string; duration_seconds: number; voiceover?: VoLine[] };
```

- Absent `beats` = never split (a pre-v10 parse). `beats` of length 1 = split, continuous scene.
- `sceneFingerprint(row)` (pure, in a new `src/lib/nodes/scene-beats.ts`) returns
  `` `${duration_seconds}|${description.trim()}|${JSON.stringify(voiceover ?? null)}` ``. It is
  the single definition used by the server (stamping) and the client (freshness check).
- `beatsAreFresh(row)` = `beats` present and `beatsFor === sceneFingerprint(row)`.

The Script document UI does not render beats, and editing a row does not touch them — a stale
`beatsFor` is what marks them out of date.

## 2. Parse v10

`src/prompts/script-parse.ts`:

- Each `visual_script.shots[]` item gains a required `beats` array in the strict schema:
  `{ description, duration_seconds (integer), voiceover (same VO item shape) }`.
- A new exported constant `SCENE_SPLIT_RULES` holds the splitting rules; the parse system prompt
  composes it into the `visual_script` field description, and the split route (§4) imports it.
  Rules:
  - Split only where the scene's own text signals separate cuts (list above). Otherwise one beat
    whose description is the scene's description.
  - Each beat's description is the visual of that cut only, in the script's words, carrying the
    scene's subject naming (so the market-signal SETTING_ONLY rules still hold per beat — beats
    describe the row's *final*, possibly rewritten, description).
  - Beat `duration_seconds` add up to the scene's `duration_seconds`; when the script gives no
    per-beat timing, spread evenly.
  - Every VO line of the scene goes to exactly one beat, verbatim, in order; none dropped,
    none repeated, none invented.
- The row itself is unchanged: still one row per scene, description as written (D278 holds).
- Version bumps to 10, with a history note alongside v9's.

After the model returns, the parse route runs `normalizeBeats(row)` on every row and stamps
`beatsFor = sceneFingerprint(row)`.

### `normalizeBeats(row): SceneBeat[]` (pure, `scene-beats.ts`)

- Empty or missing beats → one beat mirroring the row.
- Round each beat to an integer ≥ `MIN_CUT_SECONDS` (import from `multishot-cuts.ts`), then
  adjust so the sum equals the row's `shotSeconds(row)`: add/remove the difference on the longest
  beat, never taking any beat below the floor. If the row is shorter than `beats.length × floor`,
  keep the floored beats (the ladder states the violation later, per D237 — never silently clamp).
- VO conservation: if the multiset of beat line texts ≠ the row's line texts (in order), drop the
  beats' lines and put the row's `voiceover` on the first beat. `voiceover: undefined` on the row
  means undefined on every beat (the `[]` vs absent distinction `cutsFromShots` keeps).

## 3. Recommendation

`describeGenerations` (`group-shots.ts`): under v3,
`recommendMultishot = (shots[group.shotIndexes[0]].beats?.length ?? 0) > 1`. The stale split
still drives it (policy above). v1/v2 keep their current rule. A pre-v10 parse shows no badge.

`GenerationBracket`'s tooltip reason for v3 names the beat count ("3 cuts in this scene. Multishot
generates them as one sequence…"); the seconds-based branch stays.

## 4. Split route

`POST /api/nodes/:id/split-scene` (`src/app/api/nodes/[id]/split-scene/route.ts`), the Script
node's id.

- Body: `{ scene: { description, duration_seconds, voiceover } }`. Stateless: the client sends the
  row it holds, so the route does not reload the script. 400 when `description` is empty or
  `duration_seconds` is not a positive number.
- New versioned prompt record `src/prompts/scene-split.ts` (`id: "scene-split"`, `version: 1`,
  `model: "gpt-5.4-mini"`, strict JSON schema `{ beats: [...] }`) whose system text imports
  `SCENE_SPLIT_RULES`. Client KB context is composed as in parse (brand naming / claim words).
- Uses `withNode`, `withTryCatch`, `apiOk` / `apiError`. Returns
  `{ beats, beatsFor }` after `normalizeBeats` + `sceneFingerprint`.
- Does not insert a node version: this is a helper call, not a new parse of the script.

## 5. Turning multishot on

`rowsForMultishot(row): ReelShot[]` (`scene-beats.ts`) — beats (as `ReelShot`s: description,
`duration_seconds`, voiceover) when `beats` has 2+ entries, else `[row]`. It does NOT check
freshness; the caller guarantees it.

**Toggle (`GenerationBracket.handleChange`, v3, turning ON):**

1. Row's beats fresh → proceed.
2. Stale or missing → call `split-scene` with the row. While pending the Switch is disabled and
   shows a small spinner; the downstream-disconnect dialog (if any) is confirmed first, then the
   split runs. On success, write `beats` / `beatsFor` onto that row of `parsed` via
   `updateNodeData`. On failure, toast "Couldn't split this scene — added as one cut" and proceed.
3. `setGenerationMode(...)` as today.

**`setGenerationMode` / fan-out (`canvas-store.ts`):** where cuts are built from script rows —
`shotDataToMultishot(..., scriptRows)` in the flip and `cutsFromShots(groupShots)` in fan-out —
the rows pass through `rowsForMultishot` when the generation is a single v3 scene. Fan-out of a
generation already set to multishot uses the stored beats as-is (stale or not; no network call in
the synchronous store). Turning multishot OFF is unchanged (`multishotDataToShot` merges cuts into
one take).

## 6. Out of scope

- Kling's 6-cut cap and model windows: a split over a model's limits is reported by
  `checkLadder`, not prevented at split time.
- Showing or editing beats on the Script node.
- Re-splitting on edit, or a manual "re-split" action.
- Migrating v1/v2 canvases or backfilling beats on existing v3 parses.

## 7. Testing

Unit (vitest, node env):
- `normalizeBeats`: sum correction up and down, floor, too-short row, VO conservation pass/fail,
  undefined vs `[]` voiceover.
- `sceneFingerprint` / `beatsAreFresh`: unchanged row fresh; description, duration or VO edit stale;
  missing beats stale.
- `rowsForMultishot`: 1 beat → `[row]`, 3 beats → 3 rows with VO carried.
- `describeGenerations` v3: recommends for 2+ beats, not for 1 or absent.
- canvas-store: flip-on and fan-out build N cuts from N beats; flip-off unchanged.
- `scriptParsePrompt` schema requires `beats`; system text contains `SCENE_SPLIT_RULES`.

Route (`split-scene/route.test.ts`, mocked OpenAI): happy path normalises and stamps; empty
description 400; model error → `apiError` 500.
