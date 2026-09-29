# Scene Beats → Multishot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The script parse pre-splits each scene into suggested cuts ("beats"), the Script node recommends multishot when a scene has 2+ beats, and turning multishot on builds the cuts from those beats — re-splitting just that scene via a new route when it was edited since the parse.

**Architecture:** Parse v10 adds a hidden `beats` list + `beatsFor` fingerprint to every scene row. Pure helpers in `src/lib/nodes/scene-beats.ts` (fingerprint, freshness, rows-for-cuts, cache prune) and `src/lib/nodes/normalize-beats.ts` (server-side normalisation) are shared by the parse route, a new `split-scene` route, the canvas store and the `GenerationBracket` toggle. Re-split results are cached in `ScriptNodeData.sceneBeats` keyed by fingerprint — never written into `parsed`, which is the active version's output (D19).

**Tech Stack:** Next.js route handlers, OpenAI chat completions with strict JSON schema (`gpt-5.4-mini`), zustand vanilla store, vitest (node env — no component rendering), shadcn/Base UI components, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-09-29-scene-beats-multishot-design.md` · **ADR:** D286

## Global Constraints

- Split rule: split only where the script signals cuts (montage, "A → B → C", "quick cuts of…", "cut to", separate setups); a continuous scene is exactly 1 beat. Never invent shots; never split to fit a model's window.
- A scene is still exactly one row (D278). Beats are never rendered on the Script node.
- Stale beats drive the badge but NEVER become cuts. No network call on edit, none in the synchronous store.
- `[]` and absent `voiceover` are different states everywhere (`cutsFromShots` rule).
- Never clamp silently (D237): a beat ladder outside a model's window is reported by `checkLadder`.
- API routes: `withNode`, `apiOk` / `apiError`, `withTryCatch` for the OpenAI call — never `NextResponse.json`.
- UI: shadcn primitives only (`Switch`, `Button`…), Lucide icons at `strokeWidth={1.5}`, no hardcoded colours.
- Import, don't redefine: `shotSeconds` from `group-shots.ts`, `MIN_CUT_SECONDS` from `multishot-cuts.ts`, `normalizeSlices` / `buildParseContext` from `src/lib/kb/parse-context.ts`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Group related edits; one commit per task.
- Run tests per file/directory (`npx vitest run <path>`); the full run has ~11 known timeout flakes in API route tests.

## File Map

| File | Responsibility |
|---|---|
| `src/lib/nodes/reel-script.ts` (modify) | `SceneBeat` type; `beats` / `beatsFor` on `ReelShot` |
| `src/lib/nodes/scene-beats.ts` (create) | Pure, type-only deps: `sceneFingerprint`, `beatsForScene`, `rowsForMultishot`, `pruneBeatCache`, `SceneBeatCache` |
| `src/lib/nodes/normalize-beats.ts` (create) | `normalizeBeats`, `stampSceneBeats` — server-side clean-up of model output |
| `src/lib/nodes/group-shots.ts` (modify) | `Generation.cutCount`; v3 recommendation from beats |
| `src/prompts/script-parse.ts` (modify) | v10: `beats` in schema, exported `SCENE_SPLIT_RULES`, `voLineSchema`, `sceneBeatSchema` |
| `src/app/api/nodes/[id]/parse/route.ts` (modify) | stamp beats after the model returns |
| `src/prompts/scene-split.ts` (create) | versioned `scene-split` prompt record |
| `src/lib/nodes/scene-split.ts` (create) | `parseSceneBody`, `compileSceneSplit` |
| `src/app/api/nodes/[id]/split-scene/route.ts` (create) | the one-scene split route |
| `src/lib/canvas-nodes.ts` (modify) | `ScriptNodeData.sceneBeats` |
| `src/lib/canvas-store.ts` (modify) | `cacheSceneBeats`; beats → cuts in flip and fan-out; cache into `describeGenerations` |
| `src/lib/nodes/ensure-scene-beats.ts` (create) | client: `requestSceneSplit`, `ensureSceneBeats` |
| `src/components/nodes/generation-bracket.tsx` (modify) | async toggle with spinner + fallback toast; reason text from `cutCount` |
| `src/components/nodes/script-node.tsx`, `script-focus-view.tsx`, `script-document.tsx` (modify) | pass `sceneBeats` alongside `groupModes` |

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
  - `rowsForMultishot(row: ReelShot, cache?: SceneBeatCache): ReelShot[]`
  - `pruneBeatCache(cache: SceneBeatCache | undefined, rows: ReelShot[], fingerprint: string, beats: SceneBeat[]): SceneBeatCache`

- [ ] **Step 1: Add the types to `reel-script.ts`**

Insert above `export type ReelShot`:

```ts
/**
 * D286 — one suggested cut inside a scene. The parse splits a scene only where the script itself
 * signals cuts; a continuous scene is exactly one beat. Never rendered on the Script node — beats
 * become cuts only when the operator turns multishot on.
 */
export type SceneBeat = {
  description: string;
  duration_seconds: number;
  /** Same `[]` vs absent rule as `ReelShot.voiceover`. */
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
import {
  sceneFingerprint,
  beatsForScene,
  rowsForMultishot,
  pruneBeatCache,
} from "../scene-beats";

const vo = (text: string) => ({ text, speaker: "narrator" });
const row = (over: Partial<ReelShot> = {}): ReelShot => ({
  description: "Jar on marble → spoon lifts cream → hand smooths it on",
  duration_seconds: 6,
  voiceover: [vo("Meet the jar.")],
  ...over,
});
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
    const cache = { [sceneFingerprint(edited)]: two };
    expect(beatsForScene(edited, cache)).toEqual({ beats: two, fresh: true });
  });

  it("reports a pre-v10 row as having no beats", () => {
    expect(beatsForScene(row())).toEqual({ beats: undefined, fresh: false });
  });
});

describe("rowsForMultishot", () => {
  it("turns 2+ fresh beats into one row each, voiceover carried", () => {
    expect(rowsForMultishot(stamped())).toEqual([
      { description: "Jar on marble", duration_seconds: 2, voiceover: [vo("Meet the jar.")] },
      { description: "Spoon lifts cream", duration_seconds: 2, voiceover: [] },
      { description: "Hand smooths it on", duration_seconds: 2, voiceover: [] },
    ]);
  });

  it("keeps the row whole when there is a single beat", () => {
    const r = { ...row(), beats: [THREE[0]], beatsFor: sceneFingerprint(row()) };
    expect(rowsForMultishot(r)).toEqual([r]);
  });

  it("never turns stale beats into cuts", () => {
    const edited = { ...stamped(), description: "Edited" };
    expect(rowsForMultishot(edited)).toEqual([edited]);
  });

  it("uses fresh cached beats", () => {
    const r = row();
    const cache = { [sceneFingerprint(r)]: THREE };
    expect(rowsForMultishot(r, cache)).toHaveLength(3);
  });

  it("omits voiceover on a cut whose beat has none", () => {
    const r = row({ voiceover: undefined });
    const beats = THREE.map(({ voiceover: _v, ...b }) => b);
    const rows = rowsForMultishot(r, { [sceneFingerprint(r)]: beats });
    expect(rows.every((x) => !("voiceover" in x))).toBe(true);
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
import type { ReelShot, SceneBeat } from "./reel-script";

/**
 * Re-split results, keyed by the fingerprint of the row they were split from. Lives on the
 * Script node's own data — never in `parsed`, which is the active version's output (D19).
 * Keyed by fingerprint so a hit is valid by construction.
 */
export type SceneBeatCache = Record<string, SceneBeat[]>;

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
 * The rows a multishot ladder is built from for ONE scene: its fresh beats when there are 2+,
 * otherwise the scene itself. Stale beats describe text the scene no longer has, so they are
 * never used here — the caller re-splits first, or accepts one cut.
 */
export function rowsForMultishot(row: ReelShot, cache?: SceneBeatCache): ReelShot[] {
  const { beats, fresh } = beatsForScene(row, cache);
  if (!fresh || !beats || beats.length < 2) return [row];
  return beats.map((b) => ({
    description: b.description,
    duration_seconds: b.duration_seconds,
    ...(b.voiceover !== undefined ? { voiceover: b.voiceover } : {}),
  }));
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
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/nodes/reel-script.ts src/lib/nodes/scene-beats.ts src/lib/nodes/__tests__/scene-beats.test.ts
git commit -m "feat(script): scene beat types and freshness helpers (D286)"
```

---

### Task 2: Server-side beat normalisation

**Files:**
- Create: `src/lib/nodes/normalize-beats.ts`
- Test: `src/lib/nodes/__tests__/normalize-beats.test.ts`

**Interfaces:**
- Consumes: `SceneBeat`, `ReelShot`, `ReelScript` (reel-script.ts); `sceneFingerprint` (Task 1); `shotSeconds` (group-shots.ts); `MIN_CUT_SECONDS` (multishot-cuts.ts)
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

describe("normalizeBeats — lengths", () => {
  it("keeps beats that already add up", () => {
    const out = normalizeBeats(row(), [beat("A", 3, ["One."]), beat("B", 3, ["Two."]), beat("C", 3)]);
    expect(secs(out)).toEqual([3, 3, 3]);
  });

  it("adds a shortfall to the longest beat", () => {
    expect(secs(normalizeBeats(row(), [beat("A", 2), beat("B", 4), beat("C", 1)]))).toEqual([2, 6, 1]);
  });

  it("takes an excess from the longest beats, never below one second", () => {
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
    const out = normalizeBeats(row({ duration_seconds: undefined }), undefined);
    expect(secs(out)).toEqual([4]);
  });
});

describe("normalizeBeats — shape", () => {
  it("mirrors the row as one beat when the model returned none", () => {
    expect(normalizeBeats(row(), [])).toEqual([
      { description: "A → B → C", duration_seconds: 9, voiceover: [vo("One."), vo("Two.")] },
    ]);
  });

  it("keeps the beats' lines when they conserve the scene's lines in order", () => {
    const out = normalizeBeats(row(), [beat("A", 3, ["One."]), beat("B", 3), beat("C", 3, ["Two."])]);
    expect(out.map((b) => b.voiceover?.map((l) => l.text))).toEqual([["One."], [], ["Two."]]);
  });

  it("puts every scene line on the first beat when the model dropped or duplicated one", () => {
    const out = normalizeBeats(row(), [beat("A", 3, ["One."]), beat("B", 3, ["One."]), beat("C", 3)]);
    expect(out.map((b) => b.voiceover?.map((l) => l.text))).toEqual([["One.", "Two."], [], []]);
  });

  it("leaves voiceover absent on every beat when the scene has no key", () => {
    const out = normalizeBeats(row({ voiceover: undefined }), [beat("A", 4, ["Invented."]), beat("B", 5)]);
    expect(out.every((b) => !("voiceover" in b))).toBe(true);
  });
});

describe("stampSceneBeats", () => {
  it("normalises every row and stamps the fingerprint of the row as parsed", () => {
    const script = { visual_script: { shots: [{ ...row(), beats: [beat("A", 9, ["One.", "Two."])] }] } };
    const out = stampSceneBeats(script);
    const shot = out.visual_script!.shots![0];
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
// add up and to conserve the scene's VO lines; this makes both true whatever it returned, so every
// consumer downstream can rely on them.
import type { ReelScript, ReelShot, SceneBeat } from "./reel-script";
import { shotSeconds } from "./group-shots";
import { MIN_CUT_SECONDS } from "./multishot-cuts";
import { sceneFingerprint } from "./scene-beats";

function indexOfLongest(values: number[]): number {
  return values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
}

/**
 * Lengths: whole seconds, each at least MIN_CUT_SECONDS, summing to the scene's length — the
 * difference goes to (or comes from) the longest beat. A scene too short for its beats' floors
 * keeps the floors: the ladder states that violation later, it is never silently clamped (D237).
 *
 * Lines: kept only if the beats carry exactly the scene's lines, in order. Otherwise the beats'
 * lines are dropped and the scene's go on the first beat — a dropped or doubled line is worse than
 * a line on the wrong cut, which the operator can move.
 */
export function normalizeBeats(row: ReelShot, raw: SceneBeat[] | undefined): SceneBeat[] {
  const total = Math.max(MIN_CUT_SECONDS, Math.round(shotSeconds(row)));
  const rowLines = row.voiceover;
  const withLines = (b: Omit<SceneBeat, "voiceover">, lines: SceneBeat["voiceover"]): SceneBeat =>
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

  const beatTexts = raw.flatMap((b) => (b.voiceover ?? []).map((l) => l.text));
  const rowTexts = (rowLines ?? []).map((l) => l.text);
  const conserved =
    beatTexts.length === rowTexts.length && beatTexts.every((t, i) => t === rowTexts[i]);

  return raw.map((b, i) =>
    withLines(
      { description: (b.description ?? "").trim(), duration_seconds: seconds[i] },
      conserved ? b.voiceover : i === 0 ? rowLines : [],
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
Expected: PASS. (Check the "excess" case by hand: 8+3+1 = 12, total 9, diff −3 → longest is 8 → 5. Result `[5, 3, 1]`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/normalize-beats.ts src/lib/nodes/__tests__/normalize-beats.test.ts
git commit -m "feat(script): normalise a scene split's lengths and lines (D286)"
```

---

### Task 3: Recommendation from beats

**Files:**
- Modify: `src/lib/nodes/group-shots.ts` (`Generation` type ~line 204, `describeGenerations` ~line 260)
- Modify: `src/components/nodes/generation-bracket.tsx:71-75` (reason text)
- Test: `src/lib/nodes/__tests__/group-shots.test.ts`

**Interfaces:**
- Consumes: `beatsForScene`, `SceneBeatCache` (Task 1)
- Produces:
  - `Generation.cutCount: number` — suggested cuts for a single-row generation (beats length, else 1), else `shotIndexes.length`
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
Expected: FAIL — `cutCount` undefined / `recommendMultishot` false for the 3-beat scene.

- [ ] **Step 3: Implement**

In `group-shots.ts`, add the import at the top:

```ts
import { beatsForScene, type SceneBeatCache } from "./scene-beats";
```

In the `Generation` type, replace the `recommendMultishot` doc comment and add `cutCount` just above it:

```ts
  /**
   * How many cuts multishot would make: a single scene's suggested beats (D286), else its row
   * count. 1 for a scene with no split.
   */
  cutCount: number;
  /** 2+ cuts, which multishot suits — advisory only, never auto-applied (D259). */
  recommendMultishot: boolean;
```

Change `describeGenerations`' signature and body:

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

Also update the doc comment above `describeGenerations` to mention `beatCache`: append the line
` * \`beatCache\` — the Script node's re-split cache (D286), consulted for a single scene's cut count.`

In `generation-bracket.tsx`, change line 71 from `const shotCount = generation.shotIndexes.length;` to:

```ts
  const shotCount = generation.cutCount;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/group-shots.test.ts`
Expected: PASS, including the existing "is what describeGenerations uses at the current version" test (its rows have no beats → `recommendMultishot: false`).

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
`import { scriptParsePrompt, SCENE_SPLIT_RULES } from "../script-parse";`, change the version test to

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
    expect(beats.items.required.sort()).toEqual(["description", "duration_seconds", "voiceover"]);
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
} as const;

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
} as const;

// D286 — how a scene is split into suggested cuts. ONE text, composed into the parse prompt and
// the scene-split prompt, so a scene splits the same way whichever of them runs.
export const SCENE_SPLIT_RULES = `Splitting a scene into beats (its suggested cuts, for when the operator generates it as a multishot sequence):
- Split ONLY where the scene's own text signals separate cuts: a montage, "A → B → C", "quick cuts of X, Y, Z", "cut to", or several distinct camera setups. A scene that describes one continuous action or one camera move is EXACTLY ONE beat whose description is the scene's description.
- Never invent a shot the scene does not describe, and never split a continuous action into camera angles the script did not ask for. Never split to fit a model's length limit.
- Each beat's description is the visual of that cut only, in the script's own words, keeping the product and subject named as the scene names them.
- Beat duration_seconds are whole seconds that add up to the scene's duration_seconds. Use the script's own per-beat timing when it gives one; otherwise share the scene's length evenly.
- Every voiceover line of the scene goes to exactly one beat, verbatim and in order — to the beat it plays over when the script says, otherwise in script order. Never drop, repeat or invent a line. A beat with no line gets [].`;
```

In `reelSchema`, replace the shot item's `required` and `voiceover` property:

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

In `system`, change the `visual_script` line (currently line 120) to list beats:

```
- visual_script: { shots: [{ description, duration, duration_seconds, clip, voiceover, beats }], execution_refinement } — one row per SCENE, in the order the script writes them.
```

Replace the montage bullet (currently line 122) with:

```
  - Each scene produces EXACTLY ONE row. A scene whose visual lists several beats — a montage, "A → B → C", "quick cuts of X, Y, Z" — is still one row, and its description keeps that prose as written. Do NOT split a montage into rows: its suggested cuts go in that row's beats, never in extra rows.
```

After the `voiceover` sub-bullets (after the line ending `every shot gets [].`) add:

```
  - beats: that scene's suggested cuts, per the splitting rules below.
```

Change `const system = \`...\`` to end with the rules — replace the closing
``- product_links: array of product URLs in the script.`;`` with:

```ts
- product_links: array of product URLs in the script.

${SCENE_SPLIT_RULES}`;
```

(`SCENE_SPLIT_RULES` must be declared above `system` — it is, since it sits above `reelSchema`.)

In `scriptParsePrompt`, add the history note under v9 and bump:

```ts
  // v10: every scene row also carries `beats` — its suggested cuts, split only where the script
  // signals them (SCENE_SPLIT_RULES, shared with scene-split). The row itself is unchanged; beats
  // become cuts only when the operator turns multishot on (D286).
  version: 10,
```

- [ ] **Step 4: Stamp beats in the parse route**

In `src/app/api/nodes/[id]/parse/route.ts`, add the import:

```ts
import { stampSceneBeats } from "@/lib/nodes/normalize-beats";
```

and change

```ts
      const output = JSON.parse(content);
```

to

```ts
      // D286 — make each scene's beats add up and conserve its lines, and record which row text
      // they were split from, so a later edit reads as a stale split.
      const output = stampSceneBeats(JSON.parse(content));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/prompts/__tests__/script-parse-schema.test.ts src/lib/nodes/__tests__`
Expected: PASS. (The existing voiceover-shape test still passes: `voLineSchema` is identical to the old inline object.)

- [ ] **Step 6: Commit**

```bash
git add src/prompts/script-parse.ts src/prompts/__tests__/script-parse-schema.test.ts "src/app/api/nodes/[id]/parse/route.ts"
git commit -m "feat(script-parse): v10 returns each scene's suggested beats (D286)"
```

---

### Task 5: `split-scene` route

**Files:**
- Create: `src/prompts/scene-split.ts`
- Create: `src/lib/nodes/scene-split.ts`
- Create: `src/app/api/nodes/[id]/split-scene/route.ts`
- Test: `src/lib/nodes/__tests__/scene-split.test.ts`
- Test: `src/app/api/nodes/[id]/split-scene/route.test.ts`

**Interfaces:**
- Consumes: `SCENE_SPLIT_RULES`, `sceneBeatSchema` (Task 4); `normalizeBeats` (Task 2); `sceneFingerprint` (Task 1)
- Produces:
  - `sceneSplitPrompt` `{ id: "scene-split", version: 1, model: "gpt-5.4-mini", system, schema }`
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
    const { user } = compileSceneSplit(
      { description: "A → B", duration_seconds: 6, voiceover: [vo] },
      "",
    );
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
      : `Voiceover lines, in order:\n${lines
          .map((l, i) => `${i + 1}. (${l.speaker}) "${l.text}"`)
          .join("\n")}`;
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

### Task 6: Store — beats become cuts, and the re-split cache

**Files:**
- Modify: `src/lib/canvas-nodes.ts` (`ScriptNodeData`, ~line 16)
- Modify: `src/lib/canvas-store.ts` (imports ~line 23-33; `CanvasState` ~line 63; `fanOutShots` ~line 443 and ~492-503; `setGenerationMode` ~line 560-612)
- Test: `src/lib/canvas-store.test.ts`

**Interfaces:**
- Consumes: `rowsForMultishot`, `pruneBeatCache`, `SceneBeatCache` (Task 1); `describeGenerations(…, beatCache)` (Task 3)
- Produces:
  - `ScriptNodeData.sceneBeats?: SceneBeatCache`
  - `CanvasState.cacheSceneBeats(scriptNodeId: string, fingerprint: string, beats: SceneBeat[]): void`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/canvas-store.test.ts` (add `import { sceneFingerprint } from "./nodes/scene-beats";` to the imports):

```ts
describe("scene beats become cuts (D286)", () => {
  const plain = { description: "Jar → spoon → hand", duration_seconds: 6, voiceover: [] };
  const BEATS = [
    { description: "Jar", duration_seconds: 2, voiceover: [] },
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
  const cutsOf = (store: ReturnType<typeof createCanvasStore>) =>
    (store.getState().nodes.find((n) => n.type === "multishot")!.data as {
      cuts: { text: string; seconds: number }[];
    }).cuts.map((c) => [c.text, c.seconds]);

  it("flipping a fanned-out scene to multishot builds one cut per fresh beat", () => {
    const store = createCanvasStore([v3Script(stampedRow)], []);
    store.getState().fanOutShots("sc");
    store.getState().setGenerationMode("sc", "0", true);
    expect(cutsOf(store)).toEqual([["Jar", 2], ["Spoon", 2], ["Hand", 2]]);
  });

  it("fans out a scene already set to multishot with its beats as cuts", () => {
    const store = createCanvasStore([v3Script(stampedRow, { groupModes: { "0": true } })], []);
    store.getState().fanOutShots("sc");
    expect(cutsOf(store)).toHaveLength(3);
  });

  it("uses one cut when the beats are stale", () => {
    const store = createCanvasStore([v3Script({ ...stampedRow, description: "Edited" })], []);
    store.getState().fanOutShots("sc");
    store.getState().setGenerationMode("sc", "0", true);
    expect(cutsOf(store)).toEqual([["Edited", 6]]);
  });

  it("uses cached beats written by cacheSceneBeats", () => {
    const store = createCanvasStore([v3Script(plain)], []);
    store.getState().cacheSceneBeats("sc", sceneFingerprint(plain), BEATS);
    store.getState().fanOutShots("sc");
    store.getState().setGenerationMode("sc", "0", true);
    expect(cutsOf(store)).toHaveLength(3);
  });

  it("cacheSceneBeats prunes keys no current row matches", () => {
    const store = createCanvasStore([v3Script(plain, { sceneBeats: { gone: BEATS } })], []);
    store.getState().cacheSceneBeats("sc", sceneFingerprint(plain), BEATS);
    const data = store.getState().nodes[0].data as { sceneBeats?: Record<string, unknown> };
    expect(Object.keys(data.sceneBeats ?? {})).toEqual([sceneFingerprint(plain)]);
  });

  it("does not touch parsed when caching", () => {
    const store = createCanvasStore([v3Script(plain)], []);
    const before = (store.getState().nodes[0].data as { parsed: unknown }).parsed;
    store.getState().cacheSceneBeats("sc", sceneFingerprint(plain), BEATS);
    expect((store.getState().nodes[0].data as { parsed: unknown }).parsed).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: FAIL — `cacheSceneBeats` is not a function; flip gives 1 cut.

- [ ] **Step 3: Add the node-data field**

In `src/lib/canvas-nodes.ts`, import the type (`import type { SceneBeatCache } from "@/lib/nodes/scene-beats";`) and add to `ScriptNodeData` after `groupingVersion`:

```ts
  /**
   * D286 — re-split results for scenes edited since the parse, keyed by `sceneFingerprint`.
   * Kept here, not in `parsed` (the active version's output, D19): writing that would reseed the
   * focus view's unsaved draft. Pruned to the current rows on every write.
   */
  sceneBeats?: SceneBeatCache;
```

- [ ] **Step 4: Implement in the store**

In `canvas-store.ts`:

Imports — add:

```ts
import type { SceneBeat } from "@/lib/nodes/reel-script";
import { rowsForMultishot, pruneBeatCache, type SceneBeatCache } from "@/lib/nodes/scene-beats";
```

`CanvasState` — add below `setGenerationMode`:

```ts
  /** D286 — cache one scene's fresh split on the Script node (never in `parsed`). */
  cacheSceneBeats: (scriptNodeId: string, fingerprint: string, beats: SceneBeat[]) => void;
```

In `fanOutShots`, find where `data` is typed for the script node (just above line 440) and add
`sceneBeats?: SceneBeatCache;` to that inline type, then pass the cache (line 443):

```ts
      const generations = describeGenerations(
        shots,
        data.groupModes,
        data.groupingVersion ?? 1,
        data.sceneBeats,
      );
```

and in the multishot branch (line ~502) replace `const cuts = cutsFromShots(groupShots);` with:

```ts
          // D286 — a lone scene is cut at its fresh suggested beats; stale ones make one cut.
          const cutRows =
            groupShots.length === 1 ? rowsForMultishot(groupShots[0], data.sceneBeats) : groupShots;
          const cuts = cutsFromShots(cutRows);
```

In `setGenerationMode`: add `sceneBeats?: SceneBeatCache;` to the `data` inline type; pass
`data.sceneBeats` as the fourth argument to its `describeGenerations` call; and replace

```ts
      const scriptRows = generation.shotIndexes.map((i) => shots[i]).filter(Boolean);
```

with

```ts
      const groupRows = generation.shotIndexes.map((i) => shots[i]).filter(Boolean);
      // D286 — a lone scene's fresh suggested beats are the rows its cuts come from. The toggle
      // re-splits a stale scene BEFORE calling here; a failed re-split lands as one cut.
      const scriptRows =
        groupRows.length === 1 ? rowsForMultishot(groupRows[0], data.sceneBeats) : groupRows;
```

Add the new action after `setGenerationMode`:

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

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/canvas-store.test.ts src/lib/nodes`
Expected: PASS (new and existing `setGenerationMode` / `fanOutShots` tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-store.ts src/lib/canvas-store.test.ts
git commit -m "feat(canvas): multishot cuts from a scene's beats, with a re-split cache (D286)"
```

---

### Task 7: The toggle re-splits a stale scene

**Files:**
- Create: `src/lib/nodes/ensure-scene-beats.ts`
- Test: `src/lib/nodes/__tests__/ensure-scene-beats.test.ts`
- Modify: `src/components/nodes/generation-bracket.tsx`
- Modify: `src/components/nodes/script-node.tsx`, `src/components/nodes/script-focus-view.tsx`, `src/components/nodes/script-document.tsx` (pass `sceneBeats`)

**Interfaces:**
- Consumes: `beatsForScene`, `sceneFingerprint`, `SceneBeatCache` (Task 1); `cacheSceneBeats` (Task 6); `split-scene` route (Task 5); `describeGenerations(…, beatCache)` (Task 3)
- Produces:
  - `type SplitResult = { beats: SceneBeat[]; beatsFor: string }`
  - `requestSceneSplit(scriptNodeId: string, scene: ReelShot, slices?: string[]): Promise<SplitResult>`
  - `ensureSceneBeats(row: ReelShot, cache: SceneBeatCache | undefined, split: (row: ReelShot) => Promise<SplitResult>): Promise<{ status: "fresh" } | { status: "split"; fingerprint: string; beats: SceneBeat[] } | { status: "failed" }>`

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
    const cache = { [sceneFingerprint(row)]: BEATS };
    expect(await ensureSceneBeats(row, cache, split)).toEqual({ status: "fresh" });
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
  { status: "fresh" } | { status: "split"; fingerprint: string; beats: SceneBeat[] } | { status: "failed" }
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

Imports — add `Loader2` to the lucide import, and:

```ts
import { toast } from "sonner";
import type { ScriptNodeData } from "@/lib/canvas-nodes";
import type { ReelScript } from "@/lib/nodes/reel-script";
import { ensureSceneBeats, requestSceneSplit } from "@/lib/nodes/ensure-scene-beats";
```

Inside the component, below `const setGenerationMode = …`:

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

Replace the `Switch` element with the spinner beside it:

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

`script-node.tsx`: add `sceneBeats?: SceneBeatCache;` to the local data type next to `groupModes` (line ~35), `const sceneBeats = d.sceneBeats;` next to `const groupModes = d.groupModes;`, and `sceneBeats={sceneBeats}` next to `groupModes={groupModes}` (line ~150). Import `type SceneBeatCache` from `@/lib/nodes/scene-beats`.

`script-focus-view.tsx`: add `sceneBeats?: SceneBeatCache;` to the props type (next to line 46), destructure it (next to line 67), pass it as the fourth argument to `describeGenerations` (line ~115-119), and pass `sceneBeats={sceneBeats}` to `ScriptDocument` (next to line 373).

`script-document.tsx`: add `sceneBeats?: SceneBeatCache;` to `ScriptDocumentProps` (next to line 19), destructure it, and change line 107 to:

```ts
  const generations = describeGenerations(shots, groupModes, groupingVersion ?? 1, sceneBeats);
```

- [ ] **Step 7: Typecheck, lint, and run the affected tests**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx eslint src/components/nodes/generation-bracket.tsx src/components/nodes/script-node.tsx src/components/nodes/script-focus-view.tsx src/components/nodes/script-document.tsx src/lib/nodes src/lib/canvas-store.ts "src/app/api/nodes/[id]/split-scene"`
Expected: no errors.
Run: `npx vitest run src/lib/nodes src/lib/canvas-store.test.ts src/prompts "src/app/api/nodes/[id]/split-scene"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/nodes/ensure-scene-beats.ts src/lib/nodes/__tests__/ensure-scene-beats.test.ts src/components/nodes/generation-bracket.tsx src/components/nodes/script-node.tsx src/components/nodes/script-focus-view.tsx src/components/nodes/script-document.tsx
git commit -m "feat(script): turning multishot on re-splits an edited scene (D286)"
```

---

### Task 8: Verify in the running app

**Files:** none (verification only).

- [ ] **Step 1: Run the app** with the `run` skill (or `npm run dev`) and open a canvas.
- [ ] **Step 2: Parse a script with a montage scene** (e.g. `Scene 2 — Ritual | 5–11 sec` / `Visual: jar on marble → spoon lifts cream → hand smooths it on` / `VO: "Meet the jar."`) and a continuous scene. Expect: the montage scene's bracket shows **Recommended**; the continuous one does not; the Script shows one row per scene with no beats visible.
- [ ] **Step 3: Fan out, then toggle the montage scene ON.** Expect: the Multishot node has 3 cuts with 2s each, VO on the first; no spinner (fresh beats, no request in the network tab).
- [ ] **Step 4: Edit the continuous scene's description** in the focus view, Save, then toggle it ON. Expect: a spinner, one `POST …/split-scene` in the network tab, then cuts from the new split; unsaved edits elsewhere in the draft are kept.
- [ ] **Step 5: Kill the network (devtools offline) and toggle another edited scene ON.** Expect: the toast "Couldn't split this scene — added as one cut" and a single-cut Multishot node.
- [ ] **Step 6: Report** any mismatch before finishing; otherwise run superpowers:finishing-a-development-branch.
