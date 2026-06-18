# Video Prompt Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Stage-4 **Video Prompt node** — a synchronous text-LLM node that vision-reads an approved Image Gen still and writes a Veo-ready motion prompt, steered by camera/motion master controls.

**Architecture:** Reuses the node spine (`resolveInputs → compile → runAction → insertVersion → setActive`, D3). Only `compile` + `runAction` are type-specific. `runAction` is **synchronous** (text LLM returns in-request) — none of the async `generations`/Cron machinery (that is the downstream Video Gen node, Stage 4 part 2). The node's defining input is the Image Gen still, whose active output is a **plain public URL string**; it is fed to the LLM as a vision `image_url` part.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), TypeScript, OpenAI SDK (`openai`), Vitest, React Flow (`@xyflow/react`), Supabase.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-06-18-video-prompt-node-design.md` (D24). This plan implements it; where the spec and the real codebase differ, the codebase wins (noted inline).
- **Test runner:** Vitest. Run a single file with `npx vitest run <path>`; full suite with `npm test`. Test idiom: `import { describe, it, expect } from "vitest";`.
- **Pure functions only in `src/lib/nodes/*` and `src/prompts/*`** — no `server-only`, no DB, no React. These are the unit-tested units.
- **No hardcoded colors / third font** (Yuvabe design system, see `AGENTS.md`) in any UI task.
- **Image Gen output contract (verified in code):** an Image Gen node's active version `output` is a **string** = a Supabase public image URL. `getNodeOutput("image-gen")` returns that URL as text. Approval is `node_versions.decision` = `"pass" | "fail" | null` (NOT "approved"/"rejected").
- **Commit after every task.** Conventional commits, end every message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Branch:** `feat/video-prompt-node` (already created off the merged `main`).

---

## File Structure

**Create (pure, unit-tested):**
- `src/lib/nodes/video-controls.ts` — camera/speed master-controls catalog (mirrors `shot-controls.ts`)
- `src/lib/nodes/render-shot-for-video.ts` — `renderShotForVideo` (the motion-relevant slice of a Shot)
- `src/prompts/video-prompt-generate.ts` — the "motion director" system prompt (versioned record)
- `src/lib/nodes/video-prompt.ts` — `compileVideoPrompt` (the pure `compile` step)

**Create (server / UI):**
- `src/app/api/nodes/[id]/video-prompt/route.ts` — synchronous generate route (clone of `generate/route.ts`)
- `src/components/nodes/video-prompt-node.tsx` — canvas card (mirrors `prompt-node.tsx`)
- `src/components/nodes/video-prompt-focus-view.tsx` — focus view (mirrors `prompt-focus-view.tsx`)

**Modify:**
- `src/lib/canvas-nodes.ts` — `VideoPromptNodeData` + `AppNode` member + `VALID_CONNECTIONS` edges
- `src/lib/nodes/node-output.ts` — `video-prompt` case
- `src/lib/nodes/compose-message.ts` — extend `isVisionAttachment` for `image-gen`
- `src/lib/nodes/resolve-inputs.ts` — `mapUpstreamForVideo` (pure) + `resolveVideoPromptInputs` (DB wrapper)
- `src/components/canvas/canvas.tsx` — register `"video-prompt": VideoPromptNode` in `nodeTypes`

**Design note — why a dedicated resolver (`resolveVideoPromptInputs`) instead of reusing `resolvePromptInputs`:** a Shot renders *differently* for a video prompt (action/objective) than for an image prompt (visual description, D23), and `getNodeOutput("shot")` only knows the image rendering. Also the Image Gen still must travel as a **vision** part, not as a URL string in the text. A sibling resolver keeps the existing image-Prompt path **untouched** (zero regression) while applying the video-specific mapping. `isVisionAttachment` is extended globally but is **safe** for the image-Prompt path because that path never sets an `image-gen` upstream's `fileUrl`.

---

## Task 1: VideoControls master-controls catalog

**Files:**
- Create: `src/lib/nodes/video-controls.ts`
- Test: `src/lib/nodes/__tests__/video-controls.test.ts`

**Interfaces:**
- Produces: `type VideoControlKey = "camera" | "speed"`; `type VideoControls = Record<VideoControlKey, string>`; `const DEFAULT_VIDEO_CONTROLS: VideoControls`; `const VIDEO_CONTROLS: { key: VideoControlKey; label: string; options: { value: string; label: string; prose: string }[] }[]`; `function renderVideoControls(controls: VideoControls): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/nodes/__tests__/video-controls.test.ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_VIDEO_CONTROLS,
  renderVideoControls,
  VIDEO_CONTROLS,
} from "../video-controls";

describe("video-controls", () => {
  it("defaults every control to 'auto'", () => {
    expect(DEFAULT_VIDEO_CONTROLS).toEqual({ camera: "auto", speed: "auto" });
  });

  it("renders nothing when all controls are auto", () => {
    expect(renderVideoControls({ camera: "auto", speed: "auto" })).toBe("");
  });

  it("renders the camera move as a standalone clause", () => {
    const out = renderVideoControls({ camera: "push-in", speed: "auto" });
    expect(out).toContain("Camera:");
    expect(out).toContain("a slow push-in toward the subject");
    expect(out).not.toContain("Speed:"); // speed is auto → omitted
  });

  it("renders multiple non-auto controls", () => {
    const out = renderVideoControls({ camera: "orbit", speed: "dynamic" });
    expect(out).toContain("a gentle orbit around the subject");
    expect(out).toContain("Speed:");
  });

  it("every catalog option has a value, label, and (for non-auto) prose", () => {
    for (const group of VIDEO_CONTROLS) {
      for (const o of group.options) {
        expect(o.value).toBeTruthy();
        expect(o.label).toBeTruthy();
        if (o.value !== "auto") expect(o.prose).toBeTruthy();
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/video-controls.test.ts`
Expected: FAIL — cannot resolve `../video-controls`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/nodes/video-controls.ts
// Master video controls for the Video Prompt node (D24). Mirrors shot-controls.ts.
// Veo image-to-video lever is *camera movement* + *motion energy* — lens/lighting drop
// out (the start frame already fixed them). Pre-rendered, curated catalog; option lists
// are a data constant refined later from eval results (data change, not architecture).

export type VideoControlKey = "camera" | "speed";

export type VideoControlOption = {
  value: string;
  label: string;
  prose: string; // injected into the prompt; "" for the Auto (no-constraint) option
};

export type VideoControls = Record<VideoControlKey, string>;

export const VIDEO_CONTROLS: {
  key: VideoControlKey;
  label: string;
  options: VideoControlOption[];
}[] = [
  {
    key: "camera",
    label: "Camera",
    options: [
      { value: "auto", label: "Auto", prose: "" },
      { value: "static", label: "Static", prose: "a locked-off static frame" },
      { value: "push-in", label: "Push in", prose: "a slow push-in toward the subject" },
      { value: "pull-back", label: "Pull back", prose: "a smooth pull-back revealing the scene" },
      { value: "orbit", label: "Orbit", prose: "a gentle orbit around the subject" },
      { value: "pan", label: "Pan", prose: "a steady pan across the frame" },
      { value: "tilt", label: "Tilt", prose: "a deliberate vertical tilt" },
      { value: "handheld", label: "Handheld", prose: "subtle handheld movement" },
      { value: "crane", label: "Crane", prose: "a rising crane move" },
    ],
  },
  {
    key: "speed",
    label: "Speed",
    options: [
      { value: "auto", label: "Auto", prose: "" },
      { value: "subtle", label: "Subtle", prose: "subtle, slow motion energy" },
      { value: "moderate", label: "Moderate", prose: "a moderate, natural pace" },
      { value: "dynamic", label: "Dynamic", prose: "dynamic, energetic motion" },
    ],
  },
];

export const DEFAULT_VIDEO_CONTROLS: VideoControls = {
  camera: "auto",
  speed: "auto",
};

// The motion-control block injected into the compiled prompt. "" when every control is Auto.
// Camera is emitted first as its own clause — Veo parses camera direction best when it is
// separated from the subject action.
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/video-controls.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/video-controls.ts src/lib/nodes/__tests__/video-controls.test.ts
git commit -m "feat(video-prompt): add VideoControls camera/speed catalog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `renderShotForVideo` — the motion-relevant slice of a Shot

**Files:**
- Create: `src/lib/nodes/render-shot-for-video.ts`
- Test: `src/lib/nodes/__tests__/render-shot-for-video.test.ts`

**Interfaces:**
- Consumes: `ReelScript` from `@/lib/nodes/reel-script`.
- Produces: `function renderShotForVideo(script: ReelScript | null): string`.

**Context:** D23's `renderShotForImage` keeps the visual description + medium for an *image*. A *motion* prompt instead wants the **action / movement intent** + the **strategic objective** (the motion driver), and still drops overlay copy (on-screen text, caption, CTA) and audio boilerplate. The start frame already supplies the visuals.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/nodes/__tests__/render-shot-for-video.test.ts
import { describe, it, expect } from "vitest";
import { renderShotForVideo } from "../render-shot-for-video";
import type { ReelScript } from "@/lib/nodes/reel-script";

const script = {
  title: "Prakriti Reel 12",
  strategic_objective: "create product desire through tactile, slow luxury visuals",
  ai_production_type: "AI photoreal",
  caption: "Shop now — link in bio",
  on_screen_text: { intro: "NEW" },
  voiceover: "No voiceover",
  music_sound: "Ambient pad, 50 words of boilerplate...",
  cta: "Shop now",
  visual_script: {
    shots: [{ description: "condensation beads slide down a chilled amber bottle", duration: "3s" }],
  },
} as unknown as ReelScript;

describe("renderShotForVideo", () => {
  it("returns '' for null", () => {
    expect(renderShotForVideo(null)).toBe("");
  });

  it("keeps the shot action and the strategic objective", () => {
    const out = renderShotForVideo(script);
    expect(out).toContain("condensation beads slide down a chilled amber bottle");
    expect(out).toContain("create product desire");
  });

  it("drops overlay copy and audio boilerplate", () => {
    const out = renderShotForVideo(script);
    expect(out).not.toContain("Shop now");      // caption / cta
    expect(out).not.toContain("NEW");           // on_screen_text
    expect(out).not.toContain("boilerplate");   // music_sound
    expect(out).not.toContain("No voiceover");  // voiceover
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/render-shot-for-video.test.ts`
Expected: FAIL — cannot resolve `../render-shot-for-video`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/nodes/render-shot-for-video.ts
// Render a Shot for a MOTION prompt (D24, sibling of renderShotForImage / D23). The start
// frame already supplies subject/setting/style, so a motion prompt only needs what should
// HAPPEN across the clip: the shot's action description + the strategic objective (the
// motion driver). Overlay copy (on-screen text, caption, CTA) and audio (voiceover, music)
// carry zero motion signal and are dropped.
import type { ReelScript } from "@/lib/nodes/reel-script";

export function renderShotForVideo(script: ReelScript | null): string {
  if (!script) return "";
  const lines: string[] = [];
  const shot = script.visual_script?.shots?.[0];
  if (shot?.description && shot.description.trim()) {
    lines.push(`Action: ${shot.description.trim()}`);
  }
  if (script.strategic_objective && script.strategic_objective.trim()) {
    lines.push(`Objective: ${script.strategic_objective.trim()}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/render-shot-for-video.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/render-shot-for-video.ts src/lib/nodes/__tests__/render-shot-for-video.test.ts
git commit -m "feat(video-prompt): add renderShotForVideo (action + objective slice)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `video-prompt-generate` system prompt

**Files:**
- Create: `src/prompts/video-prompt-generate.ts`
- Test: `src/prompts/__tests__/video-prompt-generate.test.ts`

**Interfaces:**
- Produces: `export const videoPromptGeneratePrompt = { id: string; version: number; model: string; system: string }`.

**Context:** Mirrors `src/prompts/prompt-generate.ts` — a single, versioned, evaluable record. The system prompt is a "motion director" encoding the verified Veo 3.1 structure (the design spec §5 and the Veo-3.1 guide): **Cinematography + Action**, camera as a **standalone clause**, **no scene re-description** (the start frame carries subject/setting/style).

- [ ] **Step 1: Write the failing test**

```ts
// src/prompts/__tests__/video-prompt-generate.test.ts
import { describe, it, expect } from "vitest";
import { videoPromptGeneratePrompt } from "../video-prompt-generate";

describe("videoPromptGeneratePrompt", () => {
  it("is a versioned, evaluable record", () => {
    expect(videoPromptGeneratePrompt.id).toBe("video-prompt-generate");
    expect(videoPromptGeneratePrompt.version).toBeGreaterThanOrEqual(1);
    expect(typeof videoPromptGeneratePrompt.model).toBe("string");
    expect(videoPromptGeneratePrompt.system.length).toBeGreaterThan(100);
  });

  it("instructs no scene re-description (image-to-video grounding)", () => {
    expect(videoPromptGeneratePrompt.system.toLowerCase()).toContain("do not re-describe");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/prompts/__tests__/video-prompt-generate.test.ts`
Expected: FAIL — cannot resolve `../video-prompt-generate`.

- [ ] **Step 3: Write the implementation**

```ts
// src/prompts/video-prompt-generate.ts
// Video-prompt-generate — a single, evaluable, *versioned* record (mirrors prompt-generate.ts).
// v1: "motion director" for Veo 3.1 image-to-video. Structure verified against the Veo 3.1
// prompting guide: for image-to-video the prompt carries only Cinematography (camera) + Action
// (what moves); the start frame supplies Subject/Context/Style. Camera is a standalone clause.
// Refs: https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1
//       https://deepmind.google/models/veo/prompt-guide/
export const videoPromptGeneratePrompt = {
  id: "video-prompt-generate",
  version: 1,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Veo 3.1.
A still image (the first frame) is provided. Your job is to describe how that frame should
come to life over roughly 8 seconds.

OUTPUT FORMAT
One short prose paragraph — no headers, no bullet points, no preamble, no explanation.
40–90 words. Lead with the camera movement as its own clause, then the action.

STRUCTURE (image-to-video)
1. Camera movement — a single, explicit camera move as a standalone clause ("Slow push-in.",
   "Static locked-off frame.", "Gentle orbit."). Veo parses camera direction best when it is
   separated from the subject action.
2. Action — what physically moves in the scene (secondary motion: steam drifts, fabric sways,
   light shifts, liquid pours). Keep it grounded in what is already visible in the frame.

DO NOT re-describe the scene. The first frame already carries the subject, setting, lighting,
palette, and style — repeating them fights the image. Never restate subject appearance, wardrobe,
location, or color. Never invent new objects or people not in the frame.

WORDS TO AVOID
Do not use: "cinematic masterpiece", "ultra realistic", "8K", "stunning", "beautiful".

If motion controls are provided, honor them exactly.`,
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/prompts/__tests__/video-prompt-generate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/prompts/video-prompt-generate.ts src/prompts/__tests__/video-prompt-generate.test.ts
git commit -m "feat(video-prompt): add video-prompt-generate motion-director system prompt

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `compileVideoPrompt` — the pure `compile` step

**Files:**
- Create: `src/lib/nodes/video-prompt.ts`
- Test: `src/lib/nodes/__tests__/video-prompt.test.ts`

**Interfaces:**
- Consumes: `videoPromptGeneratePrompt` (Task 3); `renderVideoControls`, `VideoControls` (Task 1).
- Produces: `const DEFAULT_MOTION_INSTRUCTION: string`; `type CompileVideoPromptInput = { clientContext: string; upstream: { label: string; text: string; type?: string }[]; instruction: string; controls?: VideoControls }`; `function compileVideoPrompt(input: CompileVideoPromptInput): { system: string; user: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/nodes/__tests__/video-prompt.test.ts
import { describe, it, expect } from "vitest";
import { compileVideoPrompt, DEFAULT_MOTION_INSTRUCTION } from "../video-prompt";

describe("compileVideoPrompt", () => {
  it("uses the default motion instruction when none is given", () => {
    const { user } = compileVideoPrompt({
      clientContext: "", upstream: [], instruction: "", controls: { camera: "auto", speed: "auto" },
    });
    expect(user).toContain(DEFAULT_MOTION_INSTRUCTION);
  });

  it("injects the camera control as a standalone motion-controls block", () => {
    const { user } = compileVideoPrompt({
      clientContext: "", upstream: [], instruction: "let steam rise",
      controls: { camera: "push-in", speed: "auto" },
    });
    expect(user).toContain("a slow push-in toward the subject");
    expect(user).toContain("let steam rise");
  });

  it("includes brand context and a shot's action block", () => {
    const { user } = compileVideoPrompt({
      clientContext: "Brand: warm, slow luxury",
      upstream: [{ label: "Shot", text: "Action: condensation slides down the bottle", type: "shot" }],
      instruction: "",
      controls: { camera: "auto", speed: "auto" },
    });
    expect(user).toContain("Brand context:");
    expect(user).toContain("condensation slides down the bottle");
  });

  it("returns the motion-director system prompt", () => {
    const { system } = compileVideoPrompt({
      clientContext: "", upstream: [], instruction: "", controls: { camera: "auto", speed: "auto" },
    });
    expect(system.toLowerCase()).toContain("motion director");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/video-prompt.test.ts`
Expected: FAIL — cannot resolve `../video-prompt`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/nodes/video-prompt.ts
// The Video Prompt node's `compile` step — pure: (client context + upstream outputs +
// instruction + controls) → the model payload. The `user` string is the visible "final
// compiled prompt" the PRD requires be shown before generation (D3). Mirrors prompt.ts.
import { videoPromptGeneratePrompt } from "@/prompts/video-prompt-generate";
import { renderVideoControls, type VideoControls } from "./video-controls";

// Sent when the operator leaves the Inline box blank. Exported so the focus view can show
// the exact sentence the model will receive.
export const DEFAULT_MOTION_INSTRUCTION =
  "Describe how the still should move over ~8 seconds — camera movement first, then the secondary motion already implied by the frame.";

export type CompileVideoPromptInput = {
  clientContext: string;
  upstream: { label: string; text: string; type?: string }[];
  instruction: string;
  controls?: VideoControls;
};

export function compileVideoPrompt(input: CompileVideoPromptInput): { system: string; user: string } {
  const blocks: string[] = [];

  if (input.clientContext.trim()) {
    blocks.push(`Brand context:\n${input.clientContext.trim()}`);
  }
  for (const u of input.upstream) {
    if (!u.text.trim()) continue;
    if (u.type === "shot") {
      blocks.push(`Motion context for this shot:\n${u.text.trim()}`);
    } else {
      blocks.push(`${u.label}:\n${u.text.trim()}`);
    }
  }

  const controlsBlock = input.controls ? renderVideoControls(input.controls) : "";
  if (controlsBlock) blocks.push(controlsBlock);

  const instruction = input.instruction.trim() || DEFAULT_MOTION_INSTRUCTION;
  blocks.push(`Instruction:\n${instruction}`);

  return { system: videoPromptGeneratePrompt.system, user: blocks.join("\n\n") };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/video-prompt.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/video-prompt.ts src/lib/nodes/__tests__/video-prompt.test.ts
git commit -m "feat(video-prompt): add compileVideoPrompt pure compile step

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Register the `video-prompt` node type + connections + output case

**Files:**
- Modify: `src/lib/canvas-nodes.ts` (add type, union member, `VALID_CONNECTIONS` edges)
- Modify: `src/lib/nodes/node-output.ts` (add `video-prompt` case)
- Test: `src/lib/__tests__/video-prompt-connections.test.ts`

**Interfaces:**
- Consumes: `VideoControls` (Task 1), `KBSliceKey`.
- Produces: `type VideoPromptNodeData`; `"video-prompt"` registered in `AppNode` + `VALID_CONNECTIONS`; `getNodeOutput` handles `"video-prompt"`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/video-prompt-connections.test.ts
import { describe, it, expect } from "vitest";
import { VALID_CONNECTIONS } from "@/lib/canvas-nodes";
import { getNodeOutput } from "@/lib/nodes/node-output";

describe("video-prompt connections", () => {
  it("image-gen, shot, file, draw, text may connect to video-prompt", () => {
    expect(VALID_CONNECTIONS["image-gen"]).toContain("video-prompt");
    expect(VALID_CONNECTIONS["shot"]).toContain("video-prompt");
    expect(VALID_CONNECTIONS["file"]).toContain("video-prompt");
    expect(VALID_CONNECTIONS["draw"]).toContain("video-prompt");
    expect(VALID_CONNECTIONS["text"]).toContain("video-prompt");
  });

  it("video-prompt may connect to video-gen only", () => {
    expect(VALID_CONNECTIONS["video-prompt"]).toEqual(["video-gen"]);
  });
});

describe("getNodeOutput for video-prompt", () => {
  it("returns the active version's text output", () => {
    expect(getNodeOutput({ type: "video-prompt", data: {}, activeOutput: "Slow push-in. Steam rises." }))
      .toBe("Slow push-in. Steam rises.");
  });
  it("returns '' when no active output", () => {
    expect(getNodeOutput({ type: "video-prompt", data: {}, activeOutput: null })).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/video-prompt-connections.test.ts`
Expected: FAIL — `VALID_CONNECTIONS["video-prompt"]` is undefined; `getNodeOutput` falls through to default.

- [ ] **Step 3a: Add the data type + union member + edges in `canvas-nodes.ts`**

Add after `PromptNodeData` (near line 53):

```ts
export type VideoPromptNodeData = {
  title?: string;
  instruction?: string;         // operator steer ("emphasize the pour; let steam rise")
  controls?: VideoControls;     // camera move + motion speed
  kbSlices?: KBSliceKey[];      // ambient brand tone, like the Prompt node
  parsed?: unknown;             // D19: active version output (motion prompt text) — display only
};
```

Add the import at the top of `canvas-nodes.ts` (it uses only `import type` elsewhere; `VideoControls` is a type, so keep that contract):

```ts
import type { VideoControls } from "@/lib/nodes/video-controls";
```

Add to the `AppNode` union (after the `image-gen` member, line ~84):

```ts
  | Node<VideoPromptNodeData, "video-prompt">;
```

Replace the `VALID_CONNECTIONS` map body so the new edges are present (D24 / spec §2). The existing `prompt → video-gen` stays as the fallback path:

```ts
export const VALID_CONNECTIONS: Record<string, readonly string[]> = {
  kb:             ["script"],
  script:         ["prompt"],
  shot:           ["prompt", "video-prompt"],
  file:           ["prompt", "image-gen", "video-prompt"],
  draw:           ["prompt", "image-gen", "video-prompt"],
  text:           ["prompt", "video-prompt"],
  prompt:         ["prompt", "image-gen", "video-gen"],
  "image-gen":    ["prompt", "video-gen", "video-prompt"],
  "video-prompt": ["video-gen"],
  "video-gen":    [],
} as const;
```

- [ ] **Step 3b: Add the `video-prompt` case in `node-output.ts`**

Add immediately after the `case "image-gen":` block (line ~30):

```ts
    case "video-prompt":
      // Output is the generated motion prompt text (active version), like the Prompt node.
      return typeof node.activeOutput === "string" ? node.activeOutput.trim() : "";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/video-prompt-connections.test.ts`
Then the existing connection test to confirm no regression: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/nodes/node-output.ts src/lib/__tests__/video-prompt-connections.test.ts
git commit -m "feat(video-prompt): register node type, connections, and output case

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Vision wiring — `isVisionAttachment` for image-gen + `mapUpstreamForVideo`

**Files:**
- Modify: `src/lib/nodes/compose-message.ts` (extend `isVisionAttachment`)
- Modify: `src/lib/nodes/resolve-inputs.ts` (add `mapUpstreamForVideo` pure helper)
- Test: `src/lib/nodes/__tests__/compose-message.test.ts`
- Test: `src/lib/nodes/__tests__/map-upstream-for-video.test.ts`

**Interfaces:**
- Consumes: `UpstreamPreview` (from `resolve-inputs`); `renderShotForVideo` (Task 2); `getNodeOutput`.
- Produces: `isVisionAttachment` now also matches `image-gen` upstreams that carry a `fileUrl`; `function mapUpstreamForVideo(u: RawUpstream): UpstreamPreview` where `type RawUpstream = { nodeId: string; versionId: string | null; type: string; data: Record<string, unknown>; activeOutput: unknown }`.

**Why safe:** the image-Prompt path (`resolvePromptInputs`) never sets an `image-gen` upstream's `fileUrl`, so the new `isVisionAttachment` branch can only fire on the video path, which sets it via `mapUpstreamForVideo`. Regression test below pins this.

- [ ] **Step 1a: Write the failing test for `isVisionAttachment` (via `buildUserContent`)**

`isVisionAttachment` is module-private; assert its effect through the exported `buildUserContent`.

```ts
// src/lib/nodes/__tests__/compose-message.test.ts
import { describe, it, expect } from "vitest";
import { buildUserContent } from "../compose-message";
import type { UpstreamPreview } from "../resolve-inputs";

const base = { nodeId: "n", versionId: null, label: "X", text: "" };

describe("buildUserContent vision handling", () => {
  it("treats an image-gen upstream WITH a fileUrl as a vision part", () => {
    const up: UpstreamPreview[] = [
      { ...base, type: "image-gen", fileUrl: "https://x/img.png", fileKind: "image" },
    ];
    const content = buildUserContent("PROMPT", up);
    expect(Array.isArray(content)).toBe(true);
    expect(content).toContainEqual({ type: "image_url", image_url: { url: "https://x/img.png", detail: "auto" } });
  });

  it("does NOT treat an image-gen upstream WITHOUT a fileUrl as vision (image-Prompt path)", () => {
    const up: UpstreamPreview[] = [{ ...base, type: "image-gen", text: "https://x/img.png" }];
    const content = buildUserContent("PROMPT", up);
    expect(content).toBe("PROMPT"); // plain string — no vision part
  });
});
```

- [ ] **Step 1b: Run it to verify the first case fails**

Run: `npx vitest run src/lib/nodes/__tests__/compose-message.test.ts`
Expected: FAIL — the image-gen-with-fileUrl case returns a plain string (no vision part yet).

- [ ] **Step 2: Extend `isVisionAttachment` in `compose-message.ts`**

Replace the function body (lines 27–35) with:

```ts
function isVisionAttachment(u: UpstreamPreview): boolean {
  const hasImageUrl = typeof u.fileUrl === "string" && u.fileUrl.length > 0;
  // File / Draw image uploads (not in extraction-only mode).
  if ((u.type === "file" || u.type === "draw") && u.fileKind === "image" && hasImageUrl && !u.useLlm) {
    return true;
  }
  // An Image Gen still: its output IS the image. It only carries a fileUrl on the video path
  // (mapUpstreamForVideo); the image-Prompt path never sets it, so this cannot fire there.
  if (u.type === "image-gen" && hasImageUrl) return true;
  return false;
}
```

- [ ] **Step 3: Run the compose-message test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/compose-message.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4a: Write the failing test for `mapUpstreamForVideo`**

```ts
// src/lib/nodes/__tests__/map-upstream-for-video.test.ts
import { describe, it, expect } from "vitest";
import { mapUpstreamForVideo } from "../resolve-inputs";

describe("mapUpstreamForVideo", () => {
  it("exposes an image-gen still as a vision fileUrl, with no text leak", () => {
    const out = mapUpstreamForVideo({
      nodeId: "i", versionId: "v1", type: "image-gen", data: {}, activeOutput: "https://x/still.png",
    });
    expect(out.fileUrl).toBe("https://x/still.png");
    expect(out.fileKind).toBe("image");
    expect(out.text).toBe(""); // the URL must NOT appear as text
  });

  it("renders a shot via renderShotForVideo (action/objective, not the image slice)", () => {
    const out = mapUpstreamForVideo({
      nodeId: "s", versionId: "v2", type: "shot", activeOutput: null,
      data: { script: { strategic_objective: "slow luxury", visual_script: { shots: [{ description: "steam rises" }] } } },
    });
    expect(out.text).toContain("steam rises");
    expect(out.text).toContain("slow luxury");
  });

  it("passes a text/note node through as text", () => {
    const out = mapUpstreamForVideo({
      nodeId: "t", versionId: null, type: "text", data: { text: "keep it calm" }, activeOutput: null,
    });
    expect(out.text).toBe("keep it calm");
    expect(out.fileUrl).toBeUndefined();
  });
});
```

- [ ] **Step 4b: Run it to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/map-upstream-for-video.test.ts`
Expected: FAIL — `mapUpstreamForVideo` not exported.

- [ ] **Step 5: Add `mapUpstreamForVideo` + `resolveVideoPromptInputs` to `resolve-inputs.ts`**

Add the imports near the top:

```ts
import { renderShotForVideo } from "@/lib/nodes/render-shot-for-video";
import type { ReelScript } from "@/lib/nodes/reel-script";
```

Add (after the `UpstreamPreview` type and the existing `resolvePromptInputs`):

```ts
export type RawUpstream = {
  nodeId: string;
  versionId: string | null;
  type: string;
  data: Record<string, unknown>;
  activeOutput: unknown;
};

// Pure mapping of one upstream node into a video-prompt UpstreamPreview. Differs from the
// image path in two ways: a Shot renders via renderShotForVideo (action/objective, not the
// D23 image slice), and an Image Gen still travels as a VISION fileUrl with no text leak.
export function mapUpstreamForVideo(u: RawUpstream): UpstreamPreview {
  const base: UpstreamPreview = {
    nodeId: u.nodeId,
    versionId: u.versionId,
    label: TYPE_LABEL[u.type] ?? u.type,
    type: u.type,
    text: "",
  };

  if (u.type === "image-gen") {
    // The still's URL is the active output (a string). Feed it as vision, never as text.
    const url = typeof u.activeOutput === "string" ? u.activeOutput : undefined;
    return { ...base, text: "", fileUrl: url, fileKind: "image" };
  }
  if (u.type === "shot") {
    return { ...base, text: renderShotForVideo((u.data.script ?? null) as ReelScript | null) };
  }
  if (u.type === "file" || u.type === "draw") {
    return {
      ...base,
      text: getNodeOutput({ type: u.type, data: u.data, activeOutput: u.activeOutput }),
      fileUrl: u.data.fileUrl as string | undefined,
      fileKind: u.data.fileKind as string | undefined,
      useLlm: u.type === "file" ? (u.data.useLlm as boolean | undefined) : undefined,
    };
  }
  return { ...base, text: getNodeOutput({ type: u.type, data: u.data, activeOutput: u.activeOutput }) };
}
```

Add `TYPE_LABEL` entries for the new/related types if missing (`"video-prompt": "Video Prompt"`, `"image-gen": "Image"`).

Then the DB wrapper (mirrors `resolvePromptInputs`, but maps via `mapUpstreamForVideo`):

```ts
export async function resolveVideoPromptInputs(
  nodeId: string,
  slicesInput: unknown,
): Promise<ResolvedPromptInputs | null> {
  const kbCtx = await getNodeActiveKB(nodeId);
  if (!kbCtx) return null;
  const slices = normalizeSlices(slicesInput);
  const clientContext = kbCtx.kb ? buildParseContext(kbCtx.kb, slices) : "";
  const ups = await getUpstreamOutputs(nodeId);
  const upstream = ups.map((u) =>
    mapUpstreamForVideo({ nodeId: u.nodeId, versionId: u.versionId, type: u.type, data: u.data, activeOutput: u.activeOutput }),
  );
  return { clientContext, kbVersionId: kbCtx.kbVersionId, slices, upstream };
}
```

- [ ] **Step 6: Run all touched tests + the existing prompt/resolve tests to verify no regression**

Run: `npx vitest run src/lib/nodes/__tests__/map-upstream-for-video.test.ts src/lib/nodes/__tests__/compose-message.test.ts`
Then: `npm test` (full suite — confirm the image-Prompt path tests still pass).
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/nodes/compose-message.ts src/lib/nodes/resolve-inputs.ts src/lib/nodes/__tests__/compose-message.test.ts src/lib/nodes/__tests__/map-upstream-for-video.test.ts
git commit -m "feat(video-prompt): vision-wire image-gen still + map shots for motion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: The synchronous generate route

**Files:**
- Create: `src/app/api/nodes/[id]/video-prompt/route.ts`

**Interfaces:**
- Consumes: `resolveVideoPromptInputs` (Task 6), `compileVideoPrompt` (Task 4), `videoPromptGeneratePrompt` (Task 3), `buildUserContent`, `insertVersion`/`setActiveVersion`, `createOpenAI`, `apiOk`/`apiError`, `VideoControls`/`DEFAULT_VIDEO_CONTROLS` (Task 1).
- Produces: `POST /api/nodes/:id/video-prompt` → `{ output, versionId, compiled }`.

This route is a near-clone of `src/app/api/nodes/[id]/generate/route.ts` (Task verified that file). Verification is manual/integration (it calls OpenAI + DB), so there is no unit test step — instead it is exercised end-to-end in Task 8's manual checklist.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/nodes/[id]/video-prompt/route.ts
import { createOpenAI } from "@/lib/openai/server";
import { resolveVideoPromptInputs } from "@/lib/nodes/resolve-inputs";
import { compileVideoPrompt } from "@/lib/nodes/video-prompt";
import { buildUserContent } from "@/lib/nodes/compose-message";
import { videoPromptGeneratePrompt } from "@/prompts/video-prompt-generate";
import { DEFAULT_VIDEO_CONTROLS, type VideoControls } from "@/lib/nodes/video-controls";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { apiError, apiOk } from "@/lib/api/route-helpers";

function normalizeControls(input: unknown): VideoControls {
  const c = (input ?? {}) as Record<string, unknown>;
  return {
    camera: typeof c.camera === "string" ? c.camera : DEFAULT_VIDEO_CONTROLS.camera,
    speed: typeof c.speed === "string" ? c.speed : DEFAULT_VIDEO_CONTROLS.speed,
  };
}

// POST /api/nodes/:id/video-prompt — the Video Prompt node's runAction: resolve inputs
// (KB + upstream, with the Image Gen still as a vision part), compile, call the text LLM
// synchronously, append a version, move the active pointer. Mirrors the Prompt generate route.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: nodeId } = await params;
  const body = (await req.json().catch(() => null)) as
    | { instruction?: unknown; slices?: unknown; controls?: unknown }
    | null;
  const instruction = typeof body?.instruction === "string" ? body.instruction : "";
  const controls = normalizeControls(body?.controls);

  const resolved = await resolveVideoPromptInputs(nodeId, body?.slices);
  if (!resolved) return apiError("Node not found.", 404);

  const { system, user } = compileVideoPrompt({
    clientContext: resolved.clientContext,
    upstream: resolved.upstream,
    instruction,
    controls,
  });
  const userContent = buildUserContent(user, resolved.upstream);

  try {
    const openai = createOpenAI();
    const completion = await openai.chat.completions.create({
      model: videoPromptGeneratePrompt.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    });
    const output = completion.choices[0]?.message?.content?.trim() ?? "";

    const version = await insertVersion({
      nodeId,
      inputsUsed: {
        upstream: resolved.upstream.map((u) => ({ nodeId: u.nodeId, versionId: u.versionId })),
        kbVersionId: resolved.kbVersionId,
        kbSlices: resolved.slices,
      },
      paramsUsed: {
        instruction,
        controls,
        promptId: videoPromptGeneratePrompt.id,
        promptVersion: videoPromptGeneratePrompt.version,
        tokensUsed: completion.usage ?? null,
      },
      modelUsed: `openai:${videoPromptGeneratePrompt.model}`,
      output,
    });
    await setActiveVersion(nodeId, version.id);

    return apiOk({ output, versionId: version.id, compiled: user });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    await insertVersion({
      nodeId,
      paramsUsed: {
        instruction,
        promptId: videoPromptGeneratePrompt.id,
        promptVersion: videoPromptGeneratePrompt.version,
      },
      modelUsed: `openai:${videoPromptGeneratePrompt.model}`,
      error: message,
    });
    return apiError(message, 500);
  }
}
```

- [ ] **Step 2: Type-check / build the route**

Run: `npx tsc --noEmit` (or `npm run build`)
Expected: no type errors in the new route.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/nodes/[id]/video-prompt/route.ts"
git commit -m "feat(video-prompt): add synchronous video-prompt generate route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Node component + focus view + canvas registration

**Files:**
- Create: `src/components/nodes/video-prompt-node.tsx` (mirror `prompt-node.tsx`)
- Create: `src/components/nodes/video-prompt-focus-view.tsx` (mirror `prompt-focus-view.tsx`)
- Modify: `src/components/canvas/canvas.tsx` (register `"video-prompt": VideoPromptNode` in `nodeTypes`)

**Interfaces:**
- Consumes: `VideoPromptNodeData` (Task 5), `VIDEO_CONTROLS`/`DEFAULT_VIDEO_CONTROLS` (Task 1), `DEFAULT_MOTION_INSTRUCTION` (Task 4), the `POST /api/nodes/:id/video-prompt` route (Task 7).

This is UI scaffolding that follows an established pattern. **Read `src/components/nodes/prompt-node.tsx` and `src/components/nodes/prompt-focus-view.tsx` first** and mirror them, with these concrete differences:

1. **Canvas card (`video-prompt-node.tsx`):** copy `prompt-node.tsx`; change the icon to a Lucide motion/video icon (`Clapperboard` or `Film`, 1.5 stroke), the label to "Video Prompt", and the body preview to the motion-prompt text (`data.parsed`). Keep `Handle` target (left) + source (right) and the `NodeContextMenu` wrapper.
2. **Focus view (`video-prompt-focus-view.tsx`):** copy `prompt-focus-view.tsx`; replace the `shot-controls-row` usage with a **video-controls** controls row driven by `VIDEO_CONTROLS` (camera/speed `<select>`s using the shadcn Base-UI Select, saving to `data.controls`). Add a **vision-frame preview**: if a connected `image-gen` upstream has an active output URL, show that image as a thumbnail labelled "Reading this frame" (it is the still the LLM vision-reads). Point the Generate button at `POST /api/nodes/:id/video-prompt` with body `{ instruction, controls, slices }`; render the returned `output` (motion prompt) and `compiled` preview. Reuse `ConnectedInputsCard`, `prompt-version-history` (or the generic version list), and `InlineEvalBar` with `label="Generated Motion Prompt"`.
3. **Empty-state guard:** if no connected node provides a vision frame (no `image-gen`/`file`/`draw` image upstream), the Generate button stays enabled but the focus view shows a hint "Connect an approved image to ground the motion" (the model can still write a generic motion prompt from text context).

- [ ] **Step 1: Read the mirror files, then create `video-prompt-node.tsx`**

Run first: open `src/components/nodes/prompt-node.tsx`. Create the card per difference (1) above.

- [ ] **Step 2: Create `video-prompt-focus-view.tsx`**

Open `src/components/nodes/prompt-focus-view.tsx` and `src/components/nodes/shot-controls-row.tsx`. Create the focus view per differences (2)–(3).

- [ ] **Step 3: Register in `canvas.tsx`**

Add the import and the `nodeTypes` entry next to the existing `"image-gen": ImageGenNode`:

```tsx
import { VideoPromptNode } from "@/components/nodes/video-prompt-node";
// ...
const nodeTypes = {
  // ...existing entries...
  "image-gen": ImageGenNode,
  "video-prompt": VideoPromptNode,
};
```

Also add `"video-prompt"` to the right-click **add-node** context menu (`src/components/canvas/canvas-context-menu.tsx`) next to the image-gen entry, label "Video Prompt".

- [ ] **Step 4: Build + manual verification**

Run: `npm run build` → no type/build errors.
Then `npm run dev` and verify end-to-end:
1. Right-click canvas → "Video Prompt" adds the node.
2. Connect an Image Gen node (with an approved/active image) → Video Prompt node. The focus view shows the still as the "Reading this frame" thumbnail.
3. Connect a Shot node → Video Prompt node.
4. Pick camera = "Push in", click Generate → a short motion prompt returns and renders; the compiled-prompt preview shows the camera clause + action; no scene re-description.
5. Re-generate → a new attempt appears in the version list; restore repoints the active output.
6. Connect Video Prompt → (a future) Video Gen target is allowed; Video Prompt → Image Gen is rejected (validates `VALID_CONNECTIONS`).

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/video-prompt-node.tsx src/components/nodes/video-prompt-focus-view.tsx src/components/canvas/canvas.tsx src/components/canvas/canvas-context-menu.tsx
git commit -m "feat(video-prompt): add node card, focus view, and canvas registration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done criteria

- All unit tests pass (`npm test`): video-controls, render-shot-for-video, video-prompt-generate, compileVideoPrompt, connections/output, compose-message vision, map-upstream-for-video.
- The Video Prompt node can be added, wired (`image-gen`/`shot`/`file`/`draw`/`text` → it → `video-gen`), and generates a Veo-ready motion prompt that vision-reads the connected still.
- The image-Prompt path is unchanged (regression test in Task 6 + full suite green).
- Handoff: the Video Prompt node's active output (motion text) is the input the **Video Gen node** (Stage 4 part 2) will consume.
