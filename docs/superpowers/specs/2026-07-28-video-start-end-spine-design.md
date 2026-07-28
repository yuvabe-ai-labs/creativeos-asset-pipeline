# Start + End Frame as the Video Generation Spine

**Date:** 2026-07-28
**Status:** Design — awaiting review
**Area:** Video Gen node — image roles, constraint rules, Kling provider config
**Branch:** `worktree-worktree-video-start-end-spine`
**Refines:** D77 (Kling integration), D78/D79/D80 (provider-aware prompt), the
[capability matrix](2026-07-25-video-model-capability-matrix.md), the
[constraint rules design](2026-06-25-video-gen-constraint-rules-design.md), and the
[frame-role UX](2026-07-11-video-gen-frame-role-ux-design.md).

---

## 1. Thesis

**Drive video generation from a start frame *and* an end frame, not a start frame alone.**

An image costs ~$0.067; a video re-roll costs $0.40–$4.20. Specifying the destination in pixels
rather than prose converts an expensive stochastic search into a cheap deterministic one — the model
no longer guesses where the shot ends, it only solves the path between two known states. The
secondary benefit is that composing an end frame forces the operator to decide what the action
actually *is*.

The approach is **opinionated but never enforced**: the UI expresses the preference through layout,
and generation is never blocked for want of an end frame.

---

## 2. Evidence

### 2.1 Cost

| Re-roll | Cost | End-frame images purchasable instead |
|---|---|---|
| Veo Lite 8s | $0.40 | 6 |
| Veo Fast 8s + audio | $1.20 | 18 |
| Kling 3.0 10s 1080p + audio | $1.40 | 21 |
| Veo Quality 8s + audio | $3.20 | 48 |
| Kling 3.0 10s 4k | $4.20 | 63 |

End-frame image ≈ $0.067 (Gemini 3.1 Flash Image, 1120 output tokens × $60/1M).

### 2.2 Telemetry (`generations` table, read-only analysis, 2026-07-28)

544 generation rows: 162 video, 298 image, 84 prompt.

- **Mean 2.61 video generations per node** across 62 distinct video nodes.
- **39 of 162 video generations failed (24%)** — roughly **$20 of ~$85** total video spend.
- **Only 4 of 162 (2.5%) used start + end.** The thesis is effectively untested in practice.
- Success by input shape: **no frames 55%**, **start frame only 80%**, start+end 75% (n=4).
- Of the 4 start+end nodes, **2 had start+end as the final, successful generation** — the end frame
  ended the re-roll loop rather than causing it. The naive "end-frame nodes average more
  generations" reading is an ordering artifact, not evidence against the thesis.
- **0 of 298 image generations used a reference image.**

### 2.3 Two vendor rules discovered from our own failures

Both are **absent from vendor documentation** and were found only in stored `error` text:

1. **Veo: start+end forces 8s.** Node `faab1d1d`, ten minutes apart —
   `duration 6` → `400 "Your use case is currently not supported"`, `duration 8` → succeeded.
2. **Kling O1: without `refer_image`, duration is 5 or 10 only.** 2026-07-27 —
   `Kling create failed (400): {"code":1201,"message":"Duration only supports 5 or 10 seconds when
   no refer_image is provided"}`. Kling's own docs list the enum as 3–15.

Rule 2 also proves `/omni-video/kling-o1` is a **live endpoint** — the response is Kling's semantic
validator, not a 404.

---

## 3. Verified capability & rules matrix

Sourced from Kling's official LLM-optimized doc pages, Google's Gemini API docs, and the installed
`@google/genai` type definitions. Kling's site returns **HTTP 446** to automated fetching — pages
must be pasted in or read with a browser User-Agent.

### 3.1 Possible combinations and their durations

| Combination | Veo 3.1 Lite | Veo 3.1 Fast/Quality | Kling 3.0 | Kling O1 |
|---|---|---|---|---|
| Text only | ✅ 4/6/8 | ✅ 4/6/8 | ❌ start required | ✅ 5 or 10 |
| Start only | ✅ 4/6/8 | ✅ 4/6/8 | ✅ 3–15 | ✅ 5 or 10 |
| **Start + End** | ✅ **8 only** | ✅ **8 only** | ✅ **3–15** | ✅ **5 or 10** |
| End only | ❌ | ❌ | ❌ | ❌ |
| Refs only | ❌ | ✅ 8 only | ❌ | ✅ 3–15 |
| Start + Refs | ❌ | ❌ excluded | ❌ | ✅ 3–15 |
| **Start + End + Refs** | ❌ | ❌ excluded | ❌ | ✅ **3–15** |

**Kling O1 is the only model in the roster that supports all three simultaneously — and adding
references is what unlocks its full duration range.**

### 3.2 Endpoints and content types

| Endpoint | `contents[].type` enum |
|---|---|
| `/image-to-video/kling-3.0` | `prompt`, `first_frame`, `last_frame`, `element` — **no `refer_image`** |
| `/omni-video/kling-o1` (docs: `/omni-video/kling-3.0-omni`) | `prompt`, `first_frame`, `last_frame`, `refer_image`, `feature_video`, `base_video`, `element` |

`refer_image` shape: `{ type, url, id }`, `id` optional, addressed from the prompt as `@image_1`.
`element` requires a pre-registered `element_id` from the Element Management API — **not** a plain
URL, and therefore out of scope.

### 3.3 Rules

Rule IDs are a **subset** of the fuller set carried in the capability matrix — gaps in the numbering
are rules that exist but fall outside this design's scope (elements, reference video, multi-shot).
The `OM` prefix means *omni endpoint*, to avoid colliding with the model name "Kling O1".

| # | Rule | Applies to |
|---|---|---|
| V1 | `referenceImages` excludes `image`, `lastFrame`, `video` (SDK, verbatim) | Veo Fast/Quality |
| V2 | refs → `durationSeconds` must be `"8"` | Veo Fast/Quality |
| V3 | `lastFrame` requires `image` | all Veo |
| V4 | 1080p or 4k → duration `"8"` | all Veo |
| V7 | **start+end → duration `"8"`** (telemetry, undocumented) | all Veo |
| K1 | `first_frame` required; last-frame-only rejected | Kling 3.0 |
| K2 | max 3 elements | Kling 3.0, Kling O1 |
| K5 | prompt ≤3072 chars (≤2500 recommended) | Kling 3.0, Kling O1 |
| K6 | images jpg/jpeg/png, **≤50MB**, ≥300px, aspect 1:2.5–2.5:1 | Kling 3.0, Kling O1 |
| OM1 | `refer_image` **coexists with `first_frame`** (worked example in docs) | Kling O1 |
| OM2 | no reference video → refs + multi-image elements **≤ 7** | Kling O1 |
| OM7 | last-frame-only unsupported | Kling O1 |
| OM8 | **`aspect_ratio` required when there is no first frame and no reference video** | Kling O1 |
| OM12 | **no `refer_image` → duration 5 or 10 only** (telemetry, undocumented) | Kling O1 |

---

## 4. Decisions

| # | Decision |
|---|---|
| **D83** | Start + end frame is the default shape of a video generation. The preference is expressed by layout only — generation is **never blocked** for a missing end frame. |
| **D84** | The end frame is produced by **editing the start frame**, not by generating a fresh image. Interpolation morphs in proportion to how far apart the two frames are, so the end frame must be a near-neighbour. |
| **D85** | Constraint rules are **handled in the UI**. The API route **rejects** violations with 400 and **never auto-corrects** — the server never silently changes what was asked for, and never spends money on a request the user did not make. |
| **D86** | Locked parameter values are **written into params state**, not merely displayed. One source of truth: what is shown is what is sent. |
| **D87** | Kling 3.0 and Kling O1 get **separate capability descriptors**. Their reference mechanisms differ in kind (`element` registry vs inline `refer_image`) and cannot share one shape. |
| **D88** | Kling O1 gains **inline `refer_image` support, up to 7 images total** (conservatively counting start and end frames toward the budget). |

---

## 5. Design

### 5.1 The shot spine strip — focus view only

A persistent strip at the top of the video-gen focus view showing the three roles in narrative
order, with the resulting duration beneath:

```
 THE SHOT

 ┌────┐    ┌ ─ ─┐    ┌ ─ ─┐
 │IMG │ ▶  │  + │    │  + │
 └────┘    └ ─ ─┘    └ ─ ─┘
  start     end       reference
                      2 of 5

 Duration · 5 or 10s
```

- Empty slots render as **dashed-border primary chips** (`border-dashed border-primary/40`,
  `hover:bg-primary/5`) per the house add-action pattern in `AGENTS.md`.
- Slot labels use `.text-eyebrow`.
- A filled reference slot shows its count against the cap (`2 of 5`). A hint on the *empty*
  reference slot naming the payoff ("unlocks 3–15s") is **deferred** — that claim rests on the
  wording of a single error message and is unverified (§9). Do not ship a promise we have not
  confirmed; add it once the manual verification settles it.
- Slots unavailable for the current model are rendered inert with the existing
  "Not supported by this model" treatment, not hidden — absence should be legible.
- The duration readout reflects evaluated constraints, so it changes live as roles are assigned.
- **Generate is never disabled by a missing end frame.**

Node cards are unchanged; the coupling is only actionable where params are tuned.

### 5.2 Derive end frame from start frame

A **"Create end frame"** action on the video-gen focus view spawns an **image-gen node in edit
mode**, seeded with the start frame as the edit source, and auto-wires it back with
`role: end_frame`. Disabled when no start frame is assigned.

Builds on the image-edit mode ([D27 / image-edit-mode design](2026-07-05-image-edit-mode-design.md)).
Placement on the node itself rather than in the D36 guided-flow tray keeps this branch
self-contained — the tray lives on an unmerged worktree.

### 5.3 Rule integrity

**UI (primary).** Whenever constraints are evaluated, `lockedParams` are merged into `params`
state. Today [`video-gen-params-panel.tsx:80,88`](../../../src/components/nodes/video-gen-params-panel.tsx#L80)
*displays* the locked value while `params` keeps the stale one, and the control is `disabled` so
`onParamChange` can never reconcile it. Reconciliation currently happens only inside
`handleRoleChange` and `handleModelChange` — i.e. on change events, never on initial evaluation.

**This is a live bug, not a hypothetical.** Constraint rules shipped 2026-06-25; 11 of the
refs-with-wrong-duration failures occurred *after* that date, through 2026-07-10. Opening a node
that already has references and a persisted `duration: 6` shows a locked **8** and sends **6**.

**Rules to add** (Kling has `rules: []` today):

| Rule | Effect | Source |
|---|---|---|
| Kling 3.0 without a start frame | `disableGenerate` | K1 |
| Kling O1 without references | `duration` locked to 5 or 10 | OM12 (telemetry) |
| End frame present | `multi_shot` locked `false` | Cuts contradict interpolation |

**Server (backstop).** The route evaluates the same rules and returns **400 with the rule's
`reason`** on any violation. It never mutates params. If the UI is correct this path is unreachable
— which is what makes it a safe backstop rather than a second source of truth.

### 5.4 Kling provider corrections

The Kling O1 configuration was built from third-party wrapper documentation (fal.ai / WaveSpeed),
whose limits are narrower than Kling's own:

| Setting | Current | Correct |
|---|---|---|
| Duration | 3–10 slider, `maxDurationSeconds: 10` | **5 or 10 select** (O12); full 3–15 once references are present |
| Resolution | `720p`, `1080p` | add **`4k`** (+ cost tier — [`cost.ts:48`](../../../src/lib/video-gen/cost.ts#L48) returns `null` for 4k today) |
| Audio | `original`, `off` | add **`native`** |
| `multi_shot` fallback | `?? true` at [`kling.ts:49`](../../../src/lib/video-gen/providers/kling.ts#L49) | `?? false`, matching the spec default from `4cee50d` |
| Capability descriptor | shared `KLING_IMAGE_INPUTS_WITH_END` | per-model (D87) |

Kling 3.0's 3–15s range is **left untouched** — the 5/10 restriction is evidenced only on the omni
endpoint and will not be narrowed on inference.

### 5.5 Kling O1 references

`buildKlingContents` gains `refer_image` items `{ type, url, id }` with sequential ids
(`image_1`, `image_2`, …). `maxReferenceImages` becomes **7 minus the number of frames in use**.
The hard `if (!input.startFrameUrl) throw` at
[`kling.ts:139`](../../../src/lib/video-gen/providers/kling.ts#L139) is relaxed for the omni
endpoint only — Kling 3.0 still requires a start frame (K1).

**Open sub-question:** whether a `refer_image` the prompt never addresses has any effect. If Kling
requires an explicit `@image_n` mention, references need either prompt injection or per-reference
labels in the UI. Resolve empirically before building labelling.

---

## 6. Corrections to prior specs

The [capability matrix](2026-07-25-video-model-capability-matrix.md) is a living doc and is now
partly wrong. It must be updated as part of this work:

1. **§1b marks Veo "end frame → 8s" as 🐛 a likely over-restriction, and ranked action item #2 is
   to relax it. Executing that would cause a regression** — telemetry proves the lock is correct.
   Re-mark as ✅ correct, sourced from runtime evidence rather than docs (rule V7).
2. **§1b marks the refs ⟷ frames mutex as ⚠ undocumented.** It *is* documented, verbatim, in the
   installed `@google/genai` types. Action item #6 is void.
3. **§2 in full is superseded** by the 2026-07-26 consolidation: the `/v1/videos/image2video`
   endpoint, models 1.5/1.6/2.1/2.1-Master/2.6, `camera_control`, `cfg_scale` and `mode` are all
   gone from the registry.
4. **§2d states Kling O1 / 3.0 Omni are not integrated.** `kling:kling-o1` is in the registry.
5. Add the two telemetry-discovered rules (V7, OM12), neither of which appears in any vendor doc.

D77 ("Kling integration rebuilt against verified docs") should record *why* the omni model still
ended up wrapper-sourced: Kling's docs return HTTP 446 to automated fetching, so verification
silently fell back to mirrors. That is a recurring hazard, not a one-off slip.

---

## 7. Out of scope

Kling `element` support and the Element Management API; reference video (`feature_video` /
`base_video`); multi-shot prompt syntax (`"shot n, m, words; …"`); Veo's unexposed `resolution`
param; `personGeneration`; node-card treatment of the spine strip; the D36 guided-flow tray.

---

## 8. Verification

- Unit tests (vitest, existing `src/lib/video-gen/__tests__/` pattern) for `buildKlingContents`
  with references, the corrected settings builders, and each new constraint rule.
- A regression test for D86: evaluated `lockedParams` must appear in the params that would be sent,
  not merely in what is rendered.
- `npm run build`, lint, and the full test suite.

**End-to-end video generation cannot be verified locally.** Async video never completes on a dev
machine (dev trigger key + localhost `APP_URL`); image generation is synchronous and does work
locally. Confirming a real Kling O1 generation — and settling the open question in §5.5 — requires a
remote deploy and will be flagged as such rather than reported as passing.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| The "references unlock 3–15s on O1" inference is wrong | It rests on the wording of one error message. Confirm with a single API call before shipping the wider duration range; ship 5/10 until then. |
| Frames may not count toward O1's 7-image budget | Conservative cap (7 total including frames) costs at most two slots; the opposite error causes 400s. |
| `negative_prompt` is undocumented on **both** Kling endpoints | Likely a silent no-op, meaning `KLING_NEGATIVE_DEFAULT` and its always-visible textarea may do nothing on Kling. Not fixed here; flagged for an A/B check. |
| Deferring references leaves O1 pinned to 5s or 10s | Accepted only if §5.5 is struck at review. |
