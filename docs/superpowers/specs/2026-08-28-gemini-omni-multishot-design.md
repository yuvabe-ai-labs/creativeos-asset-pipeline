# Gemini Omni 1.1 Flash — multi-shot video generation, script cast, and two-way parsing

*Design spec — 2026-08-28. Decisions land in the ADR log as D184–D192.*

---

## 1. What this builds

Four coupled changes, in dependency order:

1. **A Gemini Omni provider** (`gemini:gemini-omni-1.1-flash`) in the video-gen registry, with
   its params, constraint rules, and cost rows.
2. **Two-way script parsing** — one canonical parse, two planners. A `per-shot` planner (one
   generation per script shot, today's behaviour) and a `multi-shot` planner that packs shots
   into ≤10s timecode blocks for models that cut natively.
3. **A cast on the Script node** — named characters, props and style anchors with reference
   images, seeded by the parse, copied into each forked Shot.
4. **Three image-preview surfaces** — inline thumbnails in the generated prompt, a cast strip
   on the Script focus view, and a storyboard filmstrip for planned blocks.

**Out of scope, deliberately:** the extend chain (`task: "extend"`, 40s), stateful edit turns
(`previous_interaction_id`), and video references (`<VIDEO_REF_N>`). Rationale in §10.

---

## 2. Model facts

Target: **`gemini-omni-1.1-flash`** (stable, August 2026), not `gemini-omni-flash-preview`.

| Property | Value |
|---|---|
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/interactions` |
| Auth | `x-goog-api-key: $GOOGLE_GENAI_API_KEY` — the same key Veo already uses |
| Duration | 3–10s, default 8. **Always send it explicitly.** |
| Resolution | `360p` / `720p` (default) / `1080p` / `4k` — 1080p and 4k are *upscaled*, not native |
| Aspect ratio | `16:9` (default) / `9:16` only — no 1:1 |
| Frame rate | 24fps |
| Audio | generated **always**; steerable only in prose; no voice control of any kind |
| Multi-shot | **default behaviour** — the model invents cuts unless told not to |
| Negative prompt | **no field** — negatives are inline sentences |
| Image role tags | `<FIRST_FRAME>`, `<LAST_FRAME>` (requires first), `<IMAGE_REF_N>` (**0**-based) |
| Price / second | 360p $0.03 · 720p $0.10 · 1080p $0.15 · 4k $0.30 |

`ref/multishot-refs/gemini-omni-flash-system-prompt.md` documents the **preview** model and its
§2 and §11 assert "720p only", "no end frame", "no extension" as hard rules. Against 1.1 those
are wrong. Updating that file is part of this work (§9d).

### 2a. Known instability

The open reports on the Google AI Developers Forum are all **video-input** paths:

- [Every Interactions request with a video input 400s since ~2026-07-28](https://discuss.ai.google.dev/t/omni-flash-400-errors-with-video/176431)
- [Video + reference image → 400 `invalid_request`](https://discuss.ai.google.dev/t/gemini-omni-flash-preview-video-image-input-returns-400-invalid-request/176803)
- [Video edits fail during polling with a malformed `blobstore://` URI](https://discuss.ai.google.dev/t/gemini-omni-flash-preview-video-edit-fails-during-polling-with-malformed-blobstore-genai-api-blobref-uri-distinct-from-the-july-28-regression/178204)

This pipeline sends images only, so none of them are on our path. They are also the reason
video references and the edit chain stay out of scope: both are exactly the broken surface.

Safety filters reject benign creative prompts intermittently and **consume credits without
refund**. Budget for rejected generations; keep prompts plainly descriptive.

---

## 3. The provider

`src/lib/video-gen/providers/gemini-omni.ts`.

### 3a. Raw `fetch`, not the SDK

`@google/genai@2.9.0` exposes `ai.interactions`, but its interactions `GenerationConfig` has no
`video_config` field and `ResponseFormat` degrades to `{[k: string]: any}`. The entire video path
is untyped, so the SDK buys casts and no type safety. `kling.ts` already establishes the
fetch-and-poll provider shape in this codebase; this follows it.

### 3b. Request

```jsonc
{
  "model": "gemini-omni-1.1-flash",
  "input": [
    { "type": "image", "data": "<base64>", "mime_type": "image/jpeg" },
    // … more images, in the order buildOmniInput fixes …
    { "type": "text", "text": "<rendered prompt>" }
  ],
  "generation_config": { "video_config": { "task": "…", "resolution": "720p", "duration": 8 } },
  "response_format": { "type": "video", "aspect_ratio": "16:9", "delivery": "uri" },
  "store": false, "background": false, "stream": false
}
```

`task` is set explicitly rather than inferred: `image_to_video` when a first frame is present,
`reference_to_video` when only references are, `text_to_video` when neither.

`store: false` is correct **only because the edit chain is out of scope** — it forfeits
`previous_interaction_id` editability. If the edit chain is ever added, this must flip to `true`.

### 3c. Response and delivery

`delivery: "uri"` **always**, not only above 4MB. The response's `output_video.uri` points at a
Files API object; the provider polls `GET /v1beta/files/{id}` until `state === "ACTIVE"` (failing
on `FAILED`) and returns that URI as `videoUrl`.

Downstream needs no new machinery: `completeGeneration` already downloads from a provider URI and
re-uploads to GCS, and `buildVideoDownloadHeaders` already sends `x-goog-api-key` — for `veo:`
models. It gains a `gemini:` branch. That is the only edit outside the video-gen module.

Reading the raw REST response: `output_video` is an SDK-only convenience field. Over REST the
video lives in `steps[]` — find the `model_output` step and its `video`-typed content entry.

### 3d. Shared image fetching

Omni takes base64; our images are Supabase HTTPS URLs. `fetchAsBase64` in `veo.ts` does exactly
this job. Extract it to `src/lib/video-gen/providers/fetch-as-base64.ts` and have both import it —
two call sites, per the reusability rule in AGENTS.md.

### 3e. Model spec

```ts
export const geminiOmni: VideoGenModelSpec = {
  id: "gemini:gemini-omni-1.1-flash",
  provider: "gemini",              // new member of the provider union
  label: "Gemini Omni 1.1 Flash",
  pickerLabel: "Omni 1.1",
  providerLabel: "Google",
  maxDurationSeconds: 10,
  imageInputs: { startFrame: true, endFrame: true, maxReferenceImages: 6 },
  params: geminiOmniParams,
  rules: [lastFrameNeedsFirstFrame],
  generate: generateWithOmni,
};
```

`maxReferenceImages: 6` is the highest count Google's own documented example demonstrates. It is
**not** a stated cap, and the code says so in a comment rather than presenting it as a limit.

Unlike Veo, frames and references are **not** mutually exclusive — no `refs-lock-duration` style
rule. The one rule is structural:

```ts
{ id: "last-frame-needs-first-frame",
  when: { op: "and", conditions: [
    { field: "hasEndFrame",   op: "eq", value: true },
    { field: "hasStartFrame", op: "eq", value: false } ] },
  effect: { disableGenerate: true },
  reason: "<LAST_FRAME> requires <FIRST_FRAME> — Omni cannot use an end frame alone." }
```

The provider throws the same condition as a named error, so a caller bypassing the UI gets a clear
message rather than a 400 minutes later — the pattern `generateWithKling` already uses.

---

## 4. Image roles and the two indexing bases

This is the part that silently produces wrong output if it drifts, so it has exactly one owner:
`buildOmniInput()`, derived from `assignImageRoles()`, unit-tested.

The provider **always emits the explicit declaration form**. Simple inline tags are never used,
even when roles look unambiguous:

```
[# Sources <FIRST_FRAME>@Image1 <LAST_FRAME>@Image2] [# References <IMAGE_REF_0>@Image3 <IMAGE_REF_1>@Image4]

<prompt text, with <FIRST_FRAME> / <IMAGE_REF_N> tags inline where each subject is named>

Use Image1 as the starting frame. Use the given images as references for video generation.
The images should not be used as literal initial frames.
```

**Why explicit, always.** The header carries two different index bases at once: `@ImageN` is
**1-based over the whole upload array**, while `<IMAGE_REF_N>` is **0-based over the references
sub-array only**. Kling's `@image_1` is 1-based, and mixing the two silently points every mention
at the wrong asset. No human and no LLM ever writes this header — code derives both bases from one
ordered array, so they cannot disagree.

**Input order is the contract:** `[firstFrame?, lastFrame?, ...references]`, then the text part
last. `<IMAGE_REF_N>` indexes into the references sub-array; `@ImageN` counts the whole array
from 1.

Unassigned images are dropped, unchanged from `assignImageRoles` (D182).

---

## 5. Params

`src/lib/video-gen/params/gemini-omni.ts`.

| name | component | values | default | group |
|---|---|---|---|---|
| `resolution` | select | `360p` `720p` `1080p` `4k` | `720p` | primary 0 |
| `duration` | slider 3–10 step 1 | | `8` | primary 1 |
| `aspect_ratio` | select | `16:9` `9:16` | `16:9` | primary 2 |
| `continuous_take` | toggle | | `false` | primary 3 |
| `audio` | select | `ambient` `dialogue` `music` | `ambient` | primary 4 |
| `negative_prompt` | textarea | | Gemini-tuned list | primary 5 |

Everything is `primary` — the Advanced accordion was deleted from the focus view in `7e1c643`, so
an `advanced` group renders nowhere. That is the same trap `aspect_ratio` fell into on Kling O1.

**Three of these are prompt text, not API fields**, and the file says so loudly:

- **`continuous_take`** — the inversion. Omni multi-shots by default; this suppresses it by
  appending *"In a single unbroken scene. No scene cuts."* Note the **default is the opposite of
  Kling's `multi_shot`**: Kling opts *into* cutting, Omni opts *out*. Same intent, inverted switch.
- **`audio`** — always on, never off; the model generates a track regardless, so this steers it
  rather than switching it. Each value appends an exact clause:
  - `ambient` → `Sound design: ambience and foley only.` + `No dialogue.` + `No extra sound effects.`
  - `dialogue` → `Sound design: ambience, foley and natural dialogue.`
  - `music` → `Sound design: ambience and foley, with a music bed.` + `No dialogue.`

  `ambient` is the default because there is **no voice control of any kind** — no reference upload,
  no cloning, no fixing a voice in a later turn — so a narrator differs between generations and
  cannot be corrected. Any deliverable spanning more than one generation lays one continuous VO
  and one continuous music bed in the edit instead.
- **`negative_prompt`** — no field exists. Folded into the prompt as sentences, reusing the exact
  shape `composeVeoPrompt` uses for Veo Lite (D183): its own trailing paragraph, so the
  comma-separated defect list cannot read as a continuation of the shot description.

`resolution`'s description states that 1080p and 4k are upscaled, and that 360p at $0.03/s is the
draft tier — a script fanning out to six generations costs $4.80 at 720p/8s and $1.44 at 360p.

---

## 6. Cost

In `cost.ts`, rename `VEO_RESOLUTION_PRICING` → `RESOLUTION_ONLY_PRICING` (it is not Veo-specific:
it is the shape for models priced by resolution where audio does not move the price) and add:

```ts
"gemini:gemini-omni-1.1-flash": { "360p": 0.03, "720p": 0.10, "1080p": 0.15, "4k": 0.30 },
```

Audio is always generated and always included in the rate, so `computeVideoCost`'s existing strict
lookup — no cross-key fallback, `null` for an unpriced combination — holds unchanged.

---

## 7. Two-way script parsing

### 7a. One parse, two planners

The parse stays canonical and untouched. Planning is a **separate, cheap, re-runnable step** over
the already-parsed `shots[]`.

```
Script.source
   └─ parse (LLM, once)  →  ReelScript.visual_script.shots[]     ← canonical
                                 │
                    ┌────────────┴────────────┐
             planMode:"per-shot"       planMode:"multi-shot"
             identity planner          LLM planner + guardrails
             1 shot = 1 block          shots packed into ≤10s blocks
                                 │
                          fork: 1 Shot node per block
```

Toggling `planMode` never re-parses, never costs a parse call, and never discards manual edits to
the parsed script. `per-shot` runs **no LLM call at all** — it is the identity planner.

### 7b. Data

```ts
// ScriptNodeData
planMode?: "per-shot" | "multi-shot";   // default "per-shot"
plan?: ShotPlan;

// src/lib/nodes/shot-plan.ts
type ShotPlan  = { blocks: PlanBlock[] };
type PlanBlock = { order: number; duration: number; beats: PlanBeat[] };
type PlanBeat  = { from: number; to: number; shotIndexes: number[]; text: string };
```

### 7c. The planner prompt

`src/prompts/shot-plan.ts` — a versioned, evaluable record in the same shape as
`script-parse.ts`. Input is the parsed shots plus `voiceover`, `on_screen_text` and the target
model's max block seconds. Its rules:

- Cut at **narrative seams** — VO sentence ends, SUPER changes, act turns.
- **Never split** a single VO sentence, a continuous camera move, or a match cut across blocks.
- Inside a block, take the largest coherent span. The reason to split further is narrative, not
  arithmetic — a fast-cut montage that needs several generations on a shot-capped model often
  fits one block here.
- Express sub-second beats in frames at 24fps ("every half a second (12 frames at 24fps)"), which
  the model reads more reliably than "0.5s".

### 7d. Guardrails — "smart" without being trusted

`src/lib/nodes/shot-plan.ts` is pure and unit-tested, and validates every returned plan:

| # | Invariant | Scope | Catches |
|---|---|---|---|
| 1 | **Σ block durations = Σ shot durations** | whole plan | silently dropped footage |
| 2 | **Each shot's allocated time = its parsed duration** | per shot | a 5s beat quietly compressed to 3s |
| 3 | Every shot index accounted for, in order | whole plan | a shot omitted, duplicated or reordered |
| 4 | Block `duration` within the model's range (3–10) | per block | a request over the hard ceiling |
| 5 | Beats contiguous — `beats[0].from === 0`, each `from` equals the previous `to` | per block | gaps and overlaps in the ladder |
| 6 | Final `to` equals the block's `duration` | per block | a truncated ending at full price |

**Invariants 1 and 2 are the ones that matter most, and they are the ones a per-block check misses.**
A plan can satisfy 4–6 in every block and still lose four seconds of script: give a block three
shots totalling 13s, write a 9s ladder over them, and every per-block check passes while nothing
downstream ever generates the missing 4s. Conservation has to be asserted across the whole plan,
not inside each block.

**The one exception to "a shot belongs to one block":** a shot longer than the ceiling cannot fit a
single generation, so it may span blocks — but only at a beat boundary, and invariant 2 still holds
over its combined allocation.

A plan failing any check is **rejected**, and a deterministic seam-packer runs instead: walk the
shots in order, accumulate parsed durations, close a block before it would exceed the ceiling, and
open the next one with the leftover. A bad ladder is never shipped, and the fallback is legible
rather than silent — the UI says the planner was overridden.

**Fewer generations is not the goal; conserving the script is.** A 22s reel of 4+5+4+5+4 shots is
three blocks (9s, 9s, 4s), not two — shots 3–5 total 13s and cannot share one generation.

### 7e. Fork

Fork creates one Shot node per **block**. `ShotNodeData.seededFrom.shotIndex: number` becomes
`shotIndexes: number[]`; the per-shot planner yields single-element arrays, so the existing
provenance label needs no special case.

---

## 8. The cast

### 8a. Data

```ts
type CastMember = {
  id: string;
  name: string;
  kind: "character" | "prop" | "style";
  description?: string;
  imageUrl?: string;
  fileName?: string;
};

ScriptNodeData += cast?: CastMember[];   // ordered
ShotNodeData   += cast?: CastMember[];   // copied at fork
```

**`kind` is not decoration.** Omni assigns a reference's role *by the sentence the tag sits in* —
the vendor's own example splits style and subject across two tags in one prompt. `kind` is what
lets the renderer write `in the style of <IMAGE_REF_0>` for a style anchor and
`the woman <IMAGE_REF_1>` for a character. Without it the tag syntax's most useful property is
unreachable.

### 8b. Seeding from the parse

`script-parse.ts` gains `cast: [{ name, kind, description }]` — **names only, no images** — and
bumps to **version 2**. The first parse seeds `ScriptNodeData.cast`; thereafter the cast is
operator-owned (add, rename, re-kind, upload, reorder, delete).

**A re-parse merges by name and preserves uploaded images.** A new name is appended; a name that
disappears from the script is kept, not deleted — the operator may have renamed a character in the
cast deliberately. Nothing destroys an upload.

### 8c. Copied at fork, per D21

The Shot node carries a copy, exactly as it already carries a copy of the script.
`resolveShotComposeInputs` deliberately never walks the Script→Shot edge (seed-and-fork), so a
cast that lived only on the Script node would never reach a generation.

**Accepted cost:** editing a cast image at script level after forking does not propagate to
already-forked Shots. This is the same trade the script text already makes, so the model stays
uniform rather than growing a second, live-propagating channel.

### 8d. Reaching the generation

Cast images are **injected into the video-gen node's upstream image list**, each tagged with its
`castId` and `castName`. `UpstreamImage` gains those two optional fields.

This is the whole point of the choice: `assignImageRoles`, the role chips, `buildConstraintState`,
the reference cap and the shot spine all keep working untouched. **A cast member is just an image
input that knows its own name** — it gets Start / End / Ref chips like any other, and its chip is
labelled "Priya" instead of "image-gen".

### 8e. The cast is not the only source — merge order is fixed

A reference may also come from an image node connected **directly** to the video-prompt or
video-gen node, bypassing the cast entirely. That already works today and keeps working: the cast
is the reusable, script-level channel; a direct connection is a one-off for this node only. Both
land in the same list and are indistinguishable to `assignImageRoles`.

Because `<IMAGE_REF_N>` is **positional**, a mixed list needs a fixed order or the indices shift
underneath the operator. The order is:

1. **Cast members**, in cast order.
2. **Direct connections**, in canvas connection order, after the cast.

Cast-first is what makes it safe: appending a one-off reference only ever adds an index at the
end, and can never renumber a cast member that a dozen prompts already mention. The reverse order
would re-point every existing mention the moment a node was connected.

**`kind` for a direct reference.** A directly-connected image has no cast entry and therefore no
`kind`, so the Omni renderer cannot choose between style and subject phrasing. It defaults to
**subject**; the role row carries a small kind selector for the cases where a one-off is really a
style anchor.

### 8f. Frames are tags, and they are block-level

Omni has **no start-frame or end-frame parameter** — `<FIRST_FRAME>` and `<LAST_FRAME>` are tags
in the generated declaration header (§4), and `<LAST_FRAME>` requires `<FIRST_FRAME>` (the one
constraint rule in §3e). The model's *conversational* character is `previous_interaction_id`
editing, a separate axis, out of scope per §10.

Multi-shot adds two rules:

- **A frame belongs to the block, not the beat.** `<FIRST_FRAME>` is the first frame of the whole
  9s block, not of each cut inside it. There is no way to pin a frame to beat 2.
- **An end frame fights a cut ladder.** Asking the model to land an exact final frame *after* it
  has invented cuts is close to incoherent. When `planMode` is `multi-shot` and a block has more
  than one beat, assigning an end frame **warns** — it does not block, because a deliberate
  operator may still want it.

**Continuity across blocks chains forward, with machinery that already exists.**
`derive-end-frame.ts` already extracts a generated video's last frame into a new image node. Block
N's derived end frame becomes block N+1's `<FIRST_FRAME>` — real state transfer, carrying grade,
light direction and grain that no repeated adjective will. Nothing new is needed to make this
work; only to surface it in the storyboard strip (§9 UI).

---

## 9. Prompt generation

### 9a. A third provider variant

`videoPromptGenerateOmniPrompt` joins the Veo and Kling variants in
`src/prompts/video-prompt-generate.ts`, routed by the existing
`videoPromptGeneratePromptFor(provider)`. `VideoProvider` gains `"gemini-omni"`.

Its system text is Omni-shaped rather than the shared i2v spine: a meta-prompting line, a **LOOK
block** repeated verbatim across every generation in a campaign, a timecode ladder, a
`Sound design:` clause, and inline negatives at the end. The shared `SPINE`'s "roughly 8 seconds,
one prose paragraph" framing is wrong for a model whose prompt *is* the storyboard, so this
variant does not import it.

### 9b. The LLM never does index arithmetic

The generator emits **`@[Priya](cast-id)` tokens** — the existing mention format — and never a raw
`<IMAGE_REF_N>`. Index assignment happens once, in code, at render time.

`resolve-mention-tokens.ts` grows a provider-aware renderer:

| provider | a mention renders as |
|---|---|
| `veo` / `sora` | `the first image` — existing `ordinalToEnglish`, unchanged |
| `kling` | `@image_1` — **1**-based |
| `gemini-omni` | `<IMAGE_REF_0>` — **0**-based, plus the generated declaration header and the closing guiding instruction |

One function decides indexing for all three providers, so the bases cannot diverge. Indices are
computed **per generation**, over only the references actually being sent — not over the whole
script cast — because the reference cap and the operator's role assignment decide what ships.

### 9c. Reference discipline, carried into the prompt

The Omni system prompt states two rules the model rewards:

- **Name a reference in every beat it appears in**, not once at the top.
- **Never describe a referenced subject's design in prose** — the tag carries it, and competing
  prose produces a hybrid. Describe what the image cannot: framing, motion, light, wardrobe,
  ground contact.

### 9d. Updating the reference doc

`ref/multishot-refs/gemini-omni-flash-system-prompt.md` is preview-era and asserts preview limits
as absolutes. It gets a version banner naming which model each section describes, and §2/§11/§12
are corrected for 1.1 (resolution range, `<LAST_FRAME>`, extension). Left as-is it will mislead
the next session that reads it.

---

## 10. What is out of scope, and why

| Excluded | Why |
|---|---|
| **Extend chain** (`task:"extend"`, 3×10s → 40s) | Needs interaction-id persistence on the version record and a new chain UI. Real feature, own spec. Note `store:false` in §3b must flip to `true` when it lands. |
| **Stateful edit turns** (`previous_interaction_id`, `task:"edit"`) | Currently failing during polling with a malformed `blobstore://` URI. Would need a re-generate fallback for every edit turn. |
| **Video references** (`<VIDEO_REF_N>`) | Exactly the input path the open 400 regression kills, and this pipeline has no video-input source today. |

---

## 11. Testing

Pure units, colocated in `__tests__/` per the existing convention:

- `buildOmniInput` — input ordering, the declaration header's two index bases, `task` selection,
  frames-without-references and references-without-frames shapes.
- `renderMentionsForProvider` — all three providers, asserting `veo` → ordinal, `kling` → 1-based,
  `gemini-omni` → 0-based, over the same fixture.
- `validateShotPlan` / `packShotsDeterministically` — **each of the six invariants rejects
  independently**, with a dedicated case for the failure this spec itself made: a plan whose blocks
  are each internally valid but whose totals lose 4s of script must be rejected by invariant 1
  alone. Plus the over-ceiling shot spanning two blocks, and the fallback packer's own output
  re-validated against all six.
- `mergeReferenceSources` — cast-then-direct ordering; appending a direct ref leaves every cast
  index unchanged; a direct ref defaults to `kind: "character"` phrasing.
- `mergeCastFromParse` — new name appended, existing image preserved, vanished name kept.
- `computeVideoCost` — all four Omni resolutions; unpriced combination returns `null`.
- `composeOmniPrompt` — `continuous_take` appends the suppression line, `audio` appends the right
  clause, `negative_prompt` lands as its own trailing paragraph and is absent when blank.

Per the memory note, verify per-directory rather than by a full `vitest` run — the full run has
~11 timeout flakes in API-route tests that pass in isolation.

---

## 12. Risks

1. **`duration`'s wire shape is unverified.** The docs disagree — integer `8` versus string
   `"8s"`. It is the one field certain to 400 on a first call. **Step 1 of implementation is a
   single live generation to settle it**, before any provider code is written.
2. **Omni is paid-tier only.** `GOOGLE_GENAI_API_KEY` is already paid-tier for Veo, so access is
   expected — but unconfirmed until that first call.
3. **1080p and 4k are upscales.** 1.5× and 3× the price for no extra native detail. Default 720p,
   and `resolution`'s description says so.
4. **Safety rejections consume credits.** The reservation/refund path in `completeGeneration`
   handles a failed generation, but a *filtered* prompt still bills at Google. Worth a note in
   the UI once observed.
5. **Preview-era reference docs** (§9d) will mislead future sessions if not corrected.

---

## 13. Files

**New**
```
src/lib/video-gen/providers/gemini-omni.ts
src/lib/video-gen/providers/fetch-as-base64.ts
src/lib/video-gen/params/gemini-omni.ts
src/lib/nodes/shot-plan.ts
src/prompts/shot-plan.ts
src/components/nodes/script-cast-strip.tsx
src/components/nodes/prompt-mention-preview.tsx
src/components/nodes/shot-plan-storyboard.tsx
```

**Modified**
```
src/lib/video-gen/types.ts              provider union += "gemini"
src/lib/video-gen/registry.ts           register geminiOmni
src/lib/video-gen/client-models.ts      client mirror of the spec
src/lib/video-gen/cost.ts               RESOLUTION_ONLY_PRICING rename + Omni row
src/lib/video-gen/providers/veo.ts      import extracted fetchAsBase64
src/lib/video-gen/api.ts                UpstreamImage += castId, castName
src/lib/generations/complete.ts         buildVideoDownloadHeaders += "gemini:"
src/lib/canvas-nodes.ts                 ScriptNodeData += cast/planMode/plan; ShotNodeData += cast
src/lib/nodes/reel-script.ts            ReelScript += cast
src/lib/nodes/resolve-mention-tokens.ts provider-aware renderer
src/prompts/script-parse.ts             cast in schema, version 2
src/prompts/video-prompt-generate.ts    Omni variant, VideoProvider += "gemini-omni"
src/components/nodes/mention-instruction-editor.tsx  export parseSegments for reuse
src/components/nodes/script-focus-view.tsx           cast strip + plan toggle + storyboard
ref/multishot-refs/gemini-omni-flash-system-prompt.md  version banner + 1.1 corrections
```

---

## 14. Build order

1. Verify `duration`'s wire shape with one live call.
2. Provider + params + cost + registry (§3–§6) — shippable alone, usable with hand-written prompts.
3. Cast on the Script node (§8) — shippable alone, improves every provider's references.
4. Two-way parsing and the planner (§7).
5. The three preview surfaces (§8 UI, §9).

Each step leaves the app working.
