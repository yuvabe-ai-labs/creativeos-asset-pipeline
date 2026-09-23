# Multishot shot editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator add and remove shots directly on the Multishot node's focus view, behind an explicit Save/Cancel, without the Multishot Prompt silently shipping a blank shot.

**Architecture:** Five layers, bottom up. (1) Generalise the already-written-but-unwired `addCut`/`removeCut` in `multishot-cuts.ts` into `insertCut` + a `canAddCut` reason. (2) Add a pure `planCoverage` to `multishot-plan.ts` that answers "does this plan cover this ladder?" — derived, never stored. (3) Enforce it on the money path before any generation row or credit reservation. (4) Extract the focus view's draft into a pure `multishot-draft.ts`. (5) Wire the UI. Each layer is independently testable and committed on its own.

**Tech Stack:** Next.js (App Router), React 19, TypeScript, Zustand (`canvas-store`), vitest (`environment: "node"`), Tailwind v4, shadcn/Base UI primitives.

**Spec:** [`docs/superpowers/specs/2026-09-23-multishot-shot-editing-design.md`](../specs/2026-09-23-multishot-shot-editing-design.md) (D279, D280)

## Global Constraints

- **Controls are shadcn primitives only.** Never a raw `<button>`, `<input>`, `<select>`. Use `Button`, `Slider`, `Select`, `AlertDialog` from `src/components/ui/*`. Base UI composes via the `render` prop, **not** `asChild`.
- **No hardcoded colors.** Drive everything through the shadcn CSS variables in `src/app/globals.css`. Use `text-eyebrow` for tracked small-caps labels.
- **Icons: Lucide only, stroke 1.5, no fills.**
- **Import, never redefine.** `totalOf`, `headroomOf`, `newCut`, `multishotCapabilityFor`, `checkLadder` all already exist. Grep before adding any constant or helper.
- **`undefined` and `[]` are different states** for `MultishotCut.voiceover`. A new cut has **no `voiceover` key at all**.
- **Every writer of `cuts` must write `totalSeconds` in the same `updateNodeData` call.** There is no code path that sets one without the other.
- **Tests run in `environment: "node"`.** There is no jsdom and no `@testing-library`. Component *rendering* cannot be tested; extract pure logic and test that (see Task 4).
- **Test command:** `npx vitest run <path>` for one file. Full-suite runs have ~11 known timeout flakes in API route tests — verify per-directory, not by full run.
- **Commit messages** end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/nodes/multishot-cuts.ts` | Modify | `insertCut`, `canAddCut`; `addCut` delegates; rewrite the stale `DEFERRED` comments |
| `src/lib/nodes/__tests__/multishot-cuts.test.ts` | Modify | Cases for the above |
| `src/lib/nodes/multishot-plan.ts` | Modify | `planCoverage` — the one place plan↔ladder coverage is answered |
| `src/lib/nodes/__tests__/multishot-plan.test.ts` | Modify | Cases for `planCoverage` |
| `src/lib/nodes/multishot-models.ts` | Modify | The cut-cap reason's wording |
| `src/lib/nodes/__tests__/multishot-models.test.ts` | Modify | Assert the new wording |
| `src/app/api/nodes/[id]/video-generate/route.ts` | Modify | The coverage guard, above `insertGeneration`/`reserveCredits` |
| `src/app/api/nodes/[id]/video-generate/route.test.ts` | Modify | 400 + no generation row + no reservation; orphan alone still passes |
| `src/lib/nodes/multishot-draft.ts` | **Create** | Pure draft type, `draftIsDirty`, `commitDraft` |
| `src/lib/nodes/__tests__/multishot-draft.test.ts` | **Create** | Cases for the above |
| `src/components/nodes/multishot-focus-view.tsx` | Modify | Draft state, Save/Cancel, discard confirm, per-card `+`/`X`, Add-shot chip |
| `src/components/nodes/multishot-node.tsx` | Modify | Pass a single commit callback instead of two write-through callbacks |
| `src/components/nodes/multishot-prompt-focus-view.tsx` | Modify | "Not written yet" on an uncovered cut |
| `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` | Modify | Append D279 + D280 to §7 |

---

### Task 1: `insertCut` and `canAddCut`

**Files:**
- Modify: `src/lib/nodes/multishot-cuts.ts:165-195`
- Test: `src/lib/nodes/__tests__/multishot-cuts.test.ts`

**Interfaces:**
- Consumes: `headroomOf`, `newCut`, `totalOf` (same module); `MultishotCapability`, `LadderCheck` from `./multishot-models`
- Produces:
  - `insertCut(cuts: MultishotCut[], index: number, cap: MultishotCapability): MultishotCut[]`
  - `canAddCut(cuts: MultishotCut[], cap: MultishotCapability): LadderCheck`
  - `addCut(cuts: MultishotCut[], cap: MultishotCapability): MultishotCut[]` (unchanged signature)
  - `removeCut(cuts: MultishotCut[], index: number): MultishotCut[]` (unchanged, untouched)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/nodes/__tests__/multishot-cuts.test.ts`. Add `insertCut` and `canAddCut` to the existing import list at the top of the file (line 2-14).

```ts
describe("insertCut", () => {
  it("inserts at index 0, pushing every existing cut back", () => {
    const result = insertCut(cuts(2, 2, 4), 0, OMNI);
    expect(secondsOf(result)).toEqual([1, 2, 2, 4]);
    expect(result[0].text).toBe("");
    expect(result[1].text).toBe("cut 1");
  });

  it("inserts in the middle", () => {
    const result = insertCut(cuts(2, 2, 4), 2, OMNI);
    expect(result.map((c) => c.text)).toEqual(["cut 1", "cut 2", "", "cut 3"]);
  });

  it("appends when index === cuts.length", () => {
    const result = insertCut(cuts(2, 2, 4), 3, OMNI);
    expect(result.map((c) => c.text)).toEqual(["cut 1", "cut 2", "cut 3", ""]);
  });

  it("leaves every existing cut byte-identical (same object references)", () => {
    const original = cuts(2, 2, 4);
    const result = insertCut(original, 1, OMNI);
    expect(result[0]).toBe(original[0]);
    expect(result[2]).toBe(original[1]);
    expect(result[3]).toBe(original[2]);
  });

  it("funds the new cut from headroom — no neighbour is shortened", () => {
    const result = insertCut(cuts(2, 2, 4), 1, OMNI);
    expect(totalOf(result)).toBe(9); // 8 + 1, nobody lost a second
  });

  // The new cut has NO voiceover key. `undefined` and `[]` are different states throughout
  // this module, and a brand new shot has not been declared silent.
  it("gives the new cut no voiceover key at all", () => {
    const result = insertCut(cuts(4), 1, OMNI);
    expect("voiceover" in result[1]).toBe(false);
  });

  it("refuses when the ladder is already at the ceiling", () => {
    const full = cuts(OMNI_MAX_SECONDS);
    expect(insertCut(full, 0, OMNI)).toEqual(full);
  });

  it("refuses a 7th cut on Kling and allows it on Omni", () => {
    const six = cuts(1, 1, 1, 1, 1, 1);
    expect(insertCut(six, 0, KLING)).toHaveLength(6);
    expect(insertCut(six, 0, OMNI)).toHaveLength(7);
  });

  it("clamps an out-of-range index rather than producing a hole", () => {
    expect(insertCut(cuts(2, 2), -5, OMNI).map((c) => c.text)).toEqual(["", "cut 1", "cut 2"]);
    expect(insertCut(cuts(2, 2), 99, OMNI).map((c) => c.text)).toEqual(["cut 1", "cut 2", ""]);
  });
});

describe("canAddCut", () => {
  it("is ok when there is headroom and room under the cut cap", () => {
    expect(canAddCut(cuts(2, 2), OMNI)).toEqual({ ok: true });
  });

  it("names the ceiling when the ladder is full", () => {
    const result = canAddCut(cuts(OMNI_MAX_SECONDS), OMNI);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe(
      "10s maximum reached. Shorten a shot to make room.",
    );
  });

  it("names the model and its cut cap when the cap is reached", () => {
    const result = canAddCut(cuts(1, 1, 1, 1, 1, 1), KLING);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("Kling 3.0 Omni allows 6 shots.");
  });

  // The ceiling is reported first: it is the one the operator can fix by shortening a shot,
  // and checkLadder's own rule is that only the FIRST violation is reported.
  it("reports the ceiling first when both are violated", () => {
    const result = canAddCut(cuts(3, 3, 3, 2, 2, 2), KLING); // 15s AND 6 cuts
    expect(result.ok === false && result.reason).toContain("maximum reached");
  });

  it("agrees with insertCut — a refused add is never ok", () => {
    const full = cuts(OMNI_MAX_SECONDS);
    expect(canAddCut(full, OMNI).ok).toBe(false);
    expect(insertCut(full, 0, OMNI)).toEqual(full);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-cuts.test.ts`
Expected: FAIL — `No "insertCut" export is defined on the "../multishot-cuts" mock` / `canAddCut is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/nodes/multishot-cuts.ts`, replace the whole `addCut` block (lines 165-181) with:

```ts
/**
 * Insert a 1s cut at `index`, funded by unspent seconds under the ceiling — never by shortening
 * an existing one. `index === cuts.length` appends; an out-of-range index is clamped into
 * [0, cuts.length] rather than producing a hole.
 *
 * Refused when the ladder is already full, and once the model's cut cap is reached — on Kling a
 * 7th cut is a vendor rejection, not a quality hint. `canAddCut` below returns the same two
 * refusals with the sentence to show for each; this function is the enforcement, that one is the
 * explanation, and they must not disagree (their agreement is tested).
 *
 * Every existing cut keeps its object identity, for the same reason `resizeCut` guarantees it:
 * "did this edit touch a neighbour?" should be answerable with `===`.
 *
 * D279 — this REPLACES the append-only `addCut`, which sat here with no caller from 2026-09-03
 * until the Multishot focus view regained its add/remove affordances. The history is in the ADR
 * log, not here.
 */
export function insertCut(
  cuts: MultishotCut[],
  index: number,
  cap: MultishotCapability,
): MultishotCut[] {
  if (headroomOf(cuts, cap) < cap.minCutSeconds) return cuts;
  if (cap.maxCuts !== null && cuts.length >= cap.maxCuts) return cuts;

  const at = Math.max(0, Math.min(Math.round(index), cuts.length));
  return [...cuts.slice(0, at), newCut("", cap.minCutSeconds), ...cuts.slice(at)];
}

/** Append a 1s cut. `insertCut` at the end — the name reads better at the "Add shot" call site. */
export function addCut(cuts: MultishotCut[], cap: MultishotCapability): MultishotCut[] {
  return insertCut(cuts, cuts.length, cap);
}

/**
 * Why `insertCut` would refuse — the sentence half, so the UI never renders a dead control.
 *
 * The ceiling is reported BEFORE the cut cap: it is the one an operator can clear by shortening a
 * shot, and `checkLadder`'s own rule is that only the first violation is stated, because a stacked
 * list reads as a failure rather than as an instruction.
 *
 * This does not hold the invariant — `insertCut` enforces independently. A guard that lives only
 * in a component is a guard the next caller silently skips.
 */
export function canAddCut(cuts: MultishotCut[], cap: MultishotCapability): LadderCheck {
  if (headroomOf(cuts, cap) < cap.minCutSeconds) {
    return {
      ok: false,
      reason: `${cap.maxTotalSeconds}s maximum reached. Shorten a shot to make room.`,
    };
  }
  if (cap.maxCuts !== null && cuts.length >= cap.maxCuts) {
    return { ok: false, reason: `${cap.label} allows ${cap.maxCuts} shots.` };
  }
  return { ok: true };
}
```

Change the import on line 36 to bring in `LadderCheck`:

```ts
import type { MultishotCapability, LadderCheck } from "./multishot-models";
```

Then replace the `removeCut` doc comment's `DEFERRED` paragraph (lines 187-190) with:

```
 * D279 — wired to the Multishot focus view's per-shot "X". It sat here with no caller from
 * 2026-09-04 until then; the history is in the ADR log.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-cuts.test.ts`
Expected: PASS — all tests, including the pre-existing `addCut` block (it still appends through the delegate).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/multishot-cuts.ts src/lib/nodes/__tests__/multishot-cuts.test.ts
git commit -m "$(cat <<'EOF'
feat(multishot): insertCut at a position, and the reason an add is refused

Generalises the append-only addCut, which has had no caller since it was
unwired on 2026-09-03. canAddCut returns the same two refusals with the
sentence to show for each, so the UI never renders a dead control — their
agreement is tested rather than assumed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `planCoverage`

**Files:**
- Modify: `src/lib/nodes/multishot-plan.ts` (append after `setBeatText`, end of file)
- Test: `src/lib/nodes/__tests__/multishot-plan.test.ts`

**Interfaces:**
- Consumes: `MultishotPlan`, `MultishotBeat` (same module); `MultishotCut` from `./multishot-cuts`
- Produces: `planCoverage(plan: MultishotPlan, cuts: MultishotCut[]): { unwritten: string[]; orphaned: string[] }` — both arrays hold **cut ids**, `unwritten` in cut order, `orphaned` in beat order.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/nodes/__tests__/multishot-plan.test.ts`. Add `planCoverage` to that file's existing import from `../multishot-plan`.

```ts
describe("planCoverage", () => {
  const cut = (id: string): MultishotCut => ({ id, text: `shot ${id}`, seconds: 2 });
  const plan = (...beats: [string, string][]): MultishotPlan => ({
    version: 1,
    look: "Warm low sun.",
    beats: beats.map(([cutId, text]) => ({ cutId, text })),
  });

  it("reports nothing when every cut has a written beat", () => {
    expect(planCoverage(plan(["c1", "keys"], ["c2", "cab"]), [cut("c1"), cut("c2")])).toEqual({
      unwritten: [],
      orphaned: [],
    });
  });

  it("reports a cut with no beat at all", () => {
    expect(planCoverage(plan(["c1", "keys"]), [cut("c1"), cut("c2")])).toEqual({
      unwritten: ["c2"],
      orphaned: [],
    });
  });

  // THE CASE THIS FUNCTION EXISTS FOR. renderPlan resolves a missing beat to "", so a blank beat
  // and an absent one produce the identical shipped artifact — an empty shot, billed.
  it("counts a blank beat as unwritten", () => {
    expect(planCoverage(plan(["c1", "keys"], ["c2", "   "]), [cut("c1"), cut("c2")])).toEqual({
      unwritten: ["c2"],
      orphaned: [],
    });
  });

  it("reports a beat whose cut is gone as orphaned, not unwritten", () => {
    expect(planCoverage(plan(["c1", "keys"], ["c9", "gone"]), [cut("c1")])).toEqual({
      unwritten: [],
      orphaned: ["c9"],
    });
  });

  it("reports both at once", () => {
    expect(planCoverage(plan(["c9", "gone"]), [cut("c1"), cut("c2")])).toEqual({
      unwritten: ["c1", "c2"],
      orphaned: ["c9"],
    });
  });

  it("returns unwritten in CUT order, not beat order", () => {
    const result = planCoverage(plan(["c2", "cab"]), [cut("c1"), cut("c2"), cut("c3")]);
    expect(result.unwritten).toEqual(["c1", "c3"]);
  });

  it("treats an empty ladder as covered — checkLadder is what rejects that", () => {
    expect(planCoverage(plan(["c1", "keys"]), [])).toEqual({
      unwritten: [],
      orphaned: ["c1"],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts`
Expected: FAIL — `planCoverage is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/nodes/multishot-plan.ts`:

```ts
/**
 * D279 — does this plan cover this ladder, and does it carry beats the ladder no longer has?
 *
 * The ONE place that question is answered. Derived on every read, never stored, and **the plan is
 * never written from a Multishot-node edit**: the plan lives on a different node in its
 * `node_versions` row, so writing it from the node that owns the cuts would cross a boundary the
 * component does not own, and would trip `planIsDirty` into reporting unsaved edits the operator
 * never made.
 *
 * A BLANK beat counts as unwritten. `renderPlan` resolves a missing beat to `""` (see its
 * `byId.get(cut.id) ?? ""`), so an empty beat and an absent one are the same shipped artifact —
 * an empty shot, billed. A check that distinguished them would pass the case it exists to catch.
 *
 * `orphaned` is reported for DISPLAY and is never an error: `renderPlan` walks the cuts, so a beat
 * whose cut is gone is simply never rendered. This is deliberately narrower than re-running
 * `parsePlan`, which rejects the plan whole on an orphaned beat — that would invalidate a plan
 * that renders perfectly well just because the operator removed a shot.
 */
export function planCoverage(
  plan: MultishotPlan,
  cuts: MultishotCut[],
): { unwritten: string[]; orphaned: string[] } {
  const byId = new Map(plan.beats.map((b) => [b.cutId, b.text]));
  const cutIds = new Set(cuts.map((c) => c.id));
  return {
    // Cut order, not beat order: this drives "Shot 4 has no written prompt", and that number is
    // the cut's position on the ladder.
    unwritten: cuts.filter((c) => !(byId.get(c.id) ?? "").trim()).map((c) => c.id),
    orphaned: plan.beats.filter((b) => !cutIds.has(b.cutId)).map((b) => b.cutId),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/multishot-plan.ts src/lib/nodes/__tests__/multishot-plan.test.ts
git commit -m "$(cat <<'EOF'
feat(multishot): planCoverage — which shots the plan does not write

Derived, never stored: the plan lives on another node's version row, so
the node that owns the cuts must not write it. A BLANK beat counts as
unwritten, because renderPlan resolves a missing beat to "" and the two
ship the identical empty shot.

Orphaned beats are reported but never an error — renderPlan walks the
cuts, so a stale beat is simply not rendered.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The money-path guard, and the copy that stops being true

**Files:**
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts:98-117`
- Modify: `src/lib/nodes/multishot-models.ts:192-197`
- Test: `src/app/api/nodes/[id]/video-generate/route.test.ts`
- Test: `src/lib/nodes/__tests__/multishot-models.test.ts`

**Interfaces:**
- Consumes: `planCoverage` (Task 2); `checkLadder`, `multishotCapabilityFor`, `checkPlanLimits` (existing)
- Produces: nothing new. Behaviour change only.

- [ ] **Step 1: Write the failing tests**

First, in `src/lib/nodes/__tests__/multishot-models.test.ts`, find the existing assertion on the cut-cap reason (grep for `Regroup`) and replace its expected string:

```ts
  it("names the model's cut cap and an action reachable from every surface", () => {
    const seven = Array.from({ length: 7 }, () => ({ seconds: 2 }));
    const result = checkLadder(seven, multishotCapabilityFor(KLING_OMNI_MODEL_ID));
    expect(result.ok).toBe(false);
    // "Regroup the shots on the Script" was the only route before D279. It is not any more, and
    // this sentence renders verbatim on the card, the focus view AND Video Gen's disabled
    // Generate — so it must name something reachable from all three.
    expect(result.ok === false && result.reason).toBe(
      "7 shots · Kling 3.0 Omni allows 6. Remove a shot, or switch the model.",
    );
  });
```

Then append to `src/app/api/nodes/[id]/video-generate/route.test.ts`, inside the existing `describe("POST video-generate — multishot server backstop (D236, D97)")` block:

```ts
  // D279 — the hole this closes: renderPlan and checkPlanLimits both resolve a missing beat to
  // "", so a cut the plan does not cover renders as an EMPTY SHOT, passes every character
  // budget, and is billed. Adding a shot on the Multishot node is the first route that can
  // produce this while the prompt node stays connected.
  it("rejects a ladder the plan does not cover, before any generation is recorded", async () => {
    const threeCuts: MultishotCut[] = [
      { id: "c1", text: "keys", seconds: 5 },
      { id: "c2", text: "cab", seconds: 7 },
      { id: "c3", text: "a shot added after the prompt was written", seconds: 2 },
    ];
    mocks.graph = buildGraph(threeCuts, KLING_OMNI_MODEL_ID, PLAN); // PLAN covers c1 and c2 only

    const res = await post({
      modelId: KLING_OMNI_MODEL_ID,
      params: {},
      imageRoles: { ig: "reference" },
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe(
      "Shot 3 has no written prompt. Re-generate the Multishot Prompt, or write that shot.",
    );

    expect(mocks.insertGeneration).not.toHaveBeenCalled();
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
    expect(mocks.triggerTask).not.toHaveBeenCalled();
  });

  it("names the FIRST uncovered shot when several are uncovered", async () => {
    const fourCuts: MultishotCut[] = [
      { id: "c1", text: "keys", seconds: 4 },
      { id: "cX", text: "added", seconds: 2 },
      { id: "c2", text: "cab", seconds: 4 },
      { id: "cY", text: "also added", seconds: 2 },
    ];
    mocks.graph = buildGraph(fourCuts, KLING_OMNI_MODEL_ID, PLAN);

    const res = await post({
      modelId: KLING_OMNI_MODEL_ID,
      params: {},
      imageRoles: { ig: "reference" },
    });

    const json = await res.json();
    expect(json.error).toContain("Shot 2");
    expect(json.error).not.toContain("Shot 4");
  });

  // An orphaned beat alone is NOT an error — renderPlan walks the cuts, so it is never rendered.
  // Asserted explicitly so a later tightening to parsePlan cannot silently start refusing it.
  it("still generates when the plan carries a beat whose cut was removed", async () => {
    const planWithOrphan: MultishotPlan = {
      ...PLAN,
      beats: [...PLAN.beats, { cutId: "c-removed", text: "a shot that no longer exists" }],
    };
    mocks.graph = buildGraph(LEGAL_KLING_CUTS, KLING_OMNI_MODEL_ID, planWithOrphan);

    const res = await post({
      modelId: KLING_OMNI_MODEL_ID,
      params: {},
      imageRoles: { ig: "reference" },
    });

    expect(res.status).toBe(202);
    expect(mocks.triggerTask).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/api/nodes/[id]/video-generate/route.test.ts" src/lib/nodes/__tests__/multishot-models.test.ts`
Expected: FAIL — the coverage tests return 202 instead of 400 (that IS the bug), and the models test reports the old "Regroup the shots on the Script." wording.

- [ ] **Step 3: Implement**

In `src/lib/nodes/multishot-models.ts`, replace the cut-cap branch of `checkLadder` (lines 192-197):

```ts
  if (cap.maxCuts !== null && cuts.length > cap.maxCuts) {
    return {
      ok: false,
      // D279 — was "Regroup the shots on the Script.", which was the only route before shots
      // could be removed on the node itself. This sentence renders verbatim on the Multishot
      // card, the Multishot focus view and Video Gen's disabled Generate, so it must name an
      // action reachable from all three.
      reason: `${cuts.length} shots · ${cap.label} allows ${cap.maxCuts}. Remove a shot, or switch the model.`,
    };
  }
```

In `src/app/api/nodes/[id]/video-generate/route.ts`, add the import alongside the existing one on line 22:

```ts
import { checkPlanLimits, planCoverage, type MultishotPlan } from "@/lib/nodes/multishot-plan";
```

Then insert this block immediately after the `checkPlanLimits` guard (after line 117's `if (!limits.ok) return apiError(limits.reason, 400);`) and **before** `resolvedParams.duration = totalOf(resolved.cuts);`:

```ts
      // D279 — EVERY CUT MUST HAVE A WRITTEN BEAT.
      //
      // `renderPlan` and `checkPlanLimits` both resolve a missing beat with
      // `byId.get(cut.id) ?? ""`, so a cut the plan does not cover renders as a shot with EMPTY
      // TEXT, passes the character budgets above, and is billed. Neither guard above catches it:
      // `checkLadder` measures seconds and counts, `checkPlanLimits` measures characters, and an
      // empty string is a legal length for both.
      //
      // Sits here with them — above insertGeneration and reserveCredits — for the reason those
      // guards sit here: a rejected request must neither record a generation nor touch the org's
      // credit balance.
      //
      // Orphaned beats are deliberately NOT an error: `renderPlan` walks the cuts, so a beat whose
      // cut was removed is never rendered. Re-running `parsePlan` here instead would reject the
      // plan whole over one, which would refuse a plan that renders perfectly well.
      const coverage = planCoverage(promptNode.activeOutput as MultishotPlan, resolved.cuts);
      if (coverage.unwritten.length > 0) {
        // The FIRST one only, matching checkLadder's own rule: an operator fixes one thing at a
        // time, and a stacked list reads as a failure rather than an instruction.
        const at = resolved.cuts.findIndex((c) => c.id === coverage.unwritten[0]);
        return apiError(
          `Shot ${at + 1} has no written prompt. Re-generate the Multishot Prompt, or write that shot.`,
          400,
        );
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/api/nodes/[id]/video-generate/route.test.ts" src/lib/nodes/__tests__/multishot-models.test.ts`
Expected: PASS.

Then check nothing else asserted the old wording:

Run: `npx vitest run src/lib/nodes src/lib/video-gen`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/nodes/[id]/video-generate/route.ts" "src/app/api/nodes/[id]/video-generate/route.test.ts" src/lib/nodes/multishot-models.ts src/lib/nodes/__tests__/multishot-models.test.ts
git commit -m "$(cat <<'EOF'
fix(multishot): refuse a video request whose plan does not cover every shot

renderPlan and checkPlanLimits both resolve a missing beat to "", so an
uncovered cut renders as an empty shot, passes the character budgets and
gets billed. checkLadder measures seconds, checkPlanLimits measures
characters, and "" is a legal length for both — nothing caught it.

Guard sits with them, above insertGeneration and reserveCredits, so a
refusal costs nothing. Orphaned beats stay legal: renderPlan walks the
cuts, so a removed shot's beat is simply never rendered.

checkLadder's cut-cap reason said "Regroup the shots on the Script",
which stops being the only route in the next commit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The pure draft module

**Files:**
- Create: `src/lib/nodes/multishot-draft.ts`
- Test: `src/lib/nodes/__tests__/multishot-draft.test.ts`

**Interfaces:**
- Consumes: `MultishotCut`, `totalOf` from `./multishot-cuts`
- Produces:
  - `type MultishotDraft = { cuts: MultishotCut[]; targetModel?: string }`
  - `draftIsDirty(saved: MultishotDraft, draft: MultishotDraft): boolean`
  - `commitDraft(draft: MultishotDraft): { cuts: MultishotCut[]; totalSeconds: number; targetModel?: string }`

There is no jsdom and no `@testing-library` in this repo (`vitest.config.ts` sets `environment: "node"`), so the focus view's Save/Cancel behaviour is testable only as a pure module. This is the house pattern, not a workaround — see `src/lib/nodes/delete-confirm.ts`'s own header.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/nodes/__tests__/multishot-draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftIsDirty, commitDraft, type MultishotDraft } from "../multishot-draft";
import { totalOf, type MultishotCut } from "../multishot-cuts";
import { GEMINI_OMNI_MODEL_ID, KLING_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

const cuts = (...seconds: number[]): MultishotCut[] =>
  seconds.map((s, i) => ({ id: `c${i}`, text: `cut ${i + 1}`, seconds: s }));

const draft = (cs: MultishotCut[], targetModel?: string): MultishotDraft => ({
  cuts: cs,
  ...(targetModel !== undefined ? { targetModel } : {}),
});

describe("draftIsDirty", () => {
  it("is false for a freshly seeded draft", () => {
    const saved = draft(cuts(2, 3), GEMINI_OMNI_MODEL_ID);
    expect(draftIsDirty(saved, draft(cuts(2, 3), GEMINI_OMNI_MODEL_ID))).toBe(false);
  });

  it("is true after a shot is added", () => {
    const saved = draft(cuts(2, 3));
    expect(draftIsDirty(saved, draft([...saved.cuts, { id: "new", text: "", seconds: 1 }]))).toBe(
      true,
    );
  });

  it("is true after a shot is removed", () => {
    const saved = draft(cuts(2, 3));
    expect(draftIsDirty(saved, draft(saved.cuts.slice(0, 1)))).toBe(true);
  });

  it("is true after a text edit", () => {
    const saved = draft(cuts(2, 3));
    const edited = saved.cuts.map((c, i) => (i === 0 ? { ...c, text: "new words" } : c));
    expect(draftIsDirty(saved, draft(edited))).toBe(true);
  });

  it("is true after a seconds edit", () => {
    expect(draftIsDirty(draft(cuts(2, 3)), draft(cuts(4, 3)))).toBe(true);
  });

  // D280 — the model is part of the SAME draft, so switching it is an unsaved edit and Cancel
  // reverts it. If this ever reads false, Cancel silently leaves the model changed.
  it("is true after a model switch alone", () => {
    const cs = cuts(2, 3);
    expect(draftIsDirty(draft(cs, GEMINI_OMNI_MODEL_ID), draft(cs, KLING_OMNI_MODEL_ID))).toBe(
      true,
    );
  });

  // `undefined` (parsed before per-shot lines existed) and `[]` (explicitly silent) are different
  // states throughout this module, and the dirty check must not flatten them.
  it("distinguishes an absent voiceover from an empty one", () => {
    const withoutKey: MultishotCut[] = [{ id: "c0", text: "a", seconds: 2 }];
    const withEmpty: MultishotCut[] = [{ id: "c0", text: "a", seconds: 2, voiceover: [] }];
    expect(draftIsDirty(draft(withoutKey), draft(withEmpty))).toBe(true);
  });

  it("sees a voiceover line edit", () => {
    const before: MultishotCut[] = [
      { id: "c0", text: "a", seconds: 2, voiceover: [{ text: "To work.", speaker: "narrator" }] },
    ];
    const after: MultishotCut[] = [
      { id: "c0", text: "a", seconds: 2, voiceover: [{ text: "To bed.", speaker: "narrator" }] },
    ];
    expect(draftIsDirty(draft(before), draft(after))).toBe(true);
  });
});

describe("commitDraft", () => {
  // The node's totalSeconds is a MIRROR of the ladder's length, and canvas-nodes.ts requires
  // every writer of `cuts` to write it in the SAME updateNodeData call. Returning one object is
  // what makes that structurally impossible to forget.
  it("returns cuts, their total and the model in one object", () => {
    const result = commitDraft(draft(cuts(2, 3, 4), KLING_OMNI_MODEL_ID));
    expect(result).toEqual({
      cuts: cuts(2, 3, 4),
      totalSeconds: 9,
      targetModel: KLING_OMNI_MODEL_ID,
    });
  });

  it("keeps totalSeconds equal to totalOf(cuts) for any ladder", () => {
    const cs = cuts(1, 1, 1, 7);
    expect(commitDraft(draft(cs)).totalSeconds).toBe(totalOf(cs));
  });

  // D237 — totalSeconds is a mirror, NOT a correction. An over-window ladder keeps its real
  // length here and checkLadder states the violation; clamping would show one number in large
  // type and contradict it in the red line underneath.
  it("does not clamp an over-window ladder", () => {
    expect(commitDraft(draft(cuts(9, 9))).totalSeconds).toBe(18);
  });

  it("omits targetModel entirely when the draft has none", () => {
    expect("targetModel" in commitDraft(draft(cuts(2)))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-draft.test.ts`
Expected: FAIL — `Failed to resolve import "../multishot-draft"`.

- [ ] **Step 3: Implement**

Create `src/lib/nodes/multishot-draft.ts`:

```ts
// D280 — the Multishot focus view's buffered edits, as data.
//
// Pure (no React) so it is unit testable and the sheet stays a thin presentational shell — the
// same reasoning `delete-confirm.ts` records, and the only option available here: this repo runs
// vitest with `environment: "node"` and has neither jsdom nor @testing-library, so component
// rendering cannot be asserted.
//
// The cut ladder and the target model are ONE draft. The model governs the ceiling every slider
// is measured against, so a model that wrote through while the cuts were buffered would
// re-measure the draft against a ceiling Cancel could not put back.
import { totalOf, type MultishotCut } from "./multishot-cuts";

export type MultishotDraft = {
  cuts: MultishotCut[];
  /** Absent = the default (Gemini Omni), exactly as on MultishotNodeData. */
  targetModel?: string;
};

/**
 * Has the operator edited the ladder since the sheet opened or was last saved?
 *
 * `JSON.stringify`, matching `script-focus-view.tsx` — and deliberately NOT the field-wise
 * comparison `planIsDirty` uses. That function avoids stringify because it compares two
 * independently CONSTRUCTED objects (a server's plan against a client's), where key order and
 * later-added fields make stringify lie. Both sides here descend from the same stored object by
 * structural edits, so key order is stable by construction.
 *
 * Stringify is also what keeps `voiceover: undefined` distinguishable from `voiceover: []` — an
 * absent key and an empty array do not serialise alike — which is a distinction this module
 * maintains everywhere else (see `cutsFromShots`).
 */
export function draftIsDirty(saved: MultishotDraft, draft: MultishotDraft): boolean {
  return JSON.stringify(saved) !== JSON.stringify(draft);
}

/**
 * The node data patch a Save writes — ONE object, passed to a single `updateNodeData` call.
 *
 * `totalSeconds` is the stored mirror of the ladder's own length, and `canvas-nodes.ts` requires
 * every writer of `cuts` to write it in the same call. Returning both from one function is what
 * makes forgetting it structurally impossible rather than a rule to remember.
 *
 * NOT clamped into the model's window (D237): a ladder outside it keeps its real length and
 * `checkLadder` states the violation. Clamping here would make the card read "10s" over a red
 * line saying "14s · Gemini Omni 1.1 allows 10s" — two numbers for one ladder.
 */
export function commitDraft(draft: MultishotDraft): {
  cuts: MultishotCut[];
  totalSeconds: number;
  targetModel?: string;
} {
  return {
    cuts: draft.cuts,
    totalSeconds: totalOf(draft.cuts),
    // Spread rather than assigned: writing `targetModel: undefined` would put the key on the
    // patch and clear a model the operator never touched.
    ...(draft.targetModel !== undefined ? { targetModel: draft.targetModel } : {}),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-draft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/multishot-draft.ts src/lib/nodes/__tests__/multishot-draft.test.ts
git commit -m "$(cat <<'EOF'
feat(multishot): the focus view's buffered draft, as a pure module

The cut ladder and the target model are ONE draft — the model governs the
ceiling every slider is measured against, so a model writing through while
the cuts were buffered would re-measure against a ceiling Cancel could not
put back.

Pure because this repo runs vitest on environment:"node" with no jsdom and
no testing-library, so component rendering cannot be asserted — the same
reasoning delete-confirm.ts records.

commitDraft returns cuts and totalSeconds together, which is what makes
canvas-nodes.ts's "write both in one call" rule structural rather than
something to remember.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire the focus view — Save/Cancel, add, remove

**Files:**
- Modify: `src/components/nodes/multishot-focus-view.tsx` (whole file)
- Modify: `src/components/nodes/multishot-node.tsx:41-70,160-170`

**Interfaces:**
- Consumes: `insertCut`, `canAddCut`, `removeCut`, `resizeCut`, `headroomOf`, `totalOf` (Task 1 + existing); `MultishotDraft`, `draftIsDirty`, `commitDraft` (Task 4); `checkLadder`, `multishotCapabilityFor`, `describeCapability`, `MULTISHOT_MODELS` (existing)
- Produces: `MultishotFocusView` now takes `onCommit: (patch: { cuts: MultishotCut[]; totalSeconds: number; targetModel?: string }) => void` **in place of** `onChange` and `onTargetModelChange`.

This task has no automated test — its logic lives in Tasks 1 and 4, which are tested. Verify by hand per Step 5.

- [ ] **Step 1: Change the node's callback surface**

In `src/components/nodes/multishot-node.tsx`, replace `setCuts` and `setTargetModel` (lines 50-61) with one commit callback:

```tsx
  // D280 — the focus view buffers every edit and commits once. One patch, one updateNodeData
  // call, so `totalSeconds` (the stored mirror of the ladder's length) cannot be written without
  // the `cuts` it mirrors — `commitDraft` builds them together.
  //
  // Replaces the old write-through `setCuts` + `setTargetModel` pair. There is no unbuffered
  // write path left: the card is read-only, so this is the only writer of either field.
  const commit = (patch: ReturnType<typeof commitDraft>) => updateNodeData(id, patch);
```

Add the import:

```tsx
import { commitDraft } from "@/lib/nodes/multishot-draft";
```

**Then fix line 43, or Step 2 spins.** It currently reads `const cuts = d.cuts ?? [];`, which
mints a **new array every render** when `d.cuts` is absent. The focus view's reseed compares
`saved` by reference, so a fresh `[]` each render would reseed the draft forever: render →
new `saved` → `setDraft` → render. A Multishot node with no cuts yet is exactly the case that
hits it. Hoist a shared empty array to module scope, above the component:

```tsx
// Referentially stable: the focus view reseeds its draft when this changes identity, and a
// fresh `[]` on every render would reseed it on every render.
const NO_CUTS: MultishotCut[] = [];
```

and use it:

```tsx
  const cuts = d.cuts ?? NO_CUTS;
```

`MultishotCut` is already imported on line 15 as a type alongside `totalOf`.

Remove the now-unused `totalOf` import **only if** nothing else in the file uses it — line 47 still does (`d.totalSeconds ?? totalOf(cuts)`), so keep it.

Replace the `MultishotFocusView` props (lines 160-170):

```tsx
    <MultishotFocusView
      open={focusViewOpen}
      onOpenChange={handleFocusOpenChange}
      nodeId={id}
      order={d.order}
      cuts={cuts}
      scriptTitle={d.seededFrom?.scriptTitle}
      targetModel={d.targetModel}
      onCommit={commit}
    />
```

Update the file's header comment — the paragraph at lines 26-28 claiming "Add cut is deferred" is now false:

```
 * The card is a read-only preview: the per-cut sliders, text editing and the add/remove
 * affordances all live in `MultishotFocusView`, opened via "Open ↗" or a double-click — the same
 * pattern every other node's focus view uses. D279/D280: shots are added and removed there, and
 * every edit is buffered behind an explicit Save, so this card always shows committed state.
```

- [ ] **Step 2: Swap the focus view onto a draft**

In `src/components/nodes/multishot-focus-view.tsx`, replace the props type and the top of the component:

```tsx
type MultishotFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** This node's id — the guided "Create multishot prompt" action needs a source to wire from. */
  nodeId: string;
  order?: number;
  /** The SAVED ladder. Edits are buffered locally and reach the node only through `onCommit`. */
  cuts: MultishotCut[];
  scriptTitle?: string;
  /** D236 — which model this ladder is built for. Absent = the default (Gemini Omni). */
  targetModel?: string;
  /** D280 — one patch, applied by a single updateNodeData call on Save. */
  onCommit: (patch: ReturnType<typeof commitDraft>) => void;
};
```

Inside the component, replace the derived values (current lines 76-85) with:

```tsx
  const editable = useCanvasEditable();
  const isReadOnly = !editable; // D33: strict read-only under the lock

  const saved: MultishotDraft = useMemo(
    () => ({ cuts, ...(targetModel !== undefined ? { targetModel } : {}) }),
    [cuts, targetModel],
  );
  const [draft, setDraft] = useState<MultishotDraft>(saved);

  // Reseed when the sheet opens or the saved ladder changes underneath. Adjusting state during
  // render is React's documented alternative to a reset effect, and is the same thing
  // script-focus-view.tsx does against its own `seed` sentinel.
  const [seed, setSeed] = useState({ open, saved });
  if (seed.open !== open || seed.saved !== saved) {
    setSeed({ open, saved });
    setDraft(saved);
  }

  // Same shape script-focus-view.tsx uses, `actionLabel` included — one dialog, several callers.
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    actionLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const dirty = draftIsDirty(saved, draft);

  // Everything below reads the DRAFT, so the ladder on screen, the ceiling it is measured
  // against and the violation sentence all describe the same state the operator is looking at.
  const cap = multishotCapabilityFor(draft.targetModel);
  const total = totalOf(draft.cuts);
  const ladder = checkLadder(draft.cuts, cap);
  const addable = canAddCut(draft.cuts, cap);
  const modelItems = Object.fromEntries(MULTISHOT_MODELS.map((m) => [m.id, m.label]));

  const setCuts = (next: MultishotCut[]) => setDraft((d) => ({ ...d, cuts: next }));

  function handleSave() {
    onCommit(commitDraft(draft));
  }

  function requestClose() {
    if (dirty) {
      setConfirm({
        title: "Discard unsaved changes?",
        description: "You have shot edits that haven't been saved. Closing now will discard them.",
        actionLabel: "Discard",
        onConfirm: () => onOpenChange(false),
      });
      return;
    }
    onOpenChange(false);
  }
```

Add the imports:

```tsx
import { useMemo, useState } from "react";
import { canAddCut, insertCut, removeCut, resizeCut, totalOf, type MultishotCut } from "@/lib/nodes/multishot-cuts";
import { commitDraft, draftIsDirty, type MultishotDraft } from "@/lib/nodes/multishot-draft";
import { Plus, X } from "lucide-react";
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

`headroomOf` is no longer imported — `canAddCut` covers the at-ceiling case. Remove it from the import list.

Wire `requestClose` in place of the two direct closes: `<Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>` and the "Back to canvas" button's `onClick={requestClose}`.

- [ ] **Step 3: Header — the pill, Save and Cancel**

Replace the `atCeiling` line's old usage and add to the header's right slot, between the readout and `GuidedNextButton`:

```tsx
                {dirty && (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    Unsaved changes
                  </span>
                )}
                {!isReadOnly && (
                  <>
                    <Button variant="ghost" onClick={() => setDraft(saved)} disabled={!dirty}>
                      Cancel
                    </Button>
                    {/* D280 — Save is a synchronous updateNodeData, not a version write: this
                        node has no node_versions row. So no async, no error path, and no
                        "Saved" toast — the durable write is autosave's and has not happened
                        yet. The pill clearing is the truthful feedback. */}
                    <Button
                      variant={dirty ? "default" : "outline"}
                      onClick={handleSave}
                      disabled={!dirty}
                    >
                      Save
                    </Button>
                  </>
                )}
```

The model `Select` now reads and writes the draft:

```tsx
                  value={cap.id}
                  onValueChange={(v) => setDraft((d) => ({ ...d, targetModel: String(v) }))}
```

Gate `GuidedNextButton` (§9.5). It has no such prop today, so add one first.

In `src/components/canvas/guided-next-button.tsx`, add to the props (after `onNavigate`, line 23):

```tsx
  /**
   * D280 — a confirm to run INSTEAD of navigating. Called in place of the whole click when
   * provided, which is why it gates before `guidedCreateNext`: creating the node and its edges
   * is the side effect, so a confirm that ran after it would be confirming something already
   * done. The caller re-invokes the click path itself once the operator accepts.
   */
  onBeforeNavigate,
}: {
  sourceId: string;
  variant: "chip" | "button";
  onNavigate?: () => void;
  onBeforeNavigate?: () => void;
}) {
```

and make `handleClick` defer to it (replacing lines 45-50):

```tsx
  const handleClick = () => {
    if (onBeforeNavigate) {
      onBeforeNavigate();
      return;
    }
    const id = guidedCreateNext(sourceId);
    if (!id) return;
    onNavigate?.();          // close the current focus view (if any)
    setFocusedNodeId(id);    // open the next node's focus view (D35 seam)
  };
```

Then in the focus view:

```tsx
                <GuidedNextButton
                  sourceId={nodeId}
                  variant="button"
                  onNavigate={() => onOpenChange(false)}
                  onBeforeNavigate={
                    dirty
                      ? () =>
                          setConfirm({
                            title: "Discard unsaved shot edits?",
                            description:
                              "The Multishot Prompt will be written against the shots as they were last saved.",
                            actionLabel: "Continue",
                            // Discarding here means closing the sheet on the saved ladder; the
                            // operator then takes the guided step again from the card.
                            onConfirm: () => onOpenChange(false),
                          })
                      : undefined
                  }
                />
```

- [ ] **Step 4: The strip — `+`, `X`, and the Add shot chip**

Replace the two violation lines above the `<ol>` with one block that also carries the add refusal:

```tsx
            {!ladder.ok && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} />
                {ladder.reason}
              </p>
            )}
            {ladder.ok && !addable.ok && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} />
                {addable.reason}
              </p>
            )}
```

Every `cuts.map(...)` and `onChange(...)` inside the `<ol>` becomes `draft.cuts.map(...)` and `setCuts(...)`. Give the `<li>` a hover group and put the controls in the `Shot N` row:

```tsx
              {draft.cuts.map((cut, i) => (
                <li key={cut.id} className="group/shot flex min-w-0 flex-col gap-2">
                  <div className="flex min-h-[9rem] flex-1 flex-col gap-1.5 rounded-xl border border-border bg-card p-3.5 shadow-card">
                    {/* The controls share the Shot N row and appear on hover — the VoLinesEditor
                        idiom, for the same reason: a six-shot strip should read as six shots,
                        not as twelve buttons. */}
                    <div className="flex shrink-0 items-center justify-between gap-1">
                      <span className="text-eyebrow text-muted-foreground">Shot {i + 1}</span>
                      {!isReadOnly && (
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/shot:opacity-100">
                          <Button
                            variant="ghost"
                            aria-label={`Insert a shot after shot ${i + 1}`}
                            disabled={!addable.ok}
                            onClick={() => setCuts(insertCut(draft.cuts, i + 1, cap))}
                            className="nodrag h-auto rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted"
                          >
                            <Plus className="size-3" strokeWidth={1.5} />
                          </Button>
                          {/* A single-shot ladder shows no X: removeCut refuses the last cut,
                              and a control that does nothing is worse than no control. */}
                          {draft.cuts.length > 1 && (
                            <Button
                              variant="ghost"
                              aria-label={`Remove shot ${i + 1}`}
                              onClick={() => setCuts(removeCut(draft.cuts, i))}
                              className="nodrag h-auto rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted"
                            >
                              <X className="size-3" strokeWidth={1.5} />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
```

Close that `<div>` where the old `<span className="text-eyebrow shrink-0 …">Shot {i + 1}</span>` used to end, and leave the description scroller, the voiceover lane and the slider exactly as they are apart from the `draft.cuts` / `setCuts` swap.

After the `</ol>`, add the append chip:

```tsx
            {!isReadOnly && (
              <Button
                variant="ghost"
                onClick={() => setCuts(insertCut(draft.cuts, draft.cuts.length, cap))}
                disabled={!addable.ok}
                className="nodrag h-auto w-fit rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-primary hover:border-primary/60 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5"
              >
                <Plus className="size-4" strokeWidth={1.5} /> Add shot
              </Button>
            )}
```

Finally, render the confirm dialog **after `</SheetContent>`, as a sibling inside `<Sheet>`** —
this is exactly where `script-focus-view.tsx:392` puts its own, and nesting it inside the sheet
content instead would put a portaled dialog inside the scroll container it is meant to sit above:

```tsx
      </SheetContent>

      <AlertDialog
        open={!!confirm}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirm(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.onConfirm();
                setConfirm(null);
              }}
            >
              {confirm?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
```

- [ ] **Step 5: Verify by hand**

Run: `npm run lint` — expected: no new errors.
Run: `npx tsc --noEmit` — expected: no errors. (If the repo has no `tsc` script, this is still the right check; `next build` also surfaces them but is far slower.)
Run: `npx vitest run src/lib/nodes` — expected: PASS.

Then `npm run dev:next`, open a canvas with a Multishot node, and confirm:
1. Hovering a shot card reveals `+` and `X`; the last-remaining shot shows no `X`.
2. `+` on shot 1 inserts a new empty shot at position 2 and everything renumbers.
3. "Unsaved changes" appears; the node card behind the sheet still shows the **old** shot count.
4. Cancel restores the original ladder and clears the pill.
5. Re-add, then Save — the card updates and the pill clears, with no toast.
6. Switch the model with no other edit — the pill appears; Cancel puts the model back.
7. Fill the ladder to the ceiling — both `+` and the chip disable and the reason line appears.
8. Close the sheet with edits pending — the discard confirm appears.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/multishot-focus-view.tsx src/components/nodes/multishot-node.tsx src/components/canvas/guided-next-button.tsx
git commit -m "$(cat <<'EOF'
feat(multishot): add and remove shots on the node, behind Save/Cancel

Per-card + inserts after that shot and X removes it; a dashed chip appends.
Without reorder, insert-after is what keeps a shot that belongs at position
2 from sending the operator back to the Script — which was the whole
complaint.

Every edit, including the model, is buffered: the node card and the
connected Multishot Prompt keep showing the committed ladder until Save.
Cancel is also what makes a removal recoverable — the canvas has no undo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Surface an unwritten shot in the prompt view

**Files:**
- Modify: `src/components/nodes/multishot-prompt-focus-view.tsx:723-786`

**Interfaces:**
- Consumes: `planCoverage` (Task 2)
- Produces: nothing new.

The route already refuses (Task 3). This makes the refusal visible *before* the operator clicks Generate on Video Gen.

- [ ] **Step 1: Compute coverage**

Add the import to the existing `@/lib/nodes/multishot-plan` import line, then beside `beatRows` (after line 284):

```tsx
  // D279 — which cuts this plan does not write. The same function the video-generate route
  // enforces with, so this panel and that refusal cannot describe the ladder differently.
  //
  // Reads the SAVED cuts — the Multishot focus view buffers its own edits (D280), so a
  // half-finished ladder never reaches here and "not written yet" always names a real,
  // committed gap rather than an edit in progress.
  const unwritten = useMemo(
    () => new Set(planDraft ? planCoverage(planDraft, cuts).unwritten : []),
    [planDraft, cuts],
  );
```

- [ ] **Step 2: Mark the uncovered shot cards**

In the input column's `cuts.map((cut, i) => …)` (line 738), add after the `<p>` holding `cut.text`:

```tsx
                                {unwritten.has(cut.id) && (
                                  <p className="mt-1.5 flex items-center gap-1 text-[0.7rem] text-destructive">
                                    <TriangleAlert className="size-3 shrink-0" strokeWidth={1.5} />
                                    Not written yet — re-generate, or write this shot.
                                  </p>
                                )}
```

Import `TriangleAlert` from `lucide-react` if the file does not already.

- [ ] **Step 3: State it once above Generate**

Above the Generate `<Button>` (line 773), inside its wrapper `<div>`:

```tsx
                      {unwritten.size > 0 && (
                        <p className="mb-2 text-[0.7rem] text-destructive">
                          {unwritten.size} shot{unwritten.size === 1 ? "" : "s"} have no written
                          prompt. Video Gen will refuse until they do.
                        </p>
                      )}
```

Generate itself stays enabled — re-generating is the fix, and blocking the fix on the problem it fixes is a deadlock. Do **not** add `unwritten.size` to its `disabled` expression.

- [ ] **Step 4: Verify**

Run: `npm run lint` and `npx tsc --noEmit` — expected: clean.

By hand: add a shot on a Multishot node that already has a generated prompt, Save, then open the Multishot Prompt focus view. The new shot's card reads "Not written yet", the line above Generate counts it, and Generate is still clickable. Then try Video Gen's Generate — it refuses with the Task 3 sentence.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/multishot-prompt-focus-view.tsx
git commit -m "$(cat <<'EOF'
feat(multishot): show which shots the prompt has not written

Same planCoverage the video-generate route refuses on, so the panel and
the refusal cannot describe the ladder differently.

Generate stays enabled: re-generating IS the fix, and blocking the fix on
the problem it fixes is a deadlock. Only the video path refuses.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Record D279 and D280

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7 (append after D278, currently the last entry at line ~5691)

**Interfaces:** none.

AGENTS.md: **keep one ADR log.** Append in place; do not scatter these into the feature spec.

- [ ] **Step 1: Append both decisions**

```markdown
### D279 — Shots are added and removed on the Multishot node; the plan's coverage is checked, not synced *(recorded 2026-09-23; refines D230, D231, D235; reverses the 2026-09-03 and 2026-09-04 UI removals)*

**Decision.** The Multishot focus view regains per-shot add and remove. `addCut`/`removeCut` had
sat in `multishot-cuts.ts` with no caller since those two operator requests, tested but unwired;
they are now `insertCut` (position-aware) plus `canAddCut` (the refusal's sentence). The Multishot
Prompt's plan is joined to the ladder by `cutId`, and that join is **verified at the boundary** —
`planCoverage`, enforced on the video-generate route above `insertGeneration` and
`reserveCredits` — rather than kept in lockstep by writes.

**Why.** Changing a clip's shot count meant editing the Script, re-parsing and re-fanning-out: a
detour through the document that governs every other generation on the canvas, to change one clip.
The Script document has had "Add shot"/"Remove shot" the whole time; the node that actually owns
the ladder did not.

The coverage guard is what makes this safe. `renderPlan` and `checkPlanLimits` both resolve a beat
with `byId.get(cut.id) ?? ""`, so a cut the plan does not cover renders as a shot with **empty
text**, passes every character budget, and is billed. `checkLadder` measures seconds and counts;
`checkPlanLimits` measures characters; `""` is legal for both. Not reachable before this change —
the only other route that alters cut count, `setGenerationMode`, drops the node's outgoing edges
in the same transaction, so the prompt is disconnected and `resolve-prompt` hard-errors instead.

**Rejected.** *Mutating the plan at edit time* — a cross-node write into another node's
`node_versions` row, which also trips `planIsDirty` into reporting unsaved edits the operator never
made. *A `cutsRevision` stamp* — says "stale" without saying which shot, and a text-only edit bumps
it, producing false staleness. *Re-running `parsePlan` on the money path* — it rejects the plan
whole on an orphaned beat, so removing a shot would invalidate a plan that renders fine. *Reorder
and duplicate* — not asked for; insert-after covers the case reorder would have served here.

**Also.** `checkLadder`'s cut-cap reason no longer ends "Regroup the shots on the Script." It
renders verbatim on the card, the focus view and Video Gen's disabled Generate, so it now names an
action reachable from all three.

**Originated →** `docs/superpowers/specs/2026-09-23-multishot-shot-editing-design.md`

### D280 — The Multishot focus view buffers its edits behind Save/Cancel, and its Save is a store write, not a version write *(recorded 2026-09-23; refines D230, D279)*

**Decision.** Every edit the Multishot focus view makes — cut text, voiceover, seconds, add,
remove, **and the target model** — is buffered in one draft and committed by an explicit Save,
following `script-focus-view.tsx`'s draft / dirty / discard-on-close pattern. The draft logic is a
pure module (`src/lib/nodes/multishot-draft.ts`), not component state logic.

**Why.** The model governs the ceiling every slider is measured against, so a model that wrote
through while the cuts were buffered would re-measure the draft against a ceiling Cancel could not
put back — hence one draft, not two.

Unlike every other buffered-Save view in the app (script, prompt, video-prompt, multishot-prompt),
the Multishot node has **no `node_versions` row**: its cuts live in node `data`, persisted by
canvas autosave. So Save is a synchronous `updateNodeData` — no `await`, no failure path, and
deliberately **no "Saved" toast**, because the durable write is autosave's and has not happened at
that moment. The pill clearing and the card updating are the truthful feedback.

Cancel also supersedes D279's acceptance of unrecoverable shot removal: the canvas has no undo
(`src/lib/post/history.ts` is the post editor's alone), so before this a removed shot took its
voiceover lines with it for good. A removal is now revertible up to Save, which is why no per-shot
confirm is added.

**Rejected.** *Keeping the model select immediate* — Cancel would silently not revert it. *A
per-shot delete confirm* — friction the Script's own "Remove shot" X does not impose, and
unnecessary once Cancel exists. *Render-testing the view* — this repo runs vitest on
`environment: "node"` with neither jsdom nor `@testing-library`, so the logic was extracted to a
pure module instead, as `delete-confirm.ts` already does for the node delete dialog.

**Originated →** `docs/superpowers/specs/2026-09-23-multishot-shot-editing-design.md`
```

- [ ] **Step 2: Verify the numbering**

Run: `grep -n "^### D27[5-9]\|^### D28" docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`
Expected: D279 and D280 appear once each, after D278. (§7 already contains duplicate numbers from two merged logs — D270–D273 appear twice. Do not renumber anything; just do not add a *third* D279.)

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "$(cat <<'EOF'
docs(adr): D279, D280 — shots are edited on the Multishot node

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verification

After Task 7, run the affected directories rather than the full suite (the full run has ~11 known timeout flakes in API route tests that pass in isolation):

```bash
npx vitest run src/lib/nodes
npx vitest run "src/app/api/nodes/[id]"
npm run lint
npx tsc --noEmit
```

Expected: all pass, no new lint errors, no type errors.
