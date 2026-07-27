# Kling API Correction — Design

> **Supersedes:** `2026-07-11-kling-video-gen-integration-design.md` and its plan
> `docs/superpowers/plans/2026-07-11-kling-video-gen-integration.md`. Both were built
> with no citation and no working link, against an API shape that turned out to be a
> close-but-wrong mix of two real, separate Kling API generations (see "Two API
> generations" below). Net effect is the same either way: nothing in the old code works.
> This spec replaces the Kling integration end to end, using official docs the user
> fetched directly from `kling.ai/document-api/`.

## Problem

The 6 Kling models live on `main` today (`kling:kling-v1-5/v1-6/v2-1/v2-1-master/v2-6/v3`)
call the wrong host with a body shape that doesn't validate against either real Kling API
generation (see below). Every Kling generation in production is broken. This spec
rebuilds the integration against verified docs for 5 models.

## Two API generations (why the old code half-looked right)

Kling currently runs two separate API generations side by side:

1. **Legacy unified endpoint** — `POST /v1/videos/image2video`, one endpoint for every
   model version via a `model_name` body field (`kling-v1` … `kling-v2-1-master` …
   `kling-v3`). This is where `cfg_scale`, `camera_control`, `mode: std|pro|4k`,
   `sound`, `multi_shot`, `element_list`, `voice_list` actually live — so the old
   code's fields weren't fabricated, they were reaching for this endpoint's shape.
   What was still wrong even for this endpoint: host (`api.klingai.com` instead of
   `api-singapore.klingai.com`), `image` sent as `{ type, value }` instead of a raw
   base64/URL string, and `camera_control.type` (required, e.g. `"simple"`) was never
   set — so the requests would fail validation even if pointed at the right host.
2. **Dedicated per-model endpoints** — `POST /image-to-video/kling-3.0-turbo`,
   `/image-to-video/kling-2.6`, `/image-to-video/kling-2.5-turbo`,
   `/image-to-video/kling-3.0`, `/omni-video/kling-o1`. Different envelope entirely
   (`contents[]`/`settings`/`options`), no `cfg_scale`/`camera_control`/`mode` at all.

This spec targets **generation 2 only** (the 5 latest models) — see Scope.

## Sources (verified, fetched by user from official docs)

- `kling.ai/document-api/api/video/3-0-turbo/image-to-video`
- `kling.ai/document-api/api/video/2-6/image-to-video`
- `kling.ai/document-api/api/video/2-5-turbo/image-to-video`
- `kling.ai/document-api/api/video/3-0-omni/image-to-video`
- `kling.ai/document-api/api/video/o1/video-omni`
- `kling.ai/document-api/pricing/base/video`
- `kling.ai/document-api/api/video/2-1-master/image-to-video` (legacy endpoint —
  confirms generation 1 is real; not implemented in this pass, see Scope)

## Scope

**In scope:** prompt, first frame (`startFrameUrl`), last frame (`endFrameUrl`) where the
model supports it, and each model's `settings` fields that map to a simple
select/switch/slider (`resolution`, `duration`, `audio`, `multi_shot`). Full polling-based
completion (no webhook). Real per-resolution/per-audio pricing.

**Out of scope (no UI surface exists for these yet — revisit when it does):** voice
cloning (`voice_id`, 2.6 only), Elements (`element_id`, 3.0-omni/o1), video references
(`feature_video`/`base_video`/`refer_image`, o1 only), `aspect_ratio` on o1 (only required
when there's no first frame, which our flow always provides).

**Deliberately out of scope — not because it's undocumented:** the legacy
`/v1/videos/image2video` endpoint and the models only reachable through it
(`kling-v1`, `kling-v1-5`, `kling-v1-6`, `kling-v2-master`, `kling-v2-1`,
`kling-v2-1-master`). These are real and documented (see "Two API generations"), but
this pass targets only the 5 latest-generation models. Revisit if there's a reason to
support the older/cheaper tiers — would need the linked Capability Map page first
(`kling.ai/document-api/guides/capability-map/video`) to know which of that endpoint's
fields actually apply per `model_name`, since the doc repeatedly says support varies by
version and doesn't spell out the per-model matrix.

## Model lineup

Replaces all 6 existing Kling models with the 5 latest-generation ones. No migration
path for the old IDs — `v2-6` and `v3` pointed at the wrong host/shape and never worked;
`v1-5`/`v1-6`/`v2-1`/`v2-1-master` are dropped by choice (see Scope), not because they
don't exist.

| Client ID | Endpoint | `startFrame`/`endFrame` | Max duration |
|---|---|---|---|
| `kling:kling-3-0-turbo` | `POST /image-to-video/kling-3.0-turbo` | true / **false** | 15s |
| `kling:kling-2-6` | `POST /image-to-video/kling-2.6` | true / true | 10s |
| `kling:kling-2-5-turbo` | `POST /image-to-video/kling-2.5-turbo` | true / true | 10s |
| `kling:kling-3-0` | `POST /image-to-video/kling-3.0` | true / true | 15s |
| `kling:kling-o1` | `POST /omni-video/kling-o1` | true / true | 10s |

Base host: `https://api-singapore.klingai.com` (current code has `api.klingai.com` —
wrong host, not just a wrong path).

3.0-turbo has no `last_frame` support — its doc states first-frame-only, no
first+last option.

## Request architecture

All 5 endpoints share one envelope:

```json
{
  "contents": [ /* prompt, first_frame, last_frame? */ ],
  "settings": { /* per-model fields, see below */ },
  "options": { "watermark_info": { "enabled": false } }
}
```

`options.callback_url` is omitted (see Async completion below — we poll, not webhook).
`options.external_task_id` is omitted — we already get the system task `id` back from
the create call and poll by that.

**Shared builder** (`buildKlingContents`, `buildKlingOptions`) constructs `contents[]`
from `{ prompt, startFrameUrl, endFrameUrl }` and the static `options` object — identical
across all 5 models.

**Per-model settings builders** — one small function per model, each reading only the
fields that model supports:

```ts
function build3_0TurboSettings(params): { resolution, duration }
function build2_6Settings(params):      { audio, resolution, duration }
function build2_5TurboSettings(params): { resolution, duration }
function build3_0Settings(params):      { multi_shot, audio, resolution, duration }
function buildO1Settings(params):       { audio, resolution, duration }
```

No generic config/allowlist layer — each function is self-contained and readable without
tracing through shared logic, matching how `veo.ts` and `sora.ts` already keep
provider-specific logic local to their own file.

### Per-model settings fields

| Model | `resolution` | `duration` | `audio` | `multi_shot` |
|---|---|---|---|---|
| 3.0-turbo | 720p / 1080p | 3–15 (default 5) | — (always native, no toggle) | — |
| 2.6 | 720p / 1080p | 5 / 10 | `native` / `off` (default `off`) | — |
| 2.5-turbo | 720p / 1080p | 5 / 10 | — | — |
| 3.0 | 720p / 1080p / 4k | 3–15 (default 5) | `native` / `off` (default `off`) | bool (default `true`) |
| o1 | 720p / 1080p | ~~3–10~~ **5 / 10 only** (default 5) | ~~`original`~~ **`native`** / `off` (default `off`) | ~~—~~ **bool (default `false`)** |

> ⚠️ **The o1 row above was wrong — corrected 2026-07-27, see D81.** It was read off the
> `/omni-video/kling-3.0-omni` doc page, which documents a *different path* than the
> `/omni-video/kling-o1` we call. The live endpoint rejects any duration but 5/10 without a
> `refer_image` (`400` code `1201`), `original` audio only retains a reference video's soundtrack
> (we never send one, so it yielded silence), and omitting `multi_shot` lets Kling's server-side
> `true` default apply. The other four models' rows were re-verified and stand — Kling 3.0's 3–15
> range in particular is confirmed against `/image-to-video/kling-3.0`.

Known interlocking constraints from the docs that this pass does **not** enforce
client-side (left for the API to reject; revisit if users hit them often):
- 2.6: `audio: native` requires 1080p; first+last frame together forces 720p (so those
  two combos are actually mutually exclusive on 2.6 — API will error, we won't pre-block it).
- 2.5-turbo: first+last frame together requires 1080p.

## Param specs & UI

Each model gets a `ParamSpec[]` (existing `primary`/`advanced` group pattern — the
accordion UI in `video-gen-params-panel.tsx` is already generic and needs no changes).

- `resolution`, `duration` → `group: "primary"` (select), same as today's pattern.
- `audio`, `multi_shot` → `group: "advanced"` (select / switch).
- `imageInputs.endFrame` per the table above; `maxReferenceImages: 0` for all (no
  reference-image concept maps to Kling's `refer_image`/Elements in this pass).

`cfg_scale`, `negative_prompt`, `mode`, `pan`/`tilt`/`zoom`/`roll`/`horizontal_movement`/
`vertical_movement` are all removed — none of these fields exist in the real API.

## Async completion — polling, not webhook

`generateWithKling(modelName, input)` becomes self-contained, matching the existing
`generateWithVeo` shape:

1. POST to create → get back `data.id`.
2. Poll `GET /tasks?task_ids=<id>` every ~5s, `logger.info` each iteration (status
   visible in Trigger.dev run logs — this was the original ask: visibility into
   in-flight/failed jobs).
3. On `data[].status === "succeeded"` → return `{ videoUrl: outputs[0].url,
   durationSeconds: Number(outputs[0].duration) }`.
4. On `"failed"` → throw with `data[].message`.

This removes, as dead code (Kling was the only consumer of all of these):
- `src/app/api/webhooks/generation/kling-mapper.ts` + its test
- The `?provider=kling` branch in `src/app/api/webhooks/generation/route.ts`
- `getGenerationByProviderJobId` / `setProviderJobId` in `src/lib/db/generations.ts`
- The `providerJobId` branch in `trigger/video-generate.ts` — Kling now falls through
  the same `postWebhook` completion path Veo/Sora already use
- `VideoGenResult.providerJobId` field

The `provider_job_id` DB column (`0007_generations.sql`) stays — it's general
async-generation infra, not Kling-specific; just unused until another webhook-based
provider needs it.

## Pricing

Real numbers from `kling.ai/document-api/pricing/base/video`, restricted to the tiers
that apply to this pass's scope (no video-input, no voice-control, no motion-control
tiers — none of those are reachable from the params we expose):

```
kling:kling-3-0-turbo → 720p $0.112/s, 1080p $0.14/s          (single "native audio" tier)
kling:kling-2-6       → off:    720p $0.042/s, 1080p $0.07/s
                         native: 1080p $0.14/s only (matches "native requires 1080p")
kling:kling-2-5-turbo → 720p $0.042/s, 1080p $0.07/s
kling:kling-3-0       → off:    720p $0.084/s, 1080p $0.112/s, 4k $0.42/s
                         native: 720p $0.112/s, 1080p $0.14/s, 4k $0.42/s
kling:kling-o1        → off:      720p $0.084/s, 1080p $0.112/s
                         original: 720p $0.112/s, 1080p $0.14/s
```

**Assumption (flagged, not verified):** the o1 "original audio" row isn't split out on
the pricing page (it only splits by video-input, not audio) — the `off`→`original` delta
above is assumed to match the same $0.028/s (720p) / $0.028/s (1080p) step seen on 3.0.
Revisit if this turns out wrong once real invoices come in.

`computeVideoCost(modelId, durationSeconds, audioEnabled)` gains an optional `resolution`
parameter (default behavior unchanged for Veo/Sora, which don't vary by resolution).
Kling's `VIDEO_MODEL_PRICING` entries become resolution-keyed instead of a flat
`perSecond`.

Two call sites need to start passing `resolution` through from `params_snapshot`/
`paramsUsed`:
- `src/lib/generations/complete.ts:95` — currently hardcodes `audioEnabled: false`; needs
  to read the actual `audio` value from `generation.params_snapshot`.
- `src/components/nodes/video-gen-usage-popover.tsx:38` — has a latent bug independent of
  this change: `Boolean(v.paramsUsed?.audio)` is `true` for the string `"off"`. Fix to
  an explicit check for an "audio on" value, e.g.
  `v.paramsUsed?.audio === "native" || v.paramsUsed?.audio === "original"`
  (can't just check non-`"off"`, since the enum differs by model and Veo/Sora's
  `paramsUsed?.audio` may be a real boolean, not this string enum at all).

## File map

| Action | Path |
|---|---|
| Rewrite | `src/lib/video-gen/params/kling.ts` — 5 new param-spec sets |
| Rewrite | `src/lib/video-gen/providers/kling.ts` — contents/options builder, 5 settings builders, poll-based `generateWithKling` |
| Modify | `src/lib/video-gen/registry.ts` — 5 models, not 6 |
| Modify | `src/lib/video-gen/client-models.ts` — 5 models, not 6 |
| Modify | `src/lib/video-gen/cost.ts` — resolution-keyed Kling pricing, `computeVideoCost` signature |
| Modify | `src/lib/video-gen/types.ts` — drop `providerJobId` from `VideoGenResult` |
| Modify | `src/lib/db/generations.ts` — remove `getGenerationByProviderJobId`/`setProviderJobId` |
| Modify | `trigger/video-generate.ts` — remove the `providerJobId` branch |
| Modify | `src/app/api/webhooks/generation/route.ts` — remove `?provider=kling` branch |
| Delete | `src/app/api/webhooks/generation/kling-mapper.ts` + test |
| Delete | `src/lib/video-gen/__tests__/kling-params.test.ts`, `kling-provider.test.ts` (rewritten, not deleted-and-gone — new tests replace them for the new shape) |
| Modify | `src/lib/generations/complete.ts` — pass real `audioEnabled`/`resolution` |
| Modify | `src/components/nodes/video-gen-usage-popover.tsx` — fix `Boolean(audio)` bug, pass `resolution` |

## Testing

Unit tests per model settings-builder (fields present/absent, enum validation), contents
builder (prompt/first_frame/last_frame present/absent), poll loop (mock fetch:
submitted → processing → succeeded, and a `failed` path), cost table (each
model × resolution × audio combination against the numbers above).
