# OpenAI Image-Gen Error Remediation — Design

## Problem

35 `generations` rows (`type='image'`, `model_used ilike 'openai:%'`, `status='failed'`) across
staging (14) and prod (21), 2026-07-07 through 2026-07-23, pulled directly from each
environment's Supabase project (`generations.error`). They fall into three causes:

1. **"Invalid image file or mode for image N, please check your image file."** — 27 of 35.
   `gpt-image-1`, `gpt-image-1-mini`, `gpt-image-2`, both envs, hitting different reference-image
   slots in multi-reference edit requests.
2. **"Transparent background is not supported for this model."** — 3 of 35. `gpt-image-2`, both
   envs, 2026-07-08.
3. **OpenAI safety-system (moderation) rejection** — 2 of 35, staging only, 2026-07-23. Legitimate
   provider-side content rejection, not an app bug.

A fourth, unrelated issue was raised alongside these: the video-gen focus view's `lastError`
banner (`video-gen-focus-view.tsx:824-828`) is a plain `<p>` with no width constraint, so a long
provider error string (observed: a Gemini/Veo 429 prepayment-credits message) stretches the
header layout instead of wrapping or truncating.

## Evidence

### Cause 1 — reference-image mode/format errors

Fetched the actual failing reference images from prod GCS storage (via the `generations` rows'
`inputs_snapshot`) and decoded them with `sharp` (already a project dependency, already used in
this route for metadata probing). Findings:

- All fetched bytes decode cleanly — valid sRGB JPEG/PNG, correct `content-type` headers, no
  decode errors, no CMYK/palette/unusual color modes. **The files are not corrupted or
  mismatched-format** — ruling out the initial hypothesis that `urlToFile()`'s content-type-based
  extension guessing was the cause.
- The specific image OpenAI names in each error is consistently **not a multiple of 16px** in
  width or height (observed: 3053×3055, 2888×3835 — neither dimension divisible by 16).

`src/lib/image-gen/providers/openai.ts` already encodes `minDimensionMultiple: 16` per model
(`openai.ts:172,185,198`), and `src/lib/image-gen/validate.ts` (Rule 5) is supposed to reject such
images before they ever reach OpenAI. It doesn't, here, because:

- Rules 3–5 (max edge, aspect ratio, multiple-of-16) in `validateReferenceImages` are skipped
  entirely per-image whenever `imageWidth`/`imageHeight` is `undefined` (`validate.ts:75`).
- Those dimensions are only backfilled in `src/app/api/nodes/[id]/image-generate/route.ts:200-238`
  when the reference URL matches a node found in the `upstream` array. Multi-reference edits
  (up to 16 images, assembled via `assembleEditReferences`) don't reliably satisfy that match, so
  the backfill — and therefore the validation — silently no-ops for some fraction of references.

Net effect: validation is a leaky gate, not a guarantee, and the images that leak through fail at
OpenAI with a message that gives the user no actionable path (which reference image, or why).

### Cause 2 — transparent background

Pulled `params_snapshot` for one of the 3 failures directly:

```json
{ "quality": "medium", "background": "transparent", "aspect_ratio": "1:1",
  "output_format": "jpeg", "output_compression": 80 }
```

`background: "transparent"` with `output_format: "jpeg"` — JPEG has no alpha channel, so OpenAI
rejects the combination. `gptImage2Params`/`gptImage1Params` (`src/lib/image-gen/params/openai.ts`)
expose both fields independently with no cross-field constraint.

### Cause 3 — safety rejections

No app-side bug. Left as-is; benefits incidentally from the error-display fix below (the message
becomes readable/copyable instead of raw/overflowing).

## Scope

**In scope:**
- Server-side reference-image normalization for all three OpenAI image models, replacing the
  currently-leaky aspect-ratio/max-edge/multiple-of-16 blocking checks.
- Auto-correcting the transparent-background × jpeg combination.
- A reusable error-display component fixing the video-gen layout bug, extended to
  image-gen, prompt, and video-prompt focus views (the four generate-capable node types with
  provider round-trips today).

**Out of scope:**
- OpenAI safety/moderation rejections — no code changes; not a bug.
- `draw-focus-view`, `file-focus-view`, `script-focus-view` — upload/extraction flows, not
  provider generation calls; keep toast-only unless a later pass wants them included.
- Per-image size (50MB) and Gemini's aggregate reference-size cap (Rules 1–2 in `validate.ts`) —
  stay as hard blocks; no resize fixes an outright-too-large file.
- Any change to Gemini's own reference-image validation — this pass is OpenAI-only.

## 1. Reference-image normalization (backend)

New pure function, `normalizeReferenceImageForOpenAI(buffer: Buffer): Promise<Buffer>` in
`src/lib/image-gen/providers/openai.ts`, built on `sharp`:

1. Decode the input buffer.
2. If `max(width,height) / min(width,height) > 3.0` → **center-crop** the long side down to
   `short × 3` (crop, not pad — keeps the subject, matches how these are used as edit/reference
   material rather than final framed output).
3. If the longest edge exceeds `3840`px (the shared `maxImageEdgePx` for all three OpenAI models)
   → proportional downscale to fit.
4. Round the (possibly already-adjusted) width and height **down** to the nearest multiple of 16,
   floored at 16 (guards tiny references — e.g. a 10px-tall crop — from rounding to 0) →
   `extract`/`resize` to that box.
5. Re-encode (PNG if the source had alpha, otherwise match source format) and return the buffer.

Steps run in that order because each can change the dimensions the next step reasons about — crop
first (biggest structural change), then downscale, then round, so the final box is guaranteed to
satisfy all three constraints simultaneously.

Called from `urlToFile()` (`openai.ts:24-31`) between fetching the bytes and constructing the
`File` — so it runs unconditionally for every reference image passed to `images.edit`, regardless
of whether pre-flight metadata was ever known. This is what makes it un-bypassable in the way
today's `validate.ts` gate is: it doesn't depend on `imageWidth`/`imageHeight` being populated on
some upstream node record.

`validate.ts` Rules 3–5 (aspect ratio, max edge, multiple-of-16) are **removed** from
`validateReferenceImages` — they no longer serve a blocking purpose once the backend guarantees
compliance, and leaving them in place as a sometimes-fires-sometimes-doesn't gate is worse than
not having them (confusing, inconsistent UX). Rules 1–2 (size caps) are unaffected.

## 2. Transparent background × jpeg (backend)

In `generateWithOpenAI` (`openai.ts`), before building `sharedParams`: if
`p.background === "transparent" && p.output_format === "jpeg"`, override `output_format` to
`"png"`. Silent correction, no frontend change — consistent with the normalization approach above
(fix server-side rather than block or ask).

## 3. Shared error-display component (frontend)

New `src/components/nodes/generation-error-badge.tsx`:

- Props: `{ error: string | null | undefined }`. Renders nothing when `error` is falsy.
- Otherwise renders a small, fixed-layout pill: `AlertCircle` icon (Lucide, 1.5 stroke,
  `text-destructive`) + "Last generation failed" — never grows with message length, never breaks
  the surrounding flex layout.
- Click opens a shadcn `Popover` (not `Tooltip` — a tooltip closes on interaction, and the content
  needs a clickable copy button) containing the full error text (wrapped, scrollable if very
  long) and a copy button matching the existing icon+checkmark pattern in
  `src/components/nodes/file-llm-prompt-panel.tsx` (`Copy`/`Check` from `lucide-react`,
  `navigator.clipboard.writeText`, 2s "copied" state reset).

Wiring, one node type at a time:

- **`video-gen-focus-view.tsx`** — already has persistent `lastError` via
  `useVideoGenStatus`/Zustand (`video-gen-focus-view.tsx:378`). Replace the broken
  `<p className="text-xs text-destructive">` block (lines 824-828) with
  `<GenerationErrorBadge error={lastError} />`. No state-management change.
- **`image-gen-focus-view.tsx`, `prompt-focus-view.tsx`, `video-prompt-focus-view.tsx`** — none
  currently persist errors past the transient `toast.error(...)` call. Add local
  `const [lastError, setLastError] = useState<string | null>(null)`; set it in the same catch
  blocks that already call `toast.error` for a generate/edit attempt (toast stays, for the
  immediate signal); clear it at the start of the next attempt; render the badge in each view's
  header area, in the same position `video-gen-focus-view` uses.

## File map

| Action | Path |
|---|---|
| Modify | `src/lib/image-gen/providers/openai.ts` — add `normalizeReferenceImageForOpenAI`, call from `urlToFile`; add transparent+jpeg override in `generateWithOpenAI` |
| Modify | `src/lib/image-gen/validate.ts` — remove Rules 3–5 (aspect ratio, max edge, multiple-of-16) |
| Modify | `src/lib/image-gen/__tests__/validate.test.ts` — drop tests for removed rules |
| New | `src/lib/image-gen/__tests__/openai-normalize.test.ts` — crop/downscale/round-to-16 math, transparent+jpeg override |
| New | `src/components/nodes/generation-error-badge.tsx` |
| Modify | `src/components/nodes/video-gen-focus-view.tsx` — swap broken `<p>` for the badge |
| Modify | `src/components/nodes/image-gen-focus-view.tsx` — add `lastError` state + badge |
| Modify | `src/components/nodes/prompt-focus-view.tsx` — add `lastError` state + badge |
| Modify | `src/components/nodes/video-prompt-focus-view.tsx` — add `lastError` state + badge |

## Testing

Pure-function vitest coverage, matching this repo's existing style (no component-test harness
exists — `validate.test.ts`, `cost.test.ts`, `registry.test.ts` are all logic-only):

- `normalizeReferenceImageForOpenAI`: aspect ratio > 3:1 gets center-cropped to exactly 3:1;
  images already within all three constraints pass through unchanged (byte-for-byte dimensions,
  re-encoded); an image exceeding both aspect ratio and max-edge gets both corrections applied in
  the right order; final output width/height always divisible by 16; a reference smaller than
  16px in either dimension floors to 16 rather than rounding to 0.
- `generateWithOpenAI`: `background: "transparent"` + `output_format: "jpeg"` results in a
  `output_format: "png"` request to the (mocked) OpenAI client; every other combination passes
  `output_format` through unchanged.
