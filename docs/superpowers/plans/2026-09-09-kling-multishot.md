# Kling 3.0 Omni as a Second Multishot Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the multishot lane's model a choice — Gemini Omni 1.1 Flash or Kling 3.0 Omni — picked once on the Multishot node and inherited by the prompt writer, the renderer and Video Gen.

**Architecture:** A capability table (`MULTISHOT_MODELS`) replaces the `OMNI_MAX_SECONDS` constant as the cut ladder's ceiling. `targetModel` on `MultishotNodeData` selects an entry; every downstream consumer resolves it rather than deciding for itself. The plan JSON (`{version, look, beats[{cutId, text}]}`) is unchanged — only the system prompt, the renderer and the reference-token dialect differ per model.

**Tech Stack:** Next.js App Router, TypeScript, Zustand (`canvas-store.ts`), React Flow (`@xyflow/react`), Vitest, shadcn/Base UI primitives.

**Spec:** [docs/superpowers/specs/2026-09-08-kling-multishot-design.md](../specs/2026-09-08-kling-multishot-design.md). ADRs **D235–D239** in the roadmap's §7.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Never run bare `npx vitest run`.** The full suite has ~11 pre-existing timeout flakes in API-route tests that pass in isolation. Always scope to a directory or file.
- **No destructive git commands, ever, on any path** — no `git checkout`, `git restore`, `git stash`, `git reset`, `git clean`, `git rm`. A subagent destroyed uncommitted work this way. To undo an edit, edit it back by hand.
- **Never `git add -A` or `git add .`** — stage only the files named in the task's commit step, by explicit path.
- **Controls are shadcn primitives** from `src/components/ui/*` (Base UI registry). Never a raw `<button>`, `<input>`, `<textarea>`, `<select>`. Base UI composes via the **`render` prop, not `asChild`**. Anything sitting *inside* a field uses `InputGroup` from `src/components/ui/input-group.tsx`.
- **Import, don't redefine** (AGENTS.md). Constants live in `src/lib/<feature>/constants.ts`, utilities in `utils.ts`, shared prompt text is exported from the canonical provider file.
- **Colours come from the shadcn CSS variables** in `src/app/globals.css`. Never hardcode a hex. Purple `#5829c7` is used sparingly and never as a large fill. Icons are Lucide, stroke 1.5, no fills.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **PowerShell is the shell.** `&&` and `||` are parser errors — use `A; if ($?) { B }`. A here-string's closing `'@` must sit at column 0 with nothing after it. For multi-paragraph commit messages, write the message to a file under the scratchpad and use `git commit -F <file>`.

### Exact values (copy verbatim — do not round or re-derive)

| | Gemini Omni 1.1 | Kling 3.0 Omni |
|---|---|---|
| Model id | `gemini:gemini-omni-1.1-flash` | `kling:kling-3-0-omni` |
| Total seconds | 3–10 | 3–15 |
| Min per cut | 1 | 1 |
| Max cuts | no stated limit (`null`) | **6** |
| Max chars per beat | none (`null`) | **512** |
| Max chars whole prompt | none (`null`) | **3072** |
| Shot format | timecode ladder | `shot n, m, words;` triples |
| Reference token | `<IMAGE_REF_N>`, **0-based** | `@image_N`, **1-based** |

Kling endpoint: `POST https://api-singapore.klingai.com/omni-video/kling-3.0-omni`, envelope `{contents, settings, options}` — the same envelope `src/lib/video-gen/providers/kling.ts` already sends. `settings.multi_shot` **defaults to `true` server-side** and must always be sent explicitly.

---

## A gap this plan must close (found while reading the code, not in the spec)

The spec's §6 says Kling's shot durations "must sum to `settings.duration` exactly", and treats that as holding "by construction". **It does not hold today.**

`src/app/api/nodes/[id]/video-generate/route.ts:178` reads the request's duration from the *node's own param*:

```ts
const durationSeconds = Number(resolvedParams.seconds ?? resolvedParams.duration ?? 0);
```

Nothing ties that to `totalOf(cuts)`. `multishot-cuts.ts`'s header claims "the request's duration is derived from `totalOf(cuts)` … no generation-time balance check is needed" — that claim describes an intent the route never implemented. On Omni the mismatch is survivable (a ladder longer than the duration comes back truncated at full price — the exact failure the header says it prevents). **On Kling it is a hard rejection**, because the shot triples must sum to `duration`.

**Task 9 closes it:** on the multishot lane the route derives `duration` from the cuts and ignores the node's param. This is in scope because Kling cannot work without it, and it fixes a live Omni bug on the way.

---

## File Structure

**New:**

| File | Responsibility |
|---|---|
| `src/lib/nodes/multishot-models.ts` | The capability table and every question answered from it: lookup, fallback, ladder legality, the Video Gen restriction sentence. |
| `src/lib/nodes/__tests__/multishot-models.test.ts` | Tests for the above. |
| `src/prompts/multishot-prompt-kling.ts` | Kling's system prompt. Imports its shared blocks from `multishot-prompt-generate.ts`. |
| `src/prompts/multishot-prompt-for.ts` | The router: `multishotPromptFor(targetModel)`. Its own file so `generate.ts` and `kling.ts` stay a clean DAG with no import cycle. |

**Modified:**

| File | Change |
|---|---|
| `src/lib/video-gen/params/kling.ts` | `kling30OmniParams`. |
| `src/lib/video-gen/client-models.ts` | `KLING_OMNI_MODEL_ID`, its client spec, its rules. |
| `src/lib/video-gen/providers/kling.ts` | `kling30Omni` server spec on the existing transport. |
| `src/lib/video-gen/registry.ts` | Register `kling30Omni`. |
| `src/lib/video-gen/pricing.ts` | Cost entry (`computeVideoCost` returns null without one, which throws). |
| `src/lib/nodes/multishot-cuts.ts` | Every ceiling-aware function takes a `MultishotCapability`. |
| `src/lib/nodes/prompt-token-dialect.ts` | `klingImageDialect`, `dialectForCapability`. |
| `src/lib/nodes/multishot-plan.ts` | `renderPlan` and `refsCitedIn` take a capability; new `checkPlanLimits`. |
| `src/lib/canvas-nodes.ts` | `targetModel?: string` on `MultishotNodeData`. |
| `src/components/nodes/multishot-focus-view.tsx` | Model `Select` in the header; capability-driven ceilings. |
| `src/components/nodes/multishot-node.tsx` | Capability-driven warnings; `SOFT_CUT_LIMIT` deleted. |
| `src/lib/nodes/resolve-inputs.ts` | `resolveMultishotPromptInputs` returns `targetModel`. |
| `src/app/api/nodes/[id]/multishot-prompt/route.ts` | Route the prompt spec on `targetModel`. |
| `src/components/nodes/multishot-prompt-focus-view.tsx`, `multishot-beat-card.tsx` | Use the target model's dialect. |
| `src/lib/video-gen/resolve-prompt.ts` | Return `targetModel`; render with its capability. |
| `src/lib/canvas-store.ts` | `onConnect` coerces to the inherited model, not hard Omni. |
| `src/components/nodes/video-gen-focus-view.tsx` | Inherit; new restriction copy. |
| `src/app/api/nodes/[id]/video-generate/route.ts` | Duration from cuts; capability backstop. |

**Task order matters.** Tasks 2–5 are pure logic with no UI; 6–9 consume them. Task 1 must land first because Task 2's test asserts every capability id exists in the video-gen model map.

---

## Task 1: Register Kling 3.0 Omni as a video-gen model

Nothing multishot-specific. At the end of this task the model appears in the picker and can generate an ordinary single-shot clip — which is what makes it independently testable.

**Files:**
- Modify: `src/lib/video-gen/params/kling.ts`
- Modify: `src/lib/video-gen/client-models.ts`
- Modify: `src/lib/video-gen/providers/kling.ts`
- Modify: `src/lib/video-gen/registry.ts`
- Modify: `src/lib/video-gen/pricing.ts`
- Test: `src/lib/video-gen/__tests__/client-models.test.ts` (create if absent)

**Interfaces:**
- Produces: `KLING_OMNI_MODEL_ID = "kling:kling-3-0-omni"` exported from `src/lib/video-gen/client-models.ts`; `kling30OmniParams` from `params/kling.ts`; `kling30Omni` from `providers/kling.ts`.

- [ ] **Step 1: Read the two files you are extending before changing them**

Read `src/lib/video-gen/registry.ts` and `src/lib/video-gen/pricing.ts` in full. You need the exact shape of the registry map and of the pricing table — this plan does not restate them because they are the two files most likely to have drifted. Note how `kling:kling-o1` is priced; Kling 3.0 Omni takes the same per-second structure.

- [ ] **Step 2: Add the params**

In `src/lib/video-gen/params/kling.ts`, after `kling30Params` (around line 140), add:

```ts
// Kling 3.0 Omni — /omni-video/kling-3.0-omni. The flagship: 4k, a continuous 3-15s range, and
// the only Kling endpoint that parses multi-shot triples out of the prompt.
//
// duration is a SLIDER (a number), not O1's 5/10 chip select: the 3-15 range is continuous here,
// and the multishot lane sets it from the cut ladder's own total, which is any integer in range.
//
// multi_shot is NOT the hidden-and-false param the other two Kling models carry. This endpoint
// defaults it to `true` SERVER-SIDE, so a request that omits it silently gets cuts. It is sent
// explicitly on every request; the multishot lane sets it true, and a single-take generation on
// this model needs it false. Hidden from the panel because the lane decides it, not the operator.
export const kling30OmniParams: ParamSpec[] = [
  resolutionParam(["720p", "1080p", "4k"], "720p"),
  durationParam(3, 15, 5),
  audioParam(["native", "off"], "off"),
  { ...multiShotParam, defaultValue: false },
  aspectRatioParam,
  negativePromptParam,
];
```

- [ ] **Step 3: Add the client model spec**

In `src/lib/video-gen/client-models.ts`, import `kling30OmniParams` alongside the existing Kling params on line 3:

```ts
import { kling30Params, klingO1Params, kling30OmniParams } from "./params/kling";
```

Add the image-input shape next to `KLING_O1_IMAGE_INPUTS` (around line 102):

```ts
// D100's cap applies here too: the omni endpoints allow 7 images total with no reference video,
// and whether first_frame/last_frame count toward that 7 is undocumented. 5 keeps a request in
// budget with both frames in use. Being wrong this way costs two slots; being wrong the other way
// causes 400s.
const KLING_30_OMNI_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 5,
} as const;
```

Add the rules next to `KLING_O1_RULES` (around line 172). 3.0 Omni animates from references alone (same as O1), so it reuses O1's two rules verbatim rather than declaring near-copies:

```ts
// Same two gates as O1 — both are properties of the /omni-video endpoint family, not of O1's
// model weights: references stand alone as an input, and a last-frame-only request has no origin
// to interpolate from. Reused rather than copied so a fix to either applies to both.
const KLING_30_OMNI_RULES: ConstraintRule[] = [
  KLING_O1_NEEDS_START_FRAME_OR_REFERENCE,
  KLING_O1_END_FRAME_REQUIRES_START_FRAME,
];
```

Export the id beside `GEMINI_OMNI_MODEL_ID` (around line 177):

```ts
/** Kling's flagship omni endpoint — the second model that cuts between shots natively. */
export const KLING_OMNI_MODEL_ID = "kling:kling-3-0-omni";
```

Add the entry to `videoGenClientModelMap`, immediately after `"kling:kling-o1"` so it groups under the Kling heading:

```ts
  [KLING_OMNI_MODEL_ID]: {
    id: KLING_OMNI_MODEL_ID,
    provider: "kling",
    label: "Kling 3.0 Omni",
    pickerLabel: "3.0 Omni",
    providerLabel: "Kling",
    maxDurationSeconds: 15,
    imageInputs: KLING_30_OMNI_IMAGE_INPUTS,
    params: kling30OmniParams,
    rules: KLING_30_OMNI_RULES,
  },
```

**`KLING_O1_NEEDS_START_FRAME_OR_REFERENCE`'s `reason` string names "Kling O1" and is now shown for two models.** Change it to `"Kling needs a start frame or at least one reference image"` — the rule was always about the endpoint, not the model.

- [ ] **Step 4: Add the server provider spec**

In `src/lib/video-gen/providers/kling.ts`, after `klingO1` (around line 306):

```ts
export const kling30Omni: VideoGenModelSpec = {
  id: "kling:kling-3-0-omni",
  provider: "kling",
  label: "Kling 3.0 Omni",
  providerLabel: "Kling",
  maxDurationSeconds: 15,
  imageInputs: KLING_O1_IMAGE_INPUTS_SERVER,
  params: kling30OmniParams,
  generate: (input) =>
    generateWithKling(
      {
        endpointPath: "/omni-video/kling-3.0-omni",
        supportsReferences: true,
        requiresStartFrame: false,
      },
      buildO1Settings,
      input,
    ),
};
```

Two things to check as you write this, because both are easy to get subtly wrong:

1. `KLING_O1_IMAGE_INPUTS_SERVER` is this plan's placeholder name for whatever the server-side O1 image-input constant is actually called in that file (near line 265 there is a `maxReferenceImages: 5` shape). **Read the file and use its real name.** Do not introduce a new constant.
2. `buildO1Settings` clamps duration to 5 or 10 — read its body around line 68–106. **That clamp must not apply here.** 3.0 Omni's documented range is a continuous 3–15, and the multishot lane will send any integer in it. Extract the shared settings body into a helper that takes the legal duration set, or add a `durationPolicy` argument; do not copy the function. The O1 clamp exists because O1's *live validator* rejected 3/4/6-second requests — that is O1-specific runtime evidence, and the comment there says so.

- [ ] **Step 5: Register it and price it**

Add `kling30Omni` to `src/lib/video-gen/registry.ts` following the pattern you read in Step 1.

Add a pricing entry in `src/lib/video-gen/pricing.ts`, matching Kling O1's per-second structure across its resolution tiers plus a `4k` tier. **This is not optional:** `computeVideoCost` returning `null` makes `video-generate/route.ts:183` throw `No cost estimate available for …`, so an unpriced model cannot generate at all. If the vendor 4k price is unknown, use the 1080p figure and add a comment saying it is a placeholder pending the first real 4k generation — an over-estimate reserves too many credits and refunds the difference, which is the safe direction.

- [ ] **Step 6: Write the test**

In `src/lib/video-gen/__tests__/client-models.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  videoGenClientModelMap,
  videoGenClientModelGroups,
  KLING_OMNI_MODEL_ID,
} from "../client-models";
import { computeVideoCost } from "../pricing";

describe("Kling 3.0 Omni registration", () => {
  it("is in the client model map", () => {
    expect(videoGenClientModelMap[KLING_OMNI_MODEL_ID]).toBeDefined();
  });

  it("allows 15s and reference images", () => {
    const spec = videoGenClientModelMap[KLING_OMNI_MODEL_ID];
    expect(spec.maxDurationSeconds).toBe(15);
    expect(spec.imageInputs.maxReferenceImages).toBeGreaterThan(0);
  });

  it("offers a duration slider covering 3-15", () => {
    const duration = videoGenClientModelMap[KLING_OMNI_MODEL_ID].params.find(
      (p) => p.name === "duration",
    );
    expect(duration?.component).toBe("slider");
    expect(duration?.constraints).toMatchObject({ min: 3, max: 15 });
  });

  it("groups under Kling", () => {
    const kling = videoGenClientModelGroups.find((g) => g.label === "Kling");
    expect(kling?.models.map((m) => m.id)).toContain(KLING_OMNI_MODEL_ID);
  });

  // Without a pricing row computeVideoCost returns null and video-generate throws before it ever
  // reaches the provider — an unpriced model looks registered and cannot generate.
  it("has a cost estimate at every resolution it offers", () => {
    for (const resolution of ["720p", "1080p", "4k"]) {
      expect(computeVideoCost(KLING_OMNI_MODEL_ID, 5, false, resolution)).not.toBeNull();
    }
  });
});
```

- [ ] **Step 7: Run the test**

```
npx vitest run src/lib/video-gen/__tests__/
```

Expected: PASS. If the pricing test fails, Step 5 is incomplete — fix it there rather than relaxing the test.

- [ ] **Step 8: Typecheck**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```
git add src/lib/video-gen/params/kling.ts src/lib/video-gen/client-models.ts src/lib/video-gen/providers/kling.ts src/lib/video-gen/registry.ts src/lib/video-gen/pricing.ts src/lib/video-gen/__tests__/client-models.test.ts
git commit -F <scratchpad>/msg.txt
```

Message: `feat(video-gen): register Kling 3.0 Omni` — body noting it is a new model entry on existing transport, that `buildO1Settings`'s 5/10 clamp is O1-specific runtime evidence and deliberately not applied here, and that the 4k price is a placeholder if you used one.

---

## Task 2: The multishot capability table

**Files:**
- Create: `src/lib/nodes/multishot-models.ts`
- Test: `src/lib/nodes/__tests__/multishot-models.test.ts`

**Interfaces:**
- Consumes: `GEMINI_OMNI_MODEL_ID`, `KLING_OMNI_MODEL_ID`, `videoGenClientModelMap` from `@/lib/video-gen/client-models` (Task 1).
- Produces:
  ```ts
  export type MultishotCapability = {
    id: string; label: string;
    minTotalSeconds: number; maxTotalSeconds: number; minCutSeconds: number;
    maxCuts: number | null; maxCutChars: number | null; maxPromptChars: number | null;
    shotFormat: "timecode" | "triple";
    refTokenBase: 0 | 1;
  };
  export const MULTISHOT_MODELS: MultishotCapability[];
  export const DEFAULT_MULTISHOT_MODEL: string;
  export function multishotCapabilityFor(targetModel: string | undefined | null): MultishotCapability;
  export type LadderCheck = { ok: true } | { ok: false; reason: string };
  export function checkLadder(cuts: { seconds: number }[], cap: MultishotCapability): LadderCheck;
  export function multishotRestrictionReason(targetModel: string | undefined | null): string;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/__tests__/multishot-models.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MULTISHOT_MODELS,
  DEFAULT_MULTISHOT_MODEL,
  multishotCapabilityFor,
  checkLadder,
  multishotRestrictionReason,
} from "../multishot-models";
import { videoGenClientModelMap, GEMINI_OMNI_MODEL_ID, KLING_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

const cuts = (...secs: number[]) => secs.map((seconds, i) => ({ id: `c${i}`, text: "", seconds }));

describe("multishotCapabilityFor", () => {
  it("resolves each declared model", () => {
    expect(multishotCapabilityFor(GEMINI_OMNI_MODEL_ID).maxTotalSeconds).toBe(10);
    expect(multishotCapabilityFor(KLING_OMNI_MODEL_ID).maxTotalSeconds).toBe(15);
  });

  // Absent = every Multishot node that existed before targetModel did. There is no migration, so
  // this fallback IS the migration.
  it("falls back to Omni for absent, null and unknown ids", () => {
    expect(multishotCapabilityFor(undefined).id).toBe(DEFAULT_MULTISHOT_MODEL);
    expect(multishotCapabilityFor(null).id).toBe(DEFAULT_MULTISHOT_MODEL);
    expect(multishotCapabilityFor("kling:deleted-model").id).toBe(DEFAULT_MULTISHOT_MODEL);
  });

  // A capability naming a model that cannot be generated is a dead end the operator only meets
  // at Generate. Nothing else in the codebase would catch it.
  it("every capability names a real video-gen model", () => {
    for (const cap of MULTISHOT_MODELS) {
      expect(videoGenClientModelMap[cap.id], `${cap.id} is not a video-gen model`).toBeDefined();
    }
  });

  it("declares Kling's hard limits", () => {
    const kling = multishotCapabilityFor(KLING_OMNI_MODEL_ID);
    expect(kling.maxCuts).toBe(6);
    expect(kling.maxCutChars).toBe(512);
    expect(kling.maxPromptChars).toBe(3072);
    expect(kling.shotFormat).toBe("triple");
    expect(kling.refTokenBase).toBe(1);
  });

  it("declares Omni's absent limits as null, not as a large number", () => {
    const omni = multishotCapabilityFor(GEMINI_OMNI_MODEL_ID);
    expect(omni.maxCuts).toBeNull();
    expect(omni.maxCutChars).toBeNull();
    expect(omni.maxPromptChars).toBeNull();
    expect(omni.shotFormat).toBe("timecode");
    expect(omni.refTokenBase).toBe(0);
  });
});

describe("checkLadder", () => {
  const omni = multishotCapabilityFor(GEMINI_OMNI_MODEL_ID);
  const kling = multishotCapabilityFor(KLING_OMNI_MODEL_ID);

  it("accepts a ladder inside the window", () => {
    expect(checkLadder(cuts(3, 3, 3), omni)).toEqual({ ok: true });
  });

  // The switch case from D237: the same ladder is legal on one model and not the other, and
  // switching must not silently rewrite it.
  it("accepts 14s on Kling and refuses it on Omni", () => {
    expect(checkLadder(cuts(7, 7), kling)).toEqual({ ok: true });
    const refused = checkLadder(cuts(7, 7), omni);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toContain("10s");
  });

  it("refuses a ladder under the floor", () => {
    expect(checkLadder(cuts(1, 1), omni).ok).toBe(false);
  });

  it("refuses more cuts than the model allows, naming both numbers", () => {
    const refused = checkLadder(cuts(1, 1, 1, 1, 1, 1, 1), kling);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason).toContain("7");
      expect(refused.reason).toContain("6");
    }
  });

  it("does not cap cuts on a model that states no limit", () => {
    expect(checkLadder(cuts(1, 1, 1, 1, 1, 1, 1, 1, 1, 1), omni)).toEqual({ ok: true });
  });

  it("refuses a cut under the model's floor", () => {
    expect(checkLadder([{ seconds: 0 }, { seconds: 5 }], omni).ok).toBe(false);
  });

  it("refuses an empty ladder rather than calling it 0s", () => {
    expect(checkLadder([], omni).ok).toBe(false);
  });
});

describe("multishotRestrictionReason", () => {
  it("names the plan's model and offers the other one", () => {
    const forKling = multishotRestrictionReason(KLING_OMNI_MODEL_ID);
    expect(forKling).toContain("Kling 3.0 Omni");
    expect(forKling).toContain("Gemini Omni 1.1");
    expect(forKling).toContain("regenerate");
  });

  // Reads correctly BOTH ways round. A sentence built by hand for one direction reads as correct
  // while being exactly backwards in the other, and nothing but this test would catch it.
  it("swaps the two names when the plan is for Omni", () => {
    const forOmni = multishotRestrictionReason(GEMINI_OMNI_MODEL_ID);
    expect(forOmni).toContain("written for Gemini Omni 1.1");
    expect(forOmni).toContain("Kling 3.0 Omni");
    expect(forOmni).not.toContain("written for Kling");
  });

  // With a third model the sentence must not name only one alternative as if it were the only one.
  it("does not enumerate alternatives when there is more than one", () => {
    if (MULTISHOT_MODELS.length > 2) {
      expect(multishotRestrictionReason(KLING_OMNI_MODEL_ID)).toContain("Multishot node");
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```
npx vitest run src/lib/nodes/__tests__/multishot-models.test.ts
```

Expected: FAIL — `Failed to resolve import "../multishot-models"`.

- [ ] **Step 3: Write the module**

Create `src/lib/nodes/multishot-models.ts`:

```ts
// D235 — what each multishot model allows. This table replaces OMNI_MAX_SECONDS as the cut
// ladder's ceiling.
//
// One constant could describe one model. Kling 3.0 Omni allows 15s where Omni allows 10, caps
// cuts at 6 where Omni states no limit, and caps a beat at 512 characters where Omni states
// nothing — so the ceiling became a lookup.
//
// `null` means THE VENDOR STATES NO LIMIT, and is deliberately not a large sentinel number: a
// limit we invented and a limit they published must not be indistinguishable at the call site.
//
// NOT parameterised by this table: `group-shots.ts`. Fan-out packing runs when a script is parsed,
// before any Multishot node exists and therefore before a model is chosen. It keeps packing to
// Omni's 10s, which is the safe floor — a group that fits Omni also fits Kling, so switching a
// node to Kling afterwards only ever grants headroom.
import {
  GEMINI_OMNI_MODEL_ID,
  KLING_OMNI_MODEL_ID,
} from "@/lib/video-gen/client-models";

export type MultishotCapability = {
  /** A video-gen client model id. Video Gen generates the ladder on exactly this model. */
  id: string;
  /** Operator-facing, and the name the restriction sentence uses. */
  label: string;
  minTotalSeconds: number;
  maxTotalSeconds: number;
  minCutSeconds: number;
  /** Hard cap on cuts per generation. `null` = no limit the vendor states. */
  maxCuts: number | null;
  /** Per-beat and whole-prompt character ceilings. `null` = none stated. */
  maxCutChars: number | null;
  maxPromptChars: number | null;
  /**
   * How `renderPlan` lays the beats out (D238).
   *   timecode — `[0-2s] …` cumulative ladder, one line per beat (Omni)
   *   triple   — `shot n, m, words;` (Kling's API format — NOT its console syntax)
   */
  shotFormat: "timecode" | "triple";
  /** First index a reference token carries: `<IMAGE_REF_0>` vs `@image_1`. */
  refTokenBase: 0 | 1;
};

export const MULTISHOT_MODELS: MultishotCapability[] = [
  {
    id: GEMINI_OMNI_MODEL_ID,
    label: "Gemini Omni 1.1",
    minTotalSeconds: 3,
    maxTotalSeconds: 10,
    minCutSeconds: 1,
    maxCuts: null,
    maxCutChars: null,
    maxPromptChars: null,
    shotFormat: "timecode",
    refTokenBase: 0,
  },
  {
    id: KLING_OMNI_MODEL_ID,
    label: "Kling 3.0 Omni",
    minTotalSeconds: 3,
    maxTotalSeconds: 15,
    minCutSeconds: 1,
    // All three are the vendor's own published rejections, not house style.
    maxCuts: 6,
    maxCutChars: 512,
    maxPromptChars: 3072,
    shotFormat: "triple",
    refTokenBase: 1,
  },
];

export const DEFAULT_MULTISHOT_MODEL = GEMINI_OMNI_MODEL_ID;

/**
 * The capability for a node's `targetModel`.
 *
 * An absent id is every Multishot node that existed before the field did, so the fallback is not
 * defensive padding — it IS the migration, and it is why no data is backfilled. An UNKNOWN id
 * (a model pruned from the roster) falls back the same way rather than throwing, mirroring
 * `resolveVideoModelId`.
 */
export function multishotCapabilityFor(
  targetModel: string | undefined | null,
): MultishotCapability {
  return (
    MULTISHOT_MODELS.find((m) => m.id === targetModel) ??
    MULTISHOT_MODELS.find((m) => m.id === DEFAULT_MULTISHOT_MODEL)!
  );
}

export type LadderCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether this ladder is legal on this model.
 *
 * The reason is operator-facing and is shown verbatim on the Multishot node, the Multishot focus
 * view and Video Gen's disabled Generate — one sentence, written once, so the three surfaces
 * cannot describe the same violation three different ways.
 *
 * Reports the FIRST violation only. An operator fixes one thing at a time, and a stacked list of
 * everything wrong with a ladder reads as a failure rather than as an instruction.
 */
export function checkLadder(
  cuts: { seconds: number }[],
  cap: MultishotCapability,
): LadderCheck {
  if (cuts.length === 0) {
    return { ok: false, reason: "This sequence has no shots." };
  }
  if (cap.maxCuts !== null && cuts.length > cap.maxCuts) {
    return {
      ok: false,
      reason: `${cuts.length} shots · ${cap.label} allows ${cap.maxCuts}. Regroup the shots on the Script.`,
    };
  }
  const short = cuts.find((c) => c.seconds < cap.minCutSeconds);
  if (short) {
    return { ok: false, reason: `Every shot must be at least ${cap.minCutSeconds}s.` };
  }
  const total = cuts.reduce((sum, c) => sum + c.seconds, 0);
  if (total < cap.minTotalSeconds) {
    return { ok: false, reason: `${total}s · ${cap.label} needs at least ${cap.minTotalSeconds}s.` };
  }
  if (total > cap.maxTotalSeconds) {
    return { ok: false, reason: `${total}s · ${cap.label} allows ${cap.maxTotalSeconds}s.` };
  }
  return { ok: true };
}

/**
 * D239 — the sentence under Video Gen's locked model chip.
 *
 * It states which model THIS PLAN was written for and names the one action that changes it. The
 * old copy explained a capability ("only Omni can generate a multi-shot plan"), which stopped
 * being true the moment there were two multishot models.
 *
 * Built from MULTISHOT_MODELS rather than a hardcoded pair: with exactly one alternative it names
 * it, and with more than one it points at the node instead of listing them. A third model must not
 * silently produce a sentence that names only one way out.
 */
export function multishotRestrictionReason(targetModel: string | undefined | null): string {
  const cap = multishotCapabilityFor(targetModel);
  const others = MULTISHOT_MODELS.filter((m) => m.id !== cap.id);
  const route =
    others.length === 1
      ? `to generate on ${others[0].label}, switch the Multishot node's model and regenerate the prompt`
      : "to use another model, switch the Multishot node's model and regenerate the prompt";
  return `Connected to a Multishot Prompt written for ${cap.label}. The shot format is model-specific — ${route}.`;
}
```

- [ ] **Step 4: Run the tests**

```
npx vitest run src/lib/nodes/__tests__/multishot-models.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```
git add src/lib/nodes/multishot-models.ts src/lib/nodes/__tests__/multishot-models.test.ts
git commit -F <scratchpad>/msg.txt
```

Message: `feat(multishot): a capability table, not a constant (D235)`.

---

## Task 3: The cut ladder takes a capability

**Files:**
- Modify: `src/lib/nodes/multishot-cuts.ts`
- Modify: `src/lib/nodes/__tests__/multishot-cuts.test.ts`

**Interfaces:**
- Consumes: `MultishotCapability`, `multishotCapabilityFor` (Task 2).
- Produces: `clampTotal(seconds, cap)`, `headroomOf(cuts, cap)`, `maxSecondsFor(cuts, index, cap)`, `resizeCut(cuts, index, seconds, cap)`, `addCut(cuts, cap)`. `totalOf`, `newCut`, `cutsFromShots`, `shotsFromCuts`, `removeCut` and `MIN_CUT_SECONDS` keep their current signatures.

- [ ] **Step 1: Rewrite the module header**

The header states the module's guarantees in terms of `OMNI_MAX_SECONDS`. That is the module's contract, not a passing comment, so it is rewritten rather than patched. Replace lines 1–28 of `src/lib/nodes/multishot-cuts.ts` with:

```ts
// The Multishot node's cut list (D230, D235). One shared ceiling, no separate "total" to
// reconcile (operator request 2026-09-03).
//
// The model, in one line: **the ladder may run up to the TARGET MODEL's `maxTotalSeconds`, and
// each cut grows into whatever is unspent.** There is no Total control — the clip's length simply
// IS the sum of its cuts, so there are never two numbers to keep in agreement.
//
// The ceiling is a parameter, not a constant (D235). Every function that spends against it takes
// a `MultishotCapability`; callers get one from `multishotCapabilityFor(node.targetModel)`. There
// is deliberately no default value on that parameter — a caller that forgets it would silently
// get Omni's 10s, which on a Kling node is a ladder the operator cannot fill and no test would
// notice. Making it required means the compiler enumerates every call site.
//
// What this module guarantees, for a given capability `cap`:
//   - every cut's `seconds >= cap.minCutSeconds`
//   - `totalOf(cuts) <= cap.maxTotalSeconds` after any mutation
//   - **resizing a cut NEVER changes another cut**
//
// That last one is the operator's explicit requirement, and it is why there is no
// redistribution: a slider that silently moves a different slider is a surprise, and a surprise
// in a control that decides what gets billed is worse than a limit you can see. When the ladder
// is full, a cut simply stops growing and the view says to shorten another one — the limit is
// stated rather than worked around.
//
// SWITCHING MODELS DOES NOT MUTATE THE LADDER (D237). Nothing here re-clamps an existing ladder
// when `targetModel` changes: a 14s Kling ladder switched to Omni keeps its cuts, and
// `checkLadder` (multishot-models.ts) reports the violation instead. Silent clamping is the same
// surprise as redistribution, one level up.
//
// History, so nobody reintroduces a solved argument: this replaced a fixed-budget model where
// cuts traded seconds pairwise, and then a two-number model with an explicit Total plus a
// remainder and a "Fit to total" action. Both were rejected for the same reason — they made one
// control's movement depend on another's.
import type { ReelShot } from "./reel-script";
import { shotSeconds } from "./group-shots";
import type { MultishotCapability } from "./multishot-models";
```

- [ ] **Step 2: Keep `MIN_CUT_SECONDS`, and say why it survives**

It has one remaining caller — `cutsFromShots`, which runs at parse time before any model is chosen, exactly like `group-shots.ts`. Replace its comment:

```ts
/**
 * The parse-time cut floor.
 *
 * Kept as a constant on purpose, for the same reason `group-shots.ts` is not parameterised:
 * `cutsFromShots` runs when a script is parsed, before any Multishot node exists and therefore
 * before a model is chosen. Both capabilities declare `minCutSeconds: 1`, so this agrees with
 * both today; if a model ever declares a higher floor, `checkLadder` reports the violation on a
 * node built before that model was chosen, which is the correct place for it to surface.
 *
 * Every OTHER floor check reads `cap.minCutSeconds`. Do not reintroduce this constant into them.
 */
export const MIN_CUT_SECONDS = 1;
```

- [ ] **Step 3: Thread the capability through the four ceiling-aware functions**

```ts
/** Clamps a seconds value into the target model's window. Used when seeding a node's stored total. */
export function clampTotal(seconds: number, cap: MultishotCapability): number {
  return Math.min(cap.maxTotalSeconds, Math.max(cap.minTotalSeconds, Math.round(seconds)));
}

/** How many seconds are still unspent under the ceiling. Zero once the ladder is full. */
export function headroomOf(cuts: MultishotCut[], cap: MultishotCapability): number {
  return Math.max(0, cap.maxTotalSeconds - totalOf(cuts));
}

export function maxSecondsFor(
  cuts: MultishotCut[],
  index: number,
  cap: MultishotCapability,
): number {
  if (index < 0 || index >= cuts.length) return 0;
  return Math.max(cap.minCutSeconds, cuts[index].seconds + headroomOf(cuts, cap));
}

export function resizeCut(
  cuts: MultishotCut[],
  index: number,
  seconds: number,
  cap: MultishotCapability,
): MultishotCut[] {
  if (index < 0 || index >= cuts.length) return cuts;

  const next = Math.max(
    cap.minCutSeconds,
    Math.min(Math.round(seconds), maxSecondsFor(cuts, index, cap)),
  );
  if (next === cuts[index].seconds) return cuts;

  return cuts.map((c, i) => (i === index ? { ...c, seconds: next } : c));
}

export function addCut(cuts: MultishotCut[], cap: MultishotCapability): MultishotCut[] {
  if (headroomOf(cuts, cap) < cap.minCutSeconds) return cuts;
  // Also refused once the model's cut cap is reached — on Kling a 7th cut is a rejection, not a
  // quality hint. `addCut` has no caller today (see below) but must not be the one path that
  // builds an illegal ladder when it gets one.
  if (cap.maxCuts !== null && cuts.length >= cap.maxCuts) return cuts;
  return [...cuts, newCut("", cap.minCutSeconds)];
}
```

Keep each function's existing doc comment above it, editing only the sentences that name `OMNI_MAX_SECONDS` to name the capability instead. `maxSecondsFor`'s long "NOT the Slider's max" note stays — it is still true, with `cap.maxTotalSeconds` in place of the constant.

- [ ] **Step 4: Update the existing tests**

In `src/lib/nodes/__tests__/multishot-cuts.test.ts`, replace the `OMNI_MAX_SECONDS` / `OMNI_MIN_SECONDS` import (line 16) with:

```ts
import { multishotCapabilityFor } from "../multishot-models";
import { GEMINI_OMNI_MODEL_ID, KLING_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

const OMNI = multishotCapabilityFor(GEMINI_OMNI_MODEL_ID);
const KLING = multishotCapabilityFor(KLING_OMNI_MODEL_ID);
const OMNI_MAX_SECONDS = OMNI.maxTotalSeconds;
const OMNI_MIN_SECONDS = OMNI.minTotalSeconds;
```

Aliasing the two names keeps every existing assertion readable and unchanged in meaning; pass `OMNI` as the new last argument at each call site. Do not weaken any existing assertion — if one fails, the implementation is wrong, not the test.

- [ ] **Step 5: Add the two-capability tests**

Append to the same file:

```ts
describe("the ceiling is the model's, not a constant", () => {
  it("lets a cut grow to 15s on Kling and stops at 10s on Omni", () => {
    expect(secondsOf(resizeCut(cuts(5), 0, 20, KLING))).toEqual([15]);
    expect(secondsOf(resizeCut(cuts(5), 0, 20, OMNI))).toEqual([10]);
  });

  it("reports Kling's larger headroom for the same ladder", () => {
    expect(headroomOf(cuts(4, 4), OMNI)).toBe(2);
    expect(headroomOf(cuts(4, 4), KLING)).toBe(7);
  });

  it("clamps a stored total into each model's own window", () => {
    expect(clampTotal(99, OMNI)).toBe(10);
    expect(clampTotal(99, KLING)).toBe(15);
    expect(clampTotal(0, KLING)).toBe(3);
  });

  // D237 — a ladder built on the wider model is LEFT ALONE by the narrower one's functions.
  // Nothing here re-clamps on switch; only checkLadder reports it.
  it("does not shrink an over-window ladder just because it was read with a tighter capability", () => {
    const wide = cuts(7, 7);
    expect(secondsOf(resizeCut(wide, 0, 7, OMNI))).toEqual([7, 7]);
    expect(headroomOf(wide, OMNI)).toBe(0);
  });

  it("refuses a 7th cut on Kling and allows it on Omni", () => {
    const six = cuts(1, 1, 1, 1, 1, 1);
    expect(addCut(six, KLING)).toHaveLength(6);
    expect(addCut(six, OMNI)).toHaveLength(7);
  });
});
```

- [ ] **Step 6: Run**

```
npx vitest run src/lib/nodes/__tests__/multishot-cuts.test.ts
```

Expected: PASS.

- [ ] **Step 7: Typecheck to find the remaining call sites**

```
npx tsc --noEmit
```

Expected: FAIL, listing every caller of the changed functions. **Do not fix them here** — they belong to Tasks 6 and 9, which change those files for their own reasons. Write the list into your commit body so the next task knows what is waiting. The known set is `src/components/nodes/multishot-node.tsx` and `src/components/nodes/multishot-focus-view.tsx`; if `tsc` names any others, say so in the commit.

- [ ] **Step 8: Commit**

```
git add src/lib/nodes/multishot-cuts.ts src/lib/nodes/__tests__/multishot-cuts.test.ts
git commit -F <scratchpad>/msg.txt
```

Message: `refactor(multishot): the cut ladder's ceiling is the model's (D235)` — body listing the call sites `tsc` still reports and naming Tasks 6 and 9 as their owners.

---

## Task 4: Kling's reference-token dialect

**Files:**
- Modify: `src/lib/nodes/prompt-token-dialect.ts`
- Modify: `src/lib/nodes/__tests__/prompt-token-dialect.test.ts`

**Interfaces:**
- Consumes: `MultishotCapability` (Task 2) — **as a type-only import**, so there is no runtime cycle.
- Produces: `klingImageDialect(orderedIds: string[]): TokenDialect`, `dialectForCapability(cap: MultishotCapability, orderedIds: string[]): TokenDialect`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/nodes/__tests__/prompt-token-dialect.test.ts`:

```ts
import { klingImageDialect, dialectForCapability } from "../prompt-token-dialect";
import { multishotCapabilityFor } from "../multishot-models";
import { GEMINI_OMNI_MODEL_ID, KLING_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

describe("klingImageDialect", () => {
  const d = klingImageDialect(["a", "b"]);

  it("is ONE-based, where imageRefDialect is zero-based", () => {
    expect(d.tokenForId("a", "A")).toBe("@image_1");
    expect(d.tokenForId("b", "B")).toBe("@image_2");
  });

  it("parses its own tokens back to the right ids", () => {
    const segs = d.parse("a hand lifts the @image_1 beside the @image_2");
    const mentions = segs.filter((s) => s.kind === "mention");
    expect(mentions.map((m: any) => m.id)).toEqual(["a", "b"]);
  });

  it("round-trips byte-exact", () => {
    const text = "the @image_2 rests on oak, the @image_1 just visible";
    expect(serializeSegments(d.parse(text), d)).toBe(text);
  });

  // @image_10 must not be read as @image_1 followed by a literal "0".
  it("does not truncate a two-digit index", () => {
    const wide = klingImageDialect(Array.from({ length: 12 }, (_, i) => `id${i}`));
    const segs = wide.parse("@image_10");
    expect(segs).toHaveLength(1);
    expect((segs[0] as any).id).toBe("id9");
  });

  it("keeps an unknown id's original text rather than rewriting it", () => {
    const segs = d.parse("@image_9");
    expect(serializeSegments(segs, d)).toBe("@image_9");
  });

  it("returns null for an id that is not attached", () => {
    expect(d.tokenForId("nope", "Nope")).toBeNull();
  });

  // The two dialects share a text field's worth of prose. Neither may claim the other's tokens.
  it("does not read Omni's tokens, and imageRefDialect does not read Kling's", () => {
    expect(d.parse("<IMAGE_REF_0>").every((s) => s.kind === "text")).toBe(true);
    expect(imageRefDialect(["a", "b"]).parse("@image_1").every((s) => s.kind === "text")).toBe(true);
  });
});

describe("dialectForCapability", () => {
  it("gives each model its own token shape", () => {
    const omni = dialectForCapability(multishotCapabilityFor(GEMINI_OMNI_MODEL_ID), ["a"]);
    const kling = dialectForCapability(multishotCapabilityFor(KLING_OMNI_MODEL_ID), ["a"]);
    expect(omni.tokenForId("a", "A")).toBe("<IMAGE_REF_0>");
    expect(kling.tokenForId("a", "A")).toBe("@image_1");
  });
});
```

Make sure `serializeSegments` and `imageRefDialect` are imported at the top of the file — they may already be.

- [ ] **Step 2: Run it and watch it fail**

```
npx vitest run src/lib/nodes/__tests__/prompt-token-dialect.test.ts
```

Expected: FAIL — `klingImageDialect is not a function`.

- [ ] **Step 3: Implement**

Add to the top of `src/lib/nodes/prompt-token-dialect.ts`:

```ts
// Type-only: erased at compile time, so multishot-models.ts and this module have no runtime cycle.
import type { MultishotCapability } from "./multishot-models";
```

Append to the file:

```ts
// `\d+` then a boundary — `@image_10` must parse as index 10, not as `@image_1` plus a literal
// "0". The greedy digit run is what guarantees that; do not "tighten" it to `\d`.
const KLING_IMAGE_RE = /@image_(\d+)/g;

/**
 * `@image_N` — Kling's own handle syntax, ONE-based over the attached references.
 *
 * Kling numbers its `contents[].id` fields `image_1`, `image_2`, … (see `buildKlingContents` in
 * providers/kling.ts, which already emits exactly that), so a handle in the prompt binds to a
 * `refer_image` by name rather than by position. Omni's `<IMAGE_REF_N>` is zero-based over the
 * same list. That one-off difference is the entire reason this is a second dialect and not a
 * parameter: getting it wrong binds every citation to its neighbour, silently, in a paid clip.
 *
 * Structured to mirror `imageRefDialect` line for line — same `orderedIds` contract, same
 * unknown-id behaviour (echo the original text rather than rewriting it), same chip label. Read
 * them side by side; a divergence between them is a bug in one of them.
 */
export function klingImageDialect(orderedIds: string[]): TokenDialect {
  const indexOf = new Map(orderedIds.map((id, i) => [id, i]));
  return {
    parse(value) {
      if (!value) return [];
      const segments: Segment[] = [];
      let last = 0;
      for (const m of value.matchAll(KLING_IMAGE_RE)) {
        const at = m.index ?? 0;
        if (at > last) segments.push({ kind: "text", text: value.slice(last, at) });
        const i = Number(m[1]) - 1; // 1-based on the wire, 0-based in orderedIds
        segments.push({ kind: "mention", label: m[0], id: orderedIds[i] ?? `__missing_${i}` });
        last = at + m[0].length;
      }
      if (last < value.length) segments.push({ kind: "text", text: value.slice(last) });
      return segments;
    },
    tokenOf(segment) {
      const i = indexOf.get(segment.id);
      return i === undefined ? segment.label : `@image_${i + 1}`;
    },
    tokenForId(id) {
      const i = indexOf.get(id);
      return i === undefined ? null : `@image_${i + 1}`;
    },
    chipLabel: (segment, upstreamLabel) => upstreamLabel ?? segment.label,
  };
}

/**
 * The dialect a multishot beat is stored in, given its node's target model.
 *
 * One call site per editor instead of a conditional at each — the editor is one component and the
 * difference between models belongs here, which is what this module exists for.
 */
export function dialectForCapability(
  cap: MultishotCapability,
  orderedIds: string[],
): TokenDialect {
  return cap.refTokenBase === 1 ? klingImageDialect(orderedIds) : imageRefDialect(orderedIds);
}
```

- [ ] **Step 4: Run**

```
npx vitest run src/lib/nodes/__tests__/prompt-token-dialect.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib/nodes/prompt-token-dialect.ts src/lib/nodes/__tests__/prompt-token-dialect.test.ts
git commit -F <scratchpad>/msg.txt
```

Message: `feat(multishot): @image_N dialect for Kling references`.

---

## Task 5: Render the plan per model

**Files:**
- Modify: `src/lib/nodes/multishot-plan.ts`
- Modify: `src/lib/nodes/__tests__/multishot-plan.test.ts`

**Interfaces:**
- Consumes: `MultishotCapability`, `multishotCapabilityFor` (Task 2).
- Produces: `renderPlan(plan, cuts, cap)`, `refsCitedIn(text, cap)`, `checkPlanLimits(plan, cuts, cap): LadderCheck`.

**A deliberate reading of the spec, stated so a reviewer can reject it if they disagree.** Spec §6 says "`renderPlan` … returns them as a validation failure rather than sending an over-long prompt". Taken literally that changes `renderPlan`'s return type, and `renderPlan` is also the **display** path — the Multishot Prompt focus view renders it live while the operator types. A display function that returns a failure object instead of text would blank the panel at exactly the moment the operator is trying to read the text they need to shorten. So: `renderPlan` keeps returning a string and always renders, and `checkPlanLimits` is the separate gate the money path calls. Same guarantee, at the right seam.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/nodes/__tests__/multishot-plan.test.ts`:

```ts
import { checkPlanLimits } from "../multishot-plan";
import { multishotCapabilityFor } from "../multishot-models";
import { GEMINI_OMNI_MODEL_ID, KLING_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

const OMNI = multishotCapabilityFor(GEMINI_OMNI_MODEL_ID);
const KLING = multishotCapabilityFor(KLING_OMNI_MODEL_ID);

const planCuts = [
  { id: "c1", text: "", seconds: 2 },
  { id: "c2", text: "", seconds: 3 },
];
const plan = {
  version: 1 as const,
  look: "Low sun from camera-left, warm grey concrete, 35mm at knee height.",
  beats: [
    { cutId: "c1", text: "A hand sweeps keys off oak." },
    { cutId: "c2", text: "A cab door swings open onto sunlit paving." },
  ],
};

describe("renderPlan per model", () => {
  it("emits Omni's cumulative timecode ladder", () => {
    expect(renderPlan(plan, planCuts, OMNI)).toBe(
      "Low sun from camera-left, warm grey concrete, 35mm at knee height.\n\n" +
        "[0-2s] A hand sweeps keys off oak.\n" +
        "[2-5s] A cab door swings open onto sunlit paving.",
    );
  });

  // D238 — the API's triple form, NOT the console's `Shot 1 (2s):`. Lowercase `shot`, comma
  // between number/seconds/text, semicolon between shots.
  it("emits Kling's shot triples with the look as leading prose", () => {
    expect(renderPlan(plan, planCuts, KLING)).toBe(
      "Low sun from camera-left, warm grey concrete, 35mm at knee height.\n\n" +
        "shot 1, 2, A hand sweeps keys off oak;\n" +
        "shot 2, 3, A cab door swings open onto sunlit paving;",
    );
  });

  it("takes durations from the CUTS, so the triples sum to the request duration", () => {
    const rendered = renderPlan(plan, planCuts, KLING);
    const seconds = [...rendered.matchAll(/^shot \d+, (\d+),/gm)].map((m) => Number(m[1]));
    expect(seconds.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("renders every cut even when the plan is missing a beat for one", () => {
    const short = { ...plan, beats: [plan.beats[0]] };
    expect(renderPlan(short, planCuts, KLING)).toContain("shot 2, 3,");
  });

  // Beat text is prose an operator edits. A stray semicolon would split one shot into two on
  // Kling's parser, silently changing the cut count.
  it("strips semicolons from Kling beat text", () => {
    const risky = {
      ...plan,
      beats: [{ cutId: "c1", text: "keys land; the hand withdraws" }, plan.beats[1]],
    };
    const rendered = renderPlan(risky, planCuts, KLING);
    expect(rendered).toContain("shot 1, 2, keys land, the hand withdraws;");
    expect(rendered.match(/;/g)).toHaveLength(2); // one terminator per shot, no more
  });
});

describe("checkPlanLimits", () => {
  it("passes a plan inside the model's budgets", () => {
    expect(checkPlanLimits(plan, planCuts, KLING)).toEqual({ ok: true });
  });

  it("passes anything on a model that states no limits", () => {
    const huge = { ...plan, beats: [{ cutId: "c1", text: "x".repeat(9000) }, plan.beats[1]] };
    expect(checkPlanLimits(huge, planCuts, OMNI)).toEqual({ ok: true });
  });

  it("refuses a beat over 512 characters, naming the shot", () => {
    const long = { ...plan, beats: [{ cutId: "c1", text: "x".repeat(513) }, plan.beats[1]] };
    const res = checkPlanLimits(long, planCuts, KLING);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toContain("Shot 1");
      expect(res.reason).toContain("512");
    }
  });

  it("refuses a whole prompt over 3072 characters", () => {
    const long = {
      ...plan,
      look: "y".repeat(3000),
      beats: [{ cutId: "c1", text: "x".repeat(400) }, { cutId: "c2", text: "x".repeat(400) }],
    };
    const res = checkPlanLimits(long, planCuts, KLING);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("3072");
  });

  // Measured on what is actually SENT, not on the raw beats: the rendered string carries the
  // look, the triples and their punctuation, and that is the string the 3072 cap applies to.
  it("measures the rendered prompt, not the sum of the beats", () => {
    const res = checkPlanLimits(
      { ...plan, look: "z".repeat(3060) },
      planCuts,
      KLING,
    );
    expect(res.ok).toBe(false);
  });
});

describe("refsCitedIn per model", () => {
  it("finds Omni's zero-based tokens and not Kling's", () => {
    expect(refsCitedIn("the <IMAGE_REF_1> and <IMAGE_REF_0>", OMNI)).toEqual([1, 0]);
    expect(refsCitedIn("the @image_1", OMNI)).toEqual([]);
  });

  // Returned ZERO-BASED for both, because the caller indexes promptRefImages with it.
  it("finds Kling's one-based tokens and returns zero-based indexes", () => {
    expect(refsCitedIn("the @image_1 and @image_2", KLING)).toEqual([0, 1]);
    expect(refsCitedIn("the <IMAGE_REF_0>", KLING)).toEqual([]);
  });
});
```

Update the file's existing `renderPlan` and `refsCitedIn` tests to pass `OMNI` as the new last argument. Do not weaken them.

- [ ] **Step 2: Run and watch it fail**

```
npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts
```

Expected: FAIL — `checkPlanLimits` is not exported, and the existing calls now have too few arguments.

- [ ] **Step 3: Implement**

In `src/lib/nodes/multishot-plan.ts`, add the imports:

```ts
import type { MultishotCapability, LadderCheck } from "./multishot-models";
```

Replace `renderPlan` and `refsCitedIn` with:

```ts
/**
 * The compiled prompt: the look, a blank line, then the beats in the target model's own format.
 *
 * One function for both the string sent to the model and the ordering the breakup view renders,
 * so the look cannot end up in two different places.
 *
 * Times are cumulative (Omni) or per-shot (Kling) but come from the CUTS in both cases, never
 * from the plan — which is what makes the ladder agree with the request's duration by
 * construction rather than by check.
 *
 * ALWAYS RETURNS A STRING, including for a plan that violates the model's character budgets. This
 * is the display path as well as the send path: the focus view renders it live while the operator
 * types, and blanking the panel at the moment they are trying to read the text they need to
 * shorten would be the worst possible time to withhold it. `checkPlanLimits` below is the gate the
 * money path calls.
 */
export function renderPlan(
  plan: MultishotPlan,
  cuts: MultishotCut[],
  cap: MultishotCapability,
): string {
  const byId = new Map(plan.beats.map((b) => [b.cutId, b.text]));

  if (cap.shotFormat === "triple") {
    // D238 — Kling's API format: lowercase `shot`, a comma-separated triple of number, seconds
    // and text, semicolon-terminated. NOT the `Shot N (Xs):` form in kling-omni-system-prompt.md
    // and the CHUPPS reference — those are the web console's syntax, and sending them would put
    // prose in front of a parser that then reads the whole prompt as ONE shot. A wrong-but-
    // accepted payload is the failure mode that does not announce itself.
    //
    // The look leads as prose. Kling's format has no slot for it and repeating a ~300-character
    // look inside every beat would eat most of the 512-character budget six times over. This is
    // the spec's one acknowledged guess (§6) — if the first real generation shows it ignored or
    // absorbed into shot 1, fold a compressed look into each beat instead.
    const shots = cuts
      .map((cut, i) => {
        // A semicolon inside beat prose would terminate the shot early and silently change the
        // cut count. Commas are safe: only the first two are structural, and the parser takes the
        // rest of the triple as text.
        const text = (byId.get(cut.id) ?? "").trim().replace(/;/g, ",");
        return `shot ${i + 1}, ${cut.seconds}, ${text};`;
      })
      .join("\n");
    return `${plan.look.trim()}\n\n${shots}`;
  }

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
const KLING_IMAGE_REF = /@image_(\d+)/g;

/**
 * Which references a beat cites, derived from its own text, in the target model's token shape.
 *
 * Since D233 these are the OPERATOR's citations, not the writer's: the model is forbidden from
 * assigning tokens itself and names the product in prose instead, so a token in a beat got there
 * by someone `@`-mentioning a reference in the editor.
 *
 * ALWAYS ZERO-BASED on the way out, whatever the model's wire format. Callers use the result to
 * index `promptRefImages`, so returning Kling's 1-based numbers would mark the wrong reference as
 * uncited — off by one, on a display that exists to catch exactly that class of mistake.
 */
export function refsCitedIn(text: string, cap: MultishotCapability): number[] {
  const seen = new Set<number>();
  if (cap.refTokenBase === 1) {
    for (const match of text.matchAll(KLING_IMAGE_REF)) seen.add(Number(match[1]) - 1);
  } else {
    for (const match of text.matchAll(IMAGE_REF)) seen.add(Number(match[1]));
  }
  return [...seen];
}

/**
 * Whether this plan fits the target model's character budgets.
 *
 * Separate from `renderPlan` on purpose — see that function's note. The whole-prompt figure is
 * measured on the RENDERED string, because that is what is actually sent: the look, the triples
 * and their punctuation all count against the 3072.
 *
 * A model that states no character limits (`null`) passes everything. `null` is not "unknown, so
 * guess a number" — it is "the vendor publishes no ceiling", and inventing one here would refuse
 * prompts Omni accepts.
 */
export function checkPlanLimits(
  plan: MultishotPlan,
  cuts: MultishotCut[],
  cap: MultishotCapability,
): LadderCheck {
  if (cap.maxCutChars !== null) {
    const byId = new Map(plan.beats.map((b) => [b.cutId, b.text]));
    for (const [i, cut] of cuts.entries()) {
      const text = (byId.get(cut.id) ?? "").trim();
      if (text.length > cap.maxCutChars) {
        return {
          ok: false,
          reason: `Shot ${i + 1} is ${text.length} characters · ${cap.label} allows ${cap.maxCutChars}. Shorten it, or rewrite that shot with AI.`,
        };
      }
    }
  }

  if (cap.maxPromptChars !== null) {
    const rendered = renderPlan(plan, cuts, cap);
    if (rendered.length > cap.maxPromptChars) {
      return {
        ok: false,
        reason: `The whole prompt is ${rendered.length} characters · ${cap.label} allows ${cap.maxPromptChars}. Shorten the look block or the longest shots.`,
      };
    }
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run**

```
npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```
npx tsc --noEmit
```

Expected: FAIL at the `renderPlan` / `refsCitedIn` callers — `src/lib/video-gen/resolve-prompt.ts`, `src/app/api/nodes/[id]/multishot-prompt/route.ts`, `src/components/nodes/multishot-prompt-focus-view.tsx`. Leave them; Tasks 7–9 own those files. Record the list in the commit body.

- [ ] **Step 6: Commit**

```
git add src/lib/nodes/multishot-plan.ts src/lib/nodes/__tests__/multishot-plan.test.ts
git commit -F <scratchpad>/msg.txt
```

Message: `feat(multishot): render shot triples for Kling, timecodes for Omni (D238)`.

---

## Task 6: `targetModel` on the Multishot node

**Files:**
- Modify: `src/lib/canvas-nodes.ts:125-145`
- Modify: `src/components/nodes/multishot-focus-view.tsx`
- Modify: `src/components/nodes/multishot-node.tsx`

**Interfaces:**
- Consumes: `multishotCapabilityFor`, `checkLadder`, `MULTISHOT_MODELS`, `DEFAULT_MULTISHOT_MODEL` (Task 2); the capability-taking `clampTotal` / `headroomOf` / `resizeCut` (Task 3).
- Produces: `MultishotNodeData.targetModel?: string`; `MultishotFocusView` gains `targetModel` and `onTargetModelChange` props.

- [ ] **Step 1: Add the data field**

In `src/lib/canvas-nodes.ts`, inside `MultishotNodeData` (after `cuts`, before `seededFrom`):

```ts
  /**
   * D236 — which multishot model this ladder is built for. A video-gen client model id.
   *
   * Absent reads as `DEFAULT_MULTISHOT_MODEL` (Gemini Omni), which is what every node that
   * predates this field already is — so there is no migration and nothing is backfilled.
   *
   * It lives HERE, upstream of the prompt and of Video Gen, because the cut ladder needs its
   * ceiling while it is being built. Video Gen inherits it (D239) rather than offering its own
   * choice: by then the plan's beats already carry one model's reference tokens.
   */
  targetModel?: string;
```

- [ ] **Step 2: Update the sibling comment that this falsifies**

`MultishotPromptNodeData`'s doc comment (line ~151) reads:

```
 * No `targetProvider` — Omni is the only multishot model, so there is nothing to pick.
```

Replace with:

```
 * No `targetProvider` — the model is chosen ONCE, upstream on the Multishot node
 * (`MultishotNodeData.targetModel`, D236), and this node reads it from there. A second copy here
 * is a second thing to keep in agreement with the ladder it was built for.
```

- [ ] **Step 3: Put the Select in the focus view header**

In `src/components/nodes/multishot-focus-view.tsx`:

Replace the `group-shots` import (line 17) with:

```ts
import {
  MULTISHOT_MODELS,
  multishotCapabilityFor,
  checkLadder,
} from "@/lib/nodes/multishot-models";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
```

**Check `src/components/ui/select.tsx` for the actual exported names before writing this import** — this is a Base UI registry build and its part names may differ from the Radix ones. Compose with the `render` prop, never `asChild`.

Add the two props:

```ts
  /** D236 — which model this ladder is built for. Absent = the default (Gemini Omni). */
  targetModel?: string;
  onTargetModelChange: (modelId: string) => void;
```

Replace the derived values (lines 68–70):

```ts
  const cap = multishotCapabilityFor(targetModel);
  const total = totalOf(cuts);
  const ladder = checkLadder(cuts, cap);
  const atCeiling = headroomOf(cuts, cap) === 0;
```

Replace the header's right slot (lines 105–120) with:

```tsx
              {/* The header's right slot, laid out exactly as every prompt focus view lays it
                  out (prompt-focus-shell.tsx, prompt-focus-view.tsx): a status readout, then the
                  guided next step, in one `flex shrink-0 items-center gap-2`. The model Select
                  leads the row because it GOVERNS the readout beside it — changing it re-derives
                  the ceiling that readout is measured against, so reading right-to-left the row
                  says "this model, this much of its budget, then what's next". */}
              <div className="flex shrink-0 items-center gap-2">
                <Select
                  value={cap.id}
                  onValueChange={(v) => onTargetModelChange(String(v))}
                  disabled={isReadOnly}
                >
                  <SelectTrigger className="h-9 w-[168px] text-sm" aria-label="Multishot model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MULTISHOT_MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums">
                    <span className={ladder.ok ? "text-foreground" : "text-destructive"}>
                      {total}s
                    </span>
                    <span className="text-muted-foreground"> / {cap.maxTotalSeconds}s max</span>
                  </p>
                  <p className="text-eyebrow mt-0.5 text-muted-foreground">{cuts.length} cuts</p>
                </div>
                <GuidedNextButton
                  sourceId={nodeId}
                  variant="button"
                  onNavigate={() => onOpenChange(false)}
                />
              </div>
```

Replace the ceiling notice (lines 135–140) so it states the actual violation when there is one — D237's whole point is that switching to a tighter model *says so* rather than clamping:

```tsx
            {/* D237 — a ladder the current model cannot take is STATED, never clamped. Switching
                a 14s Kling ladder to Omni leaves every cut exactly where the operator put it and
                puts the problem in words here. Silent clamping is the same surprise as
                redistribution, one level up. */}
            {!ladder.ok && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} />
                {ladder.reason}
              </p>
            )}
            {ladder.ok && atCeiling && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} />
                {cap.maxTotalSeconds}s maximum reached.
              </p>
            )}
```

Update the slider (lines 182–193): `min={cap.minCutSeconds}`, `max={cap.maxTotalSeconds}`, and `onValueChange={(v) => onChange(resizeCut(cuts, i, Array.isArray(v) ? v[0] : v, cap))}`. Remove the now-unused `MIN_CUT_SECONDS` import if nothing else in the file uses it. Update the slider's long comment: the fixed scale is now `1-cap.maxTotalSeconds`, not `1-10s`.

- [ ] **Step 4: Wire the node card**

In `src/components/nodes/multishot-node.tsx`:

Replace the `group-shots` import (line 16) with:

```ts
import { multishotCapabilityFor, checkLadder } from "@/lib/nodes/multishot-models";
```

**Delete `SOFT_CUT_LIMIT` and its doc comment (lines 19–20).** It was a quality hint (`"a quality signal, not a hard limit"`); on Kling 6 is a rejection. Keeping a soft 6 beside a hard 6 would mean two different sentences about the same number, and the operator could not tell which one costs money. `checkLadder` is the single source now.

Replace lines 46–57:

```ts
  const cuts = d.cuts ?? [];
  const cap = multishotCapabilityFor(d.targetModel);
  // `totalSeconds` is the stored mirror of the ladder's own length, not an independent field —
  // falls back to a fresh totalOf(cuts) only for data seeded before this field existed.
  const total = d.totalSeconds ?? totalOf(cuts);
  const ladder = checkLadder(cuts, cap);

  // There is no Total control any more, so `totalSeconds` is once again just `totalOf(cuts)` —
  // every write that changes `cuts` MUST write both in the same call, or the stored mirror goes
  // stale. A MIRROR, not a correction: it is no longer clamped (see the note below `setTargetModel`).
  const setCuts = (next: MultishotCut[]) =>
    updateNodeData(id, { cuts: next, totalSeconds: totalOf(next) });

  // D237 — switching the model changes NOTHING about the ladder. Not the cuts, and not the stored
  // mirror of their sum: `totalSeconds` must keep reporting what the cuts actually are, because
  // that is the number `checkLadder`'s violation sentence is measured against. Clamping it here
  // would make the card read "10s" while the line underneath it read "14s · Gemini Omni 1.1
  // allows 10s" — two numbers for one ladder, and the wrong one in the larger type.
  const setTargetModel = (targetModel: string) => updateNodeData(id, { targetModel });
```

If you find yourself writing `resizeCut` or `clampTotal` in this function, stop — that is D237's rejected design.

**Why `setCuts` above also dropped its `clampTotal`.** It used to write `clampTotal(totalOf(next))`, which is a no-op at the top (`resizeCut` already caps the sum) but silently rounds a 2s ladder *up* to 3 at the bottom — so a too-short ladder displayed as legal while `checkLadder` called it illegal. `totalSeconds` is a mirror, not a correction. `clampTotal` keeps its other callers and its tests; it is simply the wrong function for a mirror. If `tsc` then reports it unused in this file, drop it from the import.

Replace the status readout's colour condition (line 91) with `!ladder.ok ? "text-destructive" : "text-muted-foreground"`, and the `SOFT_CUT_LIMIT` block (lines 114–119) with:

```tsx
          {!ladder.ok && (
            <p className="mt-1.5 flex items-center gap-1 px-1.5 text-[0.6rem] text-destructive">
              <TriangleAlert className="size-3 shrink-0" strokeWidth={1.5} />
              {ladder.reason}
            </p>
          )}
```

Add the model to the card's footer line so the choice is visible without opening the node — a node whose model is only discoverable inside the focus view will be generated against the wrong one at least once:

```tsx
          <p className="px-1.5 pt-1.5 text-[0.6rem] text-muted-foreground">
            {cap.label}
            {d.seededFrom?.scriptTitle ? ` · from "${d.seededFrom.scriptTitle}"` : ""} · full script
            context
          </p>
```

Pass the two new props to `MultishotFocusView`:

```tsx
      targetModel={d.targetModel}
      onTargetModelChange={setTargetModel}
```

- [ ] **Step 5: Typecheck and lint**

```
npx tsc --noEmit
npx next lint --dir src/components/nodes --dir src/lib/nodes
```

Expected: `tsc` clean for these two files. Remaining errors should only be in `resolve-prompt.ts`, the two routes and `multishot-prompt-focus-view.tsx` (Tasks 7–9).

- [ ] **Step 6: Verify in the browser**

Start the dev server if it is not running (`npm run dev`). On a canvas with a Multishot node:

1. Open the focus view. The header shows a model Select reading **Gemini Omni 1.1** and `Ns / 10s max`.
2. Switch it to **Kling 3.0 Omni**. The readout becomes `/ 15s max` and every slider's track now runs to 15. **No cut's seconds changed.**
3. Drag a cut out to make the ladder 14s. Switch back to Gemini Omni. The cuts stay at 14s, the readout goes destructive-red, and the line under Cuts reads `14s · Gemini Omni 1.1 allows 10s.`
4. Close the sheet. The node card shows the same red total and the same sentence, and its footer names the model.

If step 3 clamps anything, D237 is violated — find the write that did it before continuing.

- [ ] **Step 7: Commit**

```
git add src/lib/canvas-nodes.ts src/components/nodes/multishot-focus-view.tsx src/components/nodes/multishot-node.tsx
git commit -F <scratchpad>/msg.txt
```

Message: `feat(multishot): choose the model on the Multishot node (D236, D237)` — body noting `SOFT_CUT_LIMIT` is deleted because 6 is now a hard cap on one model and a stated non-limit on the other.

---

## Task 7: Per-model writer prompt

**Files:**
- Modify: `src/prompts/multishot-prompt-generate.ts`
- Create: `src/prompts/multishot-prompt-kling.ts`
- Create: `src/prompts/multishot-prompt-for.ts`
- Modify: `src/lib/nodes/resolve-inputs.ts:194-231`
- Modify: `src/app/api/nodes/[id]/multishot-prompt/route.ts`
- Modify: `src/app/api/nodes/[id]/multishot-prompt/route.test.ts`

**Interfaces:**
- Consumes: `multishotCapabilityFor` (Task 2).
- Produces:
  ```ts
  // multishot-prompt-generate.ts (canonical — Kling imports these)
  export function referenceIdentificationBlock(format: "timecode" | "triple"): string;
  export const REFERENCE_IDENTIFICATION_BLOCK: string; // = referenceIdentificationBlock("timecode")
  export const MULTISHOT_SHARED_CRAFT: string;
  export type MultishotPromptSpec = { id: string; model: string; system: string; schema: object };
  // multishot-prompt-for.ts
  export function multishotPromptFor(targetModel: string | undefined | null): MultishotPromptSpec;
  // resolve-inputs.ts
  ResolvedMultishotInputs gains `targetModel: string | undefined`
  ```

- [ ] **Step 1: Make the reference block format-aware without changing Omni's text**

In `src/prompts/multishot-prompt-generate.ts`, the block's worked example (lines 29–30) shows beats with `[0-3s]` timecodes — while the prompt elsewhere says "Do NOT write timecodes". On Omni that has been harmless. In a Kling prompt it would model exactly the wrong output shape.

Turn the constant into a function whose `"timecode"` branch returns **byte-identical** text to today's constant, and keep the constant as that call so Omni's prompt does not change at all:

```ts
/**
 * How to READ an attached reference image and name what it shows — without binding it to a beat.
 *
 * Per D233 the writer never assigns reference tokens itself, on EITHER model; the operator
 * attaches a reference by `@`-mentioning it in the beat afterwards. That is why this block is
 * shared rather than per-model: the binding rule is ours, not the vendor's. Only the worked
 * example differs, because showing Omni's timecode ladder inside a Kling prompt would model the
 * one output shape that prompt forbids.
 */
export function referenceIdentificationBlock(format: "timecode" | "triple"): string {
  const example =
    format === "triple"
      ? `    A college student crosses a sunlit campus courtyard in the black CHUPPS V-Straps, bag strap swinging.
    A young professional steps past a cafe chair in the tan CHUPPS Sliders, the strap catching the light.`
      : `    [0-3s] A college student crosses a sunlit campus courtyard in the black CHUPPS V-Straps, bag strap swinging.
    [3-6s] A young professional steps past a cafe chair in the tan CHUPPS Sliders, the strap catching the light.`;

  return `REFERENCES
… (the existing text, with the two example lines replaced by \${example}) …`;
}

/** Omni's copy — byte-identical to what shipped before this became a function. */
export const REFERENCE_IDENTIFICATION_BLOCK = referenceIdentificationBlock("timecode");
```

**Do not retype the block's prose.** Move the existing string into the function and interpolate `${example}` where the two example lines were. Any other change to those paragraphs is out of scope for this task.

- [ ] **Step 2: Export the shared craft rules**

The Omni `SYSTEM` const holds several blocks Kling needs verbatim. Extract them as named exports without changing their text, and compose `SYSTEM` from them so Omni's prompt string stays identical:

```ts
/**
 * The craft rules that are OURS, not a vendor's: one action per beat, the cutting rules, physics,
 * detail, preservation. They describe how generated motion fails, which is a property of diffusion
 * video and not of one vendor's API — so both writers get them from here rather than each carrying
 * a paraphrase that drifts.
 *
 * What is deliberately NOT in here: the look-block instruction, the beat contract, and anything
 * mentioning timecodes or shot numbers. Those differ per model.
 */
export const MULTISHOT_SHARED_CRAFT = `ONE DOMINANT ACTION PER BEAT
… (verbatim from the current SYSTEM, from "ONE DOMINANT ACTION PER BEAT" through the end of
    "PRESERVATION", including the interpolated ${SUBJECT_SILENT_CAMERA}) …`;
```

Then rebuild `SYSTEM` to interpolate `MULTISHOT_SHARED_CRAFT` in place of the text you moved. **Verify byte-identity before moving on:** in a scratch Node script, import `multishotPromptGenerate` and compare `.system` against a copy of the pre-change string saved to a file. If they differ, Omni's behaviour has changed and this refactor is wrong.

Also export the spec type:

```ts
export type MultishotPromptSpec = {
  id: string;
  model: string;
  system: string;
  schema: object;
};
```

- [ ] **Step 3: Write Kling's prompt**

Create `src/prompts/multishot-prompt-kling.ts`:

```ts
// D236/D238 — Kling 3.0 Omni's multishot writer.
//
// Its own system prompt rather than Omni's with a swapped block (operator's call). What is shared
// is imported from multishot-prompt-generate.ts, the canonical file; what differs is here.
//
// The RETURN SHAPE IS IDENTICAL. This writer returns the same plan JSON — {look, beats[{cutId,
// text}]} — and never formats a shot itself. `renderPlan` turns beats into `shot n, m, words;`
// triples, so the writer is never told the wire format and cannot drift from it. That is D238's
// consequence and it is the single most important thing about this file.
import {
  MULTISHOT_SHARED_CRAFT,
  MULTISHOT_PLAN_SCHEMA,
  referenceIdentificationBlock,
  type MultishotPromptSpec,
} from "./multishot-prompt-generate";
import { MOTION_AVOID_LIST, MULTISHOT_AUTHORING_MODEL } from "./video-prompt-generate";

export const MULTISHOT_KLING_PROMPT_ID = "multishot-prompt-kling@1";

const SYSTEM = `You write the shot-by-shot motion plan for a single multi-shot video generation on Kling 3.0 Omni.

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
Return exactly one beat per shot given, echoing that shot's \\\`cutId\\\` EXACTLY as provided. Never
invent an id, never merge two shots into one beat, never split one shot across two.

KEEP EACH BEAT UNDER 512 CHARACTERS. This is the API's own per-shot ceiling, not a style
preference: a longer beat is rejected. Write to about 400 so the operator has room to add a
reference handle afterwards without going over. Count as you write — a beat you have to cut
afterwards loses the detail you chose most carefully.

THE SHOT TEXT IS THE BRIEF
The operator's shot text is what that shot IS. Your beat RENDERS it; it does not replace it. Do not
substitute a different subject, setting or action, and do not add people, props or places the shot
text does not call for.

A shot text often names more than one camera setup — "Rapid close-ups. A man picks up his keys. A
woman steps out of a cab. Someone grabs a coffee." A beat of a few seconds cannot hold four setups,
and trying is the single biggest reason a generation comes back as mush. Choose the ONE the shot
leads with, or the one its length can actually carry, and render that completely. The operator
splits the rest into their own shots when they want them.

${MULTISHOT_SHARED_CRAFT}

NAMING THINGS THE REFERENCES CARRY
Kling merges two things it cannot tell apart, so distinctness is a hard requirement here:

- Never give two different un-referenced people the same broad description. "A young woman" twice
  produces one person in two places, or a blend of both. Separate them by something the eye can
  hold — wardrobe, hair, height, what they are carrying.
- Where two visually similar products appear in the same shot, say what separates them in space:
  "the tan pair on the left of frame, the black pair on the right, a hand's width between them".
  Without a separator clause Kling returns one hybrid object.
- A referenced subject must be large enough to read — occupying a meaningful part of the frame and
  not hidden behind anything. Do not write a beat whose product is a detail in the far background.
- Do not let one name be contained inside another, and do not reuse a name that also appears as an
  ordinary word elsewhere in the beat.

Do not write on-screen text, captions, titles or signage copy into a beat. The request carries a
standing instruction against screen-space type, and asking for lettering here would contradict it.

Do NOT write timecodes, durations, shot numbers, or the words "shot 1" into the text. The timings
are the operator's and are attached to your beats afterwards; anything you write about time or
shot order will contradict them and can corrupt the shot list the API parses.

${referenceIdentificationBlock("triple")}

AVOID
${MOTION_AVOID_LIST}`;

export function multishotPromptKling(): MultishotPromptSpec {
  return {
    id: MULTISHOT_KLING_PROMPT_ID,
    model: MULTISHOT_AUTHORING_MODEL,
    system: SYSTEM,
    // The SAME schema Omni's writer answers against — the plan JSON does not vary by model, only
    // the system prompt and the renderer do (D238). Imported, never copied: the merge path
    // (`mergeRefinedPlan`) depends on this shape, and two copies of it is exactly the drift the
    // reuse rule in AGENTS.md exists to prevent.
    schema: MULTISHOT_PLAN_SCHEMA,
  };
}
```

This needs one line in `multishot-prompt-generate.ts`: the existing private `SCHEMA` const (line ~133) becomes an export named `MULTISHOT_PLAN_SCHEMA`, with `const SCHEMA = MULTISHOT_PLAN_SCHEMA` left beside it so the rest of that file and `spec.schema` are untouched.

- [ ] **Step 4: Write the router**

Create `src/prompts/multishot-prompt-for.ts`:

```ts
// Which writer a Multishot node's target model gets (D236).
//
// Its own file so the two prompt modules stay a clean DAG: generate.ts is canonical and imports
// neither, kling.ts imports generate.ts, and only this file imports both. Putting the router in
// generate.ts would make the two import each other.
import { multishotCapabilityFor } from "@/lib/nodes/multishot-models";
import { KLING_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";
import {
  multishotPromptGenerate,
  type MultishotPromptSpec,
} from "./multishot-prompt-generate";
import { multishotPromptKling } from "./multishot-prompt-kling";

/**
 * Routes on the CAPABILITY's id, not on the raw string, so an unknown or absent `targetModel`
 * lands on the same default the ladder's ceiling already used. A node cannot end up with Omni's
 * limits and Kling's prompt.
 */
export function multishotPromptFor(
  targetModel: string | undefined | null,
): MultishotPromptSpec {
  const cap = multishotCapabilityFor(targetModel);
  return cap.id === KLING_OMNI_MODEL_ID ? multishotPromptKling() : multishotPromptGenerate();
}
```

- [ ] **Step 5: Surface `targetModel` from the resolver**

In `src/lib/nodes/resolve-inputs.ts`, add to `ResolvedMultishotInputs` (line ~200):

```ts
  /** D236 — the upstream Multishot node's chosen model. Undefined = the default (Gemini Omni). */
  targetModel: string | undefined;
```

and in `resolveMultishotPromptInputs`'s return (line ~230):

```ts
  const targetModel =
    typeof source?.data.targetModel === "string" ? source.data.targetModel : undefined;

  return { clientContext, kbVersionId: kbCtx.kbVersionId, slices, upstream, cuts, targetModel };
```

- [ ] **Step 6: Route the prompt spec**

In `src/app/api/nodes/[id]/multishot-prompt/route.ts`, replace the import of `multishotPromptGenerate` (lines 5–10) with `multishotPromptFor` from `@/prompts/multishot-prompt-for`, keeping `MULTISHOT_LOOK_SCHEMA`, `MULTISHOT_BEAT_SCHEMA` and `refineInstruction` importing from `@/prompts/multishot-prompt-generate` (the refine schemas are shared).

Replace lines 94–95:

```ts
    // D236 — the writer is the target model's own. `resolved.targetModel` comes from the upstream
    // Multishot node, the single place the choice lives.
    const spec = multishotPromptFor(resolved.targetModel);
```

Add `targetModel` to `paramsUsed` (line ~157) so a version row can say which model its plan was written for — a plan whose provenance does not record that is unusable to the eval flywheel, because the two models' beats are not comparable:

```ts
          targetModel: resolved.targetModel ?? null,
```

Also add it to `generationParamsSnapshot`:

```ts
        generationParamsSnapshot: { model: spec.model, promptId: spec.id, targetModel: resolved.targetModel ?? null },
```

And update the `renderPlan` call in the success response (line 245) — it now needs a capability:

```ts
      return apiOk({
        plan: output,
        prompt: renderPlan(output, resolved.cuts, multishotCapabilityFor(resolved.targetModel)),
        versionId,
      });
```

importing `multishotCapabilityFor` from `@/lib/nodes/multishot-models`.

- [ ] **Step 7: Test the routing**

Add to `src/app/api/nodes/[id]/multishot-prompt/route.test.ts` — follow the existing mocks in that file rather than inventing a harness:

```ts
it("writes with Kling's prompt when the Multishot node targets Kling", async () => {
  // …arrange the upstream multishot node with data.targetModel = KLING_OMNI_MODEL_ID…
  const res = await POST(req, { params: Promise.resolve({ id: nodeId }) });
  expect(res.status).toBe(200);
  const systemSent = openaiCreateMock.mock.calls[0][0].messages[0].content;
  expect(systemSent).toContain("Kling 3.0 Omni");
  expect(systemSent).toContain("512 CHARACTERS");
});

it("writes with Omni's prompt when targetModel is absent", async () => {
  const res = await POST(req, { params: Promise.resolve({ id: nodeId }) });
  const systemSent = openaiCreateMock.mock.calls[0][0].messages[0].content;
  expect(systemSent).not.toContain("Kling 3.0 Omni");
});

it("records which model the plan was written for", async () => {
  await POST(req, { params: Promise.resolve({ id: nodeId }) });
  expect(insertVersionMock).toHaveBeenCalledWith(
    expect.objectContaining({
      paramsUsed: expect.objectContaining({ promptId: "multishot-prompt-kling@1" }),
    }),
  );
});
```

- [ ] **Step 8: Run**

```
npx vitest run "src/app/api/nodes/[id]/multishot-prompt/"
npx vitest run src/lib/nodes/__tests__/
```

Expected: PASS. If a pre-existing test in that route file times out, re-run that file alone before assuming you broke it — see the Global Constraints.

- [ ] **Step 9: Commit**

```
git add src/prompts/multishot-prompt-generate.ts src/prompts/multishot-prompt-kling.ts src/prompts/multishot-prompt-for.ts src/lib/nodes/resolve-inputs.ts "src/app/api/nodes/[id]/multishot-prompt/route.ts" "src/app/api/nodes/[id]/multishot-prompt/route.test.ts"
git commit -F <scratchpad>/msg.txt
```

Message: `feat(multishot): a writer per target model` — body noting Omni's system string is unchanged byte-for-byte and how you verified it.

---

## Task 8: The Multishot Prompt view speaks the target model's dialect

**Files:**
- Modify: `src/components/nodes/multishot-prompt-node.tsx:57-58`
- Modify: `src/components/nodes/multishot-prompt-focus-view.tsx`
- Modify: `src/components/nodes/multishot-beat-card.tsx`

**Interfaces:**
- Consumes: `dialectForCapability` (Task 4); `renderPlan`, `refsCitedIn` taking a capability (Task 5); `multishotCapabilityFor` (Task 2).
- Produces: `MultishotBeatCard` and `MultishotPromptFocusView` each gain a `targetModel?: string` prop.

- [ ] **Step 1: Read the file before editing it**

`src/components/nodes/multishot-prompt-focus-view.tsx` is large. Read it fully — in particular the `refsCitedIn` use around line 180, the `imageRefDialect` use around line 795, and the `renderPlan` calls. This task changes those three things and nothing else about the layout.

- [ ] **Step 2: Pass the model down from the node**

In `src/components/nodes/multishot-prompt-node.tsx`, `multishotSource` is already resolved (line 53). Beside `budget` and `cuts` (lines 57–58) add:

```ts
  // D236 — the model the ladder was built for. This node never SETS it; the choice lives on the
  // Multishot node, and reading it here is what keeps the beat editor's token syntax and the
  // rendered prompt agreeing with what will actually be generated.
  const targetModel = (multishotSource?.data as MultishotNodeData | undefined)?.targetModel;
```

and pass `targetModel={targetModel}` to `MultishotPromptFocusView` alongside `cuts`.

- [ ] **Step 3: Use the capability in the focus view**

Add the prop:

```ts
  /** D236 — read from the upstream Multishot node. Absent = the default (Gemini Omni). */
  targetModel?: string;
```

Derive once, near the top of the component:

```ts
  // One capability for the whole view: the dialect the beats are stored in, the format the prompt
  // renders in, and the token shape `refsCitedIn` scans for must all be the SAME model's. Deriving
  // them separately is how a view ends up editing @image_1 chips into a prompt rendered as a
  // timecode ladder.
  const cap = multishotCapabilityFor(targetModel);
```

Replace the `refsCitedIn` call (line ~180) with `refsCitedIn(b.text, cap)`, and every `renderPlan(...)` call in the file with `renderPlan(..., cap)`.

Replace the look editor's `dialect={imageRefDialect(refIds)}` (line ~795) with `dialect={dialectForCapability(cap, refIds)}`, and drop the now-unused `imageRefDialect` import.

- [ ] **Step 4: Same for the beat card**

In `src/components/nodes/multishot-beat-card.tsx`, replace the `imageRefDialect` import with `dialectForCapability`, add a required prop:

```ts
  /** The target model's capability — decides whether a chip stores `<IMAGE_REF_0>` or `@image_1`. */
  cap: MultishotCapability;
```

and use `dialect={dialectForCapability(cap, refIds)}` at line 130. Update the component's doc comment: the text is "the SAME chip editor the instruction uses, **in the target model's reference dialect**".

Pass `cap={cap}` from the focus view's beat loop.

- [ ] **Step 5: Typecheck and lint**

```
npx tsc --noEmit
npx next lint --dir src/components/nodes
```

Expected: clean except for Task 9's files.

- [ ] **Step 6: Verify in the browser**

On a Multishot node set to **Kling 3.0 Omni**, open its Multishot Prompt node's focus view:

1. Generate. The Output column's compiled prompt shows `shot 1, 2, …;` triples, not `[0-2s]`.
2. `@`-mention a reference inside a beat. It renders as a **picture chip**, exactly as on Omni.
3. Switch the upstream Multishot node to Gemini Omni and reopen. The same beat's chip is still a picture — but note the stored token is still `@image_1`, so it now renders as a *missing* chip. **That is expected and correct** (D239's "switching regenerates"); it is the visible form of the reason Video Gen offers no switch. Do not "fix" it by translating tokens.

- [ ] **Step 7: Commit**

```
git add src/components/nodes/multishot-prompt-node.tsx src/components/nodes/multishot-prompt-focus-view.tsx src/components/nodes/multishot-beat-card.tsx
git commit -F <scratchpad>/msg.txt
```

Message: `feat(multishot): beat editor uses the target model's token dialect`.

---

## Task 9: Video Gen inherits the choice

**Files:**
- Modify: `src/lib/video-gen/resolve-prompt.ts`
- Modify: `src/lib/video-gen/__tests__/resolve-prompt.test.ts`
- Modify: `src/lib/canvas-store.ts:165-199`
- Modify: `src/components/nodes/video-gen-focus-view.tsx:451-473, 1214-1224`
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces: `ResolvedPrompt` gains `targetModel: string | null`.

- [ ] **Step 1: Return the target model from the resolver**

In `src/lib/video-gen/resolve-prompt.ts`, add to the `ok: true` branch of `ResolvedPrompt`:

```ts
      /**
       * Only set for the multishot lane — the model the plan was WRITTEN for (D236). The route
       * generates on this, not on the node's stored `modelId`: the plan's beats carry this model's
       * reference tokens and its ladder was built against this model's window, so a request on any
       * other model is a payload built from the wrong contract.
       */
      targetModel: string | null;
```

Return `targetModel: null` on the video-prompt branch. On the multishot branch, read it beside `cuts`:

```ts
  const targetModel =
    typeof multishotNode?.data.targetModel === "string" ? multishotNode.data.targetModel : null;
  const cap = multishotCapabilityFor(targetModel);

  return {
    ok: true,
    prompt: renderPlan(plan, cuts, cap),
    promptNode,
    promptUpstream,
    cuts,
    targetModel,
  };
```

- [ ] **Step 2: Test it**

Add to `src/lib/video-gen/__tests__/resolve-prompt.test.ts`, following the canned-lookup pattern already in that file:

```ts
it("renders Kling triples when the Multishot node targets Kling", async () => {
  // …multishot node data: { cuts, targetModel: "kling:kling-3-0-omni" }…
  const res = await resolveVideoGenPrompt(upstream, fetchUpstream);
  expect(res.ok).toBe(true);
  if (res.ok) {
    expect(res.targetModel).toBe("kling:kling-3-0-omni");
    expect(res.prompt).toContain("shot 1, ");
    expect(res.prompt).not.toContain("[0-");
  }
});

it("falls back to Omni's ladder when targetModel is absent", async () => {
  const res = await resolveVideoGenPrompt(upstream, fetchUpstream);
  if (res.ok) {
    expect(res.targetModel).toBeNull();
    expect(res.prompt).toContain("[0-");
  }
});
```

Run:

```
npx vitest run src/lib/video-gen/__tests__/
```

Expected: PASS.

- [ ] **Step 3: Coerce to the inherited model on connect**

In `src/lib/canvas-store.ts`, the `onConnect` block (lines 171–194) hardcodes Omni. Replace it with a walk one level further up:

```ts
      // D236/D239 — coerce the target's STORED modelId to the model the connected plan was
      // WRITTEN for. Filtering the picker is not enforcing a constraint: D216 hid every other chip
      // but left the node's saved value alone, so a new node defaulting to Veo would have billed a
      // Veo run against a ladder Veo ignores.
      //
      // One level further than the old check, which could stop at the source's type because there
      // was only one possible answer. The choice lives on the MULTISHOT node (D236), so the walk is
      // video-gen -> multishot-prompt -> multishot. A prompt node with no Multishot upstream yet
      // falls back to the default, which is what an unconfigured node already resolves to.
      const sourceNode = get().nodes.find((n) => n.id === connection.source);
      const targetNode = get().nodes.find((n) => n.id === connection.target);
      if (sourceNode?.type === "multishot-prompt" && targetNode?.type === "video-gen") {
        const upstreamIds = get()
          .edges.filter((e) => e.target === sourceNode.id)
          .map((e) => e.source);
        const multishotNode = get().nodes.find(
          (n) => upstreamIds.includes(n.id) && n.type === "multishot",
        );
        const cap = multishotCapabilityFor(
          (multishotNode?.data as { targetModel?: string } | undefined)?.targetModel,
        );

        // Sensible defaults for the lane, not an override: 9:16 (reels are vertical) and 720p.
        // Merged into the EXISTING params object and only where the operator hasn't already chosen
        // a value — `updateNodeData` shallow-merges top-level keys, so a bare object would replace
        // `params` wholesale and wipe every other param already set.
        const existingParams = (targetNode.data as { params?: Record<string, unknown> }).params ?? {};
        get().updateNodeData(targetNode.id, {
          modelId: cap.id,
          params: {
            aspect_ratio: "9:16",
            resolution: "720p",
            ...existingParams,
          },
        });
      }
```

Replace the `GEMINI_OMNI_MODEL_ID` import on line 18 with `multishotCapabilityFor` from `@/lib/nodes/multishot-models` (keep `DEFAULT_VIDEO_CLIENT_MODEL_ID`), unless line 187's other use still needs it — check before deleting.

Update `src/lib/canvas-store.test.ts:7`, which imports `GEMINI_OMNI_MODEL_ID as OMNI_MODEL_ID`. Add a case: connecting a multishot-prompt whose upstream Multishot targets Kling sets the video-gen node's `modelId` to `kling:kling-3-0-omni`.

- [ ] **Step 4: Inherit in the focus view, and rewrite the restriction copy**

In `src/components/nodes/video-gen-focus-view.tsx`, replace the coercion block (lines 451–465):

```ts
  // D232/D236 — belt and braces, mirroring canvas-store's onConnect coercion: a node whose stored
  // modelId predates the connection would sit on a model the restricted picker no longer offers a
  // chip for, and doGenerate reads local `modelId` state directly.
  //
  // The model is now the one the connected PLAN was written for, not a constant — the beats carry
  // that model's reference tokens and the ladder was built against its window.
  //
  // Local state: React's documented "adjust state during render" pattern rather than an effect —
  // a setState setter called in the render body, gated so it fires once per divergence and
  // terminates immediately (coercing `modelId` flips the very condition being checked).
  const isMultishotPromptConnected = promptNode?.type === "multishot-prompt";
  const multishotTargetModel = isMultishotPromptConnected
    ? multishotCapabilityFor(upstreamMultishotTargetModel).id
    : undefined;
  if (
    !loadingConnected &&
    editable &&
    multishotTargetModel !== undefined &&
    modelId !== multishotTargetModel
  ) {
    setModelId(multishotTargetModel);
  }
```

`upstreamMultishotTargetModel` must be resolved from the connected Multishot node. **Read how this view obtains `promptNode` and whether it already has the grandparent's data.** If it does not, use the same `findAncestorOfType` pattern the file already uses for other upstream lookups; if there is no such helper here, resolve it from the canvas store the way `multishot-prompt-node.tsx:53` does. Do not add a fetch — this is client state that is already loaded.

Update the persisted-coercion effect just below (lines 471–473) the same way.

Then replace the picker's props (lines 1218–1223):

```tsx
                    lockedToModelId={multishotTargetModel}
                    restrictionReason={
                      isMultishotPromptConnected
                        ? multishotRestrictionReason(upstreamMultishotTargetModel)
                        : undefined
                    }
```

importing `multishotRestrictionReason` and `multishotCapabilityFor` from `@/lib/nodes/multishot-models`.

**Do not add a second chip, a disabled chip, or a tooltip.** D239: the picker shows one model and the reason line names the way out. `VideoGenModelPicker` already renders `restrictionReason` as a line under the chip (line 133–135) and needs no change.

- [ ] **Step 5: Update the picker's own stale comment**

`src/components/nodes/video-gen-model-picker.tsx`'s `lockedToModelId` doc (lines 36–47) says "A multishot plan can only generate on Omni". Replace that sentence with:

```
   * A multishot plan can only generate on the model it was WRITTEN for (D236/D239) — the others
   * are not choices, because the plan's beats carry that model's reference tokens and its ladder
   * was built against that model's window. They were briefly rendered-but-disabled so the lock
   * would be visible, but a row of dead chips is clutter on a decision already made;
   * `restrictionReason` carries the explanation instead, which is what keeps the restriction from
   * being silent.
```

- [ ] **Step 6: The server backstop — and the duration fix**

In `src/app/api/nodes/[id]/video-generate/route.ts`, after `resolved` is destructured (line 68), add:

```ts
    // D236 — the multishot lane generates on the model the PLAN was written for. A request naming
    // any other model is a payload built from the wrong contract: the beats carry the first
    // model's reference tokens and the ladder was built against its window. The client coerces;
    // a route that trusts the client is not enforcing anything, which is the mistake D232's own
    // comment records having shipped once.
    if (resolved.cuts) {
      const cap = multishotCapabilityFor(resolved.targetModel);
      if (modelId !== cap.id) {
        return apiError(
          `This multishot plan was written for ${cap.label}. Regenerate the prompt to target another model.`,
          400,
        );
      }

      const ladder = checkLadder(resolved.cuts, cap);
      if (!ladder.ok) return apiError(ladder.reason, 400);

      const limits = checkPlanLimits(
        promptNode.activeOutput as MultishotPlan,
        resolved.cuts,
        cap,
      );
      if (!limits.ok) return apiError(limits.reason, 400);

      // THE DURATION IS THE LADDER'S, NOT THE NODE'S PARAM.
      //
      // `multishot-cuts.ts`'s header has always claimed the request's duration "is derived from
      // totalOf(cuts)" and that "no generation-time balance check is needed" — but nothing tied
      // the two together, and this route read the node's own `duration` param. On Omni that meant
      // a ladder longer than the duration came back TRUNCATED at full price, which is the exact
      // failure the header says is impossible. On Kling the shot triples must sum to
      // settings.duration exactly or the request is rejected outright.
      //
      // Setting it here is what finally makes the claim true, for both models, at the one place
      // the request is actually built.
      resolvedParams.duration = totalOf(resolved.cuts);
      resolvedParams.multi_shot = true;
    }
```

`resolvedParams` is built at line 50 with `Object.fromEntries` — confirm it is a mutable object (it is) and that `duration` / `multi_shot` are among the model's param names, so the assignment is not silently dropped downstream. On Gemini Omni, `multi_shot` is not a param; guard the assignment on the key existing in `config.params`, or set it only for the Kling capability. **Read `params/gemini-omni.ts` before writing this line.**

Place the whole block **before** `insertGeneration` and `reserveCredits` (line 157), so a rejected request neither records a generation nor touches the credit balance — the same placement, and the same reason, as the D97 rules check just above it.

- [ ] **Step 7: Run the affected suites**

```
npx vitest run src/lib/video-gen/__tests__/
npx vitest run src/lib/nodes/__tests__/
npx vitest run src/lib/canvas-store.test.ts
npx tsc --noEmit
```

Expected: PASS and a clean typecheck across the whole repo. This is the task where the `tsc` errors deferred from Tasks 3 and 5 must all be gone — if any remain, they are yours.

- [ ] **Step 8: Verify the lock in the browser**

1. Multishot node on **Kling 3.0 Omni** → Multishot Prompt (generate) → connect a new Video Gen node.
2. The Video Gen node opens with the picker showing **one** chip, `3.0 Omni`, under a **Kling** heading — and briefly shows skeletons, never a full model list that then collapses.
3. Under it: *"Connected to a Multishot Prompt written for Kling 3.0 Omni. The shot format is model-specific — to generate on Gemini Omni 1.1, switch the Multishot node's model and regenerate the prompt."*
4. Switch the Multishot node to Gemini Omni. Reopen Video Gen: the chip is `Omni 1.1` and the sentence has swapped both names round.
5. Set the ladder to 14s on Kling, then switch to Gemini Omni. Video Gen's Generate is disabled and states `14s · Gemini Omni 1.1 allows 10s.`

- [ ] **Step 9: Commit**

```
git add src/lib/video-gen/resolve-prompt.ts src/lib/video-gen/__tests__/resolve-prompt.test.ts src/lib/canvas-store.ts src/lib/canvas-store.test.ts src/components/nodes/video-gen-focus-view.tsx src/components/nodes/video-gen-model-picker.tsx "src/app/api/nodes/[id]/video-generate/route.ts"
git commit -F <scratchpad>/msg.txt
```

Message: `feat(video-gen): inherit the multishot model, and derive duration from the ladder (D236, D239)` — body calling out the pre-existing duration bug this closes.

---

## Task 10: Generate one real Kling clip and write up what it does

Spec §10. Three assumptions the vendor reference does not settle, and one cheap generation settles all three. **Do not skip this** — the rest of the plan is built on them.

**Files:**
- Create: `ref/multishot-refs/2026-09-XX-kling-omni-api-findings.md` (date it the day you run it)
- Modify: `docs/superpowers/specs/2026-09-08-kling-multishot-design.md` §6/§10 if a finding contradicts them
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7 if an ADR needs amending

- [ ] **Step 1: Build the smallest real sequence**

A Multishot node targeting Kling 3.0 Omni, **three** cuts of 2/2/3s (9s total, well inside 3–15), each with distinct one-line shot text, one reference image attached at the prompt node and `@`-mentioned in exactly one beat. Generate the prompt, then generate the video.

- [ ] **Step 2: Read the compiled prompt BEFORE reading the video**

Open the Video Gen node's "Sent to model" tab. Confirm the prompt is `shot 1, 2, …;` / `shot 2, 2, …;` / `shot 3, 3, …;` with the look as leading prose, that the seconds sum to 9, and that the request's `duration` is 9. If any of that is wrong, stop — the bug is in Task 5 or Task 9, and generating would only waste credits confirming it.

- [ ] **Step 3: Watch the returned clip against the three questions, in order**

1. **Does it cut where the triples say?** Three distinct shots at 2s and 4s. A single continuous take means `multi_shot` was not sent or the triples did not parse.
2. **Did the leading LOOK prose survive?** §6's one genuine guess. If the look is ignored — or worse, rendered as part of shot 1 — the fix is to fold a compressed look into each beat's 512 characters and drop the leading block.
3. **Do the `@image_N` handles bind?** The referenced product should appear in its beat and nowhere else. `buildKlingContents` emits `id: "image_1"`-style ids already, so a failure here is a numbering mismatch, not a missing feature.

- [ ] **Step 4: Write it up either way**

Create the findings file beside the Gemini Omni one, following its structure. **A confirmation is worth as much as a correction** to whoever reads this next — the whole reason this plan could target the right endpoint is that someone wrote down what the last set of docs got wrong.

Record: the exact prompt sent, the exact settings, what came back, and each of the three questions answered yes/no with what you saw.

- [ ] **Step 5: Amend the spec if reality disagrees**

If finding 2 fails, update spec §6's "Where the LOOK block goes" from a decision to a recorded correction, amend **D238** in the roadmap's §7 with the real placement, and open a follow-up for the beat-level look. Do not leave the spec asserting something the clip disproved.

- [ ] **Step 6: Commit**

```
git add ref/multishot-refs/2026-09-XX-kling-omni-api-findings.md docs/superpowers/specs/2026-09-08-kling-multishot-design.md docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -F <scratchpad>/msg.txt
```

Message: `docs(kling): findings from the first real 3.0 Omni multishot generation`.

---

## Self-review notes (for the reviewer, not a task)

**Spec coverage.** §2 → Task 1. §3 → Tasks 2, 3. §4 → Task 6. §5 → Task 7. §6 → Tasks 4, 5, 8. §7 → Task 9. §8 → Tasks 6 (client) and 9 (server backstop). §9 → tests inside each task. §10 → Task 10. §11 ADRs → already appended to the roadmap.

**Three places this plan knowingly departs from the spec**, each argued at the point it happens:

1. **`renderPlan` keeps returning a string** (Task 5). The spec's literal reading breaks the live-preview path. `checkPlanLimits` is the gate instead — same guarantee, at a seam where a failure does not blank the panel the operator is reading.
2. **Task 9 also fixes the duration wiring**, which the spec assumed already worked. Kling cannot function without it and Omni has been silently truncating.
3. **Kling's writer is still forbidden from assigning reference tokens.** Spec §5 lists "`@image_N` handles mentioned in every shot they appear in" among Kling's craft rules, but that is the vendor's console workflow; **D233** is ours, and it says the operator binds references by hand on both models. The Kling prompt keeps the shared no-tokens block and takes only the vendor rules that do not contradict it (distinctness, separators, frame coverage, the 512 budget).

**Two things a reviewer should push on if they disagree:**

- Task 1 Step 4 asks the implementer to *refactor* `buildO1Settings` rather than copy it. If the shared body turns out to be tangled, copying with a comment is the lesser evil — but say so in the commit rather than doing it silently.
- Task 6 adds the model label to the node card's footer, which the spec does not ask for. Rationale: a choice discoverable only inside the focus view will be generated against wrongly at least once. Cheap to remove if it crowds the card.
