# Veo Implementation Gaps — Audit vs Official Docs

**Source:** https://ai.google.dev/gemini-api/docs/video + SDK type reference  
**Date:** 2026-06-24

---

## Critical Bugs

### 1. Veo Fast incorrectly blocks reference images

**Current code:** `VEO_LITE_IMAGE_INPUTS` (shared by Lite and Fast) sets `maxReferenceImages: 0`.

**Docs:** Veo 3.1 Fast **does** support reference images (up to 3). Only Lite does not.

**Fix:** Create a separate `VEO_FAST_IMAGE_INPUTS` with `maxReferenceImages: 3`.

---

### 2. `referenceImages` not cleared when `lastFrame` (endFrame) is present

**Current code in `providers/veo.ts`:**
```typescript
const refUrls = startImage ? [] : (input.referenceUrls ?? []).slice(0, maxRefImages);
```

**Docs (SDK type reference, verbatim):** `referenceImages` property:
> *"The image, video, or last_frame field are not supported."*

So `referenceImages` is mutually exclusive with **both** `image` (startFrame) **and** `lastFrame` (endFrame). We correctly skip refs when startFrame is present, but not when endFrame is present.

**Fix:**
```typescript
const refUrls = (startImage || endImage) ? [] : (input.referenceUrls ?? []).slice(0, maxRefImages);
```

---

### 3. Veo Lite/Fast duration capped at 6s — all models support 8s

**Current params:** Lite/Fast offer `["4", "6"]`.

**Docs:** All three Veo 3.1 tiers (Lite, Fast, Quality) support `4s`, `6s`, `8s`. Lite only differs in that 8s + 1080p requires resolution to be set explicitly — but 8s at 720p is valid.

**Fix:** Change Lite/Fast options to `["4", "6", "8"]` (same as Quality).

---

## Missing Features

### 4. No `resolution` parameter

**Docs:** Valid values per model:

| Model | Valid resolutions |
|---|---|
| Veo 3.1 Quality & Fast | `"720p"` (default), `"1080p"` (8s only), `"4k"` (8s only) |
| Veo 3.1 Lite | `"720p"` (default), `"1080p"` (8s only) |

Currently we never set `resolution` in the config, so everything generates at 720p.

**Constraint from docs:** 1080p and 4K require `durationSeconds: 8`. When this param is added, the UI should enforce this or auto-set duration to 8 when resolution is upgraded.

---

### 5. No `seed` parameter

**Docs:** Supported by all Veo 3.1 models (Lite, Fast, Quality). Identical seed + unchanged inputs produces consistent results.

Currently not exposed in params or passed to the config.

---

### 6. No `negativePrompt` parameter

**Docs:** Available in `GenerateVideosConfig`. Describes what should **not** appear in the generated video.

---

### 7. No `enhancePrompt` parameter

**Docs:** Boolean. Controls whether the API rewrites/enhances the prompt before generation. Could be useful to expose as a toggle.

---

### 8. Duration must be 8s when using referenceImages, 1080p, or 4K — not enforced

**Docs constraint:** `durationSeconds` must be `8` when any of the following are used:
- `referenceImages` (any reference image)
- `resolution: "1080p"`
- `resolution: "4k"`

Currently nothing forces duration to 8 when these features are active. The API will likely reject the request.

---

## Things That Are Correct

| Claim | Status |
|---|---|
| `referenceImages` + `image` (startFrame) are incompatible | ✅ Correctly handled in code |
| Veo Lite does not support `referenceImages` | ✅ Correctly set `maxReferenceImages: 0` for Lite |
| Valid `durationSeconds` values are discrete: 4, 6, 8 | ✅ Fixed (was incorrectly using 5) |
| Correct model IDs with `-preview` suffix | ✅ Fixed |
| `image` (startFrame) is a top-level param, not in config | ✅ Correct |
| `lastFrame` (endFrame) goes in config | ✅ Correct |
| Images must be base64-encoded (`imageBytes`), not plain URLs | ✅ Fixed |
| `generateAudio` left out (always-on by default) | ✅ Safe — docs say audio is "always on" for all Veo 3.1 models |
| Veo Lite and Fast support start frame + end frame | ✅ Confirmed by docs |

---

## Priority Order for Fixes

1. **Bug:** Veo Fast reference images unblocked (1-line fix)
2. **Bug:** Clear `referenceImages` when endFrame is present (1-line fix)
3. **Bug:** Lite/Fast duration — add `"8"` option
4. **Feature:** `resolution` param (requires enforcing 8s constraint)
5. **Feature:** `seed` param
6. **Feature:** `negativePrompt` param
7. **Feature:** `enhancePrompt` param
8. **Enhancement:** Auto-set `durationSeconds: 8` when resolution is 1080p/4K or referenceImages are used
