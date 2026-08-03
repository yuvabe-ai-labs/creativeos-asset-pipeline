# Image Generation — Static Input-Token Estimate (Replacing the Live Pre-Flight Call)

**Date:** 2026-08-03
**Companion to:** `2026-07-24-credit-system-design.md`, `2026-07-24-credit-system-pricing-sources.md`
§5 (which originally justified the live call this doc now replaces).

---

## 1. Problem

`estimateImageGenerationCostUsd` (`src/lib/image-gen/estimate.ts`) is called on every
debounced param change in the image-gen focus view (300ms debounce,
`image-gen-focus-view.tsx:353,516`). Output cost is already a static lookup
(`OPENAI_IMAGE_ESTIMATE_TABLE` / `GEMINI_IMAGE_ESTIMATE_TABLE` in `cost.ts`) — **not** the
latency source. The actual live network call on every param tweak is **input-token
counting**: `countOpenAIInputTokens` (OpenAI's official `responses.inputTokens.count`) and
`countGeminiInputTokens` (Gemini's official `countTokens`), both in
`src/lib/image-gen/providers/{openai,gemini}.ts`. Each is a real vendor API round-trip, which
is what makes the "Est. N credits" label feel laggy.

Goal: replace both live calls with a synchronous, derived approximation — good enough for a
pre-generation estimate (already labeled as an estimate in the UI, never used for real
billing — `succeedGeneration` always settles against the real provider `usage` returned at
generation time).

---

## 2. Data used

Historical real (non-test-client) image generations, pulled from `node_versions.params_used.
tokensUsed` — the legacy pre-credits-refactor field (see commit `9ee2933`), which has much
longer history than the new `generations.tokens_used` column (which only started
populating 3 days before this analysis). Combined staging (260 rows, 2026-06-17 → 07-29) +
production (399 rows, 2026-06-17 → 07-31) = **659 real rows** across all 6 image models.

**Known data-quality caveat:** legacy `inputs_used.referenceImageUrls` wasn't always recorded
for edit-flow generations, so some historical rows bucketed as "0 references" actually had
references. This inflates the noise in `refs=0` buckets (particularly OpenAI, particularly at
higher quality/size) but does **not** affect the design: the live estimate route already
receives the true current reference count from the request body (`referenceUrls.length`) —
it never has to infer reference count from history. History is only used to fit the
per-reference *rate*, using rows where a reference count is unambiguous (`refs > 0` rows,
where under-detection is a non-issue since the true count can only be ≥ what was recorded).

---

## 3. Findings

**Gemini (all 4 model variants, pooled — the fit is model-independent):**
`image_input_tokens` is always 0 (Gemini folds image input into the combined prompt-token
count). `text_input_tokens` fits `~180 base + ~258 tokens/reference` cleanly from 0 to 14
references (r² effectively ~1 — e.g. 14 refs → 3776 tokens, (3776−180)/14 ≈ 257).
This independently matches Google's own published formula, already noted (but not used) in
`2026-07-24-credit-system-pricing-sources.md` §5: "≤384px = 258 tokens; larger images tile
into 768×768 sections, 258 tokens each."

| refs | n | median | p90 |
|---|---|---|---|
| 1 | 56 | 426 | 454 |
| 2 | 33 | 683 | 692 |
| 3 | 14 | 942 | 948 |
| 4 | 14 | 1201 | 1222 |
| 6 | 8 | 1744 | 1763 |
| 14 | 3 | 3776 | 3776 |

**OpenAI (per model, canonical pixel size — normalizing legacy `"1024x1024"`-style values
against current `aspect_ratio` strings via the same `aspectRatioToOpenAISize` mapping
`cost.ts` already uses for output pricing):** once sizes are normalized, per-reference
`image_input_tokens` is *also* a stable constant — no meaningful dependence on size, only on
model tier:

| Model | per-ref median | per-ref p90 | n |
|---|---|---|---|
| `gpt-image-1` | 280–323 | 280–323 | 5 |
| `gpt-image-1-mini` | 258–291 | 323 | 30 |
| `gpt-image-2` | 1095–1419 | 1508–1536 | 73 |

`gpt-image-2` (the flagship model) tokenizes reference images at ~5× the rate of the other
two — consistent with it being a materially higher-fidelity model. `text_input_tokens`
(baseline, 0 references) is stable at ~165–190 across every model/quality/size combination —
dominated by fixed prompt/system overhead, not by the (typically short) actual prompt text in
this app.

---

## 4. Design

Replace `countOpenAIInputTokens`/`countGeminiInputTokens` with pure, synchronous functions.
Output-cost tables (`cost.ts`) are untouched — they're already static and already correct.

```
estimateGeminiInputTokens(refCount: number): number {
  return 180 + refCount * 260;   // base + per-ref, both rounded up from the fit above
}

estimateOpenAIInputTokens(modelId: string, refCount: number): number {
  const base = 190;              // flat across models/qualities/sizes (observed 165–190)
  if (refCount === 0) return base;
  const perRef = OPENAI_PER_REFERENCE_TOKENS[modelId]; // gpt-image-1/-mini: 330, gpt-image-2: 1550
  return base + refCount * perRef;
}
```

Constants are rounded **up** from the p90 (not median/mean) in every case, matching the
existing "never under-reserve" philosophy already in `cost.ts` (see the `"auto"` → `"high"`
comment on `estimateImageOutputCost`). `refCount` comes from the live request's
`referenceUrls.length` — exactly what the caller already has; no historical inference needed
at runtime.

`estimate.ts` calls these instead of `await countOpenAIInputTokens(...)` /
`await countGeminiInputTokens(...)`, making `estimateImageGenerationCostUsd` itself no longer
need to be `async` for the token-counting step (it may still be `async` overall depending on
what else the function does at implementation time). The 300ms debounce in
`image-gen-focus-view.tsx` (both the Generate-tab and Edit-tab effects) is dropped — the
estimate call is now synchronous, so there's nothing left to debounce against.

**Out of scope / unchanged:**
- Real settlement (`succeedGeneration`, `computeImageCost`) — always uses actual provider
  `usage`, never this estimate.
- Output-cost tables in `cost.ts`.

*(The `/api/nodes/[id]/image-generate/estimate` route itself did NOT stay unchanged — see §6,
D93. This section's original claim was wrong: it assumed the route's internals would change
but its existence wouldn't. In implementation, the route turned out to be deletable entirely.)*

**Recalibration:** the derivation script used for this analysis (staging + production,
`node_versions.params_used.tokensUsed`, real clients only) should be kept (or its logic
documented) so these constants can be recomputed later as real usage accumulates — same
spirit as §6 of the pricing-sources doc for prompt-generation estimates.

---

## 5. Testing

- Unit tests for `estimateGeminiInputTokens`/`estimateOpenAIInputTokens`: known refCounts →
  expected token counts, including `refCount = 0`.
- `estimate.ts`'s existing behavior (returns `null` when no priced entry exists) must be
  preserved — these functions never return `null`, only `estimateImageOutputCost` does.
- No live network call from any test — this was previously untestable without hitting real
  vendor APIs (worth checking whether existing tests around `estimate.ts` were skipping or
  mocking this; if mocked, those mocks can be deleted along with the live calls).

---

## 6. Follow-up correction: the estimate was still round-tripping our own server (D93)

After D92 shipped (live vendor token-counting call replaced with the static formulas above),
the "Est. N credits" label was still perceptibly slower than video-gen's equivalent — the
user caught this directly by comparing the two side by side. Root cause: `estimate.ts` was
rewired to be synchronous, but `image-gen-focus-view.tsx` still called it through a `fetch()`
to `/api/nodes/[id]/image-generate/estimate`, and that route is wrapped in `withNode`
(`src/lib/api/route-helpers.ts`), which does a real Supabase query (`nodes` joined to
`canvases`/`clients`) plus `resolveCallerContext()` on **every single call** — a real DB +
auth round trip, on every param change, regardless of how fast the estimate math itself is.

**video-gen never had this problem** because `video-gen-focus-view.tsx` calls
`computeVideoCost(...)` directly in the render body (`video-gen-focus-view.tsx:684`) — no
fetch, no route, no DB lookup. D92 made image-gen's math as cheap as video-gen's, but didn't
notice image-gen was paying a network+DB tax video-gen never paid at all.

**Fix:** match video-gen's pattern exactly.
- Moved `aspectRatioToOpenAISize` (and its `ASPECT_RATIO_TO_OPENAI_SIZE` map) from
  `providers/openai.ts` to `cost.ts` — the only reason `estimate.ts` needed
  `"server-only"` and couldn't be imported from a client component was this one function
  living in a file that also imports `sharp` and the OpenAI SDK (real server-only
  dependencies). `cost.ts` has never had a server-only dependency. `providers/openai.ts` now
  imports the function back from `cost.ts` and re-exports it, so its own use in
  `generateWithOpenAI` and the existing `aspect-ratio.test.ts` are both unaffected.
- Removed `import "server-only"` from `estimate.ts` — with the above move, it has zero
  remaining server-only dependencies.
- `image-gen-focus-view.tsx` now imports `estimateImageGenerationCostUsd` directly and calls
  it inside a `useMemo` (both the Generate-tab and Edit-tab estimates), exactly like
  video-gen's `computeVideoCost` call — no `fetch`, no loading state for the estimate itself.
  The Generate tab's `estimating` flag is repurposed to mean "the connected prompt node's
  content hasn't loaded yet" (a real, separate async dependency, fetched by an unrelated
  effect) rather than "waiting on the cost estimate." The Edit tab's `editEstimating` has no
  async dependency left at all and is now just `false`.
- Deleted `/api/nodes/[id]/image-generate/estimate/route.ts` entirely — with the client
  computing locally, nothing calls it anymore (confirmed via grep before deletion). This also
  means the real reservation route (`image-generate/route.ts`) is now the *only* server-side
  consumer of `estimateImageGenerationCostUsd`, unchanged from before.
- Build verified (`npm run build`) to confirm `sharp`/the OpenAI SDK do not end up in the
  client bundle via this path — a real risk given `image-gen-focus-view.tsx` is a
  `"use client"` component transitively reaching into `providers/openai.ts` territory before
  this fix.

**Corrected §4 claim:** the estimate route's "request/response shape is unchanged" statement
above was wrong in retrospect — the route doesn't exist anymore. Superseded by this section.
