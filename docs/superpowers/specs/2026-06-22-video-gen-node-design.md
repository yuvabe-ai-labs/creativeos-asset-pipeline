# Video Gen Node — Design Spec

**Date**: 2026-06-22
**Status**: Approved

---

## Context

CreativeOS has a `video-prompt` node that compiles a motion prompt (camera move, speed,
shot description) but no node that actually calls a video generation provider. This spec
defines the `video-gen` node type that closes that gap — modeled directly on the
existing `image-gen` node pattern and wired into the async generation architecture
(Trigger.dev + `generations` table + Supabase Realtime).

Provider: **Google Veo 3.1** (Lite / Fast / Quality variants).
OpenAI Sora is deprecated (April 2026). No Kling integration.

---

## Node Type

**Type string**: `"video-gen"`
**Canvas icon**: `Clapperboard` (Lucide), teal (`text-teal-500`)
**Leaf node**: yes — cannot be a source for other nodes

### Upstream Connections

| Source node type | Role in video-gen |
|---|---|
| `video-prompt` | Required — provides the motion prompt text |
| `image-gen` | Optional — default role: **start frame** |
| `file` (image kind) | Optional — user-assignable: start frame / end frame / reference |

Image roles are user-controlled in the focus view. Constraints:
- Max 1 start frame
- Max 1 end frame
- References: unlimited (provider may cap internally)

---

## Model Registry (`src/lib/video-gen/`)

Structure mirrors `src/lib/image-gen/` exactly.

```
src/lib/video-gen/
  types.ts
  registry.ts
  client-models.ts
  cost.ts
  schema-builder.ts     ← reuse existing buildZodFromParams()
  providers/
    veo.ts
  params/
    veo.ts
```

### Types (`types.ts`)

```typescript
type VideoGenInput = {
  prompt: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceUrls: string[];
  params: Record<string, unknown>;
};

type VideoGenResult = {
  videoUrl: string;        // public Supabase Storage URL (.mp4)
  durationSeconds: number; // actual generated duration
};
```

`ParamSpec` is reused from `src/lib/image-gen/types.ts` unchanged.

### Models (`providers/veo.ts`)

| Model ID | Label | Price/sec | Audio multiplier | Max duration |
|---|---|---|---|---|
| `veo:veo-3.1-lite` | Veo 3.1 Lite | $0.05 | 1.5× | 5s |
| `veo:veo-3.1-fast` | Veo 3.1 Fast | $0.10 | 1.5× | 5s |
| `veo:veo-3.1` | Veo 3.1 Quality | $0.30 | 1.5× | 8s |

Default model: `veo:veo-3.1-fast`

### Params (`params/veo.ts`)

| Param | Type | Options | Default |
|---|---|---|---|
| `aspect_ratio` | select | `16:9` \| `9:16` | `16:9` |
| `duration` | select | `5` \| `8` (Quality only) | `5` |
| `audio` | toggle | on \| off | off |

### Cost (`cost.ts`)

```typescript
const VIDEO_MODEL_PRICING: Record<string, {
  perSecond: number;
  audioMultiplier: number;
}> = {
  "veo:veo-3.1-lite":  { perSecond: 0.05, audioMultiplier: 1.5 },
  "veo:veo-3.1-fast":  { perSecond: 0.10, audioMultiplier: 1.5 },
  "veo:veo-3.1":       { perSecond: 0.30, audioMultiplier: 1.5 },
};

// credits_consumed (USD) = durationSeconds × perSecond × (audio ? audioMultiplier : 1)
export function computeVideoCost(
  modelId: string,
  durationSeconds: number,
  audioEnabled: boolean,
): { usd: number; inr: number } | null
```

Uses existing `USD_TO_INR` from `src/lib/pricing.ts`.

---

## Canvas Node Card (`video-gen-node.tsx`)

Mirrors `image-gen-node.tsx`. Differences:

- Renders `<video>` poster frame when `output` exists
- Skeleton pulse while `generating`
- Empty/idle state with Clapperboard icon
- Click opens focus view (no separate zoom modal)
- Upstream stale indicator if connected `video-prompt` has changed since last gen

---

## Focus View (`video-gen-focus-view.tsx`)

Two-panel layout matching `image-gen-focus-view.tsx`.

### Left Panel

1. **Model selector** — dropdown of all `videoGenClientModelMap` entries
2. **Params** — dynamic form built from `model.params` (aspect_ratio, duration, audio)
3. **Image inputs section** — lists every connected image node:
   - Each image shows a thumbnail + role chip (`start frame` / `end frame` / `reference`)
   - Chip is clickable — cycles through available roles
   - Role constraints enforced: reassigning a second start frame demotes the previous one
   - Image-gen nodes default to `start frame`; file nodes default to `reference`
4. **Version history** — `video-gen-version-history.tsx` — thumbnail (poster), duration,
   model used, cost, restore button

### Right Panel

- `<video>` player with native controls when output exists
- Loading skeleton + "Generating…" label while `status === 'running'`
- Error state with message when `status === 'failed'`
- Generate button (disabled while generating)
- Cost popover — shows duration × rate × audio multiplier in USD + INR

---

## Async Generation Flow

### Initiation (`POST /api/nodes/[id]/video-generate`)

1. Resolve upstream via `getUpstreamOutputs(nodeId)`
2. Find connected `video-prompt` node output → `prompt`
3. Find connected image nodes → build `startFrameUrl`, `endFrameUrl`, `referenceUrls`
   from node `data.imageRoles` (stored in node data, set by focus view)
4. Validate params against model Zod schema
5. `INSERT generations { node_id, type:'video', status:'running', model_used,
   params_snapshot, inputs_snapshot }`
   - `inputs_snapshot`: `{ videoPromptNodeId, videoPromptVersionId, prompt,
     startFrameUrl, endFrameUrl, referenceUrls }`
6. `tasks.trigger("video-generate", { generationId, modelId, prompt, startFrameUrl,
   endFrameUrl, referenceUrls, params })`
7. Return `202 { generationId }`

### Trigger.dev Task (`trigger/video-generate.ts`)

```
id: "video-generate"
maxDuration: 600   (10 min ceiling)
retry: { maxAttempts: 2 }
```

On success → `POST /api/webhooks/generation { generationId, status:'succeeded',
videoUrl, durationSeconds }`

On failure → `POST /api/webhooks/generation { generationId, status:'failed', error }`

### Completion (`/api/webhooks/generation` → `completeGeneration()`)

On success:
1. `INSERT node_versions { inputs_used, params_used, model_used, output: videoUrl }`
2. `UPDATE nodes SET active_version_id = version.id`
3. `UPDATE generations SET status='succeeded', version_id, credits_consumed`

On failure:
- `UPDATE generations SET status='failed', error`
- No `node_versions` row written; `active_version_id` unchanged

### Frontend Realtime

Focus view subscribes on open to `postgres_changes` on `generations` WHERE
`node_id = nodeId`. On `succeeded`: re-fetch versions, show video. On `failed`: show
error state. Unsubscribes on close.

---

## Node Data Shape

```typescript
// Stored in nodes.data
type VideoGenNodeData = {
  // imageRoles: maps upstream node id → assigned role
  imageRoles: Record<string, "start_frame" | "end_frame" | "reference">;
  modelId?: string;
  params?: Record<string, unknown>;
};
```

Image roles are persisted in `nodes.data` so the canvas saves the user's assignment
across sessions. Roles are editable in the focus view and written back via the existing
`saveCanvasNodes()` path.

---

## New Files

| File | Purpose |
|---|---|
| `src/lib/video-gen/types.ts` | VideoGenInput, VideoGenResult |
| `src/lib/video-gen/registry.ts` | videoGenRegistry, DEFAULT_VIDEO_MODEL_ID |
| `src/lib/video-gen/client-models.ts` | client-safe model map |
| `src/lib/video-gen/cost.ts` | VIDEO_MODEL_PRICING, computeVideoCost() |
| `src/lib/video-gen/providers/veo.ts` | Veo 3.1 Lite/Fast/Quality |
| `src/lib/video-gen/params/veo.ts` | aspect_ratio, duration, audio ParamSpec[] |
| `src/components/nodes/video-gen-node.tsx` | Canvas card |
| `src/components/nodes/video-gen-focus-view.tsx` | Modal focus view |
| `src/components/nodes/video-gen-version-history.tsx` | Version list |
| `src/components/nodes/video-gen-usage-popover.tsx` | Cost breakdown popover |
| `src/app/api/nodes/[id]/video-generate/route.ts` | Async initiation route |
| `trigger/video-generate.ts` | Trigger.dev background task |

## Modified Files

| File | Change |
|---|---|
| `supabase/migrations/0007_generations.sql` | New generations table |
| `src/lib/db/types.ts` | Add GenerationRow |
| `src/lib/db/generations.ts` | New — DB helpers |
| `src/lib/generations/complete.ts` | New — completeGeneration() |
| `src/lib/supabase/client.ts` | New — browser Realtime client |
| `src/app/api/webhooks/generation/route.ts` | New — unified webhook handler |
| `src/lib/canvas-nodes.ts` | Register video-gen node type |
| `trigger.config.ts` | New — Trigger.dev config |

---

## Decisions

| Decision | Choice |
|---|---|
| Registry pattern | Mirror image-gen exactly (`videoGenRegistry`, `ParamSpec[]`) |
| Provider | Veo 3.1 only (Google). No Kling, no Sora (deprecated). |
| Default model | `veo:veo-3.1-fast` (ref images supported, good price) |
| Cost unit | Per-second × audio multiplier (not per-token) |
| Image roles | Stored in `nodes.data.imageRoles`, written via saveCanvasNodes() |
| Async runner | Trigger.dev (no timeout limit, built-in retry) |
| node_versions | Unchanged — video URL stored in `output` field |
