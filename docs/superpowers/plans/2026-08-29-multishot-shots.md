# Shot-Level Multishot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make multishot a per-shot property — the parse returns shot lengths, fan-out groups consecutive shots into ≤10s Shot nodes, a toggle splits a group back apart, and the two downstream nodes adapt to the flag.

**Architecture:** One new field on the parse (`duration_seconds`), one new flag on `ShotNodeData` (`multishot`), and one pure grouping function. `visual_script.shots` is already an array, so a multishot Shot node is just one holding more than one entry — no new node type, no plan object. Downstream, the motion-prompt node reads the flag to choose between a timecode ladder and a single-take prompt, and the video-gen node reads it to restrict the model picker and derive duration.

**Tech Stack:** TypeScript, Next.js App Router, Zustand canvas store, React Flow, Vitest.

**This is Plan 2 of 2.** Plan 1 (`2026-08-28-gemini-omni-provider.md`) is complete and merged on this branch: the Gemini Omni provider is registered and generates video from hand-written prompts.

- Spec: `docs/superpowers/specs/2026-08-28-gemini-omni-multishot-design.md`
- Decisions: D193, D194, D195

---

## Global Constraints

- **`duration_seconds` is the shot's own LENGTH, never a cumulative timecode.** Scripts write ranges — `0–3 sec`, `3–8 sec`, `8–14 sec`. For `8–14 sec` the value is **6**, not 14. This is the highest-risk instruction in the plan; a plausible-looking parse returning range ends makes every group wrong.
- **Omni's duration range is 3–10 seconds.** The ceiling caps a group; **the floor matters too** — greedy packing can strand a trailing remainder below 3s.
- **Grouping is consecutive-only and greedy**, then rebalanced. It does not look for narrative seams.
- **Shot count is conserved.** Every shot appears in exactly one group, in order.
- **The CHUPPS fixture** — lengths `3, 5, 6, 4, 2` — must group to `[0,1] [2] [3,4]` (8s / 6s / 6s). A 2s final block is the bug this fixture exists to catch.
- `visual_script.shots` is an array; a multishot node holds more than one entry. No new node type.
- **There is no merge action** and no `continuous_take` param. The Shot toggle is the only multishot control.
- Splitting a grouped node **creates nodes** — it is a structural canvas change, confirmed before it runs.
- Controls: shadcn primitives from `src/components/ui/*` only, Base UI `render` prop (never `asChild`). No raw `<button>`/`<input>`/`<textarea>`. Add chips are dashed `border-primary/40`, `hover:bg-primary/5`.
- Motion: easing `cubic-bezier(0.22,1,0.36,1)` only.
- Run tests per-directory. Never a bare `npx vitest run` — the full suite has ~11 unrelated pre-existing timeout flakes in API-route tests.
- **Destructive git commands are forbidden** for implementers: no `git checkout`, `git restore`, `git stash`, `git reset`, `git clean`. `trigger.config.ts` is modified in the working tree and belongs to the user.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/lib/nodes/group-shots.ts` | **Pure.** Shot lengths → groups, greedy + trailing rebalance + clamp. The whole grouping policy. |
| `src/lib/nodes/split-multishot.ts` | **Pure.** One grouped Shot's data → N single-shot Shot data objects. |
| `src/lib/nodes/__tests__/group-shots.test.ts` | Grouping, including the CHUPPS fixture. |
| `src/lib/nodes/__tests__/split-multishot.test.ts` | Split ordering and lineage. |
| `src/components/nodes/multishot-toggle.tsx` | The Shot node's toggle + its confirm dialog. |

**Modify**

| File | Change |
|---|---|
| `src/prompts/script-parse.ts` | `duration_seconds` in the schema, the length instruction, version 2 |
| `src/lib/nodes/reel-script.ts` | `ReelShot.duration_seconds?: number` |
| `src/lib/canvas-nodes.ts` | `ShotNodeData += multishot`; `seededFrom += shotIndexes` |
| `src/lib/canvas-store.ts` | `fanOutShots` groups; new `splitMultishotNode` action |
| `src/components/nodes/shot-node.tsx` | Multi-shot-safe editing, beat count, the toggle |
| `src/prompts/video-prompt-generate.ts` | Omni ladder variant; `VideoProvider += "gemini-omni"` |
| `src/lib/nodes/resolve-inputs.ts` | Carry the upstream Shot's `multishot` to the video-prompt node |
| `src/components/nodes/video-gen-model-picker.tsx` | Optional `restrictToModelId` + reason |
| `src/components/nodes/video-gen-focus-view.tsx` | Upstream multishot check → restrict picker, derive duration |

---

## Task 1: The parse returns shot lengths

**Files:**
- Modify: `src/prompts/script-parse.ts`
- Modify: `src/lib/nodes/reel-script.ts:5`
- Create: `src/prompts/__tests__/script-parse-schema.test.ts`

**Interfaces:**
- Produces: `ReelShot.duration_seconds?: number` — every later task reads it.

- [ ] **Step 1: Write the failing test**

Create `src/prompts/__tests__/script-parse-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scriptParsePrompt } from "../script-parse";

describe("script-parse schema", () => {
  const shotProps = (scriptParsePrompt.schema as {
    properties: { visual_script: { properties: { shots: { items: {
      properties: Record<string, unknown>; required: string[];
    } } } } };
  }).properties.visual_script.properties.shots.items;

  it("declares duration_seconds as a required integer on every shot", () => {
    expect(shotProps.properties.duration_seconds).toEqual({ type: "integer" });
    expect(shotProps.required).toContain("duration_seconds");
  });

  // OpenAI strict mode requires every property to appear in `required`.
  it("keeps every shot property required, as strict mode demands", () => {
    expect(shotProps.required.sort()).toEqual(
      Object.keys(shotProps.properties).sort(),
    );
  });

  // The one instruction that silently ruins every group if it is missing. Scripts write
  // cumulative ranges ("8-14 sec"); the value must be the LENGTH (6), not the range end (14).
  it("tells the model the value is a length, not the end of a range", () => {
    expect(scriptParsePrompt.system).toContain("8-14 sec");
    expect(scriptParsePrompt.system).toMatch(/length/i);
  });

  it("is version 2", () => {
    expect(scriptParsePrompt.version).toBe(2);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/prompts/__tests__/script-parse-schema.test.ts
```

Expected: FAIL — `duration_seconds` is undefined.

- [ ] **Step 3: Add the field to the schema**

In `src/prompts/script-parse.ts`, inside `reelSchema` → `visual_script` → `shots` → `items`, change the shot item so it reads:

```ts
          items: {
            type: "object",
            additionalProperties: false,
            required: ["description", "duration", "duration_seconds"],
            properties: {
              description: { type: "string" },
              duration: { type: "string" },
              duration_seconds: { type: "integer" },
            },
          },
```

- [ ] **Step 4: Add the instruction and bump the version**

In the same file's `system` string, replace the `visual_script` bullet with:

```
- visual_script: { shots: [{ description, duration, duration_seconds }], execution_refinement } — split the shot list into individual shots.
  - duration: the timing exactly as the script writes it (e.g. "0-3 sec", "3-8 sec").
  - duration_seconds: that shot's OWN LENGTH in whole seconds — NOT the end of its timecode range. Scripts usually write cumulative ranges, so "0-3 sec" is 3, "3-8 sec" is 5, and "8-14 sec" is 6. If a shot gives only a single number ("4 sec"), that number IS the length. If the length cannot be determined, use 4.
```

Change `version: 1` to `version: 2`.

- [ ] **Step 5: Add the type**

In `src/lib/nodes/reel-script.ts`, change line 5:

```ts
export type ReelShot = {
  description?: string;
  /** Timing exactly as written in the script — "0-3 sec". Display only. */
  duration?: string;
  /**
   * The shot's own LENGTH in seconds — not the end of its timecode range. Grouping needs
   * arithmetic and `duration` is free text ("0-3 sec", "3 sec", "22-26 seconds"), so the model
   * returns the number directly rather than the fan-out guessing at prose it did not anticipate.
   */
  duration_seconds?: number;
};
```

- [ ] **Step 6: Run and commit**

```bash
npx vitest run src/prompts src/lib/nodes
```

Expected: PASS.

```bash
git add src/prompts/script-parse.ts src/lib/nodes/reel-script.ts src/prompts/__tests__/script-parse-schema.test.ts
git commit -m "feat(script): parse each shot's length in seconds (D193)

Grouping to a 10s cap needs arithmetic, and \`duration\` is free text the
model copies out of the script. The instruction is explicit that scripts
write cumulative ranges, so \"8-14 sec\" is 6 and not 14 — a parse returning
range ends looks plausible and makes every group wrong.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `groupShotsForFanOut`

The whole grouping policy in one pure function.

**Files:**
- Create: `src/lib/nodes/group-shots.ts`
- Create: `src/lib/nodes/__tests__/group-shots.test.ts`

**Interfaces:**
- Consumes: `ReelShot` (Task 1).
- Produces:
  ```ts
  const OMNI_MIN_SECONDS = 3, OMNI_MAX_SECONDS = 10, ASSUMED_SHOT_SECONDS = 4;
  type ShotGroup = { shotIndexes: number[]; seconds: number; clamped: boolean; overCap: boolean };
  function shotSeconds(shot: ReelShot): number;
  function groupShotsForFanOut(shots: ReelShot[]): ShotGroup[];
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/nodes/__tests__/group-shots.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupShotsForFanOut, shotSeconds } from "../group-shots";
import type { ReelShot } from "../reel-script";

const shots = (...lengths: number[]): ReelShot[] =>
  lengths.map((n, i) => ({ description: `shot ${i + 1}`, duration_seconds: n }));

const shape = (gs: ReturnType<typeof groupShotsForFanOut>) =>
  gs.map((g) => ({ idx: g.shotIndexes, s: g.seconds }));

describe("shotSeconds", () => {
  it("reads duration_seconds", () => {
    expect(shotSeconds({ duration_seconds: 6 })).toBe(6);
  });

  // The Shot node shows this as assumed rather than parsed.
  it("falls back to 4 when absent, zero, or unparseable", () => {
    expect(shotSeconds({})).toBe(4);
    expect(shotSeconds({ duration_seconds: 0 })).toBe(4);
    expect(shotSeconds({ duration_seconds: Number.NaN })).toBe(4);
  });
});

describe("groupShotsForFanOut", () => {
  it("returns nothing for an empty script", () => {
    expect(groupShotsForFanOut([])).toEqual([]);
  });

  it("packs consecutive shots up to the 10s ceiling", () => {
    expect(shape(groupShotsForFanOut(shots(4, 5, 4)))).toEqual([
      { idx: [0, 1], s: 9 },
      { idx: [2], s: 4 },
    ]);
  });

  // THE FIXTURE. A real client script (CHUPPS "Where are you headed?") whose lengths strand a
  // 2s remainder below Omni's 3s floor that cannot merge backward — block 2 is already at 10.
  // Greedy alone gives [0,1]=8, [2,3]=10, [4]=2. The rebalance must move shot 3 forward.
  it("rebalances a trailing block that lands under the 3s floor", () => {
    expect(shape(groupShotsForFanOut(shots(3, 5, 6, 4, 2)))).toEqual([
      { idx: [0, 1], s: 8 },
      { idx: [2], s: 6 },
      { idx: [3, 4], s: 6 },
    ]);
  });

  it("never leaves a group below the floor unflagged", () => {
    for (const g of groupShotsForFanOut(shots(3, 5, 6, 4, 2))) {
      expect(g.seconds).toBeGreaterThanOrEqual(3);
      expect(g.clamped).toBe(false);
    }
  });

  // Nothing to rebalance from — clamp up and say so, rather than request an illegal 2s.
  it("clamps a lone sub-floor shot and flags it", () => {
    expect(groupShotsForFanOut(shots(2))).toEqual([
      { shotIndexes: [0], seconds: 3, clamped: true, overCap: false },
    ]);
  });

  // Where to cut a 14s shot is a creative decision, not an arithmetic one — never split silently.
  it("keeps an over-cap single shot whole and flags it", () => {
    expect(groupShotsForFanOut(shots(14))).toEqual([
      { shotIndexes: [0], seconds: 14, clamped: false, overCap: true },
    ]);
  });

  it("conserves every shot exactly once, in order", () => {
    const lengths = [3, 5, 6, 4, 2, 7, 1, 9];
    const flat = groupShotsForFanOut(shots(...lengths)).flatMap((g) => g.shotIndexes);
    expect(flat).toEqual(lengths.map((_, i) => i));
  });

  it("treats a shot with no length as 4s for packing", () => {
    expect(shape(groupShotsForFanOut([{}, {}, {}]))).toEqual([
      { idx: [0, 1], s: 8 },
      { idx: [2], s: 4 },
    ]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/lib/nodes/__tests__/group-shots.test.ts
```

Expected: FAIL — `Failed to resolve import "../group-shots"`.

- [ ] **Step 3: Implement**

Create `src/lib/nodes/group-shots.ts`:

```ts
import type { ReelShot } from "./reel-script";

/** Gemini Omni's documented duration range. Both ends bind — see the rebalance below. */
export const OMNI_MIN_SECONDS = 3;
export const OMNI_MAX_SECONDS = 10;
/** What a shot with no usable length is worth for packing. Shown as assumed, not parsed. */
export const ASSUMED_SHOT_SECONDS = 4;

export type ShotGroup = {
  shotIndexes: number[];
  seconds: number;
  /** The group was under the floor and nothing could be moved into it — `seconds` was raised. */
  clamped: boolean;
  /** A single shot longer than the ceiling. Kept whole; the request clamps it. */
  overCap: boolean;
};

export function shotSeconds(shot: ReelShot): number {
  const n = Number(shot.duration_seconds);
  return Number.isFinite(n) && n > 0 ? n : ASSUMED_SHOT_SECONDS;
}

/**
 * Move shots forward out of the previous group until the final group clears the floor.
 *
 * Greedy packing respects the ceiling but can strand a remainder under it: lengths 3,5,6,4,2 pack
 * to 8 / 10 / 2, and that 2s tail cannot merge backward because the block before it is already at
 * the cap. Pulling the previous group's LAST shot forward fixes both ends at once — 8 / 6 / 6.
 *
 * Stops rather than creating a new problem: never empties the previous group, and never pushes the
 * final group over the ceiling.
 */
function rebalanceTrailing(groups: ShotGroup[], lengths: number[]): void {
  while (groups.length >= 2) {
    const last = groups[groups.length - 1];
    if (last.seconds >= OMNI_MIN_SECONDS) return;

    const prev = groups[groups.length - 2];
    if (prev.shotIndexes.length < 2) return;

    const moved = prev.shotIndexes[prev.shotIndexes.length - 1];
    const movedLength = lengths[moved];
    if (last.seconds + movedLength > OMNI_MAX_SECONDS) return;

    prev.shotIndexes = prev.shotIndexes.slice(0, -1);
    prev.seconds -= movedLength;
    last.shotIndexes = [moved, ...last.shotIndexes];
    last.seconds += movedLength;
  }
}

/**
 * D193 — consecutive, greedy, then rebalanced. Deliberately not seam-aware.
 *
 * Finding good narrative seams was a planner's job, and its failures were invisible: a plan could
 * be internally consistent and still lose footage. Packing by arithmetic is legible instead — the
 * operator sees the groups as nodes and corrects them with the toggle, where the work already is.
 *
 * Shot count is conserved: every index appears exactly once, in order.
 */
export function groupShotsForFanOut(shots: ReelShot[]): ShotGroup[] {
  if (shots.length === 0) return [];

  const lengths = shots.map(shotSeconds);
  const groups: ShotGroup[] = [];
  let current: number[] = [];
  let total = 0;

  lengths.forEach((length, index) => {
    // `current.length > 0` keeps a single over-cap shot in its own group rather than looping
    // forever trying to fit it.
    if (current.length > 0 && total + length > OMNI_MAX_SECONDS) {
      groups.push({ shotIndexes: current, seconds: total, clamped: false, overCap: false });
      current = [];
      total = 0;
    }
    current.push(index);
    total += length;
  });
  if (current.length > 0) {
    groups.push({ shotIndexes: current, seconds: total, clamped: false, overCap: false });
  }

  rebalanceTrailing(groups, lengths);

  return groups.map((group) => ({
    ...group,
    // Clamping invents video the script did not ask for, so it only ever runs after the
    // rebalance has failed — a lone sub-floor shot with nothing to borrow from.
    seconds: group.seconds < OMNI_MIN_SECONDS ? OMNI_MIN_SECONDS : group.seconds,
    clamped: group.seconds < OMNI_MIN_SECONDS,
    overCap: group.seconds > OMNI_MAX_SECONDS,
  }));
}
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run src/lib/nodes/__tests__/group-shots.test.ts
```

Expected: PASS, 10 tests.

```bash
git add src/lib/nodes/group-shots.ts src/lib/nodes/__tests__/group-shots.test.ts
git commit -m "feat(shots): group consecutive shots to a 10s cap with a trailing rebalance (D193)

Greedy packing alone strands a remainder under Omni's 3s floor -- a real
client script (3,5,6,4,2) packs to 8/10/2, and the 2s tail cannot merge
backward into a block already at the cap. Pulling the previous group's last
shot forward fixes both ends: 8/6/6. Clamping only runs when there is
nothing to borrow from, because it invents video the script did not ask for.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Hybrid fan-out

**Files:**
- Modify: `src/lib/canvas-nodes.ts:100-113` (`ShotNodeData`)
- Modify: `src/lib/canvas-store.ts:366-401` (`fanOutShots`)
- Modify: `src/lib/canvas-store.test.ts`

**Interfaces:**
- Consumes: `groupShotsForFanOut`, `ShotGroup` (Task 2).
- Produces: `ShotNodeData.multishot?: boolean`, `seededFrom.shotIndexes?: number[]`.

- [ ] **Step 1: Extend the node data type**

In `src/lib/canvas-nodes.ts`, replace the `ShotNodeData` type with:

```ts
export type ShotNodeData = {
  // The parent reel script narrowed to the shots THIS node covers — one for a single shot, several
  // for a multishot group (D193). Carries the full metadata (objective, on-screen text, voiceover,
  // caption…) so downstream prompts keep the whole creative context, not just the shot line.
  // Editable; this node's output (D19/D20) — rendered via renderScriptAsText.
  script?: ReelScript;
  order?: number; // 1-based position in the script (display + Stage 5 assembly)
  shot_type?: string; // e.g. "Wide Shot", "Close-Up" — user-selected or keyword-derived
  /**
   * D193 — this node's shots become ONE generation with cuts between them, rather than one
   * generation each. True by default on any node fan-out grouped; turning it off SPLITS the node.
   * On a single-shot node it means "the model may cut inside this shot" rather than holding one
   * continuous take.
   */
  multishot?: boolean;
  seededFrom?: {
    scriptNodeId: string;
    shotIndex: number; // 0-based index of the FIRST shot — kept so pre-D193 nodes still resolve
    shotIndexes?: number[]; // every shot this node covers, in order
    scriptTitle?: string; // for the provenance label without a lookup
  };
};
```

- [ ] **Step 2: Write the failing store test**

In `src/lib/canvas-store.test.ts`, find the existing `fanOutShots` test block and add after it:

```ts
  it("groups consecutive shots into multishot nodes capped at 10s", () => {
    const store = makeStore();
    store.getState().addNode("script", { x: 0, y: 0 });
    const scriptNodeId = store.getState().nodes[0].id;
    store.getState().updateNodeData(scriptNodeId, {
      title: "Reel B",
      parsed: {
        title: "Reel B",
        visual_script: {
          shots: [
            { description: "one", duration_seconds: 3 },
            { description: "two", duration_seconds: 5 },
            { description: "three", duration_seconds: 6 },
            { description: "four", duration_seconds: 4 },
            { description: "five", duration_seconds: 2 },
          ],
        },
      },
    });

    store.getState().fanOutShots(scriptNodeId);
    const shotNodes = store.getState().nodes.filter((n) => n.type === "shot");

    // 5 shots -> 3 nodes, after the trailing rebalance: [0,1] [2] [3,4]
    expect(shotNodes).toHaveLength(3);
    expect(
      shotNodes.map((n) => (n.data as { script?: { visual_script?: { shots?: unknown[] } } })
        .script?.visual_script?.shots?.length),
    ).toEqual([2, 1, 2]);
    expect(shotNodes.map((n) => (n.data as { multishot?: boolean }).multishot))
      .toEqual([true, false, true]);
    expect(
      shotNodes.map((n) => (n.data as { seededFrom?: { shotIndexes?: number[] } })
        .seededFrom?.shotIndexes),
    ).toEqual([[0, 1], [2], [3, 4]]);
  });
```

`makeStore`, `addNode` and `updateNodeData` are already used by the neighbouring tests in this file — match how they are called there.

- [ ] **Step 3: Run and watch it fail**

```bash
npx vitest run src/lib/canvas-store.test.ts
```

Expected: FAIL — 5 nodes created, not 3.

- [ ] **Step 4: Group in `fanOutShots`**

In `src/lib/canvas-store.ts`, add to the imports:

```ts
import { groupShotsForFanOut } from "@/lib/nodes/group-shots";
```

Replace the `created` assignment inside `fanOutShots` (currently `const created = shots.map((shot, i) => ({...}))`) with:

```ts
      // D193 — hybrid fan-out. Consecutive shots pack into ≤10s groups, so the canvas comes out
      // mixed: grouped nodes generate as one clip with cuts, lone ones as a single take.
      const groups = groupShotsForFanOut(shots);
      const created = groups.map((group, i) => ({
        id: crypto.randomUUID(),
        type: "shot",
        position: { x: base.x + 360, y: base.y + i * 170 },
        data: {
          script: {
            ...parsed,
            visual_script: {
              ...parsed?.visual_script,
              shots: group.shotIndexes.map((shotIndex) => shots[shotIndex]),
            },
          },
          order: i + 1,
          multishot: group.shotIndexes.length > 1,
          shot_type: deriveShotType(shots[group.shotIndexes[0]]?.description ?? ""),
          seededFrom: {
            scriptNodeId,
            shotIndex: group.shotIndexes[0],
            shotIndexes: group.shotIndexes,
            scriptTitle,
          },
        },
      })) as AppNode[];
```

- [ ] **Step 5: Run and commit**

```bash
npx vitest run src/lib/canvas-store.test.ts src/lib/nodes
```

Expected: PASS.

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-store.ts src/lib/canvas-store.test.ts
git commit -m "feat(shots): fan out into hybrid multishot groups (D193)

A grouped node is just a Shot whose visual_script.shots holds more than one
entry -- the field was already an array, so this needs no new node type.
seededFrom keeps shotIndex as the first index so pre-D193 nodes still
resolve, and gains shotIndexes for the whole group.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Splitting a group back apart

**Files:**
- Create: `src/lib/nodes/split-multishot.ts`
- Create: `src/lib/nodes/__tests__/split-multishot.test.ts`
- Modify: `src/lib/canvas-store.ts` (new `splitMultishotNode` action + its type in the store interface)

**Interfaces:**
- Consumes: `ShotNodeData` (Task 3).
- Produces:
  ```ts
  function splitMultishotData(data: ShotNodeData): ShotNodeData[];
  // store: splitMultishotNode: (shotNodeId: string) => void;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/__tests__/split-multishot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { splitMultishotData } from "../split-multishot";
import type { ShotNodeData } from "@/lib/canvas-nodes";

const grouped: ShotNodeData = {
  script: {
    title: "Reel",
    strategic_objective: "Brand awareness",
    visual_script: {
      shots: [
        { description: "one", duration_seconds: 3 },
        { description: "two", duration_seconds: 5 },
      ],
      execution_refinement: "keep it quick",
    },
  },
  order: 2,
  multishot: true,
  shot_type: "Close-Up",
  seededFrom: { scriptNodeId: "script-1", shotIndex: 3, shotIndexes: [3, 4], scriptTitle: "Reel" },
};

describe("splitMultishotData", () => {
  it("produces one single-shot node per shot, in order", () => {
    const out = splitMultishotData(grouped);
    expect(out).toHaveLength(2);
    expect(out.map((d) => d.script?.visual_script?.shots?.[0]?.description)).toEqual(["one", "two"]);
    expect(out.every((d) => d.script?.visual_script?.shots?.length === 1)).toBe(true);
  });

  it("clears multishot on every produced node", () => {
    expect(splitMultishotData(grouped).every((d) => d.multishot === false)).toBe(true);
  });

  // The rest of the reel — objective, execution notes — is what makes a Shot "a Script node with
  // one shot" (D21). Dropping it on split would quietly strip downstream prompts of their context.
  it("keeps the full script context on each piece", () => {
    for (const d of splitMultishotData(grouped)) {
      expect(d.script?.strategic_objective).toBe("Brand awareness");
      expect(d.script?.visual_script?.execution_refinement).toBe("keep it quick");
    }
  });

  it("carries each piece's own source index in the lineage", () => {
    const out = splitMultishotData(grouped);
    expect(out.map((d) => d.seededFrom?.shotIndex)).toEqual([3, 4]);
    expect(out.map((d) => d.seededFrom?.shotIndexes)).toEqual([[3], [4]]);
    expect(out.every((d) => d.seededFrom?.scriptNodeId === "script-1")).toBe(true);
  });

  // shot_type was derived from the group's FIRST shot, so it is only true of the first piece.
  it("re-derives shot_type per piece rather than copying the group's", () => {
    const out = splitMultishotData({
      ...grouped,
      script: {
        visual_script: {
          shots: [
            { description: "Wide shot of the street" },
            { description: "Extreme close-up on the label" },
          ],
        },
      },
    });
    expect(out.map((d) => d.shot_type)).toEqual(["Wide Shot", "Extreme Close-Up"]);
  });

  it("returns a single unchanged-shape node when there is nothing to split", () => {
    const single: ShotNodeData = {
      script: { visual_script: { shots: [{ description: "only" }] } },
      multishot: true,
    };
    const out = splitMultishotData(single);
    expect(out).toHaveLength(1);
    expect(out[0].multishot).toBe(false);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/lib/nodes/__tests__/split-multishot.test.ts
```

Expected: FAIL — `Failed to resolve import "../split-multishot"`.

- [ ] **Step 3: Implement the pure split**

Create `src/lib/nodes/split-multishot.ts`:

```ts
import type { ShotNodeData } from "@/lib/canvas-nodes";
import { deriveShotType } from "./shot-types";

/**
 * D193 — one grouped Shot's data becomes one single-shot Shot per beat.
 *
 * Each piece keeps the FULL parent script narrowed to its own shot, which is what makes a Shot
 * "a Script node with one shot" (D21): the objective, on-screen text, voiceover and execution
 * notes all travel, so a downstream prompt written against a split piece has the same creative
 * context it had before the split.
 *
 * `shot_type` is re-derived rather than copied, because the group's value was derived from its
 * first shot and is only true of that one.
 */
export function splitMultishotData(data: ShotNodeData): ShotNodeData[] {
  const shots = data.script?.visual_script?.shots ?? [];
  if (shots.length === 0) return [{ ...data, multishot: false }];

  const sourceIndexes = data.seededFrom?.shotIndexes ?? shots.map((_, i) => i);

  return shots.map((shot, i) => ({
    ...data,
    multishot: false,
    shot_type: deriveShotType(shot.description ?? ""),
    script: {
      ...data.script,
      visual_script: { ...data.script?.visual_script, shots: [shot] },
    },
    seededFrom: data.seededFrom
      ? {
          ...data.seededFrom,
          shotIndex: sourceIndexes[i] ?? i,
          shotIndexes: [sourceIndexes[i] ?? i],
        }
      : undefined,
  }));
}
```

- [ ] **Step 4: Add the store action**

In `src/lib/canvas-store.ts`, add to the store's interface beside `fanOutShots: (scriptNodeId: string) => void;`:

```ts
  splitMultishotNode: (shotNodeId: string) => void;
```

Add the import:

```ts
import { splitMultishotData } from "@/lib/nodes/split-multishot";
```

And add this action immediately after `fanOutShots`:

```ts
    /**
     * D193 — turning multishot OFF on a grouped node splits it into one node per shot.
     *
     * A structural change, not a display flag: the grouped node is REPLACED by its pieces, stacked
     * below its old position so nothing lands on top of a neighbour. Incoming edges are re-pointed
     * to every piece (the dashed Script lineage edge, and any image grounding), because each piece
     * needs the same inputs the group had. Outgoing edges are dropped — a motion prompt written for
     * a cut ladder does not describe any single beat of it, and silently re-pointing it at all the
     * pieces would multiply one prompt across shots it was never written for.
     */
    splitMultishotNode: (shotNodeId) => {
      const node = get().nodes.find((n) => n.id === shotNodeId);
      if (!node || node.type !== "shot") return;

      const pieces = splitMultishotData(node.data as ShotNodeData);
      if (pieces.length <= 1) {
        get().updateNodeData(shotNodeId, { multishot: false });
        return;
      }

      const created = pieces.map((data, i) => ({
        id: crypto.randomUUID(),
        type: "shot",
        position: { x: node.position.x, y: node.position.y + i * 170 },
        data,
      })) as AppNode[];

      const incoming = get().edges.filter((e) => e.target === shotNodeId);
      const carried = created.flatMap((piece) =>
        incoming.map((edge) => ({
          id: crypto.randomUUID(),
          source: edge.source,
          target: piece.id,
          ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
        })),
      );

      set({
        nodes: [...get().nodes.filter((n) => n.id !== shotNodeId), ...created],
        edges: [
          ...get().edges.filter((e) => e.target !== shotNodeId && e.source !== shotNodeId),
          ...carried,
        ],
      });
    },
```

If `ShotNodeData` is not already imported in `canvas-store.ts`, add it to the existing `@/lib/canvas-nodes` type import.

- [ ] **Step 5: Run and commit**

```bash
npx vitest run src/lib/nodes src/lib/canvas-store.test.ts
npx tsc --noEmit
```

Expected: PASS; no new type errors.

```bash
git add src/lib/nodes/split-multishot.ts src/lib/nodes/__tests__/split-multishot.test.ts src/lib/canvas-store.ts
git commit -m "feat(shots): splitting a multishot node replaces it with one node per shot (D193)

Each piece keeps the full parent script narrowed to its own shot, so a
downstream prompt has the same context it had before. Incoming edges are
carried to every piece; outgoing ones are dropped, because a prompt written
for a cut ladder describes no single beat of it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The Shot node reads and edits every beat

Today the node reads `shots[0]` and writes `shots: [ ... ]` — on a grouped node that would show one beat and **destroy the rest on the first keystroke**.

**Files:**
- Create: `src/components/nodes/multishot-toggle.tsx`
- Modify: `src/components/nodes/shot-node.tsx`

**Interfaces:**
- Consumes: `splitMultishotNode` (Task 4), `ShotNodeData.multishot` (Task 3).
- Produces: `<MultishotToggle nodeId multishot beatCount />`.

- [ ] **Step 1: Build the toggle**

Create `src/components/nodes/multishot-toggle.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";

/**
 * D193 — the only multishot control there is.
 *
 * On a grouped node, turning it OFF is a structural change: the node is replaced by one node per
 * beat. That earns a confirm, because it is not undoable by flipping the switch back — there is
 * deliberately no merge (regrouping means re-running fan-out).
 *
 * On a single-beat node it is a plain flag: on means the model may cut inside this one shot, off
 * means one continuous take.
 */
export function MultishotToggle({
  nodeId,
  multishot,
  beatCount,
}: {
  nodeId: string;
  multishot: boolean;
  beatCount: number;
}) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const splitMultishotNode = useCanvasStore((s) => s.splitMultishotNode);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const splitsOnDisable = multishot && beatCount > 1;

  function handleChange(next: boolean) {
    if (!next && splitsOnDisable) {
      setConfirmOpen(true);
      return;
    }
    updateNodeData(nodeId, { multishot: next });
  }

  return (
    <>
      <div className="nodrag flex items-center gap-1.5">
        <Switch
          checked={multishot}
          onCheckedChange={handleChange}
          aria-label="Multishot"
          className="scale-75"
        />
        <span
          className={cn(
            "text-[0.6rem] font-medium uppercase tracking-wide transition-colors duration-200",
            multishot ? "text-primary" : "text-muted-foreground",
          )}
        >
          Multishot
        </span>
        {multishot && beatCount > 1 && (
          <span className="text-[0.6rem] text-muted-foreground">{beatCount} beats</span>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Split this shot into {beatCount}?</AlertDialogTitle>
            <AlertDialogDescription>
              Turning multishot off replaces this node with one node per beat, each keeping the
              full script context. Anything connected downstream of it is disconnected, because a
              prompt written for a cut sequence does not describe a single beat. There is no
              merge — to regroup, fan out from the script again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="ghost" />}>Keep as one</AlertDialogCancel>
            <AlertDialogAction
              render={<Button variant="default" />}
              onClick={() => splitMultishotNode(nodeId)}
            >
              <Scissors className="size-3.5" strokeWidth={1.5} />
              Split into {beatCount}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

If `src/components/ui/switch.tsx` or `src/components/ui/alert-dialog.tsx` does not exist, add it from the shadcn Base UI registry before continuing — do **not** substitute a raw `<input type="checkbox">` or a `window.confirm`.

- [ ] **Step 2: Make the node multi-beat safe**

In `src/components/nodes/shot-node.tsx`:

Add the import:

```tsx
import { MultishotToggle } from "./multishot-toggle";
```

Replace the `d` destructuring, `shot`, `description` and `setDescription` block with:

```tsx
  const d = data as {
    script?: ReelScript;
    order?: number;
    shot_type?: string;
    multishot?: boolean;
    seededFrom?: { scriptTitle?: string };
  };
  const shots = d.script?.visual_script?.shots ?? [];
  const multishot = d.multishot === true;
  // A grouped node edits one beat at a time. Reading shots[0] and writing `shots: [one]` — which
  // is what this did before D193 — showed only the first beat and destroyed the rest on the first
  // keystroke.
  const [beatIndex, setBeatIndex] = useState(0);
  const activeBeat = Math.min(beatIndex, Math.max(0, shots.length - 1));
  const shot = shots[activeBeat];
  const description = shot?.description ?? "";

  function setDescription(value: string) {
    const base = d.script ?? {};
    const vs = base.visual_script ?? {};
    const next = (vs.shots ?? [{}]).map((s, i) =>
      i === activeBeat ? { ...s, description: value } : s,
    );
    updateNodeData(id, { script: { ...base, visual_script: { ...vs, shots: next } } });
  }
```

- [ ] **Step 3: Show the beats and the toggle**

In the same file, replace the `<p>` provenance line and the row below it with:

```tsx
          {shots.length > 1 && (
            <div className="nodrag flex flex-wrap gap-1 px-1.5 pb-1">
              {shots.map((s, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  onClick={() => setBeatIndex(i)}
                  aria-pressed={i === activeBeat}
                  title={s.description ?? `Beat ${i + 1}`}
                  className={cn(
                    "h-auto rounded border px-1.5 py-0.5 text-[0.6rem] font-medium transition-colors duration-200",
                    i === activeBeat
                      ? "border-primary/35 bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
          )}

          <p className="px-1.5 pt-1 text-[0.6rem] text-muted-foreground">
            {d.seededFrom?.scriptTitle ? `from "${d.seededFrom.scriptTitle}" · ` : ""}full script context
          </p>

          <div className="mt-1 flex items-center gap-1.5">
            <Button
              variant="ghost"
              onClick={() => setComposeOpen(true)}
              className="nodrag h-auto gap-1 rounded-md border border-dashed border-primary/40 px-2 py-1 text-[0.65rem] text-primary hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5"
            >
              <Sparkles className="size-3" strokeWidth={1.5} /> Compose
            </Button>
            <GuidedNextButton sourceId={id} variant="chip" />
          </div>

          <div className="mt-1.5 border-t border-border pt-1.5">
            <MultishotToggle nodeId={id} multishot={multishot} beatCount={shots.length} />
          </div>
```

- [ ] **Step 4: Verify in the app**

```bash
npm run dev
```

Parse a script whose shots total more than 10s, fan out, and confirm: grouped nodes show numbered beat chips and a lit Multishot switch; clicking a chip switches which beat the textarea edits, and editing one leaves the others intact; turning the switch off opens the confirm and then replaces the node with one per beat.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/multishot-toggle.tsx src/components/nodes/shot-node.tsx
git commit -m "feat(shots): edit any beat of a multishot node, and split from the node itself (D193)

The node read shots[0] and wrote shots: [one], so a grouped node would have
shown one beat and destroyed the rest on the first keystroke. Beats are now
numbered chips selecting which one the textarea edits.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The motion prompt reads the flag

**Files:**
- Modify: `src/prompts/video-prompt-generate.ts`
- Modify: `src/lib/nodes/resolve-inputs.ts:104-106`
- Create: `src/prompts/__tests__/video-prompt-omni.test.ts`

**Interfaces:**
- Consumes: `ShotNodeData.multishot` (Task 3), `shotSeconds` (Task 2).
- Produces: `VideoProvider += "gemini-omni"`; `renderShotLadder(script): string`.

- [ ] **Step 1: Write the failing test**

Create `src/prompts/__tests__/video-prompt-omni.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  videoPromptGeneratePromptFor,
  videoPromptGenerateOmniPrompt,
  SINGLE_TAKE_LINE,
} from "../video-prompt-generate";
import { renderShotLadder } from "@/lib/nodes/render-shot-for-video";

describe("videoPromptGeneratePromptFor", () => {
  it("routes gemini-omni to the ladder variant", () => {
    expect(videoPromptGeneratePromptFor("gemini-omni").id).toBe(videoPromptGenerateOmniPrompt.id);
  });

  it("still routes kling and veo as before", () => {
    expect(videoPromptGeneratePromptFor("kling").id).toBe("video-prompt-generate-kling");
    expect(videoPromptGeneratePromptFor("veo").id).toBe("video-prompt-generate");
  });

  // Omni cuts by default, so a single take must be REQUESTED — the inverse of every other model.
  it("tells the Omni variant to write a timecode ladder", () => {
    expect(videoPromptGenerateOmniPrompt.system).toContain("[0-");
    expect(videoPromptGenerateOmniPrompt.system).toMatch(/timecode/i);
  });
});

describe("renderShotLadder", () => {
  it("lays consecutive beats end to end from their lengths", () => {
    expect(
      renderShotLadder({
        visual_script: {
          shots: [
            { description: "hands lift the jar", duration_seconds: 4 },
            { description: "macro on the lid", duration_seconds: 5 },
          ],
        },
      }),
    ).toBe("[0-4s] hands lift the jar\n[4-9s] macro on the lid");
  });

  it("uses the 4s assumption for a beat with no length", () => {
    expect(
      renderShotLadder({ visual_script: { shots: [{ description: "a" }, { description: "b" }] } }),
    ).toBe("[0-4s] a\n[4-8s] b");
  });

  it("returns an empty string for no shots", () => {
    expect(renderShotLadder({ visual_script: { shots: [] } })).toBe("");
    expect(renderShotLadder(null)).toBe("");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/prompts/__tests__/video-prompt-omni.test.ts
```

Expected: FAIL — the imports do not exist.

- [ ] **Step 3: Add the ladder renderer**

In `src/lib/nodes/render-shot-for-video.ts`, add this to the **import block at the top of the file**:

```ts
import { shotSeconds } from "@/lib/nodes/group-shots";
```

Then append the function to the end of the file:

```ts
/**
 * A multishot node's beats as Omni's documented timecode ladder.
 *
 * Times are cumulative and derived from each beat's own length, so the ladder always sums to the
 * node's total — which is what the request's `duration` is derived from. The two agreeing by
 * construction is the point: a ladder longer than the duration comes back truncated, at full price.
 */
export function renderShotLadder(script: ReelScript | null): string {
  const shots = script?.visual_script?.shots ?? [];
  if (shots.length === 0) return "";
  let at = 0;
  return shots
    .map((shot) => {
      const from = at;
      at += shotSeconds(shot);
      return `[${from}-${at}s] ${(shot.description ?? "").trim()}`;
    })
    .join("\n");
}
```

- [ ] **Step 4: Add the Omni prompt variant**

In `src/prompts/video-prompt-generate.ts`, change the provider union and router, and add the variant:

```ts
export type VideoProvider = "veo" | "kling" | "gemini-omni";

/** Omni cuts by DEFAULT — a continuous take is the thing that has to be asked for. */
export const SINGLE_TAKE_LINE = "In a single unbroken scene. No scene cuts.";

export const videoPromptGenerateOmniPrompt = {
  id: "video-prompt-generate-omni",
  version: 1,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing prompts for Gemini Omni, a model that cuts between shots by default.

OUTPUT FORMAT
A timecode ladder — one line per beat, no preamble, no headers, no explanation:
[0-4s] <framing>. <subject and what physically happens>. <camera move with its invariant named>. <light>.
[4-9s] …
Times are given to you; keep them exactly. They must run consecutively from 0 with no gaps.

RULES
1. Lead each beat with framing, then subject, then camera, then light.
2. Name every camera move's invariant ("a slow push-in at a constant focal length"). Unqualified moves drift.
3. Never write a camera clause describing an effect on the subject ("so the jar feels taller") — the model executes subject-state language as subject motion.
4. Keep a LOOK contract identical across beats: light direction, time of day, lens, palette, ground, grade.
5. Name a referenced image in every beat it appears in, not once at the top.
6. Never describe a referenced subject's design in prose — the reference carries it. Describe what it cannot: framing, motion, light, wardrobe, ground contact.

WORDS TO AVOID
"cinematic masterpiece", "ultra realistic", "8K", "stunning", "beautiful".`,
} as const;
```

And replace `videoPromptGeneratePromptFor`'s body:

```ts
// Omni gets the ladder variant; Kling the quality-tag variant; Veo (and any stale value) the clean one.
export function videoPromptGeneratePromptFor(provider: VideoProvider): VideoProviderPrompt {
  if (provider === "gemini-omni") return videoPromptGenerateOmniPrompt;
  return provider === "kling" ? videoPromptGenerateKlingPrompt : videoPromptGeneratePrompt;
}
```

- [ ] **Step 5: Carry the flag downstream**

In `src/lib/nodes/resolve-inputs.ts`, replace the `shot` branch of `mapUpstreamForVideo`:

```ts
  if (u.type === "shot") {
    // D195 — a multishot Shot hands down its beats as a timecode ladder; a single one hands down
    // the action line plus an explicit instruction to hold one take, because Omni cuts by default.
    const script = (u.data.script ?? null) as ReelScript | null;
    const multishot = u.data.multishot === true;
    const ladder = multishot ? renderShotLadder(script) : "";
    return {
      ...base,
      text: ladder
        ? `Beats (keep these timings exactly):\n${ladder}`
        : `${renderShotForVideo(script)}\n${SINGLE_TAKE_LINE}`.trim(),
    };
  }
```

Add to that file's imports:

```ts
import { renderShotForVideo, renderShotLadder } from "@/lib/nodes/render-shot-for-video";
import { SINGLE_TAKE_LINE } from "@/prompts/video-prompt-generate";
```

(replacing the existing `renderShotForVideo` import line).

- [ ] **Step 6: Run and commit**

```bash
npx vitest run src/prompts src/lib/nodes
npx tsc --noEmit
```

Expected: PASS; no new type errors. If `providerOf` in `video-prompt-focus-view.tsx` now errors, leave it — Task 7 revisits it.

```bash
git add src/prompts/video-prompt-generate.ts src/lib/nodes/render-shot-for-video.ts src/lib/nodes/resolve-inputs.ts src/prompts/__tests__/video-prompt-omni.test.ts
git commit -m "feat(video-prompt): write a timecode ladder for a multishot shot (D195)

Times are derived from each beat's own length so the ladder always sums to
the node total, which is what the request duration is derived from -- a
ladder longer than the duration comes back truncated at full price. A single
shot instead gets an explicit no-cuts line, because Omni cuts by default.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: The video-gen node reads the flag

**Files:**
- Modify: `src/components/nodes/video-gen-model-picker.tsx`
- Modify: `src/components/nodes/video-gen-focus-view.tsx`
- Modify: `src/components/nodes/video-prompt-focus-view.tsx` (the `providerOf` map from Plan 1)

**Interfaces:**
- Consumes: `ShotNodeData.multishot`, `shotSeconds`, `groupShotsForFanOut` constants.
- Produces: `VideoGenModelPicker` gains `restrictToModelId?: string` and `restrictionReason?: string`.

- [ ] **Step 1: Restrict the picker**

In `src/components/nodes/video-gen-model-picker.tsx`, add the two props and filter:

```tsx
export function VideoGenModelPicker({
  modelId,
  onModelChange,
  restrictToModelId,
  restrictionReason,
  children,
}: {
  modelId: string;
  onModelChange: (modelId: string) => void;
  /** D195 — when set, only this model is offered. A multishot shot needs a model that cuts. */
  restrictToModelId?: string;
  restrictionReason?: string;
  children?: ReactNode;
}) {
  const groups = restrictToModelId
    ? videoGenClientModelGroups
        .map((g) => ({ ...g, models: g.models.filter((m) => m.id === restrictToModelId) }))
        .filter((g) => g.models.length > 0)
    : videoGenClientModelGroups;
```

Then replace `videoGenClientModelGroups.map((providerGroup) =>` with `groups.map((providerGroup) =>`, and add directly under the closing `</div>` of the chips row:

```tsx
      {restrictionReason && (
        <p className="mt-2 text-[0.7rem] text-muted-foreground">{restrictionReason}</p>
      )}
```

- [ ] **Step 2: Wire the upstream check**

In `src/components/nodes/video-gen-focus-view.tsx`, find where `<VideoGenModelPicker` is rendered (around line 1018 in the Connected section area — search for `VideoGenModelPicker`). Above the component's return, add:

```tsx
  // D195 — a multishot shot's prompt is a timecode ladder. Every other model ignores the timings
  // and returns one continuous take, which is indistinguishable from a bug after paying for it.
  const upstreamMultishot = useCanvasStore((s) => {
    const seen = new Set<string>();
    const walk = (id: string, depth: number): boolean => {
      if (depth > 2 || seen.has(id)) return false;
      seen.add(id);
      return s.edges
        .filter((e) => e.target === id)
        .some((e) => {
          const source = s.nodes.find((n) => n.id === e.source);
          if (!source) return false;
          if (source.type === "shot") return (source.data as { multishot?: boolean }).multishot === true;
          return walk(e.source, depth + 1);
        });
    };
    return walk(nodeId, 0);
  });
```

and pass to the picker:

```tsx
          restrictToModelId={upstreamMultishot ? "gemini:gemini-omni-1.1-flash" : undefined}
          restrictionReason={
            upstreamMultishot
              ? "This shot is multishot — only Gemini Omni cuts between shots natively."
              : undefined
          }
```

- [ ] **Step 3: Derive the duration from the shot**

Spec §7: duration defaults to the node's own total, clamped 3–10, **editable**, and labelled with
where the default came from. Derived-by-default is what keeps the ladder in the prompt and the
duration on the request agreeing — the pair whose drift truncates footage at full price.

Create `src/lib/nodes/derive-shot-duration.ts`:

```ts
import type { ReelScript } from "@/lib/nodes/reel-script";
import { shotSeconds, OMNI_MIN_SECONDS, OMNI_MAX_SECONDS } from "@/lib/nodes/group-shots";

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
  return Math.min(OMNI_MAX_SECONDS, Math.max(OMNI_MIN_SECONDS, Math.round(total)));
}
```

Create `src/lib/nodes/__tests__/derive-shot-duration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveShotDuration } from "../derive-shot-duration";

describe("deriveShotDuration", () => {
  it("sums the beats", () => {
    expect(deriveShotDuration({
      visual_script: { shots: [{ duration_seconds: 4 }, { duration_seconds: 5 }] },
    })).toBe(9);
  });

  // An over-cap shot is kept whole by grouping and clamped here, at the request.
  it("clamps to the model's range at both ends", () => {
    expect(deriveShotDuration({ visual_script: { shots: [{ duration_seconds: 14 }] } })).toBe(10);
    expect(deriveShotDuration({ visual_script: { shots: [{ duration_seconds: 2 }] } })).toBe(3);
  });

  // Not 3 — an absent script is not a 3-second shot, and the caller should keep its own default.
  it("returns null when there is nothing to derive from", () => {
    expect(deriveShotDuration(null)).toBeNull();
    expect(deriveShotDuration({ visual_script: { shots: [] } })).toBeNull();
  });
});
```

Then in `src/components/nodes/video-gen-focus-view.tsx`, alongside the `upstreamMultishot` selector from Step 2, add one that reads the upstream Shot's script and derives the duration, and apply it as the `duration` param's default when the node has not already set one. Follow the file's existing pattern for defaulting params (search for `defaultsForVideoModel`); the derived value replaces the spec default for `duration` only, and the operator's own edit always wins. Label the control's helper text `Derived from this shot (Ns)` when the derived value is in effect.

- [ ] **Step 4: Route the motion prompt to the Omni variant**

In `src/components/nodes/video-prompt-focus-view.tsx`, replace the `providerOf` added in Plan 1:

```tsx
  // D195 — Omni gets its own motion-prompt variant (the timecode ladder), so it maps to
  // "gemini-omni" rather than folding into Veo as it did before that variant existed.
  const providerOf = (modelId?: string): VideoProvider => {
    const provider = videoGenClientModelMap[modelId ?? DEFAULT_VIDEO_CLIENT_MODEL_ID]?.provider;
    if (provider === "kling") return "kling";
    if (provider === "gemini") return "gemini-omni";
    return "veo";
  };
```

Then update the route's guard in `src/app/api/nodes/[id]/video-prompt/route.ts` — find `VALID_PROVIDERS` and add `"gemini-omni"` to the array.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run src/lib/video-gen src/lib/nodes src/prompts
npx tsc --noEmit
npm run dev
```

In the app: connect a multishot Shot → motion prompt → video-gen. Confirm the picker shows only Gemini Omni with the reason beneath it, and that a single-shot node shows the full roster.

```bash
git add src/components/nodes/video-gen-model-picker.tsx src/components/nodes/video-gen-focus-view.tsx src/components/nodes/video-prompt-focus-view.tsx src/app/api/nodes/[id]/video-prompt/route.ts src/lib/nodes/derive-shot-duration.ts src/lib/nodes/__tests__/derive-shot-duration.test.ts
git commit -m "feat(video-gen): restrict a multishot shot to Omni and route its motion prompt (D195)

Pointing a timecode ladder at any other model returns one continuous take
with the timings silently ignored, which reads as a bug after paying for it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: End-to-end

Manual — needs a browser.

- [ ] **Step 1:** Parse the CHUPPS script (lengths 3, 5, 6, 4, 2). Confirm each shot shows a length and that they are **lengths, not range ends** — shot 3 (`8–14 sec`) must read 6.
- [ ] **Step 2:** Fan out. Confirm **3 nodes**, not 5: beats `[1,2] [3] [4,5]`, the first and last lit Multishot.
- [ ] **Step 3:** On a grouped node, click each beat chip and edit — confirm the other beats survive.
- [ ] **Step 4:** Turn Multishot off on a grouped node. Confirm the dialog, then 2 nodes replacing it, each single.
- [ ] **Step 5:** Connect a grouped node → motion prompt → video-gen. Generate the motion prompt; confirm it is a timecode ladder whose times match the beats.
- [ ] **Step 6:** Confirm the video-gen picker offers **only Gemini Omni**, with the reason shown, and that duration matches the node total.
- [ ] **Step 7:** Generate at **360p**. Confirm the returned clip **actually cuts** between beats. *This is the assumption the whole feature rests on and it is still unverified.* If it does not cut, the ladder needs strengthening (an explicit "cut to" per beat) before this ships.

---

## Done when

- A 20s script fans out to 3 nodes, not 5, with no block under 3s or over 10s.
- Editing one beat of a grouped node leaves the others intact.
- Turning Multishot off splits the node after a confirm.
- A multishot node's motion prompt is a timecode ladder; a single node's carries the no-cuts line.
- The video-gen picker offers only Omni for a multishot shot.
- `npx vitest run src/lib/nodes src/lib/video-gen src/prompts src/lib/generations` passes; `npx tsc --noEmit` reports no new errors.
