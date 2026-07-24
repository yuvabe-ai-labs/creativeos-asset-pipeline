# Kling Image-to-Video Integration Implementation Plan

> **SUPERSEDED 2026-07-23** — this plan calls Kling at the wrong host with the wrong
> request body (see the superseded-notice on the linked design doc for the full story —
> the fields weren't pure fabrication, but the endpoint/host/shape combo never worked).
> It was merged to `main` and is live/broken in production. Do not use this plan for
> further work — see `docs/superpowers/specs/2026-07-23-kling-api-correction-design.md`
> and its forthcoming implementation plan instead.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all 6 Kling image-to-video models to the Video Gen node, wired through the existing async generation pipeline via Kling's webhook callback.

**Architecture:** Kling plugs into the existing provider pattern (params spec → registry → provider → Trigger.dev task → webhook). The provider POSTs to Kling's API with a `callback_url`, stores the `task_id` in `generations.provider_job_id`, and returns immediately. Kling calls our webhook on completion. The webhook handler gets a new `?provider=kling` branch that looks up the generation by `provider_job_id` and calls the existing `completeGeneration()`.

**Tech Stack:** TypeScript, Next.js App Router, Supabase, Trigger.dev v3, Kling API (`https://api.klingai.com/v1/videos/image2video`). No new npm packages required.

**Spec:** `docs/superpowers/specs/2026-07-11-kling-video-gen-integration-design.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/video-gen/params/kling.ts` | `klingLegacyParams` + `klingV3Params` (ParamSpec arrays) |
| Create | `src/lib/video-gen/providers/kling.ts` | `generate()`: auth, image fetch, API call, returns `provider_job_id` |
| Modify | `src/lib/video-gen/types.ts` | Add `"kling"` to provider union |
| Modify | `src/lib/video-gen/registry.ts` | Register 6 Kling model specs |
| Modify | `src/lib/video-gen/client-models.ts` | Add 6 Kling client model entries |
| Modify | `src/lib/video-gen/cost.ts` | Add Kling pricing table |
| Modify | `src/lib/db/generations.ts` | Add `insertGenerationWithJobId()` helper (sets `provider_job_id`) + `getGenerationByProviderJobId()` |
| Modify | `src/app/api/nodes/[id]/video-generate/route.ts` | Pass `providerJobId` from result to DB insert |
| Modify | `trigger/video-generate.ts` | Return `providerJobId` from provider result; persist it after generate |
| Modify | `src/lib/video-gen/types.ts` | Add optional `providerJobId` to `VideoGenResult` |
| Modify | `src/app/api/webhooks/generation/route.ts` | Add `?provider=kling` branch |
| Modify | `src/lib/generations/complete.ts` | Add `buildVideoDownloadHeaders` branch for `kling:` prefix (no auth header needed — Kling URLs are public) |
| Modify | `src/components/nodes/video-gen-params-panel.tsx` | Split params by `group`, wrap `advanced` in Accordion |
| Modify | `.env.example` | Add `KLING_API_KEY` |

---

## Task 1: Kling param specs

**Files:**
- Create: `src/lib/video-gen/params/kling.ts`
- Test: `src/lib/video-gen/__tests__/kling-params.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/video-gen/__tests__/kling-params.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { klingLegacyParams, klingV3Params } from "../params/kling";

describe("klingLegacyParams", () => {
  it("has mode, duration, aspect_ratio as primary", () => {
    const primary = klingLegacyParams.filter((p) => p.group === "primary");
    expect(primary.map((p) => p.name)).toEqual(["mode", "duration", "aspect_ratio"]);
  });

  it("has advanced params: cfg_scale, negative_prompt, pan, tilt, zoom, roll, horizontal_movement, vertical_movement", () => {
    const advanced = klingLegacyParams.filter((p) => p.group === "advanced");
    expect(advanced.map((p) => p.name)).toEqual([
      "cfg_scale", "negative_prompt", "pan", "tilt", "zoom", "roll",
      "horizontal_movement", "vertical_movement",
    ]);
  });

  it("duration options are 5 and 10", () => {
    const duration = klingLegacyParams.find((p) => p.name === "duration")!;
    expect(duration.constraints).toEqual({ type: "select", options: ["5", "10"] });
  });

  it("all params are visible", () => {
    expect(klingLegacyParams.every((p) => p.visible)).toBe(true);
  });
});

describe("klingV3Params", () => {
  it("duration options are 3 through 15", () => {
    const duration = klingV3Params.find((p) => p.name === "duration")!;
    expect(duration.constraints).toEqual({
      type: "select",
      options: ["3","4","5","6","7","8","9","10","11","12","13","14","15"],
    });
  });

  it("shares all other params with legacy", () => {
    const legacyNonDuration = klingLegacyParams.filter((p) => p.name !== "duration");
    const v3NonDuration = klingV3Params.filter((p) => p.name !== "duration");
    expect(v3NonDuration).toEqual(legacyNonDuration);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd creativeos-mvp
npx vitest run src/lib/video-gen/__tests__/kling-params.test.ts
```

Expected: FAIL — `Cannot find module '../params/kling'`

- [ ] **Step 3: Create `src/lib/video-gen/params/kling.ts`**

```typescript
import type { ParamSpec } from "@/lib/image-gen/types";

const KLING_MOTION_PARAMS: ParamSpec[] = [
  {
    name: "pan",
    label: "Pan",
    component: "slider",
    group: "advanced",
    order: 2,
    visible: true,
    defaultValue: 0,
    constraints: { type: "slider", min: -10, max: 10, step: 1 },
  },
  {
    name: "tilt",
    label: "Tilt",
    component: "slider",
    group: "advanced",
    order: 3,
    visible: true,
    defaultValue: 0,
    constraints: { type: "slider", min: -10, max: 10, step: 1 },
  },
  {
    name: "zoom",
    label: "Zoom",
    component: "slider",
    group: "advanced",
    order: 4,
    visible: true,
    defaultValue: 0,
    constraints: { type: "slider", min: -10, max: 10, step: 1 },
  },
  {
    name: "roll",
    label: "Roll",
    component: "slider",
    group: "advanced",
    order: 5,
    visible: true,
    defaultValue: 0,
    constraints: { type: "slider", min: -10, max: 10, step: 1 },
  },
  {
    name: "horizontal_movement",
    label: "Horizontal",
    component: "slider",
    group: "advanced",
    order: 6,
    visible: true,
    defaultValue: 0,
    constraints: { type: "slider", min: -10, max: 10, step: 1 },
  },
  {
    name: "vertical_movement",
    label: "Vertical",
    component: "slider",
    group: "advanced",
    order: 7,
    visible: true,
    defaultValue: 0,
    constraints: { type: "slider", min: -10, max: 10, step: 1 },
  },
];

const KLING_PRIMARY_BASE: ParamSpec[] = [
  {
    name: "mode",
    label: "Mode",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue: "pro",
    constraints: { type: "select", options: ["std", "pro"] },
  },
  {
    name: "aspect_ratio",
    label: "Aspect Ratio",
    component: "select",
    group: "primary",
    order: 2,
    visible: true,
    defaultValue: "16:9",
    constraints: { type: "select", options: ["16:9", "9:16", "1:1"] },
  },
];

const KLING_ADVANCED_BASE: ParamSpec[] = [
  {
    name: "cfg_scale",
    label: "CFG Scale",
    component: "slider",
    group: "advanced",
    order: 0,
    visible: true,
    defaultValue: 0.5,
    constraints: { type: "slider", min: 0, max: 1, step: 0.1 },
  },
  {
    name: "negative_prompt",
    label: "Negative Prompt",
    component: "textarea",
    group: "advanced",
    order: 1,
    visible: true,
    defaultValue: "",
    constraints: { type: "textarea", maxLength: 2500 },
  },
  ...KLING_MOTION_PARAMS,
];

const KLING_DURATION_LEGACY: ParamSpec = {
  name: "duration",
  label: "Duration",
  component: "select",
  group: "primary",
  order: 1,
  visible: true,
  defaultValue: "5",
  constraints: { type: "select", options: ["5", "10"] },
};

const KLING_DURATION_V3: ParamSpec = {
  name: "duration",
  label: "Duration",
  component: "select",
  group: "primary",
  order: 1,
  visible: true,
  defaultValue: "5",
  constraints: {
    type: "select",
    options: ["3","4","5","6","7","8","9","10","11","12","13","14","15"],
  },
};

export const klingLegacyParams: ParamSpec[] = [
  ...KLING_PRIMARY_BASE.filter((p) => p.name !== "duration"),
  KLING_DURATION_LEGACY,
  ...KLING_PRIMARY_BASE.filter((p) => p.name === "duration"),
  ...KLING_ADVANCED_BASE,
].sort((a, b) => {
  if (a.group !== b.group) return a.group === "primary" ? -1 : 1;
  return a.order - b.order;
});

export const klingV3Params: ParamSpec[] = klingLegacyParams.map((p) =>
  p.name === "duration" ? KLING_DURATION_V3 : p,
);
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/lib/video-gen/__tests__/kling-params.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/params/kling.ts src/lib/video-gen/__tests__/kling-params.test.ts
git commit -m "feat: add Kling param specs (klingLegacyParams + klingV3Params)"
```

---

## Task 2: Update types and add `getGenerationByProviderJobId`

**Files:**
- Modify: `src/lib/video-gen/types.ts`
- Modify: `src/lib/db/generations.ts`
- Test: `src/lib/video-gen/__tests__/kling-params.test.ts` (already passes — just make sure nothing breaks)

- [ ] **Step 1: Add `"kling"` to provider union and `providerJobId` to `VideoGenResult`**

In `src/lib/video-gen/types.ts`, make these two changes:

Change line 77:
```typescript
// Before
  provider: "veo" | "openai";

// After
  provider: "veo" | "openai" | "kling";
```

Add `providerJobId` to `VideoGenResult` (currently lines 19–22):
```typescript
export type VideoGenResult = {
  videoUrl: string;
  durationSeconds: number;
  providerJobId?: string;
};
```

- [ ] **Step 2: Add `getGenerationByProviderJobId` to `src/lib/db/generations.ts`**

Append to the end of the file:

```typescript
export async function getGenerationByProviderJobId(
  providerJobId: string,
): Promise<GenerationRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("provider_job_id", providerJobId)
    .single();
  if (error) return null;
  return data as GenerationRow;
}

export async function setProviderJobId(
  generationId: string,
  providerJobId: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("generations")
    .update({ provider_job_id: providerJobId })
    .eq("id", generationId);
  if (error) throw error;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/video-gen/types.ts src/lib/db/generations.ts
git commit -m "feat: add kling provider type, VideoGenResult.providerJobId, DB helpers for provider_job_id"
```

---

## Task 3: Kling provider

**Files:**
- Create: `src/lib/video-gen/providers/kling.ts`
- Test: `src/lib/video-gen/__tests__/kling-provider.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/video-gen/__tests__/kling-provider.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("buildKlingRequestBody", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.KLING_API_KEY = "test-key";
  });

  it("maps params to correct Kling API fields", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({
      modelName: "kling-v1-5",
      imageBase64: "base64data",
      mimeType: "image/jpeg",
      prompt: "a cat walking",
      params: {
        mode: "pro",
        duration: "5",
        aspect_ratio: "16:9",
        cfg_scale: 0.5,
        negative_prompt: "",
        pan: 0,
        tilt: 0,
        zoom: 0,
        roll: 0,
        horizontal_movement: 0,
        vertical_movement: 0,
      },
      callbackUrl: "https://app.example.com/api/webhooks/generation?provider=kling",
    });

    expect(body.model_name).toBe("kling-v1-5");
    expect(body.mode).toBe("pro");
    expect(body.duration).toBe(5);
    expect(body.aspect_ratio).toBe("16:9");
    expect(body.cfg_scale).toBe(0.5);
    expect(body.callback_url).toBe("https://app.example.com/api/webhooks/generation?provider=kling");
    expect(body.image).toEqual({ type: "base64", value: "base64data" });
  });

  it("omits camera motion params when all are zero", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({
      modelName: "kling-v1-5",
      imageBase64: "base64data",
      mimeType: "image/jpeg",
      prompt: "test",
      params: { mode: "pro", duration: "5", aspect_ratio: "16:9", cfg_scale: 0.5,
        negative_prompt: "", pan: 0, tilt: 0, zoom: 0, roll: 0,
        horizontal_movement: 0, vertical_movement: 0 },
      callbackUrl: "https://example.com/webhook",
    });
    expect(body.camera_control).toBeUndefined();
  });

  it("includes camera_control when any motion param is non-zero", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({
      modelName: "kling-v1-5",
      imageBase64: "base64data",
      mimeType: "image/jpeg",
      prompt: "test",
      params: { mode: "pro", duration: "5", aspect_ratio: "16:9", cfg_scale: 0.5,
        negative_prompt: "", pan: 3, tilt: 0, zoom: 0, roll: 0,
        horizontal_movement: 0, vertical_movement: 0 },
      callbackUrl: "https://example.com/webhook",
    });
    expect(body.camera_control).toEqual({ type: "customize", config: { pan: 3, tilt: 0, zoom: 0, roll: 0, horizontal: 0, vertical: 0 } });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/video-gen/__tests__/kling-provider.test.ts
```

Expected: FAIL — `Cannot find module '../providers/kling'`

- [ ] **Step 3: Create `src/lib/video-gen/providers/kling.ts`**

```typescript
import "server-only";
import type { VideoGenInput, VideoGenResult, VideoGenModelSpec } from "../types";
import { klingLegacyParams, klingV3Params } from "../params/kling";

const KLING_API_BASE = "https://api.klingai.com/v1";

function getApiKey(): string {
  const key = process.env.KLING_API_KEY;
  if (!key) throw new Error("Missing KLING_API_KEY");
  return key;
}

async function fetchAsBase64(
  url: string,
): Promise<{ imageBase64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${url}`);
  const mimeType = (res.headers.get("content-type") ?? "image/jpeg")
    .split(";")[0]
    .trim();
  const imageBase64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { imageBase64, mimeType };
}

type KlingRequestBodyInput = {
  modelName: string;
  imageBase64: string;
  mimeType: string;
  prompt: string;
  params: Record<string, unknown>;
  callbackUrl: string;
};

export function buildKlingRequestBody(input: KlingRequestBodyInput): Record<string, unknown> {
  const { modelName, imageBase64, prompt, params, callbackUrl } = input;

  const pan = Number(params.pan ?? 0);
  const tilt = Number(params.tilt ?? 0);
  const zoom = Number(params.zoom ?? 0);
  const roll = Number(params.roll ?? 0);
  const horizontal = Number(params.horizontal_movement ?? 0);
  const vertical = Number(params.vertical_movement ?? 0);
  const hasMotion = [pan, tilt, zoom, roll, horizontal, vertical].some((v) => v !== 0);

  const negativePrompt = String(params.negative_prompt ?? "").trim();

  return {
    model_name: modelName,
    image: { type: "base64", value: imageBase64 },
    prompt,
    mode: String(params.mode ?? "pro"),
    duration: Number(params.duration ?? 5),
    aspect_ratio: String(params.aspect_ratio ?? "16:9"),
    cfg_scale: Number(params.cfg_scale ?? 0.5),
    ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    ...(hasMotion
      ? {
          camera_control: {
            type: "customize",
            config: { pan, tilt, zoom, roll, horizontal, vertical },
          },
        }
      : {}),
    callback_url: callbackUrl,
  };
}

type KlingCreateResponse = {
  code: number;
  message: string;
  data: { task_id: string; task_status: string };
};

async function generateWithKling(
  modelName: string,
  input: VideoGenInput,
): Promise<VideoGenResult> {
  const apiKey = getApiKey();
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("Missing APP_URL");

  if (!input.startFrameUrl) {
    throw new Error("Kling image-to-video requires a start frame image");
  }

  const { imageBase64, mimeType } = await fetchAsBase64(input.startFrameUrl);

  const callbackUrl = `${appUrl}/api/webhooks/generation?provider=kling`;
  const body = buildKlingRequestBody({
    modelName,
    imageBase64,
    mimeType,
    prompt: input.prompt,
    params: input.params,
    callbackUrl,
  });

  const res = await fetch(`${KLING_API_BASE}/videos/image2video`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kling API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as KlingCreateResponse;
  if (json.code !== 0) {
    throw new Error(`Kling API rejected request: ${json.message}`);
  }

  const taskId = json.data.task_id;
  const durationSeconds = Number(input.params.duration ?? 5);

  // Return immediately — Kling will POST to callbackUrl on completion.
  // providerJobId is stored in generations.provider_job_id for webhook lookup.
  return {
    videoUrl: "",
    durationSeconds,
    providerJobId: taskId,
  };
}

const KLING_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: false,
  maxReferenceImages: 0,
} as const;

function makeKlingModel(
  id: string,
  label: string,
  modelName: string,
  maxDurationSeconds: number,
  params: typeof klingLegacyParams,
): VideoGenModelSpec {
  return {
    id,
    provider: "kling",
    label,
    providerLabel: "Kling",
    maxDurationSeconds,
    imageInputs: KLING_IMAGE_INPUTS,
    params,
    generate: (input) => generateWithKling(modelName, input),
  };
}

export const klingV15 = makeKlingModel("kling:kling-v1-5", "Kling 1.5", "kling-v1-5", 10, klingLegacyParams);
export const klingV16 = makeKlingModel("kling:kling-v1-6", "Kling 1.6", "kling-v1-6", 10, klingLegacyParams);
export const klingV21 = makeKlingModel("kling:kling-v2-1", "Kling 2.1", "kling-v2-1", 10, klingLegacyParams);
export const klingV21Master = makeKlingModel("kling:kling-v2-1-master", "Kling 2.1 Master", "kling-v2-1-master", 10, klingLegacyParams);
export const klingV26 = makeKlingModel("kling:kling-v2-6", "Kling 2.6", "kling-v2-6", 10, klingLegacyParams);
export const klingV3 = makeKlingModel("kling:kling-v3", "Kling 3.0", "kling-v3", 15, klingV3Params);
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/lib/video-gen/__tests__/kling-provider.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video-gen/providers/kling.ts src/lib/video-gen/__tests__/kling-provider.test.ts
git commit -m "feat: add Kling provider — webhook-first, returns providerJobId"
```

---

## Task 4: Register Kling models in registry and client-models

**Files:**
- Modify: `src/lib/video-gen/registry.ts`
- Modify: `src/lib/video-gen/client-models.ts`
- Modify: `src/lib/video-gen/cost.ts`

- [ ] **Step 1: Update `src/lib/video-gen/registry.ts`**

```typescript
import "server-only";
import type { VideoGenModelSpec } from "./types";
import { veoLite, veoFast, veoQuality } from "./providers/veo";
import { soraFast } from "./providers/sora";
import { klingV15, klingV16, klingV21, klingV21Master, klingV26, klingV3 } from "./providers/kling";

export const videoGenRegistry: Record<string, VideoGenModelSpec> = {
  [veoLite.id]: veoLite,
  [veoFast.id]: veoFast,
  [veoQuality.id]: veoQuality,
  [soraFast.id]: soraFast,
  [klingV15.id]: klingV15,
  [klingV16.id]: klingV16,
  [klingV21.id]: klingV21,
  [klingV21Master.id]: klingV21Master,
  [klingV26.id]: klingV26,
  [klingV3.id]: klingV3,
};

export const DEFAULT_VIDEO_MODEL_ID = "veo:veo-3.1-fast";
```

- [ ] **Step 2: Update `src/lib/video-gen/client-models.ts`**

Add after the existing `SORA_RULES` block and before `videoGenClientModelMap`, add:

```typescript
import { klingLegacyParams, klingV3Params } from "./params/kling";

const KLING_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: false,
  maxReferenceImages: 0,
} as const;
```

Then add Kling entries to `videoGenClientModelMap`:

```typescript
  "kling:kling-v1-5": {
    id: "kling:kling-v1-5",
    provider: "kling",
    label: "Kling 1.5",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_IMAGE_INPUTS,
    params: klingLegacyParams,
    rules: [],
  },
  "kling:kling-v1-6": {
    id: "kling:kling-v1-6",
    provider: "kling",
    label: "Kling 1.6",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_IMAGE_INPUTS,
    params: klingLegacyParams,
    rules: [],
  },
  "kling:kling-v2-1": {
    id: "kling:kling-v2-1",
    provider: "kling",
    label: "Kling 2.1",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_IMAGE_INPUTS,
    params: klingLegacyParams,
    rules: [],
  },
  "kling:kling-v2-1-master": {
    id: "kling:kling-v2-1-master",
    provider: "kling",
    label: "Kling 2.1 Master",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_IMAGE_INPUTS,
    params: klingLegacyParams,
    rules: [],
  },
  "kling:kling-v2-6": {
    id: "kling:kling-v2-6",
    provider: "kling",
    label: "Kling 2.6",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_IMAGE_INPUTS,
    params: klingLegacyParams,
    rules: [],
  },
  "kling:kling-v3": {
    id: "kling:kling-v3",
    provider: "kling",
    label: "Kling 3.0",
    providerLabel: "Kling",
    maxDurationSeconds: 15,
    imageInputs: KLING_IMAGE_INPUTS,
    params: klingV3Params,
    rules: [],
  },
```

- [ ] **Step 3: Update `src/lib/video-gen/cost.ts`**

Add Kling pricing entries to `VIDEO_MODEL_PRICING`:

```typescript
  // Source: klingai.com pricing (verified July 2026)
  // v1.5: ~2 credits/sec at $0.015/credit ≈ $0.030/s
  // v1.6: ~3 credits/sec ≈ $0.040/s
  // v2.1: ~4 credits/sec ≈ $0.060/s
  // v2.1-master: ~5 credits/sec ≈ $0.080/s
  // v2.6: ~7 credits/sec ≈ $0.100/s
  // v3 pro: ~8 credits/sec ≈ $0.120/s (using pro rate as default, D-kling-1)
  "kling:kling-v1-5":       { perSecond: 0.030, audioMultiplier: 1.0 },
  "kling:kling-v1-6":       { perSecond: 0.040, audioMultiplier: 1.0 },
  "kling:kling-v2-1":       { perSecond: 0.060, audioMultiplier: 1.0 },
  "kling:kling-v2-1-master": { perSecond: 0.080, audioMultiplier: 1.0 },
  "kling:kling-v2-6":       { perSecond: 0.100, audioMultiplier: 1.0 },
  "kling:kling-v3":         { perSecond: 0.120, audioMultiplier: 1.0 },
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/registry.ts src/lib/video-gen/client-models.ts src/lib/video-gen/cost.ts
git commit -m "feat: register 6 Kling models in registry, client-models, and cost table"
```

---

## Task 5: Wire `providerJobId` through Trigger.dev task

**Files:**
- Modify: `trigger/video-generate.ts`

The Kling provider returns `providerJobId` in its `VideoGenResult`. The Trigger.dev task needs to persist it to `generations.provider_job_id` so the webhook handler can look up the generation.

- [ ] **Step 1: Update `trigger/video-generate.ts`**

Replace the success block (after `const result = await config.generate(...)`) with:

```typescript
      const result = await config.generate({
        prompt: payload.prompt,
        startFrameUrl: payload.startFrameUrl,
        endFrameUrl: payload.endFrameUrl,
        referenceUrls: payload.referenceUrls ?? [],
        params: payload.params,
      });

      logger.info("Video generation call succeeded", {
        generationId,
        modelId,
        videoUrl: result.videoUrl,
        durationSeconds: result.durationSeconds,
        providerJobId: result.providerJobId,
      });

      // Kling uses webhook delivery — store providerJobId and return.
      // The webhook handler calls completeGeneration() on its own.
      if (result.providerJobId) {
        const { setProviderJobId } = await import("@/lib/db/generations");
        await setProviderJobId(generationId, result.providerJobId);
        logger.info("Kling job submitted — waiting for webhook", { generationId, taskId: result.providerJobId });
        return;
      }

      // Non-webhook providers (Veo, Sora): post completion immediately
      await postWebhook({
        generationId,
        status: "succeeded",
        videoUrl: result.videoUrl,
        durationSeconds: result.durationSeconds,
      });
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add trigger/video-generate.ts
git commit -m "feat: persist Kling providerJobId in Trigger.dev task, skip self-webhook for webhook-first providers"
```

---

## Task 6: Kling webhook handler branch

**Files:**
- Modify: `src/app/api/webhooks/generation/route.ts`
- Modify: `src/lib/generations/complete.ts`
- Test: `src/app/api/webhooks/generation/__tests__/kling-webhook.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/api/webhooks/generation/__tests__/kling-webhook.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { mapKlingWebhookPayload } from "../kling-mapper";

describe("mapKlingWebhookPayload", () => {
  it("maps succeed status to succeeded", () => {
    const payload = {
      task_id: "abc123",
      task_status: "succeed",
      task_status_msg: "",
      task_result: { videos: [{ url: "https://cdn.kling.com/video.mp4", duration: "5.0" }] },
    };
    const result = mapKlingWebhookPayload(payload);
    expect(result).toEqual({
      providerJobId: "abc123",
      status: "succeeded",
      videoUrl: "https://cdn.kling.com/video.mp4",
      durationSeconds: 5,
    });
  });

  it("maps failed status to failed", () => {
    const payload = {
      task_id: "abc123",
      task_status: "failed",
      task_status_msg: "NSFW content detected",
      task_result: { videos: [] },
    };
    const result = mapKlingWebhookPayload(payload);
    expect(result).toEqual({
      providerJobId: "abc123",
      status: "failed",
      error: "NSFW content detected",
    });
  });

  it("returns null for unrecognised status (still processing)", () => {
    const payload = {
      task_id: "abc123",
      task_status: "processing",
      task_status_msg: "",
      task_result: { videos: [] },
    };
    expect(mapKlingWebhookPayload(payload)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/webhooks/generation/__tests__/kling-webhook.test.ts
```

Expected: FAIL — `Cannot find module '../kling-mapper'`

- [ ] **Step 3: Create `src/app/api/webhooks/generation/kling-mapper.ts`**

```typescript
type KlingWebhookPayload = {
  task_id: string;
  task_status: string;
  task_status_msg: string;
  task_result: { videos: Array<{ url: string; duration: string }> };
};

type KlingMappedResult =
  | { providerJobId: string; status: "succeeded"; videoUrl: string; durationSeconds: number }
  | { providerJobId: string; status: "failed"; error: string }
  | null;

export function mapKlingWebhookPayload(payload: KlingWebhookPayload): KlingMappedResult {
  if (payload.task_status === "succeed") {
    const video = payload.task_result.videos[0];
    return {
      providerJobId: payload.task_id,
      status: "succeeded",
      videoUrl: video.url,
      durationSeconds: parseFloat(video.duration),
    };
  }
  if (payload.task_status === "failed") {
    return {
      providerJobId: payload.task_id,
      status: "failed",
      error: payload.task_status_msg || "Kling generation failed",
    };
  }
  return null;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/app/api/webhooks/generation/__tests__/kling-webhook.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Update `src/app/api/webhooks/generation/route.ts`**

```typescript
import { completeGeneration } from "@/lib/generations/complete";
import { getGenerationByProviderJobId } from "@/lib/db/generations";
import { mapKlingWebhookPayload } from "./kling-mapper";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");

  const body = await req.json().catch(() => null);
  if (!body) return apiError("Invalid JSON body", 400);

  // Kling webhook branch
  if (provider === "kling") {
    const mapped = mapKlingWebhookPayload(body);
    if (!mapped) return apiOk({ ok: true, skipped: "not terminal status" });

    const generation = await getGenerationByProviderJobId(mapped.providerJobId);
    if (!generation) return apiError("Generation not found for provider job", 404);

    if (mapped.status === "failed") {
      await completeGeneration({ generationId: generation.id, status: "failed", error: mapped.error });
    } else {
      await completeGeneration({
        generationId: generation.id,
        status: "succeeded",
        videoUrl: mapped.videoUrl,
        durationSeconds: mapped.durationSeconds,
      });
    }
    return apiOk({ ok: true });
  }

  // Existing internal webhook (Veo, Sora via Trigger.dev)
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

- [ ] **Step 6: Add Kling download header branch in `src/lib/generations/complete.ts`**

In `buildVideoDownloadHeaders`, add a branch for `kling:` prefix. Kling CDN URLs are public — no auth header required:

```typescript
function buildVideoDownloadHeaders(modelUsed: string | null): HeadersInit {
  const base = { "User-Agent": "Mozilla/5.0 (compatible; CreativeOS/1.0)" };
  if (modelUsed?.startsWith("veo:")) {
    const key = process.env.GOOGLE_GENAI_API_KEY ?? "";
    return { ...base, "x-goog-api-key": key };
  }
  if (modelUsed?.startsWith("openai:")) {
    const key = process.env.OPENAI_API_KEY ?? "";
    return { ...base, Authorization: `Bearer ${key}` };
  }
  // kling: CDN URLs are publicly accessible — no auth header needed
  return base;
}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No new errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/webhooks/generation/route.ts src/app/api/webhooks/generation/kling-mapper.ts src/app/api/webhooks/generation/__tests__/kling-webhook.test.ts src/lib/generations/complete.ts
git commit -m "feat: add Kling webhook handler branch and payload mapper"
```

---

## Task 7: VideoGenParamsPanel — group/order accordion

**Files:**
- Modify: `src/components/nodes/video-gen-params-panel.tsx`

The panel currently renders all visible params flat. We need to split by `group` (sorted by `order`) and wrap `advanced` params in a collapsed Accordion — same pattern as `image-gen-output-settings.tsx`.

- [ ] **Step 1: Update `src/components/nodes/video-gen-params-panel.tsx`**

Replace the entire file content:

```typescript
"use client";

import {
  Cpu,
  Crop,
  Gauge,
  LayoutGrid,
  Maximize2,
  Move,
  Settings2,
  Timer,
  type LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";
import { ImageGenParamRow } from "./image-gen-param-row";
import { ParamControl } from "./param-controls";
import type { ParamSpec } from "@/lib/image-gen/types";

const PARAM_ICONS: Record<string, LucideIcon> = {
  aspect_ratio:        Crop,
  duration:            Timer,
  seconds:             Timer,
  size:                LayoutGrid,
  mode:                Gauge,
  cfg_scale:           Settings2,
  negative_prompt:     Settings2,
  pan:                 Move,
  tilt:                Move,
  zoom:                Maximize2,
  roll:                Move,
  horizontal_movement: Move,
  vertical_movement:   Move,
};

const SELECT_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

type Props = {
  modelId: string;
  params: Record<string, unknown>;
  onModelChange: (modelId: string) => void;
  onParamChange: (name: string, value: unknown) => void;
  lockedParams?: Record<string, unknown>;
  lockedParamReasons?: Record<string, string>;
};

export function VideoGenParamsPanel({
  modelId,
  params,
  onModelChange,
  onParamChange,
  lockedParams = {},
  lockedParamReasons = {},
}: Props) {
  const model = videoGenClientModelMap[modelId];
  const visibleParams = (model?.params ?? [])
    .filter((p: ParamSpec) => p.visible)
    .sort((a: ParamSpec, b: ParamSpec) => a.order - b.order);

  const primaryParams = visibleParams.filter((p: ParamSpec) => p.group === "primary");
  const advancedParams = visibleParams.filter((p: ParamSpec) => p.group === "advanced");

  function renderParamRow(spec: ParamSpec) {
    const lockedValue = lockedParams[spec.name];
    const isLocked = spec.name in lockedParams;
    const reason = lockedParamReasons[spec.name];

    if (isLocked && spec.constraints.type === "select") {
      const options = spec.constraints.options;
      return (
        <ImageGenParamRow
          key={spec.name}
          icon={PARAM_ICONS[spec.name] ?? Settings2}
          label={spec.label}
        >
          <Tooltip>
            <TooltipTrigger render={<span className="min-w-0 flex-1" />}>
              <select
                value={String(lockedValue)}
                onChange={() => {}}
                className={SELECT_CLS}
              >
                {options.map((opt) => (
                  <option key={opt} value={opt} disabled={opt !== String(lockedValue)}>
                    {opt}
                  </option>
                ))}
              </select>
            </TooltipTrigger>
            {reason && <TooltipContent side="top">{reason}</TooltipContent>}
          </Tooltip>
        </ImageGenParamRow>
      );
    }

    return (
      <ImageGenParamRow
        key={spec.name}
        icon={PARAM_ICONS[spec.name] ?? Settings2}
        label={spec.label}
      >
        <ParamControl
          spec={spec}
          value={params[spec.name] ?? spec.defaultValue}
          onChange={(v) => onParamChange(spec.name, v)}
        />
      </ImageGenParamRow>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-2">
        {/* Model row */}
        <ImageGenParamRow icon={Cpu} label="Model">
          <select
            value={modelId}
            onChange={(e) => onModelChange(e.target.value)}
            className={SELECT_CLS}
          >
            {Object.values(videoGenClientModelMap).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.providerLabel})
              </option>
            ))}
          </select>
        </ImageGenParamRow>

        {/* Primary params */}
        {primaryParams.map(renderParamRow)}

        {/* Advanced params — collapsed accordion */}
        {advancedParams.length > 0 && (
          <Accordion multiple={false} className="pt-1">
            <AccordionItem value="advanced" className="border-none">
              <AccordionTrigger className="py-1 text-[0.7rem] tracking-wide uppercase text-muted-foreground hover:text-foreground hover:no-underline">
                Advanced
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <div className="space-y-2">
                  {advancedParams.map(renderParamRow)}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/video-gen-params-panel.tsx
git commit -m "feat: video gen params panel — split primary/advanced by group, accordion for advanced (matches image gen pattern)"
```

---

## Task 8: Env var and final checks

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add `KLING_API_KEY` to `.env.example`**

Add after the OpenAI key line (find the block with `OPENAI_API_KEY`):

```
KLING_API_KEY=                    # From Kling developer console — shown once, copy immediately
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass (including the two new test files from Tasks 1, 3, 6).

- [ ] **Step 3: Run TypeScript check one final time**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: add KLING_API_KEY to .env.example"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] All 6 Kling models in registry and client-models (Task 4)
- [x] Kling in model picker — flows from `videoGenClientModelMap` automatically (Task 4)
- [x] Generate sends start frame + compiled prompt to Kling API (Task 3)
- [x] Job runs async — `providerJobId` stored, Trigger.dev task exits early (Task 5)
- [x] Webhook branch maps Kling payload → `completeGeneration()` (Task 6)
- [x] Kling-specific params with primary/advanced split (Tasks 1, 7)
- [x] Cost recorded correctly (Task 4, cost.ts)
- [x] v3 has 3–15s duration, v1.x/v2.x have 5/10s (Task 1)
- [x] `VideoGenParamsPanel` uses group/order accordion pattern (Task 7)
- [x] `KLING_API_KEY` env var (Task 8)

**Type consistency:**
- `providerJobId` defined in `VideoGenResult` (Task 2), used in provider (Task 3), consumed in Trigger task (Task 5)
- `getGenerationByProviderJobId` + `setProviderJobId` defined in Task 2, used in Tasks 5 and 6
- `buildKlingRequestBody` exported from provider, tested in Task 3
- `mapKlingWebhookPayload` exported from kling-mapper, tested in Task 6
