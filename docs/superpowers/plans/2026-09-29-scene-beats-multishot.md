# Scene Beats → Multishot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The script parse pre-splits each scene into suggested cuts ("beats"); the Script node recommends multishot when a scene has 2+ beats; turning multishot on builds the cuts from those beats (re-splitting just that scene when it was edited since the parse); and a VO line that runs across the scene plays over the whole sequence instead of being crammed onto one short cut.

**Architecture:** Parse v10 adds a hidden `beats` list + `beatsFor` fingerprint to every scene row; a beat carries only the VO lines the script ties to it. Pure helpers in `src/lib/nodes/scene-beats.ts` (fingerprint, freshness, seed-for-multishot, cache prune) and `src/lib/nodes/normalize-beats.ts` (server-side clean-up) are shared by the parse route, a new `split-scene` route, the canvas store and the `GenerationBracket` toggle. Re-split results are cached in `ScriptNodeData.sceneBeats` keyed by fingerprint — never written into `parsed` (the active version's output, D19). Untied lines become `MultishotNodeData.sequenceVoiceover`, rendered once in the prompt header by `renderPlan`.

**Tech Stack:** Next.js route handlers, OpenAI chat completions with strict JSON schema (`gpt-5.4-mini`), zustand vanilla store, vitest (node env — no component rendering), shadcn/Base UI components, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-09-29-scene-beats-multishot-design.md` · **ADR:** D286

## Global Constraints

- Split rule: split only where the script signals cuts (montage, "A → B → C", "quick cuts of…", "cut to", separate setups); a continuous scene is exactly 1 beat. Never invent shots; never split to fit a model's window.
- A scene is still exactly one row (D278), and the row's `voiceover` stays the complete list (D267). Beats are never rendered on the Script node.
- VO: a line sits on a beat only when the script ties it to that visual; every other line spans the sequence. A line is never split.
- Stale beats drive the badge but NEVER become cuts. No network call on edit, none in the synchronous store.
- `[]` and absent `voiceover` are different states everywhere (`cutsFromShots` rule).
- Never clamp silently (D237): a beat ladder outside a model's window is reported by `checkLadder`.
- API routes: `withNode`, `apiOk` / `apiError`, `withTryCatch` for the OpenAI call — never `NextResponse.json`.
- UI: shadcn primitives only (`Switch`, `Button`…), Lucide icons at `strokeWidth={1.5}`, no hardcoded colours, `text-eyebrow` for small labels.
- Import, don't redefine: `shotSeconds` (group-shots.ts), `MIN_CUT_SECONDS` (multishot-cuts.ts), `normalizeSlices` / `buildParseContext` (kb/parse-context.ts), `renderVoiceover` / `describeVoLineForWriter` (voiceover.ts).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. One commit per task.
- Run tests per file/directory (`npx vitest run <path>`); the full run has ~11 known timeout flakes in API route tests.

## File Map

| File | Responsibility |
|---|---|
| `src/lib/nodes/reel-script.ts` (modify) | `SceneBeat` type; `beats` / `beatsFor` on `ReelShot` |
| `src/lib/nodes/scene-beats.ts` (create) | Type-only deps: `sceneFingerprint`, `beatsForScene`, `multishotSeedFor`, `pruneBeatCache`, `SceneBeatCache` |
| `src/lib/nodes/normalize-beats.ts` (create) | `normalizeBeats`, `stampSceneBeats` |
| `src/lib/nodes/group-shots.ts` (modify) | `Generation.cutCount`; recommendation from beats |
| `src/prompts/script-parse.ts` (modify) | v10: `beats` in schema; exported `SCENE_SPLIT_RULES`, `voLineSchema`, `sceneBeatSchema` |
| `src/app/api/nodes/[id]/parse/route.ts` (modify) | stamp beats after the model returns |
| `src/prompts/scene-split.ts`, `src/lib/nodes/scene-split.ts`, `src/app/api/nodes/[id]/split-scene/route.ts` (create) | the one-scene split route |
| `src/lib/nodes/voiceover.ts` (modify) | `readVoLines` |
| `src/lib/nodes/multishot-plan.ts` (modify) | sequence VO in `renderPlan` / `checkPlanLimits` |
| `src/lib/nodes/resolve-inputs.ts`, `src/lib/video-gen/resolve-prompt.ts`, `src/lib/nodes/node-output.ts` (modify) | read + pass sequence VO |
| `src/app/api/nodes/[id]/{video-generate,upstream-images,multishot-prompt}/route.ts` (modify) | pass sequence VO to render/check |
| `src/components/nodes/multishot-prompt-node.tsx`, `multishot-prompt-focus-view.tsx` (modify) | pass sequence VO to the preview |
| `src/lib/canvas-nodes.ts` (modify) | `ScriptNodeData.sceneBeats`, `MultishotNodeData.sequenceVoiceover` |
| `src/lib/nodes/multishot-convert.ts` (modify) | carry sequence VO on flip on/off |
| `src/lib/canvas-store.ts` (modify) | `cacheSceneBeats`; seeds cuts + sequence VO from beats |
| `src/lib/nodes/multishot-draft.ts`, `src/components/nodes/multishot-focus-view.tsx`, `multishot-node.tsx` (modify) | edit the sequence VO lane |
| `src/lib/nodes/ensure-scene-beats.ts` (create) | client: `requestSceneSplit`, `ensureSceneBeats` |
| `src/components/nodes/generation-bracket.tsx`, `script-node.tsx`, `script-focus-view.tsx`, `script-document.tsx` (modify) | async toggle; pass `sceneBeats` |

---

### Task 1: Beat types and pure scene-beat helpers

**Files:**
- Modify: `src/lib/nodes/reel-script.ts`
- Create: `src/lib/nodes/scene-beats.ts`
- Test: `src/lib/nodes/__tests__/scene-beats.test.ts`

**Interfaces:**
- Produces:
  - `type SceneBeat = { description: string; duration_seconds: number; voiceover?: VoLine[] }` (reel-script.ts)
  - `ReelShot.beats?: SceneBeat[]`, `ReelShot.beatsFor?: string`
  - `type SceneBeatCache = Record<string, SceneBeat[]>`
  - `sceneFingerprint(row: ReelShot): string`
  - `beatsForScene(row: ReelShot, cache?: SceneBeatCache): { beats: SceneBeat[] | undefined; fresh: boolean }`
  - `type MultishotSeed = { rows: ReelShot[]; sequenceVoiceover?: VoLine[] }`
  - `multishotSeedFor(row: ReelShot, cache?: SceneBeatCache): MultishotSeed`
  - `pruneBeatCache(cache: SceneBeatCache | undefined, rows: ReelShot[], fingerprint: string, beats: SceneBeat[]): SceneBeatCache`

- [ ] **Step 1: Add the types to `reel-script.ts`**

Insert above `export type ReelShot`:

```ts
/**
 * D286 — one suggested cut inside a scene. The parse splits a scene only where the script itself
 * signals cuts; a continuous scene is exactly one beat. Never rendered on the Script node — beats
 * become cuts only when the operator turns multishot on.
 *
 * `voiceover` holds ONLY the lines the script ties to this beat. The scene's other lines span the
 * whole multishot sequence (`MultishotNodeData.sequenceVoiceover`) — never split, never parked on
 * one short cut.
 */
export type SceneBeat = {
  description: string;
  duration_seconds: number;
  voiceover?: VoLine[];
};
```

Add to the end of `ReelShot`'s fields:

```ts
  /** D286 — the parser's suggested cuts for this scene. Absent on a pre-v10 parse. */
  beats?: SceneBeat[];
  /** D286 — `sceneFingerprint` of this row when `beats` were split; a mismatch marks them stale. */
  beatsFor?: string;
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/nodes/__tests__/scene-beats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ReelShot, SceneBeat } from "../reel-script";
import { sceneFingerprint, beatsForScene, multishotSeedFor, pruneBeatCache } from "../scene-beats";

const vo = (text: string) => ({ text, speaker: "narrator" });
const row = (over: Partial<ReelShot> = {}): ReelShot => ({
  description: "Jar on marble → spoon lifts cream → hand smooths it on",
  duration_seconds: 6,
  voiceover: [vo("Meet the jar."), vo("Made slowly, by hand.")],
  ...over,
});
// "Meet the jar." is tied to beat 1; "Made slowly, by hand." is tied to nothing, so it spans.
const THREE: SceneBeat[] = [
  { description: "Jar on marble", duration_seconds: 2, voiceover: [vo("Meet the jar.")] },
  { description: "Spoon lifts cream", duration_seconds: 2, voiceover: [] },
  { description: "Hand smooths it on", duration_seconds: 2, voiceover: [] },
];
const stamped = (over: Partial<ReelShot> = {}): ReelShot => {
  const r = row(over);
  return { ...r, beats: THREE, beatsFor: sceneFingerprint(r) };
};

describe("sceneFingerprint", () => {
  it("is stable for an unchanged row and ignores the beats themselves", () => {
    expect(sceneFingerprint(row())).toBe(sceneFingerprint({ ...row(), beats: THREE }));
  });

  it("changes when the description, length or voiceover changes", () => {
    const base = sceneFingerprint(row());
    expect(sceneFingerprint(row({ description: "Something else" }))).not.toBe(base);
    expect(sceneFingerprint(row({ duration_seconds: 7 }))).not.toBe(base);
    expect(sceneFingerprint(row({ voiceover: [vo("Changed.")] }))).not.toBe(base);
  });

  it("tells an absent voiceover from an empty one", () => {
    expect(sceneFingerprint(row({ voiceover: undefined }))).not.toBe(
      sceneFingerprint(row({ voiceover: [] })),
    );
  });

  it("ignores surrounding whitespace in the description", () => {
    expect(sceneFingerprint(row({ description: "  x  " }))).toBe(
      sceneFingerprint(row({ description: "x" })),
    );
  });
});

describe("beatsForScene", () => {
  it("returns the row's own beats as fresh when the fingerprint matches", () => {
    expect(beatsForScene(stamped())).toEqual({ beats: THREE, fresh: true });
  });

  it("returns stale row beats as not fresh after an edit", () => {
    const edited = { ...stamped(), description: "Edited" };
    expect(beatsForScene(edited)).toEqual({ beats: THREE, fresh: false });
  });

  it("prefers a cache hit for the current fingerprint over stale row beats", () => {
    const edited = { ...stamped(), description: "Edited" };
    const two = THREE.slice(0, 2);
    expect(beatsForScene(edited, { [sceneFingerprint(edited)]: two })).toEqual({
      beats: two,
      fresh: true,
    });
  });

  it("reports a pre-v10 row as having no beats", () => {
    expect(beatsForScene(row())).toEqual({ beats: undefined, fresh: false });
  });
});

describe("multishotSeedFor", () => {
  it("turns 2+ fresh beats into one row each, carrying only their tied lines", () => {
    expect(multishotSeedFor(stamped()).rows).toEqual([
      { description: "Jar on marble", duration_seconds: 2, voiceover: [vo("Meet the jar.")] },
      { description: "Spoon lifts cream", duration_seconds: 2, voiceover: [] },
      { description: "Hand smooths it on", duration_seconds: 2, voiceover: [] },
    ]);
  });

  it("puts the lines no beat carries on the sequence, in script order", () => {
    expect(multishotSeedFor(stamped()).sequenceVoiceover).toEqual([vo("Made slowly, by hand.")]);
  });

  it("omits the sequence lines when every line is tied", () => {
    const r = row({ voiceover: [vo("Meet the jar.")] });
    const seed = multishotSeedFor({ ...r, beats: THREE, beatsFor: sceneFingerprint(r) });
    expect(seed).not.toHaveProperty("sequenceVoiceover");
  });

  it("spans every line when no beat is tied to one", () => {
    const untied = THREE.map((b) => ({ ...b, voiceover: [] }));
    const r = row();
    const seed = multishotSeedFor({ ...r, beats: untied, beatsFor: sceneFingerprint(r) });
    expect(seed.sequenceVoiceover).toEqual(r.voiceover);
  });

  it("keeps the row whole, lines and all, when there is a single beat", () => {
    const r = { ...row(), beats: [THREE[0]], beatsFor: sceneFingerprint(row()) };
    expect(multishotSeedFor(r)).toEqual({ rows: [r] });
  });

  it("never turns stale beats into cuts", () => {
    const edited = { ...stamped(), description: "Edited" };
    expect(multishotSeedFor(edited)).toEqual({ rows: [edited] });
  });

  it("uses fresh cached beats", () => {
    const r = row();
    expect(multishotSeedFor(r, { [sceneFingerprint(r)]: THREE }).rows).toHaveLength(3);
  });

  it("omits voiceover on cuts and the sequence when the scene has no key", () => {
    const r = row({ voiceover: undefined });
    const beats = THREE.map(({ voiceover: _v, ...b }) => b);
    const seed = multishotSeedFor(r, { [sceneFingerprint(r)]: beats });
    expect(seed.rows.every((x) => !("voiceover" in x))).toBe(true);
    expect(seed).not.toHaveProperty("sequenceVoiceover");
  });
});

describe("pruneBeatCache", () => {
  it("adds the new entry and drops keys no current row has", () => {
    const a = row({ description: "a" });
    const b = row({ description: "b" });
    const old = { stale: THREE, [sceneFingerprint(a)]: THREE };
    const next = pruneBeatCache(old, [a, b], sceneFingerprint(b), THREE);
    expect(Object.keys(next).sort()).toEqual([sceneFingerprint(a), sceneFingerprint(b)].sort());
  });

  it("works from an empty cache", () => {
    const a = row();
    expect(pruneBeatCache(undefined, [a], sceneFingerprint(a), THREE)).toEqual({
      [sceneFingerprint(a)]: THREE,
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/scene-beats.test.ts`
Expected: FAIL — cannot resolve `../scene-beats`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/nodes/scene-beats.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/scene-beats.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nodes/reel-script.ts src/lib/nodes/scene-beats.ts src/lib/nodes/__tests__/scene-beats.test.ts
git commit -m "feat(script): scene beat types, freshness and multishot seed helpers (D286)"
```

---

### Task 2: Server-side beat normalisation

**Files:**
- Create: `src/lib/nodes/normalize-beats.ts`
- Test: `src/lib/nodes/__tests__/normalize-beats.test.ts`

**Interfaces:**
- Consumes: `SceneBeat`, `ReelShot`, `ReelScript`; `sceneFingerprint` (Task 1); `shotSeconds` (group-shots.ts); `MIN_CUT_SECONDS` (multishot-cuts.ts)
- Produces:
  - `normalizeBeats(row: ReelShot, raw: SceneBeat[] | undefined): SceneBeat[]`
  - `stampSceneBeats(script: ReelScript): ReelScript`

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/__tests__/normalize-beats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ReelShot, SceneBeat } from "../reel-script";
import { normalizeBeats, stampSceneBeats } from "../normalize-beats";
import { sceneFingerprint } from "../scene-beats";

const vo = (text: string) => ({ text, speaker: "narrator", delivery: "", language: "" });
const row = (over: Partial<ReelShot> = {}): ReelShot => ({
  description: "A → B → C",
  duration_seconds: 9,
  voiceover: [vo("One."), vo("Two.")],
  ...over,
});
const beat = (description: string, duration_seconds: number, lines: string[] = []): SceneBeat => ({
  description,
  duration_seconds,
  voiceover: lines.map(vo),
});
const secs = (beats: SceneBeat[]) => beats.map((b) => b.duration_seconds);
const texts = (beats: SceneBeat[]) => beats.map((b) => b.voiceover?.map((l) => l.text));

describe("normalizeBeats — lengths", () => {
  it("keeps beats that already add up", () => {
    expect(secs(normalizeBeats(row(), [beat("A", 3), beat("B", 3), beat("C", 3)]))).toEqual([3, 3, 3]);
  });

  it("adds a shortfall to the longest beat", () => {
    expect(secs(normalizeBeats(row(), [beat("A", 2), beat("B", 4), beat("C", 1)]))).toEqual([2, 6, 1]);
  });

  it("takes an excess from the longest beat, never below one second", () => {
    expect(secs(normalizeBeats(row(), [beat("A", 8), beat("B", 3), beat("C", 1)]))).toEqual([5, 3, 1]);
  });

  it("rounds and floors model numbers before correcting", () => {
    expect(secs(normalizeBeats(row(), [beat("A", 0), beat("B", 2.6), beat("C", 5.2)]))).toEqual([1, 3, 5]);
  });

  // D237 — a scene shorter than its beats' floors keeps the floors; the ladder states it later.
  it("keeps floored beats when the scene is too short for them", () => {
    expect(secs(normalizeBeats(row({ duration_seconds: 2 }), [beat("A", 1), beat("B", 1), beat("C", 1)]))).toEqual([1, 1, 1]);
  });

  it("uses the assumed length when the row has none", () => {
    expect(secs(normalizeBeats(row({ duration_seconds: undefined }), undefined))).toEqual([4]);
  });
});

describe("normalizeBeats — voiceover", () => {
  it("mirrors the row, lines and all, as one beat when the model returned none", () => {
    expect(normalizeBeats(row(), [])).toEqual([
      { description: "A → B → C", duration_seconds: 9, voiceover: [vo("One."), vo("Two.")] },
    ]);
  });

  it("keeps tied lines that follow the scene's order", () => {
    const out = normalizeBeats(row(), [beat("A", 3, ["One."]), beat("B", 3), beat("C", 3, ["Two."])]);
    expect(texts(out)).toEqual([["One."], [], ["Two."]]);
  });

  // A line on no beat is not lost — it spans the sequence (multishotSeedFor derives it).
  it("keeps a partial tie; the untied line is left to span", () => {
    const out = normalizeBeats(row(), [beat("A", 3), beat("B", 3, ["Two."]), beat("C", 3)]);
    expect(texts(out)).toEqual([[], ["Two."], []]);
  });

  it.each([
    ["out of order", [beat("A", 3, ["Two."]), beat("B", 3, ["One."]), beat("C", 3)]],
    ["repeated", [beat("A", 3, ["One."]), beat("B", 3, ["One."]), beat("C", 3)]],
    ["invented", [beat("A", 3, ["Three."]), beat("B", 3), beat("C", 3)]],
  ])("drops every tie when the lines are %s, so all of them span", (_label, raw) => {
    expect(texts(normalizeBeats(row(), raw))).toEqual([[], [], []]);
  });

  it("leaves voiceover absent on every beat when the scene has no key", () => {
    const out = normalizeBeats(row({ voiceover: undefined }), [beat("A", 4, ["Invented."]), beat("B", 5)]);
    expect(out.every((b) => !("voiceover" in b))).toBe(true);
  });
});

describe("stampSceneBeats", () => {
  it("normalises every row and stamps the fingerprint of the row as parsed", () => {
    const script = { visual_script: { shots: [{ ...row(), beats: [beat("A", 9, ["One.", "Two."])] }] } };
    const shot = stampSceneBeats(script).visual_script!.shots![0];
    expect(shot.beats).toHaveLength(1);
    expect(shot.beatsFor).toBe(sceneFingerprint(row()));
  });

  it("returns a script with no shots unchanged", () => {
    expect(stampSceneBeats({ title: "x" })).toEqual({ title: "x" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/normalize-beats.test.ts`
Expected: FAIL — cannot resolve `../normalize-beats`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/nodes/normalize-beats.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/normalize-beats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/normalize-beats.ts src/lib/nodes/__tests__/normalize-beats.test.ts
git commit -m "feat(script): normalise a scene split's lengths and tied lines (D286)"
```

---

### Task 3: Recommendation from beats

**Files:**
- Modify: `src/lib/nodes/group-shots.ts` (`Generation` type ~line 204, `describeGenerations` ~line 260)
- Modify: `src/components/nodes/generation-bracket.tsx:71`
- Test: `src/lib/nodes/__tests__/group-shots.test.ts`

**Interfaces:**
- Consumes: `beatsForScene`, `SceneBeatCache` (Task 1)
- Produces:
  - `Generation.cutCount: number`
  - `describeGenerations(shots, overrides?, groupingVersion = 1, beatCache?: SceneBeatCache): Generation[]`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/nodes/__tests__/group-shots.test.ts` (add `import { sceneFingerprint } from "../scene-beats";` to the imports):

```ts
describe("v3 recommendation from scene beats (D286)", () => {
  const scene = (beats?: number, extra: Record<string, unknown> = {}) => {
    const row = { description: "A → B", duration_seconds: 6, ...extra };
    if (beats === undefined) return row;
    return {
      ...row,
      beats: Array.from({ length: beats }, (_, i) => ({ description: `b${i}`, duration_seconds: 1 })),
      beatsFor: sceneFingerprint(row),
    };
  };

  it("recommends a scene the parser split into 2+ beats", () => {
    const [gen] = describeGenerations([scene(3)], {}, 3);
    expect(gen.recommendMultishot).toBe(true);
    expect(gen.cutCount).toBe(3);
  });

  it("does not recommend a continuous scene or a pre-v10 row", () => {
    expect(describeGenerations([scene(1)], {}, 3)[0].recommendMultishot).toBe(false);
    expect(describeGenerations([scene()], {}, 3)[0]).toMatchObject({ recommendMultishot: false, cutCount: 1 });
  });

  it("keeps recommending from stale beats after an edit", () => {
    const edited = { ...scene(3), description: "edited" };
    expect(describeGenerations([edited], {}, 3)[0].recommendMultishot).toBe(true);
  });

  it("uses a fresh cache hit over stale beats", () => {
    const edited = { ...scene(3), description: "edited" };
    const cache = { [sceneFingerprint(edited)]: [{ description: "only", duration_seconds: 6 }] };
    expect(describeGenerations([edited], {}, 3, cache)[0]).toMatchObject({
      recommendMultishot: false,
      cutCount: 1,
    });
  });

  it("counts rows for a packed v1 group", () => {
    expect(describeGenerations(shots(3, 3), undefined, 1)[0].cutCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/group-shots.test.ts`
Expected: FAIL — `cutCount` undefined; the 3-beat scene is not recommended.

- [ ] **Step 3: Implement**

In `group-shots.ts`, add at the top:

```ts
import { beatsForScene, type SceneBeatCache } from "./scene-beats";
```

In `Generation`, replace the `recommendMultishot` field and its comment with:

```ts
  /**
   * How many cuts multishot would make: a single scene's suggested beats (D286), else its row
   * count. 1 for a scene with no split.
   */
  cutCount: number;
  /** 2+ cuts, which multishot suits — advisory only, never auto-applied (D259). */
  recommendMultishot: boolean;
```

Replace `describeGenerations` (keep its doc comment, adding the line
`` * `beatCache` — the Script node's re-split cache (D286), consulted for a single scene's cut count. ``):

```ts
export function describeGenerations(
  shots: ReelShot[],
  overrides?: Record<string, boolean>,
  groupingVersion: GroupingVersion = 1,
  beatCache?: SceneBeatCache,
): Generation[] {
  const groups =
    groupingVersion === 3
      ? scenesAsGenerations(shots)
      : groupShotsForFanOut(shots, ceilingForVersion(groupingVersion));

  return groups.map((group, index) => {
    const key = generationKey(group.shotIndexes);
    const override = overrides?.[key];
    // D286 — a lone scene's cuts are its suggested beats. A stale split still counts: the badge
    // keeps its last answer until the toggle re-splits.
    const cutCount =
      group.shotIndexes.length === 1
        ? (beatsForScene(shots[group.shotIndexes[0]] ?? {}, beatCache).beats?.length ?? 1)
        : group.shotIndexes.length;
    return {
      index,
      shotIndexes: group.shotIndexes,
      seconds: group.seconds,
      multishot:
        typeof override === "boolean"
          ? override
          : defaultMultishotFor(group.shotIndexes, groupingVersion),
      overCeiling: group.seconds > PACK_CEILING_SECONDS,
      cutCount,
      recommendMultishot: cutCount > 1,
      key,
    };
  });
}
```

In `generation-bracket.tsx`, change `const shotCount = generation.shotIndexes.length;` to:

```ts
  const shotCount = generation.cutCount;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/group-shots.test.ts`
Expected: PASS, including the existing "is what describeGenerations uses at the current version" test (its rows have no beats → not recommended).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/group-shots.ts src/lib/nodes/__tests__/group-shots.test.ts src/components/nodes/generation-bracket.tsx
git commit -m "feat(script): recommend multishot from a scene's suggested beats (D286)"
```

---

### Task 4: Parse v10 — the parser returns beats

**Files:**
- Modify: `src/prompts/script-parse.ts`
- Modify: `src/app/api/nodes/[id]/parse/route.ts:70-71`
- Test: `src/prompts/__tests__/script-parse-schema.test.ts`

**Interfaces:**
- Consumes: `stampSceneBeats` (Task 2)
- Produces (exported from `script-parse.ts`, used by Task 5): `voLineSchema`, `sceneBeatSchema`, `SCENE_SPLIT_RULES: string`

- [ ] **Step 1: Write the failing tests**

In `script-parse-schema.test.ts`: change the import to
`import { scriptParsePrompt, SCENE_SPLIT_RULES } from "../script-parse";`, replace the version test with

```ts
  it("is version 10", () => {
    expect(scriptParsePrompt.version).toBe(10);
  });
```

and add inside the top-level `describe`:

```ts
  // D286 — each scene carries its suggested cuts; strict mode requires the key on every row.
  it("declares a required beats list on every shot, strict-mode shaped", () => {
    expect(shotProps.required).toContain("beats");
    const beats = shotProps.properties.beats as {
      type: string;
      items: { required: string[]; properties: Record<string, unknown>; additionalProperties: boolean };
    };
    expect(beats.type).toBe("array");
    expect(beats.items.additionalProperties).toBe(false);
    expect([...beats.items.required].sort()).toEqual(["description", "duration_seconds", "voiceover"]);
    expect(beats.items.properties.voiceover).toEqual(shotProps.properties.voiceover);
  });

  it("splits only where the script signals cuts, and composes the shared rules", () => {
    expect(SCENE_SPLIT_RULES).toMatch(/montage/i);
    expect(SCENE_SPLIT_RULES).toMatch(/cut to/i);
    expect(SCENE_SPLIT_RULES).toMatch(/EXACTLY ONE beat/);
    expect(SCENE_SPLIT_RULES).toMatch(/never invent/i);
    expect(SCENE_SPLIT_RULES).toMatch(/add up/i);
    expect(scriptParsePrompt.system).toContain(SCENE_SPLIT_RULES);
  });

  // "I can't split the voice into 1s" — a line runs across the scene unless the script ties it.
  it("ties a line to a beat only when the script does, and never splits one", () => {
    expect(SCENE_SPLIT_RULES).toMatch(/ONLY when the script ties it/);
    expect(SCENE_SPLIT_RULES).toMatch(/goes on NO beat/);
    expect(SCENE_SPLIT_RULES).toMatch(/whole sequence/);
    expect(SCENE_SPLIT_RULES).toMatch(/never split/i);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/prompts/__tests__/script-parse-schema.test.ts`
Expected: FAIL — `SCENE_SPLIT_RULES` undefined, version 9, no `beats`.

- [ ] **Step 3: Implement the prompt**

In `script-parse.ts`, above `const reelSchema`, add:

```ts
// D267 — one voiceover line. Exported so the scene-split prompt uses the exact same shape.
export const voLineSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "speaker", "delivery", "language"],
  properties: {
    text: { type: "string" },
    speaker: { type: "string" },
    delivery: { type: "string" },
    language: { type: "string" },
  },
};

// D286 — one suggested cut inside a scene. Shared with the scene-split prompt.
export const sceneBeatSchema = {
  type: "object",
  additionalProperties: false,
  required: ["description", "duration_seconds", "voiceover"],
  properties: {
    description: { type: "string" },
    duration_seconds: { type: "integer" },
    voiceover: { type: "array", items: voLineSchema },
  },
};

// D286 — how a scene is split into suggested cuts. ONE text, composed into the parse prompt and
// the scene-split prompt, so a scene splits the same way whichever of them runs.
export const SCENE_SPLIT_RULES = `Splitting a scene into beats (its suggested cuts, for when the operator generates it as a multishot sequence):
- Split ONLY where the scene's own text signals separate cuts: a montage, "A → B → C", "quick cuts of X, Y, Z", "cut to", or several distinct camera setups. A scene that describes one continuous action or one camera move is EXACTLY ONE beat whose description is the scene's description.
- Never invent a shot the scene does not describe, never split a continuous action into camera angles the script did not ask for, and never split to fit a model's length limit.
- Each beat's description is the visual of that cut only, in the script's own words, keeping the product and subject named as the scene names them.
- Beat duration_seconds are whole seconds that add up to the scene's duration_seconds. Use the script's own per-beat timing when it gives one; otherwise share the scene's length evenly.
- A voiceover line goes on a beat ONLY when the script ties it to that beat — the line is written under that visual, or its timecode falls inside that beat. A line that runs across the scene, or that the script does not tie to one visual, goes on NO beat: it plays over the whole sequence. Copy a tied line verbatim; never split a line, never put one on two beats, never invent one. A beat with no tied line gets [].`;
```

In `reelSchema`, replace the shot item's `required` and `properties` with:

```ts
            required: ["description", "duration", "duration_seconds", "clip", "voiceover", "beats"],
            properties: {
              description: { type: "string" },
              duration: { type: "string" },
              duration_seconds: { type: "integer" },
              clip: { type: "integer" },
              voiceover: { type: "array", items: voLineSchema },
              beats: { type: "array", items: sceneBeatSchema },
            },
```

In `system`:
- Change the `visual_script` line to
  `- visual_script: { shots: [{ description, duration, duration_seconds, clip, voiceover, beats }], execution_refinement } — one row per SCENE, in the order the script writes them.`
- Replace the montage bullet's last sentence `Do NOT split a montage into rows: where the cuts fall is the operator's decision, made after the parse.` with `Do NOT split a montage into rows: its suggested cuts go in that row's beats, never in extra rows.`
- After the line ending `every shot gets [].` add a bullet at the same indent:
  `  - beats: that scene's suggested cuts, per the splitting rules below. The row's own voiceover still lists EVERY line of the scene; a beat repeats only the lines tied to it.`
- Replace the closing ``- product_links: array of product URLs in the script.`;`` with:

```ts
- product_links: array of product URLs in the script.

${SCENE_SPLIT_RULES}`;
```

In `scriptParsePrompt`, add under the v9 note and bump:

```ts
  // v10: every scene row also carries `beats` — its suggested cuts, split only where the script
  // signals them, each holding only the VO lines the script ties to it (SCENE_SPLIT_RULES, shared
  // with scene-split). The row is unchanged; beats become cuts only when the operator turns
  // multishot on, and untied lines span the sequence (D286).
  version: 10,
```

- [ ] **Step 4: Stamp beats in the parse route**

In `src/app/api/nodes/[id]/parse/route.ts`, add `import { stampSceneBeats } from "@/lib/nodes/normalize-beats";` and change `const output = JSON.parse(content);` to:

```ts
      // D286 — make each scene's beats add up and keep only valid tied lines, and record which row
      // text they were split from, so a later edit reads as a stale split.
      const output = stampSceneBeats(JSON.parse(content));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/prompts/__tests__/script-parse-schema.test.ts src/lib/nodes/__tests__`
Expected: PASS (the existing voiceover-shape test still matches: `voLineSchema` is the same object).

- [ ] **Step 6: Commit**

```bash
git add src/prompts/script-parse.ts src/prompts/__tests__/script-parse-schema.test.ts "src/app/api/nodes/[id]/parse/route.ts"
git commit -m "feat(script-parse): v10 returns each scene's suggested beats (D286)"
```

---

### Task 5: `split-scene` route

**Files:**
- Create: `src/prompts/scene-split.ts`, `src/lib/nodes/scene-split.ts`, `src/app/api/nodes/[id]/split-scene/route.ts`
- Test: `src/lib/nodes/__tests__/scene-split.test.ts`, `src/app/api/nodes/[id]/split-scene/route.test.ts`

**Interfaces:**
- Consumes: `SCENE_SPLIT_RULES`, `sceneBeatSchema` (Task 4); `normalizeBeats` (Task 2); `sceneFingerprint` (Task 1)
- Produces:
  - `sceneSplitPrompt` `{ id: "scene-split", version: 1, model: "gpt-5.4-mini", system, clientContextHeading, schema }`
  - `parseSceneBody(input: unknown): ReelShot | null`
  - `compileSceneSplit(scene: ReelShot, clientContext: string): { system: string; user: string }`
  - `POST /api/nodes/:id/split-scene` — body `{ scene, slices? }` → `200 { beats: SceneBeat[], beatsFor: string }` | `400` | `404` | `500 { error }`

- [ ] **Step 1: Write the failing unit test**

Create `src/lib/nodes/__tests__/scene-split.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSceneBody, compileSceneSplit } from "../scene-split";
import { SCENE_SPLIT_RULES } from "@/prompts/script-parse";

const vo = { text: "Meet the jar.", speaker: "narrator" };

describe("parseSceneBody", () => {
  it("accepts a scene with a description and a positive length", () => {
    expect(parseSceneBody({ description: " A → B ", duration_seconds: 6, voiceover: [vo] })).toEqual({
      description: " A → B ",
      duration_seconds: 6,
      voiceover: [vo],
    });
  });

  it("keeps an absent voiceover absent", () => {
    expect(parseSceneBody({ description: "x", duration_seconds: 3 })).toEqual({
      description: "x",
      duration_seconds: 3,
    });
  });

  it.each([
    [null],
    [{ description: "", duration_seconds: 3 }],
    [{ description: "x", duration_seconds: 0 }],
    [{ description: "x", duration_seconds: "3" }],
    [{ description: "x", duration_seconds: 3, voiceover: "no" }],
    [{ description: "x", duration_seconds: 3, voiceover: [{ speaker: "narrator" }] }],
  ])("rejects %j", (input) => {
    expect(parseSceneBody(input)).toBeNull();
  });
});

describe("compileSceneSplit", () => {
  it("carries the shared rules and the client context in the system message", () => {
    const { system } = compileSceneSplit({ description: "x", duration_seconds: 3 }, "Tone: warm");
    expect(system).toContain(SCENE_SPLIT_RULES);
    expect(system).toContain("Tone: warm");
  });

  it("puts the scene, its length and its numbered lines in the user message", () => {
    const { user } = compileSceneSplit({ description: "A → B", duration_seconds: 6, voiceover: [vo] }, "");
    expect(user).toContain("A → B");
    expect(user).toContain("6 seconds");
    expect(user).toContain('1. (narrator) "Meet the jar."');
  });

  it("says when the scene has no voiceover", () => {
    expect(compileSceneSplit({ description: "x", duration_seconds: 3 }, "").user).toContain(
      "Voiceover lines: none",
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/scene-split.test.ts`
Expected: FAIL — cannot resolve `../scene-split`.

- [ ] **Step 3: Create the prompt record**

Create `src/prompts/scene-split.ts`:

```ts
// D286 — split ONE scene into its suggested cuts. Runs when the operator turns multishot on for a
// scene edited since the parse (or parsed before v10). The rules are the parse's own
// (SCENE_SPLIT_RULES), so a scene splits the same way whichever prompt ran.
import { SCENE_SPLIT_RULES, sceneBeatSchema } from "./script-parse";

const system = `You split ONE scene of a short-form video reel script into its beats and return them as JSON.

${SCENE_SPLIT_RULES}

Respect the client context when it is provided: keep the brand tone, and never introduce medical or claim words the client avoids or before/after promises.`;

export const sceneSplitPrompt = {
  id: "scene-split",
  version: 1,
  model: "gpt-5.4-mini",
  system,
  clientContextHeading: `Client context — the client's brand tone and compliance rules:`,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["beats"],
    properties: { beats: { type: "array", items: sceneBeatSchema } },
  },
};
```

- [ ] **Step 4: Create the pure helpers**

Create `src/lib/nodes/scene-split.ts`:

```ts
// D286 — the split-scene route's pure parts: validate the scene the client sent, and compose the
// two messages. Kept out of the route so both are unit tested without mocking the request path.
import type { ReelShot, VoLine } from "./reel-script";
import { sceneSplitPrompt } from "@/prompts/scene-split";

function isVoLine(v: unknown): v is VoLine {
  const l = v as VoLine | null;
  return !!l && typeof l.text === "string" && typeof l.speaker === "string";
}

/** The scene row from a request body, or null when it cannot be split. */
export function parseSceneBody(input: unknown): ReelShot | null {
  const s = input as { description?: unknown; duration_seconds?: unknown; voiceover?: unknown } | null;
  if (!s || typeof s.description !== "string" || !s.description.trim()) return null;
  if (typeof s.duration_seconds !== "number" || !(s.duration_seconds > 0)) return null;
  if (s.voiceover !== undefined && !(Array.isArray(s.voiceover) && s.voiceover.every(isVoLine))) {
    return null;
  }
  return {
    description: s.description,
    duration_seconds: s.duration_seconds,
    ...(s.voiceover !== undefined ? { voiceover: s.voiceover as VoLine[] } : {}),
  };
}

export function compileSceneSplit(scene: ReelShot, clientContext: string) {
  const ctx = clientContext.trim();
  const system = [sceneSplitPrompt.system, ctx ? `${sceneSplitPrompt.clientContextHeading}\n${ctx}` : ""]
    .filter(Boolean)
    .join("\n\n");

  const lines = scene.voiceover ?? [];
  const voiceover =
    lines.length === 0
      ? "Voiceover lines: none"
      : `Voiceover lines, in order:\n${lines.map((l, i) => `${i + 1}. (${l.speaker}) "${l.text}"`).join("\n")}`;
  const user = `Scene to split:\n${(scene.description ?? "").trim()}\n\nLength: ${scene.duration_seconds} seconds\n\n${voiceover}`;
  return { system, user };
}
```

- [ ] **Step 5: Run the unit test**

Run: `npx vitest run src/lib/nodes/__tests__/scene-split.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing route test**

Create `src/app/api/nodes/[id]/split-scene/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sceneFingerprint } from "@/lib/nodes/scene-beats";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>(
    "@/lib/api/route-helpers",
  );
  return {
    ...actual,
    withNode: (_req: Request, _params: unknown, fn: (nodeId: string) => Promise<Response>) =>
      fn("node-1"),
  };
});

const getNodeActiveKB = vi.fn();
vi.mock("@/lib/db/nodes", () => ({ getNodeActiveKB: (id: string) => getNodeActiveKB(id) }));

const create = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ chat: { completions: { create } } }) }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "node-1" }),
  });
const returns = (obj: unknown) =>
  create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(obj) } }] });

const scene = { description: "A → B", duration_seconds: 6, voiceover: [] };

beforeEach(() => {
  create.mockReset();
  getNodeActiveKB.mockReset();
  getNodeActiveKB.mockResolvedValue({ kb: null, kbVersionId: null, clientId: "c1" });
});

describe("POST /api/nodes/:id/split-scene", () => {
  it("returns normalised beats stamped with the scene's fingerprint", async () => {
    returns({
      beats: [
        { description: "A", duration_seconds: 2, voiceover: [] },
        { description: "B", duration_seconds: 2, voiceover: [] },
      ],
    });
    const res = await post({ scene });
    expect(res.status).toBe(200);
    const json = await res.json();
    // 2+2 = 4 on a 6s scene: the 2s shortfall goes to the first longest beat.
    expect(json.beats.map((b: { duration_seconds: number }) => b.duration_seconds)).toEqual([4, 2]);
    expect(json.beatsFor).toBe(sceneFingerprint(scene));
  });

  it("sends a strict json_schema request on the prompt's model", async () => {
    returns({ beats: [] });
    await post({ scene });
    const args = create.mock.calls[0][0];
    expect(args.model).toBe("gpt-5.4-mini");
    expect(args.response_format.json_schema.strict).toBe(true);
  });

  it("rejects a scene with no description", async () => {
    const res = await post({ scene: { ...scene, description: "" } });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("404s when the node's KB lookup finds nothing", async () => {
    getNodeActiveKB.mockResolvedValueOnce(null);
    expect((await post({ scene })).status).toBe(404);
  });

  it("reports a model failure as a 500 with its message", async () => {
    create.mockRejectedValueOnce(new Error("rate limited"));
    const res = await post({ scene });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("rate limited");
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run "src/app/api/nodes/[id]/split-scene/route.test.ts"`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 8: Create the route**

Create `src/app/api/nodes/[id]/split-scene/route.ts`:

```ts
import { createOpenAI } from "@/lib/openai/server";
import { getNodeActiveKB } from "@/lib/db/nodes";
import { normalizeSlices, buildParseContext } from "@/lib/kb/parse-context";
import { sceneSplitPrompt } from "@/prompts/scene-split";
import { parseSceneBody, compileSceneSplit } from "@/lib/nodes/scene-split";
import { normalizeBeats } from "@/lib/nodes/normalize-beats";
import { sceneFingerprint } from "@/lib/nodes/scene-beats";
import type { SceneBeat } from "@/lib/nodes/reel-script";
import { apiError, apiOk, withNode, withTryCatch } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/split-scene — D286. Split ONE scene of a Script node into its suggested
// cuts, when the operator turns multishot on for a scene edited since the parse. Stateless: the
// client sends the row it holds. Not a version of the Script node — the script did not change.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId) => {
    const body = (await req.json().catch(() => null)) as
      | { scene?: unknown; slices?: unknown }
      | null;
    const scene = parseSceneBody(body?.scene);
    if (!scene) return apiError("Provide a scene with a description and a length.", 400);

    const ctx = await getNodeActiveKB(nodeId);
    if (!ctx) return apiError("Node not found.", 404);
    const clientContext = ctx.kb ? buildParseContext(ctx.kb, normalizeSlices(body?.slices)) : "";
    const { system, user } = compileSceneSplit(scene, clientContext);

    return withTryCatch("Split failed", async () => {
      const completion = await createOpenAI().chat.completions.create({
        model: sceneSplitPrompt.model,
        response_format: {
          type: "json_schema",
          json_schema: { name: "scene_split", schema: sceneSplitPrompt.schema, strict: true },
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
        beats?: SceneBeat[];
      };
      return apiOk({ beats: normalizeBeats(scene, raw.beats), beatsFor: sceneFingerprint(scene) });
    });
  });
}
```

- [ ] **Step 9: Run the route test**

Run: `npx vitest run "src/app/api/nodes/[id]/split-scene/route.test.ts"`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/prompts/scene-split.ts src/lib/nodes/scene-split.ts src/lib/nodes/__tests__/scene-split.test.ts "src/app/api/nodes/[id]/split-scene"
git commit -m "feat(api): split-scene route re-splits one scene on demand (D286)"
```

---

### Task 6: Sequence voiceover in the prompt path

**Files:**
- Modify: `src/lib/canvas-nodes.ts` (`MultishotNodeData`, ~line 135)
- Modify: `src/lib/nodes/voiceover.ts` (add `readVoLines`)
- Modify: `src/lib/nodes/multishot-plan.ts` (`renderPlan` ~line 159, `checkPlanLimits` ~line 319)
- Modify: `src/lib/nodes/resolve-inputs.ts` (`ResolvedMultishotInputs` ~201, `resolveMultishotPromptInputs` ~223, `buildMultishotUserTurn` ~266)
- Modify: `src/lib/video-gen/resolve-prompt.ts` (ok branch type ~line 40, return ~151)
- Modify: `src/lib/nodes/node-output.ts` (multishot case ~line 41)
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts:112-118`, `src/app/api/nodes/[id]/upstream-images/route.ts:115-126`, `src/app/api/nodes/[id]/multishot-prompt/route.ts:117-126,312`
- Modify: `src/components/nodes/multishot-prompt-node.tsx:58,197`, `src/components/nodes/multishot-prompt-focus-view.tsx:76,100,694`
- Test: `src/lib/nodes/__tests__/multishot-plan.test.ts`, `src/lib/nodes/__tests__/resolve-multishot.test.ts`, `src/lib/nodes/node-output.test.ts`, `src/lib/video-gen/__tests__/resolve-prompt.test.ts`, `src/lib/nodes/__tests__/sequence-voiceover.test.ts` (new, for `readVoLines`)

**Interfaces:**
- Produces:
  - `MultishotNodeData.sequenceVoiceover?: VoLine[]`
  - `readVoLines(value: unknown): VoLine[] | undefined` (voiceover.ts)
  - `SEQUENCE_VO_PREFIX = "Across every shot — "` (multishot-plan.ts)
  - `renderPlan(plan, cuts, cap, refIds = [], sequenceVoiceover?: VoLine[]): string`
  - `checkPlanLimits(plan, cuts, cap, refIds = [], sequenceVoiceover?: VoLine[]): LadderCheck`
  - `ResolvedMultishotInputs.sequenceVoiceover: VoLine[] | undefined`
  - `buildMultishotUserTurn({ …, sequenceVoiceover?: VoLine[] })`
  - `resolveVideoGenPrompt` ok result gains `sequenceVoiceover: VoLine[] | undefined`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/nodes/__tests__/sequence-voiceover.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readVoLines } from "../voiceover";

describe("readVoLines", () => {
  it("returns undefined for anything that is not an array", () => {
    expect(readVoLines(undefined)).toBeUndefined();
    expect(readVoLines("x")).toBeUndefined();
  });

  it("keeps well-formed lines and drops malformed ones", () => {
    expect(
      readVoLines([{ text: "Hi.", speaker: "narrator" }, { speaker: "narrator" }, null, { text: 3 }]),
    ).toEqual([{ text: "Hi.", speaker: "narrator" }]);
  });

  it("keeps an empty array as an empty array", () => {
    expect(readVoLines([])).toEqual([]);
  });
});
```

Append to `src/lib/nodes/__tests__/multishot-plan.test.ts`:

```ts
// D286 — a line that spans the sequence renders ONCE, between the look and the ladder, and never
// inside any shot.
describe("renderPlan — sequence voiceover", () => {
  const seq: VoLine[] = [{ text: "Made slowly; by hand.", speaker: "narrator" }];
  const look = "Low sun from camera-left, warm grey concrete, 35mm at knee height.";

  it("sits between the look and Omni's ladder", () => {
    expect(renderPlan(perModelPlan, planCuts, OMNI, [], seq)).toBe(
      `${look}\n\n` +
        'Across every shot — Voiceover: "Made slowly; by hand."\n\n' +
        "[0-2s] A hand sweeps keys off oak.\n" +
        "[2-5s] A cab door swings open onto sunlit paving.",
    );
  });

  it("replaces semicolons on Kling so the line cannot end a shot", () => {
    const rendered = renderPlan(perModelPlan, planCuts, KLING, [], seq);
    expect(rendered).toContain('Across every shot — Voiceover: "Made slowly, by hand."\n\nshot 1, 2,');
    expect(rendered.match(/;/g)).toHaveLength(2);
  });

  it("sits before Seedance's ladder", () => {
    expect(renderPlan(perModelPlan, planCuts, SEEDANCE, [], seq)).toContain(
      'Across every shot — Voiceover: "Made slowly; by hand."\n\n0-2s:',
    );
  });

  it("leads the prompt when there is no look", () => {
    expect(renderPlan({ ...perModelPlan, look: "" }, planCuts, OMNI, [], seq).startsWith("Across every shot — ")).toBe(true);
  });

  it("renders nothing for no lines or an empty list", () => {
    const plain = renderPlan(perModelPlan, planCuts, OMNI);
    expect(renderPlan(perModelPlan, planCuts, OMNI, [], [])).toBe(plain);
    expect(renderPlan(perModelPlan, planCuts, OMNI, [], undefined)).toBe(plain);
  });

  it("counts against the whole-prompt budget, not any cut's", () => {
    const long: VoLine[] = [{ text: "x".repeat(KLING.maxPromptChars!), speaker: "narrator" }];
    const result = checkPlanLimits(perModelPlan, planCuts, KLING, [], long);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/whole prompt/);
    expect(checkPlanLimits(perModelPlan, planCuts, KLING).ok).toBe(true);
  });
});
```

Append to `src/lib/nodes/__tests__/resolve-multishot.test.ts`:

```ts
describe("buildMultishotUserTurn — sequence voiceover (D286)", () => {
  const base = { clientContext: "", upstream: [], cuts, instruction: "", cutInstructions: {} };

  it("states lines that play over every shot, once, above the shots", () => {
    const turn = buildMultishotUserTurn({
      ...base,
      sequenceVoiceover: [{ text: "Made slowly, by hand.", speaker: "narrator" }],
    });
    expect(turn).toContain("Voiceover across the whole sequence");
    expect(turn).toContain('narrator (off-screen): "Made slowly, by hand."');
    expect(turn.indexOf("whole sequence")).toBeLessThan(turn.indexOf("cutId: c1"));
    expect(turn.match(/Made slowly/g)).toHaveLength(1);
  });

  it("adds nothing when there are no sequence lines", () => {
    expect(buildMultishotUserTurn({ ...base, sequenceVoiceover: [] })).not.toContain("whole sequence");
  });
});
```

Append inside the multishot tests of `src/lib/nodes/node-output.test.ts` (its top-level `describe`):

```ts
  it("prints a multishot node's sequence voiceover above its shots", () => {
    const out = getNodeOutput({
      type: "multishot",
      data: {
        cuts: [{ id: "c1", text: "keys", seconds: 2 }],
        sequenceVoiceover: [{ text: "Made by hand.", speaker: "narrator" }],
      },
      activeOutput: null,
    });
    expect(out).toBe('Across every shot — Voiceover: "Made by hand."\nShot 1 (2s): keys');
  });
```

Append inside `describe("resolveVideoGenPrompt", …)` of `src/lib/video-gen/__tests__/resolve-prompt.test.ts`:

```ts
  it("renders and returns the Multishot node's sequence voiceover (D286)", async () => {
    const sequenceVoiceover = [{ text: "Made by hand.", speaker: "narrator" }];
    const multishotPromptNode = output({ nodeId: "mp-1", type: "multishot-prompt", activeOutput: plan });
    const multishotNode = output({ nodeId: "m-1", type: "multishot", data: { cuts, sequenceVoiceover } });
    const result = await resolveVideoGenPrompt(
      [multishotPromptNode],
      async (id) => (id === "mp-1" ? [multishotNode] : []),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prompt).toContain('Across every shot — Voiceover: "Made by hand."');
      expect(result.sequenceVoiceover).toEqual(sequenceVoiceover);
    }
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/sequence-voiceover.test.ts src/lib/nodes/__tests__/multishot-plan.test.ts src/lib/nodes/__tests__/resolve-multishot.test.ts src/lib/nodes/node-output.test.ts src/lib/video-gen/__tests__/resolve-prompt.test.ts`
Expected: FAIL — `readVoLines` missing; sequence lines not rendered.

- [ ] **Step 3: Data field and `readVoLines`**

In `canvas-nodes.ts`, add to `MultishotNodeData` after `cuts` (import `type VoLine` from `@/lib/nodes/reel-script`):

```ts
  /**
   * D286 — VO lines that play over the WHOLE ladder, not one cut: a scene's lines the script did
   * not tie to a single beat. Rendered once in the prompt header (renderPlan). Absent or [] = none.
   * Cuts keep their own `voiceover` for tied lines (D267).
   */
  sequenceVoiceover?: VoLine[];
```

In `voiceover.ts`, add above `export type { VoLine };`:

```ts
/**
 * D286 — a node's stored VO list, read defensively: node data arrives as `unknown`, and a
 * malformed line must not reach `renderVoiceover` (which calls `.trim()` on `text`). Anything that
 * is not an array is "no list"; an empty array stays empty.
 */
export function readVoLines(value: unknown): VoLine[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (l): l is VoLine => !!l && typeof l.text === "string" && typeof l.speaker === "string",
  );
}
```

- [ ] **Step 4: Render and check**

In `multishot-plan.ts`, import `type VoLine` from `./reel-script`, and add below `withVoiceover`:

```ts
/** D286 — how lines spanning the whole sequence are introduced in the rendered prompt. */
export const SEQUENCE_VO_PREFIX = "Across every shot — ";

/**
 * D286 — the sequence voiceover, a blank line, then the ladder. Sits between the look and the
 * ladder so it reads as direction for the whole clip, not as part of shot 1. `semicolonSafe` is
 * Kling's: a `;` in prose ahead of the triples would be read as a shot terminator.
 */
function withSequenceVoiceover(
  lines: VoLine[] | undefined,
  ladder: string,
  semicolonSafe = false,
): string {
  const rendered = renderVoiceover(lines);
  if (!rendered) return ladder;
  const text = semicolonSafe ? rendered.replace(/;/g, ",") : rendered;
  return `${SEQUENCE_VO_PREFIX}${text}\n\n${ladder}`;
}
```

In `renderPlan`: add the parameter `sequenceVoiceover?: VoLine[]` after `refIds: string[] = []`, add to its doc comment
`` * D286 — `sequenceVoiceover` renders once between the look and the ladder (`withSequenceVoiceover`). ``,
and change the three returns:

```ts
    return withLook(plan.look, withSequenceVoiceover(sequenceVoiceover, shots, true));
```
```ts
    return withLook(plan.look, withSequenceVoiceover(sequenceVoiceover, ladder));
```
```ts
  return withLook(plan.look, withSequenceVoiceover(sequenceVoiceover, ladder));
```

(first is the `triple` branch, second the `bare-timecode` branch, third Omni's.)

In `checkPlanLimits`: add the parameter `sequenceVoiceover?: VoLine[]` after `refIds: string[] = []` and change `const rendered = renderPlan(plan, cuts, cap);` to

```ts
    // D286 — the sequence voiceover is sent, so it is measured. It sits in no beat, so the
    // per-cut loop above rightly ignores it.
    const rendered = renderPlan(plan, cuts, cap, [], sequenceVoiceover);
```

- [ ] **Step 5: The writer's user turn**

In `resolve-inputs.ts`:
- Import `readVoLines` alongside the existing voiceover imports, and `type VoLine` from `@/lib/nodes/reel-script`.
- Add to `ResolvedMultishotInputs`:

```ts
  /** D286 — the upstream Multishot node's lines spanning every shot. */
  sequenceVoiceover: VoLine[] | undefined;
```

- In `resolveMultishotPromptInputs`, add `sequenceVoiceover: readVoLines(source?.data.sequenceVoiceover),` to the returned object.
- Add to `buildMultishotUserTurn`'s args type:

```ts
  /** D286 — lines that play over every shot. Stated once, above the shots, never per shot. */
  sequenceVoiceover?: VoLine[];
```

- Immediately before `blocks.push(\`Shots (return exactly one beat per shot, echoing each cutId):\n${shots}\`);` add:

```ts
  // D286 — WHAT is spoken across the whole clip, so the writer keeps faces silent for narration
  // (VO_PERFORMANCE_RULES). Never an instruction to write the words — renderPlan puts them on the
  // wire once, above the ladder.
  const spanning = (args.sequenceVoiceover ?? []).filter((l) => l.text.trim());
  if (spanning.length > 0) {
    blocks.push(
      "Voiceover across the whole sequence — it plays over every shot below, not over any one of them. Do not write these words into any beat:\n" +
        spanning.map((l) => `  ${describeVoLineForWriter(l)}`).join("\n"),
    );
  }
```

- [ ] **Step 6: Node output and the video-gen resolver**

In `node-output.ts`, import `readVoLines` from `@/lib/nodes/voiceover` and `SEQUENCE_VO_PREFIX` from `@/lib/nodes/multishot-plan`, and replace the multishot case's `return cuts…join("\n");` with:

```ts
      const shots = cuts
        .filter((c) => c && typeof c.text === "string")
        .map((c, i) => {
          // The spoken line is part of what this cut IS — it is appended to this shot's beat in
          // the rendered prompt (renderPlan), so a panel that showed only the description told the
          // operator the node held less than it does.
          const spoken = renderVoiceover(c.voiceover);
          const head = `Shot ${i + 1} (${c.seconds}s): ${c.text.trim() || "(no description yet)"}`;
          return spoken ? `${head} ${spoken}` : head;
        });
      // D286 — lines over the whole clip lead, as they do in the rendered prompt.
      const spanning = renderVoiceover(readVoLines(node.data.sequenceVoiceover));
      return [...(spanning ? [`${SEQUENCE_VO_PREFIX}${spanning}`] : []), ...shots].join("\n");
```

(Check `multishot-plan.ts` does not import `node-output.ts`; it does not today, so there is no cycle.) If the existing "returns empty string for a multishot node with no cuts" test still expects `""`, it does: no cuts and no lines give an empty array.

In `resolve-prompt.ts`: import `readVoLines` from `@/lib/nodes/voiceover` and `type VoLine` from `@/lib/nodes/reel-script`. In the ok branch type add after `cuts`:

```ts
      /** D286 — only set for the multishot lane — lines spanning every cut, rendered in the header. */
      sequenceVoiceover: VoLine[] | undefined;
```

In the video-prompt return add `sequenceVoiceover: undefined,` after `cuts: null,`. In the multishot branch, after `const refIds = refIdsOf(promptUpstream);` add
`const sequenceVoiceover = readVoLines(multishotNode.data.sequenceVoiceover);`, render with
`prompt: renderPlan(plan, cuts, cap, refIds, sequenceVoiceover),` and add `sequenceVoiceover,` after `cuts,` in the returned object.

- [ ] **Step 7: Routes and the prompt preview**

`video-generate/route.ts` — add a fifth argument to `checkPlanLimits(...)` (line ~117):

```ts
        refEntriesOf(resolved.promptUpstream.map((u) => mapUpstreamForVideo(u))).map((r) => r.id),
        resolved.sequenceVoiceover,
      );
```

`upstream-images/route.ts` — import `readVoLines` and change line 126 to:

```ts
          promptText = renderPlan(
            plan,
            cuts,
            multishotCapabilityFor(plan.targetModel),
            refIds,
            readVoLines(multishotNode?.data.sequenceVoiceover),
          );
```

`multishot-prompt/route.ts` — pass `sequenceVoiceover: resolved.sequenceVoiceover,` into the `buildMultishotUserTurn({ … })` call (next to `cuts: resolved.cuts,`, line ~120), and change line 312 to:

```ts
        prompt: renderPlan(
          output,
          resolved.cuts,
          multishotCapabilityFor(output.targetModel),
          refIds,
          resolved.sequenceVoiceover,
        ),
```

`multishot-prompt-node.tsx` — below line 58 add

```ts
  const sequenceVoiceover = readVoLines(
    (multishotSource?.data as MultishotNodeData | undefined)?.sequenceVoiceover,
  );
```

(import `readVoLines` from `@/lib/nodes/voiceover`) and pass `sequenceVoiceover={sequenceVoiceover}` next to `cuts={cuts}`.

`multishot-prompt-focus-view.tsx` — add to the props type next to `cuts: MultishotCut[];`:

```ts
  /** D286 — the Multishot node's lines spanning every shot; rendered in the preview as sent. */
  sequenceVoiceover?: VoLine[];
```

destructure it next to `cuts,` (line ~100), and change line 694 to
`<GeneratedPromptBody text={renderPlan(planDraft, cuts, cap, refIds, sequenceVoiceover)} images={promptRefImages} />`.
Import `type VoLine` from `@/lib/nodes/reel-script` if it is not already imported.

- [ ] **Step 8: Run tests, typecheck**

Run: `npx vitest run src/lib/nodes src/lib/video-gen "src/app/api/nodes/[id]/multishot-prompt" "src/app/api/nodes/[id]/video-generate" "src/app/api/nodes/[id]/upstream-images"`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/nodes/voiceover.ts src/lib/nodes/multishot-plan.ts src/lib/nodes/resolve-inputs.ts src/lib/nodes/node-output.ts src/lib/video-gen/resolve-prompt.ts "src/app/api/nodes/[id]/video-generate/route.ts" "src/app/api/nodes/[id]/upstream-images/route.ts" "src/app/api/nodes/[id]/multishot-prompt/route.ts" src/components/nodes/multishot-prompt-node.tsx src/components/nodes/multishot-prompt-focus-view.tsx src/lib/nodes/__tests__ src/lib/nodes/node-output.test.ts src/lib/video-gen/__tests__/resolve-prompt.test.ts
git commit -m "feat(multishot): voiceover spanning the whole sequence, rendered once (D286)"
```

---

### Task 7: Store — beats become cuts, spanning lines become sequence VO

**Files:**
- Modify: `src/lib/canvas-nodes.ts` (`ScriptNodeData`, ~line 16)
- Modify: `src/lib/nodes/multishot-convert.ts`
- Modify: `src/lib/canvas-store.ts` (imports ~23-33; `CanvasState` ~63; `fanOutShots` ~440-518; `setGenerationMode` ~560-612)
- Test: `src/lib/nodes/__tests__/multishot-convert.test.ts`, `src/lib/canvas-store.test.ts`

**Interfaces:**
- Consumes: `multishotSeedFor`, `pruneBeatCache`, `SceneBeatCache` (Task 1); `describeGenerations(…, beatCache)` (Task 3); `MultishotNodeData.sequenceVoiceover` (Task 6)
- Produces:
  - `ScriptNodeData.sceneBeats?: SceneBeatCache`
  - `shotDataToMultishot(data: ShotNodeData, sourceRows?: ReelShot[], sequenceVoiceover?: VoLine[]): MultishotNodeData`
  - `multishotDataToShot(data)` — merged take's `voiceover` = sequence lines then cut lines
  - `CanvasState.cacheSceneBeats(scriptNodeId: string, fingerprint: string, beats: SceneBeat[]): void`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/nodes/__tests__/multishot-convert.test.ts` (import `shotDataToMultishot`, `multishotDataToShot` if the file does not already):

```ts
describe("sequence voiceover across the flip (D286)", () => {
  const seq = [{ text: "Made by hand.", speaker: "narrator" }];

  it("writes the spanning lines onto the new Multishot node", () => {
    const out = shotDataToMultishot(
      {},
      [
        { description: "a", duration_seconds: 2 },
        { description: "b", duration_seconds: 2 },
      ],
      seq,
    );
    expect(out.sequenceVoiceover).toEqual(seq);
    expect(out.cuts).toHaveLength(2);
  });

  it("leaves the field off when there are no spanning lines", () => {
    expect(shotDataToMultishot({}, [{ description: "a", duration_seconds: 2 }], [])).not.toHaveProperty(
      "sequenceVoiceover",
    );
  });

  it("merges the sequence lines back into the single take, ahead of the cuts' own", () => {
    const shot = multishotDataToShot({
      cuts: [
        { id: "c1", text: "a", seconds: 2, voiceover: [{ text: "Tied.", speaker: "narrator" }] },
        { id: "c2", text: "b", seconds: 2, voiceover: [] },
      ],
      sequenceVoiceover: seq,
    });
    const take = shot.script!.visual_script!.shots![0];
    expect(take.voiceover!.map((l) => l.text)).toEqual(["Made by hand.", "Tied."]);
  });
});
```

Append to `src/lib/canvas-store.test.ts` (add `import { sceneFingerprint } from "./nodes/scene-beats";`):

```ts
describe("scene beats become cuts (D286)", () => {
  const vo = (text: string) => ({ text, speaker: "narrator" });
  const plain = {
    description: "Jar → spoon → hand",
    duration_seconds: 6,
    voiceover: [vo("Meet the jar."), vo("Made by hand.")],
  };
  const BEATS = [
    { description: "Jar", duration_seconds: 2, voiceover: [vo("Meet the jar.")] },
    { description: "Spoon", duration_seconds: 2, voiceover: [] },
    { description: "Hand", duration_seconds: 2, voiceover: [] },
  ];
  const stampedRow = { ...plain, beats: BEATS, beatsFor: sceneFingerprint(plain) };
  const v3Script = (row: object, extra: object = {}): AppNode =>
    ({
      id: "sc",
      type: "script",
      position: { x: 0, y: 0 },
      data: { parsed: { visual_script: { shots: [row] } }, groupingVersion: 3, ...extra },
    }) as AppNode;
  const multishotData = (store: ReturnType<typeof createCanvasStore>) =>
    store.getState().nodes.find((n) => n.type === "multishot")!.data as {
      cuts: { text: string; seconds: number; voiceover?: { text: string }[] }[];
      sequenceVoiceover?: { text: string }[];
    };
  const cutsOf = (store: ReturnType<typeof createCanvasStore>) =>
    multishotData(store).cuts.map((c) => [c.text, c.seconds]);

  it("flipping a fanned-out scene to multishot builds one cut per fresh beat", () => {
    const store = createCanvasStore([v3Script(stampedRow)], []);
    store.getState().fanOutShots("sc");
    store.getState().setGenerationMode("sc", "0", true);
    expect(cutsOf(store)).toEqual([["Jar", 2], ["Spoon", 2], ["Hand", 2]]);
  });

  it("keeps a tied line on its cut and moves the untied one to the sequence", () => {
    const store = createCanvasStore([v3Script(stampedRow)], []);
    store.getState().fanOutShots("sc");
    store.getState().setGenerationMode("sc", "0", true);
    const data = multishotData(store);
    expect(data.cuts[0].voiceover?.map((l) => l.text)).toEqual(["Meet the jar."]);
    expect(data.sequenceVoiceover?.map((l) => l.text)).toEqual(["Made by hand."]);
  });

  it("fans out a scene already set to multishot with its beats and sequence lines", () => {
    const store = createCanvasStore([v3Script(stampedRow, { groupModes: { "0": true } })], []);
    store.getState().fanOutShots("sc");
    expect(cutsOf(store)).toHaveLength(3);
    expect(multishotData(store).sequenceVoiceover).toHaveLength(1);
  });

  it("uses one cut, with every line on it, when the beats are stale", () => {
    const store = createCanvasStore([v3Script({ ...stampedRow, description: "Edited" })], []);
    store.getState().fanOutShots("sc");
    store.getState().setGenerationMode("sc", "0", true);
    expect(cutsOf(store)).toEqual([["Edited", 6]]);
    expect(multishotData(store).cuts[0].voiceover).toHaveLength(2);
    expect(multishotData(store)).not.toHaveProperty("sequenceVoiceover");
  });

  it("uses cached beats written by cacheSceneBeats", () => {
    const store = createCanvasStore([v3Script(plain)], []);
    store.getState().cacheSceneBeats("sc", sceneFingerprint(plain), BEATS);
    store.getState().fanOutShots("sc");
    store.getState().setGenerationMode("sc", "0", true);
    expect(cutsOf(store)).toHaveLength(3);
  });

  it("cacheSceneBeats prunes keys no current row matches and leaves parsed alone", () => {
    const store = createCanvasStore([v3Script(plain, { sceneBeats: { gone: BEATS } })], []);
    const before = (store.getState().nodes[0].data as { parsed: unknown }).parsed;
    store.getState().cacheSceneBeats("sc", sceneFingerprint(plain), BEATS);
    const data = store.getState().nodes[0].data as { parsed: unknown; sceneBeats?: Record<string, unknown> };
    expect(Object.keys(data.sceneBeats ?? {})).toEqual([sceneFingerprint(plain)]);
    expect(data.parsed).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-convert.test.ts src/lib/canvas-store.test.ts`
Expected: FAIL — no `sequenceVoiceover`, `cacheSceneBeats` is not a function, flip gives 1 cut.

- [ ] **Step 3: Script node data field**

In `canvas-nodes.ts`, import `type SceneBeatCache` from `@/lib/nodes/scene-beats` and add to `ScriptNodeData` after `groupingVersion`:

```ts
  /**
   * D286 — re-split results for scenes edited since the parse, keyed by `sceneFingerprint`.
   * Kept here, not in `parsed` (the active version's output, D19): writing that would reseed the
   * focus view's unsaved draft. Pruned to the current rows on every write.
   */
  sceneBeats?: SceneBeatCache;
```

- [ ] **Step 4: Carry sequence VO through the conversion**

In `multishot-convert.ts`, import `type VoLine` from `./reel-script` (extend the existing `ReelShot` import). Change `shotDataToMultishot`'s signature and return:

```ts
export function shotDataToMultishot(
  data: ShotNodeData,
  sourceRows?: ReelShot[],
  /** D286 — the scene's lines that span every cut (multishotSeedFor). */
  sequenceVoiceover?: VoLine[],
): MultishotNodeData {
```

and add, after `targetModel: bestFitMultishotModel(cuts),`:

```ts
    ...(sequenceVoiceover && sequenceVoiceover.length > 0 ? { sequenceVoiceover } : {}),
```

In `multishotDataToShot`, replace `const take = mergeShotRows(shotsFromCuts(cuts));` with:

```ts
  const merged = mergeShotRows(shotsFromCuts(cuts));
  // D286 — the lines that spanned the ladder are part of the one take too. They lead: their
  // original interleaving with tied lines is not recorded, and a take that opens on the scene's
  // narration is the reading that stays speakable.
  const sequence = data.sequenceVoiceover ?? [];
  const take =
    sequence.length > 0 ? { ...merged, voiceover: [...sequence, ...(merged.voiceover ?? [])] } : merged;
```

- [ ] **Step 5: Store**

In `canvas-store.ts`, add imports:

```ts
import type { SceneBeat } from "@/lib/nodes/reel-script";
import { multishotSeedFor, pruneBeatCache, type SceneBeatCache } from "@/lib/nodes/scene-beats";
```

`CanvasState` — add below `setGenerationMode`:

```ts
  /** D286 — cache one scene's fresh split on the Script node (never in `parsed`). */
  cacheSceneBeats: (scriptNodeId: string, fingerprint: string, beats: SceneBeat[]) => void;
```

`fanOutShots`: add `sceneBeats?: SceneBeatCache;` to the script node's inline `data` type (just above line 440), pass `data.sceneBeats` as the fourth argument of `describeGenerations` (line 443), and in the multishot branch replace `const cuts = cutsFromShots(groupShots);` with:

```ts
          // D286 — a lone scene is cut at its fresh suggested beats, and the lines no beat
          // carries span the ladder. Stale beats make one cut, as before.
          const seed =
            groupShots.length === 1 ? multishotSeedFor(groupShots[0], data.sceneBeats) : { rows: groupShots };
          const cuts = cutsFromShots(seed.rows);
```

and in that branch's `data: { … }` add after `targetModel: bestFitMultishotModel(cuts),`:

```ts
              ...(seed.sequenceVoiceover ? { sequenceVoiceover: seed.sequenceVoiceover } : {}),
```

`setGenerationMode`: add `sceneBeats?: SceneBeatCache;` to its inline `data` type; pass `data.sceneBeats` as the fourth argument of its `describeGenerations`; replace

```ts
      const scriptRows = generation.shotIndexes.map((i) => shots[i]).filter(Boolean);
      const converted =
        targetType === "multishot"
          ? shotDataToMultishot(node.data as ShotNodeData, scriptRows)
          : multishotDataToShot(node.data as MultishotNodeData);
```

with

```ts
      const scriptRows = generation.shotIndexes.map((i) => shots[i]).filter(Boolean);
      // D286 — a lone scene's fresh beats are the rows its cuts come from, and its untied lines
      // span them. The toggle re-splits a stale scene BEFORE calling here; a failed re-split lands
      // as one cut.
      const seed =
        scriptRows.length === 1 ? multishotSeedFor(scriptRows[0], data.sceneBeats) : { rows: scriptRows };
      const converted =
        targetType === "multishot"
          ? shotDataToMultishot(node.data as ShotNodeData, seed.rows, seed.sequenceVoiceover)
          : multishotDataToShot(node.data as MultishotNodeData);
```

Add the action after `setGenerationMode`:

```ts
    cacheSceneBeats: (scriptNodeId, fingerprint, beats) => {
      const script = get().nodes.find((n) => n.id === scriptNodeId);
      if (!script || script.type !== "script") return;
      const data = script.data as { parsed?: ReelScript; sceneBeats?: SceneBeatCache };
      const rows = data.parsed?.visual_script?.shots ?? [];
      get().updateNodeData(scriptNodeId, {
        sceneBeats: pruneBeatCache(data.sceneBeats, rows, fingerprint, beats),
      });
    },
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/lib/canvas-store.test.ts src/lib/nodes`
Expected: PASS (new and existing).

- [ ] **Step 7: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/nodes/multishot-convert.ts src/lib/canvas-store.ts src/lib/canvas-store.test.ts src/lib/nodes/__tests__/multishot-convert.test.ts
git commit -m "feat(canvas): multishot cuts and sequence VO from a scene's beats (D286)"
```

---

### Task 8: Edit the sequence voiceover in the Multishot focus view

**Files:**
- Modify: `src/lib/nodes/multishot-draft.ts`
- Modify: `src/components/nodes/multishot-focus-view.tsx` (props ~44-57, `saved` ~98-101, strip ~313-324)
- Modify: `src/components/nodes/multishot-node.tsx:160-169`
- Test: `src/lib/nodes/__tests__/multishot-draft.test.ts`

**Interfaces:**
- Consumes: `MultishotNodeData.sequenceVoiceover` (Task 6), `readVoLines` (Task 6)
- Produces: `MultishotDraft.sequenceVoiceover?: VoLine[]`; `commitDraft` returns it when present

- [ ] **Step 1: Write the failing test**

Append to `src/lib/nodes/__tests__/multishot-draft.test.ts`:

```ts
describe("sequence voiceover in the draft (D286)", () => {
  const cuts = [{ id: "c1", text: "a", seconds: 2 }];
  const seq = [{ text: "Made by hand.", speaker: "narrator" }];

  it("is dirty when only the sequence lines change", () => {
    expect(draftIsDirty({ cuts, sequenceVoiceover: seq }, { cuts, sequenceVoiceover: [] })).toBe(true);
  });

  it("commits the sequence lines with the cuts", () => {
    expect(commitDraft({ cuts, sequenceVoiceover: seq })).toMatchObject({ sequenceVoiceover: seq });
  });

  it("commits an emptied list as [] so a deletion is saved", () => {
    expect(commitDraft({ cuts, sequenceVoiceover: [] })).toMatchObject({ sequenceVoiceover: [] });
  });

  it("does not put the key on the patch when the node never had it", () => {
    expect(commitDraft({ cuts })).not.toHaveProperty("sequenceVoiceover");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-draft.test.ts`
Expected: FAIL — `sequenceVoiceover` not committed (and a type error on the draft literal).

- [ ] **Step 3: Implement the draft**

In `multishot-draft.ts`, import `type VoLine` from `./reel-script`; add to `MultishotDraft`:

```ts
  /** D286 — lines spanning every cut. Absent = the node has none, exactly as on MultishotNodeData. */
  sequenceVoiceover?: VoLine[];
```

change `commitDraft`'s return type to include `sequenceVoiceover?: VoLine[];` and add to its returned object:

```ts
    // Same spread rule as targetModel: absent stays absent, but an emptied list is written as []
    // so deleting the last line actually clears it.
    ...(draft.sequenceVoiceover !== undefined ? { sequenceVoiceover: draft.sequenceVoiceover } : {}),
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-draft.test.ts`
Expected: PASS.

- [ ] **Step 5: The lane**

`multishot-focus-view.tsx`:
- Props type: add after `targetModel?: string;`

```ts
  /** D286 — the SAVED lines spanning every cut. Buffered in the draft like the cuts. */
  sequenceVoiceover?: VoLine[];
```

- Destructure `sequenceVoiceover` next to `targetModel`, and replace the `saved` memo with:

```ts
  const saved: MultishotDraft = useMemo(
    () => ({
      cuts,
      ...(targetModel !== undefined ? { targetModel } : {}),
      ...(sequenceVoiceover !== undefined ? { sequenceVoiceover } : {}),
    }),
    [cuts, targetModel, sequenceVoiceover],
  );
```

- Immediately before `<ol className="grid grid-cols-[repeat(auto-fit,minmax(272px,1fr))] gap-x-4 gap-y-5">` insert:

```tsx
            {/* D286 — lines that play over the WHOLE clip, not one shot: a scene's narration the
                script did not tie to a single beat. One lane above the strip, in the same card
                idiom as a shot's own Voiceover lane, and hidden under the lock when empty for the
                same reason that one is. */}
            {(!isReadOnly || (draft.sequenceVoiceover?.length ?? 0) > 0) && (
              <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3.5 shadow-card">
                <span className="text-eyebrow text-muted-foreground">Voiceover · whole sequence</span>
                <VoLinesEditor
                  lines={draft.sequenceVoiceover}
                  readOnly={isReadOnly}
                  onChange={(next) => setDraft((d) => ({ ...d, sequenceVoiceover: next }))}
                />
              </div>
            )}
```

- Import `type VoLine` from `@/lib/nodes/reel-script`.

`multishot-node.tsx` — import `readVoLines` from `@/lib/nodes/voiceover` and pass to `<MultishotFocusView …>`:

```tsx
      sequenceVoiceover={readVoLines(d.sequenceVoiceover)}
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx eslint src/components/nodes/multishot-focus-view.tsx src/components/nodes/multishot-node.tsx src/lib/nodes/multishot-draft.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/nodes/multishot-draft.ts src/lib/nodes/__tests__/multishot-draft.test.ts src/components/nodes/multishot-focus-view.tsx src/components/nodes/multishot-node.tsx
git commit -m "feat(multishot): edit the whole-sequence voiceover in the focus view (D286)"
```

---

### Task 9: The toggle re-splits a stale scene

**Files:**
- Create: `src/lib/nodes/ensure-scene-beats.ts`
- Test: `src/lib/nodes/__tests__/ensure-scene-beats.test.ts`
- Modify: `src/components/nodes/generation-bracket.tsx`
- Modify: `src/components/nodes/script-node.tsx`, `script-focus-view.tsx`, `script-document.tsx`

**Interfaces:**
- Consumes: `beatsForScene`, `SceneBeatCache` (Task 1); `cacheSceneBeats` (Task 7); `split-scene` route (Task 5); `describeGenerations(…, beatCache)` (Task 3)
- Produces:
  - `type SplitResult = { beats: SceneBeat[]; beatsFor: string }`
  - `requestSceneSplit(scriptNodeId: string, scene: ReelShot, slices?: string[]): Promise<SplitResult>`
  - `ensureSceneBeats(row, cache, split): Promise<{ status: "fresh" } | { status: "split"; fingerprint: string; beats: SceneBeat[] } | { status: "failed" }>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/__tests__/ensure-scene-beats.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { ensureSceneBeats } from "../ensure-scene-beats";
import { sceneFingerprint } from "../scene-beats";

const row = { description: "A → B", duration_seconds: 4 };
const BEATS = [
  { description: "A", duration_seconds: 2 },
  { description: "B", duration_seconds: 2 },
];

describe("ensureSceneBeats", () => {
  it("does not call the split when the row's beats are fresh", async () => {
    const split = vi.fn();
    const stamped = { ...row, beats: BEATS, beatsFor: sceneFingerprint(row) };
    expect(await ensureSceneBeats(stamped, undefined, split)).toEqual({ status: "fresh" });
    expect(split).not.toHaveBeenCalled();
  });

  it("does not call the split on a cache hit", async () => {
    const split = vi.fn();
    expect(await ensureSceneBeats(row, { [sceneFingerprint(row)]: BEATS }, split)).toEqual({
      status: "fresh",
    });
    expect(split).not.toHaveBeenCalled();
  });

  it("splits a stale or unsplit row and returns the fingerprint to cache under", async () => {
    const split = vi.fn(async () => ({ beats: BEATS, beatsFor: sceneFingerprint(row) }));
    expect(await ensureSceneBeats(row, undefined, split)).toEqual({
      status: "split",
      fingerprint: sceneFingerprint(row),
      beats: BEATS,
    });
    expect(split).toHaveBeenCalledWith(row);
  });

  it("reports a failed split instead of throwing", async () => {
    const split = vi.fn(async () => {
      throw new Error("500");
    });
    expect(await ensureSceneBeats(row, undefined, split)).toEqual({ status: "failed" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/ensure-scene-beats.test.ts`
Expected: FAIL — cannot resolve `../ensure-scene-beats`.

- [ ] **Step 3: Implement**

Create `src/lib/nodes/ensure-scene-beats.ts`:

```ts
// D286 — client side of "turning multishot on cuts the scene at its beats". Split out of the
// component so the decision (fresh → nothing; stale → one split call; failure → one cut) is unit
// tested; the vitest env is node, so components cannot be rendered.
import type { ReelShot, SceneBeat } from "./reel-script";
import { beatsForScene, type SceneBeatCache } from "./scene-beats";

export type SplitResult = { beats: SceneBeat[]; beatsFor: string };

/** POST the stored row to the split-scene route. Throws on a non-2xx. */
export async function requestSceneSplit(
  scriptNodeId: string,
  scene: ReelShot,
  slices?: string[],
): Promise<SplitResult> {
  const res = await fetch(`/api/nodes/${scriptNodeId}/split-scene`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scene: {
        description: scene.description,
        duration_seconds: scene.duration_seconds,
        ...(scene.voiceover !== undefined ? { voiceover: scene.voiceover } : {}),
      },
      slices,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Split failed");
  return json as SplitResult;
}

export async function ensureSceneBeats(
  row: ReelShot,
  cache: SceneBeatCache | undefined,
  split: (row: ReelShot) => Promise<SplitResult>,
): Promise<
  | { status: "fresh" }
  | { status: "split"; fingerprint: string; beats: SceneBeat[] }
  | { status: "failed" }
> {
  if (beatsForScene(row, cache).fresh) return { status: "fresh" };
  try {
    const { beats, beatsFor } = await split(row);
    return { status: "split", fingerprint: beatsFor, beats };
  } catch {
    return { status: "failed" };
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/nodes/__tests__/ensure-scene-beats.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the toggle in `generation-bracket.tsx`**

Add `Loader2` to the lucide import, and:

```ts
import { toast } from "sonner";
import type { ScriptNodeData } from "@/lib/canvas-nodes";
import type { ReelScript } from "@/lib/nodes/reel-script";
import { ensureSceneBeats, requestSceneSplit } from "@/lib/nodes/ensure-scene-beats";
```

Below `const setGenerationMode = …`:

```ts
  const cacheSceneBeats = useCanvasStore((s) => s.cacheSceneBeats);
  const scriptData = useCanvasStore(
    (s) => s.nodes.find((n) => n.id === scriptNodeId)?.data as ScriptNodeData | undefined,
  );
  const [splitting, setSplitting] = useState(false);
```

Replace `handleChange` with:

```ts
  // D286 — turning a lone scene ON first makes sure its suggested beats describe the scene as it
  // is now. Reads the STORED row (what setGenerationMode builds from), not the focus view's draft.
  async function apply(next: boolean) {
    const row =
      generation.shotIndexes.length === 1
        ? (scriptData?.parsed as ReelScript | undefined)?.visual_script?.shots?.[
            generation.shotIndexes[0]
          ]
        : undefined;
    if (next && row) {
      setSplitting(true);
      const result = await ensureSceneBeats(row, scriptData?.sceneBeats, (r) =>
        requestSceneSplit(scriptNodeId, r, scriptData?.kbSlices),
      );
      setSplitting(false);
      if (result.status === "split") cacheSceneBeats(scriptNodeId, result.fingerprint, result.beats);
      if (result.status === "failed") toast.error("Couldn't split this scene — added as one cut");
    }
    setGenerationMode(scriptNodeId, generation.key, next);
  }

  function handleChange(next: boolean) {
    if (downstreamCount > 0) {
      setPending(next);
      return;
    }
    void apply(next);
  }
```

In the `AlertDialogAction` `onClick`, replace
`if (pending !== null) setGenerationMode(scriptNodeId, generation.key, pending);` with
`if (pending !== null) void apply(pending);`.

Replace the `Switch` element with:

```tsx
          {splitting && (
            <Loader2
              className="size-3 animate-spin text-muted-foreground"
              strokeWidth={1.5}
              aria-label="Splitting scene"
            />
          )}
          <Switch
            size="sm"
            checked={generation.multishot}
            disabled={isReadOnly || splitting}
            aria-label={`Multishot for generation ${generation.index + 1}`}
            onCheckedChange={handleChange}
          />
```

- [ ] **Step 6: Pass the cache to the Script document**

`script-node.tsx`: add `sceneBeats?: SceneBeatCache;` to the local data type next to `groupModes` (~line 35), `const sceneBeats = d.sceneBeats;` next to `const groupModes = d.groupModes;`, and `sceneBeats={sceneBeats}` next to `groupModes={groupModes}` (~line 150). Import `type SceneBeatCache` from `@/lib/nodes/scene-beats`.

`script-focus-view.tsx`: add `sceneBeats?: SceneBeatCache;` to the props type (next to line 46), destructure it (next to line 67), pass it as the fourth argument of the `describeGenerations` call (~115-119), and pass `sceneBeats={sceneBeats}` to `ScriptDocument` (next to line 373).

`script-document.tsx`: add `sceneBeats?: SceneBeatCache;` to `ScriptDocumentProps` (next to line 19), destructure it, and change line 107 to:

```ts
  const generations = describeGenerations(shots, groupModes, groupingVersion ?? 1, sceneBeats);
```

- [ ] **Step 7: Typecheck, lint, tests**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx eslint src/components/nodes src/lib/nodes src/lib/canvas-store.ts "src/app/api/nodes/[id]/split-scene"`
Expected: no errors.
Run: `npx vitest run src/lib/nodes src/lib/canvas-store.test.ts src/prompts src/lib/video-gen "src/app/api/nodes/[id]/split-scene" "src/app/api/nodes/[id]/multishot-prompt" "src/app/api/nodes/[id]/video-generate"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/nodes/ensure-scene-beats.ts src/lib/nodes/__tests__/ensure-scene-beats.test.ts src/components/nodes/generation-bracket.tsx src/components/nodes/script-node.tsx src/components/nodes/script-focus-view.tsx src/components/nodes/script-document.tsx
git commit -m "feat(script): turning multishot on re-splits an edited scene (D286)"
```

---

### Task 10: Verify in the running app

**Files:** none (verification only).

- [ ] **Step 1: Run the app** with the `run` skill (or `npm run dev`) and open a canvas.
- [ ] **Step 2: Parse a script** with a montage scene whose VO runs across it, e.g. `Scene 2 — Ritual | 5–11 sec` / `Visual: jar on marble → spoon lifts cream → hand smooths it on` / `VO: "Made slowly, by hand, from shea and rose."`, plus a continuous scene. Expect: the montage scene shows **Recommended**, the continuous one does not; no beats visible on the Script.
- [ ] **Step 3: Fan out, then toggle the montage scene ON.** Expect: 3 cuts of 2s; no spinner and no `split-scene` request; the Multishot focus view shows the VO in **Voiceover · whole sequence**, not on shot 1.
- [ ] **Step 4: Open the Multishot Prompt preview** for that node. Expect: `Across every shot — Voiceover: "Made slowly…"` between the look and the ladder, and in no shot line.
- [ ] **Step 5: Edit the continuous scene** in the Script focus view, Save, toggle it ON. Expect: a spinner, one `POST …/split-scene`, then cuts from the new split; unsaved draft edits elsewhere are kept.
- [ ] **Step 6: Go offline in devtools and toggle another edited scene ON.** Expect: the toast "Couldn't split this scene — added as one cut", one cut holding all its lines.
- [ ] **Step 7: Toggle the montage scene OFF.** Expect: one Shot take whose voiceover lists the sequence line.
- [ ] **Step 8: Report** any mismatch before finishing; otherwise run superpowers:finishing-a-development-branch.
