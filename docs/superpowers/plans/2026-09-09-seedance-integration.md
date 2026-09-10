# Seedance 2.5 Integration — Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Seedance 2.5 as a video model in both lanes — single-shot and multishot — built per-model from its first commit, with its own two prompt guides written from the BytePlus docs.

**Architecture:** Seedance is a fourth provider with a fourth transport shape (async create-then-poll). In the multishot lane it becomes a third capability-table entry at 4–30s, bringing a third wire format (bare `0-2s:` timecodes) and a third reference dialect (`@Image 1`). In the single-shot lane the prompt records split one-per-model, which also fixes Gemini Omni silently receiving Veo's prompt.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Zustand, shadcn/Base UI.

**Spec:** [docs/superpowers/specs/2026-09-09-seedance-and-per-model-prompt-guides-design.md](../specs/2026-09-09-seedance-and-per-model-prompt-guides-design.md). ADRs **D243–D246**.

**Explicitly NOT in this plan:** rewriting Veo's, Kling's or Gemini Omni's prompt *content* from their vendor guides. That is Plan 2. This plan gives each its own file with its **current text preserved byte-for-byte**; only Seedance's two guides are written fresh.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Never run bare `npx vitest run`** — this repo has ~11 pre-existing timeout flakes in API-route tests that pass in isolation. Always scope to a directory or file.
- **No destructive git commands, ever, on any path** — no `git checkout`, `git restore`, `git stash`, `git reset`, `git clean`, `git rm`. To undo an edit, edit it back by hand.
- **Never `git add -A` or `git add .`** — stage only the files the task names, by explicit path. **Never stage `package.json` or `package-lock.json`.**
- **`npx tsc --noEmit` is currently completely clean and must stay that way.** Any error you leave is one you introduced.
- **Controls are shadcn primitives** from `src/components/ui/*`. Base UI composes via the **`render` prop, never `asChild`**. Never a raw `<button>`/`<input>`/`<select>`/`<textarea>`.
- **Colours come from the shadcn CSS variables** in `src/app/globals.css` — never a hardcoded hex. Icons are Lucide, stroke 1.5, no fills.
- **Import, don't redefine** (AGENTS.md). Two call sites = extract; one = leave inline. A deliberately narrower set is not a duplicate.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **The shell is PowerShell.** `&&` and `||` are parser errors — use `A; if ($?) { B }`. A here-string's closing `'@` must sit at column 0 with nothing after it. For multi-paragraph commit messages, write the message to a file under the scratchpad and use `git commit -F <file>`. A Bash tool running Git Bash is also available.
- Comments explain *why* and cite decision ids (`D77`, `D216`, `D235`, `D238`, `D243`–`D246`).

### Exact values (copy verbatim — do not re-derive)

| | Value |
|---|---|
| Our model id | `seedance:seedance-2-5` |
| Vendor model string | `dreamina-seedance-2-5-260628` |
| Endpoint | `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks` |
| Duration | integer **4–30**, or `-1`. Default `-1` |
| Resolution | `480p` \| `720p` \| `1080p`. Default `720p` |
| Ratio | default `adaptive` |
| Reference images | **1–30**, `role: "reference_image"` |
| Prompt asset handles | `@Image 1` — 1-based, space, capitalised |
| Shot timestamps | bare `0-3s`, no brackets |
| Sound characters | `()` music, `<>` SFX, `{}` dialogue, `【】` subtitles |
| Cost USD/s | 480p `0.103`, 720p `0.231`, 1080p `0.569` |

**Frames and references are mutually exclusive** — `first_frame`/`last_frame` cannot be mixed with `reference_image`. Same rule Veo 3.1 and Kling 3.0 already carry.

---

## A deviation from the spec's wording, decided here

Spec §3 says the single-shot lane "becomes `videoPromptFor(modelId)`". Taken literally that is wrong for this codebase, and the plan does something slightly different:

`VideoProvider` is **already** a mix — `"veo" | "kling" | "gemini-omni"`, where two are providers and one is a model. It is not a provider key; it is a **prompt-variant key**, and it is persisted on `VideoPromptNodeData.targetProvider`.

Routing on a raw model id would mean three identical entries for `veo:veo-3.1-lite` / `-fast` / `-3.1`, which genuinely share one guide, **and** a data migration of every saved Video Prompt node.

So: the union is renamed to `VideoPromptTarget`, gains `"seedance"`, and every member maps to its **own** record. `providerOf(modelId)` stays the model-id → variant mapping it already is. This satisfies the spec's actual goal — no model silently receives another's prompt — without a migration. `VideoProvider` is kept as a deprecated alias so the rename is not a breaking change across ~6 files in one commit.

---

## File Structure

**New:**

| File | Responsibility |
|---|---|
| `src/lib/video-gen/params/seedance.ts` | Seedance's `ParamSpec[]`. |
| `src/lib/video-gen/providers/seedance.ts` | Transport: create task, poll, map result. Owns the vendor model string. |
| `src/lib/video-gen/__tests__/seedance-registration.test.ts` | Registration, params, rules, cost. |
| `src/prompts/video-prompt-shared.ts` | The blocks both lanes share. Re-exported by the old module. |
| `src/prompts/video-prompt-veo.ts` | Veo's single-shot record (text unchanged). |
| `src/prompts/video-prompt-kling.ts` | Kling's (text unchanged). |
| `src/prompts/video-prompt-gemini-omni.ts` | Omni's — **its own record for the first time**. |
| `src/prompts/video-prompt-seedance.ts` | Seedance's, written fresh from BytePlus. |
| `src/prompts/video-prompt-for.ts` | `videoPromptFor(target)`. |
| `src/prompts/multishot-prompt-seedance.ts` | Seedance's multishot writer. |

**Modified:** `src/lib/video-gen/types.ts` (provider union), `client-models.ts`, `registry.ts`, `cost.ts`, `src/lib/nodes/multishot-models.ts`, `multishot-plan.ts`, `prompt-token-dialect.ts`, `src/prompts/multishot-prompt-for.ts`, `src/prompts/video-prompt-generate.ts` (becomes a re-export shim), `src/components/nodes/target-provider-select.tsx`, `video-prompt-focus-view.tsx`, and the two `videoPromptGeneratePromptFor` callers.

**Task order matters.** Tasks 1–2 are independent. Tasks 3–6 build the multishot side in dependency order. Task 7 wires the UI. Task 8 is live verification.

---

## Task 1: Register Seedance 2.5 as a video model

At the end of this task Seedance appears in the picker and generates an ordinary single-shot clip.

**Files:**
- Create: `src/lib/video-gen/params/seedance.ts`, `src/lib/video-gen/providers/seedance.ts`, `src/lib/video-gen/__tests__/seedance-registration.test.ts`
- Modify: `src/lib/video-gen/types.ts`, `src/lib/video-gen/client-models.ts`, `src/lib/video-gen/registry.ts`, `src/lib/video-gen/cost.ts`, `src/lib/video-gen/__tests__/roster.test.ts`

**Interfaces:**
- Produces: `SEEDANCE_MODEL_ID = "seedance:seedance-2-5"` from `client-models.ts`; `seedanceParams` from `params/seedance.ts`; `seedance25` (a `VideoGenModelSpec`) from `providers/seedance.ts`.

- [ ] **Step 1: Read the two files you are extending**

Read `src/lib/video-gen/providers/kling.ts` in full — it is the closest existing transport (create task → poll → map). Read `src/lib/video-gen/cost.ts`'s header, which states a hard rule about never inventing prices; your entry must follow the pattern it describes for an approximation.

Also read `ref/byteplus-docs/Retrieve a video generation task.md` for the poll response shape. Do not guess it.

- [ ] **Step 2: Add the provider to the union**

`src/lib/video-gen/types.ts` — `VideoGenModelSpec.provider` is `"veo" | "openai" | "kling" | "gemini"`. Add `"seedance"`:

```ts
  provider: "veo" | "openai" | "kling" | "gemini" | "seedance";
```

- [ ] **Step 3: Write the params**

Create `src/lib/video-gen/params/seedance.ts`:

```ts
import type { ParamSpec } from "@/lib/image-gen/types";

// Seedance 2.5 — /api/v3/contents/generations/tasks on BytePlus ModelArk.
//
// duration is a SLIDER over a continuous 4-30s range. 30s is triple Gemini Omni's ceiling and
// double Kling 3.0 Omni's, which is the reason this model is worth having in the multishot lane
// at all. The vendor's own default is -1 ("model picks"), but this app always sends an explicit
// duration — on the multishot lane it is the sum of the operator's cut ladder, and a model-chosen
// length would silently disagree with the shot timestamps in the prompt.
export const seedanceParams: ParamSpec[] = [
  {
    name: "resolution",
    label: "Resolution",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue: "720p",
    constraints: { type: "select", options: ["480p", "720p", "1080p"] },
  },
  {
    name: "duration",
    label: "Duration",
    component: "slider",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue: 5,
    constraints: { type: "slider", min: 4, max: 30, step: 1 },
  },
  {
    // The vendor default is `adaptive`, which derives the ratio from a first frame. On a
    // references-only or text-only request there is no frame to derive from, so an explicit
    // ratio is what makes a vertical reel come back vertical.
    name: "ratio",
    label: "Aspect Ratio",
    component: "select",
    group: "primary",
    order: 2,
    visible: true,
    defaultValue: "9:16",
    constraints: { type: "select", options: ["16:9", "9:16", "1:1", "adaptive"] },
  },
];
```

- [ ] **Step 4: Write the transport**

Create `src/lib/video-gen/providers/seedance.ts`. Model its structure on `providers/kling.ts` — same create/poll/map shape, different endpoint and body.

The two endpoints, from `ref/byteplus-docs/`:

```
POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks       → { id }
GET  https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/{id}  → { status, content: { video_url } }
```

`status` is one of `queued` | `running` | `succeeded` | `failed` | `cancelled`. Terminal states are `succeeded`, `failed` and `cancelled` — **`cancelled` must be terminal**, or the poll loop spins until timeout on a task someone stopped.

```ts
import "server-only";
import type { VideoGenInput, VideoGenResult, VideoGenModelSpec } from "../types";
import { seedanceParams } from "../params/seedance";

const ARK_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

// The vendor's model string lives HERE and nowhere else. Its dated suffix changes when BytePlus
// revises the model; our own id (`seedance:seedance-2-5`, client-models.ts) is what persists on
// nodes and version rows. Keeping them separate makes a vendor bump a one-line edit rather than a
// migration of every saved node.
const VENDOR_MODEL = "dreamina-seedance-2-5-260628";

function getApiKey(): string {
  const key = process.env.BYTEPLUS_API_KEY;
  // Named error, thrown up front. The alternative is a 401 surfacing from inside the Trigger task
  // minutes after the click, which is how a missing Kling key used to present.
  if (!key) throw new Error("BYTEPLUS_API_KEY is not set — Seedance cannot generate.");
  return key;
}

type SeedanceContent = Record<string, unknown>;

/**
 * Frames and references are MUTUALLY EXCLUSIVE on this endpoint, so this returns one or the
 * other and never both. The client rules (client-models.ts) disable the unavailable input, and
 * this is the backstop for a caller that bypassed them.
 */
function buildSeedanceContent(input: VideoGenInput, maxRefs: number): SeedanceContent[] {
  const content: SeedanceContent[] = [{ type: "text", text: input.prompt }];

  if (input.startFrameUrl) {
    content.push({ type: "image_url", image_url: { url: input.startFrameUrl }, role: "first_frame" });
    if (input.endFrameUrl) {
      content.push({ type: "image_url", image_url: { url: input.endFrameUrl }, role: "last_frame" });
    }
    return content;
  }

  for (const url of (input.referenceUrls ?? []).slice(0, maxRefs)) {
    content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
  }
  return content;
}

function buildSeedanceBody(input: VideoGenInput, maxRefs: number): Record<string, unknown> {
  const duration = Number(input.params.duration ?? 5);
  return {
    model: VENDOR_MODEL,
    content: buildSeedanceContent(input, maxRefs),
    resolution: String(input.params.resolution ?? "720p"),
    // `ratio` is omitted when a first frame is present: the vendor derives the ratio from that
    // image and rejects a conflicting value. Sent otherwise, because a references-only or
    // text-only request has no frame to derive from, and `adaptive` there is a coin toss on
    // whether a reel comes back vertical.
    ...(input.startFrameUrl ? {} : { ratio: String(input.params.ratio ?? "9:16") }),
    // Always explicit. The vendor default is -1 ("model picks"), which on the multishot lane
    // would silently disagree with the shot timestamps already written into the prompt.
    duration: Number.isFinite(duration) ? Math.min(30, Math.max(4, Math.round(duration))) : 5,
  };
}

async function createSeedanceTask(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${ARK_BASE}/contents/generations/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getApiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(`Seedance task creation failed: ${json.error?.message ?? res.statusText}`);
  }
  return json.id;
}
```

Then the poll loop and the spec. Read `pollKlingTask` in `providers/kling.ts` and match its interval, its timeout and its error shape rather than inventing new ones — an operator watching two providers should not meet two different timeout behaviours. Terminal handling:

```ts
type SeedanceTask = {
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  content?: { video_url?: string };
  error?: { message?: string };
};

// `cancelled` is terminal. Treating it as pending would spin the loop until timeout on a task
// that is never coming back.
async function pollSeedanceTask(taskId: string): Promise<VideoGenResult> { /* … */ }

export const seedance25: VideoGenModelSpec = {
  id: "seedance:seedance-2-5",
  provider: "seedance",
  label: "Seedance 2.5",
  providerLabel: "Seedance",
  maxDurationSeconds: 30,
  imageInputs: SEEDANCE_IMAGE_INPUTS_SERVER,   // same shape as the client copy; see Step 5
  params: seedanceParams,
  generate: (input) =>
    createSeedanceTask(buildSeedanceBody(input, SEEDANCE_IMAGE_INPUTS_SERVER.maxReferenceImages))
      .then(pollSeedanceTask),
};
```

**One thing the vendor doc warns about and the poll must handle:** for some Seedance 2.5 task types an error is returned only *after* the queued task is consumed. So a `failed` status can arrive long after creation with a message that is the real diagnosis — surface `error.message` verbatim rather than a generic "generation failed".

- [ ] **Step 5: Register client-side**

In `src/lib/video-gen/client-models.ts`, export the id and add the map entry:

```ts
/** BytePlus Seedance 2.5 — 30s in one pass, and the third natively multi-shot model (D243). */
export const SEEDANCE_MODEL_ID = "seedance:seedance-2-5";
```

The image-input shape and rules:

```ts
// 1-30 reference images per the vendor reference. Capped at 10 here, not 30: the operator
// attaches these by hand and the prompt must cite each one, so a limit the UI can actually
// present is more useful than the API's theoretical ceiling. Raise it when someone needs it.
const SEEDANCE_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 10,
} as const;

// Frames and references are mutually exclusive on this endpoint — the same shape Veo 3.1 and
// Kling 3.0 already declare, so it reuses their rule vocabulary rather than a special case.
const SEEDANCE_RULES: ConstraintRule[] = [
  {
    id: "seedance-refs-disable-frames",
    when: { field: "referenceCount", op: "gt", value: 0 },
    effect: { disableFrameInputs: true },
    reason: "Reference images selected → start/end frames unavailable on Seedance",
  },
  {
    id: "seedance-frames-disable-refs",
    when: {
      op: "or",
      conditions: [
        { field: "hasStartFrame", op: "eq", value: true },
        { field: "hasEndFrame", op: "eq", value: true },
      ],
    },
    effect: { disableRefs: true },
    reason: "Start/end frame selected → reference images unavailable on Seedance",
  },
  {
    id: "seedance-end-frame-requires-start-frame",
    when: {
      op: "and",
      conditions: [
        { field: "hasEndFrame", op: "eq", value: true },
        { field: "hasStartFrame", op: "eq", value: false },
      ],
    },
    effect: { disableGenerate: true },
    reason: "End frame needs a start frame before you can generate",
  },
];
```

Map entry, after the Kling block:

```ts
  [SEEDANCE_MODEL_ID]: {
    id: SEEDANCE_MODEL_ID,
    provider: "seedance",
    label: "Seedance 2.5",
    pickerLabel: "2.5",
    providerLabel: "Seedance",
    maxDurationSeconds: 30,
    imageInputs: SEEDANCE_IMAGE_INPUTS,
    params: seedanceParams,
    rules: SEEDANCE_RULES,
  },
```

- [ ] **Step 6: Register server-side and price it**

Add `seedance25` to `src/lib/video-gen/registry.ts` following the existing pattern.

In `src/lib/video-gen/cost.ts`, add to `RESOLUTION_ONLY_PRICING` (not the Kling audio-keyed table — audio does not split Seedance 2.5's price):

```ts
  // Source: ref/byteplus-docs/seedance_2.5_PRICING.md, the vendor's own worked examples
  // ("input without video", which is the only shape this app produces — we never send a
  // reference video).
  //
  // AN APPROXIMATION, STATED: Seedance's real billing is token-based with a per-resolution rate
  // and a minimum, and token count scales with pixel count — so these figures are exact only at
  // the 16:9 the examples use, and drift at other ratios. computeVideoCost is per-second and
  // cannot express the real formula. An absent row would make the model registered and unable to
  // generate at all (computeVideoCost returns null -> video-generate throws), so the
  // approximation is the lesser evil, flagged rather than silent.
  //
  // EXPENSIVE: 720p is 2.3x Gemini Omni and 2.75x Kling 3.0 Omni. A 30s clip is ~$6.93.
  "seedance:seedance-2-5": { "480p": 0.103, "720p": 0.231, "1080p": 0.569 },
```

- [ ] **Step 7: Write the tests**

Create `src/lib/video-gen/__tests__/seedance-registration.test.ts`. Follow `kling-3-0-omni-registration.test.ts` as the pattern — read it first. Cover:

```ts
import { describe, it, expect } from "vitest";
import { videoGenRegistry } from "../registry";
import { videoGenClientModelMap, videoGenClientModelGroups, SEEDANCE_MODEL_ID } from "../client-models";
import { validateAgainstRules } from "../constraints";
import { computeVideoCost } from "../cost";

const SD = SEEDANCE_MODEL_ID;

describe("Seedance 2.5 registration", () => {
  it("is present in both the server registry and the client map", () => {
    expect(videoGenRegistry[SD]).toBeDefined();
    expect(videoGenClientModelMap[SD]).toBeDefined();
  });

  it("allows 30s — triple Gemini Omni's ceiling", () => {
    expect(videoGenClientModelMap[SD].maxDurationSeconds).toBe(30);
    const duration = videoGenClientModelMap[SD].params.find((p) => p.name === "duration");
    expect(duration?.constraints).toMatchObject({ min: 4, max: 30 });
  });

  it("offers all three resolutions", () => {
    const res = videoGenClientModelMap[SD].params.find((p) => p.name === "resolution");
    expect(res?.constraints).toMatchObject({ options: ["480p", "720p", "1080p"] });
  });

  it("groups under Seedance in the picker", () => {
    const g = videoGenClientModelGroups.find((x) => x.label === "Seedance");
    expect(g?.models.map((m) => m.id)).toContain(SD);
  });

  // Frames and references are mutually exclusive on this endpoint.
  it("disables frames when references are attached, and vice versa", () => {
    const withRefs = validateAgainstRules(videoGenClientModelMap[SD].rules, {
      params: {}, hasStartFrame: false, hasEndFrame: false, referenceCount: 2,
    });
    expect(withRefs).toBeNull(); // legal — the rule disables inputs, it does not block generate
    const endOnly = validateAgainstRules(videoGenClientModelMap[SD].rules, {
      params: {}, hasStartFrame: false, hasEndFrame: true, referenceCount: 0,
    });
    expect(endOnly).toBe("End frame needs a start frame before you can generate");
  });

  // Pinned as VALUES, not "not null". A not-null assertion is exactly what let a wrong Kling
  // rate sit in this table overcharging (see the 2026-09-09 correction in cost.ts).
  it("prices every resolution exactly", () => {
    expect(computeVideoCost(SD, 1, false, "480p")?.usd).toBeCloseTo(0.103, 5);
    expect(computeVideoCost(SD, 1, false, "720p")?.usd).toBeCloseTo(0.231, 5);
    expect(computeVideoCost(SD, 1, false, "1080p")?.usd).toBeCloseTo(0.569, 5);
  });

  it("prices a 30s clip, the model's own ceiling", () => {
    expect(computeVideoCost(SD, 30, false, "720p")?.usd).toBeCloseTo(6.93, 2);
  });

  // The vendor's dated model string must not leak into our id — a BytePlus revision would
  // otherwise become a migration of every persisted node.
  it("does not use the vendor's dated model string as our id", () => {
    expect(SD).not.toContain("260628");
  });
});
```

`roster.test.ts` asserts the exact model roster — add `"seedance:seedance-2-5"` to that array with a dated comment. It is a deliberate lock-file test; update it, do not loosen it.

- [ ] **Step 8: Run and typecheck**

```
npx vitest run src/lib/video-gen/__tests__/
npx tsc --noEmit
```
Expected: all pass, typecheck clean. The reachability test added on 2026-09-09 asserts no visible param sits in an unrendered group — if it fails, a Seedance param has the wrong `group`.

- [ ] **Step 9: Commit**

```
git add src/lib/video-gen/params/seedance.ts src/lib/video-gen/providers/seedance.ts src/lib/video-gen/types.ts src/lib/video-gen/client-models.ts src/lib/video-gen/registry.ts src/lib/video-gen/cost.ts src/lib/video-gen/__tests__/seedance-registration.test.ts src/lib/video-gen/__tests__/roster.test.ts
git commit -F <scratchpad>/msg.txt
```

Message: `feat(video-gen): register Seedance 2.5` — body naming the async transport as a fourth shape, that the vendor's dated model string is confined to the provider, and that the cost row is a stated per-second approximation of token-based billing.

---

## Task 2: One single-shot prompt record per model

**Files:**
- Create: `src/prompts/video-prompt-shared.ts`, `video-prompt-veo.ts`, `video-prompt-kling.ts`, `video-prompt-gemini-omni.ts`, `video-prompt-seedance.ts`, `video-prompt-for.ts`
- Modify: `src/prompts/video-prompt-generate.ts` (becomes a re-export shim), `src/prompts/__tests__/video-prompt-generate.test.ts`

**Interfaces:**
- Produces: `type VideoPromptTarget = "veo" | "kling" | "gemini-omni" | "seedance"`; `videoPromptFor(target: VideoPromptTarget): VideoProviderPrompt`; `SUBJECT_SILENT_CAMERA`, `MOTION_AVOID_LIST`, `SINGLE_TAKE_LINE`, `MULTISHOT_AUTHORING_MODEL`, `SPINE` from `video-prompt-shared.ts`.

**The hard constraint:** Veo's and Kling's compiled `system` strings must come out **byte-identical**. Gemini Omni gets its own record whose text is, for now, **identical to Veo's** — that is the safe first step, and Plan 2 rewrites it. Only Seedance's is new prose.

- [ ] **Step 1: Capture the baseline hashes BEFORE editing**

Write a scratch vitest file (in the scratchpad, not the repo) that imports `videoPromptGeneratePrompt` and `videoPromptGenerateKlingPrompt` and writes each `.system` to a file, then hash both. Record the hashes in your report. **If they do not match at the end, stop and report BLOCKED** — you have changed a shipped prompt by accident.

- [ ] **Step 2: Move the shared blocks**

Create `src/prompts/video-prompt-shared.ts` and **move** (do not retype) from `video-prompt-generate.ts`: `SUBJECT_SILENT_CAMERA`, `SPINE`, `MOTION_AVOID_LIST`, `SINGLE_TAKE_LINE`, `MULTISHOT_AUTHORING_MODEL`, and the `VideoProviderPrompt` type. Keep every doc comment with its constant — several record real shipped bugs and are load-bearing.

Add the type and its alias:

```ts
/**
 * Which prompt variant a motion prompt is written for (D243).
 *
 * Renamed from `VideoProvider`, which it never was: two members are providers and one is a model.
 * It is a prompt-variant key, persisted on `VideoPromptNodeData.targetProvider`, and every member
 * now maps to its OWN record — Gemini Omni used to fall through to Veo's.
 */
export type VideoPromptTarget = "veo" | "kling" | "gemini-omni" | "seedance";

/** @deprecated Use VideoPromptTarget. Kept so the rename is not a breaking change everywhere. */
export type VideoProvider = VideoPromptTarget;
```

- [ ] **Step 3: Split the two existing records into their own files**

`video-prompt-veo.ts` and `video-prompt-kling.ts` each hold one record, importing `SPINE` and friends from the shared module. **Copy the record definitions exactly** — same `id`, same `version`, same `model`, same template literal.

`video-prompt-gemini-omni.ts` holds Omni's own record. Its `system` is the same composition Veo's uses. Give it a distinct `id` and its own version:

```ts
// D243 — Omni's OWN record. Until this file existed, `videoPromptGeneratePromptFor` returned Veo's
// record for Omni, so Gemini Omni has been generating from a prompt whose header says "for Veo
// 3.1". The text here is deliberately still Veo's composition: splitting the routing and rewriting
// the prose are two changes, and doing both at once would leave a behaviour change with no way to
// attribute it. Plan 2 rewrites this from ref/google-omni-flash-docs' six-dimension framework.
export const videoPromptGenerateGeminiOmniPrompt = {
  id: "video-prompt-generate-gemini-omni",
  version: 1,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Gemini Omni.
${SPINE}

WORDS TO AVOID
Do not use: ${MOTION_AVOID_LIST}`,
} as const;
```

Note the header line differs from Veo's ("for Gemini Omni" vs "for Veo 3.1") — that is intended and is the one byte-level difference. Veo's own string is unchanged.

- [ ] **Step 4: Write Seedance's single-shot guide**

Create `src/prompts/video-prompt-seedance.ts`. Build the prose from `ref/byteplus-docs/Dreamina Seedance 2.5 tutorial.md`'s "Prompt rules" section. It must carry:

- The vendor's formula, in the vendor's order: **subject + action/event + scene and environment + visual style + camera movement/shot cuts + sound**. Do not reorder it into `SPINE`'s camera-first shape.
- **Asset responsibility**: cite references as `@Image 1`, and say what each provides *and what it should not* — the guide is explicit that naming the responsibility matters, not just the handle.
- The sound characters: `()` music, `<>` SFX, `{}` dialogue, `【】` subtitles.
- `SUBJECT_SILENT_CAMERA` imported from shared — it describes how i2v models fail, not how Seedance parses.
- `MOTION_AVOID_LIST` imported from shared.

It must **not** carry timecodes or shot numbering: this is the single-shot record, and shot structure is the multishot writer's job (Task 6).

- [ ] **Step 5: Write the router**

Create `src/prompts/video-prompt-for.ts`:

```ts
import { videoPromptGeneratePrompt } from "./video-prompt-veo";
import { videoPromptGenerateKlingPrompt } from "./video-prompt-kling";
import { videoPromptGenerateGeminiOmniPrompt } from "./video-prompt-gemini-omni";
import { videoPromptGenerateSeedancePrompt } from "./video-prompt-seedance";
import type { VideoPromptTarget, VideoProviderPrompt } from "./video-prompt-shared";

/**
 * D243 — one record per model, exhaustively.
 *
 * A `switch` with no `default`, so adding a member to `VideoPromptTarget` is a COMPILE error here
 * rather than a silent fallthrough. The bug this replaces was exactly a silent fallthrough: the
 * old `provider === "kling" ? kling : veo` handed Gemini Omni a prompt headed "for Veo 3.1".
 */
export function videoPromptFor(target: VideoPromptTarget): VideoProviderPrompt {
  switch (target) {
    case "kling": return videoPromptGenerateKlingPrompt;
    case "gemini-omni": return videoPromptGenerateGeminiOmniPrompt;
    case "seedance": return videoPromptGenerateSeedancePrompt;
    case "veo": return videoPromptGeneratePrompt;
  }
}
```

- [ ] **Step 6: Turn the old module into a shim**

`src/prompts/video-prompt-generate.ts` re-exports everything from the new modules, and keeps `videoPromptGeneratePromptFor` delegating to `videoPromptFor` so its two callers keep working untouched in this task:

```ts
export function videoPromptGeneratePromptFor(input: { provider: VideoPromptTarget }) {
  return videoPromptFor(input.provider);
}
```

- [ ] **Step 7: Verify byte-identity, then test**

Re-run your Step 1 hash script. **Veo's and Kling's hashes must be unchanged.** Report both before and after.

Update `src/prompts/__tests__/video-prompt-generate.test.ts` and add:

```ts
// The bug this whole split exists to make unrepresentable: Gemini Omni receiving Veo's record.
it("gives every target its own record — no two share an object", () => {
  const targets: VideoPromptTarget[] = ["veo", "kling", "gemini-omni", "seedance"];
  const records = targets.map((t) => videoPromptFor(t));
  expect(new Set(records).size).toBe(targets.length);
  expect(new Set(records.map((r) => r.id)).size).toBe(targets.length);
});

it("Seedance's guide follows the vendor's own order, not the shared spine's", () => {
  const sys = videoPromptFor("seedance").system;
  expect(sys).toContain("@Image 1");
  expect(sys).toMatch(/【】|subtitle/i);
  // The single-shot record must not teach shot structure — that is the multishot writer's job.
  expect(sys).not.toMatch(/\d+-\d+s:/);
});
```

Run:
```
npx vitest run src/prompts/__tests__/
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

Message: `refactor(prompts): one single-shot record per model (D243)` — body stating Veo's and Kling's SHA-256s before and after, that Gemini Omni gets its own record for the first time with Veo's text preserved pending Plan 2, and that the router is an exhaustive switch so a new member is a compile error.

---

## Task 3: Seedance in the multishot capability table

**Files:**
- Modify: `src/lib/nodes/multishot-models.ts`, `src/lib/nodes/__tests__/multishot-models.test.ts`

**Interfaces:**
- Consumes: `SEEDANCE_MODEL_ID` (Task 1).
- Produces: `MultishotCapability` gains `shotFormat: "timecode" | "triple" | "bare-timecode"` and `refTokenDialect: "image-ref" | "kling-image" | "seedance-image"`.

- [ ] **Step 1: Widen the two capability fields**

In `src/lib/nodes/multishot-models.ts`:

```ts
  /**
   * How `renderPlan` lays the beats out (D238, D244).
   *   timecode      — `[0-2s] …` cumulative ladder (Gemini Omni)
   *   triple        — `shot n, m, words;` (Kling's API format, NOT its console syntax)
   *   bare-timecode — `0-2s: …` (Seedance 2.5's own tutorial format)
   */
  shotFormat: "timecode" | "triple" | "bare-timecode";
  /**
   * Which reference-token dialect a beat's citations are stored in (D245).
   *
   * NAMED, not derived from `refTokenBase`. Kling's `@image_1` and Seedance's `@Image 1` are BOTH
   * 1-based, so the numeric base no longer identifies a dialect — and those two shapes differ by
   * one character's case and a space, which is exactly the near-collision that binds a citation to
   * the wrong image silently, in a clip already paid for.
   */
  refTokenDialect: "image-ref" | "kling-image" | "seedance-image";
```

`refTokenBase` stays — `refsCitedIn` still needs the offset to normalise to zero-based.

Set `refTokenDialect` on the two existing entries (`"image-ref"` for Gemini Omni, `"kling-image"` for Kling) and add Seedance:

```ts
  {
    id: SEEDANCE_MODEL_ID,
    label: "Seedance 2.5",
    // The first capability whose floor is not 3. `checkLadder` already reads
    // `cap.minTotalSeconds`, so nothing needed changing to support it.
    minTotalSeconds: 4,
    maxTotalSeconds: 30,
    minCutSeconds: 1,
    // The vendor states no cut cap and no character ceilings. `null` means exactly that — it is
    // not "unknown, so guess a number".
    maxCuts: null,
    maxCutChars: null,
    maxPromptChars: null,
    shotFormat: "bare-timecode",
    refTokenBase: 1,
    refTokenDialect: "seedance-image",
  },
```

- [ ] **Step 2: Add the tests**

```ts
it("declares Seedance's 4-30s window — the first floor that is not 3", () => {
  const sd = multishotCapabilityFor(SEEDANCE_MODEL_ID);
  expect(sd.minTotalSeconds).toBe(4);
  expect(sd.maxTotalSeconds).toBe(30);
  expect(sd.shotFormat).toBe("bare-timecode");
  expect(sd.refTokenDialect).toBe("seedance-image");
});

it("refuses a 3s ladder on Seedance that Omni accepts", () => {
  const cuts = [{ seconds: 3 }];
  expect(checkLadder(cuts, multishotCapabilityFor(GEMINI_OMNI_MODEL_ID))).toEqual({ ok: true });
  expect(checkLadder(cuts, multishotCapabilityFor(SEEDANCE_MODEL_ID)).ok).toBe(false);
});

it("accepts a 30s ladder only on Seedance", () => {
  const cuts = Array.from({ length: 6 }, () => ({ seconds: 5 }));
  expect(checkLadder(cuts, multishotCapabilityFor(SEEDANCE_MODEL_ID))).toEqual({ ok: true });
  expect(checkLadder(cuts, multishotCapabilityFor(KLING_OMNI_MODEL_ID)).ok).toBe(false);
});

// Two dialects are 1-based now, so the base cannot identify one.
it("gives every capability a distinct reference dialect", () => {
  const dialects = MULTISHOT_MODELS.map((m) => m.refTokenDialect);
  expect(new Set(dialects).size).toBe(MULTISHOT_MODELS.length);
});
```

The existing test asserting every capability id exists in `videoGenClientModelMap` now also covers Seedance — it will fail if Task 1 was skipped.

- [ ] **Step 3: Run, typecheck, commit**

```
npx vitest run src/lib/nodes/__tests__/multishot-models.test.ts
npx tsc --noEmit
```

`tsc` will report errors wherever `dialectForCapability` branches on `refTokenBase` — that is Task 5's file. Record the list; do not fix it here.

Message: `feat(multishot): Seedance 2.5 capability, and a named token dialect (D244, D245)`.

---

## Task 4: The third shot format

**Files:**
- Modify: `src/lib/nodes/multishot-plan.ts`, `src/lib/nodes/__tests__/multishot-plan.test.ts`

**Interfaces:**
- Consumes: `shotFormat: "bare-timecode"` (Task 3).

- [ ] **Step 1: Write the failing test**

```ts
const SEEDANCE = multishotCapabilityFor(SEEDANCE_MODEL_ID);

describe("renderPlan — Seedance bare timecodes", () => {
  it("emits `0-2s:` lines with the look as leading prose", () => {
    expect(renderPlan(perModelPlan, planCuts, SEEDANCE)).toBe(
      "Low sun from camera-left, warm grey concrete, 35mm at knee height.\n\n" +
        "0-2s: A hand sweeps keys off oak.\n" +
        "2-5s: A cab door swings open onto sunlit paving.",
    );
  });

  // Cumulative, like Omni's — and from the CUTS, so the last timestamp IS the request duration.
  it("ends the ladder exactly at the budget", () => {
    const last = renderPlan(perModelPlan, planCuts, SEEDANCE).trim().split("\n").at(-1)!;
    expect(last.startsWith("2-5s:")).toBe(true);
  });

  // Seedance's own handles must survive untouched — unlike Kling, there is no semicolon rewrite
  // here, because nothing in this format is semicolon-delimited.
  it("leaves @Image handles and punctuation alone", () => {
    const withRef = {
      ...perModelPlan,
      beats: [{ cutId: "c1", text: "the @Image 1 rests on oak; light shifts" }, perModelPlan.beats[1]],
    };
    expect(renderPlan(withRef, planCuts, SEEDANCE)).toContain(
      "0-2s: the @Image 1 rests on oak; light shifts",
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```
npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts
```
Expected: FAIL — the `bare-timecode` capability falls through to the timecode branch and produces `[0-2s] …`.

- [ ] **Step 3: Implement**

In `renderPlan`, add the branch before the existing timecode fallthrough:

```ts
  if (cap.shotFormat === "bare-timecode") {
    // D244 — Seedance 2.5's own format, used throughout its tutorial: a bare `0-2s:` prefix, no
    // brackets. Cumulative from the CUTS like Omni's ladder, so the final timestamp equals the
    // request's duration by construction.
    //
    // No text rewrite. Kling's branch replaces semicolons because a stray `;` terminates a shot
    // in its comma/semicolon triple grammar; nothing here is delimited that way, so the
    // operator's prose — and its `@Image N` handles — pass through byte-for-byte.
    let at = 0;
    const ladder = cuts
      .map((cut) => {
        const from = at;
        at += cut.seconds;
        return `${from}-${at}s: ${(byId.get(cut.id) ?? "").trim()}`;
      })
      .join("\n");
    return `${plan.look.trim()}\n\n${ladder}`;
  }
```

- [ ] **Step 4: Run, typecheck, commit**

All three formats must still pass. Message: `feat(multishot): render bare timecodes for Seedance (D244)`.

---

## Task 5: The third reference dialect

**Files:**
- Modify: `src/lib/nodes/prompt-token-dialect.ts`, `src/lib/nodes/__tests__/prompt-token-dialect.test.ts`

**Interfaces:**
- Consumes: `refTokenDialect` (Task 3).
- Produces: `seedanceImageDialect(orderedIds: string[]): TokenDialect`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("seedanceImageDialect", () => {
  const d = seedanceImageDialect(["a", "b"]);

  it("is ONE-based, space-separated and capitalised", () => {
    expect(d.tokenForId("a", "A")).toBe("@Image 1");
    expect(d.tokenForId("b", "B")).toBe("@Image 2");
  });

  it("round-trips byte-exact", () => {
    const text = "the @Image 2 rests on oak, the @Image 1 just visible";
    expect(serializeSegments(d.parse(text), d)).toBe(text);
  });

  it("does not truncate a two-digit index", () => {
    const wide = seedanceImageDialect(Array.from({ length: 12 }, (_, i) => `id${i}`));
    const segs = wide.parse("@Image 10");
    expect(segs).toHaveLength(1);
    expect((segs[0] as any).id).toBe("id9");
  });

  it("keeps an unknown id's original text rather than renumbering it", () => {
    expect(serializeSegments(d.parse("@Image 9"), d)).toBe("@Image 9");
  });

  // THE CRITICAL ONE. `@image_1` and `@Image 1` differ by one character's case and a space.
  // If either dialect parses the other's tokens, every citation binds to the wrong image, and
  // it fails silently in a clip that has already been paid for.
  it("does not read Kling's or Omni's tokens, and neither reads Seedance's", () => {
    expect(d.parse("@image_1").every((s) => s.kind === "text")).toBe(true);
    expect(d.parse("<IMAGE_REF_0>").every((s) => s.kind === "text")).toBe(true);
    expect(klingImageDialect(["a", "b"]).parse("@Image 1").every((s) => s.kind === "text")).toBe(true);
    expect(imageRefDialect(["a", "b"]).parse("@Image 1").every((s) => s.kind === "text")).toBe(true);
  });
});

describe("dialectForCapability", () => {
  it("selects on the named dialect, not the numeric base", () => {
    const kling = dialectForCapability(multishotCapabilityFor(KLING_OMNI_MODEL_ID), ["a"]);
    const seedance = dialectForCapability(multishotCapabilityFor(SEEDANCE_MODEL_ID), ["a"]);
    // Both are refTokenBase 1 — only the named dialect tells them apart.
    expect(kling.tokenForId("a", "A")).toBe("@image_1");
    expect(seedance.tokenForId("a", "A")).toBe("@Image 1");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Expected: `seedanceImageDialect is not a function`.

- [ ] **Step 3: Implement**

```ts
// `@Image ` then a greedy digit run. The capital I and the SPACE are both load-bearing: Kling's
// dialect matches `@image_(\d+)`, and these two token shapes differ only by case and that space.
// Do not make this case-insensitive and do not make the space optional.
const SEEDANCE_IMAGE_RE = /@Image (\d+)/g;

/**
 * `@Image N` — Seedance 2.5's own asset handle, ONE-based over the attached references.
 *
 * Structured to mirror `imageRefDialect` and `klingImageDialect` line for line; read all three
 * side by side, because a divergence between them is a bug in one of them. The only intended
 * differences are the token shape and the index base.
 */
export function seedanceImageDialect(orderedIds: string[]): TokenDialect {
  const indexOf = new Map(orderedIds.map((id, i) => [id, i]));
  return {
    parse(value) {
      if (!value) return [];
      const segments: Segment[] = [];
      let last = 0;
      for (const m of value.matchAll(SEEDANCE_IMAGE_RE)) {
        const at = m.index ?? 0;
        if (at > last) segments.push({ kind: "text", text: value.slice(last, at) });
        const i = Number(m[1]) - 1;
        segments.push({ kind: "mention", label: m[0], id: orderedIds[i] ?? `__missing_${i}` });
        last = at + m[0].length;
      }
      if (last < value.length) segments.push({ kind: "text", text: value.slice(last) });
      return segments;
    },
    tokenOf(segment) {
      const i = indexOf.get(segment.id);
      return i === undefined ? segment.label : `@Image ${i + 1}`;
    },
    tokenForId(id) {
      const i = indexOf.get(id);
      return i === undefined ? null : `@Image ${i + 1}`;
    },
    chipLabel: (segment, upstreamLabel) => upstreamLabel ?? segment.label,
  };
}
```

Rewrite `dialectForCapability` to switch on the named dialect exhaustively:

```ts
export function dialectForCapability(
  cap: MultishotCapability,
  orderedIds: string[],
): TokenDialect {
  // Exhaustive switch, no default: a new dialect is a COMPILE error here rather than a silent
  // fall back to Omni's tokens (D245).
  switch (cap.refTokenDialect) {
    case "kling-image": return klingImageDialect(orderedIds);
    case "seedance-image": return seedanceImageDialect(orderedIds);
    case "image-ref": return imageRefDialect(orderedIds);
  }
}
```

- [ ] **Step 4: Update `refsCitedIn` for the third shape**

`refsCitedIn` in `multishot-plan.ts` branches on `refTokenBase`, which can no longer distinguish Kling from Seedance. Switch it to `cap.refTokenDialect` with the same exhaustive shape, still returning **zero-based** indexes for all three — callers index an image array with the result. Add:

```ts
it("finds Seedance's handles and returns zero-based indexes", () => {
  expect(refsCitedIn("the @Image 1 and @Image 2", SEEDANCE)).toEqual([0, 1]);
  expect(refsCitedIn("the @image_1", SEEDANCE)).toEqual([]);
  expect(refsCitedIn("the @Image 1", KLING)).toEqual([]);
});
```

- [ ] **Step 5: Run, typecheck, commit**

```
npx vitest run src/lib/nodes/__tests__/
npx tsc --noEmit
```
Message: `feat(multishot): @Image N dialect for Seedance (D245)`.

---

## Task 6: Seedance's multishot writer prompt

**Files:**
- Create: `src/prompts/multishot-prompt-seedance.ts`
- Modify: `src/prompts/multishot-prompt-for.ts`, `src/app/api/nodes/[id]/multishot-prompt/route.test.ts`

**Interfaces:**
- Consumes: `MULTISHOT_SHARED_CRAFT`, `MULTISHOT_PLAN_SCHEMA`, `referenceIdentificationBlock`, `MultishotPromptSpec` from `multishot-prompt-generate.ts`; `SEEDANCE_MODEL_ID`.
- Produces: `multishotPromptSeedance(): MultishotPromptSpec`.

- [ ] **Step 1: Read the two existing multishot writers**

Read `src/prompts/multishot-prompt-generate.ts` and `multishot-prompt-kling.ts` in full. Note what they share (`MULTISHOT_SHARED_CRAFT`, `MULTISHOT_LOOK_BLOCK_RULES`, `MULTISHOT_SHOT_TEXT_CONTRACT`, the schema, the reference block) and what each keeps for itself.

- [ ] **Step 2: Write Seedance's**

Create `src/prompts/multishot-prompt-seedance.ts`, importing every shared block rather than retyping it. What is Seedance-specific:

- **The vendor's formula order**: subject + action/event + scene and environment + visual style + camera movement/shot cuts + sound.
- **Sound is a first-class beat element**, unlike the other two models. Seedance generates audio natively and its guide gives characters for it: `()` music, `<>` SFX, `{}` dialogue, `【】` subtitles. A beat may use them.
- **No character ceiling** — do not carry Kling's 512-character instruction. Seedance's capability declares `maxCutChars: null`.
- **The 30s budget** is far larger, so a beat can carry more development than a 2-second Omni cut. Say so.
- `referenceIdentificationBlock("triple")` — reuse the non-timecode example variant, since Seedance's beats must not carry timecodes either (the renderer adds them).

**D233 still holds:** the writer never assigns reference tokens itself. It names what it saw in prose; the operator binds by hand. Do not add `@Image N` assignment instructions.

```ts
export const MULTISHOT_SEEDANCE_PROMPT_ID = "multishot-prompt-seedance@1";

export function multishotPromptSeedance(): MultishotPromptSpec {
  return {
    id: MULTISHOT_SEEDANCE_PROMPT_ID,
    model: MULTISHOT_AUTHORING_MODEL,
    system: SYSTEM,
    schema: MULTISHOT_PLAN_SCHEMA,
  };
}
```

- [ ] **Step 3: Route to it**

`multishot-prompt-for.ts` gains a third branch, keyed on the capability's id like the Kling branch.

- [ ] **Step 4: Test**

Add to the route test, following the existing Kling cases:

```ts
it("writes with Seedance's prompt when the Multishot node targets Seedance", async () => {
  // …arrange the upstream multishot node with data.targetModel = SEEDANCE_MODEL_ID…
  const systemSent = openaiCreateMock.mock.calls[0][0].messages[0].content;
  expect(systemSent).toContain("Seedance");
  expect(systemSent).not.toContain("512 CHARACTERS");
});
```

And a prompts-level test that all three multishot writers are distinct objects with distinct ids — the same assertion Task 2 adds for the single-shot lane, and for the same reason.

- [ ] **Step 5: Run, typecheck, commit**

```
npx vitest run src/prompts/__tests__/ "src/app/api/nodes/[id]/multishot-prompt/"
npx tsc --noEmit
```
Message: `feat(multishot): a writer prompt for Seedance 2.5`.

---

## Task 7: Wire Seedance through both lanes' UI

**Files:**
- Modify: `src/components/nodes/target-provider-select.tsx`, `src/components/nodes/video-prompt-focus-view.tsx`, `src/app/api/nodes/[id]/video-prompt/route.ts`, `src/lib/nodes/video-prompt.ts`

- [ ] **Step 1: Add Seedance to the target picker**

`target-provider-select.tsx`'s `OPTIONS` carries a comment stating that every `VideoProvider` member must appear, and that a missing one renders the field with nothing selected while a connected Video Gen node locks the control — an unrecoverable state. Add:

```ts
  { value: "seedance", label: "Seedance" },
```

- [ ] **Step 2: Map the provider**

`video-prompt-focus-view.tsx`'s `providerOf` maps a model id to a variant key and currently ends `return "veo"`. Add the Seedance case **before** that fallback:

```ts
    if (provider === "seedance") return "seedance";
```

Widen `selectorValue`'s narrowing on the next lines — it lists members explicitly (`targetProvider === "kling" || targetProvider === "gemini-omni"`) precisely because a missing member silently became Veo once before. Add `"seedance"`.

- [ ] **Step 3: Give the single-shot editor Seedance's dialect**

The `omniRefs` memo builds a dialect only for `gemini-omni`, so a Seedance prompt's `@Image N` handles would render as raw text. Replace the conditional with a lookup keyed on the variant, reusing `seedanceImageDialect` from Task 5. Keep the memo's dependency on `refIdsKey` rather than the array identity — the comment there records that a fresh dialect each render fights the caret.

- [ ] **Step 4: Widen the route's validation**

`src/app/api/nodes/[id]/video-prompt/route.ts` narrows the body's `targetProvider` against `VALID_PROVIDERS`. Add `"seedance"` to that list, or the route will silently coerce a Seedance request to Veo's prompt.

`src/lib/nodes/video-prompt.ts:115-117` does the same narrowing inline. Add `"seedance"` there too. **Both** must be updated — they are two independent copies of one rule, which is itself worth a note in your report.

- [ ] **Step 5: Typecheck, lint, test**

```
npx tsc --noEmit
npx eslint src/components/nodes/target-provider-select.tsx src/components/nodes/video-prompt-focus-view.tsx
npx vitest run src/lib/nodes/__tests__/ src/prompts/__tests__/
```

- [ ] **Step 6: Commit**

Message: `feat(video-prompt): Seedance as a target across the single-shot lane` — body noting the two independent copies of the target-narrowing rule.

---

## Task 8: Generate one real Seedance clip and write up what it does

**Do not start this task without asking the operator first — it spends real credits.** At 720p a 30-second clip is about **$6.93**.

**Files:**
- Create: `ref/byteplus-docs/2026-09-XX-seedance-findings.md`
- Modify: the spec, if a finding contradicts it

- [ ] **Step 1: Build the smallest real sequence**

A Multishot node targeting Seedance 2.5, three cuts of 2/2/3s (7s — inside 4–30 and cheap), distinct shot text, one reference image `@`-mentioned in exactly one beat.

- [ ] **Step 2: Read the compiled prompt before generating**

Open Video Gen's "Sent to model" tab. Confirm bare `0-2s:` / `2-4s:` / `4-7s:` lines, the look as leading prose, and `duration = 7`. If any of that is wrong the bug is in Task 4 or the route — stop, because generating would only confirm it at a price.

- [ ] **Step 3: Watch the clip against three questions**

1. **Does it cut where the timestamps say?** Three distinct shots at 2s and 4s.
2. **Did the leading look prose survive**, or was it absorbed into the first shot?
3. **Did `@Image 1` bind** to the attached reference, and only in its own beat?

- [ ] **Step 4: Write it up either way**

A confirmation is worth as much as a correction. Record the exact prompt sent, the exact settings, what came back, and each question answered.

- [ ] **Step 5: Amend the spec if reality disagrees, then commit**

Message: `docs(seedance): findings from the first real 2.5 multishot generation`.

---

## Self-review notes (for the reviewer, not a task)

**Spec coverage.** §2 → Task 1. §3 → Tasks 2, 7. §4 → Tasks 2, 6. §5 → Tasks 2, 6. §6 → Tasks 3, 4, 5. §7 → Task 1. §8 → Task 1 (rules) + Task 3 (`checkLadder`). §9 → tests within each task. §10 → this plan is Plan 1; Plan 2 is not started here. §11 ADRs → to append after implementation.

**Two deliberate departures, argued where they happen:**

1. **The routing key is `VideoPromptTarget`, not a raw model id** (see the section above §File Structure). Spec §3's literal wording would require three identical Veo entries and a migration of every saved Video Prompt node.
2. **Gemini Omni's new record carries Veo's text.** The spec's §5 wants Omni's guide rewritten from its six-dimension framework; that is Plan 2. Splitting the routing and rewriting the prose in one commit would leave a behaviour change with no way to attribute it.

**Where a reviewer should push back if they disagree:** Task 1 caps Seedance's references at 10 where the vendor allows 30. The reasoning is that the operator attaches and cites each one by hand, so a presentable limit beats a theoretical one — but it is a product call, not a technical constraint, and it is cheap to raise.
