# Veo Preservation-First Motion Prompt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Veo motion-prompt path in line with Google's Veo 3.1 best practices — a native `negativePrompt`, precise invariant-naming camera vocabulary, and a preservation-first author that restates the fixed subject identity.

**Architecture:** Four independent edits plus an ADR entry. (1) Add a `negative_prompt` param to the Veo manifest; (2) extract a pure, testable `buildVeoConfig` in the Veo provider that threads `negativePrompt` (leaving `enhancePrompt` unset); (3) rewrite the camera catalog prose to name invariants; (4) rewrite the text-camera author prompt to drop the word cap and restate the fixed identity, version-bumped for eval provenance. The Kling path is untouched.

**Tech Stack:** Next.js (custom build — see AGENTS.md), TypeScript, `@google/genai` (Veo SDK), Vitest. `server-only` is aliased to a mock in `vitest.config.ts`, so provider modules import cleanly under test.

**Spec:** `docs/superpowers/specs/2026-07-26-veo-preservation-first-prompt-design.md` (ADR **D78**).

## Global Constraints

- **Reuse, don't redefine** (AGENTS.md): import canonical constants; the negative default lives as one exported constant `VEO_NEGATIVE_DEFAULT`.
- **Kling path is untouched.** The Kling prompt variant (`videoPromptGenerateKlingPrompt`) stays **byte-for-byte unchanged**; Kling params/provider unchanged.
- **`enhancePrompt` stays at Veo's default** — never pass it. Do not add `enhancePrompt: false`.
- **Product-tuned negative default excludes bare `text` / `logo`** — a product shot must preserve its own real label text and logo.
- **Versioned prompt discipline:** any change to a prompt record bumps its `version` (eval provenance).
- **No new UI controls:** the `negative_prompt` textarea renders automatically from the param manifest (same as Kling's); no component code. Controls, if ever added, must be shadcn primitives (CLAUDE.md) — not applicable here.
- **Test runner:** `npx vitest run <path>` for a single file; `npx vitest run` for the suite.

---

### Task 1: Veo `negative_prompt` param

**Files:**
- Modify: `src/lib/video-gen/params/veo.ts`
- Test: `src/lib/video-gen/__tests__/veo-params.test.ts` (create)

**Interfaces:**
- Consumes: `ParamSpec` from `@/lib/image-gen/types` (constraint `{ type: "textarea"; maxLength?: number }`, groups `"primary" | "advanced"`).
- Produces: `veoParams` gains a `negative_prompt` advanced textarea param; new exported constant `VEO_NEGATIVE_DEFAULT: string`. `veoLiteParams` continues to alias `veoParams`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/video-gen/__tests__/veo-params.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { veoParams, veoLiteParams, VEO_NEGATIVE_DEFAULT } from "../params/veo";

describe("veoParams", () => {
  it("keeps aspect_ratio and duration as primary", () => {
    const primary = veoParams.filter((p) => p.group === "primary");
    expect(primary.map((p) => p.name)).toEqual(["aspect_ratio", "duration"]);
  });

  it("adds negative_prompt as an advanced textarea (same shape as Kling)", () => {
    const neg = veoParams.find((p) => p.name === "negative_prompt");
    expect(neg?.group).toBe("advanced");
    expect(neg?.component).toBe("textarea");
    expect(neg?.visible).toBe(true);
    expect(neg?.constraints).toEqual({ type: "textarea", maxLength: 2500 });
    expect(neg?.defaultValue).toBe(VEO_NEGATIVE_DEFAULT);
  });

  it("prefills a product-tuned default that preserves the product's real label text/logo", () => {
    const items = VEO_NEGATIVE_DEFAULT.split(",").map((s) => s.trim());
    expect(items).toContain("warped label");
    expect(items).toContain("text distortion");
    expect(items).not.toContain("text"); // never blanket-suppress the label's real text
    expect(items).not.toContain("logo"); // …or the real logo
  });

  it("veoLiteParams shares the same param set", () => {
    expect(veoLiteParams).toEqual(veoParams);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/video-gen/__tests__/veo-params.test.ts`
Expected: FAIL — `VEO_NEGATIVE_DEFAULT` is not exported / `negative_prompt` not found.

- [ ] **Step 3: Write minimal implementation**

Edit `src/lib/video-gen/params/veo.ts` — add the constant above `veoParams` and the param at the end of the array:

```ts
import type { ParamSpec } from "@/lib/image-gen/types";

// Product-tuned visual-defect suppression for Veo's native negativePrompt (D78). Deliberately
// WITHOUT bare "text"/"logo" — unlike Kling's list — because a product shot must PRESERVE its
// own real label text and logo; only their *distortion* is suppressed.
export const VEO_NEGATIVE_DEFAULT =
  "blurry, low quality, distorted, deformed, morphing, warped label, label deformation, text distortion, changing text, flickering, jitter, floating objects, extra objects, duplicated product, watermark";

// Valid Veo durationSeconds values: 4, 6, 8 (API only accepts these three)
export const veoParams: ParamSpec[] = [
  {
    name: "aspect_ratio",
    label: "Aspect Ratio",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue: "16:9",
    constraints: { type: "select", options: ["16:9", "9:16"] },
  },
  {
    name: "duration",
    label: "Duration",
    component: "select",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue: "6",
    constraints: { type: "select", options: ["4", "6", "8"] },
  },
  {
    // D78: prefilled visual-defect list, editable; drives Veo's GenerateVideosConfig.negativePrompt.
    name: "negative_prompt",
    label: "Negative Prompt",
    component: "textarea",
    group: "advanced",
    order: 0,
    visible: true,
    defaultValue: VEO_NEGATIVE_DEFAULT,
    constraints: { type: "textarea", maxLength: 2500 },
  },
];

// Lite: same duration options as Quality (4/6/8 all supported)
export const veoLiteParams: ParamSpec[] = veoParams;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/video-gen/__tests__/veo-params.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/params/veo.ts src/lib/video-gen/__tests__/veo-params.test.ts
git commit -m "feat(video-gen): add Veo negative_prompt param with product-tuned default (D78)"
```

---

### Task 2: `buildVeoConfig` + thread `negativePrompt`

**Files:**
- Modify: `src/lib/video-gen/providers/veo.ts` (extract pure builder from `generateWithVeo`, lines ~35-85)
- Test: `src/lib/video-gen/__tests__/veo-provider.test.ts` (create)

**Interfaces:**
- Consumes: `VideoGenInput.params` (`Record<string, unknown>`) — reads `duration`, `aspect_ratio`, `negative_prompt`.
- Produces: exported `buildVeoConfig(params: Record<string, unknown>): { aspectRatio: string; durationSeconds: number; numberOfVideos: number; negativePrompt?: string }`. `generateWithVeo` spreads its result and adds image fields; behavior for duration clamping and aspect ratio is unchanged.

- [ ] **Step 1: Write the failing test**

Create `src/lib/video-gen/__tests__/veo-provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildVeoConfig } from "../providers/veo";

describe("buildVeoConfig", () => {
  const base = { aspect_ratio: "16:9", duration: "6" };

  it("includes negativePrompt when non-empty (trimmed)", () => {
    const cfg = buildVeoConfig({ ...base, negative_prompt: "  blurry, watermark  " });
    expect(cfg.negativePrompt).toBe("blurry, watermark");
  });

  it("omits negativePrompt when empty, whitespace, or absent", () => {
    expect("negativePrompt" in buildVeoConfig({ ...base, negative_prompt: "" })).toBe(false);
    expect("negativePrompt" in buildVeoConfig({ ...base, negative_prompt: "   " })).toBe(false);
    expect("negativePrompt" in buildVeoConfig(base)).toBe(false);
  });

  it("never sets enhancePrompt (Veo's built-in rewriter stays at its default)", () => {
    expect("enhancePrompt" in buildVeoConfig({ ...base, negative_prompt: "x" })).toBe(false);
  });

  it("clamps invalid durations to 6 and passes 4/6/8 through", () => {
    expect(buildVeoConfig({ ...base, duration: "7" }).durationSeconds).toBe(6);
    expect(buildVeoConfig({ ...base, duration: "4" }).durationSeconds).toBe(4);
    expect(buildVeoConfig({ ...base, duration: "8" }).durationSeconds).toBe(8);
  });

  it("defaults aspectRatio to 16:9 and always requests one video", () => {
    const cfg = buildVeoConfig({ duration: "6" });
    expect(cfg.aspectRatio).toBe("16:9");
    expect(cfg.numberOfVideos).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/video-gen/__tests__/veo-provider.test.ts`
Expected: FAIL — `buildVeoConfig` is not exported.

- [ ] **Step 3: Write minimal implementation**

Edit `src/lib/video-gen/providers/veo.ts`. Add the exported builder above `generateWithVeo`:

```ts
// Pure config builder (D78) — scalar Veo GenerateVideosConfig fields, unit-testable.
// Image fields (image / lastFrame / referenceImages) are added by generateWithVeo after fetch.
// enhancePrompt is deliberately NOT set — Veo's built-in prompt rewriter stays at its default.
export function buildVeoConfig(params: Record<string, unknown>): {
  aspectRatio: string;
  durationSeconds: number;
  numberOfVideos: number;
  negativePrompt?: string;
} {
  const VALID_DURATIONS = [4, 6, 8];
  const parsed = Number(params.duration);
  const durationSeconds = VALID_DURATIONS.includes(parsed) ? parsed : 6;
  const aspectRatio = String(params.aspect_ratio ?? "16:9");
  const negativePrompt = String(params.negative_prompt ?? "").trim();
  return {
    aspectRatio,
    durationSeconds,
    numberOfVideos: 1,
    ...(negativePrompt ? { negativePrompt } : {}),
  };
}
```

Then, inside `generateWithVeo`, replace the inline duration/aspectRatio computation (currently lines ~41-44) and the `config` object (currently lines ~64-77) so the scalar fields come from `buildVeoConfig`:

```ts
async function generateWithVeo(
  modelName: string,
  input: VideoGenInput,
  maxRefImages = 3,
): Promise<VideoGenResult> {
  const ai = createVeoClient();
  const baseConfig = buildVeoConfig(input.params);
  const durationSeconds = baseConfig.durationSeconds;

  // Fetch start + end frames in parallel
  const [startImage, endImage] = await Promise.all([
    input.startFrameUrl ? fetchAsBase64(input.startFrameUrl) : Promise.resolve(null),
    input.endFrameUrl ? fetchAsBase64(input.endFrameUrl) : Promise.resolve(null),
  ]);

  // SDK constraint: referenceImages can't be combined with image/lastFrame.
  const refUrls = startImage ? [] : (input.referenceUrls ?? []).slice(0, maxRefImages);
  const refImages =
    refUrls.length > 0 ? await Promise.all(refUrls.map(fetchAsBase64)) : [];

  const config = {
    ...baseConfig,
    ...(endImage ? { lastFrame: endImage } : {}),
    ...(refImages.length > 0
      ? {
          referenceImages: refImages.map((img) => ({
            referenceType: VideoGenerationReferenceType.ASSET,
            image: img,
          })),
        }
      : {}),
  };

  // …rest of generateWithVeo unchanged (generateVideos call, polling, return { videoUrl, durationSeconds }).
}
```

Leave the rest of `generateWithVeo` (the `ai.models.generateVideos({ model, prompt, image, config })` call, polling loop, error handling, and `return { videoUrl: videoUri, durationSeconds }`) exactly as-is. Remove the now-unused local `VALID_DURATIONS`, `parsed`, `aspectRatio` lines that `buildVeoConfig` replaced.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/video-gen/__tests__/veo-provider.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check the provider (behavior-preserving refactor)**

Run: `npx tsc --noEmit`
Expected: no new errors in `src/lib/video-gen/providers/veo.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video-gen/providers/veo.ts src/lib/video-gen/__tests__/veo-provider.test.ts
git commit -m "feat(video-gen): extract buildVeoConfig and thread negativePrompt into Veo (D78)"
```

---

### Task 3: Precise, invariant-naming camera vocabulary

**Files:**
- Modify: `src/lib/nodes/video-controls.ts` (the `VIDEO_CONTROLS` camera options)
- Test: `src/lib/nodes/__tests__/video-controls.test.ts` (update breaking assertions)
- Test: `src/lib/nodes/__tests__/video-prompt.test.ts` (update breaking assertion — compile pulls this prose)

**Interfaces:**
- Consumes: nothing new. Same `VideoControlOption.prose` field.
- Produces: new camera `prose` strings. `renderVideoControls` / `compileVideoPrompt` signatures unchanged.

- [ ] **Step 1: Update the tests to expect the new prose (they will fail against old code)**

In `src/lib/nodes/__tests__/video-controls.test.ts`, replace the push-in and orbit assertions:

```ts
  it("renders the camera move as a standalone clause", () => {
    const out = renderVideoControls({ camera: "push-in", speed: "auto" });
    expect(out).toContain("Camera:");
    expect(out).toContain("push-in toward the subject at a constant focal length");
    expect(out).not.toContain("Speed:"); // speed is auto → omitted
  });

  it("renders multiple non-auto controls with named invariants", () => {
    const out = renderVideoControls({ camera: "orbit", speed: "dynamic" });
    expect(out).toContain("small-angle orbit around the subject");
    expect(out).toContain("constant distance, height, and focal length");
    expect(out).toContain("Speed:");
  });
```

In `src/lib/nodes/__tests__/video-prompt.test.ts`, update the two push-in assertions:

```ts
  it("injects the camera control as a standalone motion-controls block", () => {
    const { user } = compileVideoPrompt({
      clientContext: "", upstream: [], instruction: "let steam rise",
      controls: { camera: "push-in", speed: "auto" },
    });
    expect(user).toContain("push-in toward the subject at a constant focal length");
    expect(user).toContain("let steam rise");
  });
```

(The `describe("compileVideoPrompt provider awareness")` block asserts only `"Camera:"`/`"Speed:"` presence, not specific prose — leave it unchanged.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/video-controls.test.ts src/lib/nodes/__tests__/video-prompt.test.ts`
Expected: FAIL — old prose ("a slow push-in toward the subject", "a gentle orbit around the subject") no longer present… (the new substrings are what we're about to add).

- [ ] **Step 3: Rewrite the camera option prose**

In `src/lib/nodes/video-controls.ts`, replace the `camera` group's `options` array with:

```ts
    options: [
      { value: "auto", label: "Auto", prose: "" },
      { value: "static", label: "Static", prose: "a locked-off static frame with no camera movement" },
      { value: "push-in", label: "Push in", prose: "a slow, steady push-in toward the subject at a constant focal length" },
      { value: "pull-back", label: "Pull back", prose: "a smooth pull-back revealing the surrounding scene at a constant focal length" },
      { value: "orbit", label: "Orbit", prose: "a slow, small-angle orbit around the subject, holding constant distance, height, and focal length" },
      { value: "tracking", label: "Tracking", prose: "a smooth lateral tracking move alongside the subject at constant distance and focal length" },
      { value: "pan", label: "Pan", prose: "a steady horizontal pan across the frame from a fixed camera position" },
      { value: "tilt", label: "Tilt", prose: "a deliberate vertical tilt from a fixed camera position" },
      { value: "handheld", label: "Handheld", prose: "subtle handheld texture while otherwise holding the framing" },
      { value: "crane", label: "Crane", prose: "a slow rising crane move, keeping the subject centered" },
    ],
```

Leave the `speed` group and everything else in the file unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/video-controls.test.ts src/lib/nodes/__tests__/video-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/video-controls.ts src/lib/nodes/__tests__/video-controls.test.ts src/lib/nodes/__tests__/video-prompt.test.ts
git commit -m "feat(video-gen): precise, invariant-naming camera vocabulary for Veo (D78)"
```

---

### Task 4: Preservation-first text-camera author

**Files:**
- Modify: `src/prompts/video-prompt-generate.ts` (the `videoPromptGeneratePrompt` record only)
- Test: `src/prompts/__tests__/video-prompt-generate.test.ts` (replace the "no re-description" assertion; add version + preservation checks)

**Interfaces:**
- Consumes: nothing new.
- Produces: `videoPromptGeneratePrompt.version === 3`; `.system` restates fixed identity, has no word cap, keeps hype-word hygiene. `videoPromptGenerateKlingPrompt` unchanged; `videoPromptGeneratePromptFor` unchanged.

- [ ] **Step 1: Update the test (fails against old code)**

In `src/prompts/__tests__/video-prompt-generate.test.ts`, replace the `it("instructs no scene re-description …")` block (currently lines ~16-18) with:

```ts
  it("is preservation-first: restates the fixed identity, with no word cap", () => {
    const sys = videoPromptGeneratePrompt.system.toLowerCase();
    expect(sys).toContain("restate the fixed");
    expect(sys).toContain("held exactly");
    expect(videoPromptGeneratePrompt.system).not.toMatch(/40[–-]90 words/);
  });

  it("is version 3 and keeps hype-word hygiene", () => {
    expect(videoPromptGeneratePrompt.version).toBe(3);
    expect(videoPromptGeneratePrompt.system).toContain("cinematic masterpiece");
  });
```

(Leave the `"is a versioned, evaluable record"` test and the whole `videoPromptGeneratePromptFor` describe block unchanged — the Kling variant must stay byte-for-byte identical.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/prompts/__tests__/video-prompt-generate.test.ts`
Expected: FAIL — system still contains "40–90 words" and lacks "restate the fixed"; version is 2.

- [ ] **Step 3: Rewrite the text-camera record**

In `src/prompts/video-prompt-generate.ts`, update the leading comment's version line and replace the `videoPromptGeneratePrompt` object (keep `id`; bump `version` to `3`; keep `model`). New `system`:

```ts
// v3 (D78): preservation-first. Drops the word cap and the absolute "don't re-describe" rule;
// restates the fixed subject identity so branded products hold their label/logo/shape. Camera
// clauses name invariants. Refs: Veo 3.1 prompting guide (see 2026-07-26 spec).
export const videoPromptGeneratePrompt = {
  id: "video-prompt-generate",
  version: 3,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Veo 3.1.
A still image (the first frame) is provided. Your job is to describe how that frame should
come to life over roughly 8 seconds.

OUTPUT FORMAT
One prose paragraph — no headers, no bullet points, no preamble, no explanation.
Be as detailed as the shot needs to fully specify the motion and preserve the subject —
prefer completeness over brevity, but do not pad with filler. Lead with the camera movement
as its own clause, then the action, then the preservation note.

STRUCTURE (image-to-video)
1. Camera movement — a single, explicit camera move as a standalone clause, with its invariants
   named ("a slow push-in at a constant focal length"; "a locked-off static frame"; "a small-angle
   orbit at constant distance, height, and focal length"). Veo parses camera direction best when it
   is separated from the subject action. State the move precisely; where a magnitude is implied,
   prefer a small, specific one (e.g. a 10-15 degree orbit).
2. Action — what physically moves in the scene (secondary motion: steam drifts, fabric sways,
   light shifts, liquid pours). Keep it grounded in what is already visible in the frame.
3. Preservation — restate the fixed, preservation-critical identity that must not change: the
   product's shape, its label text, logo, lettering, colours, the positions of props, and the
   lighting. Instruct that these be held exactly (no deformation, no drifting text, no changed
   quantities).

Do not invent new objects, people, settings, or styles that are not in the frame, and do not pad
with generic scene description — but DO restate the preservation-critical identity above so the
model holds it.

WORDS TO AVOID
Do not use: "cinematic masterpiece", "ultra realistic", "8K", "stunning", "beautiful".

MULTI-IMAGE REFERENCES
When the instruction references "the first image", "the second image" etc., each refers to a distinct visual input. Describe camera movement and secondary motion that serves the composition of all referenced frames — for instance, a transition between the two, a parallax effect that reveals one over the other, or motion that draws the eye across a composited frame. Do not re-describe the visual content of the images beyond the preservation-critical identity.

If motion controls are provided, honor them exactly.`,
} as const;
```

Do **not** touch `videoPromptGenerateKlingPrompt`, `VideoProvider`, `VideoProviderPrompt`, or `videoPromptGeneratePromptFor`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/prompts/__tests__/video-prompt-generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/prompts/video-prompt-generate.ts src/prompts/__tests__/video-prompt-generate.test.ts
git commit -m "feat(video-gen): preservation-first Veo motion-prompt author, v3 (D78)"
```

---

### Task 5: Record ADR D78

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7 decision log)

**Interfaces:** none (documentation).

- [ ] **Step 1: Append the decision entry**

Add the following at the end of §7, immediately after the `### D77 …` entry block (D77 is currently the last decision in the log):

```markdown
### D78 — Veo motion prompt is preservation-first *(recorded 2026-07-26; refines D24 + D77)*

**Decision.** The Veo motion-prompt path restates the fixed subject identity (product shape, label,
logo, lettering, colours, props, lighting) with no word cap; the camera catalog uses precise,
invariant-naming vocabulary ("constant distance, height, focal length"); visual-defect suppression is
driven by Veo's native `negativePrompt` param with a product-tuned default (no bare `text`/`logo`, so a
product's real label survives); bare "No X, no Y" negations stay out of the positive prompt. Veo's
built-in prompt rewriter (`enhancePrompt`) is left enabled.

**Why.** D24 shipped a terse, Veo-only author. Google's Veo 3.1 guidance — "more detail, more
control", a dedicated negative-prompt field, and specific camera vocabulary — are quality levers the
terse path can't reach, and they matter most for branded-product preservation.

**Rejected.** Negatives-only (positive prompt stays lean → identity never stated); an intent-driven
preservation *mode* toggle (machinery for a distinction the author makes implicitly); `enhancePrompt:
false` now (user kept Veo's rewriter on — recorded as the first lever if QA shows preservation slipping).

**Originated →** `docs/superpowers/specs/2026-07-26-veo-preservation-first-prompt-design.md`.
```

Note: the number **D78** is provisional — a parallel `video-provider-consolidation` branch also drafts a D78. If that has merged first, renumber to the next free integer and update the spec header + these plan references.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): record D78 — Veo preservation-first motion prompt"
```

---

### Task 6: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all new and existing tests green (especially `video-prompt.test.ts`, `video-controls.test.ts`, `video-prompt-generate.test.ts`, `veo-params.test.ts`, `veo-provider.test.ts`, and the untouched Kling suites).

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/video-gen src/lib/nodes src/prompts`
Expected: clean.

- [ ] **Step 3: Manual QA note (not automated)**

Confirm in the running app that the Veo/Sora Video Gen node now shows a prefilled **Negative Prompt** textarea under an **Advanced** section (it renders automatically from the manifest, like Kling's). If the advanced section does not appear for Veo, inspect `src/components/nodes/video-gen-params-panel.tsx` for provider-specific group filtering — but no change is expected. Then run an amber-jar-style Veo generation and verify the compiled prompt names/preserves the product identity and the request's frozen provenance carries `negativePrompt`.

---

## Self-Review

**Spec coverage:**
- §4 Veo `negativePrompt` (param + provider threading) → Tasks 1 + 2 ✓
- §5 precise camera vocabulary → Task 3 ✓
- §6 preservation-first author (drop cap, restate identity, version bump) → Task 4 ✓
- §7 negatives division (motion implicit via ②, artifacts via ①) → realized by Tasks 2 + 3 ✓
- §8 `enhancePrompt` stays on → enforced by Task 2 (never set) + test ✓
- §10 touch-points → every listed file has a task ✓
- §11 tests (veo-params, veo-provider, extend generate/controls) → Tasks 1-4 ✓
- §13 ADR D78 → Task 5 ✓

**Placeholder scan:** no TBD/TODO; every code step has literal content. ✓

**Type consistency:** `buildVeoConfig(params: Record<string, unknown>)` matches `VideoGenInput.params`; `VEO_NEGATIVE_DEFAULT` referenced consistently in Task 1; prose substrings asserted in Task 3 match the strings written in Task 3; `version === 3` in Task 4 matches the record. ✓
