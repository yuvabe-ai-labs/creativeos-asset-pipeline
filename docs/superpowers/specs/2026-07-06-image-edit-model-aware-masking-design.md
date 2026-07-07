# Image Edit — model-aware region control (mask vs text) — Design

**Date:** 2026-07-06
**Status:** Approved → to be planned. To be recorded as **ADR D38** in
`2026-05-30-creativeos-staging-roadmap.md` §7.
**Author:** Cyril + Claude
**Extends / corrects:** `2026-07-05-image-edit-mode-design.md` (ADR D37). D37 shipped
annotation as marks **burned into the base image** and listed "pixel masks" as a non-goal.
This design **reverses that**: the drawn region is carried in each model's *native* control
channel, and the burned-in composite is removed.
**Grounded in (verified 2026-07-06):**
- OpenAI image edit / mask: https://developers.openai.com/api/docs/guides/image-generation#edit-images
  — `images.edit` accepts a `mask` (PNG, alpha channel, same size as the base); masking is
  soft, prompt-guided guidance.
- Gemini image editing: https://ai.google.dev/gemini-api/docs/image-generation#2_inpainting_semantic_masking
  — **no mask parameter**; region targeting is "semantic masking" in natural-language text only.
  Latest models: `gemini-3-pro-image` (Nano Banana Pro) etc. — same text-only region model.

---

## 1. Problem

D37's annotation feature composites the user's drawn marks **into the base image pixels** and
sends that single image with a text clause asking the model to ignore the marks. Because image
models weight visible pixels over instructions, the opaque strokes are **sometimes reproduced
into the output** (observed: a black circle + hash marks rendered onto the edited photo).

Root cause: control information ("*where* to edit") is being carried in the content channel
(the image pixels). The fix is to carry it in each model's dedicated control channel instead.

The two supported providers differ:
- **OpenAI `gpt-image-*`** — supports a real **alpha mask** on `images.edit` (native inpainting).
- **Gemini (`gemini-*-image`, incl. `gemini-3-pro-image`)** — **no mask API**; region targeting
  is documented only via **text** ("change only the X; keep everything else the same").

## 2. Goals

- Eliminate the "marks reproduced in output" failure entirely by never putting marks in pixels.
- **Model-aware editing driven by the model selected in the UI**, via a capability flag:
  - **Mask-capable model** → the user **paints the region** to change; we send the **clean base
    image + an alpha mask** (native inpainting). No burned marks.
  - **Non-mask model** → the user **types the change** (no drawing); we send the clean base and
    a text instruction. No annotation image at all.
- **Retire the burned-in composite path entirely** — it is dead in every branch and is the bug.
- Reuse the existing D27/D37 edit pipeline (route, `config.generate`, upload, version log,
  attempts/eval UI). The change is the control channel, not the pipeline.

## 3. Non-goals

- **Auto-interpreting freehand marks** (dilating a thin line into a band, flood-filling a
  circled loop, tiny-mark→text fallback). v1 treats the *painted region* as the mask directly.
  These are deferred enhancements.
- **Drawing on non-mask (Gemini) models.** Gemini is type-only in v1. (A future "draw everywhere
  → compile drawing to a text location hint" is option B, explicitly deferred — see §10.)
- **Passing an annotated image as a reference to Gemini.** Rejected: reintroduces marks-in-pixels
  and is undocumented/unreliable (§10).
- **Bumping model versions.** Whatever model is selected in the UI is used. A `gemini-2.5 →
  gemini-3-pro-image` upgrade is a separate change.
- A new node type, second route, or schema migration.

## 4. Architecture — capability flag is the spine

Add `supportsMask?: boolean` to `MediaGenModelSpec`. OpenAI `gpt-image-*` specs set `true`;
Gemini specs leave it falsy. **All branching reads the *selected* model's flag** — never a
hard-coded `provider === "openai"`. New models opt in by setting the flag; no UI/route edits.

- `model.supportsMask` truthy → **paint-a-region (mask) editing**.
- falsy → **type-only (text) editing**.

## 5. UX by model (Edit tab, `image-gen-focus-view`)

**Mask model (e.g. OpenAI):**
- Show the paint canvas, repurposed as a **region painter**: a single **translucent, mask-like
  highlight** (drop the multi-color pen palette; keep brush + eraser + size slider).
- Copy: *"Paint over the area you want to change."*

**Non-mask model (e.g. Gemini):**
- **Hide the canvas.** Show the base image read-only + instruction field + intent chips +
  reference tiles, with a one-line hint: *"This model edits from your description — say what to
  change and where."*

**Switching model** mid-edit flips `supportsMask` → **clear any painted region**, so a mask
never leaks to a text-only model (and a stale mask never survives a switch back).

## 6. Mask generation (client) + direction verification

New `AnnotationHandle` method `toMaskBase64(): Promise<{ base64, mime } | null>` replacing
`toCompositeBase64`:
- Output a PNG **the same dimensions as the base** (the overlay buffer is already sized to the
  base's natural pixels, per D37).
- **Painted region → alpha 0 (editable); everywhere else → alpha 255 (preserved).**
- The base image is **never read or modified** — the mask is independent, so no marks can bleed
  into the output.

⚠️ **Verification checkpoint (first implementation step, before finalizing polarity):** OpenAI's
own docs do not state whether the *transparent* or *opaque* region is the one edited, and
third-party sources conflict ("transparent = edit" vs "white = fill"). Resolve empirically with
one throwaway `images.edit` call (half-transparent test mask; observe which half changes). Lock
the alpha polarity to the observed behavior. This also catches the known footgun where a
malformed mask silently regenerates the **whole** image.

## 7. Payload / route / provider changes

**`handleEdit` (client):** when `model.supportsMask && annotationRef.hasMarks()`, send
`{ masked: true, maskBase64, maskMime }` + the **clean base** (`baseVersionId` / `baseImageUrl`
exactly as today). **Remove** `annotated` / `annotatedBaseImageBase64` / `annotatedBaseImageMime`.

**Route (`/api/nodes/[id]/image-generate`):**
- Delete the "composite becomes `modelBaseUrl`" block (route.ts:108–127). Base stays the clean
  `resolvedBaseUrl`.
- When `masked`, upload the mask via `uploadImageGen`, and pass it into `config.generate`.
- Record `masked` + `maskUrl` in `inputsUsed` (replacing `annotated` / `annotatedBaseUrl`).

**Provider interface (`ImageGenInput`):** add optional `maskBase64` / `maskMime`.
- **OpenAI provider:** if present, build a `File` and pass it as `mask` to the existing
  `images.edit` call. Base is still `referenceUrls[0]`.
- **Gemini provider:** ignores the mask (guard defensively; it should never receive one).

**Prompt (`buildEditPrompt`):** remove `ANNOTATION_CLAUSE` (no marks exist anymore). For masked
edits, use region-preservation phrasing: *"Apply the change within the selected region and blend
it seamlessly; keep everything else unchanged."* Non-mask edits keep the intent templates as-is.

## 8. Data flow (masked edit)

```
User paints region on translucent overlay (base natural-pixel buffer)
  → toMaskBase64(): painted→alpha0, else→alpha255  (polarity per §6 verification)
  → POST { masked, maskBase64, maskMime, baseVersionId|baseImageUrl, instruction, intent, prompt, extraReferenceUrls }
Route: resolve clean base URL; upload mask → maskUrl; assemble referenceUrls=[cleanBase, ...extras]
  → config.generate({ prompt, referenceUrls, params, maskBase64, maskMime })
OpenAI provider: images.edit({ image:[base(,refs)], mask, prompt, ... }) → b64 output
Route: upload output; insertVersion(inputsUsed:{ masked:true, maskUrl, ... }); setActiveVersion
```

Non-mask (Gemini) edit is the current text path with no mask and no composite.

## 9. Testing (TDD)

Unit-first:
- `toMaskBase64` alpha polarity (painted vs unpainted → correct alpha), sizing = base dims.
- `editModeForModel(supportsMask)` pure selector → `"paint"` | `"type"`.
- `buildEditPrompt` masked variant (region clause present; no "don't include marks" clause).
- Route masked path: clean base preserved, mask uploaded, `masked`/`maskUrl` recorded; composite
  fields no longer accepted/used.
- OpenAI provider passes `mask` to `images.edit` (mocked SDK); Gemini provider ignores it.

Plus the manual **mask-direction verification** (§6) as the gating first step.

## 10. Verify-then-document edges & rejected alternatives

**Edges (flagged, not solved up front):**
1. **Mask + extra reference images together** (e.g. "add this product *here*"). OpenAI masking is
   principally single-base inpainting; mask + multiple images may interact oddly. v1 passes both;
   verify behavior and, if poor, document "mask constrains the region; references still influence."
2. **OpenAI mask footgun:** wrong format/alpha silently regenerates the whole image — caught by §6.

**Rejected:**
- **A. Keep the burned-in composite** — it is the bug; retired.
- **C. Gemini: clean base + annotated reference image** — reintroduces marks-in-pixels, is
  off-pattern for Gemini multi-image (built for distinct subjects), and undocumented. Rejected.
- **B. Gemini: draw → compile to text location hint** — good UX (draw everywhere) and robust, but
  more work (region→text now). **Deferred**, not rejected: fast-follow if type-only feels
  inconsistent in use.

## 11. ADR note

Record as **D38** in the staging roadmap §7: *"Image-edit region control is model-aware —
OpenAI via native alpha mask (paint the region, clean base), Gemini via text only; the D37
burned-in annotation composite is retired."* **Refines / partially reverses D37** (which made
pixel masks a non-goal and shipped the composite). **Why:** the composite reproduces marks into
output; native channels (mask / text) don't.
