# Kling Image-to-Video Integration Design

**Date:** 2026-07-11
**Linear:** YUV-168
**Status:** Approved

---

## Goal

Add Kling as a selectable video generation model in the existing Video Gen node, supporting all six Kling model versions (v1.5 through v3). Users pick Kling from the model picker, assign a start frame image, and generate — identical workflow to Veo/Sora.

Image-to-video only. No text-to-video, no new node type.

---

## Architecture

Kling plugs into the existing provider pattern:

```
registry.ts          → 6 new model entries (kling:kling-v1-5 … kling:kling-v3)
client-models.ts     → 6 new client specs (label, params, imageInputs)
providers/kling.ts   → generate(): JWT auth, POST to Kling API, register callback_url
params/kling.ts      → klingLegacyParams (v1.x/v2.x) + klingV3Params (v3)
cost.ts              → Kling pricing per model (per-second USD)
webhooks/generation  → new ?provider=kling branch: lookup by externalTaskId, map payload
video-generate route → save externalTaskId (Kling task_id) to generations row
```

No new node types. No UI changes beyond what the model picker already handles automatically.

---

## Models

| Registry key | Label | Param spec | Notes |
|---|---|---|---|
| `kling:kling-v1-5` | Kling 1.5 | klingLegacyParams | Cheapest |
| `kling:kling-v1-6` | Kling 1.6 | klingLegacyParams | |
| `kling:kling-v2-1` | Kling 2.1 | klingLegacyParams | |
| `kling:kling-v2-1-master` | Kling 2.1 Master | klingLegacyParams | |
| `kling:kling-v2-6` | Kling 2.6 | klingLegacyParams | |
| `kling:kling-v3` | Kling 3.0 | klingV3Params | Flagship; 3–15s duration |

All 6 share the same provider (`kling`). The `model_name` sent to the API is the key suffix (e.g. `kling-v1-5`).

**Image inputs (all models):** `startFrame: true`, `endFrame: false`, `maxReferenceImages: 0`.

---

## Params

### klingLegacyParams (v1.5, v1.6, v2.1, v2.1-master, v2.6)

| Param | Component | Valid values | Default |
|---|---|---|---|
| `mode` | select | `std`, `pro` | `pro` |
| `duration` | select | `5`, `10` | `5` |
| `aspect_ratio` | select | `16:9`, `9:16`, `1:1` | `16:9` |
| `cfg_scale` | slider | `0`–`1`, step `0.1` | `0.5` |
| `negative_prompt` | text | free text | `""` |
| `pan` | slider | `-10`–`10` | `0` |
| `tilt` | slider | `-10`–`10` | `0` |
| `zoom` | slider | `-10`–`10` | `0` |
| `roll` | slider | `-10`–`10` | `0` |
| `horizontal_movement` | slider | `-10`–`10` | `0` |
| `vertical_movement` | slider | `-10`–`10` | `0` |

### klingV3Params (v3 only)

Same as above except `duration` is a select with values `3` through `15` (all integers, 13 options).

---

## Pricing

| Model | USD/sec (approx) |
|---|---|
| kling-v1-5 | $0.030 |
| kling-v1-6 | $0.040 |
| kling-v2-1 | $0.060 |
| kling-v2-1-master | $0.080 |
| kling-v2-6 | $0.100 |
| kling-v3 (std) | $0.120 |
| kling-v3 (pro) | $0.180 |

Cost is computed in `cost.ts` via `computeVideoCost(modelId, durationSeconds, audioEnabled)`. Since we don't expose audio for Kling, `audioEnabled` is always `false`. The `mode` param (std/pro) affects v3 pricing — `computeVideoCost` will need to accept an optional `mode` param or we track a blended rate for v3.

**Decision (D-kling-1):** Use the `pro` rate for v3 cost tracking (since `pro` is the default). This slightly overestimates std cost — acceptable for now.

---

## Authentication

Kling uses JWT (HS256) generated server-side from an Access Key + Secret Key pair obtained from the Kling developer platform.

```
Header:  { alg: "HS256", typ: "JWT" }
Payload: { iss: KLING_ACCESS_KEY, exp: now + 1800, nbf: now - 5 }
Signed with: KLING_SECRET_KEY
```

Token is generated fresh per request (30-min TTL is well within task duration). Generation happens in `providers/kling.ts` using the `jose` package (already in the ecosystem via Next.js auth dependencies) or `jsonwebtoken`.

New env vars: `KLING_ACCESS_KEY`, `KLING_SECRET_KEY`.

---

## Generate Flow

1. `video-generate` API route resolves model, params, image URLs — same as today
2. `providers/kling.ts` `generate()`:
   a. Fetch start frame image → base64 (same `fetchAsBase64` helper pattern as Veo)
   b. Generate JWT token
   c. POST `https://api.klingai.com/v1/videos/image2video` with:
      - `model_name`, `image_url` (base64), `prompt`, `duration`, `aspect_ratio`, `mode`, `cfg_scale`, `negative_prompt`, camera motion params
      - `callback_url: ${APP_URL}/api/webhooks/generation?provider=kling`
   d. Return `{ externalTaskId: task_id }` to the Trigger.dev task
3. Trigger.dev task saves `externalTaskId` to the `generations` DB row and exits — no polling loop
4. Kling POSTs to the webhook on completion

---

## Webhook Completion

Kling's callback payload:
```json
{
  "task_id": "abc123",
  "task_status": "succeed",
  "task_status_msg": "",
  "task_result": {
    "videos": [{ "url": "https://...", "duration": "5.0" }]
  }
}
```

The `/api/webhooks/generation` route gets a new branch triggered by `?provider=kling`:

1. Extract `task_id` from body
2. Look up `generations` row by `externalTaskId = task_id`
3. Map to internal shape:
   - `task_status === "succeed"` → `status: "succeeded"`, `videoUrl: task_result.videos[0].url`
   - `task_status === "failed"` → `status: "failed"`, `error: task_status_msg`
4. Call existing `completeGeneration({ generationId, status, videoUrl, durationSeconds })`

The existing Trigger.dev path (`body.generationId` present) is unchanged.

**Webhook security:** Public for now (no secret verification). Can add `?secret=WEBHOOK_SECRET` in a follow-up.

---

## Database Change

`generations` table needs an `externalTaskId` column (nullable text) to store Kling's `task_id` for webhook lookup.

Migration: `ALTER TABLE generations ADD COLUMN external_task_id TEXT;`

---

## New Files

| Path | Description |
|---|---|
| `src/lib/video-gen/providers/kling.ts` | Provider: JWT generation, API call, base64 image fetch |
| `src/lib/video-gen/params/kling.ts` | klingLegacyParams + klingV3Params |

## Modified Files

| Path | Change |
|---|---|
| `src/lib/video-gen/registry.ts` | Add 6 Kling model entries |
| `src/lib/video-gen/client-models.ts` | Add 6 Kling client specs |
| `src/lib/video-gen/cost.ts` | Add Kling pricing table |
| `src/app/api/nodes/[id]/video-generate/route.ts` | Save `externalTaskId` to generations row |
| `trigger/video-generate.ts` | Return `externalTaskId` from provider, persist it |
| `src/app/api/webhooks/generation/route.ts` | Add `?provider=kling` branch |
| `src/lib/generations/complete.ts` | Accept lookup-by-externalTaskId path if needed |
| `.env.example` | Add `KLING_ACCESS_KEY`, `KLING_SECRET_KEY` |
| Supabase migration | Add `external_task_id` column to `generations` |

---

## Acceptance Criteria

- [ ] All 6 Kling models appear in the Video Gen node model picker
- [ ] Selecting a Kling model and clicking Generate sends the start frame + compiled prompt to Kling API
- [ ] Job runs asynchronously — tray shows in-progress and succeeded/failed states correctly
- [ ] Generated video appears on the Video Gen node on completion via webhook
- [ ] Kling-specific params (duration, aspect ratio, mode, cfg_scale, negative_prompt, camera motion sliders) appear in the controls panel when Kling is selected
- [ ] Switching to/from Kling works without errors (compatible params preserved, incompatible reset)
- [ ] Cost is recorded correctly using Kling's per-second pricing
- [ ] v3 duration options show 3–15s; v1.x/v2.x show 5s/10s only

---

## Open Questions (resolved)

- **Which models?** All 6: v1.5, v1.6, v2.1, v2.1-master, v2.6, v3
- **API key format?** AK + SK from Kling developer platform, JWT generated server-side
- **Polling vs webhook?** Webhook-first (Kling posts to our endpoint on completion)
- **Motion controls?** Kling-specific raw sliders (pan, tilt, zoom, roll, h/v movement) as additional params
- **cfg_scale / negative_prompt?** Both exposed as Kling-specific params
- **Webhook security?** Skip for now, add in follow-up
