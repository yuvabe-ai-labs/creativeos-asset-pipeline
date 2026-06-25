# Veo API Research Sources

---

## Official Documentation

| Resource | URL |
|---|---|
| Gemini API — Video Generation | https://ai.google.dev/gemini-api/docs/video |
| GenerateVideosConfig SDK Type Reference | https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateVideosConfig.html |
| Gemini API Model List | https://ai.google.dev/gemini-api/docs/models |

---

## Official SDK & GitHub

| Resource | URL | Summary |
|---|---|---|
| `googleapis/js-genai` Issues | https://github.com/googleapis/js-genai/issues | JS SDK issue tracker |
| `js-genai` Issue #1270 | https://github.com/googleapis/js-genai/issues/1270 | Feature request: allow HTTPS URLs for `image`, `lastFrame`, `referenceImages` (currently only base64 works) |
| `python-genai` Issue #1988 | https://github.com/googleapis/python-genai/issues/1988 | `referenceImages` SDK typing deadlock — `INVALID_ARGUMENT: Image field doesn't have a URI` |

---

## Google AI Developers Forum

| Thread | URL | Key Finding |
|---|---|---|
| Veo 3.1 Reference Images — "Docs Say Available, API Says Not Supported" | https://discuss.ai.google.dev/t/veo-3-1-reference-images-docs-say-available-api-says-not-supported/111853 | Community confirms `referenceImages` cannot coexist with `image` or `lastFrame`; Google employee did not contradict this |
| How to combine first/last frames with reference images | https://discuss.ai.google.dev/t/how-to-correctly-structure-object-if-using-first-and-last-frames-and-reference-images-for-veo-3-1-endpoint/111495 | Community showed only separate payloads — no combined payload exists |
| VEO 3.1 — Last Frame Parameter Not Supported | https://discuss.ai.google.dev/t/veo-3-1-last-frame-parameter-not-supported/107529 | `lastFrame` only works at `durationSeconds: 8`; fails at 4s with "use case not supported" |
| How to upload image for video generation | https://discuss.ai.google.dev/t/how-to-correctly-upload-image-and-use-it-to-generate-video/110452 | `image` is a top-level param (not inside config); only `imageBytes` or `gcsUri` accepted |
| Veo 3.1 API aspect ratio issue | https://discuss.ai.google.dev/t/veo-3-1-api-aspect-ratio-parameter/107902 | `referenceImages` + `9:16` aspect ratio has a known bug — returns "Unsupported output video aspect ratio ASPECT_RATIO_9_16" |

---

## Third-Party Blogs & Reviews

| Resource | URL | Summary |
|---|---|---|
| getimg.ai — Veo 3.1 Explained | https://getimg.ai/blog/google-veo-3-1-review | Overview of Veo 3.1 last-frame support and reference images |

---

## Key Constraints (with explanations)

### 1. `referenceImages` cannot be combined with `image` (startFrame) or `lastFrame` (endFrame)

**What it means:** The Veo API has three separate "modes" of image input. You can only use one mode per request:
- Mode A — Animate an image: send `image` (startFrame) → video of that image coming to life
- Mode B — Interpolation: send `image` + `lastFrame` → video that transitions from first to last frame
- Mode C — Reference-guided: send `referenceImages` → video influenced by the style/content of those images, no fixed start/end

You **cannot** mix modes. If you send `referenceImages` alongside `image` or `lastFrame`, the API rejects it.

**Source:** SDK type docs state it explicitly. Google forum user Vikas_Prasad confirmed empirically. No user has reported combining them successfully.

---

### 2. `lastFrame` (end frame) requires `durationSeconds: 8`

**What it means:** If you want to do interpolation (first frame → last frame), the video must be exactly 8 seconds. Shorter durations (4s, 6s) return an error: *"Your use case is currently not supported."*

This is NOT documented on the main docs page — it was discovered empirically by community users.

**Source:** Google AI Developers Forum, user DoroRongThis (Jan 26, 2026).

---

### 3. `referenceImages` requires `durationSeconds: 8`

**What it means:** When using reference images (style/content guidance), the video must be 8 seconds. Using 4s or 6s with reference images causes an API error.

**Source:** Official API docs table footnote.

---

### 4. `referenceImages` + `9:16` aspect ratio is a known bug

**What it means:** If you try to generate a portrait-orientation (vertical) video using reference images, the API throws: *"Unsupported output video aspect ratio ASPECT_RATIO_9_16."* Only `16:9` (landscape) works with reference images currently.

**Source:** Google employee Alisa_Fortin confirmed this in the developer forum.

---

### 5. Images must be base64-encoded — plain HTTPS URLs are rejected

**What it means:** When you pass `image` (startFrame), `lastFrame`, or `referenceImages`, the SDK only accepts:
- `imageBytes` — the image file contents converted to base64 string
- `gcsUri` — a Google Cloud Storage URI (e.g. `gs://my-bucket/image.png`)

You **cannot** pass a regular `https://` URL directly. The SDK will fail or the API will reject it.

Our code correctly handles this — we fetch the image from Supabase Storage and base64-encode it before passing it to the SDK.

**Source:** SDK docs + `js-genai` Issue #1270 (open feature request to support HTTPS URLs directly).

---

### 6. Valid `durationSeconds` values are discrete: 4, 6, 8 (not a continuous range)

**What it means:** You might think you can pass any number between 4 and 8 (like 5 or 7), but the API only accepts exactly `4`, `6`, or `8`. Passing `5` causes an "out of bound" error even though the error message says "between 4 and 8 inclusive" — the error message is misleading.

**Source:** Official API docs parameter table. We hit this error with `durationSeconds: 5`.

---

### 7. `generateAudio` causes enterprise error on developer API

**What it means:** Veo 3.1 generates audio automatically — you don't need to ask for it. If you explicitly pass `generateAudio: true` in the config, the API returns: *"generateAudio parameter is only supported in Gemini Enterprise Agent Platform mode."*

The safe approach: don't include `generateAudio` in the config at all. Audio will be included in the video automatically.

**Source:** Empirical — we hit this error in production.

---

## CreativeOS UX Gaps (what needs fixing in the app)

### Bugs (silently fail or return API errors)

| Gap | What happens today | What should happen |
|---|---|---|
| **endFrame forces duration=8 — not enforced** | User picks 4s or 6s duration + sets an end frame → API returns "use case not supported" | Provider should auto-override duration to 8s when endFrame is set |
| **referenceImages forces duration=8 — not enforced** | User picks 4s + sets reference images → API error | Provider should auto-override duration to 8s when refs are used |
| **refs not cleared when endFrame is set** | User sets endFrame + has reference images → refs sent alongside lastFrame → API rejects | Clear referenceUrls when endFrame is present (same as we do for startFrame) |
| **Veo Fast wrongly shows no reference image option** | Fast model hides the "Ref" role button even though Fast supports up to 3 refs | Show Ref option for Fast; only hide for Lite |

### Missing features

| Gap | Impact |
|---|---|
| **No `resolution` param** | All videos generate at 720p. Users can't choose 1080p or 4K (Quality/Fast) |
| **Lite/Fast duration missing 8s option** | Users can't generate 8-second videos on Lite or Fast |
| **No warning: referenceImages + 9:16 = broken** | User selects portrait aspect ratio + reference images → API error with no clear explanation |
| **No visual hint that referenceImages drop startFrame/endFrame** | User might set a start frame AND reference images without knowing refs will be silently dropped |
