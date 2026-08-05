# Image Input-Token Static Estimate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the live OpenAI/Gemini input-token-counting API calls in the pre-generation
image cost estimate with static, derived formulas, so the "Est. N credits" label updates
instantly on every param change instead of waiting on a vendor round-trip.

**Architecture:** Two new pure functions in `cost.ts` (`estimateGeminiInputTokens`,
`estimateOpenAIInputTokens`) replace `countGeminiInputTokens`/`countOpenAIInputTokens`.
`estimate.ts` becomes fully synchronous. The two live-call functions and their now-dead
`TOKEN_COUNTING_MODEL` constant are deleted from the provider files. The UI's 300ms debounce
is removed since there's no longer a live network call to guard against.

**Tech Stack:** TypeScript, Next.js API routes, Vitest.

## Global Constraints

- Real settlement (`succeedGeneration`, `computeImageCost`) is untouched — always uses actual
  provider `usage`, never this estimate.
- Output-cost tables in `cost.ts` (`OPENAI_IMAGE_ESTIMATE_TABLE`, `GEMINI_IMAGE_ESTIMATE_TABLE`)
  are untouched.
- The `/api/nodes/[id]/image-generate/estimate` HTTP request/response JSON shape is unchanged
  — the client may keep sending `prompt`; the server just stops reading it.
- All new constants are rounded **up** from the historical p90 (never the median/mean) —
  never under-reserve credits.
- Full derivation and sourcing: `docs/superpowers/specs/2026-08-03-image-input-cost-static-estimate-design.md`
  (ADR **D92** in `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`).

---

### Task 1: Static input-token estimate functions in `cost.ts`

**Files:**
- Modify: `src/lib/image-gen/cost.ts` (append after the existing `estimateImageInputCost`,
  currently ending at line 118)
- Test: `src/lib/image-gen/__tests__/cost.test.ts`

**Interfaces:**
- Produces: `estimateGeminiInputTokens(referenceCount: number): number` and
  `estimateOpenAIInputTokens(modelId: string, referenceCount: number): number`, both exported
  from `src/lib/image-gen/cost.ts`. Task 2 imports both.

- [ ] **Step 1: Write the failing tests**

Add these two `describe` blocks to the end of
`src/lib/image-gen/__tests__/cost.test.ts`, and update its top import line to pull in the two
new functions:

```ts
import { computeImageCost, estimateImageOutputCost, estimateImageInputCost, estimateGeminiInputTokens, estimateOpenAIInputTokens } from "../cost";
```

(replaces the existing `import { computeImageCost, estimateImageOutputCost,
estimateImageInputCost } from "../cost";` line at the top of the file)

```ts
describe("estimateGeminiInputTokens", () => {
  it("returns the base token count for zero references", () => {
    expect(estimateGeminiInputTokens(0)).toBe(180);
  });

  it("adds 260 tokens per reference image", () => {
    expect(estimateGeminiInputTokens(1)).toBe(440);
    expect(estimateGeminiInputTokens(4)).toBe(1220);
  });
});

describe("estimateOpenAIInputTokens", () => {
  it("returns the base token count for zero references, regardless of model", () => {
    expect(estimateOpenAIInputTokens("openai:gpt-image-2", 0)).toBe(190);
    expect(estimateOpenAIInputTokens("openai:gpt-image-1-mini", 0)).toBe(190);
  });

  it("uses the lower per-reference constant for gpt-image-1 and gpt-image-1-mini", () => {
    expect(estimateOpenAIInputTokens("openai:gpt-image-1", 2)).toBe(190 + 2 * 330);
    expect(estimateOpenAIInputTokens("openai:gpt-image-1-mini", 3)).toBe(190 + 3 * 330);
  });

  it("uses the higher per-reference constant for gpt-image-2", () => {
    expect(estimateOpenAIInputTokens("openai:gpt-image-2", 1)).toBe(190 + 1550);
  });

  it("falls back to the highest known constant for an unrecognized model — never under-reserve", () => {
    expect(estimateOpenAIInputTokens("openai:some-future-model", 1)).toBe(190 + 1550);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/image-gen/__tests__/cost.test.ts`
Expected: FAIL — `estimateGeminiInputTokens is not a function` / `estimateOpenAIInputTokens is not a function` (or a TS import error, since neither is exported from `cost.ts` yet).

- [ ] **Step 3: Implement the functions**

Append to the end of `src/lib/image-gen/cost.ts` (after the closing `}` of
`estimateImageInputCost`):

```ts

// ── Pre-generation INPUT token estimate — static, no live vendor API call ──────────────────
//
// D92 (docs/superpowers/specs/2026-08-03-image-input-cost-static-estimate-design.md):
// analysis of 659 real (non-test-client) historical generations across staging + production
// found input tokens predictable enough from reference-image count alone that a live
// per-request token-counting call isn't needed. Gemini fits `180 + refs*260` cleanly across
// all 4 model variants (independently matches Google's published 258-tokens/image-tile
// formula). OpenAI fits `190 + refs*perModelConstant`, constant per MODEL (not per size) once
// legacy pixel-size and aspect-ratio snapshot formats are normalized to one key. All
// constants rounded UP from the historical p90 (not median), matching
// estimateImageOutputCost's "auto"→"high" never-under-reserve philosophy above.

const GEMINI_BASE_INPUT_TOKENS = 180;
const GEMINI_PER_REFERENCE_INPUT_TOKENS = 260;

/**
 * Estimated Gemini input tokens for a given reference-image count — replaces the live
 * countTokens() call. Model-independent: the fit held identically across all 4 Gemini image
 * model variants in the historical data.
 */
export function estimateGeminiInputTokens(referenceCount: number): number {
  return GEMINI_BASE_INPUT_TOKENS + referenceCount * GEMINI_PER_REFERENCE_INPUT_TOKENS;
}

const OPENAI_BASE_INPUT_TOKENS = 190;

// Per-reference-image token cost, by model — NOT by size (size had no meaningful effect once
// legacy pixel-size and aspect-ratio snapshot formats were normalized to one key; see the
// design doc §3). gpt-image-2 tokenizes reference images at ~5x the rate of the other two
// models — it's the flagship, higher-fidelity model.
const OPENAI_PER_REFERENCE_INPUT_TOKENS: Record<string, number> = {
  "openai:gpt-image-1": 330,
  "openai:gpt-image-1-mini": 330,
  "openai:gpt-image-2": 1550,
};

/**
 * Estimated OpenAI input tokens for a given model + reference-image count — replaces the
 * live responses.inputTokens.count() call. An unrecognized modelId falls back to the highest
 * known per-reference constant (gpt-image-2's), never the lowest — never under-reserve.
 */
export function estimateOpenAIInputTokens(modelId: string, referenceCount: number): number {
  if (referenceCount === 0) return OPENAI_BASE_INPUT_TOKENS;
  const perReference = OPENAI_PER_REFERENCE_INPUT_TOKENS[modelId] ?? 1550;
  return OPENAI_BASE_INPUT_TOKENS + referenceCount * perReference;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/image-gen/__tests__/cost.test.ts`
Expected: PASS, all tests in the file including the new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-gen/cost.ts src/lib/image-gen/__tests__/cost.test.ts
git commit -m "feat(image-gen): add static input-token estimate functions (D92)"
```

---

### Task 2: Rewire `estimate.ts` to use the static functions; drop the live provider calls' only caller

**Files:**
- Modify: `src/lib/image-gen/estimate.ts`
- Modify: `src/app/api/nodes/[id]/image-generate/estimate/route.ts`
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts:268-276`
- Test: `src/lib/image-gen/__tests__/estimate.test.ts` (new file)

**Interfaces:**
- Consumes: `estimateGeminiInputTokens`, `estimateOpenAIInputTokens` from
  `src/lib/image-gen/cost.ts` (Task 1). `aspectRatioToOpenAISize` from
  `src/lib/image-gen/providers/openai.ts` (already exists, unchanged).
- Produces: `estimateImageGenerationCostUsd(input: { modelId: string; quality: string |
  undefined; aspectRatio: string | undefined; imageSize: string | undefined; referenceUrls:
  string[] }): number | null` — now synchronous (no `Promise`, no `prompt` field). Both API
  routes call it without `await` and without passing `prompt`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/image-gen/__tests__/estimate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { estimateImageGenerationCostUsd } from "../estimate";

describe("estimateImageGenerationCostUsd", () => {
  it("returns null when there is no output-cost entry for the model", () => {
    expect(
      estimateImageGenerationCostUsd({
        modelId: "unknown:model",
        quality: "medium",
        aspectRatio: "1:1",
        imageSize: undefined,
        referenceUrls: [],
      }),
    ).toBeNull();
  });

  it("sums output + input cost for an OpenAI model with one reference image", () => {
    // gpt-image-2 medium 1024x1024 output = 0.053 (OPENAI_IMAGE_ESTIMATE_TABLE).
    // 1 reference -> inputTokens = 190 + 1550 = 1740; imgIn rate $8/1M -> 0.01392.
    const result = estimateImageGenerationCostUsd({
      modelId: "openai:gpt-image-2",
      quality: "medium",
      aspectRatio: "1:1",
      imageSize: undefined,
      referenceUrls: ["https://example.com/ref.png"],
    });
    expect(result).toBeCloseTo(0.053 + 0.01392, 5);
  });

  it("sums output + input cost for a Gemini model with zero references", () => {
    // gemini-3.1-flash-image 1K output = 0.067 (GEMINI_IMAGE_ESTIMATE_TABLE).
    // 0 references -> inputTokens = 180; textIn rate $0.50/1M -> 0.00009.
    const result = estimateImageGenerationCostUsd({
      modelId: "gemini:gemini-3.1-flash-image",
      quality: undefined,
      aspectRatio: undefined,
      imageSize: "1K",
      referenceUrls: [],
    });
    expect(result).toBeCloseTo(0.067 + 0.00009, 5);
  });

  it("is synchronous — does not return a Promise", () => {
    const result = estimateImageGenerationCostUsd({
      modelId: "openai:gpt-image-2",
      quality: "medium",
      aspectRatio: "1:1",
      imageSize: undefined,
      referenceUrls: [],
    });
    expect(result).not.toBeInstanceOf(Promise);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/image-gen/__tests__/estimate.test.ts`
Expected: FAIL — `estimateImageGenerationCostUsd` still requires `prompt` (TS error) and/or
still returns a `Promise` (the "is synchronous" test fails).

- [ ] **Step 3: Rewrite `estimate.ts`**

Replace the full contents of `src/lib/image-gen/estimate.ts` with:

```ts
import "server-only";
import {
  estimateImageOutputCost,
  estimateImageInputCost,
  estimateGeminiInputTokens,
  estimateOpenAIInputTokens,
} from "./cost";
import { aspectRatioToOpenAISize } from "./providers/openai";

/**
 * Exact-when-possible pre-generation cost estimate for an image model, in USD. Shared by the
 * real generation route (image-generate/route.ts, which reserves against it) and the
 * estimate-only preview route (image-generate/estimate/route.ts) — the same computation
 * either way, so what's shown to the user always matches what gets reserved. Returns null
 * when estimateImageOutputCost has no priced entry for this model/quality/size — the real
 * route fails closed on null (design spec §4); the preview route just shows "unavailable".
 *
 * Synchronous — input-token cost is a static derived estimate (D92,
 * docs/superpowers/specs/2026-08-03-image-input-cost-static-estimate-design.md), not a live
 * per-request vendor API call.
 */
export function estimateImageGenerationCostUsd(input: {
  modelId: string;
  quality: string | undefined;
  aspectRatio: string | undefined;
  imageSize: string | undefined;
  referenceUrls: string[];
}): number | null {
  const isOpenAI = input.modelId.startsWith("openai:");
  const sizeKey = isOpenAI
    ? aspectRatioToOpenAISize(input.aspectRatio ?? "1:1")
    : (input.imageSize ?? "1K");

  const outputCostUsd = estimateImageOutputCost(input.modelId, input.quality, sizeKey);
  if (outputCostUsd === null) return null;

  const referenceCount = input.referenceUrls.length;
  const hasReferenceImages = referenceCount > 0;
  const inputTokens = isOpenAI
    ? estimateOpenAIInputTokens(input.modelId, referenceCount)
    : estimateGeminiInputTokens(referenceCount);
  const inputCostUsd = estimateImageInputCost(input.modelId, inputTokens, hasReferenceImages) ?? 0;

  return outputCostUsd + inputCostUsd;
}
```

- [ ] **Step 4: Update the estimate-preview route to match the new signature**

In `src/app/api/nodes/[id]/image-generate/estimate/route.ts`, remove the `prompt` field from
the parsed-body type, delete the `const prompt = ...` line, remove `prompt,` from the
`estimateImageGenerationCostUsd` call, and drop the now-unnecessary `await`. Replace the full
file contents with:

```ts
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { usdToFinalCredits } from "@/lib/credits/units";
import { imageGenRegistry } from "@/lib/image-gen/registry";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

// Read-only preview — never writes to generations or credit_transactions. Reuses the exact
// same computation image-generate/route.ts reserves against (estimateImageGenerationCostUsd),
// so the number shown here always matches what the real request would reserve.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(params, async () => {
    const body = (await req.json().catch(() => null)) as
      | {
          modelId?: unknown;
          quality?: unknown;
          aspect_ratio?: unknown;
          image_size?: unknown;
          referenceUrls?: unknown;
        }
      | null;

    const modelId = typeof body?.modelId === "string" ? body.modelId : null;
    if (!modelId || !imageGenRegistry[modelId]) {
      return apiError(`Unknown modelId: ${modelId}`, 400);
    }
    const referenceUrls = Array.isArray(body?.referenceUrls)
      ? (body.referenceUrls as unknown[]).filter((u): u is string => typeof u === "string")
      : [];

    const costUsd = estimateImageGenerationCostUsd({
      modelId,
      quality: typeof body?.quality === "string" ? body.quality : undefined,
      aspectRatio: typeof body?.aspect_ratio === "string" ? body.aspect_ratio : undefined,
      imageSize: typeof body?.image_size === "string" ? body.image_size : undefined,
      referenceUrls,
    });

    return apiOk({
      estimatedCredits: costUsd === null ? null : usdToFinalCredits(costUsd),
    });
  });
}
```

- [ ] **Step 5: Update the real generation route's call site**

In `src/app/api/nodes/[id]/image-generate/route.ts`, find this block (around line 268):

```ts
    try {
      const costUsd = await estimateImageGenerationCostUsd({
        modelId,
        quality: validatedParams.quality as string | undefined,
        aspectRatio: validatedParams.aspect_ratio as string | undefined,
        imageSize: validatedParams.image_size as string | undefined,
        prompt,
        referenceUrls,
      });
```

Replace it with (drop `await` and the `prompt,` line — `prompt` the variable stays defined
and is still used later in this same route for the actual `config.generate({ prompt, ... })`
call, only this one call site stops passing it):

```ts
    try {
      const costUsd = estimateImageGenerationCostUsd({
        modelId,
        quality: validatedParams.quality as string | undefined,
        aspectRatio: validatedParams.aspect_ratio as string | undefined,
        imageSize: validatedParams.image_size as string | undefined,
        referenceUrls,
      });
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/lib/image-gen/__tests__/estimate.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 7: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors. This catches any other call site of `estimateImageGenerationCostUsd`
that still passes `prompt` or still expects a `Promise` — if one is found, fix it the same way
as Step 5 (drop `await`, drop `prompt`).

- [ ] **Step 8: Commit**

```bash
git add src/lib/image-gen/estimate.ts src/lib/image-gen/__tests__/estimate.test.ts src/app/api/nodes/[id]/image-generate/estimate/route.ts "src/app/api/nodes/[id]/image-generate/route.ts"
git commit -m "feat(image-gen): make estimateImageGenerationCostUsd synchronous, drop live token-count calls"
```

---

### Task 3: Delete the now-dead live token-counting functions

**Files:**
- Modify: `src/lib/image-gen/providers/openai.ts:12-21` (delete `TOKEN_COUNTING_MODEL`),
  `:303-330` (delete `countOpenAIInputTokens`)
- Modify: `src/lib/image-gen/providers/gemini.ts:80-103` (delete `countGeminiInputTokens`)

**Interfaces:**
- Consumes: nothing new — this task only removes code no longer called by anything after
  Task 2.
- Produces: nothing new.

- [ ] **Step 1: Confirm nothing still references the functions being removed**

Run: `grep -rn "countOpenAIInputTokens\|countGeminiInputTokens\|TOKEN_COUNTING_MODEL" src/`
Expected: only matches inside `src/lib/image-gen/providers/openai.ts` and
`src/lib/image-gen/providers/gemini.ts` themselves (the function definitions) — no call sites
anywhere else. If Task 2 was completed correctly, `estimate.ts` no longer appears in this
output.

- [ ] **Step 2: Delete `countOpenAIInputTokens` and `TOKEN_COUNTING_MODEL` from `providers/openai.ts`**

Delete this block (lines 12-21):

```ts
// Model used ONLY for the input-token-counting call in countOpenAIInputTokens below — NOT an
// image generation model (gpt-image-2/gpt-image-1/-mini aren't valid Responses-API models,
// and responses.inputTokens.count() requires a Responses-API model). OpenAI's docs confirm
// `model` is required but give no guidance for this specific case: image generation never
// goes through the Responses API, so there is no "real" model to match, unlike every other
// documented use of this endpoint. Reuses this app's existing default OpenAI text model
// (src/prompts/prompt-generate.ts) as a pragmatic choice, confirmed to work (no error) via a
// live diagnostic probe on 2026-07-25 — not confirmed correct for vision-token accuracy by
// any source. Revisit if OpenAI ever publishes clearer guidance for this case.
const TOKEN_COUNTING_MODEL = "gpt-5.4-mini";
```

And delete this block (currently lines 303-330, immediately before the `// ── Model configs`
section comment):

```ts
/**
 * Live pre-flight input-token count via OpenAI's official token-counting endpoint
 * (`responses.inputTokens.count`) — handles text-only and text+reference-image requests in
 * one call. Used by the pre-generation estimate (design spec §5). One inference, not a
 * directly confirmed 1:1 mapping to the Images API's own billing (see the design spec) —
 * worth a real-world sanity check once implemented, same as noted there. Passes
 * TOKEN_COUNTING_MODEL (see its own comment above) — the endpoint requires a model but this
 * request is never actually sent to it, so the choice is a pragmatic default, not a
 * documented answer. Always a fresh live call, never cached.
 */
export async function countOpenAIInputTokens(
  prompt: string,
  referenceUrls: string[],
): Promise<number> {
  const openai = createOpenAI();
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; detail: "auto"; image_url: string }
  > = [{ type: "input_text", text: prompt }];
  for (const url of referenceUrls) {
    content.push({ type: "input_image", detail: "auto", image_url: url });
  }
  const response = await openai.responses.inputTokens.count({
    model: TOKEN_COUNTING_MODEL,
    input: [{ role: "user", content }],
  });
  return response.input_tokens ?? 0;
}
```

- [ ] **Step 3: Delete `countGeminiInputTokens` from `providers/gemini.ts`**

Delete this block (currently lines 80-103, immediately before the `// ── Model configs`
section comment):

```ts
/**
 * Live pre-flight input-token count via Gemini's official countTokens endpoint — sends the
 * exact same `contents` shape generateWithGemini uses, so the count matches what a real
 * generation call would actually bill for input. Used by the pre-generation estimate
 * (design spec §5). Always a fresh live call, never cached.
 */
export async function countGeminiInputTokens(
  apiModelId: string,
  prompt: string,
  referenceUrls: string[],
): Promise<number> {
  const ai = createGemini();
  const refParts = await Promise.all(
    referenceUrls.map(async (url) => {
      const { mimeType, data } = await urlToInlineData(url);
      return { inlineData: { mimeType, data } };
    }),
  );
  const response = await ai.models.countTokens({
    model: apiModelId,
    contents: [{ role: "user", parts: [...refParts, { text: prompt }] }],
  });
  return response.totalTokens ?? 0;
}
```

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `npx vitest run`
Expected: PASS, no failures (in particular no import errors for the deleted exports).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx eslint src/lib/image-gen/providers/openai.ts src/lib/image-gen/providers/gemini.ts`
Expected: no errors (in particular no unused-import warnings — `createOpenAI`/`createGemini`
are still used by `generateWithOpenAI`/`generateWithGemini` in the same files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-gen/providers/openai.ts src/lib/image-gen/providers/gemini.ts
git commit -m "refactor(image-gen): delete dead live token-counting functions (superseded by D92)"
```

---

### Task 4: Remove the now-unnecessary 300ms debounce in the focus view

**Files:**
- Modify: `src/components/nodes/image-gen-focus-view.tsx:330-397` (Generate-tab estimate
  effect)
- Modify: `src/components/nodes/image-gen-focus-view.tsx:496-559` (Edit-tab estimate effect)

**Interfaces:**
- Consumes: `/api/nodes/[id]/image-generate/estimate` (Task 2's route, unchanged request/
  response JSON shape).
- Produces: nothing new — purely a latency/UX change, same `estimatedCredits` /
  `editEstimatedCredits` state contracts as before.

- [ ] **Step 1: Replace the Generate-tab debounce**

In `src/components/nodes/image-gen-focus-view.tsx`, find the block starting with the comment
`// Debounced pre-generation cost estimate — mirrors the 300ms debounce pattern...` (around
line 330) through the end of its `useEffect` dependency array (around line 397). Replace the
whole block with:

```tsx
  // Pre-generation cost estimate. Only meaningful on the Generate tab (Edit has its own
  // action button, out of scope per this plan) and once there's a prompt to estimate from.
  // No debounce: the estimate route computes input-token cost from a static derived formula
  // (D92) rather than a live vendor API call, so there's no per-keystroke cost to guard
  // against — the fetch to our own /estimate route fires immediately on every param change.
  useEffect(() => {
    if (!open || activeTab === "edit" || !promptUpstream) {
      setEstimatedCredits(null);
      setEstimating(false);
      return;
    }
    if (!fetchedPrompt?.text) {
      // A prompt node IS connected, but its output hasn't loaded yet (the separate
      // fetchedPrompt effect above is still in flight) — this is not the same as "no
      // prompt connected," so keep the button in its disabled/loading state rather than
      // flashing it enabled with no cost for the second or two before the fetch resolves.
      // That fetch's completion updates fetchedPrompt.text, which re-runs this effect.
      setEstimating(true);
      return;
    }
    let cancelled = false;
    setEstimating(true);
    void (async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/image-generate/estimate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: model.id,
            quality: paramValues.quality,
            aspect_ratio: paramValues.aspect_ratio,
            image_size: paramValues.image_size,
            prompt: fetchedPrompt.text,
            referenceUrls: connectedImageUrls,
          }),
        });
        const json = (await res.json()) as { estimatedCredits: number | null };
        if (cancelled) return;
        if (res.ok) {
          setEstimatedCredits(json.estimatedCredits);
        } else {
          setEstimatedCredits(null);
        }
      } catch {
        if (!cancelled) setEstimatedCredits(null);
      } finally {
        if (!cancelled) setEstimating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // connectedImageUrls/paramValues/fetchedPrompt omitted on purpose — each is a new object
    // reference on renders that don't actually change its contents (e.g. a sibling state
    // update, or the [open, upstream] prompt-fetch effect re-running and producing a new-but-
    // equal fetchedPrompt object), which was re-firing this effect (and re-fetching the
    // estimate) with no real input change. Stable JSON-stringified/primitive stand-ins fix it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    activeTab,
    Boolean(promptUpstream),
    selectedModelId,
    JSON.stringify(paramValues),
    connectedImageUrlsKey,
    fetchedPrompt?.text,
    nodeId,
  ]);
```

- [ ] **Step 2: Replace the Edit-tab debounce**

In the same file, find the block starting with the comment `// Debounced pre-generation cost
estimate for the Edit tab...` (around line 496) through the end of its `useEffect` dependency
array (around line 559). Replace the whole block with:

```tsx
  // Pre-generation cost estimate for the Edit tab, keyed off the edit flow's own inputs (the
  // same prompt/references handleEdit() itself sends), since editing reserves and charges
  // credits the same way generating does. No debounce — see the Generate-tab estimate effect
  // above for why. Reference-URL approximation matches the Generate estimate's own precedent:
  // this passes the raw base+extras list, not assembleEditReferences()'s post-max-count/dedup
  // list the real route actually reserves against — an existing, accepted gap between
  // estimate and reservation, kept consistent rather than special-cased.
  useEffect(() => {
    if (!open || activeTab !== "edit" || !canEditBase || !finalPrompt.trim()) {
      setEditEstimatedCredits(null);
      setEditEstimating(false);
      return;
    }
    let cancelled = false;
    setEditEstimating(true);
    const referenceUrls = [editBaseUrl, ...selectedExtraUrls].filter(
      (u): u is string => Boolean(u),
    );
    void (async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/image-generate/estimate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: model.id,
            quality: paramValues.quality,
            aspect_ratio: paramValues.aspect_ratio,
            image_size: paramValues.image_size,
            prompt: finalPrompt,
            referenceUrls,
          }),
        });
        const json = (await res.json()) as { estimatedCredits: number | null };
        if (cancelled) return;
        if (res.ok) {
          setEditEstimatedCredits(json.estimatedCredits);
        } else {
          setEditEstimatedCredits(null);
        }
      } catch {
        if (!cancelled) setEditEstimatedCredits(null);
      } finally {
        if (!cancelled) setEditEstimating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // paramValues (an object) goes in via JSON.stringify, same reason as the Generate
    // estimate effect above — a stable primitive stand-in avoids re-firing on renders that
    // don't actually change its contents. finalPrompt is already a string primitive, so it's
    // used directly with no stand-in needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    activeTab,
    canEditBase,
    selectedModelId,
    JSON.stringify(paramValues),
    finalPrompt,
    editReferenceUrlsKey,
    nodeId,
  ]);
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx eslint src/components/nodes/image-gen-focus-view.tsx`
Expected: no errors (in particular the `react-hooks/exhaustive-deps` disable comments must
stay directly above their `useEffect` dependency arrays, same as before).

- [ ] **Step 4: Manually verify in the running app**

This project has no component-render test infrastructure (`vitest.config.ts` runs tests in a
plain Node environment, not jsdom) — verify by hand:

Run: `npm run dev`

Open an Image Gen node's focus view with a prompt connected, switch to the Generate tab, and
change the quality/aspect-ratio param a few times. Expected: the "Est. N credits" label
updates immediately (no ~300ms+ visible lag before the number changes), and switching tabs or
closing the panel doesn't leave a stale estimate or throw a console error. Repeat on the Edit
tab with a base image and at least one reference image selected.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/image-gen-focus-view.tsx
git commit -m "perf(image-gen): drop the 300ms cost-estimate debounce, now unnecessary (D92)"
```
