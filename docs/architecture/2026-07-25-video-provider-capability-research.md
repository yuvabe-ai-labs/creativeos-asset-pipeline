# Kling & Veo capability research → the text-camera consolidation

**Date:** 2026-07-25
**Status:** Living explainer (read-back record of *why* the video roster and camera model changed)
**Type:** Architecture research + decision narrative
**Companions:**
[../superpowers/specs/2026-07-25-video-model-capability-matrix.md](../superpowers/specs/2026-07-25-video-model-capability-matrix.md) (the full vendor-vs-app matrix),
[../superpowers/specs/2026-07-25-video-provider-consolidation-design.md](../superpowers/specs/2026-07-25-video-provider-consolidation-design.md) (the design/spec),
[../superpowers/plans/2026-07-25-video-provider-consolidation.md](../superpowers/plans/2026-07-25-video-provider-consolidation.md) (the implementation plan),
[../superpowers/specs/2026-07-23-provider-aware-video-prompt-design.md](../superpowers/specs/2026-07-23-provider-aware-video-prompt-design.md) (D77 — superseded).

This is the story of a small UI question — *"why is the End/Ref frame disabled for Kling?"* — that
turned into a vendor-capability audit and, ultimately, reversed an approved architecture decision
(**D77**). It's written to be read months from now by someone asking *"wait, why don't we use
`camera_control`?"* or *"why is Kling only 3.0?"* The **decisions** are §5; everything before is how
we earned the right to make them.

---

## 1. The question

In the Video Gen node, the **End** and **Ref** frame-role buttons were greyed out for Kling, with a
"Not supported by this model" tooltip. The trigger question: *is that a real Kling limitation, or a
choice we made?*

The proximate answer was in our own code: the UI reads each model's
[`ImageInputCapabilities`](../../src/lib/video-gen/types.ts) (`startFrame` / `endFrame` /
`maxReferenceImages`), and Kling declared `{ startFrame: true, endFrame: false, maxReferenceImages: 0 }`.
So the buttons were disabled *by our declaration*, not by an error from Kling. That reframed the
question into the real one: **what does Kling actually support — and are we describing it correctly?**

The rule we followed from here: **don't answer capability questions from memory — verify against the
vendor's own docs.** Aggregators and model wrappers disagree with each other constantly; only the
vendor's capability doc is authoritative.

---

## 2. How we got the truth (the method matters)

Getting Kling's official docs was non-trivial and worth recording, because the next person will hit
the same wall:

- **Kling's docs return HTTP 446 to automated fetchers.** `kling.ai/document-api/*` and
  `app.klingai.com/*` both 446 to a default fetch agent. This is a **User-Agent / bot filter**, not
  a geo block — the same URL returns **HTTP 200** with a browser User-Agent.
- **The docs are a client-rendered SPA**, so even a 200 gives you the shell, not the content. Two
  ways through: (a) fetch the CDN JSON/`llms.txt` the SPA loads, or (b) use the **LLM-optimized
  view** — Kling publishes `https://kling.ai/document-api/llms.txt` and per-page LLM views (e.g. the
  **Video Capability Map**) that are clean text.
- **The Video Capability Map is the single source of truth.** `kling.ai/document-api/guides/capability-map/video`
  (Updated 2026-05-19) lays every model against every feature. It is the doc that settled questions
  the wrappers muddied.
- **Vendor prompt guides, too.** We read Kling's [prompt guide](https://kling.ai/blog/kling-ai-prompt-guide)
  and Google's [Veo prompt guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide)
  + [best-practice](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/best-practice)
  (same browser-UA trick for the Google docs surface).

The full reconciliation lives in the
[capability matrix](../superpowers/specs/2026-07-25-video-model-capability-matrix.md); the highlights
that drove decisions are below.

---

## 3. What we found

### 3a. The camera finding (the load-bearing one)

The capability map lists **image-to-video "Camera Control" on Kling 1.5 only** (1080P, 5s). It is
**Not Supported** on 1.6, 2.1, 2.1-Master, 2.6, and 3.0. Kling 2.6 / 3.0 instead expose a separate,
newer **"Motion Control"** feature on a different endpoint we have not integrated.

This mattered because our app sends the `camera_control` param (the D77 camera grid) to **every**
Kling model — so for five of six it was a no-op-or-error. Every mirror source (Segmind, useapi,
ComfyUI) had blurred this into "v1 family"; only the vendor's own map said **1.5 only**.

### 3b. End / Ref frames are per-model

- **End frame** (`image_tail` / "First/Last Frame"): supported on 1.5/1.6/2.1/2.6/3.0, **not** on
  2.1-Master — but 1080P-locked on the older ones (and silent-only on 2.6). Unrestricted on 3.0.
- **References**: two *different* mechanisms — 1.6 via a separate `multi-image2video` endpoint; 3.0
  via **Element Control** on the i2v call. 2.1/2.1-Master/2.6 have none. So "enable refs" is really
  *two* integrations, not one flag.
- **`cfg_scale`** is rejected by all Kling 2.x, but our app exposed the slider for every model.

### 3c. Both vendors want camera in the *text prompt*

The decisive convergence. Kling's guide: *"close-up, wide shot, low angle, slow push-in, pan, tilt,
tracking shot"* — camera language written into the prompt. Google's Veo guide: a full
camera-movement vocabulary, also in the prompt. Neither wants event-chaining in a short clip (Veo
says so explicitly). The one genuine per-provider difference: Kling's guide **rewards a trailing
cinematic quality tag** ("4K detail, cinematic lighting") that Veo doesn't need.

---

## 4. Why this forced a redesign

D77 ([provider-aware-video-prompt](../superpowers/specs/2026-07-23-provider-aware-video-prompt-design.md))
chose **Option B: Kling drives camera via the native `camera_control` param**, wrote the Kling prompt
*camera-silent*, and moved the camera control onto the Video Gen node. It was approved and
**partially built** on `feat/provider-aware-video-prompt`.

Two independent facts broke that premise once the product decision was made to **keep only Kling 3.0**:

1. **Kling 3.0 has no `camera_control`** (§3a). The one model that does — 1.5 — is being dropped.
   D77's core mechanism targets a param the surviving model ignores.
2. **Both guides say camera belongs in text** (§3c). Camera-silent is not just unnecessary for
   3.0 — it's *wrong*, because with no `camera_control` to own camera, a camera-silent prompt leaves
   camera unsteered.

> **The trap, named:** D77 reasoned correctly *for a six-model fleet* where 1.5/1.6 could hit
> `camera_control`. Narrowing the roster to 3.0 silently inverted the decision — the model that had
> the capability left, and the one that stayed never had it. **Narrowing a set can invert a decision
> made over that set.** This is the thing to remember.

Once every kept provider (Veo, Kling 3.0) reads camera from text, the "double-steer" D77 fought to
resolve simply *disappears* — there is no second camera channel. The fix is **subtraction**, not a
new abstraction.

---

## 5. The decisions

Recorded as an ADR (**supersedes D77**) in the roadmap §7. Summarized here for read-back.

**D-1. Roster = Veo ×3 + Kling 3.0.** Drop Sora 2 and the five legacy Kling models (1.5/1.6/2.1/
2.1-Master/2.6).
*Why:* unused; and keeping 3.0 only is the product decision that triggered everything below.

**D-2. Camera is uniform text-in-prompt for every provider.** Authored on the Video Prompt node via
the existing `CameraSelect` grid, compiled into the prompt as a camera clause.
*Why:* both vendor guides recommend it; Kling 3.0 offers no `camera_control`; Veo/Sora never had a
camera param. *Rejected:* finishing D77's `camera_control` path — ships a control no kept model
honors.

**D-3. Remove the `camera_control` machinery.** Gen-node camera grid, six axis sliders,
`kling-camera.ts` (tile→`camera_control` map), and the request emission — all deleted.
*Why:* dead for a 3.0-only roster. *Note:* this is a **revert** of already-built D77 code, not new work.

**D-4. Keep the Target selector (now 2-way Veo/Kling).** It switches the **prompt variant**, not
camera's home.
*Why:* the one real per-provider difference left is styling — Kling rewards a trailing quality tag,
Veo stays clean. That earns the selector; it just does a narrower job than D77 imagined.

**D-5. Prompt = shared spine + minimal deltas.** One provider-neutral i2v spine (camera-in-text,
one focused moment, don't re-describe the frame); Veo delta keeps hype-word hygiene; Kling delta
permits the trailing quality tag. *Rejected:* a richer Kling variant with audio/multi-shot phrasing
— deferred until those features are actually exposed.

**D-6. Back-compat by read-time fallback.** A node referencing a removed model ID resolves to the
default model; a stale `targetProvider: "openai"` reads as Veo. No DB migration.

**Deliberately deferred (non-goals):** Kling 3.0 **Motion Control** (the real path to deterministic
native camera — a separate endpoint, a future project), **references/Element Control**, **end frame
/ `image_tail`**, and **native audio / multi-shot**. All are 3.0 capabilities we chose not to expose
yet; they are documented in the matrix so the next person doesn't re-discover them.

---

## 6. If you're extending this later

- **Want deterministic camera on Kling 3.0?** That's **Motion Control**, not `camera_control` — a
  different endpoint with a different request shape. Start from the capability map's "Motion Control"
  row (3.0 + 2.6, no 4K).
- **Want references on Kling?** Two separate integrations: **1.6** via `multi-image2video`; **3.0**
  via **Element Control** on the i2v call. Not one feature.
- **Want end frames?** `image_tail` is supported on 3.0 (unrestricted) — but note the older models
  it's *1080P-locked* on, and 2.6 is silent-only. Model the resolution/audio locks if you re-add them.
- **Re-adding Kling 1.5?** That's the *only* model where `camera_control` was real — if it ever comes
  back, the deleted `kling-camera.ts` mapping is in git history at commit-of-record.
- **General rule this episode taught:** when you prune a model set, re-check every decision that was
  made *across* that set. Capabilities are per-model; a fleet-level decision can quietly stop holding.

---

## 7. Reading map

| If you want… | Read |
|---|---|
| The per-model capability facts + sources | [capability matrix](../superpowers/specs/2026-07-25-video-model-capability-matrix.md) |
| The design (what changes, file by file) | [consolidation spec](../superpowers/specs/2026-07-25-video-provider-consolidation-design.md) |
| The task-by-task build | [implementation plan](../superpowers/plans/2026-07-25-video-provider-consolidation.md) |
| The decision D77 was (and why it lost) | [D77 spec](../superpowers/specs/2026-07-23-provider-aware-video-prompt-design.md) + roadmap §7 ADR log |
