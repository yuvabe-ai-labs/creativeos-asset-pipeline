# Start + End Frame Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make start + end frame the default shape of a video generation — expressed by layout, never enforced — while correcting the Kling O1 provider config and closing the constraint-rule leak that wastes ~24% of video spend.

**Architecture:** Three independent layers. (1) The Kling provider gains per-model capability descriptors, correct O1 settings, and `refer_image` support. (2) Constraint rules become authoritative in the UI — locked values are written into params state rather than only displayed — with the API route rejecting (never correcting) anything that still violates a rule. (3) The focus view gains a persistent "shot spine" strip showing start → end → reference slots with the resulting duration, replacing the existing blocking `missing-end-frame` confirm dialog.

**Tech Stack:** Next.js (App Router), TypeScript, React Flow (`@xyflow/react`), Zustand canvas store, Supabase, Trigger.dev, vitest, Tailwind v4 + shadcn (Base UI registry).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-28-video-start-end-spine-design.md` (decisions D83–D88).
- **Controls:** every interactive control must be a shadcn primitive from `src/components/ui/*`. Never a raw `<button>`, `<input>`, `<select>`, `<textarea>`. Base UI composes via the `render` prop, **not** `asChild`. Non-interactive `span`/`div`/`p` are fine.
- **Design system:** Yuvabe. Two fonts only (Clash Display via `font-display`, Gilroy as default `font-sans`). Purple `#5829c7` used sparingly — never a large background fill. Drive all colour through the shadcn CSS variables in `src/app/globals.css`; **never hardcode colours**. Use `.text-eyebrow` for tracked small-caps labels. Icons: Lucide only, `strokeWidth={1.5}`, no fills. Motion easing `cubic-bezier(0.22,1,0.36,1)` only.
- **Add-actions** are dashed-border primary chips: `border border-dashed border-primary/40`, `hover:bg-primary/5`. Reference: `src/components/nodes/editable-field.tsx`.
- **Reuse:** import from `src/lib/<feature>/constants.ts` / `utils.ts` — never redefine a constant or helper that exists. Two call sites = extract; one = leave inline.
- **API routes:** use `apiError` / `apiOk` from `src/lib/api/route-helpers.ts` — never `NextResponse.json(...)` directly.
- **Commands:** `npm test` (vitest run), `npm run lint`, `npm run build`.
- **Verification honesty:** async video generation **cannot** complete on a dev machine (dev trigger key + localhost `APP_URL`). Unit tests are the only local signal. Never report an end-to-end Kling or Veo generation as passing from local work.

### Spec deviation to be aware of

Spec §5.5 says the start-frame requirement is relaxed for the omni endpoint. Spec §3.3 rule **OM8** says `aspect_ratio` becomes **required** when there is no first frame — and no Kling param spec defines `aspect_ratio`. These conflict. **This plan keeps the start-frame requirement on both Kling models** and defers lifting it (with `aspect_ratio`) to a follow-up. Flag this to the user at the first review checkpoint.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/video-gen/params/kling.ts` | Kling param specs — O1 duration/audio/resolution corrections | 1 |
| `src/lib/video-gen/providers/kling.ts` | Payload builders, per-model capability descriptors, `refer_image` | 1, 2 |
| `src/lib/video-gen/cost.ts` | Kling O1 4k pricing tier | 1 |
| `src/lib/video-gen/client-models.ts` | Client mirror of specs + Kling constraint rules | 1, 3 |
| `src/lib/video-gen/constraints.ts` | Add `reconcileLockedParams` pure helper | 4 |
| `src/app/api/nodes/[id]/video-generate/route.ts` | Server-side rule rejection (never correction) | 5 |
| `src/components/nodes/video-gen-shot-spine.tsx` | **New** — the shot spine strip | 6 |
| `src/components/nodes/video-gen-focus-view.tsx` | Wire spine + reconciliation; remove `missing-end-frame` dialog | 4, 6, 7 |
| `src/hooks/use-derive-end-frame.ts` | **New** — spawn a seeded image-edit node and wire it back | 7 |
| `docs/superpowers/specs/2026-07-25-video-model-capability-matrix.md` | Correct the stale/dangerous entries | 8 |

---

## Task 1: Correct the Kling O1 provider configuration

The O1 config was built from third-party wrapper docs (fal.ai / WaveSpeed), whose limits are narrower than Kling's. This task fixes the settings and splits the shared capability descriptor (D87).

**Files:**
- Modify: `src/lib/video-gen/params/kling.ts`
- Modify: `src/lib/video-gen/providers/kling.ts:36-66`, `:148-174`
- Modify: `src/lib/video-gen/cost.ts:46-51`
- Modify: `src/lib/video-gen/client-models.ts:84-88`, `:133-142`
- Test: `src/lib/video-gen/__tests__/kling-params.test.ts`, `__tests__/kling-provider.test.ts`, `__tests__/cost.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `KLING_30_IMAGE_INPUTS` and `KLING_O1_IMAGE_INPUTS` (per-model `ImageInputCapabilities`), and a `durationSelectParam(options: string[], defaultValue: string): ParamSpec` helper in `params/kling.ts`.

- [ ] **Step 1: Write the failing param tests**

Add to `src/lib/video-gen/__tests__/kling-params.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { kling30Params, klingO1Params } from "../params/kling";

function param(specs: typeof kling30Params, name: string) {
  const spec = specs.find((p) => p.name === name);
  if (!spec) throw new Error(`missing param: ${name}`);
  return spec;
}

describe("Kling O1 params — corrected against the official omni docs", () => {
  it("offers only 5 and 10 second durations (rule OM12)", () => {
    const duration = param(klingO1Params, "duration");
    expect(duration.constraints).toEqual({ type: "select", options: ["5", "10"] });
    expect(duration.defaultValue).toBe("5");
  });

  it("offers native audio, not just original/off", () => {
    const audio = param(klingO1Params, "audio");
    expect(audio.constraints).toEqual({
      type: "select",
      options: ["native", "original", "off"],
    });
  });

  it("offers 4k resolution", () => {
    const resolution = param(klingO1Params, "resolution");
    expect(resolution.constraints).toEqual({
      type: "select",
      options: ["720p", "1080p", "4k"],
    });
  });
});

describe("Kling 3.0 params — unchanged", () => {
  it("keeps the documented 3-15s slider", () => {
    const duration = param(kling30Params, "duration");
    expect(duration.constraints).toEqual({ type: "slider", min: 3, max: 15, step: 1 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- kling-params`
Expected: FAIL — O1 duration is currently a `slider` 3–10, audio lacks `native`, resolution lacks `4k`.

- [ ] **Step 3: Correct the param specs**

In `src/lib/video-gen/params/kling.ts`, add the select-based duration helper beside the existing
slider helper, and rewrite `klingO1Params`:

```ts
// Kling O1 rejects arbitrary durations: "Duration only supports 5 or 10 seconds when no
// refer_image is provided" (code 1201, observed 2026-07-27). Kling's published enum says 3-15,
// so this is a discrete select rather than the 3.0 slider. Whether references widen the range
// is UNVERIFIED — see the plan's manual verification step before relaxing this.
function durationSelectParam(options: string[], defaultValue: string): ParamSpec {
  return {
    name: "duration",
    label: "Duration",
    component: "select",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue,
    constraints: { type: "select", options },
  };
}

export const klingO1Params: ParamSpec[] = [
  resolutionParam(["720p", "1080p", "4k"], "720p"),
  durationSelectParam(["5", "10"], "5"),
  audioParam(["native", "original", "off"], "off"),
  negativePromptParam,
];
```

Leave `kling30Params` exactly as it is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- kling-params`
Expected: PASS

- [ ] **Step 5: Split the capability descriptors and fix the multi_shot fallback**

In `src/lib/video-gen/providers/kling.ts`, replace the shared `KLING_IMAGE_INPUTS_WITH_END`
(lines 148-152) with per-model constants, and correct the `multi_shot` default:

```ts
// D87: 3.0 and O1 have different reference mechanisms (registered `element` vs inline
// `refer_image`), so they cannot share one descriptor. O1's cap is set in Task 3.
const KLING_30_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 0,
} as const;

const KLING_O1_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 0,
} as const;
```

Point `kling30.imageInputs` at `KLING_30_IMAGE_INPUTS` and `klingO1.imageInputs` at
`KLING_O1_IMAGE_INPUTS`. Then in `build3_0Settings` (line 49) change the fallback:

```ts
    // Off by default, matching the param spec (4cee50d). The previous `?? true` fallback
    // contradicted that spec on any path where the param was absent.
    multi_shot: Boolean(params.multi_shot ?? false),
```

- [ ] **Step 6: Add the O1 4k pricing tier**

In `src/lib/video-gen/cost.ts`, extend the `kling:kling-o1` entry (lines 48-51):

```ts
  // ASSUMPTION: o1 audio delta not split out on the pricing page (only splits by
  // video-input); reused the same $0.028/s step seen on 3.0. The 4k tier mirrors 3.0's
  // flat $0.42/s — also an assumption. Revisit if wrong.
  "kling:kling-o1": {
    "720p": { off: 0.084, on: 0.112 },
    "1080p": { off: 0.112, on: 0.14 },
    "4k": { off: 0.42, on: 0.42 },
  },
```

- [ ] **Step 7: Add the cost regression test**

In `src/lib/video-gen/__tests__/cost.test.ts`, replace the assertion that 4k returns `null`
(currently line 36) with:

```ts
    expect(computeVideoCost("kling:kling-o1", 10, false, "4k")?.usd).toBeCloseTo(4.2);
```

- [ ] **Step 8: Mirror everything into the client model map**

In `src/lib/video-gen/client-models.ts`, replace the shared `KLING_IMAGE_INPUTS_WITH_END`
(lines 84-88) with the same two constants (client copies — this file cannot import the
`server-only` provider module), point each model at its own, and set
`"kling:kling-o1".maxDurationSeconds` to `10`.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS. The existing `buildO1Settings` test at `kling-provider.test.ts:56-61` still
passes — it asserts settings-builder output, which this task does not change.

- [ ] **Step 10: Commit**

```bash
git add src/lib/video-gen/params/kling.ts src/lib/video-gen/providers/kling.ts \
        src/lib/video-gen/cost.ts src/lib/video-gen/client-models.ts \
        src/lib/video-gen/__tests__/
git commit -m "fix(video-gen): correct Kling O1 config against official omni docs

Duration becomes a 5/10 select (Kling rejects other values without a
refer_image), audio gains native, resolution gains 4k with its cost tier,
and the shared capability descriptor splits per model (D87). Also fixes
the multi_shot provider fallback, which defaulted true against a spec
default of false.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `refer_image` support to the Kling payload builder

**Files:**
- Modify: `src/lib/video-gen/providers/kling.ts:15-34`, `:134-146`, `:154-174`
- Test: `src/lib/video-gen/__tests__/kling-provider.test.ts`

**Interfaces:**
- Consumes: `KLING_30_IMAGE_INPUTS`, `KLING_O1_IMAGE_INPUTS` from Task 1.
- Produces: `buildKlingContents(input: { prompt: string; startFrameUrl?: string; endFrameUrl?: string; referenceUrls?: string[] })` — reference items are emitted as `{ type: "refer_image", url, id: "image_N" }`, 1-indexed, appended after the frames.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/video-gen/__tests__/kling-provider.test.ts` inside the existing
`describe("buildKlingContents", ...)` block:

```ts
  it("emits refer_image items with 1-indexed ids after the frames", async () => {
    const { buildKlingContents } = await import("../providers/kling");
    const contents = buildKlingContents({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
      endFrameUrl: "https://x.test/end.png",
      referenceUrls: ["https://x.test/r1.png", "https://x.test/r2.png"],
    });
    expect(contents).toEqual([
      { type: "prompt", text: "a cat walking" },
      { type: "first_frame", url: "https://x.test/start.png" },
      { type: "last_frame", url: "https://x.test/end.png" },
      { type: "refer_image", url: "https://x.test/r1.png", id: "image_1" },
      { type: "refer_image", url: "https://x.test/r2.png", id: "image_2" },
    ]);
  });

  it("emits no refer_image items when referenceUrls is empty or absent", async () => {
    const { buildKlingContents } = await import("../providers/kling");
    for (const input of [
      { prompt: "p", startFrameUrl: "https://x.test/s.png" },
      { prompt: "p", startFrameUrl: "https://x.test/s.png", referenceUrls: [] },
    ]) {
      const contents = buildKlingContents(input);
      expect(contents.some((c) => c.type === "refer_image")).toBe(false);
    }
  });
```

And add a new describe block asserting 3.0 never sends references, since its endpoint has no
such content type:

```ts
describe("reference images are omni-only", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.KLING_API_KEY = "test-key";
  });

  it("kling30 drops referenceUrls — /image-to-video/kling-3.0 has no refer_image type", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 0, message: "", data: { id: "t1", status: "submitted" } }),
    });

    const { kling30 } = await import("../providers/kling");
    vi.useFakeTimers();
    void kling30.generate({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
      referenceUrls: ["https://x.test/r1.png"],
      params: {},
    });
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.contents.some((c: { type: string }) => c.type === "refer_image")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- kling-provider`
Expected: FAIL — `buildKlingContents` currently ignores `referenceUrls` entirely.

- [ ] **Step 3: Implement reference support**

In `src/lib/video-gen/providers/kling.ts`, extend the content input type and builder:

```ts
type KlingContentInput = {
  prompt: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceUrls?: string[];
};

export function buildKlingContents(
  input: KlingContentInput,
): Array<Record<string, unknown>> {
  const contents: Array<Record<string, unknown>> = [
    { type: "prompt", text: input.prompt },
  ];
  if (input.startFrameUrl) {
    contents.push({ type: "first_frame", url: input.startFrameUrl });
  }
  if (input.endFrameUrl) {
    contents.push({ type: "last_frame", url: input.endFrameUrl });
  }
  // `id` is how the prompt addresses an image (@image_1). Kling accepts refer_image only on
  // the omni endpoint — generateWithKling gates this per model.
  (input.referenceUrls ?? []).forEach((url, i) => {
    contents.push({ type: "refer_image", url, id: `image_${i + 1}` });
  });
  return contents;
}
```

Then gate it per model by giving `generateWithKling` an explicit capability argument:

```ts
type KlingEndpointConfig = {
  endpointPath: string;
  /** Only the omni endpoint accepts `refer_image`; 3.0's enum is prompt/first_frame/last_frame/element. */
  supportsReferences: boolean;
};

async function generateWithKling(
  config: KlingEndpointConfig,
  buildSettings: (params: Record<string, unknown>) => Record<string, unknown>,
  input: VideoGenInput,
): Promise<VideoGenResult> {
  if (!input.startFrameUrl) {
    throw new Error("Kling image-to-video requires a start frame image");
  }
  const contents = buildKlingContents({
    prompt: input.prompt,
    startFrameUrl: input.startFrameUrl,
    endFrameUrl: input.endFrameUrl,
    referenceUrls: config.supportsReferences ? input.referenceUrls : [],
  });
  const settings = buildSettings(input.params);
  const taskId = await createKlingTask(config.endpointPath, contents, settings);
  return pollKlingTask(taskId);
}
```

Update both model specs:

```ts
  generate: (input) =>
    generateWithKling(
      { endpointPath: "/image-to-video/kling-3.0", supportsReferences: false },
      build3_0Settings,
      input,
    ),
```

```ts
  generate: (input) =>
    generateWithKling(
      { endpointPath: "/omni-video/kling-o1", supportsReferences: true },
      buildO1Settings,
      input,
    ),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- kling-provider`
Expected: PASS, including the pre-existing endpoint-path and poll-flow tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/providers/kling.ts src/lib/video-gen/__tests__/kling-provider.test.ts
git commit -m "feat(video-gen): emit refer_image contents for Kling omni

buildKlingContents now appends refer_image items with 1-indexed ids after
the frames. Gated per endpoint: /omni-video accepts refer_image, but
/image-to-video/kling-3.0's content enum does not, so 3.0 drops references
rather than sending an unsupported type.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Enable O1 references and encode the Kling constraint rules

**Files:**
- Modify: `src/lib/video-gen/providers/kling.ts` (O1 descriptor cap)
- Modify: `src/lib/video-gen/client-models.ts`
- Test: `src/lib/video-gen/__tests__/kling-rules.test.ts` (create)

**Interfaces:**
- Consumes: `KLING_O1_IMAGE_INPUTS` (Task 1), `refer_image` payload support (Task 2).
- Produces: `KLING_30_RULES` and `KLING_O1_RULES` (`ConstraintRule[]`) exported for tests from `client-models.ts`.

**Reference budget:** Kling's omni docs cap total images at 7 (references plus multi-image elements, with no reference video). Whether `first_frame`/`last_frame` count toward that 7 is not stated. This plan uses **5**, the conservative figure that stays within budget when both frames are in use. Being wrong this way costs two slots; being wrong the other way causes 400s.

- [ ] **Step 1: Write the failing rules tests**

Create `src/lib/video-gen/__tests__/kling-rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluateConstraints } from "../constraints";
import { videoGenClientModelMap } from "../client-models";
import type { ConstraintState } from "../types";

function state(over: Partial<ConstraintState> = {}): ConstraintState {
  return {
    params: {},
    hasStartFrame: true,
    hasEndFrame: false,
    referenceCount: 0,
    ...over,
  };
}

describe("Kling constraint rules", () => {
  it("blocks generation when no start frame is assigned", () => {
    for (const id of ["kling:kling-3-0", "kling:kling-o1"]) {
      const rules = videoGenClientModelMap[id].rules;
      const result = evaluateConstraints(rules, state({ hasStartFrame: false }));
      expect(result.disableGenerate).toBe(true);
      expect(result.disableGenerateReason).toMatch(/start frame/i);
    }
  });

  it("allows generation once a start frame is assigned", () => {
    const rules = videoGenClientModelMap["kling:kling-3-0"].rules;
    expect(evaluateConstraints(rules, state()).disableGenerate).toBe(false);
  });

  it("locks multi_shot off on Kling 3.0 when an end frame is set", () => {
    const rules = videoGenClientModelMap["kling:kling-3-0"].rules;
    const result = evaluateConstraints(rules, state({ hasEndFrame: true }));
    expect(result.lockedParams.multi_shot).toBe(false);
    expect(result.lockedParamReasons.multi_shot).toMatch(/multi-shot/i);
  });

  it("does not lock multi_shot on O1, which has no such param", () => {
    const rules = videoGenClientModelMap["kling:kling-o1"].rules;
    const result = evaluateConstraints(rules, state({ hasEndFrame: true }));
    expect(result.lockedParams).not.toHaveProperty("multi_shot");
  });
});

describe("Kling reference capability", () => {
  it("O1 accepts references, 3.0 does not", () => {
    expect(videoGenClientModelMap["kling:kling-o1"].imageInputs.maxReferenceImages).toBe(5);
    expect(videoGenClientModelMap["kling:kling-3-0"].imageInputs.maxReferenceImages).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- kling-rules`
Expected: FAIL — both Kling models currently have `rules: []` and `maxReferenceImages: 0`.

- [ ] **Step 3: Add the rules and the reference cap**

In `src/lib/video-gen/client-models.ts`, add beside the existing Veo rule arrays:

```ts
// Kling requires a first_frame on both endpoints. Previously this surfaced only as a throw
// inside the Trigger task — i.e. a failed generation minutes later. As a rule it disables
// Generate up front. (Lifting this for omni text-to-video needs an `aspect_ratio` param,
// which rule OM8 makes mandatory when no first frame is present — deferred.)
const KLING_REQUIRES_START_FRAME: ConstraintRule = {
  id: "kling-requires-start-frame",
  when: { field: "hasStartFrame", op: "eq", value: false },
  effect: { disableGenerate: true },
  reason: "Kling needs a start frame before you can generate",
};

const KLING_30_RULES: ConstraintRule[] = [
  KLING_REQUIRES_START_FRAME,
  {
    // Multi-shot cuts between shots; an end frame asks for one continuous interpolated path.
    // The two are contradictory, and Kling's API defaults multi_shot to true.
    id: "end-frame-disables-multi-shot",
    when: { field: "hasEndFrame", op: "eq", value: true },
    effect: { lockParams: [{ name: "multi_shot", value: false }] },
    reason: "End frame selected → multi-shot off (cuts break a single continuous shot)",
  },
];

const KLING_O1_RULES: ConstraintRule[] = [KLING_REQUIRES_START_FRAME];
```

Set `rules: KLING_30_RULES` on `"kling:kling-3-0"` and `rules: KLING_O1_RULES` on
`"kling:kling-o1"`. Change the client `KLING_O1_IMAGE_INPUTS.maxReferenceImages` to `5`.

- [ ] **Step 4: Mirror the cap on the server descriptor**

In `src/lib/video-gen/providers/kling.ts`, set `KLING_O1_IMAGE_INPUTS.maxReferenceImages` to `5`
so the route's cap at `route.ts:90` matches the client.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- kling-rules`
Expected: PASS

- [ ] **Step 6: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/video-gen/client-models.ts src/lib/video-gen/providers/kling.ts \
        src/lib/video-gen/__tests__/kling-rules.test.ts
git commit -m "feat(video-gen): Kling constraint rules and O1 reference capability

Kling gains its first constraint rules: a missing start frame now disables
Generate instead of failing minutes later inside the Trigger task, and an
end frame locks multi_shot off on 3.0. O1 accepts up to 5 reference images
— the 7-image omni budget less both frames (D88).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Write locked params into state (D86)

The live bug behind 11 of the observed failures: `video-gen-params-panel.tsx` *displays*
`lockedParams[name]` while `params[name]` keeps the stale value, and the control is `disabled` so
`onParamChange` can never reconcile it. `doGenerate` sends `params`. The UI shows 8 and posts 6.

**Files:**
- Modify: `src/lib/video-gen/constraints.ts`
- Modify: `src/components/nodes/video-gen-focus-view.tsx:687-709`
- Test: `src/lib/video-gen/__tests__/constraints.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `reconcileLockedParams(params: Record<string, unknown>, lockedParams: Record<string, unknown>): Record<string, unknown> | null` — returns the merged params, or `null` when no change is needed (so callers can early-return without an effect loop).

- [ ] **Step 1: Write the failing test**

Create `src/lib/video-gen/__tests__/constraints.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { reconcileLockedParams } from "../constraints";

describe("reconcileLockedParams", () => {
  it("returns merged params when a locked value diverges from state", () => {
    expect(reconcileLockedParams({ duration: "6" }, { duration: "8" })).toEqual({
      duration: "8",
    });
  });

  it("preserves unlocked params while overriding locked ones", () => {
    expect(
      reconcileLockedParams(
        { duration: "6", aspect_ratio: "9:16" },
        { duration: "8" },
      ),
    ).toEqual({ duration: "8", aspect_ratio: "9:16" });
  });

  it("returns null when nothing is locked", () => {
    expect(reconcileLockedParams({ duration: "6" }, {})).toBeNull();
  });

  it("returns null when state already matches the locked values", () => {
    expect(reconcileLockedParams({ duration: "8" }, { duration: "8" })).toBeNull();
  });

  it("handles non-string locked values", () => {
    expect(reconcileLockedParams({ multi_shot: true }, { multi_shot: false })).toEqual({
      multi_shot: false,
    });
    expect(reconcileLockedParams({ multi_shot: false }, { multi_shot: false })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- constraints`
Expected: FAIL with "reconcileLockedParams is not exported" / not a function.

- [ ] **Step 3: Implement the helper**

Append to `src/lib/video-gen/constraints.ts`:

```ts
/**
 * D86 — locked parameter values are the source of truth, not just a display substitution.
 *
 * Returns `params` merged with `lockedParams`, or `null` when no change is needed. The null
 * return lets callers early-return from an effect rather than setting state on every render.
 */
export function reconcileLockedParams(
  params: Record<string, unknown>,
  lockedParams: Record<string, unknown>,
): Record<string, unknown> | null {
  const entries = Object.entries(lockedParams);
  if (entries.length === 0) return null;
  if (!entries.some(([name, value]) => params[name] !== value)) return null;
  return { ...params, ...lockedParams };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- constraints`
Expected: PASS

- [ ] **Step 5: Wire it into the focus view**

In `src/components/nodes/video-gen-focus-view.tsx`, add `reconcileLockedParams` to the existing
import from `@/lib/video-gen/constraints`, then extend the effect that currently only toasts
(around line 690) so it also writes the values through. Insert immediately after the
`if (prev === null) return;` guard's enclosing effect — as a **second** effect keyed on the same
`lockedParamsKey`:

```ts
  // D86: the panel displays locked values, but `params` is what doGenerate posts. Without this,
  // opening a node with references and a persisted duration of 6 shows a locked 8 and sends 6.
  useEffect(() => {
    const next = reconcileLockedParams(params, constraints.lockedParams);
    if (!next) return;
    setParams(next);
    onPatch({ params: next });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedParamsKey]);
```

- [ ] **Step 6: Verify no regression**

Run: `npm test && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/video-gen/constraints.ts src/components/nodes/video-gen-focus-view.tsx \
        src/lib/video-gen/__tests__/constraints.test.ts
git commit -m "fix(video-gen): write locked params into state, not just the display

The params panel rendered lockedParams while leaving params untouched, and
the disabled control could never reconcile them — so a node with references
and a persisted duration of 6 showed a locked 8 and posted 6. That accounts
for 11 observed generation failures after constraint rules shipped (D86).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Reject rule violations server-side (D85)

The route never evaluates rules, so any path that bypasses the focus view sends illegal
combinations straight to the vendor. Per D85 the server **rejects** and never auto-corrects.

**Files:**
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts:88-96`
- Test: `src/lib/video-gen/__tests__/route-validation.test.ts` (create)

**Interfaces:**
- Consumes: `evaluateConstraints` (existing), the Kling rules from Task 3.
- Produces: `validateAgainstRules(rules: ConstraintRule[] | undefined, state: ConstraintState): string | null` in `src/lib/video-gen/constraints.ts` — returns a human-readable violation reason, or `null` when the request is legal.

- [ ] **Step 1: Write the failing test**

Create `src/lib/video-gen/__tests__/route-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateAgainstRules } from "../constraints";
import { videoGenClientModelMap } from "../client-models";

const veoRefs = videoGenClientModelMap["veo:veo-3.1-fast"].rules;
const kling30 = videoGenClientModelMap["kling:kling-3-0"].rules;

describe("validateAgainstRules", () => {
  it("rejects Veo references with a duration other than 8", () => {
    const reason = validateAgainstRules(veoRefs, {
      params: { duration: "6" },
      hasStartFrame: false,
      hasEndFrame: false,
      referenceCount: 3,
    });
    expect(reason).toMatch(/8s/);
  });

  it("accepts Veo references at duration 8", () => {
    expect(
      validateAgainstRules(veoRefs, {
        params: { duration: "8" },
        hasStartFrame: false,
        hasEndFrame: false,
        referenceCount: 3,
      }),
    ).toBeNull();
  });

  it("rejects a Kling request with no start frame", () => {
    const reason = validateAgainstRules(kling30, {
      params: {},
      hasStartFrame: false,
      hasEndFrame: false,
      referenceCount: 0,
    });
    expect(reason).toMatch(/start frame/i);
  });

  it("accepts a legal Kling request", () => {
    expect(
      validateAgainstRules(kling30, {
        params: { multi_shot: false },
        hasStartFrame: true,
        hasEndFrame: true,
        referenceCount: 0,
      }),
    ).toBeNull();
  });

  it("returns null when a model has no rules", () => {
    expect(
      validateAgainstRules([], {
        params: {},
        hasStartFrame: true,
        hasEndFrame: false,
        referenceCount: 0,
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- route-validation`
Expected: FAIL — `validateAgainstRules` is not exported.

- [ ] **Step 3: Implement the validator**

Append to `src/lib/video-gen/constraints.ts`:

```ts
/**
 * D85 — the server rejects, it never corrects. Returns the reason a request violates the
 * model's rules, or null when it is legal. Auto-correcting would silently change what the
 * caller asked for (and what they are billed), so a violation is a 400, not a fixup.
 */
export function validateAgainstRules(
  rules: ConstraintRule[] | undefined,
  state: ConstraintState,
): string | null {
  const evaluated = evaluateConstraints(rules, state);

  if (evaluated.disableGenerate) {
    return evaluated.disableGenerateReason ?? "This combination is not supported";
  }
  for (const [name, value] of Object.entries(evaluated.lockedParams)) {
    if (state.params[name] !== value) {
      return (
        evaluated.lockedParamReasons[name] ??
        `${name} must be ${String(value)} for this combination`
      );
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- route-validation`
Expected: PASS

- [ ] **Step 5: Call it from the route**

In `src/app/api/nodes/[id]/video-generate/route.ts`, import the helper alongside the registry:

```ts
import { validateAgainstRules } from "@/lib/video-gen/constraints";
```

Then insert immediately after the existing end-frame clear at line 93, before `mockMode`:

```ts
  // D85: reject rather than correct. The UI evaluates the same rules and should never let an
  // illegal combination reach here — this is the backstop for clients that bypass it.
  // Server-side state is stricter than the client's: it counts references that actually
  // resolved to URLs, not roles that were merely assigned.
  const violation = validateAgainstRules(config.rules, {
    params: resolvedParams,
    hasStartFrame: Boolean(startFrameUrl),
    hasEndFrame: Boolean(endFrameUrl),
    referenceCount: referenceUrls.length,
  });
  if (violation) return apiError(violation, 400);
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/video-gen/constraints.ts src/app/api/nodes/\[id\]/video-generate/route.ts \
        src/lib/video-gen/__tests__/route-validation.test.ts
git commit -m "feat(video-gen): reject rule violations at the API route

The route resolved params and posted straight to the vendor without ever
evaluating the model's constraint rules, so any client bypassing the focus
view could send illegal combinations. It now returns 400 with the rule's
reason and never mutates params (D85).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The shot spine strip

Replaces the blocking `missing-end-frame` confirm dialog with a persistent, non-blocking
affordance (D83).

**Files:**
- Create: `src/components/nodes/video-gen-shot-spine.tsx`
- Modify: `src/components/nodes/video-gen-focus-view.tsx` (render the strip; delete the
  `missing-end-frame` dialog branch at `:610-623` and `:1116-1140`, the `DialogState` member at
  `:80`, and the now-unused `hasExplicitlySkippedEndFrameRef`)
- Test: `src/lib/video-gen/__tests__/shot-spine.test.ts` (create)

**Interfaces:**
- Consumes: `ImageInputCapabilities` (`src/lib/video-gen/types.ts`).
- Produces: `describeShotSpine(input: { imageInputs: ImageInputCapabilities; hasStartFrame: boolean; hasEndFrame: boolean; referenceCount: number; durationLabel: string }): ShotSpineModel` in `src/lib/video-gen/shot-spine.ts`, plus the `VideoGenShotSpine` component consuming it.

- [ ] **Step 1: Write the failing test for the pure view-model**

Create `src/lib/video-gen/__tests__/shot-spine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { describeShotSpine } from "../shot-spine";

const kling30 = { startFrame: true, endFrame: true, maxReferenceImages: 0 };
const klingO1 = { startFrame: true, endFrame: true, maxReferenceImages: 5 };

describe("describeShotSpine", () => {
  it("marks an unfilled end slot as available when the model supports it", () => {
    const model = describeShotSpine({
      imageInputs: kling30,
      hasStartFrame: true,
      hasEndFrame: false,
      referenceCount: 0,
      durationLabel: "3-15s",
    });
    const end = model.slots.find((s) => s.role === "end_frame")!;
    expect(end.state).toBe("empty");
  });

  it("marks the reference slot unsupported when the model has no reference capability", () => {
    const model = describeShotSpine({
      imageInputs: kling30,
      hasStartFrame: true,
      hasEndFrame: false,
      referenceCount: 0,
      durationLabel: "3-15s",
    });
    const ref = model.slots.find((s) => s.role === "reference")!;
    expect(ref.state).toBe("unsupported");
  });

  it("reports reference count against the cap when supported", () => {
    const model = describeShotSpine({
      imageInputs: klingO1,
      hasStartFrame: true,
      hasEndFrame: true,
      referenceCount: 2,
      durationLabel: "5 or 10s",
    });
    const ref = model.slots.find((s) => s.role === "reference")!;
    expect(ref.state).toBe("filled");
    expect(ref.detail).toBe("2 of 5");
  });

  it("surfaces the duration label verbatim", () => {
    const model = describeShotSpine({
      imageInputs: klingO1,
      hasStartFrame: true,
      hasEndFrame: false,
      referenceCount: 0,
      durationLabel: "5 or 10s",
    });
    expect(model.durationLabel).toBe("5 or 10s");
  });

  it("never reports a blocking state — the spine is an affordance, not a gate", () => {
    const model = describeShotSpine({
      imageInputs: klingO1,
      hasStartFrame: false,
      hasEndFrame: false,
      referenceCount: 0,
      durationLabel: "5 or 10s",
    });
    expect(model.slots.every((s) => s.state !== "blocking")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- shot-spine`
Expected: FAIL — module `../shot-spine` does not exist.

- [ ] **Step 3: Implement the view-model**

Create `src/lib/video-gen/shot-spine.ts`:

```ts
import type { ImageInputCapabilities } from "./types";

export type ShotSpineSlotRole = "start_frame" | "end_frame" | "reference";
export type ShotSpineSlotState = "filled" | "empty" | "unsupported";

export type ShotSpineSlot = {
  role: ShotSpineSlotRole;
  label: string;
  state: ShotSpineSlotState;
  /** Secondary line, e.g. "2 of 5" for references. */
  detail?: string;
};

export type ShotSpineModel = {
  slots: ShotSpineSlot[];
  durationLabel: string;
};

/**
 * D83 — the opinion is expressed by layout. This model never carries a blocking state; a
 * missing end frame is rendered as an inviting empty slot, never as an error or a gate.
 */
export function describeShotSpine(input: {
  imageInputs: ImageInputCapabilities;
  hasStartFrame: boolean;
  hasEndFrame: boolean;
  referenceCount: number;
  durationLabel: string;
}): ShotSpineModel {
  const { imageInputs, hasStartFrame, hasEndFrame, referenceCount } = input;

  const slots: ShotSpineSlot[] = [
    {
      role: "start_frame",
      label: "Start",
      state: !imageInputs.startFrame ? "unsupported" : hasStartFrame ? "filled" : "empty",
    },
    {
      role: "end_frame",
      label: "End",
      state: !imageInputs.endFrame ? "unsupported" : hasEndFrame ? "filled" : "empty",
    },
    {
      role: "reference",
      label: "Reference",
      state:
        imageInputs.maxReferenceImages === 0
          ? "unsupported"
          : referenceCount > 0
            ? "filled"
            : "empty",
      detail:
        imageInputs.maxReferenceImages > 0 && referenceCount > 0
          ? `${referenceCount} of ${imageInputs.maxReferenceImages}`
          : undefined,
    },
  ];

  return { slots, durationLabel: input.durationLabel };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- shot-spine`
Expected: PASS

- [ ] **Step 5: Build the component**

Create `src/components/nodes/video-gen-shot-spine.tsx`. Slots are non-interactive status
indicators plus one shadcn `Button` for the derive action (wired in Task 7 — for now it accepts
an optional `onCreateEndFrame` and renders only when provided):

```tsx
"use client";

import { ArrowRight, Film, ImagePlus, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ShotSpineModel, ShotSpineSlot } from "@/lib/video-gen/shot-spine";

const SLOT_ICON = {
  start_frame: Film,
  end_frame: Film,
  reference: Layers,
} as const;

function Slot({ slot }: { slot: ShotSpineSlot }) {
  const Icon = SLOT_ICON[slot.role];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-xl transition-colors duration-200",
          slot.state === "filled" && "border border-border bg-muted",
          slot.state === "empty" &&
            "border border-dashed border-primary/40 hover:bg-primary/5",
          slot.state === "unsupported" && "border border-border/40 bg-transparent",
        )}
      >
        <Icon
          className={cn(
            "size-4",
            slot.state === "filled" && "text-foreground",
            slot.state === "empty" && "text-primary",
            slot.state === "unsupported" && "text-muted-foreground/30",
          )}
          strokeWidth={1.5}
        />
      </div>
      <span
        className={cn(
          "text-eyebrow",
          slot.state === "unsupported" && "text-muted-foreground/40",
        )}
      >
        {slot.label}
      </span>
      {slot.detail && (
        <span className="text-[0.65rem] text-muted-foreground">{slot.detail}</span>
      )}
      {slot.state === "unsupported" && (
        <span className="text-[0.65rem] text-muted-foreground/50">Not on this model</span>
      )}
    </div>
  );
}

export function VideoGenShotSpine({
  model,
  onCreateEndFrame,
  creatingEndFrame = false,
}: {
  model: ShotSpineModel;
  onCreateEndFrame?: () => void;
  creatingEndFrame?: boolean;
}) {
  const [start, end, reference] = model.slots;
  const canDerive =
    Boolean(onCreateEndFrame) && start.state === "filled" && end.state === "empty";

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-end gap-4">
        <Slot slot={start} />
        <ArrowRight
          className="mb-8 size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
        />
        <Slot slot={end} />
        <div className="mx-2 mb-8 h-8 w-px shrink-0 bg-border" />
        <Slot slot={reference} />
      </div>

      {canDerive && (
        <Button
          variant="outline"
          size="sm"
          disabled={creatingEndFrame}
          onClick={onCreateEndFrame}
          className="mt-4 w-full border-dashed border-primary/40 hover:bg-primary/5"
        >
          <ImagePlus className="size-3.5" strokeWidth={1.5} />
          {creatingEndFrame ? "Creating…" : "Create end frame"}
        </Button>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Duration · {model.durationLabel}
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Render it in the focus view and delete the blocking dialog**

In `src/components/nodes/video-gen-focus-view.tsx`:

1. Import `describeShotSpine` and `VideoGenShotSpine`.
2. Build the model from existing derived state (`imageInputs`, `effectiveImageRoles`), deriving
   the duration label from the current model's `duration` param spec:

```ts
  const durationSpec = currentModel?.params.find((p) => p.name === "duration");
  const durationLabel =
    durationSpec?.constraints.type === "select"
      ? `${durationSpec.constraints.options.join(" or ")}s`
      : durationSpec?.constraints.type === "slider"
        ? `${durationSpec.constraints.min}-${durationSpec.constraints.max}s`
        : "—";

  const spineModel = describeShotSpine({
    imageInputs,
    hasStartFrame: Object.values(effectiveImageRoles).includes("start_frame"),
    hasEndFrame: Object.values(effectiveImageRoles).includes("end_frame"),
    referenceCount: Object.values(effectiveImageRoles).filter((r) => r === "reference").length,
    durationLabel,
  });
```

3. Render `<VideoGenShotSpine model={spineModel} />` at the top of the left column, above the
   existing connected-images section.
4. **Delete** the `missing-end-frame` gate at lines 610-623, its `DialogState` member at line 80,
   its `AlertDialog` branch at lines 1116-1140, and the `hasExplicitlySkippedEndFrameRef`
   declaration and every remaining reference to it. The `no-roles` dialog stays — that one guards
   a genuinely empty request, not a missing end frame.

- [ ] **Step 7: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: PASS. Confirm no `hasExplicitlySkippedEndFrameRef` or `missing-end-frame` references
remain: `npx rg "missing-end-frame|hasExplicitlySkippedEndFrame" src/` should return nothing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/video-gen/shot-spine.ts src/components/nodes/video-gen-shot-spine.tsx \
        src/components/nodes/video-gen-focus-view.tsx \
        src/lib/video-gen/__tests__/shot-spine.test.ts
git commit -m "feat(video-gen): shot spine strip replaces the end-frame confirm dialog

A persistent start -> end -> reference strip with the resulting duration
makes the preferred shape visible at rest instead of interrupting on
generate. The blocking missing-end-frame AlertDialog is removed: per D83
the opinion is expressed by layout and never gates generation.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Derive the end frame from the start frame (D84)

**Files:**
- Create: `src/hooks/use-derive-end-frame.ts`
- Modify: `src/components/nodes/video-gen-focus-view.tsx` (wire `onCreateEndFrame`)
- Test: `src/lib/video-gen/__tests__/derive-end-frame.test.ts` (create)

**Interfaces:**
- Consumes: `VideoGenShotSpine`'s `onCreateEndFrame` / `creatingEndFrame` props (Task 6).
- Produces: `useDeriveEndFrame(): { deriveEndFrame: (args: { videoNodeId: string; startFrameUrl: string; videoNodePosition: { x: number; y: number } }) => string; }` returning the new node's id.
- Canvas store API (verified in `src/lib/canvas-store.ts:39-41`):
  `addNode(type: string, position: XYPosition, id?: string): void`,
  `updateNodeData(id: string, data: Record<string, unknown>): void`,
  `connectNodes(sourceId: string, targetId: string): void`.
  Precedent for create-then-connect: `src/hooks/use-reference-image-picker.ts:86-91`.

- [ ] **Step 1: Write the failing test for the placement helper**

The hook itself is store-bound; the placement arithmetic is pure and is what can regress.
Create `src/lib/video-gen/__tests__/derive-end-frame.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { endFrameNodePosition } from "../derive-end-frame";

describe("endFrameNodePosition", () => {
  it("places the derived node below-left of the video node", () => {
    expect(endFrameNodePosition({ x: 500, y: 300 })).toEqual({ x: 140, y: 540 });
  });

  it("does not produce negative coordinates near the canvas origin", () => {
    const pos = endFrameNodePosition({ x: 0, y: 0 });
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- derive-end-frame`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the placement helper**

Create `src/lib/video-gen/derive-end-frame.ts`:

```ts
/** Horizontal offset left of the video node, so the new node does not cover it. */
const OFFSET_X = 360;
/** Vertical offset below the video node. */
const OFFSET_Y = 240;

/**
 * Where a derived end-frame image node is placed relative to its video node. Clamped at the
 * origin so a node near the canvas corner does not land at negative coordinates.
 */
export function endFrameNodePosition(videoNodePosition: { x: number; y: number }): {
  x: number;
  y: number;
} {
  return {
    x: Math.max(0, videoNodePosition.x - OFFSET_X),
    y: Math.max(0, videoNodePosition.y + OFFSET_Y),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- derive-end-frame`
Expected: PASS

- [ ] **Step 5: Implement the hook**

Create `src/hooks/use-derive-end-frame.ts`:

```ts
"use client";

import { useCallback } from "react";
import { useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import { endFrameNodePosition } from "@/lib/video-gen/derive-end-frame";

/**
 * D84 — the end frame is an EDIT of the start frame, not a fresh generation. Interpolation
 * morphs in proportion to how far apart the two frames are, so the end frame must be a near
 * neighbour: same scene, same lighting, subject moved.
 */
export function useDeriveEndFrame() {
  const store = useCanvasStoreApi();

  const deriveEndFrame = useCallback(
    ({
      videoNodeId,
      startFrameUrl,
      videoNodePosition,
    }: {
      videoNodeId: string;
      startFrameUrl: string;
      videoNodePosition: { x: number; y: number };
    }): string => {
      const state = store.getState();
      const newNodeId = crypto.randomUUID();

      state.addNode("image-gen", endFrameNodePosition(videoNodePosition), newNodeId);
      state.updateNodeData(newNodeId, {
        title: "End frame",
        mode: "edit",
        editSourceUrl: startFrameUrl,
      });
      state.connectNodes(newNodeId, videoNodeId);

      return newNodeId;
    },
    [store],
  );

  return { deriveEndFrame };
}
```

- [ ] **Step 6: Confirm the image-gen edit-mode data keys**

Read `src/components/nodes/image-gen-focus-view.tsx` and find which `data` keys put the node into
edit mode with a source image. Replace `mode: "edit"` / `editSourceUrl` in Step 5 with the exact
keys that component reads. Do not guess — if the node uses a different mechanism (for example an
upstream connection rather than a data key), wire it that way and update the hook's comment.

- [ ] **Step 7: Wire the action into the focus view**

In `src/components/nodes/video-gen-focus-view.tsx`, call `useDeriveEndFrame()`, resolve the start
frame's URL from `upstreamImages` using `effectiveImageRoles`, and pass the handler down. The
video node's position comes from the canvas store by id. Set the new node's role to `end_frame`
in `imageRoles` via the existing `onPatch` so it is used as the end frame once it produces output:

```ts
  const { deriveEndFrame } = useDeriveEndFrame();
  const [creatingEndFrame, setCreatingEndFrame] = useState(false);

  function handleCreateEndFrame() {
    const startId = Object.entries(effectiveImageRoles)
      .find(([, role]) => role === "start_frame")?.[0];
    const startImage = upstreamImages.find((img) => img.id === startId);
    if (!startImage) return;

    setCreatingEndFrame(true);
    try {
      const node = storeApi.getState().nodes.find((n) => n.id === nodeId);
      const newId = deriveEndFrame({
        videoNodeId: nodeId,
        startFrameUrl: startImage.imageUrl,
        videoNodePosition: node?.position ?? { x: 0, y: 0 },
      });
      onPatch({ imageRoles: { ...imageRolesProp, [newId]: "end_frame" } });
      toast.success("End frame node created — edit the start frame to set the ending");
    } finally {
      setCreatingEndFrame(false);
    }
  }
```

Pass `onCreateEndFrame={handleCreateEndFrame}` and `creatingEndFrame={creatingEndFrame}` to
`<VideoGenShotSpine />`.

- [ ] **Step 8: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/hooks/use-derive-end-frame.ts src/lib/video-gen/derive-end-frame.ts \
        src/components/nodes/video-gen-focus-view.tsx \
        src/lib/video-gen/__tests__/derive-end-frame.test.ts
git commit -m "feat(video-gen): derive the end frame from the start frame

Create end frame spawns an image-gen node in edit mode seeded with the
start frame and wires it back as the end frame. An edit rather than a
fresh generation, because interpolation morphs in proportion to how far
apart the two frames are (D84).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Correct the capability matrix

The 2026-07-25 living doc contains a ranked action item that would cause a regression.

**Files:**
- Modify: `docs/superpowers/specs/2026-07-25-video-model-capability-matrix.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Apply the five corrections**

1. **§1b, "End frame → duration = 8s" row.** Change the verdict from 🐛 *likely over-restriction*
   to ✅ **correct**. Replace the reasoning with: *"Undocumented but real — confirmed from
   telemetry: node `faab1d1d`, `veo-3.1-lite`, start+end at `duration 6` returned 400 'Your use
   case is currently not supported'; the identical call at `duration 8` succeeded two minutes
   later. Rule V7."*
2. **§1b, "Reference images ⟷ start/end frame" row.** Change ⚠ to ✅ **documented**, citing the
   installed `@google/genai` `GenerateVideosConfig.referenceImages` doc comment: *"If this field is
   provided, the text prompt field must also be provided. The image, video, or last_frame field
   are not supported."*
3. **§4, action items 2 and 6.** Strike both — item 2 would cause a regression, item 6 rests on
   the incorrect premise that the mutex is undocumented.
4. **§2 (all subsections).** Add a banner at the top of §2: *"⚠ SUPERSEDED as of the 2026-07-26
   provider consolidation. The `/v1/videos/image2video` endpoint, models 1.5 / 1.6 / 2.1 /
   2.1-Master / 2.6, and the `camera_control`, `cfg_scale` and `mode` params are no longer in the
   registry. The roster is Veo ×3 + Kling 3.0 + Kling O1, on the unified `contents`/`settings`
   API. See `2026-07-28-video-start-end-spine-design.md` §3 for the current matrix."*
5. **§2d.** Kling O1 is now integrated as `kling:kling-o1`.

- [ ] **Step 2: Record the sourcing hazard**

Append to §6 (Open / low-confidence items):

> **Sourcing hazard.** Kling's documentation returns **HTTP 446** to automated fetching. The
> 2026-07-23 D77 pass fell back to third-party wrapper mirrors for the omni model, which carry
> *their own* narrower limits — that is how Kling O1 acquired a 3–10s duration, no `native` audio
> and no `4k`. Kling doc pages must be read with a browser User-Agent or pasted in manually; a
> wrapper is never an acceptable source for a vendor limit.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-25-video-model-capability-matrix.md
git commit -m "docs(video-gen): correct the capability matrix

Action item 2 (relax the Veo end-frame 8s lock) would have caused a
regression — telemetry proves the lock is correct. The refs/frames mutex
is documented in the SDK, not merely implied. Section 2 is superseded by
the 2026-07-26 consolidation. Also records the HTTP 446 sourcing hazard
that let wrapper limits into the O1 config.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Manual verification (cannot be done locally)

Async video generation never completes on a dev machine. After deploying this branch remotely,
the user should run:

1. **Kling 3.0, start + end frame, duration 12.** Expect success — confirms the 3–15s range holds
   with an end frame, which no telemetry has yet exercised.
2. **Kling O1, start frame + 2 references, duration 5.** Expect success — confirms `refer_image`
   is accepted alongside `first_frame` and that our `id` scheme is valid.
3. **Kling O1, start frame + 2 references, duration 7.** **This is the decisive one.** If it
   succeeds, references do unlock the full 3–15s range and `klingO1Params` can move from the 5/10
   select to a 3–15 slider gated on `referenceCount > 0`. If it returns code 1201 again, the 5/10
   restriction is unconditional and the select is correct as shipped.
4. **Any Kling model with a non-empty negative prompt vs the same prompt with it emptied.** The
   field is undocumented on both endpoints; if the outputs are indistinguishable it is a silent
   no-op and `KLING_NEGATIVE_DEFAULT` plus its always-visible textarea are doing nothing.

Report results as observations, not as passing tests.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §5.1 shot spine strip | 6 |
| §5.2 derive end frame | 7 |
| §5.3 UI reconciliation (D86) | 4 |
| §5.3 new Kling rules | 3 |
| §5.3 server rejects (D85) | 5 |
| §5.4 Kling config corrections (D87) | 1 |
| §5.5 Kling O1 references (D88) | 2, 3 |
| §6 capability matrix corrections | 8 |
| §8 verification approach | Manual verification section |

**Known gap, deliberately deferred:** §5.5's relaxation of the start-frame requirement for omni.
Rule OM8 makes `aspect_ratio` mandatory when no first frame is present, and no Kling param spec
defines it. Raise at the first review checkpoint.

**Placeholder scan:** no TBD/TODO. Task 7 Step 6 is an explicit *read-and-confirm* action against a
named file, not a placeholder — the surrounding implementation is concrete, and only the two
edit-mode data keys are to be confirmed against `image-gen-focus-view.tsx`.

**Type consistency:** `reconcileLockedParams` and `validateAgainstRules` are both added to
`constraints.ts` and both used with the signatures declared in their Interfaces blocks.
`describeShotSpine` returns `ShotSpineModel`, consumed by `VideoGenShotSpine` as `model`.
`KLING_30_IMAGE_INPUTS` / `KLING_O1_IMAGE_INPUTS` are introduced in Task 1 and reused in Tasks 2–3
under those exact names, in both `providers/kling.ts` and `client-models.ts`.
