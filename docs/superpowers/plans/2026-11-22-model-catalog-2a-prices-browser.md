# Model catalog 2a-ii — prices from the database: browser and deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every video and image estimate on screen is priced from the catalog's price rows, shows a loading state until they arrive, and the code price tables are deleted.

**Architecture:** One hook, `useModelPrice(modelId)`, selects the row valid now from the session's single catalog query (`useAiCatalog`, Plan 1a). Each display prices its estimate with `videoEstimateUsd` / `imageEstimateUsd` (Plan 2a-i) and shows the existing loading treatment (`GenerateFooter`'s `estimating`, a spinner in `AvatarCreditCost`) while the catalog loads. Then the tables and the functions built on them are deleted, migration 0078 becomes frozen history, and the tests read prices from it.

**Tech Stack:** React 19 client components, TanStack Query 5, Vitest 4.

**Prerequisite:** Plan 2a-i (`docs/superpowers/plans/2026-11-22-model-catalog-2a-prices.md`) complete: `pricing.ts`, `video-price.ts`, `image-price.ts`, `run-price.ts`, `test-prices.ts`, migration 0078, and the transitional `priceFromCodeTables`.

## Global Constraints

- One catalog request per session (`useAiCatalog`); nothing fetches per node, card or tile (performance rule 1).
- While the catalog loads, an estimate shows the loading treatment, never a number and never 0. If the catalog fails to load, the estimate shows nothing and the server still refuses an unpriced run.
- Loading treatment: `GenerateFooter estimating` (spinner, no number) where a footer exists; elsewhere `AvatarCreditCost` shows a spinner. Lucide `Loader2`, `strokeWidth={1.5}`, `animate-spin`, no new components.
- Decision number for comments: **D534**.
- Stage only named files by explicit path; no AI attribution; vitest from Git Bash needs `cd "C:/Users/yuvab/OneDrive/Desktop/codes/creativeos-asset-pipeline"` (uppercase C).

---

## File structure

| File | Responsibility |
|---|---|
| `src/hooks/queries/ai-models.ts` (modify) | `useModelPrice(modelId)` |
| `src/components/avatars/avatar-credit-cost.tsx` (modify) | spinner while the catalog loads |
| video displays (modify) | `video-gen-focus-view.tsx`, `video-gen-edit-video.tsx` |
| image displays (modify) | `image-gen-focus-view.tsx`, `composite-focus-view.tsx` |
| avatar and Visualise estimates (modify) | `avatars/generation.ts` callers, `maker.ts`, `panel-inputs.ts`, `use-visualise-model.ts`, four components |
| deletions | `src/lib/image-gen/estimate.ts`, the tables in `video-gen/cost.ts`, `image-gen/cost.ts`, `video-gen/provider-usage.ts`, `src/lib/ai-models/price-seed.ts` |
| `src/lib/ai-models/test-prices.ts` (modify) | reads the frozen 0078 rows |

---

### Task 1: `useModelPrice` and a loading credit label

**Files:**
- Modify: `src/hooks/queries/ai-models.ts`
- Modify: `src/components/avatars/avatar-credit-cost.tsx`
- Test: `src/components/avatars/__tests__/avatar-credit-cost.test.tsx`

**Interfaces:**
- Consumes: `useAiCatalog` (Plan 1a); `currentPrice` (`@/lib/ai-models/pricing`).
- Produces:
  - `useModelPrice(modelId: string): { price: AiModelPrice | null; loading: boolean }` — `loading` is true only while the catalog request is pending.
  - `AvatarCreditCost({ credits })` renders a spinner (`role="status"`, `aria-label="Working out the cost"`) when `credits === null` and the catalog is pending; nothing when `credits === null` otherwise.

- [ ] **Step 1: Write the failing test**

`src/components/avatars/__tests__/avatar-credit-cost.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const catalog = vi.hoisted(() => ({ isPending: false }));
vi.mock("@/hooks/queries/ai-models", () => ({ useAiCatalog: () => catalog }));

import { AvatarCreditCost } from "../avatar-credit-cost";

describe("AvatarCreditCost (D534)", () => {
  it("shows the credits", () => {
    expect(renderToStaticMarkup(<AvatarCreditCost credits={1250} />)).toContain("1,250");
  });
  it("shows a spinner, not a number, while the prices load", () => {
    catalog.isPending = true;
    const html = renderToStaticMarkup(<AvatarCreditCost credits={null} />);
    expect(html).toContain('aria-label="Working out the cost"');
    expect(html).toContain("animate-spin");
    catalog.isPending = false;
  });
  it("shows nothing for a model with no price once loaded", () => {
    expect(renderToStaticMarkup(<AvatarCreditCost credits={null} />)).toBe("");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/components/avatars/__tests__/avatar-credit-cost.test.tsx`
Expected: FAIL — the spinner test (no spinner yet).

- [ ] **Step 3: Add the hook**

Append to `src/hooks/queries/ai-models.ts`:

```ts
/** D534 — a model's price row valid now, selected from the session's one catalog query. */
export function useModelPrice(modelId: string): { price: AiModelPrice | null; loading: boolean } {
  const catalog = useAiCatalog();
  return {
    price: catalog.data ? currentPrice(catalog.data, modelId, new Date()) : null,
    loading: catalog.isPending,
  };
}
```

with the imports `import { currentPrice } from "@/lib/ai-models/pricing";` and `import type { AiModelPrice } from "@/lib/ai-models/types";`.

- [ ] **Step 4: The label's loading state**

Replace `src/components/avatars/avatar-credit-cost.tsx` with:

```tsx
"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useAiCatalog } from "@/hooks/queries/ai-models";

// The credit cost shown on a generate control — the same number the route will reserve.
// D534 — while the prices load it shows a spinner; with no priced estimate it shows nothing.
export function AvatarCreditCost({ credits }: { credits: number | null }) {
  const catalog = useAiCatalog();
  if (credits === null) {
    return catalog.isPending ? (
      <Loader2 role="status" aria-label="Working out the cost" className="size-3 animate-spin opacity-85" strokeWidth={1.5} />
    ) : null;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-normal opacity-85 tabular-nums">
      <Sparkles className="size-3" strokeWidth={1.5} />
      {credits.toLocaleString()}
    </span>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/avatars src/components/visualise src/hooks`
Expected: PASS. A test elsewhere that renders `AvatarCreditCost` without a QueryClient now fails with "No QueryClient set"; in that test file add `vi.mock("@/hooks/queries/ai-models", () => ({ useAiCatalog: () => ({ isPending: false }), useModelPrice: () => ({ price: null, loading: false }) }));` next to its other mocks and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/queries/ai-models.ts src/components/avatars/avatar-credit-cost.tsx src/components/avatars/__tests__/avatar-credit-cost.test.tsx
git commit -m "feat(credits): a model's price from the catalog, and a loading credit label (D534)"
```

(Add any test file Step 5 had to change to the same commit.)

---

### Task 2: Video estimates from the catalog

**Files:**
- Modify: `src/components/nodes/video-gen-focus-view.tsx`
- Modify: `src/components/nodes/video-gen-edit-video.tsx`

**Interfaces:**
- Consumes: `useModelPrice` (Task 1); `videoEstimateUsd` (`@/lib/ai-models/video-price`); `videoEditEstimateCredits(price, …)` (2a-i Task 8).

- [ ] **Step 1: Video Gen focus view**

In `src/components/nodes/video-gen-focus-view.tsx`, replace the import `import { estimateVideoCostUsd } from "@/lib/video-gen/provider-usage";` with:

```ts
import { videoEstimateUsd } from "@/lib/ai-models/video-price";
import { useModelPrice } from "@/hooks/queries/ai-models";
```

Replace

```ts
  const videoCostEstimateUsd = estimateVideoCostUsd(modelId, durationSeconds, audioEnabled, resolution, {
    images: Object.keys(effectiveImageRoles).length,
  });
```

with

```ts
  // D534 — priced from the model's row in the session's catalog; a spinner until it arrives.
  const { price: modelPrice, loading: priceLoading } = useModelPrice(modelId);
  const videoCostEstimateUsd = modelPrice
    ? videoEstimateUsd(modelPrice, { durationSeconds, audioEnabled, resolution, images: Object.keys(effectiveImageRoles).length })
    : null;
```

and change the footer's `estimating={loadingConnected}` to `estimating={loadingConnected || priceLoading}`.

- [ ] **Step 2: Edit panel**

In `src/components/nodes/video-gen-edit-video.tsx`, replace the `priceFromCodeTables` import (from 2a-i) with `import { useModelPrice } from "@/hooks/queries/ai-models";`, and replace

```ts
  const credits = duration > 0 ? videoEditEstimateCredits(priceFromCodeTables(modelId), duration, resolution, selectedIds.length) : null;
```

with

```ts
  const { price, loading: priceLoading } = useModelPrice(modelId);
  const credits = duration > 0 ? videoEditEstimateCredits(price, duration, resolution, selectedIds.length) : null;
```

and add `estimating={priceLoading}` to its `<GenerateFooter … />`.

- [ ] **Step 3: Check it**

Run: `npx vitest run src/components/nodes src/lib/video-edit`
Expected: PASS (add the `vi.mock("@/hooks/queries/ai-models", …)` line from Task 1 Step 5 to any component test that now needs it, returning `useModelPrice: () => ({ price: seededPrice(<model>), loading: false })` where the test asserts a credit number; import `seededPrice` from `@/lib/ai-models/test-prices`).

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^\.next/\|image-generate/route.test.ts(56"`
Expected: no output.

In the browser (dev server on 3001, signed in): open a Video Gen focus view. The Generate button shows the spinner, then `Est. N credits` with the same N as before this task.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/video-gen-focus-view.tsx src/components/nodes/video-gen-edit-video.tsx
git commit -m "feat(credits): Video Gen and Edit video price their estimate from the catalog (D534)"
```

---

### Task 3: Image estimates from the catalog

**Files:**
- Modify: `src/components/nodes/image-gen-focus-view.tsx`
- Modify: `src/components/nodes/composite-focus-view.tsx`

**Interfaces:**
- Consumes: `useModelPrice`; `imageEstimateUsd` (`@/lib/ai-models/image-price`).

- [ ] **Step 1: Image Gen focus view**

In `src/components/nodes/image-gen-focus-view.tsx`, replace `import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";` with:

```ts
import { imageEstimateUsd } from "@/lib/ai-models/image-price";
import { useModelPrice } from "@/hooks/queries/ai-models";
```

Directly above `const hasPromptUpstream = Boolean(promptUpstream);` add:

```ts
  // D534 — priced from the model's row in the session's catalog.
  const { price: modelPrice, loading: priceLoading } = useModelPrice(model.id);
  const modelPriceId = modelPrice?.id ?? null;
```

In the Generate estimate memo, change the guard to `if (!open || activeTab === "edit" || !promptUpstream || !fetchedPrompt?.text || !modelPrice) return null;`, replace its `estimateImageGenerationCostUsd({ … referenceUrls: connectedImageUrls })` with

```ts
    const costUsd = imageEstimateUsd(modelPrice, {
      modelId: model.id,
      quality: paramValues.quality as string | undefined,
      aspectRatio: paramValues.aspect_ratio as string | undefined,
      imageSize: paramValues.image_size as string | undefined,
      referenceCount: connectedImageUrls.length,
    });
```

and add `modelPriceId` to its dependency list. Change

```ts
  const estimating =
    open && activeTab !== "edit" && Boolean(promptUpstream) && !fetchedPrompt?.text;
```

to

```ts
  const estimating =
    (open && activeTab !== "edit" && Boolean(promptUpstream) && !fetchedPrompt?.text) || priceLoading;
```

In the Edit estimate memo, change its guard to end `|| !modelPrice) return null;`, replace its `estimateImageGenerationCostUsd({ … referenceUrls })` with the same `imageEstimateUsd(modelPrice, { … referenceCount: referenceUrls.length })`, add `modelPriceId` to its dependencies, and change `const editEstimating = false;` (and the comment above it) to:

```ts
  // D534 — the only thing the Edit estimate waits for is the price.
  const editEstimating = priceLoading;
```

- [ ] **Step 2: Composite focus view**

In `src/components/nodes/composite-focus-view.tsx`, replace the `estimateImageGenerationCostUsd` import with the two imports above. Directly above `// The same images the server will send: an avatar's front and fresh sheet are two.` add:

```ts
  const { price: modelPrice, loading: priceLoading } = useModelPrice(model.id);
```

Replace the two `estimateImageGenerationCostUsd({ … })` calls with:

```ts
  const costUsd = modelPrice
    ? imageEstimateUsd(modelPrice, {
        modelId: model.id,
        quality: values.quality as string | undefined,
        aspectRatio: values.aspect_ratio as string | undefined,
        imageSize: values.image_size as string | undefined,
        referenceCount: referenceUrls.length,
      })
    : null;
```

and

```ts
  const editUsd = modelPrice
    ? imageEstimateUsd(modelPrice, {
        modelId: model.id,
        quality: values.quality as string | undefined,
        aspectRatio: values.aspect_ratio as string | undefined,
        imageSize: values.image_size as string | undefined,
        referenceCount: 1 + edit.selectedIds.length,
      })
    : null;
```

and add `estimating={priceLoading}` to the `<GenerateFooter … />` whose `credits={actionUsd === null ? null : usdToFinalCredits(actionUsd)}`.

- [ ] **Step 3: Check it**

Run: `npx vitest run src/components/nodes`
Expected: PASS (mock as in Task 2 Step 3 where needed).

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^\.next/\|image-generate/route.test.ts(56"`
Expected: no output.

In the browser: open an Image Gen and a Composite focus view; the button shows the spinner, then the same `Est. N credits` as before this task.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/image-gen-focus-view.tsx src/components/nodes/composite-focus-view.tsx
git commit -m "feat(credits): Image Gen and Composite price their estimate from the catalog (D534)"
```

---

### Task 4: Avatar and Visualise estimates from the catalog

**Files:**
- Modify: `src/lib/scripts/visualise/maker.ts`, `src/lib/scripts/visualise/panel-inputs.ts`
- Modify: `src/hooks/use-visualise-model.ts`
- Modify: `src/components/avatars/avatar-describe-panel.tsx`, `src/components/avatars/avatar-sheet-generate.tsx`, `src/components/visualise/cast-slot-photo-maker.tsx`, `src/components/visualise/cast-slot-ai-maker.tsx`
- Modify tests: `src/lib/scripts/visualise/__tests__/maker.test.ts`, `src/lib/scripts/visualise/__tests__/panel-inputs.test.ts`

**Interfaces:**
- Consumes: `useModelPrice`; `estimateAvatarImageCredits(price, …)`, `estimateSheetCredits(price, modelId)` (2a-i Task 9).
- Produces:
  - `estimateMakeCredits(price: AiModelPrice | null, modelId?: string): number | null`
  - `estimatePanelCredits(price: AiModelPrice | null, referenceCount: number, aspect: string, modelId?: string): number | null`

- [ ] **Step 1: Failing tests**

In `maker.test.ts` and `panel-inputs.test.ts`, pass `seededPrice(<the model id the test uses, or VISUALISE_AVATAR_MODEL_ID / PANEL_MODEL_ID for a default>)` as the new first argument of every `estimateMakeCredits` / `estimatePanelCredits` call, keep every expected value, and add to each:

```ts
it("is null before a price is known", () => {
  expect(estimateMakeCredits(null)).toBeNull(); // panel-inputs.test.ts: expect(estimatePanelCredits(null, 0, "9:16")).toBeNull();
});
```

Run: `npx vitest run src/lib/scripts/visualise`
Expected: FAIL (old signatures).

- [ ] **Step 2: The two estimate functions**

In `src/lib/scripts/visualise/maker.ts`:

```ts
/** What Make avatar costs: one face, then one sheet. D534 — null until the price is known. */
export function estimateMakeCredits(price: AiModelPrice | null, modelId: string = VISUALISE_AVATAR_MODEL_ID): number | null {
  const face = estimateAvatarImageCredits(price, { modelId, aspect: AVATAR_FRONT_ASPECT, referenceCount: 0 });
  const sheet = estimateSheetCredits(price, modelId);
  return face === null || sheet === null ? null : face + sheet;
}
```

In `src/lib/scripts/visualise/panel-inputs.ts`:

```ts
/** D346 — a panel bills like any image: the same estimate the draw reserves. `referenceCount`
 *  is the people's views; the house style image the draw adds is counted here too. */
export function estimatePanelCredits(
  price: AiModelPrice | null,
  referenceCount: number,
  aspect: string,
  modelId: string = PANEL_MODEL_ID,
): number | null {
  return estimateAvatarImageCredits(price, { modelId, aspect, referenceCount: referenceCount + 1 });
}
```

Both files: remove the `priceFromCodeTables` usage and import from 2a-i, and add `import type { AiModelPrice } from "@/lib/ai-models/types";`.

- [ ] **Step 3: Their callers**

`src/hooks/use-visualise-model.ts`: add `import { useModelPrice } from "@/hooks/queries/ai-models";`, then as the first line of `useVisualiseModel`:

```ts
  const { price } = useModelPrice(modelId);
```

change the credits line to `credits.set(shot.id, estimatePanelCredits(price, i.references.length, aspect, modelId));` and add `price` to the `useMemo` dependency list.

`src/components/avatars/avatar-describe-panel.tsx`: add the `useModelPrice` import; replace the `perImage` line with:

```ts
  const { price } = useModelPrice(modelId);
  const perImage = estimateAvatarImageCredits(price, { modelId, aspect: AVATAR_FRONT_ASPECT, referenceCount: 0 });
```

`src/components/avatars/avatar-sheet-generate.tsx`: add the import; replace `const credits = estimateSheetCredits(modelId);` with:

```ts
  const { price } = useModelPrice(modelId);
  const credits = estimateSheetCredits(price, modelId);
```

`src/components/visualise/cast-slot-photo-maker.tsx`: add the import; as the first line of `CastSlotPhotoMaker` add `const { price } = useModelPrice(modelId);` and change line 51 to `estimateSheetCredits(price, modelId)`.

`src/components/visualise/cast-slot-ai-maker.tsx`: add the import; as the first line of `CastSlotAiMaker` add `const { price } = useModelPrice(modelId);`; change the two `estimateMakeCredits(modelId)` calls to `estimateMakeCredits(price, modelId)` and `estimateSheetCredits(modelId)` to `estimateSheetCredits(price, modelId)`.

Every one of these shows `AvatarCreditCost`, which already shows its spinner while the catalog loads (Task 1); their buttons are already disabled while `credits === null`.

- [ ] **Step 4: Check it**

Run: `npx vitest run src/lib/scripts src/lib/avatars src/components/avatars src/components/visualise src/hooks`
Expected: PASS (add the Task 1 mock to component tests that need it; `panel-tile.test.tsx` keeps passing because it passes `credits` directly).

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^\.next/\|image-generate/route.test.ts(56"`
Expected: no output. `grep -rn "priceFromCodeTables" src` prints only `src/lib/ai-models/price-seed.ts`.

In the browser: open an avatar's Studio (Look and Views steps) and a script's Visualise page; the credit labels show a spinner, then the same numbers as before.

- [ ] **Step 5: Commit**

Stage the files under **Files** by explicit path, then:

```bash
git commit -m "feat(credits): avatar and Visualise estimates priced from the catalog (D534)"
```

---

### Task 5: Delete the code price tables; 0078 becomes frozen history

**Files:**
- Delete: `src/lib/image-gen/estimate.ts`, `src/lib/ai-models/price-seed.ts`, `src/lib/image-gen/__tests__/estimate.test.ts`, `src/lib/video-gen/__tests__/cost.test.ts`, `src/lib/image-gen/__tests__/cost.test.ts`, `src/lib/ai-models/__tests__/price-seed.test.ts`, `src/lib/ai-models/__tests__/price-seed-migration.test.ts`, `src/lib/ai-models/__tests__/price-equivalence.test.ts`
- Modify: `src/lib/video-gen/cost.ts`, `src/lib/image-gen/cost.ts`, `src/lib/video-gen/provider-usage.ts`, `src/lib/ai-models/test-prices.ts`
- Modify tests: `src/lib/video-gen/__tests__/gemini-omni-registration.test.ts`, `kling-3-0-omni-registration.test.ts`, `seedance-registration.test.ts`, `provider-usage.test.ts`; `src/lib/generations/complete.test.ts`; `src/lib/avatars/__tests__/voice-preview.test.ts`; `src/lib/image-gen/__tests__/start-generation.test.ts`
- Create test: `src/lib/ai-models/__tests__/frozen-prices.test.ts`
- Modify: `supabase/migrations/0078_ai_model_prices_seed.sql` (header comment only)

**Interfaces:**
- Keeps: `isVideoAudioEnabled`, `asResolutionString` (video-gen/cost.ts); `aspectRatioToOpenAISize` (image-gen/cost.ts); `normalizeOmniUsage`, `normalizeSeedanceUsage`, `readVideoUsage` and the usage types (provider-usage.ts).
- `test-prices.ts` keeps `seededCatalog()` and `seededPrice(modelId, at?)`, now read from 0078.

- [ ] **Step 1: The frozen-price test (failing)**

`src/lib/ai-models/__tests__/frozen-prices.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { seededPrice, seededCatalog } from "../test-prices";
import { videoSecondsUsd, videoChargeUsd } from "../video-price";
import { imageEstimateUsd } from "../image-price";

// D534 — migration 0078 is frozen history: these are the prices it seeded, pinned.
describe("migration 0078's prices", () => {
  it("parses every row", () => {
    expect(seededCatalog().prices).toHaveLength(21);
  });
  it("video: per second", () => {
    expect(videoSecondsUsd(seededPrice("kling:kling-3-0"), 1, true, "720p")).toBeCloseTo(0.126, 10);
    expect(videoSecondsUsd(seededPrice("veo:veo-3.1-fast"), 1, false, "720p")).toBeCloseTo(0.1, 10);
    expect(videoSecondsUsd(seededPrice("gemini:gemini-omni-1.2-flash"), 1, false, "720p")).toBeCloseTo(0.069504, 10);
    expect(videoSecondsUsd(seededPrice("seedance:seedance-2-5"), 1, false, "720p")).toBeCloseTo(0.231, 10);
  });
  it("Omni 1.1 bills at 1.2 rates from 3 Dec", () => {
    expect(videoSecondsUsd(seededPrice("gemini:gemini-omni-1.1-flash", new Date("2026-11-22")), 1, false, "720p")).toBeCloseTo(0.10136, 10);
    expect(videoSecondsUsd(seededPrice("gemini:gemini-omni-1.1-flash", new Date("2026-12-04")), 1, false, "720p")).toBeCloseTo(0.069504, 10);
  });
  it("video: provider usage", () => {
    const usage = { kind: "omni" as const, inputTokens: 4718, videoOutputTokens: 11586, textOutputTokens: 0, thoughtTokens: 113 };
    expect(videoChargeUsd(seededPrice("gemini:gemini-omni-1.1-flash"), { usage, durationSeconds: 6, audioEnabled: false, resolution: "360p" })!.usd)
      .toBeCloseTo((4718 * 1.5 + 11586 * 17.5 + 113 * 9) / 1e6, 10);
  });
  it("image: estimates", () => {
    expect(imageEstimateUsd(seededPrice("openai:gpt-image-2"), { modelId: "openai:gpt-image-2", quality: "medium", aspectRatio: "1:1", referenceCount: 0 }))
      .toBeCloseTo(0.053 + (190 * 5) / 1e6, 10);
    expect(imageEstimateUsd(seededPrice("gemini:gemini-nano-banana-2.1"), { modelId: "gemini:gemini-nano-banana-2.1", imageSize: "1K", referenceCount: 0 }))
      .toBeCloseTo(0.0336 + (180 * 1.5) / 1e6 + (1000 * 7.5) / 1e6, 10);
    expect(imageEstimateUsd(seededPrice("seedream:seedream-5-0-pro"), { modelId: "seedream:seedream-5-0-pro", imageSize: "2K", referenceCount: 3 }))
      .toBeCloseTo(0.096, 10);
  });
});
```

Change `src/lib/ai-models/test-prices.ts` to read the rows from the migration instead of the builder:

```ts
// D534 — the price rows migration 0078 seeded (frozen history), for tests anywhere in the app.
// Not imported by app code.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEED_JSON_TAG } from "./seed";
import { parseAiModelPriceRow } from "./schema";
import { currentPrice } from "./pricing";
import type { AiCatalog, AiModelPrice } from "./types";

let catalog: AiCatalog | null = null;

export function seededCatalog(): AiCatalog {
  if (catalog) return catalog;
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/0078_ai_model_prices_seed.sql"), "utf8");
  const rows = JSON.parse(sql.slice(sql.indexOf(SEED_JSON_TAG) + SEED_JSON_TAG.length, sql.lastIndexOf(SEED_JSON_TAG))) as
    Array<{ model_id: string; effective_from: string }>;
  const prices = rows.map((row) => {
    const price = parseAiModelPriceRow({ id: `${row.model_id}@${row.effective_from}`, ...row });
    if (!price) throw new Error(`0078 row for ${row.model_id} fails the catalog's check`);
    return price;
  });
  catalog = { models: [], prices };
  return catalog;
}

export function seededPrice(modelId: string, at: Date = new Date("2026-11-22T00:00:00Z")): AiModelPrice {
  const price = currentPrice(seededCatalog(), modelId, at);
  if (!price) throw new Error(`No seeded price for ${modelId}`);
  return price;
}
```

Run: `npx vitest run src/lib/ai-models/__tests__/frozen-prices.test.ts`
Expected: PASS (it pins what 2a-i seeded; it is the guard for the deletions below, which must keep it passing).

- [ ] **Step 2: Delete the tables and what was built on them**

1. `git rm src/lib/image-gen/estimate.ts src/lib/ai-models/price-seed.ts src/lib/image-gen/__tests__/estimate.test.ts src/lib/video-gen/__tests__/cost.test.ts src/lib/image-gen/__tests__/cost.test.ts src/lib/ai-models/__tests__/price-seed.test.ts src/lib/ai-models/__tests__/price-seed-migration.test.ts src/lib/ai-models/__tests__/price-equivalence.test.ts`
2. `src/lib/video-gen/cost.ts`: keep only `isVideoAudioEnabled` and `asResolutionString` (with their comments). Delete `VIDEO_MODEL_PRICING`, `OMNI_OUTPUT_TOKENS_PER_SECOND`, `OMNI_11_VIDEO_OUT_PER_M`, `OMNI_12_VIDEO_OUT_PER_M`, `omniRates`, `OMNI_11_REROUTE_AT`, `pricedVideoModelId`, `RESOLUTION_ONLY_PRICING`, `KLING_RESOLUTION_PRICING`, `computeVideoCost`, and the `USD_TO_INR` import. Add at the top: `// D534 — video prices live in ai_model_prices; this file keeps the two param readers.`
3. `src/lib/image-gen/cost.ts`: keep only `ASPECT_RATIO_TO_OPENAI_SIZE` and `aspectRatioToOpenAISize`. Delete every pricing table and function, and the `USD_TO_INR` / `ImageTokenUsage` imports. Add at the top: `// D534 — image prices live in ai_model_prices; this file keeps the OpenAI size mapping.`
4. `src/lib/video-gen/provider-usage.ts`: keep the types, `isCount`, `normalizeOmniUsage`, `normalizeSeedanceUsage`, `readVideoUsage`. Delete `OMNI_INPUT_PER_M`, `OMNI_TEXT_AND_THINKING_OUT_PER_M`, `OMNI_VIDEO_OUT_PER_M`, `SEEDANCE_PER_M`, `OMNI_TOKENS_PER_INPUT_IMAGE`, `OMNI_THINKING_ALLOWANCE_TOKENS`, `computeVideoCostFromUsage`, `omniEstimateExtrasUsd`, `estimateVideoCostUsd`, and the imports from `./cost` and `@/lib/pricing`. In `src/lib/video-gen/__tests__/provider-usage.test.ts` delete the `computeVideoCostFromUsage`, `estimateVideoCostUsd` and `omniEstimateExtrasUsd` describe blocks and their imports; keep the normaliser and `readVideoUsage` tests.
5. In `supabase/migrations/0078_ai_model_prices_seed.sql`, replace the two comment lines after the first with `-- Frozen history (D534): the code tables it was generated from were deleted in Plan 2a-ii.`

- [ ] **Step 3: Move the remaining tests onto the seeded rows**

Apply this mapping in every test file listed under **Files** (each replacement keeps the test's expected value):

| Before | After |
|---|---|
| `computeVideoCost(id, d, audio, res, at)?.usd` / `!.usd` | `videoSecondsUsd(seededPrice(id, at), d, audio, res)` (omit `at` → default 2026-11-22) |
| `computeVideoCost(id, d, audio, "8k")` expecting null | `videoSecondsUsd(seededPrice(id), d, audio, "8k")` expecting null |
| `computeVideoCostFromUsage(id, usage, res, at)!.usd` | `videoChargeUsd(seededPrice(id, at), { usage, durationSeconds: 0, audioEnabled: false, resolution: res })!.usd` |
| `computeImageCost(id, tokens)!.usd` | `imageChargeUsd(seededPrice(id), { tokens, billedImages: null })!.usd` |
| `estimateImageGenerationCostUsd({ modelId, quality, aspectRatio, imageSize, referenceUrls })` | `imageEstimateUsd(seededPrice(modelId), { modelId, quality, aspectRatio, imageSize, referenceCount: referenceUrls.length })` |
| `pricedVideoModelId(OMNI_11, BEFORE)` → OMNI_11 / `(OMNI_11, OMNI_11_REROUTE_AT)` → OMNI_12 | `expect(seededPrice(OMNI_11, OMNI_11_REROUTE_AT).lines).toEqual(seededPrice(OMNI_12).lines)` and `expect(seededPrice(OMNI_11, BEFORE).lines).not.toEqual(seededPrice(OMNI_12).lines)` |

with imports from `@/lib/ai-models/test-prices`, `@/lib/ai-models/video-price` and `@/lib/ai-models/image-price`. Remove `pricedVideoModelId("kling:kling-3-0-omni", …)` (Kling has a single row; nothing replaces it).

- [ ] **Step 4: Nothing left reads a table**

Run: `grep -rn "computeVideoCost\|computeImageCost\|estimateImageGenerationCostUsd\|estimateVideoCostUsd\|omniEstimateExtrasUsd\|computeVideoCostFromUsage\|estimateImageOutputCost\|seedreamImageCostUsd\|seedreamReferenceCostUsd\|pricedVideoModelId\|OMNI_11_REROUTE_AT\|priceFromCodeTables\|priceRowsFromCodeTables" src trigger`
Expected: no output.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^\.next/\|image-generate/route.test.ts(56"`
Expected: no output.

Run: `npx vitest run src/lib src/components src/hooks src/app/api/nodes src/app/api/clients`
Expected: PASS, except the two pre-existing "refuses a deprecated model before anything starts (D467)" failures (unchanged message). Any other failure that passes alone is a known timeout flake; re-run that file alone to confirm.

- [ ] **Step 5: Commit**

Stage the deletions (`git rm` already staged them) and every modified file by explicit path, then:

```bash
git commit -m "refactor(credits): delete the code price tables; prices come only from ai_model_prices (D534)"
```

---

## After 2a-ii

Every video and image price is a row in `ai_model_prices`; changing one is a new dated row (Plan 4 gives it an admin screen). Plan 2b brings dub, lip sync, voice change, transcribe, prompts and the Kling, fal, Sarvam and ElevenLabs bills onto the same rows.
