# Seedream 5.0 Lite and Pro as image models — design

**Status:** implemented 2026-09-28 · **ADR:** D285 (D275 was taken by the time this shipped)

**Implementation note:** the resolution param is named `image_size`, not `resolution` as
written below, so the shared estimate path (`estimate.ts`, which reads `image_size` for every
non-OpenAI model) prices it without a special case.

**Sources (vendored in `ref/byteplus-docs/`):** `Image generation API.md`,
`Image generation tutorial.md`, `Seedream 5.0 pro and Lite tutorial.md`,
`Seedream 4.0-4.5 prompt guide.md`, `seedance_2.5_PRICING.md` (image rows).

## Goal

Two new image-gen models the operator can pick beside OpenAI and Gemini: **Seedream 5.0 Lite**
and **Seedream 5.0 Pro**, on BytePlus ModelArk. Generate and Edit both work; the picker shows a
"Seedream" group; cost estimates and real charges are exact.

## Decisions

1. **A direct Ark client, not the OpenAI SDK.** Ark's endpoint is OpenAI-shaped, but our OpenAI
   provider carries `sharp` and mask handling that do not apply. A small `fetch` client in
   `src/lib/image-gen/providers/seedream.ts` mirrors `video-gen/providers/seedance.ts` (same
   host `https://ark.ap-southeast.bytepluses.com/api/v3`, same `BYTEPLUS_API_KEY` Bearer).
   Synchronous: `POST /images/generations`, no polling.
2. **Explicit pixel size, from the vendor's table.** The API offers a resolution level with the
   aspect ratio "described in the prompt" (the tutorial's recommended method) or an explicit
   `WxH`. We send `WxH` from the vendor's published mapping so a 9:16 reel is 9:16 whatever the
   prompt says; the pixel values are the ones the model would choose for that ratio, so the
   output is identical. The table is data in `params/seedream.ts`, tested.
3. **Per-image cost comes from the provider.** Seedream bills per image (Pro by output pixels,
   plus per extra reference), not per token. `ImageGenResult` gains optional `costUsd`; the
   generate route prefers it over `computeImageCost`'s token formula when present. Pre-generation
   estimates get a Seedream branch in `estimateImageOutputCost` / the input estimate.
4. **Edit works as on Gemini.** Prompt-based region targeting (D38), `supportsMask: false`.
   Pro's `<bbox>` interactive editing and layer decomposition are out of scope (a follow-up could
   derive a `<bbox>` from our paint mask).
5. **No prompt-writer change** (operator's call). The Seedream prompt guide's rules are compatible
   with what the shared writer already produces; nothing is routed per model.
6. **Watermark off, PNG, base64.** `watermark: false` (the default stamps "AI-generated" on the
   image), `output_format: "png"`, `response_format: "b64_json"` (bytes straight to our storage,
   not the 24-hour URL). Lite sends `sequential_image_generation: "disabled"` (Pro rejects the
   field). One image per call.

## Models

| | id | Ark model | Resolutions | Refs | Output price |
|---|---|---|---|---|---|
| Seedream 5.0 Lite | `seedream:seedream-5-0-lite` | `seedream-5-0-lite-260128` | 2K (default), 3K, 4K | ≤ 14 | $0.035 / image |
| Seedream 5.0 Pro | `seedream:seedream-5-0-pro` | `dola-seedream-5-0-pro-260628` | 1K, 1.5K, 2K (default) | ≤ 10 | $0.045 (≤ 1.5K) · $0.09 (2K); + $0.003 per reference after the first |

Shared: `provider: "seedream"`, `providerLabel: "Seedream"`, `maxReferenceSizeBytes: 30 MB`,
`maxAspectRatio: 16`, `supportsMask: false`. `ImageProvider` gains `"seedream"`. Registry group
`{ provider: "seedream", label: "Seedream" }` after Gemini; `DEFAULT_MODEL_ID` unchanged.

## Params (`src/lib/image-gen/params/seedream.ts`)

- `aspect_ratio` — select, primary: `1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 21:9`, default `9:16`
  (the app makes reels; matches the other image models' default).
- `resolution` — select, primary: Lite `2K | 3K | 4K` (default `2K`); Pro `1K | 1.5K | 2K`
  (default `2K`). Pro's description notes 1.5K costs the same as 1K.
- `seedreamSize(resolution, aspectRatio): string` returns the vendor's `WxH` (e.g. Lite 2K 9:16 →
  `1600x2848`; Pro 2K 9:16 → `1584x2816`). Unknown combinations throw — the select options are
  the table's keys, so that is a programmer error, not an operator one.

## Provider (`src/lib/image-gen/providers/seedream.ts`)

- `buildSeedreamRequest(arkModel, input)` (pure, exported for tests): `{ model, prompt, image?
  (string for one ref, string[] for several, omitted for none), size, output_format: "png",
  response_format: "b64_json", watermark: false, sequential_image_generation: "disabled" (Lite
  only) }`.
- `generateWithSeedream(arkModel, input)`: POST; non-2xx → `Error` with Ark's `error.message`
  (verbatim, as Seedance does); `data[0].error` → that message; no `b64_json` → "Seedream returned
  no image". Returns `{ imageBase64, mimeType: "image/png", tokensUsed, costUsd }` — `tokensUsed`
  maps `usage.output_tokens` / `total_tokens` (zeros when absent), `costUsd` from the pricing
  table by model, chosen resolution and reference count.
- `input.maskBase64` is ignored (as Gemini).

## Cost (`src/lib/image-gen/cost.ts`)

- `SEEDREAM_IMAGE_ESTIMATE_TABLE`: Lite `{2K,3K,4K: 0.035}`; Pro `{1K: 0.045, 1.5K: 0.045,
  2K: 0.09}`. `estimateImageOutputCost` reads it by `resolution` (the `size` argument callers
  already pass is the resolution param value for these models).
- `seedreamReferenceCostUsd(modelId, referenceCount)`: Pro `max(0, n − 1) × 0.003`, Lite 0. Added
  to the pre-generation input estimate.
- Route: `const costUsd = result.costUsd ?? computeImageCost(modelId, result.tokensUsed)?.usd`.

## Reference validation

Existing generic fields cover it: `maxReferenceImages`, `maxReferenceSizeBytes` (30 MB),
`maxAspectRatio` (16). The 36-megapixel ceiling and 14-px floor are not enforced client-side
(no existing field; Ark rejects with a readable message).

## Errors and env

- Missing `BYTEPLUS_API_KEY` → the same "Missing BYTEPLUS_API_KEY" error Seedance raises.
- Both models must be **activated** on the BytePlus console before first use (Ark returns a
  model-not-activated error otherwise) — noted in `docs/api-routes.md`'s env section.

## Testing

- `params/seedream` — options match the table's keys; `seedreamSize` for every (resolution, ratio)
  pair equals the doc table; default 9:16.
- `providers/seedream` — request body per model (Lite has `sequential_image_generation`, Pro
  does not; one ref → string, many → array, none → absent; watermark false; png; b64); response
  parsing: success, `error.message`, `data[0].error`, no image; `costUsd` per model/resolution/refs
  (mocked `fetch`).
- `cost` — estimate table, reference cost, and the route's `costUsd` preference.
- `registry` — both ids present, group order, client map serialisable (no `generate`).

## Out of scope

Batch / sequential output, streaming, layer decomposition, `<bbox>` interactive editing,
`optimize_prompt_options`, transparent background, a Seedream-specific prompt writer.
