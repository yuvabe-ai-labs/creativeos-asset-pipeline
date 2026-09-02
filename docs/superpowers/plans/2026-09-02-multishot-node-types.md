# Multishot Node Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `multishot` boolean on `ShotNodeData` with two new node types (`multishot`, `multishot-prompt`), move the mode switch into the Script's Visual script list, make fan-out incremental, and delete the split/merge surgery.

**Architecture:** Two lanes that never cross. `script → shot → prompt → image-gen → video-prompt → video-gen` for continuous takes; `script → multishot → multishot-prompt → video-gen` for cut sequences. A Multishot node is a fixed second-budget divided into cuts; its prompt node returns structured JSON (a look block plus beats keyed by `cutId`) from which the compiled prompt is rendered by code.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zustand (`canvas-store`), `@xyflow/react` 12, Vitest (node environment), shadcn/Base UI primitives, Tailwind v4.

**Spec:** [docs/superpowers/specs/2026-09-02-multishot-node-types-design.md](../specs/2026-09-02-multishot-node-types-design.md)

## Global Constraints

- **Every interactive control is a shadcn primitive** from `src/components/ui/*`. Never a raw `<button>`, `<textarea>`, `<input>`, `<select>`, checkbox, switch or slider. Base UI composes via the `render` prop, **not** `asChild`.
- **Icons:** Lucide only, `strokeWidth={1.5}`, no fills.
- **Motion:** easing `cubic-bezier(0.22,1,0.36,1)` only, durations 200/320/500ms. No springs.
- **Colors** come from the shadcn CSS variables in `globals.css`. Never hardcode. Purple `#5829c7` is used sparingly — never a large background fill.
- **"Add" actions** are dashed-border primary chips: `border border-dashed border-primary/40 hover:bg-primary/5`.
- **Inline-editable text** gets `underline decoration-dotted decoration-2 underline-offset-4` on hover, transparent → `decoration-primary/50`, plus `bg-primary/5` and `cursor-pointer`.
- **Import, don't redefine.** Constants live in `src/lib/<feature>/constants.ts`, utilities in `utils.ts`, API helpers in `src/lib/api/route-helpers.ts` (`apiError` / `apiOk` / `withClient` / `withTryCatch` — never `NextResponse.json` directly).
- **No backward compatibility.** Existing multishot nodes are not migrated. Do not write read-time rewrites, backfills, or `?? legacyField` fallbacks.
- **Omni duration window:** `OMNI_MIN_SECONDS = 3`, `OMNI_MAX_SECONDS = 10`, imported from `src/lib/nodes/group-shots.ts`. A cut is never below `MIN_CUT_SECONDS = 1`.
- **Test command:** `npx vitest run <path>` (config: `vitest.config.ts`, node environment, `@` → `./src`).
- **Commit style:** lowercase type + scope, e.g. `feat(multishot): …`. End every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

**Phase 1 — the shot lane**

| File | Responsibility |
|---|---|
| `src/lib/nodes/multishot-cuts.ts` (create) | The cut list and its budget invariant. Pure. |
| `src/lib/nodes/multishot-convert.ts` (create) | Lossless `shot ⇄ multishot` data conversion. Pure. |
| `src/lib/nodes/group-shots.ts` (modify) | `describeShotGrouping` → `describeGenerations` |
| `src/lib/canvas-nodes.ts` (modify) | New data types, `AppNode` union, `VALID_CONNECTIONS` |
| `src/lib/canvas-store.ts` (modify) | Incremental `fanOutShots`, new `setGenerationMode`, delete split/merge |
| `src/components/nodes/generation-bracket.tsx` (create) | One generation's bracket + switch in the script list |
| `src/components/nodes/script-document.tsx` (modify) | Group the shot rows under brackets |
| `src/components/nodes/multishot-node.tsx` (create) | The canvas card: cut cards + budget strip |
| `src/components/nodes/multishot-cut-strip.tsx` (create) | The proportional duration strip with drag handles |

**Phase 2 — the prompt lane**

| File | Responsibility |
|---|---|
| `src/lib/nodes/multishot-plan.ts` (create) | The plan schema, its parser, and the prompt renderer. Pure. |
| `src/prompts/multishot-prompt-generate.ts` (create) | The system prompt + JSON schema |
| `src/prompts/video-prompt-generate.ts` (modify) | Export the shared blocks; drop the `multishot` routing key |
| `src/lib/nodes/resolve-inputs.ts` (modify) | `resolveMultishotPromptInputs`; delete `upstreamMultishot` |
| `src/app/api/nodes/[id]/multishot-prompt/route.ts` (create) | Generate + per-beat re-run |
| `src/components/nodes/multishot-prompt-node.tsx` (create) | The canvas card |
| `src/components/nodes/multishot-prompt-focus-view.tsx` (create) | Three columns |
| `src/components/nodes/multishot-beat-card.tsx` (create) | One output beat: timecode, chip editor, re-run |

---

# PHASE 1 — THE SHOT LANE

---

### Task 1: The cut list and its budget

The Multishot node's whole content. A fixed total divided among cuts; every mutation preserves `sum(seconds) === total` and never lets a cut fall below 1s.

**Files:**
- Create: `src/lib/nodes/multishot-cuts.ts`
- Test: `src/lib/nodes/__tests__/multishot-cuts.test.ts`

**Interfaces:**
- Consumes: `ReelShot` and `shotSeconds` from `src/lib/nodes/reel-script.ts` / `group-shots.ts`
- Produces:
  ```ts
  export type MultishotCut = { id: string; text: string; seconds: number };
  export const MIN_CUT_SECONDS = 1;
  export function newCut(text: string, seconds: number): MultishotCut;
  export function cutsFromShots(shots: ReelShot[]): MultishotCut[];
  export function shotsFromCuts(cuts: MultishotCut[]): ReelShot[];
  export function totalOf(cuts: MultishotCut[]): number;
  export function resizeCut(cuts: MultishotCut[], index: number, seconds: number): MultishotCut[];
  export function addCut(cuts: MultishotCut[]): MultishotCut[];
  export function removeCut(cuts: MultishotCut[], index: number): MultishotCut[];
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/__tests__/multishot-cuts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MIN_CUT_SECONDS,
  addCut,
  cutsFromShots,
  newCut,
  removeCut,
  resizeCut,
  shotsFromCuts,
  totalOf,
} from "../multishot-cuts";
import type { MultishotCut } from "../multishot-cuts";

const cuts = (...seconds: number[]): MultishotCut[] =>
  seconds.map((s, i) => ({ id: `c${i}`, text: `cut ${i + 1}`, seconds: s }));

const secondsOf = (cs: MultishotCut[]) => cs.map((c) => c.seconds);

describe("cutsFromShots", () => {
  it("gives every cut a distinct id and reads duration_seconds", () => {
    const result = cutsFromShots([
      { description: "keys", duration_seconds: 2 },
      { description: "cab", duration_seconds: 3 },
    ]);
    expect(secondsOf(result)).toEqual([2, 3]);
    expect(result.map((c) => c.text)).toEqual(["keys", "cab"]);
    expect(result[0].id).not.toBe(result[1].id);
  });

  // shotSeconds' documented fallback — a shot with no usable length is worth 4s for packing.
  it("falls back to the assumed length when a shot has none", () => {
    expect(secondsOf(cutsFromShots([{ description: "x" }]))).toEqual([4]);
  });
});

describe("shotsFromCuts", () => {
  // The inverse used when a Multishot node is flipped back to a Shot. `duration_seconds` is
  // the field grouping does arithmetic on, so it must be the one written.
  it("round-trips text and seconds back into ReelShots", () => {
    expect(shotsFromCuts(cuts(2, 3))).toEqual([
      { description: "cut 1", duration_seconds: 2 },
      { description: "cut 2", duration_seconds: 3 },
    ]);
  });
});

describe("resizeCut", () => {
  // Dragging the handle between cut 0 and cut 1: what 0 gains, 1 loses. The total is the
  // contract with the Omni request's duration and must not move.
  it("takes the delta from the next cut, preserving the total", () => {
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 0, 3))).toEqual([3, 1, 4]);
    expect(totalOf(resizeCut(cuts(2, 2, 4), 0, 3))).toBe(8);
  });

  it("gives seconds back to the next cut when shrinking", () => {
    expect(secondsOf(resizeCut(cuts(3, 2, 3), 0, 1))).toEqual([1, 4, 3]);
  });

  // A drag that would starve the neighbour stops rather than deleting it. Cuts are only ever
  // removed deliberately.
  it("stops before pushing the neighbour below the floor", () => {
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 0, 9))).toEqual([3, 1, 4]);
  });

  it("clamps the dragged cut to the floor too", () => {
    expect(secondsOf(resizeCut(cuts(3, 2, 3), 0, 0))).toEqual([1, 4, 3]);
  });

  // The last cut has no next neighbour, so it borrows backward instead.
  it("takes from the previous cut when resizing the last one", () => {
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 2, 5))).toEqual([2, 1, 5]);
  });

  it("is a no-op on a single cut — there is nobody to trade with", () => {
    expect(secondsOf(resizeCut(cuts(5), 0, 8))).toEqual([5]);
  });
});

describe("addCut", () => {
  // The budget is fixed, so a new cut is funded by the largest existing one.
  it("appends a 1s cut funded by the largest, preserving the total", () => {
    const result = addCut(cuts(2, 2, 4));
    expect(secondsOf(result)).toEqual([2, 2, 3, 1]);
    expect(totalOf(result)).toBe(8);
  });

  it("gives the new cut a distinct id and empty text", () => {
    const result = addCut(cuts(4));
    expect(result[1].text).toBe("");
    expect(result[1].id).not.toBe(result[0].id);
  });

  it("refuses when no cut can spare a second", () => {
    expect(addCut(cuts(1, 1))).toEqual(cuts(1, 1));
  });
});

describe("removeCut", () => {
  it("gives the removed cut's seconds to the next one", () => {
    const result = removeCut(cuts(2, 2, 4), 0);
    expect(secondsOf(result)).toEqual([4, 4]);
    expect(totalOf(result)).toBe(8);
  });

  it("gives them to the previous one when removing the last", () => {
    expect(secondsOf(removeCut(cuts(2, 2, 4), 2))).toEqual([2, 6]);
  });

  it("refuses to remove the only cut", () => {
    expect(removeCut(cuts(5), 0)).toEqual(cuts(5));
  });
});

describe("the budget invariant", () => {
  // The property the whole module exists to hold: no sequence of operations changes the total.
  it("survives resize, add and remove in any order", () => {
    let list = cuts(3, 3, 2);
    list = resizeCut(list, 0, 5);
    list = addCut(list);
    list = removeCut(list, 1);
    list = resizeCut(list, 1, 1);
    expect(totalOf(list)).toBe(8);
    for (const c of list) expect(c.seconds).toBeGreaterThanOrEqual(MIN_CUT_SECONDS);
  });
});

describe("newCut", () => {
  it("mints a uuid id", () => {
    expect(newCut("x", 2).id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-cuts.test.ts`
Expected: FAIL — `Failed to resolve import "../multishot-cuts"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/nodes/multishot-cuts.ts`:

```ts
// The Multishot node's cut list (D209). A FIXED budget of seconds divided among cuts.
//
// Every mutation here preserves `sum(seconds)`. That is not tidiness: the Omni request's
// `duration` is derived from the ladder, and a ladder longer than the duration comes back
// TRUNCATED AT FULL PRICE. Holding the total by construction makes that failure unreachable
// instead of something a validator has to catch.
import type { ReelShot } from "./reel-script";
import { shotSeconds } from "./group-shots";

export type MultishotCut = {
  /**
   * Stable across edit, add, delete and reorder. The Multishot Prompt node keys its per-cut
   * instruction on this, and the returned plan joins back on it. NEVER an index — reordering
   * or deleting a cut would silently repoint every instruction written for its neighbours.
   */
  id: string;
  text: string;
  seconds: number;
};

/** No cut is ever shorter than this. A drag that would go below it stops instead. */
export const MIN_CUT_SECONDS = 1;

export function newCut(text: string, seconds: number): MultishotCut {
  return { id: crypto.randomUUID(), text, seconds };
}

export function cutsFromShots(shots: ReelShot[]): MultishotCut[] {
  return shots.map((s) => newCut(s.description ?? "", shotSeconds(s)));
}

export function shotsFromCuts(cuts: MultishotCut[]): ReelShot[] {
  return cuts.map((c) => ({ description: c.text, duration_seconds: c.seconds }));
}

export function totalOf(cuts: MultishotCut[]): number {
  return cuts.reduce((sum, c) => sum + c.seconds, 0);
}

/**
 * Set one cut's length, funding the change from a neighbour so the total never moves.
 *
 * Trades with the NEXT cut, or the previous one when resizing the last — which is what makes a
 * handle drawn *between* two cards behave the way it looks like it should.
 */
export function resizeCut(
  cuts: MultishotCut[],
  index: number,
  seconds: number,
): MultishotCut[] {
  const partnerIndex = index + 1 < cuts.length ? index + 1 : index - 1;
  if (partnerIndex < 0 || partnerIndex >= cuts.length) return cuts;

  const pair = cuts[index].seconds + cuts[partnerIndex].seconds;
  // Both ends clamp: the dragged cut cannot go below the floor, and cannot grow so far that
  // its partner does.
  const next = Math.max(MIN_CUT_SECONDS, Math.min(Math.round(seconds), pair - MIN_CUT_SECONDS));
  if (next === cuts[index].seconds) return cuts;

  return cuts.map((c, i) => {
    if (i === index) return { ...c, seconds: next };
    if (i === partnerIndex) return { ...c, seconds: pair - next };
    return c;
  });
}

/** Append a cut, funded by the largest existing one. Refused when nobody can spare a second. */
export function addCut(cuts: MultishotCut[]): MultishotCut[] {
  let donor = -1;
  for (let i = 0; i < cuts.length; i++) {
    if (cuts[i].seconds >= MIN_CUT_SECONDS * 2 && (donor === -1 || cuts[i].seconds > cuts[donor].seconds)) {
      donor = i;
    }
  }
  if (donor === -1) return cuts;

  return [
    ...cuts.map((c, i) => (i === donor ? { ...c, seconds: c.seconds - MIN_CUT_SECONDS } : c)),
    newCut("", MIN_CUT_SECONDS),
  ];
}

/** Remove a cut, handing its seconds to a neighbour. The last remaining cut cannot be removed. */
export function removeCut(cuts: MultishotCut[], index: number): MultishotCut[] {
  if (cuts.length <= 1 || index < 0 || index >= cuts.length) return cuts;

  const heirIndex = index + 1 < cuts.length ? index + 1 : index - 1;
  const freed = cuts[index].seconds;
  return cuts
    .map((c, i) => (i === heirIndex ? { ...c, seconds: c.seconds + freed } : c))
    .filter((_, i) => i !== index);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-cuts.test.ts`
Expected: PASS — 16 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/multishot-cuts.ts src/lib/nodes/__tests__/multishot-cuts.test.ts
git commit -m "$(cat <<'EOF'
feat(multishot): the cut list is a fixed budget that every mutation preserves

Resize trades with a neighbour, add is funded by the largest cut, remove
hands its seconds to a neighbour. The total never moves, so a ladder can
never outrun the Omni request's duration and come back truncated.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Node types and the two lanes

Adds the two new data shapes and wires the connection rules. `ShotNodeData.multishot` survives this task so the tree keeps compiling; Task 8 removes it.

**Files:**
- Modify: `src/lib/canvas-nodes.ts`
- Test: `src/lib/canvas-nodes.test.ts`

**Interfaces:**
- Consumes: `MultishotCut` from Task 1
- Produces:
  ```ts
  export type MultishotNodeData = {
    script?: ReelScript; order?: number; totalSeconds?: number; cuts?: MultishotCut[];
    seededFrom?: { scriptNodeId: string; shotIndexes: number[]; scriptTitle?: string };
  };
  export type MultishotPromptNodeData = {
    title?: string; cutInstructions?: Record<string, string>;
    instruction?: string; kbSlices?: KBSliceKey[]; parsed?: unknown;
  };
  ```

- [ ] **Step 1: Write the failing test**

Append to `src/lib/canvas-nodes.test.ts`:

```ts
describe("the two lanes never cross", () => {
  it("routes multishot through its own prompt node", () => {
    expect(canConnect("multishot", "multishot-prompt")).toBe(true);
    expect(canConnect("multishot-prompt", "video-gen")).toBe(true);
  });

  // The whole point of two node types. A cut sequence has no still to compose and its prompt
  // is not a motion paragraph, so neither crossing is meaningful.
  it("refuses every crossing between the lanes", () => {
    expect(canConnect("multishot", "video-prompt")).toBe(false);
    expect(canConnect("multishot", "prompt")).toBe(false);
    expect(canConnect("shot", "multishot-prompt")).toBe(false);
    expect(canConnect("multishot", "video-gen")).toBe(false);
  });

  it("leaves the shot lane exactly as it was", () => {
    expect(canConnect("shot", "video-prompt")).toBe(true);
    expect(canConnect("shot", "prompt")).toBe(true);
  });

  // Same connected-references model every prompt node uses.
  it("lets references reach the multishot prompt", () => {
    for (const source of ["file", "draw", "image-gen", "text"]) {
      expect(canConnect(source, "multishot-prompt")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: FAIL — `expected false to be true` on `canConnect("multishot", "multishot-prompt")`

- [ ] **Step 3: Write the implementation**

In `src/lib/canvas-nodes.ts`, add the import at the top:

```ts
import type { MultishotCut } from "@/lib/nodes/multishot-cuts";
```

Add the two types immediately after `ShotNodeData`:

```ts
export type MultishotNodeData = {
  /**
   * The envelope ONLY — objective, on-screen text, voiceover, caption, execution notes.
   * `visual_script.shots` is NOT stored here: `cuts` is the sole shot list. Two copies of
   * the same list is exactly the drift the separate node type exists to prevent.
   */
  script?: ReelScript;
  order?: number;
  /** The budget in seconds. Seeded from the group's packed length, clamped to Omni's 3..10. */
  totalSeconds?: number;
  /** INVARIANT: sum(cuts.seconds) === totalSeconds. Held by every mutation in multishot-cuts.ts. */
  cuts?: MultishotCut[];
  seededFrom?: { scriptNodeId: string; shotIndexes: number[]; scriptTitle?: string };
  // No `shot_type`: framing is decided per cut by the prompt writer, which carries the
  // shot-size, 30-degree and screen-direction rules. One stored framing would describe at
  // most one cut and fight the rest.
};

/**
 * The Multishot Prompt node (D210). Sibling of VideoPromptNodeData, deliberately not a superset.
 *
 * No `controls` — camera move and motion energy describe ONE continuous take.
 * No `targetProvider` — Omni is the only multishot model, so there is nothing to pick.
 */
export type MultishotPromptNodeData = {
  title?: string;
  /**
   * Per-cut operator steer, keyed by MultishotCut.id. References are @-mentions inside these
   * strings; there is no separate ref field.
   */
  cutInstructions?: Record<string, string>;
  /** Whole-sequence steer, applied to every cut. */
  instruction?: string;
  kbSlices?: KBSliceKey[];
  /** D19: the active version's output — always a MultishotPlan, never a string. */
  parsed?: unknown;
};
```

Add to the `AppNode` union, after the `shot` member:

```ts
  | Node<MultishotNodeData, "multishot">
  | Node<MultishotPromptNodeData, "multishot-prompt">
```

In `VALID_CONNECTIONS`, replace the whole map body with:

```ts
  kb:                 ["script"],
  script:             ["prompt"],
  shot:               ["prompt", "video-prompt"],
  // The multishot lane skips the still entirely: a start frame fixes ONE composition and
  // this node is a sequence of several.
  multishot:          ["multishot-prompt"],
  file:               ["prompt", "image-gen", "video-prompt", "multishot-prompt", "video-gen", "shot", "post"],
  draw:               ["prompt", "image-gen", "video-prompt", "multishot-prompt", "video-gen", "shot", "post"],
  text:               ["prompt", "video-prompt", "multishot-prompt"],
  prompt:             ["prompt", "image-gen"],
  "image-gen":        ["prompt", "video-gen", "video-prompt", "multishot-prompt", "shot", "post"],
  "video-prompt":     ["video-gen"],
  "multishot-prompt": ["video-gen"],
  "video-gen":        [],
  "post":             [],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-nodes.test.ts
git commit -m "$(cat <<'EOF'
feat(multishot): two node types and two lanes that never cross

multishot -> multishot-prompt -> video-gen, beside the existing
shot -> video-prompt -> video-gen. Neither crossing connects: a cut
sequence has no still to compose, and its prompt is not a motion
paragraph about one frame.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `describeGenerations`

The script list needs the generations themselves — with a key, a total and a mode — not a per-shot label. Same packing function underneath, so the list still shows exactly what fan-out will do.

**Files:**
- Modify: `src/lib/nodes/group-shots.ts`
- Modify: `src/components/nodes/script-document.tsx:57` (the call site)
- Test: `src/lib/nodes/__tests__/group-shots.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Generation = {
    index: number; shotIndexes: number[]; seconds: number; multishot: boolean; key: string;
  };
  export function generationKey(shotIndexes: number[]): string;
  export function describeGenerations(shots: ReelShot[], overrides?: Record<string, boolean>): Generation[];
  ```

- [ ] **Step 1: Write the failing test**

In `src/lib/nodes/__tests__/group-shots.test.ts`, replace the whole `describe("describeShotGrouping", …)` block with:

```ts
describe("describeGenerations", () => {
  it("returns nothing for an empty script", () => {
    expect(describeGenerations([])).toEqual([]);
  });

  // The default is the pre-existing rule: a group of more than one shot is multishot.
  it("defaults a multi-shot group to multishot and a lone shot to single", () => {
    const gens = describeGenerations(shots(3, 5, 6));
    expect(gens.map((g) => g.shotIndexes)).toEqual([[0, 1], [2]]);
    expect(gens.map((g) => g.multishot)).toEqual([true, false]);
    expect(gens.map((g) => g.seconds)).toEqual([8, 6]);
    expect(gens.map((g) => g.index)).toEqual([0, 1]);
  });

  it("keys a generation by its shot indexes", () => {
    expect(describeGenerations(shots(3, 5, 6)).map((g) => g.key)).toEqual(["0-1", "2"]);
  });

  it("applies an override to exactly the generation it names", () => {
    const gens = describeGenerations(shots(3, 5, 6), { "0-1": false });
    expect(gens.map((g) => g.multishot)).toEqual([false, false]);
  });

  it("can turn a lone shot into a multishot generation", () => {
    expect(describeGenerations(shots(3, 5, 6), { "2": true })[1].multishot).toBe(true);
  });

  // A re-parse shifts group boundaries, so old keys match nothing. The override an operator
  // set for a group that no longer exists must not leak onto a differently-shaped one.
  it("ignores an override whose key matches no generation", () => {
    const gens = describeGenerations(shots(3, 5, 6), { "0-1-2": false, "7": true });
    expect(gens.map((g) => g.multishot)).toEqual([true, false]);
  });
});
```

Update the import at the top of the file:

```ts
import {
  groupShotsForFanOut,
  shotSeconds,
  describeGenerations,
  generationKey,
} from "../group-shots";
```

And add one test for the key helper:

```ts
describe("generationKey", () => {
  it("joins indexes with a dash, in order", () => {
    expect(generationKey([0, 1, 2])).toBe("0-1-2");
    expect(generationKey([4])).toBe("4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/group-shots.test.ts`
Expected: FAIL — `describeGenerations is not a function`

- [ ] **Step 3: Write the implementation**

In `src/lib/nodes/group-shots.ts`, replace the `ShotGroupingLabel` type and `describeShotGrouping` function entirely with:

```ts
export type Generation = {
  /** 0-based; display as index + 1. */
  index: number;
  shotIndexes: number[];
  /** Packed length, already clamped to the Omni window. */
  seconds: number;
  /** The override if one is set for this exact grouping, else the default. */
  multishot: boolean;
  /** Identity of this grouping, and the key an override is stored under. */
  key: string;
};

/**
 * A generation's identity: the exact set of script rows it covers.
 *
 * Deliberately derived from the shot indexes rather than being a minted id. A generation is not
 * a thing the operator creates — it is what the packing produces from the current parse, so its
 * identity has to change when the packing does. That is what makes a stale override harmless.
 */
export function generationKey(shotIndexes: number[]): string {
  return shotIndexes.join("-");
}

/**
 * D206 — the generations the script will fan out to, with each one's mode.
 *
 * Derived from `groupShotsForFanOut`, not from a parallel rule, so what the Visual script list
 * shows is exactly what fan-out will do. A label computed independently would drift, and its
 * whole purpose is to let the operator see and set the plan before committing to it.
 *
 * `overrides` holds ONLY deviations from the default (a group of >1 row is multishot). An
 * override whose key matches no current generation is ignored: after a re-parse the grouping it
 * described no longer exists, and applying it to a differently-shaped group would carry an
 * intent onto rows it was never about.
 */
export function describeGenerations(
  shots: ReelShot[],
  overrides?: Record<string, boolean>,
): Generation[] {
  return groupShotsForFanOut(shots).map((group, index) => {
    const key = generationKey(group.shotIndexes);
    const override = overrides?.[key];
    return {
      index,
      shotIndexes: group.shotIndexes,
      seconds: group.seconds,
      multishot: typeof override === "boolean" ? override : group.shotIndexes.length > 1,
      key,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/group-shots.test.ts`
Expected: PASS

- [ ] **Step 5: Verify the old name is gone**

Run: `grep -rn "describeShotGrouping\|ShotGroupingLabel" src/`
Expected: only `src/components/nodes/script-document.tsx` — which Task 4 rewrites. Leave it broken-typed for now if the grep shows nothing else; if TypeScript complains, that is expected and Task 4 fixes it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nodes/group-shots.ts src/lib/nodes/__tests__/group-shots.test.ts
git commit -m "$(cat <<'EOF'
feat(multishot): the script list describes generations, not per-shot labels

describeShotGrouping becomes describeGenerations, returning each generation
with its key, packed length and mode. Overrides store only deviations from
the default, keyed by the shot indexes — so a re-parse that shifts group
boundaries silently drops overrides for groupings that no longer exist.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The generation bracket in the script

The mode switch's new home. Rows of one generation sit inside a bracket carrying the total and one `Switch`.

**Files:**
- Create: `src/components/nodes/generation-bracket.tsx`
- Modify: `src/components/nodes/script-document.tsx`
- Modify: `src/lib/canvas-nodes.ts` (add `groupModes` to `ScriptNodeData`)
- Modify: `src/lib/canvas-store.ts` (add `setGenerationMode`)
- Test: `src/lib/canvas-store.test.ts`

**Interfaces:**
- Consumes: `Generation`, `describeGenerations`, `generationKey` (Task 3)
- Produces:
  ```ts
  // canvas-store
  setGenerationMode: (scriptNodeId: string, key: string, multishot: boolean) => void;
  // generation-bracket.tsx
  export function GenerationBracket(props: {
    generation: Generation; scriptNodeId: string; readOnly?: boolean; children: React.ReactNode;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

Append to `src/lib/canvas-store.test.ts`:

```ts
describe("setGenerationMode", () => {
  const scriptNode = (parsed: unknown): AppNode =>
    ({ id: "sc", type: "script", position: { x: 0, y: 0 }, data: { parsed } }) as AppNode;

  const parsed = {
    visual_script: {
      shots: [
        { description: "a", duration_seconds: 3 },
        { description: "b", duration_seconds: 5 },
        { description: "c", duration_seconds: 6 },
      ],
    },
  };

  it("records an override on the script node", () => {
    const store = createCanvasStore([scriptNode(parsed)], []);
    store.getState().setGenerationMode("sc", "0-1", false);

    const data = store.getState().nodes[0].data as { groupModes?: Record<string, boolean> };
    expect(data.groupModes).toEqual({ "0-1": false });
  });

  // Only deviations are stored. Writing the default back removes the key rather than pinning
  // a value that would then survive a re-parse it no longer describes.
  it("drops the key when the mode returns to the default", () => {
    const store = createCanvasStore([scriptNode(parsed)], []);
    store.getState().setGenerationMode("sc", "0-1", false);
    store.getState().setGenerationMode("sc", "0-1", true);

    const data = store.getState().nodes[0].data as { groupModes?: Record<string, boolean> };
    expect(data.groupModes).toEqual({});
  });

  it("is a no-op on a node that is not a script", () => {
    const store = createCanvasStore([{ id: "t", type: "text", position: { x: 0, y: 0 }, data: {} } as AppNode], []);
    store.getState().setGenerationMode("t", "0", false);
    expect(store.getState().nodes[0].data).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas-store.test.ts -t setGenerationMode`
Expected: FAIL — `store.getState().setGenerationMode is not a function`

- [ ] **Step 3: Add `groupModes` to the Script node's data**

In `src/lib/canvas-nodes.ts`, add to `ScriptNodeData`:

```ts
  /**
   * D206 — per-generation mode OVERRIDES, keyed by `generationKey(shotIndexes)`.
   * An absent key means the default (a group of more than one row is multishot). Only
   * deviations are stored, so a re-parse that reshapes the groups drops them harmlessly.
   */
  groupModes?: Record<string, boolean>;
```

- [ ] **Step 4: Add the store action**

In `src/lib/canvas-store.ts`, add to the `CanvasState` type beside `fanOutShots`:

```ts
  /** D206 — set one generation's mode from the Script's Visual script list. */
  setGenerationMode: (scriptNodeId: string, key: string, multishot: boolean) => void;
```

Add these imports at the top:

```ts
import { describeGenerations } from "@/lib/nodes/group-shots";
```

And implement the action immediately after `fanOutShots`:

```ts
    setGenerationMode: (scriptNodeId, key, multishot) => {
      const script = get().nodes.find((n) => n.id === scriptNodeId);
      if (!script || script.type !== "script") return;

      const data = script.data as { parsed?: ReelScript; groupModes?: Record<string, boolean> };
      const shots = data.parsed?.visual_script?.shots ?? [];
      const generation = describeGenerations(shots).find((g) => g.key === key);
      if (!generation) return;

      // Only DEVIATIONS are stored. Setting a generation back to its default removes the key
      // instead of pinning the same value — a pinned default would outlive the grouping it
      // describes and quietly re-apply itself to whatever group later takes the same key.
      const isDefault = multishot === generation.shotIndexes.length > 1;
      const next = { ...(data.groupModes ?? {}) };
      if (isDefault) delete next[key];
      else next[key] = multishot;

      get().updateNodeData(scriptNodeId, { groupModes: next });
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas-store.test.ts -t setGenerationMode`
Expected: PASS — 3 tests

- [ ] **Step 6: Build the bracket component**

Create `src/components/nodes/generation-bracket.tsx`:

```tsx
"use client";

import { Layers, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import type { Generation } from "@/lib/nodes/group-shots";

/**
 * D206 — one generation's rows, bracketed, with the single control that sets its mode.
 *
 * The bracket exists because a generation spans several rows: a switch sitting on ONE row would
 * reach rows the operator did not touch. Drawing the scope makes the switch's reach a fact on
 * screen rather than something learned by surprise.
 */
export function GenerationBracket({
  generation,
  scriptNodeId,
  readOnly = false,
  children,
}: {
  generation: Generation;
  scriptNodeId: string;
  readOnly?: boolean;
  children: React.ReactNode;
}) {
  const setGenerationMode = useCanvasStore((s) => s.setGenerationMode);
  const Icon = generation.multishot ? Layers : Film;

  return (
    <div className="relative pl-4">
      {/* The scope, drawn. A left rule spanning exactly the rows this switch governs. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1 bottom-1 w-px transition-colors duration-200",
          generation.multishot ? "bg-primary/30" : "bg-border",
        )}
      />
      <div className="mb-2 flex items-center gap-2">
        <Icon
          className={cn("size-3.5", generation.multishot ? "text-primary" : "text-muted-foreground")}
          strokeWidth={1.5}
        />
        <span className="text-eyebrow">
          Gen {generation.index + 1} · {generation.seconds}s
        </span>
        <div className="ml-auto flex items-center gap-1.5">
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
            disabled={readOnly}
            aria-label={`Multishot for generation ${generation.index + 1}`}
            onCheckedChange={(next) => setGenerationMode(scriptNodeId, generation.key, next)}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 7: Group the shot rows under brackets**

In `src/components/nodes/script-document.tsx`:

Replace the import on line 6 with:

```ts
import { describeGenerations } from "@/lib/nodes/group-shots";
import { GenerationBracket } from "./generation-bracket";
```

Replace line 57 (`const grouping = describeShotGrouping(shots);`) with:

```ts
  const generations = describeGenerations(shots, groupModes);
```

Add `scriptNodeId` and `groupModes` to the component's props (alongside the existing `readOnly` / `onRemoveItem`):

```ts
  scriptNodeId: string;
  groupModes?: Record<string, boolean>;
```

Then replace the whole `<ol className="grid gap-3">…</ol>` block with a bracket per generation. The row body is unchanged apart from dropping the `grouping[i]` label — the mode now lives on the bracket:

```tsx
        <div className="grid gap-5">
          {generations.map((generation) => (
            <GenerationBracket
              key={generation.key}
              generation={generation}
              scriptNodeId={scriptNodeId}
              readOnly={readOnly}
            >
              <ol className="grid gap-3">
                {generation.shotIndexes.map((i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="pt-1 text-muted-foreground">{i + 1}.</span>
                    <div className="flex-1">
                      <EditableField
                        value={shots[i]?.description ?? ""}
                        onCommit={set(["visual_script", "shots", i, "description"])}
                        readOnly={readOnly}
                        multiline
                        placeholder="Shot description…"
                      />
                      <EditableField
                        value={shots[i]?.duration ?? ""}
                        onCommit={set(["visual_script", "shots", i, "duration"])}
                        readOnly={readOnly}
                        placeholder="duration"
                        className="text-xs text-muted-foreground"
                      />
                    </div>
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        aria-label="Remove shot"
                        onClick={() => onRemoveItem?.(["visual_script", "shots"], i)}
                        className="nodrag h-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted"
                      >
                        <X className="size-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            </GenerationBracket>
          ))}
        </div>
```

- [ ] **Step 8: Pass the new props from the Script focus view**

Run: `grep -rn "<ScriptDocument" src/`

At every call site, add `scriptNodeId={<the node id in scope>}` and `groupModes={(data as ScriptNodeData).groupModes}`. In a read-only context (the "Show original" view or a review drawer) pass `readOnly` as it already is — the switch disables itself from that prop.

- [ ] **Step 9: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `script-document`, `generation-bracket`, or `describeShotGrouping`.

- [ ] **Step 10: Commit**

```bash
git add src/components/nodes/generation-bracket.tsx src/components/nodes/script-document.tsx src/lib/canvas-nodes.ts src/lib/canvas-store.ts src/lib/canvas-store.test.ts
git commit -m "$(cat <<'EOF'
feat(multishot): the mode switch moves into the script, on a generation bracket

D200's read-only per-row label becomes one switch per generation, with the
rows it governs bracketed by a left rule. A switch on a single row would
reach rows the operator did not touch; drawing the scope makes its reach a
fact on screen.

Overrides store only deviations from the default, so setting a generation
back to its default removes the key rather than pinning it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Fan-out only makes what is missing

**Files:**
- Modify: `src/lib/canvas-store.ts` (`fanOutShots`)
- Test: `src/lib/canvas-store.test.ts`

**Interfaces:**
- Consumes: `describeGenerations`, `generationKey` (Task 3), `cutsFromShots`, `totalOf` (Task 1)
- Produces: `fanOutShots` creates `shot` **or** `multishot` nodes and skips generations already on canvas

- [ ] **Step 1: Write the failing test**

Append to `src/lib/canvas-store.test.ts`:

```ts
describe("fanOutShots is incremental", () => {
  const parsed = {
    visual_script: {
      shots: [
        { description: "a", duration_seconds: 3 },
        { description: "b", duration_seconds: 5 },
        { description: "c", duration_seconds: 6 },
      ],
    },
  };
  const scriptNode = (data: object = {}): AppNode =>
    ({ id: "sc", type: "script", position: { x: 0, y: 0 }, data: { parsed, ...data } }) as AppNode;

  it("creates one node per generation, typed by its mode", () => {
    const store = createCanvasStore([scriptNode()], []);
    store.getState().fanOutShots("sc");

    const created = store.getState().nodes.filter((n) => n.id !== "sc");
    expect(created.map((n) => n.type)).toEqual(["multishot", "shot"]);
  });

  it("gives the multishot node cuts summing to its budget", () => {
    const store = createCanvasStore([scriptNode()], []);
    store.getState().fanOutShots("sc");

    const ms = store.getState().nodes.find((n) => n.type === "multishot")!;
    const data = ms.data as { cuts?: { seconds: number }[]; totalSeconds?: number };
    expect(data.totalSeconds).toBe(8);
    expect(data.cuts?.reduce((s, c) => s + c.seconds, 0)).toBe(8);
    // The envelope keeps the script context but NOT a second copy of the shot list.
    expect((ms.data as { script?: { visual_script?: { shots?: unknown } } }).script?.visual_script?.shots)
      .toBeUndefined();
  });

  // The bug this task fixes: a second press used to duplicate the whole row of nodes.
  it("creates nothing on a second call with no changes", () => {
    const store = createCanvasStore([scriptNode()], []);
    store.getState().fanOutShots("sc");
    const after = store.getState().nodes.length;
    store.getState().fanOutShots("sc");
    expect(store.getState().nodes.length).toBe(after);
  });

  it("creates only the generation that is missing", () => {
    const store = createCanvasStore([scriptNode()], []);
    store.getState().fanOutShots("sc");
    const doomed = store.getState().nodes.find((n) => n.type === "shot")!;
    store.getState().deleteNode(doomed.id);

    store.getState().fanOutShots("sc");
    const shotNodes = store.getState().nodes.filter((n) => n.type === "shot");
    const multishotNodes = store.getState().nodes.filter((n) => n.type === "multishot");
    expect(shotNodes).toHaveLength(1);
    expect(multishotNodes).toHaveLength(1);
  });

  it("honours an override when choosing the node type", () => {
    const store = createCanvasStore([scriptNode({ groupModes: { "0-1": false, "2": true } })], []);
    store.getState().fanOutShots("sc");

    const created = store.getState().nodes.filter((n) => n.id !== "sc");
    expect(created.map((n) => n.type)).toEqual(["shot", "multishot"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas-store.test.ts -t "fanOutShots is incremental"`
Expected: FAIL — `expected [ 'shot', 'shot' ] to deeply equal [ 'multishot', 'shot' ]`

- [ ] **Step 3: Write the implementation**

In `src/lib/canvas-store.ts`, add imports:

```ts
import { describeGenerations, generationKey } from "@/lib/nodes/group-shots";
import { cutsFromShots, totalOf } from "@/lib/nodes/multishot-cuts";
```

Replace the whole `fanOutShots` implementation with:

```ts
    // D207 — materialize each GENERATION of a parsed Script as one node: a `shot` for a
    // continuous take, a `multishot` for a cut sequence. A dashed Script->node lineage edge is
    // added for provenance; it is NOT a live edge (resolution never traverses it).
    //
    // INCREMENTAL. A generation already on canvas is skipped, so pressing Fan out twice does
    // nothing the second time instead of duplicating the whole row.
    fanOutShots: (scriptNodeId) => {
      const script = get().nodes.find((n) => n.id === scriptNodeId);
      if (!script) return;
      const data = script.data as {
        title?: string;
        parsed?: ReelScript;
        groupModes?: Record<string, boolean>;
      };
      const parsed = data.parsed;
      const shots = parsed?.visual_script?.shots ?? [];
      if (shots.length === 0) return;

      const scriptTitle = data.title || parsed?.title || "";
      const generations = describeGenerations(shots, data.groupModes);

      // Matching is on the EXACT index set, not on overlap. A group whose boundaries moved under
      // a re-parse is genuinely a different generation and correctly gets its own node; the old
      // one is left alone, because deleting a node with downstream work attached is not a
      // decision fan-out gets to make silently.
      const existing = new Set(
        get()
          .nodes.filter(
            (n) =>
              (n.type === "shot" || n.type === "multishot") &&
              (n.data as { seededFrom?: { scriptNodeId?: string } }).seededFrom?.scriptNodeId ===
                scriptNodeId,
          )
          .map((n) =>
            generationKey(
              (n.data as { seededFrom?: { shotIndexes?: number[] } }).seededFrom?.shotIndexes ?? [],
            ),
          ),
      );

      const missing = generations.filter((g) => !existing.has(g.key));
      if (missing.length === 0) {
        toast.info("Every shot is already on the canvas");
        return;
      }

      // Stack below the lowest node already seeded from this script, so a second fan-out does
      // not land on top of the first.
      const seeded = get().nodes.filter(
        (n) =>
          (n.data as { seededFrom?: { scriptNodeId?: string } }).seededFrom?.scriptNodeId ===
          scriptNodeId,
      );
      const baseY =
        seeded.length > 0
          ? Math.max(...seeded.map((n) => n.position.y)) + 170
          : script.position.y;
      const baseX = script.position.x + 360;

      const created = missing.map((generation, i) => {
        const seededFrom = {
          scriptNodeId,
          shotIndexes: generation.shotIndexes,
          scriptTitle,
        };
        const position = { x: baseX, y: baseY + i * 170 };
        const groupShots = generation.shotIndexes.map((shotIndex) => shots[shotIndex]);

        if (generation.multishot) {
          const cuts = cutsFromShots(groupShots);
          return {
            id: crypto.randomUUID(),
            type: "multishot",
            position,
            data: {
              // The envelope only — `cuts` is the sole shot list on this node type.
              script: { ...parsed, visual_script: { ...parsed?.visual_script, shots: undefined } },
              order: generation.index + 1,
              totalSeconds: totalOf(cuts),
              cuts,
              seededFrom,
            },
          };
        }

        return {
          id: crypto.randomUUID(),
          type: "shot",
          position,
          data: {
            script: {
              ...parsed,
              visual_script: { ...parsed?.visual_script, shots: groupShots },
            },
            order: generation.index + 1,
            shot_type: deriveShotType(groupShots[0]?.description ?? ""),
            seededFrom,
          },
        };
      }) as AppNode[];

      const createdEdges = created.map((n) => ({
        id: crypto.randomUUID(),
        source: scriptNodeId,
        target: n.id,
      }));

      set({
        nodes: [...get().nodes, ...created],
        edges: [...get().edges, ...createdEdges],
      });

      const already = generations.length - missing.length;
      toast.success(
        already > 0
          ? `${created.length} added · ${already} already on canvas`
          : `${created.length} shots added`,
      );
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas-store.test.ts -t "fanOutShots is incremental"`
Expected: PASS — 5 tests

- [ ] **Step 5: Run the whole store suite for regressions**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: PASS, except the pre-existing `fanOutShots` describe block from before this change — delete those obsolete cases (they assert one node per shot and `multishot: true` on data).

- [ ] **Step 6: Commit**

```bash
git add src/lib/canvas-store.ts src/lib/canvas-store.test.ts
git commit -m "$(cat <<'EOF'
feat(multishot): fan-out makes only what is missing, typed by the generation's mode

Pressing Fan out twice used to duplicate the whole row of nodes. It now
matches existing nodes on the exact shot-index set and skips them, and it
creates a `multishot` or a `shot` depending on the generation's mode.

Boundaries that moved under a re-parse are a different generation and get a
new node; the old one is left for the operator, because deleting a node with
downstream work attached is not fan-out's call.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Flipping the switch swaps the node type in place

**Files:**
- Create: `src/lib/nodes/multishot-convert.ts`
- Modify: `src/lib/canvas-store.ts` (`setGenerationMode`)
- Test: `src/lib/nodes/__tests__/multishot-convert.test.ts`, `src/lib/canvas-store.test.ts`

**Interfaces:**
- Consumes: `MultishotCut`, `cutsFromShots`, `shotsFromCuts`, `totalOf` (Task 1); `ShotNodeData`, `MultishotNodeData` (Task 2)
- Produces:
  ```ts
  export function shotDataToMultishot(data: ShotNodeData): MultishotNodeData;
  export function multishotDataToShot(data: MultishotNodeData): ShotNodeData;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/__tests__/multishot-convert.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shotDataToMultishot, multishotDataToShot } from "../multishot-convert";
import type { ShotNodeData, MultishotNodeData } from "@/lib/canvas-nodes";

const shotData: ShotNodeData = {
  order: 2,
  shot_type: "Wide Shot",
  script: {
    strategic_objective: "sell the shoe",
    voiceover: "where are you headed?",
    visual_script: {
      execution_refinement: "keep it punchy",
      shots: [
        { description: "close on keys", duration_seconds: 2 },
        { description: "wide street", duration_seconds: 6 },
      ],
    },
  },
  seededFrom: { scriptNodeId: "sc", shotIndexes: [0, 1], scriptTitle: "CHUPPS" },
};

describe("shotDataToMultishot", () => {
  it("turns the rows into cuts and sets the budget to their sum", () => {
    const result = shotDataToMultishot(shotData);
    expect(result.cuts?.map((c) => [c.text, c.seconds])).toEqual([
      ["close on keys", 2],
      ["wide street", 6],
    ]);
    expect(result.totalSeconds).toBe(8);
  });

  // `cuts` is the sole shot list on a multishot node. A second copy inside the envelope would
  // drift the moment the operator edited one of them.
  it("strips the shot list from the envelope but keeps everything else", () => {
    const result = shotDataToMultishot(shotData);
    expect(result.script?.visual_script?.shots).toBeUndefined();
    expect(result.script?.visual_script?.execution_refinement).toBe("keep it punchy");
    expect(result.script?.strategic_objective).toBe("sell the shoe");
    expect(result.script?.voiceover).toBe("where are you headed?");
  });

  it("drops shot_type — framing is per cut on a multishot node", () => {
    expect("shot_type" in shotDataToMultishot(shotData)).toBe(false);
  });

  it("keeps lineage and order", () => {
    const result = shotDataToMultishot(shotData);
    expect(result.seededFrom).toEqual(shotData.seededFrom);
    expect(result.order).toBe(2);
  });

  // Omni will not accept a request outside its window, so the budget is clamped on the way in.
  it("clamps the budget into the Omni window", () => {
    const long = shotDataToMultishot({
      script: { visual_script: { shots: [{ description: "x", duration_seconds: 30 }] } },
    });
    expect(long.totalSeconds).toBe(10);
    const short = shotDataToMultishot({
      script: { visual_script: { shots: [{ description: "x", duration_seconds: 1 }] } },
    });
    expect(short.totalSeconds).toBe(3);
  });
});

describe("multishotDataToShot", () => {
  it("restores the shot list from the cuts", () => {
    const ms: MultishotNodeData = {
      order: 2,
      totalSeconds: 8,
      cuts: [
        { id: "c1", text: "close on keys", seconds: 2 },
        { id: "c2", text: "wide street", seconds: 6 },
      ],
      script: { strategic_objective: "sell the shoe", visual_script: { execution_refinement: "punchy" } },
      seededFrom: { scriptNodeId: "sc", shotIndexes: [0, 1], scriptTitle: "CHUPPS" },
    };
    const result = multishotDataToShot(ms);
    expect(result.script?.visual_script?.shots).toEqual([
      { description: "close on keys", duration_seconds: 2 },
      { description: "wide street", duration_seconds: 6 },
    ]);
    expect(result.script?.visual_script?.execution_refinement).toBe("punchy");
  });

  it("re-derives shot_type from the first cut", () => {
    const result = multishotDataToShot({
      cuts: [{ id: "c1", text: "an aerial drone pass", seconds: 4 }],
    });
    expect(result.shot_type).toBe("Aerial");
  });

  it("drops the budget", () => {
    const result = multishotDataToShot({ totalSeconds: 8, cuts: [{ id: "c", text: "x", seconds: 8 }] });
    expect("totalSeconds" in result).toBe(false);
    expect("cuts" in result).toBe(false);
  });
});

describe("the conversion round-trips", () => {
  // This is what makes the script-level switch a real undo: an accidental flip and flip-back
  // costs the operator nothing.
  it("returns the original text and seconds through both directions", () => {
    const back = multishotDataToShot(shotDataToMultishot(shotData));
    expect(back.script?.visual_script?.shots).toEqual([
      { description: "close on keys", duration_seconds: 2 },
      { description: "wide street", duration_seconds: 6 },
    ]);
    expect(back.script?.strategic_objective).toBe("sell the shoe");
    expect(back.seededFrom).toEqual(shotData.seededFrom);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-convert.test.ts`
Expected: FAIL — `Failed to resolve import "../multishot-convert"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/nodes/multishot-convert.ts`:

```ts
// D208 — the lossless pair behind the Script's mode switch.
//
// Specified as one file with both directions in it, rather than left to each call site, because
// what makes the switch a real undo is that a flip and a flip-back cost the operator nothing.
// That property only holds if the two functions are written against each other.
import type { ShotNodeData, MultishotNodeData } from "@/lib/canvas-nodes";
import { cutsFromShots, shotsFromCuts, totalOf } from "./multishot-cuts";
import { OMNI_MIN_SECONDS, OMNI_MAX_SECONDS } from "./group-shots";
import { deriveShotType } from "./shot-types";

const clampBudget = (seconds: number): number =>
  Math.min(OMNI_MAX_SECONDS, Math.max(OMNI_MIN_SECONDS, seconds));

export function shotDataToMultishot(data: ShotNodeData): MultishotNodeData {
  const shots = data.script?.visual_script?.shots ?? [];
  const cuts = cutsFromShots(shots);

  return {
    order: data.order,
    seededFrom: data.seededFrom,
    totalSeconds: clampBudget(totalOf(cuts)),
    cuts,
    script: {
      ...data.script,
      // The envelope keeps execution notes and everything else; only the shot list goes,
      // because `cuts` is now the sole copy of it.
      visual_script: { ...data.script?.visual_script, shots: undefined },
    },
    // No shot_type: framing is per cut on a multishot node.
  };
}

export function multishotDataToShot(data: MultishotNodeData): ShotNodeData {
  const cuts = data.cuts ?? [];

  return {
    order: data.order,
    seededFrom: data.seededFrom,
    // Re-derived, not carried — the stored value described one cut, and after the conversion
    // the node is one take covering all of them.
    shot_type: deriveShotType(cuts[0]?.text ?? ""),
    script: {
      ...data.script,
      visual_script: { ...data.script?.visual_script, shots: shotsFromCuts(cuts) },
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-convert.test.ts`
Expected: PASS — 9 tests

- [ ] **Step 5: Write the failing store test**

Append to `src/lib/canvas-store.test.ts`:

```ts
describe("setGenerationMode swaps an existing node's type", () => {
  const parsed = {
    visual_script: {
      shots: [
        { description: "a", duration_seconds: 3 },
        { description: "b", duration_seconds: 5 },
      ],
    },
  };

  const seeded = () => {
    const store = createCanvasStore(
      [{ id: "sc", type: "script", position: { x: 0, y: 0 }, data: { parsed } } as AppNode],
      [],
    );
    store.getState().fanOutShots("sc");
    return store;
  };

  it("converts the node in place, keeping its id and position", () => {
    const store = seeded();
    const before = store.getState().nodes.find((n) => n.type === "multishot")!;

    store.getState().setGenerationMode("sc", "0-1", false);

    const after = store.getState().nodes.find((n) => n.id === before.id)!;
    expect(after.type).toBe("shot");
    expect(after.position).toEqual(before.position);
  });

  it("keeps incoming edges and drops outgoing ones", () => {
    const store = seeded();
    const ms = store.getState().nodes.find((n) => n.type === "multishot")!;
    store.setState({
      nodes: [
        ...store.getState().nodes,
        { id: "mp", type: "multishot-prompt", position: { x: 0, y: 0 }, data: {} } as AppNode,
      ],
      edges: [...store.getState().edges, { id: "out", source: ms.id, target: "mp" }],
    });

    store.getState().setGenerationMode("sc", "0-1", false);

    const edges = store.getState().edges;
    // The Script lineage edge survives; the prompt edge does not — a motion prompt written for
    // a cut ladder does not describe a continuous take.
    expect(edges.some((e) => e.source === "sc" && e.target === ms.id)).toBe(true);
    expect(edges.some((e) => e.id === "out")).toBe(false);
    // ...and it must be RECORDED as removed, or autosave resurrects it on reload.
    expect(store.getState().removedEdgeIds).toContain("out");
  });

  it("round-trips the node's content through a flip and a flip-back", () => {
    const store = seeded();
    store.getState().setGenerationMode("sc", "0-1", false);
    store.getState().setGenerationMode("sc", "0-1", true);

    const node = store.getState().nodes.find((n) => n.type === "multishot")!;
    const data = node.data as { cuts?: { text: string; seconds: number }[] };
    expect(data.cuts?.map((c) => [c.text, c.seconds])).toEqual([
      ["a", 3],
      ["b", 5],
    ]);
  });

  it("still just records the override when no node exists yet", () => {
    const store = createCanvasStore(
      [{ id: "sc", type: "script", position: { x: 0, y: 0 }, data: { parsed } } as AppNode],
      [],
    );
    store.getState().setGenerationMode("sc", "0-1", false);
    expect(store.getState().nodes).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas-store.test.ts -t "swaps an existing node"`
Expected: FAIL — `expected 'multishot' to be 'shot'`

- [ ] **Step 7: Extend `setGenerationMode` to convert**

In `src/lib/canvas-store.ts`, add the import:

```ts
import { shotDataToMultishot, multishotDataToShot } from "@/lib/nodes/multishot-convert";
```

Replace the final line of `setGenerationMode` (`get().updateNodeData(scriptNodeId, { groupModes: next });`) with:

```ts
      get().updateNodeData(scriptNodeId, { groupModes: next });

      // D208 — when the generation already has a node, the switch CONVERTS it: same id, same
      // position, same incoming edges. There is no split and no merge, because the node count is
      // identical in both modes — only which of two things the node is changes.
      const node = get().nodes.find(
        (n) =>
          (n.type === "shot" || n.type === "multishot") &&
          (n.data as { seededFrom?: { scriptNodeId?: string } }).seededFrom?.scriptNodeId ===
            scriptNodeId &&
          generationKey(
            (n.data as { seededFrom?: { shotIndexes?: number[] } }).seededFrom?.shotIndexes ?? [],
          ) === key,
      );
      if (!node) return;

      const targetType = multishot ? "multishot" : "shot";
      if (node.type === targetType) return;

      const converted =
        targetType === "multishot"
          ? shotDataToMultishot(node.data as ShotNodeData)
          : multishotDataToShot(node.data as MultishotNodeData);

      // Outgoing edges are dropped: a prompt written for a cut ladder does not describe a
      // continuous take, and vice versa. They must be RECORDED as removed — autosave builds its
      // delete set from removedEdgeIds alone, so an edge merely dropped from `edges` resurrects.
      const outgoing = get().edges.filter((e) => e.source === node.id);

      set({
        nodes: get().nodes.map((n) =>
          n.id === node.id ? ({ ...n, type: targetType, data: converted } as AppNode) : n,
        ),
        edges: get().edges.filter((e) => e.source !== node.id),
        removedEdgeIds: [...get().removedEdgeIds, ...outgoing.map((e) => e.id)],
      });
    },
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas-store.test.ts -t "swaps an existing node"`
Expected: PASS — 4 tests

- [ ] **Step 9: Confirm before disconnecting downstream work**

In `src/components/nodes/generation-bracket.tsx`, add the confirm. Import at the top:

```tsx
import { useState } from "react";
import { Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
```

Inside the component, before the `return`:

```tsx
  // Only a flip that DISCONNECTS something earns a dialog. Flipping a freshly fanned-out node —
  // the common case, and the undo the operator actually wants — stays silent.
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const [pending, setPending] = useState<boolean | null>(null);

  const nodeForThisGeneration = nodes.find(
    (n) =>
      (n.type === "shot" || n.type === "multishot") &&
      (n.data as { seededFrom?: { scriptNodeId?: string; shotIndexes?: number[] } }).seededFrom
        ?.scriptNodeId === scriptNodeId &&
      ((n.data as { seededFrom?: { shotIndexes?: number[] } }).seededFrom?.shotIndexes ?? []).join(
        "-",
      ) === generation.key,
  );
  const downstreamCount = nodeForThisGeneration
    ? edges.filter((e) => e.source === nodeForThisGeneration.id).length
    : 0;

  function handleChange(next: boolean) {
    if (downstreamCount > 0) {
      setPending(next);
      return;
    }
    setGenerationMode(scriptNodeId, generation.key, next);
  }
```

Change the `Switch`'s handler to `onCheckedChange={handleChange}`, and add the dialog just before the closing `</div>`:

```tsx
      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Switch generation {generation.index + 1} to {pending ? "multishot" : "a single take"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The shot keeps its place on the canvas and its script connection. What it feeds —
              {downstreamCount === 1 ? " 1 node" : ` ${downstreamCount} nodes`} — is disconnected,
              because a prompt written for a cut sequence does not describe a single take. Your
              shot text and timings are kept either way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="ghost" />}>Keep as is</AlertDialogCancel>
            <AlertDialogAction
              render={<Button variant="default" />}
              onClick={() => {
                if (pending !== null) setGenerationMode(scriptNodeId, generation.key, pending);
                setPending(null);
              }}
            >
              <Unlink className="size-3.5" strokeWidth={1.5} />
              Switch and disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 10: Verify compile and commit**

Run: `npx tsc --noEmit`
Expected: no new errors.

```bash
git add src/lib/nodes/multishot-convert.ts src/lib/nodes/__tests__/multishot-convert.test.ts src/lib/canvas-store.ts src/lib/canvas-store.test.ts src/components/nodes/generation-bracket.tsx
git commit -m "$(cat <<'EOF'
feat(multishot): flipping the switch swaps the node type in place

Same id, same position, same incoming edges; outgoing edges drop and are
recorded as removed so autosave does not resurrect them. The conversion is
lossless both ways, which is what makes the script switch a real undo rather
than a destructive rewrite — a flip and a flip-back cost nothing.

A confirm appears only when something is actually connected downstream.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The Multishot node on the canvas

No toggle, no shot switcher, no composer. A budget divided into cuts, and one action.

**Files:**
- Create: `src/components/nodes/multishot-cut-strip.tsx`
- Create: `src/components/nodes/multishot-node.tsx`
- Modify: `src/components/canvas/canvas.tsx` (register the type)
- Modify: `src/lib/nodes/describe-node.ts` (label the new type)

**Interfaces:**
- Consumes: `MultishotCut`, `resizeCut`, `addCut`, `removeCut`, `totalOf`, `MIN_CUT_SECONDS` (Task 1); `MultishotNodeData` (Task 2)
- Produces: `MultishotNode` registered as `nodeTypes.multishot`

- [ ] **Step 1: Build the cut strip**

Create `src/components/nodes/multishot-cut-strip.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { EditableField } from "./editable-field";
import {
  MIN_CUT_SECONDS,
  removeCut,
  resizeCut,
  totalOf,
  type MultishotCut,
} from "@/lib/nodes/multishot-cuts";

/**
 * The cut list as a proportional strip (D209).
 *
 * Cards are sized by their share of the budget, so a bad rhythm is visible before it is
 * generated. Each slider resizes ONE cut and its neighbour funds the change — the total is fixed,
 * because the Omni request's duration is derived from it and a ladder that outruns the duration
 * comes back truncated at full price.
 */
export function MultishotCutStrip({
  cuts,
  onChange,
  readOnly = false,
}: {
  cuts: MultishotCut[];
  onChange: (next: MultishotCut[]) => void;
  readOnly?: boolean;
}) {
  const total = totalOf(cuts) || 1;

  return (
    <div className="nodrag flex gap-1.5">
      {cuts.map((cut, i) => (
        <div
          key={cut.id}
          style={{ flexGrow: cut.seconds, flexBasis: 0 }}
          className="group/cut min-w-0 rounded-md border border-border bg-background p-1.5"
        >
          <div className="flex items-start gap-1">
            <span className="text-[0.6rem] font-medium text-muted-foreground">{i + 1}</span>
            {!readOnly && cuts.length > 1 && (
              <Button
                variant="ghost"
                aria-label={`Remove cut ${i + 1}`}
                onClick={() => onChange(removeCut(cuts, i))}
                className="ml-auto h-auto rounded p-0.5 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover/cut:opacity-100 hover:bg-muted hover:text-foreground dark:hover:bg-muted"
              >
                <X className="size-3" strokeWidth={1.5} />
              </Button>
            )}
          </div>
          {/* Inline-editable, with the dotted-underline hover affordance the design system
              specifies for editable text — a cut's wording is authored here, not just displayed. */}
          <EditableField
            value={cut.text}
            onCommit={(text) => onChange(cuts.map((c, j) => (j === i ? { ...c, text } : c)))}
            readOnly={readOnly}
            multiline
            placeholder="Describe this cut…"
            className="text-[0.65rem] leading-snug"
          />
          <Slider
            value={[cut.seconds]}
            min={MIN_CUT_SECONDS}
            max={total}
            step={1}
            disabled={readOnly || cuts.length < 2}
            aria-label={`Cut ${i + 1} length in seconds`}
            onValueChange={(v) => onChange(resizeCut(cuts, i, Array.isArray(v) ? v[0] : v))}
            className="mt-1.5"
          />
          <span className={cn("text-[0.6rem] tabular-nums text-muted-foreground")}>
            {cut.seconds}s
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Build the node**

Create `src/components/nodes/multishot-node.tsx`:

```tsx
"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Layers, Plus, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import { MultishotCutStrip } from "./multishot-cut-strip";
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
import { addCut, totalOf, type MultishotCut } from "@/lib/nodes/multishot-cuts";
import { OMNI_MAX_SECONDS, OMNI_MIN_SECONDS } from "@/lib/nodes/group-shots";
import type { MultishotNodeData } from "@/lib/canvas-nodes";

/** Where Kling caps its own Custom Multi-Shot. A quality signal, not a hard limit. */
const SOFT_CUT_LIMIT = 6;

/**
 * D209 — a Multishot node is a fixed budget of seconds divided into cuts.
 *
 * Deliberately bare: no multishot toggle (that lives in the Script now), no beat switcher, and
 * no Composer. The Shot node's four conditional controls on a 224px card are exactly what
 * splitting the node type was meant to end.
 */
export function MultishotNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const d = data as MultishotNodeData;

  const cuts = d.cuts ?? [];
  const budget = d.totalSeconds ?? totalOf(cuts);
  const outOfWindow = budget < OMNI_MIN_SECONDS || budget > OMNI_MAX_SECONDS;

  const setCuts = (next: MultishotCut[]) => updateNodeData(id, { cuts: next });

  return (
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
      <div
        className={cn(
          "w-80 rounded-lg border border-border bg-card shadow-card",
          "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        <NodeCardHeader
          icon={Layers}
          nodeId={id}
          nodeType="multishot"
          title={`Multishot${d.order ? ` ${d.order}` : ""}`}
          status={
            <span
              className={cn(
                "text-[0.6rem] tabular-nums",
                outOfWindow ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {budget}s · {cuts.length} cuts
            </span>
          }
        />
        <div className="p-2">
          <MultishotCutStrip cuts={cuts} onChange={setCuts} />

          {cuts.length > SOFT_CUT_LIMIT && (
            <p className="mt-1.5 flex items-center gap-1 px-1.5 text-[0.6rem] text-muted-foreground">
              <TriangleAlert className="size-3 shrink-0" strokeWidth={1.5} />
              {cuts.length} cuts in {budget}s — past about {SOFT_CUT_LIMIT} the cuts stop reading.
            </p>
          )}

          <p className="px-1.5 pt-1.5 text-[0.6rem] text-muted-foreground">
            {d.seededFrom?.scriptTitle ? `from "${d.seededFrom.scriptTitle}" · ` : ""}full script
            context
          </p>

          <div className="mt-1.5 flex items-center gap-1.5">
            <Button
              variant="ghost"
              onClick={() => setCuts(addCut(cuts))}
              className="nodrag h-auto gap-1 rounded-md border border-dashed border-primary/40 px-2 py-1 text-[0.65rem] text-primary hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5"
            >
              <Plus className="size-3" strokeWidth={1.5} /> Add cut
            </Button>
            <GuidedNextButton sourceId={id} variant="chip" />
          </div>
        </div>

        {/* Lineage target (dashed Script->Multishot edge). No image handle: there is no
            Composer to ground, and references reach the sequence at the prompt node. */}
        <Handle
          type="target"
          position={Position.Left}
          className="size-4! border-2! border-card! bg-muted-foreground!"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="size-4! border-2! border-card! bg-primary!"
        />
      </div>
    </NodeContextMenu>
  );
}
```

- [ ] **Step 3: Register the type**

In `src/components/canvas/canvas.tsx`, add the import and the registry entry:

```ts
import { MultishotNode } from "@/components/nodes/multishot-node";
```

```ts
  shot: ShotNode,
  multishot: MultishotNode,
```

In `src/lib/nodes/describe-node.ts`, add a label for the new type beside the existing `shot` entry (match the file's existing shape — a `Multishot` label and a description saying it is one generation with cuts inside it).

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: See it on the canvas**

Run: `npm run dev:next`, open a canvas with a parsed script, press Fan out, and confirm: a Multishot node appears for the multi-row generations, its cuts are proportional, dragging a slider moves seconds between neighbours and the header total never changes, Add cut takes a second from the largest, and the X on a cut hands its seconds to a neighbour.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/multishot-cut-strip.tsx src/components/nodes/multishot-node.tsx src/components/canvas/canvas.tsx src/lib/nodes/describe-node.ts
git commit -m "$(cat <<'EOF'
feat(multishot): the Multishot node is a budget divided into cuts

Cards sized by their share of the budget, so a bad rhythm is visible before
it is generated. No toggle, no beat switcher, no Composer — the four
conditional controls on the Shot node's card are what splitting the node
type was meant to end.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Demolish the flag, the split and the merge

**Files:**
- Delete: `src/lib/nodes/split-multishot.ts`, `src/lib/nodes/merge-shots.ts`, `src/components/nodes/multishot-toggle.tsx`, and their tests
- Modify: `src/lib/canvas-store.ts`, `src/components/nodes/shot-node.tsx`, `src/components/nodes/node-context-menu.tsx`, `src/lib/canvas-nodes.ts`, `src/lib/nodes/render-shot-for-video.ts`, `src/lib/nodes/group-shots.ts`
- Test: `src/lib/nodes/__tests__/render-shot-for-video.test.ts`

- [ ] **Step 1: Write the failing test for the join**

`renderShotForVideo` reads `shots[0]` and silently drops the rest — a defect recorded in `2026-08-29-multishot-followups.md`. A Shot node covering a 3-row generation must hand down all three.

Create (or extend) `src/lib/nodes/__tests__/render-shot-for-video.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderShotForVideo } from "../render-shot-for-video";

describe("renderShotForVideo", () => {
  it("returns empty for a null script", () => {
    expect(renderShotForVideo(null)).toBe("");
  });

  // A Shot node made from a 3-row generation is ONE continuous take covering all three rows.
  // Reading shots[0] dropped two thirds of what the operator switched to a single take.
  it("joins every row of the generation into one action", () => {
    const text = renderShotForVideo({
      strategic_objective: "sell the shoe",
      visual_script: {
        shots: [
          { description: "close on keys" },
          { description: "a cab door swings" },
          { description: "feet hit the street" },
        ],
      },
    });
    expect(text).toBe(
      "Action: close on keys A cab door swings Feet hit the street\nObjective: sell the shoe",
    );
  });

  it("skips blank rows rather than emitting double spaces", () => {
    const text = renderShotForVideo({
      visual_script: { shots: [{ description: "close on keys" }, { description: "  " }] },
    });
    expect(text).toBe("Action: close on keys");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/render-shot-for-video.test.ts`
Expected: FAIL — `expected 'Action: close on keys\nObjective: …'` (only the first row)

- [ ] **Step 3: Join the rows**

In `src/lib/nodes/render-shot-for-video.ts`, replace `renderShotForVideo` with:

```ts
export function renderShotForVideo(script: ReelScript | null): string {
  if (!script) return "";
  const lines: string[] = [];

  // EVERY row, not just the first. A Shot node covers a whole generation and generates it as one
  // continuous take, so reading shots[0] silently dropped the rest of what it covers.
  const action = (script.visual_script?.shots ?? [])
    .map((s) => (s.description ?? "").trim())
    .filter(Boolean)
    .map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join(" ");
  if (action) lines.push(`Action: ${action}`);

  if (script.strategic_objective && script.strategic_objective.trim()) {
    lines.push(`Objective: ${script.strategic_objective.trim()}`);
  }
  return lines.join("\n");
}
```

Also delete `renderShotLadder` and `renderMultishotBrief` from this file — they read `visual_script.shots`, which the multishot node no longer stores. Phase 2's `renderPlan` replaces them.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/render-shot-for-video.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Delete the split, the merge and the toggle**

```bash
git rm src/lib/nodes/split-multishot.ts src/lib/nodes/merge-shots.ts src/components/nodes/multishot-toggle.tsx
git rm src/lib/nodes/__tests__/split-multishot.test.ts src/lib/nodes/__tests__/merge-shots.test.ts 2>/dev/null || true
```

In `src/lib/canvas-store.ts`, delete `splitMultishotNode` and `mergeShotNodes` from both the `CanvasState` type and the implementation, plus their imports. Delete their test blocks from `src/lib/canvas-store.test.ts`.

In `src/components/nodes/node-context-menu.tsx`, delete the merge action and any props feeding it.

- [ ] **Step 6: Strip the Shot node's conditional controls**

In `src/components/nodes/shot-node.tsx`:
- Delete the `MultishotToggle` import and its `<div className="mt-1.5 border-t …">` wrapper.
- Delete the `multishot` field from the local `d` type.
- Delete the beat-chip strip (the `{shots.length > 1 && (…)}` block) and the `beatIndex` / `activeBeat` state. Read `shots[0]` directly:

```tsx
  const shot = shots[0];
  const description = shot?.description ?? "";

  function setDescription(value: string) {
    const base = d.script ?? {};
    const vs = base.visual_script ?? {};
    const next = (vs.shots?.length ? vs.shots : [{}]).map((s, i) =>
      i === 0 ? { ...s, description: value } : s,
    );
    updateNodeData(id, { script: { ...base, visual_script: { ...vs, shots: next } } });
  }
```

- Replace the raw `<textarea>` with the `Textarea` primitive from `@/components/ui/textarea`, keeping the same `className` and the `nodrag` class. (Recorded as a rule breach in the followups doc; this is the moment to close it.)

- [ ] **Step 7: Delete `ShotNodeData.multishot` and the unread flags**

In `src/lib/canvas-nodes.ts`, delete the `multishot?: boolean` field and its doc comment from `ShotNodeData`, and tighten `seededFrom` to `{ scriptNodeId: string; shotIndexes: number[]; scriptTitle?: string }` (drop `shotIndex` — it exists only so pre-D193 nodes resolve, and there is no backward compatibility to keep).

In `src/lib/nodes/group-shots.ts`, delete `clamped` and `overCap` from `ShotGroup` and from the `groupShotsForFanOut` return mapping — they were computed and never read. Delete their assertions from `src/lib/nodes/__tests__/group-shots.test.ts`.

- [ ] **Step 8: Find every remaining reader**

Run: `grep -rn "\.multishot\b\|multishot:" src/ --include=*.ts --include=*.tsx | grep -v "multishot-cuts\|multishot-convert\|multishot-node\|multishot-prompt\|\"multishot\""`

Fix each hit. Expected remaining callers: `resolve-inputs.ts` (Phase 2 removes its branch — for now, delete the `multishot` reads and let a `shot` upstream always take the single-take path), `shot-compose-sheet.tsx` and `compose/route.ts` (Task 9).

- [ ] **Step 9: Verify the suite and compile**

Run: `npx tsc --noEmit && npx vitest run src/lib`
Expected: compile clean, all `src/lib` tests pass.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(multishot): delete the flag, the split and the merge

The node count is the same in both modes, so turning multishot off never
needed to rewrite the graph. splitMultishotNode, mergeShotNodes, the toggle
and its confirm dialog are gone, along with ShotNodeData.multishot and the
Shot node's beat-chip strip.

Fixes renderShotForVideo, which read shots[0] and silently dropped the rest
of the generation it covers — recorded in the followups doc.

Also drops seededFrom.shotIndex (a pre-D193 fallback), group-shots' unread
clamped/overCap flags, and the Shot node's raw textarea.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Retire the Composer's multishot branch

The Multishot node has no Composer, so the sequence-role catalog has no consumer.

> **DECIDED: `sequence-roles.ts` is PARKED, not deleted.** The file and its tests stay in the tree; only its consumers go. It is 134 lines of researched cutting patterns (Rosenblum's five-shot method, the 30-degree rule per pattern, the graphic-match chain) and is expected back once the multishot flow settles.
>
> Because a file with no callers rots quietly and misleads the next reader into thinking it is live, it gets a header comment saying so — see Step 2. Do NOT `git rm` it.

**Files:**
- Modify: `src/lib/nodes/sequence-roles.ts` (header comment only)
- Modify: `src/components/nodes/shot-compose-sheet.tsx`, `src/lib/nodes/shot-compose.ts`, `src/app/api/nodes/[id]/compose/route.ts`, `src/lib/nodes/video-controls.ts`, `src/components/nodes/video-prompt-focus-view.tsx`

- [ ] **Step 1: Delete the LOOK and VOICE contracts**

In `src/lib/nodes/video-controls.ts`, delete `look` and `voice` from the `VideoControls` type, delete `LOOK_PRESETS` and `VOICE_PRESETS` and the `LookPreset` type, and delete the two `if (typeof c.look …)` / `if (typeof c.voice …)` lines from `normalizeVideoControls`.

In `src/components/nodes/video-prompt-focus-view.tsx`, delete the `ContractField` usages for both contracts and the component file if it has no other consumer (`grep -rn "ContractField" src/`).

- [ ] **Step 2: Mark the catalog parked**

Keep `src/lib/nodes/sequence-roles.ts` and its tests. Add this above the existing header comment so nobody mistakes it for live code or "fixes" it back into a dead call path:

```ts
// PARKED — nothing imports this today.
//
// The catalog served the Shot Composer's multishot branch, and a Multishot node has no Composer
// (D209). It is kept rather than deleted because every entry is a documented pattern rather than
// an invention, and the multishot flow is expected to want them again once it settles.
//
// Its tests still run, so the file cannot rot silently. If you are wiring a new consumer, read
// the design spec's §9 first — the reason there is no Composer is deliberate.
```

- [ ] **Step 3: Remove its consumers**

In `src/lib/nodes/shot-compose.ts`: delete the `renderSequenceRole` import and the `blocks.push(renderSequenceRole(role))` line, and remove `SequenceRole` from any union in the function's signature so the Composer types against `ShotRole` alone.

In `src/components/nodes/shot-compose-sheet.tsx`: delete the `SEQUENCE_ROLES` import and replace `{(isMultishot ? SEQUENCE_ROLES : SHOT_ROLES).map(…)}` with `{SHOT_ROLES.map(…)}`. Delete the `isMultishot` variable and every other branch on it — a Shot node is always a single take now.

In `src/app/api/nodes/[id]/compose/route.ts`: delete the `getSequenceRole` import and the branch that selects between the two catalogs.

- [ ] **Step 4: Verify nothing references the deleted names**

Run: `grep -rn "sequence-roles\|SEQUENCE_ROLES\|SequenceRole\|LOOK_PRESETS\|VOICE_PRESETS\|controls\.look\|controls\.voice" src/ | grep -v "sequence-roles.ts\|__tests__/sequence-roles"`

Expected: no output. The parked catalog and its own tests are the only permitted hits, which is what the second `grep -v` filters — every other reference is a consumer that should be gone.

- [ ] **Step 5: Verify compile and suite**

Run: `npx tsc --noEmit && npx vitest run src/lib`
Expected: compile clean, tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(multishot): unwire the sequence roles, delete the LOOK/VOICE controls

D203's catalog served only the Composer's multishot branch, and a Multishot
node has no Composer. The FILE stays — every entry is a documented pattern
rather than an invention, and the flow is expected to want them back — but
nothing imports it now, and a header comment says so.

D201's LOOK and D204's VOICE were operator-authored fields with preset
catalogs, and those go: the look returns in phase 2 as MODEL output inside
the plan, not as a control.

The Composer is untouched for single Shot nodes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 2 — THE PROMPT LANE

---

### Task 10: The plan schema, its parser and the renderer

**Files:**
- Create: `src/lib/nodes/multishot-plan.ts`
- Test: `src/lib/nodes/__tests__/multishot-plan.test.ts`

**Interfaces:**
- Consumes: `MultishotCut` (Task 1)
- Produces:
  ```ts
  export type MultishotPlan = { version: 1; look: string; beats: Array<{ cutId: string; text: string }> };
  export type PlanParseResult = { ok: true; plan: MultishotPlan } | { ok: false; reason: string };
  export function parsePlan(raw: unknown, cuts: MultishotCut[]): PlanParseResult;
  export function renderPlan(plan: MultishotPlan, cuts: MultishotCut[]): string;
  export function refsCitedIn(text: string): number[];
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/__tests__/multishot-plan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parsePlan, renderPlan, refsCitedIn } from "../multishot-plan";
import type { MultishotPlan } from "../multishot-plan";
import type { MultishotCut } from "../multishot-cuts";

const cuts: MultishotCut[] = [
  { id: "c1", text: "keys", seconds: 2 },
  { id: "c2", text: "cab", seconds: 2 },
  { id: "c3", text: "street", seconds: 4 },
];

const raw = (over: Record<string, unknown> = {}) => ({
  version: 1,
  look: "Late afternoon, warm low sun.",
  beats: [
    { cutId: "c1", text: "Tight on a hand lifting keys." },
    { cutId: "c2", text: "A cab door swings open." },
    { cutId: "c3", text: "Feet hit the street." },
  ],
  ...over,
});

describe("parsePlan", () => {
  it("accepts a complete plan", () => {
    const result = parsePlan(raw(), cuts);
    expect(result.ok).toBe(true);
  });

  // Rejected WHOLE, never partially applied — a half-applied plan leaves the node in a state
  // neither the model nor the operator authored.
  it("rejects a beat naming a cut that is not on this node", () => {
    const result = parsePlan(raw({ beats: [{ cutId: "nope", text: "x" }] }), cuts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/isn't in this node/i);
  });

  it("rejects a plan missing a cut — a ladder with a hole bills full price for a gap", () => {
    const result = parsePlan(
      raw({ beats: [{ cutId: "c1", text: "a" }, { cutId: "c2", text: "b" }] }),
      cuts,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/every shot/i);
  });

  // The look is what makes separate cuts read as one film. Without it they are unrelated clips.
  it("rejects a missing or empty look", () => {
    expect(parsePlan(raw({ look: "" }), cuts).ok).toBe(false);
    expect(parsePlan(raw({ look: "   " }), cuts).ok).toBe(false);
    expect(parsePlan(raw({ look: undefined }), cuts).ok).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(parsePlan(null, cuts).ok).toBe(false);
    expect(parsePlan("a prompt", cuts).ok).toBe(false);
  });

  // Not an error. Cut order is the edit; beat order in the JSON is an artifact of generation.
  it("reorders beats to cut order", () => {
    const result = parsePlan(
      raw({
        beats: [
          { cutId: "c3", text: "third" },
          { cutId: "c1", text: "first" },
          { cutId: "c2", text: "second" },
        ],
      }),
      cuts,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.beats.map((b) => b.text)).toEqual(["first", "second", "third"]);
  });
});

describe("renderPlan", () => {
  const plan: MultishotPlan = {
    version: 1,
    look: "Late afternoon, warm low sun.",
    beats: [
      { cutId: "c1", text: "Tight on a hand lifting keys." },
      { cutId: "c2", text: "A cab door swings open." },
      { cutId: "c3", text: "Feet hit the street." },
    ],
  };

  it("puts the look above the ladder, separated", () => {
    expect(renderPlan(plan, cuts)).toBe(
      "Late afternoon, warm low sun.\n\n" +
        "[0-2s] Tight on a hand lifting keys.\n" +
        "[2-4s] A cab door swings open.\n" +
        "[4-8s] Feet hit the street.",
    );
  });

  // The property that keeps the request's duration honest: the ladder's last timestamp IS the
  // node's total, by construction rather than by check.
  it("ends the ladder exactly at the budget", () => {
    const last = renderPlan(plan, cuts).trim().split("\n").at(-1)!;
    expect(last.startsWith("[4-8s]")).toBe(true);
  });

  it("takes seconds from the cuts, never from the plan", () => {
    const retimed = renderPlan(plan, [
      { id: "c1", text: "keys", seconds: 5 },
      { id: "c2", text: "cab", seconds: 2 },
      { id: "c3", text: "street", seconds: 1 },
    ]);
    expect(retimed).toContain("[0-5s]");
    expect(retimed).toContain("[5-7s]");
    expect(retimed).toContain("[7-8s]");
  });
});

describe("refsCitedIn", () => {
  it("finds every token in order and deduplicates", () => {
    expect(refsCitedIn("the <IMAGE_REF_1> beside a <IMAGE_REF_0> and <IMAGE_REF_1>")).toEqual([1, 0]);
  });

  it("ignores malformed tokens", () => {
    expect(refsCitedIn("<IMAGE_REF_> <IMAGE_REF> <IMAGE_REF_x> plain text")).toEqual([]);
  });

  it("returns nothing for text with no references", () => {
    expect(refsCitedIn("a hand lifts keys")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts`
Expected: FAIL — `Failed to resolve import "../multishot-plan"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/nodes/multishot-plan.ts`:

```ts
// D210 — what the Multishot Prompt node's writer returns, and how it becomes a prompt.
//
// The model returns JSON ONLY. The flat prompt is rendered from that JSON by `renderPlan`, so the
// breakup view the operator reads and the string that gets billed cannot disagree — they are the
// same object rendered twice. Asking for prose AND JSON would give two representations the model
// produces independently, and they diverge eventually.
import type { MultishotCut } from "./multishot-cuts";

export type MultishotBeat = { cutId: string; text: string };

export type MultishotPlan = {
  version: 1;
  /**
   * The look & atmosphere block: light direction, time of day, lens feel, palette, grade.
   * Written by the model, governs every beat, rendered ABOVE the ladder. Required — it is the
   * only thing making separate cuts read as one film, and a sequence without one is a set of
   * unrelated clips.
   */
  look: string;
  beats: MultishotBeat[];
};

export type PlanParseResult =
  | { ok: true; plan: MultishotPlan }
  | { ok: false; reason: string };

/**
 * Validate a returned plan against the node's cuts.
 *
 * Rejected WHOLE on any failure. A partially applied plan leaves the node holding a mixture of
 * new and stale beats that neither the model nor the operator authored, and nothing downstream
 * could tell which was which.
 *
 * Note what is NOT in the schema: `seconds` (code takes it from the cuts, so the writer cannot
 * break the operator's budget) and `refs` (derived from the text by `refsCitedIn`, so a beat's
 * citations cannot disagree with its own prose).
 */
export function parsePlan(raw: unknown, cuts: MultishotCut[]): PlanParseResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "The writer did not return a plan." };
  }
  const candidate = raw as Partial<MultishotPlan>;

  const look = typeof candidate.look === "string" ? candidate.look.trim() : "";
  if (!look) {
    return { ok: false, reason: "The plan has no look — the cuts would not read as one film." };
  }

  if (!Array.isArray(candidate.beats)) {
    return { ok: false, reason: "The plan has no beats." };
  }

  const byId = new Map<string, string>();
  for (const beat of candidate.beats) {
    const cutId = (beat as MultishotBeat)?.cutId;
    const text = (beat as MultishotBeat)?.text;
    if (typeof cutId !== "string" || typeof text !== "string") {
      return { ok: false, reason: "A beat is missing its shot or its text." };
    }
    if (!cuts.some((c) => c.id === cutId)) {
      return { ok: false, reason: "The writer referenced a shot that isn't in this node." };
    }
    byId.set(cutId, text);
  }

  if (byId.size !== cuts.length) {
    return { ok: false, reason: "The plan does not cover every shot in this node." };
  }

  // Reordered to CUT order, not rejected: cut order is the edit, and the order the beats happen
  // to arrive in is an artifact of generation.
  return {
    ok: true,
    plan: {
      version: 1,
      look,
      beats: cuts.map((c) => ({ cutId: c.id, text: byId.get(c.id)! })),
    },
  };
}

/**
 * The compiled prompt: the look, a blank line, then the timecode ladder.
 *
 * One function for both the string sent to Omni and the ordering the breakup view renders, so
 * the look cannot end up in two different places.
 *
 * Times are cumulative and come from the CUTS, never from the plan — which is what makes the
 * ladder's final timestamp equal the request's duration by construction.
 */
export function renderPlan(plan: MultishotPlan, cuts: MultishotCut[]): string {
  const byId = new Map(plan.beats.map((b) => [b.cutId, b.text]));
  let at = 0;
  const ladder = cuts
    .map((cut) => {
      const from = at;
      at += cut.seconds;
      return `[${from}-${at}s] ${(byId.get(cut.id) ?? "").trim()}`;
    })
    .join("\n");

  return `${plan.look.trim()}\n\n${ladder}`;
}

const IMAGE_REF = /<IMAGE_REF_(\d+)>/g;

/**
 * Which references a beat cites, derived from its own text.
 *
 * A regex is exact here because the token is machine-emitted and fixed-shape — unlike splitting
 * prose on `[0-2s]`-shaped headings, which is a drift bug waiting for its first unusual beat.
 */
export function refsCitedIn(text: string): number[] {
  const seen = new Set<number>();
  for (const match of text.matchAll(IMAGE_REF)) {
    seen.add(Number(match[1]));
  }
  return [...seen];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts`
Expected: PASS — 14 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/multishot-plan.ts src/lib/nodes/__tests__/multishot-plan.test.ts
git commit -m "$(cat <<'EOF'
feat(multishot): the plan is JSON and the prompt is rendered from it

The writer returns a look block plus beats keyed by cutId. No `seconds` in
the schema — code takes them from the cuts, so the writer cannot break the
operator's budget. No `refs` either — they are derived from each beat's own
text, so a beat's citations cannot disagree with its prose.

One renderer for both the billed string and the breakup view's ordering,
so the two cannot drift.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: The system prompt

**Files:**
- Create: `src/prompts/multishot-prompt-generate.ts`
- Modify: `src/prompts/video-prompt-generate.ts`
- Test: `src/prompts/__tests__/multishot-prompt-generate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MULTISHOT_PROMPT_ID: string;
  export function multishotPromptGenerate(): { id: string; model: string; system: string; schema: object };
  ```
- Also from `video-prompt-generate.ts` (newly exported for reuse): `REFERENCE_IDENTIFICATION_BLOCK`, `MOTION_AVOID_LIST`, and the existing `MULTISHOT_AUTHORING_MODEL`

> **The `model` field is required.** `openai.chat.completions.create` is called with `spec.model` — every prompt spec in `src/prompts/` carries one. Reuse the existing `MULTISHOT_AUTHORING_MODEL` constant rather than declaring a new model string.

- [ ] **Step 1: Extract the shared blocks**

Open `src/prompts/video-prompt-generate.ts`. The reference-identification instruction and the avoid-list are used verbatim by both prompts. Export them as named constants (`REFERENCE_IDENTIFICATION_BLOCK`, `MOTION_AVOID_LIST`) and reference them from the existing prompt bodies rather than leaving the text inline. Per the reusability rule: provider pairs share prompts by exporting from the canonical file, never by copying.

Delete the `multishot` key from `videoPromptGeneratePromptFor`'s argument type and its branch — the Omni ladder prompt moves to the new file.

- [ ] **Step 2: Write the failing test**

Create `src/prompts/__tests__/multishot-prompt-generate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { multishotPromptGenerate, MULTISHOT_PROMPT_ID } from "../multishot-prompt-generate";
import {
  REFERENCE_IDENTIFICATION_BLOCK,
  MULTISHOT_AUTHORING_MODEL,
} from "../video-prompt-generate";

describe("multishotPromptGenerate", () => {
  const spec = multishotPromptGenerate();

  it("carries a stable id for the version record", () => {
    expect(spec.id).toBe(MULTISHOT_PROMPT_ID);
    expect(spec.id).toMatch(/^multishot-prompt-generate@/);
  });

  // The route passes spec.model straight to openai.chat.completions.create.
  it("names the model it runs on", () => {
    expect(spec.model).toBe(MULTISHOT_AUTHORING_MODEL);
  });

  // The schema is the contract parsePlan validates against. If they disagree, every generation
  // is rejected at full price.
  it("asks for a look and beats keyed by cutId, and nothing else", () => {
    const props = (spec.schema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props).sort()).toEqual(["beats", "look"]);

    const beat = (props.beats as { items: { properties: Record<string, unknown>; required: string[] } })
      .items;
    expect(Object.keys(beat.properties).sort()).toEqual(["cutId", "text"]);
    // Durations are the operator's, taken from the cuts. Offering the writer a `seconds` field
    // would let it break the budget the whole design protects.
    expect(Object.keys(beat.properties)).not.toContain("seconds");
    expect(beat.required.sort()).toEqual(["cutId", "text"]);
  });

  it("reuses the canonical reference-identification block rather than a copy", () => {
    expect(spec.system).toContain(REFERENCE_IDENTIFICATION_BLOCK);
  });

  it("tells the writer to open with the look and to echo each cutId exactly", () => {
    expect(spec.system).toMatch(/look/i);
    expect(spec.system).toMatch(/cutId/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/prompts/__tests__/multishot-prompt-generate.test.ts`
Expected: FAIL — `Failed to resolve import "../multishot-prompt-generate"`

- [ ] **Step 4: Write the prompt**

Create `src/prompts/multishot-prompt-generate.ts`:

```ts
// D210 — the Multishot Prompt node's writer. A single prompt with NO provider routing: Omni is
// the only multishot model, so there is nothing to branch on.
import {
  REFERENCE_IDENTIFICATION_BLOCK,
  MOTION_AVOID_LIST,
  MULTISHOT_AUTHORING_MODEL,
} from "@/prompts/video-prompt-generate";

/** Bumped whenever the system text or schema changes; recorded on every version row. */
export const MULTISHOT_PROMPT_ID = "multishot-prompt-generate@1";

const SYSTEM = `You write the shot-by-shot motion plan for a single multi-shot video generation.

You are given a sequence of SHOTS. Each has an id, the operator's shot text, and its length in
seconds. You return one written beat per shot, plus one LOOK block that governs all of them.

THE LOOK BLOCK
Open with a single paragraph of look and atmosphere that every beat obeys: light direction and
quality, time of day, lens feel and camera height, palette, ground surface, and grade. Name
REPEATABLE PHYSICAL FACTS, never mood words — "low sun from camera-left, long shadows toward the
lens, warm grey concrete, 35mm at knee height" can be reproduced; "warm cinematic vibe" cannot.
This block is the only thing making separate cuts read as one film. Write it once; do not repeat
it inside the beats.

THE BEATS
Return exactly one beat per shot given, echoing that shot's \`cutId\` EXACTLY as provided. Never
invent an id, never merge two shots into one beat, never split one shot across two.

Each beat says what HAPPENS in that shot — subject, action, and the camera's framing and movement.
Decide framing yourself, and cut well:
- Vary shot size between consecutive beats. Two adjacent beats at the same distance read as a
  mistake rather than a cut.
- Change the angle by at least 30 degrees between consecutive beats on the same subject.
- Hold one screen direction across the whole sequence.
- Where a movement carries across a cut, name it in BOTH beats so the halves join.

Do NOT write timecodes, durations or shot numbers into the text. The timings are the operator's
and are added afterwards; anything you write about time will contradict them.

${REFERENCE_IDENTIFICATION_BLOCK}

AVOID
${MOTION_AVOID_LIST}`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["look", "beats"],
  properties: {
    look: {
      type: "string",
      description:
        "One paragraph of look and atmosphere governing every beat: light direction, time of day, lens feel, palette, ground, grade. Repeatable physical facts only.",
    },
    beats: {
      type: "array",
      description: "Exactly one entry per shot given, in the order the shots were given.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["cutId", "text"],
        properties: {
          cutId: {
            type: "string",
            description: "Echoed EXACTLY from the shot this beat is written for.",
          },
          text: {
            type: "string",
            description:
              "What happens in this shot: subject, action, framing and camera movement. No timecodes, no durations, no shot numbers.",
          },
        },
      },
    },
  },
} as const;

export function multishotPromptGenerate(): {
  id: string;
  model: string;
  system: string;
  schema: object;
} {
  return {
    id: MULTISHOT_PROMPT_ID,
    model: MULTISHOT_AUTHORING_MODEL,
    system: SYSTEM,
    schema: SCHEMA,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/prompts/__tests__/multishot-prompt-generate.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 6: Commit**

```bash
git add src/prompts/multishot-prompt-generate.ts src/prompts/__tests__/multishot-prompt-generate.test.ts src/prompts/video-prompt-generate.ts
git commit -m "$(cat <<'EOF'
feat(multishot): the multishot writer is its own prompt, with no provider routing

Omni is the only multishot model, so there is nothing to branch on. The
schema offers look + beats keyed by cutId and deliberately no `seconds`
field: durations are the operator's and are joined in from the cuts.

The reference-identification block and the avoid-list are exported from
video-prompt-generate.ts and imported here, not copied.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Extract the shared prompt-run and focus-view shells

Two prompt nodes now need the same scaffolding. Extract it **before** the second consumer exists, so the multishot route is written against a helper rather than against a copy.

The credit path is the reason this task comes first rather than after: `video-prompt/route.ts`'s own header comment records that it previously logged versions but "never joined the credit ledger at all". A duplicated copy of that flow is a second place for exactly that defect to reappear, and a divergence there costs real money rather than tidiness.

**Files:**
- Create: `src/lib/api/prompt-run.ts`
- Create: `src/components/nodes/prompt-focus-shell.tsx`
- Modify: `src/app/api/nodes/[id]/video-prompt/route.ts`, `src/components/nodes/video-prompt-focus-view.tsx`

**Interfaces:**
- Produces:
  ```ts
  // src/lib/api/prompt-run.ts — the credit + version envelope around one text-model call.
  export async function runPromptGeneration<T>(args: {
    nodeId: string;
    clientId: string;
    orgId: string;
    promptId: string;
    model: string;
    estimateInput: string;
    call: () => Promise<{ output: T; usage: { inputTokens: number; outputTokens: number } }>;
  }): Promise<{ output: T; versionId: string }>;
  ```
  It reserves credits, inserts the generation row, invokes `call`, then settles or refunds and writes + activates the version. A thrown error inside `call` refunds the reservation and fails the generation row.

- [ ] **Step 1: Characterise the existing behaviour before moving it**

There is no test covering `video-prompt/route.ts`'s credit flow today, so the extraction has nothing holding it honest. Write one first, in `src/lib/api/__tests__/prompt-run.test.ts`, against the helper you are about to create:

```ts
import { describe, it, expect, vi } from "vitest";
import { runPromptGeneration } from "../prompt-run";

// The reservation must be released on BOTH paths. A helper that refunds only on success turns
// every model error into silently burnt credits — which is the failure mode this extraction
// exists to stop happening twice.
describe("runPromptGeneration", () => {
  it("settles the reservation and writes a version when the call succeeds", async () => {
    // Mock the db modules the helper imports; assert settleGeneration and insertVersion ran,
    // refundReservation did not, and the returned versionId is the inserted row's id.
  });

  it("refunds the reservation and fails the generation when the call throws", async () => {
    // Assert refundReservation and failGeneration ran, insertVersion did NOT, and the error
    // propagates to the caller rather than being swallowed.
  });

  it("propagates a CreditLimitError without reserving anything", async () => {
    // reserveCredits throws CreditLimitError -> no generation row, no version, error surfaces.
  });
});
```

Mock `@/lib/db/versions`, `@/lib/db/generations` and `@/lib/db/credit-transactions` with `vi.mock`. Read `src/app/api/nodes/[id]/video-prompt/route.ts` first and mirror the exact call order it uses — this task must not change behaviour, only its location.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/api/__tests__/prompt-run.test.ts`
Expected: FAIL — `Failed to resolve import "../prompt-run"`

- [ ] **Step 3: Extract the helper**

Create `src/lib/api/prompt-run.ts` by **moving** the reserve → insert-generation → call → settle/refund → insert-version → set-active sequence out of `video-prompt/route.ts`. Move it; do not retype it. The behaviour must be identical.

- [ ] **Step 4: Rewrite video-prompt's route to call it**

`video-prompt/route.ts` keeps its `withNode` wrapper, its body parsing, its `resolveVideoPromptInputs` + `compileVideoPrompt` call, and its response shape. Everything between the reservation and the version write becomes `runPromptGeneration({ … call: () => openai.chat.completions.create(…) })`.

- [ ] **Step 5: Run the test and the video-prompt route's own tests**

Run: `npx vitest run src/lib/api src/app/api`
Expected: PASS. The video-prompt route's existing tests must pass **unchanged** — if one needed editing, the extraction changed behaviour and is wrong.

- [ ] **Step 6: Extract the focus-view shell**

Create `src/components/nodes/prompt-focus-shell.tsx` holding what both focus views share: the sheet frame, the connected-inputs rail, the version chips, the approval controls, and the `useNodeVersionUpdates` wiring. It takes the node id plus a `children` body, so each view supplies only its own middle.

Rewrite `video-prompt-focus-view.tsx` to use it. That file is 1005 lines; this should take a substantial bite out of it, and the shell is what Task 15 builds the multishot view on.

- [ ] **Step 7: Verify nothing regressed**

Run: `npx tsc --noEmit && npx vitest run src/components && npx vitest run src/lib`
Expected: clean.

Then `npm run dev:next` and open an existing Video Prompt node: generate, switch versions, approve. All three must behave exactly as before.

- [ ] **Step 8: Commit**

```bash
git add src/lib/api/prompt-run.ts src/lib/api/__tests__/prompt-run.test.ts src/components/nodes/prompt-focus-shell.tsx src/app/api/nodes/ src/components/nodes/video-prompt-focus-view.tsx
git commit -m "$(cat <<'EOF'
refactor(prompt): extract the credit/version envelope and the focus-view shell

Two prompt nodes are about to need both. Extracted before the second
consumer exists, so the multishot route is written against a helper rather
than against a copy of one.

The credit path especially: video-prompt/route.ts's own header records that
it once logged versions without joining the credit ledger at all, and a
duplicate of that flow is a second place for the same defect to reappear.

Behaviour is unchanged — the video-prompt route's existing tests pass
untouched, which is the check that the move was a move.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Resolve inputs and the route

**Files:**
- Modify: `src/lib/nodes/resolve-inputs.ts`
- Create: `src/app/api/nodes/[id]/multishot-prompt/route.ts`
- Test: `src/lib/nodes/__tests__/resolve-multishot.test.ts`

**Interfaces:**
- Consumes: `parsePlan`, `renderPlan` (Task 10); `multishotPromptGenerate` (Task 11)
- Produces:
  ```ts
  export type ResolvedMultishotInputs = {
    clientContext: string; kbVersionId: string | null; slices: KBSliceKey[];
    upstream: UpstreamPreview[]; cuts: MultishotCut[];
  };
  export async function resolveMultishotPromptInputs(nodeId: string, slicesInput: unknown): Promise<ResolvedMultishotInputs | null>;
  export function buildMultishotUserTurn(args: {
    clientContext: string; upstream: UpstreamPreview[]; cuts: MultishotCut[];
    instruction: string; cutInstructions: Record<string, string>;
  }): string;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/__tests__/resolve-multishot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildMultishotUserTurn } from "../resolve-inputs";
import type { MultishotCut } from "../multishot-cuts";

const cuts: MultishotCut[] = [
  { id: "c1", text: "close on keys", seconds: 2 },
  { id: "c2", text: "cab door", seconds: 3 },
];

describe("buildMultishotUserTurn", () => {
  it("lists every shot with its id, text and seconds", () => {
    const turn = buildMultishotUserTurn({
      clientContext: "",
      upstream: [],
      cuts,
      instruction: "",
      cutInstructions: {},
    });
    expect(turn).toContain("c1");
    expect(turn).toContain("close on keys");
    expect(turn).toContain("2s");
    expect(turn).toContain("c2");
    expect(turn).toContain("cab door");
  });

  // A cut's own steer must sit WITH that cut, not in a separate list the writer has to align.
  it("attaches each cut's instruction to its own shot", () => {
    const turn = buildMultishotUserTurn({
      clientContext: "",
      upstream: [],
      cuts,
      instruction: "",
      cutInstructions: { c2: "hold on the handle" },
    });
    const c2Block = turn.slice(turn.indexOf("c2"));
    expect(c2Block).toContain("hold on the handle");
    expect(turn.slice(turn.indexOf("c1"), turn.indexOf("c2"))).not.toContain("hold on the handle");
  });

  it("includes the sequence-wide steer once", () => {
    const turn = buildMultishotUserTurn({
      clientContext: "",
      upstream: [],
      cuts,
      instruction: "punchy and everyday",
      cutInstructions: {},
    });
    expect(turn.match(/punchy and everyday/g)).toHaveLength(1);
  });

  it("includes brand context when present and omits the heading when not", () => {
    const withCtx = buildMultishotUserTurn({
      clientContext: "CHUPPS makes sandals",
      upstream: [],
      cuts,
      instruction: "",
      cutInstructions: {},
    });
    expect(withCtx).toContain("CHUPPS makes sandals");
    const without = buildMultishotUserTurn({
      clientContext: "",
      upstream: [],
      cuts,
      instruction: "",
      cutInstructions: {},
    });
    expect(without).not.toMatch(/Brand context/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/resolve-multishot.test.ts`
Expected: FAIL — `buildMultishotUserTurn is not a function`

- [ ] **Step 3: Add the resolver and the user-turn builder**

In `src/lib/nodes/resolve-inputs.ts`:

Delete `upstreamMultishot` from `ResolvedPromptInputs`, delete the block that computes it, and delete the `multishot` branch inside `mapUpstreamForVideo`'s `if (u.type === "shot")` — a Shot upstream always takes the single-take path now. Delete the `renderShotLadder` / `renderMultishotBrief` imports.

Add `"multishot"` to `TYPE_LABEL` as `"Multishot"`.

Add at the end of the file:

```ts
export type ResolvedMultishotInputs = {
  clientContext: string;
  kbVersionId: string | null;
  slices: KBSliceKey[];
  upstream: UpstreamPreview[];
  /** The upstream Multishot node's cut list — the shots this plan must cover. */
  cuts: MultishotCut[];
};

/**
 * Inputs for the Multishot Prompt node. Sibling of `resolveVideoPromptInputs`, and separate for
 * the same reason the node types are: the cut list has no analogue on the single-take path, and
 * threading an optional one through would put a branch in every caller.
 */
export async function resolveMultishotPromptInputs(
  nodeId: string,
  slicesInput: unknown,
): Promise<ResolvedMultishotInputs | null> {
  const kbCtx = await getNodeActiveKB(nodeId);
  if (!kbCtx) return null;

  const slices = normalizeSlices(slicesInput);
  const clientContext = kbCtx.kb ? buildParseContext(kbCtx.kb, slices) : "";

  const ups = await getUpstreamOutputs(nodeId);
  const upstream = ups.map((u) => mapUpstreamForVideo(u));
  const source = ups.find((u) => u.type === "multishot");
  const cuts = ((source?.data.cuts ?? []) as MultishotCut[]).filter((c) => c && c.id);

  return { clientContext, kbVersionId: kbCtx.kbVersionId, slices, upstream, cuts };
}

/**
 * The user turn. Each cut's own steer sits WITH that cut rather than in a parallel list, so the
 * writer never has to align two orderings — which is exactly the mistake that produces a beat
 * written against the wrong shot's instruction.
 */
export function buildMultishotUserTurn(args: {
  clientContext: string;
  upstream: UpstreamPreview[];
  cuts: MultishotCut[];
  instruction: string;
  cutInstructions: Record<string, string>;
}): string {
  const blocks: string[] = [];

  if (args.clientContext.trim()) blocks.push(`Brand context:\n${args.clientContext.trim()}`);

  for (const u of args.upstream) {
    if (!u.text.trim()) continue;
    blocks.push(`${u.label}:\n${u.text.trim()}`);
  }

  if (args.instruction.trim()) {
    blocks.push(`For the sequence as a whole:\n${args.instruction.trim()}`);
  }

  const shots = args.cuts
    .map((cut, i) => {
      const lines = [
        `Shot ${i + 1} — cutId: ${cut.id} — ${cut.seconds}s`,
        `  Shot text: ${cut.text.trim() || "(none — write it from the sequence context)"}`,
      ];
      const steer = (args.cutInstructions[cut.id] ?? "").trim();
      if (steer) lines.push(`  Operator instruction for THIS shot: ${steer}`);
      return lines.join("\n");
    })
    .join("\n\n");

  blocks.push(`Shots (return exactly one beat per shot, echoing each cutId):\n${shots}`);

  return blocks.join("\n\n");
}
```

Add the `MultishotCut` import at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/resolve-multishot.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Build the route**

Create `src/app/api/nodes/[id]/multishot-prompt/route.ts`.

**Use `runPromptGeneration` from Task 12** — do NOT copy video-prompt's credit/version sequence. The envelope (reserve → generation row → call → settle or refund → version → activate) is the helper's job; this route supplies only the `withNode` wrapper (NOT `withClient`; this route is addressed by node id), the body parsing, and the model call itself.

Read `src/app/api/nodes/[id]/video-prompt/route.ts` to see how it calls the helper, then write this route the same way. The middle is what differs:

```ts
    const body = (await req.json().catch(() => null)) as {
      instruction?: unknown;
      slices?: unknown;
      cutInstructions?: unknown;
      /** Present on a per-beat re-run: rewrite ONLY this beat. */
      onlyCutId?: unknown;
      /** The plan being edited, required when onlyCutId is set. */
      plan?: unknown;
    } | null;

    const instruction = typeof body?.instruction === "string" ? body.instruction : "";
    const cutInstructions = (
      typeof body?.cutInstructions === "object" && body?.cutInstructions !== null
        ? body.cutInstructions
        : {}
    ) as Record<string, string>;
    const onlyCutId = typeof body?.onlyCutId === "string" ? body.onlyCutId : null;

    const resolved = await resolveMultishotPromptInputs(nodeId, body?.slices);
    if (!resolved) return apiError("Node not found", 404);
    if (resolved.cuts.length === 0) {
      return apiError("Connect a Multishot node with at least one shot", 400);
    }
    if (onlyCutId && !resolved.cuts.some((c) => c.id === onlyCutId)) {
      return apiError("That shot is not on this node", 400);
    }

    // One prompt, no provider routing — Omni is the only multishot model.
    const spec = multishotPromptGenerate();

    let user = buildMultishotUserTurn({
      clientContext: resolved.clientContext,
      upstream: resolved.upstream,
      cuts: resolved.cuts,
      instruction,
      cutInstructions,
    });

    // A per-beat re-run carries the whole current plan as context, so the rewritten beat still
    // cuts against its neighbours instead of being written in isolation.
    const previous = onlyCutId ? parsePlan(body?.plan, resolved.cuts) : null;
    if (onlyCutId) {
      if (!previous?.ok) return apiError("Generate the whole sequence first", 400);
      user +=
        `\n\nThe current plan is below. Rewrite ONLY the beat whose cutId is ${onlyCutId}, ` +
        `so it still cuts against the beats either side of it. Return every beat, ` +
        `with the others unchanged.\n\n${JSON.stringify(previous.plan, null, 2)}`;
    }

    const openai = createOpenAI();
    const completion = await openai.chat.completions.create({
      model: spec.model,
      response_format: {
        type: "json_schema",
        json_schema: { name: "multishot_plan", schema: spec.schema, strict: true },
      },
      messages: [
        { role: "system", content: spec.system },
        {
          role: "user",
          content: buildUserContent(user, resolved.upstream.filter(isVisionAttachment)),
        },
      ],
    });

    const raw = JSON.parse(completion.choices[0]?.message?.content ?? "null");

    // Validated WHOLE before anything is written. A rejected plan must never become the node's
    // output — a partially applied one leaves a mix of new and stale beats that nothing
    // downstream could tell apart.
    const parsed = parsePlan(raw, resolved.cuts);
    if (!parsed.ok) return apiError(parsed.reason, 422);
```

Write the version row with `parsed.plan` as the output and `spec.id` as the recorded prompt id, then:

```ts
    return apiOk({
      plan: parsed.plan,
      prompt: renderPlan(parsed.plan, resolved.cuts),
      versionId: version.id,
    });
```

- [ ] **Step 5a: Verify the schema and the parser agree**

`strict: true` requires every property listed in `required` and `additionalProperties: false` at every level — the schema in Task 11 satisfies both. If the model returns a shape `parsePlan` rejects, every generation fails at full price, so confirm one real call succeeds before moving on:

Run: `npm run dev:next`, create a Multishot node and a Multishot Prompt node, connect them, press Generate.
Expected: a plan comes back and the node shows beats. A 422 means the schema and `parsePlan` disagree — fix `parsePlan`, not the schema, since the schema is what the model is bound to.

- [ ] **Step 6: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/nodes/resolve-inputs.ts src/lib/nodes/__tests__/resolve-multishot.test.ts src/app/api/nodes/
git commit -m "$(cat <<'EOF'
feat(multishot): resolve the cut list and generate the plan behind its own route

Each cut's own steer sits with that cut in the user turn rather than in a
parallel list, so the writer never has to align two orderings.

The plan is validated WHOLE before a version row is written: a rejected
plan must not become the node's output.

Also deletes resolve-inputs' upstreamMultishot and the multishot branch of
mapUpstreamForVideo — the video-prompt lane has no multishot case now.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: The Multishot Prompt node card and Omni coercion

**Files:**
- Create: `src/components/nodes/multishot-prompt-node.tsx`
- Modify: `src/components/canvas/canvas.tsx`, `src/lib/canvas-store.ts` (`onConnect`), `src/lib/nodes/describe-node.ts`
- Test: `src/lib/canvas-store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/canvas-store.test.ts`:

```ts
describe("Omni coercion on connect", () => {
  // The followups doc's recorded lesson: "Filtering a picker is not enforcing a constraint."
  // D195 hid every other chip but never changed the stored modelId, so a Veo run could still be
  // billed against a ladder Veo ignores. Assert the STORED value, not which chips render.
  it("coerces a video-gen node's modelId when a multishot-prompt feeds it", () => {
    const store = createCanvasStore(
      [
        { id: "mp", type: "multishot-prompt", position: { x: 0, y: 0 }, data: {} } as AppNode,
        { id: "vg", type: "video-gen", position: { x: 0, y: 0 }, data: { modelId: "google:veo-3" } } as AppNode,
      ],
      [],
    );
    store.getState().onConnect({ source: "mp", target: "vg", sourceHandle: null, targetHandle: null });

    expect((store.getState().nodes.find((n) => n.id === "vg")!.data as { modelId?: string }).modelId)
      .toBe(OMNI_MODEL_ID);
  });

  it("leaves a video-gen fed by an ordinary video-prompt alone", () => {
    const store = createCanvasStore(
      [
        { id: "vp", type: "video-prompt", position: { x: 0, y: 0 }, data: {} } as AppNode,
        { id: "vg", type: "video-gen", position: { x: 0, y: 0 }, data: { modelId: "google:veo-3" } } as AppNode,
      ],
      [],
    );
    store.getState().onConnect({ source: "vp", target: "vg", sourceHandle: null, targetHandle: null });

    expect((store.getState().nodes.find((n) => n.id === "vg")!.data as { modelId?: string }).modelId)
      .toBe("google:veo-3");
  });
});
```

Import `OMNI_MODEL_ID` at the top of the test file from wherever the Omni model id constant lives — run `grep -rn "gemini-omni\|omni" src/lib/video-gen/models*.ts src/lib/video-gen/` to find it, and import the existing constant rather than hardcoding the string.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas-store.test.ts -t "Omni coercion"`
Expected: FAIL — modelId is still `google:veo-3`

- [ ] **Step 3: Coerce in `onConnect`**

In `src/lib/canvas-store.ts`, inside `onConnect`, after the edge is validated and before `set(...)`:

```ts
      // Omni is the only multishot model (D196). Coerce the target's STORED modelId — filtering
      // the picker is not enforcing a constraint: D195 hid every other chip but left the node's
      // saved value alone, so a new node defaulting to Veo would have billed a Veo run against a
      // ladder Veo ignores. Because the lanes are separate types this is a check on the source
      // node's type — no traversal, no flag, no upstream to resolve.
      const source = get().nodes.find((n) => n.id === connection.source);
      const target = get().nodes.find((n) => n.id === connection.target);
      if (source?.type === "multishot-prompt" && target?.type === "video-gen") {
        get().updateNodeData(target.id, { modelId: OMNI_MODEL_ID });
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas-store.test.ts -t "Omni coercion"`
Expected: PASS — 2 tests

- [ ] **Step 5: Build the node card**

Create `src/components/nodes/multishot-prompt-node.tsx`, modelled on `src/components/nodes/video-prompt-node.tsx` (read it first and mirror its structure — the same `NodeCardHeader`, `NodeContextMenu`, focus-view registration, and handle placement).

Its body differs only in what it summarises: instead of a single prompt excerpt, show the beat count and the budget from the upstream Multishot node, plus the look block's first line when a plan exists:

```tsx
  const plan = d.parsed as MultishotPlan | undefined;
  const status = plan ? `${plan.beats.length} beats` : "Not written yet";
```

Register it in `src/components/canvas/canvas.tsx` as `"multishot-prompt": MultishotPromptNode`, and add its label to `src/lib/nodes/describe-node.ts`.

- [ ] **Step 6: Verify compile and commit**

Run: `npx tsc --noEmit`

```bash
git add src/components/nodes/multishot-prompt-node.tsx src/components/canvas/canvas.tsx src/lib/canvas-store.ts src/lib/canvas-store.test.ts src/lib/nodes/describe-node.ts
git commit -m "$(cat <<'EOF'
feat(multishot): the Multishot Prompt node, with Omni coerced on connect

Coerces the target's STORED modelId rather than filtering its picker —
filtering is not enforcing, which is how D195's restriction would still have
billed a Veo run against a ladder Veo ignores.

Because the lanes are separate node types this is a check on the source
node's type: no traversal, no flag, no upstream to resolve.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: The focus view — three columns

**Files:**
- Create: `src/components/nodes/multishot-beat-card.tsx`
- Create: `src/components/nodes/multishot-prompt-focus-view.tsx`
- Modify: `src/components/nodes/multishot-prompt-node.tsx` (open the view)

**Interfaces:**
- Consumes: `MentionInstructionEditor` + `mentionDialect` / `imageRefDialect` from `src/lib/nodes/prompt-token-dialect.ts`; `MultishotPlan`, `renderPlan` (Task 10)

- [ ] **Step 1: Build the beat card**

Create `src/components/nodes/multishot-beat-card.tsx`:

```tsx
"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MentionInstructionEditor } from "./mention-instruction-editor";
import { imageRefDialect } from "@/lib/nodes/prompt-token-dialect";
import type { UpstreamNode } from "./connected-inputs-card";

/**
 * One beat of the breakup view.
 *
 * The timecode is READ-ONLY: durations live on the Multishot node and have exactly one home.
 * Clicking it focuses that node, which is where the budget is.
 *
 * The text is the SAME chip editor the instruction uses, in the `<IMAGE_REF_N>` dialect — so a
 * reference is a picture here as well as upstream, and editing the prose around it never exposes
 * the raw token.
 */
export function MultishotBeatCard({
  index,
  from,
  to,
  text,
  upstream,
  refIds,
  onChange,
  onRerun,
  rerunning = false,
  onFocusTimings,
}: {
  index: number;
  from: number;
  to: number;
  text: string;
  upstream: UpstreamNode[];
  refIds: string[];
  onChange: (next: string) => void;
  onRerun: () => void;
  rerunning?: boolean;
  onFocusTimings: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <Button
          variant="ghost"
          onClick={onFocusTimings}
          title="Timings live on the Multishot node"
          className="h-auto rounded px-1 py-0.5 text-eyebrow text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted"
        >
          [{from}-{to}s]
        </Button>
        <span className="text-eyebrow text-muted-foreground">Shot {index + 1}</span>
        <Button
          variant="ghost"
          onClick={onRerun}
          disabled={rerunning}
          aria-label={`Rewrite shot ${index + 1}`}
          className="ml-auto h-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted"
        >
          <RefreshCw className={cn("size-3.5", rerunning && "animate-spin")} strokeWidth={1.5} />
        </Button>
      </div>
      <MentionInstructionEditor
        value={text}
        onChange={onChange}
        upstream={upstream}
        dialect={imageRefDialect(refIds)}
        placeholder="Not written yet…"
      />
    </div>
  );
}
```

- [ ] **Step 2: Build the focus view**

Create `src/components/nodes/multishot-prompt-focus-view.tsx` **wrapping `PromptFocusShell` from Task 12** — the sheet, connected-inputs rail, version chips, approval controls and `useNodeVersionUpdates` come from the shell. Do not re-implement or copy them; this file supplies only the body.

The body is three columns:

1. **Connected** — the existing `ConnectedInputsCard` / `ReferenceImageStrip`, plus one addition: a reference no beat cites is marked. This is what `refsCitedIn` (Task 10) is for — the writer is told to cite only the references a shot calls for, so an uncited one is normal, but silently connecting an image the finished prompt never mentions is a failure you would otherwise only notice in the rendered video.

```tsx
const cited = new Set(plan ? plan.beats.flatMap((b) => refsCitedIn(b.text)) : []);
// ...on each reference thumbnail, index i:
{plan && !cited.has(i) && (
  <span className="text-[0.6rem] text-muted-foreground">Not cited</span>
)}
```
2. **Input** — the sequence steer in a `MentionInstructionEditor` with `mentionDialect()`, then one card per cut showing the cut's text **read-only** (it belongs to the Multishot node) above a `MentionInstructionEditor` with `mentionDialect()` bound to `cutInstructions[cut.id]`.
3. **Output** — the **look card** first, then a `MultishotBeatCard` per beat.

The look card is deliberately not a numbered beat:

```tsx
{plan && (
  <div className="rounded-xl border-2 border-primary/20 bg-primary/[0.03] p-3">
    <div className="mb-2 flex items-center gap-2">
      <Sun className="size-3.5 text-primary" strokeWidth={1.5} />
      <span className="text-eyebrow text-primary">Look &amp; atmosphere</span>
      <Button
        variant="ghost"
        onClick={rerunLook}
        disabled={rerunningLook}
        aria-label="Rewrite the look"
        className="ml-auto h-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted"
      >
        <RefreshCw className={cn("size-3.5", rerunningLook && "animate-spin")} strokeWidth={1.5} />
      </Button>
    </div>
    <MentionInstructionEditor
      value={plan.look}
      onChange={(look) => setPlan({ ...plan, look })}
      upstream={upstreamNodes}
      dialect={imageRefDialect(refIds)}
    />
    <p className="mt-2 text-[0.65rem] text-muted-foreground">Governs every beat below.</p>
  </div>
)}
```

It must NOT render as "beat 0" and must NOT be folded into the first beat's card: it is a global constraint, and rendering it as a numbered beat tells the operator it is local to shot 1.

Add a **Prompt** tab (a `Tabs` primitive) beside the breakup view, showing `renderPlan(plan, cuts)` through the existing read-only `GeneratedPromptBody` — the whole compiled string, exactly as it ships.

Editing any field writes to the node's data and re-renders. **No LLM call on edit.**

- [ ] **Step 3: Verify the chips survive editing**

Run: `npm run dev:next`. On a Multishot Prompt node with two connected reference images:
1. Type `@` in a cut's instruction — the connected library appears; pick one; it renders as a thumbnail chip.
2. Generate. Confirm the output beats show reference thumbnails inline, not `<IMAGE_REF_0>`.
3. Click into a beat and type before and after a chip. The chip stays a chip.
4. Backspace over a chip. It deletes whole — no `<IMAGE_REF_` fragment is left.
5. Confirm the same image reads under the same name in both the instruction and the beat.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/multishot-beat-card.tsx src/components/nodes/multishot-prompt-focus-view.tsx src/components/nodes/multishot-prompt-node.tsx
git commit -m "$(cat <<'EOF'
feat(multishot): the breakup view — connected, input, output

Every text box on the node is the same MentionInstructionEditor: the
instructions in the @[Label](id) dialect, the look and beats in the
<IMAGE_REF_N> one. References render as pictures in all of them, and
editing the prose around a chip never exposes its token.

The look block is a distinct card at the top of the output, not a numbered
beat — it governs every beat, and rendering it as one would say it was
local to shot 1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Verify against the live model

The two assumptions this whole design rests on have never been demonstrated. Neither blocks building; both block trusting.

**Files:** none — this task produces a note appended to `docs/superpowers/specs/2026-08-29-multishot-followups.md`.

- [ ] **Step 1: Confirm Omni actually cuts**

Build a Multishot node with 4 cuts across 8 seconds from the CHUPPS script, write its plan, and generate. Watch the result.

Expected: visible cuts at roughly the ladder's timecodes. If the output is one continuous take, the ladder needs an explicit "cut to" per beat and `multishot-prompt-generate.ts` needs strengthening before the feature is trustworthy. Record which happened.

- [ ] **Step 2: Confirm the reference tokens bind**

Connect two distinguishable reference images (e.g. a V-Strap and a Sandal). Write instructions that `@`-mention a *different* one in each of two beats. Generate and watch.

Expected: each beat shows the product its token named. If the model ignores the tokens or swaps them, the binding is not working and `<IMAGE_REF_N>` needs re-checking against the current Omni API before this ships.

- [ ] **Step 3: Record the findings**

Append a dated section to `docs/superpowers/specs/2026-08-29-multishot-followups.md` recording what each run showed, with the generation ids. Both questions have been open since 2026-08-29 and neither is answerable by a test — the schema can be right while the behaviour is wrong.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-29-multishot-followups.md
git commit -m "$(cat <<'EOF'
docs(multishot): record what the live Omni runs actually showed

Closes the two questions open since 2026-08-29: whether Omni cuts by
default, and whether it honours the image role tokens. Neither was
answerable by a test — the schema can be right while the behaviour is wrong.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Final sweep

**Files:** various

- [ ] **Step 1: Confirm the flag is gone everywhere**

Run: `grep -rn "multishot" src/ --include=*.ts --include=*.tsx | grep -vE "multishot-cuts|multishot-convert|multishot-plan|multishot-node|multishot-prompt|multishot-beat|multishot-cut-strip|\"multishot\"|'multishot'"`

Expected: only comments and the `describeGenerations` / `Generation.multishot` field. No `data.multishot`, no `upstreamMultishot`, no `{ provider, multishot }`.

- [ ] **Step 2: Confirm the deleted names are gone**

Run: `grep -rn "splitMultishot\|mergeShot\|MultishotToggle\|renderShotLadder\|renderMultishotBrief\|SEQUENCE_ROLES\|LOOK_PRESETS\|VOICE_PRESETS\|describeShotGrouping" src/ | grep -v "sequence-roles.ts\|__tests__/sequence-roles"`

Expected: no output. `sequence-roles.ts` is parked with no consumers (Task 9), so it and its tests are the only permitted hits.

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run src/lib && npx vitest run src/components && npx vitest run src/prompts`

Run per-directory rather than as one `npx vitest run`: the full run has around eleven timeout flakes in API-route tests that pass in isolation, and a per-directory pass is the reliable signal.

Expected: all pass. Any failure here is real — fix it before proceeding.

- [ ] **Step 4: Lint and typecheck**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Walk the whole flow in the browser**

Run `npm run dev:next` and confirm end to end:
1. Parse a script. The Visual script list shows generation brackets with totals and switches.
2. Flip a generation off, then on. The label and icon follow.
3. Fan out. One node per generation, typed by its switch.
4. Press Fan out again. Nothing is created; the toast says everything is already on canvas.
5. Flip a fanned-out generation. The node converts in place, keeps its position, and keeps its script edge.
6. Flip it back. The cut text and seconds are exactly what they were.
7. On a Multishot node: drag a slider (total holds), add a cut, remove a cut.
8. Create the Multishot Prompt node, connect two references, write per-cut instructions with `@`-mentions, generate.
9. The look card appears above the beats; each beat shows its timecode and its reference thumbnails.
10. Re-run one beat. Only that beat changes.
11. Connect Video Gen. Its model is Omni and it cannot be set to Veo.

- [ ] **Step 6: Append the ADR entries**

Add D205–D211 to §7 of `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`, in the log's existing format (Decision / Why / Rejected / Refines / Originated →), taking the wording from §12 of the design spec. Keep one ADR log — append in place, do not scatter entries into this plan's spec.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs(multishot): record D205-D211 in the ADR log

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Spec Coverage

| Spec section | Task |
|---|---|
| §2 two lanes, connections, Omni coercion | 2, 14 |
| §3 data types, no migration | 1, 2, 6 |
| §4 the generation bracket, `groupModes` | 3, 4 |
| §5 incremental fan-out | 5 |
| §6 type swap in place, lossless conversion, "off" joins all rows | 6, 8 |
| §7 the Multishot node, fixed budget, soft cut limit | 1, 7 |
| Shared shell extraction (reusability rule) | 12 |
| §8 the prompt node, chip editors, look block, plan JSON | 10, 11, 12, 13, 14, 15 |
| §9 deletions | 8, 9, 13, 17 |
| §10 error handling | 1, 6, 10, 13 |
| §11 testing | every task |
| §12 ADR entries | 17 |
| §13 phasing | task order |
