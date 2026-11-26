# Model catalog 2a-i — prices from the database: engine, seed, server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Video and image runs are estimated, reserved and charged from dated rows in `ai_model_prices`, priced by one pure module, with the result identical to today's code tables.

**Architecture:** A pure pricing engine (`src/lib/ai-models/pricing.ts`) multiplies meter quantities by the matching price line. Two thin modules turn a video or image request into meters for the estimate (`video-price.ts`, `image-price.ts`) and a provider's bill into meters for the charge. A builder derives every video and image model's price row from today's code tables; migration 0078 carries those rows. An equivalence test proves the rows reproduce today's numbers over every model and parameter before any caller switches. The server then reads its price from the cached catalog (`run-price.ts`), records `generations.model_price_id`, and prices the charge with the same row it reserved with.

**Tech Stack:** TypeScript, Zod 4, Vitest 4, Supabase Postgres, Next.js route handlers, Trigger.dev tasks.

**Spec:** `docs/superpowers/specs/2026-11-21-model-catalog-design.md` (D552–D556). This plan records **D557**.

**Part 2a-ii** (`docs/superpowers/plans/2026-11-22-model-catalog-2a-prices-browser.md`) moves the browser estimates onto the catalog and deletes the code price tables. 2a-i must be complete first. **Plan 2b** covers dub, lip sync, voice change, transcribe, prompts and the Kling, fal, Sarvam and ElevenLabs bills. **Plan 1b** moves the model readers.

## Global Constraints

- Migration number: **0078**. 0076/0077 exist only on the dev database (`tsmbsvoddxjndebxirvf`); staging and production need 0076, 0077 and 0078 before this plan's code is deployed there (deploy order is written into the migration doc in Task 6).
- Decision number: **D557** in code comments for this plan.
- Price rows start at `PRICE_EPOCH = 2026-01-01T00:00:00Z`. Omni 1.1 has a second row from `2026-12-03T08:00:00Z` at 1.2 rates.
- New meters: `text_input_token`, `image_input_token` (added to the 15 meters from Plan 1a).
- A price line matches when every key in its `when` equals the run's dimension value. Video dimensions: `{ resolution: resolution ?? "720p", audio: boolean }`. Image dimensions: OpenAI `{ quality: "high" for undefined/"auto", size: aspectRatioToOpenAISize(aspect ?? "1:1") }`; Gemini and Seedream `{ size: imageSize ?? "1K" }`.
- Estimate allowances live in the row's `estimate` (flat record of numbers). Keys: `input_tokens_per_image`, `thought_tokens`, `edit_input_tokens_per_second_<res>` (Omni); `input_tokens_base`, `input_tokens_per_reference`, `text_output_tokens` (images).
- A run whose model has no price row at its start is refused before anything is recorded or reserved, with the words `This model has no price set, so it can't run right now.` (HTTP 409). It is never charged 0.
- The charge uses the price row recorded on the generation (`model_price_id`); a generation without one (started before this deploy) uses the row valid at its `created_at`.
- `1 credit = $0.001`; credits stay `usdToFinalCredits(usd)` (no markup in this plan).
- Client-safe modules: `pricing.ts`, `video-price.ts`, `image-price.ts`, `price-seed.ts`. Server-only: `run-price.ts`.
- Stage only the files a task names, by explicit path. No AI attribution in commits. vitest from Git Bash needs `cd "C:/Users/yuvab/OneDrive/Desktop/codes/creativeos-asset-pipeline"` (uppercase C).
- Migrations are applied by hand in the Supabase SQL editor. The implementer applies nothing and connects to no database.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/ai-models/types.ts` (modify) | two new meters |
| `src/lib/ai-models/pricing.ts` | `lineFor`, `priceMeters`, `currentPrice`, `priceById` |
| `src/lib/ai-models/catalog.ts` (modify) | re-export `currentPrice` from `pricing.ts` |
| `src/lib/ai-models/video-price.ts` | video request → estimate; provider usage or duration → charge |
| `src/lib/ai-models/image-price.ts` | image request → estimate; tokens or billed images → charge |
| `src/lib/ai-models/price-seed.ts` | today's code tables → `ai_model_prices` rows, and rows → SQL |
| `src/lib/ai-models/test-prices.ts` | `seededPrice(modelId, at)` for tests in any directory |
| `supabase/migrations/0078_ai_model_prices_seed.sql` | generated price rows |
| `src/lib/ai-models/run-price.ts` | server: the price for a new run, and for a finished generation |
| `src/lib/db/generations.ts`, `src/lib/db/types.ts` (modify) | `model_price_id` on insert and on the row type |
| server sites (modify) | video-generate, video-edit, image start, billed image runs, completion, voice preview |

---

### Task 1: Meters and the pricing engine

**Files:**
- Modify: `src/lib/ai-models/types.ts` (the `METERS` list)
- Create: `src/lib/ai-models/pricing.ts`
- Modify: `src/lib/ai-models/catalog.ts` (move `currentPrice` out)
- Test: `src/lib/ai-models/__tests__/pricing.test.ts`

**Interfaces:**
- Consumes: `AiCatalog`, `AiModelPrice`, `Meter`, `PriceLine` (types.ts).
- Produces:
  - `type PriceDims = Record<string, string | number | boolean | undefined>`
  - `type MeterQuantities = Partial<Record<Meter, number>>`
  - `lineFor(price: AiModelPrice, meter: Meter, dims: PriceDims): PriceLine | null`
  - `priceMeters(price: AiModelPrice, meters: MeterQuantities, dims?: PriceDims): { usd: number; unpriced: Meter[] }`
  - `currentPrice(catalog: AiCatalog, modelId: string, at: Date): AiModelPrice | null` (moved here, still exported from `catalog.ts`)
  - `priceById(catalog: AiCatalog, id: string): AiModelPrice | null`

- [ ] **Step 1: Write the failing test**

`src/lib/ai-models/__tests__/pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lineFor, priceMeters, currentPrice, priceById } from "../pricing";
import type { AiCatalog, AiModelPrice } from "../types";

const KLING: AiModelPrice = {
  id: "k1", modelId: "kling:kling-3-0", effectiveFrom: "2026-01-01T00:00:00Z", estimate: {},
  sourceUrl: null, note: null,
  lines: [
    { meter: "video_second", unit_usd: 0.126, when: { resolution: "720p", audio: true } },
    { meter: "video_second", unit_usd: 0.084, when: { resolution: "720p", audio: false } },
    { meter: "video_second", unit_usd: 0.168, when: { resolution: "1080p", audio: true } },
  ],
};
const SEEDANCE: AiModelPrice = {
  id: "s1", modelId: "seedance:seedance-2-5", effectiveFrom: "2026-01-01T00:00:00Z", estimate: {},
  sourceUrl: null, note: null,
  lines: [
    { meter: "video_output_token", unit_usd: 0.0000117, when: { resolution: "1080p" } },
    { meter: "video_output_token", unit_usd: 0.0000107 },
  ],
};

describe("lineFor", () => {
  it("picks the first line whose when matches every key", () => {
    expect(lineFor(KLING, "video_second", { resolution: "720p", audio: false })?.unit_usd).toBe(0.084);
    expect(lineFor(KLING, "video_second", { resolution: "1080p", audio: true })?.unit_usd).toBe(0.168);
  });
  it("lets a line with no when match any run, after the specific ones", () => {
    expect(lineFor(SEEDANCE, "video_output_token", { resolution: "1080p" })?.unit_usd).toBe(0.0000117);
    expect(lineFor(SEEDANCE, "video_output_token", { resolution: "480p" })?.unit_usd).toBe(0.0000107);
  });
  it("is null when nothing matches", () => {
    expect(lineFor(KLING, "video_second", { resolution: "1080p", audio: false })).toBeNull();
    expect(lineFor(KLING, "input_token", { resolution: "720p", audio: false })).toBeNull();
  });
});

describe("priceMeters", () => {
  it("sums quantity × unit price over the meters", () => {
    expect(priceMeters(KLING, { video_second: 10 }, { resolution: "720p", audio: true }).usd).toBeCloseTo(1.26, 10);
  });
  it("skips zero quantities and reports meters with no matching line", () => {
    const r = priceMeters(KLING, { video_second: 5, input_token: 100, thought_token: 0 }, { resolution: "720p", audio: false });
    expect(r.usd).toBeCloseTo(0.42, 10);
    expect(r.unpriced).toEqual(["input_token"]);
  });
});

describe("currentPrice / priceById", () => {
  const catalog: AiCatalog = {
    models: [],
    prices: [
      { ...SEEDANCE, id: "old", effectiveFrom: "2026-01-01T00:00:00Z" },
      { ...SEEDANCE, id: "new", effectiveFrom: "2026-12-03T08:00:00Z" },
    ],
  };
  it("is the latest row at or before the moment", () => {
    expect(currentPrice(catalog, SEEDANCE.modelId, new Date("2026-12-03T07:59:59Z"))?.id).toBe("old");
    expect(currentPrice(catalog, SEEDANCE.modelId, new Date("2026-12-03T08:00:00Z"))?.id).toBe("new");
    expect(currentPrice(catalog, "other", new Date())).toBeNull();
  });
  it("finds a row by id", () => {
    expect(priceById(catalog, "new")?.effectiveFrom).toBe("2026-12-03T08:00:00Z");
    expect(priceById(catalog, "missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ai-models/__tests__/pricing.test.ts`
Expected: FAIL — cannot find `../pricing`.

- [ ] **Step 3: Add the meters**

In `src/lib/ai-models/types.ts`, replace the `METERS` list with:

```ts
export const METERS = [
  "input_token", "text_input_token", "image_input_token", "cached_input_token",
  "text_output_token", "thought_token", "image_output_token", "video_output_token",
  "output_image", "input_image", "video_second", "audio_second", "character",
  "provider_unit", "provider_credit", "usd", "request",
] as const;
```

(`schema.ts` builds its Zod enum from `METERS`, so it needs no edit.)

- [ ] **Step 4: Write `pricing.ts`**

```ts
// D557 — one engine prices every estimate and every charge: quantity × the matching line.
// Client-safe: the focus views price their estimate with it too.
import type { AiCatalog, AiModelPrice, Meter, PriceLine } from "./types";

export type PriceDims = Record<string, string | number | boolean | undefined>;
export type MeterQuantities = Partial<Record<Meter, number>>;

/** The first line for this meter whose `when` matches every one of its keys; none = any run. */
export function lineFor(price: AiModelPrice, meter: Meter, dims: PriceDims): PriceLine | null {
  for (const line of price.lines) {
    if (line.meter !== meter) continue;
    if (Object.entries(line.when ?? {}).every(([key, value]) => dims[key] === value)) return line;
  }
  return null;
}

/** USD for these quantities. A meter with no matching line adds nothing and is listed. */
export function priceMeters(
  price: AiModelPrice,
  meters: MeterQuantities,
  dims: PriceDims = {},
): { usd: number; unpriced: Meter[] } {
  let usd = 0;
  const unpriced: Meter[] = [];
  for (const [meter, quantity] of Object.entries(meters) as [Meter, number | undefined][]) {
    if (!quantity) continue;
    const line = lineFor(price, meter, dims);
    if (!line) {
      unpriced.push(meter);
      continue;
    }
    usd += quantity * line.unit_usd;
  }
  return { usd, unpriced };
}

/** D553 — the price row a run starting at `at` uses: the latest one at or before it. */
export function currentPrice(catalog: AiCatalog, modelId: string, at: Date): AiModelPrice | null {
  let best: AiModelPrice | null = null;
  for (const p of catalog.prices) {
    if (p.modelId !== modelId || new Date(p.effectiveFrom) > at) continue;
    if (!best || new Date(p.effectiveFrom) > new Date(best.effectiveFrom)) best = p;
  }
  return best;
}

export function priceById(catalog: AiCatalog, id: string): AiModelPrice | null {
  return catalog.prices.find((p) => p.id === id) ?? null;
}
```

- [ ] **Step 5: Move `currentPrice` out of `catalog.ts`**

In `src/lib/ai-models/catalog.ts`, delete the whole `currentPrice` function (and its doc comment) at the end of the file, and add after the imports:

```ts
// Kept importable from here for existing callers; it is pure and lives in pricing.ts.
export { currentPrice } from "./pricing";
```

Remove `AiModelPrice` from the `import type { … } from "./types"` line if it is now unused.

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `npx vitest run src/lib/ai-models`
Expected: PASS — pricing.test.ts (7 tests) and every existing ai-models test.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai-models/types.ts src/lib/ai-models/pricing.ts src/lib/ai-models/catalog.ts src/lib/ai-models/__tests__/pricing.test.ts
git commit -m "feat(credits): one pricing engine for estimates and charges (D557)"
```

---

### Task 2: Video estimate and charge from a price row

**Files:**
- Create: `src/lib/ai-models/video-price.ts`
- Test: `src/lib/ai-models/__tests__/video-price.test.ts`

**Interfaces:**
- Consumes: `lineFor`, `priceMeters`, `PriceDims`, `MeterQuantities` (Task 1); `VideoProviderUsage` from `@/lib/video-gen/provider-usage`.
- Produces:
  - `videoDims(resolution: string | undefined, audioEnabled: boolean): PriceDims`
  - `videoSecondsUsd(price: AiModelPrice, durationSeconds: number, audioEnabled: boolean, resolution: string | undefined): number | null`
  - `videoEstimateUsd(price: AiModelPrice, a: { durationSeconds: number; audioEnabled: boolean; resolution: string | undefined; images: number; editInputSeconds?: number }): number | null`
  - `videoUsageMeters(usage: VideoProviderUsage): MeterQuantities`
  - `type VideoCharge = { usd: number; source: "provider_usage" | "request"; meters: MeterQuantities }`
  - `videoChargeUsd(price: AiModelPrice, a: { usage: VideoProviderUsage | null; durationSeconds: number; audioEnabled: boolean; resolution: string | undefined }): VideoCharge | null`

- [ ] **Step 1: Write the failing test**

`src/lib/ai-models/__tests__/video-price.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { videoSecondsUsd, videoEstimateUsd, videoChargeUsd, videoUsageMeters } from "../video-price";
import type { AiModelPrice } from "../types";

const OMNI_12: AiModelPrice = {
  id: "o12", modelId: "gemini:gemini-omni-1.2-flash", effectiveFrom: "2026-01-01T00:00:00Z",
  sourceUrl: null, note: null,
  lines: [
    { meter: "video_second", unit_usd: (1931 * 12) / 1e6, when: { resolution: "360p" } },
    { meter: "video_second", unit_usd: (5792 * 12) / 1e6, when: { resolution: "720p" } },
    { meter: "input_token", unit_usd: 1.5 / 1e6 },
    { meter: "video_output_token", unit_usd: 12 / 1e6 },
    { meter: "text_output_token", unit_usd: 9 / 1e6 },
    { meter: "thought_token", unit_usd: 9 / 1e6 },
  ],
  estimate: {
    input_tokens_per_image: 1100, thought_tokens: 1500,
    edit_input_tokens_per_second_360p: 1931, edit_input_tokens_per_second_720p: 5792,
  },
};
const VEO: AiModelPrice = {
  id: "v", modelId: "veo:veo-3.1-fast", effectiveFrom: "2026-01-01T00:00:00Z", sourceUrl: null, note: null,
  estimate: {}, lines: [{ meter: "video_second", unit_usd: 0.1, when: { resolution: "720p" } }],
};

describe("videoSecondsUsd", () => {
  it("prices seconds at the resolution's line, 720p when unset", () => {
    expect(videoSecondsUsd(VEO, 8, false, undefined)).toBeCloseTo(0.8, 10);
  });
  it("is null when the resolution has no line, even for zero seconds", () => {
    expect(videoSecondsUsd(VEO, 8, false, "4k")).toBeNull();
    expect(videoSecondsUsd(VEO, 0, false, "4k")).toBeNull();
  });
});

describe("videoEstimateUsd", () => {
  it("is the per-second price for a model with no allowances", () => {
    expect(videoEstimateUsd(VEO, { durationSeconds: 8, audioEnabled: false, resolution: "720p", images: 3 })).toBeCloseTo(0.8, 10);
  });
  it("adds Omni's images, the edit's source clip and the thinking allowance", () => {
    const usd = videoEstimateUsd(OMNI_12, { durationSeconds: 6, audioEnabled: false, resolution: "360p", images: 2, editInputSeconds: 6 });
    const base = 6 * (1931 * 12) / 1e6;
    const extras = ((2 * 1100 + 6 * 1931) * 1.5 + 1500 * 9) / 1e6;
    expect(usd).toBeCloseTo(base + extras, 10);
  });
  it("uses the 720p edit rate for a resolution with no allowance of its own", () => {
    const usd = videoEstimateUsd(OMNI_12, { durationSeconds: 1, audioEnabled: false, resolution: "720p", images: 0, editInputSeconds: 1 });
    expect(usd).toBeCloseTo((5792 * 12) / 1e6 + (5792 * 1.5 + 1500 * 9) / 1e6, 10);
  });
});

describe("videoChargeUsd", () => {
  const usage = { kind: "omni" as const, inputTokens: 4718, videoOutputTokens: 11586, textOutputTokens: 0, thoughtTokens: 113 };

  it("prices the provider's usage when every meter has a line", () => {
    const c = videoChargeUsd(OMNI_12, { usage, durationSeconds: 6, audioEnabled: false, resolution: "360p" });
    expect(c?.source).toBe("provider_usage");
    expect(c?.usd).toBeCloseTo((4718 * 1.5 + 11586 * 12 + 113 * 9) / 1e6, 10);
    expect(c?.meters).toEqual(videoUsageMeters(usage));
  });
  it("falls back to the duration when there is no usage or a meter has no line", () => {
    expect(videoChargeUsd(VEO, { usage: null, durationSeconds: 8, audioEnabled: false, resolution: "720p" }))
      .toEqual({ usd: expect.closeTo(0.8, 10), source: "request", meters: { video_second: 8 } });
    expect(videoChargeUsd(VEO, { usage, durationSeconds: 8, audioEnabled: false, resolution: "720p" })?.source).toBe("request");
  });
  it("is null when neither the usage nor the duration can be priced", () => {
    expect(videoChargeUsd(VEO, { usage: null, durationSeconds: 8, audioEnabled: false, resolution: "4k" })).toBeNull();
  });
  it("maps Seedance's billed tokens to video output tokens", () => {
    expect(videoUsageMeters({ kind: "seedance", completionTokens: 108900 })).toEqual({ video_output_token: 108900 });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ai-models/__tests__/video-price.test.ts`
Expected: FAIL — cannot find `../video-price`.

- [ ] **Step 3: Write `video-price.ts`**

```ts
// D557 — a video run's estimate and charge, from its model's price row. Client-safe.
import type { VideoProviderUsage } from "@/lib/video-gen/provider-usage";
import { lineFor, priceMeters, type MeterQuantities, type PriceDims } from "./pricing";
import type { AiModelPrice } from "./types";

export function videoDims(resolution: string | undefined, audioEnabled: boolean): PriceDims {
  return { resolution: resolution ?? "720p", audio: audioEnabled };
}

/** The per-second price: the estimate's base, and the charge when no usage came back. */
export function videoSecondsUsd(
  price: AiModelPrice,
  durationSeconds: number,
  audioEnabled: boolean,
  resolution: string | undefined,
): number | null {
  const line = lineFor(price, "video_second", videoDims(resolution, audioEnabled));
  return line ? durationSeconds * line.unit_usd : null;
}

/** What the run is reserved at: the seconds, plus the row's allowances for input and thinking. */
export function videoEstimateUsd(
  price: AiModelPrice,
  a: { durationSeconds: number; audioEnabled: boolean; resolution: string | undefined; images: number; editInputSeconds?: number },
): number | null {
  const base = videoSecondsUsd(price, a.durationSeconds, a.audioEnabled, a.resolution);
  if (base === null) return null;
  const e = price.estimate;
  const perEditSecond =
    e[`edit_input_tokens_per_second_${a.resolution ?? "720p"}`] ?? e.edit_input_tokens_per_second_720p ?? 0;
  const extras = priceMeters(
    price,
    {
      input_token: a.images * (e.input_tokens_per_image ?? 0) + (a.editInputSeconds ?? 0) * perEditSecond,
      thought_token: e.thought_tokens ?? 0,
    },
    videoDims(a.resolution, a.audioEnabled),
  );
  return base + extras.usd;
}

export function videoUsageMeters(usage: VideoProviderUsage): MeterQuantities {
  return usage.kind === "omni"
    ? {
        input_token: usage.inputTokens,
        video_output_token: usage.videoOutputTokens,
        text_output_token: usage.textOutputTokens,
        thought_token: usage.thoughtTokens,
      }
    : { video_output_token: usage.completionTokens };
}

export type VideoCharge = { usd: number; source: "provider_usage" | "request"; meters: MeterQuantities };

/** What the run costs: the provider's usage when every meter of it is priced, else the seconds. */
export function videoChargeUsd(
  price: AiModelPrice,
  a: { usage: VideoProviderUsage | null; durationSeconds: number; audioEnabled: boolean; resolution: string | undefined },
): VideoCharge | null {
  if (a.usage) {
    const meters = videoUsageMeters(a.usage);
    const priced = priceMeters(price, meters, videoDims(a.resolution, a.audioEnabled));
    if (priced.unpriced.length === 0) return { usd: priced.usd, source: "provider_usage", meters };
  }
  const usd = videoSecondsUsd(price, a.durationSeconds, a.audioEnabled, a.resolution);
  return usd === null ? null : { usd, source: "request", meters: { video_second: a.durationSeconds } };
}
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `npx vitest run src/lib/ai-models/__tests__/video-price.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-models/video-price.ts src/lib/ai-models/__tests__/video-price.test.ts
git commit -m "feat(credits): video estimate and charge from a price row (D557)"
```

---

### Task 3: Image estimate and charge from a price row

**Files:**
- Create: `src/lib/ai-models/image-price.ts`
- Test: `src/lib/ai-models/__tests__/image-price.test.ts`

**Interfaces:**
- Consumes: `lineFor`, `priceMeters` (Task 1); `aspectRatioToOpenAISize` from `@/lib/image-gen/cost`; `ImageTokenUsage` from `@/lib/image-gen/types`.
- Produces:
  - `imageDims(modelId: string, a: { quality?: string; aspectRatio?: string; imageSize?: string }): PriceDims`
  - `imageEstimateUsd(price: AiModelPrice, a: { modelId: string; quality?: string; aspectRatio?: string; imageSize?: string; referenceCount: number }): number | null`
  - `type BilledImages = { output_image: number; input_image: number; size: string }`
  - `imageTokenMeters(tokens: ImageTokenUsage): MeterQuantities`
  - `imageChargeUsd(price: AiModelPrice, a: { tokens: ImageTokenUsage | null; billedImages: BilledImages | null }): { usd: number; unpriced: Meter[]; meters: MeterQuantities } | null`

- [ ] **Step 1: Write the failing test**

`src/lib/ai-models/__tests__/image-price.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { imageDims, imageEstimateUsd, imageChargeUsd, imageTokenMeters } from "../image-price";
import type { AiModelPrice } from "../types";

const GPT: AiModelPrice = {
  id: "g", modelId: "openai:gpt-image-2", effectiveFrom: "2026-01-01T00:00:00Z", sourceUrl: null, note: null,
  lines: [
    { meter: "output_image", unit_usd: 0.211, when: { quality: "high", size: "1024x1024" } },
    { meter: "output_image", unit_usd: 0.053, when: { quality: "medium", size: "1024x1024" } },
    { meter: "text_input_token", unit_usd: 5 / 1e6 },
    { meter: "image_input_token", unit_usd: 8 / 1e6 },
    { meter: "image_output_token", unit_usd: 30 / 1e6 },
  ],
  estimate: { input_tokens_base: 190, input_tokens_per_reference: 1550 },
};
const NANO: AiModelPrice = {
  id: "n", modelId: "gemini:gemini-nano-banana-2.1", effectiveFrom: "2026-01-01T00:00:00Z", sourceUrl: null, note: null,
  lines: [
    { meter: "output_image", unit_usd: 0.0336, when: { size: "1K" } },
    { meter: "text_input_token", unit_usd: 1.5 / 1e6 },
    { meter: "image_input_token", unit_usd: 1.5 / 1e6 },
    { meter: "image_output_token", unit_usd: 30 / 1e6 },
    { meter: "text_output_token", unit_usd: 7.5 / 1e6 },
    { meter: "thought_token", unit_usd: 7.5 / 1e6 },
  ],
  estimate: { input_tokens_base: 180, input_tokens_per_reference: 260, text_output_tokens: 1000 },
};
const SEEDREAM_PRO: AiModelPrice = {
  id: "s", modelId: "seedream:seedream-5-0-pro", effectiveFrom: "2026-01-01T00:00:00Z", sourceUrl: null, note: null,
  lines: [
    { meter: "output_image", unit_usd: 0.09, when: { size: "2K" } },
    { meter: "input_image", unit_usd: 0.003 },
  ],
  estimate: {},
};

describe("imageDims", () => {
  it("reads OpenAI's quality (auto and unset as high) and size from the aspect ratio", () => {
    expect(imageDims("openai:gpt-image-2", { quality: "auto", aspectRatio: "16:9" })).toEqual({ quality: "high", size: "1536x1024" });
    expect(imageDims("openai:gpt-image-2", {})).toEqual({ quality: "high", size: "1024x1024" });
  });
  it("reads the image size for every other provider, 1K when unset", () => {
    expect(imageDims("gemini:gemini-nano-banana-2.1", {})).toEqual({ size: "1K" });
    expect(imageDims("seedream:seedream-5-0-pro", { imageSize: "2K" })).toEqual({ size: "2K" });
  });
});

describe("imageEstimateUsd", () => {
  it("OpenAI, no references: the image, plus the base input as text", () => {
    expect(imageEstimateUsd(GPT, { modelId: GPT.modelId, quality: "medium", aspectRatio: "1:1", referenceCount: 0 }))
      .toBeCloseTo(0.053 + (190 * 5) / 1e6, 10);
  });
  it("OpenAI, with references: every input token at the image rate", () => {
    expect(imageEstimateUsd(GPT, { modelId: GPT.modelId, quality: "medium", aspectRatio: "1:1", referenceCount: 2 }))
      .toBeCloseTo(0.053 + ((190 + 2 * 1550) * 8) / 1e6, 10);
  });
  it("Gemini adds the text and thinking allowance", () => {
    expect(imageEstimateUsd(NANO, { modelId: NANO.modelId, imageSize: "1K", referenceCount: 1 }))
      .toBeCloseTo(0.0336 + ((180 + 260) * 1.5) / 1e6 + (1000 * 7.5) / 1e6, 10);
  });
  it("Seedream: the image, plus each reference after the first", () => {
    expect(imageEstimateUsd(SEEDREAM_PRO, { modelId: SEEDREAM_PRO.modelId, imageSize: "2K", referenceCount: 3 }))
      .toBeCloseTo(0.09 + 2 * 0.003, 10);
  });
  it("is null when the image has no price at these settings", () => {
    expect(imageEstimateUsd(NANO, { modelId: NANO.modelId, imageSize: "4K", referenceCount: 0 })).toBeNull();
  });
});

describe("imageChargeUsd", () => {
  const tokens = { text_input_tokens: 12, image_input_tokens: 0, image_output_tokens: 1120, total_tokens: 2143, text_output_tokens: 234, thought_tokens: 777 };

  it("prices the provider's tokens", () => {
    const c = imageChargeUsd(NANO, { tokens, billedImages: null });
    expect(c?.usd).toBeCloseTo((12 * 1.5 + 1120 * 30 + (234 + 777) * 7.5) / 1e6, 10);
    expect(c?.unpriced).toEqual([]);
    expect(c?.meters).toEqual(imageTokenMeters(tokens));
  });
  it("prices billed images by size", () => {
    expect(imageChargeUsd(SEEDREAM_PRO, { tokens: null, billedImages: { output_image: 1, input_image: 2, size: "2K" } })?.usd)
      .toBeCloseTo(0.096, 10);
  });
  it("lists token meters the row does not price, and is null with nothing to price", () => {
    expect(imageChargeUsd(GPT, { tokens, billedImages: null })?.unpriced).toEqual(["text_output_token", "thought_token"]);
    expect(imageChargeUsd(GPT, { tokens: null, billedImages: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ai-models/__tests__/image-price.test.ts`
Expected: FAIL — cannot find `../image-price`.

- [ ] **Step 3: Write `image-price.ts`**

```ts
// D557 — an image run's estimate and charge, from its model's price row. Client-safe.
import { aspectRatioToOpenAISize } from "@/lib/image-gen/cost";
import type { ImageTokenUsage } from "@/lib/image-gen/types";
import { lineFor, priceMeters, type MeterQuantities, type PriceDims } from "./pricing";
import type { AiModelPrice, Meter } from "./types";

export function imageDims(
  modelId: string,
  a: { quality?: string; aspectRatio?: string; imageSize?: string },
): PriceDims {
  if (modelId.startsWith("openai:")) {
    // "auto" has no published price (OpenAI picks the tier), so it is estimated as high.
    const quality = a.quality === undefined || a.quality === "auto" ? "high" : a.quality;
    return { quality, size: aspectRatioToOpenAISize(a.aspectRatio ?? "1:1") };
  }
  return { size: a.imageSize ?? "1K" };
}

/** What one image is reserved at. Null when the image itself has no price at these settings. */
export function imageEstimateUsd(
  price: AiModelPrice,
  a: { modelId: string; quality?: string; aspectRatio?: string; imageSize?: string; referenceCount: number },
): number | null {
  const dims = imageDims(a.modelId, a);
  if (!lineFor(price, "output_image", dims)) return null;
  if (a.modelId.startsWith("seedream:")) {
    // Billed per image: the first reference is free, each further one is priced.
    return priceMeters(price, { output_image: 1, input_image: Math.max(0, a.referenceCount - 1) }, dims).usd;
  }
  const e = price.estimate;
  const inputTokens = (e.input_tokens_base ?? 0) + a.referenceCount * (e.input_tokens_per_reference ?? 0);
  // With references, every input token is estimated at the image rate (never under-reserves).
  const meters: MeterQuantities = {
    output_image: 1,
    [a.referenceCount > 0 ? "image_input_token" : "text_input_token"]: inputTokens,
    text_output_token: e.text_output_tokens ?? 0,
  };
  return priceMeters(price, meters, dims).usd;
}

export type BilledImages = { output_image: number; input_image: number; size: string };

export function imageTokenMeters(tokens: ImageTokenUsage): MeterQuantities {
  return {
    text_input_token: tokens.text_input_tokens,
    image_input_token: tokens.image_input_tokens,
    image_output_token: tokens.image_output_tokens,
    text_output_token: tokens.text_output_tokens ?? 0,
    thought_token: tokens.thought_tokens ?? 0,
  };
}

/** What the image cost: billed images (Seedream) or the provider's tokens. Null with neither. */
export function imageChargeUsd(
  price: AiModelPrice,
  a: { tokens: ImageTokenUsage | null; billedImages: BilledImages | null },
): { usd: number; unpriced: Meter[]; meters: MeterQuantities } | null {
  if (a.billedImages) {
    const meters = { output_image: a.billedImages.output_image, input_image: a.billedImages.input_image };
    return { ...priceMeters(price, meters, { size: a.billedImages.size }), meters };
  }
  if (a.tokens) {
    const meters = imageTokenMeters(a.tokens);
    return { ...priceMeters(price, meters), meters };
  }
  return null;
}
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `npx vitest run src/lib/ai-models/__tests__/image-price.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-models/image-price.ts src/lib/ai-models/__tests__/image-price.test.ts
git commit -m "feat(credits): image estimate and charge from a price row (D557)"
```

---

### Task 4: Price rows built from today's code tables

**Files:**
- Create: `src/lib/ai-models/price-seed.ts`
- Create: `src/lib/ai-models/test-prices.ts`
- Test: `src/lib/ai-models/__tests__/price-seed.test.ts`

**Interfaces:**
- Consumes: `computeVideoCost`, `OMNI_11_REROUTE_AT` (`@/lib/video-gen/cost`); `computeVideoCostFromUsage`, `omniEstimateExtrasUsd` (`@/lib/video-gen/provider-usage`); `computeImageCost`, `estimateImageOutputCost`, `estimateGeminiInputTokens`, `estimateOpenAIInputTokens`, `estimateGeminiTextOutputCost`, `seedreamReferenceCostUsd` (`@/lib/image-gen/cost`); `imageGenClientModels`, `videoGenClientModelMap`; `parseAiModelPriceRow`; `SEED_JSON_TAG` (`./seed`).
- Produces:
  - `PRICE_EPOCH = "2026-01-01T00:00:00.000Z"`
  - `type AiModelPriceSeedRow = { model_id: string; effective_from: string; lines: PriceLine[]; estimate: Record<string, number>; source_url: string | null; note: string }`
  - `priceRowsFromCodeTables(): AiModelPriceSeedRow[]`
  - `priceSeedSql(rows: AiModelPriceSeedRow[]): string`
  - `seedRowToPrice(row: AiModelPriceSeedRow): AiModelPrice` (for tests: parses through `parseAiModelPriceRow` with id `${model_id}@${effective_from}`)
  - `test-prices.ts`: `seededPrice(modelId: string, at?: Date): AiModelPrice` — throws if no row

The builder reads the code tables only through their public functions, at the dimension values each model can take. The derived lines are exactly what those functions return.

- [ ] **Step 1: Write the failing test**

`src/lib/ai-models/__tests__/price-seed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { priceRowsFromCodeTables, priceSeedSql, seedRowToPrice, PRICE_EPOCH } from "../price-seed";
import { seededPrice } from "../test-prices";
import { imageGenClientModels } from "@/lib/image-gen/client-models";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";

describe("priceRowsFromCodeTables", () => {
  const rows = priceRowsFromCodeTables();

  it("has one epoch row for every image and video model, retired ones included", () => {
    const ids = [...imageGenClientModels.map((m) => m.id), ...Object.keys(videoGenClientModelMap)];
    const epoch = rows.filter((r) => r.effective_from === PRICE_EPOCH).map((r) => r.model_id);
    expect(epoch.sort()).toEqual(ids.sort());
  });

  it("gives Omni 1.1 a second row at 1.2 rates from 3 Dec, and no other model one", () => {
    const later = rows.filter((r) => r.effective_from !== PRICE_EPOCH);
    expect(later.map((r) => [r.model_id, r.effective_from])).toEqual([
      ["gemini:gemini-omni-1.1-flash", "2026-12-03T08:00:00.000Z"],
    ]);
    const omni12 = rows.find((r) => r.model_id === "gemini:gemini-omni-1.2-flash")!;
    expect(later[0].lines).toEqual(omni12.lines);
  });

  it("parses every row with the catalog's price check", () => {
    for (const r of rows) expect(() => seedRowToPrice(r), r.model_id).not.toThrow();
  });

  it("carries Kling's audio and Omni's allowances", () => {
    expect(seededPrice("kling:kling-3-0").lines).toContainEqual(
      { meter: "video_second", unit_usd: 0.126, when: { resolution: "720p", audio: true } },
    );
    expect(seededPrice("gemini:gemini-omni-1.2-flash").estimate).toMatchObject({
      input_tokens_per_image: 1100, thought_tokens: 1500, edit_input_tokens_per_second_360p: 1931,
    });
    expect(seededPrice("gemini:gemini-nano-banana-2.1").estimate).toEqual({
      input_tokens_base: 180, input_tokens_per_reference: 260, text_output_tokens: 1000,
    });
  });
});

describe("priceSeedSql", () => {
  it("embeds the rows as JSON and inserts with on conflict do nothing", () => {
    const rows = priceRowsFromCodeTables();
    const sql = priceSeedSql(rows);
    const json = sql.slice(sql.indexOf("$seed$") + 6, sql.lastIndexOf("$seed$"));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(rows)));
    expect(sql).toContain("insert into ai_model_prices");
    expect(sql).toContain("on conflict (model_id, effective_from) do nothing");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ai-models/__tests__/price-seed.test.ts`
Expected: FAIL — cannot find `../price-seed`.

- [ ] **Step 3: Write `price-seed.ts`**

```ts
// D557 — today's video and image prices as ai_model_prices rows, for migration 0078. Built from
// the code tables' own public functions at every value each model can take, so a row prices
// exactly what the code does (the equivalence test proves it). Lives until Plan 2a-ii deletes
// the tables; 0078 is then frozen history.
import { imageGenClientModels } from "@/lib/image-gen/client-models";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";
import { computeVideoCost, OMNI_11_REROUTE_AT } from "@/lib/video-gen/cost";
import { computeVideoCostFromUsage, omniEstimateExtrasUsd } from "@/lib/video-gen/provider-usage";
import {
  computeImageCost, estimateImageOutputCost, estimateGeminiInputTokens, estimateOpenAIInputTokens,
  estimateGeminiTextOutputCost, seedreamReferenceCostUsd,
} from "@/lib/image-gen/cost";
import type { ImageTokenUsage } from "@/lib/image-gen/types";
import { parseAiModelPriceRow } from "./schema";
import { SEED_JSON_TAG } from "./seed";
import type { AiModelPrice, PriceLine } from "./types";

export const PRICE_EPOCH = "2026-01-01T00:00:00.000Z";

export type AiModelPriceSeedRow = {
  model_id: string;
  effective_from: string;
  lines: PriceLine[];
  estimate: Record<string, number>;
  source_url: string | null;
  note: string;
};

const SOURCES: Record<string, string> = {
  gemini: "https://aistudio.google.com/docs/pricing",
  veo: "https://aistudio.google.com/docs/pricing",
  openai: "https://developers.openai.com/api/docs/pricing",
  kling: "https://kling.ai/document-api/pricing/base/video",
};
const NOTE = "Seeded from the code price tables (D557).";

const VIDEO_RESOLUTIONS = ["360p", "480p", "720p", "1080p", "4k"];
const OPENAI_QUALITIES = ["low", "medium", "high", "xhigh", "max"];
const OPENAI_SIZES = ["1024x1024", "1536x1024", "1024x1536"];
const IMAGE_SIZES = ["512", "1K", "1.5K", "2K", "3K", "4K"];
const MILLION = 1_000_000;

function videoLines(modelId: string, provider: string, at: Date): { lines: PriceLine[]; estimate: Record<string, number> } {
  const lines: PriceLine[] = [];
  for (const resolution of VIDEO_RESOLUTIONS) {
    // Only Kling's price moves with audio; every other model has one rate per resolution.
    const audios = provider === "kling" ? [true, false] : [false];
    for (const audio of audios) {
      const cost = computeVideoCost(modelId, 1, audio, resolution, at);
      if (!cost) continue;
      lines.push({
        meter: "video_second",
        unit_usd: cost.usd,
        when: provider === "kling" ? { resolution, audio } : { resolution },
      });
    }
  }

  const estimate: Record<string, number> = {};
  const omni = (o: Partial<{ inputTokens: number; videoOutputTokens: number; textOutputTokens: number; thoughtTokens: number }>) =>
    computeVideoCostFromUsage(
      modelId,
      { kind: "omni", inputTokens: 0, videoOutputTokens: 0, textOutputTokens: 0, thoughtTokens: 0, ...o },
      "720p",
      at,
    );
  const inputRate = omni({ inputTokens: MILLION })?.usd;
  if (inputRate !== undefined) {
    lines.push(
      { meter: "input_token", unit_usd: inputRate / MILLION },
      { meter: "video_output_token", unit_usd: omni({ videoOutputTokens: MILLION })!.usd / MILLION },
      { meter: "text_output_token", unit_usd: omni({ textOutputTokens: MILLION })!.usd / MILLION },
      { meter: "thought_token", unit_usd: omni({ thoughtTokens: MILLION })!.usd / MILLION },
    );
    const extras = (images: number, resolution: string, editInputSeconds: number) =>
      omniEstimateExtrasUsd(modelId, { images, resolution, editInputSeconds });
    const thoughtRate = omni({ thoughtTokens: MILLION })!.usd / MILLION;
    const perToken = inputRate / MILLION;
    estimate.thought_tokens = Math.round(extras(0, "720p", 0) / thoughtRate);
    estimate.input_tokens_per_image = Math.round((extras(1, "720p", 0) - extras(0, "720p", 0)) / perToken);
    for (const resolution of ["360p", "720p", "1080p", "4k"]) {
      estimate[`edit_input_tokens_per_second_${resolution}`] =
        Math.round((extras(0, resolution, 1) - extras(0, resolution, 0)) / perToken);
    }
  }

  const seedance = (resolution: string) =>
    computeVideoCostFromUsage(modelId, { kind: "seedance", completionTokens: MILLION }, resolution, at);
  const standard = seedance("720p");
  if (standard) {
    const hd = seedance("1080p")!;
    if (hd.usd !== standard.usd) {
      lines.push({ meter: "video_output_token", unit_usd: hd.usd / MILLION, when: { resolution: "1080p" } });
    }
    lines.push({ meter: "video_output_token", unit_usd: standard.usd / MILLION });
  }
  return { lines, estimate };
}

function tokenRate(modelId: string, key: keyof ImageTokenUsage): number {
  const base: ImageTokenUsage = { text_input_tokens: 0, image_input_tokens: 0, image_output_tokens: 0, total_tokens: 0 };
  return (computeImageCost(modelId, { ...base, [key]: MILLION })?.usd ?? 0) / MILLION;
}

function imageLines(modelId: string): { lines: PriceLine[]; estimate: Record<string, number> } {
  const lines: PriceLine[] = [];
  const isOpenAI = modelId.startsWith("openai:");
  if (isOpenAI) {
    for (const quality of OPENAI_QUALITIES) {
      for (const size of OPENAI_SIZES) {
        const usd = estimateImageOutputCost(modelId, quality, size);
        if (usd !== null) lines.push({ meter: "output_image", unit_usd: usd, when: { quality, size } });
      }
    }
  } else {
    for (const size of IMAGE_SIZES) {
      const usd = estimateImageOutputCost(modelId, undefined, size);
      if (usd !== null) lines.push({ meter: "output_image", unit_usd: usd, when: { size } });
    }
  }

  const estimate: Record<string, number> = {};
  if (modelId.startsWith("seedream:")) {
    lines.push({ meter: "input_image", unit_usd: seedreamReferenceCostUsd(modelId, 2) });
    return { lines, estimate };
  }

  lines.push(
    { meter: "text_input_token", unit_usd: tokenRate(modelId, "text_input_tokens") },
    { meter: "image_input_token", unit_usd: tokenRate(modelId, "image_input_tokens") },
    { meter: "image_output_token", unit_usd: tokenRate(modelId, "image_output_tokens") },
  );
  const textOut = tokenRate(modelId, "text_output_tokens");
  if (textOut > 0) {
    lines.push(
      { meter: "text_output_token", unit_usd: textOut },
      { meter: "thought_token", unit_usd: tokenRate(modelId, "thought_tokens") },
    );
  }

  const tokens = isOpenAI
    ? (n: number) => estimateOpenAIInputTokens(modelId, n)
    : (n: number) => estimateGeminiInputTokens(n);
  estimate.input_tokens_base = tokens(0);
  estimate.input_tokens_per_reference = tokens(1) - tokens(0);
  if (!isOpenAI && textOut > 0) {
    estimate.text_output_tokens = Math.round(estimateGeminiTextOutputCost(modelId) / textOut);
  }
  return { lines, estimate };
}

export function priceRowsFromCodeTables(): AiModelPriceSeedRow[] {
  const rows: AiModelPriceSeedRow[] = [];
  const row = (modelId: string, provider: string, at: string, priced: { lines: PriceLine[]; estimate: Record<string, number> }) => ({
    model_id: modelId,
    effective_from: at,
    lines: priced.lines,
    estimate: priced.estimate,
    source_url: SOURCES[provider] ?? null,
    note: NOTE,
  });

  for (const m of imageGenClientModels) rows.push(row(m.id, m.provider, PRICE_EPOCH, imageLines(m.id)));

  for (const m of Object.values(videoGenClientModelMap)) {
    const epoch = videoLines(m.id, m.provider, new Date(PRICE_EPOCH));
    rows.push(row(m.id, m.provider, PRICE_EPOCH, epoch));
    // A price the code changes on a date (Omni 1.1 billed at 1.2 rates from 3 Dec) is a second row.
    const later = videoLines(m.id, m.provider, OMNI_11_REROUTE_AT);
    if (JSON.stringify(later) !== JSON.stringify(epoch)) {
      rows.push(row(m.id, m.provider, OMNI_11_REROUTE_AT.toISOString(), later));
    }
  }
  return rows;
}

export function priceSeedSql(rows: AiModelPriceSeedRow[]): string {
  const json = JSON.stringify(rows, null, 2);
  if (json.includes(SEED_JSON_TAG)) throw new Error(`Seed JSON contains ${SEED_JSON_TAG}`);
  const cols = "model_id, effective_from, lines, estimate, source_url, note";
  return [
    "-- D557: today's video and image prices, from the code price tables.",
    "-- Generated by src/lib/ai-models/price-seed.ts. Regenerate with:",
    "--   UPDATE_SEED=1 npx vitest run src/lib/ai-models/__tests__/price-seed-migration.test.ts",
    `insert into ai_model_prices (${cols})`,
    `select ${cols}`,
    `from jsonb_to_recordset(${SEED_JSON_TAG}${json}${SEED_JSON_TAG}::jsonb) as r(`,
    "  model_id text, effective_from timestamptz, lines jsonb, estimate jsonb, source_url text, note text",
    ")",
    "on conflict (model_id, effective_from) do nothing;",
    "",
  ].join("\n");
}

export function seedRowToPrice(row: AiModelPriceSeedRow): AiModelPrice {
  const price = parseAiModelPriceRow({
    id: `${row.model_id}@${row.effective_from}`,
    ...JSON.parse(JSON.stringify(row)),
  });
  if (!price) throw new Error(`Seed price row for ${row.model_id} fails the catalog's check`);
  return price;
}
```

- [ ] **Step 4: Write `test-prices.ts`**

```ts
// D557 — the seeded price rows, for tests anywhere in the app that need a model's real price.
// Not imported by app code.
import { priceRowsFromCodeTables, seedRowToPrice } from "./price-seed";
import { currentPrice } from "./pricing";
import type { AiCatalog, AiModelPrice } from "./types";

let catalog: AiCatalog | null = null;

export function seededCatalog(): AiCatalog {
  catalog ??= { models: [], prices: priceRowsFromCodeTables().map(seedRowToPrice) };
  return catalog;
}

export function seededPrice(modelId: string, at: Date = new Date("2026-11-22T00:00:00Z")): AiModelPrice {
  const price = currentPrice(seededCatalog(), modelId, at);
  if (!price) throw new Error(`No seeded price for ${modelId}`);
  return price;
}
```

- [ ] **Step 5: Run the test to make sure it passes**

Run: `npx vitest run src/lib/ai-models/__tests__/price-seed.test.ts`
Expected: PASS, 5 tests. If the Omni allowance assertion fails by one token, the cause is floating point in the derivation: keep `Math.round` and check the derived value, never hard-code it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai-models/price-seed.ts src/lib/ai-models/test-prices.ts src/lib/ai-models/__tests__/price-seed.test.ts
git commit -m "feat(credits): price rows built from today's code tables (D557)"
```

---

### Task 5: Equivalence: the rows price exactly what the code does

**Files:**
- Test: `src/lib/ai-models/__tests__/price-equivalence.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4; today's functions `computeVideoCost`, `computeVideoCostFromUsage`, `estimateVideoCostUsd`, `normalizeOmniUsage`; `computeImageCost`, `seedreamImageCostUsd`; `estimateImageGenerationCostUsd`; `usdToFinalCredits`.
- Produces: no code. This test is the gate for Tasks 7–9 (no caller switches until it passes).

- [ ] **Step 1: Write the test**

`src/lib/ai-models/__tests__/price-equivalence.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { seededPrice } from "../test-prices";
import { videoSecondsUsd, videoEstimateUsd, videoChargeUsd } from "../video-price";
import { imageEstimateUsd, imageChargeUsd } from "../image-price";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { computeVideoCostFromUsage, estimateVideoCostUsd, normalizeOmniUsage } from "@/lib/video-gen/provider-usage";
import { computeImageCost, seedreamImageCostUsd } from "@/lib/image-gen/cost";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { usdToFinalCredits } from "@/lib/credits/units";
import { imageGenClientModels } from "@/lib/image-gen/client-models";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";
import type { ParamSpec } from "@/lib/image-gen/types";

// D557 — the seeded rows must reproduce today's prices for every model and every value its
// params can take, before any caller reads a row instead of a table.
const BEFORE = new Date("2026-11-22T00:00:00Z");
const AFTER = new Date("2026-12-04T00:00:00Z");
const options = (params: ParamSpec[], name: string): (string | undefined)[] => {
  const p = params.find((x) => x.name === name);
  return p && p.constraints.type === "select" ? p.constraints.options : [undefined];
};
const same = (a: number | null, b: number | null) => {
  if (a === null || b === null) expect(a).toBe(b);
  else expect(a).toBeCloseTo(b, 10);
};

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(BEFORE); });
afterAll(() => vi.useRealTimers());

describe("video", () => {
  for (const m of Object.values(videoGenClientModelMap)) {
    it(m.id, () => {
      for (const resolution of [...options(m.params, "resolution"), "4k"]) {
        for (const audio of [false, true]) {
          for (const d of [3, 6, 10]) {
            for (const at of [BEFORE, AFTER]) {
              same(videoSecondsUsd(seededPrice(m.id, at), d, audio, resolution), computeVideoCost(m.id, d, audio, resolution, at)?.usd ?? null);
            }
            for (const images of [0, 2]) {
              for (const editInputSeconds of [0, d]) {
                same(
                  videoEstimateUsd(seededPrice(m.id, BEFORE), { durationSeconds: d, audioEnabled: audio, resolution, images, editInputSeconds }),
                  estimateVideoCostUsd(m.id, d, audio, resolution, { images, editInputSeconds }),
                );
              }
            }
          }
        }
      }
    });
  }

  it("prices Omni's reported usage the same, before and after 3 Dec", () => {
    const usages = [
      normalizeOmniUsage({ total_input_tokens: 1104, output_tokens_by_modality: [{ modality: "video", tokens: 5793 }], total_output_tokens: 5793, total_thought_tokens: 1526 })!,
      normalizeOmniUsage({ total_input_tokens: 5798, output_tokens_by_modality: [{ modality: "video", tokens: 5793 }], total_output_tokens: 5793, total_thought_tokens: 334 })!,
      { kind: "omni" as const, inputTokens: 4718, videoOutputTokens: 11586, textOutputTokens: 0, thoughtTokens: 113 },
    ];
    for (const id of ["gemini:gemini-omni-1.1-flash", "gemini:gemini-omni-1.2-flash"]) {
      for (const at of [BEFORE, AFTER]) {
        for (const usage of usages) {
          const c = videoChargeUsd(seededPrice(id, at), { usage, durationSeconds: 3, audioEnabled: false, resolution: "360p" });
          expect(c?.source).toBe("provider_usage");
          same(c!.usd, computeVideoCostFromUsage(id, usage, "360p", at)!.usd);
        }
      }
    }
  });

  it("prices Seedance's billed tokens the same at every resolution", () => {
    for (const resolution of ["480p", "720p", "1080p"]) {
      const usage = { kind: "seedance" as const, completionTokens: 108_900 };
      same(
        videoChargeUsd(seededPrice("seedance:seedance-2-5"), { usage, durationSeconds: 5, audioEnabled: false, resolution })!.usd,
        computeVideoCostFromUsage("seedance:seedance-2-5", usage, resolution)!.usd,
      );
    }
  });

  it("gives the edit panel the same credits (audio on, the take as input)", () => {
    for (const id of ["gemini:gemini-omni-1.1-flash", "gemini:gemini-omni-1.2-flash"]) {
      for (const resolution of ["720p", "1080p", "4k"]) {
        for (const refs of [0, 3]) {
          const ours = videoEstimateUsd(seededPrice(id), { durationSeconds: 6, audioEnabled: true, resolution, images: refs, editInputSeconds: 6 });
          const today = estimateVideoCostUsd(id, 6, true, resolution, { images: refs, editInputSeconds: 6 });
          expect(ours === null ? null : usdToFinalCredits(ours)).toBe(today === null ? null : usdToFinalCredits(today));
        }
      }
    }
  });
});

describe("image", () => {
  const TOKENS = [
    { text_input_tokens: 12, image_input_tokens: 0, image_output_tokens: 1120, total_tokens: 2143, text_output_tokens: 234, thought_tokens: 777 },
    { text_input_tokens: 260, image_input_tokens: 1536, image_output_tokens: 1372, total_tokens: 3168 },
    { text_input_tokens: 5305, image_input_tokens: 0, image_output_tokens: 1120, total_tokens: 6885 },
  ];

  for (const m of imageGenClientModels) {
    it(m.id, () => {
      const price = seededPrice(m.id);
      for (const quality of options(m.params, "quality")) {
        for (const aspectRatio of options(m.params, "aspect_ratio")) {
          for (const imageSize of options(m.params, "image_size")) {
            for (const referenceCount of [0, 1, 3]) {
              same(
                imageEstimateUsd(price, { modelId: m.id, quality, aspectRatio, imageSize, referenceCount }),
                estimateImageGenerationCostUsd({ modelId: m.id, quality, aspectRatio, imageSize, referenceUrls: Array(referenceCount).fill("") }),
              );
              if (m.provider === "seedream" && imageSize) {
                const billed = imageChargeUsd(price, { tokens: null, billedImages: { output_image: 1, input_image: Math.max(0, referenceCount - 1), size: imageSize } });
                same(billed!.unpriced.length ? null : billed!.usd, seedreamImageCostUsd(m.id, imageSize, referenceCount));
              }
            }
          }
        }
      }
      if (m.provider !== "seedream") {
        for (const tokens of TOKENS) same(imageChargeUsd(price, { tokens, billedImages: null })!.usd, computeImageCost(m.id, tokens)!.usd);
      }
    });
  }
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/lib/ai-models/__tests__/price-equivalence.test.ts`
Expected: PASS for all 20 model tests and the 4 extra cases. If one fails, the failure names the model; fix `price-seed.ts`, `video-price.ts` or `image-price.ts` (never the code tables or this test's expected side). If a mismatch can only be removed by changing how today's code prices (a real inconsistency in the tables), stop and report it.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai-models/__tests__/price-equivalence.test.ts
git commit -m "test(credits): seeded price rows reproduce today's video and image prices (D557)"
```

---

### Task 6: Migration 0078, its drift test, the migration doc and D557

**Files:**
- Create (generated): `supabase/migrations/0078_ai_model_prices_seed.sql`
- Test: `src/lib/ai-models/__tests__/price-seed-migration.test.ts`
- Modify: `docs/auth-production-migration.md` (append)
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (append D557)

**Interfaces:**
- Consumes: `priceRowsFromCodeTables`, `priceSeedSql`, `SEED_JSON_TAG`.
- Produces: `supabase/migrations/0078_ai_model_prices_seed.sql`.

- [ ] **Step 1: Write the drift test**

`src/lib/ai-models/__tests__/price-seed-migration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { priceRowsFromCodeTables, priceSeedSql } from "../price-seed";

// D557 — migration 0078 holds exactly the code tables' prices until Plan 2a-ii deletes the
// tables. Vitest runs from the repo root.
const FILE = resolve(process.cwd(), "supabase/migrations/0078_ai_model_prices_seed.sql");

describe("migration 0078 (ai_model_prices seed)", () => {
  it("matches the code tables", () => {
    const rows = priceRowsFromCodeTables();
    if (process.env.UPDATE_SEED === "1") writeFileSync(FILE, priceSeedSql(rows));
    expect(existsSync(FILE), "run with UPDATE_SEED=1 to write it").toBe(true);
    expect(readFileSync(FILE, "utf8").replace(/\r\n/g, "\n")).toBe(priceSeedSql(rows));
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ai-models/__tests__/price-seed-migration.test.ts`
Expected: FAIL — "run with UPDATE_SEED=1 to write it".

- [ ] **Step 3: Generate the migration**

Run (Git Bash, uppercase C cwd): `UPDATE_SEED=1 npx vitest run src/lib/ai-models/__tests__/price-seed-migration.test.ts`
Then without the variable: `npx vitest run src/lib/ai-models/__tests__/price-seed-migration.test.ts`
Expected: PASS both times; `grep -c '"model_id"' supabase/migrations/0078_ai_model_prices_seed.sql` prints `21` (20 models + Omni 1.1's second row).

- [ ] **Step 4: Append the migration doc entry**

Append to `docs/auth-production-migration.md` (keep its CRLF line endings; one blank line before the heading):

````markdown

## Migration 0078 — model prices (D557, 2026-11-22)

`supabase/migrations/0078_ai_model_prices_seed.sql`: one price row per image and video model from
1 Jan 2026, and a second row for Omni 1.1 at 1.2 rates from 3 Dec 2026 08:00 UTC. Paste into the
Supabase SQL editor → Run.

**Ordering:** 0076, 0077 and 0078 must all be on an environment **before** the Plan 2a code is
deployed there. That code refuses to start a video or image run whose model has no price row, so
deploying it first stops every video and image generation.

**Safe to re-run:** `on conflict (model_id, effective_from) do nothing`.

**Verify after running:**

```sql
-- expect 21
select count(*) from ai_model_prices;
-- expect two rows for Omni 1.1: 2026-01-01 and 2026-12-03 08:00
select effective_from from ai_model_prices where model_id = 'gemini:gemini-omni-1.1-flash' order by 1;
-- expect an error: "ai_model_prices rows are never edited"
update ai_model_prices set note = note where model_id = 'gemini:gemini-omni-1.2-flash';
```
````

- [ ] **Step 5: Append D557 to the ADR log**

Append to `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`:

```markdown

### D557 — Video and image runs are priced from the dated price row they start on *(recorded 2026-11-22; implements D553, D554)*

**Decision.** `ai_model_prices` holds one row per video and image model (migration 0078), seeded from the code tables through their own functions at every value a model can take. A row's lines price both the estimate (`video_second` per resolution, and audio for Kling; `output_image` per quality and size; Seedream's `input_image` after the first) and the charge (Omni's input, video, text and thinking tokens; Seedance's video tokens, with a 1080p line; image text, image and output tokens). Its `estimate` holds the allowances the request cannot show: Omni's 1,100 input tokens per image, 1,500 thinking tokens and the edit's source tokens per second; image input tokens as a base plus per reference; Gemini's 1,000 text and thinking tokens. Omni 1.1's move to 1.2 rates is its second row from 3 Dec 2026 08:00 UTC. One engine (`priceMeters`) prices quantities against the matching line. A new run reads the row valid now from the cached catalog and records it as `generations.model_price_id`; its completion is charged with that same row. A model with no row is refused before anything is recorded: "This model has no price set, so it can't run right now." Seedream reports the images it billed instead of a dollar figure.

**Why.** User, 22 Nov 2026: prices come from the database, and the charge is what the provider billed. An equivalence test over every model and parameter shows the rows reproduce today's prices, so moving to them changes no charge.

**Rejected.** Hand-entering the seed rows (a typo would change a price silently). Pricing a completion at the row valid when it finishes (a run straddling a price change would be reserved at one price and charged at another). Charging 0 for a model with no price.

**Originated →** [2026-11-22-model-catalog-2a-prices.md](../plans/2026-11-22-model-catalog-2a-prices.md).
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0078_ai_model_prices_seed.sql src/lib/ai-models/__tests__/price-seed-migration.test.ts docs/auth-production-migration.md docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "feat(credits): seed model prices (migration 0078, D557)"
```

---

### Task 7: The server's price lookup and `model_price_id`

**Files:**
- Create: `src/lib/ai-models/run-price.ts`
- Test: `src/lib/ai-models/__tests__/run-price.test.ts`
- Modify: `src/lib/db/types.ts` (`GenerationRow`)
- Modify: `src/lib/db/generations.ts` (`insertGeneration`)

**Interfaces:**
- Consumes: `getAiCatalog` (catalog.ts); `currentPrice`, `priceById` (pricing.ts).
- Produces:
  - `NO_PRICE_MESSAGE = "This model has no price set, so it can't run right now."`
  - `priceForNewRun(modelId: string, at?: Date): Promise<AiModelPrice | null>`
  - `priceForGeneration(g: { model_used: string | null; created_at: string; model_price_id?: string | null }): Promise<AiModelPrice | null>`
  - `GenerationRow.model_price_id?: string | null`
  - `insertGeneration({ …, modelPriceId?: string })` writes `model_price_id` only when given

- [ ] **Step 1: Write the failing test**

`src/lib/ai-models/__tests__/run-price.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../catalog", async () => {
  const { seededCatalog } = await import("../test-prices");
  return { getAiCatalog: async () => seededCatalog() };
});

import { priceForNewRun, priceForGeneration } from "../run-price";
import { seededPrice } from "../test-prices";

describe("priceForNewRun", () => {
  it("is the row valid at the moment", async () => {
    expect((await priceForNewRun("gemini:gemini-omni-1.1-flash", new Date("2026-12-04T00:00:00Z")))?.effectiveFrom)
      .toBe("2026-12-03T08:00:00.000Z");
  });
  it("is null for a model with no price", async () => {
    expect(await priceForNewRun("vendor:unknown")).toBeNull();
  });
});

describe("priceForGeneration", () => {
  it("uses the row the run recorded, whatever its date", async () => {
    const old = seededPrice("gemini:gemini-omni-1.1-flash", new Date("2026-11-01T00:00:00Z"));
    const p = await priceForGeneration({ model_used: "gemini:gemini-omni-1.1-flash", created_at: "2026-12-10T00:00:00Z", model_price_id: old.id });
    expect(p?.id).toBe(old.id);
  });
  it("falls back to the row valid when the run started", async () => {
    const p = await priceForGeneration({ model_used: "gemini:gemini-omni-1.1-flash", created_at: "2026-12-10T00:00:00Z" });
    expect(p?.effectiveFrom).toBe("2026-12-03T08:00:00.000Z");
  });
  it("is null without a model", async () => {
    expect(await priceForGeneration({ model_used: null, created_at: "2026-11-22T00:00:00Z" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ai-models/__tests__/run-price.test.ts`
Expected: FAIL — cannot find `../run-price`.

- [ ] **Step 3: Write `run-price.ts`**

```ts
import "server-only";
import { getAiCatalog } from "./catalog";
import { currentPrice, priceById } from "./pricing";
import type { AiModelPrice } from "./types";

// D557 — where a run's price comes from: the catalog row valid when it starts. A run records the
// row it reserved with, and is charged with that same row when it finishes.
export const NO_PRICE_MESSAGE = "This model has no price set, so it can't run right now.";

export async function priceForNewRun(modelId: string, at: Date = new Date()): Promise<AiModelPrice | null> {
  return currentPrice(await getAiCatalog(), modelId, at);
}

export async function priceForGeneration(g: {
  model_used: string | null;
  created_at: string;
  model_price_id?: string | null;
}): Promise<AiModelPrice | null> {
  const catalog = await getAiCatalog();
  if (g.model_price_id) return priceById(catalog, g.model_price_id);
  // A run started before prices were recorded on it: the row valid when it started.
  return g.model_used ? currentPrice(catalog, g.model_used, new Date(g.created_at)) : null;
}
```

- [ ] **Step 4: Record `model_price_id`**

In `src/lib/db/types.ts`, inside `GenerationRow`, after `credits_charged: number | null;` add:

```ts
  // D557 — the ai_model_prices row the run was reserved and is charged with (migration 0076).
  model_price_id?: string | null;
```

In `src/lib/db/generations.ts`, add to `insertGeneration`'s input type after `inputsSnapshot?: Record<string, unknown>;`:

```ts
  /** D557 — the price row the run is reserved and charged with. */
  modelPriceId?: string;
```

and in its `.insert({ … })` object, after `inputs_snapshot: input.inputsSnapshot ?? {},` add:

```ts
      // Only when set, like script_id: a database without migration 0076 still takes every insert.
      ...(input.modelPriceId ? { model_price_id: input.modelPriceId } : {}),
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/ai-models src/lib/db`
Expected: PASS (run-price.test.ts 5 tests; nothing else changes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai-models/run-price.ts src/lib/ai-models/__tests__/run-price.test.ts src/lib/db/types.ts src/lib/db/generations.ts
git commit -m "feat(credits): a run's price comes from the catalog and is recorded on it (D557)"
```

---

### Task 8: Video runs reserve and settle with their price row

**Files:**
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts`
- Modify: `src/app/api/nodes/[id]/video-edit/route.ts`
- Modify: `src/lib/video-edit/record.ts` (`videoEditEstimateCredits`)
- Modify: `src/components/nodes/video-gen-edit-video.tsx` (its one caller of the changed function; see Step 5)
- Modify: `src/lib/generations/complete.ts` (video path)
- Modify tests: `src/app/api/nodes/[id]/video-generate/route.test.ts`, `src/app/api/nodes/[id]/video-edit/route.test.ts`, `src/lib/generations/complete.test.ts`, `src/lib/video-edit/__tests__/record.test.ts`

**Interfaces:**
- Consumes: `priceForNewRun`, `priceForGeneration`, `NO_PRICE_MESSAGE` (Task 7); `videoEstimateUsd`, `videoChargeUsd` (Task 2); `seededPrice` (tests).
- Produces:
  - `videoEditEstimateCredits(price: AiModelPrice | null, durationSeconds: number, resolution: VideoEditResolution, referenceImages?: number): number | null` (null when unpriced or no price yet)
  - `succeedGeneration` for video carries `tokensUsed` (usage) only when the charge came from usage, as today.

- [ ] **Step 1: Point the tests at real seeded prices (failing first)**

In each of the three route/completion test files, add next to their other `vi.mock` calls:

```ts
vi.mock("@/lib/ai-models/run-price", async () => {
  const { seededPrice } = await import("@/lib/ai-models/test-prices");
  return {
    NO_PRICE_MESSAGE: "This model has no price set, so it can't run right now.",
    priceForNewRun: vi.fn(async (modelId: string) => {
      try { return seededPrice(modelId); } catch { return null; }
    }),
    priceForGeneration: vi.fn(async (g: { model_used: string | null }) => (g.model_used ? seededPrice(g.model_used) : null)),
  };
});
```

Add to `src/app/api/nodes/[id]/video-generate/route.test.ts`, after the test "generates the OMNI lane on the plan's own model, with the ladder's duration" (it uses that test's graph and request):

```ts
it("refuses a model with no price before anything is recorded (D557)", async () => {
  const { priceForNewRun } = await import("@/lib/ai-models/run-price");
  vi.mocked(priceForNewRun).mockResolvedValueOnce(null);
  mocks.graph = buildGraph(
    [{ id: "c1", text: "keys", seconds: 3 }, { id: "c2", text: "cab", seconds: 5 }],
    GEMINI_OMNI_MODEL_ID,
    PLAN,
  );
  const res = await post({ modelId: GEMINI_OMNI_MODEL_ID, params: { duration: 5 }, imageRoles: { ig: "reference" } });
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: "This model has no price set, so it can't run right now." });
  expect(mocks.insertGeneration).not.toHaveBeenCalled();
});
```

Add to `src/app/api/nodes/[id]/video-edit/route.test.ts`, inside its `describe`:

```ts
it("refuses a model with no price before anything is recorded (D557)", async () => {
  const { priceForNewRun } = await import("@/lib/ai-models/run-price");
  vi.mocked(priceForNewRun).mockResolvedValueOnce(null);
  const res = await post(BODY);
  expect(res.status).toBe(409);
  expect(mocks.insertGeneration).not.toHaveBeenCalled();
});
```

In `src/lib/video-edit/__tests__/record.test.ts`, change the two `videoEditEstimateCredits` tests to pass the price first and expect the same numbers:

```ts
import { seededPrice } from "@/lib/ai-models/test-prices";
// …
expect(videoEditEstimateCredits(seededPrice(m), 6, "720p")).toBe(usdToFinalCredits(usd));
expect(videoEditEstimateCredits(seededPrice(m), 6, "4k")).toBeGreaterThan(videoEditEstimateCredits(seededPrice(m), 6, "720p")!);
// …
expect(videoEditEstimateCredits(seededPrice(GEMINI_OMNI_12_MODEL_ID), 6, "720p", 3))
  .toBeGreaterThan(videoEditEstimateCredits(seededPrice(GEMINI_OMNI_12_MODEL_ID), 6, "720p")!);
it("is null before a price is known", () => {
  expect(videoEditEstimateCredits(null, 6, "720p")).toBeNull();
});
```

In `video-edit/route.test.ts`, the two existing `videoEditEstimateCredits(6, "720p", MODEL, 1)` expectations become `videoEditEstimateCredits(seededPrice(MODEL), 6, "720p", 1)` (import `seededPrice`).

Run: `npx vitest run "src/app/api/nodes/[id]/video-generate" "src/app/api/nodes/[id]/video-edit" src/lib/video-edit src/lib/generations/complete.test.ts`
Expected: FAIL — the new refusal tests (routes don't look up a price yet) and the record tests (old signature).

- [ ] **Step 2: video-generate route**

In `src/app/api/nodes/[id]/video-generate/route.ts`:

Replace the import `import { estimateVideoCostUsd } from "@/lib/video-gen/provider-usage";` with:

```ts
import { priceForNewRun, NO_PRICE_MESSAGE } from "@/lib/ai-models/run-price";
import { videoEstimateUsd } from "@/lib/ai-models/video-price";
```

Immediately before `// Insert generation record (status: 'running')`, add:

```ts
    // D557 — the price row this run is reserved and charged with; no row, no run.
    const price = await priceForNewRun(modelId);
    if (!price) return apiError(NO_PRICE_MESSAGE, 409);
```

In the `insertGeneration({ … })` call that follows, add `modelPriceId: price.id,` after `modelUsed: modelId,`.

Replace

```ts
      const estimateUsd = estimateVideoCostUsd(modelId, durationSeconds, audioEnabled, resolution, { images });
```

with

```ts
      const estimateUsd = videoEstimateUsd(price, { durationSeconds, audioEnabled, resolution, images });
```

- [ ] **Step 3: video-edit route and `videoEditEstimateCredits`**

In `src/lib/video-edit/record.ts`, replace `videoEditEstimateCredits` with:

```ts
/**
 * The one price both the panel's estimate and the route's reservation use. D551 — Omni also
 * bills the take itself as input (as many tokens as the output) and any reference images.
 * D557 — priced from the model's price row; null until it is known or when it has no price.
 */
export function videoEditEstimateCredits(
  price: AiModelPrice | null,
  durationSeconds: number,
  resolution: VideoEditResolution,
  referenceImages = 0,
): number | null {
  if (!price) return null;
  const usd = videoEstimateUsd(price, {
    durationSeconds, audioEnabled: true, resolution, images: referenceImages, editInputSeconds: durationSeconds,
  });
  return usd === null ? null : usdToFinalCredits(usd);
}
```

and replace its import `import { estimateVideoCostUsd } from "@/lib/video-gen/provider-usage";` with:

```ts
import { videoEstimateUsd } from "@/lib/ai-models/video-price";
import type { AiModelPrice } from "@/lib/ai-models/types";
```

In `src/app/api/nodes/[id]/video-edit/route.ts`, add the import `import { priceForNewRun, NO_PRICE_MESSAGE } from "@/lib/ai-models/run-price";`, then directly before `const generation = await insertGeneration({` add:

```ts
      const price = await priceForNewRun(modelId);
      if (!price) return apiError(NO_PRICE_MESSAGE, 409);
```

add `modelPriceId: price.id,` after `modelUsed: modelId,` in that insert, and replace

```ts
        const reservation = await reserveCredits(effectiveOrgId, generation.id, videoEditEstimateCredits(durationSeconds, resolution, modelId, referenceUrls.length));
```

with

```ts
        const credits = videoEditEstimateCredits(price, durationSeconds, resolution, referenceUrls.length);
        if (credits === null) throw new Error(`No price for ${modelId} at ${resolution}.`);
        const reservation = await reserveCredits(effectiveOrgId, generation.id, credits);
```

- [ ] **Step 4: Video completion**

In `src/lib/generations/complete.ts`, add imports:

```ts
import { priceForGeneration } from "@/lib/ai-models/run-price";
import { videoChargeUsd } from "@/lib/ai-models/video-price";
```

Replace the block from `const usage = voiceChange ? null : readVideoUsage(input.usage);` through the `const cost = voiceChange ? … : null);` statement with:

```ts
  // D551/D557 — the provider's reported usage when it sent one, else the seconds, both priced
  // with the row this run was reserved with. A voice change is ElevenLabs' work, priced by its voice.
  const usage = voiceChange ? null : readVideoUsage(input.usage);
  const price = voiceChange ? null : await priceForGeneration(generation);
  const charge = price
    ? videoChargeUsd(price, { usage, durationSeconds: input.durationSeconds, audioEnabled, resolution })
    : null;
  const cost = voiceChange
    ? computeVoiceChangeCost(input.durationSeconds, voiceChange.priceMultiplier)
    : charge
      ? { usd: charge.usd }
      : null;
```

and in the `succeedGeneration({ … })` call below it, replace `...(usageCost && usage ? { tokensUsed: usage } : {}),` with:

```ts
    ...(charge?.source === "provider_usage" && usage ? { tokensUsed: usage } : {}),
```

Remove the now-unused imports `computeVideoCost` (keep `isVideoAudioEnabled`, `asResolutionString`) and `computeVideoCostFromUsage`.

- [ ] **Step 5: The edit panel's call**

`src/components/nodes/video-gen-edit-video.tsx` calls `videoEditEstimateCredits(duration, resolution, modelId, selectedIds.length)`. Until Plan 2a-ii gives the browser the catalog, keep it compiling with the seeded-equivalent price read from the code tables:

```ts
import { priceFromCodeTables } from "@/lib/ai-models/price-seed";
// …
const credits = duration > 0 ? videoEditEstimateCredits(priceFromCodeTables(modelId), duration, resolution, selectedIds.length) : null;
```

and add to `src/lib/ai-models/price-seed.ts`:

```ts
let codeTablePrices: AiModelPrice[] | null = null;

/** Transitional (removed in Plan 2a-ii): the row the seed holds for a model now, from the code
 *  tables. Built once per page load; callers run in render. */
export function priceFromCodeTables(modelId: string, at: Date = new Date()): AiModelPrice | null {
  codeTablePrices ??= priceRowsFromCodeTables().map(seedRowToPrice);
  let best: AiModelPrice | null = null;
  for (const p of codeTablePrices) {
    if (p.modelId !== modelId || new Date(p.effectiveFrom) > at) continue;
    if (!best || p.effectiveFrom > best.effectiveFrom) best = p;
  }
  return best;
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run "src/app/api/nodes/[id]/video-generate" "src/app/api/nodes/[id]/video-edit" src/lib/video-edit src/lib/generations src/lib/ai-models src/components/nodes`
Expected: PASS. Every pre-existing expected credit number is unchanged (Task 5 proved the rows equal the tables).

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^\.next/\|image-generate/route.test.ts(56"`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/nodes/[id]/video-generate/route.ts" "src/app/api/nodes/[id]/video-generate/route.test.ts" "src/app/api/nodes/[id]/video-edit/route.ts" "src/app/api/nodes/[id]/video-edit/route.test.ts" src/lib/video-edit/record.ts src/lib/video-edit/__tests__/record.test.ts src/lib/generations/complete.ts src/lib/generations/complete.test.ts src/components/nodes/video-gen-edit-video.tsx src/lib/ai-models/price-seed.ts
git commit -m "feat(credits): video runs reserve and settle with their price row (D557)"
```

---

### Task 9: Image runs reserve and settle with their price row

**Files:**
- Modify: `src/lib/image-gen/types.ts` (`ImageGenResult`: replace `costUsd` with `billedImages`)
- Modify: `src/lib/image-gen/providers/seedream.ts` (report billed images)
- Modify: `src/lib/image-gen/run-task.ts` (forward `billedImages`)
- Modify: `src/lib/image-gen/start-generation.ts`
- Modify: `src/lib/avatars/generation.ts` (`estimateAvatarImageCostUsd` takes a price)
- Modify: `src/lib/image-gen/billed-run.ts`
- Modify: `src/lib/generations/complete.ts` (image path)
- Modify tests: `src/lib/image-gen/__tests__/start-generation.test.ts`, `src/lib/image-gen/__tests__/billed-run.test.ts`, `src/lib/image-gen/providers/__tests__/seedream.test.ts`, `src/lib/image-gen/__tests__/run-task.test.ts`, `src/lib/generations/complete.test.ts`, `src/lib/avatars/__tests__/generation.test.ts`

**Interfaces:**
- Consumes: Tasks 3 and 7.
- Produces:
  - `ImageGenResult.billedImages?: BilledImages`, `ImageGenerationSucceeded.billedImages?: BilledImages` (no `costUsd`)
  - `estimateAvatarImageCostUsd(price: AiModelPrice | null, input: { modelId; aspect; referenceCount }): number | null`
  - `estimateAvatarImageCredits(price: AiModelPrice | null, input)`, `estimateSheetCredits(price: AiModelPrice | null, modelId: string)` (same, price first)

- [ ] **Step 1: Failing tests**

Add the `vi.mock("@/lib/ai-models/run-price", …)` block from Task 8 Step 1 to `start-generation.test.ts`, `billed-run.test.ts` and `complete.test.ts` (already there from Task 8).

In `src/lib/image-gen/providers/__tests__/seedream.test.ts`:
- in "returns the image, the token usage and the exact charge" (Pro, 3 references), replace `expect(result.costUsd).toBeCloseTo(0.096, 6);` and its comment with:

```ts
    // D557 — the images billed (2 references after the first); the price row turns them into $0.096.
    expect(result.billedImages).toEqual({ output_image: 1, input_image: 2, size: "2K" });
    expect("costUsd" in result).toBe(false);
```

- in "charges Lite a flat price whatever the references" (Lite 4K, 2 references), replace `expect(result.costUsd).toBeCloseTo(0.035, 6);` with:

```ts
    expect(result.billedImages).toEqual({ output_image: 1, input_image: 1, size: "4K" });
```

In `src/lib/generations/complete.test.ts`, `describe("completeGeneration — image (D366)")`:
- delete `costUsd: 0.05,` from the `succeeded` fixture;
- in "creates the version … and settles at the reported cost", rename the test to "… and settles at the price of its tokens", and change the two amounts it asserts to the row's price of `TOKENS` on gpt-image-2 (10 text-in tokens at $5/M, 20 image-out tokens at $30/M):

```ts
    const usd = (10 * 5 + 20 * 30) / 1e6;
    expect(mocks.settleGeneration).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1", actualAmount: usdToFinalCredits(usd) });
    // …and in the succeedGeneration expectation:
        costUsd: expect.closeTo(usd, 10),
```

- in "bills a token-billed image from its reported tokens, never at zero", replace the two lines `const { costUsd: _omit, ...tokenBilled } = succeeded;` / `void _omit;` with `const tokenBilled = succeeded;`;
- add:

```ts
  it("prices the images Seedream billed with its row (D557)", async () => {
    mocks.generation = { ...mocks.generation, model_used: "seedream:seedream-5-0-pro", params_snapshot: { image_size: "2K" } };
    await completeGeneration({ ...succeeded, tokensUsed: null, billedImages: { output_image: 1, input_image: 2, size: "2K" } });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(0.096) }));
  });
```

In `src/lib/image-gen/__tests__/billed-run.test.ts`, change the `generate.mockResolvedValue({ … costUsd: 0.067 })` line to drop `costUsd: 0.067` and give real tokens: `tokensUsed: { text_input_tokens: 180, image_input_tokens: 0, image_output_tokens: 1120, total_tokens: 1300 }`.

Add to `start-generation.test.ts`:

```ts
it("refuses a model with no price before anything is recorded (D557)", async () => {
  const { priceForNewRun } = await import("@/lib/ai-models/run-price");
  vi.mocked(priceForNewRun).mockResolvedValueOnce(null);
  const res = await startImageGeneration(input);
  expect(res.status).toBe(409);
  expect(m.insertGeneration).not.toHaveBeenCalled();
});
```

In `src/lib/avatars/__tests__/generation.test.ts`, pass `seededPrice(modelId)` as the new first argument to every `estimateAvatarImageCostUsd`, `estimateAvatarImageCredits` and `estimateSheetCredits` call, keep every expected value, and add:

```ts
it("is null before a price is known", () => {
  expect(estimateAvatarImageCredits(null, { modelId: "gemini:gemini-3-pro-image", aspect: "1:1", referenceCount: 0 })).toBeNull();
});
```

Run: `npx vitest run src/lib/image-gen src/lib/avatars src/lib/generations`
Expected: FAIL in the changed tests.

- [ ] **Step 2: Seedream reports billed images**

In `src/lib/image-gen/types.ts`, in `ImageGenResult`, replace the `costUsd?: number;` line with:

```ts
  /** D557 — providers billed per image (Seedream) report what they billed; the price row prices it. */
  billedImages?: BilledImages;
```

and add `import type { BilledImages } from "@/lib/ai-models/image-price";` at the top.

In `src/lib/image-gen/providers/seedream.ts`, replace

```ts
    costUsd: seedreamImageCostUsd(variant.id, resolutionOf(input), input.referenceUrls.length) ?? undefined,
```

with

```ts
    billedImages: {
      output_image: 1,
      input_image: Math.max(0, input.referenceUrls.length - 1),
      size: resolutionOf(input),
    },
```

and remove the `seedreamImageCostUsd` import.

In `src/lib/image-gen/run-task.ts`, in `ImageGenerationSucceeded` replace `costUsd?: number;` with `billedImages?: BilledImages;` (import the type as above), and replace

```ts
    ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
```

with

```ts
    ...(result.billedImages ? { billedImages: result.billedImages } : {}),
```

Update `src/lib/image-gen/__tests__/run-task.test.ts` wherever it passes or expects `costUsd` the same way.

- [ ] **Step 3: Image start**

In `src/lib/image-gen/start-generation.ts`, replace the `estimateImageGenerationCostUsd` import with:

```ts
import { priceForNewRun, NO_PRICE_MESSAGE } from "@/lib/ai-models/run-price";
import { imageEstimateUsd } from "@/lib/ai-models/image-price";
```

After the `hasRunningGeneration` check add:

```ts
  // D557 — the price row this run is reserved and charged with; no row, no run.
  const price = await priceForNewRun(modelId);
  if (!price) return apiError(NO_PRICE_MESSAGE, 409);
```

add `modelPriceId: price.id,` after `modelUsed: modelId,` in `insertGeneration`, and replace the `const costUsd = estimateImageGenerationCostUsd({ … });` statement with:

```ts
    const costUsd = imageEstimateUsd(price, {
      modelId,
      quality: params.quality as string | undefined,
      aspectRatio: params.aspect_ratio as string | undefined,
      imageSize: params.image_size as string | undefined,
      referenceCount: referenceUrls.length,
    });
```

- [ ] **Step 4: Avatar estimates take a price**

In `src/lib/avatars/generation.ts`, replace the three estimate functions with:

```ts
/** D395 — the sheet is one 16:9 image with the front as its reference; its four views are cut
 *  from it at no further cost. */
export function estimateSheetCredits(price: AiModelPrice | null, modelId: string): number | null {
  return estimateAvatarImageCredits(price, { modelId, aspect: AVATAR_SHEET_ASPECT, referenceCount: 1 });
}

export function estimateAvatarImageCostUsd(
  price: AiModelPrice | null,
  input: { modelId: string; aspect: string; referenceCount: number },
): number | null {
  const params = avatarImageParams(input.modelId, input.aspect);
  if (!params || !price) return null;
  return imageEstimateUsd(price, {
    modelId: input.modelId,
    quality: params.quality as string | undefined,
    aspectRatio: input.aspect,
    imageSize: params.image_size as string | undefined,
    referenceCount: input.referenceCount,
  });
}

export function estimateAvatarImageCredits(
  price: AiModelPrice | null,
  input: { modelId: string; aspect: string; referenceCount: number },
): number | null {
  const usd = estimateAvatarImageCostUsd(price, input);
  return usd === null ? null : usdToFinalCredits(usd);
}
```

Replace its `estimateImageGenerationCostUsd` import with `import { imageEstimateUsd } from "@/lib/ai-models/image-price";` and add `import type { AiModelPrice } from "@/lib/ai-models/types";`.

Then update the callers so they compile, each with the transitional `priceFromCodeTables(modelId)` from Task 8 (Plan 2a-ii swaps it for the browser hook):
- `src/lib/scripts/visualise/maker.ts` `estimateMakeCredits`: `estimateAvatarImageCredits(priceFromCodeTables(modelId), { … })` and `estimateSheetCredits(priceFromCodeTables(modelId), modelId)`.
- `src/lib/scripts/visualise/panel-inputs.ts` `estimatePanelCredits`: `estimateAvatarImageCredits(priceFromCodeTables(modelId), { … })`.
- `src/components/avatars/avatar-describe-panel.tsx:39`, `src/components/avatars/avatar-sheet-generate.tsx:24`, `src/components/visualise/cast-slot-photo-maker.tsx:51`, `src/components/visualise/cast-slot-ai-maker.tsx:52`: add `priceFromCodeTables(modelId)` as the first argument.

- [ ] **Step 5: Billed image runs**

In `src/lib/image-gen/billed-run.ts`, replace the `computeImageCost` import with:

```ts
import { priceForNewRun, NO_PRICE_MESSAGE } from "@/lib/ai-models/run-price";
import { imageChargeUsd } from "@/lib/ai-models/image-price";
```

Before `const generation = await insertGeneration({` add:

```ts
  // D557 — the price row this image is reserved and charged with; no row, no image.
  const price = await priceForNewRun(args.modelId);
  if (!price) throw new Error(NO_PRICE_MESSAGE);
```

add `modelPriceId: price.id,` after `modelUsed: args.modelId,`; change the estimate call to `estimateAvatarImageCostUsd(price, { … })`; and replace the `const cost = …;` statement with:

```ts
    const charge = imageChargeUsd(price, { tokens: result.tokensUsed ?? null, billedImages: result.billedImages ?? null });
    const cost = charge ? { usd: charge.usd } : null;
```

- [ ] **Step 6: Image completion**

In `src/lib/generations/complete.ts` `completeImageGeneration`, add the import `import { imageChargeUsd } from "@/lib/ai-models/image-price";` and replace the `const cost = …;` statement with:

```ts
  // D557 — priced with the row this run was reserved with: billed images (Seedream) or tokens.
  const price = await priceForGeneration(generation);
  const charge = price
    ? imageChargeUsd(price, { tokens: input.tokensUsed ?? null, billedImages: input.billedImages ?? null })
    : null;
  const cost = charge ? { usd: charge.usd } : null;
```

Remove the unused `computeImageCost` import.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/lib/image-gen src/lib/avatars src/lib/scripts src/lib/generations src/lib/ai-models "src/app/api/nodes/[id]/image-generate" "src/app/api/nodes/[id]/composite-generate" "src/app/api/clients" src/components`
Expected: PASS, except the two "refuses a deprecated model before anything starts (D467)" tests that already fail on staging; confirm their failure message is unchanged (`Unknown modelId: openai:gpt-image-1`).

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^\.next/\|image-generate/route.test.ts(56"`
Expected: no output.

- [ ] **Step 8: Commit**

Stage every file this task changed by explicit path (the list under **Files**, plus `maker.ts`, `panel-inputs.ts` and the four avatar/visualise components), then:

```bash
git commit -m "feat(credits): image runs reserve and settle with their price row (D557)"
```

---

### Task 10: The voice preview's clip is priced from its price row

**Files:**
- Modify: `src/lib/avatars/voice-preview.ts`
- Modify: `src/lib/avatars/studio-server.ts`
- Modify: `src/app/api/clients/[id]/avatars/[avatarId]/voice-preview/route.ts`
- Modify: `src/lib/avatars/complete-voice-preview.ts`
- Modify tests: `src/lib/avatars/__tests__/voice-preview.test.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/voice-preview/route.test.ts`, `src/lib/generations/complete.test.ts` (voice preview cases)

**Interfaces:**
- Consumes: `priceForNewRun`, `priceForGeneration`, `NO_PRICE_MESSAGE`; `videoSecondsUsd`.
- Produces:
  - `voicePreviewCostUsd(price: AiModelPrice | null, mode, engine, durationSeconds, resolution, priceMultiplier): number | null`
  - `estimateVoicePreviewCredits(price: AiModelPrice | null, mode, engine, priceMultiplier = 1): number | null`

- [ ] **Step 1: Failing tests**

In `src/lib/avatars/__tests__/voice-preview.test.ts`, pass `seededPrice(VOICE_PREVIEW_ENGINE[engine].modelId)` as the new first argument to every `voicePreviewCostUsd` and `estimateVoicePreviewCredits` call and keep every expected value. Add:

```ts
it("is null before the clip's price is known", () => {
  expect(estimateVoicePreviewCredits(null, "native", "omni")).toBeNull();
});
```

Add the `vi.mock("@/lib/ai-models/run-price", …)` block from Task 8 Step 1 to the voice-preview route test.

Run: `npx vitest run src/lib/avatars "src/app/api/clients/[id]/avatars"`
Expected: FAIL (old signatures).

- [ ] **Step 2: Price the clip from the row**

In `src/lib/avatars/voice-preview.ts`, replace `import { computeVideoCost } from "@/lib/video-gen/cost";` with:

```ts
import { videoSecondsUsd } from "@/lib/ai-models/video-price";
import type { AiModelPrice } from "@/lib/ai-models/types";
```

and replace the two functions with:

```ts
/** What a preview costs. A named preview pays for the clip and the voice change over the same
 *  seconds; a native one pays for the clip alone, because the engine's voice arrives with it.
 *  D557 — the clip is priced from its model's price row. Null without a price. */
export function voicePreviewCostUsd(
  price: AiModelPrice | null,
  mode: VoicePreviewMode,
  engine: VoicePreviewEngine,
  durationSeconds: number,
  resolution: string | undefined,
  priceMultiplier: number,
): number | null {
  if (!price) return null;
  const video = videoSecondsUsd(price, durationSeconds, false, resolution);
  if (video === null) return null;
  if (mode === "native") return video;
  return video + computeVoiceChangeCost(durationSeconds, priceMultiplier).usd;
}

export function estimateVoicePreviewCredits(
  price: AiModelPrice | null,
  mode: VoicePreviewMode,
  engine: VoicePreviewEngine,
  priceMultiplier = 1,
): number | null {
  const spec = VOICE_PREVIEW_ENGINE[engine];
  const usd = voicePreviewCostUsd(price, mode, engine, spec.seconds, spec.resolution, priceMultiplier);
  return usd === null ? null : usdToFinalCredits(usd);
}
```

- [ ] **Step 3: The callers**

In `src/lib/avatars/studio-server.ts` `estimateFor`, add the import `import { priceForNewRun } from "@/lib/ai-models/run-price";` and `VOICE_PREVIEW_ENGINE` to the `./voice-preview` import, then:

```ts
  const price = await priceForNewRun(VOICE_PREVIEW_ENGINE[engine].modelId);
  if (mode === "native") return estimateVoicePreviewCredits(price, "native", engine);
  // …
  return estimateVoicePreviewCredits(price, "named", engine, voice?.priceMultiplier ?? 1);
```

In the voice-preview route, add `import { priceForNewRun, NO_PRICE_MESSAGE } from "@/lib/ai-models/run-price";`; directly before `const generation = await insertGeneration({` add:

```ts
      const price = await priceForNewRun(VOICE_PREVIEW_ENGINE[engine].modelId);
      if (!price) return apiError(NO_PRICE_MESSAGE, 409);
```

add `modelPriceId: price.id,` after `modelUsed: VOICE_PREVIEW_ENGINE[engine].modelId,`, and change line 108 to `estimateVoicePreviewCredits(price, mode, engine, voice?.priceMultiplier ?? 1)`.

In `src/lib/avatars/complete-voice-preview.ts`, add `import { priceForGeneration } from "@/lib/ai-models/run-price";` and change the `voicePreviewCostUsd(` call to pass `await priceForGeneration(generation),` as its first argument.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/avatars "src/app/api/clients/[id]/avatars" src/lib/generations src/lib/ai-models`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^\.next/\|image-generate/route.test.ts(56"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/avatars/voice-preview.ts src/lib/avatars/studio-server.ts "src/app/api/clients/[id]/avatars/[avatarId]/voice-preview/route.ts" "src/app/api/clients/[id]/avatars/[avatarId]/voice-preview/route.test.ts" src/lib/avatars/complete-voice-preview.ts src/lib/avatars/__tests__/voice-preview.test.ts src/lib/generations/complete.test.ts
git commit -m "feat(credits): the voice preview's clip is priced from its price row (D557)"
```

---

## After 2a-i

Apply 0078 to the dev database (and, before deploying this code anywhere else, 0076–0078 there). Then Plan 2a-ii.
