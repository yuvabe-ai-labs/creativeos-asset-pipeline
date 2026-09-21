# Refine with AI — Multishot Prompt node — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator steer a rewrite of the look block, any single beat, or the whole plan by typing an ephemeral note into a popover, instead of only being able to re-run and hope.

**Architecture:** The route gains `scope` (`"all" | "look" | "cut"`) and `note`. Each scope asks the model for **only the fragment being rewritten** against a narrow JSON schema, and the route merges that fragment into the plan the client supplied, validates the merged whole with `parsePlan`, and only then writes the version. Other beats are untouched by construction rather than by instruction. The UI is one shared popover component used in three places.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, shadcn/Base UI (`render` prop, never `asChild`), Tailwind v4, OpenAI structured outputs.

**Spec:** `docs/superpowers/specs/2026-09-04-multishot-refine-with-ai-design.md`

## Global Constraints

- **Controls are shadcn primitives only** — `Button`, `Textarea`, `Popover` from `src/components/ui/*`. Never a raw `<button>`, `<textarea>` or `<input>`. Base UI composes via the `render` prop, **not** `asChild`.
- **Never run bare `npx vitest run`** — there are ~11 unrelated pre-existing timeout flakes in API-route tests. Run per-directory: `npx vitest run src/lib src/prompts src/components src/app`.
- **Never use destructive git commands** — no `git checkout`, `git restore`, `git stash`, `git reset`, `git clean`, on any path, ever. Stage only named files by explicit path; never `git add -A` or `git add .`.
- **`npx tsc --noEmit` must be clean.** It reports pre-existing errors only in `.next/types/validator.ts`; filter those out and treat anything under `src/` as a failure.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Import, don't redefine. `parsePlan`, `renderPlan`, `MultishotPlan`, `MultishotCut` already exist — use them.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/nodes/multishot-plan.ts` **(modify)** | Add `mergeRefinedPlan` beside `parsePlan` — merge a narrow fragment into a plan and validate the whole. |
| `src/lib/nodes/refine-suggestions.ts` **(create)** | The three suggestion-chip catalogs. Data only, no React. |
| `src/prompts/multishot-prompt-generate.ts` **(modify)** | Two narrow schemas + `refineInstruction()`. System prompt is shared and unchanged. |
| `src/app/api/nodes/[id]/multishot-prompt/route.ts` **(modify)** | Accept `scope`/`note`/`cutId`; pick schema; merge; validate; record. |
| `src/components/nodes/refine-with-ai.tsx` **(create)** | The Sparkles → popover → chips → textarea control. One component, three uses. |
| `src/components/nodes/multishot-beat-card.tsx` **(modify)** | Render `RefineWithAI` beside the existing re-run. |
| `src/components/nodes/multishot-prompt-focus-view.tsx` **(modify)** | Look-card and header controls, `refining` state, wire the new route fields, flip the feature flag on. |

---

### Task 1: `mergeRefinedPlan`

The pure merge. Everything else depends on it, and it is where "other beats are untouched" is actually guaranteed.

**Files:**
- Modify: `src/lib/nodes/multishot-plan.ts`
- Test: `src/lib/nodes/__tests__/multishot-plan.test.ts`

**Interfaces:**
- Consumes: `parsePlan(raw, cuts)`, `MultishotPlan`, `MultishotCut` — all already in this file.
- Produces: `mergeRefinedPlan(plan: MultishotPlan, scope: "look" | "cut", fragment: PlanFragment, cutId: string | undefined, cuts: MultishotCut[]) => PlanParseResult` and `type PlanFragment = { look?: string; text?: string }`, both used by Task 4. It takes the cut list because merge and validation are one step — there is no window in which an unvalidated merged plan exists.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/nodes/__tests__/multishot-plan.test.ts`:

```ts
import { mergeRefinedPlan } from "../multishot-plan";

describe("mergeRefinedPlan", () => {
  const plan: MultishotPlan = {
    version: 1,
    look: "Late afternoon, warm low sun.",
    beats: [
      { cutId: "c1", text: "Tight on a hand lifting keys." },
      { cutId: "c2", text: "A cab door swings open." },
      { cutId: "c3", text: "Feet hit the street." },
    ],
  };

  it("replaces only the look", () => {
    const out = mergeRefinedPlan(plan, "look", { look: "Overcast, flat and soft." }, undefined, cuts);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plan.look).toBe("Overcast, flat and soft.");
    expect(out.plan.beats).toEqual(plan.beats);
  });

  // The whole point of the narrow schema: a beat the operator hand-edited cannot be touched by a
  // rewrite of a different beat, because the model was never asked for it.
  it("replaces only the named beat and leaves the others identical", () => {
    const out = mergeRefinedPlan(plan, "cut", { text: "A palm sweeps keys off oak." }, "c2", cuts);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plan.beats[1].text).toBe("A palm sweeps keys off oak.");
    expect(out.plan.beats[0].text).toBe(plan.beats[0].text);
    expect(out.plan.beats[2].text).toBe(plan.beats[2].text);
    expect(out.plan.look).toBe(plan.look);
  });

  it("rejects a cut merge with no cutId", () => {
    const out = mergeRefinedPlan(plan, "cut", { text: "x" }, undefined, cuts);
    expect(out).toEqual({ ok: false, reason: "No shot was named for this rewrite." });
  });

  it("rejects a cutId that is not in the cuts", () => {
    const out = mergeRefinedPlan(plan, "cut", { text: "x" }, "nope", cuts);
    expect(out.ok).toBe(false);
  });

  it("rejects an empty fragment", () => {
    expect(mergeRefinedPlan(plan, "look", { look: "   " }, undefined, cuts).ok).toBe(false);
    expect(mergeRefinedPlan(plan, "cut", { text: "  " }, "c1", cuts).ok).toBe(false);
  });

  // The merged whole goes through parsePlan, so a plan whose cut list changed underneath the
  // operator fails here rather than being written with a beat missing.
  it("rejects when the cuts no longer match the plan", () => {
    const fewer: MultishotCut[] = [{ id: "c1", text: "keys", seconds: 2 }];
    expect(mergeRefinedPlan(plan, "look", { look: "New look." }, undefined, fewer).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts`
Expected: FAIL — `mergeRefinedPlan is not a function` / no exported member.

- [ ] **Step 3: Implement**

Append to `src/lib/nodes/multishot-plan.ts`:

```ts
/** What a narrow refine returns: one of the two, never both. */
export type PlanFragment = { look?: string; text?: string };

/**
 * Merge a narrowly-scoped rewrite into an existing plan, then validate the whole.
 *
 * A `"look"` or `"cut"` refine asks the model for ONLY the fragment being rewritten, so the beats
 * it did not touch are untouched by CONSTRUCTION — there is nothing to drift. This replaces asking
 * for the whole plan with "leave the rest unchanged", which is an instruction models drift on, and
 * whose drift silently overwrote beats the operator had hand-edited.
 *
 * Returns `PlanParseResult` rather than a plan so a merge that cannot be validated is refused
 * through the same path a bad generation already takes — and so the merged whole is checked against
 * the cuts, which is what keeps a narrow edit from producing a plan that disagrees with the budget.
 */
export function mergeRefinedPlan(
  plan: MultishotPlan,
  scope: "look" | "cut",
  fragment: PlanFragment,
  cutId: string | undefined,
  cuts: MultishotCut[],
): PlanParseResult {
  if (scope === "look") {
    const look = (fragment.look ?? "").trim();
    if (!look) return { ok: false, reason: "The writer returned an empty look." };
    return parsePlan({ ...plan, look }, cuts);
  }

  if (!cutId) return { ok: false, reason: "No shot was named for this rewrite." };
  const text = (fragment.text ?? "").trim();
  if (!text) return { ok: false, reason: "The writer returned an empty shot." };
  if (!plan.beats.some((b) => b.cutId === cutId)) {
    return { ok: false, reason: "That shot is not in this plan." };
  }

  return parsePlan(
    { ...plan, beats: plan.beats.map((b) => (b.cutId === cutId ? { ...b, text } : b)) },
    cuts,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.next/types"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nodes/multishot-plan.ts src/lib/nodes/__tests__/multishot-plan.test.ts
git commit -m "feat(multishot): mergeRefinedPlan — a narrow rewrite merged and validated whole

A look or beat refine asks the model for only the fragment being rewritten, so the
beats it did not touch are untouched by construction. Replaces asking for the whole
plan with 'leave the rest unchanged' — an instruction models drift on, whose drift
silently overwrote hand-edited beats.

Returns PlanParseResult so a merge that cannot be validated is refused through the same
path a bad generation takes, and the merged whole is checked against the cuts.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Suggestion catalogs

**Files:**
- Create: `src/lib/nodes/refine-suggestions.ts`
- Test: `src/lib/nodes/__tests__/refine-suggestions.test.ts`

**Interfaces:**
- Produces: `REFINE_SUGGESTIONS: Record<RefineScope, string[]>` and `type RefineScope = "all" | "look" | "cut"`, used by Tasks 5–7.

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/__tests__/refine-suggestions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { REFINE_SUGGESTIONS, type RefineScope } from "../refine-suggestions";

const SCOPES: RefineScope[] = ["all", "look", "cut"];

describe("REFINE_SUGGESTIONS", () => {
  it("covers every scope with unique, non-empty chips", () => {
    for (const scope of SCOPES) {
      const chips = REFINE_SUGGESTIONS[scope];
      expect(chips.length).toBeGreaterThan(2);
      expect(new Set(chips).size).toBe(chips.length);
      for (const chip of chips) expect(chip.trim()).not.toBe("");
    }
  });

  // Short enough to read as a chip rather than wrapping over three lines.
  it("keeps every chip short", () => {
    for (const scope of SCOPES) {
      for (const chip of REFINE_SUGGESTIONS[scope]) expect(chip.length).toBeLessThanOrEqual(30);
    }
  });

  // A steer names a change to a physical property the writer can act on. "Cinematic" is a mood
  // the model cannot execute — the same check LOOK_PRESETS already carries.
  it("carries no hype adjectives", () => {
    for (const scope of SCOPES) {
      for (const chip of REFINE_SUGGESTIONS[scope]) {
        expect(chip).not.toMatch(/cinematic|stunning|ultra realistic|8K|epic/i);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/refine-suggestions.test.ts`
Expected: FAIL — cannot find module `../refine-suggestions`.

- [ ] **Step 3: Implement**

Create `src/lib/nodes/refine-suggestions.ts`:

```ts
// Starting points for a Refine with AI note — a phrase to edit, not a button to fire.
//
// Each names a change to a PHYSICAL property the writer can act on: light direction, shot size,
// pace, how much of the frame the product takes. "Make it cinematic" is a mood, and a mood is
// exactly what the look block's own guidance forbids, so it would be a suggestion to write a
// worse prompt.

export type RefineScope = "all" | "look" | "cut";

export const REFINE_SUGGESTIONS: Record<RefineScope, string[]> = {
  // The whole plan: pace and emphasis, the two things that read across every beat.
  all: [
    "Punchier, faster cuts",
    "Calmer, longer holds",
    "Less product, more life",
    "Simpler — one idea per shot",
  ],
  // The look: the repeatable physical facts the block is supposed to be made of.
  look: [
    "Warmer, lower sun",
    "Overcast and soft",
    "Tighter lens feel",
    "Less contrast",
  ],
  // One beat: framing, movement, and whether the product actually reads.
  cut: [
    "Tighter framing",
    "Slower camera move",
    "Read the product clearly",
    "Different angle",
  ],
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/refine-suggestions.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/refine-suggestions.ts src/lib/nodes/__tests__/refine-suggestions.test.ts
git commit -m "feat(multishot): suggestion chips for Refine with AI

Each names a change to a physical property the writer can act on, not a mood — the look
block's own guidance forbids mood words, so a 'make it cinematic' chip would be a
suggestion to write a worse prompt.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Narrow schemas and the refine instruction

**Files:**
- Modify: `src/prompts/multishot-prompt-generate.ts`
- Test: `src/prompts/__tests__/multishot-prompt-generate.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MULTISHOT_LOOK_SCHEMA`, `MULTISHOT_BEAT_SCHEMA`, `refineInstruction(args)`. Used by Task 4.

- [ ] **Step 1: Write the failing tests**

Append to `src/prompts/__tests__/multishot-prompt-generate.test.ts`:

```ts
import {
  MULTISHOT_LOOK_SCHEMA,
  MULTISHOT_BEAT_SCHEMA,
  refineInstruction,
} from "../multishot-prompt-generate";

describe("narrow refine schemas", () => {
  it("the look schema asks for the look alone", () => {
    expect(MULTISHOT_LOOK_SCHEMA.required).toEqual(["look"]);
    expect(MULTISHOT_LOOK_SCHEMA.additionalProperties).toBe(false);
    expect(Object.keys(MULTISHOT_LOOK_SCHEMA.properties)).toEqual(["look"]);
  });

  it("the beat schema asks for the text alone", () => {
    expect(MULTISHOT_BEAT_SCHEMA.required).toEqual(["text"]);
    expect(MULTISHOT_BEAT_SCHEMA.additionalProperties).toBe(false);
    expect(Object.keys(MULTISHOT_BEAT_SCHEMA.properties)).toEqual(["text"]);
  });
});

describe("refineInstruction", () => {
  const plan = { version: 1 as const, look: "Warm low sun.", beats: [{ cutId: "c1", text: "Keys." }] };

  it("names the beat being rewritten and carries the plan as context", () => {
    const out = refineInstruction({ scope: "cut", cutId: "c1", note: "", plan });
    expect(out).toContain("c1");
    expect(out).toContain("Warm low sun.");
    expect(out).toMatch(/only the text for that shot/i);
  });

  it("asks for the look alone on a look refine", () => {
    const out = refineInstruction({ scope: "look", cutId: null, note: "", plan });
    expect(out).toMatch(/only the look/i);
  });

  // A one-off steer and a permanent brief are different things. Folding the note into the standing
  // instruction would make "try it darker" part of the shot's definition on every later generate.
  it("puts the note in its own block, only when there is one", () => {
    const withNote = refineInstruction({ scope: "look", cutId: null, note: "colder", plan });
    expect(withNote).toContain("Apply this change, and only this change: colder");

    const without = refineInstruction({ scope: "look", cutId: null, note: "   ", plan });
    expect(without).not.toContain("Apply this change");
  });

  it("returns nothing for a full generate", () => {
    expect(refineInstruction({ scope: "all", cutId: null, note: "punchier", plan })).toBe("");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/prompts/__tests__/multishot-prompt-generate.test.ts`
Expected: FAIL — no exported member `MULTISHOT_LOOK_SCHEMA`.

- [ ] **Step 3: Implement**

Append to `src/prompts/multishot-prompt-generate.ts` (after the existing `SCHEMA`, before `multishotPromptGenerate`):

```ts
/**
 * The narrow schemas a REFINE asks against.
 *
 * A refine rewrites one thing, so it asks for one thing. The system prompt is shared and unchanged
 * — the writer needs the same ladder guidance, physics, avoid-list and reference rules whatever it
 * is rewriting; only the shape of the answer differs.
 */
export const MULTISHOT_LOOK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["look"],
  properties: {
    look: {
      type: "string",
      description:
        "One paragraph of look and atmosphere governing every beat: light direction, time of day, lens feel, palette, ground, grade. Repeatable physical facts only.",
    },
  },
} as const;

export const MULTISHOT_BEAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: {
    text: {
      type: "string",
      description:
        "What happens in this one shot: subject, action, framing and camera movement. No timecodes, no durations, no shot numbers.",
    },
  },
} as const;

/**
 * The closing block appended to the user turn on a refine.
 *
 * The current plan travels as context so a rewritten beat still cuts against its neighbours, and
 * a rewritten look is still recognisably this film. The operator's note is its OWN block: a
 * one-off steer and a standing brief are different things, and a model that cannot tell them apart
 * treats "try it darker" as part of the shot's definition forever after.
 */
export function refineInstruction(args: {
  scope: "all" | "look" | "cut";
  cutId: string | null;
  note: string;
  plan: { look: string; beats: Array<{ cutId: string; text: string }> };
}): string {
  const { scope, cutId, note, plan } = args;
  if (scope === "all") return "";

  const blocks: string[] = [`The current plan is below.\n\n${JSON.stringify(plan, null, 2)}`];

  blocks.push(
    scope === "look"
      ? "Rewrite ONLY the look block, so the beats below it still make sense under it. Return only the look."
      : `Rewrite ONLY the beat whose cutId is ${cutId}, so it still cuts against the beats either side of it. Return only the text for that shot.`,
  );

  const trimmed = note.trim();
  if (trimmed) {
    blocks.push(
      `Apply this change, and only this change: ${trimmed}\n\nEverything else stays as it is.`,
    );
  }

  return `\n\n${blocks.join("\n\n")}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/prompts/__tests__/multishot-prompt-generate.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/prompts/multishot-prompt-generate.ts src/prompts/__tests__/multishot-prompt-generate.test.ts
git commit -m "feat(multishot): narrow refine schemas and the refine instruction block

A refine rewrites one thing, so it asks for one thing. The system prompt is shared and
unchanged — the writer needs the same ladder guidance, physics and reference rules
whatever it rewrites; only the shape of the answer differs.

The operator's note is its own block. A one-off steer and a standing brief are
different things, and a model that cannot tell them apart treats 'try it darker' as
part of the shot's definition on every later generate.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Route — scope, note, merge

**Files:**
- Modify: `src/app/api/nodes/[id]/multishot-prompt/route.ts`

**Interfaces:**
- Consumes: `mergeRefinedPlan` (Task 1); `MULTISHOT_LOOK_SCHEMA`, `MULTISHOT_BEAT_SCHEMA`, `refineInstruction` (Task 3).
- Produces: the request contract Task 7 posts to — `{ instruction, slices, cutInstructions, scope, note, cutId, plan }`.

- [ ] **Step 0: Write the failing route tests**

Create `src/app/api/nodes/[id]/multishot-prompt/route.test.ts`. The mock list follows the existing
pattern in `src/app/api/clients/[id]/market/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MultishotPlan } from "@/lib/nodes/multishot-plan";

vi.mock("server-only", () => ({}));

const CUTS = [
  { id: "c1", text: "keys", seconds: 2 },
  { id: "c2", text: "cab", seconds: 2 },
];
const PLAN: MultishotPlan = {
  version: 1,
  look: "Warm low sun from camera-left.",
  beats: [
    { cutId: "c1", text: "Tight on a hand lifting keys." },
    { cutId: "c2", text: "A cab door swings open." },
  ],
};

// withNode hands the handler (nodeId, node, caller, clientId, orgId) once auth has passed.
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>(
    "@/lib/api/route-helpers",
  );
  return {
    ...actual,
    withNode: (
      req: Request,
      _params: unknown,
      fn: (
        nodeId: string,
        node: unknown,
        caller: { userId: string; email: string },
        clientId: string,
        orgId: string,
      ) => Promise<Response>,
    ) => fn("node-1", {}, { userId: "u1", email: "u@x.com" }, "client-1", "org-1"),
  };
});

vi.mock("@/lib/nodes/resolve-inputs", () => ({
  resolveMultishotPromptInputs: vi.fn(async () => ({
    clientContext: "",
    kbVersionId: null,
    slices: [],
    upstream: [],
    cuts: CUTS,
  })),
  buildMultishotUserTurn: vi.fn(() => "USER TURN"),
}));

vi.mock("@/lib/db/versions", () => ({ insertVersion: vi.fn(async () => ({ id: "v1" })) }));

// runPromptGeneration owns reserve -> call -> settle -> version. The tests care about what the
// route hands it, so it runs `call()` and reports back.
const runPromptGeneration = vi.fn(
  async (args: { call: () => Promise<{ output: unknown }>; paramsUsed: Record<string, unknown> }) => {
    const { output } = await args.call();
    return { output, versionId: "v1" };
  },
);
vi.mock("@/lib/api/prompt-run", () => ({
  runPromptGeneration: (a: never) => runPromptGeneration(a),
  CreditLimitError: class extends Error {},
}));

const create = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ chat: { completions: { create } } }) }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "node-1" }),
  });

const returns = (obj: unknown) =>
  create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(obj) } }], usage: null });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST multishot-prompt — refine scopes", () => {
  it("400s a cut refine with no cutId", async () => {
    const res = await post({ scope: "cut", plan: PLAN });
    expect(res.status).toBe(400);
  });

  it("400s a cut refine naming a shot that is not on the node", async () => {
    const res = await post({ scope: "cut", cutId: "nope", plan: PLAN });
    expect(res.status).toBe(400);
  });

  it("400s a scoped refine with no plan to refine", async () => {
    const res = await post({ scope: "look" });
    expect(res.status).toBe(400);
  });

  it("400s a note over the cap", async () => {
    const res = await post({ scope: "look", plan: PLAN, note: "x".repeat(2001) });
    expect(res.status).toBe(400);
  });

  // The narrow schema plus the server-side merge: the model returns ONE beat's text, and the
  // beats it was never asked about come back exactly as they were sent.
  it("merges a cut refine and leaves the other beats identical", async () => {
    returns({ text: "A palm sweeps the keys off oak." });
    const res = await post({ scope: "cut", cutId: "c1", plan: PLAN, note: "tighter" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { plan: MultishotPlan };
    expect(json.plan.beats[0].text).toBe("A palm sweeps the keys off oak.");
    expect(json.plan.beats[1].text).toBe(PLAN.beats[1].text);
    expect(json.plan.look).toBe(PLAN.look);
  });

  it("merges a look refine and leaves every beat identical", async () => {
    returns({ look: "Overcast, flat and soft." });
    const res = await post({ scope: "look", plan: PLAN });
    const json = (await res.json()) as { plan: MultishotPlan };
    expect(json.plan.look).toBe("Overcast, flat and soft.");
    expect(json.plan.beats).toEqual(PLAN.beats);
  });

  // A version that cannot say what was asked of it is useless to the eval flywheel (D22).
  it("records the scope, the shot and the note on the version", async () => {
    returns({ text: "Rewritten." });
    await post({ scope: "cut", cutId: "c2", plan: PLAN, note: "slower" });
    expect(runPromptGeneration.mock.calls[0][0].paramsUsed).toMatchObject({
      scope: "cut",
      cutId: "c2",
      note: "slower",
    });
  });

  it("422s a merged plan that fails validation", async () => {
    returns({ text: "   " }); // empty after trim
    const res = await post({ scope: "cut", cutId: "c1", plan: PLAN });
    expect(res.status).toBe(422);
  });

  it("defaults to a full generate when no scope is given", async () => {
    returns(PLAN);
    const res = await post({ instruction: "punchy" });
    expect(res.status).toBe(200);
    expect(runPromptGeneration.mock.calls[0][0].paramsUsed).toMatchObject({ scope: "all" });
  });
});
```

- [ ] **Step 0b: Run the tests to verify they fail**

Run: `npx vitest run "src/app/api/nodes/[id]/multishot-prompt/route.test.ts"`
Expected: FAIL — the route still reads `onlyCutId` and has no `scope`, so the 400 and merge cases fail.

- [ ] **Step 1: Replace the body parsing and validation**

In `src/app/api/nodes/[id]/multishot-prompt/route.ts`, replace the body block (currently `instruction` through the `onlyCutId` guard) with:

```ts
    const body = (await req.json().catch(() => null)) as {
      instruction?: unknown;
      slices?: unknown;
      cutInstructions?: unknown;
      /** "all" (default) rewrites everything; "look" and "cut" rewrite one fragment. */
      scope?: unknown;
      /** The operator's one-off steer. Never persisted on the node — see paramsUsed below. */
      note?: unknown;
      /** Required when scope is "cut". */
      cutId?: unknown;
      /** The plan being refined. Required when scope is "look" or "cut". */
      plan?: unknown;
    } | null;

    const instruction = typeof body?.instruction === "string" ? body.instruction : "";
    const cutInstructions = (
      typeof body?.cutInstructions === "object" && body?.cutInstructions !== null
        ? body.cutInstructions
        : {}
    ) as Record<string, string>;

    const scope =
      body?.scope === "look" || body?.scope === "cut" ? body.scope : ("all" as const);
    const cutId = typeof body?.cutId === "string" ? body.cutId : null;
    const note = typeof body?.note === "string" ? body.note : "";

    // Capped so an accidental paste cannot silently dominate the turn and push the actual brief
    // out of the model's attention.
    if (note.length > 2000) return apiError("That note is too long.", 400);

    const resolved = await resolveMultishotPromptInputs(nodeId, body?.slices);
    if (!resolved) return apiError("Node not found", 404);
    if (resolved.cuts.length === 0) {
      return apiError("Connect a Multishot node with at least one shot", 400);
    }
    if (scope === "cut" && !cutId) {
      return apiError("No shot was named for this rewrite", 400);
    }
    if (cutId && !resolved.cuts.some((c) => c.id === cutId)) {
      return apiError("That shot is not on this node", 400);
    }

    // A narrow refine edits an existing plan, so there has to BE one. Parsed here rather than
    // trusted: the merge below writes it back out as the node's plan.
    const previous = scope === "all" ? null : parsePlan(body?.plan, resolved.cuts);
    if (scope !== "all" && !previous?.ok) {
      return apiError("Generate the whole sequence first", 400);
    }
```

- [ ] **Step 2: Replace the turn construction**

Replace the `let user = buildMultishotUserTurn({...})` block **and** the `const previous = onlyCutId ? ... ` block that follows it with:

```ts
    const user =
      buildMultishotUserTurn({
        clientContext: resolved.clientContext,
        upstream: resolved.upstream,
        cuts: resolved.cuts,
        instruction,
        cutInstructions,
      }) +
      refineInstruction({
        scope,
        cutId,
        note,
        plan: previous?.ok ? previous.plan : { look: "", beats: [] },
      });
```

- [ ] **Step 3: Switch the schema and merge the result**

In the `call:` function, replace the `response_format` schema and the `parsePlan` block:

```ts
          const schema =
            scope === "look"
              ? MULTISHOT_LOOK_SCHEMA
              : scope === "cut"
                ? MULTISHOT_BEAT_SCHEMA
                : spec.schema;

          const completion = await openai.chat.completions.create({
            model: spec.model,
            response_format: {
              type: "json_schema",
              json_schema: { name: "multishot_plan", schema, strict: true },
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
          usage = (completion.usage ?? null) as ModelUsage | null;

          // MERGED BEFORE VALIDATION, and validated WHOLE. The merge is what makes the version
          // row equal the plan the node ends up holding — the look re-run used to record a full
          // returned plan while the client kept only its `look`, so restoring that version
          // resurrected beats the operator never accepted.
          const parsed =
            scope === "all" || !previous?.ok
              ? parsePlan(raw, resolved.cuts)
              : mergeRefinedPlan(
                  previous.plan,
                  scope,
                  (raw ?? {}) as { look?: string; text?: string },
                  cutId ?? undefined,
                  resolved.cuts,
                );
          if (!parsed.ok) {
            throw new PlanValidationError(parsed.reason);
          }

          return { output: parsed.plan, usage };
```

- [ ] **Step 4: Record the scope on the version**

Replace every remaining `onlyCutId` reference in `generationInputsSnapshot`, `inputsUsed`, `paramsUsed` and `onFailure` with `scope`, `cutId` and `note`. There are five sites; each becomes:

```ts
        generationInputsSnapshot: { instruction, scope, cutId },
```
```ts
          cuts: resolved.cuts,
          scope,
          cutId,
```
```ts
        paramsUsed: {
          instruction,
          cutInstructions,
          scope,
          cutId,
          // Not persisted on the NODE, but a version that cannot say what was asked of it is
          // useless to the eval flywheel (D22), which is the whole reason these rows exist.
          note,
          promptId: spec.id,
        },
```
and inside `onFailure`:
```ts
            inputsUsed: {
              kbVersionId: resolved.kbVersionId,
              kbSlices: resolved.slices,
              cuts: resolved.cuts,
              scope,
              cutId,
            },
            paramsUsed: { instruction, cutInstructions, scope, cutId, note, promptId: spec.id, tokensUsed: usage },
```

- [ ] **Step 5: Update the imports**

```ts
import { parsePlan, renderPlan, mergeRefinedPlan } from "@/lib/nodes/multishot-plan";
import {
  multishotPromptGenerate,
  MULTISHOT_LOOK_SCHEMA,
  MULTISHOT_BEAT_SCHEMA,
  refineInstruction,
} from "@/prompts/multishot-prompt-generate";
```

- [ ] **Step 6: Verify no `onlyCutId` remains**

Run: `grep -rn "onlyCutId" src/`
Expected: no output. (Task 7 removes the client's last use; if it still appears in `multishot-prompt-focus-view.tsx` at this point that is expected — it must be gone after Task 7.)

- [ ] **Step 7: Run the route tests to verify they now pass**

Run: `npx vitest run "src/app/api/nodes/[id]/multishot-prompt/route.test.ts"`
Expected: PASS, 9 tests.

- [ ] **Step 8: Typecheck and run the suites**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.next/types"`
Expected: errors only in `multishot-prompt-focus-view.tsx` (it still posts `onlyCutId`), fixed in Task 7.

Run: `npx vitest run src/lib src/prompts src/app`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add "src/app/api/nodes/[id]/multishot-prompt/route.ts" "src/app/api/nodes/[id]/multishot-prompt/route.test.ts"
git commit -m "feat(multishot): route accepts a refine scope and an ephemeral note

Each scope asks the model for only the fragment being rewritten and the route merges it
into the supplied plan BEFORE parsePlan and BEFORE insertVersion. Two consequences: a
beat rewrite physically cannot alter another beat, and the version row now equals the
plan the node holds — the look re-run used to record a full returned plan while the
client kept only its look, so restoring that version resurrected beats the operator
never accepted.

onlyCutId becomes scope + cutId. One caller, so a rename rather than a migration;
keeping both would give the route two ways to say the same thing and a rule about which
wins. The note is recorded in paramsUsed but never persisted on the node.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The `RefineWithAI` control

**Files:**
- Create: `src/components/nodes/refine-with-ai.tsx`

**Interfaces:**
- Consumes: `REFINE_SUGGESTIONS`, `RefineScope` (Task 2).
- Produces: `<RefineWithAI scope busy disabled onSubmit={(note: string) => void} />`, used by Tasks 6 and 7.

- [ ] **Step 1: Check the Popover primitive exists**

Run: `ls src/components/ui/popover.tsx && grep -n "PopoverTrigger\|PopoverContent" src/components/ui/popover.tsx | head -4`
Expected: the file exists and exports both. (It is already used by `kb-field-row.tsx`.)

- [ ] **Step 2: Implement**

Create `src/components/nodes/refine-with-ai.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { REFINE_SUGGESTIONS, type RefineScope } from "@/lib/nodes/refine-suggestions";

const HELP: Record<RefineScope, string> = {
  all: "Describe the change — the writer rewrites every shot with it in mind.",
  look: "Describe the change — the writer rewrites the look. Your beats are left as they are.",
  cut: "Describe the change — the writer rewrites this shot only.",
};

const PLACEHOLDER: Record<RefineScope, string> = {
  all: 'e.g. "fewer product close-ups, more street"',
  look: 'e.g. "colder light, overcast rather than low sun"',
  cut: 'e.g. "tighter, and let the sole read"',
};

/**
 * Refine with AI — the KB's pattern (`kb-field-row.tsx`), at three scopes.
 *
 * The note is EPHEMERAL: it steers this one rewrite and is cleared when the popover closes. The
 * standing brief stays the standing brief, so a throwaway "try it darker" never silently becomes
 * part of a shot's definition.
 *
 * Uses shadcn `Textarea`, not a raw `<textarea>` — the KB's own popover predates that rule.
 */
export function RefineWithAI({
  scope,
  busy = false,
  disabled = false,
  onSubmit,
  label,
}: {
  scope: RefineScope;
  busy?: boolean;
  disabled?: boolean;
  onSubmit: (note: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  function submit() {
    const trimmed = note.trim();
    if (!trimmed) return;
    setOpen(false);
    setNote("");
    onSubmit(trimmed);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setNote("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            disabled={disabled || busy}
            aria-label={label}
            title={label}
            className="h-auto rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary data-[popup-open]:bg-primary/10 data-[popup-open]:text-primary"
          >
            <Sparkles className={cn("size-3.5", busy && "animate-pulse")} strokeWidth={1.5} />
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={6} className="w-80 gap-0">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
          Refine with AI
        </div>
        <p className="mb-2 text-xs text-muted-foreground">{HELP[scope]}</p>

        {/* Chips FILL the box rather than submitting. A suggestion is a starting point to edit,
            and one-click-to-spend on a control that bills a generation is the wrong affordance. */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {REFINE_SUGGESTIONS[scope].map((suggestion) => (
            <Button
              key={suggestion}
              variant="ghost"
              onClick={() => setNote(suggestion)}
              className={cn(
                "h-auto rounded-md border border-dashed border-primary/40 px-2 py-1",
                "text-[0.7rem] font-medium text-primary transition-colors duration-200",
                "hover:border-primary/60 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5",
              )}
            >
              {suggestion}
            </Button>
          ))}
        </div>

        <Textarea
          autoFocus
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={PLACEHOLDER[scope]}
          className="w-full resize-none border-border bg-background text-sm"
        />

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[0.6rem] text-muted-foreground">⌘↵ to submit</span>
          <Button
            onClick={submit}
            disabled={!note.trim()}
            className="h-auto gap-1 rounded-md px-2.5 py-1 text-xs disabled:opacity-40"
          >
            <Sparkles className="size-3" strokeWidth={1.5} />
            Rewrite
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.next/types" | grep refine-with-ai`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/refine-with-ai.tsx
git commit -m "feat(multishot): the Refine with AI popover

The KB's pattern at three scopes. The note is ephemeral — cleared when the popover
closes — so a throwaway 'try it darker' never silently becomes part of a shot's
standing brief.

Suggestion chips FILL the box rather than submitting: a suggestion is a starting point
to edit, and one-click-to-spend on a control that bills a generation is the wrong
affordance. Uses shadcn Textarea; the KB's own popover predates that rule.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Beat card gets the control

**Files:**
- Modify: `src/components/nodes/multishot-beat-card.tsx`

**Interfaces:**
- Consumes: `RefineWithAI` (Task 5).
- Produces: a new `onRefine: (note: string) => void` prop on `MultishotBeatCard`, wired in Task 7.

- [ ] **Step 1: Add the prop and render the control**

In `src/components/nodes/multishot-beat-card.tsx`, add to the props type (after `onRerun`):

```ts
  /** Rewrite this beat with an operator note. Same call as onRerun, with a steer attached. */
  onRefine: (note: string) => void;
```

and to the destructured params (after `onRerun,`): `onRefine,`

Then replace the `showRerun && (...)` block with:

```tsx
        {showRerun && (
          <div className="mb-1.5 flex items-center justify-end gap-0.5">
            <RefineWithAI
              scope="cut"
              busy={rerunning}
              disabled={disabled}
              onSubmit={onRefine}
              label={`Refine shot ${index + 1} with AI`}
            />
            <Button
              variant="ghost"
              onClick={onRerun}
              disabled={rerunning || disabled}
              aria-label={`Rewrite shot ${index + 1}`}
              className="h-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted"
            >
              <RefreshCw className={cn("size-3.5", rerunning && "animate-spin")} strokeWidth={1.5} />
            </Button>
          </div>
        )}
```

Add the import:

```ts
import { RefineWithAI } from "./refine-with-ai";
```

- [ ] **Step 2: Dim the body while this beat is being rewritten**

Replace the editor wrapper so the loader is visible on the card itself, not only on the button:

```tsx
        <div className={cn(rerunning && "pointer-events-none opacity-50")}>
          <MentionInstructionEditor
            value={text}
            onChange={onChange}
            upstream={upstream}
            disabled={disabled}
            dialect={imageRefDialect(refIds)}
            placeholder="Not written yet…"
          />
        </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.next/types"`
Expected: one error in `multishot-prompt-focus-view.tsx` — `onRefine` is missing. Fixed in Task 7.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/multishot-beat-card.tsx
git commit -m "feat(multishot): Refine with AI on the beat card

Sits beside the plain re-run rather than replacing it — the no-note path stays one
click, and the card dims while its own rewrite is in flight so the loader is on the
thing being changed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Focus view — wire it up and turn it on

**Files:**
- Modify: `src/components/nodes/multishot-prompt-focus-view.tsx`

**Interfaces:**
- Consumes: `RefineWithAI` (Task 5), the beat card's `onRefine` (Task 6), the route contract (Task 4).

- [ ] **Step 1: Replace the two re-run state flags with one**

Replace:
```ts
  const [rerunningBeatId, setRerunningBeatId] = useState<string | null>(null);
  const [rerunningLook, setRerunningLook] = useState(false);
```
with:
```ts
  // ONE in flight at a time. Two concurrent refines each resolve against the planDraft they
  // captured at submit time, so the second to return would discard the first's result with no
  // error at all. This drives every button's disabled state, not just its own.
  const [refining, setRefining] = useState<
    { scope: "all" | "look" | "cut"; cutId: string | null } | null
  >(null);
```

- [ ] **Step 2: Replace the POST helper**

```ts
  // Shared POST helper for every call to this node's runAction — a full generate, or a scoped
  // refine. One fetch/parse path so the callers below cannot drift on error handling.
  async function postMultishotPrompt(extra?: {
    scope?: "look" | "cut";
    cutId?: string;
    note?: string;
    plan?: MultishotPlan;
  }) {
    const res = await fetch(`/api/nodes/${nodeId}/multishot-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction: instructionDraft,
        slices,
        cutInstructions: cutDrafts,
        ...extra,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
    }
    return json as { plan: MultishotPlan; versionId: string | null };
  }
```

- [ ] **Step 3: Replace both re-run handlers with one**

Replace `handleRerunBeat` and `handleRerunLook` entirely with:

```ts
  /**
   * A scoped rewrite: the look, one beat, or the whole plan, optionally steered by a note.
   *
   * The response is ALREADY the merged whole — the route merges the model's narrow fragment into
   * the plan we sent before it validates or records anything. So this assigns it wholesale and
   * there is nothing to splice: the beats we did not ask about came back exactly as we sent them.
   */
  async function runRefine(
    scope: "all" | "look" | "cut",
    opts: { cutId?: string; note?: string } = {},
  ) {
    if (isReadOnly || refining) return; // D33, and one in flight at a time
    if (scope !== "all" && !planDraft) return;

    setRefining({ scope, cutId: opts.cutId ?? null });
    if (scope === "all") {
      setLastError(null);
      setEvalDecision(null);
      setEvalNote("");
    }
    try {
      const json = await postMultishotPrompt(
        scope === "all"
          ? { note: opts.note }
          : { scope, cutId: opts.cutId, note: opts.note, plan: planDraft! },
      );
      setPlanDraft(json.plan);
      onPatch({ parsed: json.plan });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success(
        scope === "look" ? "Look rewritten" : scope === "cut" ? "Shot rewritten" : "Multishot prompt generated",
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Rewrite failed";
      if (scope === "all") setLastError(message);
      toast.error(message);
      await fetchVersions();
    } finally {
      setRefining(null);
    }
  }
```

Then replace the body of `runGenerate` with `await runRefine("all");` and delete its now-duplicated try/catch, keeping the `generating` flag if other code reads it:

```ts
  async function runGenerate() {
    setGenerating(true);
    try {
      await runRefine("all");
    } finally {
      setGenerating(false);
    }
  }
```

- [ ] **Step 4: Turn the controls on**

```ts
const SHOW_PER_BEAT_REGENERATE = true; // the look and per-beat rewrite + refine buttons
```

Leave `SHOW_REFERENCE_ATTACHMENT` as `false` — the instruction editors are a separate display decision and are not part of this work.

- [ ] **Step 5: Render the look card's control**

Replace the look card's `SHOW_PER_BEAT_REGENERATE && (...)` button with:

```tsx
                            {SHOW_PER_BEAT_REGENERATE && (
                              <div className="ml-auto flex items-center gap-0.5">
                                <RefineWithAI
                                  scope="look"
                                  busy={refining?.scope === "look"}
                                  disabled={isReadOnly || !!refining}
                                  onSubmit={(note) => runRefine("look", { note })}
                                  label="Refine the look with AI"
                                />
                                <Button
                                  variant="ghost"
                                  onClick={() => runRefine("look")}
                                  disabled={!!refining || isReadOnly}
                                  aria-label="Rewrite the look"
                                  className="h-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted"
                                >
                                  <RefreshCw
                                    className={cn("size-3.5", refining?.scope === "look" && "animate-spin")}
                                    strokeWidth={1.5}
                                  />
                                </Button>
                              </div>
                            )}
```

- [ ] **Step 6: Wire the beat cards**

```tsx
                              onRerun={() => runRefine("cut", { cutId: beat.cutId })}
                              onRefine={(note) => runRefine("cut", { cutId: beat.cutId, note })}
                              showRerun={SHOW_PER_BEAT_REGENERATE}
                              rerunning={refining?.cutId === beat.cutId}
                              disabled={isReadOnly || (!!refining && refining.cutId !== beat.cutId)}
```

- [ ] **Step 7: Add the whole-plan control to the output header**

Find the output column's `text-eyebrow` heading row (the one above the look card) and append, inside that row:

```tsx
                      {SHOW_PER_BEAT_REGENERATE && mode === "result" && (
                        <div className="ml-auto">
                          <RefineWithAI
                            scope="all"
                            busy={refining?.scope === "all"}
                            disabled={isReadOnly || !!refining}
                            onSubmit={(note) => runRefine("all", { note })}
                            label="Refine the whole sequence with AI"
                          />
                        </div>
                      )}
```

Add the import: `import { RefineWithAI } from "./refine-with-ai";`

- [ ] **Step 8: Verify `onlyCutId` is gone everywhere**

Run: `grep -rn "onlyCutId\|rerunningLook\|rerunningBeatId" src/`
Expected: no output.

- [ ] **Step 9: Typecheck and run every suite**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.next/types"`
Expected: no output.

Run: `npx vitest run src/lib src/prompts src/components src/app`
Expected: PASS, no failures.

- [ ] **Step 10: Commit**

```bash
git add src/components/nodes/multishot-prompt-focus-view.tsx
git commit -m "feat(multishot): wire Refine with AI, and turn the rewrite controls on

Three scopes through one handler and one route call. SHOW_PER_BEAT_REGENERATE goes to
true — the controls were hidden while the flow settled, and a steerable rewrite is what
they were waiting for.

One refine in flight at a time, enforced across every button rather than per-button:
two concurrent refines each resolve against the planDraft they captured at submit time,
so the second to return would discard the first's result with no error at all.

The response is already the merged whole, so it is assigned wholesale — the route
merges the model's narrow fragment into the plan we sent before it validates or records
anything, and the beats we did not ask about come back exactly as we sent them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Manual verification

**Files:** none — this is the browser pass.

- [ ] **Step 1: Start the app**

Run: `npm run dev`
Wait for `next` to report ready.

- [ ] **Step 2: Walk the three scopes**

On a canvas with a Multishot node connected to a Multishot Prompt node with a generated plan:

1. Click `✨` on a beat card → chips appear → click *Tighter framing* → it fills the box, does **not** submit → edit it → `⌘↵`.
2. While it runs: that card dims and its Sparkles pulses; **every other** `✨` and `↻` on the node is disabled.
3. On success: **only that beat's text changed.** Hand-edit a different beat first to confirm it survives.
4. `✨` on the Look card with a note → only the look changes; the beats are byte-identical.
5. `✨ Refine all` in the output header → the whole plan is rewritten.
6. Close a popover without submitting, reopen it → the box is empty.

- [ ] **Step 3: Confirm the version log matches the node**

Open the version chips, restore the version a look refine created, and confirm the beats are the ones on screen — not a different set. This is the desync the merge fixes.

- [ ] **Step 4: Report**

Report what was observed for each of the six steps, including anything that did not behave as described. Do not mark this task complete on the basis of the code being written — only on the basis of having watched it run.

---

## Notes for the implementer

- **`refining` replaces two flags.** If you find a third reference to `rerunningLook` or `rerunningBeatId`, it is a render site that needs the same treatment — the grep in Task 7 Step 8 catches it.
- **The route returns the merged whole.** Do not splice the response client-side; that was explicitly rejected in the spec (§3) because the version is written on the server and a client-side splice would leave the recorded plan disagreeing with the node's.
- **Do not touch `kb-field-row.tsx`.** Its raw `<textarea>` violates the controls rule but is out of scope; fixing it silently would put an unrelated change in these commits.
- **Do not revive `sequence-roles.ts`.** It is parked. The suggestion chips are a short catalog of directorial steers and deliberately do not import it.
