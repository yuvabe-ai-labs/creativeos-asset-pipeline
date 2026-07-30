# Video Provider Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prune the video roster to Veo ×3 + Kling 3.0, make camera a uniform text-in-prompt control for both providers, and remove the Kling `camera_control` path (reverting D77's camera divergence).

**Architecture:** Camera is authored on the Video Prompt node as text (via the existing `CameraSelect` grid) for **every** provider, because Kling 3.0 has no `camera_control` (capability map) and both vendors' prompt guides recommend camera-in-text. The prompt keeps two variants (shared spine + minimal Veo/Kling deltas) selected by a 2-way Target selector. The Kling gen-node camera grid, axis sliders, and `camera_control` request emission are deleted.

**Tech Stack:** Next.js (React), TypeScript, Tailwind v4, shadcn/Base-UI (`Button`/`ParamChipGroup`), Lucide icons, Vitest (node env).

**Spec:** [docs/superpowers/specs/2026-07-25-video-provider-consolidation-design.md](../specs/2026-07-25-video-provider-consolidation-design.md)

## Global Constraints

- **Controls are shadcn primitives only** — from `src/components/ui/*` / existing node components; never a native control. (CLAUDE.md)
- **Design system:** brand purple only on active ring/label/chip; Lucide icons `strokeWidth={1.5}`.
- **Reuse, don't redefine** — option values/prose come from `VIDEO_CONTROLS`; the prompt is a shared spine + deltas (AGENTS.md reuse rule).
- **Test env is `node`** — pure-logic tests only; components verified by `tsc` + `eslint` + manual QA (no jsdom/RTL in the suite).
- **Kept models only:** `veo:veo-3.1-lite`, `veo:veo-3.1-fast`, `veo:veo-3.1`, `kling:kling-v3`. Everything else (`openai:sora-2`, `kling:kling-v1-5` … `kling:kling-v2-6`) is removed.

---

### Task 1: Prune the model roster (registry, client-models, cost)

**Files:**
- Modify: `src/lib/video-gen/registry.ts`
- Modify: `src/lib/video-gen/client-models.ts`
- Modify: `src/lib/video-gen/cost.ts`
- Test: `src/lib/video-gen/__tests__/roster.test.ts` (new)

**Interfaces:**
- Produces: `videoGenClientModelMap` keyed by exactly the four kept model IDs; `videoGenRegistry` likewise (server side).

- [ ] **Step 1: Write the failing test**

Create `src/lib/video-gen/__tests__/roster.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { videoGenClientModelMap } from "../client-models";

describe("video model roster", () => {
  it("contains exactly Veo x3 + Kling 3.0", () => {
    expect(Object.keys(videoGenClientModelMap).sort()).toEqual([
      "kling:kling-v3",
      "veo:veo-3.1",
      "veo:veo-3.1-fast",
      "veo:veo-3.1-lite",
    ]);
  });

  it("has no Sora or legacy Kling models", () => {
    const ids = Object.keys(videoGenClientModelMap);
    expect(ids).not.toContain("openai:sora-2");
    expect(ids.some((id) => /kling-v(1|2)/.test(id))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/video-gen/__tests__/roster.test.ts`
Expected: FAIL — map still contains Sora + six Kling models.

- [ ] **Step 3: Prune `client-models.ts`**

In `src/lib/video-gen/client-models.ts`:
- Remove the `soraParams` import and the `klingLegacyParams` import (keep `klingV3Params`).
- Delete the `SORA_RULES` const.
- Delete these entries from `videoGenClientModelMap`: `"openai:sora-2"`, `"kling:kling-v1-5"`, `"kling:kling-v1-6"`, `"kling:kling-v2-1"`, `"kling:kling-v2-1-master"`, `"kling:kling-v2-6"`.
- Keep `"veo:veo-3.1-lite"`, `"veo:veo-3.1-fast"`, `"veo:veo-3.1"`, and `"kling:kling-v3"` (the `kling-v3` entry already uses `klingV3Params`).

- [ ] **Step 4: Prune `registry.ts`**

Replace `src/lib/video-gen/registry.ts` with:

```ts
import "server-only";
import type { VideoGenModelSpec } from "./types";
import { veoLite, veoFast, veoQuality } from "./providers/veo";
import { klingV3 } from "./providers/kling";

export const videoGenRegistry: Record<string, VideoGenModelSpec> = {
  [veoLite.id]: veoLite,
  [veoFast.id]: veoFast,
  [veoQuality.id]: veoQuality,
  [klingV3.id]: klingV3,
};

export const DEFAULT_VIDEO_MODEL_ID = "veo:veo-3.1-fast";
```

- [ ] **Step 5: Prune `cost.ts`**

In `src/lib/video-gen/cost.ts` `VIDEO_MODEL_PRICING`, delete the `"openai:sora-2"` row and the five legacy Kling rows (`kling-v1-5`, `kling-v1-6`, `kling-v2-1`, `kling-v2-1-master`, `kling-v2-6`). Keep the three Veo rows and `"kling:kling-v3": { perSecond: 0.120, audioMultiplier: 1.0 }`. Update the Kling source comment to reference only v3.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/video-gen/__tests__/roster.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `providers/sora.ts` / `params/sora.ts` are now fully unreferenced you MAY delete them — optional cleanup; leaving them is harmless.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/video-gen/registry.ts src/lib/video-gen/client-models.ts src/lib/video-gen/cost.ts src/lib/video-gen/__tests__/roster.test.ts
git commit -m "refactor(video-gen): prune roster to Veo x3 + Kling 3.0"
```

---

### Task 2: Rewrite the motion prompt — shared spine + Veo/Kling deltas (both text-camera)

**Files:**
- Modify: `src/prompts/video-prompt-generate.ts`
- Test: `src/prompts/__tests__/video-prompt-generate.test.ts`

**Interfaces:**
- Produces: `videoPromptGeneratePrompt` (Veo), `videoPromptGenerateKlingPrompt` (Kling), `videoPromptGeneratePromptFor(provider)`, and `type VideoProvider = "veo" | "kling"` (narrowed — Sora removed). Both system prompts include camera guidance.

- [ ] **Step 1: Rewrite the failing test**

Replace `src/prompts/__tests__/video-prompt-generate.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import {
  videoPromptGeneratePrompt,
  videoPromptGenerateKlingPrompt,
  videoPromptGeneratePromptFor,
} from "../video-prompt-generate";

describe("videoPromptGeneratePrompt (Veo)", () => {
  it("is a versioned, evaluable record", () => {
    expect(videoPromptGeneratePrompt.id).toBe("video-prompt-generate");
    expect(videoPromptGeneratePrompt.version).toBeGreaterThanOrEqual(1);
    expect(videoPromptGeneratePrompt.system.length).toBeGreaterThan(100);
  });

  it("instructs no scene re-description and keeps hype-word hygiene", () => {
    expect(videoPromptGeneratePrompt.system.toLowerCase()).toContain("do not re-describe");
    expect(videoPromptGeneratePrompt.system).toContain("cinematic masterpiece");
  });
});

describe("videoPromptGeneratePromptFor", () => {
  it("returns the Veo record for veo", () => {
    expect(videoPromptGeneratePromptFor("veo").id).toBe("video-prompt-generate");
  });
  it("returns the Kling record for kling", () => {
    expect(videoPromptGeneratePromptFor("kling").id).toBe("video-prompt-generate-kling");
  });
});

describe("videoPromptGenerateKlingPrompt", () => {
  it("keeps camera IN the text (not camera-silent) and shares the i2v grounding", () => {
    const sys = videoPromptGenerateKlingPrompt.system;
    expect(sys.toLowerCase()).toContain("camera movement");
    expect(sys).not.toMatch(/do\s+NOT describe any camera/i);
    expect(sys.toLowerCase()).toContain("do not re-describe");
  });
  it("permits a trailing cinematic quality tag", () => {
    expect(videoPromptGenerateKlingPrompt.system.toLowerCase()).toContain("quality tag");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/prompts/__tests__/video-prompt-generate.test.ts`
Expected: FAIL — Kling record is still camera-silent; no "quality tag".

- [ ] **Step 3: Rewrite the prompt module**

Replace `src/prompts/video-prompt-generate.ts` with:

```ts
// Video-prompt-generate — versioned, evaluable records (mirrors prompt-generate.ts).
// Shared i2v spine + minimal per-provider deltas. Camera is written INTO the text for BOTH
// providers: Veo's guide and Kling's guide both put camera language in the prompt, and Kling 3.0
// has no camera_control param (capability map). See the 2026-07-25 provider-consolidation spec.
// Refs: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide
//       https://kling.ai/blog/kling-ai-prompt-guide

// Provider-neutral core — no vendor name here; each variant names its own model in the header.
const SPINE = `A still image (the first frame) is provided. Describe how that frame should come to
life over roughly 8 seconds.

OUTPUT FORMAT
One short prose paragraph — no headers, no bullet points, no preamble, no explanation. 40–90 words.

STRUCTURE (image-to-video)
1. Camera movement — a single, explicit camera move written as its own clause ("Slow push-in.",
   "Static locked-off frame.", "Gentle orbit."). Lead with it, separated from the subject action.
2. Action — what physically moves (secondary motion: steam drifts, fabric sways, light shifts,
   liquid pours). Keep it grounded in what is already visible in the frame. Describe ONE focused
   moment — do not chain several distinct events ("A, then B, then C") in a single short clip.

DO NOT re-describe the scene. The first frame already carries the subject, setting, lighting,
palette, and style — repeating them fights the image. Never restate subject appearance, wardrobe,
location, or color. Never invent new objects or people not in the frame.

MULTI-IMAGE REFERENCES
When the instruction references "the first image", "the second image" etc., each refers to a
distinct visual input. Describe camera movement and secondary motion that serves the composition of
all referenced frames — do not re-describe their visual content.

If motion controls are provided, honor them exactly.`;

export const videoPromptGeneratePrompt = {
  id: "video-prompt-generate",
  version: 3,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Veo 3.1.
${SPINE}

WORDS TO AVOID
Do not use: "cinematic masterpiece", "ultra realistic", "8K", "stunning", "beautiful".`,
} as const;

export const videoPromptGenerateKlingPrompt = {
  id: "video-prompt-generate-kling",
  version: 2,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Kling.
${SPINE}

QUALITY TAG (Kling)
You MAY end with a short, comma-separated cinematic quality tag — for example
"cinematic lighting, 4K detail, realistic textures". Kling rewards a light quality cue. Keep it to
one short clause; do not pad with empty hype like "stunning" or "beautiful".`,
} as const;

export type VideoProvider = "veo" | "kling";

export type VideoProviderPrompt = {
  id: string;
  version: number;
  model: string;
  system: string;
};

// Kling gets the quality-tag variant; Veo (and any stale/other value) gets the clean variant.
export function videoPromptGeneratePromptFor(provider: VideoProvider): VideoProviderPrompt {
  return provider === "kling" ? videoPromptGenerateKlingPrompt : videoPromptGeneratePrompt;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/prompts/__tests__/video-prompt-generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Narrowing `VideoProvider` to `"veo" | "kling"` may surface errors only if something passes `"openai"` as a value — none should; `canvas-nodes.ts` merely references the type. If any appear, they are fixed in Tasks 5-6, but none are expected here.)

- [ ] **Step 6: Commit**

```bash
git add src/prompts/video-prompt-generate.ts src/prompts/__tests__/video-prompt-generate.test.ts
git commit -m "feat(video-prompt): shared spine + Veo/Kling deltas, both text-camera"
```

---

### Task 3: Compile the camera clause for every provider

**Files:**
- Modify: `src/lib/nodes/video-controls.ts`
- Modify: `src/lib/nodes/video-prompt.ts`
- Test: `src/lib/nodes/__tests__/video-controls.test.ts`
- Test: `src/lib/nodes/__tests__/video-prompt.test.ts`

**Interfaces:**
- Consumes: `VideoProvider` (Task 2, narrowed to `"veo" | "kling"`).
- Produces: `renderVideoControls(controls)` (no options arg — always emits camera); `compileVideoPrompt` selects the system prompt by provider and always includes camera.

- [ ] **Step 1: Update the failing tests**

In `src/lib/nodes/__tests__/video-controls.test.ts`, **delete** the test `"omits camera prose but keeps speed when includeCamera is false (external-camera)"` (the whole `it(...)` block). Replace the test `"includes camera prose by default (text-camera, back-compat)"` with:

```ts
  it("always includes the camera prose (text-camera for all providers)", () => {
    const out = renderVideoControls({ camera: "push-in", speed: "dynamic" });
    expect(out).toContain("Camera:");
    expect(out).toContain("Speed:");
  });
```

In `src/lib/nodes/__tests__/video-prompt.test.ts`, replace the test `"uses the Kling system and drops the camera control line for kling"` with:

```ts
  it("uses the Kling system but STILL includes camera prose (text-camera for all)", () => {
    const { system, user } = compileVideoPrompt({ ...base, targetProvider: "kling" });
    expect(system).toContain("image-to-video prompts for Kling");
    expect(user).toContain("Camera:");
    expect(user).toContain("Speed:");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/video-controls.test.ts src/lib/nodes/__tests__/video-prompt.test.ts`
Expected: FAIL — Kling path still strips camera; `renderVideoControls` still accepts `{ includeCamera }`.

- [ ] **Step 3: Simplify `renderVideoControls`**

In `src/lib/nodes/video-controls.ts`, replace the `renderVideoControls` function (and its preceding comment) with:

```ts
// The motion-control block injected into the compiled prompt. "" when nothing to inject. Camera is
// always emitted (text-camera for every provider — Veo has no camera param, Kling 3.0 has no
// camera_control). Camera leads as its own clause; text models parse it best separated from action.
export function renderVideoControls(controls: VideoControls): string {
  const lines: string[] = [];
  for (const group of VIDEO_CONTROLS) {
    const opt = group.options.find((o) => o.value === controls[group.key]);
    if (opt && opt.value !== "auto" && opt.prose) lines.push(`- ${group.label}: ${opt.prose}`);
  }
  if (lines.length === 0) return "";
  return `Motion controls (use these exactly; do not substitute):\n${lines.join("\n")}`;
}
```

- [ ] **Step 4: Simplify `compileVideoPrompt`**

In `src/lib/nodes/video-prompt.ts`, replace the block computing `targetProvider` / `includeCamera` / `controlsBlock` (currently lines 75-81) with:

```ts
  // Coerce any stored value (incl. stale "openai") to a supported provider. Camera is always text.
  const targetProvider: VideoProvider = input.targetProvider === "kling" ? "kling" : "veo";

  const controlsBlock = input.controls ? renderVideoControls(input.controls) : "";
  if (controlsBlock) blocks.push(controlsBlock);
```

(The `import { ... type VideoProvider }` line and the `videoPromptGeneratePromptFor(targetProvider)` call at the `return` stay unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/video-controls.test.ts src/lib/nodes/__tests__/video-prompt.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nodes/video-controls.ts src/lib/nodes/video-prompt.ts src/lib/nodes/__tests__/video-controls.test.ts src/lib/nodes/__tests__/video-prompt.test.ts
git commit -m "feat(video-prompt): always compile the camera clause (text-camera for all)"
```

---

### Task 4: Remove the Kling `camera_control` feature end-to-end

Removes it in one cohesive change — params, provider request, and gen-node UI — so there is no
half-wired intermediate state. Params/provider are covered by unit tests; the UI is markup.

**Files:**
- Modify: `src/lib/video-gen/params/kling.ts`
- Modify: `src/lib/video-gen/providers/kling.ts`
- Modify: `src/components/nodes/video-gen-params-panel.tsx`
- Modify: `src/components/nodes/video-gen-focus-view.tsx`
- Delete: `src/lib/video-gen/kling-camera.ts` and `src/lib/video-gen/__tests__/kling-camera.test.ts`
- Delete: `src/components/nodes/kling-camera-select.tsx`
- Test: `src/lib/video-gen/__tests__/kling-params.test.ts`
- Test: `src/lib/video-gen/__tests__/kling-provider.test.ts`

**Interfaces:**
- Produces: `klingV3Params` (mode · duration slider · cfg_scale · negative_prompt — no camera/axis/aspect params); `buildKlingRequestBody(...)` emitting no `camera_control`; `klingV3` model export (legacy model exports removed).

- [ ] **Step 1: Rewrite `kling-params.test.ts` (failing)**

Replace `src/lib/video-gen/__tests__/kling-params.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { klingV3Params } from "../params/kling";

describe("klingV3Params (Kling 3.0)", () => {
  it("primary params are mode then duration (no camera_move, no aspect_ratio)", () => {
    const primary = klingV3Params.filter((p) => p.group === "primary");
    expect(primary.map((p) => p.name)).toEqual(["mode", "duration"]);
  });

  it("duration is a 3–15s slider", () => {
    const duration = klingV3Params.find((p) => p.name === "duration")!;
    expect(duration.component).toBe("slider");
    expect(duration.constraints).toEqual({ type: "slider", min: 3, max: 15, step: 1 });
  });

  it("advanced params are cfg_scale then negative_prompt (no axis sliders)", () => {
    const advanced = klingV3Params.filter((p) => p.group === "advanced");
    expect(advanced.map((p) => p.name)).toEqual(["cfg_scale", "negative_prompt"]);
  });

  it("has no camera or axis params at all", () => {
    const names = klingV3Params.map((p) => p.name);
    for (const banned of ["camera_move", "aspect_ratio", "pan", "tilt", "zoom", "roll", "horizontal_movement", "vertical_movement"]) {
      expect(names).not.toContain(banned);
    }
  });

  it("prefills a visual-defect negative prompt", () => {
    const neg = klingV3Params.find((p) => p.name === "negative_prompt");
    expect(neg?.defaultValue).toContain("blurry");
    expect(neg?.defaultValue).toContain("watermark");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/video-gen/__tests__/kling-params.test.ts`
Expected: FAIL — `klingV3Params` still contains camera/axis/aspect params.

- [ ] **Step 3: Rewrite `params/kling.ts`**

Replace `src/lib/video-gen/params/kling.ts` with:

```ts
import type { ParamSpec } from "@/lib/image-gen/types";

// Kling 3.0 image-to-video generation params. Camera is authored on the Video Prompt node as text
// (Kling 3.0 exposes no camera_control — see the capability map), so there are no camera_move / axis
// params here. aspect_ratio is omitted too: Kling 3.0 derives it from the input image.
export const klingV3Params: ParamSpec[] = [
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
    name: "duration",
    label: "Duration (s)",
    component: "slider",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue: 5,
    constraints: { type: "slider", min: 3, max: 15, step: 1 },
  },
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
    defaultValue:
      "blurry, low quality, distorted, deformed, warped hands, extra fingers, morphing, flickering, jitter, text, watermark, logo",
    constraints: { type: "textarea", maxLength: 2500 },
  },
];
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/lib/video-gen/__tests__/kling-params.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `kling-provider.test.ts` (failing)**

Replace `src/lib/video-gen/__tests__/kling-provider.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("buildKlingRequestBody", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.KLING_API_KEY = "test-key";
  });

  it("maps params to Kling API fields and never emits camera_control", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({
      modelName: "kling-v3",
      imageBase64: "base64data",
      mimeType: "image/jpeg",
      prompt: "a cat walking",
      params: { mode: "pro", duration: 5, cfg_scale: 0.5, negative_prompt: "blurry" },
      callbackUrl: "https://app.example.com/api/webhooks/generation?provider=kling",
    });

    expect(body.model_name).toBe("kling-v3");
    expect(body.mode).toBe("pro");
    expect(body.duration).toBe(5);
    expect(body.cfg_scale).toBe(0.5);
    expect(body.negative_prompt).toBe("blurry");
    expect(body.image).toBe("base64data");
    expect(body.callback_url).toBe("https://app.example.com/api/webhooks/generation?provider=kling");
    expect(body.camera_control).toBeUndefined();
    expect(body.aspect_ratio).toBeUndefined();
  });

  it("omits negative_prompt when empty", async () => {
    const { buildKlingRequestBody } = await import("../providers/kling");
    const body = buildKlingRequestBody({
      modelName: "kling-v3",
      imageBase64: "x",
      mimeType: "image/jpeg",
      prompt: "steam drifts",
      params: { mode: "pro", duration: 5, cfg_scale: 0.5, negative_prompt: "" },
      callbackUrl: "https://app/cb",
    });
    expect(body.negative_prompt).toBeUndefined();
    expect(body.camera_control).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `npx vitest run src/lib/video-gen/__tests__/kling-provider.test.ts`
Expected: FAIL — `buildKlingRequestBody` still emits `camera_control` / `aspect_ratio`.

- [ ] **Step 7: Rewrite `buildKlingRequestBody` + prune model exports**

In `src/lib/video-gen/providers/kling.ts`:
- Remove the imports of `klingLegacyParams` and `klingCameraControl`. Change the params import to `import { klingV3Params } from "../params/kling";` and add `import type { ParamSpec } from "../types";`.
- Replace the whole `buildKlingRequestBody` function with:

```ts
export function buildKlingRequestBody(input: KlingRequestBodyInput): Record<string, unknown> {
  const { modelName, imageBase64, prompt, params, callbackUrl } = input;
  const negativePrompt = String(params.negative_prompt ?? "").trim();

  return {
    model_name: modelName,
    image: imageBase64,
    prompt,
    mode: String(params.mode ?? "pro"),
    duration: Number(params.duration ?? 5),
    cfg_scale: Number(params.cfg_scale ?? 0.5),
    ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    callback_url: callbackUrl,
  };
}
```

- Change the `makeKlingModel` signature param type from `params: typeof klingLegacyParams` to `params: ParamSpec[]`.
- Delete the five legacy model exports (`klingV15`, `klingV16`, `klingV21`, `klingV21Master`, `klingV26`). Keep only:

```ts
export const klingV3 = makeKlingModel("kling:kling-v3", "Kling 3.0", "kling-v3", 15, klingV3Params);
```

- [ ] **Step 8: Run the provider test to confirm it passes**

Run: `npx vitest run src/lib/video-gen/__tests__/kling-provider.test.ts`
Expected: PASS.

- [ ] **Step 9: Delete the camera-control modules**

```bash
git rm src/lib/video-gen/kling-camera.ts src/lib/video-gen/__tests__/kling-camera.test.ts src/components/nodes/kling-camera-select.tsx
```

- [ ] **Step 10: Simplify `video-gen-params-panel.tsx`**

In `src/components/nodes/video-gen-params-panel.tsx`:
- Remove the imports `import { KLING_AXIS_PARAM_NAMES } from "@/lib/video-gen/params/kling";` and `import { KlingCameraSelect } from "./kling-camera-select";`.
- Delete the `KLING_CAMERA_PARAM_NAMES` and `AXIS_NAME_SET` consts (lines 32-35) and their comment.
- In `PARAM_ICONS`, delete the `pan` / `tilt` / `zoom` / `roll` / `horizontal_movement` / `vertical_movement` entries.
- Replace the four derivation lines that reference `isKling` / `axisSpecs` / `primaryRows` / `advancedRows` (lines 83-86) with:

```tsx
  const primaryRows = primaryParams;
  const advancedRows = advancedParams;
```

- Delete the entire `if (section === "fine-tune") { ... }` block (lines 139-147).
- Delete the `{isKling && <KlingCameraSelect .../>}` line (line 202) and its preceding comment.

- [ ] **Step 11: Remove the Fine-tune group from `video-gen-focus-view.tsx`**

In `src/components/nodes/video-gen-focus-view.tsx`:
- Delete the block that pushes the fine-tune group:

```tsx
                    if (hasFineTune) {
                      groups.push({
                        id: "fine-tune",
                        icon: SlidersHorizontal,
                        label: "Fine-tune",
                        body: <VideoGenParamsPanel section="fine-tune" {...paramsPanelProps} />,
                      });
                    }
```

- Find and remove the `hasFineTune` const definition (grep the file for `hasFineTune`) and anything only it uses. Keep the `SlidersHorizontal` import (still used by the "Details" rail item).
- Update the group-list comment so it reads `Frames / Output / Advanced` (drop "Fine-tune").

- [ ] **Step 12: Full check + QA**

Run: `npx vitest run` → full suite green (`kling-camera.test.ts` is gone).
Run: `npx tsc --noEmit` → clean (nothing imports `kling-camera`, `KLING_AXIS_PARAM_NAMES`, `klingLegacyParams`, `klingCameraControl`, or the removed model exports).
Run: `npx eslint src/components/nodes/video-gen-params-panel.tsx src/components/nodes/video-gen-focus-view.tsx` → clean.
QA (`npm run dev`): Kling 3.0 gen node shows Output (`mode` + `duration` slider) and Advanced (`cfg_scale` + prefilled `negative_prompt`), **no** camera grid, **no** Fine-tune group. Veo models unchanged.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "refactor(kling): remove camera_control feature (params, provider, gen-node UI)"
```

---

### Task 5: Uniform camera on the Prompt node + 2-way Target selector

**Files:**
- Modify: `src/components/nodes/video-prompt-focus-view.tsx`
- Modify: `src/components/nodes/target-provider-select.tsx`

> No unit test — markup + the `VideoProvider` narrowing from Task 2. Verified by `tsc` + `eslint` + manual QA. `src/lib/canvas-nodes.ts` needs no edit — its `targetProvider?: VideoProvider` picks up the narrowed type automatically.

- [ ] **Step 1: Make the Target selector 2-way**

In `src/components/nodes/target-provider-select.tsx`, replace the `OPTIONS` array with:

```tsx
const OPTIONS: { value: VideoProvider; label: string }[] = [
  { value: "veo", label: "Veo" },
  { value: "kling", label: "Kling" },
];
```

- [ ] **Step 2: Render the camera grid for every provider**

In `src/components/nodes/video-prompt-focus-view.tsx`, replace the `effectiveProvider === "kling" ? (…Kling empty state…) : (<CameraSelect …/>)` ternary (lines 528-548) with just the grid:

```tsx
                    <div className="min-w-0 flex-1">
                      <CameraSelect
                        value={(controls ?? DEFAULT_VIDEO_CONTROLS).camera}
                        onChange={(v) =>
                          onPatch({
                            controls: { ...(controls ?? DEFAULT_VIDEO_CONTROLS), camera: v },
                          })
                        }
                      />
                    </div>
```

- [ ] **Step 3: Coerce a stale `targetProvider` at read**

In the same file, change the `selectorValue` line (currently `const selectorValue: VideoProvider = targetProvider ?? "veo";`) to:

```tsx
  const selectorValue: VideoProvider = targetProvider === "kling" ? "kling" : "veo";
```

- [ ] **Step 4: Remove the now-unused `Video` icon import**

Grep the file for `Video` (the Lucide icon). It was only used by the deleted empty state — if no other reference remains, remove `Video` from the `lucide-react` import.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit` and `npx eslint src/components/nodes/video-prompt-focus-view.tsx src/components/nodes/target-provider-select.tsx`
Expected: clean.

- [ ] **Step 6: Manual QA**

Prompt node focus view: Camera grid + Speed render identically whether Target = Veo or Kling (no "Camera is on the video node" state). Target selector shows two chips (Veo / Kling) and still locks to a connected Video Gen node's provider. Generated prompt for Kling now contains a camera clause.

- [ ] **Step 7: Commit**

```bash
git add src/components/nodes/video-prompt-focus-view.tsx src/components/nodes/target-provider-select.tsx
git commit -m "feat(video-prompt): uniform camera grid + 2-way Target selector (Veo/Kling)"
```

---

### Task 6: Back-compat — resolve unknown model IDs to the default

**Files:**
- Modify: `src/lib/video-gen/client-models.ts`
- Modify: `src/components/nodes/video-gen-params-panel.tsx`
- Test: `src/lib/video-gen/__tests__/resolve-model.test.ts` (new)

**Interfaces:**
- Produces: `resolveVideoModelId(modelId: string): string` — returns `modelId` if present in `videoGenClientModelMap`, else `DEFAULT_VIDEO_CLIENT_MODEL_ID`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/video-gen/__tests__/resolve-model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveVideoModelId, DEFAULT_VIDEO_CLIENT_MODEL_ID } from "../client-models";

describe("resolveVideoModelId", () => {
  it("keeps a known model id", () => {
    expect(resolveVideoModelId("kling:kling-v3")).toBe("kling:kling-v3");
  });
  it("falls back to the default for a removed model id", () => {
    expect(resolveVideoModelId("openai:sora-2")).toBe(DEFAULT_VIDEO_CLIENT_MODEL_ID);
    expect(resolveVideoModelId("kling:kling-v2-6")).toBe(DEFAULT_VIDEO_CLIENT_MODEL_ID);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/video-gen/__tests__/resolve-model.test.ts`
Expected: FAIL — `resolveVideoModelId` is not exported.

- [ ] **Step 3: Add the resolver**

At the end of `src/lib/video-gen/client-models.ts`, add:

```ts
// Back-compat: a node may reference a model we've since removed (Sora, legacy Kling).
// Resolve unknown IDs to the default so the node still renders instead of blanking out.
export function resolveVideoModelId(modelId: string): string {
  return modelId in videoGenClientModelMap ? modelId : DEFAULT_VIDEO_CLIENT_MODEL_ID;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/video-gen/__tests__/resolve-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the resolver into the params panel**

In `src/components/nodes/video-gen-params-panel.tsx`:
- Add `resolveVideoModelId` to the existing import from `@/lib/video-gen/client-models`.
- Change the model lookup (line 75) from `const model = videoGenClientModelMap[modelId];` to:

```tsx
  const model = videoGenClientModelMap[resolveVideoModelId(modelId)];
```

- [ ] **Step 6: Typecheck + lint + full suite**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint src/components/nodes/video-gen-params-panel.tsx` → clean.
Run: `npx vitest run` → full suite green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/video-gen/client-models.ts src/components/nodes/video-gen-params-panel.tsx src/lib/video-gen/__tests__/resolve-model.test.ts
git commit -m "fix(video-gen): resolve removed model ids to the default (back-compat)"
```

---

### Task 7: Record the ADR (supersedes D77)

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (ADR log, §7)

> No code — the project keeps one ADR log (AGENTS.md). This design supersedes D77 and must be logged.

- [ ] **Step 1: Find the next free D-number**

Open `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`, go to §7, and find the highest existing `D<n>`. The next entry is `D<n+1>`. (Do not assume a number — the log may have advanced past D77.)

- [ ] **Step 2: Append the ADR entry**

Append to §7, using the next free number `D<n+1>`:

```markdown
### D<n+1> — Uniform text-camera; Veo ×3 + Kling 3.0 only (supersedes D77)

**Decision.** The video roster is Veo 3.1 Lite/Fast/Quality + Kling 3.0. Camera is a uniform
text-in-prompt control authored on the Video Prompt node (the `CameraSelect` grid) for every
provider. The Kling `camera_control` path (gen-node grid, axis sliders, `kling-camera.ts`, request
emission) is removed. The Target selector is retained (2-way Veo/Kling) and switches only the prompt
variant (shared spine + minimal deltas).

**Why.** D77 assumed Kling drives camera via `camera_control`; the official Kling capability map
shows `camera_control` is Kling-1.5-only — Kling 3.0 uses a separate, un-integrated Motion Control
feature. Both vendors' prompt guides recommend camera-in-text. Uniform text-camera is less code and
a more consistent UX.

**Rejected.** Finishing D77 as built — ships a camera control no kept model honors and diverges the
Prompt-node UX by provider for no capability gain.

**Refines / reverses.** D77 (and its partial build on `feat/provider-aware-video-prompt`). Reuses
the `CameraSelect`/`ShotTileStrip` from the 2026-07-23 camera-visual-selectors spec.

**Originated → spec.** docs/superpowers/specs/2026-07-25-video-provider-consolidation-design.md
```

Then update the D77 entry to note it is superseded by `D<n+1>` (a one-line "**Superseded by D<n+1>.**" suffix), per the "keep one ADR log" rule.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): log uniform text-camera + Veo/Kling-3.0 roster (supersedes D77)"
```

---

## Final Verification

**Automated (repo root):**

- [ ] `npx vitest run` — full suite green (new `roster.test.ts`, `resolve-model.test.ts`; updated prompt/controls/kling tests; `kling-camera.test.ts` gone).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx eslint .` — no new errors.

**Manual QA (`npm run dev`):**

- [ ] Model picker shows **only** Veo 3.1 Lite/Fast/Quality + Kling 3.0.
- [ ] Prompt node: Camera grid + Speed identical for Veo and Kling; Target selector is 2-way and locks to a connected video node.
- [ ] Kling generation: prompt output **includes** a camera clause; Gen node shows `mode`/`duration`/`cfg_scale`/prefilled `negative_prompt`, **no** camera grid or Fine-tune; the request carries **no** `camera_control` (check the "Sent to model" provenance).
- [ ] Veo generation: unchanged from today.
- [ ] Open an old canvas whose video node used a removed model (if available) → it falls back to the default model without crashing.

## Spec coverage self-check

- Roster prune (spec §3) → Task 1.
- Prompt shared spine + minimal deltas, provider-neutral spine (spec §4) → Task 2.
- Camera uniform text, `includeCamera` removed (spec §4, §5) → Task 3 + Task 5.
- Delete `camera_control` machinery — params, provider, gen-node UI (spec §6) → Task 4.
- Kling gen params kept/trimmed, aspect dropped (spec §7) → Task 4.
- 2-way Target selector, uniform prompt-node camera (spec §3, §5, §8) → Task 5.
- Back-compat model-id fallback (spec §12) → Task 6; stale `targetProvider` coercion → Task 3 (compile) + Task 5 Step 3 (selector).
- ADR supersedes D77 (spec §14) → Task 7.
- Tests written first (spec §10) → Tasks 1-4, 6.
