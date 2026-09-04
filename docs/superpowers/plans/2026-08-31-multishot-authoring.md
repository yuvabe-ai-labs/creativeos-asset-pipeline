# Multishot Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give multishot its own authoring surface — a LOOK contract and per-beat camera instead of one global camera, a motion prompt grounded in Omni's documented prompting guidance, and a Shot Composer that composes a cut *sequence* rather than four alternatives for a single shot.

**Architecture:** Everything keys off the `multishot` flag already on `ShotNodeData`. `VideoControls` gains a `look` contract and a per-beat array; the video-prompt focus view swaps its controls when upstream is multishot; `videoPromptGeneratePromptFor` takes `{ provider, multishot }` rather than provider alone; the Shot Composer gains a second prompt and a sequence-shaped output that writes every beat at once.

**Tech Stack:** TypeScript, Next.js App Router, Vitest, OpenAI structured outputs.

**Guidance this implements:** `ref/multishot-refs/gemini-omni-flash-system-prompt.md` §3 (the model cuts by default), §4 (length, cuts and rhythm), §5 (image roles), §6 (audio), §8 (writing the prompt), §10 (continuity across generations). Worked examples in `ref/multishot-refs/chupps-20s-gemini-omni-prompts.md`.

---

## Global Constraints

- **A LOOK block must be byte-identical across every beat and every generation of a campaign.** Paraphrase *is* drift — this is §10's highest-leverage continuity lever and the reason the field exists at all.
- **Every beat leads framing → subject → camera → light**, in that order (§8).
- **Name a camera move's invariant** ("a slow push-in at a constant focal length"). Unqualified moves drift.
- **A camera clause never describes an effect on the subject.** "so the jar feels taller" makes the model move the subject. Say what the camera does; state ground contact separately.
- **Negatives are inline sentences at the end.** Omni has no negative-prompt field.
- **Name a reference in every beat it appears in**, not once at the top (§5).
- **Never describe a referenced subject's design in prose** — the tag carries it; competing prose produces a hybrid.
- **No hype adjectives**: "cinematic masterpiece", "ultra realistic", "8K", "stunning", "beautiful" buy nothing.
- Controls are shadcn primitives from `src/components/ui/*` via Base UI `render` prop, never `asChild`, never a raw `<button>`/`<textarea>`.
- Run tests per-directory. Never a bare `npx vitest run` — ~11 unrelated pre-existing timeout flakes.
- **No destructive git commands.** No `git checkout`/`restore`/`stash`/`reset`/`clean`.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/components/nodes/look-contract-field.tsx` | The shared LOOK textarea + its preset chips. |
| `src/components/nodes/beat-camera-list.tsx` | Per-beat rows: beat text + a camera select each. |
| `src/prompts/shot-compose-multishot.ts` | The Composer's multishot prompt + sequence schema. |

**Modify**

| File | Change |
|---|---|
| `src/lib/nodes/video-controls.ts` | `VideoControls += look`, `beats`; `LOOK_PRESETS` |
| `src/prompts/video-prompt-generate.ts` | Omni multishot prompt rewritten to the guidance; `videoPromptGeneratePromptFor({ provider, multishot })` |
| `src/lib/nodes/resolve-inputs.ts` | Carry the LOOK and per-beat cameras into the compiled prompt |
| `src/components/nodes/video-prompt-focus-view.tsx` | Swap controls on `upstreamMultishot` |
| `src/lib/nodes/shot-compose.ts` | `renderComposeContext` gains the multishot branch |
| `src/app/api/nodes/[id]/compose/route.ts` | Pick the prompt + schema by multishot |
| `src/components/nodes/shot-compose-sheet.tsx` | Sequence cards; apply writes every beat |

---

## Task 1: `VideoControls` carries a LOOK contract and per-beat cameras

**Files:**
- Modify: `src/lib/nodes/video-controls.ts`
- Create: `src/lib/nodes/__tests__/video-controls-multishot.test.ts`

**Interfaces:**
- Produces: `VideoControls.look?: string`, `VideoControls.beats?: BeatControl[]`, `LOOK_PRESETS`, `beatControlsFor(controls, beatCount)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { beatControlsFor, LOOK_PRESETS, DEFAULT_VIDEO_CONTROLS } from "../video-controls";

describe("beatControlsFor", () => {
  it("pads to the beat count so every beat has a row", () => {
    expect(beatControlsFor({ ...DEFAULT_VIDEO_CONTROLS, beats: [{ camera: "push-in" }] }, 3))
      .toEqual([{ camera: "push-in" }, { camera: "auto" }, { camera: "auto" }]);
  });

  it("truncates when beats were removed from the shot", () => {
    const controls = {
      ...DEFAULT_VIDEO_CONTROLS,
      beats: [{ camera: "static" }, { camera: "orbit" }, { camera: "tracking" }],
    };
    expect(beatControlsFor(controls, 2)).toEqual([{ camera: "static" }, { camera: "orbit" }]);
  });

  it("returns nothing for a node with no beats", () => {
    expect(beatControlsFor(DEFAULT_VIDEO_CONTROLS, 0)).toEqual([]);
  });
});

describe("LOOK_PRESETS", () => {
  // The LOOK is repeated verbatim in every beat, so a preset has to read as one
  // self-contained paragraph — not a fragment needing a sentence around it.
  it("each preset is a complete, self-contained look paragraph", () => {
    expect(LOOK_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const preset of LOOK_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.prose.length).toBeGreaterThan(80);
      expect(preset.prose).toMatch(/\.$/);
    }
  });

  // §11 — hype adjectives buy nothing from this model.
  it("no preset uses hype adjectives", () => {
    for (const preset of LOOK_PRESETS) {
      expect(preset.prose).not.toMatch(/cinematic masterpiece|ultra realistic|8K|stunning/i);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/lib/nodes/__tests__/video-controls-multishot.test.ts
```

Expected: FAIL — `beatControlsFor` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/nodes/video-controls.ts`:

```ts
/**
 * Per-beat camera, for a multishot shot (D222).
 *
 * A multishot generation is several cuts in one clip, so ONE camera move for the whole thing is
 * meaningless — the guidance has every beat leading framing, then subject, then camera, then
 * light. `camera` reuses the same VIDEO_CONTROLS catalog the single-shot select uses, so the
 * prose injected per beat is the same vocabulary.
 */
export type BeatControl = { camera: string };

export const DEFAULT_BEAT_CONTROL: BeatControl = { camera: "auto" };

/**
 * The saved per-beat controls, reconciled to the shot's CURRENT beat count.
 *
 * Beats can be added or removed on the Shot node after these were saved, and a stale array would
 * silently pair beat 3's camera with beat 2's action. Padding and truncating here keeps the row
 * list and the beat list in step without persisting on every edit.
 */
export function beatControlsFor(controls: VideoControls, beatCount: number): BeatControl[] {
  const saved = controls.beats ?? [];
  return Array.from({ length: Math.max(0, beatCount) }, (_, i) => saved[i] ?? DEFAULT_BEAT_CONTROL);
}

export type LookPreset = { value: string; label: string; prose: string };

/**
 * Starting points for the LOOK contract.
 *
 * §10 — the LOOK is repeated VERBATIM in every beat and every generation of a campaign, because
 * paraphrase is drift. Each preset is therefore a complete paragraph naming light direction, time
 * of day, lens feel, palette, ground and grade — the repeatable facts — rather than a mood word.
 * They are a starting point to edit, not a fixed menu.
 */
export const LOOK_PRESETS: LookPreset[] = [
  {
    value: "documentary-day",
    label: "Documentary daylight",
    prose:
      "Contemporary city, late afternoon, warm low sun with clean open shade. Handheld " +
      "documentary energy, shallow depth of field, 35mm and 85mm feel. Natural skin tones; " +
      "wardrobe palette of off-white, olive, sand and denim. Grounded and unglamorous — no studio " +
      "lighting, no colour gels, no slow motion. Subjects keep real physical contact with the " +
      "ground; nothing floats, stretches or deforms.",
  },
  {
    value: "tabletop-soft",
    label: "Soft tabletop",
    prose:
      "Interior tabletop, diffused north light from camera-left, soft falloff into open shade. " +
      "Locked, deliberate framing at 50mm and 100mm macro. Palette of warm grey concrete, pale " +
      "linen and clear glass. Matte surfaces, no specular hotspots, no colour gels. Products keep " +
      "full contact with the surface and never tilt, float or deform.",
  },
  {
    value: "evening-street",
    label: "Evening street",
    prose:
      "City street after sunset, cool ambient sky against warm shopfront light. Handheld at 35mm, " +
      "shallow focus, practical light sources only. Palette of deep blue shadow, amber highlight " +
      "and wet asphalt. No colour gels, no lens flares added in post, no slow motion. Feet and " +
      "props keep real contact with the ground.",
  },
];
```

Extend the `VideoControls` type in the same file:

```ts
export type VideoControls = Record<VideoControlKey, string> & {
  /**
   * The LOOK contract — light direction, time of day, lens, palette, ground, grade. Repeated
   * VERBATIM at the top of every beat, because paraphrase is drift (§10). Multishot only.
   */
  look?: string;
  /** Per-beat camera, index-aligned with the shot's beats. Multishot only. */
  beats?: BeatControl[];
};
```

`DEFAULT_VIDEO_CONTROLS` keeps its existing `camera`/`speed` values and gains nothing — `look` and `beats` are absent until authored.

- [ ] **Step 4: Run and commit**

```bash
npx vitest run src/lib/nodes && npx tsc --noEmit
git add src/lib/nodes/video-controls.ts src/lib/nodes/__tests__/video-controls-multishot.test.ts
git commit -m "feat(video-prompt): a LOOK contract and per-beat cameras for multishot (D222)

One camera move for a clip holding five cuts is meaningless. Per-beat camera
reuses the existing control catalog, and the LOOK contract is the field the
continuity guidance actually asks for -- repeated verbatim in every beat,
because paraphrase is drift.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The Omni multishot prompt, grounded in the guidance

**Files:**
- Modify: `src/prompts/video-prompt-generate.ts`
- Create: `src/prompts/__tests__/video-prompt-multishot.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `videoPromptGenerateOmniPrompt` (rewritten), `videoPromptGeneratePromptFor({ provider, multishot })`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  videoPromptGeneratePromptFor,
  videoPromptGenerateOmniPrompt,
  videoPromptGenerateKlingPrompt,
  videoPromptGeneratePrompt,
} from "../video-prompt-generate";

describe("videoPromptGeneratePromptFor", () => {
  it("routes a multishot Omni shot to the ladder prompt", () => {
    expect(videoPromptGeneratePromptFor({ provider: "gemini-omni", multishot: true }).id)
      .toBe(videoPromptGenerateOmniPrompt.id);
  });

  // A single shot on Omni is not a ladder — it is one continuous take, which the shared
  // image-to-video spine already describes better than the ladder prompt would.
  it("routes a single Omni shot to the default prompt", () => {
    expect(videoPromptGeneratePromptFor({ provider: "gemini-omni", multishot: false }).id)
      .toBe(videoPromptGeneratePrompt.id);
  });

  it("still routes kling and veo by provider, ignoring multishot", () => {
    expect(videoPromptGeneratePromptFor({ provider: "kling", multishot: true }).id)
      .toBe(videoPromptGenerateKlingPrompt.id);
    expect(videoPromptGeneratePromptFor({ provider: "veo", multishot: true }).id)
      .toBe(videoPromptGeneratePrompt.id);
  });
});

describe("the Omni multishot prompt carries the guidance", () => {
  const s = videoPromptGenerateOmniPrompt.system;

  it("requires a verbatim LOOK block", () => {
    expect(s).toMatch(/LOOK/);
    expect(s).toMatch(/verbatim|identical|character-for-character/i);
  });

  it("fixes the per-beat order as framing, subject, camera, light", () => {
    expect(s).toMatch(/framing.*subject.*camera.*light/is);
  });

  it("requires camera moves to name their invariant", () => {
    expect(s).toMatch(/invariant/i);
    expect(s).toContain("constant focal length");
  });

  // The failure that made Kling levitate a product: an i2v model executes subject-state
  // language as subject motion.
  it("forbids a camera clause describing an effect on the subject", () => {
    expect(s).toMatch(/never.*(effect on the subject|what the subject appears)/i);
  });

  it("puts negatives inline at the end, since there is no negative field", () => {
    expect(s).toMatch(/no negative-prompt field|inline/i);
  });

  it("requires a reference to be named in every beat it appears in", () => {
    expect(s).toMatch(/every beat it appears in/i);
  });

  it("bans hype adjectives", () => {
    expect(s).toMatch(/cinematic masterpiece/);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/prompts/__tests__/video-prompt-multishot.test.ts
```

Expected: FAIL — `videoPromptGeneratePromptFor` still takes a bare provider.

- [ ] **Step 3: Rewrite the Omni prompt and the router**

Replace `videoPromptGenerateOmniPrompt` in `src/prompts/video-prompt-generate.ts`:

```ts
export const videoPromptGenerateOmniPrompt = {
  id: "video-prompt-generate-omni",
  version: 2,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing MULTISHOT prompts for Gemini Omni — a model that cuts between shots by default and takes its whole storyboard from the prompt text. There are no shot parameters: length, cuts, rhythm and what to avoid are all prose.

OUTPUT FORMAT
Exactly this shape, no preamble, no headers beyond the ones shown, no explanation:

LOOK — <the look contract, one paragraph>

[0-Xs] <framing and angle>. <subject and what physically happens>. <camera move, invariant named>. <light beat>.
[X-Ys] …

Sound design: <ambience and foley>.
<inline negatives, one short sentence each>

THE LOOK BLOCK
You are given a LOOK contract. Reproduce it VERBATIM, character-for-character. Never paraphrase, shorten or "improve" it — it is the only thing making separate generations cut together, and paraphrase IS drift. If no LOOK is supplied, write one: light direction, time of day, lens feel, palette, ground surface, grade. Repeatable physical facts, never mood words.

THE LADDER
Beat timings are given to you. Keep them exactly — they must run consecutively from 0 with no gaps, and the last one must equal the clip length. Write one line per beat.

EVERY BEAT, IN THIS ORDER
1. Framing and angle — the shot size and where the camera is.
2. Subject and action — what physically happens, grounded in what is actually there.
3. Camera — one explicit move with its INVARIANT named: "a slow push-in at a constant focal length", "a locked-off static frame", "a small-angle orbit at constant distance, height and focal length". Prefer a small, specific magnitude over a vague one.
4. Light — one clause tying this beat to the LOOK.

CAMERA CLAUSES
Say only what the CAMERA does. Never describe an effect on the subject — never write "so the jar feels taller" or "making the product seem elevated". The model executes subject-state language as subject MOTION, so a crane clause phrased that way lifts the product off the table. If a subject must stay put, say so separately: it keeps contact with the surface it rests on.

REFERENCES
When a beat involves a referenced subject, name that reference IN THAT BEAT — every beat it appears in, not once at the top. Never describe a referenced subject's own design in prose; the reference carries it. Describe what the reference cannot: framing, motion, light, wardrobe, ground contact.

CUTS AND RHYTHM
This model cuts by default, so you are shaping cuts rather than requesting them. For a rapid sequence, say the interval in frames at 24fps ("every half a second — 12 frames at 24fps") rather than in fractions of a second. Match cuts read best when consecutive beats share angle, ground and light direction; say so explicitly when you intend one.

AUDIO
Audio is always generated and there is no off switch. End with a "Sound design:" clause naming ambience and foley. There is no voice control of any kind, so never write dialogue unless the whole deliverable is this one generation.

NEGATIVES
There is no negative-prompt field. Put every negative inline, at the end, as its own short sentence — "No dialogue." "No on-screen captions." "Do not show the drawing."

WORDS TO AVOID
"cinematic masterpiece", "ultra realistic", "8K", "stunning", "beautiful". They buy nothing here. Specific, physical detail is what this model rewards.`,
} as const;
```

Replace the router:

```ts
export type PromptRouteInput = { provider: VideoProvider; multishot: boolean };

/**
 * D222 — the ladder prompt is for a MULTISHOT shot, not for the Omni provider as such.
 *
 * A single shot on Omni is one continuous take, which the shared image-to-video spine already
 * describes better than a ladder prompt could — a one-line ladder ending "keep these timings
 * exactly" would forbid the very cutting a single-beat multishot node is asking for.
 */
export function videoPromptGeneratePromptFor(input: PromptRouteInput): VideoProviderPrompt {
  if (input.provider === "gemini-omni" && input.multishot) return videoPromptGenerateOmniPrompt;
  return input.provider === "kling" ? videoPromptGenerateKlingPrompt : videoPromptGeneratePrompt;
}
```

- [ ] **Step 4: Fix the call sites**

```bash
grep -rn "videoPromptGeneratePromptFor" src/ --include=*.ts --include=*.tsx
```

Update each to pass `{ provider, multishot }`. The API route at `src/app/api/nodes/[id]/video-prompt/route.ts` reads `multishot` from the upstream Shot — resolve it there the same way `mapUpstreamForVideo` does.

- [ ] **Step 5: Run and commit**

```bash
npx vitest run src/prompts src/lib/nodes && npx tsc --noEmit
git add src/prompts/video-prompt-generate.ts src/prompts/__tests__/video-prompt-multishot.test.ts src/app/api/nodes/\[id\]/video-prompt/route.ts
git commit -m "feat(video-prompt): Omni multishot prompt carries the prompting guidance (D222)

Was a thin ladder instruction. Now carries what the guidance actually asks
for: a verbatim LOOK contract, per-beat framing/subject/camera/light, camera
invariants, the subject-state trap that levitates products, reference-naming
per beat, frames-at-24fps for sub-second cuts, and inline negatives.

Routes on multishot rather than provider -- a single Omni shot is a
continuous take, not a one-line ladder.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The multishot authoring UI

**Files:**
- Create: `src/components/nodes/look-contract-field.tsx`
- Create: `src/components/nodes/beat-camera-list.tsx`
- Modify: `src/components/nodes/video-prompt-focus-view.tsx`

**Interfaces:**
- Consumes: `LOOK_PRESETS`, `beatControlsFor`, `BeatControl` (Task 1).
- Produces: `<LookContractField value onChange />`, `<BeatCameraList beats controls onChange />`.

- [ ] **Step 1: The LOOK field**

`look-contract-field.tsx` — a `Textarea` from `src/components/ui/textarea.tsx` plus preset chips (`Button`, dashed `border-primary/40` when unset). Label it **Look contract**, with helper text: *"Repeated verbatim in every beat. Paraphrase is drift — edit it once here."*

- [ ] **Step 2: The per-beat camera list**

`beat-camera-list.tsx` — one row per beat: the beat's index, its description truncated to one line, and a camera `Select` reusing `VIDEO_CONTROLS`'s camera options. Rows scroll inside their own container past ~6 beats.

- [ ] **Step 3: Swap the controls on multishot**

In `video-prompt-focus-view.tsx`, the component already computes an upstream-multishot signal for the model picker; reuse it (lift it if it currently lives only in the video-gen view — resolve the upstream Shot the same way). Then:

```tsx
{upstreamMultishot ? (
  <>
    <LookContractField … />
    <BeatCameraList … />
  </>
) : (
  <>
    <TargetProviderSelect … />
    <SpeedSelect … />
    <CameraSelect … />
  </>
)}
```

`TargetProviderSelect` stays hidden on the multishot branch — the downstream video-gen node already locks the model to Omni, so the control has nothing to offer.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
```

In the app: a multishot Shot's motion prompt shows Look contract + per-beat cameras; a single one shows the existing controls unchanged.

```bash
git add src/components/nodes/look-contract-field.tsx src/components/nodes/beat-camera-list.tsx src/components/nodes/video-prompt-focus-view.tsx
git commit -m "feat(video-prompt): multishot gets its own controls (D222)

One camera move and one motion energy describe a single take, not a clip
holding five cuts. A multishot shot now authors the LOOK contract once and a
camera per beat; a single shot keeps exactly the controls it had.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The LOOK and per-beat cameras reach the prompt

**Files:**
- Modify: `src/lib/nodes/resolve-inputs.ts`
- Modify: `src/lib/nodes/render-shot-for-video.ts`
- Create: `src/lib/nodes/__tests__/render-multishot-brief.test.ts`

**Interfaces:**
- Produces: `renderMultishotBrief({ script, controls })` — the user-turn text for a multishot motion prompt.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { renderMultishotBrief } from "../render-shot-for-video";

const script = {
  strategic_objective: "Brand awareness",
  visual_script: {
    shots: [
      { description: "hands lift the jar", duration_seconds: 4 },
      { description: "macro on the lid", duration_seconds: 5 },
    ],
  },
};

describe("renderMultishotBrief", () => {
  it("passes the LOOK through untouched for verbatim reuse", () => {
    const look = "Warm low sun from camera-left, long shadows, 35mm at knee height.";
    expect(renderMultishotBrief({ script, controls: { camera: "auto", speed: "auto", look } }))
      .toContain(look);
  });

  it("gives every beat its timing and its camera", () => {
    const out = renderMultishotBrief({
      script,
      controls: {
        camera: "auto",
        speed: "auto",
        beats: [{ camera: "push-in" }, { camera: "static" }],
      },
    });
    expect(out).toContain("[0-4s] hands lift the jar");
    expect(out).toContain("[4-9s] macro on the lid");
    expect(out).toMatch(/push-in|constant focal length/);
    expect(out).toMatch(/locked-off/);
  });

  // "auto" is the no-constraint option — it must add no camera clause at all.
  it("says nothing about camera for a beat left on auto", () => {
    const out = renderMultishotBrief({
      script,
      controls: { camera: "auto", speed: "auto", beats: [{ camera: "auto" }, { camera: "auto" }] },
    });
    expect(out).not.toMatch(/Camera:/);
  });

  it("carries the objective, which drives the motion", () => {
    expect(renderMultishotBrief({ script, controls: { camera: "auto", speed: "auto" } }))
      .toContain("Brand awareness");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/lib/nodes/__tests__/render-multishot-brief.test.ts
```

- [ ] **Step 3: Implement**

Add to `render-shot-for-video.ts`, importing `VIDEO_CONTROLS` and `beatControlsFor` from `video-controls`:

```ts
/**
 * The user turn for a multishot motion prompt: the LOOK, the beat ladder with per-beat cameras,
 * and the objective.
 *
 * The LOOK is passed through untouched — the system prompt reproduces it verbatim, and anything
 * done to it here would be the paraphrase the guidance warns against.
 */
export function renderMultishotBrief(args: {
  script: ReelScript | null;
  controls: VideoControls;
}): string {
  const shots = args.script?.visual_script?.shots ?? [];
  if (shots.length === 0) return "";

  const cameras = beatControlsFor(args.controls, shots.length);
  const cameraOptions = VIDEO_CONTROLS.find((c) => c.key === "camera")?.options ?? [];
  const proseFor = (value: string) =>
    cameraOptions.find((o) => o.value === value)?.prose ?? "";

  const blocks: string[] = [];
  const look = (args.controls.look ?? "").trim();
  if (look) blocks.push(`LOOK — ${look}`);

  let at = 0;
  const ladder = shots.map((shot, i) => {
    const from = at;
    at += shotSeconds(shot);
    const camera = proseFor(cameras[i]?.camera ?? "auto");
    const line = `[${from}-${at}s] ${(shot.description ?? "").trim()}`;
    return camera ? `${line}\n    Camera: ${camera}.` : line;
  });
  blocks.push(`Beats (keep these timings exactly):\n${ladder.join("\n")}`);

  const objective = (args.script?.strategic_objective ?? "").trim();
  if (objective) blocks.push(`Objective: ${objective}`);

  return blocks.join("\n\n");
}
```

- [ ] **Step 4: Route it**

In `resolve-inputs.ts`'s `shot` branch, use `renderMultishotBrief` when the upstream Shot is multishot with more than one beat. The node's `controls` come from the video-prompt node itself, so pass them through `resolveVideoPromptInputs` rather than reading them in `mapUpstreamForVideo`.

- [ ] **Step 5: Run and commit**

```bash
npx vitest run src/lib/nodes src/prompts && npx tsc --noEmit
git add src/lib/nodes/render-shot-for-video.ts src/lib/nodes/resolve-inputs.ts src/lib/nodes/__tests__/render-multishot-brief.test.ts
git commit -m "feat(video-prompt): the LOOK and per-beat cameras reach the compiled prompt (D222)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The Shot Composer composes a cut sequence

**Files:**
- Create: `src/prompts/shot-compose-multishot.ts`
- Modify: `src/lib/nodes/shot-compose.ts`
- Modify: `src/app/api/nodes/[id]/compose/route.ts`
- Modify: `src/components/nodes/shot-compose-sheet.tsx`
- Create: `src/prompts/__tests__/shot-compose-multishot.test.ts`

**Interfaces:**
- Produces: `shotComposeMultishotPrompt` with `{ sequences: [{ title, bestFor, beats: string[] }] }`; `renderMultishotComposeContext`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { shotComposeMultishotPrompt } from "../shot-compose-multishot";

describe("shotComposeMultishotPrompt", () => {
  const s = shotComposeMultishotPrompt.system;

  // The unit is a SEQUENCE. Four alternatives for one shot is the wrong shape for a node
  // holding five beats that have to cut together.
  it("composes whole sequences, not alternatives for one shot", () => {
    expect(s).toMatch(/sequence/i);
    expect(s).toMatch(/cut together|cuts together/i);
  });

  it("requires one beat per beat of the shot, in order", () => {
    expect(s).toMatch(/exactly one .* per beat|same number of beats/i);
  });

  it("requires a shared look across the beats", () => {
    expect(s).toMatch(/LOOK|same light|shared look/i);
  });

  it("asks for match cuts where consecutive beats share ground and angle", () => {
    expect(s).toMatch(/match cut/i);
  });

  it("returns a beats array per sequence", () => {
    const item = shotComposeMultishotPrompt.schema.properties.sequences.items;
    expect(item.required).toEqual(["title", "bestFor", "beats"]);
    expect(item.properties.beats.type).toBe("array");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Write the prompt**

`src/prompts/shot-compose-multishot.ts` — mirrors `shot-compose.ts`'s record shape. Its system prompt asks for **3 alternative SEQUENCES**, each with exactly as many beats as the shot has, that cut together under one shared look, naming where a match cut is intended (consecutive beats sharing angle, ground and light direction) and keeping every beat's action to one physical event. Same global avoid-list as `shotComposePrompt`, plus the hype-word ban.

Schema:

```ts
schema: {
  type: "object",
  additionalProperties: false,
  required: ["sequences"],
  properties: {
    sequences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "bestFor", "beats"],
        properties: {
          title: { type: "string" },
          bestFor: { type: "string" },
          beats: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
}
```

- [ ] **Step 4: Route by multishot**

`renderMultishotComposeContext` in `shot-compose.ts` builds the user turn: the beat list with timings, the role, the brand context, and the LOOK if one is set. The compose route picks prompt + schema + context renderer on the upstream Shot's `multishot` flag, and records `promptId`/`promptVersion` from whichever it used so the eval flywheel can tell the two apart.

- [ ] **Step 5: Apply writes every beat**

In `shot-compose-sheet.tsx`, a sequence card lists its beats numbered. "Use this" writes **every** beat description into `visual_script.shots[i].description`, not just the first — mirroring the single-shot `applyIdea` but across the array. A sequence with the wrong beat count is rejected client-side with the reason shown, rather than partially applied.

- [ ] **Step 6: Run and commit**

```bash
npx vitest run src/prompts src/lib/nodes && npx tsc --noEmit
git add src/prompts/shot-compose-multishot.ts src/prompts/__tests__/shot-compose-multishot.test.ts src/lib/nodes/shot-compose.ts src/app/api/nodes/\[id\]/compose/route.ts src/components/nodes/shot-compose-sheet.tsx
git commit -m "feat(compose): the Shot Composer composes a cut sequence for a multishot shot (D222)

Four alternatives for one shot is the wrong unit for a node holding five
beats that have to cut together. Multishot now gets three alternative
SEQUENCES under one shared look, and applying one writes every beat.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Drop one Shot on another to merge them

The counterpart to split. It was left out of D214 because three questions had no answer — which side's edits win, what happens to downstream nodes, and what stops an illegal merge. All three are answerable now, so it goes in.

**Files:**
- Create: `src/lib/nodes/merge-shots.ts`
- Create: `src/lib/nodes/__tests__/merge-shots.test.ts`
- Create: `src/components/nodes/merge-shots-dialog.tsx`
- Modify: `src/lib/canvas-store.ts` (`mergeShotNodes` action)
- Modify: `src/components/canvas/*` (the React Flow `onNodeDragStop` handler)
- Modify: `src/lib/canvas-store.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type MergeCheck = { ok: true; seconds: number } | { ok: false; reason: string };
  function canMergeShots(target: ShotNodeData, source: ShotNodeData): MergeCheck;
  function mergeShotData(target: ShotNodeData, source: ShotNodeData): ShotNodeData;
  // store: mergeShotNodes: (targetId: string, sourceId: string) => void;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { canMergeShots, mergeShotData } from "../merge-shots";
import type { ShotNodeData } from "@/lib/canvas-nodes";

const shot = (
  descriptions: string[],
  seconds: number[],
  shotIndexes: number[],
): ShotNodeData => ({
  script: {
    title: "Reel",
    strategic_objective: "Sell calm",
    visual_script: {
      shots: descriptions.map((description, i) => ({
        description,
        duration_seconds: seconds[i],
      })),
    },
  },
  multishot: descriptions.length > 1,
  seededFrom: { scriptNodeId: "s1", shotIndex: shotIndexes[0], shotIndexes, scriptTitle: "Reel" },
});

describe("canMergeShots", () => {
  it("allows a merge that fits the 10s ceiling", () => {
    expect(canMergeShots(shot(["a"], [4], [0]), shot(["b"], [5], [1])))
      .toEqual({ ok: true, seconds: 9 });
  });

  // The ceiling is the model's, not a preference — an 11s generation cannot be requested.
  it("refuses a merge that would exceed the ceiling, and says the numbers", () => {
    const check = canMergeShots(shot(["a"], [6], [0]), shot(["b"], [7], [1]));
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toContain("13");
      expect(check.reason).toContain("10");
    }
  });

  it("refuses merging a shot with itself", () => {
    const a = shot(["a"], [4], [0]);
    expect(canMergeShots(a, a).ok).toBe(false);
  });

  it("refuses when either side has no shots to merge", () => {
    expect(canMergeShots(shot(["a"], [4], [0]), { multishot: false }).ok).toBe(false);
  });
});

describe("mergeShotData", () => {
  it("concatenates the beats in SCRIPT order, not drop order", () => {
    // Dropping the earlier shot onto the later one must still produce script order — the ladder
    // is a timeline, and a reversed one would generate the reel backwards.
    const later = shot(["third"], [3], [2]);
    const earlier = shot(["first"], [2], [0]);
    const merged = mergeShotData(later, earlier);
    expect(merged.script?.visual_script?.shots?.map((s) => s.description))
      .toEqual(["first", "third"]);
    expect(merged.seededFrom?.shotIndexes).toEqual([0, 2]);
  });

  it("marks the result multishot", () => {
    expect(mergeShotData(shot(["a"], [4], [0]), shot(["b"], [5], [1])).multishot).toBe(true);
  });

  it("keeps the full script context", () => {
    const merged = mergeShotData(shot(["a"], [4], [0]), shot(["b"], [5], [1]));
    expect(merged.script?.strategic_objective).toBe("Sell calm");
  });

  it("merges two already-multishot nodes into one ordered run", () => {
    const merged = mergeShotData(shot(["c", "d"], [1, 1], [2, 3]), shot(["a", "b"], [1, 1], [0, 1]));
    expect(merged.script?.visual_script?.shots?.map((s) => s.description))
      .toEqual(["a", "b", "c", "d"]);
  });

  // Order has to be total even without lineage, or the result is nondeterministic.
  it("falls back to target-then-source when neither side has lineage", () => {
    const a: ShotNodeData = { script: { visual_script: { shots: [{ description: "x" }] } } };
    const b: ShotNodeData = { script: { visual_script: { shots: [{ description: "y" }] } } };
    expect(mergeShotData(a, b).script?.visual_script?.shots?.map((s) => s.description))
      .toEqual(["x", "y"]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/lib/nodes/__tests__/merge-shots.test.ts
```

- [ ] **Step 3: Implement the pure merge**

`src/lib/nodes/merge-shots.ts`. `canMergeShots` sums `shotSeconds` across both and compares to `OMNI_MAX_SECONDS`, refusing with a reason naming both numbers. `mergeShotData` pairs each shot with its source index (from `seededFrom.shotIndexes`, falling back to a large sentinel so un-lineaged beats sort last in a stable way), sorts, and rebuilds `visual_script.shots` plus a merged `seededFrom.shotIndexes`. The target's `script` supplies the surrounding metadata.

**Script order, not drop order.** The ladder is a timeline: dropping shot 3 onto shot 1 must still generate 1 → 3. Ordering by drop would silently reverse the reel.

- [ ] **Step 4: The store action**

`mergeShotNodes(targetId, sourceId)` in `canvas-store.ts`:

- Bail unless both are `shot` nodes and `canMergeShots` passes.
- Replace the target's data with `mergeShotData(target, source)`; remove the source node.
- **Union the incoming edges** onto the target, de-duplicated by source id — each half's inputs are all still needed.
- **Drop the source's outgoing edges**, same asymmetry as the split: a motion prompt written for one shot does not describe the merged sequence.
- **Record `removedNodeIds` and `removedEdgeIds`.** This is the bug the split shipped with — autosave builds its delete set only from those lists, so a node removed from `nodes` alone comes back on the next load.

- [ ] **Step 5: The confirmation dialog**

`merge-shots-dialog.tsx` — `AlertDialog`, opened by the drop, stating exactly what will happen: how many beats the result will have, its total seconds, and that anything wired downstream of the dragged node is disconnected. Cancel returns the node to its original position. On refusal (over the ceiling) the same dialog shows the reason with only a dismiss action, rather than silently snapping back.

- [ ] **Step 6: The drop gesture**

In the canvas component, add `onNodeDragStop`: if the dragged node is a `shot` and React Flow's `getIntersectingNodes` reports exactly one intersecting `shot`, open the dialog for that pair. More than one intersection is ambiguous — do nothing. The node stays where it was dropped until the dialog resolves.

- [ ] **Step 7: Run and commit**

```bash
npx vitest run src/lib/nodes src/lib/canvas-store.test.ts && npx tsc --noEmit
git add src/lib/nodes/merge-shots.ts src/lib/nodes/__tests__/merge-shots.test.ts src/components/nodes/merge-shots-dialog.tsx src/lib/canvas-store.ts src/lib/canvas-store.test.ts
git commit -m "feat(shots): drop one Shot on another to merge them into a multishot (D223)

The counterpart to split, left out of D214 because three questions had no
answer. They do now: beats order by SCRIPT position rather than drop order,
so dropping shot 3 onto shot 1 still generates 1 then 3; incoming edges union
and outgoing ones drop, the same asymmetry split uses; and a merge over the
10s ceiling is refused with both numbers rather than silently clamped.

Records removedNodeIds/removedEdgeIds -- the bug the split shipped with.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: End-to-end

Manual — needs a browser.

- [ ] Fan out a script so at least one Shot is multishot.
- [ ] Open its motion prompt: **Look contract + per-beat cameras**, no single camera/speed. A single Shot still shows the old controls.
- [ ] Set a LOOK, set a different camera on two beats, generate. The prompt opens with `LOOK — …` verbatim, then a ladder whose beats carry those camera clauses.
- [ ] Open the Composer on the multishot Shot: **3 sequences**, each with one beat per beat. "Use this" rewrites all of them.
- [ ] **Drag one Shot onto another.** Confirm the dialog states the resulting beat count and seconds, that accepting produces one multishot node with the beats in script order, and that cancelling changes nothing.
- [ ] **Drag two Shots together whose total exceeds 10s.** Confirm it is refused with both numbers, not clamped.
- [ ] **Reload the canvas after a merge and after a split.** Both must survive — neither the consumed node nor its dropped edges may reappear.
- [ ] Generate at 360p and confirm the clip cuts on the beats.

---

## Done when

- A multishot motion prompt opens with a verbatim LOOK block and a ladder carrying per-beat cameras.
- A single shot's authoring surface is byte-identical to before.
- The Composer offers sequences on a multishot shot and ideas on a single one, from different prompts, both recorded with their own `promptId`.
- `npx vitest run src/lib/nodes src/prompts src/lib/video-gen` passes; `npx tsc --noEmit` clean.
