# Kling API Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 6 broken Kling video models on `main` with 5 models that call Kling's real, verified API (dedicated per-model endpoints, `contents[]`/`settings`/`options` body, `api-singapore.klingai.com` host), switch completion from webhook to polling for log visibility, and fix pricing to use real per-resolution/per-audio rates.

**Architecture:** Each Kling model gets its own tiny settings-builder function (fields genuinely differ per model) sharing one `contents[]`/`options` builder. `generateWithKling` creates the task then polls `GET /tasks` until terminal, logging every iteration — same shape as `generateWithVeo`/`generateWithSora`, no webhook/`provider_job_id` plumbing. Pricing becomes resolution-keyed for Kling only; Veo/Sora's flat per-second table is untouched.

**Tech Stack:** TypeScript, Next.js App Router, Vitest, Trigger.dev v3.

**Spec:** `docs/superpowers/specs/2026-07-23-kling-api-correction-design.md`

## Global Constraints

- Base host: `https://api-singapore.klingai.com` (no `/v1` prefix on these 5 endpoints).
- `contents[].url` accepts a plain URL directly — no need to fetch-and-base64-encode the
  image (unlike Veo's SDK, which requires bytes). Confirmed by the doc: *"content can be
  provided via URL or Base64... simply fill in the relevant information."*
- No `cfg_scale`, `camera_control`, `mode`, `negative_prompt`, `pan`/`tilt`/`zoom`/`roll`/
  `horizontal_movement`/`vertical_movement` anywhere — none of these exist on the 5
  target endpoints.
- `ParamComponent` values available: `"select" | "slider" | "toggle" | "number" |
  "textarea"` (from `src/lib/image-gen/types.ts`) — `multi_shot` uses `"toggle"`, not a
  custom switch component (already built, no UI work needed).
- Query-task response shape (shared by all 5 endpoints): `{ code, message, request_id,
  data: [{ id, status: "submitted"|"processing"|"succeeded"|"failed", message?,
  outputs?: [{ type: "video", url, watermark_url, duration }] }] }`.

---

## Task 1: Kling param specs (5 models)

**Files:**
- Rewrite: `src/lib/video-gen/params/kling.ts`
- Rewrite (replaces old content): `src/lib/video-gen/__tests__/kling-params.test.ts`

**Interfaces:**
- Produces: `kling30TurboParams`, `kling26Params`, `kling25TurboParams`, `kling30Params`,
  `klingO1Params` — each `ParamSpec[]`, consumed by Task 3 (registry) and Task 4
  (client-models).

- [ ] **Step 1: Write failing tests**

Create `src/lib/video-gen/__tests__/kling-params.test.ts` (this replaces the entire old
file content — the old exports `klingLegacyParams`/`klingV3Params` no longer exist):

```typescript
import { describe, it, expect } from "vitest";
import {
  kling30TurboParams,
  kling26Params,
  kling25TurboParams,
  kling30Params,
  klingO1Params,
} from "../params/kling";

function names(params: typeof kling30TurboParams) {
  return params.map((p) => p.name);
}

describe("kling30TurboParams", () => {
  it("has resolution and duration only, no audio or multi_shot", () => {
    expect(names(kling30TurboParams)).toEqual(["resolution", "duration"]);
  });

  it("resolution options are 720p/1080p", () => {
    const p = kling30TurboParams.find((p) => p.name === "resolution")!;
    expect(p.constraints).toEqual({ type: "select", options: ["720p", "1080p"] });
  });

  it("duration options are 3 through 15", () => {
    const p = kling30TurboParams.find((p) => p.name === "duration")!;
    expect(p.constraints).toEqual({
      type: "select",
      options: ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
    });
  });
});

describe("kling26Params", () => {
  it("has resolution, duration, and audio", () => {
    expect(names(kling26Params)).toEqual(
      expect.arrayContaining(["resolution", "duration", "audio"]),
    );
    expect(names(kling26Params)).not.toContain("multi_shot");
  });

  it("duration options are 5 and 10 only", () => {
    const p = kling26Params.find((p) => p.name === "duration")!;
    expect(p.constraints).toEqual({ type: "select", options: ["5", "10"] });
  });

  it("audio options are native/off, default off", () => {
    const p = kling26Params.find((p) => p.name === "audio")!;
    expect(p.constraints).toEqual({ type: "select", options: ["native", "off"] });
    expect(p.defaultValue).toBe("off");
  });
});

describe("kling25TurboParams", () => {
  it("has resolution and duration only", () => {
    expect(names(kling25TurboParams)).toEqual(["resolution", "duration"]);
  });

  it("duration options are 5 and 10 only", () => {
    const p = kling25TurboParams.find((p) => p.name === "duration")!;
    expect(p.constraints).toEqual({ type: "select", options: ["5", "10"] });
  });
});

describe("kling30Params", () => {
  it("has resolution, duration, audio, and multi_shot", () => {
    expect(names(kling30Params)).toEqual(
      expect.arrayContaining(["resolution", "duration", "audio", "multi_shot"]),
    );
  });

  it("resolution includes 4k", () => {
    const p = kling30Params.find((p) => p.name === "resolution")!;
    expect(p.constraints).toEqual({ type: "select", options: ["720p", "1080p", "4k"] });
  });

  it("multi_shot is a toggle defaulting true", () => {
    const p = kling30Params.find((p) => p.name === "multi_shot")!;
    expect(p.component).toBe("toggle");
    expect(p.constraints).toEqual({ type: "toggle" });
    expect(p.defaultValue).toBe(true);
  });
});

describe("klingO1Params", () => {
  it("has resolution, duration, and audio (no multi_shot)", () => {
    expect(names(klingO1Params)).toEqual(
      expect.arrayContaining(["resolution", "duration", "audio"]),
    );
    expect(names(klingO1Params)).not.toContain("multi_shot");
  });

  it("audio options are original/off, distinct from 2.6/3.0's native/off", () => {
    const p = klingO1Params.find((p) => p.name === "audio")!;
    expect(p.constraints).toEqual({ type: "select", options: ["original", "off"] });
  });

  it("duration options are 3 through 10", () => {
    const p = klingO1Params.find((p) => p.name === "duration")!;
    expect(p.constraints).toEqual({
      type: "select",
      options: ["3", "4", "5", "6", "7", "8", "9", "10"],
    });
  });
});

describe("all model param sets", () => {
  it("are all visible", () => {
    for (const params of [
      kling30TurboParams,
      kling26Params,
      kling25TurboParams,
      kling30Params,
      klingO1Params,
    ]) {
      expect(params.every((p) => p.visible)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/video-gen/__tests__/kling-params.test.ts
```

Expected: FAIL — `Cannot find module` or missing exports (old file only exports
`klingLegacyParams`/`klingV3Params`).

- [ ] **Step 3: Rewrite `src/lib/video-gen/params/kling.ts`**

Replace the entire file content:

```typescript
import type { ParamSpec } from "@/lib/image-gen/types";

function resolutionParam(options: string[], defaultValue: string): ParamSpec {
  return {
    name: "resolution",
    label: "Resolution",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue,
    constraints: { type: "select", options },
  };
}

function durationParam(options: string[], defaultValue: string): ParamSpec {
  return {
    name: "duration",
    label: "Duration",
    component: "select",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue,
    constraints: { type: "select", options },
  };
}

function audioParam(options: string[], defaultValue: string): ParamSpec {
  return {
    name: "audio",
    label: "Audio",
    component: "select",
    group: "advanced",
    order: 0,
    visible: true,
    defaultValue,
    constraints: { type: "select", options },
  };
}

const multiShotParam: ParamSpec = {
  name: "multi_shot",
  label: "Multi-Shot",
  component: "toggle",
  group: "advanced",
  order: 1,
  visible: true,
  defaultValue: true,
  constraints: { type: "toggle" },
};

const DURATION_3_TO_15 = [
  "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15",
];

export const kling30TurboParams: ParamSpec[] = [
  resolutionParam(["720p", "1080p"], "720p"),
  durationParam(DURATION_3_TO_15, "5"),
];

export const kling26Params: ParamSpec[] = [
  resolutionParam(["720p", "1080p"], "720p"),
  durationParam(["5", "10"], "5"),
  audioParam(["native", "off"], "off"),
];

export const kling25TurboParams: ParamSpec[] = [
  resolutionParam(["720p", "1080p"], "720p"),
  durationParam(["5", "10"], "5"),
];

export const kling30Params: ParamSpec[] = [
  resolutionParam(["720p", "1080p", "4k"], "720p"),
  durationParam(DURATION_3_TO_15, "5"),
  audioParam(["native", "off"], "off"),
  multiShotParam,
];

export const klingO1Params: ParamSpec[] = [
  resolutionParam(["720p", "1080p"], "720p"),
  durationParam(["3", "4", "5", "6", "7", "8", "9", "10"], "5"),
  audioParam(["original", "off"], "off"),
];
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/lib/video-gen/__tests__/kling-params.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: New errors only in files this plan hasn't touched yet (registry.ts,
client-models.ts, providers/kling.ts still reference the old exports) — that's expected
until Tasks 2–4 land. Confirm no errors specifically in `params/kling.ts` or its test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video-gen/params/kling.ts src/lib/video-gen/__tests__/kling-params.test.ts
git commit -m "feat(kling): rewrite param specs for the 5 real Kling models"
```

---

## Task 2: Kling provider — contents/settings builders + polling

**Files:**
- Rewrite: `src/lib/video-gen/providers/kling.ts`
- Rewrite (replaces old content): `src/lib/video-gen/__tests__/kling-provider.test.ts`

**Interfaces:**
- Consumes: `kling30TurboParams`, `kling26Params`, `kling25TurboParams`, `kling30Params`,
  `klingO1Params` from Task 1 (`../params/kling`); `VideoGenInput`, `VideoGenResult`,
  `VideoGenModelSpec` from `../types` (note: `VideoGenResult.providerJobId` still exists
  at this point — removed in Task 6, this task just doesn't set it).
- Produces: `buildKlingContents(input)`, `build3_0TurboSettings(params)`,
  `build2_6Settings(params)`, `build2_5TurboSettings(params)`, `build3_0Settings(params)`,
  `buildO1Settings(params)`, and model exports `kling30Turbo`, `kling26`, `kling25Turbo`,
  `kling30`, `klingO1` (each `VideoGenModelSpec`) — consumed by Task 3 (registry).

- [ ] **Step 1: Write failing tests**

Create `src/lib/video-gen/__tests__/kling-provider.test.ts` (replaces the entire old
file — old exports `buildKlingRequestBody` no longer exists):

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("buildKlingContents", () => {
  it("includes prompt and first_frame when startFrameUrl is given", async () => {
    const { buildKlingContents } = await import("../providers/kling");
    const contents = buildKlingContents({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
    });
    expect(contents).toEqual([
      { type: "prompt", text: "a cat walking" },
      { type: "first_frame", url: "https://x.test/start.png" },
    ]);
  });

  it("includes last_frame when endFrameUrl is given", async () => {
    const { buildKlingContents } = await import("../providers/kling");
    const contents = buildKlingContents({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
      endFrameUrl: "https://x.test/end.png",
    });
    expect(contents).toEqual([
      { type: "prompt", text: "a cat walking" },
      { type: "first_frame", url: "https://x.test/start.png" },
      { type: "last_frame", url: "https://x.test/end.png" },
    ]);
  });

  it("omits last_frame when endFrameUrl is absent", async () => {
    const { buildKlingContents } = await import("../providers/kling");
    const contents = buildKlingContents({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
    });
    expect(contents.some((c) => c.type === "last_frame")).toBe(false);
  });
});

describe("per-model settings builders", () => {
  it("build3_0TurboSettings reads resolution and duration only", async () => {
    const { build3_0TurboSettings } = await import("../providers/kling");
    expect(build3_0TurboSettings({ resolution: "1080p", duration: "10" })).toEqual({
      resolution: "1080p",
      duration: 10,
    });
  });

  it("build2_6Settings includes audio", async () => {
    const { build2_6Settings } = await import("../providers/kling");
    expect(
      build2_6Settings({ resolution: "1080p", duration: "5", audio: "native" }),
    ).toEqual({ audio: "native", resolution: "1080p", duration: 5 });
  });

  it("build2_5TurboSettings reads resolution and duration only", async () => {
    const { build2_5TurboSettings } = await import("../providers/kling");
    expect(build2_5TurboSettings({ resolution: "720p", duration: "5" })).toEqual({
      resolution: "720p",
      duration: 5,
    });
  });

  it("build3_0Settings includes multi_shot and audio", async () => {
    const { build3_0Settings } = await import("../providers/kling");
    expect(
      build3_0Settings({
        resolution: "4k",
        duration: "15",
        audio: "native",
        multi_shot: false,
      }),
    ).toEqual({ multi_shot: false, audio: "native", resolution: "4k", duration: 15 });
  });

  it("buildO1Settings uses the original/off audio enum", async () => {
    const { buildO1Settings } = await import("../providers/kling");
    expect(
      buildO1Settings({ resolution: "1080p", duration: "10", audio: "original" }),
    ).toEqual({ audio: "original", resolution: "1080p", duration: 10 });
  });
});

describe("kling30Turbo.generate — poll flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    process.env.KLING_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts to the correct endpoint, polls until succeeded, returns video result", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "",
          data: { id: "task123", status: "submitted" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "",
          data: [{ id: "task123", status: "processing" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "",
          data: [
            {
              id: "task123",
              status: "succeeded",
              outputs: [{ type: "video", url: "https://cdn.test/video.mp4", duration: "5" }],
            },
          ],
        }),
      });

    const { kling30Turbo } = await import("../providers/kling");
    const resultPromise = kling30Turbo.generate({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
      referenceUrls: [],
      params: { resolution: "720p", duration: "5" },
    });

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual({
      videoUrl: "https://cdn.test/video.mp4",
      durationSeconds: 5,
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const createCall = mockFetch.mock.calls[0];
    expect(createCall[0]).toBe(
      "https://api-singapore.klingai.com/image-to-video/kling-3.0-turbo",
    );
    const pollCall = mockFetch.mock.calls[1];
    expect(pollCall[0]).toBe("https://api-singapore.klingai.com/tasks?task_ids=task123");
  });

  it("throws with the failure message when task status is failed", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "",
          data: { id: "task123", status: "submitted" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: "",
          data: [{ id: "task123", status: "failed", message: "NSFW content detected" }],
        }),
      });

    const { kling30Turbo } = await import("../providers/kling");
    const resultPromise = kling30Turbo.generate({
      prompt: "a cat walking",
      startFrameUrl: "https://x.test/start.png",
      referenceUrls: [],
      params: {},
    });

    const assertion = expect(resultPromise).rejects.toThrow("NSFW content detected");
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it("throws immediately when no start frame is provided", async () => {
    const { kling30Turbo } = await import("../providers/kling");
    await expect(
      kling30Turbo.generate({ prompt: "a cat walking", referenceUrls: [], params: {} }),
    ).rejects.toThrow("requires a start frame");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/video-gen/__tests__/kling-provider.test.ts
```

Expected: FAIL — old file has no `buildKlingContents`/settings-builder exports.

- [ ] **Step 3: Rewrite `src/lib/video-gen/providers/kling.ts`**

Replace the entire file content:

```typescript
import "server-only";
import { logger } from "@trigger.dev/sdk/v3";
import type { VideoGenInput, VideoGenResult, VideoGenModelSpec } from "../types";
import {
  kling30TurboParams,
  kling26Params,
  kling25TurboParams,
  kling30Params,
  klingO1Params,
} from "../params/kling";

const KLING_API_BASE = "https://api-singapore.klingai.com";
const POLL_INTERVAL_MS = 5_000;

function getApiKey(): string {
  const key = process.env.KLING_API_KEY;
  if (!key) throw new Error("Missing KLING_API_KEY");
  return key;
}

type KlingContentInput = {
  prompt: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
};

export function buildKlingContents(
  input: KlingContentInput,
): Array<Record<string, unknown>> {
  const contents: Array<Record<string, unknown>> = [
    { type: "prompt", text: input.prompt },
  ];
  if (input.startFrameUrl) {
    contents.push({ type: "first_frame", url: input.startFrameUrl });
  }
  if (input.endFrameUrl) {
    contents.push({ type: "last_frame", url: input.endFrameUrl });
  }
  return contents;
}

const KLING_OPTIONS = { watermark_info: { enabled: false } };

export function build3_0TurboSettings(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return {
    resolution: String(params.resolution ?? "720p"),
    duration: Number(params.duration ?? 5),
  };
}

export function build2_6Settings(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return {
    audio: String(params.audio ?? "off"),
    resolution: String(params.resolution ?? "720p"),
    duration: Number(params.duration ?? 5),
  };
}

export function build2_5TurboSettings(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return {
    resolution: String(params.resolution ?? "720p"),
    duration: Number(params.duration ?? 5),
  };
}

export function build3_0Settings(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return {
    multi_shot: Boolean(params.multi_shot ?? true),
    audio: String(params.audio ?? "off"),
    resolution: String(params.resolution ?? "720p"),
    duration: Number(params.duration ?? 5),
  };
}

export function buildO1Settings(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return {
    audio: String(params.audio ?? "off"),
    resolution: String(params.resolution ?? "720p"),
    duration: Number(params.duration ?? 5),
  };
}

type KlingCreateResponse = {
  code: number;
  message: string;
  data: { id: string; status: string };
};

async function createKlingTask(
  endpointPath: string,
  contents: Array<Record<string, unknown>>,
  settings: Record<string, unknown>,
): Promise<string> {
  const apiKey = getApiKey();
  const res = await fetch(`${KLING_API_BASE}${endpointPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ contents, settings, options: KLING_OPTIONS }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kling create failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as KlingCreateResponse;
  if (json.code !== 0) throw new Error(`Kling create rejected: ${json.message}`);
  return json.data.id;
}

type KlingTaskOutput = { type: string; url: string; duration?: string };
type KlingTask = {
  id: string;
  status: "submitted" | "processing" | "succeeded" | "failed";
  message?: string;
  outputs?: KlingTaskOutput[];
};
type KlingQueryResponse = { code: number; message: string; data: KlingTask[] };

async function pollKlingTask(taskId: string): Promise<VideoGenResult> {
  const apiKey = getApiKey();
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await fetch(`${KLING_API_BASE}/tasks?task_ids=${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Kling poll failed (${res.status})`);
    const json = (await res.json()) as KlingQueryResponse;
    const kTask = json.data[0];

    logger.info("Kling task status", { taskId, status: kTask?.status });

    if (kTask?.status === "succeeded") {
      const video = kTask.outputs?.find((o) => o.type === "video");
      if (!video) throw new Error("Kling task succeeded but returned no video output");
      return {
        videoUrl: video.url,
        durationSeconds: Number(video.duration ?? 0),
      };
    }
    if (kTask?.status === "failed") {
      throw new Error(`Kling generation failed: ${kTask.message ?? "unknown error"}`);
    }
  }
}

async function generateWithKling(
  endpointPath: string,
  buildSettings: (params: Record<string, unknown>) => Record<string, unknown>,
  input: VideoGenInput,
): Promise<VideoGenResult> {
  if (!input.startFrameUrl) {
    throw new Error("Kling image-to-video requires a start frame image");
  }
  const contents = buildKlingContents(input);
  const settings = buildSettings(input.params);
  const taskId = await createKlingTask(endpointPath, contents, settings);
  return pollKlingTask(taskId);
}

const KLING_IMAGE_INPUTS_NO_END = {
  startFrame: true,
  endFrame: false,
  maxReferenceImages: 0,
} as const;

const KLING_IMAGE_INPUTS_WITH_END = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 0,
} as const;

export const kling30Turbo: VideoGenModelSpec = {
  id: "kling:kling-3-0-turbo",
  provider: "kling",
  label: "Kling 3.0 Turbo",
  providerLabel: "Kling",
  maxDurationSeconds: 15,
  imageInputs: KLING_IMAGE_INPUTS_NO_END,
  params: kling30TurboParams,
  generate: (input) =>
    generateWithKling("/image-to-video/kling-3.0-turbo", build3_0TurboSettings, input),
};

export const kling26: VideoGenModelSpec = {
  id: "kling:kling-2-6",
  provider: "kling",
  label: "Kling 2.6",
  providerLabel: "Kling",
  maxDurationSeconds: 10,
  imageInputs: KLING_IMAGE_INPUTS_WITH_END,
  params: kling26Params,
  generate: (input) =>
    generateWithKling("/image-to-video/kling-2.6", build2_6Settings, input),
};

export const kling25Turbo: VideoGenModelSpec = {
  id: "kling:kling-2-5-turbo",
  provider: "kling",
  label: "Kling 2.5 Turbo",
  providerLabel: "Kling",
  maxDurationSeconds: 10,
  imageInputs: KLING_IMAGE_INPUTS_WITH_END,
  params: kling25TurboParams,
  generate: (input) =>
    generateWithKling("/image-to-video/kling-2.5-turbo", build2_5TurboSettings, input),
};

export const kling30: VideoGenModelSpec = {
  id: "kling:kling-3-0",
  provider: "kling",
  label: "Kling 3.0",
  providerLabel: "Kling",
  maxDurationSeconds: 15,
  imageInputs: KLING_IMAGE_INPUTS_WITH_END,
  params: kling30Params,
  generate: (input) => generateWithKling("/image-to-video/kling-3.0", build3_0Settings, input),
};

export const klingO1: VideoGenModelSpec = {
  id: "kling:kling-o1",
  provider: "kling",
  label: "Kling O1",
  providerLabel: "Kling",
  maxDurationSeconds: 10,
  imageInputs: KLING_IMAGE_INPUTS_WITH_END,
  params: klingO1Params,
  generate: (input) => generateWithKling("/omni-video/kling-o1", buildO1Settings, input),
};
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/lib/video-gen/__tests__/kling-provider.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Remaining errors only in `registry.ts`/`client-models.ts` (still reference old
`klingV15`/`klingLegacyParams` etc.) — fixed in Tasks 3–4.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video-gen/providers/kling.ts src/lib/video-gen/__tests__/kling-provider.test.ts
git commit -m "feat(kling): rewrite provider — contents/settings builders, poll-based completion"
```

---

## Task 3: Register the 5 models in the registry

**Files:**
- Modify: `src/lib/video-gen/registry.ts`

**Interfaces:**
- Consumes: `kling30Turbo`, `kling26`, `kling25Turbo`, `kling30`, `klingO1` from Task 2
  (`./providers/kling`).

- [ ] **Step 1: Replace the Kling import and registry entries**

Replace the entire file content:

```typescript
import "server-only";
import type { VideoGenModelSpec } from "./types";
import { veoLite, veoFast, veoQuality } from "./providers/veo";
import { soraFast } from "./providers/sora";
import { kling30Turbo, kling26, kling25Turbo, kling30, klingO1 } from "./providers/kling";

export const videoGenRegistry: Record<string, VideoGenModelSpec> = {
  [veoLite.id]: veoLite,
  [veoFast.id]: veoFast,
  [veoQuality.id]: veoQuality,
  [soraFast.id]: soraFast,
  [kling30Turbo.id]: kling30Turbo,
  [kling26.id]: kling26,
  [kling25Turbo.id]: kling25Turbo,
  [kling30.id]: kling30,
  [klingO1.id]: klingO1,
};

export const DEFAULT_VIDEO_MODEL_ID = "veo:veo-3.1-fast";
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors in `registry.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/video-gen/registry.ts
git commit -m "feat(kling): register the 5 real Kling models in the server registry"
```

---

## Task 4: Update client-models map

**Files:**
- Modify: `src/lib/video-gen/client-models.ts`

**Interfaces:**
- Consumes: `kling30TurboParams`, `kling26Params`, `kling25TurboParams`, `kling30Params`,
  `klingO1Params` from Task 1 (`./params/kling`).

- [ ] **Step 1: Replace the Kling import, image-input constants, and map entries**

Replace the Kling import line:

```typescript
// Before
import { klingLegacyParams, klingV3Params } from "./params/kling";

// After
import {
  kling30TurboParams,
  kling26Params,
  kling25TurboParams,
  kling30Params,
  klingO1Params,
} from "./params/kling";
```

Replace the `KLING_IMAGE_INPUTS` constant block:

```typescript
// Before
const KLING_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: false,
  maxReferenceImages: 0,
} as const;

// After
const KLING_IMAGE_INPUTS_NO_END = {
  startFrame: true,
  endFrame: false,
  maxReferenceImages: 0,
} as const;

const KLING_IMAGE_INPUTS_WITH_END = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 0,
} as const;
```

Replace all 6 `"kling:kling-*"` entries in `videoGenClientModelMap` with these 5:

```typescript
  "kling:kling-3-0-turbo": {
    id: "kling:kling-3-0-turbo",
    provider: "kling",
    label: "Kling 3.0 Turbo",
    providerLabel: "Kling",
    maxDurationSeconds: 15,
    imageInputs: KLING_IMAGE_INPUTS_NO_END,
    params: kling30TurboParams,
    rules: [],
  },
  "kling:kling-2-6": {
    id: "kling:kling-2-6",
    provider: "kling",
    label: "Kling 2.6",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_IMAGE_INPUTS_WITH_END,
    params: kling26Params,
    rules: [],
  },
  "kling:kling-2-5-turbo": {
    id: "kling:kling-2-5-turbo",
    provider: "kling",
    label: "Kling 2.5 Turbo",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_IMAGE_INPUTS_WITH_END,
    params: kling25TurboParams,
    rules: [],
  },
  "kling:kling-3-0": {
    id: "kling:kling-3-0",
    provider: "kling",
    label: "Kling 3.0",
    providerLabel: "Kling",
    maxDurationSeconds: 15,
    imageInputs: KLING_IMAGE_INPUTS_WITH_END,
    params: kling30Params,
    rules: [],
  },
  "kling:kling-o1": {
    id: "kling:kling-o1",
    provider: "kling",
    label: "Kling O1",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_IMAGE_INPUTS_WITH_END,
    params: klingO1Params,
    rules: [],
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors in `client-models.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/video-gen/client-models.ts
git commit -m "feat(kling): update client-models map to the 5 real Kling models"
```

---

## Task 5: Resolution-keyed Kling pricing

**Files:**
- Modify: `src/lib/video-gen/cost.ts`
- Create: `src/lib/video-gen/__tests__/cost.test.ts`

**Interfaces:**
- Produces: `computeVideoCost(modelId, durationSeconds, audioEnabled, resolution?)` —
  4th param is new and optional; consumed by Task 7 (both `complete.ts` and
  `video-gen-usage-popover.tsx`).

- [ ] **Step 1: Write failing tests**

Create `src/lib/video-gen/__tests__/cost.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeVideoCost } from "../cost";

describe("computeVideoCost — Kling (resolution-keyed)", () => {
  it("3.0-turbo: 720p and 1080p, audio flag irrelevant (always native)", () => {
    expect(computeVideoCost("kling:kling-3-0-turbo", 10, false, "720p")).toEqual({
      usd: 1.12,
      inr: 1.12 * 95.77,
    });
    expect(computeVideoCost("kling:kling-3-0-turbo", 10, true, "1080p")).toEqual({
      usd: 1.4,
      inr: 1.4 * 95.77,
    });
  });

  it("2.6: off at 720p/1080p, native only defined at 1080p", () => {
    expect(computeVideoCost("kling:kling-2-6", 10, false, "720p")?.usd).toBeCloseTo(0.42);
    expect(computeVideoCost("kling:kling-2-6", 10, false, "1080p")?.usd).toBeCloseTo(0.7);
    expect(computeVideoCost("kling:kling-2-6", 10, true, "1080p")?.usd).toBeCloseTo(1.4);
  });

  it("2.5-turbo: 720p/1080p, no audio tier", () => {
    expect(computeVideoCost("kling:kling-2-5-turbo", 10, false, "720p")?.usd).toBeCloseTo(0.42);
    expect(computeVideoCost("kling:kling-2-5-turbo", 10, false, "1080p")?.usd).toBeCloseTo(0.7);
  });

  it("3.0: off/native across 720p/1080p/4k", () => {
    expect(computeVideoCost("kling:kling-3-0", 10, false, "720p")?.usd).toBeCloseTo(0.84);
    expect(computeVideoCost("kling:kling-3-0", 10, true, "720p")?.usd).toBeCloseTo(1.12);
    expect(computeVideoCost("kling:kling-3-0", 10, false, "4k")?.usd).toBeCloseTo(4.2);
    expect(computeVideoCost("kling:kling-3-0", 10, true, "4k")?.usd).toBeCloseTo(4.2);
  });

  it("o1: off/original across 720p/1080p, no 4k tier", () => {
    expect(computeVideoCost("kling:kling-o1", 10, false, "720p")?.usd).toBeCloseTo(0.84);
    expect(computeVideoCost("kling:kling-o1", 10, true, "1080p")?.usd).toBeCloseTo(1.4);
    expect(computeVideoCost("kling:kling-o1", 10, false, "4k")).toBeNull();
  });

  it("defaults resolution to 720p when omitted", () => {
    const withDefault = computeVideoCost("kling:kling-2-5-turbo", 10, false);
    const explicit720p = computeVideoCost("kling:kling-2-5-turbo", 10, false, "720p");
    expect(withDefault).toEqual(explicit720p);
  });
});

describe("computeVideoCost — Veo/Sora unaffected by the resolution param", () => {
  it("veo:veo-3.1-fast ignores resolution, uses flat per-second + audio multiplier", () => {
    const cost = computeVideoCost("veo:veo-3.1-fast", 8, true, "1080p");
    expect(cost?.usd).toBeCloseTo(8 * 0.1 * 1.5);
  });

  it("unknown model returns null", () => {
    expect(computeVideoCost("kling:kling-v1-5", 5, false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/video-gen/__tests__/cost.test.ts
```

Expected: FAIL — `computeVideoCost` doesn't yet accept a 4th `resolution` argument and
the old flat Kling pricing entries don't match these numbers.

- [ ] **Step 3: Rewrite `src/lib/video-gen/cost.ts`**

Replace the entire file content:

```typescript
import { USD_TO_INR } from "@/lib/pricing";

// perSecond = no-audio base rate; audioMultiplier applied when audio is enabled.
// Source: ai.google.dev/gemini-api/docs/pricing (verified June 2026)
//   Lite:    $0.05/s (audio not priced separately for Lite)
//   Fast:    $0.10/s base → $0.15/s with audio  (0.10 × 1.5 = 0.15 ✓)
//   Quality: $0.267/s base → $0.40/s with audio (0.267 × 1.5 ≈ 0.40 ✓)
const VIDEO_MODEL_PRICING: Record<
  string,
  { perSecond: number; audioMultiplier: number }
> = {
  "veo:veo-3.1-lite":  { perSecond: 0.05,   audioMultiplier: 1.0 },
  "veo:veo-3.1-fast":  { perSecond: 0.10,   audioMultiplier: 1.5 },
  "veo:veo-3.1":       { perSecond: 0.2667, audioMultiplier: 1.5 },
  // Source: platform.openai.com/docs/pricing (verified June 2026)
  // $0.10/s at 720p; no audio output, no premium multiplier
  "openai:sora-2":     { perSecond: 0.10,   audioMultiplier: 1.0 },
};

// Kling price varies by resolution AND audio (not just audio) — resolution-keyed table.
// Source: kling.ai/document-api/pricing/base/video (fetched 2026-07-23), restricted to
// the "no video-input / no voice-control / no motion-control" tiers this integration
// actually reaches. `on` = native/original audio; `off` = no audio. Missing keys mean
// that combination has no priced tier (e.g. 2.6 has no "native audio at 720p" row).
type KlingResolutionRates = Record<string, { off?: number; on?: number }>;

const KLING_RESOLUTION_PRICING: Record<string, KlingResolutionRates> = {
  // Only a single "native audio" tier exists for turbo — no off/on toggle to make.
  "kling:kling-3-0-turbo": {
    "720p": { on: 0.112 },
    "1080p": { on: 0.14 },
  },
  "kling:kling-2-6": {
    "720p": { off: 0.042 },
    "1080p": { off: 0.07, on: 0.14 },
  },
  "kling:kling-2-5-turbo": {
    "720p": { off: 0.042 },
    "1080p": { off: 0.07 },
  },
  "kling:kling-3-0": {
    "720p": { off: 0.084, on: 0.112 },
    "1080p": { off: 0.112, on: 0.14 },
    "4k": { off: 0.42, on: 0.42 },
  },
  // ASSUMPTION: o1 audio delta not split out on the pricing page (only splits by
  // video-input); reused the same $0.028/s step seen on 3.0. Revisit if wrong.
  "kling:kling-o1": {
    "720p": { off: 0.084, on: 0.112 },
    "1080p": { off: 0.112, on: 0.14 },
  },
};

export function computeVideoCost(
  modelId: string,
  durationSeconds: number,
  audioEnabled: boolean,
  resolution?: string,
): { usd: number; inr: number } | null {
  const resolutionPricing = KLING_RESOLUTION_PRICING[modelId];
  if (resolutionPricing) {
    const rates = resolutionPricing[resolution ?? "720p"];
    if (!rates) return null;
    // Fall back to whichever tier exists when the requested one doesn't (e.g. turbo
    // only has "on", 2.6 only has "off" at 720p).
    const perSecond = (audioEnabled ? rates.on : rates.off) ?? rates.off ?? rates.on;
    if (perSecond === undefined) return null;
    const usd = durationSeconds * perSecond;
    return { usd, inr: usd * USD_TO_INR };
  }

  const pricing = VIDEO_MODEL_PRICING[modelId];
  if (!pricing) return null;
  const multiplier = audioEnabled ? pricing.audioMultiplier : 1;
  const usd = durationSeconds * pricing.perSecond * multiplier;
  return { usd, inr: usd * USD_TO_INR };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/lib/video-gen/__tests__/cost.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors anywhere. `complete.ts` and `video-gen-usage-popover.tsx` still call
the 3-arg form at this point, which still compiles fine since `resolution` is optional —
they get *behavior* fixes in Task 7, not compile fixes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video-gen/cost.ts src/lib/video-gen/__tests__/cost.test.ts
git commit -m "feat(kling): resolution-keyed pricing from verified Kling pricing page"
```

---

## Task 6: Remove webhook/providerJobId plumbing

**Files:**
- Modify: `src/lib/video-gen/types.ts`
- Modify: `src/lib/db/generations.ts`
- Modify: `trigger/video-generate.ts`
- Modify: `src/app/api/webhooks/generation/route.ts`
- Delete: `src/app/api/webhooks/generation/kling-mapper.ts`
- Delete: `src/app/api/webhooks/generation/__tests__/kling-webhook.test.ts`

All of this becomes dead code once Kling polls internally instead of using
`callback_url` (Task 2 already ships without setting `providerJobId`).

- [ ] **Step 1: Remove `providerJobId` from `VideoGenResult`**

In `src/lib/video-gen/types.ts`, change:

```typescript
// Before
export type VideoGenResult = {
  videoUrl: string;
  durationSeconds: number;
  providerJobId?: string;
};

// After
export type VideoGenResult = {
  videoUrl: string;
  durationSeconds: number;
};
```

- [ ] **Step 2: Remove the two provider-job-id DB helpers**

In `src/lib/db/generations.ts`, delete these two functions (currently the last two
functions in the file, after `listGenerations`):

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

- [ ] **Step 3: Remove the `providerJobId` branch in the Trigger.dev task**

In `trigger/video-generate.ts`, replace the block from `logger.info("Video generation
call succeeded"...)` through the `postWebhook` call at the end of the `try` block:

```typescript
// Before
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

// After
      logger.info("Video generation call succeeded", {
        generationId,
        modelId,
        videoUrl: result.videoUrl,
        durationSeconds: result.durationSeconds,
      });

      await postWebhook({
        generationId,
        status: "succeeded",
        videoUrl: result.videoUrl,
        durationSeconds: result.durationSeconds,
      });
```

- [ ] **Step 4: Remove the `?provider=kling` branch from the webhook route**

Replace the entire content of `src/app/api/webhooks/generation/route.ts`:

```typescript
import { completeGeneration } from "@/lib/generations/complete";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return apiError("Invalid JSON body", 400);

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

- [ ] **Step 5: Delete the now-unused Kling webhook mapper and its test**

```bash
git rm src/app/api/webhooks/generation/kling-mapper.ts src/app/api/webhooks/generation/__tests__/kling-webhook.test.ts
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests PASS (the deleted kling-webhook test is gone, nothing else
references the removed exports).

- [ ] **Step 8: Commit**

```bash
git add src/lib/video-gen/types.ts src/lib/db/generations.ts trigger/video-generate.ts src/app/api/webhooks/generation/route.ts
git commit -m "refactor(kling): remove webhook/providerJobId plumbing — Kling now polls internally"
```

---

## Task 7: Fix cost inputs in `complete.ts` and the usage popover

**Files:**
- Modify: `src/lib/generations/complete.ts`
- Modify: `src/components/nodes/video-gen-usage-popover.tsx`

**Interfaces:**
- Consumes: `computeVideoCost(modelId, durationSeconds, audioEnabled, resolution?)` from
  Task 5.

- [ ] **Step 1: Pass real audio/resolution values in `complete.ts`**

In `src/lib/generations/complete.ts`, replace:

```typescript
  // 4. Compute cost and mark succeeded
  const cost = generation.model_used
    ? computeVideoCost(generation.model_used, input.durationSeconds, false)
    : null;
```

with:

```typescript
  // 4. Compute cost and mark succeeded
  const audioValue = generation.params_snapshot?.audio;
  const audioEnabled = audioValue === "native" || audioValue === "original";
  const resolution =
    typeof generation.params_snapshot?.resolution === "string"
      ? (generation.params_snapshot.resolution as string)
      : undefined;

  const cost = generation.model_used
    ? computeVideoCost(generation.model_used, input.durationSeconds, audioEnabled, resolution)
    : null;
```

- [ ] **Step 2: Fix the `Boolean(audio)` bug in the usage popover**

In `src/components/nodes/video-gen-usage-popover.tsx`, replace:

```typescript
      const audio = Boolean(v.paramsUsed?.audio);
      const cost = computeVideoCost(v.modelUsed, duration, audio);
```

with:

```typescript
      const audioValue = v.paramsUsed?.audio;
      const audio = audioValue === "native" || audioValue === "original";
      const resolution =
        typeof v.paramsUsed?.resolution === "string" ? v.paramsUsed.resolution : undefined;
      const cost = computeVideoCost(v.modelUsed, duration, audio, resolution);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/generations/complete.ts src/components/nodes/video-gen-usage-popover.tsx
git commit -m "fix(kling): pass real audio/resolution into cost computation instead of hardcoded false"
```

---

## Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Grep for any remaining references to removed exports**

```bash
grep -rn "klingLegacyParams\|klingV3Params\|klingV15\|klingV16\|klingV21\|klingV21Master\|klingV26\|klingV3\b\|providerJobId\|getGenerationByProviderJobId\|setProviderJobId\|kling-mapper" src/ trigger/
```

Expected: No matches (all old exports/usages fully removed).

- [ ] **Step 4: Confirm the old plan/spec superseded-notice banners are in place**

```bash
head -n 10 docs/superpowers/plans/2026-07-11-kling-video-gen-integration.md
head -n 15 docs/superpowers/specs/2026-07-11-kling-video-gen-integration-design.md
```

Expected: Both show the `SUPERSEDED 2026-07-23` banner (added during brainstorming,
before this plan existed — just confirming nothing reverted it).

---

## Self-Review Checklist

**Spec coverage:**
- [x] 5 real models replace the 6 broken ones (Tasks 1–4)
- [x] Base host fixed to `api-singapore.klingai.com` (Task 2)
- [x] `contents[]`/`settings`/`options` envelope, per-model settings builders (Task 2)
- [x] `last_frame` support matches per-model capability table; 3.0-turbo excluded (Tasks 1, 2, 4)
- [x] No `cfg_scale`/`camera_control`/`mode`/motion params anywhere (Tasks 1, 2)
- [x] Polling replaces webhook, with per-iteration logging (Task 2)
- [x] All webhook/`providerJobId` plumbing removed as dead code (Task 6)
- [x] Resolution-keyed real pricing (Task 5)
- [x] `Boolean(audio)` bug fixed; real resolution passed through (Task 7)

**Type consistency:**
- `VideoGenResult` (Task 6) matches what Task 2's `pollKlingTask` returns (`{ videoUrl,
  durationSeconds }`, no `providerJobId`) — Task 2 is written first but never sets
  `providerJobId`, so removing the field in Task 6 doesn't break it.
- `computeVideoCost`'s 4th param (Task 5) is optional, so Tasks 2–4 (which don't touch
  `cost.ts`) and the pre-Task-7 call sites keep compiling throughout.
- Settings-builder function names (`build3_0TurboSettings`, etc., Task 2) match exactly
  what Task 2's own model definitions reference — no cross-task name drift since both
  live in the same file/task.
