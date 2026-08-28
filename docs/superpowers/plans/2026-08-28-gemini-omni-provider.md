# Gemini Omni 1.1 Flash Provider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register `gemini:gemini-omni-1.1-flash` as a working video-gen model — params, image-role tags, cost, and an end-to-end generation — so the pipeline can produce Omni video with hand-written prompts.

**Architecture:** A new provider in the existing `VideoGenModelSpec` registry, calling the Gemini Interactions REST API directly with `fetch` (the SDK does not type the video path). Two pure, unit-tested builders carry all the logic that can be wrong silently: `planOmniInput` fixes image upload order and generates the two-index-base declaration header, and `composeOmniPrompt` folds the three prompt-text "params" into the prompt. The provider itself is thin I/O around them.

**Tech Stack:** TypeScript, Next.js App Router, Vitest, `fetch` (no new dependencies).

This is **Plan 1 of 4** for the design spec. It is shippable and useful on its own. Later plans cover the script cast, two-way parsing with the shot planner, and the three preview UI surfaces.

- Spec: `docs/superpowers/specs/2026-08-28-gemini-omni-multishot-design.md` §2–§6
- Decisions: D184, D185, D186, D187 in §7 of `2026-05-30-creativeos-staging-roadmap.md`

---

## Global Constraints

- **Model id is `gemini:gemini-omni-1.1-flash`** (registry key) → API model `gemini-omni-1.1-flash`. Never the preview `gemini-omni-flash-preview` (D184).
- **API key is `GOOGLE_GENAI_API_KEY`** — the same one Veo already uses. Do not add a new env var.
- **Endpoint:** `POST https://generativelanguage.googleapis.com/v1beta/interactions`, header `x-goog-api-key`.
- **Duration 3–10s, default 8.** Always send it explicitly; omitting it yields 8 and a truncated ending.
- **Resolutions:** `360p`, `720p` (default), `1080p`, `4k`. **Aspect ratios: `16:9` and `9:16` only** — no `1:1`.
- **`<IMAGE_REF_N>` is 0-based over references only. `@ImageN` is 1-based over the whole upload array.** These two bases appear in the same generated line. Never hand-write either.
- **`<LAST_FRAME>` requires `<FIRST_FRAME>`.**
- **No negative-prompt field, no audio switch, no shot-count field.** These are prompt sentences (D187).
- **`continuous_take` defaults to `false`** — the *opposite* of Kling's `multi_shot`, because Omni cuts by default.
- Every param is in the `primary` group. An `advanced` param renders nowhere — the Advanced accordion was deleted in `7e1c643`.
- Follow existing file conventions: `import "server-only"` at the top of every server-only module; colocated `__tests__/` directories; comments explain *why*, not *what*.
- Run tests per-directory (`npx vitest run src/lib/video-gen`), never a full `vitest run` — the full suite has ~11 unrelated timeout flakes in API-route tests.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/lib/video-gen/providers/fetch-as-base64.ts` | Fetch an HTTPS image URL → `{ imageBytes, mimeType }`. Extracted from `veo.ts`; two consumers. |
| `src/lib/video-gen/providers/avoid-clause.ts` | Turn a negative-prompt string into `Avoid: ….` or `""`. Extracted from `composeVeoPrompt`; two consumers. |
| `src/lib/video-gen/plan-omni-input.ts` | **Pure.** Assigned roles → ordered upload list + declaration header + guidance + `task`. Sole owner of both index bases. |
| `src/lib/video-gen/compose-omni-prompt.ts` | **Pure.** Prompt + params + input plan → the final text part. |
| `src/lib/video-gen/params/gemini-omni.ts` | The six `ParamSpec`s and `GEMINI_OMNI_NEGATIVE_DEFAULT`. |
| `src/lib/video-gen/providers/gemini-omni.ts` | REST call, task polling, Files-API polling, the `VideoGenModelSpec`. |
| `src/lib/video-gen/__tests__/plan-omni-input.test.ts` | Index bases, ordering, task selection. |
| `src/lib/video-gen/__tests__/compose-omni-prompt.test.ts` | Prompt assembly, all three prompt-text params. |
| `src/lib/video-gen/__tests__/gemini-omni-cost.test.ts` | All four resolutions + the unpriced case. |

**Modify**

| File | Change |
|---|---|
| `src/lib/video-gen/providers/veo.ts` | Import the two extracted helpers instead of declaring them. |
| `src/lib/video-gen/types.ts:78` | `provider` union `+= "gemini"`. |
| `src/lib/video-gen/cost.ts:25` | Rename `VEO_RESOLUTION_PRICING` → `RESOLUTION_ONLY_PRICING`; add the Omni row. |
| `src/lib/video-gen/registry.ts` | Register `geminiOmni`. |
| `src/lib/video-gen/client-models.ts` | Client mirror: image inputs, rules, spec entry. |
| `src/lib/generations/complete.ts:21-32` | `buildVideoDownloadHeaders` gains a `gemini:` branch. |

---

## Task 0: Verify the `duration` wire shape

The docs disagree between integer `8` and string `"8s"`. This is the one field certain to 400 on a first call, and **every later task's default depends on the answer**. This task is a spike, not TDD — it produces a recorded finding, not committed source.

**Files:**
- Create (scratch, not committed): `<scratchpad>/omni-duration-probe.mjs`
- Modify: `docs/superpowers/specs/2026-08-28-gemini-omni-multishot-design.md` (§12 risk 1 → recorded finding)

**Interfaces:**
- Consumes: nothing.
- Produces: a confirmed literal for `video_config.duration` — either the number `8` or the string `"8s"` — used verbatim by Task 6's `buildOmniVideoConfig`.

- [ ] **Step 1: Write the probe script**

Write to your scratchpad directory as `omni-duration-probe.mjs`:

```js
const KEY = process.env.GOOGLE_GENAI_API_KEY;
if (!KEY) throw new Error("Missing GOOGLE_GENAI_API_KEY");

const URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const PROMPT = "A single continuous shot of steam rising from a cup on a wooden table.";

async function probe(label, duration) {
  const body = {
    model: "gemini-omni-1.1-flash",
    input: PROMPT,
    generation_config: { video_config: { task: "text_to_video", resolution: "360p", duration } },
    response_format: { type: "video", aspect_ratio: "16:9", delivery: "uri" },
    store: false, background: false, stream: false,
  };
  const res = await fetch(URL, {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`\n=== ${label} (duration: ${JSON.stringify(duration)}) ===`);
  console.log("HTTP", res.status);
  console.log(text.slice(0, 900));
}

await probe("integer", 8);
await probe("string", "8s");
```

`360p` keeps each probe at $0.24.

- [ ] **Step 2: Run both probes**

```bash
node --env-file=.env <scratchpad>/omni-duration-probe.mjs
```

If `--env-file` is unsupported on your Node version, export the key first:
`GOOGLE_GENAI_API_KEY=$(grep GOOGLE_GENAI_API_KEY .env | cut -d= -f2) node <scratchpad>/omni-duration-probe.mjs`

Expected: exactly one of the two returns HTTP 200 with `"status": "completed"` and a `steps` array; the other returns HTTP 400.

- [ ] **Step 3: Record the finding in the spec**

In `2026-08-28-gemini-omni-multishot-design.md` §12, replace risk 1 with the verified result. Example if the integer form won:

```markdown
1. **`duration` wire shape — RESOLVED 2026-08-28.** Verified by live call: `video_config.duration`
   takes an **integer** (`8`). The string form `"8s"` returns HTTP 400. Task 6 sends `Number(...)`.
```

Also confirm and note two things the same response settles:
- Whether the 200 response body carries `output_video` (SDK convenience) or only `steps[]`.
- Whether `delivery: "uri"` returned a `uri` or fell back to inline `data`.

- [ ] **Step 4: Commit the finding**

```bash
git add docs/superpowers/specs/2026-08-28-gemini-omni-multishot-design.md
git commit -m "docs(video-gen): verify Omni duration wire shape against a live generation"
```

**If both probes 400:** stop and report. The likeliest causes are that the paid tier is not enabled for Omni on this key, or that `input` must be an array rather than a bare string. Try `input: [{ type: "text", text: PROMPT }]` before concluding the key lacks access.

---

## Task 1: Extract the two shared helpers

Pure refactor. Veo keeps working identically; Omni gets two functions it would otherwise duplicate. Per AGENTS.md: two call sites = extract.

**Files:**
- Create: `src/lib/video-gen/providers/fetch-as-base64.ts`
- Create: `src/lib/video-gen/providers/avoid-clause.ts`
- Create: `src/lib/video-gen/__tests__/avoid-clause.test.ts`
- Modify: `src/lib/video-gen/providers/veo.ts:22-32` (delete `fetchAsBase64`), `:58-62` (rewrite `composeVeoPrompt`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `fetchAsBase64(url: string): Promise<{ imageBytes: string; mimeType: string }>`
  - `avoidClause(negativePrompt: string): string` — returns `"Avoid: a, b."` or `""`.

- [ ] **Step 1: Write the failing test for `avoidClause`**

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

  // The caller adds the period; a list already ending in one must not produce "..".
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
 * (D187), so both state their negatives in the prompt text. Returns "" when there is nothing to
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
 * Both Veo's SDK Image_2 (gcsUri or imageBytes only) and Gemini Omni's REST image content part
 * reject a plain HTTPS URL, but every image in this pipeline is a Supabase Storage URL — so both
 * providers have to fetch first. Content-type is split on ";" to drop any charset parameter.
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

Delete the local `fetchAsBase64` function (currently `veo.ts:22-32`) and add to the import block at the top of the file:

```ts
import { fetchAsBase64 } from "./fetch-as-base64";
import { avoidClause } from "./avoid-clause";
```

Then replace the body of `composeVeoPrompt` (`veo.ts:58-62`) — keep its existing doc comment above it:

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

Expected: PASS, including every pre-existing `composeVeoPrompt` test. If a Veo test now fails, the refactor changed behaviour — `avoidClause` must produce byte-identical output to the old inline version.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video-gen/providers/fetch-as-base64.ts src/lib/video-gen/providers/avoid-clause.ts src/lib/video-gen/__tests__/avoid-clause.test.ts src/lib/video-gen/providers/veo.ts
git commit -m "refactor(video-gen): extract fetchAsBase64 and avoidClause for a second consumer"
```

---

## Task 2: `planOmniInput` — upload order and the two index bases

The single most failure-prone thing in this plan, and the reason it is pure and tested first. Getting an index wrong does not error — it silently points a mention at the wrong image, which surfaces only as a bad generation someone already paid for.

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
    const plan = planOmniInput({
      startFrameUrl: START, endFrameUrl: END, referenceUrls: [R1, R2],
    });
    expect(plan.uploads).toEqual([
      { url: START, role: "first_frame" },
      { url: END, role: "last_frame" },
      { url: R1, role: "reference" },
      { url: R2, role: "reference" },
    ]);
  });

  // The whole point of this module. @ImageN counts the entire upload array from 1;
  // <IMAGE_REF_N> counts ONLY the references, from 0. Both appear in this one line.
  it("emits @ImageN 1-based over all uploads and <IMAGE_REF_N> 0-based over references", () => {
    const plan = planOmniInput({
      startFrameUrl: START, endFrameUrl: END, referenceUrls: [R1, R2],
    });
    expect(plan.header).toBe(
      "[# Sources <FIRST_FRAME>@Image1 <LAST_FRAME>@Image2] " +
      "[# References <IMAGE_REF_0>@Image3 <IMAGE_REF_1>@Image4]",
    );
  });

  // With no frames, the first reference is @Image1 but still <IMAGE_REF_0>.
  it("keeps the bases independent when there are no frames", () => {
    const plan = planOmniInput({
      startFrameUrl: undefined, endFrameUrl: undefined, referenceUrls: [R1, R2],
    });
    expect(plan.header).toBe("[# References <IMAGE_REF_0>@Image1 <IMAGE_REF_1>@Image2]");
    expect(plan.task).toBe("reference_to_video");
  });

  it("omits the References segment entirely when there are no references", () => {
    const plan = planOmniInput({
      startFrameUrl: START, endFrameUrl: undefined, referenceUrls: [],
    });
    expect(plan.header).toBe("[# Sources <FIRST_FRAME>@Image1]");
    expect(plan.task).toBe("image_to_video");
  });

  it("returns empty header and guidance with no images at all", () => {
    const plan = planOmniInput({
      startFrameUrl: undefined, endFrameUrl: undefined, referenceUrls: [],
    });
    expect(plan).toEqual({ uploads: [], header: "", guidance: "", task: "text_to_video" });
  });

  it("names each frame by its upload number in the guidance", () => {
    const plan = planOmniInput({
      startFrameUrl: START, endFrameUrl: END, referenceUrls: [R1],
    });
    expect(plan.guidance).toBe(
      "Use Image1 as the starting frame. Use Image2 as the final frame. " +
      "Use the given images as references for video generation. " +
      "The images should not be used as literal initial frames.",
    );
  });

  // A first frame wins the task hint: the model is animating that frame, and the
  // references merely steer it.
  it("prefers image_to_video when a first frame and references are both present", () => {
    const plan = planOmniInput({
      startFrameUrl: START, endFrameUrl: undefined, referenceUrls: [R1],
    });
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
 * D186 — the sole owner of Omni's two index bases.
 *
 * Omni's declaration header carries two different, simultaneous numbering schemes:
 *   `@ImageN`         — 1-based, over the WHOLE upload array
 *   `<IMAGE_REF_N>`   — 0-based, over the REFERENCES SUB-ARRAY only
 * and Kling's `@image_1` next door is a third. Getting one wrong does not raise an error; it
 * silently binds a mention to the wrong asset, which is only visible in a generation already
 * paid for. So no prompt, and no LLM, ever writes this line — it is derived here from the
 * operator's role assignment, and it is unit-tested.
 *
 * The explicit declaration form is used ALWAYS, even when a single image makes the role obvious.
 * The simple inline form (`<FIRST_FRAME> a woman is walking`) would be a second code path whose
 * failure mode is equally silent, and "obvious" is a judgement this failure mode punishes.
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
git commit -m "feat(video-gen): planOmniInput owns Omni's two reference index bases (D186)"
```

---

## Task 3: `composeOmniPrompt` — the three params that are sentences

**Files:**
- Create: `src/lib/video-gen/compose-omni-prompt.ts`
- Create: `src/lib/video-gen/__tests__/compose-omni-prompt.test.ts`

**Interfaces:**
- Consumes: `OmniInputPlan` from Task 2; `avoidClause` from Task 1.
- Produces:
  ```ts
  const OMNI_AUDIO_CLAUSES: Record<string, string>;
  const CONTINUOUS_TAKE_LINE: string;
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

const EMPTY_PLAN = planOmniInput({
  startFrameUrl: undefined, endFrameUrl: undefined, referenceUrls: [],
});
const FRAME_PLAN = planOmniInput({
  startFrameUrl: "https://x/s.jpg", endFrameUrl: undefined, referenceUrls: [],
});

describe("composeOmniPrompt", () => {
  it("puts the header first and the guidance last", () => {
    const out = composeOmniPrompt({
      prompt: "A cup on a table.",
      params: { audio: "ambient", negative_prompt: "" },
      plan: FRAME_PLAN,
    });
    expect(out.startsWith("[# Sources <FIRST_FRAME>@Image1]")).toBe(true);
    expect(out.endsWith("Use Image1 as the starting frame.")).toBe(true);
  });

  // Omni multi-shots by DEFAULT. This line is the only way to suppress cuts, and it is
  // absent unless explicitly asked for — the inverse of Kling's multi_shot toggle (D187).
  it("appends the single-scene line only when continuous_take is on", () => {
    const on = composeOmniPrompt({
      prompt: "A cup.", params: { continuous_take: true, audio: "ambient" }, plan: EMPTY_PLAN,
    });
    expect(on).toContain("In a single unbroken scene. No scene cuts.");

    const off = composeOmniPrompt({
      prompt: "A cup.", params: { continuous_take: false, audio: "ambient" }, plan: EMPTY_PLAN,
    });
    expect(off).not.toContain("single unbroken scene");
  });

  it("defaults to the ambient audio clause when audio is absent", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY_PLAN });
    expect(out).toContain(
      "Sound design: ambience and foley only. No dialogue. No extra sound effects.",
    );
  });

  it("uses the dialogue clause and does not suppress dialogue", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { audio: "dialogue" }, plan: EMPTY_PLAN,
    });
    expect(out).toContain("Sound design: ambience, foley and natural dialogue.");
    expect(out).not.toContain("No dialogue.");
  });

  it("uses the music clause", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { audio: "music" }, plan: EMPTY_PLAN,
    });
    expect(out).toContain("Sound design: ambience and foley, with a music bed. No dialogue.");
  });

  // No negative-prompt field exists on this model, so the list is a sentence.
  it("renders the negative prompt as its own Avoid paragraph", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.",
      params: { audio: "ambient", negative_prompt: "blurry, warped label" },
      plan: EMPTY_PLAN,
    });
    expect(out).toContain("\n\nAvoid: blurry, warped label.");
  });

  it("leaves no dangling Avoid when the negative prompt is cleared", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { audio: "ambient", negative_prompt: "   " }, plan: EMPTY_PLAN,
    });
    expect(out).not.toContain("Avoid:");
  });

  it("emits nothing but the prompt and audio clause with no images and no extras", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY_PLAN });
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
 * D187 — Omni generates an audio track ALWAYS. There is no off switch anywhere in the API, so
 * this steers the track rather than enabling it. Each value is a documented clause shape.
 *
 * `ambient` is the default because Omni has no voice control of any kind — no reference upload,
 * no cloning, no fixing a voice in a later turn. A narrator therefore differs between
 * generations and cannot be corrected, so any deliverable spanning more than one generation
 * lays one continuous VO in the edit instead of asking for speech here.
 */
export const OMNI_AUDIO_CLAUSES: Record<string, string> = {
  ambient: "Sound design: ambience and foley only. No dialogue. No extra sound effects.",
  dialogue: "Sound design: ambience, foley and natural dialogue.",
  music: "Sound design: ambience and foley, with a music bed. No dialogue.",
};

/**
 * The inversion (D187). Omni "will try to create a video with a few different shots" by default,
 * so a single continuous take must be REQUESTED every time. Kling's multi_shot is the mirror
 * image: there you opt into cutting, here you opt out.
 */
export const CONTINUOUS_TAKE_LINE = "In a single unbroken scene. No scene cuts.";

/**
 * The complete text part of an Omni request.
 *
 * Order matters and follows the vendor's documented shape: declaration header, prompt body,
 * structural instruction, sound design, negatives, then the closing role guidance. Negatives sit
 * near the end as their own paragraph so a comma-separated defect list cannot read as a
 * continuation of the last shot sentence — the same reasoning as composeVeoPrompt (D183).
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
  if (params.continuous_take === true) blocks.push(CONTINUOUS_TAKE_LINE);

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

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/compose-omni-prompt.ts src/lib/video-gen/__tests__/compose-omni-prompt.test.ts
git commit -m "feat(video-gen): composeOmniPrompt folds Omni's three sentence-params into the prompt (D187)"
```

---

## Task 4: The param specs

**Files:**
- Create: `src/lib/video-gen/params/gemini-omni.ts`

**Interfaces:**
- Consumes: `ParamSpec` from `@/lib/image-gen/types`.
- Produces: `geminiOmniParams: ParamSpec[]`, `GEMINI_OMNI_NEGATIVE_DEFAULT: string`. Consumed by Task 6 (registry spec) and Task 7 (client mirror).

- [ ] **Step 1: Create the file**

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
      "720p is the only natively generated tier — 1080p and 4k are upscaled from it, at 1.5x and " +
      "3x the price. 360p costs a third of 720p and is the draft tier for iterating.",
  },
  {
    // ALWAYS sent. Omitting `duration` yields the API default of 8s, so a 10s timecode ladder
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
    // NOT an API field — composeOmniPrompt turns this into a prompt sentence (D187).
    //
    // The default is the INVERSE of Kling's multi_shot, and deliberately so. Kling defaults
    // multi_shot to false: you opt INTO cutting. Omni multi-shots by default, so this opts OUT
    // of that. Same intent, opposite switch — read them as the same toggle and you get the
    // reverse of what you asked for.
    name: "continuous_take",
    label: "Continuous take",
    component: "toggle",
    group: "primary",
    order: 3,
    visible: true,
    defaultValue: false,
    constraints: { type: "toggle" },
    description:
      "Off lets the model cut between shots, which is its default behaviour. On requests a " +
      "single unbroken scene — needed for a product hero or a single-gesture beat.",
  },
  {
    // NOT an API field. Omni always generates audio; this steers it (D187).
    name: "audio",
    label: "Audio",
    component: "select",
    group: "primary",
    order: 4,
    visible: true,
    defaultValue: "ambient",
    constraints: { type: "select", options: ["ambient", "dialogue", "music"] },
    description:
      "Audio is always generated and cannot be switched off. There is no voice control of any " +
      "kind, so a narrator differs between generations — lay one continuous VO in the edit.",
  },
  {
    // NOT an API field — Omni has no negative-prompt parameter at all. Folded into the prompt
    // as an `Avoid:` paragraph by composeOmniPrompt, the same shape composeVeoPrompt uses on
    // Veo Lite (D183).
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

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors from `params/gemini-omni.ts`. (Pre-existing errors elsewhere in the repo, if any, are not yours to fix.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/video-gen/params/gemini-omni.ts
git commit -m "feat(video-gen): Gemini Omni param specs, three of them prompt text (D187)"
```

---

## Task 5: Cost

**Files:**
- Modify: `src/lib/video-gen/cost.ts:25-29`
- Create: `src/lib/video-gen/__tests__/gemini-omni-cost.test.ts`

**Interfaces:**
- Consumes: `computeVideoCost(modelId, durationSeconds, audioEnabled, resolution?)` — existing, unchanged signature.
- Produces: pricing for `gemini:gemini-omni-1.1-flash`; `RESOLUTION_ONLY_PRICING` replaces the module-private `VEO_RESOLUTION_PRICING`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/video-gen/__tests__/gemini-omni-cost.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeVideoCost } from "../cost";

const OMNI = "gemini:gemini-omni-1.1-flash";

describe("computeVideoCost — Gemini Omni", () => {
  it("prices all four resolutions per second", () => {
    expect(computeVideoCost(OMNI, 1, true, "360p")?.usd).toBeCloseTo(0.03, 5);
    expect(computeVideoCost(OMNI, 1, true, "720p")?.usd).toBeCloseTo(0.10, 5);
    expect(computeVideoCost(OMNI, 1, true, "1080p")?.usd).toBeCloseTo(0.15, 5);
    expect(computeVideoCost(OMNI, 1, true, "4k")?.usd).toBeCloseTo(0.30, 5);
  });

  // Omni generates audio on every request and the rate already includes it, so unlike Kling
  // the audio flag must not move the price in either direction.
  it("charges the same whether audio is flagged on or off", () => {
    expect(computeVideoCost(OMNI, 8, true, "720p")?.usd)
      .toBe(computeVideoCost(OMNI, 8, false, "720p")?.usd);
  });

  it("defaults to the 720p rate when no resolution is given", () => {
    expect(computeVideoCost(OMNI, 8, true)?.usd).toBeCloseTo(0.80, 5);
  });

  // Strict lookup, no cross-key fallback — an unreachable resolution must not silently
  // bill at the 720p rate.
  it("returns null for a resolution this model does not offer", () => {
    expect(computeVideoCost(OMNI, 8, true, "8k")).toBeNull();
  });

  it("scales with duration", () => {
    expect(computeVideoCost(OMNI, 8, true, "360p")?.usd).toBeCloseTo(0.24, 5);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/lib/video-gen/__tests__/gemini-omni-cost.test.ts
```

Expected: FAIL — every case returns `null`, because no table has the key.

- [ ] **Step 3: Rename the table and add the row**

In `src/lib/video-gen/cost.ts`, rename the constant declared at line 25 and add the Omni entry. Replace the declaration line:

```ts
const VEO_RESOLUTION_PRICING: Record<string, Record<string, number>> = {
```

with:

```ts
// Renamed from VEO_RESOLUTION_PRICING: this is the shape for any model priced by resolution
// where audio does not move the price, which is now Veo AND Gemini Omni. Omni generates audio
// on every request and the published rate already includes it, so there is no audio dimension
// to key on — exactly the same as every Veo 3.1 row.
const RESOLUTION_ONLY_PRICING: Record<string, Record<string, number>> = {
```

Add this entry to the object, after the `"veo:veo-3.1"` line:

```ts
  // Source: ai.google.dev/gemini-api/docs/pricing + the Omni 1.1 launch post (verified
  // 2026-08-28). 1080p and 4k are UPSCALED from a 720p generation, not natively rendered —
  // the price rises 1.5x and 3x for resolution only, which is why 720p is the default and
  // 360p ($0.03/s, ~60% faster) is the draft tier.
  "gemini:gemini-omni-1.1-flash": {
    "360p": 0.03, "720p": 0.10, "1080p": 0.15, "4k": 0.30,
  },
```

Then update the two use sites further down in `computeVideoCost` — rename the local variable too, so it stops claiming to be Veo-specific:

```ts
  const resolutionOnlyPricing = RESOLUTION_ONLY_PRICING[modelId];
  if (resolutionOnlyPricing) {
    // Strict lookup, same as Kling above — an unreachable resolution (e.g. "4k", which the UI
    // never offers for Veo) returns null rather than silently substituting the 720p rate.
    const perSecond = resolutionOnlyPricing[resolution ?? "720p"];
    if (perSecond === undefined) return null;
    const usd = durationSeconds * perSecond;
    return { usd, inr: usd * USD_TO_INR };
  }
```

- [ ] **Step 4: Run the whole suite**

```bash
npx vitest run src/lib/video-gen
```

Expected: PASS — the new Omni tests and every existing Veo cost test. Then confirm no stale references remain:

```bash
grep -rn "VEO_RESOLUTION_PRICING" src/
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/cost.ts src/lib/video-gen/__tests__/gemini-omni-cost.test.ts
git commit -m "feat(video-gen): price Gemini Omni by resolution; rename the audio-agnostic table"
```

---

## Task 6: The provider

**Files:**
- Create: `src/lib/video-gen/providers/gemini-omni.ts`
- Modify: `src/lib/video-gen/types.ts:78`
- Modify: `src/lib/video-gen/registry.ts`

**Interfaces:**
- Consumes: `planOmniInput` (Task 2), `composeOmniPrompt` (Task 3), `geminiOmniParams` (Task 4), `fetchAsBase64` (Task 1), the verified `duration` literal (Task 0).
- Produces: `geminiOmni: VideoGenModelSpec`, `buildOmniVideoConfig(params)`, `GEMINI_OMNI_IMAGE_INPUTS`, `GEMINI_OMNI_RULES`. Task 7 imports the last two shapes into the client mirror.

- [ ] **Step 1: Widen the provider union**

In `src/lib/video-gen/types.ts:78`, change:

```ts
  provider: "veo" | "openai" | "kling";
```

to:

```ts
  provider: "veo" | "openai" | "kling" | "gemini";
```

- [ ] **Step 2: Write the provider**

Create `src/lib/video-gen/providers/gemini-omni.ts`. **In `buildOmniVideoConfig`, use the `duration` literal form Task 0 verified** — the code below sends a number; if Task 0 found the string form wins, change it to `` `${duration}s` `` and update the comment.

```ts
import "server-only";
import { logger } from "@trigger.dev/sdk/v3";
import type {
  VideoGenInput,
  VideoGenResult,
  VideoGenModelSpec,
  ConstraintRule,
} from "../types";
import { geminiOmniParams } from "../params/gemini-omni";
import { planOmniInput } from "../plan-omni-input";
import { composeOmniPrompt } from "../compose-omni-prompt";
import { fetchAsBase64 } from "./fetch-as-base64";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OMNI_MODEL = "gemini-omni-1.1-flash";
const FILE_POLL_INTERVAL_MS = 5_000;

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
 * Split out from buildOmniVideoConfig because it has two consumers that must never disagree:
 * the request body, and the `durationSeconds` reported back for costing. Reading the number
 * back off the built config would break the moment the wire format is a string ("8s"), turning
 * the billed duration into NaN — a zero-cost record for a video that was really generated.
 *
 * Clamped rather than trusted: params/gemini-omni.ts is a static spec, and a node saved before
 * a spec change still holds its old value with nothing re-validating it on load.
 */
export function omniDurationSeconds(params: Record<string, unknown>): number {
  const parsed = Number(params.duration);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(parsed)));
}

/**
 * Pure scalar config builder, mirroring buildVeoConfig / buildO1Settings.
 */
export function buildOmniVideoConfig(
  params: Record<string, unknown>,
  task: string,
): Record<string, unknown> {
  const resolution = String(params.resolution ?? "720p");
  return {
    task,
    resolution: VALID_RESOLUTIONS.includes(resolution) ? resolution : "720p",
    // Wire shape verified against a live generation — see spec §12 risk 1. If Task 0 found the
    // string form wins, this becomes `${omniDurationSeconds(params)}s` and nothing else changes.
    duration: omniDurationSeconds(params),
  };
}

export function buildOmniResponseFormat(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const ratio = String(params.aspect_ratio ?? "16:9");
  return {
    type: "video",
    aspect_ratio: VALID_ASPECT_RATIOS.includes(ratio) ? ratio : "16:9",
    // Always "uri", not just above 4MB. completeGeneration already downloads a provider URI
    // with x-goog-api-key and re-uploads to GCS, so the URI path needs no new machinery, while
    // inline base64 would carry a whole video through this process's memory for no gain.
    delivery: "uri",
  };
}

type OmniContent = { type: string; mime_type?: string; uri?: string; data?: string };
type OmniStep = { type: string; content?: OmniContent[] };
type OmniInteraction = {
  id: string;
  status: string;
  steps?: OmniStep[];
  output_video?: { uri?: string; data?: string };
  error?: { message?: string };
};

/**
 * The generated video's URI.
 *
 * `output_video` is an SDK-only convenience field; over REST the video lives in the
 * `model_output` step. Both are read, output_video first, so this keeps working if the REST
 * response ever gains the convenience field.
 */
export function extractOmniVideoUri(interaction: OmniInteraction): string | undefined {
  if (interaction.output_video?.uri) return interaction.output_video.uri;
  for (const step of interaction.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const content of step.content ?? []) {
      if (content.type === "video" && content.uri) return content.uri;
    }
  }
  return undefined;
}

/** `files/abc-123` from a download URI, for the Files API status poll. */
export function fileNameFromUri(uri: string): string | undefined {
  const match = uri.match(/files\/([a-zA-Z0-9_-]+)/);
  return match ? `files/${match[1]}` : undefined;
}

/**
 * Wait for a Files API object to reach ACTIVE.
 *
 * With delivery:"uri" the interaction returns a URI before the file is downloadable. Handing an
 * un-ACTIVE URI to completeGeneration would fail the download and refund a generation that
 * actually succeeded.
 */
async function waitForFileActive(fileName: string): Promise<void> {
  const apiKey = getApiKey();
  for (;;) {
    const res = await fetch(`${API_BASE}/${fileName}`, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!res.ok) throw new Error(`Omni file poll failed (${res.status})`);
    const file = (await res.json()) as { state?: string };
    logger.info("Omni file state", { fileName, state: file.state });
    if (file.state === "ACTIVE") return;
    if (file.state === "FAILED") throw new Error("Omni file processing failed");
    await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS));
  }
}

async function generateWithOmni(input: VideoGenInput): Promise<VideoGenResult> {
  const plan = planOmniInput({
    startFrameUrl: input.startFrameUrl,
    endFrameUrl: input.endFrameUrl,
    referenceUrls: input.referenceUrls ?? [],
  });

  // D186 mirrored server-side. The client evaluates the same rule, so this is the backstop for
  // a caller that bypasses the UI — a named error now, rather than a 400 minutes later.
  if (input.endFrameUrl && !input.startFrameUrl) {
    throw new Error("<LAST_FRAME> requires <FIRST_FRAME> — Omni cannot use an end frame alone");
  }

  // Images first, in planOmniInput's order, then the text part last. The order IS the contract:
  // @ImageN in the header counts this array from 1.
  const imageParts = await Promise.all(
    plan.uploads.map(async (upload) => {
      const { imageBytes, mimeType } = await fetchAsBase64(upload.url);
      return { type: "image", data: imageBytes, mime_type: mimeType };
    }),
  );

  const text = composeOmniPrompt({ prompt: input.prompt, params: input.params, plan });
  const videoConfig = buildOmniVideoConfig(input.params, plan.task);

  const res = await fetch(`${API_BASE}/interactions`, {
    method: "POST",
    headers: { "x-goog-api-key": getApiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OMNI_MODEL,
      input: [...imageParts, { type: "text", text }],
      generation_config: { video_config: videoConfig },
      response_format: buildOmniResponseFormat(input.params),
      // store:false forfeits previous_interaction_id editability. Correct ONLY while the edit
      // chain is out of scope — flip to true when that lands (spec §3b).
      store: false,
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
  if (fileName) await waitForFileActive(fileName);

  // The requested duration, not a measured one — Omni returns no duration in its response.
  // Read from the same helper the request used, never parsed back off the built config.
  return { videoUrl, durationSeconds: omniDurationSeconds(input.params) };
}

// Unlike Veo, frames and references are NOT mutually exclusive on Omni — no rule pins duration
// or shuts a slot off when the other is used. 6 is the highest reference count Google's own
// documented example demonstrates; it is NOT a stated cap, and must match client-models.ts,
// since the API route caps referenceUrls against that copy.
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
    reason: "End frame needs a start frame — <LAST_FRAME> requires <FIRST_FRAME>",
  },
];

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

- [ ] **Step 3: Test the pure builders**

Create `src/lib/video-gen/__tests__/gemini-omni-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  omniDurationSeconds,
  buildOmniVideoConfig,
  buildOmniResponseFormat,
  extractOmniVideoUri,
  fileNameFromUri,
} from "../providers/gemini-omni";

describe("omniDurationSeconds", () => {
  it("passes a valid duration through", () => {
    expect(omniDurationSeconds({ duration: 6 })).toBe(6);
  });

  // A node saved before a spec change still holds its old value, and nothing re-validates
  // params on load — so an out-of-range duration must be clamped, not sent.
  it("clamps to the 3-10 range", () => {
    expect(omniDurationSeconds({ duration: 15 })).toBe(10);
    expect(omniDurationSeconds({ duration: 1 })).toBe(3);
  });

  // Kling stores duration as a string, Veo as a number. A node migrated between models can
  // arrive with either, so both must resolve to the same number.
  it("coerces a string duration", () => {
    expect(omniDurationSeconds({ duration: "8" })).toBe(8);
  });

  it("falls back to 8 for a missing or unparseable value", () => {
    expect(omniDurationSeconds({})).toBe(8);
    expect(omniDurationSeconds({ duration: "abc" })).toBe(8);
  });
});

describe("buildOmniVideoConfig", () => {
  it("carries the task through and defaults resolution to 720p", () => {
    expect(buildOmniVideoConfig({}, "text_to_video")).toEqual({
      task: "text_to_video", resolution: "720p", duration: 8,
    });
  });

  it("rejects a resolution this model does not offer", () => {
    expect(buildOmniVideoConfig({ resolution: "8k" }, "edit").resolution).toBe("720p");
  });
});

describe("buildOmniResponseFormat", () => {
  it("always requests uri delivery", () => {
    expect(buildOmniResponseFormat({}).delivery).toBe("uri");
  });

  // Omni has no 1:1, unlike Kling O1 — a node migrated from O1 can carry one.
  it("falls back to 16:9 for an unsupported ratio", () => {
    expect(buildOmniResponseFormat({ aspect_ratio: "1:1" }).aspect_ratio).toBe("16:9");
  });

  it("keeps a supported ratio", () => {
    expect(buildOmniResponseFormat({ aspect_ratio: "9:16" }).aspect_ratio).toBe("9:16");
  });
});

describe("extractOmniVideoUri", () => {
  it("reads the video out of the model_output step", () => {
    const uri = extractOmniVideoUri({
      id: "v1_x", status: "completed",
      steps: [
        { type: "user_input", content: [{ type: "text" }] },
        { type: "thought", content: [{ type: "thought" }] },
        { type: "model_output", content: [{ type: "video", mime_type: "video/mp4", uri: "https://g/files/abc:download?alt=media" }] },
      ],
    });
    expect(uri).toBe("https://g/files/abc:download?alt=media");
  });

  it("prefers the output_video convenience field when present", () => {
    const uri = extractOmniVideoUri({
      id: "v1_x", status: "completed",
      output_video: { uri: "https://g/files/short" },
      steps: [{ type: "model_output", content: [{ type: "video", uri: "https://g/files/long" }] }],
    });
    expect(uri).toBe("https://g/files/short");
  });

  it("returns undefined when no video came back", () => {
    expect(extractOmniVideoUri({ id: "v1_x", status: "completed", steps: [] })).toBeUndefined();
  });
});

describe("fileNameFromUri", () => {
  it("extracts the Files API resource name", () => {
    expect(fileNameFromUri("https://g/v1beta/files/abc-123:download?alt=media"))
      .toBe("files/abc-123");
  });

  it("returns undefined for a URI with no file segment", () => {
    expect(fileNameFromUri("https://example.com/video.mp4")).toBeUndefined();
  });
});
```

Run it:

```bash
npx vitest run src/lib/video-gen/__tests__/gemini-omni-config.test.ts
```

Expected: PASS, 14 tests. If `omniDurationSeconds` is missing, you skipped its extraction in Step 2 — go back; reading the duration back off the built config is exactly the bug this test exists to prevent.

- [ ] **Step 4: Register it**

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

- [ ] **Step 5: Typecheck and run the suite**

```bash
npx tsc --noEmit && npx vitest run src/lib/video-gen
```

Expected: no new type errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video-gen/providers/gemini-omni.ts src/lib/video-gen/registry.ts src/lib/video-gen/types.ts src/lib/video-gen/__tests__/gemini-omni-config.test.ts
git commit -m "feat(video-gen): Gemini Omni 1.1 Flash provider over the Interactions REST API (D184, D185)"
```

---

## Task 7: Client mirror, download headers, and parity

The registry and the client model map are two hand-maintained copies of the same facts. `assign-image-roles.test.ts` already asserts parity between them; this task extends that guard to the new model and closes the last edit outside the video-gen module.

**Files:**
- Modify: `src/lib/video-gen/client-models.ts`
- Modify: `src/lib/generations/complete.ts:21-32`
- Create: `src/lib/video-gen/__tests__/gemini-omni-registry.test.ts`

**Interfaces:**
- Consumes: `GEMINI_OMNI_IMAGE_INPUTS`, `GEMINI_OMNI_RULES` (Task 6), `geminiOmniParams` (Task 4).
- Produces: `videoGenClientModelMap["gemini:gemini-omni-1.1-flash"]` — read by the focus view, the model picker, and the API route's reference cap.

- [ ] **Step 1: Write the failing parity test**

Create `src/lib/video-gen/__tests__/gemini-omni-registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { videoGenRegistry } from "../registry";
import { videoGenClientModelMap } from "../client-models";
import { validateAgainstRules } from "../constraints";

const OMNI = "gemini:gemini-omni-1.1-flash";

describe("Gemini Omni registration", () => {
  it("is present in both the server registry and the client map", () => {
    expect(videoGenRegistry[OMNI]).toBeDefined();
    expect(videoGenClientModelMap[OMNI]).toBeDefined();
  });

  // The API route caps referenceUrls against the CLIENT copy while the provider is built from
  // the server copy. A drift between them silently changes what gets sent.
  it("declares identical image inputs on both sides", () => {
    expect(videoGenClientModelMap[OMNI].imageInputs)
      .toEqual(videoGenRegistry[OMNI].imageInputs);
  });

  it("declares identical params and rules on both sides", () => {
    expect(videoGenClientModelMap[OMNI].params).toEqual(videoGenRegistry[OMNI].params);
    expect(videoGenClientModelMap[OMNI].rules).toEqual(videoGenRegistry[OMNI].rules);
  });

  it("blocks an end frame with no start frame", () => {
    const violation = validateAgainstRules(videoGenClientModelMap[OMNI].rules, {
      params: {}, hasStartFrame: false, hasEndFrame: true, referenceCount: 0,
    });
    expect(violation).toBe("End frame needs a start frame — <LAST_FRAME> requires <FIRST_FRAME>");
  });

  // Unlike Veo, references and frames coexist on this model — no rule may fire here.
  it("allows a start frame and references together", () => {
    const violation = validateAgainstRules(videoGenClientModelMap[OMNI].rules, {
      params: {}, hasStartFrame: true, hasEndFrame: true, referenceCount: 3,
    });
    expect(violation).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/lib/video-gen/__tests__/gemini-omni-registry.test.ts
```

Expected: FAIL — `videoGenClientModelMap[OMNI]` is undefined.

- [ ] **Step 3: Add the client mirror**

In `src/lib/video-gen/client-models.ts`, add to the import block at the top:

```ts
import { geminiOmniParams } from "./params/gemini-omni";
import {
  GEMINI_OMNI_IMAGE_INPUTS,
  GEMINI_OMNI_RULES,
} from "./providers/gemini-omni";
```

> **If that import pulls `server-only` into the client bundle** (`gemini-omni.ts` starts with `import "server-only"`), do not weaken the provider. Instead move `GEMINI_OMNI_IMAGE_INPUTS` and `GEMINI_OMNI_RULES` into a new `src/lib/video-gen/gemini-omni-shape.ts` with no `server-only` import, and have **both** `providers/gemini-omni.ts` and `client-models.ts` import from there. The parity test in Step 1 then passes by construction rather than by hand-copying — which is strictly better than the Veo/Kling pattern it replaces.

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

Note the `providerLabel` is `"Google"`, which creates a new picker group. Veo's entries in this map use `providerLabel: "Veo"`, so Omni will not be grouped with them — that is intended, since Omni is a different model family with different rules.

- [ ] **Step 4: Teach `completeGeneration` to download an Omni video**

In `src/lib/generations/complete.ts`, change `buildVideoDownloadHeaders` (lines 21-32) so the Gemini branch is covered:

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

- [ ] **Step 5: Run and watch it pass**

```bash
npx tsc --noEmit && npx vitest run src/lib/video-gen src/lib/generations
```

Expected: PASS across both directories.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video-gen/client-models.ts src/lib/generations/complete.ts src/lib/video-gen/__tests__/gemini-omni-registry.test.ts
git commit -m "feat(video-gen): register Gemini Omni client-side and download its output (D184)"
```

---

## Task 8: End-to-end verification

Not TDD — this is the acceptance gate. Nothing above proves a real video comes back.

**Files:** none created or modified unless a defect is found.

- [ ] **Step 1: Start the app**

```bash
npm run dev
```

- [ ] **Step 2: Generate with no images**

On a canvas, connect a video-prompt node with output to a video-gen node. Pick **Gemini Omni 1.1 Flash**. Set resolution `360p` (a $0.24 test), duration `8`, `continuous_take` **on**.

Expected: generation completes; a video plays in the node; the credits footer matches $0.24 at the current USD→INR rate.

- [ ] **Step 3: Generate with a start frame and two references**

Connect three image nodes. Assign one **Start**, two **Ref**. Keep `360p`.

Expected: completes. Confirm in the Trigger.dev logs that the request carried `task: "image_to_video"` and that the composed prompt began with
`[# Sources <FIRST_FRAME>@Image1] [# References <IMAGE_REF_0>@Image2 <IMAGE_REF_1>@Image3]`.

- [ ] **Step 4: Confirm the end-frame rule blocks**

Assign one image **End** and none as **Start**.

Expected: Generate is disabled, with the reason "End frame needs a start frame — `<LAST_FRAME>` requires `<FIRST_FRAME>`". No credits are reserved.

- [ ] **Step 5: Confirm the multi-shot default**

Generate twice at `360p` with the same prompt: once with `continuous_take` **off**, once **on**.

Expected: the "off" clip cuts between shots; the "on" clip is one continuous take. **This is the observation that proves D187's inverted default is right** — if "off" does not cut, the model's default behaviour has changed and the param's semantics need revisiting.

- [ ] **Step 6: Record the outcome**

Append a short "Verified" note to spec §12 stating what was generated, at what settings, and what the observed multi-shot behaviour was. Commit:

```bash
git add docs/superpowers/specs/2026-08-28-gemini-omni-multishot-design.md
git commit -m "docs(video-gen): record end-to-end Omni verification"
```

---

## Done when

- `gemini:gemini-omni-1.1-flash` appears in the model picker under a **Google** group.
- A generation completes end to end and the video plays in the node.
- The end-frame-without-start-frame rule blocks Generate before credits are reserved.
- `npx vitest run src/lib/video-gen src/lib/generations` passes.
- `grep -rn "VEO_RESOLUTION_PRICING" src/` returns nothing.
- Spec §12 risk 1 records the verified `duration` wire shape.

## Not in this plan

The script cast (D190), two-way parsing and the shot planner (D188, D189), the reference merge order and frame semantics (D192), and the three preview UI surfaces. Each is its own plan, and each builds on this one. Until they land, Omni is driven by hand-written prompts and directly-connected image nodes — which works, and is worth shipping.
