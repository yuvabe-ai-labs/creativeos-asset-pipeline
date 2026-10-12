# Async Image and Composite Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Image Gen and Composite generations (edits included) run as the `image-generate` Trigger.dev task, like video, so leaving the canvas or closing the tab never loses a result.

**Architecture:** The routes keep their validation and credit reservation, then call one shared `startImageGeneration` that uploads any mask, signs the result uploads, starts the task and answers `202`. The task calls the provider, uploads the image through a signed URL and posts to the existing generation webhook, whose `completeGeneration` gains an image branch that creates the version and settles credits. In the browser, the per-node generation status hook (today video-only in name) drives Image Gen and Composite too.

**Tech Stack:** Next.js 16 route handlers, Trigger.dev v3 SDK (`@trigger.dev/sdk/v3`), Supabase, Google Cloud Storage signed URLs, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-async-image-generation-design.md`

## Global Constraints

- One generation at a time per node: a second request while one is `running` answers `409` with "This node is already generating."
- Paid generation tasks post `failed` **only when the failure is final** (`isFinalAttempt(attempt, maxAttempts, error)`): an earlier `failed` would refund and close the run, and a retry's paid result would then be dropped by the webhook's duplicate guard. A failure **after the provider returned** (upload, webhook) is a `PaidResultError`: never retried (`AbortTaskRunError`), since a retry would pay the provider again. This is the rule `video-voice-change.ts` already follows.
- `image-generate` gets one retry (`maxAttempts: 2`): an image is one request/response and a failed call is not billed. `video-generate` gets **none** (`maxAttempts: 1`, Task 12): its provider jobs are billed when submitted, so a retry after a timed-out or failed poll would pay for a second clip.
- Large bytes never travel in a task payload or webhook body: the mask is uploaded by the route, the result is uploaded by the task with a signed URL.
- Every `@/lib` import inside `trigger/*.ts` is a dynamic `await import(...)` (those modules can carry `server-only`), as `trigger/video-generate.ts` does.
- User-facing copy is plain: no vendor names, internals or raw errors in new UI strings, no em-dash phrasing.
- Per-node generation status is **selected** from the canvas's one generations feed (`trayJobs` / `latestJobByNode`): no query and no realtime channel per node (AGENTS.md performance rules 1-3).
- Controls are shadcn primitives only (no new native controls in this work).
- Data fetching follows AGENTS.md's three layers: requests live in `src/services/*.service.ts` (typed through `readJson`, no React, no toasts); `useMutation`/`useQuery` wrappers live in `src/hooks/queries/*.ts` and update or invalidate the keys they change; components call those hooks and never call `fetch` directly.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run tests per directory (`npx vitest run <dir>`); the full run has known timeout flakes in API route tests.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/storage/paths.ts` (modify) | `pathForImageGenResult`, `pathForImageGenMask` |
| `src/lib/storage/index.ts` (modify) | `signImageGenResultUploads`, `uploadImageGenMask` |
| `src/lib/image-gen/task-payload.ts` (create) | The task's payload type and the result MIME list; no `server-only`, shared by route and task |
| `src/lib/db/generations.ts` (modify) | `hasRunningGeneration(nodeId)` |
| `src/lib/image-gen/start-generation.ts` (create) | Shared route step: refuse a second run, insert, reserve, mask, sign, start task, `202` |
| `src/app/api/nodes/[id]/image-generate/route.ts` (modify) | Uses `startImageGeneration` |
| `src/lib/composite/run-generation.ts` (modify) | `runCompositeGeneration` delegates to `startImageGeneration` |
| `src/lib/generations/task-failure.ts` (create) | `PaidResultError`, `isFinalAttempt` — the failure-reporting rule shared by paid tasks |
| `src/lib/image-gen/run-task.ts` (create) | The task's work, with injected dependencies so it is unit-testable |
| `trigger/video-generate.ts` (modify) | Same retry rule (Task 12) |
| `trigger/image-generate.ts` (create) | Trigger.dev task wrapping `runImageGenerateTask` |
| `src/lib/generations/complete.ts` (modify) | Image success and failure branches |
| `src/hooks/use-generation-status.ts` (create, replaces `use-video-gen-status.ts`) | Per-node generation status, selected from the canvas's one generations feed (no per-node calls) |
| `src/lib/canvas-store.ts` (modify) | `latestJobByNode` index, start marks and request errors; replaces `videoGenStatus` |
| `src/lib/generations/node-status.ts` (create) | Pure status and completion rules |
| `src/hooks/use-generation-tray.ts` (modify) | The canvas's one feed also announces completions and puts finished images on cards |
| `src/services/node-generation.service.ts` (create) | Requests: start an image or composite generation, restore a version |
| `src/hooks/queries/node-generation.ts` (create) | `useStartImageGeneration`, `useStartCompositeGeneration`, `useRestoreNodeVersion`, `startErrorMessage` |
| `src/components/nodes/image-gen-focus-view.tsx`, `image-gen-node.tsx` (modify) | Start-and-watch instead of wait |
| `src/hooks/use-composite-versions.ts` (modify) | Start-and-watch instead of wait |
| `src/lib/generation-tray.ts` (modify) | Remove the stale-image rule |
| `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (modify) | Append D366 |

---

### Task 1: Storage paths, signed result uploads and mask upload

**Files:**
- Modify: `src/lib/storage/paths.ts` (after `pathForImageGen`, line 71)
- Modify: `src/lib/storage/index.ts` (after `uploadImageGen`, line 102)
- Create: `src/lib/image-gen/task-payload.ts`
- Test: `src/lib/storage/__tests__/image-gen-paths.test.ts`

**Interfaces:**
- Produces: `pathForImageGenResult({ clientId, canvasId, nodeId, generationId, ext }): string`, `pathForImageGenMask({ clientId, canvasId, nodeId, generationId }): string`, `signImageGenResultUploads({ nodeId, generationId }): Promise<ImageResultUploads>`, `uploadImageGenMask({ nodeId, generationId, base64, mime }): Promise<string>`, and from `task-payload.ts`: `IMAGE_RESULT_MIME_TYPES`, `ImageResultMime`, `SignedImageUpload`, `ImageResultUploads`, `ImageGenerateTaskPayload`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/storage/__tests__/image-gen-paths.test.ts
import { describe, it, expect } from "vitest";
import { pathForImageGenResult, pathForImageGenMask } from "../paths";

const ids = { clientId: "c1", canvasId: "cv1", nodeId: "n1", generationId: "g1" };

describe("image-gen result and mask paths", () => {
  it("keys the result by generation id, so the route can sign it before the task runs", () => {
    expect(pathForImageGenResult({ ...ids, ext: "png" })).toBe(
      "clients/c1/canvases/cv1/nodes/n1/image-gen/g1.png",
    );
  });

  it("keeps the extension it is given", () => {
    expect(pathForImageGenResult({ ...ids, ext: "webp" })).toMatch(/\/g1\.webp$/);
  });

  it("puts the mask beside the result, under the same generation id", () => {
    expect(pathForImageGenMask(ids)).toBe("clients/c1/canvases/cv1/nodes/n1/image-gen/g1-mask.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/image-gen-paths.test.ts`
Expected: FAIL, `pathForImageGenResult` is not exported.

- [ ] **Step 3: Add the paths** (in `src/lib/storage/paths.ts`, directly after `pathForImageGen`)

```ts
// D366 — one async image generation's result and mask. Keyed by generation id (not
// buildStoredName's timestamped name) because the route signs the upload before the task runs.
export function pathForImageGenResult(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  generationId: string;
  ext: string;
}): string {
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/image-gen/${args.generationId}.${args.ext}`;
}

export function pathForImageGenMask(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  generationId: string;
}): string {
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/image-gen/${args.generationId}-mask.png`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/image-gen-paths.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the shared payload types**

```ts
// src/lib/image-gen/task-payload.ts
// D366 — what the image-generate Trigger.dev task is given. No `server-only`: the route builds it
// and the task (a separate build) reads it.

/** The image types the providers return; the route signs one upload for each. */
export const IMAGE_RESULT_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ImageResultMime = (typeof IMAGE_RESULT_MIME_TYPES)[number];

/** A signed PUT the task uploads to, and the public URL the object then has. */
export type SignedImageUpload = { putUrl: string; url: string };
export type ImageResultUploads = Record<ImageResultMime, SignedImageUpload>;

export type ImageGenerateTaskPayload = {
  generationId: string;
  modelId: string;
  prompt: string;
  referenceUrls: string[];
  params: Record<string, unknown>;
  /** A painted edit region, already uploaded by the route. */
  maskUrl?: string;
  maskMime?: string;
  uploads: ImageResultUploads;
};
```

- [ ] **Step 6: Add the storage functions** (in `src/lib/storage/index.ts`, directly after `uploadImageGen`; add `pathForImageGenResult, pathForImageGenMask` to the existing `./paths` import and `_signPutUrl, publicUrlFor` to the existing `./gcs` import if not already imported)

```ts
// D366 — an image task can wait in the queue and then take minutes on a slow model before it
// uploads; the default five-minute signature is far too short.
export const IMAGE_UPLOAD_EXPIRY_MS = 2 * 60 * 60 * 1000;

// D366 — the task has no storage credentials; the route signs its one upload up front, once per
// type a provider may return, since a signed PUT pins the Content-Type.
export async function signImageGenResultUploads(args: {
  nodeId: string;
  generationId: string;
}): Promise<ImageResultUploads> {
  const { clientId, canvasId } = await resolveOwnership(args.nodeId);
  const entries = await Promise.all(
    IMAGE_RESULT_MIME_TYPES.map(async (mime) => {
      const path = pathForImageGenResult({
        clientId,
        canvasId,
        nodeId: args.nodeId,
        generationId: args.generationId,
        ext: mimeToExt(mime),
      });
      const upload = { putUrl: await _signPutUrl(path, mime, IMAGE_UPLOAD_EXPIRY_MS), url: publicUrlFor(path) };
      return [mime, upload] as const;
    }),
  );
  return Object.fromEntries(entries) as ImageResultUploads;
}

/** D366 — a painted edit mask, uploaded so the task receives a URL rather than megabytes. */
export async function uploadImageGenMask(args: {
  nodeId: string;
  generationId: string;
  base64: string;
  mime: string;
}): Promise<string> {
  const { clientId, canvasId } = await resolveOwnership(args.nodeId);
  const path = pathForImageGenMask({ clientId, canvasId, nodeId: args.nodeId, generationId: args.generationId });
  const { url } = await _upload(path, Buffer.from(args.base64, "base64"), args.mime);
  return url;
}
```

Add these imports at the top of `src/lib/storage/index.ts`:

```ts
import { mimeToExt } from "@/lib/image-gen/utils";
import {
  IMAGE_RESULT_MIME_TYPES,
  type ImageResultUploads,
} from "@/lib/image-gen/task-payload";
```

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit -p .`
Expected: exit 0.

```bash
git add src/lib/storage/paths.ts src/lib/storage/index.ts src/lib/storage/__tests__/image-gen-paths.test.ts src/lib/image-gen/task-payload.ts
git commit -m "feat(image-gen): storage for async image results and masks (D366)"
```

---

### Task 2: `hasRunningGeneration` and the shared `startImageGeneration` step

**Files:**
- Modify: `src/lib/db/generations.ts` (after `getGeneration`)
- Create: `src/lib/image-gen/start-generation.ts`
- Test: `src/lib/image-gen/__tests__/start-generation.test.ts`

**Interfaces:**
- Consumes: Task 1's `signImageGenResultUploads`, `uploadImageGenMask`, `ImageGenerateTaskPayload`.
- Produces: `hasRunningGeneration(nodeId: string): Promise<boolean>`; `startImageGeneration(input: StartImageGenerationInput): Promise<Response>` with

```ts
export type StartImageGenerationInput = {
  nodeId: string;
  clientId: string;
  orgId: string;
  caller: CallerContext;
  modelId: string;
  params: Record<string, unknown>;
  prompt: string;
  referenceUrls: string[];
  inputsUsed: Record<string, unknown>;
  mask?: { base64: string; mime: string };
};
```

- [ ] **Step 1: Add `hasRunningGeneration`** (in `src/lib/db/generations.ts`, after `getGeneration`)

```ts
/** D366 — whether this node has a generation still running: one at a time per node. */
export async function hasRunningGeneration(nodeId: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("id")
    .eq("node_id", nodeId)
    .eq("status", "running")
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/image-gen/__tests__/start-generation.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  hasRunningGeneration: vi.fn(async () => false),
  insertGeneration: vi.fn(async () => ({ id: "g1" })),
  failGeneration: vi.fn(async () => undefined),
  insertVersion: vi.fn(async () => ({ id: "v-failed" })),
  reserveCredits: vi.fn(async () => ({ ok: true })),
  refundReservation: vi.fn(async () => undefined),
  uploadImageGenMask: vi.fn(async () => "https://storage.googleapis.com/b/g1-mask.png"),
  signImageGenResultUploads: vi.fn(async () => ({
    "image/png": { putUrl: "https://put/png", url: "https://storage.googleapis.com/b/g1.png" },
    "image/jpeg": { putUrl: "https://put/jpg", url: "https://storage.googleapis.com/b/g1.jpg" },
    "image/webp": { putUrl: "https://put/webp", url: "https://storage.googleapis.com/b/g1.webp" },
  })),
  trigger: vi.fn(async () => ({ id: "run-1" })),
}));

vi.mock("@/lib/db/generations", () => ({
  hasRunningGeneration: m.hasRunningGeneration,
  insertGeneration: m.insertGeneration,
  failGeneration: m.failGeneration,
}));
vi.mock("@/lib/db/versions", () => ({ insertVersion: m.insertVersion }));
vi.mock("@/lib/db/credit-transactions", () => ({
  reserveCredits: m.reserveCredits,
  refundReservation: m.refundReservation,
  CreditLimitError: class CreditLimitError extends Error {},
}));
vi.mock("@/lib/storage", () => ({
  uploadImageGenMask: m.uploadImageGenMask,
  signImageGenResultUploads: m.signImageGenResultUploads,
}));
vi.mock("@/lib/image-gen/estimate", () => ({ estimateImageGenerationCostUsd: () => 0.04 }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: m.trigger } }));

import { startImageGeneration, type StartImageGenerationInput } from "../start-generation";

const input: StartImageGenerationInput = {
  nodeId: "n1",
  clientId: "c1",
  orgId: "org-1",
  caller: { userId: "u1", email: "u@x.com" } as StartImageGenerationInput["caller"],
  modelId: "openai:gpt-image-2",
  params: { quality: "high" },
  prompt: "A mug on a desk",
  referenceUrls: ["https://cdn/ref.png"],
  inputsUsed: { promptNodeId: "p1" },
};

beforeEach(() => vi.clearAllMocks());

describe("startImageGeneration (D366)", () => {
  it("refuses a second run on the same node, before inserting or reserving", async () => {
    m.hasRunningGeneration.mockResolvedValueOnce(true);
    const res = await startImageGeneration(input);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This node is already generating.");
    expect(m.insertGeneration).not.toHaveBeenCalled();
    expect(m.reserveCredits).not.toHaveBeenCalled();
  });

  it("records the run, reserves, starts the task and answers 202 with the generation id", async () => {
    const res = await startImageGeneration(input);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ generationId: "g1" });
    expect(m.insertGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: "n1", type: "image", modelUsed: "openai:gpt-image-2" }),
    );
    expect(m.reserveCredits).toHaveBeenCalledWith("org-1", "g1", expect.any(Number));
    expect(m.trigger).toHaveBeenCalledWith(
      "image-generate",
      expect.objectContaining({
        generationId: "g1",
        modelId: "openai:gpt-image-2",
        prompt: "A mug on a desk",
        referenceUrls: ["https://cdn/ref.png"],
        params: { quality: "high" },
        uploads: expect.objectContaining({ "image/png": expect.any(Object) }),
      }),
    );
  });

  it("uploads a painted mask and gives the task its URL, never the bytes", async () => {
    await startImageGeneration({ ...input, mask: { base64: "AAAA", mime: "image/png" } });
    expect(m.uploadImageGenMask).toHaveBeenCalledWith({
      nodeId: "n1",
      generationId: "g1",
      base64: "AAAA",
      mime: "image/png",
    });
    const payload = (m.trigger.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(payload.maskUrl).toBe("https://storage.googleapis.com/b/g1-mask.png");
    expect(JSON.stringify(payload)).not.toContain("AAAA");
  });

  it("answers 402 and refunds when the credit limit is reached, without starting the task", async () => {
    m.reserveCredits.mockResolvedValueOnce({ ok: false });
    const res = await startImageGeneration(input);
    expect(res.status).toBe(402);
    expect(m.trigger).not.toHaveBeenCalled();
    expect(m.failGeneration).toHaveBeenCalledWith(expect.objectContaining({ generationId: "g1" }));
    expect(m.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });

  it("fails, refunds and records the failed attempt when the task cannot be started", async () => {
    m.trigger.mockRejectedValueOnce(new Error("trigger down"));
    const res = await startImageGeneration(input);
    expect(res.status).toBe(500);
    expect(m.failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: "trigger down" });
    expect(m.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
    expect(m.insertVersion).toHaveBeenCalledWith(expect.objectContaining({ nodeId: "n1", error: "trigger down" }));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/image-gen/__tests__/start-generation.test.ts`
Expected: FAIL, cannot resolve `../start-generation`.

- [ ] **Step 4: Implement**

```ts
// src/lib/image-gen/start-generation.ts
import "server-only";
import { tasks } from "@trigger.dev/sdk/v3";
import { insertGeneration, failGeneration, hasRunningGeneration } from "@/lib/db/generations";
import { insertVersion } from "@/lib/db/versions";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { usdToFinalCredits } from "@/lib/credits/units";
import { uploadImageGenMask, signImageGenResultUploads } from "@/lib/storage";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import type { CallerContext } from "@/lib/dal-logic";
import type { ImageGenerateTaskPayload } from "@/lib/image-gen/task-payload";

export type StartImageGenerationInput = {
  nodeId: string;
  clientId: string;
  orgId: string;
  caller: CallerContext;
  modelId: string;
  params: Record<string, unknown>;
  prompt: string;
  referenceUrls: string[];
  inputsUsed: Record<string, unknown>;
  /** A painted edit region (models with supportsMask). The base image stays clean. */
  mask?: { base64: string; mime: string };
};

/**
 * D366 — the route side of an async image generation, shared by Image Gen and Composite once
 * their prompt and references are decided: refuse a second run, record the run, reserve, upload
 * any mask, sign the result uploads, start `image-generate` and answer 202. The version and the
 * settlement happen when the task reports back (completeGeneration).
 */
export async function startImageGeneration(input: StartImageGenerationInput): Promise<Response> {
  const { nodeId, clientId, orgId, caller, modelId, params, prompt, referenceUrls, inputsUsed, mask } = input;

  if (await hasRunningGeneration(nodeId)) {
    return apiError("This node is already generating.", 409);
  }

  const generation = await insertGeneration({
    nodeId,
    orgId,
    clientId,
    userId: caller.userId,
    userEmail: caller.email,
    type: "image",
    modelUsed: modelId,
    paramsSnapshot: params,
    inputsSnapshot: inputsUsed,
  });

  try {
    const costUsd = estimateImageGenerationCostUsd({
      modelId,
      quality: params.quality as string | undefined,
      aspectRatio: params.aspect_ratio as string | undefined,
      imageSize: params.image_size as string | undefined,
      referenceUrls,
    });
    if (costUsd === null) throw new Error(`No cost estimate available for ${modelId} at this quality/size.`);
    const reservation = await reserveCredits(orgId, generation.id, usdToFinalCredits(costUsd));
    if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");

    const maskUrl = mask
      ? await uploadImageGenMask({ nodeId, generationId: generation.id, base64: mask.base64, mime: mask.mime })
      : undefined;
    const uploads = await signImageGenResultUploads({ nodeId, generationId: generation.id });

    const payload: ImageGenerateTaskPayload = {
      generationId: generation.id,
      modelId,
      prompt,
      referenceUrls,
      params,
      ...(maskUrl ? { maskUrl, maskMime: mask?.mime ?? "image/png" } : {}),
      uploads,
    };
    await tasks.trigger("image-generate", payload);

    return apiOk({ generationId: generation.id }, 202);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Image generation failed";
    // The failed attempt still shows in History, with its maker — as the synchronous path did.
    await insertVersion({
      nodeId,
      operatorUserId: caller.userId,
      inputsUsed,
      paramsUsed: { modelId, ...params },
      modelUsed: modelId,
      error: message,
    }).catch(() => null);
    await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
    await refundReservation({ orgId, generationId: generation.id }).catch(() => null);
    return apiError(message, e instanceof CreditLimitError ? 402 : 500);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/image-gen/__tests__/start-generation.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit -p .` — Expected: exit 0.

```bash
git add src/lib/db/generations.ts src/lib/image-gen/start-generation.ts src/lib/image-gen/__tests__/start-generation.test.ts
git commit -m "feat(image-gen): one shared step that starts an async image generation (D366)"
```

---

### Task 3: Image Gen route uses `startImageGeneration`

**Files:**
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts:258-376` (everything from `// Join the shared generations substrate` to the end of the `catch`)
- Test: `src/app/api/nodes/[id]/image-generate/route.test.ts` (create)

**Interfaces:**
- Consumes: `startImageGeneration` (Task 2).
- Produces: `POST /api/nodes/:id/image-generate` answers `202 { generationId }` (was `200 { imageUrl, versionId, … }`).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/nodes/[id]/image-generate/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return {
    ...actual,
    withNode: (_req: Request, _params: unknown, fn: (...a: unknown[]) => Promise<Response>) =>
      fn("ig", {}, { userId: "u1", email: "u@x.com" }, "client-1", "org-1"),
  };
});

const m = vi.hoisted(() => ({
  upstream: [] as unknown[],
  start: vi.fn(async () => new Response(JSON.stringify({ generationId: "g1" }), { status: 202 })),
  getVersionById: vi.fn(async () => null as unknown),
}));

vi.mock("@/lib/db/nodes", () => ({ getUpstreamOutputs: vi.fn(async () => m.upstream) }));
vi.mock("@/lib/avatars/presenter-server", () => ({ withStillPresenter: async (u: unknown) => u }));
vi.mock("@/lib/db/versions", () => ({ getVersionById: m.getVersionById }));
vi.mock("@/lib/image-gen/start-generation", () => ({ startImageGeneration: m.start }));
vi.mock("@/lib/image-gen/registry", () => ({
  DEFAULT_MODEL_ID: "openai:gpt-image-2",
  imageGenRegistry: {
    "openai:gpt-image-2": {
      label: "GPT Image 2",
      maxReferenceImages: 16,
      maxReferenceSizeBytes: 0,
      schema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    },
  },
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "ig" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.upstream = [
    { nodeId: "p1", type: "prompt", data: {}, activeOutput: "A mug on a desk", versionId: "pv1" },
  ];
});

describe("POST image-generate (D366)", () => {
  it("hands a generation to startImageGeneration and passes its 202 through", async () => {
    const res = await post({ modelId: "openai:gpt-image-2", params: { quality: "high" } });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ generationId: "g1" });
    expect(m.start).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: "ig",
        orgId: "org-1",
        clientId: "client-1",
        modelId: "openai:gpt-image-2",
        params: { quality: "high" },
        inputsUsed: expect.objectContaining({ promptNodeId: "p1", promptVersionId: "pv1" }),
      }),
    );
    const call = (m.start.mock.calls[0] as unknown[])[0] as { prompt: string };
    expect(call.prompt).toContain("A mug on a desk");
  });

  it("still refuses a generation with no connected prompt, before starting anything", async () => {
    m.upstream = [];
    const res = await post({ modelId: "openai:gpt-image-2", params: {} });
    expect(res.status).toBe(400);
    expect(m.start).not.toHaveBeenCalled();
  });

  it("passes a painted mask through as bytes for the shared step to upload", async () => {
    m.getVersionById.mockResolvedValue({ id: "v-base", output: "https://cdn/base.png", inputs_used: {} });
    await post({
      modelId: "openai:gpt-image-2",
      params: {},
      instruction: "the mug",
      intent: "remove",
      baseVersionId: "v-base",
      masked: true,
      maskBase64: "AAAA",
      maskMime: "image/png",
    });
    expect(m.start).toHaveBeenCalledWith(
      expect.objectContaining({
        mask: { base64: "AAAA", mime: "image/png" },
        inputsUsed: expect.objectContaining({ baseVersionId: "v-base", masked: true }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run image-generate/route.test`
Expected: FAIL — the route still calls the provider synchronously and never calls `startImageGeneration`.

- [ ] **Step 3: Replace the synchronous tail** — in `route.ts`, replace everything from the line `// Join the shared generations substrate (D26) — image is the synchronous fast path.` through the end of the `catch` block (the line before the final `});` of `withNode`) with:

```ts
    // D366 — the provider runs in the image-generate task, not in this request; the version and
    // the settlement land when it reports back (completeGeneration).
    return startImageGeneration({
      nodeId,
      clientId,
      orgId: effectiveOrgId,
      caller,
      modelId,
      params: validatedParams,
      prompt,
      referenceUrls,
      inputsUsed,
      ...(maskBase64 ? { mask: { base64: maskBase64, mime: maskMime ?? "image/png" } } : {}),
    });
```

Then fix the imports at the top of the file: remove `insertVersion`, `setActiveVersion` from the `@/lib/db/versions` import (keep `getVersionById`), remove the whole `@/lib/db/generations` import, remove `mimeToExt` from the `@/lib/image-gen/utils` import (keep `withProductDetailSuffix`), and remove the imports of `computeImageCost`, `estimateImageGenerationCostUsd`, `usdToFinalCredits`, the `@/lib/db/credit-transactions` block, and `uploadImageGen`. Keep `sharp` and `createServerSupabase` (still used by the reference-metadata backfill). Change `apiOk` out of the `route-helpers` import if it is now unused. Add:

```ts
import { startImageGeneration } from "@/lib/image-gen/start-generation";
```

- [ ] **Step 4: Run test and lint**

Run: `npx vitest run image-generate/route.test`
Expected: PASS (3 tests).
Run: `npx eslint "src/app/api/nodes/[id]/image-generate/route.ts"` — Expected: no errors (an unused-import error means Step 3's import cleanup missed one).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/nodes/[id]/image-generate/route.ts" "src/app/api/nodes/[id]/image-generate/route.test.ts"
git commit -m "feat(image-gen): Image Gen starts a background generation instead of waiting (D366)"
```

---

### Task 4: Composite delegates to `startImageGeneration`

**Files:**
- Modify: `src/lib/composite/run-generation.ts` (replace `runCompositeGeneration`'s body; keep `referenceProblem` and `CompositeRun`)
- Modify: `src/app/api/nodes/[id]/composite-generate/route.test.ts`

**Interfaces:**
- Consumes: `startImageGeneration` (Task 2).
- Produces: `runCompositeGeneration(run: CompositeRun): Promise<Response>` answering `202 { generationId }`.

- [ ] **Step 1: Update the tests first** — in `route.test.ts`:

Replace the mocks for `@/lib/image-gen/estimate`, `@/lib/image-gen/cost`, `@/lib/storage`, `sharp`, `@/lib/db/generations` and `@/lib/db/credit-transactions` (lines 45-73) with:

```ts
const start = vi.fn<(...a: unknown[]) => Promise<Response>>(
  async () => new Response(JSON.stringify({ generationId: "g1" }), { status: 202 }),
);
vi.mock("@/lib/image-gen/start-generation", () => ({
  startImageGeneration: (...a: unknown[]) => start(...a),
}));
```

Keep the `@/lib/db/versions` mock but only `getVersionById` is used now:

```ts
const getVersionById = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => null);
vi.mock("@/lib/db/versions", () => ({ getVersionById: (...a: unknown[]) => getVersionById(...a) }));
```

Replace `sent` (line 84) so it reads what was handed to the shared step:

```ts
/** What the generation was started with. */
const sent = () => start.mock.calls[0][0] as { prompt: string; referenceUrls: string[]; mask?: { base64: string; mime: string }; inputsUsed: Record<string, unknown>; modelId: string };
```

In `beforeEach`, remove the `generate.mockResolvedValue(...)` line. Every assertion `expect(insertGeneration).not.toHaveBeenCalled()` becomes `expect(start).not.toHaveBeenCalled()`. Every `expect(insertGeneration).toHaveBeenCalledWith(expect.objectContaining({ modelUsed: X }))` becomes `expect(sent().modelId).toBe(X)`. Every `expect(res.status).toBe(200)` becomes `expect(res.status).toBe(202)`. In "refuses more images than the model takes", replace `expect(generate).not.toHaveBeenCalled()` with `expect(start).not.toHaveBeenCalled()`.

Replace the two tests "reserves, then settles, and records the avatar on the version" and "refunds when the provider fails, and records the failed attempt" with:

```ts
  it("starts the generation with the avatar recorded in its inputs", async () => {
    const res = await post({ instruction: "x", modelId: SEEDANCE_FACE_MODEL_ID });
    expect(res.status).toBe(202);
    expect(sent().inputsUsed).toMatchObject({ avatarIds: ["av-1"], promptId: COMPOSITE_PROMPT_ID });
  });
```

In the edit tests, `insertVersion.mock.calls[0][0]` becomes `sent()`; e.g. the first edit test's last two lines become:

```ts
      expect(sent().inputsUsed).toMatchObject({ mode: "edit", baseVersionId: "v-base", intent: "remove" });
```

and the painted-region test's provider-call assertions become:

```ts
      expect(sent().mask).toEqual({ base64: "AAAA", mime: "image/png" });
      expect(sent().prompt).toMatch(/selected \(masked\) region/);
      expect(sent().inputsUsed).toMatchObject({ masked: true });
```

Remove the now-unused `generate` from the `vi.hoisted` block (the registry `model()` helper no longer needs a `generate` property).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run composite-generate/route.test`
Expected: FAIL — `runCompositeGeneration` still calls the provider; `start` is never called.

- [ ] **Step 3: Replace `runCompositeGeneration`** in `src/lib/composite/run-generation.ts`:

```ts
/** D312/D366 — one composite generation, once the prompt and images are decided: started as a
 *  background image generation through the same shared step as Image Gen, so a credit-path fix
 *  still lands once. Answers 202 with the generation id. */
export async function runCompositeGeneration(run: CompositeRun): Promise<Response> {
  return startImageGeneration({
    nodeId: run.nodeId,
    clientId: run.clientId,
    orgId: run.orgId,
    caller: run.caller,
    modelId: run.modelId,
    params: run.params,
    prompt: run.prompt,
    referenceUrls: run.referenceUrls,
    inputsUsed: run.inputsUsed,
    ...(run.mask ? { mask: run.mask } : {}),
  });
}
```

Update the file's imports to only what remains used:

```ts
import "server-only";
import { validateReferenceImages, type RefImageMeta } from "@/lib/image-gen/validate";
import type { MediaGenModelSpec } from "@/lib/image-gen/types";
import type { CallerContext } from "@/lib/dal-logic";
import { startImageGeneration } from "@/lib/image-gen/start-generation";
```

Update the header comment's pipeline description to: `// D312/D366 — a composite generation's references check, and its start as a background job.`

- [ ] **Step 4: Run tests**

Run: `npx vitest run composite-generate/route.test src/lib/composite`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/composite/run-generation.ts "src/app/api/nodes/[id]/composite-generate/route.test.ts"
git commit -m "feat(composite): Composite starts a background generation instead of waiting (D366)"
```

---

### Task 5: The `image-generate` task

**Files:**
- Create: `src/lib/image-gen/run-task.ts`
- Create: `trigger/image-generate.ts`
- Test: `src/lib/image-gen/__tests__/run-task.test.ts`

**Interfaces:**
- Consumes: `ImageGenerateTaskPayload` (Task 1), `ImageGenInput`/`ImageGenResult` from `@/lib/image-gen/types`, `postGenerationWebhook`, `postGenerationWebhookSafely`, `assertWebhookConfig` from `@/lib/generations/post-webhook`.
- Produces: `runImageGenerateTask(payload, deps): Promise<void>`, `ImageGenerateTaskDeps`, the webhook body `ImageGenerationSucceeded` (consumed by Task 6):

```ts
export type ImageGenerationSucceeded = {
  generationId: string;
  status: "succeeded";
  kind: "image";
  imageUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  fileSizeBytes: number;
  tokensUsed?: Record<string, number> | null;
  costUsd?: number;
};
```

- [ ] **Step 0: Load the Trigger.dev skill** (AGENTS.md requires it before writing Trigger.dev code): invoke the `trigger-authoring-chat-agent` skill and follow anything in it that applies to a plain `task()`.

- [ ] **Step 0b: The shared retry rule** — write the test first:

```ts
// src/lib/generations/__tests__/task-failure.test.ts
import { describe, it, expect } from "vitest";
import { PaidResultError, isFinalAttempt } from "../task-failure";

describe("isFinalAttempt", () => {
  it("is not final on an earlier attempt, so the failure is retried without being reported", () => {
    expect(isFinalAttempt(1, 2, new Error("provider 500"))).toBe(false);
  });

  it("is final on the last configured attempt", () => {
    expect(isFinalAttempt(2, 2, new Error("provider 500"))).toBe(true);
  });

  it("is always final once the provider has returned a paid result", () => {
    expect(isFinalAttempt(1, 2, new PaidResultError("webhook unreachable"))).toBe(true);
  });
});
```

Run: `npx vitest run src/lib/generations/__tests__/task-failure.test.ts` — Expected: FAIL, cannot resolve `../task-failure`.

Then create it:

```ts
// src/lib/generations/task-failure.ts
// D366 — the retry rule for tasks that pay a provider (image-generate, video-generate), the one
// video-voice-change.ts already follows. No `server-only`: Trigger.dev tasks import it.
//
// Report `failed` only on the run's FINAL attempt. Reporting it earlier refunds and marks the
// generation terminal, so the retry's result — paid for — is then dropped by completeGeneration's
// duplicate guard. And once the provider has returned, never retry: that would pay it again.


/** A failure after the provider returned a (paid) result — an upload or the webhook. */
export class PaidResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaidResultError";
  }
}

/** Whether this failure ends the run: report it as `failed`, and do not retry. */
export function isFinalAttempt(attemptNumber: number, maxAttempts: number, error: unknown): boolean {
  return error instanceof PaidResultError || attemptNumber >= maxAttempts;
}
```

Run the test again — Expected: PASS (3 tests).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/image-gen/__tests__/run-task.test.ts
import { describe, it, expect, vi } from "vitest";
import { runImageGenerateTask, type ImageGenerateTaskDeps } from "../run-task";
import type { ImageGenerateTaskPayload } from "../task-payload";
import { PaidResultError } from "@/lib/generations/task-failure";

const payload: ImageGenerateTaskPayload = {
  generationId: "g1",
  modelId: "openai:gpt-image-2",
  prompt: "A mug on a desk",
  referenceUrls: ["https://cdn/ref.png"],
  params: { quality: "high" },
  uploads: {
    "image/png": { putUrl: "https://put/png", url: "https://storage.googleapis.com/b/g1.png" },
    "image/jpeg": { putUrl: "https://put/jpg", url: "https://storage.googleapis.com/b/g1.jpg" },
    "image/webp": { putUrl: "https://put/webp", url: "https://storage.googleapis.com/b/g1.webp" },
  },
};

function deps(overrides: Partial<ImageGenerateTaskDeps> = {}): ImageGenerateTaskDeps {
  return {
    generate: vi.fn(async () => ({
      imageBase64: Buffer.from("png-bytes").toString("base64"),
      mimeType: "image/png",
      tokensUsed: { input_tokens: 10, output_tokens: 20 },
    })) as unknown as ImageGenerateTaskDeps["generate"],
    fetchFn: vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch,
    readSize: vi.fn(async () => ({ width: 1024, height: 1536 })),
    postWebhook: vi.fn(async () => new Response(null, { status: 200 })),
    ...overrides,
  };
}

describe("runImageGenerateTask (D366)", () => {
  it("generates, uploads to the signed URL for the result's type, and reports the stored image", async () => {
    const d = deps();
    await runImageGenerateTask(payload, d);
    expect(d.generate).toHaveBeenCalledWith({
      prompt: "A mug on a desk",
      referenceUrls: ["https://cdn/ref.png"],
      params: { quality: "high" },
    });
    expect(d.fetchFn).toHaveBeenCalledWith(
      "https://put/png",
      expect.objectContaining({ method: "PUT", headers: { "Content-Type": "image/png" } }),
    );
    expect(d.postWebhook).toHaveBeenCalledWith({
      generationId: "g1",
      status: "succeeded",
      kind: "image",
      imageUrl: "https://storage.googleapis.com/b/g1.png",
      mimeType: "image/png",
      width: 1024,
      height: 1536,
      fileSizeBytes: Buffer.from("png-bytes").length,
      tokensUsed: { input_tokens: 10, output_tokens: 20 },
    });
  });

  it("downloads the mask and passes it to the provider as base64", async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url === "https://storage.googleapis.com/b/g1-mask.png"
        ? new Response(Buffer.from("mask-bytes"))
        : new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;
    const d = deps({ fetchFn });
    await runImageGenerateTask({ ...payload, maskUrl: "https://storage.googleapis.com/b/g1-mask.png", maskMime: "image/png" }, d);
    expect(d.generate).toHaveBeenCalledWith(
      expect.objectContaining({ maskBase64: Buffer.from("mask-bytes").toString("base64"), maskMime: "image/png" }),
    );
  });

  it("refuses a result type it has no signed upload for — a paid result, so never retried", async () => {
    const d = deps({
      generate: vi.fn(async () => ({ imageBase64: "AA", mimeType: "image/gif", tokensUsed: {} })) as unknown as ImageGenerateTaskDeps["generate"],
    });
    const run = runImageGenerateTask(payload, d);
    await expect(run).rejects.toBeInstanceOf(PaidResultError);
    await expect(run).rejects.toThrow(/image\/gif/);
    expect(d.postWebhook).not.toHaveBeenCalled();
  });

  it("fails as a paid result, naming the stored image, when the webhook rejects it", async () => {
    const d = deps({ postWebhook: vi.fn(async () => new Response("no", { status: 500 })) });
    const run = runImageGenerateTask(payload, d);
    await expect(run).rejects.toBeInstanceOf(PaidResultError);
    await expect(run).rejects.toThrow(/https:\/\/storage\.googleapis\.com\/b\/g1\.png/);
  });

  it("fails as a paid result, without reporting success, when the upload fails", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 403 })) as unknown as typeof fetch;
    const d = deps({ fetchFn });
    const run = runImageGenerateTask(payload, d);
    await expect(run).rejects.toBeInstanceOf(PaidResultError);
    await expect(run).rejects.toThrow(/upload failed: 403/i);
    expect(d.postWebhook).not.toHaveBeenCalled();
  });

  it("leaves a provider error retryable — nothing has been paid for", async () => {
    const d = deps({
      generate: vi.fn(async () => {
        throw new Error("provider 500");
      }) as unknown as ImageGenerateTaskDeps["generate"],
    });
    const run = runImageGenerateTask(payload, d);
    await expect(run).rejects.toThrow("provider 500");
    await expect(run).rejects.not.toBeInstanceOf(PaidResultError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/image-gen/__tests__/run-task.test.ts`
Expected: FAIL, cannot resolve `../run-task`.

- [ ] **Step 3: Implement `run-task.ts`**

```ts
// src/lib/image-gen/run-task.ts
// D366 — the image-generate task's work, with its I/O injected so it is unit-testable outside
// Trigger.dev. No `server-only`: trigger/image-generate.ts imports it.
import type { ImageGenInput, ImageGenResult } from "@/lib/image-gen/types";
import type { ImageGenerateTaskPayload, ImageResultMime } from "@/lib/image-gen/task-payload";
import { PaidResultError } from "@/lib/generations/task-failure";

export type ImageGenerateTaskDeps = {
  generate: (input: ImageGenInput) => Promise<ImageGenResult>;
  fetchFn: typeof fetch;
  readSize: (bytes: Buffer) => Promise<{ width?: number; height?: number }>;
  postWebhook: (body: object) => Promise<Response>;
};

/** The body this task posts to the generation webhook on success (completeGeneration reads it). */
export type ImageGenerationSucceeded = {
  generationId: string;
  status: "succeeded";
  kind: "image";
  imageUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  fileSizeBytes: number;
  tokensUsed?: Record<string, number> | null;
  costUsd?: number;
};

export async function runImageGenerateTask(
  payload: ImageGenerateTaskPayload,
  deps: ImageGenerateTaskDeps,
): Promise<void> {
  let maskBase64: string | undefined;
  if (payload.maskUrl) {
    const res = await deps.fetchFn(payload.maskUrl);
    if (!res.ok) throw new Error(`Could not read the edit mask: ${res.status}`);
    maskBase64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  }

  const result = await deps.generate({
    prompt: payload.prompt,
    referenceUrls: payload.referenceUrls,
    params: payload.params,
    ...(maskBase64 ? { maskBase64, maskMime: payload.maskMime ?? "image/png" } : {}),
  });

  // The provider has returned, and been paid. Nothing below may lead to a retry, which would pay it
  // again: every failure from here is a PaidResultError (see task-failure.ts).
  try {
    await deliverResult(payload, result, deps);
  } catch (e) {
    throw e instanceof PaidResultError ? e : new PaidResultError(e instanceof Error ? e.message : String(e));
  }
}

async function deliverResult(
  payload: ImageGenerateTaskPayload,
  result: ImageGenResult,
  deps: ImageGenerateTaskDeps,
): Promise<void> {
  const upload = payload.uploads[result.mimeType as ImageResultMime];
  if (!upload) throw new PaidResultError(`The model returned an unsupported image type: ${result.mimeType}`);

  const bytes = Buffer.from(result.imageBase64, "base64");
  const put = await deps.fetchFn(upload.putUrl, {
    method: "PUT",
    headers: { "Content-Type": result.mimeType },
    body: bytes,
  });
  if (!put.ok) throw new PaidResultError(`Image upload failed: ${put.status}`);

  const size = await deps.readSize(bytes).catch(() => ({}) as { width?: number; height?: number });

  const body: ImageGenerationSucceeded = {
    generationId: payload.generationId,
    status: "succeeded",
    kind: "image",
    imageUrl: upload.url,
    mimeType: result.mimeType,
    ...(size.width !== undefined ? { width: size.width } : {}),
    ...(size.height !== undefined ? { height: size.height } : {}),
    fileSizeBytes: bytes.length,
    tokensUsed: result.tokensUsed as Record<string, number> | null,
    ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
  };

  let res: Response;
  try {
    res = await deps.postWebhook(body);
  } catch (e) {
    throw new PaidResultError(
      `Image generated but the webhook was unreachable — imageUrl=${upload.url}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!res.ok) {
    // The image EXISTS, is stored and has been billed. Name it, so it can be attached by hand.
    throw new PaidResultError(`Image generated but the webhook rejected it (${res.status}) — imageUrl=${upload.url}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/image-gen/__tests__/run-task.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Create the task**

```ts
// trigger/image-generate.ts
// D366 — Image Gen and Composite generations, run in the background like video-generate. Every
// @/lib import is dynamic: several carry `server-only`, which Trigger.dev's build must not see.
import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import type { ImageGenerateTaskPayload } from "@/lib/image-gen/task-payload";
// One retry for a transient provider error: an image is one request/response, and a failed call
// is not billed. (video-generate takes none: its jobs are billed when submitted.)
const MAX_ATTEMPTS = 2;

export const imageGenerateTask = task({
  id: "image-generate",
  maxDuration: 600,
  // One retry for a transient provider error. `failed` is posted only when the failure is final
  // (see task-failure.ts), so a retry that succeeds is never thrown away.
  retry: { maxAttempts: MAX_ATTEMPTS, minTimeoutInMs: 2000, maxTimeoutInMs: 15000, factor: 2 },
  run: async (payload: ImageGenerateTaskPayload, { ctx }) => {
    const { assertWebhookConfig, postGenerationWebhook, postGenerationWebhookSafely } = await import(
      "@/lib/generations/post-webhook"
    );
    // Fail fast on a misconfigured deploy, before any (paid) provider call.
    assertWebhookConfig();
    const { generationId, modelId } = payload;

    try {
      const { imageGenRegistry } = await import("@/lib/image-gen/registry");
      const config = imageGenRegistry[modelId];
      if (!config) throw new Error(`Unknown image model: ${modelId}`);
      const { runImageGenerateTask } = await import("@/lib/image-gen/run-task");
      const sharp = (await import("sharp")).default;

      logger.info("Starting image generation", {
        generationId,
        modelId,
        referenceCount: payload.referenceUrls.length,
        masked: Boolean(payload.maskUrl),
      });

      await runImageGenerateTask(payload, {
        generate: (input) => config.generate(input),
        fetchFn: fetch,
        readSize: async (bytes) => {
          const meta = await sharp(bytes).metadata();
          return { width: meta.width, height: meta.height };
        },
        postWebhook: postGenerationWebhook,
      });

      logger.info("Image generation succeeded", { generationId, modelId });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Image generation failed";
      const { isFinalAttempt, PaidResultError } = await import("@/lib/generations/task-failure");
      const final = isFinalAttempt(ctx.attempt.number, MAX_ATTEMPTS, e);
      logger.error("Image generation failed", {
        generationId,
        modelId,
        error,
        attempt: ctx.attempt.number,
        final,
        stack: e instanceof Error ? e.stack : undefined,
      });
      // Only a final failure is reported (it refunds); an earlier one is retried silently.
      if (final) {
        await postGenerationWebhookSafely({ generationId, status: "failed", error }, "failure report");
      }
      // A paid result is never retried: that would pay the provider again.
      if (e instanceof PaidResultError) throw new AbortTaskRunError(error);
      throw e instanceof Error ? e : new Error(error);
    }
  },
});
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit -p .` — Expected: exit 0.

```bash
git add src/lib/generations/task-failure.ts src/lib/generations/__tests__/task-failure.test.ts src/lib/image-gen/run-task.ts src/lib/image-gen/__tests__/run-task.test.ts trigger/image-generate.ts
git commit -m "feat(image-gen): the image-generate background task (D366)"
```

---

### Task 6: Image branch in `completeGeneration`

**Files:**
- Modify: `src/lib/generations/complete.ts`
- Test: `src/lib/generations/complete.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `ImageGenerationSucceeded` (Task 5).
- Produces: `CompleteGenerationInput` now also accepts `ImageGenerationSucceeded`.

- [ ] **Step 1: Write the failing tests** — append to `complete.test.ts` (it already mocks versions, generations, credit transactions, storage and Supabase):

```ts
describe("completeGeneration — image (D366)", () => {
  beforeEach(() => {
    mocks.generation = {
      id: "g1",
      status: "running",
      type: "image",
      node_id: "n1",
      org_id: "org-1",
      user_id: "u1",
      model_used: "openai:gpt-image-2",
      params_snapshot: { quality: "high" },
      inputs_snapshot: { promptNodeId: "p1" },
    };
  });

  const succeeded = {
    generationId: "g1",
    status: "succeeded" as const,
    kind: "image" as const,
    imageUrl: "https://storage.googleapis.com/b/g1.png",
    mimeType: "image/png",
    width: 1024,
    height: 1536,
    fileSizeBytes: 2048,
    tokensUsed: { input_tokens: 10, output_tokens: 20 },
    costUsd: 0.05,
  };

  it("creates the version from the run's snapshots, makes it active and settles at the reported cost", async () => {
    await completeGeneration(succeeded);
    expect(mocks.insertVersion).toHaveBeenCalledWith({
      nodeId: "n1",
      operatorUserId: "u1",
      inputsUsed: { promptNodeId: "p1" },
      paramsUsed: {
        modelId: "openai:gpt-image-2",
        quality: "high",
        tokensUsed: { input_tokens: 10, output_tokens: 20 },
        imageWidth: 1024,
        imageHeight: 1536,
        fileSizeBytes: 2048,
      },
      modelUsed: "openai:gpt-image-2",
      output: "https://storage.googleapis.com/b/g1.png",
    });
    expect(mocks.setActiveVersion).toHaveBeenCalledWith("n1", "ver-1");
    expect(mocks.settleGeneration).toHaveBeenCalledWith({
      orgId: "org-1",
      generationId: "g1",
      actualAmount: usdToFinalCredits(0.05),
    });
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: "g1",
        versionId: "ver-1",
        costUsd: 0.05,
        outputSnapshot: "https://storage.googleapis.com/b/g1.png",
      }),
    );
  });

  it("refuses an image stored outside this app's bucket", async () => {
    await completeGeneration({ ...succeeded, imageUrl: "https://evil.example/x.png" });
    expect(mocks.insertVersion).not.toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });

  it("records a failed image as a failed version, then fails and refunds", async () => {
    await completeGeneration({ generationId: "g1", status: "failed", error: "provider down" });
    expect(mocks.insertVersion).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: "n1", operatorUserId: "u1", error: "provider down" }),
    );
    expect(mocks.failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: "provider down" });
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });

  it("ignores a duplicate delivery", async () => {
    mocks.generation = { ...mocks.generation, status: "succeeded" };
    await completeGeneration(succeeded);
    expect(mocks.insertVersion).not.toHaveBeenCalled();
    expect(mocks.settleGeneration).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/generations/complete.test.ts`
Expected: the new block FAILS (the image input is treated as a video and fetched/uploaded).

- [ ] **Step 3: Implement** — in `complete.ts`:

Add to the imports:

```ts
import { computeImageCost } from "@/lib/image-gen/cost";
import type { ImageTokenUsage } from "@/lib/image-gen/types";
import type { ImageGenerationSucceeded } from "@/lib/image-gen/run-task";
```

Widen the input type:

```ts
export type CompleteGenerationInput =
  | {
      generationId: string;
      status: "succeeded";
      kind?: "video";
      videoUrl: string;
      durationSeconds: number;
      /** D282 — `videoUrl` is already in our bucket (the task uploaded it); skip download/upload. */
      stored?: boolean;
      meta?: Record<string, unknown>;
    }
  | ImageGenerationSucceeded
  | {
      generationId: string;
      status: "failed";
      error: string;
    };
```

Replace the existing failed branch:

```ts
  if (input.status === "failed") {
    // D366 — a failed image still shows in History with its maker, as the synchronous path did.
    if (generation.type === "image") {
      await insertVersion({
        nodeId,
        operatorUserId: generation.user_id,
        inputsUsed: generation.inputs_snapshot ?? {},
        paramsUsed: { modelId: generation.model_used, ...(generation.params_snapshot ?? {}) },
        modelUsed: generation.model_used,
        error: input.error,
      }).catch(() => null);
    }
    await failAndRefund(input.generationId, generation.org_id, input.error);
    return;
  }

  if (input.kind === "image") {
    await completeImageGeneration(nodeId, generation, input);
    return;
  }
```

Add this function above `completeGeneration`:

```ts
// D366 — an image arrives already stored (the task uploaded it through a signed URL).
async function completeImageGeneration(
  nodeId: string,
  generation: GenerationRow,
  input: ImageGenerationSucceeded,
): Promise<void> {
  if (!isOwnStoredUrl(input.imageUrl)) {
    await failAndRefund(input.generationId, generation.org_id, "Stored image URL is outside this app's bucket");
    return;
  }

  const version = await insertVersion({
    nodeId,
    operatorUserId: generation.user_id,
    inputsUsed: generation.inputs_snapshot ?? {},
    paramsUsed: {
      modelId: generation.model_used,
      ...(generation.params_snapshot ?? {}),
      tokensUsed: input.tokensUsed ?? null,
      imageWidth: input.width,
      imageHeight: input.height,
      fileSizeBytes: input.fileSizeBytes,
    },
    modelUsed: generation.model_used,
    output: input.imageUrl,
  });
  await setActiveVersion(nodeId, version.id);

  // A provider billed per image (Seedream) reports its exact charge; token-billed ones don't.
  const cost =
    input.costUsd !== undefined
      ? { usd: input.costUsd }
      : input.tokensUsed && generation.model_used
        ? computeImageCost(generation.model_used, input.tokensUsed as ImageTokenUsage)
        : null;
  const actualCredits = cost ? usdToFinalCredits(cost.usd) : 0;

  await settleGeneration({ orgId: generation.org_id, generationId: input.generationId, actualAmount: actualCredits });
  await succeedGeneration({
    generationId: input.generationId,
    versionId: version.id,
    costUsd: cost?.usd,
    creditsCharged: actualCredits,
    tokensUsed: input.tokensUsed ? { ...input.tokensUsed } : null,
    outputSnapshot: input.imageUrl,
  });
}
```

Add `import type { GenerationRow } from "@/lib/db/types";` if not already imported. If `computeImageCost`'s exported signature differs from `(modelId: string, tokensUsed: ImageTokenUsage)`, match its actual signature (check `src/lib/image-gen/cost.ts`).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/generations src/app/api/webhooks`
Expected: PASS, including the existing video and voice tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/generations/complete.ts src/lib/generations/complete.test.ts
git commit -m "feat(generations): the webhook completes background image generations (D366)"
```

---

### Task 7: Per-node generation status read from the canvas's one generations feed

**Why this shape.** Today every Video Gen node mounts `useVideoGenStatus` twice (card and focus
view); each mount runs its own "is anything running?" query and each node opens its own realtime
channel, so N video nodes cost 2N queries and N channels on canvas load. Putting that hook on every
Image Gen card would have made a 300-node canvas fire ~600 queries and 300 channels (AGENTS.md
performance rules 1–3). The canvas already loads every generation for its nodes in **one** query
and listens on **one** channel (`use-generation-tray.ts` → `trayJobs`). Per-node status is read
from there instead: zero calls per node.

**Files:**
- Create: `src/lib/generations/node-status.ts`
- Test: `src/lib/generations/__tests__/node-status.test.ts`
- Modify: `src/lib/canvas-store.ts` (replace `videoGenStatus`, `setVideoGenGenerating`, `setVideoGenError`, `VideoGenJobKind`; extend `setTrayJobs` / `upsertTrayJob`)
- Modify: `src/lib/canvas-store.test.ts` (add a describe block)
- Modify: `src/hooks/use-generation-tray.ts`
- Create: `src/hooks/use-generation-status.ts`
- Delete: `src/hooks/use-video-gen-status.ts`, `src/lib/realtime/node-generation-status.ts`
- Modify: `src/components/nodes/video-gen-node.tsx`, `src/components/nodes/video-gen-focus-view.tsx`

**Interfaces:**
- Produces (used by Tasks 8–10):

```ts
// src/lib/generations/node-status.ts
export type GenerationJobKind = "image" | "video" | "voice";
export type NodeGenerationStatus = { isGenerating: boolean; kind: GenerationJobKind | null; lastError: string | null };
export function jobKindOf(type: GenerationRow["type"]): GenerationJobKind;
export function isNewerJob(candidate: GenerationRow, current: GenerationRow | undefined): boolean;
export function nodeGenerationStatus(latest: GenerationRow | undefined, started: GenerationJobKind | undefined, requestError: string | null): NodeGenerationStatus;
export type CompletionEffect = { toast: { tone: "success" | "error"; message: string }; cardImage: string | null };
export function completionEffect(previous: GenerationRow | undefined, next: GenerationRow): CompletionEffect | null;

// canvas store (src/lib/canvas-store.ts)
latestJobByNode: Record<string, GenerationRow>;            // maintained by setTrayJobs / upsertTrayJob
generationStarts: Record<string, GenerationJobKind>;        // a start accepted, its row not seen yet
generationRequestErrors: Record<string, string>;            // a start request that failed
markGenerationStarted: (nodeId: string, kind: GenerationJobKind) => void;
clearGenerationStarted: (nodeId: string) => void;
setGenerationRequestError: (nodeId: string, error: string | null) => void;

// src/hooks/use-generation-status.ts — same shape the video views already use
export function useGenerationStatus(nodeId: string): {
  isGenerating: boolean; isChangingVoice: boolean; lastError: string | null;
  setGenerating: (v: boolean, kind?: GenerationJobKind) => void;
  setLastError: (v: string | null) => void;
};
```

- [ ] **Step 1: Write the failing tests for the pure status rules**

```ts
// src/lib/generations/__tests__/node-status.test.ts
import { describe, it, expect } from "vitest";
import type { GenerationRow } from "@/lib/db/types";
import { completionEffect, isNewerJob, jobKindOf, nodeGenerationStatus } from "../node-status";

const row = (over: Partial<GenerationRow>): GenerationRow =>
  ({
    id: "g1",
    node_id: "n1",
    type: "image",
    status: "running",
    error: null,
    output_snapshot: null,
    created_at: "2026-10-12T10:00:00.000Z",
    ...over,
  }) as GenerationRow;

describe("jobKindOf", () => {
  it("maps the generation type to the job kind", () => {
    expect(jobKindOf("image")).toBe("image");
    expect(jobKindOf("voice")).toBe("voice");
    expect(jobKindOf("video")).toBe("video");
  });
});

describe("isNewerJob", () => {
  it("is newer when there is no current job, or it was created later", () => {
    expect(isNewerJob(row({}), undefined)).toBe(true);
    expect(isNewerJob(row({ id: "g2", created_at: "2026-10-12T10:05:00.000Z" }), row({}))).toBe(true);
    expect(isNewerJob(row({ id: "g0", created_at: "2026-10-12T09:55:00.000Z" }), row({}))).toBe(false);
  });

  it("treats an update of the same job as current", () => {
    expect(isNewerJob(row({ status: "succeeded" }), row({}))).toBe(true);
  });
});

describe("nodeGenerationStatus", () => {
  it("is generating from the moment a start is accepted, before its row arrives", () => {
    expect(nodeGenerationStatus(undefined, "image", null)).toEqual({ isGenerating: true, kind: "image", lastError: null });
  });

  it("is generating while the latest job is running", () => {
    expect(nodeGenerationStatus(row({ type: "voice" }), undefined, null)).toEqual({
      isGenerating: true,
      kind: "voice",
      lastError: null,
    });
  });

  it("shows the latest job's failure, and a failed start request ahead of it", () => {
    const failed = row({ status: "failed", error: "Content was blocked" });
    expect(nodeGenerationStatus(failed, undefined, null).lastError).toBe("Content was blocked");
    expect(nodeGenerationStatus(failed, undefined, "Couldn't start").lastError).toBe("Couldn't start");
  });

  it("is idle after a success", () => {
    expect(nodeGenerationStatus(row({ status: "succeeded" }), undefined, null)).toEqual({
      isGenerating: false,
      kind: null,
      lastError: null,
    });
  });
});

describe("completionEffect", () => {
  it("announces an image that finished, and puts it on the card", () => {
    expect(completionEffect(row({}), row({ status: "succeeded", output_snapshot: "https://cdn/g1.png" }))).toEqual({
      toast: { tone: "success", message: "Image ready" },
      cardImage: "https://cdn/g1.png",
    });
  });

  it("announces a finished video without touching the card (the video view mirrors it)", () => {
    expect(completionEffect(row({ type: "video" }), row({ type: "video", status: "succeeded" }))).toEqual({
      toast: { tone: "success", message: "Video ready" },
      cardImage: null,
    });
  });

  it("reports a failure with its reason", () => {
    expect(completionEffect(row({}), row({ status: "failed", error: "Out of credits" }))).toEqual({
      toast: { tone: "error", message: "Out of credits" },
      cardImage: null,
    });
  });

  it("does nothing unless the job was seen running and has now finished", () => {
    expect(completionEffect(undefined, row({ status: "succeeded" }))).toBeNull();
    expect(completionEffect(row({}), row({}))).toBeNull();
    expect(completionEffect(row({ status: "succeeded" }), row({ status: "succeeded" }))).toBeNull();
  });

  it("ignores prompt generations, which announce themselves", () => {
    expect(completionEffect(row({ type: "prompt" }), row({ type: "prompt", status: "succeeded" }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/generations/__tests__/node-status.test.ts`
Expected: FAIL, cannot resolve `../node-status`.

- [ ] **Step 3: Implement the pure rules**

```ts
// src/lib/generations/node-status.ts
// D366 — a node's generation status, derived from the canvas's one generations feed (trayJobs)
// rather than a query and a channel per node. Pure, so it is tested on its own.
import type { GenerationRow } from "@/lib/db/types";

export type GenerationJobKind = "image" | "video" | "voice";

export type NodeGenerationStatus = {
  isGenerating: boolean;
  kind: GenerationJobKind | null;
  lastError: string | null;
};

export function jobKindOf(type: GenerationRow["type"]): GenerationJobKind {
  return type === "voice" ? "voice" : type === "image" ? "image" : "video";
}

/** Whether `candidate` should replace `current` as a node's latest job: the same job updated, or
 *  one created later. */
export function isNewerJob(candidate: GenerationRow, current: GenerationRow | undefined): boolean {
  if (!current || candidate.id === current.id) return true;
  return Date.parse(candidate.created_at) > Date.parse(current.created_at);
}

/** `started` covers the moment between a start being accepted and its row arriving on the feed;
 *  `requestError` is a start request that failed before any row existed. */
export function nodeGenerationStatus(
  latest: GenerationRow | undefined,
  started: GenerationJobKind | undefined,
  requestError: string | null,
): NodeGenerationStatus {
  if (started) return { isGenerating: true, kind: started, lastError: null };
  if (latest?.status === "running") return { isGenerating: true, kind: jobKindOf(latest.type), lastError: null };
  const jobError = latest?.status === "failed" ? latest.error ?? "Generation failed" : null;
  return { isGenerating: false, kind: null, lastError: requestError ?? jobError };
}

export type CompletionEffect = {
  toast: { tone: "success" | "error"; message: string };
  /** An image to put on the node's card (the job finished in the background). */
  cardImage: string | null;
};

/** What the canvas does when a job it saw running finishes: once per canvas, not once per node. */
export function completionEffect(
  previous: GenerationRow | undefined,
  next: GenerationRow,
): CompletionEffect | null {
  if (next.type === "prompt") return null;
  if (previous?.status !== "running" || next.status === "running") return null;
  const voice = next.type === "voice";
  if (next.status === "succeeded") {
    const message = voice ? "Voice changed and added as a new version" : next.type === "image" ? "Image ready" : "Video ready";
    return {
      toast: { tone: "success", message },
      cardImage: next.type === "image" ? next.output_snapshot : null,
    };
  }
  return {
    toast: { tone: "error", message: next.error ?? (voice ? "Voice change failed" : "Generation failed") },
    cardImage: null,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/generations/__tests__/node-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Store — write the failing tests** (append to `src/lib/canvas-store.test.ts`; it already imports `createCanvasStore`)

```ts
describe("generation status feed (D366)", () => {
  const job = (id: string, nodeId: string, created_at: string, status: GenerationRow["status"] = "running") =>
    ({ id, node_id: nodeId, type: "image", status, error: null, output_snapshot: null, created_at }) as GenerationRow;

  it("indexes the newest job per node when the feed loads", () => {
    const store = createCanvasStore([], []);
    store.getState().setTrayJobs([
      job("old", "n1", "2026-10-12T09:00:00.000Z", "succeeded"),
      job("new", "n1", "2026-10-12T10:00:00.000Z"),
      job("other", "n2", "2026-10-12T08:00:00.000Z"),
    ]);
    expect(store.getState().latestJobByNode.n1.id).toBe("new");
    expect(store.getState().latestJobByNode.n2.id).toBe("other");
  });

  it("keeps the newest job when an older one is updated late", () => {
    const store = createCanvasStore([], []);
    store.getState().upsertTrayJob(job("new", "n1", "2026-10-12T10:00:00.000Z"));
    store.getState().upsertTrayJob(job("old", "n1", "2026-10-12T09:00:00.000Z", "succeeded"));
    expect(store.getState().latestJobByNode.n1.id).toBe("new");
  });

  it("clears a start mark once a running row for that node arrives", () => {
    const store = createCanvasStore([], []);
    store.getState().markGenerationStarted("n1", "image");
    store.getState().upsertTrayJob(job("old", "n1", "2026-10-12T09:00:00.000Z", "succeeded"));
    expect(store.getState().generationStarts.n1).toBe("image");
    store.getState().upsertTrayJob(job("new", "n1", "2026-10-12T10:00:00.000Z"));
    expect(store.getState().generationStarts.n1).toBeUndefined();
  });

  it("clears a node's request error when a new start is marked", () => {
    const store = createCanvasStore([], []);
    store.getState().setGenerationRequestError("n1", "Couldn't start");
    store.getState().markGenerationStarted("n1", "image");
    expect(store.getState().generationRequestErrors.n1).toBeUndefined();
  });
});
```

Add `import type { GenerationRow } from "./db/types";` to the test file's imports if it is not already there.

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: the new block FAILS (`latestJobByNode` is undefined).

- [ ] **Step 7: Store — implement.** In `src/lib/canvas-store.ts`:

Delete `export type VideoGenJobKind = "video" | "voice";` and import instead:

```ts
import { isNewerJob, type GenerationJobKind } from "@/lib/generations/node-status";
```

In `CanvasState`, replace the three `videoGenStatus` / `setVideoGenGenerating` / `setVideoGenError` members with:

```ts
  // D366 — per-node generation status is DERIVED from the canvas's one generations feed below
  // (trayJobs), never fetched per node. `latestJobByNode` indexes it so a node's selector is O(1).
  latestJobByNode: Record<string, GenerationRow>;
  generationStarts: Record<string, GenerationJobKind>;
  generationRequestErrors: Record<string, string>;
  markGenerationStarted: (nodeId: string, kind: GenerationJobKind) => void;
  clearGenerationStarted: (nodeId: string) => void;
  setGenerationRequestError: (nodeId: string, error: string | null) => void;
```

Replace the `videoGenStatus: {}` initial value and the `setVideoGenGenerating` / `setVideoGenError` implementations with:

```ts
    latestJobByNode: {},
    generationStarts: {},
    generationRequestErrors: {},

    markGenerationStarted: (nodeId, kind) =>
      set((s) => {
        const { [nodeId]: _cleared, ...errors } = s.generationRequestErrors;
        return { generationStarts: { ...s.generationStarts, [nodeId]: kind }, generationRequestErrors: errors };
      }),

    clearGenerationStarted: (nodeId) =>
      set((s) => {
        if (!(nodeId in s.generationStarts)) return {};
        const { [nodeId]: _cleared, ...rest } = s.generationStarts;
        return { generationStarts: rest };
      }),

    setGenerationRequestError: (nodeId, error) =>
      set((s) => {
        const { [nodeId]: _cleared, ...rest } = s.generationRequestErrors;
        return { generationRequestErrors: error ? { ...rest, [nodeId]: error } : rest };
      }),
```

Replace `setTrayJobs` and `upsertTrayJob` with:

```ts
    setTrayJobs: (jobs) => {
      const latest: Record<string, GenerationRow> = {};
      for (const j of jobs) {
        if (j.node_id && isNewerJob(j, latest[j.node_id])) latest[j.node_id] = j;
      }
      set({ trayJobs: Object.fromEntries(jobs.map((j) => [j.id, j])), latestJobByNode: latest });
    },
    upsertTrayJob: (job) =>
      set((s) => {
        const nodeId = job.node_id;
        const newer = nodeId !== null && isNewerJob(job, s.latestJobByNode[nodeId]);
        // The job's own row now speaks for the node: a start mark is no longer needed.
        const startCleared = nodeId !== null && job.status === "running" && nodeId in s.generationStarts;
        const { [nodeId ?? ""]: _cleared, ...starts } = s.generationStarts;
        return {
          trayJobs: { ...s.trayJobs, [job.id]: job },
          ...(newer ? { latestJobByNode: { ...s.latestJobByNode, [nodeId!]: job } } : {}),
          ...(startCleared ? { generationStarts: starts } : {}),
        };
      }),
```

- [ ] **Step 8: Run the store tests**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: PASS (all, including existing tests).

- [ ] **Step 9: The hook** — create `src/hooks/use-generation-status.ts`:

```ts
"use client";

import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { nodeGenerationStatus, type GenerationJobKind } from "@/lib/generations/node-status";

export type GenerationStatus = {
  isGenerating: boolean;
  /** D284 — true while the running job is a voice change rather than a fresh video. */
  isChangingVoice: boolean;
  lastError: string | null;
  setGenerating: (v: boolean, kind?: GenerationJobKind) => void;
  setLastError: (v: string | null) => void;
};

/** D366 — a node's generation status, read from the canvas's one generations feed. No query and no
 *  channel per node (AGENTS.md performance rules 1–3): the canvas loads and listens once
 *  (use-generation-tray.ts), and this selects its node's part in O(1). */
export function useGenerationStatus(nodeId: string): GenerationStatus {
  const { latest, started, requestError, mark, clear, setRequestError } = useCanvasStore(
    useShallow((s) => ({
      latest: s.latestJobByNode[nodeId],
      started: s.generationStarts[nodeId],
      requestError: s.generationRequestErrors[nodeId] ?? null,
      mark: s.markGenerationStarted,
      clear: s.clearGenerationStarted,
      setRequestError: s.setGenerationRequestError,
    })),
  );
  const status = nodeGenerationStatus(latest, started, requestError);
  return {
    isGenerating: status.isGenerating,
    isChangingVoice: status.isGenerating && status.kind === "voice",
    lastError: status.lastError,
    setGenerating: (v, kind = "video") => (v ? mark(nodeId, kind) : clear(nodeId)),
    setLastError: (v) => setRequestError(nodeId, v),
  };
}
```

- [ ] **Step 10: The canvas feed applies completions once, and waits for the session.** In `src/hooks/use-generation-tray.ts`, replace the live `useEffect` with:

```ts
  // Live: one channel for the whole canvas; ignore rows for other canvases' nodes. This is also
  // where a finished job is announced and an image lands on its card (D366) — once per canvas,
  // never once per node.
  useEffect(() => {
    const supabase = createBrowserSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    // Await the session BEFORE subscribing: a channel opened without a JWT is dropped by RLS while
    // still reporting SUBSCRIBED (the lesson node-generation-status.ts recorded).
    void supabase.auth.getSession().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`generation-tray:${canvasId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "generations" },
          (payload: RealtimePostgresChangesPayload<GenerationRow>) => {
            const row = payload.new as GenerationRow;
            if (!row?.id) return;
            const state = storeApi.getState();
            if (row.node_id === null || !state.nodes.some((n) => n.id === row.node_id)) return;
            const effect = completionEffect(state.trayJobs[row.id], row);
            upsertTrayJob(row);
            if (!effect) return;
            if (effect.toast.tone === "success") toast.success(effect.toast.message);
            else toast.error(effect.toast.message);
            if (effect.cardImage) {
              state.updateNodeData(row.node_id, { parsed: effect.cardImage, approvalStatus: "pending" });
            }
            if (effect.toast.tone === "success") void revalidateCanvasGenerations();
          },
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [canvasId, upsertTrayJob, storeApi]);
```

Add the imports:

```ts
import { toast } from "sonner";
import { completionEffect } from "@/lib/generations/node-status";
import { revalidateCanvasGenerations } from "@/hooks/use-canvas-generations";
```

Update the file's header comment: replace "Coexists with the per-node use-video-gen-status subscription (separate concern)." with "D366 — it is also every node's generation status (useGenerationStatus selects from it) and the one place a finished job is announced."

- [ ] **Step 11: Move the video views over and delete the per-node path**

```bash
git rm src/hooks/use-video-gen-status.ts src/lib/realtime/node-generation-status.ts
```

In `src/components/nodes/video-gen-node.tsx` and `src/components/nodes/video-gen-focus-view.tsx`, replace `import { useVideoGenStatus } from "@/hooks/use-video-gen-status";` with `import { useGenerationStatus } from "@/hooks/use-generation-status";` and `useVideoGenStatus(` with `useGenerationStatus(`.

In `video-gen-focus-view.tsx`:
- Delete the two store reads `const setVideoGenGenerating = useCanvasStore((s) => s.setVideoGenGenerating);` and `const setVideoGenError = useCanvasStore((s) => s.setVideoGenError);`.
- In the open effect (the one beginning `// Load data when focus view opens; also re-check generation status…`), delete the `createBrowserSupabase().from("generations")…` query and its `.then(...)` entirely — status is derived from the canvas feed now, so there is no stale flag to clear — and remove `setVideoGenGenerating, setVideoGenError` from that effect's dependency array. Update its leading comment to "Load the connected inputs when the focus view opens." Remove the `createBrowserSupabase` import if nothing else in the file uses it.
- Where the voice change starts (`setVideoGenGenerating(nodeId, true, "voice");`), use `setGenerating(true, "voice");` (it is already destructured from the hook).

Confirm no old names remain:

Run: `git grep -n -e useVideoGenStatus -e videoGenStatus -e setVideoGenGenerating -e setVideoGenError -e VideoGenJobKind -e node-generation-status -- src` — Expected: no output.

- [ ] **Step 12: Verify**

Run: `npx tsc --noEmit -p .` — Expected: exit 0.
Run: `npx vitest run src/lib/generations src/lib/canvas-store.test.ts src/hooks src/components` — Expected: PASS.
Run: `npx eslint src/hooks/use-generation-status.ts src/hooks/use-generation-tray.ts src/lib/generations/node-status.ts src/lib/canvas-store.ts src/components/nodes/video-gen-node.tsx src/components/nodes/video-gen-focus-view.tsx` — Expected: no new errors.

- [ ] **Step 13: Commit**

```bash
git add -A src/lib/generations src/lib/canvas-store.ts src/lib/canvas-store.test.ts src/hooks src/lib/realtime src/components/nodes/video-gen-node.tsx src/components/nodes/video-gen-focus-view.tsx
git commit -m "perf(generations): node status from the canvas's one feed, not a query and channel per node (D366)"
```
---

### Task 8: Service and mutation hooks for starting generations and restoring versions

**Files:**
- Create: `src/services/node-generation.service.ts`
- Create: `src/hooks/queries/node-generation.ts`
- Test: `src/services/node-generation.service.test.ts`
- Test: `src/hooks/queries/__tests__/node-generation.test.ts`

**Interfaces:**
- Consumes: `readJson`, `ApiError` from `@/services/read-json`; `nodeVersionKeys` from `@/hooks/queries/node-versions`; the store's `markGenerationStarted` (Task 7); `CREDIT_LIMIT_TOAST_MESSAGE` from `@/lib/credits/units`.
- Produces:

```ts
// services/node-generation.service.ts
export type StartedGeneration = { generationId: string };
export type RestoredVersion = { output?: string; modelUsed?: string | null; paramsUsed?: Record<string, unknown> };
export const nodeGenerationService: {
  startImage(nodeId: string, body: Record<string, unknown>): Promise<StartedGeneration>;
  startComposite(nodeId: string, body: Record<string, unknown>): Promise<StartedGeneration>;
  restoreVersion(nodeId: string, versionId: string): Promise<RestoredVersion>;
};

// hooks/queries/node-generation.ts
export function useStartImageGeneration(nodeId: string): UseMutationResult<StartedGeneration, Error, Record<string, unknown>>;
export function useStartCompositeGeneration(nodeId: string): UseMutationResult<StartedGeneration, Error, Record<string, unknown>>;
export function useRestoreNodeVersion(nodeId: string): UseMutationResult<RestoredVersion, Error, string>;
export function startErrorMessage(e: unknown, fallback: string): string;
```

- [ ] **Step 1: Write the failing service test**

```ts
// src/services/node-generation.service.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { nodeGenerationService } from "./node-generation.service";
import { ApiError } from "./read-json";

function respond(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe("nodeGenerationService (D366)", () => {
  it("starts an image generation and returns its id", async () => {
    respond(202, { generationId: "g1" });
    await expect(nodeGenerationService.startImage("n1", { modelId: "m" })).resolves.toEqual({ generationId: "g1" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/nodes/n1/image-generate",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ modelId: "m" }) }),
    );
  });

  it("starts a composite generation on its own route", async () => {
    respond(202, { generationId: "g2" });
    await nodeGenerationService.startComposite("n2", { instruction: "x" });
    expect(fetch).toHaveBeenCalledWith("/api/nodes/n2/composite-generate", expect.objectContaining({ method: "POST" }));
  });

  it("throws the server's message with its status, so a credit-limit refusal can be told apart", async () => {
    respond(402, { error: "Monthly credit limit reached" });
    const failure = nodeGenerationService.startImage("n1", {});
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 402 });
  });

  it("restores a version and returns what the node goes back to", async () => {
    respond(200, { output: "https://cdn/v1.png", modelUsed: "m", paramsUsed: { quality: "high" } });
    await expect(nodeGenerationService.restoreVersion("n1", "v1")).resolves.toEqual({
      output: "https://cdn/v1.png",
      modelUsed: "m",
      paramsUsed: { quality: "high" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/nodes/n1/restore-version",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ versionId: "v1" }) }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/services/node-generation.service.test.ts`
Expected: FAIL, cannot resolve `./node-generation.service`.

- [ ] **Step 3: Implement the service**

```ts
// src/services/node-generation.service.ts
import { readJson } from "./read-json";

/** D366 — a started background generation; its result arrives through the node's status. */
export type StartedGeneration = { generationId: string };

/** What a restored version puts the node back to (YUV-295). */
export type RestoredVersion = {
  output?: string;
  modelUsed?: string | null;
  paramsUsed?: Record<string, unknown>;
};

function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

class NodeGenerationService {
  /** Image Gen: generate or edit. Answers once the job is started (202). */
  async startImage(nodeId: string, body: Record<string, unknown>): Promise<StartedGeneration> {
    return readJson<StartedGeneration>(await post(`/api/nodes/${nodeId}/image-generate`, body), "Generation failed");
  }

  /** Composite: generate or edit. Answers once the job is started (202). */
  async startComposite(nodeId: string, body: Record<string, unknown>): Promise<StartedGeneration> {
    return readJson<StartedGeneration>(await post(`/api/nodes/${nodeId}/composite-generate`, body), "Generation failed");
  }

  async restoreVersion(nodeId: string, versionId: string): Promise<RestoredVersion> {
    return readJson<RestoredVersion>(await post(`/api/nodes/${nodeId}/restore-version`, { versionId }), "Restore failed");
  }
}

export const nodeGenerationService = new NodeGenerationService();
```

- [ ] **Step 4: Run the service test**

Run: `npx vitest run src/services/node-generation.service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing test for the error message helper**

```ts
// src/hooks/queries/__tests__/node-generation.test.ts
import { describe, it, expect } from "vitest";
import { startErrorMessage } from "../node-generation";
import { ApiError } from "@/services/read-json";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";

describe("startErrorMessage", () => {
  it("names the credit limit for a 402", () => {
    expect(startErrorMessage(new ApiError("Monthly credit limit reached", 402), "Generation failed")).toBe(
      CREDIT_LIMIT_TOAST_MESSAGE,
    );
  });

  it("passes the server's message through otherwise", () => {
    expect(startErrorMessage(new ApiError("This node is already generating.", 409), "Generation failed")).toBe(
      "This node is already generating.",
    );
  });

  it("falls back for something that is not an error", () => {
    expect(startErrorMessage("boom", "Edit failed")).toBe("Edit failed");
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/hooks/queries/__tests__/node-generation.test.ts`
Expected: FAIL, cannot resolve `../node-generation`.

- [ ] **Step 7: Implement the query file**

```ts
// src/hooks/queries/node-generation.ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { nodeGenerationService } from "@/services/node-generation.service";
import { ApiError } from "@/services/read-json";
import { nodeVersionKeys } from "@/hooks/queries/node-versions";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";

// D366 — starting a background generation and restoring a version, through TanStack Query
// (CLAUDE.md, "Data fetching"). Starting does not create a version: that happens when the job
// reports back, and the versions cache hears of it through the live channel. What a start changes
// on the client is the node's generation status, which these mutations set on success.

/** The message to show for a failed start: the credit limit by name, else the server's words. */
export function startErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.status === 402) return CREDIT_LIMIT_TOAST_MESSAGE;
  return e instanceof Error && e.message ? e.message : fallback;
}

export function useStartImageGeneration(nodeId: string) {
  const markGenerationStarted = useCanvasStore((s) => s.markGenerationStarted);
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => nodeGenerationService.startImage(nodeId, body),
    onSuccess: (started) => markGenerationStarted(nodeId, "image", started.generationId),
  });
}

export function useStartCompositeGeneration(nodeId: string) {
  const markGenerationStarted = useCanvasStore((s) => s.markGenerationStarted);
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => nodeGenerationService.startComposite(nodeId, body),
    onSuccess: (started) => markGenerationStarted(nodeId, "image", started.generationId),
  });
}

/** Restore moves the node's active version, so the cached list is re-read. */
export function useRestoreNodeVersion(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => nodeGenerationService.restoreVersion(nodeId, versionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nodeVersionKeys.list(nodeId), exact: true }),
  });
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npx vitest run src/hooks/queries/__tests__/node-generation.test.ts src/services/node-generation.service.test.ts`
Expected: PASS (7 tests).
Run: `npx tsc --noEmit -p .` — Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/services/node-generation.service.ts src/services/node-generation.service.test.ts src/hooks/queries/node-generation.ts src/hooks/queries/__tests__/node-generation.test.ts
git commit -m "feat(generations): service and mutation hooks for starting generations and restoring (D366)"
```

---

### Task 9: Image Gen view starts and watches

**Files:**
- Modify: `src/components/nodes/image-gen-focus-view.tsx` (lines 192-199 state, 671-715 `handleGenerate`, 754-813 `handleEdit`, the `onProcessingChange` prop)
- Modify: `src/components/nodes/image-gen-node.tsx` (lines 90, 136, 170, 208)

**Interfaces:**
- Consumes: `useGenerationStatus` (Task 7); `useStartImageGeneration`, `useRestoreNodeVersion`, `startErrorMessage` (Task 8).

- [ ] **Step 2: Image Gen focus view state** — replace lines 192-199:

```ts
  // D366 — a generation runs in the background; this node's shared status says whether one is
  // running (it survives a reload or a return to the canvas). The start mutation covers only the
  // start request itself, and `lastAction` which button started it.
  const status = useGenerationStatus(nodeId);
  const startGeneration = useStartImageGeneration(nodeId);
  const restoreVersion = useRestoreNodeVersion(nodeId);
  const [lastAction, setLastAction] = useState<"generate" | "edit">("generate");
  const busy = startGeneration.isPending || status.isGenerating;
  const generating = busy && lastAction === "generate";
  const editing = busy && lastAction === "edit";
  const [requestError, setLastError] = useState<string | null>(null);
  const lastError = requestError ?? status.lastError;
```

Remove the `onProcessingChange` prop from `ImageGenFocusViewProps` and from the component's destructured props.

- [ ] **Step 3: `handleGenerate`** — replace the function (lines 671-715):

```ts
  async function handleGenerate() {
    // Second line of defence behind the button's disabled state: a run in flight must never
    // be able to start another one. The server refuses a second run too (409).
    if (busy) return;
    if (!promptUpstream) {
      toast.error("Connect a Prompt node first.");
      return;
    }
    setLastAction("generate");
    setLastError(null);
    setEvalDecision(null);
    setEvalNote("");
    try {
      // On success the mutation marks the node as generating; the status hook lands the result.
      await startGeneration.mutateAsync({ modelId: model.id, params: paramValues });
    } catch (e) {
      const message = startErrorMessage(e, "Generation failed");
      setLastError(message);
      toast.error(message, { duration: 6000 });
      await fetchVersions();
    }
  }
```

- [ ] **Step 4: `handleEdit`** — replace the function (lines 754-813):

```ts
  async function handleEdit() {
    if (busy) return; // same re-entrancy guard as handleGenerate
    const baseVersionId = activeVersionId ?? undefined;
    const baseImageUrl = baseVersionId ? undefined : baseNodeUrl ?? undefined;
    if (!baseVersionId && !baseImageUrl) {
      toast.error("Generate an image, or connect an image reference, to edit it.");
      return;
    }
    setLastAction("edit");
    setLastError(null);
    try {
      // Region mask (paint models only): convert the painted overlay into an alpha PNG and send
      // it alongside the CLEAN base. Type-only models send no mask.
      let maskBase64: string | undefined;
      let maskMime: string | undefined;
      if (editMode === "paint" && annotationRef.current?.hasMarks()) {
        const mask = await annotationRef.current.toMaskBase64();
        if (mask) {
          maskBase64 = mask.base64;
          maskMime = mask.mime;
        }
      }
      await startGeneration.mutateAsync({
        modelId: model.id,
        params: paramValues,
        instruction: editInstr,
        intent,
        prompt: finalPrompt,
        extraReferenceUrls: selectedExtraUrls,
        ...(maskBase64 ? { masked: true, maskBase64, maskMime } : {}),
        ...(baseVersionId ? { baseVersionId } : { baseImageUrl }),
      });
      // The mask has been sent with the request; the strokes are no longer needed.
      annotationRef.current?.clear();
    } catch (e) {
      const message = startErrorMessage(e, "Edit failed");
      setLastError(message);
      toast.error(message, { duration: 6000 });
      await fetchVersions();
    }
  }
```

Remove the now-unused `revalidateCanvasGenerations` and `CREDIT_LIMIT_TOAST_MESSAGE` imports from the focus view if nothing else in it uses them (keep `setActiveVersionId` — the restore handler uses it). Add:

```ts
import { useGenerationStatus } from "@/hooks/use-generation-status";
import {
  useStartImageGeneration,
  useRestoreNodeVersion,
  startErrorMessage,
} from "@/hooks/queries/node-generation";
```

- [ ] **Step 4b: Restore through the mutation** — in `handleRestoreVersion`, replace the `fetch(.../restore-version)` call, the `res.json()` read and the `if (!res.ok) throw …` line with one call; everything after it (model and params restore, `setActiveVersionId`, `fetchVersions`, toasts) stays:

```ts
      const json = await restoreVersion.mutateAsync(versionId);
```

`json` keeps the same fields the handler already reads (`output`, `modelUsed`, `paramsUsed`).

Then confirm the view no longer calls `fetch` for these routes:

Run: `git grep -n -e "image-generate\`" -e "restore-version\`" -- src/components/nodes/image-gen-focus-view.tsx` — Expected: no output.

- [ ] **Step 5: Image Gen card** — in `image-gen-node.tsx`, replace `const [isProcessing, setIsProcessing] = useState(false);` (line 90) with:

```ts
  // D366 — whether this node is generating, from its shared status (survives the focus view
  // closing, a reload, or leaving the canvas and coming back).
  const { isGenerating: isProcessing } = useGenerationStatus(id);
```

Remove `onProcessingChange={setIsProcessing}` (line 208) and add:

```ts
import { useGenerationStatus } from "@/hooks/use-generation-status";
```

- [ ] **Step 6: Typecheck, lint, test**

Run: `npx tsc --noEmit -p .` — Expected: exit 0.
Run: `npx eslint src/components/nodes/image-gen-focus-view.tsx src/components/nodes/image-gen-node.tsx` — Expected: no errors.
Run: `npx vitest run src/components src/hooks` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/nodes/image-gen-focus-view.tsx src/components/nodes/image-gen-node.tsx
git commit -m "feat(image-gen): Image Gen starts a generation and watches it, so leaving loses nothing (D366)"
```

---

### Task 10: Composite starts and watches

**Files:**
- Modify: `src/hooks/use-composite-versions.ts`

**Interfaces:**
- Consumes: `useGenerationStatus` (Task 7); `useStartCompositeGeneration`, `useRestoreNodeVersion`, `startErrorMessage` (Task 8).
- Produces: `useCompositeVersions` keeps its return shape; `generate()` now resolves `true` once the run is **accepted**.

- [ ] **Step 1: Replace the generating state and `generate`** — in `use-composite-versions.ts`, replace `const [generating, setGenerating] = useState(false);`, `const [restoring, setRestoring] = useState(false);` and `const [lastError, setLastError] = useState<string | null>(null);` with:

```ts
  // D366 — a composite runs in the background; the node's shared status says whether one is
  // running, across reloads and returns to the canvas. The start mutation covers the request.
  const status = useGenerationStatus(nodeId);
  const startGeneration = useStartCompositeGeneration(nodeId);
  const restoreVersion = useRestoreNodeVersion(nodeId);
  const generating = startGeneration.isPending || status.isGenerating;
  const restoring = restoreVersion.isPending;
  const [requestError, setLastError] = useState<string | null>(null);
  const lastError = requestError ?? status.lastError;
```

Replace the whole `generate` function body (keep its signature and the `body` parameter type) with:

```ts
    if (generating) return false; // a run in flight never starts another; the server refuses too (409)
    setLastError(null);
    try {
      // Accepted: the mutation marks the node as generating; the status hook lands the result.
      await startGeneration.mutateAsync(body);
      return true;
    } catch (e) {
      const message = startErrorMessage(e, "Generation failed");
      setLastError(message);
      toast.error(message, { duration: 6000 });
      await fetchVersions();
      return false;
    }
```

Replace the whole `restore` function body with:

```ts
    const toastId = toast.loading("Restoring version…");
    try {
      const json = await restoreVersion.mutateAsync(versionId);
      if (json.output) onPatch({ parsed: json.output });
      setActiveVersionId(versionId);
      toast.success("Version restored", { id: toastId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed", { id: toastId });
    }
```

Remove the imports that are now unused (`revalidateCanvasGenerations`, `CREDIT_LIMIT_TOAST_MESSAGE`). Add:

```ts
import { useGenerationStatus } from "@/hooks/use-generation-status";
import {
  useStartCompositeGeneration,
  useRestoreNodeVersion,
  startErrorMessage,
} from "@/hooks/queries/node-generation";
```

Confirm no direct requests remain:

Run: `git grep -n "fetch(" -- src/hooks/use-composite-versions.ts` — Expected: no output.

Update the hook's doc comment: `/** D312/D366 — a composite's versions, Generate and Restore. Generate starts a background job and resolves once it is accepted; the result lands through the node's generation status. */`

`use-composite-edit.ts` needs no change: its "strokes clear only on success" now clears once the edit is accepted, when the mask has already been sent.

- [ ] **Step 2: Typecheck, lint, test**

Run: `npx tsc --noEmit -p .` — Expected: exit 0.
Run: `npx eslint src/hooks/use-composite-versions.ts` — Expected: no errors.
Run: `npx vitest run src/hooks src/components` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-composite-versions.ts
git commit -m "feat(composite): Composite starts a generation and watches it (D366)"
```

---

### Task 11: Tray, decision log, spec correction, verification

**Files:**
- Modify: `src/lib/generation-tray.ts` (lines 35-36 constant, 128-134 rule)
- Modify: `src/lib/generation-tray.test.ts` (lines ~103-110 and ~205-217)
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (append D366 after the last entry)
- Modify: `docs/superpowers/specs/2026-10-12-async-image-generation-design.md` (retry wording)

- [ ] **Step 1: Update the tray tests first** — in `generation-tray.test.ts`, replace the test `"renders a stale running IMAGE job as failed, but not a running video"` with:

```ts
  it("keeps a long-running image job running — it is a background job now (D366)", () => {
    const later = Date.parse("2026-07-05T00:00:00.000Z") + 30 * 60_000;
    const jobs = [job("gi", "image", "running"), job("gv", "video", "running")];
    const items = deriveTrayItems([node("gi", "image-gen"), node("gv", "video-gen")], [], jobs, later);
    expect(items.map((i) => i.status)).toEqual(["running", "running"]);
  });
```

Delete the test `"stale-times the image OUTPUT kind only, never a running prompt"` (the rule it guards is removed). Remove `STALE_RUNNING_MS` from the test file's import. If the helper names in that file differ from `job(...)`/`node(...)`, use the file's existing helpers with the same arguments the deleted test used.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/generation-tray.test.ts`
Expected: FAIL — the image job shows as `failed`.

- [ ] **Step 3: Remove the rule** — in `generation-tray.ts`, delete the `STALE_RUNNING_MS` constant and its comment (lines 35-36) and the block (lines 128-134):

```ts
    // Stale running IMAGE OUTPUT (client disconnected mid-request) → Failed. ...
    if (status === "running" && kind === "image") {
      if (nowMs - Date.parse(jobRow.created_at) > STALE_RUNNING_MS)
        status = "failed";
    }
```

Change `let status: TrayStatus =` to `const status: TrayStatus =`. If `nowMs` is now unused inside `deriveTrayItems`, keep the parameter (callers pass it) and rename it `_nowMs`.

Run: `git grep -n STALE_RUNNING_MS -- src` — Expected: no output.

- [ ] **Step 4: Run the tray tests**

Run: `npx vitest run src/lib/generation-tray.test.ts src/lib/__tests__/generation-tray-prompts.test.ts`
Expected: PASS.

- [ ] **Step 5: Correct the spec's retry wording** — in `2026-10-12-async-image-generation-design.md`, replace the paragraph that begins "On any failure it posts" with:

```markdown
The task gets one retry for a transient provider error, and posts
`{ generationId, status: "failed", error }` **only when the failure is final** (its last attempt):
posting it earlier would refund and close the run, and the retry's paid result would then be
dropped by the webhook's duplicate guard. A failure **after the provider has returned** (the upload,
the webhook) is never retried, since a retry would pay the provider again; it names the image URL
so the result can be attached by hand. `video-generate` reports failures by the same rule and takes
no automatic retry at all: its provider jobs are billed when submitted, so a retry after a failed
or timed-out poll would pay for a second clip. (It used to report `failed` on every attempt and then
retry, so a retry that succeeded was paid for and discarded.)
```

- [ ] **Step 6: Append D366 to the decision log** — at the end of `2026-05-30-creativeos-staging-roadmap.md`, append the ADR entry exactly as written in the spec's "ADR entry" section, with this sentence added at the end of **Decision**: "Paid generation tasks report `failed` only when the failure is final, and never retry a failure after the provider returned — the rule `video-voice-change` already followed. `image-generate` retries once (a failed image call is not billed); `video-generate` does not retry (its jobs are billed when submitted). Before this, `video-generate` reported `failed` on every attempt and then retried, so a retry that succeeded was paid for and discarded."

- [ ] **Step 7: Full verification**

Run: `npx tsc --noEmit -p .` — Expected: exit 0.
Run: `npx vitest run src/lib src/hooks src/components src/services` — Expected: PASS.
Run: `npx vitest run src/app/api/nodes src/app/api/webhooks` — Expected: PASS.
Run: `npx eslint trigger/image-generate.ts src/lib/image-gen src/lib/generations src/lib/storage src/lib/composite src/hooks src/components/nodes/image-gen-focus-view.tsx src/components/nodes/image-gen-node.tsx src/lib/generation-tray.ts` — Expected: no new errors (pre-existing warnings allowed).

- [ ] **Step 8: Commit**

```bash
git add src/lib/generation-tray.ts src/lib/generation-tray.test.ts docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md docs/superpowers/specs/2026-10-12-async-image-generation-design.md
git commit -m "feat(generations): long image runs stay running in the tray; record D366"
```

- [ ] **Step 9: Deployment and manual checks (hand back to the operator)**

Before merging, the operator must:
1. Add the image providers' API keys (OpenAI, Gemini, Seedream) to both Trigger.dev projects' environments.
2. Deploy the Trigger.dev task (`image-generate`) before the routes reach users.

Then check on staging:
1. Generate an image; close the focus view mid-run. The card shows Processing, then the image and an "Image ready" toast.
2. Generate; switch to another canvas and back. The run is still shown as running, then completes.
3. Generate; close the tab, reopen the canvas. The new image is there.
4. Edit an image with a painted region (GPT Image) and with a typed instruction.
5. Composite: generate and edit.
6. Click Generate twice quickly: one run only.
7. Run out of credits: Generate is refused with the credit message, nothing is charged.
8. Credits on the card and header update after completion.
```

---

### Task 12: `video-generate` never discards a paid video

**Files:**
- Modify: `trigger/video-generate.ts`

**Interfaces:**
- Consumes: `PaidResultError`, `isFinalAttempt` from `@/lib/generations/task-failure` (Task 5).

**Why.** Today the task posts `failed` (which refunds and closes the generation) on every failure, then lets Trigger.dev retry under the project default of two attempts. A retry that succeeds is paid for and then ignored by `completeGeneration`'s duplicate guard, so the operator sees a failure for a clip the provider made and charged. And when the webhook is unreachable after a successful call, the plain `Error` it throws is caught by the same handler, reported as failed, and retried, which generates and pays for the video again. Video provider jobs are billed when submitted, so this task takes **no** automatic retry at all.

- [ ] **Step 1: Set the retry limit and take the run context** — in `trigger/video-generate.ts`, change the first import and add the task-failure import:

```ts
import { task, logger, wait, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { postGenerationWebhook, postGenerationWebhookSafely, assertWebhookConfig } from "@/lib/generations/post-webhook";
import { PaidResultError, isFinalAttempt } from "@/lib/generations/task-failure";

// D366 — no automatic retry. A video provider bills the job when it is submitted, so a retry after a
// failed or timed-out poll would pay for a second clip. The operator regenerates instead.
const MAX_ATTEMPTS = 1;
```

Add `retry: { maxAttempts: MAX_ATTEMPTS },` directly after `maxDuration: 2400,`, and change `run: async (payload: { … }) => {` to `run: async (payload: { … }, { ctx }) => {` (the payload type is unchanged).

- [ ] **Step 2: A failure after the provider returned is a paid result** — replace the inner `try { await postGenerationWebhook({ … }) } catch (e) { throw new Error(…) }` block with:

```ts
      // The video EXISTS and has been billed: nothing from here may lead to a retry.
      let res: Response;
      try {
        res = await postGenerationWebhook({
          generationId,
          status: "succeeded",
          videoUrl: result.videoUrl,
          durationSeconds: result.durationSeconds,
        });
      } catch (e) {
        // Name the URL, so a run lost to an unreachable webhook can be reconciled by hand.
        throw new PaidResultError(
          `Video generated but the webhook at ${webhookUrl} was unreachable — ` +
            `videoUrl=${result.videoUrl}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      if (!res.ok) {
        throw new PaidResultError(
          `Video generated but the webhook rejected it (${res.status}) — videoUrl=${result.videoUrl}`,
        );
      }
```

- [ ] **Step 3: Report only a final failure, and never retry a paid one** — replace the outer `catch (e) { … }` block with:

```ts
    } catch (e) {
      const error = e instanceof Error ? e.message : "Video generation failed";
      const stack = e instanceof Error ? e.stack : undefined;
      const final = isFinalAttempt(ctx.attempt.number, MAX_ATTEMPTS, e);
      logger.error("Video generation failed", { generationId, modelId, error, stack, attempt: ctx.attempt.number, final });

      // Only a final failure is reported: reporting refunds and closes the generation, so a retry's
      // result would be discarded. Safely: this is the ONLY record of why it failed.
      if (final) {
        await postGenerationWebhookSafely({ generationId, status: "failed", error }, "failure report");
      }
      // A paid result is never retried. Otherwise rethrow, so the run is marked failed with the
      // REAL reason (swallowing it made a failed generation show as a successful run).
      if (e instanceof PaidResultError) throw new AbortTaskRunError(error);
      throw e instanceof Error ? e : new Error(error);
    }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p .` — Expected: exit 0.
Run: `npx vitest run src/lib/generations` — Expected: PASS (the rule itself is covered by `task-failure.test.ts`).
Run: `npx eslint trigger/video-generate.ts` — Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add trigger/video-generate.ts
git commit -m "fix(video-gen): never discard or re-pay a video after a failure (D366)

The task reported failed on every attempt and then retried, so a retry that succeeded was
paid for and dropped by the webhook's duplicate guard; and an unreachable webhook after a
successful call was reported as failed and retried, paying for the video again. Video jobs
are billed when submitted, so the task now takes no automatic retry, and a failure after
the provider returned is never retried.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Deployment note** — deploy the Trigger.dev tasks (`video-generate` and the new `image-generate`) together.
