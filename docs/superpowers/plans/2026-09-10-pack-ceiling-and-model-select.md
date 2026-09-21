# Pack Ceiling, Multishot Opt-In and Model Select — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise fan-out packing from a hardcoded 10s to the widest window any multishot model publishes (30s, Seedance 2.5), pinned per parse so no existing canvas reshapes; stop fan-out enabling multishot on the operator's behalf; and repair the Multishot model select, which renders a raw model id.

**Architecture:** `group-shots.ts` stops owning limits and derives them from `MULTISHOT_MODELS`. A `groupingVersion` field on `ScriptNodeData` (absent = 1) selects both the pack ceiling and the multishot default together, so existing nodes keep the rules they were packed under and a re-parse adopts the new ones. The Script node gains exactly two visual additions — an over-ceiling warning and a multishot recommendation — and names no models; capability stays the Multishot node's business.

**Tech Stack:** Next.js (see `node_modules/next/dist/docs/` — this version differs from training data), React 19, TypeScript, Zustand (`canvas-store`), `@xyflow/react`, Base UI via shadcn (`src/components/ui/`), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-10-pack-ceiling-and-model-select-design.md`
**Decisions:** D257–D260 in `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7.

## Global Constraints

- **Controls are shadcn primitives only.** Never a raw `<button>`, `<input>`, `<select>`. Base UI composes via the `render` prop, not `asChild`. Non-interactive `span`/`div`/`p` for labels and badges is fine.
- **Derive limits, never author them.** A limit a vendor published and a limit we invented must not be indistinguishable at the call site (D235). `null` in `MULTISHOT_MODELS` means "the vendor states no limit" and renders as absence, never as a number.
- **Import, don't redefine** (`AGENTS.md`). A narrower set that is intentionally smaller than a canonical one is not a duplicate — name it clearly and keep it separate.
- **Colors come from the shadcn CSS variables** in `src/app/globals.css`. Purple `#5829c7` is reserved for the primary CTA, brand mark and focus ring — never a capability label. Icons are Lucide, 1.5 stroke, no fills.
- **Run tests targeted, not as a full suite.** A full `npm test` has ~11 known timeout flakes in API-route tests that pass in isolation. Use `npx vitest run <path>`.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/nodes/group-shots.ts` | Packing, derived window, version rules | Modify |
| `src/lib/nodes/__tests__/group-shots.test.ts` | Packing tests | Modify |
| `src/lib/nodes/derive-shot-duration.ts` | Single-take duration — own narrower window | Modify |
| `src/lib/nodes/multishot-models.ts` | Capability table + `describeCapability` | Modify |
| `src/lib/nodes/__tests__/multishot-models.test.ts` | Capability tests | Modify |
| `src/lib/canvas-nodes.ts` | `ScriptNodeData.groupingVersion` | Modify |
| `src/lib/canvas-store.ts` | Fan-out + `setGenerationMode` read the version | Modify |
| `src/components/nodes/script-focus-view.tsx` | Writes the version on parse; threads it down | Modify |
| `src/components/nodes/script-node.tsx` | Reads the version off node data | Modify |
| `src/components/nodes/script-document.tsx` | Passes the version to `describeGenerations` | Modify |
| `src/components/nodes/generation-bracket.tsx` | Warning badge + Recommended hint | Modify |
| `src/components/nodes/multishot-focus-view.tsx` | Model select | Modify |

---

### Task 1: Derive the pack window and parameterise the ceiling

`groupShotsForFanOut` hardcodes `OMNI_MAX_SECONDS = 10`. This makes the window derive from `MULTISHOT_MODELS` and lets callers pass a ceiling, defaulting to the legacy 10 so every existing test and caller is unchanged.

`derive-shot-duration.ts` is the one other consumer of the OMNI constants. It clamps a **single-take** Shot's video duration and must NOT follow the pack ceiling to 30s — no single-take video model offers that. It gets its own narrower, separately-named constants.

**Files:**
- Modify: `src/lib/nodes/group-shots.ts:1-96`
- Modify: `src/lib/nodes/derive-shot-duration.ts:1-15`
- Test: `src/lib/nodes/__tests__/group-shots.test.ts`

**Interfaces:**
- Consumes: `MULTISHOT_MODELS` from `src/lib/nodes/multishot-models.ts` (existing; no import cycle — `multishot-models.ts` imports only from `@/lib/video-gen/client-models`).
- Produces:
  - `PACK_FLOOR_SECONDS: number` (3), `PACK_CEILING_SECONDS: number` (30), `LEGACY_PACK_CEILING: number` (10)
  - `groupShotsForFanOut(shots: ReelShot[], ceiling?: number): ShotGroup[]`
  - `ASSUMED_SHOT_SECONDS`, `shotSeconds`, `ShotGroup`, `Generation`, `generationKey` — all unchanged
  - `OMNI_MIN_SECONDS` / `OMNI_MAX_SECONDS` are **removed**

- [ ] **Step 1: Write the failing tests**

Add to the top import block of `src/lib/nodes/__tests__/group-shots.test.ts`:

```ts
import {
  groupShotsForFanOut,
  shotSeconds,
  describeGenerations,
  generationKey,
  PACK_CEILING_SECONDS,
  PACK_FLOOR_SECONDS,
  LEGACY_PACK_CEILING,
} from "../group-shots";
import { MULTISHOT_MODELS } from "../multishot-models";
```

Append these two `describe` blocks to the end of the file:

```ts
describe("pack window", () => {
  // Derived, not authored — asserted against the table rather than against today's 30/3, so a
  // vendor moving a limit cannot leave these agreeing by coincidence.
  it("takes its ceiling from the widest model window", () => {
    expect(PACK_CEILING_SECONDS).toBe(
      Math.max(...MULTISHOT_MODELS.map((m) => m.maxTotalSeconds)),
    );
  });

  it("takes its floor from the lowest model minimum", () => {
    expect(PACK_FLOOR_SECONDS).toBe(
      Math.min(...MULTISHOT_MODELS.map((m) => m.minTotalSeconds)),
    );
  });

  // A fact about rows already on disk, NOT a claim about a model — so it must not track the table.
  it("pins the legacy ceiling at 10 independently of the table", () => {
    expect(LEGACY_PACK_CEILING).toBe(10);
  });
});

describe("groupShotsForFanOut ceiling parameter", () => {
  it("defaults to the legacy 10s ceiling", () => {
    expect(shape(groupShotsForFanOut(shots(4, 5, 4)))).toEqual([
      { idx: [0, 1], s: 9 },
      { idx: [2], s: 4 },
    ]);
  });

  // THE POINT OF THE CHANGE. The CHUPPS fixture packs to three groups at 10s and one at 30s.
  it("packs a whole reel into one group at 30s", () => {
    expect(shape(groupShotsForFanOut(shots(3, 5, 6, 4, 2), 30))).toEqual([
      { idx: [0, 1, 2, 3, 4], s: 20 },
    ]);
  });

  it("still splits when the passed ceiling is exceeded", () => {
    expect(shape(groupShotsForFanOut(shots(20, 15), 30))).toEqual([
      { idx: [0], s: 20 },
      { idx: [1], s: 15 },
    ]);
  });

  // The rebalance must test overflow against the PASSED ceiling. Greedy gives [0,1]=29 / [2]=2;
  // the 2s tail is under the floor, so shot 1 moves forward — legal only because 11 <= 30.
  it("rebalances against the passed ceiling", () => {
    expect(shape(groupShotsForFanOut(shots(20, 9, 2), 30))).toEqual([
      { idx: [0], s: 20 },
      { idx: [1, 2], s: 11 },
    ]);
  });

  // Declines the move that would strand the group it steals from, exactly as at 10s.
  it("declines a stranding move at 30s and clamps the tail instead", () => {
    expect(shape(groupShotsForFanOut(shots(1, 28, 2), 30))).toEqual([
      { idx: [0, 1], s: 29 },
      { idx: [2], s: 3 },
    ]);
  });

  it("keeps a single shot longer than the ceiling whole", () => {
    expect(groupShotsForFanOut(shots(34), 30)).toEqual([
      { shotIndexes: [0], seconds: 34 },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/group-shots.test.ts`
Expected: FAIL — `PACK_CEILING_SECONDS` etc. are `undefined`, and the ceiling-parameter cases pack at 10.

- [ ] **Step 3: Derive the window and thread the ceiling**

Replace lines 1–17 of `src/lib/nodes/group-shots.ts` with:

```ts
import type { ReelShot } from "./reel-script";
import { MULTISHOT_MODELS } from "./multishot-models";

/**
 * D258 — the packing window, derived from what the models publish.
 *
 * The ceiling is the WIDEST window any multishot model offers, so packing never splits a run of
 * shots that some model could have generated in one go. The floor is the lowest minimum, so a
 * packed group is never born shorter than every model will accept.
 *
 * Derived, not authored: a fourth model, or a vendor moving a limit, changes packing with no edit
 * here. That is D235's own rule — an invented limit and a published one must not be
 * indistinguishable at the call site — now applied to grouping, which D235 itself carved out.
 */
export const PACK_FLOOR_SECONDS = Math.min(...MULTISHOT_MODELS.map((m) => m.minTotalSeconds));
export const PACK_CEILING_SECONDS = Math.max(...MULTISHOT_MODELS.map((m) => m.maxTotalSeconds));

/**
 * What v1 Script nodes were packed at (D257).
 *
 * A fact about rows already on disk, NOT a claim about any model, so it is authored and must never
 * be re-derived from the table. Naming it after Omni would make it look like it tracks Omni's
 * window; it does not, and Omni's window moving must not silently repack old canvases.
 */
export const LEGACY_PACK_CEILING = 10;

/** What a shot with no usable length is worth for packing. Shown as assumed, not parsed. */
export const ASSUMED_SHOT_SECONDS = 4;

export type ShotGroup = {
  shotIndexes: number[];
  seconds: number;
};

export function shotSeconds(shot: ReelShot): number {
  const n = Number(shot.duration_seconds);
  return Number.isFinite(n) && n > 0 ? n : ASSUMED_SHOT_SECONDS;
}
```

In `rebalanceTrailing`, take the ceiling as a parameter and swap the two constants. Replace its signature and the two comparisons:

```ts
function rebalanceTrailing(groups: ShotGroup[], lengths: number[], ceiling: number): void {
  while (groups.length >= 2) {
    const last = groups[groups.length - 1];
    if (last.seconds >= PACK_FLOOR_SECONDS) return;

    const prev = groups[groups.length - 2];
    if (prev.shotIndexes.length < 2) return;

    const moved = prev.shotIndexes[prev.shotIndexes.length - 1];
    const movedLength = lengths[moved];
    if (last.seconds + movedLength > ceiling) return;
```

and the third guard:

```ts
    if (prev.seconds - movedLength < PACK_FLOOR_SECONDS) return;
```

In `groupShotsForFanOut`, add the parameter and use it:

```ts
export function groupShotsForFanOut(
  shots: ReelShot[],
  ceiling: number = LEGACY_PACK_CEILING,
): ShotGroup[] {
  if (shots.length === 0) return [];

  const lengths = shots.map(shotSeconds);
  const groups: ShotGroup[] = [];
  let current: number[] = [];
  let total = 0;

  lengths.forEach((length, index) => {
    if (current.length > 0 && total + length > ceiling) {
      groups.push({ shotIndexes: current, seconds: total });
      current = [];
      total = 0;
    }
    current.push(index);
    total += length;
  });
  if (current.length > 0) {
    groups.push({ shotIndexes: current, seconds: total });
  }

  rebalanceTrailing(groups, lengths, ceiling);

  return groups.map((group) => ({
    ...group,
    seconds: group.seconds < PACK_FLOOR_SECONDS ? PACK_FLOOR_SECONDS : group.seconds,
  }));
}
```

- [ ] **Step 4: Give `derive-shot-duration` its own window**

Replace `src/lib/nodes/derive-shot-duration.ts` entirely:

```ts
import type { ReelScript } from "@/lib/nodes/reel-script";
import { shotSeconds } from "@/lib/nodes/group-shots";

/**
 * A SINGLE TAKE's window — deliberately not the multishot pack window (D258).
 *
 * Narrower and separately named on purpose. This clamps the duration requested of a single-take
 * video model for one Shot node, where 30s is on offer from no provider. It borrowed group-shots'
 * OMNI_* constants until those became the 30s pack ceiling; sharing them past that point would
 * have started requesting takes nothing can generate.
 */
const SHOT_MIN_SECONDS = 3;
const SHOT_MAX_SECONDS = 10;

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
  return Math.min(SHOT_MAX_SECONDS, Math.max(SHOT_MIN_SECONDS, Math.round(total)));
}
```

- [ ] **Step 5: Run both test files to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/group-shots.test.ts src/lib/nodes/__tests__/derive-shot-duration.test.ts`
Expected: PASS — all pre-existing cases plus the nine new ones. `derive-shot-duration.test.ts` passes unchanged, which is the point: its behaviour is identical, only its constants are now its own.

- [ ] **Step 6: Rewrite D235's stale carve-out comment**

`src/lib/nodes/multishot-models.ts` lines 11–14 currently state that `group-shots.ts` is NOT parameterised by the table. That is now false. Replace those four lines with:

```ts
// Parameterised by this table since D258: `group-shots.ts` derives its pack window from the
// `minTotalSeconds` / `maxTotalSeconds` columns. It used to pack to Omni's 10s as a safe floor,
// on the reasoning that packing runs before a model is chosen — correct until Seedance 2.5's 30s
// window made that safety cost three generations where one would do. Which ceiling a given Script
// node was packed at is pinned per parse as `groupingVersion` (D257), so raising it here does not
// repack canvases that already exist.
```

- [ ] **Step 7: Verify nothing else referenced the removed constants**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `OMNI_MIN_SECONDS` or `OMNI_MAX_SECONDS`. (`multishot-cuts.test.ts` defines its own local aliases from `OMNI.maxTotalSeconds` and is unaffected.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/nodes/group-shots.ts src/lib/nodes/derive-shot-duration.ts src/lib/nodes/multishot-models.ts src/lib/nodes/__tests__/group-shots.test.ts
git commit -m "$(cat <<'EOF'
feat(grouping): derive the pack window from the capability table

D258. PACK_CEILING_SECONDS / PACK_FLOOR_SECONDS replace OMNI_MAX_SECONDS /
OMNI_MIN_SECONDS, computed from MULTISHOT_MODELS. groupShotsForFanOut takes
the ceiling as a parameter, defaulting to LEGACY_PACK_CEILING so no caller
changes behaviour yet.

derive-shot-duration keeps a single take's narrower [3,10] under its own
names — it clamps what one video model is asked for, not how shots pack.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `groupingVersion` selects the ceiling and the multishot default

One flag carries both v2 behaviours, because they were decided together: a canvas packed under v1 rules was also defaulted under them, and splitting the flag would permit a state no parse ever produced.

The multishot default is extracted because it currently exists twice — in `describeGenerations` and inline in `canvas-store.ts:553`. Under v2 the second copy would store `false` as a deviation when `false` is the default, pinning a value that outlives the grouping it describes.

**Files:**
- Modify: `src/lib/nodes/group-shots.ts` (`Generation`, `describeGenerations`)
- Test: `src/lib/nodes/__tests__/group-shots.test.ts`

**Interfaces:**
- Consumes: Task 1's `PACK_CEILING_SECONDS`, `LEGACY_PACK_CEILING`, `groupShotsForFanOut(shots, ceiling)`.
- Produces:
  - `type GroupingVersion = 1 | 2`
  - `CURRENT_GROUPING_VERSION: GroupingVersion` (= 2)
  - `ceilingForVersion(version: GroupingVersion): number`
  - `defaultMultishotFor(shotIndexes: number[], version: GroupingVersion): boolean`
  - `describeGenerations(shots, overrides?, groupingVersion?: GroupingVersion): Generation[]` — third param defaults to `1`
  - `Generation` gains `overCeiling: boolean` and `recommendMultishot: boolean`

- [ ] **Step 1: Write the failing tests**

Add `defaultMultishotFor`, `ceilingForVersion` and `CURRENT_GROUPING_VERSION` to the test file's import from `../group-shots`. Append:

```ts
describe("grouping version", () => {
  it("is 2 for new parses", () => {
    expect(CURRENT_GROUPING_VERSION).toBe(2);
  });

  it("maps v1 to the legacy ceiling and v2 to the derived one", () => {
    expect(ceilingForVersion(1)).toBe(LEGACY_PACK_CEILING);
    expect(ceilingForVersion(2)).toBe(PACK_CEILING_SECONDS);
  });

  // v1 keeps the rule existing canvases were defaulted under; v2 never turns multishot on.
  it("defaults multishot by version, not by shot count alone", () => {
    expect(defaultMultishotFor([0, 1], 1)).toBe(true);
    expect(defaultMultishotFor([0], 1)).toBe(false);
    expect(defaultMultishotFor([0, 1], 2)).toBe(false);
    expect(defaultMultishotFor([0], 2)).toBe(false);
  });
});

describe("describeGenerations by version", () => {
  // The migration, asserted: an absent version behaves exactly as today.
  it("defaults to v1 — today's packing and today's multishot rule", () => {
    const gens = describeGenerations(shots(3, 5, 6));
    expect(gens.map((g) => g.shotIndexes)).toEqual([[0, 1], [2]]);
    expect(gens.map((g) => g.multishot)).toEqual([true, false]);
  });

  it("packs to 30s and defaults every generation to single under v2", () => {
    const gens = describeGenerations(shots(3, 5, 6, 4, 2), undefined, 2);
    expect(gens.map((g) => g.shotIndexes)).toEqual([[0, 1, 2, 3, 4]]);
    expect(gens.map((g) => g.multishot)).toEqual([false]);
  });

  it("still honours an explicit override under v2", () => {
    const gens = describeGenerations(shots(3, 5, 6, 4, 2), { "0-1-2-3-4": true }, 2);
    expect(gens[0].multishot).toBe(true);
  });

  it("recommends multishot for a multi-shot group without enabling it", () => {
    const gens = describeGenerations(shots(3, 5, 6, 4, 2), undefined, 2);
    expect(gens[0].recommendMultishot).toBe(true);
    expect(gens[0].multishot).toBe(false);
  });

  it("does not recommend multishot for a lone shot", () => {
    expect(describeGenerations(shots(6), undefined, 2)[0].recommendMultishot).toBe(false);
  });

  // Reachable only via a single shot kept whole — packing can never build one by adding.
  it("flags a generation longer than the ceiling", () => {
    const gens = describeGenerations(shots(34), undefined, 2);
    expect(gens[0].overCeiling).toBe(true);
    expect(gens[0].seconds).toBe(34);
  });

  it("does not flag a generation at the ceiling", () => {
    expect(describeGenerations(shots(30), undefined, 2)[0].overCeiling).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/group-shots.test.ts`
Expected: FAIL — `defaultMultishotFor is not a function`.

- [ ] **Step 3: Implement the version rules**

Add to `src/lib/nodes/group-shots.ts`, directly below `LEGACY_PACK_CEILING`:

```ts
/**
 * D257 — which grouping rules produced a Script node's generations.
 *
 * ONE flag carries BOTH the ceiling and the multishot default, because they were decided together:
 * a canvas packed under v1 was also defaulted under v1. Separate flags would permit a combination
 * no parse ever produced.
 *
 *   v1 — 10s ceiling, a group of 2+ shots defaults to multishot
 *   v2 — 30s ceiling, every generation defaults to single (D259)
 *
 * Absence means v1, and absence IS the migration: nothing is backfilled, so no existing canvas
 * reshapes under its operator. A re-parse adopts v2 wholesale.
 */
export type GroupingVersion = 1 | 2;
export const CURRENT_GROUPING_VERSION: GroupingVersion = 2;

export function ceilingForVersion(version: GroupingVersion): number {
  return version === 1 ? LEGACY_PACK_CEILING : PACK_CEILING_SECONDS;
}

/**
 * Whether a group is multishot when the operator has expressed no preference.
 *
 * Extracted because this rule had TWO homes — here and inline in `setGenerationMode`, which uses it
 * to decide whether a change is a deviation worth storing. Under v2 the second copy would store
 * `false` as a deviation when `false` is the default, pinning a value that "would outlive the
 * grouping it describes."
 *
 * Takes the index array rather than a ShotGroup so both a ShotGroup and a Generation can be asked.
 */
export function defaultMultishotFor(shotIndexes: number[], version: GroupingVersion): boolean {
  return version === 1 ? shotIndexes.length > 1 : false;
}
```

Extend the `Generation` type:

```ts
export type Generation = {
  /** 0-based; display as index + 1. */
  index: number;
  shotIndexes: number[];
  /** Packed length, already clamped to the pack window's floor. */
  seconds: number;
  /** The override if one is set for this exact grouping, else the version's default. */
  multishot: boolean;
  /**
   * Longer than any model can generate. Reachable ONLY via a single shot kept whole — packing
   * never builds one by adding, and where to cut a long shot is a creative decision, not an
   * arithmetic one. The one case regrouping cannot fix, which is why it earns a warning.
   */
  overCeiling: boolean;
  /** A multi-shot group, which multishot suits — advisory only, never auto-applied (D259). */
  recommendMultishot: boolean;
  /** Identity of this grouping, and the key an override is stored under. */
  key: string;
};
```

Replace `describeGenerations`:

```ts
export function describeGenerations(
  shots: ReelShot[],
  overrides?: Record<string, boolean>,
  groupingVersion: GroupingVersion = 1,
): Generation[] {
  return groupShotsForFanOut(shots, ceilingForVersion(groupingVersion)).map((group, index) => {
    const key = generationKey(group.shotIndexes);
    const override = overrides?.[key];
    return {
      index,
      shotIndexes: group.shotIndexes,
      seconds: group.seconds,
      multishot:
        typeof override === "boolean"
          ? override
          : defaultMultishotFor(group.shotIndexes, groupingVersion),
      overCeiling: group.seconds > PACK_CEILING_SECONDS,
      recommendMultishot: group.shotIndexes.length > 1,
      key,
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/group-shots.test.ts`
Expected: PASS, including every pre-existing `describeGenerations` case — they pass no version, so they exercise the v1 default.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/group-shots.ts src/lib/nodes/__tests__/group-shots.test.ts
git commit -m "$(cat <<'EOF'
feat(grouping): groupingVersion selects the ceiling and multishot default

D257, D259. One flag carries both, because a canvas packed under v1 rules was
also defaulted under them. Absence means v1 and is the migration itself.

defaultMultishotFor is extracted so describeGenerations and setGenerationMode
stop keeping separate copies of the same rule.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Thread the version through the store and the Script node

Nothing changes behaviour until a parse writes `groupingVersion: 2`. This task wires the field end to end and makes `setGenerationMode` use the extracted rule.

Note `ScriptNodeData.parsed` is display-only and never persisted (D19), but `groupModes` **is** persisted — `groupingVersion` sits alongside it and is likewise durable.

**Files:**
- Modify: `src/lib/canvas-nodes.ts:14-27`
- Modify: `src/lib/canvas-store.ts:421-431`, `:541-556`
- Modify: `src/components/nodes/script-focus-view.tsx:40-41`, `:141`, `:358`
- Modify: `src/components/nodes/script-node.tsx:29-42`, `:139`
- Modify: `src/components/nodes/script-document.tsx:14-21`, `:69-88`
- Test: `src/lib/canvas-store.test.ts`

**Interfaces:**
- Consumes: Task 2's `GroupingVersion`, `CURRENT_GROUPING_VERSION`, `defaultMultishotFor`, `describeGenerations(shots, overrides, version)`.
- Produces: `ScriptNodeData.groupingVersion?: GroupingVersion`, persisted; read by fan-out, `setGenerationMode` and `ScriptDocument`.

- [ ] **Step 1: Write the failing test**

`src/lib/canvas-store.test.ts` already has a `describe("setGenerationMode")` block (around line 366) with a `scriptNode(parsed)` helper, a 3-shot `parsed` fixture (3s/5s/6s → groups `0-1` and `2` at 10s), and `createCanvasStore([node], [])`. The existing cases exercise v1 and must keep passing untouched. Append this sibling block directly after it:

```ts
describe("setGenerationMode under groupingVersion 2", () => {
  const v2Node = (groupModes?: Record<string, boolean>): AppNode =>
    ({
      id: "sc",
      type: "script",
      position: { x: 0, y: 0 },
      data: {
        // 3+5+6 = 14s — one group "0-1-2" at the v2 ceiling, two groups at v1's 10s.
        parsed: {
          visual_script: {
            shots: [
              { description: "a", duration_seconds: 3 },
              { description: "b", duration_seconds: 5 },
              { description: "c", duration_seconds: 6 },
            ],
          },
        },
        groupingVersion: 2,
        ...(groupModes ? { groupModes } : {}),
      },
    }) as AppNode;

  // Under v2 the default is single, so turning a group ON is the deviation and must be stored.
  // The inline rule this replaces compared against `shotIndexes.length > 1`, called `true` the
  // default for a 3-shot group, and would have deleted the key instead.
  it("stores multishot:true as a deviation", () => {
    const store = createCanvasStore([v2Node()], []);
    store.getState().setGenerationMode("sc", "0-1-2", true);

    const data = store.getState().nodes[0].data as { groupModes?: Record<string, boolean> };
    expect(data.groupModes).toEqual({ "0-1-2": true });
  });

  it("drops the key when set back to the v2 default", () => {
    const store = createCanvasStore([v2Node({ "0-1-2": true })], []);
    store.getState().setGenerationMode("sc", "0-1-2", false);

    const data = store.getState().nodes[0].data as { groupModes?: Record<string, boolean> };
    expect(data.groupModes).toEqual({});
  });

  // Resolving the generation by key must use the v2 ceiling too — at 10s "0-1-2" does not exist,
  // and the call would silently no-op.
  it("finds a generation that only exists at the v2 ceiling", () => {
    const store = createCanvasStore([v2Node()], []);
    store.getState().setGenerationMode("sc", "0-1-2", true);

    const data = store.getState().nodes[0].data as { groupModes?: Record<string, boolean> };
    expect(data.groupModes?.["0-1-2"]).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/canvas-store.test.ts -t "groupingVersion"`
Expected: FAIL — the first case gets `{}` because the inline rule treats a 2-shot group's `true` as the default.

- [ ] **Step 3: Add the field to the type**

In `src/lib/canvas-nodes.ts`, add the import and the field. Extend the existing import from `@/lib/nodes/group-shots` if there is one, otherwise add:

```ts
import type { GroupingVersion } from "@/lib/nodes/group-shots";
```

Insert into `ScriptNodeData` after `groupModes` (line 24):

```ts
  /**
   * D257 — which grouping rules produced this node's generations. Absent = 1 (10s ceiling, a 2+
   * shot group defaults to multishot). Written by the parse and never backfilled: absence IS the
   * migration, so no canvas reshapes under its operator and a re-parse adopts the current rules.
   */
  groupingVersion?: GroupingVersion;
```

- [ ] **Step 4: Read the version in the store**

In `src/lib/canvas-store.ts`, add `GroupingVersion` and `defaultMultishotFor` to the existing import from `@/lib/nodes/group-shots` (line 23):

```ts
import {
  describeGenerations,
  generationKey,
  defaultMultishotFor,
  type GroupingVersion,
} from "@/lib/nodes/group-shots";
```

In the fan-out action, extend the cast (line 421) and the call (line 431):

```ts
      const data = script.data as {
        title?: string;
        parsed?: ReelScript;
        groupModes?: Record<string, boolean>;
        groupingVersion?: GroupingVersion;
      };
```

```ts
      const generations = describeGenerations(shots, data.groupModes, data.groupingVersion ?? 1);
```

In `setGenerationMode`, replace lines 545–553:

```ts
      const data = script.data as {
        parsed?: ReelScript;
        groupModes?: Record<string, boolean>;
        groupingVersion?: GroupingVersion;
      };
      const shots = data.parsed?.visual_script?.shots ?? [];
      const version = data.groupingVersion ?? 1;
      const generation = describeGenerations(shots, data.groupModes, version).find(
        (g) => g.key === key,
      );
      if (!generation) return;

      // Only DEVIATIONS are stored. Setting a generation back to its default removes the key
      // instead of pinning the same value — a pinned default would outlive the grouping it
      // describes and quietly re-apply itself to whatever group later takes the same key.
      // The default comes from `defaultMultishotFor`, never from a second copy of the rule.
      const isDefault = multishot === defaultMultishotFor(generation.shotIndexes, version);
```

- [ ] **Step 5: Run the store test to verify it passes**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: PASS — the three new cases plus every existing one.

- [ ] **Step 6: Write the version on parse and thread it to the document**

In `src/components/nodes/script-focus-view.tsx`, add to the imports:

```ts
import { CURRENT_GROUPING_VERSION, type GroupingVersion } from "@/lib/nodes/group-shots";
```

Line 141 — a parse adopts the current rules:

```ts
      onPatch({ parsed: json.output, groupingVersion: CURRENT_GROUPING_VERSION });
```

Add the prop to the props type beside `groupModes` (line 41) and to the destructure (line 61):

```ts
  groupingVersion?: GroupingVersion;
```

Pass it to `ScriptDocument` (line 358):

```tsx
                  groupModes={groupModes}
                  groupingVersion={groupingVersion}
```

In `src/components/nodes/script-node.tsx`, add `groupingVersion?: GroupingVersion;` to the `d` cast (after line 34), read it beside `groupModes` (line 42):

```ts
  const groupingVersion = d.groupingVersion;
```

and pass it to `ScriptFocusView` (line 139):

```tsx
      groupModes={groupModes}
      groupingVersion={groupingVersion}
```

Add the type import to that file as well.

In `src/components/nodes/script-document.tsx`, extend the import (line 6):

```ts
import { describeGenerations, type GroupingVersion } from "@/lib/nodes/group-shots";
```

Add to `ScriptDocumentProps` after `groupModes` (line 17):

```ts
  groupingVersion?: GroupingVersion;
```

Add to the destructure after `groupModes` (line 72), then line 88:

```ts
  const generations = describeGenerations(shots, groupModes, groupingVersion ?? 1);
```

- [ ] **Step 7: Typecheck and run the affected tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/canvas-store.test.ts src/lib/nodes/__tests__/group-shots.test.ts`
Expected: no type errors; all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-store.ts src/lib/canvas-store.test.ts src/components/nodes/script-focus-view.tsx src/components/nodes/script-node.tsx src/components/nodes/script-document.tsx
git commit -m "$(cat <<'EOF'
feat(script): pin groupingVersion at parse and read it everywhere

D257. A parse writes version 2; existing nodes have no field and keep v1's
10s packing and multishot default, so no canvas reshapes on deploy.

setGenerationMode now asks defaultMultishotFor whether a change is a
deviation, instead of re-deriving the rule inline where v2 would break it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The Script node's warning and recommendation

Two additions to the bracket header, and no model names anywhere — capability belongs to the Multishot node, where `checkLadder` already words it once for three surfaces.

`ScriptDocument` is rendered only by `script-focus-view.tsx`, so this reaches the Script focus view; the collapsed node card does not list generations.

**Files:**
- Modify: `src/components/nodes/generation-bracket.tsx:1-21`, `:83-108`

**Interfaces:**
- Consumes: Task 2's `Generation.overCeiling` and `Generation.recommendMultishot`; `PACK_CEILING_SECONDS`.
- Produces: no new exports.

- [ ] **Step 1: Add the imports**

In `src/components/nodes/generation-bracket.tsx`, extend the Lucide import (line 4) and the `group-shots` import (line 21), and add `Badge` and `Tooltip`:

```ts
import { Layers, Film, Unlink, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { generationKey, PACK_CEILING_SECONDS } from "@/lib/nodes/group-shots";
```

Before editing, open `src/components/ui/tooltip.tsx` and confirm the exported names and whether a provider wrapper is required — match whatever `src/components/nodes/` already does with Tooltip rather than assuming this shape.

- [ ] **Step 2: Render both affordances**

Replace lines 83–108 (the header row) with:

```tsx
      <div className="mb-2 flex items-center gap-2">
        <Icon
          className={cn("size-3.5", generation.multishot ? "text-primary" : "text-muted-foreground")}
          strokeWidth={1.5}
        />
        <span className="text-eyebrow">
          Gen {generation.index + 1} · {generation.seconds}s
        </span>
        {/* The one thing regrouping cannot fix: a single shot longer than any model's window.
            Names no model — which model to use is the Multishot node's sentence to write. */}
        {generation.overCeiling && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge variant="destructive" className="gap-1 font-medium">
                  <TriangleAlert className="size-3" strokeWidth={1.5} />
                  over limit
                </Badge>
              }
            />
            <TooltipContent>
              {generation.seconds}s is longer than any model can generate (max{" "}
              {PACK_CEILING_SECONDS}s). Split this shot on the script.
            </TooltipContent>
          </Tooltip>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {/* D259 — advisory only. Fan-out never flips the switch: turning multishot back off
              disconnects downstream nodes, so the expensive direction stays the operator's. */}
          {generation.recommendMultishot && !generation.multishot && (
            <span className="text-[0.65rem] text-muted-foreground">Recommended</span>
          )}
          <span
            className={cn(
              "text-[0.65rem] font-medium transition-colors duration-200",
              generation.multishot ? "text-primary" : "text-muted-foreground",
            )}
          >
            Multishot
          </span>
          <Switch
            size="sm"
            checked={generation.multishot}
            disabled={isReadOnly}
            aria-label={`Multishot for generation ${generation.index + 1}`}
            onCheckedChange={handleChange}
          />
        </div>
      </div>
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/nodes/generation-bracket.tsx`
Expected: clean. If `TooltipTrigger` does not accept `render`, wrap the Badge as that file's sibling components do — Base UI composes with `render`, never `asChild`.

- [ ] **Step 4: Verify in the running app**

Run: `npm run dev:next`

Open a canvas, paste a script with one shot longer than 30s, parse it, and open the Script focus view. Confirm: the long generation shows the destructive `over limit` badge with a working tooltip; a multi-shot generation shows `Recommended` with the switch OFF; a single short generation shows neither. Confirm the badge is not purple.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/generation-bracket.tsx
git commit -m "$(cat <<'EOF'
feat(script): warn over the pack ceiling, recommend multishot

D258, D259. The bracket gains a destructive badge when a generation is longer
than any model can generate — the one case regrouping cannot fix — and a quiet
Recommended beside the switch for multi-shot groups.

Neither names a model: checkLadder owns that sentence on the Multishot node.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The Multishot model select

Three defects at one call site: the trigger renders a raw model id, the sizing overrides what the primitive owns, and the options carry no basis for choosing.

Base UI's `Select.Value` falls back to the raw value when given no children. `Select.Root` accepts `items` (`Record<string, ReactNode>`) and resolves the label from it — verified in `node_modules/@base-ui/react/select/value/SelectValue.d.ts` and `root/SelectRoot.d.ts`. Our `Select` wrapper is `SelectPrimitive.Root` directly, so `items` passes through.

**Files:**
- Modify: `src/lib/nodes/multishot-models.ts` (add `describeCapability`)
- Modify: `src/components/nodes/multishot-focus-view.tsx:116-131`
- Test: `src/lib/nodes/__tests__/multishot-models.test.ts`

**Interfaces:**
- Consumes: `MULTISHOT_MODELS`, `MultishotCapability`, `multishotCapabilityFor` (all existing).
- Produces: `describeCapability(cap: MultishotCapability): string`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/nodes/__tests__/multishot-models.test.ts` (add `describeCapability` to its import from `../multishot-models`):

```ts
describe("describeCapability", () => {
  it("states the total window", () => {
    const omni = MULTISHOT_MODELS.find((m) => m.id === GEMINI_OMNI_MODEL_ID)!;
    expect(describeCapability(omni)).toBe("3–10s");
  });

  it("adds a cut cap where the vendor publishes one", () => {
    const kling = MULTISHOT_MODELS.find((m) => m.id === KLING_OMNI_MODEL_ID)!;
    expect(describeCapability(kling)).toBe("3–15s · max 6 shots");
  });

  // `null` means the vendor states no limit. It must render as ABSENCE — a number here would be
  // one we invented, and D235 exists so those two cannot look alike.
  it("says nothing about cuts where the vendor states no limit", () => {
    const seedance = MULTISHOT_MODELS.find((m) => m.id === SEEDANCE_MODEL_ID)!;
    expect(describeCapability(seedance)).toBe("4–30s");
  });
});
```

If that test file does not exist, create it with the standard header:

```ts
import { describe, it, expect } from "vitest";
import { MULTISHOT_MODELS, describeCapability } from "../multishot-models";
import {
  GEMINI_OMNI_MODEL_ID,
  KLING_OMNI_MODEL_ID,
  SEEDANCE_MODEL_ID,
} from "@/lib/video-gen/client-models";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-models.test.ts -t "describeCapability"`
Expected: FAIL — `describeCapability is not a function`.

- [ ] **Step 3: Implement `describeCapability`**

Add to `src/lib/nodes/multishot-models.ts`, below `multishotCapabilityFor`:

```ts
/**
 * D260 — the one-line window under a model's name in the select.
 *
 * Built from the same fields `checkLadder` measures a ladder against, so the dropdown cannot
 * promise a window the check then rejects. A `null` cap renders as ABSENCE, never as a number:
 * "the vendor states no limit" and "we guessed one" must not look alike (D235).
 *
 * Character ceilings are deliberately omitted — they constrain the PROMPT, not the ladder, and an
 * operator picking a model is choosing a shape for their cuts.
 */
export function describeCapability(cap: MultishotCapability): string {
  const parts = [`${cap.minTotalSeconds}–${cap.maxTotalSeconds}s`];
  if (cap.maxCuts !== null) parts.push(`max ${cap.maxCuts} shots`);
  return parts.join(" · ");
}
```

Note the en dash `–` in both the implementation and the test.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-models.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix the select**

In `src/components/nodes/multishot-focus-view.tsx`, add `describeCapability` to the existing `multishot-models` import (line 16-20). Above the component's `return`, beside the other derived values:

```ts
  // Base UI resolves SelectValue's label from `items`. Without it, a bare <SelectValue /> renders
  // the raw VALUE — which is why this trigger read "gemini:gemini-omni-1.1-flash".
  const modelItems = Object.fromEntries(MULTISHOT_MODELS.map((m) => [m.id, m.label]));
```

Replace lines 116–131 with:

```tsx
                <Select
                  items={modelItems}
                  value={cap.id}
                  onValueChange={(v) => onTargetModelChange(String(v))}
                  disabled={isReadOnly}
                >
                  <SelectTrigger className="min-w-[168px] text-sm" aria-label="Multishot model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MULTISHOT_MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="items-start py-1.5">
                        <div className="flex flex-col items-start gap-0.5">
                          <span>{m.label}</span>
                          {/* Every model stays selectable. D97 — the app rejects and explains
                              rather than prevents, and checkLadder already writes that sentence. */}
                          <span className="text-xs text-muted-foreground">
                            {describeCapability(m)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
```

The `h-9` and fixed `w-[168px]` are gone: the trigger takes `SelectTrigger`'s own default height (h-8), and `min-w-` holds its place in the header row while letting a longer model name grow instead of clipping.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/nodes/multishot-focus-view.tsx`
Expected: clean.

- [ ] **Step 7: Verify in the running app**

Run: `npm run dev:next`

Open a Multishot node's focus view. Confirm: the trigger reads `Gemini Omni 1.1`, not an id; the dropdown shows three models each with a window line; selecting Seedance updates the trigger to `Seedance 2.5` and re-derives the readout beside it; the trigger's height matches other selects in the app.

`SelectItem` in `src/components/ui/select.tsx` carries `*:[span]:last:flex *:[span]:last:items-center` on its direct span children — the two-line layout uses a `div` wrapper specifically to sidestep that selector. If the lines still render side by side, check that selector first rather than adding `!important`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/nodes/multishot-models.ts src/lib/nodes/__tests__/multishot-models.test.ts src/components/nodes/multishot-focus-view.tsx
git commit -m "$(cat <<'EOF'
fix(multishot): the model select showed an id, not a label

D260. Base UI's Select.Value falls back to the raw value with no children, so
the trigger read "gemini:gemini-omni-1.1-flash". Passing `items` to the root
resolves the label.

Also drops the h-9/w-[168px] override for the primitive's own sizing, and gives
each option its window from the capability table. Every model stays selectable:
checkLadder explains a violation, the dropdown does not prevent one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] **Run every directly affected test file**

```bash
npx vitest run src/lib/nodes src/lib/canvas-store.test.ts
```

Expected: PASS. Do not run the full suite as a gate — it has ~11 known timeout flakes in API-route tests that pass in isolation.

- [ ] **Typecheck and lint the whole project**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Confirm the migration by hand**

Open a canvas whose Script node was parsed **before** this branch. Its brackets must be unchanged — same boundaries, same `Gen n · Ns`, same multishot switches, same seeded nodes matching. Then re-parse it and confirm the generations repack to 30s with every switch off.

This is the whole point of D257, and it is the one behaviour no unit test can fully prove.

## Notes for the implementer

**Read before writing Next.js code.** This version has breaking changes from training data — consult `node_modules/next/dist/docs/`.

**The ADR log is at** `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7. D257–D260 are already recorded. If implementation forces a different choice, append a new decision that supersedes — do not silently diverge, and do not scatter ADRs into other files.

**Comments here carry reasoning, not description.** This codebase's comments explain *why* a line is the way it is, usually naming the failure that produced it. The comment text in this plan is written to that standard and should be kept, not trimmed to restate the code.
