# Video Provider Consolidation — Veo + Kling 3.0, Uniform Text-Camera

**Date:** 2026-07-25
**Status:** Approved (design). Implementation pending (test-first).
**Type:** Architecture + frontend. Prunes the video roster to **Veo ×3 + Kling 3.0**, makes camera a **uniform text-in-prompt** control across both providers, and **removes the Kling `camera_control` path**.
**ADR:** New decision **superseding D77**. Assign the D-number from the roadmap §7 ADR log at plan time (numbering may collide — confirm the next free number rather than assuming).

---

## 1. Why

Three findings force this:

1. **`camera_control` does not exist on Kling 3.0.** The official [Kling Video Capability Map](https://kling.ai/document-api/guides/capability-map/video) (Updated 2026-05-19) lists Image-to-Video **Camera Control on Kling 1.5 only**. Kling 3.0's camera feature is **Motion Control** — a separate feature/endpoint we have not integrated. D77 (Option B, `camera_control`-primary) was designed when the roster held six Kling models including the 1.x line; once we keep **only 3.0**, its core mechanism targets a param the model ignores/rejects. See [capability matrix](2026-07-25-video-model-capability-matrix.md).
2. **Both vendors say camera belongs in the text prompt.** Kling's own [prompt guide](https://kling.ai/blog/kling-ai-prompt-guide): *"close-up, wide shot, low angle, slow push-in, pan, tilt, tracking shot."* Google's [Veo prompt guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide): a full camera-movement vocabulary written into the prompt. Text-camera is not a compromise — it is the documented path for **both**.
3. **Roster pruning.** Sora 2 and the five legacy Kling models (1.5 / 1.6 / 2.1 / 2.1-Master / 2.6) are unused and dropped. Keep **Veo 3.1 Lite/Fast/Quality + Kling 3.0**.

**Net:** the double-steer D77 fought to resolve disappears by *subtraction* (no second camera channel exists on the models we keep), and the Prompt-node UX becomes provider-uniform — the same as Veo today.

## 2. What changes (summary)

| Area | Before (this branch, D77) | After |
|---|---|---|
| Roster | Veo ×3 · Sora · Kling ×6 | **Veo ×3 · Kling 3.0** |
| Camera home | provider-dependent (Kling → gen node `camera_control`) | **text prompt, Prompt node, both providers** |
| Prompt shape | `text-camera` vs `external-camera` (camera-silent) | **shared spine + minimal Veo/Kling deltas; both text-camera** |
| Prompt-node camera UI | Veo grid · Kling breadcrumb ("on the video node") | **`CameraSelect` grid for both** |
| Gen-node camera | Kling `camera_control` grid + Fine-tune axis sliders | **none** |
| Target selector | 3-way (Veo/Kling/Sora) | **2-way (Veo/Kling)**, switches prompt variant |

## 3. Target selector (kept, 2-way)

`data.targetProvider` narrows to `"veo" | "kling"` (default `"veo"`). Rendered as the existing 2-chip `ParamChipGroup` on the Prompt node, and **still locks to a connected downstream Video Gen node** when one exists (the D77 downstream-edge read stays — it's the one genuinely new machinery and it earns its place). Its sole job now: **select the prompt variant.** Camera no longer depends on it.

## 4. Prompt — shared spine + two minimal deltas (Option A)

[video-prompt-generate.ts](../../../src/prompts/video-prompt-generate.ts) becomes a shared spine + two thin deltas (per AGENTS.md reuse rule). Each variant keeps its own `id`/`version` for eval provenance.

- **Spine (both):** i2v motion-only over ~8s; **do not** re-describe subject/setting/style (the frame carries them); refer to the subject generically ("the subject", "she"); **one focused moment — no A-then-B-then-C chaining** (Veo best-practice); **camera language is written into the text** (both guides); 40–90 words, one paragraph. Genericize the current hardcoded *"for Veo 3.1"* framing.
- **Veo delta:** keep the clean/no-hype style (existing hype-word hygiene).
- **Kling delta (minimal):** permit a short trailing cinematic quality tag (Kling's guide rewards e.g. *"4K detail, cinematic lighting"*). **No** native-audio/multi-shot phrasing yet (out of scope until those features are exposed).

`renderVideoControls` ([video-controls.ts](../../../src/lib/nodes/video-controls.ts)) **always emits the camera clause** — the `includeCamera=false` branch is removed. `compileVideoPrompt` ([video-prompt.ts](../../../src/lib/nodes/video-prompt.ts)) selects the variant by `targetProvider` and always includes camera.

## 5. Camera — uniform, on the Prompt node, both providers

Delete the Kling empty-state ("Camera is on the video node") at
[video-prompt-focus-view.tsx:530-548](../../../src/components/nodes/video-prompt-focus-view.tsx#L530-L548).
Both providers render the same `CameraSelect` grid + `SpeedSelect`. **This is the "identical to Veo today" outcome.**

## 6. Deletions — the `camera_control` machinery (dead once no provider uses it)

- Gen-node Kling camera grid + Fine-tune axis expander in
  [video-gen-params-panel.tsx](../../../src/components/nodes/video-gen-params-panel.tsx).
- `camera_move` param + `KLING_MOTION_PARAMS` (six axis sliders) in
  [params/kling.ts](../../../src/lib/video-gen/params/kling.ts).
- `camera_control` emission in
  [buildKlingRequestBody](../../../src/lib/video-gen/providers/kling.ts#L38-L56).
- [kling-camera.ts](../../../src/lib/video-gen/kling-camera.ts) + `kling-camera.test.ts`.

## 7. Kling 3.0 gen-node params (kept / trimmed)

Keep: `mode` (std/pro), `duration` (3–15s slider), `cfg_scale` (0–1), **prefilled `negative_prompt`** (D77's curated visual-defect default — retained; 3.0 supports it).
Drop: `aspect_ratio` — Kling 3.0 **derives it from the input image** (the param is ignored for i2v).

## 8. What each node shows, by provider

| Provider | Video Prompt node | Video Gen node |
|---|---|---|
| **Veo ×3** | Target selector · Camera grid · Speed | aspect · duration |
| **Kling 3.0** | Target selector · Camera grid · Speed *(identical layout)* | `mode` · `duration` · `cfg_scale` · prefilled `negative_prompt` |

The Prompt node is provider-uniform; only the Gen-node param list differs (unavoidable — params genuinely differ by model).

## 9. Files touched

| File | Change |
|---|---|
| `src/lib/video-gen/registry.ts` | Remove Sora + 5 legacy Kling entries; keep Veo ×3 + `kling-v3` |
| `src/lib/video-gen/client-models.ts` | Same pruning; remove `SORA_RULES` and the Sora / legacy-Kling entries |
| `src/lib/video-gen/params/kling.ts` | Remove `camera_move` + `KLING_MOTION_PARAMS` + `aspect_ratio`; collapse to one 3.0 param set; keep `negative_prompt` default |
| `src/lib/video-gen/providers/kling.ts` | `buildKlingRequestBody` drops `camera_control`; remove 5 legacy model exports + `klingCameraControl` import |
| `src/lib/video-gen/kling-camera.ts` (+ test) | **Delete** |
| `src/lib/video-gen/cost.ts` | Remove Sora + legacy-Kling pricing rows |
| `src/prompts/video-prompt-generate.ts` | Shared spine + Veo/Kling deltas; genericize "Veo 3.1" |
| `src/lib/nodes/video-prompt.ts` | `compileVideoPrompt` selects variant; always includes camera |
| `src/lib/nodes/video-controls.ts` | `renderVideoControls` always emits camera; drop `includeCamera` opt |
| `src/components/nodes/video-prompt-focus-view.tsx` | Remove Kling camera empty-state; always render `CameraSelect` |
| `src/components/nodes/target-provider-select.tsx` | 2-way (Veo/Kling); remove Sora |
| `src/components/nodes/video-gen-params-panel.tsx` | Remove Kling camera grid + Fine-tune expander |
| `src/lib/canvas-nodes.ts` | `targetProvider`: `"veo" \| "kling"` |
| Sora provider/params files | Optional cleanup — remove if fully unreferenced |

## 10. Tests (written first)

- **`video-prompt-generate.test.ts`** — two variants with stable `id`/`version`; **both** contain camera-direction guidance (the D77 "Kling variant omits camera" assertion is inverted); Kling delta permits a trailing quality tag; spine carries the no-chaining rule.
- **`video-prompt.test.ts`** — `compileVideoPrompt` emits the camera clause for **both** providers; Veo output is otherwise unchanged from today; Speed prose present in both.
- **`kling-params.test.ts`** — `negative_prompt` default present; **no** `camera_move` / axis params.
- **`providers/kling` test** — `buildKlingRequestBody` no longer emits `camera_control`.
- **Delete** `kling-camera.test.ts`.
- UI (target selector 2-way, uniform camera grid, pruned pickers) — markup; `tsc` + `eslint` + manual QA (no jsdom/RTL in the suite).

## 11. Scope cuts / non-goals

- **No Motion Control integration.** Deterministic Kling camera would mean integrating 3.0's separate Motion Control endpoint — a future project, not this one. Camera stays text.
- **No Kling native-audio / multi-shot / Element (reference) work.** Capabilities 3.0 has but we don't expose; explicitly deferred.
- **No new node types**; diamond topology (D24) unchanged.
- **Keep the Target selector** — per decision, it switches the prompt variant.

## 12. Back-compat & migration

- **Removed model IDs on existing nodes.** Saved Video Gen nodes may reference a dropped model
  (`openai:sora-2`, `kling:kling-v1-5` … `kling:kling-v2-6`). The picker resolves from
  `videoGenClientModelMap`; an unknown ID currently yields no spec (`defaultsForVideoModel` returns
  `{}`). Handle by **falling back to `DEFAULT_VIDEO_CLIENT_MODEL_ID`** when a node's saved model ID is
  absent from the registry (read-time, with a one-time toast). No DB migration required.
- **Stale `targetProvider = "openai"`.** After narrowing the type to `"veo" | "kling"`, treat any
  other stored value as **`"veo"`** at read time. No migration required.

## 13. Sources

- [Kling Video Capability Map (official, 2026-05-19)](https://kling.ai/document-api/guides/capability-map/video) — Camera Control = 1.5 only; 3.0 = Motion Control.
- [Kling AI Prompt Guide](https://kling.ai/blog/kling-ai-prompt-guide) — camera language in text; subject/action/setting/camera/lighting/mood; trailing cinematic tags.
- [Veo prompt guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide) + [Veo best practices](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/best-practice) — Subject/Action/Scene/Camera structure; i2v = prompt motion only; don't chain A-then-B in short clips.
- [Video model capability matrix](2026-07-25-video-model-capability-matrix.md) — full per-model reconciliation.

## 14. ADR note — supersedes D77

**Decision.** With the roster pruned to **Veo ×3 + Kling 3.0**, camera is a **uniform text-in-prompt** control for every provider, authored on the Video Prompt node via the visual `CameraSelect` grid. Kling's `camera_control` path (grid, axis sliders, `kling-camera.ts`, request emission) is **removed**. The Target selector is retained and switches only the prompt variant (shared spine + minimal Veo/Kling deltas).

**Why.** D77's `camera_control`-primary model assumed Kling exposes `camera_control`; the official capability map shows Kling 3.0 does not (it uses a separate, un-integrated Motion Control feature). Both vendors' prompt guides recommend camera-in-text. Uniform text-camera is both less code and the more consistent UX.

**Rejected — finish D77 as written.** Would ship a camera control that no kept model honors, and diverge the Prompt-node UX by provider for no capability gain.

**Refines / reverses.** D77 (camera-signal model) and its partial build on `feat/provider-aware-video-prompt`. Reuses the `CameraSelect`/`ShotTileStrip` from the 2026-07-23 camera-visual-selectors spec (unchanged).

## 15. Verification

- New pure tests green; `tsc` + `eslint` clean; existing suites unbroken.
- **Manual (Kling 3.0):** Target=Kling → prompt **includes** a camera clause and reads as one focused moment → Gen node shows `mode`/`duration`/`cfg_scale`/prefilled `negative_prompt`, **no camera grid** → request carries **no** `camera_control`.
- **Manual (Veo):** Prompt-node camera grid + text clause identical to today; picker shows only Veo ×3 + Kling 3.0.
- Design-system: brand purple only on active tile/chip; grid legible at focus-view width.
