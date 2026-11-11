# Video Gen Edit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An **Edit** switch beside **Edit voice** on the Video Gen focus view that sends the active take, an instruction and chosen reference images to Gemini Omni (`task: "edit"`) and appends the result as a new version.

**Architecture:** A new route `POST /api/nodes/[id]/video-edit` validates the take and references, records a `video` generation with an `inputs_snapshot.videoEdit` record, reserves credits and triggers the existing `video-generate` task with a new `editVideoUrl` field. The Omni provider sees `editVideoUrl` and sends an edit request; the rest (file wait, download, storage, version, settlement) stays on the existing `completeGeneration` path. The client gets a service + TanStack mutation and a centre-column panel that reuses Image Gen's reference tiles.

**Tech Stack:** Next.js route handlers, Zod, Trigger.dev v3, Gemini Interactions API, TanStack Query v5, shadcn (Base UI) primitives, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-video-edit-mode-design.md` (D483).

## Global Constraints

- Controls are shadcn primitives from `src/components/ui/*` only. No raw `<button>`, `<textarea>`, `<input>`.
- Routes use `apiError` / `apiOk` / `withNode` / `withTryCatch` from `src/lib/api/route-helpers.ts`.
- Browser calls go service → `src/hooks/queries/*` mutation → component. No `fetch` in components or hooks.
- No per-node network calls on mount (performance rule 1). The panel reads what the focus view already has.
- IDs from the client are checked (rule 14): every `referenceNodeIds` entry must be a connected image of this node.
- Paid work never retries after the provider has returned (rule 12): `video-generate` keeps `MAX_ATTEMPTS = 1`.
- User-facing copy is plain: no vendor names, no raw errors, no em-dash phrasing.
- Refused message, verbatim: `This edit can't be made. Takes with children, or changing one person into another, are refused.`
- Limits line, verbatim: `The edit keeps the take's length and shape. It works best on a single continuous shot. Captions on the video may change.`
- Placeholder, verbatim: `Describe what to change and where: remove the cups… · replace the pot with the product reference… · make the light warmer…`
- Max take length: 10 seconds. Resolutions: `360p`, `720p`, `1080p`, `4k`; default `720p`.
- Commit messages carry no AI attribution of any kind.
- Run tests per file (`npx vitest run <path>`); the full run has known timeout flakes.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/video-edit/record.ts` (new) | Constants, `VideoEditRecord` type, `readVideoEdit`, `videoEditEstimateCredits`, `videoEditGate`. Client-safe. |
| `src/lib/video-edit/prompt.ts` (new) | `composeVideoEditPrompt`. Client-safe. |
| `src/lib/video-edit/describe.ts` (new) | `describeVideoEdit` for History. Client-safe. |
| `src/lib/video-edit/__tests__/*.test.ts` (new) | Unit tests for the three files above. |
| `src/lib/video-gen/types.ts` (modify) | `VideoGenInput.editVideoUrl`. |
| `src/lib/video-gen/providers/gemini-omni.ts` (modify) | `buildOmniEditRequestBody`, `omniRefusalMessage`, edit branch in `generateWithOmni`. |
| `src/lib/video-gen/__tests__/gemini-omni-edit.test.ts` (new) | Tests for the two pure functions. |
| `trigger/video-generate.ts` (modify) | Pass `editVideoUrl` through. |
| `src/lib/video-gen/connected-images.ts` (new) | `collectConnectedUpstream`, shared by `upstream-images` and `video-edit` routes. |
| `src/app/api/nodes/[id]/upstream-images/route.ts` (modify) | Use the collector. |
| `src/app/api/nodes/[id]/video-edit/route.ts` + `route.test.ts` (new) | The edit route. |
| `src/services/node-generation.service.ts` (modify) | `startVideoEdit`. |
| `src/hooks/queries/node-generation.ts` (modify) | `useStartVideoEdit`. |
| `src/lib/canvas-nodes.ts` (modify) | `VideoGenNodeData.videoEdit`. |
| `src/components/nodes/video-gen-change-voice-toggle.tsx` (modify) | `label` prop, so it serves both switches. |
| `src/components/nodes/video-gen-edit-video.tsx` (new) | The centre-column Edit panel. |
| `src/components/nodes/video-gen-focus-view.tsx` (modify) | State, exclusive switches, panel mount. |
| `src/components/nodes/video-gen-node.tsx` (modify) | Pass `videoEdit` into the focus view. |
| `src/components/nodes/video-gen-version-history.tsx` (modify) | Show an edited version's provenance. |

---

### Task 1: Video edit record, prompt and description (client-safe lib)

**Files:**
- Create: `src/lib/video-edit/record.ts`
- Create: `src/lib/video-edit/prompt.ts`
- Create: `src/lib/video-edit/describe.ts`
- Test: `src/lib/video-edit/__tests__/record.test.ts`, `src/lib/video-edit/__tests__/prompt.test.ts`, `src/lib/video-edit/__tests__/describe.test.ts`

**Interfaces:**
- Consumes: `computeVideoCost(modelId, seconds, audioEnabled, resolution)` from `@/lib/video-gen/cost`; `usdToFinalCredits(usd)` from `@/lib/credits/units`; `GEMINI_OMNI_MODEL_ID` from `@/lib/video-gen/client-models`.
- Produces:
  - `VIDEO_EDIT_RESOLUTIONS: readonly ["360p","720p","1080p","4k"]`, `type VideoEditResolution`
  - `VIDEO_EDIT_DEFAULT_RESOLUTION: "720p"`, `VIDEO_EDIT_MAX_SECONDS = 10`
  - `VIDEO_EDIT_REFUSED_MESSAGE: string`, `VIDEO_EDIT_LIMITS_NOTE: string`
  - `type VideoEditRecord = { baseVersionId; rootVersionId; instruction; editPrompt; referenceNodeIds: string[]; referenceUrls: string[]; resolution: VideoEditResolution }`
  - `type VideoEditNodeState = { instruction: string; referenceNodeIds: string[] | null; resolution: VideoEditResolution }`
  - `readVideoEdit(value: unknown): VideoEditRecord | null`
  - `videoEditEstimateCredits(durationSeconds: number, resolution: VideoEditResolution): number`
  - `videoEditGate(a: { sourceId: string | null; instruction: string; durationSeconds: number; running: boolean; locked: string | null; submitting: boolean }): { ok: true } | { ok: false; reason: string }`
  - `composeVideoEditPrompt(a: { instruction: string; references: { label: string }[] }): string`
  - `describeVideoEdit(inputsUsed: Record<string, unknown> | undefined, labelById: Map<string, string>): { title: string; detail: string } | null`

- [ ] **Step 1: Write the failing tests**

`src/lib/video-edit/__tests__/record.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";
import { readVideoEdit, videoEditEstimateCredits, videoEditGate, VIDEO_EDIT_MAX_SECONDS } from "../record";

const RECORD = {
  baseVersionId: "v3", rootVersionId: "v1", instruction: "make the flour beige", editPrompt: "make the flour beige\n\nKeep…",
  referenceNodeIds: ["n-pack"], referenceUrls: ["https://storage.googleapis.com/b/pack.jpg"], resolution: "720p",
};

describe("readVideoEdit", () => {
  it("reads a complete record", () => {
    expect(readVideoEdit(RECORD)).toEqual(RECORD);
  });
  it("returns null for anything incomplete or malformed", () => {
    expect(readVideoEdit(null)).toBeNull();
    expect(readVideoEdit({ ...RECORD, baseVersionId: 3 })).toBeNull();
    expect(readVideoEdit({ ...RECORD, resolution: "8k" })).toBeNull();
    expect(readVideoEdit({ ...RECORD, referenceUrls: "x" })).toBeNull();
  });
});

describe("videoEditEstimateCredits", () => {
  it("prices the take at Omni's rate for the resolution", () => {
    expect(videoEditEstimateCredits(6, "720p")).toBe(usdToFinalCredits(computeVideoCost(GEMINI_OMNI_MODEL_ID, 6, true, "720p")!.usd));
    expect(videoEditEstimateCredits(6, "4k")).toBeGreaterThan(videoEditEstimateCredits(6, "720p"));
  });
});

describe("videoEditGate", () => {
  const ok = { sourceId: "v3", instruction: "make it red", durationSeconds: 6, running: false, locked: null, submitting: false };
  it("allows a finished take with an instruction", () => {
    expect(videoEditGate(ok)).toEqual({ ok: true });
  });
  it("names the first thing in the way", () => {
    expect(videoEditGate({ ...ok, locked: "In the Editor" })).toEqual({ ok: false, reason: "In the Editor" });
    expect(videoEditGate({ ...ok, sourceId: null })).toEqual({ ok: false, reason: "Generate a take first." });
    expect(videoEditGate({ ...ok, running: true })).toEqual({ ok: false, reason: "Wait for the current job to finish." });
    expect(videoEditGate({ ...ok, instruction: "   " })).toEqual({ ok: false, reason: "Describe the change first." });
    expect(videoEditGate({ ...ok, durationSeconds: VIDEO_EDIT_MAX_SECONDS + 1 })).toEqual({ ok: false, reason: "Edits work on takes up to 10 seconds." });
    expect(videoEditGate({ ...ok, submitting: true })).toEqual({ ok: false, reason: "Starting…" });
  });
});
```

`src/lib/video-edit/__tests__/prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { composeVideoEditPrompt } from "../prompt";

describe("composeVideoEditPrompt", () => {
  it("adds the keep-everything-else line after the instruction", () => {
    const text = composeVideoEditPrompt({ instruction: "  Make the flour beige.  ", references: [] });
    expect(text.startsWith("Make the flour beige.\n\n")).toBe(true);
    expect(text).toContain("Change only what is described above.");
    expect(text).not.toContain("IMAGE_REF");
  });
  it("names each reference by its position, in order", () => {
    const text = composeVideoEditPrompt({ instruction: "Swap the pack.", references: [{ label: "Jackfruit 365 pack" }, { label: "Neha, front" }] });
    expect(text).toContain("<IMAGE_REF_0> is Jackfruit 365 pack.");
    expect(text).toContain("<IMAGE_REF_1> is Neha, front.");
    expect(text.indexOf("<IMAGE_REF_0>")).toBeLessThan(text.indexOf("<IMAGE_REF_1>"));
  });
});
```

`src/lib/video-edit/__tests__/describe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { describeVideoEdit } from "../describe";

const inputsUsed = {
  videoEdit: {
    baseVersionId: "v3", rootVersionId: "v1", instruction: "Make the flour beige", editPrompt: "…",
    referenceNodeIds: ["a", "b"], referenceUrls: ["u1", "u2"], resolution: "1080p",
  },
};

describe("describeVideoEdit", () => {
  it("titles an edited version and says what it came from", () => {
    expect(describeVideoEdit(inputsUsed, new Map([["v3", "v3"]]))).toEqual({
      title: "Edit: Make the flour beige",
      detail: "edited from v3 · 2 references · 1080p",
    });
  });
  it("is null for a version that isn't an edit", () => {
    expect(describeVideoEdit({ prompt: "p" }, new Map())).toBeNull();
    expect(describeVideoEdit(undefined, new Map())).toBeNull();
  });
  it("falls back when the base version is gone and has one reference", () => {
    const one = { videoEdit: { ...inputsUsed.videoEdit, referenceNodeIds: ["a"], referenceUrls: ["u1"] } };
    expect(describeVideoEdit(one, new Map())?.detail).toBe("edited from an earlier version · 1 reference · 1080p");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/video-edit`
Expected: FAIL, cannot resolve `../record`, `../prompt`, `../describe`.

- [ ] **Step 3: Implement**

`src/lib/video-edit/record.ts`:

```ts
// D483 — Video Gen's Edit mode. Client-safe: the focus view, History and the route all read this.
import { computeVideoCost } from "@/lib/video-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

export const VIDEO_EDIT_RESOLUTIONS = ["360p", "720p", "1080p", "4k"] as const;
export type VideoEditResolution = (typeof VIDEO_EDIT_RESOLUTIONS)[number];
export const VIDEO_EDIT_DEFAULT_RESOLUTION: VideoEditResolution = "720p";

/** Omni's generation maximum. Edits were tested on 3–6 s takes; longer ones are untested. */
export const VIDEO_EDIT_MAX_SECONDS = 10;

export const VIDEO_EDIT_REFUSED_MESSAGE =
  "This edit can't be made. Takes with children, or changing one person into another, are refused.";
export const VIDEO_EDIT_LIMITS_NOTE =
  "The edit keeps the take's length and shape. It works best on a single continuous shot. Captions on the video may change.";

/** Stored on `generations.inputs_snapshot.videoEdit`, carried onto the version's `inputs_used`. */
export type VideoEditRecord = {
  baseVersionId: string;
  rootVersionId: string;
  instruction: string;
  editPrompt: string;
  referenceNodeIds: string[];
  referenceUrls: string[];
  resolution: VideoEditResolution;
};

/** The panel's last choice, kept on the node (`nodes.data.videoEdit`). null ids = use the take's own. */
export type VideoEditNodeState = {
  instruction: string;
  referenceNodeIds: string[] | null;
  resolution: VideoEditResolution;
};

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

export function readVideoEdit(value: unknown): VideoEditRecord | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object") return null;
  const keys = ["baseVersionId", "rootVersionId", "instruction", "editPrompt"] as const;
  if (!keys.every((k) => typeof v[k] === "string")) return null;
  if (!isStrings(v.referenceNodeIds) || !isStrings(v.referenceUrls)) return null;
  if (!VIDEO_EDIT_RESOLUTIONS.includes(v.resolution as VideoEditResolution)) return null;
  return {
    baseVersionId: v.baseVersionId as string,
    rootVersionId: v.rootVersionId as string,
    instruction: v.instruction as string,
    editPrompt: v.editPrompt as string,
    referenceNodeIds: v.referenceNodeIds,
    referenceUrls: v.referenceUrls,
    resolution: v.resolution as VideoEditResolution,
  };
}

/** The one price both the panel's estimate and the route's reservation use. */
export function videoEditEstimateCredits(durationSeconds: number, resolution: VideoEditResolution): number {
  const cost = computeVideoCost(GEMINI_OMNI_MODEL_ID, durationSeconds, true, resolution);
  return cost ? usdToFinalCredits(cost.usd) : 0;
}

export function videoEditGate(a: {
  sourceId: string | null;
  instruction: string;
  durationSeconds: number;
  running: boolean;
  locked: string | null;
  submitting: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (a.locked) return { ok: false, reason: a.locked };
  if (!a.sourceId) return { ok: false, reason: "Generate a take first." };
  if (a.running) return { ok: false, reason: "Wait for the current job to finish." };
  if (!a.instruction.trim()) return { ok: false, reason: "Describe the change first." };
  if (a.durationSeconds > VIDEO_EDIT_MAX_SECONDS) return { ok: false, reason: "Edits work on takes up to 10 seconds." };
  if (a.submitting) return { ok: false, reason: "Starting…" };
  return { ok: true };
}
```

`src/lib/video-edit/prompt.ts`:

```ts
// D483 — what Omni's edit task is sent. References are addressed as <IMAGE_REF_n>, in the order
// the image parts follow the video in the request (verified on the live API, November 2026).
const KEEP_LINE =
  "Change only what is described above. Keep everything else exactly as it is: the people, their faces and clothes, the products, the setting, the lighting, the camera movement and the timing.";

export function composeVideoEditPrompt(a: { instruction: string; references: { label: string }[] }): string {
  const parts = [a.instruction.trim()];
  if (a.references.length > 0) {
    parts.push(a.references.map((r, i) => `<IMAGE_REF_${i}> is ${r.label}.`).join(" "));
  }
  parts.push(KEEP_LINE);
  return parts.join("\n\n");
}
```

`src/lib/video-edit/describe.ts`:

```ts
import { readVideoEdit } from "./record";

// D483 — an edited version's provenance for History, as describeVoiceChange does for D284.
export function describeVideoEdit(
  inputsUsed: Record<string, unknown> | undefined,
  labelById: Map<string, string>,
): { title: string; detail: string } | null {
  const ve = readVideoEdit(inputsUsed?.videoEdit);
  if (!ve) return null;
  const refs = ve.referenceUrls.length;
  return {
    title: `Edit: ${ve.instruction}`,
    detail: [
      `edited from ${labelById.get(ve.baseVersionId) ?? "an earlier version"}`,
      `${refs} ${refs === 1 ? "reference" : "references"}`,
      ve.resolution,
    ].join(" · "),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/video-edit`
Expected: PASS (3 files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-edit
git commit -m "feat(video-edit): edit record, prompt and history description (D483)"
```

---

### Task 2: Omni edit request in the provider and the task

**Files:**
- Modify: `src/lib/video-gen/types.ts` (`VideoGenInput`)
- Modify: `src/lib/video-gen/providers/gemini-omni.ts`
- Modify: `trigger/video-generate.ts`
- Test: `src/lib/video-gen/__tests__/gemini-omni-edit.test.ts`

**Interfaces:**
- Consumes: `VIDEO_EDIT_REFUSED_MESSAGE` from `@/lib/video-edit/record`.
- Produces:
  - `VideoGenInput.editVideoUrl?: string`
  - `buildOmniEditRequestBody(a: { text: string; videoPart: { data: string; mime_type: string }; imageParts: Array<Record<string, unknown>>; resolution: string }): Record<string, unknown>`
  - `omniRefusalMessage(raw: string): string | null`
  - `video-generate` payload accepts `editVideoUrl?: string`; with it, `params.durationSeconds` is the take's length.

- [ ] **Step 1: Write the failing test**

`src/lib/video-gen/__tests__/gemini-omni-edit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildOmniEditRequestBody, omniRefusalMessage } from "../providers/gemini-omni";
import { VIDEO_EDIT_REFUSED_MESSAGE } from "@/lib/video-edit/record";

describe("buildOmniEditRequestBody", () => {
  const body = buildOmniEditRequestBody({
    text: "Make the flour beige.",
    videoPart: { data: "VID", mime_type: "video/mp4" },
    imageParts: [{ type: "image", data: "IMG0", mime_type: "image/jpeg" }],
    resolution: "1080p",
  });

  it("sends text, then the video, then the references, in that order", () => {
    expect(body.input).toEqual([
      { type: "text", text: "Make the flour beige." },
      { type: "video", data: "VID", mime_type: "video/mp4" },
      { type: "image", data: "IMG0", mime_type: "image/jpeg" },
    ]);
  });

  it("asks for an edit and sends no duration or aspect ratio (the API rejects them)", () => {
    expect(body.generation_config).toEqual({ video_config: { task: "edit" } });
    expect(body.response_format).toEqual({ type: "video", resolution: "1080p", delivery: "uri" });
    expect(body.store).toBe(true);
    expect(body.background).toBe(false);
  });

  it("falls back to 720p for an unknown resolution", () => {
    const b = buildOmniEditRequestBody({ text: "x", videoPart: { data: "V", mime_type: "video/mp4" }, imageParts: [], resolution: "8k" });
    expect((b.response_format as { resolution: string }).resolution).toBe("720p");
  });
});

describe("omniRefusalMessage", () => {
  it("maps a policy refusal to the plain message", () => {
    expect(omniRefusalMessage('{"error":{"message":"Request blocked: inputs containing photorealistic children"}}')).toBe(VIDEO_EDIT_REFUSED_MESSAGE);
    expect(omniRefusalMessage("The request was blocked by safety filters")).toBe(VIDEO_EDIT_REFUSED_MESSAGE);
    expect(omniRefusalMessage("violates our usage policy")).toBe(VIDEO_EDIT_REFUSED_MESSAGE);
  });
  it("leaves other failures alone", () => {
    expect(omniRefusalMessage("Internal error (500)")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/video-gen/__tests__/gemini-omni-edit.test.ts`
Expected: FAIL, `buildOmniEditRequestBody` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/video-gen/types.ts`, add to `VideoGenInput` after `referenceAudioUrl`:

```ts
  /**
   * D483 — edit this stored take instead of generating. Gemini Omni only; the output has the
   * take's length and shape, and `params.durationSeconds` carries that length for costing.
   */
  editVideoUrl?: string;
```

In `src/lib/video-gen/providers/gemini-omni.ts`, add the import at the top:

```ts
import { VIDEO_EDIT_REFUSED_MESSAGE } from "@/lib/video-edit/record";
```

Add after `buildOmniRequestBody`:

```ts
/**
 * D483 — the edit request. Verified on the live API, November 2026: text first, then the video,
 * then reference images (addressed as <IMAGE_REF_n> in that order). `duration` and `aspect_ratio`
 * are rejected for `task: "edit"`; the output keeps the input's length and shape.
 */
export function buildOmniEditRequestBody(a: {
  text: string;
  videoPart: { data: string; mime_type: string };
  imageParts: Array<Record<string, unknown>>;
  resolution: string;
}): Record<string, unknown> {
  return {
    model: OMNI_MODEL,
    input: [{ type: "text", text: a.text }, { type: "video", ...a.videoPart }, ...a.imageParts],
    generation_config: { video_config: { task: "edit" } },
    response_format: {
      type: "video",
      resolution: VALID_RESOLUTIONS.includes(a.resolution) ? a.resolution : "720p",
      delivery: "uri",
    },
    store: true,
    background: false,
    stream: false,
  };
}

/** A refusal is decided before anything renders. The operator sees plain words; the raw text is logged. */
export function omniRefusalMessage(raw: string): string | null {
  // Observed on the live API: {"error":{"code":"content_blocked","message":"Input blocked: …"}}.
  return /content_blocked|photorealistic children|blocked|safety|usage policy|prohibited/i.test(raw) ? VIDEO_EDIT_REFUSED_MESSAGE : null;
}

async function editWithOmni(input: VideoGenInput & { editVideoUrl: string }): Promise<VideoGenResult> {
  const durationSeconds = Number(input.params.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Edit has no recorded take length");

  const [video, ...images] = await Promise.all([
    fetchAsBase64(input.editVideoUrl),
    ...input.referenceUrls.map((url) => fetchAsBase64(url)),
  ]);
  const body = JSON.stringify(
    buildOmniEditRequestBody({
      text: input.prompt,
      videoPart: { data: video.imageBytes, mime_type: video.mimeType },
      imageParts: images.map((img) => ({ type: "image", data: img.imageBytes, mime_type: img.mimeType })),
      resolution: String(input.params.resolution ?? "720p"),
    }),
  );
  logger.info("Omni edit request", {
    images: images.length,
    resolution: String(input.params.resolution ?? "720p"),
    durationSeconds,
    bodyKB: Math.round(Buffer.byteLength(body) / 1024),
  });

  const res = await fetchOrThrow("Omni edit", `${API_BASE}/interactions`, {
    method: "POST",
    headers: { "x-goog-api-key": getApiKey(), "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(OMNI_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error("Omni edit refused or failed", { status: res.status, body: text.slice(0, 2000) });
    throw new Error(omniRefusalMessage(text) ?? `Omni edit failed (${res.status})`);
  }

  const interaction = (await res.json()) as OmniInteraction;
  logger.info("Omni edit interaction", { id: interaction.id, status: interaction.status });
  if (interaction.status === "failed") {
    const message = interaction.error?.message ?? "unknown error";
    logger.error("Omni edit failed", { message });
    throw new Error(omniRefusalMessage(message) ?? "The edit didn't finish. Try again.");
  }

  const videoUrl = extractOmniVideoUri(interaction);
  if (!videoUrl) throw new Error("Omni edit completed but returned no video URI");
  const fileName = fileNameFromUri(videoUrl);
  if (fileName) await waitForFileReady(fileName);
  return { videoUrl, durationSeconds };
}
```

At the top of `generateWithOmni`, before the D207 check:

```ts
  if (input.editVideoUrl) return editWithOmni({ ...input, editVideoUrl: input.editVideoUrl });
```

In `trigger/video-generate.ts`, add to the payload type after `referenceAudioUrl`:

```ts
    /** D483 — edit this stored take instead of generating (Gemini Omni). */
    editVideoUrl?: string;
```

and in the `config.generate({...})` call add:

```ts
        editVideoUrl: payload.editVideoUrl,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/video-gen/__tests__/gemini-omni-edit.test.ts src/lib/video-gen/__tests__/gemini-omni-request.test.ts`
Expected: PASS. Then `npx tsc --noEmit -p .` shows no new errors in the touched files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/types.ts src/lib/video-gen/providers/gemini-omni.ts trigger/video-generate.ts src/lib/video-gen/__tests__/gemini-omni-edit.test.ts
git commit -m "feat(video-edit): Omni edit request through the video-generate task (D483)"
```

---

### Task 3: Shared connected-upstream collector

**Files:**
- Create: `src/lib/video-gen/connected-images.ts`
- Modify: `src/app/api/nodes/[id]/upstream-images/route.ts` (the block from `const direct = …` to `const images = …`)

**Interfaces:**
- Consumes: `getUpstreamOutputs`, `getPromptUpstream`, `withAvatarImages`, `withScriptAssetImages`, `upstreamImageOf` (all existing).
- Produces:
  - `collectConnectedUpstream(nodeId: string, nodeType: string): Promise<{ direct: UpstreamOutput[]; promptNodes: UpstreamOutput[]; promptUpstreamBatches: UpstreamOutput[][]; images: UpstreamImage[] }>`
  - `UpstreamOutput` is the element type of `getUpstreamOutputs`' result (import it from `@/lib/db/nodes`; if it isn't exported there, add `export` to its declaration).

- [ ] **Step 1: Create the collector, moving the route's code unchanged**

`src/lib/video-gen/connected-images.ts`:

```ts
import "server-only";
import { getUpstreamOutputs, type UpstreamOutput } from "@/lib/db/nodes";
import { getPromptUpstream, withAvatarImages } from "@/lib/avatars/presenter-server";
import { withScriptAssetImages } from "@/lib/scripts/asset-nodes";
import { upstreamImageOf } from "./upstream-image";

/**
 * What a Video Gen (or Image Gen) node has wired in: its direct inputs, the prompt nodes among
 * them and their own inputs, and every ready image across both levels. Shared by the
 * upstream-images route (what the view shows) and the video-edit route (D483: which references
 * the caller may send), so the two never disagree about what is connected.
 */
export async function collectConnectedUpstream(nodeId: string, nodeType: string) {
  // D436 — an Avatar wired straight in is its images, as on the generate routes.
  const direct = withScriptAssetImages(await withAvatarImages(nodeId, await getUpstreamOutputs(nodeId)));
  // Also collect upstream of any prompt nodes (2-level traversal), as image-generate and
  // video-generate send it.
  const promptNodes = direct.filter((u) =>
    nodeType === "image-gen" ? u.type === "prompt" : u.type === "video-prompt" || u.type === "multishot-prompt",
  );
  const promptUpstreamBatches = await Promise.all(promptNodes.map((u) => getPromptUpstream(u.nodeId)));
  // Merge and deduplicate; direct edges take precedence.
  const seen = new Map<string, UpstreamOutput>(direct.map((u) => [u.nodeId, u]));
  for (const batch of promptUpstreamBatches) {
    for (const u of batch) if (!seen.has(u.nodeId)) seen.set(u.nodeId, u);
  }
  // D440 — a generated image counts when wired straight in or into the prompt node.
  const images = Array.from(seen.values()).flatMap((u) => {
    const image = upstreamImageOf(u);
    return image ? [image] : [];
  });
  return { direct, promptNodes, promptUpstreamBatches, images };
}
```

- [ ] **Step 2: Use it in the upstream-images route**

In `src/app/api/nodes/[id]/upstream-images/route.ts`, replace everything from `// D436 — an Avatar wired straight in…` through the end of the `const images = allUpstream.flatMap(…);` statement with:

```ts
      const { direct, promptNodes, promptUpstreamBatches, images } = await collectConnectedUpstream(nodeId, node.type);
```

Add `import { collectConnectedUpstream } from "@/lib/video-gen/connected-images";` and delete imports that are now unused (`getUpstreamOutputs`, `withAvatarImages`, `withScriptAssetImages`, `upstreamImageOf`; keep `getPromptUpstream` and `scriptAssetIds` only if still referenced further down; let the linter decide). If anything below the replaced block reads `allUpstream`, replace it with `[...direct, ...promptUpstreamBatches.flat()]`.

- [ ] **Step 3: Verify nothing changed**

Run: `npx tsc --noEmit -p .` (no new errors) and `npx eslint src/app/api/nodes/[id]/upstream-images/route.ts src/lib/video-gen/connected-images.ts`.
Run: `npx vitest run src/app/api/nodes src/lib/video-gen` and expect the same pass count as before the change.

- [ ] **Step 4: Commit**

```bash
git add src/lib/video-gen/connected-images.ts "src/app/api/nodes/[id]/upstream-images/route.ts" src/lib/db/nodes.ts
git commit -m "refactor(video-gen): share the connected-upstream collector"
```

---

### Task 4: The video-edit route

**Files:**
- Create: `src/app/api/nodes/[id]/video-edit/route.ts`
- Test: `src/app/api/nodes/[id]/video-edit/route.test.ts`

**Interfaces:**
- Consumes: Task 1 (`VIDEO_EDIT_RESOLUTIONS`, `VIDEO_EDIT_MAX_SECONDS`, `readVideoEdit`, `videoEditEstimateCredits`, `composeVideoEditPrompt`, `VideoEditRecord`), Task 3 (`collectConnectedUpstream`), `GEMINI_OMNI_IMAGE_INPUTS.maxReferenceImages`, `editorLockResponse`, `getVersionById`, `insertGeneration`, `failGeneration`, `hasRunningGeneration`, `reserveCredits`, `refundReservation`, `CreditLimitError`, `isOwnStoredUrl`, `durationOfParams`.
- Produces: `POST /api/nodes/:id/video-edit`, body `{ baseVersionId: string; instruction: string; referenceNodeIds: string[]; resolution: VideoEditResolution; mock?: boolean }` → `202 { generationId }`.

- [ ] **Step 1: Write the failing test**

`src/app/api/nodes/[id]/video-edit/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { videoEditEstimateCredits } from "@/lib/video-edit/record";

vi.mock("server-only", () => ({}));
const editorLock = vi.hoisted(() => ({ value: null as null | "editor" | "dub" }));
vi.mock("@/lib/db/generation-lock", () => ({ getEditorGenerationLock: async () => editorLock.value }));
const mocks = vi.hoisted(() => ({
  node: { type: "video-gen", canvas_id: "c1" } as Record<string, unknown>,
  getVersionById: vi.fn(),
  hasRunning: vi.fn(async () => false),
  collect: vi.fn(),
  insertGeneration: vi.fn(async () => ({ id: "gen-7" })),
  failGeneration: vi.fn(async () => undefined),
  reserveCredits: vi.fn(async () => ({ ok: true })),
  refundReservation: vi.fn(async () => undefined),
  trigger: vi.fn(async () => ({ id: "run" })),
}));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return { ...actual, withNode: (_r: Request, _p: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("n1", mocks.node, { userId: "u1", email: "u@x.com" }, "client-1", "org-1") };
});
vi.mock("@/lib/db/versions", () => ({ getVersionById: mocks.getVersionById }));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: mocks.insertGeneration, failGeneration: mocks.failGeneration, hasRunningGeneration: mocks.hasRunning }));
vi.mock("@/lib/db/credit-transactions", () => ({ reserveCredits: mocks.reserveCredits, refundReservation: mocks.refundReservation, CreditLimitError: class extends Error {} }));
vi.mock("@/lib/video-gen/connected-images", () => ({ collectConnectedUpstream: mocks.collect }));
vi.mock("@/lib/storage", () => ({ isOwnStoredUrl: (u: string) => u.startsWith("https://storage.googleapis.com/") }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: mocks.trigger } }));

import { POST } from "./route";

const TAKE = "https://storage.googleapis.com/b/v3.mp4";
const PACK = { id: "n-pack", type: "file", imageUrl: "https://storage.googleapis.com/b/pack.jpg", filename: "Jackfruit 365 pack" };
const BASE = { id: "v3", node_id: "n1", output: TAKE, error: null, params_used: { durationSeconds: 6 }, inputs_used: { prompt: "p" } };
const BODY = { baseVersionId: "v3", instruction: "Make the flour beige", referenceNodeIds: ["n-pack"], resolution: "720p" };
const post = (body: unknown) => POST(new Request("http://x/api/nodes/n1/video-edit", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "n1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  editorLock.value = null;
  mocks.node = { type: "video-gen", canvas_id: "c1" };
  process.env.GOOGLE_GENAI_API_KEY = "k";
  mocks.getVersionById.mockResolvedValue(BASE);
  mocks.collect.mockResolvedValue({ direct: [], promptNodes: [], promptUpstreamBatches: [], images: [PACK] });
});

describe("POST /api/nodes/[id]/video-edit", () => {
  it("records a video generation with the edit, reserves Omni credits and triggers video-generate", async () => {
    const res = await post(BODY);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ generationId: "gen-7" });
    const call = (mocks.insertGeneration.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(call).toMatchObject({ nodeId: "n1", orgId: "org-1", type: "video", modelUsed: "gemini:gemini-omni-1.1-flash", paramsSnapshot: { resolution: "720p", durationSeconds: 6 } });
    const snapshot = call.inputsSnapshot as Record<string, unknown>;
    expect(snapshot.referenceUrls).toEqual([PACK.imageUrl]);
    expect(snapshot.videoEdit).toMatchObject({ baseVersionId: "v3", rootVersionId: "v3", instruction: "Make the flour beige", referenceNodeIds: ["n-pack"], referenceUrls: [PACK.imageUrl], resolution: "720p" });
    expect(snapshot.prompt).toContain("<IMAGE_REF_0> is Jackfruit 365 pack.");
    expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "gen-7", videoEditEstimateCredits(6, "720p"));
    expect(mocks.trigger).toHaveBeenCalledWith("video-generate", expect.objectContaining({
      generationId: "gen-7", modelId: "gemini:gemini-omni-1.1-flash", editVideoUrl: TAKE,
      referenceUrls: [PACK.imageUrl], params: { resolution: "720p", durationSeconds: 6 }, mockMode: false,
    }));
  });

  it("keeps the root of an edit chain", async () => {
    mocks.getVersionById.mockResolvedValueOnce({ ...BASE, inputs_used: { videoEdit: { baseVersionId: "v2", rootVersionId: "v1", instruction: "i", editPrompt: "e", referenceNodeIds: [], referenceUrls: [], resolution: "720p" } } });
    await post(BODY);
    const call = (mocks.insertGeneration.mock.calls[0] as unknown[])[0] as { inputsSnapshot: { videoEdit: { rootVersionId: string } } };
    expect(call.inputsSnapshot.videoEdit.rootVersionId).toBe("v1");
  });

  it("400s before recording anything on a bad request", async () => {
    expect((await post({ ...BODY, instruction: "  " })).status).toBe(400);
    expect((await post({ ...BODY, resolution: "8k" })).status).toBe(400);
    expect((await post({ ...BODY, referenceNodeIds: ["not-connected"] })).status).toBe(400);
    mocks.getVersionById.mockResolvedValueOnce({ ...BASE, node_id: "other" });
    expect((await post(BODY)).status).toBe(400);
    mocks.getVersionById.mockResolvedValueOnce({ ...BASE, error: "boom" });
    expect((await post(BODY)).status).toBe(400);
    mocks.getVersionById.mockResolvedValueOnce({ ...BASE, params_used: { durationSeconds: 12 } });
    expect((await post(BODY)).status).toBe(400);
    mocks.node = { type: "image-gen", canvas_id: "c1" };
    expect((await post(BODY)).status).toBe(404);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
  });

  it("409s while the node is already working, and refuses a clip in the Editor's reel", async () => {
    mocks.hasRunning.mockResolvedValueOnce(true);
    expect((await post(BODY)).status).toBe(409);
    editorLock.value = "editor";
    expect((await post(BODY)).status).toBe(409);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
  });

  it("fails and refunds if the trigger throws after reserving", async () => {
    mocks.trigger.mockRejectedValueOnce(new Error("trigger down"));
    const res = await post(BODY);
    expect(res.status).toBe(500);
    expect(mocks.failGeneration).toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen-7" });
  });
});
```

Before writing the route, open `src/app/api/nodes/[id]/voice-change/route.test.ts` below its `// D390` line and copy the status it expects from `editorLockResponse` for a locked node. If it is not 409, change the `editorLock` assertion above to that status.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/api/nodes/[id]/video-edit/route.test.ts"`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Implement the route**

`src/app/api/nodes/[id]/video-edit/route.ts`:

```ts
import { z } from "zod";
import { tasks } from "@trigger.dev/sdk/v3";
import { editorLockResponse } from "@/lib/editor/lock-guard";
import { apiError, apiOk, withNode, withTryCatch } from "@/lib/api/route-helpers";
import { getVersionById } from "@/lib/db/versions";
import { insertGeneration, failGeneration, hasRunningGeneration } from "@/lib/db/generations";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { isOwnStoredUrl } from "@/lib/storage";
import { durationOfParams } from "@/lib/voice-change/record";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";
import { GEMINI_OMNI_IMAGE_INPUTS } from "@/lib/video-gen/gemini-omni-shape";
import { collectConnectedUpstream } from "@/lib/video-gen/connected-images";
import { composeVideoEditPrompt } from "@/lib/video-edit/prompt";
import {
  VIDEO_EDIT_MAX_SECONDS,
  VIDEO_EDIT_RESOLUTIONS,
  readVideoEdit,
  videoEditEstimateCredits,
  type VideoEditRecord,
} from "@/lib/video-edit/record";

const BodySchema = z.object({
  baseVersionId: z.string().min(1),
  instruction: z.string().trim().min(1).max(2000),
  referenceNodeIds: z.array(z.string().min(1)).max(GEMINI_OMNI_IMAGE_INPUTS.maxReferenceImages),
  resolution: z.enum(VIDEO_EDIT_RESOLUTIONS),
  mock: z.boolean().optional(),
});

const START_FAILED = "Couldn't start the edit. Try again.";

// D483 — edit a finished take with Gemini Omni. Runs as a `video` generation on the existing
// video-generate task; completeGeneration appends the version and settles credits.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, (nodeId, node, caller, clientId, effectiveOrgId) => {
    return withTryCatch(START_FAILED, async () => {
      if (node.type !== "video-gen") return apiError("Node not found.", 404);
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Describe the change and pick a resolution.", 400);
      const { baseVersionId, instruction, referenceNodeIds, resolution, mock } = parsed.data;
      if (!process.env.GOOGLE_GENAI_API_KEY) return apiError("Video editing isn't set up yet.", 400);

      // D390 — an edit makes a new take: refused while the clip is in the Editor's reel.
      const [locked, base, running, connected] = await Promise.all([
        editorLockResponse(nodeId),
        getVersionById(baseVersionId),
        hasRunningGeneration(nodeId),
        collectConnectedUpstream(nodeId, node.type),
      ]);
      if (locked) return locked;
      if (running) return apiError("This node is already working. Try again when it finishes.", 409);
      if (!base || base.node_id !== nodeId) return apiError("That version isn't on this node.", 400);
      if (base.error || typeof base.output !== "string" || !isOwnStoredUrl(base.output)) {
        return apiError("Pick a finished take to edit.", 400);
      }
      const durationSeconds = durationOfParams(base.params_used ?? {});
      if (!durationSeconds) return apiError("This take has no recorded length, so it can't be priced.", 400);
      if (durationSeconds > VIDEO_EDIT_MAX_SECONDS) return apiError("Edits work on takes up to 10 seconds.", 400);

      // Rule 14 — every reference must be an image connected to this node.
      const byId = new Map(connected.images.map((img) => [img.id, img]));
      const refs = referenceNodeIds.map((id) => byId.get(id));
      if (refs.some((r) => !r)) return apiError("One of the references is no longer connected. Reopen the node and try again.", 400);
      const references = refs as NonNullable<(typeof refs)[number]>[];

      const editPrompt = composeVideoEditPrompt({
        instruction,
        references: references.map((r) => ({ label: r.filename ?? "a reference image" })),
      });
      const referenceUrls = references.map((r) => r.imageUrl);
      const videoEdit: VideoEditRecord = {
        baseVersionId,
        rootVersionId: readVideoEdit(base.inputs_used?.videoEdit)?.rootVersionId ?? base.id,
        instruction,
        editPrompt,
        referenceNodeIds,
        referenceUrls,
        resolution,
      };
      const editParams = { resolution, durationSeconds };
      const generation = await insertGeneration({
        nodeId,
        orgId: effectiveOrgId,
        clientId,
        userId: caller.userId,
        userEmail: caller.email,
        type: "video",
        modelUsed: GEMINI_OMNI_MODEL_ID,
        paramsSnapshot: editParams,
        inputsSnapshot: { prompt: editPrompt, referenceUrls, videoEdit },
      });

      try {
        const reservation = await reserveCredits(effectiveOrgId, generation.id, videoEditEstimateCredits(durationSeconds, resolution));
        if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");
        await tasks.trigger("video-generate", {
          generationId: generation.id,
          modelId: GEMINI_OMNI_MODEL_ID,
          prompt: editPrompt,
          referenceUrls,
          params: editParams,
          editVideoUrl: base.output,
          mockMode: mock === true,
        });
        return apiOk({ generationId: generation.id }, 202);
      } catch (e) {
        const limit = e instanceof CreditLimitError;
        const message = limit ? (e as Error).message : START_FAILED;
        await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
        await refundReservation({ orgId: effectiveOrgId, generationId: generation.id }).catch(() => null);
        return apiError(message, limit ? 402 : 500);
      }
    });
  });
}
```

If `getVersionById`'s row type names `inputs_used` / `params_used` differently, follow `src/lib/voice-change/source.ts`, which reads the same row.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/app/api/nodes/[id]/video-edit/route.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/nodes/[id]/video-edit"
git commit -m "feat(video-edit): route that starts an Omni edit of a take (D483)"
```

---

### Task 5: Client service, mutation and node data

**Files:**
- Modify: `src/services/node-generation.service.ts`
- Modify: `src/hooks/queries/node-generation.ts`
- Modify: `src/lib/canvas-nodes.ts` (`VideoGenNodeData`)

**Interfaces:**
- Consumes: `VideoEditNodeState`, `VideoEditResolution` (Task 1).
- Produces:
  - `nodeGenerationService.startVideoEdit(nodeId, body: StartVideoEditBody): Promise<StartedGeneration>`
  - `type StartVideoEditBody = { baseVersionId: string; instruction: string; referenceNodeIds: string[]; resolution: VideoEditResolution }`
  - `useStartVideoEdit(nodeId)`: a `useMutation` whose `onSuccess` marks the node as generating (`kind: "video"`).
  - `VideoGenNodeData.videoEdit?: VideoEditNodeState`

- [ ] **Step 1: Add the service method**

In `src/services/node-generation.service.ts` add the import and type:

```ts
import type { VideoEditResolution } from "@/lib/video-edit/record";

/** D483 — edit a finished take. */
export type StartVideoEditBody = {
  baseVersionId: string;
  instruction: string;
  referenceNodeIds: string[];
  resolution: VideoEditResolution;
};
```

and inside `NodeGenerationService`, after `startLipSync`:

```ts
  /** Video Gen (D483): edit the take. Answers once the job is started (202). */
  async startVideoEdit(nodeId: string, body: StartVideoEditBody): Promise<StartedGeneration> {
    return readJson<StartedGeneration>(await post(`/api/nodes/${nodeId}/video-edit`, body), "Couldn't start the edit.");
  }
```

- [ ] **Step 2: Add the mutation**

In `src/hooks/queries/node-generation.ts`, extend the service import with `type StartVideoEditBody` and add after `useStartLipSync`:

```ts
export function useStartVideoEdit(nodeId: string) {
  const markGenerationStarted = useCanvasStore((s) => s.markGenerationStarted);
  return useMutation({
    mutationFn: (body: StartVideoEditBody) => nodeGenerationService.startVideoEdit(nodeId, body),
    onSuccess: (started) => markGenerationStarted(nodeId, "video", started.generationId),
  });
}
```

- [ ] **Step 3: Add the node field**

In `src/lib/canvas-nodes.ts`, add `import type { VideoEditNodeState } from "@/lib/video-edit/record";` and, after `voiceChange` in `VideoGenNodeData`:

```ts
  /** D483 — the Edit panel's last instruction, references and resolution. */
  videoEdit?: VideoEditNodeState;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no new errors. Run `npx vitest run src/services/node-generation.service.test.ts` and expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/node-generation.service.ts src/hooks/queries/node-generation.ts src/lib/canvas-nodes.ts
git commit -m "feat(video-edit): service, mutation and node field (D483)"
```

---

### Task 6: Edit panel, the two switches, and History

**Files:**
- Modify: `src/components/nodes/video-gen-change-voice-toggle.tsx`
- Create: `src/components/nodes/video-gen-edit-video.tsx`
- Modify: `src/components/nodes/video-gen-focus-view.tsx`
- Modify: `src/components/nodes/video-gen-node.tsx` (line ~173, beside `voiceChange={d.voiceChange}`)
- Modify: `src/components/nodes/video-gen-version-history.tsx`

**Interfaces:**
- Consumes: Task 1 (`videoEditGate`, `videoEditEstimateCredits`, `describeVideoEdit`, constants, `VideoEditNodeState`), Task 5 (`useStartVideoEdit`, `startErrorMessage`), existing `ImageGenEditReferences`, `EstimatedCreditsLabel`, `UpstreamImage`, `VideoGenVersionSummary`, `durationOfParams`.
- Produces: `VideoGenEditVideo` component; `VideoGenChangeVoiceToggle` takes `label?: string` (default `"Edit voice"`).

- [ ] **Step 1: Let the toggle carry either label**

In `src/components/nodes/video-gen-change-voice-toggle.tsx`, add `label = "Edit voice"` to the destructured props, `label?: string;` to the prop type, and render `{label}` where the literal `Edit voice` text is. Update the header comment: `// D284 / D483 — "Edit voice" and "Edit", beside the video heading.`

- [ ] **Step 2: Create the panel**

`src/components/nodes/video-gen-edit-video.tsx`:

```tsx
"use client";

import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { durationOfParams } from "@/lib/voice-change/record";
import {
  VIDEO_EDIT_DEFAULT_RESOLUTION,
  VIDEO_EDIT_LIMITS_NOTE,
  VIDEO_EDIT_RESOLUTIONS,
  videoEditEstimateCredits,
  videoEditGate,
  type VideoEditNodeState,
  type VideoEditResolution,
} from "@/lib/video-edit/record";
import type { UpstreamImage } from "@/lib/video-gen/api";
import { useStartVideoEdit, startErrorMessage } from "@/hooks/queries/node-generation";
import { ImageGenEditReferences } from "./image-gen-edit-references";
import { EstimatedCreditsLabel } from "./estimated-credits-label";
import type { VideoGenVersionSummary } from "./video-gen-version-history";

const PLACEHOLDER =
  "Describe what to change and where: remove the cups… · replace the pot with the product reference… · make the light warmer…";

type Props = {
  nodeId: string;
  versions: VideoGenVersionSummary[];
  /** The active take (null if it has no finished video). */
  sourceId: string | null;
  /** The node's connected images, as the focus view already holds them (no fetch here). */
  images: UpstreamImage[];
  running: boolean;
  /** D390 — why the clip can't generate, or null. */
  locked: string | null;
  value: VideoEditNodeState | undefined;
  onChange: (next: VideoEditNodeState) => void;
  /** The job was accepted — the caller marks the node as generating. */
  onStarted: () => void;
};

// D483 — Edit, in the focus view's centre column (where Edit voice sits). The output column keeps
// showing the take being edited.
export function VideoGenEditVideo({ nodeId, versions, sourceId, images, running, locked, value, onChange, onStarted }: Props) {
  const source = versions.find((v) => v.id === sourceId) ?? null;
  // Until the operator picks, the images this take was generated with start checked.
  const usedUrls = new Set([...(source?.inputsUsed?.referenceUrls ?? []), source?.inputsUsed?.startFrameUrl ?? ""]);
  const state: VideoEditNodeState = value ?? {
    instruction: "",
    referenceNodeIds: null,
    resolution: VIDEO_EDIT_DEFAULT_RESOLUTION,
  };
  const selectedIds = (state.referenceNodeIds ?? images.filter((img) => usedUrls.has(img.imageUrl)).map((img) => img.id))
    .filter((id) => images.some((img) => img.id === id));
  const start = useStartVideoEdit(nodeId);

  const duration = durationOfParams(source?.paramsUsed ?? {});
  const credits = duration > 0 ? videoEditEstimateCredits(duration, state.resolution) : null;
  const gate = videoEditGate({ sourceId, instruction: state.instruction, durationSeconds: duration, running, locked, submitting: start.isPending });

  const toggle = (id: string) =>
    onChange({ ...state, referenceNodeIds: selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id] });

  const submit = () => {
    if (!gate.ok || !sourceId) return;
    start.mutate(
      { baseVersionId: sourceId, instruction: state.instruction.trim(), referenceNodeIds: selectedIds, resolution: state.resolution },
      {
        onSuccess: onStarted,
        onError: (e) => toast.error(startErrorMessage(e, "Couldn't start the edit.")),
      },
    );
  };

  return (
    <div className="space-y-5">
      <ImageGenEditReferences
        items={images.map((img) => ({ id: img.id, label: img.filename ?? "Image", url: img.imageUrl, isBase: false }))}
        selectedIds={selectedIds}
        onToggle={toggle}
        onSetBase={() => {}}
        canSetBase={false}
      />
      <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Edit this video</span>
        </div>
        <Textarea
          value={state.instruction}
          onChange={(e) => onChange({ ...state, instruction: e.target.value })}
          placeholder={PLACEHOLDER}
          rows={5}
          disabled={Boolean(locked)}
          className="nodrag resize-none"
        />
        <p className="text-xs text-muted-foreground">{VIDEO_EDIT_LIMITS_NOTE}</p>
        <div className="space-y-2">
          <span className="text-eyebrow text-[0.6rem]! text-muted-foreground">Resolution</span>
          <ToggleGroup
            value={[state.resolution]}
            onValueChange={(next: string[]) => next[0] && onChange({ ...state, resolution: next[0] as VideoEditResolution })}
          >
            {VIDEO_EDIT_RESOLUTIONS.map((r) => (
              <ToggleGroupItem key={r} value={r}>{r}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <Button className="w-full" disabled={!gate.ok} onClick={submit} title={gate.ok ? undefined : gate.reason}>
          {start.isPending || running ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <Sparkles className="size-4" strokeWidth={1.5} />
          )}
          Edit video
          {credits !== null && <EstimatedCreditsLabel credits={credits} />}
        </Button>
        {!gate.ok && !start.isPending && <p className="text-xs text-muted-foreground">{gate.reason}</p>}
      </div>
    </div>
  );
}
```

Before relying on it, open `src/components/ui/toggle-group.tsx` and match its API. If `value`/`onValueChange` take a string rather than an array, use that shape. If `VideoGenVersionInputs` lacks `startFrameUrl` or `referenceUrls`, both exist today (see `video-gen-version-history.tsx:17-27`), so no change is needed.

- [ ] **Step 3: Wire the focus view**

In `src/components/nodes/video-gen-focus-view.tsx`:

1. Imports, beside the change-voice imports (~line 124):

```ts
import { VideoGenEditVideo } from "./video-gen-edit-video";
import type { VideoEditNodeState } from "@/lib/video-edit/record";
```

2. Props type (~line 320, beside `voiceChange?: VoiceChangeNodeState;`): add `videoEdit?: VideoEditNodeState;`. Destructure it (~line 532) as `videoEdit: videoEditProp,`.

3. State (after `const [changeVoiceOpen, setChangeVoiceOpen] = useState(false);`):

```ts
  // D483 — Edit, the other centre-column mode. Never on together with Edit voice.
  const [editVideoOpen, setEditVideoOpen] = useState(false);
```

4. In the `useVersionViewing(…, () => { … })` callback add `setEditVideoOpen(false);`. In the open-reset block (where `setChangeVoiceOpen(isChangingVoice && !requested);` runs) add `setEditVideoOpen(false);`. In the `seenChangingVoice` block, where it calls `setChangeVoiceOpen(true)`, add `setEditVideoOpen(false);`.

5. Centre column: change the generate pane's condition from `{selected === "video" && !changeVoiceOpen && (` to `{selected === "video" && !changeVoiceOpen && !editVideoOpen && (`, and add before it:

```tsx
              {/* D483 — Edit takes over this column, as Edit voice does. */}
              {selected === "video" && editVideoOpen && (
                <div className="px-6 py-5">
                  <VideoGenEditVideo
                    nodeId={nodeId}
                    versions={versions}
                    sourceId={activeVersion?.output && !activeVersion.error ? activeVersion.id : null}
                    images={upstreamImages}
                    running={isGenerating}
                    locked={lockReason}
                    value={videoEditProp}
                    onChange={(next) => onPatch({ videoEdit: next })}
                    onStarted={() => {
                      videoRef.current?.pause();
                      setLastError(null);
                    }}
                  />
                </div>
              )}
```

6. Header switches: replace the single `<VideoGenChangeVoiceToggle … />` branch with both switches:

```tsx
                ) : !loadingVersions && versions.some((v) => v.output && !v.error) && (
                  <div className="flex items-center gap-4">
                    <VideoGenChangeVoiceToggle
                      id={`video-edit-voice-${nodeId}`}
                      checked={changeVoiceOpen}
                      disabled={!editable || Boolean(lockReason) || (isGenerating && !isChangingVoice) || viewing.isViewingOther}
                      onCheckedChange={(next) => {
                        setChangeVoiceOpen(next);
                        if (next) {
                          setEditVideoOpen(false);
                          setSelected("video");
                          setReviewAnnotating(false);
                          setCapturedFrame(null);
                          setOpenTimecode(null);
                        }
                      }}
                    />
                    <VideoGenChangeVoiceToggle
                      id={`video-edit-${nodeId}`}
                      label="Edit"
                      checked={editVideoOpen}
                      disabled={!editable || Boolean(lockReason) || isChangingVoice || viewing.isViewingOther}
                      onCheckedChange={(next) => {
                        setEditVideoOpen(next);
                        if (next) {
                          setChangeVoiceOpen(false);
                          setSelected("video");
                          setReviewAnnotating(false);
                          setCapturedFrame(null);
                          setOpenTimecode(null);
                        }
                      }}
                    />
                  </div>
                )}
```

Keep the existing explanatory comments above the original toggle.

7. In `src/components/nodes/video-gen-node.tsx`, beside `voiceChange={d.voiceChange}` add `videoEdit={d.videoEdit}`.

- [ ] **Step 4: Show edits in History**

In `src/components/nodes/video-gen-version-history.tsx`:
- Add `videoEdit?: unknown;` to `VideoGenVersionInputs` with the comment `// D483 — present on an edited version; read via describeVideoEdit.`
- Import `describeVideoEdit` from `@/lib/video-edit/describe`.
- Replace `const voiceChange = describeVoiceChange(v.inputsUsed, labelById);` with:

```ts
    const voiceChange = describeVoiceChange(v.inputsUsed, labelById) ?? describeVideoEdit(v.inputsUsed, labelById);
```

The existing `summary` / `meta` branches then show an edit's title and detail the same way they show a voice change's.

- [ ] **Step 5: Check it in the running app**

Run `npx tsc --noEmit -p .` and `npx eslint src/components/nodes/video-gen-edit-video.tsx src/components/nodes/video-gen-focus-view.tsx src/components/nodes/video-gen-change-voice-toggle.tsx src/components/nodes/video-gen-version-history.tsx`. Expect no new errors.

Then start the dev server (`npm run dev`) on staging data, open a Video Gen node that has a finished take of 10 s or less, and check:
- "Edit voice" and "Edit" sit side by side; turning one on turns the other off.
- With Edit on, the centre column shows the reference tiles, the box with the placeholder, the limits line, the four resolutions with 720p chosen, and Edit video with an estimate.
- Edit video is disabled with an empty box and shows "Describe the change first."
- Picking an older version in History turns Edit off.
- Send one real edit at 360p (cheapest) on a short take. A new version appears, and History reads "Edit: …".

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/video-gen-change-voice-toggle.tsx src/components/nodes/video-gen-edit-video.tsx src/components/nodes/video-gen-focus-view.tsx src/components/nodes/video-gen-node.tsx src/components/nodes/video-gen-version-history.tsx
git commit -m "feat(video-edit): Edit switch and panel on the Video Gen focus view (D483)"
```

---

## Self-review notes

- Spec §3 layout → Task 6. §4 request → Tasks 1–2. §5 data (video generation, existing task, `inputs_used.videoEdit`, node data, 10 s cap) → Tasks 1, 2, 4, 5. §6 failures (refused, failed, locked, running) → Tasks 2, 4, 6. §7 limits line → Tasks 1, 6. §8 tests → Tasks 1, 2, 4, plus the manual check in Task 6.
- The version that `completeGeneration` appends carries `generation.inputs_snapshot` as `inputs_used`, so `videoEdit` arrives on the version with no change to `complete.ts`. Pricing on settlement uses `computeVideoCost(model_used, durationSeconds, audio, params.resolution)`, the same function as the reservation.
