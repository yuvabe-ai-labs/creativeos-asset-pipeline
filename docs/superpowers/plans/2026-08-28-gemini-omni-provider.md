# Gemini Omni 1.1 Flash Provider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register `gemini:gemini-omni-1.1-flash` as a working video-gen model — params, image-role tags, cost, an end-to-end generation — and hide Kling's `multi_shot` so multishot means one thing in one place.

**Architecture:** A new provider in the existing `VideoGenModelSpec` registry, calling the Gemini Interactions REST API directly with `fetch`. Two pure, unit-tested builders carry everything that can be silently wrong: `planOmniInput` fixes image upload order and generates the declaration header with its two index bases, and `composeOmniPrompt` folds the prompt-text controls into the prompt. The provider is thin I/O around them.

**Tech Stack:** TypeScript, Next.js App Router, Vitest, `fetch`. No new dependencies.

**This is Plan 1 of 2.** It is shippable alone: Omni becomes selectable and generates video from hand-written prompts. Plan 2 covers the parse change, hybrid fan-out, the multishot toggle, and the two upstream checks.

- Spec: `docs/superpowers/specs/2026-08-28-gemini-omni-multishot-design.md` §8 and §9
- **Verified API facts: `docs/superpowers/specs/2026-08-28-gemini-omni-api-findings.md`** — read this before writing the provider. Where it and Google's published docs disagree, it is right.
- Decisions: D205, D206, D207, D208, D217, D218

---

## Global Constraints

- **Registry id `gemini:gemini-omni-1.1-flash`** → API model `gemini-omni-1.1-flash`. Never the preview `gemini-omni-flash-preview`.
- **API key is `GOOGLE_GENAI_API_KEY`** — the same one Veo uses. Do not add a new env var.
- **Endpoint:** `POST https://generativelanguage.googleapis.com/v1beta/interactions`, header `x-goog-api-key`.
- **`generation_config.video_config` carries `task` and NOTHING else.** It rejects `duration`, `resolution` and `aspect_ratio` with `Unknown parameter`.
- **`resolution`, `aspect_ratio`, `delivery` and `duration` all live in `response_format`.**
- **`duration` is a STRING** — `"8s"`. The integer `8` fails with `Invalid input at 'response_format'`.
- **`store: true` is REQUIRED** whenever `delivery` is `"uri"`. Not optional, not a preference.
- **`response_format.type` is the constant `"video"`** — never a param, never surfaced in the UI.
- **`output_video` does not exist on the REST response.** Read the video from `steps[]` → the `model_output` step → its `video`-typed content entry's `uri`.
- Duration range **3–10s**, default 8. Resolutions `360p` / `720p` (default) / `1080p` / `4k`. Aspect ratios `16:9` / `9:16` only — **no `1:1`**.
- **`<IMAGE_REF_N>` is 0-based over references only. `@ImageN` is 1-based over the whole upload array.** Both appear in the same generated line. Never hand-write either.
- **`<LAST_FRAME>` requires `<FIRST_FRAME>`.**
- **There is no `continuous_take` param.** The Shot's multishot toggle is that decision (Plan 2).
- Every param is in the `primary` group — the Advanced accordion was removed in `7e1c643`, so an `advanced` control renders nowhere.
- `import "server-only"` at the top of every server-only module. Colocated `__tests__/`. Comments explain *why*, not *what*.
- Run tests per-directory (`npx vitest run src/lib/video-gen`), never a full `vitest run` — the full suite has ~11 unrelated timeout flakes in API-route tests.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/lib/video-gen/providers/fetch-as-base64.ts` | Fetch an HTTPS image URL → `{ imageBytes, mimeType }`. Extracted from `veo.ts`; two consumers. |
| `src/lib/video-gen/providers/avoid-clause.ts` | Negative-prompt string → `Avoid: ….` or `""`. Extracted from `composeVeoPrompt`; two consumers. |
| `src/lib/video-gen/plan-omni-input.ts` | **Pure.** Assigned roles → ordered upload list, declaration header, guidance, `task`. Sole owner of both index bases. |
| `src/lib/video-gen/compose-omni-prompt.ts` | **Pure.** Prompt + params + input plan → the final text part. |
| `src/lib/video-gen/gemini-omni-shape.ts` | **No `server-only`.** `GEMINI_OMNI_IMAGE_INPUTS` + `GEMINI_OMNI_RULES`, imported by both the provider and `client-models.ts`. |
| `src/lib/video-gen/params/gemini-omni.ts` | The six `ParamSpec`s and `GEMINI_OMNI_NEGATIVE_DEFAULT`. |
| `src/lib/video-gen/providers/gemini-omni.ts` | REST call, Files-API poll, the `VideoGenModelSpec`. |

Tests are colocated in `src/lib/video-gen/__tests__/`, one file per unit.

**Modify**

| File | Change |
|---|---|
| `src/lib/video-gen/providers/veo.ts` | Import the two extracted helpers instead of declaring them. |
| `src/lib/video-gen/types.ts:78` | `provider` union `+= "gemini"`. |
| `src/lib/video-gen/cost.ts:25` | Rename `VEO_RESOLUTION_PRICING` → `RESOLUTION_ONLY_PRICING`; add the Omni row. |
| `src/lib/video-gen/registry.ts` | Register `geminiOmni`. |
| `src/lib/video-gen/client-models.ts` | Client mirror, importing the shared shape module. |
| `src/lib/video-gen/params/kling.ts:90-101` | `multiShotParam` → `visible: false`. |
| `src/lib/generations/complete.ts:21-32` | `buildVideoDownloadHeaders` gains a `gemini:` branch. |

**Why `gemini-omni-shape.ts` exists.** `client-models.ts` is imported by client components. `providers/gemini-omni.ts` starts with `import "server-only"`, so importing the constants from there would break the client build — which is exactly why the existing Veo and Kling entries hand-copy their `imageInputs` and rules into `client-models.ts`. A third copy is a third chance to drift, and the API route caps `referenceUrls` against the *client* copy while the provider is built from the *server* copy. One shared module with no `server-only` import removes the class of bug.

---

## Task 1: Extract the two shared helpers

Pure refactor. Veo keeps working identically; Omni gets two functions it would otherwise duplicate. Per AGENTS.md: two call sites = extract.

**Files:**
- Create: `src/lib/video-gen/providers/fetch-as-base64.ts`
- Create: `src/lib/video-gen/providers/avoid-clause.ts`
- Create: `src/lib/video-gen/__tests__/avoid-clause.test.ts`
- Modify: `src/lib/video-gen/providers/veo.ts:22-32` (delete `fetchAsBase64`), `:58-62` (rewrite `composeVeoPrompt` body)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `fetchAsBase64(url: string): Promise<{ imageBytes: string; mimeType: string }>`
  - `avoidClause(negativePrompt: string): string` — `"Avoid: a, b."` or `""`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/video-gen/__tests__/avoid-clause.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { avoidClause } from "../providers/avoid-clause";

describe("avoidClause", () => {
  it("wraps a list in an Avoid sentence", () => {
    expect(avoidClause("blurry, warped label")).toBe("Avoid: blurry, warped label.");
  });

  // A cleared field must leave no dangling "Avoid:" on the request.
  it("returns empty string for blank input", () => {
    expect(avoidClause("")).toBe("");
    expect(avoidClause("   ")).toBe("");
  });

  // The function adds the period; a list already ending in one must not produce "..".
  it("strips trailing punctuation and whitespace before adding its own period", () => {
    expect(avoidClause("blurry, jitter.  ")).toBe("Avoid: blurry, jitter.");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/lib/video-gen/__tests__/avoid-clause.test.ts
```

Expected: FAIL — `Failed to resolve import "../providers/avoid-clause"`.

- [ ] **Step 3: Create the two helper modules**

Create `src/lib/video-gen/providers/avoid-clause.ts`:

```ts
/**
 * A suppression list as a plain sentence, for models with no negative-prompt field.
 *
 * Veo 3.1 Lite rejects `negativePrompt` outright (D183) and Gemini Omni has no such field at all
 * (D208), so both state their negatives in the prompt text. Returns "" when there is nothing to
 * suppress, so a cleared field never leaves a dangling "Avoid:" on the request.
 */
export function avoidClause(negativePrompt: string): string {
  const avoid = negativePrompt.trim().replace(/[.\s]+$/, "");
  return avoid ? `Avoid: ${avoid}.` : "";
}
```

Create `src/lib/video-gen/providers/fetch-as-base64.ts`:

```ts
import "server-only";

/**
 * An image URL as base64 bytes plus its mime type.
 *
 * Veo's SDK Image_2 accepts only gcsUri or imageBytes, and Gemini Omni's REST image content part
 * takes base64 `data` — but every image in this pipeline is a Supabase Storage HTTPS URL, so both
 * providers must fetch first. Content-type is split on ";" to drop any charset parameter.
 */
export async function fetchAsBase64(
  url: string,
): Promise<{ imageBytes: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${url}`);
  const mimeType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
  const imageBytes = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { imageBytes, mimeType };
}
```

- [ ] **Step 4: Rewire `veo.ts`**

Delete the local `fetchAsBase64` function (`veo.ts:22-32`) and add to the import block at the top:

```ts
import { fetchAsBase64 } from "./fetch-as-base64";
import { avoidClause } from "./avoid-clause";
```

Replace the body of `composeVeoPrompt` (`veo.ts:58-62`), keeping its existing doc comment above it:

```ts
export function composeVeoPrompt(prompt: string, negativePrompt: string): string {
  const avoid = avoidClause(negativePrompt);
  if (!avoid) return prompt;
  return `${prompt.trim()}\n\n${avoid}`;
}
```

- [ ] **Step 5: Run the whole video-gen suite**

```bash
npx vitest run src/lib/video-gen
```

Expected: PASS, including every pre-existing `composeVeoPrompt` test. If a Veo test fails, `avoidClause` is not producing byte-identical output to the old inline version — fix that rather than the test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video-gen/providers/fetch-as-base64.ts src/lib/video-gen/providers/avoid-clause.ts src/lib/video-gen/__tests__/avoid-clause.test.ts src/lib/video-gen/providers/veo.ts
git commit -m "refactor(video-gen): extract fetchAsBase64 and avoidClause for a second consumer"
```

---

## Task 2: `planOmniInput` — upload order and the two index bases

The most failure-prone thing in this plan, which is why it is pure and tested first. A wrong index does not error — it silently points a mention at the wrong image, visible only in a generation already paid for.

**Files:**
- Create: `src/lib/video-gen/plan-omni-input.ts`
- Create: `src/lib/video-gen/__tests__/plan-omni-input.test.ts`

**Interfaces:**
- Consumes: `AssignedImageRoles` from `./assign-image-roles` — `{ startFrameUrl?: string; endFrameUrl?: string; referenceUrls: string[] }`.
- Produces:
  ```ts
  type OmniUpload = { url: string; role: "first_frame" | "last_frame" | "reference" };
  type OmniTask = "text_to_video" | "image_to_video" | "reference_to_video";
  type OmniInputPlan = { uploads: OmniUpload[]; header: string; guidance: string; task: OmniTask };
  function planOmniInput(assigned: AssignedImageRoles): OmniInputPlan;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/video-gen/__tests__/plan-omni-input.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planOmniInput } from "../plan-omni-input";

const START = "https://x/start.jpg";
const END = "https://x/end.jpg";
const R1 = "https://x/r1.jpg";
const R2 = "https://x/r2.jpg";

describe("planOmniInput", () => {
  it("orders uploads first frame, last frame, then references", () => {
    const plan = planOmniInput({ startFrameUrl: START, endFrameUrl: END, referenceUrls: [R1, R2] });
    expect(plan.uploads).toEqual([
      { url: START, role: "first_frame" },
      { url: END, role: "last_frame" },
      { url: R1, role: "reference" },
      { url: R2, role: "reference" },
    ]);
  });

  // The reason this module exists. @ImageN counts the entire upload array from 1;
  // <IMAGE_REF_N> counts ONLY the references, from 0. Both appear in this one line.
  it("emits @ImageN 1-based over all uploads and <IMAGE_REF_N> 0-based over references", () => {
    const plan = planOmniInput({ startFrameUrl: START, endFrameUrl: END, referenceUrls: [R1, R2] });
    expect(plan.header).toBe(
      "[# Sources <FIRST_FRAME>@Image1 <LAST_FRAME>@Image2] " +
      "[# References <IMAGE_REF_0>@Image3 <IMAGE_REF_1>@Image4]",
    );
  });

  // With no frames the first reference is @Image1 but still <IMAGE_REF_0>.
  it("keeps the bases independent when there are no frames", () => {
    const plan = planOmniInput({ startFrameUrl: undefined, endFrameUrl: undefined, referenceUrls: [R1, R2] });
    expect(plan.header).toBe("[# References <IMAGE_REF_0>@Image1 <IMAGE_REF_1>@Image2]");
    expect(plan.task).toBe("reference_to_video");
  });

  it("omits the References segment entirely when there are no references", () => {
    const plan = planOmniInput({ startFrameUrl: START, endFrameUrl: undefined, referenceUrls: [] });
    expect(plan.header).toBe("[# Sources <FIRST_FRAME>@Image1]");
    expect(plan.task).toBe("image_to_video");
  });

  // The multishot path: no images at all, the shot description is the whole input.
  it("returns empty header and guidance with no images at all", () => {
    const plan = planOmniInput({ startFrameUrl: undefined, endFrameUrl: undefined, referenceUrls: [] });
    expect(plan).toEqual({ uploads: [], header: "", guidance: "", task: "text_to_video" });
  });

  it("names each frame by its upload number in the guidance", () => {
    const plan = planOmniInput({ startFrameUrl: START, endFrameUrl: END, referenceUrls: [R1] });
    expect(plan.guidance).toBe(
      "Use Image1 as the starting frame. Use Image2 as the final frame. " +
      "Use the given images as references for video generation. " +
      "The images should not be used as literal initial frames.",
    );
  });

  // A first frame wins the task hint: the model animates THAT image and the references
  // only steer it.
  it("prefers image_to_video when a first frame and references are both present", () => {
    const plan = planOmniInput({ startFrameUrl: START, endFrameUrl: undefined, referenceUrls: [R1] });
    expect(plan.task).toBe("image_to_video");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/lib/video-gen/__tests__/plan-omni-input.test.ts
```

Expected: FAIL — `Failed to resolve import "../plan-omni-input"`.

- [ ] **Step 3: Implement**

Create `src/lib/video-gen/plan-omni-input.ts`:

```ts
import type { AssignedImageRoles } from "./assign-image-roles";

export type OmniUpload = { url: string; role: "first_frame" | "last_frame" | "reference" };
export type OmniTask = "text_to_video" | "image_to_video" | "reference_to_video";

export type OmniInputPlan = {
  /** Images in the exact order they are appended to the request's `input` array. */
  uploads: OmniUpload[];
  /** `[# Sources …] [# References …]` — prepended to the prompt. "" when there are no images. */
  header: string;
  /** Closing instruction naming each frame's role. "" when there are no images. */
  guidance: string;
  task: OmniTask;
};

/**
 * D207 — the sole owner of Omni's two index bases.
 *
 * The declaration header carries two simultaneous numbering schemes:
 *   `@ImageN`       — 1-based, over the WHOLE upload array
 *   `<IMAGE_REF_N>` — 0-based, over the REFERENCES SUB-ARRAY only
 * and Kling's `@image_1` next door is a third. Getting one wrong raises no error; it silently
 * binds a mention to the wrong asset, which is only visible in a generation already paid for. So
 * no prompt and no LLM ever writes this line — it is derived here from the operator's role
 * assignment, and it is unit-tested.
 *
 * The explicit declaration form is used ALWAYS, even when a single image makes the role obvious.
 * The simple inline form would be a second code path with an equally silent failure mode, and
 * "obvious" is a judgement this failure mode punishes.
 *
 * Upload order is the contract: [firstFrame?, lastFrame?, ...references].
 */
export function planOmniInput(assigned: AssignedImageRoles): OmniInputPlan {
  const uploads: OmniUpload[] = [];
  if (assigned.startFrameUrl) uploads.push({ url: assigned.startFrameUrl, role: "first_frame" });
  if (assigned.endFrameUrl) uploads.push({ url: assigned.endFrameUrl, role: "last_frame" });
  for (const url of assigned.referenceUrls) uploads.push({ url, role: "reference" });

  if (uploads.length === 0) {
    return { uploads, header: "", guidance: "", task: "text_to_video" };
  }

  const sources: string[] = [];
  const references: string[] = [];
  const guidance: string[] = [];
  let refIndex = 0; // 0-based, references only

  uploads.forEach((upload, i) => {
    const imageNo = i + 1; // 1-based, whole array
    if (upload.role === "first_frame") {
      sources.push(`<FIRST_FRAME>@Image${imageNo}`);
      guidance.push(`Use Image${imageNo} as the starting frame.`);
    } else if (upload.role === "last_frame") {
      sources.push(`<LAST_FRAME>@Image${imageNo}`);
      guidance.push(`Use Image${imageNo} as the final frame.`);
    } else {
      references.push(`<IMAGE_REF_${refIndex}>@Image${imageNo}`);
      refIndex += 1;
    }
  });

  if (references.length > 0) {
    guidance.push(
      "Use the given images as references for video generation.",
      "The images should not be used as literal initial frames.",
    );
  }

  const segments: string[] = [];
  if (sources.length > 0) segments.push(`[# Sources ${sources.join(" ")}]`);
  if (references.length > 0) segments.push(`[# References ${references.join(" ")}]`);

  return {
    uploads,
    header: segments.join(" "),
    guidance: guidance.join(" "),
    // A first frame means the model animates THAT image; references only steer it.
    task: assigned.startFrameUrl ? "image_to_video" : "reference_to_video",
  };
}
```

- [ ] **Step 4: Run and watch it pass**

```bash
npx vitest run src/lib/video-gen/__tests__/plan-omni-input.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/plan-omni-input.ts src/lib/video-gen/__tests__/plan-omni-input.test.ts
git commit -m "feat(video-gen): planOmniInput owns Omni's two reference index bases (D207)"
```

---

## Task 3: `composeOmniPrompt` — the controls that are sentences

Omni has no negative-prompt field, no audio switch and no text field. Three controls become prose.

**Note:** this task does **not** handle the multishot ladder or the single-take suppression line. Those are written by the motion-prompt node in Plan 2. This function receives whatever prompt it is given.

**Files:**
- Create: `src/lib/video-gen/compose-omni-prompt.ts`
- Create: `src/lib/video-gen/__tests__/compose-omni-prompt.test.ts`

**Interfaces:**
- Consumes: `OmniInputPlan` (Task 2); `avoidClause` (Task 1).
- Produces:
  ```ts
  const OMNI_AUDIO_CLAUSES: Record<string, string>;
  function composeOmniPrompt(args: {
    prompt: string;
    params: Record<string, unknown>;
    plan: OmniInputPlan;
  }): string;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/video-gen/__tests__/compose-omni-prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { composeOmniPrompt } from "../compose-omni-prompt";
import { planOmniInput } from "../plan-omni-input";

const EMPTY = planOmniInput({ startFrameUrl: undefined, endFrameUrl: undefined, referenceUrls: [] });
const FRAME = planOmniInput({ startFrameUrl: "https://x/s.jpg", endFrameUrl: undefined, referenceUrls: [] });

describe("composeOmniPrompt", () => {
  it("puts the declaration header first and the role guidance last", () => {
    const out = composeOmniPrompt({
      prompt: "A cup on a table.", params: { audio: "ambient" }, plan: FRAME,
    });
    expect(out.startsWith("[# Sources <FIRST_FRAME>@Image1]")).toBe(true);
    expect(out.endsWith("Use Image1 as the starting frame.")).toBe(true);
  });

  it("defaults to the ambient audio clause when audio is absent", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY });
    expect(out).toContain(
      "Sound design: ambience and foley only. No dialogue. No extra sound effects.",
    );
  });

  it("uses the dialogue clause and does not suppress dialogue", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: { audio: "dialogue" }, plan: EMPTY });
    expect(out).toContain("Sound design: ambience, foley and natural dialogue.");
    expect(out).not.toContain("No dialogue.");
  });

  it("uses the music clause", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: { audio: "music" }, plan: EMPTY });
    expect(out).toContain("Sound design: ambience and foley, with a music bed. No dialogue.");
  });

  // Omni renders screen-space type legibly and the docs recommend quoting it exactly.
  it("quotes on-screen text when given", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { on_screen_text: "Pure by nature" }, plan: EMPTY,
    });
    expect(out).toContain('On-screen text reads exactly: "Pure by nature".');
  });

  it("omits the on-screen text sentence when the field is blank", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { on_screen_text: "   " }, plan: EMPTY,
    });
    expect(out).not.toContain("On-screen text");
  });

  // No negative-prompt field exists on this model, so the list is a sentence.
  it("renders the negative prompt as its own Avoid paragraph", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { negative_prompt: "blurry, warped label" }, plan: EMPTY,
    });
    expect(out).toContain("\n\nAvoid: blurry, warped label.");
  });

  it("leaves no dangling Avoid when the negative prompt is cleared", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { negative_prompt: "   " }, plan: EMPTY,
    });
    expect(out).not.toContain("Avoid:");
  });

  it("emits only the prompt and the audio clause with nothing else set", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY });
    expect(out).toBe(
      "A cup.\n\nSound design: ambience and foley only. No dialogue. No extra sound effects.",
    );
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/lib/video-gen/__tests__/compose-omni-prompt.test.ts
```

Expected: FAIL — `Failed to resolve import "../compose-omni-prompt"`.

- [ ] **Step 3: Implement**

Create `src/lib/video-gen/compose-omni-prompt.ts`:

```ts
import { avoidClause } from "./providers/avoid-clause";
import type { OmniInputPlan } from "./plan-omni-input";

/**
 * D208 — Omni generates an audio track ALWAYS. There is no off switch anywhere in the API, so
 * this steers the track rather than enabling it. Each value is a documented clause shape.
 *
 * `ambient` is the default because Omni has no voice control of any kind — no reference upload,
 * no cloning, no fixing a voice in a later turn. A narrator therefore differs between generations
 * and cannot be corrected, so any deliverable spanning more than one generation lays a single
 * continuous VO in the edit instead of asking for speech here.
 */
export const OMNI_AUDIO_CLAUSES: Record<string, string> = {
  ambient: "Sound design: ambience and foley only. No dialogue. No extra sound effects.",
  dialogue: "Sound design: ambience, foley and natural dialogue.",
  music: "Sound design: ambience and foley, with a music bed. No dialogue.",
};

/**
 * The complete text part of an Omni request.
 *
 * Order follows the vendor's documented shape: declaration header, prompt body, on-screen text,
 * sound design, negatives, then the closing role guidance. Negatives sit near the end as their own
 * paragraph so a comma-separated defect list cannot read as a continuation of the last shot
 * sentence — the same reasoning as composeVeoPrompt (D183).
 *
 * The prompt arrives already shaped: a timecode ladder for a multishot shot, or a single-moment
 * description plus its no-cuts instruction for a single one. That decision belongs to the
 * motion-prompt node, which is the only place that knows the upstream shot's multishot flag.
 */
export function composeOmniPrompt(args: {
  prompt: string;
  params: Record<string, unknown>;
  plan: OmniInputPlan;
}): string {
  const { prompt, params, plan } = args;

  const blocks: string[] = [];
  if (plan.header) blocks.push(plan.header);
  blocks.push(prompt.trim());

  const onScreenText = String(params.on_screen_text ?? "").trim();
  if (onScreenText) blocks.push(`On-screen text reads exactly: "${onScreenText}".`);

  const audio = String(params.audio ?? "ambient");
  blocks.push(OMNI_AUDIO_CLAUSES[audio] ?? OMNI_AUDIO_CLAUSES.ambient);

  const avoid = avoidClause(String(params.negative_prompt ?? ""));
  if (avoid) blocks.push(avoid);

  if (plan.guidance) blocks.push(plan.guidance);

  return blocks.join("\n\n");
}
```

- [ ] **Step 4: Run and watch it pass**

```bash
npx vitest run src/lib/video-gen/__tests__/compose-omni-prompt.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/compose-omni-prompt.ts src/lib/video-gen/__tests__/compose-omni-prompt.test.ts
git commit -m "feat(video-gen): composeOmniPrompt folds Omni's sentence-controls into the prompt (D208)"
```

---

## Task 4: Params and the shared shape module

**Files:**
- Create: `src/lib/video-gen/params/gemini-omni.ts`
- Create: `src/lib/video-gen/gemini-omni-shape.ts`

**Interfaces:**
- Consumes: `ParamSpec` from `@/lib/image-gen/types`; `ConstraintRule` from `./types`.
- Produces: `geminiOmniParams: ParamSpec[]`, `GEMINI_OMNI_NEGATIVE_DEFAULT: string`, `GEMINI_OMNI_IMAGE_INPUTS`, `GEMINI_OMNI_RULES: ConstraintRule[]`. Consumed by Task 5 (provider) and Task 6 (client mirror).

- [ ] **Step 1: Create the params file**

Create `src/lib/video-gen/params/gemini-omni.ts`:

```ts
import type { ParamSpec } from "@/lib/image-gen/types";

// Product-tuned defect list, mirroring KLING_NEGATIVE_DEFAULT's reasoning: no bare `text` or
// `logo` negatives, because on a product shot the label's real text and logo must be PRESERVED.
// Kept as its own constant rather than shared with Kling's — per-provider defaults are tuned
// independently from eval results.
export const GEMINI_OMNI_NEGATIVE_DEFAULT =
  "blurry, low quality, distorted, deformed, morphing, warped label, label deformation, " +
  "text distortion, changing text, flickering, jitter, floating objects, extra objects, " +
  "duplicated product, watermark";

// EVERY param is `primary`. The Advanced accordion was deleted from the focus view in 7e1c643,
// so an `advanced` control renders nowhere at all — the trap `aspect_ratio` fell into on Kling O1.
//
// There is deliberately NO `continuous_take` param: the Shot node's multishot toggle already
// carries that decision, and two controls for one thing is the pair that drifts apart.
export const geminiOmniParams: ParamSpec[] = [
  {
    name: "resolution",
    label: "Resolution",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue: "720p",
    constraints: { type: "select", options: ["360p", "720p", "1080p", "4k"] },
    description:
      "720p is the only natively rendered tier — 1080p and 4k are upscaled from it, at 1.5x and " +
      "3x the price. 360p costs a third of 720p and is the draft tier for iterating.",
  },
  {
    // ALWAYS sent. Omitting duration yields the API default of 8s, so a 10s timecode ladder
    // would come back truncated at 8s with no error and at full price.
    name: "duration",
    label: "Duration",
    component: "slider",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue: 8,
    constraints: { type: "slider", min: 3, max: 10, step: 1 },
  },
  {
    // 16:9 and 9:16 only — no 1:1, unlike Kling O1.
    name: "aspect_ratio",
    label: "Aspect Ratio",
    component: "select",
    group: "primary",
    order: 2,
    visible: true,
    defaultValue: "16:9",
    constraints: { type: "select", options: ["16:9", "9:16"] },
  },
  {
    // NOT an API field. Omni always generates audio; this steers it (D208).
    name: "audio",
    label: "Audio",
    component: "select",
    group: "primary",
    order: 3,
    visible: true,
    defaultValue: "ambient",
    constraints: { type: "select", options: ["ambient", "dialogue", "music"] },
    description:
      "Audio is always generated and cannot be switched off. There is no voice control of any " +
      "kind, so a narrator differs between generations — lay one continuous VO in the edit.",
  },
  {
    // NOT an API field. Omni renders screen-space type correctly and the docs recommend stating
    // it explicitly, so the copy is quoted verbatim into the prompt.
    name: "on_screen_text",
    label: "On-screen Text",
    component: "textarea",
    group: "primary",
    order: 4,
    visible: true,
    defaultValue: "",
    constraints: { type: "textarea", maxLength: 500 },
    description:
      "Rendered as screen-space type. A brand lock-up should still be composited in post — " +
      "rendered-correctly is not typographically exact.",
  },
  {
    // NOT an API field — Omni has no negative-prompt parameter at all. Folded into the prompt as
    // an `Avoid:` paragraph by composeOmniPrompt, the shape composeVeoPrompt uses on Lite (D183).
    name: "negative_prompt",
    label: "Negative Prompt",
    component: "textarea",
    group: "primary",
    order: 5,
    visible: true,
    defaultValue: GEMINI_OMNI_NEGATIVE_DEFAULT,
    constraints: { type: "textarea", maxLength: 2500 },
  },
];
```

- [ ] **Step 2: Create the shared shape module**

Create `src/lib/video-gen/gemini-omni-shape.ts`:

```ts
// NO `server-only` import — this module is read by BOTH providers/gemini-omni.ts (server) and
// client-models.ts (bundled into client components).
//
// Veo and Kling hand-copy their imageInputs and rules into client-models.ts because their
// constants live in `server-only` provider files. That makes two copies of one fact, and the API
// route caps referenceUrls against the CLIENT copy while the provider is built from the SERVER
// copy — so a drift between them silently changes what gets sent. One shared module removes the
// class of bug rather than adding a third copy of it.
import type { ConstraintRule } from "./types";

/**
 * 6 is the highest reference count Google's own documented example demonstrates. It is NOT a
 * stated maximum — the docs cap video references at 3 but say nothing about image references.
 * Treat it as a conservative floor to revise upward with evidence, not as a published limit.
 *
 * Unlike Veo, frames and references are NOT mutually exclusive on Omni: no rule pins duration or
 * disables a slot when the other is in use.
 */
export const GEMINI_OMNI_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 6,
} as const;

export const GEMINI_OMNI_RULES: ConstraintRule[] = [
  {
    id: "omni-last-frame-needs-first-frame",
    when: {
      op: "and",
      conditions: [
        { field: "hasEndFrame", op: "eq", value: true },
        { field: "hasStartFrame", op: "eq", value: false },
      ],
    },
    effect: { disableGenerate: true },
    // Leads with the consequence rather than the tag names — an operator reads the panel, not
    // the API docs. Matches the phrasing of Veo Lite's end-frame-requires-start-frame rule.
    reason: "End frame needs a start frame — <LAST_FRAME> requires <FIRST_FRAME>",
  },
];
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors from either new file. Pre-existing errors elsewhere in the repo are not yours to fix.

- [ ] **Step 4: Commit**

```bash
git add src/lib/video-gen/params/gemini-omni.ts src/lib/video-gen/gemini-omni-shape.ts
git commit -m "feat(video-gen): Gemini Omni param specs and shared client/server shape (D208)"
```

---

## Task 5: The provider

**Read `docs/superpowers/specs/2026-08-28-gemini-omni-api-findings.md` before starting.** The published Google docs contradict the working request shape on four points, and anyone "correcting" this code back toward the docs will produce a 400.

**Files:**
- Create: `src/lib/video-gen/providers/gemini-omni.ts`
- Create: `src/lib/video-gen/__tests__/gemini-omni-request.test.ts`
- Modify: `src/lib/video-gen/types.ts:78`
- Modify: `src/lib/video-gen/registry.ts`

**Interfaces:**
- Consumes: `planOmniInput` (Task 2), `composeOmniPrompt` (Task 3), `geminiOmniParams` / `GEMINI_OMNI_IMAGE_INPUTS` / `GEMINI_OMNI_RULES` (Task 4), `fetchAsBase64` (Task 1).
- Produces: `geminiOmni: VideoGenModelSpec`, and the exported pure helpers `omniDurationSeconds`, `buildOmniResponseFormat`, `extractOmniVideoUri`, `fileNameFromUri`.

- [ ] **Step 1: Widen the provider union**

In `src/lib/video-gen/types.ts:78`, change:

```ts
  provider: "veo" | "openai" | "kling";
```

to:

```ts
  provider: "veo" | "openai" | "kling" | "gemini";
```

- [ ] **Step 2: Write the failing tests for the pure helpers**

Create `src/lib/video-gen/__tests__/gemini-omni-request.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  omniDurationSeconds,
  buildOmniResponseFormat,
  extractOmniVideoUri,
  fileNameFromUri,
} from "../providers/gemini-omni";

describe("omniDurationSeconds", () => {
  it("passes a valid duration through", () => {
    expect(omniDurationSeconds({ duration: 6 })).toBe(6);
  });

  // A node saved before a spec change still holds its old value and nothing re-validates params
  // on load, so an out-of-range duration must be clamped rather than sent.
  it("clamps to the 3-10 range", () => {
    expect(omniDurationSeconds({ duration: 15 })).toBe(10);
    expect(omniDurationSeconds({ duration: 1 })).toBe(3);
  });

  // Kling stores duration as a string, Veo as a number. A node switched between models can
  // arrive with either, so both must resolve to the same number.
  it("coerces a string duration", () => {
    expect(omniDurationSeconds({ duration: "8" })).toBe(8);
  });

  it("falls back to 8 for a missing or unparseable value", () => {
    expect(omniDurationSeconds({})).toBe(8);
    expect(omniDurationSeconds({ duration: "abc" })).toBe(8);
  });
});

describe("buildOmniResponseFormat", () => {
  // VERIFIED AGAINST THE LIVE API: duration is a STRING here, not an integer, and not in
  // video_config. The integer form returns 400 "Invalid input at 'response_format'".
  it("emits duration as a seconds string", () => {
    expect(buildOmniResponseFormat({ duration: 8 }).duration).toBe("8s");
    expect(buildOmniResponseFormat({ duration: 3 }).duration).toBe("3s");
  });

  it("always requests uri delivery and the video type", () => {
    const rf = buildOmniResponseFormat({});
    expect(rf.delivery).toBe("uri");
    expect(rf.type).toBe("video");
  });

  it("defaults resolution to 720p and rejects one this model does not offer", () => {
    expect(buildOmniResponseFormat({}).resolution).toBe("720p");
    expect(buildOmniResponseFormat({ resolution: "8k" }).resolution).toBe("720p");
    expect(buildOmniResponseFormat({ resolution: "360p" }).resolution).toBe("360p");
  });

  // Omni has no 1:1, unlike Kling O1 — a node switched from O1 can carry one.
  it("falls back to 16:9 for an unsupported aspect ratio", () => {
    expect(buildOmniResponseFormat({ aspect_ratio: "1:1" }).aspect_ratio).toBe("16:9");
    expect(buildOmniResponseFormat({ aspect_ratio: "9:16" }).aspect_ratio).toBe("9:16");
  });
});

describe("extractOmniVideoUri", () => {
  // VERIFIED: `output_video` does NOT exist on the REST response — it is an SDK-only convenience
  // field. The video lives in the model_output step.
  it("reads the video uri out of the model_output step", () => {
    const uri = extractOmniVideoUri({
      steps: [
        { type: "thought", content: [{ type: "thought" }] },
        { type: "model_output", content: [
          { type: "video", mime_type: "video/mp4", uri: "https://g/v1beta/files/abc:download?alt=media" },
        ] },
      ],
    });
    expect(uri).toBe("https://g/v1beta/files/abc:download?alt=media");
  });

  it("returns undefined when no video came back", () => {
    expect(extractOmniVideoUri({ steps: [{ type: "thought" }] })).toBeUndefined();
    expect(extractOmniVideoUri({})).toBeUndefined();
  });
});

describe("fileNameFromUri", () => {
  it("extracts the Files API resource name", () => {
    expect(fileNameFromUri("https://generativelanguage.googleapis.com/v1beta/files/u1jbms4c1zkl:download?alt=media"))
      .toBe("files/u1jbms4c1zkl");
  });

  it("returns undefined for a URI with no file segment", () => {
    expect(fileNameFromUri("https://example.com/video.mp4")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run and watch it fail**

```bash
npx vitest run src/lib/video-gen/__tests__/gemini-omni-request.test.ts
```

Expected: FAIL — `Failed to resolve import "../providers/gemini-omni"`.

- [ ] **Step 4: Write the provider**

Create `src/lib/video-gen/providers/gemini-omni.ts`:

```ts
import "server-only";
import { logger } from "@trigger.dev/sdk/v3";
import type { VideoGenInput, VideoGenResult, VideoGenModelSpec } from "../types";
import { geminiOmniParams } from "../params/gemini-omni";
import { GEMINI_OMNI_IMAGE_INPUTS, GEMINI_OMNI_RULES } from "../gemini-omni-shape";
import { planOmniInput } from "../plan-omni-input";
import { composeOmniPrompt } from "../compose-omni-prompt";
import { fetchAsBase64 } from "./fetch-as-base64";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OMNI_MODEL = "gemini-omni-1.1-flash";

function getApiKey(): string {
  // Deliberately the SAME key Veo uses — Omni is the Gemini API, not a separate product.
  const key = process.env.GOOGLE_GENAI_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_GENAI_API_KEY");
  return key;
}

const VALID_RESOLUTIONS = ["360p", "720p", "1080p", "4k"];
const VALID_ASPECT_RATIOS = ["16:9", "9:16"];
const MIN_DURATION = 3;
const MAX_DURATION = 10;

/**
 * The clamped duration in seconds, as a NUMBER.
 *
 * Two consumers that must never disagree: the request body (which needs it as a string) and the
 * `durationSeconds` reported back for costing. Reading the number back off the built request
 * would yield NaN, since the wire value is "8s" — a zero-cost record for a video that really ran.
 *
 * Clamped rather than trusted: params/gemini-omni.ts is a static spec, and a node saved before a
 * spec change still holds its old value with nothing re-validating it on load.
 */
export function omniDurationSeconds(params: Record<string, unknown>): number {
  const parsed = Number(params.duration);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(parsed)));
}

/**
 * D217 — everything dimensional lives HERE, not in video_config.
 *
 * Verified against the live API: `generation_config.video_config` accepts `task` and nothing else.
 * It rejects `duration`, `resolution` and `aspect_ratio` with "Unknown parameter", contradicting
 * Google's published documentation on all three. `duration` is a STRING ("8s") — the integer form
 * returns "Invalid input at 'response_format'".
 *
 * `type` is the constant "video". It is never a param and is never surfaced in the UI.
 *
 * `delivery` is always "uri", not only above 4MB: completeGeneration already downloads a provider
 * URI with x-goog-api-key and re-uploads to GCS, so the URI path needs no new machinery, while
 * inline base64 would carry a whole video through this process's memory for no gain.
 */
export function buildOmniResponseFormat(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const resolution = String(params.resolution ?? "720p");
  const ratio = String(params.aspect_ratio ?? "16:9");
  return {
    type: "video",
    resolution: VALID_RESOLUTIONS.includes(resolution) ? resolution : "720p",
    aspect_ratio: VALID_ASPECT_RATIOS.includes(ratio) ? ratio : "16:9",
    delivery: "uri",
    duration: `${omniDurationSeconds(params)}s`,
  };
}

type OmniContent = { type: string; mime_type?: string; uri?: string; data?: string };
type OmniStep = { type: string; content?: OmniContent[] };
type OmniInteraction = {
  id?: string;
  status?: string;
  steps?: OmniStep[];
  error?: { message?: string };
};

/**
 * The generated video's URI.
 *
 * `output_video` is an SDK-only convenience field — VERIFIED absent from the REST response, as the
 * docs' own note says. The video lives in the `model_output` step's `video`-typed content entry.
 */
export function extractOmniVideoUri(interaction: OmniInteraction): string | undefined {
  for (const step of interaction.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const content of step.content ?? []) {
      if (content.type === "video" && content.uri) return content.uri;
    }
  }
  return undefined;
}

/** `files/abc-123` from a download URI, for the Files API status check. */
export function fileNameFromUri(uri: string): string | undefined {
  const match = uri.match(/files\/([a-zA-Z0-9_-]+)/);
  return match ? `files/${match[1]}` : undefined;
}

/**
 * Best-effort readiness check on the returned Files object.
 *
 * Whether a delivery:"uri" file needs to reach ACTIVE before it can be downloaded is not verified
 * — so this FAILS OPEN. A non-OK metadata response logs and returns rather than throwing, because
 * completeGeneration downloads the URI itself and will surface a real failure there. Blocking a
 * successful generation on an unverified endpoint would be the worse error.
 */
async function waitForFileReady(fileName: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/${fileName}`, {
      headers: { "x-goog-api-key": getApiKey() },
    });
    if (!res.ok) {
      logger.info("Omni file metadata unavailable — continuing", { fileName, status: res.status });
      return;
    }
    const file = (await res.json()) as { state?: string };
    logger.info("Omni file state", { fileName, state: file.state });
  } catch (e) {
    logger.info("Omni file check failed — continuing", {
      fileName,
      error: e instanceof Error ? e.message : "unknown",
    });
  }
}

async function generateWithOmni(input: VideoGenInput): Promise<VideoGenResult> {
  // D207 mirrored server-side. The client evaluates the same rule, so this is the backstop for a
  // caller that bypasses the UI — a named error now rather than a 400 minutes later.
  if (input.endFrameUrl && !input.startFrameUrl) {
    throw new Error("<LAST_FRAME> requires <FIRST_FRAME> — Omni cannot use an end frame alone");
  }

  const plan = planOmniInput({
    startFrameUrl: input.startFrameUrl,
    endFrameUrl: input.endFrameUrl,
    referenceUrls: input.referenceUrls ?? [],
  });

  // Images first, in planOmniInput's order, then the text part last. The order IS the contract:
  // @ImageN in the generated header counts this array from 1.
  const imageParts = await Promise.all(
    plan.uploads.map(async (upload) => {
      const { imageBytes, mimeType } = await fetchAsBase64(upload.url);
      return { type: "image", data: imageBytes, mime_type: mimeType };
    }),
  );

  const text = composeOmniPrompt({ prompt: input.prompt, params: input.params, plan });

  const res = await fetch(`${API_BASE}/interactions`, {
    method: "POST",
    headers: { "x-goog-api-key": getApiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OMNI_MODEL,
      input: [...imageParts, { type: "text", text }],
      // task and NOTHING else — video_config rejects every other key (D217).
      generation_config: { video_config: { task: plan.task } },
      response_format: buildOmniResponseFormat(input.params),
      // REQUIRED by delivery:"uri" — the API returns 400 "store=true is required when response
      // format has video delivery set to URI" without it. Not a preference. A useful side effect:
      // the interaction is stored, so previous_interaction_id editing is available if the edit
      // chain is ever built, with no request-shape change.
      store: true,
      // background:false returns the finished interaction synchronously, so there is no
      // task-polling loop — verified.
      background: false,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Omni create failed (${res.status}): ${body}`);
  }

  const interaction = (await res.json()) as OmniInteraction;
  logger.info("Omni interaction", { id: interaction.id, status: interaction.status });

  if (interaction.status === "failed") {
    throw new Error(`Omni generation failed: ${interaction.error?.message ?? "unknown error"}`);
  }

  const videoUrl = extractOmniVideoUri(interaction);
  if (!videoUrl) throw new Error("Omni completed but returned no video URI");

  const fileName = fileNameFromUri(videoUrl);
  if (fileName) await waitForFileReady(fileName);

  // The REQUESTED duration — Omni returns none in its response. Read from the same helper the
  // request used, never parsed back off the "8s" wire value.
  return { videoUrl, durationSeconds: omniDurationSeconds(input.params) };
}

export const geminiOmni: VideoGenModelSpec = {
  id: "gemini:gemini-omni-1.1-flash",
  provider: "gemini",
  label: "Gemini Omni 1.1 Flash",
  pickerLabel: "Omni 1.1",
  providerLabel: "Google",
  maxDurationSeconds: 10,
  imageInputs: GEMINI_OMNI_IMAGE_INPUTS,
  params: geminiOmniParams,
  rules: GEMINI_OMNI_RULES,
  generate: generateWithOmni,
};
```

- [ ] **Step 5: Register it**

Replace `src/lib/video-gen/registry.ts` entirely:

```ts
import "server-only";
import type { VideoGenModelSpec } from "./types";
import { veoLite, veoFast, veoQuality } from "./providers/veo";
import { kling30, klingO1 } from "./providers/kling";
import { geminiOmni } from "./providers/gemini-omni";

export const videoGenRegistry: Record<string, VideoGenModelSpec> = {
  [veoLite.id]: veoLite,
  [veoFast.id]: veoFast,
  [veoQuality.id]: veoQuality,
  [kling30.id]: kling30,
  [klingO1.id]: klingO1,
  [geminiOmni.id]: geminiOmni,
};

export const DEFAULT_VIDEO_MODEL_ID = "veo:veo-3.1-fast";
```

- [ ] **Step 6: Run and watch it pass**

```bash
npx tsc --noEmit && npx vitest run src/lib/video-gen
```

Expected: PASS, 14 new tests, no new type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/video-gen/providers/gemini-omni.ts src/lib/video-gen/registry.ts src/lib/video-gen/types.ts src/lib/video-gen/__tests__/gemini-omni-request.test.ts
git commit -m "feat(video-gen): Gemini Omni provider with the verified request shape (D205, D206, D217)"
```

---

## Task 6: Cost, client mirror, and download headers

Everything needed to make the model selectable and its output retrievable.

**Files:**
- Modify: `src/lib/video-gen/cost.ts:25-29`
- Modify: `src/lib/video-gen/client-models.ts`
- Modify: `src/lib/generations/complete.ts:21-32`
- Create: `src/lib/video-gen/__tests__/gemini-omni-registration.test.ts`

**Interfaces:**
- Consumes: `GEMINI_OMNI_IMAGE_INPUTS`, `GEMINI_OMNI_RULES` (Task 4), `geminiOmniParams` (Task 4), `geminiOmni` (Task 5).
- Produces: `videoGenClientModelMap["gemini:gemini-omni-1.1-flash"]` — read by the focus view, the model picker, and the API route's reference cap; `RESOLUTION_ONLY_PRICING` replacing `VEO_RESOLUTION_PRICING`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/video-gen/__tests__/gemini-omni-registration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { videoGenRegistry } from "../registry";
import { videoGenClientModelMap } from "../client-models";
import { validateAgainstRules } from "../constraints";
import { computeVideoCost } from "../cost";

const OMNI = "gemini:gemini-omni-1.1-flash";

describe("Gemini Omni registration", () => {
  it("is present in both the server registry and the client map", () => {
    expect(videoGenRegistry[OMNI]).toBeDefined();
    expect(videoGenClientModelMap[OMNI]).toBeDefined();
  });

  // The API route caps referenceUrls against the CLIENT copy while the provider is built from the
  // SERVER copy. Both now read one shared module, so this asserts they stayed wired to it.
  it("shares one identical imageInputs, params and rules object across both sides", () => {
    expect(videoGenClientModelMap[OMNI].imageInputs).toBe(videoGenRegistry[OMNI].imageInputs);
    expect(videoGenClientModelMap[OMNI].params).toBe(videoGenRegistry[OMNI].params);
    expect(videoGenClientModelMap[OMNI].rules).toBe(videoGenRegistry[OMNI].rules);
  });

  it("blocks an end frame with no start frame", () => {
    const violation = validateAgainstRules(videoGenClientModelMap[OMNI].rules, {
      params: {}, hasStartFrame: false, hasEndFrame: true, referenceCount: 0,
    });
    expect(violation).toBe("End frame needs a start frame — <LAST_FRAME> requires <FIRST_FRAME>");
  });

  // Unlike Veo, references and frames coexist on this model — no rule may fire here.
  it("allows a start frame, an end frame and references together", () => {
    const violation = validateAgainstRules(videoGenClientModelMap[OMNI].rules, {
      params: {}, hasStartFrame: true, hasEndFrame: true, referenceCount: 3,
    });
    expect(violation).toBeNull();
  });
});

describe("computeVideoCost — Gemini Omni", () => {
  it("prices all four resolutions per second", () => {
    expect(computeVideoCost(OMNI, 1, true, "360p")?.usd).toBeCloseTo(0.03, 5);
    expect(computeVideoCost(OMNI, 1, true, "720p")?.usd).toBeCloseTo(0.10, 5);
    expect(computeVideoCost(OMNI, 1, true, "1080p")?.usd).toBeCloseTo(0.15, 5);
    expect(computeVideoCost(OMNI, 1, true, "4k")?.usd).toBeCloseTo(0.30, 5);
  });

  // Omni generates audio on every request and the rate already includes it, so unlike Kling the
  // audio flag must not move the price in either direction.
  it("charges the same whether audio is flagged on or off", () => {
    expect(computeVideoCost(OMNI, 8, true, "720p")?.usd)
      .toBe(computeVideoCost(OMNI, 8, false, "720p")?.usd);
  });

  it("defaults to the 720p rate when no resolution is given", () => {
    expect(computeVideoCost(OMNI, 8, true)?.usd).toBeCloseTo(0.80, 5);
  });

  // Strict lookup, no cross-key fallback — an unreachable resolution must not silently bill at
  // the 720p rate.
  it("returns null for a resolution this model does not offer", () => {
    expect(computeVideoCost(OMNI, 8, true, "8k")).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/lib/video-gen/__tests__/gemini-omni-registration.test.ts
```

Expected: FAIL — `videoGenClientModelMap[OMNI]` is undefined and every cost case returns `null`.

- [ ] **Step 3: Rename the pricing table and add the Omni row**

In `src/lib/video-gen/cost.ts`, replace the declaration at line 25:

```ts
const VEO_RESOLUTION_PRICING: Record<string, Record<string, number>> = {
```

with:

```ts
// Renamed from VEO_RESOLUTION_PRICING: this is the shape for any model priced by resolution where
// audio does not move the price — now Veo AND Gemini Omni. Omni generates audio on every request
// and the published rate already includes it, so there is no audio dimension to key on, exactly
// as with every Veo 3.1 row.
const RESOLUTION_ONLY_PRICING: Record<string, Record<string, number>> = {
```

Add this entry to that object, after the `"veo:veo-3.1"` line:

```ts
  // Source: ai.google.dev/gemini-api/docs/pricing + the Omni 1.1 launch post (verified
  // 2026-08-28). 1080p and 4k are UPSCALED from a 720p generation, not natively rendered — the
  // price rises 1.5x and 3x for resolution alone, which is why 720p is the default and 360p
  // ($0.03/s, ~60% faster) is the draft tier.
  "gemini:gemini-omni-1.1-flash": {
    "360p": 0.03, "720p": 0.10, "1080p": 0.15, "4k": 0.30,
  },
```

Then update the two use sites inside `computeVideoCost`, renaming the local variable so it stops claiming to be Veo-specific:

```ts
  const resolutionOnlyPricing = RESOLUTION_ONLY_PRICING[modelId];
  if (resolutionOnlyPricing) {
    // Strict lookup, same as Kling above — an unreachable resolution returns null rather than
    // silently substituting the 720p rate.
    const perSecond = resolutionOnlyPricing[resolution ?? "720p"];
    if (perSecond === undefined) return null;
    const usd = durationSeconds * perSecond;
    return { usd, inr: usd * USD_TO_INR };
  }
```

- [ ] **Step 4: Add the client mirror**

In `src/lib/video-gen/client-models.ts`, add to the import block at the top:

```ts
import { geminiOmniParams } from "./params/gemini-omni";
import { GEMINI_OMNI_IMAGE_INPUTS, GEMINI_OMNI_RULES } from "./gemini-omni-shape";
```

`gemini-omni-shape.ts` has no `server-only` import, so this is safe in a client bundle — that is the whole reason it exists. Do **not** import from `providers/gemini-omni.ts` here; that would pull `server-only` into client components and break the build.

Add this entry to `videoGenClientModelMap`, after the `"kling:kling-o1"` entry:

```ts
  "gemini:gemini-omni-1.1-flash": {
    id: "gemini:gemini-omni-1.1-flash",
    provider: "gemini",
    label: "Gemini Omni 1.1 Flash",
    pickerLabel: "Omni 1.1",
    providerLabel: "Google",
    maxDurationSeconds: 10,
    imageInputs: GEMINI_OMNI_IMAGE_INPUTS,
    params: geminiOmniParams,
    rules: GEMINI_OMNI_RULES,
  },
```

`providerLabel` is `"Google"`, which creates a new picker group. Veo's entries in this map use `providerLabel: "Veo"`, so Omni will not be grouped with them — intended, since it is a different model family with different rules.

- [ ] **Step 5: Teach `completeGeneration` to download an Omni video**

In `src/lib/generations/complete.ts`, replace `buildVideoDownloadHeaders` (lines 21-32):

```ts
function buildVideoDownloadHeaders(modelUsed: string | null): HeadersInit {
  const base = { "User-Agent": "Mozilla/5.0 (compatible; CreativeOS/1.0)" };
  // Veo and Gemini Omni both return a Google Files API URI that needs the API key to download.
  // Same key, same header — they are the same API.
  if (modelUsed?.startsWith("veo:") || modelUsed?.startsWith("gemini:")) {
    const key = process.env.GOOGLE_GENAI_API_KEY ?? "";
    return { ...base, "x-goog-api-key": key };
  }
  if (modelUsed?.startsWith("openai:")) {
    const key = process.env.OPENAI_API_KEY ?? "";
    return { ...base, Authorization: `Bearer ${key}` };
  }
  return base;
}
```

- [ ] **Step 6: Run and confirm no stale references**

```bash
npx tsc --noEmit && npx vitest run src/lib/video-gen src/lib/generations
grep -rn "VEO_RESOLUTION_PRICING" src/
```

Expected: tests PASS across both directories; the `grep` returns no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/video-gen/cost.ts src/lib/video-gen/client-models.ts src/lib/generations/complete.ts src/lib/video-gen/__tests__/gemini-omni-registration.test.ts
git commit -m "feat(video-gen): price, register and download Gemini Omni (D205)"
```

---

## Task 7: Hide Kling's `multi_shot`

Spec §8. Omni becomes the only multi-shot model surfaced in the UI.

**Files:**
- Modify: `src/lib/video-gen/params/kling.ts:90-101`
- Modify: `src/lib/video-gen/__tests__/kling-params.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new — `multi_shot` keeps its name, position and `false` default; only `visible` changes.

- [ ] **Step 1: Write the failing test**

In `src/lib/video-gen/__tests__/kling-params.test.ts`, add this block at the end of the file:

```ts
describe("multi_shot is hidden on both Kling models", () => {
  // D218 — Omni is the only multi-shot model surfaced. Hidden rather than deleted: visible:false
  // still sends the param with its default, so the request shape is byte-identical, every
  // persisted node keeps resolving, and Kling 3.0's end-frame rule that pins multi_shot stays
  // valid. Deleting it would make the route stop resolving a name saved nodes still carry.
  it("keeps the param present, defaulted false, and invisible", () => {
    for (const params of [kling30Params, klingO1Params]) {
      const multiShot = params.find((p) => p.name === "multi_shot");
      expect(multiShot).toBeDefined();
      expect(multiShot!.visible).toBe(false);
      expect(multiShot!.defaultValue).toBe(false);
    }
  });
});
```

If `klingO1Params` is not already imported at the top of that file, add it to the existing import from `../params/kling`.

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/lib/video-gen/__tests__/kling-params.test.ts
```

Expected: FAIL — `expected true to be false` on `visible`.

- [ ] **Step 3: Hide the param**

In `src/lib/video-gen/params/kling.ts`, change `multiShotParam` (lines 90-101) so `visible` is `false`, and replace its comment:

```ts
const multiShotParam: ParamSpec = {
  name: "multi_shot",
  label: "Multi-Shot",
  component: "toggle",
  group: "advanced",
  order: 1,
  // D218 — hidden, not deleted. Gemini Omni is the only multi-shot model surfaced in the UI, so
  // multishot means one thing in one place. `visible: false` still sends the param with its
  // default, so the request shape is byte-identical, every persisted node keeps resolving, and
  // Kling 3.0's end-frame rule that pins multi_shot stays valid and untouched. Deleting the param
  // would make the route stop resolving a name that saved nodes still carry.
  visible: false,
  // Off by default: multi-shot lets Kling cut between shots, which fights the single continuous
  // moment a product clip wants. Opt in, don't opt out.
  defaultValue: false,
  constraints: { type: "toggle" },
};
```

**Change only `visible`.** Leave `group`, `order`, `defaultValue` and `constraints` exactly as they
are — a hidden param's group never reaches the renderer, so touching it is noise in the diff with
no behavioural effect.

- [ ] **Step 4: Run the whole suite**

```bash
npx vitest run src/lib/video-gen
```

Expected: PASS. The existing `version-params.test.ts` cases that read `multi_shot` still pass — `describeVersionParams` reads recorded snapshots, not visibility.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/params/kling.ts src/lib/video-gen/__tests__/kling-params.test.ts
git commit -m "feat(video-gen): hide Kling multi_shot so Omni is the only multishot model (D218)"
```

---

## Task 8: End-to-end verification

Not TDD — the acceptance gate. Nothing above proves a real video comes back through the app.

**Files:** none, unless a defect is found.

- [ ] **Step 1: Start the app**

```bash
npm run dev
```

- [ ] **Step 2: Generate with no images**

On a canvas, connect a video-prompt node with output to a video-gen node. Pick **Gemini Omni 1.1 Flash** (under a **Google** group). Set resolution `360p`, duration `3`. Generate.

Expected: completes; the video plays in the node; the credits footer shows $0.09 at the current USD→INR rate. In the Trigger.dev logs, confirm the request carried `"task": "text_to_video"`, `"duration": "3s"` inside `response_format`, and `"store": true`.

- [ ] **Step 3: Generate with a start frame and two references**

Connect three image nodes to the video-gen node. Assign one **Start** and two **Ref**. Keep `360p` and duration `3`.

Expected: completes. Confirm in the logs that `task` was `image_to_video` and the prompt began with
`[# Sources <FIRST_FRAME>@Image1] [# References <IMAGE_REF_0>@Image2 <IMAGE_REF_1>@Image3]`.
**This is the first time the image-role tags are exercised against the real model** — check the output actually respects the references rather than ignoring them.

- [ ] **Step 4: Confirm the end-frame rule blocks**

Assign one image **End** and none as **Start**.

Expected: Generate is disabled with the reason "End frame needs a start frame — `<LAST_FRAME>` requires `<FIRST_FRAME>`". No credits are reserved.

- [ ] **Step 5: Confirm Kling's toggle is gone**

Switch the model to **Kling O1**, then **Kling 3.0**.

Expected: no Multi-Shot control renders on either. Generating still works and behaves exactly as before.

- [ ] **Step 6: Observe the default cutting behaviour**

Generate at `360p` with `duration` **10** and a prompt describing two distinct beats, e.g.
*"A hand lifts a jar from a linen surface. Then a macro view as the lid turns."*

Expected: the returned clip **cuts between the two beats** rather than holding one continuous take. This is the assumption the whole multishot design rests on and it has never been verified — the only prior live generation was 3 seconds, too short to show a cut. **If it does not cut, stop and report before Plan 2 is written**: the motion-prompt ladder in Plan 2 assumes this behaviour.

- [ ] **Step 7: Record the outcome**

Append a short "Verified" note to the API findings file's §5 stating what was generated, at what settings, whether the reference tags were respected, and whether the model cut by default. Commit:

```bash
git add docs/superpowers/specs/2026-08-28-gemini-omni-api-findings.md
git commit -m "docs(video-gen): record end-to-end Omni verification"
```

---

## Done when

- **Gemini Omni 1.1 Flash** appears in the model picker under a **Google** group.
- A generation completes end to end and the video plays in the node.
- The end-frame-without-start-frame rule blocks Generate before credits are reserved.
- No Multi-Shot control renders on either Kling model.
- `npx vitest run src/lib/video-gen src/lib/generations` passes.
- `npx tsc --noEmit` reports no new errors.
- `grep -rn "VEO_RESOLUTION_PRICING" src/` returns nothing.
- The API findings file records whether Omni cuts by default and whether reference tags were respected.

## Not in this plan

The parse change (`duration_seconds`), hybrid fan-out grouping, the `multishot` flag and its split, and the two upstream checks in the motion-prompt and video-gen nodes. That is Plan 2, and it depends on Task 8 Step 6 confirming the model cuts by default.

**One deliberate difference from the spec:** spec §8 gives `duration` a default of "the shot total". That derivation is part of the video-gen upstream check, which is Plan 2 — so here `duration` is a plain 3–10s slider defaulting to **8**, exactly like Veo and Kling. This is a staged difference, not a spec miss; Plan 2 replaces the default with the derived value and adds the label saying where it came from.

Until Plan 2 lands, Omni is driven by hand-written prompts and directly connected image nodes — which works, and is worth shipping.
