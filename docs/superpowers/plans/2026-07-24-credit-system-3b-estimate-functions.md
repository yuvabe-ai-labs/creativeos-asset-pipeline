# Credit System 3B — Estimate Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every pure/near-pure function the credit system needs to turn a real or
estimated USD cost into a final credit number, and to get an exact or approximate USD/credit
estimate before a generation starts — with no ledger, reservation, or UI wiring yet (that's
3C/3E).

**Architecture:** Five independent, narrowly-scoped additions: a new `src/lib/credits/`
module holding the shared USD→credits conversion and the prompt/text heuristic; an addition
to the existing `image-gen/cost.ts` for the exact image output-cost lookup; and one new
exported function in each image provider file (`gemini.ts`, `openai.ts`) wrapping that
provider's own live token-counting endpoint. Nothing here touches the database, a route
handler, or a React component — every function takes plain arguments and returns a plain
value or a `Promise` of one.

**Tech Stack:** TypeScript, `@google/genai` (already a dependency, used via `ai.models
.countTokens()`), `openai` SDK (already a dependency, used via `openai.responses.inputTokens
.count()`), vitest.

## Global Constraints

- `usdToFinalCredits` is the **only** place `USD_TO_CREDITS`, margin, or rounding are
  applied — every other function in this plan returns a raw USD number (image, video — video
  needs no new code, `computeVideoCost` already exists) or, for the prompt/text estimate
  only, a credit number directly (see Task 2 — it has no underlying USD cost to convert, so
  it deliberately does not call `usdToFinalCredits`).
- `MARGIN_PERCENT` starts at `0`, `CREDIT_ROUND_STEP` starts at `5`,
  `CREDIT_ROUND_DIRECTION` starts at `"up"` — exact values from
  `docs/superpowers/specs/2026-07-24-credit-system-design.md` §2a. Round **up**, never down
  or nearest.
- `gpt-image-2`/`gpt-image-1`'s `quality: "auto"` has no published price — the image
  estimate table treats it as `"high"` (worst case), per design spec §5's noted decision.
  `gpt-image-1-mini` has no `"auto"` option (`params/openai.ts`) — not a case to handle.
  `gemini-2.5-flash-image` only ever sends `image_size: "1K"` (`params/gemini.ts`) — its
  estimate table entry has exactly one key.
- The Gemini and OpenAI token-counting functions are async I/O calls to a live provider
  endpoint, not pure logic — per this repo's established testing convention (see
  `2026-07-23-admin-ux-index.md`'s testing-convention note, restated in the Stage 3 plan
  index), they get build verification, not a vitest unit test. Everything else in this plan
  (`usdToFinalCredits`, `estimatePromptCredits`, `estimateImageOutputCost`) is genuinely pure
  and **does** get real unit tests.
- Follow the existing `IMAGE_MODEL_PRICING` / `VIDEO_MODEL_PRICING` pattern already in
  `image-gen/cost.ts` / `video-gen/cost.ts`: model IDs as object keys, exactly matching the
  `id` field on each model's `MediaGenModelSpec` in `registry.ts` (e.g.
  `"openai:gpt-image-2"`, `"gemini:gemini-3.1-flash-image"`).

---

### Task 1: `usdToFinalCredits` — the shared margin/rounding conversion

**Files:**
- Create: `src/lib/credits/units.ts`
- Test: `src/lib/credits/__tests__/units.test.ts`

**Interfaces:**
- Produces: `USD_TO_CREDITS: number`, `MARGIN_PERCENT: number`, `CREDIT_ROUND_STEP: number`,
  `CREDIT_ROUND_DIRECTION: "up" | "down" | "nearest"`, and `usdToFinalCredits(costUsd:
  number): number` — the exact name and signature every later sub-plan (3C's settlement,
  3E's estimate display) must import and call whenever a USD cost becomes a credit number.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/credits/__tests__/units.test.ts
import { describe, it, expect } from "vitest";
import { usdToFinalCredits } from "../units";

describe("usdToFinalCredits", () => {
  it("converts USD to credits and rounds up to the nearest step", () => {
    // 0.005 USD * 1000 = 5 credits, already a multiple of 5 -> stays 5
    expect(usdToFinalCredits(0.005)).toBe(5);
  });

  it("rounds up even a tiny excess over a step boundary", () => {
    // 0.0051 USD * 1000 = 5.1 credits -> rounds up to 10, not down to 5
    expect(usdToFinalCredits(0.0051)).toBe(10);
  });

  it("leaves an already-clean multiple of the step unchanged", () => {
    // 0.24 USD * 1000 = 240 credits, already a multiple of 5
    expect(usdToFinalCredits(0.24)).toBe(240);
  });

  it("handles a large video-scale cost", () => {
    // 2.13 USD * 1000 = 2130 credits, already a multiple of 5
    expect(usdToFinalCredits(2.13)).toBe(2130);
  });

  it("returns 0 for a zero cost", () => {
    expect(usdToFinalCredits(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/credits/__tests__/units.test.ts`
Expected: FAIL — `Cannot find module '../units'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/credits/units.ts
// See docs/superpowers/specs/2026-07-24-credit-system-design.md §2a.
//
// 1 credit = $0.001 USD. USD_TO_CREDITS, MARGIN_PERCENT, CREDIT_ROUND_STEP, and
// CREDIT_ROUND_DIRECTION are all plain, hand-tunable constants — bump any of them later
// (e.g. for margin) without touching the conversion logic itself.
export const USD_TO_CREDITS = 1000;
export const MARGIN_PERCENT = 0;
export const CREDIT_ROUND_STEP = 5;
export const CREDIT_ROUND_DIRECTION: "up" | "down" | "nearest" = "up";

/**
 * The single conversion from a real or estimated USD cost to the final credit number —
 * used identically for the pre-generation estimate shown to the user and the actual
 * settlement charge, so what's shown always matches what's deducted. Applies margin, then
 * rounds in CREDIT_ROUND_DIRECTION to the nearest CREDIT_ROUND_STEP. Rounding up (the
 * starting direction) guarantees the charge never falls short of true cost.
 */
export function usdToFinalCredits(costUsd: number): number {
  const raw = costUsd * USD_TO_CREDITS * (1 + MARGIN_PERCENT / 100);
  switch (CREDIT_ROUND_DIRECTION) {
    case "up":
      return Math.ceil(raw / CREDIT_ROUND_STEP) * CREDIT_ROUND_STEP;
    case "down":
      return Math.floor(raw / CREDIT_ROUND_STEP) * CREDIT_ROUND_STEP;
    case "nearest":
      return Math.round(raw / CREDIT_ROUND_STEP) * CREDIT_ROUND_STEP;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/credits/__tests__/units.test.ts`
Expected: PASS — 5/5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/credits/units.ts src/lib/credits/__tests__/units.test.ts
git commit -m "feat(credits): add usdToFinalCredits (margin + round-up conversion)"
```

---

### Task 2: `estimatePromptCredits` — the prompt/text placeholder formula

**Files:**
- Create: `src/lib/credits/prompt-estimate.ts`
- Test: `src/lib/credits/__tests__/prompt-estimate.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 — this function deliberately does **not** call
  `usdToFinalCredits` (see rationale in the file's own comment below).
- Produces: `PROMPT_ESTIMATE_BASE_CREDITS: number`,
  `PROMPT_ESTIMATE_PER_ATTACHMENT_CREDITS: number`, and `estimatePromptCredits
  (attachmentCount: number): number` — the exact name 3E's UI wiring and 3C's reservation
  call site must use for prompt-type generations. `attachmentCount` is a plain number (the
  count of upstream nodes attached to the prompt node); resolving that count from the canvas
  graph is 3E's job, not this function's.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/credits/__tests__/prompt-estimate.test.ts
import { describe, it, expect } from "vitest";
import { estimatePromptCredits } from "../prompt-estimate";

describe("estimatePromptCredits", () => {
  it("returns the base cost with no attachments", () => {
    expect(estimatePromptCredits(0)).toBe(10);
  });

  it("adds the per-attachment multiplier for each attached node", () => {
    expect(estimatePromptCredits(3)).toBe(25);
  });

  it("scales linearly with attachment count", () => {
    expect(estimatePromptCredits(1)).toBe(15);
    expect(estimatePromptCredits(10)).toBe(60);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/credits/__tests__/prompt-estimate.test.ts`
Expected: FAIL — `Cannot find module '../prompt-estimate'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/credits/prompt-estimate.ts
// See docs/superpowers/specs/2026-07-24-credit-system-design.md §5.
//
// Approximate by design — no vendor can predict an LLM's unwritten output length before it
// generates. Unlike image/video (real vendor $ prices, converted via usdToFinalCredits),
// this heuristic is already credit-denominated with no underlying USD figure to convert —
// it deliberately bypasses usdToFinalCredits. Starting placeholder, no real usage data yet;
// self-corrects over time by refitting against real generations.credits_charged history.
export const PROMPT_ESTIMATE_BASE_CREDITS = 10;
export const PROMPT_ESTIMATE_PER_ATTACHMENT_CREDITS = 5;

export function estimatePromptCredits(attachmentCount: number): number {
  return PROMPT_ESTIMATE_BASE_CREDITS + PROMPT_ESTIMATE_PER_ATTACHMENT_CREDITS * attachmentCount;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/credits/__tests__/prompt-estimate.test.ts`
Expected: PASS — 3/3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/credits/prompt-estimate.ts src/lib/credits/__tests__/prompt-estimate.test.ts
git commit -m "feat(credits): add estimatePromptCredits placeholder formula"
```

---

### Task 3: `estimateImageOutputCost` — exact image output-cost lookup table

**Files:**
- Modify: `src/lib/image-gen/cost.ts`
- Modify: `src/lib/image-gen/__tests__/cost.test.ts`

**Interfaces:**
- Produces: `estimateImageOutputCost(modelId: string, quality: string | undefined, size:
  string): number | null` — returns a USD number (not credits — the call site applies
  `usdToFinalCredits` from Task 1). `size` is the OpenAI pixel string (e.g. `"1024x1024"`,
  from `aspectRatioToOpenAISize()` in `providers/openai.ts`) for OpenAI models, or the
  `image_size` param value (`"512"`, `"1K"`, `"2K"`, `"4K"`) for Gemini models.

- [ ] **Step 1: Write the failing tests**

Append to the existing `src/lib/image-gen/__tests__/cost.test.ts` (add a new `describe`
block after the existing `computeImageCost` one — do not modify the existing tests):

```ts
import { computeImageCost, estimateImageOutputCost } from "../cost";

describe("estimateImageOutputCost", () => {
  it("returns null for an unknown model", () => {
    expect(estimateImageOutputCost("unknown:model", "medium", "1024x1024")).toBeNull();
  });

  it("looks up an exact OpenAI quality/size cell", () => {
    expect(estimateImageOutputCost("openai:gpt-image-2", "medium", "1024x1024")).toBeCloseTo(0.053, 4);
    expect(estimateImageOutputCost("openai:gpt-image-1", "low", "1024x1536")).toBeCloseTo(0.016, 4);
  });

  it("treats quality \"auto\" as \"high\" (no published auto price)", () => {
    expect(estimateImageOutputCost("openai:gpt-image-2", "auto", "1024x1024")).toBeCloseTo(0.211, 4);
    expect(estimateImageOutputCost("openai:gpt-image-2", "auto", "1024x1024")).toBe(
      estimateImageOutputCost("openai:gpt-image-2", "high", "1024x1024"),
    );
  });

  it("returns null for a size not offered by that model", () => {
    expect(estimateImageOutputCost("openai:gpt-image-2", "medium", "1792x1024")).toBeNull();
  });

  it("looks up a flat Gemini size cell (no quality axis)", () => {
    expect(estimateImageOutputCost("gemini:gemini-2.5-flash-image", undefined, "1K")).toBeCloseTo(0.039, 4);
    expect(estimateImageOutputCost("gemini:gemini-3.1-flash-image", undefined, "2K")).toBeCloseTo(0.101, 4);
  });

  it("prices gemini-3-pro-image's 1K and 2K identically, 4K differently", () => {
    expect(estimateImageOutputCost("gemini:gemini-3-pro-image", undefined, "1K")).toBeCloseTo(0.134, 4);
    expect(estimateImageOutputCost("gemini:gemini-3-pro-image", undefined, "2K")).toBeCloseTo(0.134, 4);
    expect(estimateImageOutputCost("gemini:gemini-3-pro-image", undefined, "4K")).toBeCloseTo(0.24, 4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/image-gen/__tests__/cost.test.ts`
Expected: FAIL — `estimateImageOutputCost is not a function` (not exported yet).

- [ ] **Step 3: Write the implementation**

Append to `src/lib/image-gen/cost.ts` (after the existing `computeImageCost` function):

```ts
// Exact per-image OUTPUT cost by quality x size, sourced directly from vendor $ price
// tables — see docs/superpowers/specs/2026-07-24-credit-system-design.md §5 and
// docs/superpowers/specs/2026-07-24-credit-system-full-combinations.md. Not derived from
// the token-based IMAGE_MODEL_PRICING above (gpt-image-2 has no public token table). Input
// tokens (prompt text + reference images) come from a separate live call — see
// countGeminiInputTokens/countOpenAIInputTokens in providers/{gemini,openai}.ts — not
// tabulated here.
type ImageEstimateQualityRow = Record<string, number>; // size string -> USD

const OPENAI_IMAGE_ESTIMATE_TABLE: Record<
  string,
  { low: ImageEstimateQualityRow; medium: ImageEstimateQualityRow; high: ImageEstimateQualityRow }
> = {
  "openai:gpt-image-2": {
    low:    { "1024x1024": 0.006, "1024x1536": 0.005, "1536x1024": 0.005 },
    medium: { "1024x1024": 0.053, "1024x1536": 0.041, "1536x1024": 0.041 },
    high:   { "1024x1024": 0.211, "1024x1536": 0.165, "1536x1024": 0.165 },
  },
  "openai:gpt-image-1": {
    low:    { "1024x1024": 0.011, "1024x1536": 0.016, "1536x1024": 0.016 },
    medium: { "1024x1024": 0.042, "1024x1536": 0.063, "1536x1024": 0.063 },
    high:   { "1024x1024": 0.167, "1024x1536": 0.25,  "1536x1024": 0.25  },
  },
  "openai:gpt-image-1-mini": {
    low:    { "1024x1024": 0.005, "1024x1536": 0.006, "1536x1024": 0.006 },
    medium: { "1024x1024": 0.011, "1024x1536": 0.015, "1536x1024": 0.015 },
    high:   { "1024x1024": 0.036, "1024x1536": 0.052, "1536x1024": 0.052 },
  },
};

// Gemini prices by size tier only (no quality param) — flat per size, aspect-ratio-
// irrelevant within a tier (design spec §5's stated assumption, not a vendor-confirmed fact).
const GEMINI_IMAGE_ESTIMATE_TABLE: Record<string, Record<string, number>> = {
  "gemini:gemini-2.5-flash-image": { "1K": 0.039 },
  "gemini:gemini-3.1-flash-image": { "512": 0.045, "1K": 0.067, "2K": 0.101, "4K": 0.151 },
  "gemini:gemini-3-pro-image":     { "1K": 0.134, "2K": 0.134, "4K": 0.24 },
};

/**
 * Exact pre-generation OUTPUT cost estimate for an image model. Returns USD (not credits —
 * callers apply usdToFinalCredits from src/lib/credits/units.ts). `quality` is ignored for
 * Gemini models (no such param). "auto" (a real option on gpt-image-2/gpt-image-1 — no
 * option on -mini) has no published price since OpenAI resolves the tier server-side;
 * treated as "high" (worst case) so the estimate never falls short of the real charge.
 */
export function estimateImageOutputCost(
  modelId: string,
  quality: string | undefined,
  size: string,
): number | null {
  const openaiEntry = OPENAI_IMAGE_ESTIMATE_TABLE[modelId];
  if (openaiEntry) {
    const effectiveQuality = quality === "auto" || quality === undefined ? "high" : quality;
    const row = openaiEntry[effectiveQuality as "low" | "medium" | "high"];
    return row?.[size] ?? null;
  }
  const geminiEntry = GEMINI_IMAGE_ESTIMATE_TABLE[modelId];
  if (geminiEntry) {
    return geminiEntry[size] ?? null;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/image-gen/__tests__/cost.test.ts`
Expected: PASS — all tests in the file green (existing `computeImageCost` tests plus the new
`estimateImageOutputCost` ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-gen/cost.ts src/lib/image-gen/__tests__/cost.test.ts
git commit -m "feat(image-gen): add estimateImageOutputCost lookup table"
```

---

### Task 4: Gemini live input-token counting

**Files:**
- Modify: `src/lib/image-gen/providers/gemini.ts`

**Interfaces:**
- Consumes: `createGemini()` (existing, same file's import), the same private
  `urlToInlineData()` helper `generateWithGemini` already uses (same file, do not duplicate
  it).
- Produces: `countGeminiInputTokens(apiModelId: string, prompt: string, referenceUrls:
  string[]): Promise<number>` — the exact name 3E's API-route wiring must import.

No test for this task (async I/O call to a live provider endpoint — see Global Constraints).
Verified by `npm run build` only.

- [ ] **Step 1: Add the function**

In `src/lib/image-gen/providers/gemini.ts`, add after `generateWithGemini` (and before the
`// ── Model configs ──` section):

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

(Confirmed against the installed `@google/genai` SDK's own `.d.ts` —
`ai.models.countTokens(params: CountTokensParameters): Promise<CountTokensResponse>`, where
`CountTokensParameters` is `{ model: string; contents: ContentListUnion; config?
CountTokensConfig }` and `CountTokensResponse.totalTokens` is `number | undefined`;
`ContentListUnion` accepts `Content[]` where `Content` is `{ parts?: Part[]; role?: string
}` — the exact shape used here and already proven at runtime by `generateWithGemini` in this
same file. No `as any` cast needed for `countTokens` specifically — unlike
`generateContent()` a few lines above it in this file, `countTokens` has a directly
compatible declared type.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/image-gen/providers/gemini.ts
git commit -m "feat(image-gen): add countGeminiInputTokens live pre-flight counter"
```

---

### Task 5: OpenAI live input-token counting

**Files:**
- Modify: `src/lib/image-gen/providers/openai.ts`

**Interfaces:**
- Consumes: `createOpenAI()` (existing, same file's import).
- Produces: `countOpenAIInputTokens(prompt: string, referenceUrls: string[]): Promise<number>`
  — the exact name 3E's API-route wiring must import.

No test for this task (async I/O call to a live provider endpoint — see Global Constraints).
Verified by `npm run build` only.

- [ ] **Step 1: Add the function**

In `src/lib/image-gen/providers/openai.ts`, add after `generateWithOpenAI` (and before the
`// ── Model configs ──` section):

```ts
/**
 * Live pre-flight input-token count via OpenAI's official token-counting endpoint
 * (`responses.inputTokens.count`) — handles text-only and text+reference-image requests in
 * one call. Used by the pre-generation estimate (design spec §5). One inference, not a
 * directly confirmed 1:1 mapping to the Images API's own billing (see the design spec) —
 * worth a real-world sanity check once implemented, same as noted there. Always a fresh
 * live call, never cached.
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
    input: [{ role: "user", content }],
  });
  return response.input_tokens ?? 0;
}
```

(Confirmed against the installed `openai` SDK's own `.d.ts` —
`openai.responses.inputTokens.count(body?: InputTokenCountParams): Promise
<InputTokenCountResponse>`, where `InputTokenCountParams.input` accepts `string |
Array<ResponseInputItem>`, `EasyInputMessage` (a `ResponseInputItem` member) has `{ role:
"user" | "assistant" | "system" | "developer"; content: string |
Array<ResponseInputText | ResponseInputImage | ResponseInputFile> }`,
`ResponseInputText` is `{ type: "input_text"; text: string }`, `ResponseInputImage` is
`{ type: "input_image"; detail: "low" | "high" | "auto" | "original"; image_url?: string |
null; file_id?: string | null }` — note `detail` is a **required** field on
`ResponseInputImage`, hence its explicit `"auto"` above — and `InputTokenCountResponse` is
`{ input_tokens: number; object: "response.input_tokens" }`. The pasted docs page used
snake_case (`input_tokens.count`); the actual SDK property is camelCase (`inputTokens`) —
corrected in the design spec alongside this plan.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/image-gen/providers/openai.ts
git commit -m "feat(image-gen): add countOpenAIInputTokens live pre-flight counter"
```

---

## Self-Review

**1. Spec coverage.** Design spec §2a (`usdToFinalCredits`, margin, rounding) — Task 1. §5
image estimate table (OpenAI quality x size, Gemini size, `"auto"`→`"high"`) — Task 3. §5
Gemini/OpenAI live token-counting — Tasks 4/5, with exact SDK shapes verified against the
installed packages' own `.d.ts` files rather than the (snake_case, since-corrected) prose in
the design doc. §5 prompt/text placeholder formula (10 base + 5/attachment) — Task 2. Video
needs no new code (`computeVideoCost` already covers it, confirmed unchanged in this plan).

**2. Placeholder scan.** No TBD/TODO. Every task's code is complete and exact — the two
provider tasks additionally cite the precise `.d.ts` interfaces backing every field used, not
just the pasted-docs prose, since those two functions were the highest-risk-of-guessing part
of this plan.

**3. Type consistency.** `estimateImageOutputCost`'s `(modelId, quality, size)` signature is
used identically in every test case in Task 3. `usdToFinalCredits(costUsd: number): number`
(Task 1) and `estimatePromptCredits(attachmentCount: number): number` (Task 2) are both
referenced by name only in later tasks' interface blocks, not redefined — no drift. The two
token-counting functions' names (`countGeminiInputTokens`, `countOpenAIInputTokens`) and
signatures are stated once each and match their own task's interface block.

No gaps found.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-24-credit-system-3b-estimate-functions.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
