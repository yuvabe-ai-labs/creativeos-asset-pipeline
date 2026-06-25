# Video Gen Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `video-gen` node type to the CreativeOS canvas that generates videos via Veo 3.1, using an async Trigger.dev pipeline with Supabase Realtime for live status updates.

**Architecture:** A `generations` table tracks every video job with status + billing metadata. The initiation API route inserts a `running` row and fires a Trigger.dev background task; the task calls Veo 3.1, uploads the result to Supabase Storage, then POSTs to a unified webhook handler. The webhook runs `completeGeneration()` which writes `node_versions`, moves `active_version_id`, and marks the generation `succeeded`. Supabase Realtime notifies the focus view without polling.

**Tech Stack:** Next.js 16 App Router, Supabase (DB + Storage + Realtime), @google/genai ^2.8.0, @trigger.dev/sdk, Zustand, shadcn/ui, Lucide React

**Spec:** `docs/superpowers/specs/2026-06-22-video-gen-node-design.md`

---

## New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/0007_generations.sql` | generations table DDL |
| `src/lib/db/generations.ts` | insert / succeed / fail / get / list DB helpers |
| `src/lib/generations/complete.ts` | completeGeneration() shared utility |
| `src/lib/supabase/client.ts` | browser Supabase singleton for Realtime |
| `src/app/api/webhooks/generation/route.ts` | unified completion webhook |
| `src/lib/video-gen/types.ts` | VideoGenInput, VideoGenResult |
| `src/lib/video-gen/params/veo.ts` | aspect_ratio, duration, audio ParamSpec[] |
| `src/lib/video-gen/providers/veo.ts` | Veo 3.1 Lite / Fast / Quality models |
| `src/lib/video-gen/registry.ts` | videoGenRegistry, DEFAULT_VIDEO_MODEL_ID |
| `src/lib/video-gen/cost.ts` | VIDEO_MODEL_PRICING, computeVideoCost() |
| `src/lib/video-gen/client-models.ts` | client-safe model map |
| `trigger.config.ts` | Trigger.dev project config |
| `trigger/video-generate.ts` | background task: calls Veo, POSTs to webhook |
| `src/app/api/nodes/[id]/video-generate/route.ts` | async initiation route |
| `src/components/nodes/video-gen-node.tsx` | canvas card component |
| `src/components/nodes/video-gen-version-history.tsx` | version list |
| `src/components/nodes/video-gen-usage-popover.tsx` | cost popover |
| `src/components/nodes/video-gen-focus-view.tsx` | two-panel modal |

## Modified Files

| File | Change |
|------|--------|
| `src/lib/db/types.ts` | Add GenerationRow |
| `src/lib/canvas-nodes.ts` | Register video-gen node type + component |
| `.env` | Add NEXT_PUBLIC_SUPABASE_ANON_KEY, TRIGGER_SECRET_KEY, APP_URL |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/0007_generations.sql`
- Modify: `src/lib/db/types.ts`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/0007_generations.sql
-- Async generation job log. Tracks every video (and future image/prompt) attempt
-- with operational status and billing metadata. node_versions is unchanged (D-async).

create table generations (
  id               uuid primary key default gen_random_uuid(),
  node_id          uuid not null references nodes(id) on delete cascade,
  type             text not null,         -- 'image' | 'video' | 'prompt'
  status           text not null,         -- 'running' | 'succeeded' | 'failed'
  provider_job_id  text,
  model_used       text,
  params_snapshot  jsonb,
  inputs_snapshot  jsonb,
  tokens_used      jsonb,
  credits_consumed numeric,
  version_id       uuid references node_versions(id),
  user_id          uuid,
  error            text,
  meta             jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index generations_node_id_idx    on generations(node_id);
create index generations_status_idx     on generations(status);
create index generations_version_id_idx on generations(version_id);
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase dashboard SQL editor, or:
```bash
npx supabase db push
```
Verify the `generations` table exists in the Supabase dashboard.

- [ ] **Step 3: Add GenerationRow to `src/lib/db/types.ts`**

Add after the `NodeVersionRow` type:

```typescript
export type GenerationRow = {
  id: string;
  node_id: string;
  type: "image" | "video" | "prompt";
  status: "running" | "succeeded" | "failed";
  provider_job_id: string | null;
  model_used: string | null;
  params_snapshot: Record<string, unknown> | null;
  inputs_snapshot: Record<string, unknown> | null;
  tokens_used: Record<string, unknown> | null;
  credits_consumed: number | null;
  version_id: string | null;
  user_id: string | null;
  error: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_generations.sql src/lib/db/types.ts
git commit -m "feat: add generations table and GenerationRow type"
```

---

## Task 2: DB Helpers

**Files:**
- Create: `src/lib/db/generations.ts`

- [ ] **Step 1: Create `src/lib/db/generations.ts`**

```typescript
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { GenerationRow } from "./types";

export async function insertGeneration(input: {
  nodeId: string;
  type: GenerationRow["type"];
  modelUsed?: string;
  paramsSnapshot?: Record<string, unknown>;
  inputsSnapshot?: Record<string, unknown>;
}): Promise<GenerationRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .insert({
      node_id: input.nodeId,
      type: input.type,
      status: "running",
      model_used: input.modelUsed ?? null,
      params_snapshot: input.paramsSnapshot ?? {},
      inputs_snapshot: input.inputsSnapshot ?? {},
    })
    .select()
    .single();
  if (error) throw error;
  return data as GenerationRow;
}

export async function succeedGeneration(input: {
  generationId: string;
  versionId: string;
  creditsConsumed?: number;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("generations")
    .update({
      status: "succeeded",
      version_id: input.versionId,
      credits_consumed: input.creditsConsumed ?? null,
      meta: input.meta ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.generationId);
  if (error) throw error;
}

export async function failGeneration(input: {
  generationId: string;
  error: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("generations")
    .update({
      status: "failed",
      error: input.error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.generationId);
  if (error) throw error;
}

export async function getGeneration(id: string): Promise<GenerationRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as GenerationRow;
}

export async function listGenerations(nodeId: string): Promise<GenerationRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("node_id", nodeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GenerationRow[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db/generations.ts
git commit -m "feat: add generations DB helpers"
```

---

## Task 3: Browser Supabase Client

**Files:**
- Create: `src/lib/supabase/client.ts`
- Modify: `.env`

- [ ] **Step 1: Add env var to `.env`**

```
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key-from-supabase-dashboard>
APP_URL=http://localhost:3000
TRIGGER_SECRET_KEY=<from-trigger.dev-dashboard>
```

Get the anon key from: Supabase Dashboard → Project Settings → API → `anon public` key.

- [ ] **Step 2: Create `src/lib/supabase/client.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";

// Browser-safe Supabase singleton. Uses anon key (safe to expose).
// Do NOT import from "server-only" files.
let _client: ReturnType<typeof createClient> | null = null;

export function createBrowserSupabase() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase browser env vars");
  _client = createClient(url, anonKey);
  return _client;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/client.ts
git commit -m "feat: add browser Supabase client for Realtime"
```

---

## Task 4: completeGeneration() + Webhook Handler

**Files:**
- Create: `src/lib/generations/complete.ts`
- Create: `src/app/api/webhooks/generation/route.ts`

- [ ] **Step 1: Create `src/lib/generations/complete.ts`**

```typescript
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import {
  getGeneration,
  succeedGeneration,
  failGeneration,
} from "@/lib/db/generations";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { NODE_FILE_BUCKET } from "@/lib/nodes/file-constants";

export type CompleteGenerationInput =
  | {
      generationId: string;
      status: "succeeded";
      videoUrl: string;         // Google-signed URL to download video from
      durationSeconds: number;
      meta?: Record<string, unknown>;
    }
  | {
      generationId: string;
      status: "failed";
      error: string;
    };

export async function completeGeneration(
  input: CompleteGenerationInput,
): Promise<void> {
  const generation = await getGeneration(input.generationId);

  // Idempotency: skip if already resolved (duplicate webhook delivery)
  if (generation.status !== "running") return;

  if (input.status === "failed") {
    await failGeneration({
      generationId: input.generationId,
      error: input.error,
    });
    return;
  }

  // 1. Download video from provider URL and upload to Supabase Storage
  const supabase = createServerSupabase();
  const videoResponse = await fetch(input.videoUrl);
  if (!videoResponse.ok) {
    await failGeneration({
      generationId: input.generationId,
      error: `Failed to download video from provider: ${videoResponse.status}`,
    });
    return;
  }
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
  const fileId = crypto.randomUUID();
  const storagePath = `video-gen/${generation.node_id}/${fileId}.mp4`;

  const { error: uploadError } = await supabase.storage
    .from(NODE_FILE_BUCKET)
    .upload(storagePath, videoBuffer, {
      contentType: "video/mp4",
      upsert: false,
    });
  if (uploadError) {
    await failGeneration({
      generationId: input.generationId,
      error: `Storage upload failed: ${uploadError.message}`,
    });
    return;
  }

  const { data: publicData } = supabase.storage
    .from(NODE_FILE_BUCKET)
    .getPublicUrl(storagePath);
  const storedVideoUrl = publicData.publicUrl;

  // 2. INSERT node_versions
  const version = await insertVersion({
    nodeId: generation.node_id,
    inputsUsed: generation.inputs_snapshot ?? {},
    paramsUsed: {
      ...(generation.params_snapshot ?? {}),
      durationSeconds: input.durationSeconds,
    },
    modelUsed: generation.model_used,
    output: storedVideoUrl,
  });

  // 3. Move active pointer
  await setActiveVersion(generation.node_id, version.id);

  // 4. Compute cost and mark succeeded
  const cost = generation.model_used
    ? computeVideoCost(
        generation.model_used,
        input.durationSeconds,
        !!(generation.params_snapshot as Record<string, unknown>)?.audio,
      )
    : null;

  await succeedGeneration({
    generationId: input.generationId,
    versionId: version.id,
    creditsConsumed: cost?.usd,
    meta: input.meta,
  });
}
```

- [ ] **Step 2: Create `src/app/api/webhooks/generation/route.ts`**

```typescript
import { completeGeneration } from "@/lib/generations/complete";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  if (!body?.generationId) return apiError("Missing generationId", 400);
  if (!["succeeded", "failed"].includes(body.status)) {
    return apiError("Invalid status", 400);
  }

  try {
    await completeGeneration(body);
    return apiOk({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Completion failed";
    return apiError(message, 500);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/generations/complete.ts src/app/api/webhooks/generation/route.ts
git commit -m "feat: add completeGeneration utility and webhook handler"
```

---

## Task 5: Video-gen Registry

**Files:**
- Create: `src/lib/video-gen/types.ts`
- Create: `src/lib/video-gen/params/veo.ts`
- Create: `src/lib/video-gen/providers/veo.ts`
- Create: `src/lib/video-gen/registry.ts`
- Create: `src/lib/video-gen/cost.ts`
- Create: `src/lib/video-gen/client-models.ts`

- [ ] **Step 1: Create `src/lib/video-gen/types.ts`**

```typescript
import type { ParamSpec } from "@/lib/image-gen/types";

export type { ParamSpec };

export type VideoGenInput = {
  prompt: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceUrls: string[];
  params: Record<string, unknown>;
};

export type VideoGenResult = {
  videoUrl: string;        // provider-signed URL (downloaded + re-uploaded by completeGeneration)
  durationSeconds: number;
};

export type VideoGenModelSpec = {
  id: string;
  provider: "veo";
  label: string;
  providerLabel: string;
  maxDurationSeconds: number;
  supportsEndFrame: boolean;
  supportsReferenceImages: boolean;
  params: ParamSpec[];
  generate: (input: VideoGenInput) => Promise<VideoGenResult>;
};

export type VideoGenClientModelSpec = Omit<VideoGenModelSpec, "generate">;
```

- [ ] **Step 2: Create `src/lib/video-gen/params/veo.ts`**

```typescript
import type { ParamSpec } from "@/lib/image-gen/types";

export const veoParams: ParamSpec[] = [
  {
    key: "aspect_ratio",
    label: "Aspect Ratio",
    type: "select",
    default: "16:9",
    options: [
      { value: "16:9", label: "16:9 (Landscape)" },
      { value: "9:16", label: "9:16 (Portrait)" },
    ],
    group: "primary",
  },
  {
    key: "duration",
    label: "Duration",
    type: "select",
    default: "5",
    options: [
      { value: "5", label: "5 seconds" },
      { value: "8", label: "8 seconds" },
    ],
    group: "primary",
  },
  {
    key: "audio",
    label: "Generate Audio",
    type: "toggle",
    default: false,
    group: "primary",
  },
];

// Lite and Fast cap at 5s — override options
export const veoLiteParams: ParamSpec[] = veoParams.map((p) =>
  p.key === "duration"
    ? { ...p, options: [{ value: "5", label: "5 seconds" }], default: "5" }
    : p,
);
```

- [ ] **Step 3: Create `src/lib/video-gen/providers/veo.ts`**

```typescript
import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { VideoGenInput, VideoGenResult, VideoGenModelSpec } from "../types";
import { veoParams, veoLiteParams } from "../params/veo";
import { buildZodFromParams } from "@/lib/image-gen/schema-builder";

// NOTE: Verify exact model names against Google AI Studio docs for your region.
// Models below follow the naming pattern observed in the @google/genai SDK v2.x.
// If generation fails with "model not found", check:
// https://ai.google.dev/api/generate-content#v1beta.models
const VEO_MODEL_IDS = {
  lite: "veo-3.1-lite-generate-001",
  fast: "veo-3.1-fast-generate-001",
  quality: "veo-3.1-generate-001",
} as const;

function createVeoClient() {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_GENAI_API_KEY");
  return new GoogleGenAI({ apiKey });
}

async function generateWithVeo(
  modelName: string,
  input: VideoGenInput,
): Promise<VideoGenResult> {
  const ai = createVeoClient();
  const durationSeconds = Number(input.params.duration ?? 5);
  const generateAudio = Boolean(input.params.audio ?? false);
  const aspectRatio = String(input.params.aspect_ratio ?? "16:9");

  // Build generation config
  const config: Record<string, unknown> = {
    aspectRatio,
    durationSeconds,
    numberOfVideos: 1,
    generateAudio,
  };

  // Attach start frame if provided
  if (input.startFrameUrl) {
    config.image = { imageUrl: input.startFrameUrl };
  }

  // Initiate video generation (long-running operation)
  let operation = await (ai.models as Record<string, Function>).generateVideo({
    model: modelName,
    prompt: input.prompt,
    config,
  });

  // Poll until complete (runs inside Trigger.dev — no timeout concern)
  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 10_000)); // 10s interval
    operation = await ai.operations.get(operation);
  }

  if (operation.error) {
    throw new Error(
      `Veo generation failed: ${JSON.stringify(operation.error)}`,
    );
  }

  const videoUri =
    operation.response?.generatedSamples?.[0]?.video?.uri ??
    operation.response?.videos?.[0]?.uri;

  if (!videoUri) {
    throw new Error("Veo returned no video URI in response");
  }

  return { videoUrl: videoUri, durationSeconds };
}

export const veoLite: VideoGenModelSpec = {
  id: "veo:veo-3.1-lite",
  provider: "veo",
  label: "Veo 3.1 Lite",
  providerLabel: "Google",
  maxDurationSeconds: 5,
  supportsEndFrame: false,
  supportsReferenceImages: true,
  params: veoLiteParams,
  generate: (input) => generateWithVeo(VEO_MODEL_IDS.lite, input),
};

export const veoFast: VideoGenModelSpec = {
  id: "veo:veo-3.1-fast",
  provider: "veo",
  label: "Veo 3.1 Fast",
  providerLabel: "Google",
  maxDurationSeconds: 5,
  supportsEndFrame: false,
  supportsReferenceImages: true,
  params: veoLiteParams,
  generate: (input) => generateWithVeo(VEO_MODEL_IDS.fast, input),
};

export const veoQuality: VideoGenModelSpec = {
  id: "veo:veo-3.1",
  provider: "veo",
  label: "Veo 3.1 Quality",
  providerLabel: "Google",
  maxDurationSeconds: 8,
  supportsEndFrame: false,
  supportsReferenceImages: true,
  params: veoParams,
  generate: (input) => generateWithVeo(VEO_MODEL_IDS.quality, input),
};
```

- [ ] **Step 4: Create `src/lib/video-gen/registry.ts`**

```typescript
import "server-only";
import type { VideoGenModelSpec } from "./types";
import { veoLite, veoFast, veoQuality } from "./providers/veo";

export const videoGenRegistry: Record<string, VideoGenModelSpec> = {
  [veoLite.id]: veoLite,
  [veoFast.id]: veoFast,
  [veoQuality.id]: veoQuality,
};

export const DEFAULT_VIDEO_MODEL_ID = "veo:veo-3.1-fast";
```

- [ ] **Step 5: Create `src/lib/video-gen/cost.ts`**

```typescript
import { USD_TO_INR } from "@/lib/pricing";

const VIDEO_MODEL_PRICING: Record<
  string,
  { perSecond: number; audioMultiplier: number }
> = {
  "veo:veo-3.1-lite":  { perSecond: 0.05, audioMultiplier: 1.5 },
  "veo:veo-3.1-fast":  { perSecond: 0.10, audioMultiplier: 1.5 },
  "veo:veo-3.1":       { perSecond: 0.30, audioMultiplier: 1.5 },
};

export function computeVideoCost(
  modelId: string,
  durationSeconds: number,
  audioEnabled: boolean,
): { usd: number; inr: number } | null {
  const pricing = VIDEO_MODEL_PRICING[modelId];
  if (!pricing) return null;
  const multiplier = audioEnabled ? pricing.audioMultiplier : 1;
  const usd = durationSeconds * pricing.perSecond * multiplier;
  return { usd, inr: usd * USD_TO_INR };
}
```

- [ ] **Step 6: Create `src/lib/video-gen/client-models.ts`**

```typescript
import type { VideoGenClientModelSpec } from "./types";
import { veoLite, veoFast, veoQuality } from "./providers/veo";

// Client-safe subset — no generate() function (server-only)
function toClientSpec(
  spec: import("./types").VideoGenModelSpec,
): VideoGenClientModelSpec {
  const { generate: _, ...rest } = spec;
  return rest;
}

export const videoGenClientModelMap: Record<string, VideoGenClientModelSpec> = {
  [veoLite.id]: toClientSpec(veoLite),
  [veoFast.id]: toClientSpec(veoFast),
  [veoQuality.id]: toClientSpec(veoQuality),
};

export function defaultsForVideoModel(
  modelId: string,
): Record<string, unknown> {
  const spec = videoGenClientModelMap[modelId];
  if (!spec) return {};
  return Object.fromEntries(
    spec.params.map((p) => [p.key, p.default]),
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/video-gen/
git commit -m "feat: add video-gen registry (Veo 3.1 Lite/Fast/Quality)"
```

---

## Task 6: Trigger.dev Setup

**Files:**
- Create: `trigger.config.ts`
- Create: `trigger/video-generate.ts`

- [ ] **Step 1: Install Trigger.dev SDK**

```bash
npm install @trigger.dev/sdk@beta
```

- [ ] **Step 2: Create `trigger.config.ts`**

```typescript
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "your-project-ref",
  dirs: ["./trigger"],
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 5000,
      maxTimeoutInMs: 30000,
      factor: 2,
    },
  },
});
```

Get `TRIGGER_PROJECT_REF` from your Trigger.dev dashboard → Project Settings.
Add it to `.env`:
```
TRIGGER_PROJECT_REF=proj_xxxxxxxx
```

- [ ] **Step 3: Create `trigger/video-generate.ts`**

```typescript
import { task, logger } from "@trigger.dev/sdk/v3";
import { videoGenRegistry } from "@/lib/video-gen/registry";

export const videoGenerateTask = task({
  id: "video-generate",
  maxDuration: 600, // 10 min ceiling
  run: async (payload: {
    generationId: string;
    modelId: string;
    prompt: string;
    startFrameUrl?: string;
    endFrameUrl?: string;
    referenceUrls: string[];
    params: Record<string, unknown>;
  }) => {
    const { generationId, modelId, prompt, startFrameUrl, endFrameUrl, referenceUrls, params } = payload;
    const appUrl = process.env.APP_URL;
    if (!appUrl) throw new Error("APP_URL env var not set");

    const webhookUrl = `${appUrl}/api/webhooks/generation`;

    try {
      const config = videoGenRegistry[modelId];
      if (!config) throw new Error(`Unknown video model: ${modelId}`);

      logger.info("Starting video generation", { generationId, modelId });

      const result = await config.generate({
        prompt,
        startFrameUrl,
        endFrameUrl,
        referenceUrls: referenceUrls ?? [],
        params,
      });

      logger.info("Video generation succeeded", { generationId, videoUrl: result.videoUrl });

      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId,
          status: "succeeded",
          videoUrl: result.videoUrl,
          durationSeconds: result.durationSeconds,
        }),
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Video generation failed";
      logger.error("Video generation failed", { generationId, error });

      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId, status: "failed", error }),
      });
    }
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add trigger.config.ts trigger/video-generate.ts package.json package-lock.json
git commit -m "feat: add Trigger.dev config and video-generate background task"
```

---

## Task 7: Video-Generate API Route

**Files:**
- Create: `src/app/api/nodes/[id]/video-generate/route.ts`

- [ ] **Step 1: Create `src/app/api/nodes/[id]/video-generate/route.ts`**

```typescript
import { tasks } from "@trigger.dev/sdk/v3";
import { getUpstreamOutputs } from "@/lib/db/nodes";
import { insertGeneration } from "@/lib/db/generations";
import { videoGenRegistry, DEFAULT_VIDEO_MODEL_ID } from "@/lib/video-gen/registry";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import type { videoGenerateTask } from "@/trigger/video-generate";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const body = (await req.json().catch(() => null)) as
    | { modelId?: unknown; params?: unknown; imageRoles?: unknown }
    | null;

  const modelId =
    typeof body?.modelId === "string" ? body.modelId : DEFAULT_VIDEO_MODEL_ID;
  const config = videoGenRegistry[modelId];
  if (!config) return apiError(`Unknown modelId: ${modelId}`, 400);

  const genParams = (body?.params ?? {}) as Record<string, unknown>;
  const parseResult = config.params.reduce(
    (acc, spec) => {
      acc[spec.key] = genParams[spec.key] ?? spec.default;
      return acc;
    },
    {} as Record<string, unknown>,
  );

  // Image role assignments sent from focus view
  const imageRoles = (body?.imageRoles ?? {}) as Record<
    string,
    "start_frame" | "end_frame" | "reference"
  >;

  // Resolve upstream nodes
  const upstream = await getUpstreamOutputs(nodeId);

  // Find video-prompt node
  const videoPromptNode = upstream.find((u) => u.type === "video-prompt");
  if (!videoPromptNode?.activeOutput) {
    return apiError(
      "No connected video-prompt node with output found.",
      400,
    );
  }
  const prompt = String(videoPromptNode.activeOutput);

  // Resolve image roles from upstream nodes
  let startFrameUrl: string | undefined;
  let endFrameUrl: string | undefined;
  const referenceUrls: string[] = [];

  for (const node of upstream) {
    const url =
      node.type === "image-gen"
        ? (node.activeOutput as string | undefined)
        : node.type === "file"
          ? (node.data as Record<string, unknown>).fileUrl as string | undefined
          : undefined;

    if (!url) continue;

    const role = imageRoles[node.nodeId];
    const defaultRole = node.type === "image-gen" ? "start_frame" : "reference";
    const assignedRole = role ?? defaultRole;

    if (assignedRole === "start_frame" && !startFrameUrl) {
      startFrameUrl = url;
    } else if (assignedRole === "end_frame" && !endFrameUrl) {
      endFrameUrl = url;
    } else if (assignedRole === "reference") {
      referenceUrls.push(url);
    }
  }

  // Insert generation record
  const generation = await insertGeneration({
    nodeId,
    type: "video",
    modelUsed: modelId,
    paramsSnapshot: parseResult,
    inputsSnapshot: {
      videoPromptNodeId: videoPromptNode.nodeId,
      videoPromptVersionId: videoPromptNode.versionId,
      prompt,
      startFrameUrl,
      endFrameUrl,
      referenceUrls,
    },
  });

  // Fire Trigger.dev task (no await — fire and leave)
  await tasks.trigger<typeof videoGenerateTask>("video-generate", {
    generationId: generation.id,
    modelId,
    prompt,
    startFrameUrl,
    endFrameUrl,
    referenceUrls,
    params: parseResult,
  });

  return apiOk({ generationId: generation.id }, 202);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/nodes/[id]/video-generate/
git commit -m "feat: add video-generate async initiation route"
```

---

## Task 8: Canvas Node Card

**Files:**
- Create: `src/components/nodes/video-gen-node.tsx`
- Modify: `src/lib/canvas-nodes.ts`

- [ ] **Step 1: Create `src/components/nodes/video-gen-node.tsx`**

Model this on `image-gen-node.tsx`. Read that file first, then create:

```typescript
"use client";

import { useState } from "react";
import { Clapperboard } from "lucide-react";
import { VideoGenFocusView } from "./video-gen-focus-view";
import { useCanvasStore } from "@/lib/canvas-store";

type VideoGenNodeProps = {
  id: string;
  data: {
    title?: string;
    output?: string | null;          // video URL
    modelId?: string;
    params?: Record<string, unknown>;
    imageRoles?: Record<string, "start_frame" | "end_frame" | "reference">;
  };
};

export function VideoGenNode({ id, data }: VideoGenNodeProps) {
  const [focusOpen, setFocusOpen] = useState(false);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const videoUrl = data.output ?? null;

  return (
    <>
      <div
        className="group relative w-56 rounded-2xl border border-neutral-200 bg-white shadow-card cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => setFocusOpen(true)}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <Clapperboard className="h-4 w-4 text-teal-500" strokeWidth={1.5} />
          <span className="text-eyebrow text-neutral-500">
            {data.title ?? "Video Gen"}
          </span>
        </div>

        {/* Body */}
        <div className="mx-3 mb-3 rounded-xl overflow-hidden bg-neutral-50 aspect-video flex items-center justify-center">
          {videoUrl ? (
            <video
              src={videoUrl}
              poster={videoUrl}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
          ) : (
            <Clapperboard
              className="h-8 w-8 text-neutral-300"
              strokeWidth={1.5}
            />
          )}
        </div>
      </div>

      <VideoGenFocusView
        open={focusOpen}
        onOpenChange={setFocusOpen}
        nodeId={id}
        title={data.title ?? "Video Gen"}
        videoUrl={videoUrl}
        modelId={data.modelId}
        params={data.params}
        imageRoles={data.imageRoles ?? {}}
        onPatch={(patch) =>
          updateNodeData(id, { ...data, ...patch })
        }
      />
    </>
  );
}
```

- [ ] **Step 2: Register in `src/lib/canvas-nodes.ts`**

Open the file and add `video-gen` to the node type map. The exact location depends on the file structure — look for where `image-gen` is registered and add alongside it:

```typescript
import { VideoGenNode } from "@/components/nodes/video-gen-node";

// In the nodeTypes object:
"video-gen": VideoGenNode,
```

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/video-gen-node.tsx src/lib/canvas-nodes.ts
git commit -m "feat: add video-gen canvas node card and register type"
```

---

## Task 9: Version History + Usage Popover

**Files:**
- Create: `src/components/nodes/video-gen-version-history.tsx`
- Create: `src/components/nodes/video-gen-usage-popover.tsx`

- [ ] **Step 1: Create `src/components/nodes/video-gen-version-history.tsx`**

Model on `image-gen-version-history.tsx`. Read that file first, then:

```typescript
"use client";

import { formatDistanceToNow } from "date-fns";
import { Clapperboard, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NodeVersionRow } from "@/lib/db/types";

export type VideoVersionSummary = {
  id: string;
  output: string | null;           // video URL
  error: string | null;
  modelUsed: string | null;
  paramsUsed: Record<string, unknown>;
  createdAt: string;
  isActive: boolean;
};

type Props = {
  versions: VideoVersionSummary[];
  onRestore: (versionId: string) => void;
  restoring: boolean;
};

export function VideoGenVersionHistory({ versions, onRestore, restoring }: Props) {
  if (versions.length === 0) {
    return (
      <p className="text-sm text-neutral-400 px-1">No generations yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {versions.map((v) => (
        <div
          key={v.id}
          className={`rounded-xl border p-2 ${
            v.isActive
              ? "border-primary/30 bg-primary/5"
              : "border-neutral-200 bg-white"
          }`}
        >
          <div className="flex items-center gap-2">
            {/* Thumbnail */}
            <div className="w-16 h-10 rounded-lg overflow-hidden bg-neutral-100 shrink-0 flex items-center justify-center">
              {v.output ? (
                <video
                  src={v.output}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <Clapperboard className="h-4 w-4 text-neutral-300" strokeWidth={1.5} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs text-neutral-500 truncate">
                {v.modelUsed ?? "Unknown model"}
              </p>
              {v.error && (
                <p className="text-xs text-red-500 truncate">{v.error}</p>
              )}
              <p className="text-xs text-neutral-400">
                {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
              </p>
            </div>

            {!v.isActive && v.output && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => onRestore(v.id)}
                disabled={restoring}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/nodes/video-gen-usage-popover.tsx`**

```typescript
"use client";

import { DollarSign } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { computeVideoCost } from "@/lib/video-gen/cost";
import type { VideoVersionSummary } from "./video-gen-version-history";

type Props = {
  versions: VideoVersionSummary[];
};

export function VideoGenUsagePopover({ versions }: Props) {
  const versionsWithOutput = versions.filter((v) => v.output);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-neutral-500">
          <DollarSign className="h-3.5 w-3.5" />
          <span className="text-xs">Cost</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="text-xs font-medium text-neutral-700 mb-2">Generation Cost</p>
        {versionsWithOutput.length === 0 ? (
          <p className="text-xs text-neutral-400">No successful generations yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {versionsWithOutput.map((v) => {
              const duration = Number(
                (v.paramsUsed as Record<string, unknown>)?.durationSeconds ?? 5,
              );
              const audio = Boolean((v.paramsUsed as Record<string, unknown>)?.audio);
              const cost = v.modelUsed
                ? computeVideoCost(v.modelUsed, duration, audio)
                : null;
              return (
                <div key={v.id} className="flex justify-between text-xs">
                  <span className="text-neutral-500">{v.modelUsed}</span>
                  <span className="text-neutral-700">
                    {cost ? `$${cost.usd.toFixed(3)} / ₹${cost.inr.toFixed(1)}` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/video-gen-version-history.tsx src/components/nodes/video-gen-usage-popover.tsx
git commit -m "feat: add video-gen version history and usage popover"
```

---

## Task 10: Focus View

**Files:**
- Create: `src/components/nodes/video-gen-focus-view.tsx`

This is the most complex component. Read `image-gen-focus-view.tsx` in full before starting — the structure is nearly identical.

- [ ] **Step 1: Create `src/components/nodes/video-gen-focus-view.tsx`**

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  videoGenClientModelMap,
  defaultsForVideoModel,
} from "@/lib/video-gen/client-models";
import { DEFAULT_VIDEO_MODEL_ID } from "@/lib/video-gen/registry";
import {
  VideoGenVersionHistory,
  type VideoVersionSummary,
} from "./video-gen-version-history";
import { VideoGenUsagePopover } from "./video-gen-usage-popover";
import type { GenerationRow } from "@/lib/db/types";

type ImageRole = "start_frame" | "end_frame" | "reference";

type UpstreamImageNode = {
  id: string;
  type: string;
  imageUrl: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  videoUrl: string | null;
  modelId?: string;
  params?: Record<string, unknown>;
  imageRoles: Record<string, ImageRole>;
  onPatch: (patch: Record<string, unknown>) => void;
};

export function VideoGenFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  videoUrl,
  modelId: initialModelId,
  params: initialParams,
  imageRoles: initialRoles,
  onPatch,
}: Props) {
  const [modelId, setModelId] = useState(
    initialModelId ?? DEFAULT_VIDEO_MODEL_ID,
  );
  const [params, setParams] = useState<Record<string, unknown>>(
    initialParams ?? defaultsForVideoModel(initialModelId ?? DEFAULT_VIDEO_MODEL_ID),
  );
  const [imageRoles, setImageRoles] =
    useState<Record<string, ImageRole>>(initialRoles);
  const [upstreamImages, setUpstreamImages] = useState<UpstreamImageNode[]>([]);
  const [versions, setVersions] = useState<VideoVersionSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const fetchVersions = useCallback(async () => {
    const res = await fetch(`/api/nodes/${nodeId}/versions`);
    if (!res.ok) return;
    const data = await res.json();
    setVersions(
      (data.versions ?? []).map((v: Record<string, unknown>) => ({
        id: v.id,
        output: v.output ?? null,
        error: v.error ?? null,
        modelUsed: v.model_used ?? null,
        paramsUsed: (v.params_used as Record<string, unknown>) ?? {},
        createdAt: v.created_at as string,
        isActive: v.id === data.activeVersionId,
      })),
    );
    setActiveVersionId(data.activeVersionId ?? null);
  }, [nodeId]);

  const fetchUpstreamImages = useCallback(async () => {
    const res = await fetch(`/api/nodes/${nodeId}/upstream-images`);
    if (!res.ok) return;
    const data = await res.json();
    setUpstreamImages(data.images ?? []);
  }, [nodeId]);

  // Load on open
  useEffect(() => {
    if (!open) return;
    fetchVersions();
    fetchUpstreamImages();
  }, [open, fetchVersions, fetchUpstreamImages]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!open) return;
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`generation:${nodeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "generations",
          filter: `node_id=eq.${nodeId}`,
        },
        (payload) => {
          const gen = payload.new as GenerationRow;
          if (gen.status === "succeeded") {
            setGenerating(false);
            fetchVersions();
            toast.success("Video generated");
          }
          if (gen.status === "failed") {
            setGenerating(false);
            toast.error(gen.error ?? "Generation failed");
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, nodeId, fetchVersions]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/video-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, params, imageRoles }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Generation failed");
      }
      // 202 received — Realtime will notify us when done
    } catch (e) {
      setGenerating(false);
      toast.error(e instanceof Error ? e.message : "Generation failed");
    }
  };

  const handleRoleChange = (nodeId: string, newRole: ImageRole) => {
    setImageRoles((prev) => {
      const next = { ...prev };
      // Enforce single start_frame / end_frame
      if (newRole === "start_frame") {
        Object.keys(next).forEach((k) => {
          if (next[k] === "start_frame") next[k] = "reference";
        });
      }
      if (newRole === "end_frame") {
        Object.keys(next).forEach((k) => {
          if (next[k] === "end_frame") next[k] = "reference";
        });
      }
      next[nodeId] = newRole;
      return next;
    });
    onPatch({ imageRoles: { ...imageRoles, [nodeId]: newRole } });
  };

  const handleModelChange = (newModelId: string) => {
    setModelId(newModelId);
    setParams(defaultsForVideoModel(newModelId));
    onPatch({ modelId: newModelId, params: defaultsForVideoModel(newModelId) });
  };

  const handleRestore = async (versionId: string) => {
    setRestoring(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/restore-version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      if (!res.ok) throw new Error("Restore failed");
      await fetchVersions();
      toast.success("Version restored");
    } catch {
      toast.error("Restore failed");
    } finally {
      setRestoring(false);
    }
  };

  const model = videoGenClientModelMap[modelId];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-4xl p-0 flex">
        {/* Left panel */}
        <div className="w-72 border-r border-neutral-200 flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-neutral-200">
            <h2 className="font-display text-sm font-semibold text-neutral-900">
              {title}
            </h2>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {/* Model selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-eyebrow text-neutral-500">Model</label>
              <select
                value={modelId}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
              >
                {Object.values(videoGenClientModelMap).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Params */}
            {model?.params.map((spec) => (
              <div key={spec.key} className="flex flex-col gap-1.5">
                <label className="text-eyebrow text-neutral-500">
                  {spec.label}
                </label>
                {spec.type === "select" && (
                  <select
                    value={String(params[spec.key] ?? spec.default)}
                    onChange={(e) =>
                      setParams((p) => ({ ...p, [spec.key]: e.target.value }))
                    }
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
                  >
                    {spec.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                {spec.type === "toggle" && (
                  <button
                    type="button"
                    onClick={() =>
                      setParams((p) => ({ ...p, [spec.key]: !p[spec.key] }))
                    }
                    className={`w-10 h-6 rounded-full transition-colors ${
                      params[spec.key]
                        ? "bg-primary"
                        : "bg-neutral-200"
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        params[spec.key] ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                )}
              </div>
            ))}

            {/* Image inputs */}
            {upstreamImages.length > 0 && (
              <div className="flex flex-col gap-2">
                <label className="text-eyebrow text-neutral-500">
                  Image Inputs
                </label>
                {upstreamImages.map((img) => {
                  const role =
                    imageRoles[img.id] ??
                    (img.type === "image-gen" ? "start_frame" : "reference");
                  const roles: ImageRole[] = [
                    "start_frame",
                    "end_frame",
                    "reference",
                  ];
                  const cycleRole = () => {
                    const next =
                      roles[(roles.indexOf(role) + 1) % roles.length];
                    handleRoleChange(img.id, next);
                  };
                  return (
                    <div
                      key={img.id}
                      className="flex items-center gap-2 rounded-lg border border-neutral-200 p-2"
                    >
                      <div className="w-10 h-10 rounded-md overflow-hidden bg-neutral-100 shrink-0">
                        <img
                          src={img.imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-neutral-500 truncate">
                          {img.type}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={cycleRole}
                        className="text-xs px-2 py-0.5 rounded-full border border-dashed border-primary/40 text-primary hover:bg-primary/5 shrink-0 transition-colors"
                      >
                        {role.replace("_", " ")}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Version history */}
            <div className="flex flex-col gap-2">
              <label className="text-eyebrow text-neutral-500">History</label>
              <VideoGenVersionHistory
                versions={versions}
                onRestore={handleRestore}
                restoring={restoring}
              />
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
            <VideoGenUsagePopover versions={versions} />
            <Button
              onClick={handleGenerate}
              disabled={generating}
              size="sm"
            >
              {generating ? "Generating…" : "Generate"}
            </Button>
          </div>

          <div className="flex-1 flex items-center justify-center bg-neutral-50">
            {generating && (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-sm text-neutral-500">Generating video…</p>
              </div>
            )}
            {!generating && videoUrl && (
              <video
                key={videoUrl}
                src={videoUrl}
                controls
                className="max-h-full max-w-full rounded-xl shadow-card"
              />
            )}
            {!generating && !videoUrl && (
              <p className="text-sm text-neutral-400">
                Not generated yet
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/nodes/video-gen-focus-view.tsx
git commit -m "feat: add video-gen focus view with Realtime subscription"
```

---

## Task 11: Upstream Images API Route

The focus view fetches upstream images via `/api/nodes/${nodeId}/upstream-images`. This route doesn't exist yet — create it.

**Files:**
- Create: `src/app/api/nodes/[id]/upstream-images/route.ts`

- [ ] **Step 1: Create `src/app/api/nodes/[id]/upstream-images/route.ts`**

```typescript
import { getUpstreamOutputs } from "@/lib/db/nodes";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  try {
    const upstream = await getUpstreamOutputs(nodeId);
    const images = upstream
      .filter((u) => {
        if (u.type === "image-gen") return typeof u.activeOutput === "string";
        if (u.type === "file") {
          const d = u.data as Record<string, unknown>;
          return d.fileKind === "image" && typeof d.fileUrl === "string";
        }
        return false;
      })
      .map((u) => ({
        id: u.nodeId,
        type: u.type,
        imageUrl:
          u.type === "image-gen"
            ? (u.activeOutput as string)
            : (u.data as Record<string, unknown>).fileUrl as string,
      }));
    return apiOk({ images });
  } catch (e) {
    return apiError("Failed to resolve upstream images", 500);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/nodes/[id]/upstream-images/
git commit -m "feat: add upstream-images API route for video-gen focus view"
```

---

## Task 12: End-to-End Verification

- [ ] **Step 1: Start Trigger.dev dev server alongside Next.js**

```bash
# Terminal 1
npx trigger.dev@beta dev

# Terminal 2
npm run dev
```

- [ ] **Step 2: Apply migration and verify table**

Open Supabase dashboard → Table Editor → confirm `generations` table exists with all columns.

- [ ] **Step 3: Add a video-gen node to the canvas**

Open a canvas → add a `video-gen` node → connect a `video-prompt` node to it.

- [ ] **Step 4: Open the focus view and trigger generation**

Click the video-gen node → focus view opens → click Generate.

Expected:
- `generations` table shows a new row with `status = 'running'`
- Trigger.dev dashboard shows the `video-generate` task running

- [ ] **Step 5: Verify Realtime notification**

When the task completes:
- `generations` row updates to `status = 'succeeded'`, `version_id` set
- `node_versions` has a new row with the video URL in `output`
- `nodes.active_version_id` points to the new version
- Focus view shows the video without a page refresh

- [ ] **Step 6: Verify failure path**

Temporarily pass an invalid modelId → confirm:
- `generations` row shows `status = 'failed'`
- Focus view shows error toast
- No `node_versions` row created
- `active_version_id` unchanged

- [ ] **Step 7: Verify image role switcher**

Connect an `image-gen` node to the `video-prompt` node → open video-gen focus view → confirm image appears as `start frame` → click to cycle to `reference` → generate → confirm `inputs_snapshot.startFrameUrl` is null and `referenceUrls` contains the image URL.
