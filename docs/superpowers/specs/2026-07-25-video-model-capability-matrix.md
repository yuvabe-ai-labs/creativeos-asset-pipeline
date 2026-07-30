# Video Model Capability & Constraint Matrix

**Date:** 2026-07-25
**Status:** Reference (living doc)
**Area:** Video Gen node — provider capabilities vs app-encoded rules
**Models covered:** Veo 3.1 (Lite / Fast / Quality), Kling (1.5 / 1.6 / 2.1 / 2.1-Master / 2.6 / 3.0), Sora 2 (for contrast)

---

## Purpose

One place that answers: **what does each vendor actually support**, **what does our app currently
allow**, and **where do the two disagree** (either the app is needlessly stricter than the vendor,
or the app sends something the vendor doesn't accept).

Three layers per model:

- **Vendor** — what the provider's API documents (researched online; sources at the bottom).
- **App** — what we encode today in `src/lib/video-gen/client-models.ts` + `params/*`.
- **Gap** — the delta worth acting on.

> This doc is the capability/rules companion to the integration specs
> ([Kling](2026-07-11-kling-video-gen-integration-design.md),
> [frame-role UX](2026-07-11-video-gen-frame-role-ux-design.md),
> [constraint rules](2026-06-25-video-gen-constraint-rules-design.md)).

### Legend

| Mark | Meaning |
|---|---|
| ✅ | Supported |
| ❌ | Not supported |
| ⚠ | Vendor status not confirmed against an authoritative direct source — **do not hardcode yet** |
| 🔒 | App is **stricter** than the vendor (capability exists but we disable it) |
| 🐛 | App sends/encodes something the vendor does **not** support or impose (probable bug/no-op) |

> **Sourcing:** Kling rows are now grounded in the **official Kling Video Capability Map**
> ([kling.ai/document-api/guides/capability-map/video](https://kling.ai/document-api/guides/capability-map/video),
> LLM-optimized view, *Updated 2026-05-19*). Kling's docs return **HTTP 446** to default fetch
> agents; the page is reachable with a browser User-Agent, or via the `llms.txt` LLM view. A few
> request-param details not covered by the capability map (`cfg_scale`, `mode`) remain
> wrapper-sourced and are marked ⚠.

---

## 1. Veo 3.1 — Google (Gemini API / Vertex AI)

### 1a. Capabilities

| Model | Start frame (`image`) | End frame (`lastFrame`) | Max ref images (`referenceImages`) | Durations (s) | Aspect | Audio |
|---|:--:|:--:|:--:|---|---|:--:|
| **Veo 3.1 Lite** | ✅ | ✅ | **0** (no ref feature) | 4 / 6 / 8 | 16:9, 9:16 | ✅ native |
| **Veo 3.1 Fast** | ✅ | ✅ | **3** (asset refs only) | 4 / 6 / 8 | 16:9, 9:16 | ✅ native |
| **Veo 3.1 Quality** | ✅ | ✅ | **3** (asset refs only) | 4 / 6 / 8 | 16:9, 9:16 | ✅ native |

App model IDs: `veo:veo-3.1-lite`, `veo:veo-3.1-fast`, `veo:veo-3.1`. Vendor IDs:
`veo-3.1-lite-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-generate-preview`.

**App parity:** app-encoded capabilities (start ✅ / end ✅ / refs 0·3·3 / durations 4·6·8 / 16:9·9:16)
**match the vendor exactly.** Veo is our best-aligned provider.

### 1b. Constraint rules — vendor vs app

| Rule | Vendor says | App encodes | Verdict |
|---|---|---|---|
| End frame requires a start frame | ✅ documented — `lastFrame` "must be used in combination with `image`" | ✅ `end-frame-requires-start-frame` → `disableGenerate` | ✅ **correct** |
| Reference images → duration = 8s | ✅ documented — `durationSeconds` "must be 8 when using reference images (or 1080p/4K)" | ✅ `refs-lock-duration-disable-frames` locks 8s | ✅ **correct** |
| **End frame → duration = 8s** | ❌ **not documented** — the 8s lock is tied to *reference images* and *1080p/4K*, **not** to last-frame interpolation. fal.ai's first-last-frame endpoint allows 4/6/8s. | 🐛 forces `duration = 8` on any end frame (`lite-end-frame-duration`, `end-frame-lock-duration`) | 🐛 **likely over-restriction** — we lock 8s for a case the vendor doesn't. Verify, then relax to allow 4/6/8 with an end frame (unless 1080p/4K is also selected). |
| Reference images ⟷ start/end frame are mutually exclusive | ⚠ **not documented as an API rule** — only *implied* by wrapper APIs (fal.ai/Replicate) exposing them as separate endpoints | ✅ `frames-disable-refs` + `disableFrameInputs` enforce a hard mutex | 🔒 plausible product choice, but **unverified**. Keep if it matches our UX intent; don't cite it as a Google constraint. |
| Resolution → duration coupling (720p allows 4/6/8; 1080p & 4K force 8s) | ✅ documented | — app doesn't model `resolution` at all | (gap: we don't expose resolution, so N/A today) |

**Extra vendor facts we don't currently use:** native audio (all three); 4K + video-extension are
**Quality/Fast only** (Lite caps at 1080p, no extension); Veo 3.1 refs are **asset-type only**
(`referenceImages.style` from Veo 2 is dropped on 3.1); in EU/UK/CH/MENA `personGeneration` is
restricted to `allow_adult`.

---

## 2. Kling — Kling AI developer API

**Endpoint matters.** Kling splits image inputs across two endpoints — a capability's availability
depends on *which endpoint* it lives on:

- `POST /v1/videos/image2video` — `image` (start) + optional `image_tail` (end) + `camera_control`
  + masks. **This is the only endpoint our provider calls**
  ([`providers/kling.ts:104`](../../../src/lib/video-gen/providers/kling.ts#L104)).
- `POST /v1/videos/multi-image2video` — the **"Elements"** feature; `image_list` (reference images).
  **Not integrated.**

### 2a. Capabilities (Image-to-Video — the only mode we use)

Per the official capability map. "End frame" below = the map's **First/Last Frame** row (supply
`image` + `image_tail`); **Camera Control** and **Motion Control** are two *different* features.

| Model (`model_name`) | Start (`image`) | End frame (First/Last) | References | Camera Control | Motion Control | Native audio | Duration |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|
| **Kling 1.5** (`kling-v1-5`) | ✅ | ✅ *(1080P only)* | ❌ | ✅ *(1080P, 5s)* | ❌ | ❌ | 5 / 10s |
| **Kling 1.6** (`kling-v1-6`) | ✅ | ✅ *(1080P only)* | ✅ **Multi-image → Video** (sep. endpoint) | ❌ | ❌ | ❌ | 5 / 10s |
| **Kling 2.1** (`kling-v2-1`) | ✅ | ✅ *(1080P only)* | ❌ | ❌ | ❌ | ❌ | 5 / 10s |
| **Kling 2.1 Master** (`kling-v2-1-master`) | ✅ | **❌** | ❌ | ❌ | ❌ | ❌ | 5 / 10s |
| **Kling 2.6** (`kling-v2-6`) | ✅ | ✅ *(1080P, **silent only**)* | ❌ | ❌ | ✅ | ✅ | 3–10s |
| **Kling 3.0** (`kling-v3`) | ✅ | ✅ | ✅ **Element Control** (elements on I2V) | ❌ | ✅ *(no 4K)* | ✅ | 3–15s |

Model-name mapping: our `kling-v3` = the map's **"Kling 3.0"** (not "3.0 Turbo" — Turbo has
`First/Last Frame` = *Not Supported* — and not "3.0 Omni"). ⚠ confirm `kling-v3` resolves to
non-Turbo on the API. Wrapper-sourced request-param details not in the capability map: `cfg_scale`
(0–1) ⚠ reportedly rejected by 2.x (v2-1 / v2-1-master / v2-6); `mode` std/pro ⚠ (2.1-Master may be
master-tier only); `negative_prompt` (~2500 chars) on all.

**App-encoded for ALL six:** start ✅, **end ❌**, **refs 0**, `rules: []`. Params exposed uniformly:
`mode` std/pro, `duration` 5/10 (legacy) or 3–15 (v3), `aspect_ratio` 16:9/9:16/1:1, `cfg_scale` 0–1,
and the D77 `camera_move` grid → `camera_control`.

### 2b. Gaps — Kling

- 🐛 **`camera_control` is sent to five models that don't support it.** The capability map lists
  Image-to-Video **Camera Control on Kling 1.5 ONLY** (1080P, 5s) — **Not Supported** on 1.6, 2.1,
  2.1-Master, 2.6, 3.0. Our D77 camera grid is shown and sent for all six ⇒ on five of six it's a
  no-op-or-error. **2.6 and 3.0 use a different feature (Motion Control); 1.6 has no camera feature at
  all** in this map. **Most actionable finding — and it sits on the active
  `feat/provider-aware-video-prompt` branch.**
- 🔒 **End frame disabled app-wide, but supported on 5 of 6** (all except **2.1-Master**) — with
  resolution locks the app doesn't model: **1080P** on 1.5/1.6/2.1, **1080P + silent** on 2.6, free on
  3.0. `image_tail` is a field on the endpoint we already call — a low-cost win once the res/audio
  locks are encoded.
- 🐛 **`cfg_scale` exposed for all Kling, but ⚠ reportedly rejected by 2.x** (wrapper-sourced — not in
  the capability map; verify).
- 🔒 **Ref disabled app-wide — and it's two different mechanisms, two different models:**
  **Kling 1.6** via the separate **Multi-image→Video** endpoint; **Kling 3.0** via **Element Control**
  (elements on the I2V call). 2.1/2.1-Master/2.6 = none. So refs is not one feature — enabling it is
  *two* integrations.

### 2c. Constraint rules

- **Camera Control (I2V) = Kling 1.5 only**, at **1080P + 5s**. (Text-to-Video camera control exists
  only on Kling 1.0 — irrelevant to us.)
- **Motion Control ≠ Camera Control** — a separate, newer feature on **2.6 and 3.0** (3.0: no 4K). If
  we ever want camera moves on the modern models, that's the path, not `camera_control`.
- **End frame (First/Last Frame) resolution/audio locks:** **1080P** on 1.5/1.6/2.1; **1080P +
  silent** on 2.6; unrestricted on 3.0; **not supported** on 2.1-Master.
- **`image_tail` ⊥ `camera_control` ⊥ masks** are mutually exclusive per request (API-level rule) —
  matters only on **1.5**, the one model that has both. Our `ConstraintRule` engine already models
  this shape (`hasEndFrame` + `disableFrameInputs`), mirroring the Veo refs↔frames mutex.
- **References:** 1.6 → Multi-image→Video (separate endpoint); 3.0 → Element Control (elements on
  I2V). Different request shapes — not interchangeable.
- **App-enforced (not a vendor rule, but real):** Kling requires a **start frame** to generate — our
  server throws without one ([`providers/kling.ts:88`](../../../src/lib/video-gen/providers/kling.ts#L88)),
  and the UI disables Generate for Kling until a start frame is assigned
  ([frame-role UX §C0](2026-07-11-video-gen-frame-role-ux-design.md)).

### 2d. Newer Kling models we haven't integrated

The capability map also lists **Kling O1**, **3.0 Omni**, **3.0 Turbo**, **2.5 Turbo**, **2.0 Master**,
**1.0** — none are in our registry. Notable: **O1 / 3.0 Omni** add Video Reference + Multi-image;
**2.5 Turbo** is "max creativity, exceptional value." Out of scope here, flagged for later triage.

---

## 3. Sora 2 — OpenAI (contrast row)

| Model | Start | End | Refs | Max duration | App rule |
|---|:--:|:--:|:--:|---|---|
| **Sora 2** | ✅ | ❌ | 0 | 12s | `sora-start-frame-locks-size` → size locked to 1280×720 |

Included only to show the shared rule engine spans all three providers.

---

## 4. Action items (ranked)

1. 🐛 **Scope the Kling camera grid to Kling 1.5 only.** The capability map lists Image-to-Video
   Camera Control on **1.5 alone** (1080P, 5s) — not 1.6, 2.1, 2.1-Master, 2.6, or 3.0. Today the D77
   grid is shown for all six and `camera_control` is sent regardless. Hide the grid for everything
   except 1.5; for 2.6/3.0 the real path is the separate **Motion Control** feature (own follow-up).
   **On the current branch — highest priority.**
2. 🐛 **Verify & relax the Veo "end frame → 8s" lock.** Vendor ties 8s to *refs* and *1080p/4K*, not
   to end frames. If confirmed, allow 4/6/8s with an end frame. *(2-line change to the Veo rules.)*
3. 🔒 **Kling End frame (`image_tail`).** Enable for 1.5/1.6/2.1/2.6/3.0; keep **off for 2.1-Master**.
   Needs: per-model `endFrame` capability (not one shared const), `image_tail` in
   `buildKlingRequestBody`, and the resolution/audio locks the map documents (**1080P** on
   1.5/1.6/2.1; **1080P + silent** on 2.6), plus the `image_tail` ⊥ `camera_control` mutex on 1.5.
   **Design pass warranted.**
4. 🐛 **Hide `cfg_scale` for Kling 2.x** — *if confirmed* (wrapper-sourced, not in the capability map).
   Verify against the API, then make the param spec per-model instead of one shared `klingLegacyParams`.
5. 🔒 **Kling Ref — two separate integrations.** **1.6** via Multi-image→Video (separate endpoint);
   **3.0** via Element Control (elements on I2V). Different request shapes; scope each on its own.
6. ✂ **Decide the refs↔frames mutex story for Veo.** Defensible product choice but *not* a
   Google-documented API rule — keep it if intentional, but don't present it as a vendor constraint.
7. ⚠ **Confirm `kling-v3` = non-Turbo "Kling 3.0"** on the API before relying on its end-frame support
   (Turbo has First/Last Frame = Not Supported).

---

## 5. Sources

**Veo 3.1**
- [Generate videos with Veo 3.1 — Gemini API](https://ai.google.dev/gemini-api/docs/veo) — model table, `durationSeconds`/`lastFrame`/`referenceImages`, the "must be 8" + "combination with image" text.
- [Video generation in the Gemini API](https://ai.google.dev/gemini-api/docs/video) — native audio, frame-specific generation.
- [Veo 3.1 Lite Preview model page](https://ai.google.dev/gemini-api/docs/models/veo-3.1-lite-generate-preview) — Lite: no 4K, no extension.
- [Guide video generation using reference images — Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/docs/video/use-reference-images-to-guide-video-generation) — "up to three images"; no `referenceImages.style` on 3.1.
- [Veo 3.1 First-Last-Frame-to-Video — fal.ai](https://fal.ai/models/fal-ai/veo3.1/first-last-frame-to-video/api) — cross-check: first+last both required; durations 4/6/8 (not locked to 8).
- [Veo 3.1 Fast API reference — fal.ai](https://fal.ai/docs/model-api-reference/video-generation-api/veo3.1-fast) — durations, resolutions, audio default.

**Kling** *(primary = official capability map; mirrors only for request-param details it omits)*
- **[Video Capability Map — Kling API (official, Updated 2026-05-19)](https://kling.ai/document-api/guides/capability-map/video)** — per-model I2V rows: First/Last Frame, Camera Control, Motion Control, Element Control, Multi-image→Video, Native Audio. **Source of truth for §2a–2c.** (Reachable with a browser User-Agent or the `llms.txt` view; 446s to default fetch agents.)
- [Kling API docs index — llms.txt](https://kling.ai/document-api/llms.txt) — LLM-optimized page index.
- [Image to Video — Kling API](https://kling.ai/document-api/apiReference/model/imageToVideo) — `image` + `image_tail`.
- [Multi-Image to Video — Kling API](https://kling.ai/document-api/apiReference/model/multiImageToVideo) — `image_list` / Elements; model support; `type` first/end frame.
- [useapi.net — image2video-frames (per-model end-frame / duration / cfg_scale)](https://useapi.net/docs/api-kling-v1/post-kling-videos-image2video-frames)
- [useapi.net — image2video-elements (multi-image / Elements models)](https://useapi.net/docs/api-kling-v1/post-kling-videos-image2video-elements)
- [fal.ai — Kling v2.1 Master i2v (no tail, no camera_control)](https://fal.ai/models/fal-ai/kling-video/v2.1/master/image-to-video/api)
- [fal.ai — Kling v3 Pro i2v (3–15s, end frame, elements, no camera_control)](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api)
- [Replicate — Kling v2.1 (end_image only on pro)](https://replicate.com/kwaivgi/kling-v2.1)
- [Replicate — Kling v3 Motion Control (separate feature/endpoint)](https://replicate.com/kwaivgi/kling-v3-motion-control)
- [Eachlabs — Kling v2.6 Pro (end-frame ⊥ audio)](https://www.eachlabs.ai/kling/kling-v2-6/kling-v2-6-pro-image-to-video)
- [ComfyUI — Kling Camera Control I2V node (v1-5 pro 5s hard-code)](https://docs.comfy.org/built-in-nodes/partner-node/video/kwai_vgi/kling-camera-control-i2v)
- [Scenario — Kling video models: the essentials (per-model overview)](https://help.scenario.com/en/articles/kling-video-models-the-essentials/)

---

## 6. Open / low-confidence items

**Resolved by the official capability map** (were ⚠ in the mirror-sourced draft): Camera Control is
**1.5 only** (not the "v1 family"); v3 end-frame + references **confirmed**; 2.6 end-frame **silent-only
confirmed**; references split **1.6 = Multi-image endpoint / 3.0 = Element Control**; First/Last Frame
**1080P locks** documented per model.

**Still open / lower-confidence:**
- **`cfg_scale` rejected by 2.x** and **`mode` tiers** (2.1-Master master-only; 2.6 `std`) are
  **wrapper-sourced** — the capability map doesn't cover request params. Verify against the live API
  before coding action #4.
- **`kling-v3` ↔ "Kling 3.0" (non-Turbo)** mapping — confirm the model_name resolves to the non-Turbo
  variant (Turbo = no First/Last Frame).
- **`aspect_ratio` on I2V** — capability map doesn't settle whether it's settable vs derived; v3 is
  derived-from-image. Our app still exposes the select for all Kling.
- **Kling durations** — capability map gives ranges (2.6 = **3–10s**, wider than our 5/10); confirm the
  exact allowed set per mode.
- **Veo:** "refs ⟷ frames" mutex is **implied, not documented**; "end frame → 8s" lock is **likely
  false** per docs. Dec-2025 forum reports of `lastFrame`/`referenceImages` returning "not supported"
  on live preview endpoints — current runtime behavior not confirmed via changelog.
