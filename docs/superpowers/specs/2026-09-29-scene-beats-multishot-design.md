# Scene beats: the parser pre-splits each scene for multishot

**Date:** 2026-09-29 · **ADR:** D286 (refines D278, D267) · **Status:** approved design

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

A split also raises a voiceover problem. Today (D267) every VO line rides exactly one cut and is
appended to that cut's beat in the prompt. A line that runs across a whole scene, placed on one 2s
cut, asks the video model to speak a 6s sentence inside 2 seconds — rushed or cut off at the next
cut. A line cannot be split mid-sentence either.

## Decisions

- **Split rule: script-signalled only.** A scene is split only where the script itself implies
  cuts — a montage, "A → B → C", "quick cuts of X, Y, Z", "cut to", several distinct camera
  setups. A continuous action is exactly one beat. The parser never invents shots and never
  splits to fit a model's window.
- **Stale badge policy: keep the old badge, re-split on toggle.** Editing a scene does not trigger
  any call. The badge keeps reflecting the last split; turning multishot on checks freshness and
  re-splits that one scene if it changed.
- **VO: span the sequence unless tied.** A line sits on one beat only when the script ties it to
  that visual (written under it, or its timecode falls inside it). Every other line plays over the
  whole multishot sequence: stored once on the Multishot node, rendered once in the prompt header.
  A line is never split.

## 1. Data

### Beats on each scene row

`ReelShot` (`src/lib/nodes/reel-script.ts`) gains two optional fields:

```ts
/** D286 — the parser's suggested cut list for this scene. Internal: never rendered on the Script. */
beats?: SceneBeat[];
/** D286 — fingerprint of the row (description, duration_seconds, voiceover) the beats were split from. */
beatsFor?: string;

/** `voiceover` holds only the lines the script TIES to this beat. */
export type SceneBeat = { description: string; duration_seconds: number; voiceover?: VoLine[] };
```

- Absent `beats` = never split (a pre-v10 parse). `beats` of length 1 = split, continuous scene.
- `sceneFingerprint(row)` (pure, `src/lib/nodes/scene-beats.ts`) returns
  `` `${duration_seconds}|${description.trim()}|${JSON.stringify(voiceover ?? null)}` ``. It is
  the single definition used by the server (stamping) and the client (freshness check).
- A scene's **spanning lines** are its lines not tied to any beat. They are derived, not stored on
  the row: the row's `voiceover` stays the complete list, as D267 checks it.

The Script document UI does not render beats, and editing a row does not touch them — a stale
`beatsFor` is what marks them out of date.

**Re-split results live in a cache on the Script node's own data, not in `parsed`.**
`ScriptNodeData.sceneBeats?: Record<fingerprint, SceneBeat[]>`. `parsed` is the active version's
output (D19) — writing it means rewriting the version and reseeding the focus view's draft, which
would drop the operator's unsaved edits. The cache is autosaved like `groupModes`, keyed by
fingerprint so it is self-validating, and pruned on every write to fingerprints of the current
rows. `beatsForScene(row, cache)` answers `{ beats, fresh }`: the row's own beats when their
`beatsFor` matches, else a cache hit (fresh), else the row's stale beats (`fresh: false`).

### Sequence voiceover on the Multishot node

`MultishotNodeData.sequenceVoiceover?: VoLine[]` — lines that play over the whole ladder. Absent
or `[]` = none. Cuts keep their own `voiceover` for tied lines, unchanged from D267.

## 2. Parse v10

`src/prompts/script-parse.ts`:

- Each `visual_script.shots[]` item gains a required `beats` array in the strict schema:
  `{ description, duration_seconds (integer), voiceover (same VO item shape) }`.
- A new exported constant `SCENE_SPLIT_RULES` holds the splitting rules; the parse system prompt
  composes it, and the split route (§4) imports it. Rules:
  - Split only where the scene's own text signals separate cuts (list above). Otherwise one beat
    whose description is the scene's description.
  - Each beat's description is the visual of that cut only, in the script's words, carrying the
    scene's subject naming (beats describe the row's *final*, possibly signal-rewritten,
    description).
  - Beat `duration_seconds` add up to the scene's `duration_seconds`; when the script gives no
    per-beat timing, share evenly.
  - A VO line goes on a beat ONLY when the script ties it to that beat. A line that runs across
    the scene, or that the script does not tie to one visual, goes on NO beat — it plays over the
    whole sequence. Never split, repeat or invent a line.
- The row itself is unchanged: still one row per scene, description as written, `voiceover` the
  full list (D278, D267 hold).
- Version bumps to 10, with a history note alongside v9's.

After the model returns, the parse route runs `stampSceneBeats`, which applies `normalizeBeats`
to every row and stamps `beatsFor = sceneFingerprint(row)`.

### `normalizeBeats(row, raw): SceneBeat[]` (pure, `normalize-beats.ts`)

- Empty or missing beats → one beat mirroring the row (with the row's lines).
- Lengths: round each beat to an integer ≥ `MIN_CUT_SECONDS` (import from `multishot-cuts.ts`),
  then adjust so the sum equals `shotSeconds(row)`: add/remove the difference on the longest beat,
  never below the floor. If the row is shorter than `beats.length × floor`, keep the floored beats
  (the ladder states the violation later, per D237 — never silently clamp).
- Tied lines: valid only if, read in beat order, they are an in-order subsequence of the row's
  lines (by text) with none repeated and none invented. Otherwise every beat's lines are dropped —
  all of the scene's lines then span the sequence, which is the safe reading.
- `voiceover: undefined` on the row means undefined on every beat (the `[]` vs absent distinction
  `cutsFromShots` keeps); otherwise a beat with no tied line gets `[]`.

## 3. Recommendation

`describeGenerations` (`group-shots.ts`): `recommendMultishot = cutCount > 1`, where
`Generation.cutCount` (new) is `beatsForScene(row, cache).beats?.length ?? 1` for a single-row
generation and `shotIndexes.length` otherwise. `describeGenerations` takes the cache as an optional
fourth argument. The stale split still drives it (policy above); a cache hit wins over stale row
beats. v1/v2 behave as before (row count). A pre-v10 parse shows no badge.

`GenerationBracket`'s tooltip reason uses `cutCount` ("3 shots. Multishot generates them as one
sequence…").

## 4. Split route

`POST /api/nodes/:id/split-scene` (`src/app/api/nodes/[id]/split-scene/route.ts`), the Script
node's id.

- Body: `{ scene: { description, duration_seconds, voiceover }, slices? }`. Stateless: the client
  sends the row it holds. 400 when `description` is empty or `duration_seconds` is not a positive
  number.
- New versioned prompt record `src/prompts/scene-split.ts` (`id: "scene-split"`, `version: 1`,
  `model: "gpt-5.4-mini"`, strict JSON schema `{ beats: [...] }`) whose system text imports
  `SCENE_SPLIT_RULES`. Client KB context is composed as in parse.
- Uses `withNode`, `withTryCatch`, `apiOk` / `apiError`. Returns `{ beats, beatsFor }` after
  `normalizeBeats` + `sceneFingerprint`.
- Does not insert a node version: the script did not change.

## 5. Turning multishot on

`multishotSeedFor(row, cache): { rows: ReelShot[]; sequenceVoiceover?: VoLine[] }`
(`scene-beats.ts`):

- 2+ FRESH beats → `rows` are the beats (each carrying its tied lines) and `sequenceVoiceover` is
  the row's lines no beat carries (omitted when there are none).
- Otherwise → `rows: [row]`, no `sequenceVoiceover` (a single cut keeps its lines on the cut,
  exactly as today). Stale beats are never turned into cuts.

**Toggle (`GenerationBracket`, a single-row generation, turning ON):**

1. Beats fresh → proceed.
2. Stale or missing → call `split-scene` with the stored row. While pending the Switch is disabled
   and shows a small spinner; the downstream-disconnect dialog (if any) is confirmed first, then
   the split runs. On success, `cacheSceneBeats(scriptNodeId, fingerprint, beats)` writes the
   cache. On failure, toast "Couldn't split this scene — added as one cut" and proceed.
3. `setGenerationMode(...)` as today.

**`setGenerationMode` / fan-out (`canvas-store.ts`):** a single-row group is seeded through
`multishotSeedFor(row, data.sceneBeats)`: its rows become the cuts and its `sequenceVoiceover` is
written to the new Multishot node. `shotDataToMultishot` takes the sequence lines as a third
argument. Fan-out makes no network call: a generation already set to multishot with stale beats
fans out as one cut.

**Turning multishot OFF:** `multishotDataToShot` merges the cuts into one take as today; the
take's `voiceover` is the sequence lines followed by the cuts' lines. (When a scene mixes spanning
and tied lines their original interleaving is not kept — the merged take reads spanning lines
first. All-spanning and all-tied scenes round-trip exactly.)

## 6. Sequence voiceover in the prompt

- `renderPlan(plan, cuts, cap, refIds, sequenceVoiceover?)` renders the look, then one line
  `Across every shot — <renderVoiceover(lines)>`, then the ladder, each separated by a blank line.
  On Kling (`triple`) a `;` in that line becomes `,`, as in beats, so it cannot end a shot early.
  An empty list renders nothing.
- `checkPlanLimits(…, sequenceVoiceover?)` measures the whole prompt with it (it is sent). Per-cut
  budgets are unaffected: the line is not in any beat.
- `buildMultishotUserTurn` gets `sequenceVoiceover?` and tells the writer, above the shots, that
  these lines play over every shot (via `describeVoLineForWriter`) — so it keeps faces silent for
  narration — and that it must not write the words into any beat.
- Every caller that reads a Multishot node's `cuts` also reads `sequenceVoiceover` through one
  helper, `readVoLines(value)` in `voiceover.ts` (drops malformed entries; `undefined` for a
  non-array): `resolveMultishotPromptInputs`, `resolveVideoGenPrompt` (returned beside `cuts` for
  the video-generate route's `checkPlanLimits`), the upstream-images route, the multishot-prompt
  route's final `renderPlan`, and the Multishot Prompt focus view (via its node).
- `getNodeOutput` for a Multishot node prints the sequence lines above the shot list.

**Risk, stated:** Kling's API has no slot for sequence-level prose; the header line rides with the
look, which is already the spec's acknowledged guess (§6 of the Kling spec). Off-screen narration
is the expected case. If a real generation shows the line ignored or spoken only in shot 1, the
fallback is to put the line on the first cut with the others marked silent — decided then, on
evidence.

## 7. Multishot focus view

- `MultishotDraft` gains `sequenceVoiceover?: VoLine[]`; `commitDraft` writes it (spread, never as
  `undefined`), so Save and Cancel cover it like the cuts.
- A "Voiceover · whole sequence" lane above the cut strip, with the existing `VoLinesEditor`,
  shown when there are lines or the view is editable (same rule as a cut's lane). Moving a line
  between the sequence and a cut is out of scope — the operator deletes it in one place and adds
  it in the other.

## 8. Out of scope

- Kling's 6-cut cap and model windows: a split over a model's limits is reported by
  `checkLadder`, not prevented at split time.
- Showing or editing beats on the Script node.
- Re-splitting on edit, or a manual "re-split" action.
- Migrating v1/v2 canvases or backfilling beats on existing v3 parses.
- Drag-moving VO lines between the sequence lane and a cut.

## 9. Testing

Unit (vitest, node env):
- `normalizeBeats`: sum correction up and down, floor, too-short row; tied lines kept when an
  in-order subsequence, dropped when out of order / repeated / invented; undefined vs `[]`.
- `sceneFingerprint`, `beatsForScene`, `multishotSeedFor` (spanning lines derived; 1 beat or stale
  → `[row]`), `pruneBeatCache`.
- `describeGenerations` v3: recommends for 2+ beats, not for 1 or absent; cache hit wins.
- canvas-store: flip-on and fan-out build N cuts from N beats and write `sequenceVoiceover`;
  stale → one cut; flip-off merges sequence lines back.
- `renderPlan` in all three formats with and without sequence lines; `checkPlanLimits` counts it;
  `buildMultishotUserTurn` states it; `readVoLines`; `getNodeOutput`; `resolveVideoGenPrompt`
  returns it; `commitDraft` / `draftIsDirty` with it.
- `scriptParsePrompt` schema requires `beats`; system text contains `SCENE_SPLIT_RULES`.

Route (`split-scene/route.test.ts`, mocked OpenAI): happy path normalises and stamps; empty
description 400; KB miss 404; model error → 500.
