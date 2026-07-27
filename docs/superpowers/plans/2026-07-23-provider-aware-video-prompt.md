# Provider-aware Video Prompt → Video Gen (Kling camera_control) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Video Prompt → Video Gen pair provider-aware — the motion prompt is shaped for its target model, and Kling's camera is driven by its native `camera_control` param via a curated visual grid instead of a text clause.

**Architecture:** A `targetProvider` field on the Video Prompt node (locked to a connected Video Gen node's provider when present) selects one of two prompt variants: `text-camera` (Veo/Sora — camera as text, unchanged) or `external-camera` (Kling — camera-silent + sequential phrasing). On the Video Gen node, Kling gets a curated visual camera grid that writes a `camera_move` param, mapped to `camera_control` at request-build time, plus a prefilled `negative_prompt`.

**Tech Stack:** Next.js 16, React 19, `@xyflow/react` 12, Zustand 5, Vitest 4, shadcn (Base UI registry), TypeScript.

**Spec:** [docs/superpowers/specs/2026-07-23-provider-aware-video-prompt-design.md](../specs/2026-07-23-provider-aware-video-prompt-design.md) (ADR D77, refines D24).

## Global Constraints

- **Controls are shadcn primitives only** (`src/components/ui/*`, Base UI — `render` prop, not `asChild`). Never a native `<button>`/`<select>`/`<input>`. Non-interactive `span`/`div`/`p` are fine.
- **Design system:** brand purple `#5829c7` sparingly (active tile/chip/ring only); neutrals do the work. Reuse the `ShotTileStrip` / `ParamChipGroup` / `FieldLabel` primitives — do not reinvent.
- **Reuse, don't redefine** — import move labels/images from `camera-preview.ts`; import provider types rather than re-declaring string unions.
- **Test runner:** `npm test` (`vitest run`). Unit-test pure logic; UI (no jsdom/RTL in the suite) is verified by `npx tsc --noEmit` + `npm run lint` + manual QA.
- **Kling API risk:** the `left_turn_forward` preset (Orbit) and the `type: "customize"` config shape are confirmed against the live Kling API before merge (spec §15 open risks). The proven custom-mode path (`type: "customize"`) must not regress.
- **Provider values:** `"veo" | "openai" | "kling"` (matches `VideoGenModelSpec.provider`). UI label "Sora" ↔ value `"openai"`.

---

### Task 1: `findDescendantsOfType` graph helper

**Files:**
- Modify: `src/lib/canvas/graph.ts` (append after `findAncestorOfType`)
- Test: `src/lib/canvas/graph.test.ts` (append)

**Interfaces:**
- Produces: `findDescendantsOfType<T extends { id: string; type?: string }>(nodeId: string, nodes: T[], edges: Edge[], type: string, maxDepth?: number): T[]` — all descendant nodes of `type` reachable downstream (edge `source → target`), bounded depth. Used by Task 7's Target lock.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/canvas/graph.test.ts`:

```ts
import { findDescendantsOfType } from "./graph";

describe("findDescendantsOfType", () => {
  const nodes = [
    { id: "p", type: "video-prompt" },
    { id: "g1", type: "video-gen" },
    { id: "g2", type: "video-gen" },
    { id: "x", type: "file" },
  ];
  const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

  it("returns all downstream nodes of the given type", () => {
    const edges = [edge("p", "g1"), edge("p", "g2"), edge("x", "p")];
    const found = findDescendantsOfType("p", nodes, edges, "video-gen");
    expect(found.map((n) => n.id).sort()).toEqual(["g1", "g2"]);
  });

  it("returns [] when there are no downstream nodes of the type", () => {
    expect(findDescendantsOfType("p", nodes, [edge("x", "p")], "video-gen")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/canvas/graph.test.ts`
Expected: FAIL — `findDescendantsOfType is not a function` / not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/canvas/graph.ts`:

```ts
/**
 * Walk edges downstream (BFS, bounded depth) from `nodeId`, collecting every node of `type`.
 * Mirror of findAncestorOfType, following source -> target instead of target -> source.
 */
export function findDescendantsOfType<T extends { id: string; type?: string }>(
  nodeId: string,
  nodes: T[],
  edges: Edge[],
  type: string,
  maxDepth = 4,
): T[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenOf = (id: string) => edges.filter((e) => e.source === id).map((e) => e.target);
  const seen = new Set<string>([nodeId]);
  const found: T[] = [];
  let frontier = [nodeId];
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const c of childrenOf(id)) {
        if (seen.has(c)) continue;
        seen.add(c);
        const child = byId.get(c);
        if (child?.type === type) found.push(child);
        next.push(c);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return found;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/canvas/graph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/graph.ts src/lib/canvas/graph.test.ts
git commit -m "feat(graph): findDescendantsOfType for downstream node lookup"
```

---

### Task 2: Kling camera mapping module

**Files:**
- Create: `src/lib/video-gen/kling-camera.ts`
- Test: `src/lib/video-gen/__tests__/kling-camera.test.ts`

**Interfaces:**
- Consumes: `VIDEO_CONTROLS`, `VideoControlOption` from `@/lib/nodes/video-controls`.
- Produces:
  - `KLING_CAMERA_MOVES: string[]` — grid move values, in order: `["static","push-in","pull-back","pan","tilt","tracking","crane","orbit"]` (Handheld excluded).
  - `KLING_CAMERA_TILES: VideoControlOption[]` — the `VIDEO_CONTROLS` camera options filtered to `KLING_CAMERA_MOVES`.
  - `KlingCameraControl = { type: string; config?: Record<string, number> }`.
  - `klingCameraControl(move: string): KlingCameraControl | undefined` — Task 10 & the grid consume this.

- [ ] **Step 1: Write the failing test**

Create `src/lib/video-gen/__tests__/kling-camera.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { KLING_CAMERA_MOVES, KLING_CAMERA_TILES, klingCameraControl } from "../kling-camera";

describe("kling-camera", () => {
  it("lists the mappable moves in order and excludes handheld", () => {
    expect(KLING_CAMERA_MOVES).toEqual([
      "static", "push-in", "pull-back", "pan", "tilt", "tracking", "crane", "orbit",
    ]);
    expect(KLING_CAMERA_MOVES).not.toContain("handheld");
  });

  it("derives tiles from VIDEO_CONTROLS with labels present", () => {
    expect(KLING_CAMERA_TILES.map((t) => t.value)).toEqual(KLING_CAMERA_MOVES);
    expect(KLING_CAMERA_TILES.find((t) => t.value === "push-in")?.label).toBe("Push in");
  });

  it("maps film moves to Kling axes (film pan -> Kling tilt; film tilt -> Kling pan)", () => {
    expect(klingCameraControl("pan")?.config?.tilt).toBe(5);
    expect(klingCameraControl("pan")?.config?.pan).toBe(0);
    expect(klingCameraControl("tilt")?.config?.pan).toBe(5);
    expect(klingCameraControl("push-in")?.config?.zoom).toBe(5);
    expect(klingCameraControl("pull-back")?.config?.zoom).toBe(-5);
    expect(klingCameraControl("tracking")?.config?.horizontal).toBe(5);
    expect(klingCameraControl("crane")?.config?.vertical).toBe(5);
  });

  it("maps orbit to the turn preset and static to no camera_control", () => {
    expect(klingCameraControl("orbit")).toEqual({ type: "left_turn_forward" });
    expect(klingCameraControl("static")).toBeUndefined();
    expect(klingCameraControl("handheld")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/video-gen/__tests__/kling-camera.test.ts`
Expected: FAIL — cannot find module `../kling-camera`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/video-gen/kling-camera.ts`:

```ts
import { VIDEO_CONTROLS, type VideoControlOption } from "@/lib/nodes/video-controls";

// The curated camera moves Kling can hit natively via camera_control, in grid order.
// Handheld is excluded (no camera path). Spec §10.
export const KLING_CAMERA_MOVES = [
  "static", "push-in", "pull-back", "pan", "tilt", "tracking", "crane", "orbit",
] as const;

const CAMERA_OPTIONS: VideoControlOption[] =
  VIDEO_CONTROLS.find((g) => g.key === "camera")?.options ?? [];

export const KLING_CAMERA_TILES: VideoControlOption[] = KLING_CAMERA_MOVES.map(
  (move) => CAMERA_OPTIONS.find((o) => o.value === move),
).filter((o): o is VideoControlOption => Boolean(o));

export type KlingCameraControl = { type: string; config?: Record<string, number> };

const zeroAxes = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 };

// Kling axis naming is inverted from film: Kling `pan` is a vertical-plane rotation (film TILT),
// Kling `tilt` is a horizontal-plane rotation (film PAN). Translations use horizontal/vertical.
// `type: "customize"` matches the proven custom-mode path in providers/kling.ts.
export function klingCameraControl(move: string): KlingCameraControl | undefined {
  switch (move) {
    case "push-in":   return { type: "customize", config: { ...zeroAxes, zoom: 5 } };
    case "pull-back": return { type: "customize", config: { ...zeroAxes, zoom: -5 } };
    case "pan":       return { type: "customize", config: { ...zeroAxes, tilt: 5 } };
    case "tilt":      return { type: "customize", config: { ...zeroAxes, pan: 5 } };
    case "tracking":  return { type: "customize", config: { ...zeroAxes, horizontal: 5 } };
    case "crane":     return { type: "customize", config: { ...zeroAxes, vertical: 5 } };
    case "orbit":     return { type: "left_turn_forward" };
    default:          return undefined; // static / handheld / unknown
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/video-gen/__tests__/kling-camera.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/kling-camera.ts src/lib/video-gen/__tests__/kling-camera.test.ts
git commit -m "feat(video-gen): kling camera move -> camera_control mapping"
```

---

### Task 3: Provider-aware prompt variants

**Files:**
- Modify: `src/prompts/video-prompt-generate.ts`
- Test: `src/prompts/__tests__/video-prompt-generate.test.ts` (append)

**Interfaces:**
- Produces:
  - `type VideoProvider = "veo" | "openai" | "kling"`.
  - `videoPromptGeneratePrompt` — unchanged text-camera record (id `"video-prompt-generate"`, version `2`), kept for back-compat imports.
  - `videoPromptGenerateKlingPrompt` — external-camera record (id `"video-prompt-generate-kling"`, version `1`).
  - `videoPromptGeneratePromptFor(provider: VideoProvider): { id: string; version: number; model: string; system: string }` — Task 5 & 6 consume this.

- [ ] **Step 1: Write the failing test**

Append to `src/prompts/__tests__/video-prompt-generate.test.ts`:

```ts
import { videoPromptGeneratePromptFor, videoPromptGenerateKlingPrompt } from "../video-prompt-generate";

describe("videoPromptGeneratePromptFor", () => {
  it("returns the text-camera record for veo and sora(openai)", () => {
    expect(videoPromptGeneratePromptFor("veo").id).toBe("video-prompt-generate");
    expect(videoPromptGeneratePromptFor("openai").id).toBe("video-prompt-generate");
  });

  it("returns the external-camera record for kling", () => {
    expect(videoPromptGeneratePromptFor("kling").id).toBe("video-prompt-generate-kling");
  });

  it("kling variant is camera-silent and keeps hype-word hygiene", () => {
    const sys = videoPromptGenerateKlingPrompt.system;
    expect(sys).toMatch(/do NOT describe any camera/i);
    expect(sys).toContain("cinematic masterpiece");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/prompts/__tests__/video-prompt-generate.test.ts`
Expected: FAIL — `videoPromptGeneratePromptFor` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/prompts/video-prompt-generate.ts`, keep the existing `videoPromptGeneratePrompt` object exactly as-is, and append:

```ts
export type VideoProvider = "veo" | "openai" | "kling";

// External-camera variant (Kling): camera is owned by the model's camera_control param, so the
// prompt is written camera-silent and orders the motion in time. Shares the i2v core with the
// text-camera variant; the wording is restated (not extracted) because provider-specific phrasing
// is woven throughout — a forced extract would hurt clarity more than the duplication costs.
export const videoPromptGenerateKlingPrompt = {
  id: "video-prompt-generate-kling",
  version: 1,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Kling.
A still image (the first frame) is provided. Describe how that frame should come to life over
roughly 8 seconds. The camera move is set separately by the video model's camera controls — do
NOT describe any camera movement, panning, zooming, tracking, or shot changes. Describe only what
moves within the frame.

OUTPUT FORMAT
One short prose paragraph — no headers, no bullet points, no preamble, no explanation. 40–90 words.
Order the motion in time: what happens first, then next, then how it settles ("first… then…
finally").

STRUCTURE (image-to-video)
Secondary motion only — steam drifts, fabric sways, light shifts, liquid pours. Keep every motion
grounded in what is already visible in the frame.

DO NOT re-describe the scene. The first frame already carries the subject, setting, lighting,
palette, and style — repeating them fights the image. Never restate subject appearance, wardrobe,
location, or color. Never invent new objects or people not in the frame. Never describe the camera.

WORDS TO AVOID
Do not use: "cinematic masterpiece", "ultra realistic", "8K", "stunning", "beautiful".

MULTI-IMAGE REFERENCES
When the instruction references "the first image", "the second image" etc., each refers to a
distinct visual input. Describe the secondary motion that serves the composition of all referenced
frames — do not re-describe their visual content, and do not describe camera movement.

If motion controls are provided, honor them exactly.`,
} as const;

export type VideoProviderPrompt = {
  id: string;
  version: number;
  model: string;
  system: string;
};

export function videoPromptGeneratePromptFor(provider: VideoProvider): VideoProviderPrompt {
  return provider === "kling" ? videoPromptGenerateKlingPrompt : videoPromptGeneratePrompt;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/prompts/__tests__/video-prompt-generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/prompts/video-prompt-generate.ts src/prompts/__tests__/video-prompt-generate.test.ts
git commit -m "feat(prompts): add Kling external-camera video-prompt variant + provider selector"
```

---

### Task 4: `renderVideoControls` omits camera for external-camera

**Files:**
- Modify: `src/lib/nodes/video-controls.ts` (`renderVideoControls`)
- Test: create `src/lib/nodes/__tests__/video-controls.test.ts`

**Interfaces:**
- Produces: `renderVideoControls(controls: VideoControls, opts?: { includeCamera?: boolean }): string` — `includeCamera` defaults to `true` (back-compat). When `false`, the Camera line is dropped; Speed is always included. Task 5 consumes the `opts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/__tests__/video-controls.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderVideoControls } from "../video-controls";

describe("renderVideoControls", () => {
  const controls = { camera: "push-in", speed: "dynamic" } as const;

  it("includes camera prose by default", () => {
    const out = renderVideoControls(controls);
    expect(out).toMatch(/Camera:/);
    expect(out).toMatch(/Speed:/);
  });

  it("omits camera prose but keeps speed when includeCamera is false", () => {
    const out = renderVideoControls(controls, { includeCamera: false });
    expect(out).not.toMatch(/Camera:/);
    expect(out).toMatch(/Speed:/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/nodes/__tests__/video-controls.test.ts`
Expected: FAIL — `renderVideoControls` ignores the 2nd arg / camera still present.

- [ ] **Step 3: Write minimal implementation**

Replace `renderVideoControls` in `src/lib/nodes/video-controls.ts`:

```ts
// The motion-control block injected into the compiled prompt. "" when nothing to inject.
// Camera prose is emitted only for text-camera providers (opts.includeCamera, default true) —
// Kling owns the camera via camera_control, so its prompt is camera-silent. Speed is always emitted.
export function renderVideoControls(
  controls: VideoControls,
  opts: { includeCamera?: boolean } = {},
): string {
  const includeCamera = opts.includeCamera ?? true;
  const lines: string[] = [];
  for (const group of VIDEO_CONTROLS) {
    if (group.key === "camera" && !includeCamera) continue;
    const opt = group.options.find((o) => o.value === controls[group.key]);
    if (opt && opt.value !== "auto" && opt.prose) lines.push(`- ${group.label}: ${opt.prose}`);
  }
  if (lines.length === 0) return "";
  return `Motion controls (use these exactly; do not substitute):\n${lines.join("\n")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/nodes/__tests__/video-controls.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/video-controls.ts src/lib/nodes/__tests__/video-controls.test.ts
git commit -m "feat(video-controls): provider-aware camera prose (omit for external-camera)"
```

---

### Task 5: `compileVideoPrompt` selects variant by provider

**Files:**
- Modify: `src/lib/nodes/video-prompt.ts` (`CompileVideoPromptInput`, `compileVideoPrompt`)
- Test: `src/lib/nodes/__tests__/video-prompt.test.ts` (append)

**Interfaces:**
- Consumes: `videoPromptGeneratePromptFor`, `VideoProvider` (Task 3); `renderVideoControls` `opts` (Task 4).
- Produces: `compileVideoPrompt` input gains `targetProvider?: VideoProvider` (default `"veo"`); return shape unchanged (`{ system, user, effectiveInstruction }`), with `system` selected by provider and the camera control line dropped for Kling.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/nodes/__tests__/video-prompt.test.ts`:

```ts
import { compileVideoPrompt } from "../../video-prompt"; // adjust to existing import path in this file

const base = {
  clientContext: "",
  upstream: [],
  instruction: "make it move",
  controls: { camera: "push-in", speed: "dynamic" } as const,
};

describe("compileVideoPrompt provider awareness", () => {
  it("defaults to the text-camera (veo) system and includes camera prose", () => {
    const { system, user } = compileVideoPrompt(base);
    expect(system).toContain("image-to-video prompts for Veo");
    expect(user).toMatch(/Camera:/);
  });

  it("uses the Kling system and drops the camera control line for kling", () => {
    const { system, user } = compileVideoPrompt({ ...base, targetProvider: "kling" });
    expect(system).toContain("image-to-video prompts for Kling");
    expect(user).not.toMatch(/Camera:/);
    expect(user).toMatch(/Speed:/);
  });
});
```

> Note: match the import path already used by the existing tests in this file (`@/lib/nodes/video-prompt` or a relative path).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/nodes/__tests__/video-prompt.test.ts`
Expected: FAIL — `targetProvider` not honored; Kling system not selected.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/nodes/video-prompt.ts`:

Update the import:

```ts
import {
  videoPromptGeneratePromptFor,
  type VideoProvider,
} from "@/prompts/video-prompt-generate";
```

Add to `CompileVideoPromptInput`:

```ts
  targetProvider?: VideoProvider;
```

Inside `compileVideoPrompt`, replace the controls-block line and the return `system`:

```ts
  const targetProvider = input.targetProvider ?? "veo";
  const includeCamera = targetProvider !== "kling";

  const controlsBlock = input.controls
    ? renderVideoControls(input.controls, { includeCamera })
    : "";
  if (controlsBlock) blocks.push(controlsBlock);
```

```ts
  return {
    system: videoPromptGeneratePromptFor(targetProvider).system,
    user: blocks.join("\n\n"),
    effectiveInstruction,
  };
```

(Remove the now-unused direct `videoPromptGeneratePrompt` import if lint flags it; keep it only if still referenced.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/nodes/__tests__/video-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/video-prompt.ts src/lib/nodes/__tests__/video-prompt.test.ts
git commit -m "feat(video-prompt): compile selects prompt variant by targetProvider"
```

---

### Task 6: Node data field + route threading

**Files:**
- Modify: `src/lib/canvas-nodes.ts:81-87` (`VideoPromptNodeData`)
- Modify: `src/app/api/nodes/[id]/video-prompt/route.ts`

**Interfaces:**
- Consumes: `compileVideoPrompt` `targetProvider` (Task 5), `videoPromptGeneratePromptFor` (Task 3).
- Produces: `VideoPromptNodeData.targetProvider?: VideoProvider`; the route accepts `targetProvider` in the POST body and records it in `paramsUsed`.

- [ ] **Step 1: Add the node data field**

In `src/lib/canvas-nodes.ts`, extend `VideoPromptNodeData`:

```ts
import type { VideoProvider } from "@/prompts/video-prompt-generate";
// ...
export type VideoPromptNodeData = {
  title?: string;
  instruction?: string;
  controls?: VideoControls;
  kbSlices?: KBSliceKey[];
  targetProvider?: VideoProvider; // D77: text-camera (veo/sora) vs external-camera (kling)
  parsed?: unknown;
};
```

- [ ] **Step 2: Thread targetProvider through the route**

In `src/app/api/nodes/[id]/video-prompt/route.ts`:

Change the prompt import to the selector:

```ts
import {
  videoPromptGeneratePromptFor,
  type VideoProvider,
} from "@/prompts/video-prompt-generate";
```

Parse and validate the provider from the body (near the `instruction`/`controls` parsing):

```ts
  const VALID_PROVIDERS: VideoProvider[] = ["veo", "openai", "kling"];
  const targetProvider: VideoProvider = VALID_PROVIDERS.includes(
    body?.targetProvider as VideoProvider,
  )
    ? (body?.targetProvider as VideoProvider)
    : "veo";
  const promptSpec = videoPromptGeneratePromptFor(targetProvider);
```

Pass it into `compileVideoPrompt({ ..., targetProvider })`; use `promptSpec.model` for the OpenAI call and `promptSpec.id` / `promptSpec.version` where `videoPromptGeneratePrompt.model/id/version` were used; add `targetProvider` to `paramsUsed` and set `modelUsed: openai:${promptSpec.model}`. Update the body type to include `targetProvider?: unknown`.

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean (no references to a removed `videoPromptGeneratePrompt` symbol; provider typed).

- [ ] **Step 4: Run the video-prompt unit tests (regression)**

Run: `npm test -- src/lib/nodes/__tests__/video-prompt.test.ts src/prompts/__tests__/video-prompt-generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-nodes.ts src/app/api/nodes/[id]/video-prompt/route.ts
git commit -m "feat(video-prompt): persist + thread targetProvider through the generate route"
```

---

### Task 7: Target selector + downstream lock (Video Prompt focus view)

**Files:**
- Create: `src/components/nodes/target-provider-select.tsx`
- Modify: `src/components/nodes/video-prompt-focus-view.tsx`

**Interfaces:**
- Consumes: `findDescendantsOfType` (Task 1), `videoGenClientModelMap` + `DEFAULT_VIDEO_CLIENT_MODEL_ID` (`@/lib/video-gen/client-models`), `ParamChipGroup`, `FieldLabel`, `useCanvasStore`.
- Produces: `TargetProviderSelect` component; the focus view computes the effective provider, sends it to the route, hides the camera grid (breadcrumb) when Kling.

- [ ] **Step 1: Create the selector component**

Create `src/components/nodes/target-provider-select.tsx`:

```tsx
"use client";

import { Cpu } from "lucide-react";
import { FieldLabel } from "./field-label";
import { ParamChipGroup } from "./param-chip-group";
import type { VideoProvider } from "@/prompts/video-prompt-generate";

const OPTIONS: { value: VideoProvider; label: string }[] = [
  { value: "veo", label: "Veo" },
  { value: "kling", label: "Kling" },
  { value: "openai", label: "Sora" },
];

// D77: which video model family this motion prompt is written for. Locks to a connected
// Video Gen node's provider when present (single source of truth); editable otherwise.
export function TargetProviderSelect({
  value,
  onChange,
  lockedLabel,
}: {
  value: VideoProvider;
  onChange: (value: VideoProvider) => void;
  lockedLabel?: string; // set → disabled, shows the reason (e.g. "set by connected video node")
}) {
  return (
    <div className="space-y-2">
      <FieldLabel icon={Cpu} label="Target model" />
      <ParamChipGroup
        options={OPTIONS}
        value={value}
        onValueChange={(v) => onChange(v as VideoProvider)}
        disabled={Boolean(lockedLabel)}
      />
      {lockedLabel && (
        <p className="text-xs text-muted-foreground">{lockedLabel}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the prop and derive the effective provider**

Add `targetProvider` to `VideoPromptFocusViewProps`:

```tsx
  targetProvider: VideoProvider | null;
```

and thread it from the parent node renderer `src/components/nodes/video-prompt-node.tsx` alongside `controls` (pass `data.targetProvider ?? null`). Add imports to `video-prompt-focus-view.tsx`:

```tsx
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { findDescendantsOfType } from "@/lib/canvas/graph";
import { videoGenClientModelMap, DEFAULT_VIDEO_CLIENT_MODEL_ID } from "@/lib/video-gen/client-models";
import { TargetProviderSelect } from "./target-provider-select";
import { Video } from "lucide-react";
import type { VideoProvider } from "@/prompts/video-prompt-generate";
```

Then derive the effective provider inside the component (near the other derived state):

```tsx
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  // D77: connected downstream Video Gen nodes are the single source of truth for the target
  // provider. None connected → the node's own selector value governs.
  const downstreamGen = findDescendantsOfType(nodeId, nodes, edges, "video-gen");
  const providerOf = (modelId?: string) =>
    (videoGenClientModelMap[modelId ?? DEFAULT_VIDEO_CLIENT_MODEL_ID]?.provider ?? "veo") as VideoProvider;
  const downstreamProviders = Array.from(
    new Set(downstreamGen.map((n) => providerOf((n.data as { modelId?: string })?.modelId))),
  );

  const locked = downstreamProviders.length >= 1;
  const mixed = downstreamProviders.length > 1;
  const selectorValue: VideoProvider = targetProvider ?? "veo";
  const effectiveProvider: VideoProvider = mixed
    ? "veo" // provider-neutral
    : locked
      ? downstreamProviders[0]
      : selectorValue;
  const lockedLabel = mixed
    ? "Mixed downstream — writing provider-neutral"
    : locked
      ? `${videoGenClientModelMap[(downstreamGen[0].data as { modelId?: string })?.modelId ?? DEFAULT_VIDEO_CLIENT_MODEL_ID]?.label ?? "Video model"} · set by connected video node`
      : undefined;
```

- [ ] **Step 3: Render the selector and gate the camera grid**

In the compose column, render the selector above the camera control, and swap `CameraSelect` for a breadcrumb when the effective provider is Kling:

```tsx
  <TargetProviderSelect
    value={effectiveProvider}
    onChange={(p) => onPatch({ targetProvider: p })}
    lockedLabel={lockedLabel}
  />

  {effectiveProvider === "kling" ? (
    <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      <Video className="size-3.5 text-primary" strokeWidth={1.5} />
      Camera — set on the connected Kling video node
    </div>
  ) : (
    <CameraSelect
      value={(controls ?? DEFAULT_VIDEO_CONTROLS).camera}
      onChange={(v) => onPatch({ controls: { ...(controls ?? DEFAULT_VIDEO_CONTROLS), camera: v } })}
    />
  )}
```

- [ ] **Step 4: Send the effective provider on generate**

In `runGenerate`, add `targetProvider: effectiveProvider` to the POST body:

```tsx
      body: JSON.stringify({
        instruction: instructionDraft,
        slices,
        controls: controls ?? DEFAULT_VIDEO_CONTROLS,
        targetProvider: effectiveProvider,
      }),
```

- [ ] **Step 5: Verify + manual QA**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.
Manual: open a Video Prompt focus view → Target selector shows; with a Kling gen node connected it locks to "Kling · set by connected video node" and the camera grid becomes the breadcrumb; generating produces a camera-silent prompt.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/target-provider-select.tsx src/components/nodes/video-prompt-focus-view.tsx
git commit -m "feat(video-prompt): Target selector, downstream lock, Kling camera breadcrumb"
```

> If the parent renderer of `VideoPromptFocusView` needs the `targetProvider` prop wired, include that file in this commit.

---

### Task 8: Kling `negative_prompt` default

**Files:**
- Modify: `src/lib/video-gen/params/kling.ts` (`KLING_ADVANCED_BASE` `negative_prompt`)
- Test: `src/lib/video-gen/__tests__/kling-params.test.ts` (append)

**Interfaces:**
- Produces: `negative_prompt.defaultValue` = curated visual-defect list (still `component: "textarea"`, editable).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/video-gen/__tests__/kling-params.test.ts`:

```ts
import { klingLegacyParams } from "../../params/kling"; // match this file's existing import path

it("prefills a visual-defect negative prompt", () => {
  const neg = klingLegacyParams.find((p) => p.name === "negative_prompt");
  expect(neg?.defaultValue).toContain("blurry");
  expect(neg?.defaultValue).toContain("watermark");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/video-gen/__tests__/kling-params.test.ts`
Expected: FAIL — default is `""`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/video-gen/params/kling.ts`, change the `negative_prompt` `defaultValue`:

```ts
    defaultValue:
      "blurry, low quality, distorted, deformed, warped hands, extra fingers, morphing, flickering, jitter, text, watermark, logo",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/video-gen/__tests__/kling-params.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/params/kling.ts src/lib/video-gen/__tests__/kling-params.test.ts
git commit -m "feat(kling): prefill a default negative_prompt of visual defects"
```

---

### Task 9: `camera_move` param + Kling camera grid on the Video Gen node

**Files:**
- Modify: `src/lib/video-gen/params/kling.ts` (add `camera_move`)
- Create: `src/components/nodes/kling-camera-select.tsx`
- Modify: `src/components/nodes/video-gen-params-panel.tsx`

**Interfaces:**
- Consumes: `KLING_CAMERA_TILES`, `klingCameraControl` (Task 2); `ShotTileStrip`; `cameraImage`/`cameraLabel`/`cameraTooltip`/`cameraCaption` from `@/lib/nodes/camera-preview`; `ImageGenParamRow` + `ParamControl` for the axis sliders.
- Produces: `camera_move` select param (default `"static"`); `KlingCameraSelect` component; the params panel renders it for Kling and hides the raw camera param rows.

- [ ] **Step 1: Add the `camera_move` param**

In `src/lib/video-gen/params/kling.ts`, add to `KLING_PRIMARY_BASE` (after `aspect_ratio`):

```ts
  {
    name: "camera_move",
    label: "Camera",
    component: "select",
    group: "primary",
    order: 3,
    visible: true,
    defaultValue: "static",
    constraints: {
      type: "select",
      options: ["static", "push-in", "pull-back", "pan", "tilt", "tracking", "crane", "orbit", "custom"],
    },
  },
```

- [ ] **Step 2: Create the Kling camera grid component**

Create `src/components/nodes/kling-camera-select.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Video } from "lucide-react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { ShotTileStrip } from "./shot-tile-strip";
import { ImageGenParamRow } from "./image-gen-param-row";
import { ParamControl } from "./param-controls";
import { KLING_CAMERA_TILES, klingCameraControl } from "@/lib/video-gen/kling-camera";
import { cameraImage, cameraLabel, cameraTooltip, cameraCaption } from "@/lib/nodes/camera-preview";
import type { ParamSpec } from "@/lib/image-gen/types";

const CUSTOM = { value: "custom", label: "Custom", prose: "Hand-set the camera axes" };
const AXIS_NAMES = ["pan", "tilt", "zoom", "roll", "horizontal_movement", "vertical_movement"];

// D77: Kling camera. The visual grid writes `camera_move`; the Fine-tune expander edits the raw
// axes (custom mode). Reuses the shot ShotTileStrip and the camera-preview label/image helpers.
export function KlingCameraSelect({
  params,
  axisSpecs,
  onParamChange,
}: {
  params: Record<string, unknown>;
  axisSpecs: ParamSpec[]; // the 6 axis specs, for the Fine-tune sliders
  onParamChange: (name: string, value: unknown) => void;
}) {
  const move = String(params.camera_move ?? "static");
  const [fineOpen, setFineOpen] = useState(move === "custom");

  function selectMove(next: string) {
    if (next === "custom") {
      // pre-fill axes from the previously mapped move so "custom" starts where the preset left off
      const cfg = klingCameraControl(move)?.config;
      if (cfg) {
        onParamChange("pan", cfg.pan ?? 0);
        onParamChange("tilt", cfg.tilt ?? 0);
        onParamChange("zoom", cfg.zoom ?? 0);
        onParamChange("roll", cfg.roll ?? 0);
        onParamChange("horizontal_movement", cfg.horizontal ?? 0);
        onParamChange("vertical_movement", cfg.vertical ?? 0);
      }
      setFineOpen(true);
    }
    onParamChange("camera_move", next);
  }

  return (
    <div className="space-y-3">
      <ShotTileStrip
        icon={Video}
        label="Camera"
        tiles={KLING_CAMERA_TILES}
        autoOption={CUSTOM}
        value={move}
        onChange={selectMove}
        tileLabel={cameraLabel}
        tooltip={cameraTooltip}
        caption={cameraCaption}
        mediaSrc={cameraImage}
        columns={4}
      />
      <Accordion multiple={false} value={fineOpen ? "fine" : undefined}>
        <AccordionItem value="fine" className="border-none">
          <AccordionTrigger
            onClick={() => setFineOpen((p) => !p)}
            className="py-1 text-[0.7rem] uppercase tracking-wide text-muted-foreground hover:text-foreground hover:no-underline"
          >
            Fine-tune
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            <div className="flex flex-col gap-4">
              {axisSpecs.map((spec) => (
                <ImageGenParamRow key={spec.name} icon={Video} label={spec.label}>
                  <ParamControl
                    spec={spec}
                    value={params[spec.name] ?? spec.defaultValue}
                    onChange={(v) => {
                      onParamChange(spec.name, v);
                      onParamChange("camera_move", "custom"); // any manual axis edit = custom mode
                    }}
                  />
                </ImageGenParamRow>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
```

> `AXIS_NAMES` is exported-shaped guidance for Step 3's filtering; keep it in sync with the axis params in `params/kling.ts`.

- [ ] **Step 3: Render it for Kling in the params panel**

In `src/components/nodes/video-gen-params-panel.tsx`:

```tsx
import { KlingCameraSelect } from "./kling-camera-select";
// ...
const CAMERA_PARAM_NAMES = new Set([
  "camera_move", "pan", "tilt", "zoom", "roll", "horizontal_movement", "vertical_movement",
]);
```

Inside the component, when the model is Kling, exclude those params from the normal rows and render the grid. After computing `primaryParams`/`advancedParams`, filter:

```tsx
  const isKling = model?.provider === "kling";
  const axisSpecs = (model?.params ?? []).filter(
    (p) => ["pan", "tilt", "zoom", "roll", "horizontal_movement", "vertical_movement"].includes(p.name),
  );
  const primaryRows = primaryParams.filter((p) => !(isKling && CAMERA_PARAM_NAMES.has(p.name)));
  const advancedRows = advancedParams.filter((p) => !(isKling && CAMERA_PARAM_NAMES.has(p.name)));
```

Render `primaryRows`/`advancedRows` instead of `primaryParams`/`advancedParams`, and add the grid after the primary rows when `isKling`:

```tsx
  {isKling && (
    <KlingCameraSelect params={params} axisSpecs={axisSpecs} onParamChange={onParamChange} />
  )}
```

- [ ] **Step 4: Verify + manual QA**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.
Manual: select a Kling model → a 4-col visual camera grid appears (Static…Orbit, no Handheld), a "Custom" chip + "Fine-tune" axes below; the raw axis sliders no longer appear in Advanced; `negative_prompt` shows the prefilled defect list.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/params/kling.ts src/components/nodes/kling-camera-select.tsx src/components/nodes/video-gen-params-panel.tsx
git commit -m "feat(video-gen): Kling visual camera grid (camera_move) + Fine-tune axes"
```

---

### Task 10: `buildKlingRequestBody` maps `camera_move` → `camera_control`

**Files:**
- Modify: `src/lib/video-gen/providers/kling.ts` (`buildKlingRequestBody`)
- Test: `src/lib/video-gen/__tests__/kling-provider.test.ts` (append)

**Interfaces:**
- Consumes: `klingCameraControl` (Task 2).
- Produces: `buildKlingRequestBody` sends `camera_control` from `camera_move` for mapped moves; falls back to the existing axis-based path for `"custom"` and legacy (undefined) params.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/video-gen/__tests__/kling-provider.test.ts`:

```ts
const base = {
  modelName: "kling-v2-6",
  imageBase64: "x",
  mimeType: "image/jpeg",
  prompt: "steam drifts",
  callbackUrl: "https://app/cb",
};

it("maps a camera_move to camera_control", () => {
  const body = buildKlingRequestBody({ ...base, params: { camera_move: "push-in" } });
  expect(body.camera_control).toEqual({ type: "customize", config: expect.objectContaining({ zoom: 5 }) });
});

it("maps orbit to the turn preset", () => {
  const body = buildKlingRequestBody({ ...base, params: { camera_move: "orbit" } });
  expect(body.camera_control).toEqual({ type: "left_turn_forward" });
});

it("omits camera_control for static", () => {
  const body = buildKlingRequestBody({ ...base, params: { camera_move: "static" } });
  expect(body.camera_control).toBeUndefined();
});

it("custom mode uses the axis sliders (legacy path)", () => {
  const body = buildKlingRequestBody({ ...base, params: { camera_move: "custom", zoom: 3 } });
  expect(body.camera_control).toEqual({ type: "customize", config: expect.objectContaining({ zoom: 3 }) });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/video-gen/__tests__/kling-provider.test.ts`
Expected: FAIL — `camera_move` ignored; camera_control derived only from raw axes.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/video-gen/providers/kling.ts`, import the mapper and replace the camera_control block in `buildKlingRequestBody`:

```ts
import { klingCameraControl } from "../kling-camera";
```

```ts
  const move = params.camera_move as string | undefined;

  // Mapped moves come from the visual grid. "custom" (and legacy params with no camera_move) fall
  // back to the proven axis-based path.
  let cameraControl: Record<string, unknown> | undefined;
  if (move && move !== "custom") {
    cameraControl = klingCameraControl(move);
  } else {
    const hasMotion = [pan, tilt, zoom, roll, horizontal, vertical].some((v) => v !== 0);
    cameraControl = hasMotion
      ? { type: "customize", config: { pan, tilt, zoom, roll, horizontal, vertical } }
      : undefined;
  }
```

```ts
  return {
    model_name: modelName,
    image: imageBase64,
    prompt,
    mode: String(params.mode ?? "pro"),
    duration: Number(params.duration ?? 5),
    aspect_ratio: String(params.aspect_ratio ?? "16:9"),
    cfg_scale: Number(params.cfg_scale ?? 0.5),
    ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    ...(cameraControl ? { camera_control: cameraControl } : {}),
    callback_url: callbackUrl,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/video-gen/__tests__/kling-provider.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm test`
Expected: PASS (whole suite green).

```bash
git add src/lib/video-gen/providers/kling.ts src/lib/video-gen/__tests__/kling-provider.test.ts
git commit -m "feat(kling): build camera_control from camera_move (grid + orbit preset)"
```

---

### Task 11: Append ADR D77 to the log

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, after D76)

- [ ] **Step 1: Append the ADR**

Add after the D76 block:

```markdown
### D77 — Video Prompt → Video Gen is provider-aware; Kling camera via `camera_control` *(recorded 2026-07-23; refines D24)*

**Decision.** The motion prompt is shaped for its target provider (`text-camera` for Veo/Sora,
`external-camera` for Kling), selected by a Target selector on the Video Prompt node that locks to a
connected Video Gen node's provider when present. For Kling, camera is driven by the native
`camera_control` param via a curated visual grid on the Video Gen node, and the prompt is written
camera-silent — one camera signal, never two. A default `negative_prompt` is prefilled for Kling.

**Why.** D24 shipped a Veo-only motion prompt; the registry has since grown six Kling models with a
different prompt shape and a native camera API.

**Rejected — text-primary (A).** Simpler/single-node but leaves Kling's camera to prose and the
`negative_prompt` unused.

**Refines** D24. **Originated** `2026-07-23-provider-aware-video-prompt-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): record D77 (provider-aware video prompt + Kling camera_control)"
```

---

## Self-Review

**Spec coverage:**
- §2/§4 target selector + downstream lock → Tasks 6, 7 ✓
- §5 provider-aware prompt (variants, camera-silent, sequential, hype hygiene) → Tasks 3, 4, 5 ✓
- §6 Kling camera grid + Fine-tune → Task 9 ✓
- §7 negative_prompt default → Task 8 ✓
- §10 mapping (incl. axis inversion, orbit preset) → Tasks 2, 10 ✓
- §14 ADR D77 → Task 11 ✓
- New machinery: downstream-edge read → Task 1 ✓

**Type consistency:** `VideoProvider` defined once (Task 3), imported everywhere (Tasks 5, 6, 7). `klingCameraControl`/`KLING_CAMERA_TILES` defined in Task 2, consumed in Tasks 9, 10. `camera_move` param name consistent across Tasks 9, 10 and the `CAMERA_PARAM_NAMES` filter. Provider values `veo|openai|kling` consistent with `VideoGenModelSpec.provider`.

**Known simplifications (intentional, per spec):** mapped-move magnitudes are a fixed `5` (curated presets); custom mode gives full axis control. Sora rides the text-camera path. Task 7 assumes the parent renderer is `video-prompt-node.tsx` — if the focus view is mounted elsewhere, thread the `targetProvider` prop from that mount point instead.

**Open risk carried to execution:** the Kling `left_turn_forward` preset (Orbit) and `type: "customize"` config shape are confirmed against the live Kling API before merge; if Orbit fails, drop it from `KLING_CAMERA_MOVES` (Task 2) — no other task changes.
