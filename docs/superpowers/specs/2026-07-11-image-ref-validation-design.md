# Image reference validation — per-model size & dimension limits

**Date:** 2026-07-11
**Status:** Approved (pending review)
**Area:** Canvas → Image Gen node → focus view + API route

## Problem

When a user sends a reference image that exceeds a provider's size or dimension limits, the API
returns a raw `413` or cryptic provider error. That error surfaces as a generic toast
("Image generation failed") with no indication of which image is the problem or what the limit
is. The user has no way to self-serve the fix.

Additionally, the Gemini registry incorrectly stored `maxReferenceSizeBytes: 20 MB` (the old
inline data limit). Google raised this to **100 MB** and the semantics differ: Gemini enforces
an **aggregate** request limit, not a per-image limit.

## Goals

- Store `fileSizeBytes`, `imageWidth`, `imageHeight` on file/draw node data at upload time and
  on image-gen node versions after generation.
- Validate reference images against per-model limits **before** the API call (server-side) and
  **before** Generate is clicked (client-side).
- Show chip-level warnings on oversized reference images in the focus view.
- Disable the Generate button when any violation exists; show the reason inline.
- Return a structured `422` with a human-readable message from the server as a safety net.
- Fix the Gemini registry: correct limit value and correct aggregate semantics.

## Non-goals

- No dimension limits for Gemini (Google does not publish pixel constraints for image gen).
- No mask dimension validation (client-painted mask is always correct size by construction).
- No client-side validation before the focus view opens (images are GCS URLs — sizes are only
  known after metadata is stored on node data).
- No per-image dimension validation for the draw node's sketch output (always generated at a
  known safe size).

## Design

### A. Image metadata — new fields on node data

`FileNodeData` and `DrawNodeData` in `src/lib/canvas-nodes.ts` gain three optional fields:

```ts
fileSizeBytes?: number;   // raw byte count
imageWidth?: number;      // pixels
imageHeight?: number;     // pixels
```

These are populated at the two points where we already hold the buffer:

| Touch point | When | How |
|---|---|---|
| `POST /api/nodes/:id/file` (image upload) | On upload | `file.size` for bytes; `sharp(buffer).metadata()` for dimensions |
| `image-generate/route.ts` — after `uploadImageGen` | After gen | Buffer is in memory; same sharp call |

Draw node sketches go through the same `POST /api/nodes/:id/file` route (`draw-focus-view.tsx`
calls `fileNodeService.upload` which hits that endpoint) — no separate touch point needed.

For **existing files with no metadata** (already stored before this ships): the server fetches
the image buffer lazily inside the existing `urlToFile()` / `urlToInlineData()` helpers at
generation time, reads size + dimensions, then **backfills** the node data patch before
proceeding. This runs once per node until metadata exists.

The `upstream-images` API route (`GET /api/nodes/:id/upstream-images`) already returns node
data. It gains `fileSizeBytes`, `imageWidth`, `imageHeight` in its image shape so the focus
view can read them without extra fetches.

`ImageGenFocusViewProps.upstream` gains the same three fields:

```ts
upstream: Array<{
  id: string;
  type: string;
  fileUrl?: string;
  fileKind?: string;
  fileSizeBytes?: number;
  imageWidth?: number;
  imageHeight?: number;
}>;
```

---

### B. Model limit types — fix and extend the registry

`MediaGenModelSpec` (and `ClientModelSpec`) in `src/lib/image-gen/types.ts` gains four new
fields (`maxReferenceSizeBytes` already exists — its semantics are unchanged for OpenAI):

```ts
// existing — per-image limit (OpenAI); Gemini models will no longer set this
maxReferenceSizeBytes: number;

// new additions
maxTotalReferenceSizeBytes?: number;   // aggregate all images combined (Gemini)
maxImageEdgePx?: number;               // max pixels on either edge (OpenAI: 3840)
maxAspectRatio?: number;               // max long:short ratio (OpenAI: 3.0)
minDimensionMultiple?: number;         // both edges must be multiples of N (OpenAI: 16)
```

Registry values after fix:

| Model | per-image limit | aggregate limit | maxEdgePx | maxAspectRatio |
|---|---|---|---|---|
| `openai:gpt-image-2` | 50 MB | — | 3840 | 3.0 |
| `openai:gpt-image-1` | 50 MB | — | 3840 | 3.0 |
| `openai:gpt-image-1-mini` | 50 MB | — | 3840 | 3.0 |
| `gemini:*` (all 3) | — | **100 MB** | — | — |

---

### C. Validation logic — pure function

New file: `src/lib/image-gen/validate.ts`

```ts
export type RefImageMeta = {
  url: string;
  filename?: string;
  fileSizeBytes?: number;
  imageWidth?: number;
  imageHeight?: number;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; violations: ValidationViolation[] };

export type ValidationViolation = {
  url: string;
  filename?: string;
  message: string;   // human-readable, ready to show in UI
};

export function validateReferenceImages(
  images: RefImageMeta[],
  model: Pick<MediaGenModelSpec,
    'maxReferenceSizeBytes' | 'maxTotalReferenceSizeBytes' |
    'maxImageEdgePx' | 'maxAspectRatio' | 'minDimensionMultiple' |
    'label'
  >,
): ValidationResult
```

Rules applied in order:

1. **Per-image size** (`maxReferenceSizeBytes`) — fail each image individually
2. **Aggregate size** (`maxTotalReferenceSizeBytes`) — fail the set as a whole
3. **Max edge** (`maxImageEdgePx`) — fail each image individually
4. **Aspect ratio** (`maxAspectRatio`) — fail each image individually
5. **Dimension multiple** (`minDimensionMultiple`) — fail each image individually

Rules only run if the relevant limit is defined on the model. If metadata is absent (`fileSizeBytes` is `undefined`), that check is skipped for that image — the server-side net catches it.

---

### D. Server-side validation

In `image-generate/route.ts`, after resolving `referenceUrls` and **before** `insertGeneration()`:

1. Build `RefImageMeta[]` from upstream node data (sizes already on node data, or fetched + backfilled lazily).
2. Call `validateReferenceImages(metas, config)`.
3. On violation: join all violation messages into one string and return `apiError(message, 422)` immediately. No generation row created. All violations are surfaced at once so the user can fix them in one pass rather than hitting errors one at a time.

This is the safety net for any path that bypasses the client (API calls, future integrations).

---

### E. Client-side validation — focus view

**Reference image chips** (already rendered in the focus view's Edit tab) gain a warning state:

- If a chip's image has `fileSizeBytes` / `imageWidth` / `imageHeight` and violates the current
  model's limits, the chip shows a small amber `AlertTriangle` icon (Lucide, 1.5 stroke).
- Hovering/focusing the chip shows a tooltip with the specific violation message.

**Generate button** (both Generate and Edit paths):

- Disabled when `validateReferenceImages(upstreamMetas, model).ok === false`.
- An inline note below the button replaces the disabled state copy:
  `"Fix oversized images to generate."` — no separate toast.

The client runs `validateReferenceImages` synchronously on every render using the metadata
already present in `upstream` props — zero extra fetches, zero debounce needed.

**Gemini aggregate warning** — if the total combined size of all selected reference images
exceeds `maxTotalReferenceSizeBytes`, the warning appears on all chips (not just one) since
the problem is collective. The inline note reads:
`"N images total X MB — Gemini allows 100 MB combined."`

---

### F. Error message examples

| Violation | Message |
|---|---|
| Per-image too large | `"hero.png" is 62 MB — GPT Image 2 allows 50 MB per image.` |
| Aggregate too large | `3 reference images total 114 MB — Gemini allows 100 MB combined. Remove one or use smaller images.` |
| Edge too wide | `"sketch.png" is 4200 × 800 px — max edge is 3840 px for OpenAI models.` |
| Bad aspect ratio | `"photo.jpg" is 10:1 — OpenAI requires a max 3:1 ratio between sides.` |
| Dimension not multiple | `"ref.png" width 1025 px is not a multiple of 16 — resize to 1024 px.` |

---

### G. Components & files touched

| File | Change |
|---|---|
| `src/lib/canvas-nodes.ts` | Add `fileSizeBytes?`, `imageWidth?`, `imageHeight?` to `FileNodeData`, `DrawNodeData` |
| `src/lib/image-gen/types.ts` | Add `maxTotalReferenceSizeBytes?`, `maxImageEdgePx?`, `maxAspectRatio?`, `minDimensionMultiple?` to `MediaGenModelSpec` |
| `src/lib/image-gen/validate.ts` | New — pure validation function |
| `src/lib/image-gen/providers/openai.ts` | Add new limit fields to all 3 OpenAI model specs |
| `src/lib/image-gen/providers/gemini.ts` | Fix `maxReferenceSizeBytes` → `maxTotalReferenceSizeBytes: 100 MB` on all 3 Gemini specs |
| `src/lib/image-gen/client-models.ts` | Mirror the same registry fixes |
| `src/app/api/nodes/[id]/file/route.ts` | Read `file.size` + `sharp` dimensions; include in node data patch |
| `src/app/api/nodes/[id]/image-generate/route.ts` | Call `validateReferenceImages` before `insertGeneration`; backfill metadata lazily |
| `src/app/api/nodes/[id]/upstream-images/route.ts` | Return `fileSizeBytes`, `imageWidth`, `imageHeight` per image |
| `src/components/nodes/image-gen-focus-view.tsx` | Extend `upstream` prop type; add chip warnings; disable Generate on violations |

---

## Testing

- **Unit:** `src/lib/image-gen/validate.ts` — test each rule (per-image, aggregate, edge, aspect, multiple) with mock `RefImageMeta` arrays.
- **Server:** `POST /api/nodes/:id/image-generate` with an oversized reference URL returns `422` with a readable message; no `generations` row is created.
- **Manual:** Upload a >50 MB image to a File node → connect to Image Gen → open focus view → chip shows amber warning, Generate button disabled. Reduce image → warning clears, button re-enables.
- **Gemini aggregate:** Connect 2 images totalling >100 MB to a Gemini model node → both chips warn, Generate blocked.
- `npx tsc --noEmit` passes.

## Migration note

`maxReferenceSizeBytes` on Gemini models is replaced by `maxTotalReferenceSizeBytes`. The old
field is removed from Gemini specs (it was wrong anyway). OpenAI specs keep `maxReferenceSizeBytes`
(per-image semantics unchanged). Any consumer reading `maxReferenceSizeBytes` for display
purposes should fall back gracefully when the field is absent.
