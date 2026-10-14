# Client Avatars — Generation and Credits (Plan 2 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Avatar Studio an operator can describe a character, generate candidate front images on any image model with the credit cost shown, pick one, and have the profile sheet generated from the front image — all billed through the existing credit ledger.

**Architecture:** One image is one `generations` row, now allowed to belong to an avatar instead of a canvas node. A single server function, `runAvatarGeneration`, does reserve → generate → store → settle-or-refund for both front candidates and the sheet. The browser asks for one image per request, so a batch of four is four requests that fill four placeholders as they return. Candidates are read back from `generations`; no new table holds them. Prompts, fixed framing and cost estimates are pure functions shared by browser and server.

**Tech Stack:** Next.js 16 route handlers, Supabase (service-role client), the existing image registry (`src/lib/image-gen/`) and credit ledger (`src/lib/db/credit-transactions.ts`), GCS, zod, vitest (node env — no component rendering), shadcn/Base UI primitives.

**Spec:** `docs/superpowers/specs/2026-09-29-client-avatars-design.md` §4.1–4.2, §7, §8 · **ADR:** D288, D290, D291 · **Depends on:** plan 1 (`2026-09-30-client-avatars-foundation.md`), merged on this branch.

## Global Constraints

- Branch: `feat/client-avatars`. Verify `git branch --show-current` before every commit.
- This is NOT the Next.js in your training data. Before writing a page or route, read the matching guide in `node_modules/next/dist/docs/01-app/`. `params` is a `Promise` and must be awaited.
- API routes: `withClient` on every route, `apiOk` / `apiError` only, `withTryCatch` around multi-step handlers. In API routes `[id]` is the client **UUID**.
- An avatar id or generation id from the URL or body is never trusted alone: every read and write also filters on the client and the avatar. A foreign or missing one is a 404.
- Credits: every generation follows `reserveCredits` → provider → `settleGeneration` on success or `refundReservation` on any failure. A cap refusal is a 402 with nothing charged. The estimate shown on a button and the amount reserved come from the same function.
- One image per request. The browser sends one request per image in a batch; the server never loops over a count.
- Stored bytes are exactly what the provider returned: no resize, no re-encode, no metadata strip.
- Front images are generated at aspect ratio `3:4`. The profile sheet is ONE generated image at `16:9` showing three views of the person — front, side profile, back (operator decision, 2026-09-30). Neither aspect is operator-selectable. The sheet is generated when the operator clicks Generate, never automatically; uploading their own sheet stays possible.
- A generated front makes the avatar `generic` and clears any likeness consent (plan 1's `frontChangePatch` does both). Do not add a consent step for generated images.
- The model whose faces Seedance accepts is named once, in `SEEDANCE_FACE_MODEL_ID`. There is no expiry date, age check or "eligible until" badge anywhere (spec §8, D290).
- Controls are shadcn primitives from `src/components/ui/*` only. Base UI composes with the `render` prop, not `asChild`. Colours only through the shadcn CSS variables; Lucide icons at `strokeWidth={1.5}`; `.text-eyebrow` for small labels.
- Components: one per file, named export, under ~200 lines, in `src/components/avatars/`. Types, constants and helpers live in `src/lib/avatars/`.
- Import, don't redefine: `estimateImageGenerationCostUsd` (`@/lib/image-gen/estimate`), `computeImageCost` (`@/lib/image-gen/cost`), `usdToFinalCredits` and `CREDIT_LIMIT_TOAST_MESSAGE` (`@/lib/credits/units`), `imageGenClientModelMap` / `imageGenClientModelGroups` / `defaultsForModel` (`@/lib/image-gen/client-models`), `extForContentType` (`@/lib/storage/paths`), `isUuid` (`@/lib/avatars/utils`).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. One commit per task.
- Run tests per file or directory (`npx vitest run <path>`); the full run has ~11 known timeout flakes in API route tests.
- The migration is applied by hand in the Supabase SQL editor. Do not apply it yourself; the last task stops and asks the operator.

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/0042_generations_avatar.sql` | `generations.node_id` nullable; `avatar_id`; owner check |
| `src/lib/db/types.ts`, `src/lib/db/generations.ts` | `GenerationRow` and helpers accept an avatar owner |
| `src/lib/avatars/generation.ts` | Pure: prompts, fixed framing, params, cost estimate, Seedance model check |
| `src/lib/avatars/constants.ts` | Styles, attribute options, aspects, batch limits, model ids |
| `src/lib/avatars/schema.ts`, `src/lib/avatars/rows.ts` | `AvatarCandidate`; generation row → candidate / image |
| `src/lib/storage/paths.ts`, `src/lib/storage/index.ts` | `pathForAvatarGenerated`, `uploadAvatarGenerated` |
| `src/lib/avatars/generate.ts` | Server: `runAvatarGeneration` — reserve, generate, store, settle or refund |
| `src/app/api/clients/[id]/avatars/[avatarId]/generations/route.ts` | GET candidates and spend; POST one front candidate |
| `src/app/api/clients/[id]/avatars/[avatarId]/front/route.ts` | Pick a candidate as the front image |
| `src/app/api/clients/[id]/avatars/[avatarId]/sheet/route.ts` | Generate the profile sheet from the front image |
| `src/services/avatars.service.ts`, `src/hooks/use-avatar-studio.ts` | Service calls; `ensureAvatar` shared by upload and generation |
| `src/hooks/use-avatar-generation.ts` | Candidates, placeholders, spend, pick a front, generate the sheet |
| `src/components/avatars/avatar-describe-panel.tsx`, `avatar-candidate-grid.tsx`, `avatar-model-select.tsx`, `avatar-credit-cost.tsx` | The Describe composer and the batches |
| `src/components/avatars/avatar-studio-look-step.tsx`, `avatar-studio-sheet-step.tsx`, `avatar-sheet-generate.tsx` | The two Studio steps, with generation |

---

### Task 1: A generation can belong to an avatar

**Files:**
- Create: `supabase/migrations/0042_generations_avatar.sql`, `src/lib/db/generations.test.ts`
- Modify: `src/lib/db/types.ts` (`GenerationRow`), `src/lib/db/generations.ts`, `docs/auth-production-migration.md` (append)
- Modify as the typecheck requires: every reader of `GenerationRow.node_id`

**Interfaces:**
- Consumes: plan 1's `client_avatars` table.
- Produces:
  - `GenerationRow.node_id: string | null`, `GenerationRow.avatar_id: string | null`
  - `insertGeneration(input)` — `nodeId?: string`, new `avatarId?: string`; throws if neither is given
  - `succeedGeneration(input)` — `versionId?: string`
  - `getAvatarGeneration(avatarId: string, generationId: string): Promise<GenerationRow | null>`
  - `listAvatarGenerations(avatarId: string): Promise<GenerationRow[]>` — newest first
  - `sumAvatarCredits(avatarId: string): Promise<number>`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0042_generations_avatar.sql`:

```sql
-- A generation can belong to an avatar instead of a canvas node (D291). See
-- docs/superpowers/specs/2026-09-29-client-avatars-design.md §3.5 and §7.
--
-- The credit ledger, the monthly cap, the stuck-reservation sweep and the admin generations
-- table all key on `generations`, so Studio images join it rather than getting a second
-- ledger. Existing rows are untouched: every one already has a node_id.

alter table generations alter column node_id drop not null;

-- Cascade, mirroring node_id: an avatar only ever disappears when its client is deleted, and
-- its generations go with it. `set null` would leave a row owned by nothing and trip the
-- check below in the middle of that delete.
alter table generations
  add column if not exists avatar_id uuid references client_avatars(id) on delete cascade;

create index if not exists generations_avatar_id_idx on generations (avatar_id);

-- Every generation is owned by a node or an avatar.
alter table generations drop constraint if exists generations_owner_check;
alter table generations
  add constraint generations_owner_check check (node_id is not null or avatar_id is not null);
```

- [ ] **Step 2: Write the failing test**

`src/lib/db/generations.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));
vi.mock("./credit-transactions", () => ({ getReservationAmounts: vi.fn() }));

import { getAvatarGeneration, insertGeneration } from "./generations";

beforeEach(() => {
  mockFrom.mockReset();
  insert.mockReset();
  insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "g1" }, error: null }) }) });
  mockFrom.mockReturnValue({ insert });
});

describe("insertGeneration", () => {
  it("writes an avatar-owned row with no node", async () => {
    await insertGeneration({ avatarId: "a1", orgId: "org-1", clientId: "c1", type: "image" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ node_id: null, avatar_id: "a1", client_id: "c1", type: "image" }),
    );
  });

  it("still writes a node-owned row with no avatar", async () => {
    await insertGeneration({ nodeId: "n1", orgId: "org-1", type: "image" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ node_id: "n1", avatar_id: null }));
  });

  it("refuses a generation owned by nothing", async () => {
    await expect(insertGeneration({ orgId: "org-1", type: "image" })).rejects.toThrow(/node or an avatar/);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("getAvatarGeneration", () => {
  it("resolves null for a malformed id without querying", async () => {
    mockFrom.mockReset();
    await expect(getAvatarGeneration("a1", "abc")).resolves.toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/db/generations.test.ts`
Expected: FAIL — `getAvatarGeneration` is not exported, and `insertGeneration` rejects the avatar input at type level (the test still runs; the first assertion fails on `avatar_id`).

- [ ] **Step 4: Widen the row type**

In `src/lib/db/types.ts`, change `GenerationRow`:

```ts
  // Null for a generation owned by an avatar (migration 0042). Exactly one of node_id /
  // avatar_id is set on every row written since; older rows always have node_id.
  node_id: string | null;
  avatar_id: string | null;
```

(replace the existing `node_id: string;` line with these).

- [ ] **Step 5: Update the helpers**

In `src/lib/db/generations.ts`:

Add to the imports: `import { isUuid } from "@/lib/avatars/utils";`

Replace the head of `insertGeneration` (its input type and the first fields of the insert):

```ts
export async function insertGeneration(input: {
  // Exactly one owner: a canvas node, or an avatar (Avatar Studio images, D291).
  nodeId?: string;
  avatarId?: string;
  orgId: string;
  clientId?: string;
  userId?: string;
  userEmail?: string | null;
  type: GenerationRow["type"];
  modelUsed?: string;
  paramsSnapshot?: Record<string, unknown>;
  inputsSnapshot?: Record<string, unknown>;
}): Promise<GenerationRow> {
  if (!input.nodeId && !input.avatarId) {
    throw new Error("A generation must belong to a node or an avatar.");
  }
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .insert({
      node_id: input.nodeId ?? null,
      avatar_id: input.avatarId ?? null,
      org_id: input.orgId,
```

(the rest of the insert object and the function are unchanged).

In `succeedGeneration`, make `versionId` optional in the input type (`versionId?: string;`) and write `version_id: input.versionId ?? null,`.

Add at the end of the file:

```ts
// ── Avatar-owned generations (D291) ───────────────────────────────────────────

/** One generation of one avatar. Null for a malformed id, a missing row, or another avatar's. */
export async function getAvatarGeneration(
  avatarId: string,
  generationId: string,
): Promise<GenerationRow | null> {
  if (!isUuid(avatarId) || !isUuid(generationId)) return null;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .eq("avatar_id", avatarId)
    .maybeSingle();
  if (error) throw error;
  return (data as GenerationRow | null) ?? null;
}

export async function listAvatarGenerations(avatarId: string): Promise<GenerationRow[]> {
  if (!isUuid(avatarId)) return [];
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("avatar_id", avatarId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GenerationRow[];
}

/** Credits actually charged for this avatar's images — the ledger's settled amounts. */
export async function sumAvatarCredits(avatarId: string): Promise<number> {
  if (!isUuid(avatarId)) return 0;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("credits_charged")
    .eq("avatar_id", avatarId)
    .eq("status", "succeeded");
  if (error) throw error;
  return ((data ?? []) as { credits_charged: number | null }[]).reduce(
    (sum, row) => sum + (row.credits_charged ?? 0),
    0,
  );
}
```

- [ ] **Step 6: Make every reader of `node_id` handle null**

Run: `npx tsc --noEmit`

Each error is a place that assumed a generation has a node. An avatar's generation has no canvas, no node name and no shot, so the right behaviour everywhere on a canvas is to **skip the row**. Expected places (fix what the compiler reports, not this list):

- `src/app/api/canvas/[id]/generations/route.ts` — it already filters to the canvas's node ids; narrow with a `typeof g.node_id === "string"` guard before the `as string` casts.
- `src/lib/generation-tray.ts` — a job row with no `node_id` is not a canvas job: skip it before the node lookup.
- `src/hooks/use-generation-tray.ts`, `src/hooks/use-node-cost.ts` — `ids.has(row.node_id)` needs a null guard (`row.node_id !== null && ids.has(row.node_id)`).
- `src/lib/auth/impersonation-audit-view.ts` — its own row type reads `node_id`; widen it to `string | null` and keep the existing equality check (a null never equals a node id).

Do not change behaviour for node-owned rows. Re-run `npx tsc --noEmit` until clean.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/db/generations.test.ts src/lib/generation-tray.test.ts src/hooks/use-canvas-generations.test.ts`
Expected: PASS (the new 4 tests plus the existing ones in the two files that exist; if one of those two files does not exist, run the others).

- [ ] **Step 8: Document the migration**

Append to the end of `docs/auth-production-migration.md`:

````markdown

## Migration 0042 — a generation can belong to an avatar (2026-09-30)

`supabase/migrations/0042_generations_avatar.sql`. Paste into the Supabase SQL editor → Run.
**Depends on 0041** (`client_avatars`).

Makes `generations.node_id` nullable, adds `avatar_id` (cascade) with an index, and adds a
check that every row has a node or an avatar (D291). This is what lets Avatar Studio images use
the existing credit ledger.

**Existing rows are untouched** — each already has a `node_id`, so the check passes.

**Safe to re-run.** `add column if not exists`, `create index if not exists`, and the constraint
is dropped before it is added.

**Ordering:** apply before deploying the app code. Until it lands, generating in the Avatar
Studio fails with `null value in column "node_id"`.

**Verify after running:**

```sql
-- expect: is_nullable = YES
select is_nullable from information_schema.columns
where table_name = 'generations' and column_name = 'node_id';

-- expect 1 row
select conname from pg_constraint where conname = 'generations_owner_check';

-- expect 0 — no row is owned by nothing
select count(*) from generations where node_id is null and avatar_id is null;
```
````

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0042_generations_avatar.sql src/lib/db/types.ts src/lib/db/generations.ts src/lib/db/generations.test.ts docs/auth-production-migration.md
# plus each file changed in Step 6, by explicit path
git commit -m "feat(avatars): a generation can belong to an avatar (D291)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Prompts, fixed framing and cost estimates

**Files:**
- Modify: `src/lib/avatars/constants.ts` (append)
- Create: `src/lib/avatars/generation.ts`
- Test: `src/lib/avatars/__tests__/generation.test.ts`

**Interfaces:**
- Consumes: `imageGenClientModelMap`, `defaultsForModel` (`@/lib/image-gen/client-models`); `estimateImageGenerationCostUsd`; `usdToFinalCredits`.
- Produces, from `constants.ts`: `AVATAR_FRONT_ASPECT`, `AVATAR_SHEET_ASPECT`, `AVATAR_BATCH_DEFAULT`, `AVATAR_BATCH_MAX`, `AVATAR_DESCRIPTION_MAX`, `AVATAR_STYLES`, `AvatarStyleId`, `AVATAR_ATTRIBUTES`, `AvatarAttributes`, `AVATAR_FRAMING_CLAUSE`, `SEEDANCE_FACE_MODEL_ID`, `AVATAR_DEFAULT_FRONT_MODEL_ID`, `AVATAR_DEFAULT_SHEET_MODEL_ID`.
- Produces, from `generation.ts`: `buildAvatarFrontPrompt({ description, attributes, styleId }): string`, `buildAvatarSheetPrompt(): string`, `avatarImageParams(modelId, aspect): Record<string, unknown> | null`, `estimateAvatarImageCostUsd({ modelId, aspect, referenceCount }): number | null`, `estimateAvatarImageCredits(same): number | null`, `isSeedanceFaceModel(modelId): boolean`.

- [ ] **Step 1: Add the constants**

Append to `src/lib/avatars/constants.ts`:

```ts
// ── Generation (plan 2) ───────────────────────────────────────────────────────

// Fixed, never operator-selectable: a front image is a portrait, a sheet is a wide strip.
export const AVATAR_FRONT_ASPECT = "3:4";
export const AVATAR_SHEET_ASPECT = "16:9";

export const AVATAR_BATCH_DEFAULT = 4;
export const AVATAR_BATCH_MAX = 8;
export const AVATAR_DESCRIPTION_MAX = 1500;

export const AVATAR_STYLES = [
  { id: "photoreal", label: "Photoreal", phrase: "Photorealistic, natural skin texture, shot on a full-frame camera." },
  { id: "illustrated", label: "Illustrated", phrase: "Clean editorial illustration, consistent line weight, flat considered colour." },
  { id: "3d", label: "3D", phrase: "Stylised 3D character render, soft global illumination, subsurface skin." },
] as const;
export type AvatarStyleId = (typeof AVATAR_STYLES)[number]["id"];

// Optional quick chips. Each adds one plain phrase to the prompt; nothing is stored separately.
export const AVATAR_ATTRIBUTES = {
  gender: ["Female", "Male", "Non-binary"],
  age: ["18–24", "25–34", "35–44", "45–54", "55+"],
  ethnicity: [
    "South Asian", "East Asian", "Southeast Asian", "Black", "Middle Eastern",
    "Latino", "White", "Mixed",
  ],
} as const;
export type AvatarAttributes = Partial<Record<keyof typeof AVATAR_ATTRIBUTES, string>>;

// Appended to every front prompt. These are the conditions that make a usable face reference,
// so the operator cannot write them away.
export const AVATAR_FRAMING_CLAUSE =
  "One person only, facing the camera, waist-up, neutral relaxed expression, even soft light, " +
  "plain light-grey seamless background, no text, no logos, no props in hand.";

// The only image model whose faces Seedance accepts as a reference (spec §8, D290). Named
// once: if the live model list shows a different id (spec §10, question 3), change it here.
export const SEEDANCE_FACE_MODEL_ID = "seedream:seedream-5-0-lite";

// A generated avatar runs on Seedance, so the default is the model Seedance will take.
export const AVATAR_DEFAULT_FRONT_MODEL_ID = SEEDANCE_FACE_MODEL_ID;
// The handoff design takes the model sheet from Nano Banana, whichever face it starts with.
export const AVATAR_DEFAULT_SHEET_MODEL_ID = "gemini:gemini-3-pro-image";
```

- [ ] **Step 2: Write the failing tests**

`src/lib/avatars/__tests__/generation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  avatarImageParams, buildAvatarFrontPrompt, buildAvatarSheetPrompt,
  estimateAvatarImageCostUsd, estimateAvatarImageCredits, isSeedanceFaceModel,
} from "../generation";
import {
  AVATAR_DEFAULT_SHEET_MODEL_ID, AVATAR_FRAMING_CLAUSE, AVATAR_FRONT_ASPECT,
  AVATAR_SHEET_ASPECT, SEEDANCE_FACE_MODEL_ID,
} from "../constants";

describe("buildAvatarFrontPrompt", () => {
  it("joins the description, the chosen attributes, the style and the fixed framing", () => {
    const prompt = buildAvatarFrontPrompt({
      description: "  Runs a small bakery, flour on her apron.  ",
      attributes: { gender: "Female", age: "25–34" },
      styleId: "photoreal",
    });
    expect(prompt.startsWith("Runs a small bakery, flour on her apron.")).toBe(true);
    expect(prompt).toContain("Female");
    expect(prompt).toContain("aged 25–34");
    expect(prompt).toContain("Photorealistic");
    expect(prompt.endsWith(AVATAR_FRAMING_CLAUSE)).toBe(true);
  });

  it("adds nothing for attributes that were not chosen", () => {
    const prompt = buildAvatarFrontPrompt({ description: "A chef.", attributes: {}, styleId: "3d" });
    expect(prompt).not.toContain("aged");
    expect(prompt).not.toContain("undefined");
  });
});

describe("buildAvatarSheetPrompt", () => {
  it("asks for three views of the same person in one image and names it a reference sheet", () => {
    const prompt = buildAvatarSheetPrompt();
    expect(prompt).toContain("three views");
    for (const view of ["front", "side profile", "back"]) expect(prompt).toContain(view);
    expect(prompt).not.toContain("three-quarter");
    expect(prompt).toContain("character reference sheet");
    expect(prompt).toContain("same person");
  });
});

describe("avatarImageParams", () => {
  it("uses the model's defaults with the aspect ratio forced", () => {
    const params = avatarImageParams(SEEDANCE_FACE_MODEL_ID, AVATAR_FRONT_ASPECT);
    expect(params).toMatchObject({ aspect_ratio: "3:4" });
    expect(params).toHaveProperty("image_size");
  });

  it("is null for a model that is not in the registry", () => {
    expect(avatarImageParams("nope:none", AVATAR_FRONT_ASPECT)).toBeNull();
  });
});

describe("estimates", () => {
  it("prices a Seedream front at its flat per-image rate, in credits", () => {
    const usd = estimateAvatarImageCostUsd({
      modelId: SEEDANCE_FACE_MODEL_ID, aspect: AVATAR_FRONT_ASPECT, referenceCount: 0,
    });
    expect(usd).toBeCloseTo(0.035, 5);
    expect(estimateAvatarImageCredits({
      modelId: SEEDANCE_FACE_MODEL_ID, aspect: AVATAR_FRONT_ASPECT, referenceCount: 0,
    })).toBe(35);
  });

  it("prices a sheet with one reference image above zero", () => {
    const credits = estimateAvatarImageCredits({
      modelId: AVATAR_DEFAULT_SHEET_MODEL_ID, aspect: AVATAR_SHEET_ASPECT, referenceCount: 1,
    });
    expect(credits).toBeGreaterThan(0);
  });

  it("is null for an unknown model, so the caller can fail closed", () => {
    expect(estimateAvatarImageCredits({ modelId: "nope:none", aspect: "3:4", referenceCount: 0 })).toBeNull();
  });
});

describe("isSeedanceFaceModel", () => {
  it("is true only for the one model Seedance accepts", () => {
    expect(isSeedanceFaceModel(SEEDANCE_FACE_MODEL_ID)).toBe(true);
    expect(isSeedanceFaceModel("seedream:seedream-5-0-pro")).toBe(false);
    expect(isSeedanceFaceModel("gemini:gemini-3-pro-image")).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/lib/avatars/__tests__/generation.test.ts`
Expected: FAIL — cannot resolve `../generation`.

- [ ] **Step 4: Write the rules**

`src/lib/avatars/generation.ts`:

```ts
import { defaultsForModel, imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { usdToFinalCredits } from "@/lib/credits/units";
import {
  AVATAR_FRAMING_CLAUSE, AVATAR_STYLES, SEEDANCE_FACE_MODEL_ID,
  type AvatarAttributes, type AvatarStyleId,
} from "./constants";

// Pure, and deliberately without a "server-only" guard: the Studio calls these to show a cost
// before generating, and the routes call the same functions to reserve — so the number on the
// button is the number reserved.

/** The full prompt sent for a front image: what the operator wrote, then what they must not
 *  be able to write away. */
export function buildAvatarFrontPrompt(input: {
  description: string;
  attributes: AvatarAttributes;
  styleId: AvatarStyleId;
}): string {
  const { gender, age, ethnicity } = input.attributes;
  const who = [ethnicity, gender, age ? `aged ${age}` : undefined].filter(Boolean).join(", ");
  const style = AVATAR_STYLES.find((s) => s.id === input.styleId) ?? AVATAR_STYLES[0];
  return [input.description.trim(), who ? `${who}.` : "", style.phrase, AVATAR_FRAMING_CLAUSE]
    .filter(Boolean)
    .join(" ");
}

/** The profile sheet is made from the front image, so the prompt only describes the layout.
 *  "character reference sheet" is stated because a multi-angle image on a plain backdrop has
 *  been read as a location before (roadmap D281). */
export function buildAvatarSheetPrompt(): string {
  return (
    "A character reference sheet of the same person as the reference image: three views side by " +
    "side in one wide image — front, side profile, and back. Same person, same face, " +
    "same hair, same outfit in every view. Standing, full upper body, neutral expression, even " +
    "soft light, plain light-grey seamless background. No text, no labels, no borders."
  );
}

/** The model's own defaults with the aspect ratio forced. Null for an unknown model. */
export function avatarImageParams(
  modelId: string,
  aspect: string,
): Record<string, unknown> | null {
  const model = imageGenClientModelMap[modelId];
  if (!model) return null;
  return { ...defaultsForModel(model), aspect_ratio: aspect };
}

export function estimateAvatarImageCostUsd(input: {
  modelId: string;
  aspect: string;
  referenceCount: number;
}): number | null {
  const params = avatarImageParams(input.modelId, input.aspect);
  if (!params) return null;
  return estimateImageGenerationCostUsd({
    modelId: input.modelId,
    quality: params.quality as string | undefined,
    aspectRatio: input.aspect,
    imageSize: params.image_size as string | undefined,
    // Only the count is read; the URLs themselves do not change the price.
    referenceUrls: Array.from({ length: input.referenceCount }, () => ""),
  });
}

export function estimateAvatarImageCredits(input: {
  modelId: string;
  aspect: string;
  referenceCount: number;
}): number | null {
  const usd = estimateAvatarImageCostUsd(input);
  return usd === null ? null : usdToFinalCredits(usd);
}

export function isSeedanceFaceModel(modelId: string): boolean {
  return modelId === SEEDANCE_FACE_MODEL_ID;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/avatars`
Expected: PASS, including the 9 new tests. If the Seedream estimate is not `0.035` / `35`, read `src/lib/image-gen/cost.ts` (`seedreamImageCostUsd`, `estimateImageOutputCost`) and the model's default `image_size`, correct the expected numbers to what those functions actually price, and say so in your report — do not change the pricing code.

- [ ] **Step 6: Commit**

```bash
git add src/lib/avatars/constants.ts src/lib/avatars/generation.ts src/lib/avatars/__tests__/generation.test.ts
git commit -m "feat(avatars): generation prompts, fixed framing and cost estimates (D288, D290)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Candidates and storage for generated images

**Files:**
- Modify: `src/lib/avatars/schema.ts`, `src/lib/avatars/rows.ts`, `src/lib/storage/paths.ts`, `src/lib/storage/index.ts`
- Test: `src/lib/avatars/__tests__/rows.test.ts` (append), `src/lib/storage/paths.test.ts` (append)

**Interfaces:**
- Consumes: `GenerationRow` (Task 1), `AvatarImage` (plan 1).
- Produces:
  - `AvatarCandidate = { generationId: string; batchId: string | null; url: string; modelId: string; createdAt: string; width: number | null; height: number | null; sizeBytes: number }`
  - `generationToImage(row: GenerationRow): AvatarImage | null` — null unless the row succeeded and has an output
  - `generationToCandidate(row: GenerationRow): AvatarCandidate | null` — null unless it is a succeeded **front** generation
  - `pathForAvatarGenerated({ clientId, avatarId, slot, ext }): string` → `clients/<clientId>/avatars/<avatarId>/generated/<slot>/<stored name>`
  - `uploadAvatarGenerated({ clientId, avatarId, slot, ext, body, contentType }): Promise<UploadResult>`
- The snapshot contract these read (written by Task 4): `inputs_snapshot = { slot: "front" | "sheet", prompt: string, batchId: string | null, referenceUrls: string[] }`, `meta = { email?, width, height, sizeBytes }`, `output_snapshot = <public url>`, `model_used = <registry id>`.

- [ ] **Step 1: Add the candidate type**

Append to `src/lib/avatars/schema.ts`:

```ts
// One generated front image the operator can pick (plan 2). Read back from `generations`;
// no table of its own.
export type AvatarCandidate = {
  generationId: string;
  batchId: string | null;
  url: string;
  modelId: string;
  createdAt: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
};
```

- [ ] **Step 2: Write the failing tests**

Append to `src/lib/avatars/__tests__/rows.test.ts` (add `generationToCandidate`, `generationToImage` to the import from `../rows`, and `import type { GenerationRow } from "@/lib/db/types";`):

```ts
const gen = (over: Partial<GenerationRow> = {}): GenerationRow => ({
  id: "g1", node_id: null, avatar_id: "a1", org_id: "org-1", client_id: "c1",
  type: "image", status: "succeeded", provider_job_id: null,
  model_used: "seedream:seedream-5-0-lite",
  params_snapshot: { aspect_ratio: "3:4" },
  inputs_snapshot: { slot: "front", prompt: "A chef.", batchId: "b1", referenceUrls: [] },
  output_snapshot: "https://storage.googleapis.com/b/clients/c1/avatars/a1/generated/front/x.png",
  tokens_used: null, cost_usd: 0.035, credits_charged: 35, version_id: null, user_id: "user-1",
  error: null, meta: { width: 1536, height: 2048, sizeBytes: 900 },
  created_at: "2026-09-30T10:00:00.000Z", updated_at: "2026-09-30T10:00:20.000Z",
  ...over,
});

describe("generationToImage", () => {
  it("builds an image whose source says how it was generated", () => {
    expect(generationToImage(gen())).toEqual({
      url: "https://storage.googleapis.com/b/clients/c1/avatars/a1/generated/front/x.png",
      width: 1536, height: 2048, sizeBytes: 900,
      source: {
        kind: "generated", modelId: "seedream:seedream-5-0-lite", mode: "text", prompt: "A chef.",
        generatedAt: "2026-09-30T10:00:00.000Z", generationId: "g1", untouched: true,
      },
    });
  });

  it("marks an image made from references as an edit", () => {
    const row = gen({ inputs_snapshot: { slot: "sheet", prompt: "p", batchId: null, referenceUrls: ["u"] } });
    expect(generationToImage(row)?.source).toMatchObject({ mode: "edit" });
  });

  it("is null for a failed or still-running generation", () => {
    expect(generationToImage(gen({ status: "failed", output_snapshot: null }))).toBeNull();
    expect(generationToImage(gen({ status: "running", output_snapshot: null }))).toBeNull();
  });
});

describe("generationToCandidate", () => {
  it("maps a succeeded front generation", () => {
    expect(generationToCandidate(gen())).toEqual({
      generationId: "g1", batchId: "b1",
      url: "https://storage.googleapis.com/b/clients/c1/avatars/a1/generated/front/x.png",
      modelId: "seedream:seedream-5-0-lite", createdAt: "2026-09-30T10:00:00.000Z",
      width: 1536, height: 2048, sizeBytes: 900,
    });
  });

  it("is null for a sheet generation and for a failed one", () => {
    const sheet = gen({ inputs_snapshot: { slot: "sheet", prompt: "p", batchId: null, referenceUrls: ["u"] } });
    expect(generationToCandidate(sheet)).toBeNull();
    expect(generationToCandidate(gen({ status: "failed", output_snapshot: null }))).toBeNull();
  });
});
```

Append to `src/lib/storage/paths.test.ts` (add `pathForAvatarGenerated` to the import):

```ts
describe("pathForAvatarGenerated", () => {
  it("keeps generated images apart from uploads, per slot", () => {
    const path = pathForAvatarGenerated({ clientId: "c1", avatarId: "a1", slot: "front", ext: "png" });
    expect(path.startsWith("clients/c1/avatars/a1/generated/front/")).toBe(true);
    expect(path.endsWith(".png")).toBe(true);
    expect(pathForAvatarGenerated({ clientId: "c1", avatarId: "a1", slot: "sheet", ext: "jpg" }))
      .toContain("/generated/sheet/");
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/lib/avatars/__tests__/rows.test.ts src/lib/storage/paths.test.ts`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 4: Write the mappers**

Append to `src/lib/avatars/rows.ts` (add `AvatarCandidate` to the type import from `./schema`, and `import type { GenerationRow } from "@/lib/db/types";`):

```ts
// ── Generations → avatar images (plan 2) ──────────────────────────────────────

type GenerationInputs = { slot?: string; prompt?: string; batchId?: string | null; referenceUrls?: unknown[] };
type GenerationMeta = { width?: number | null; height?: number | null; sizeBytes?: number };

/** A succeeded avatar generation as an image whose source records how it was made (D289). */
export function generationToImage(row: GenerationRow): AvatarImage | null {
  if (row.status !== "succeeded" || !row.output_snapshot) return null;
  const inputs = (row.inputs_snapshot ?? {}) as GenerationInputs;
  const meta = (row.meta ?? {}) as GenerationMeta;
  return {
    url: row.output_snapshot,
    width: meta.width ?? null,
    height: meta.height ?? null,
    sizeBytes: meta.sizeBytes ?? 0,
    source: {
      kind: "generated",
      modelId: row.model_used ?? "",
      mode: (inputs.referenceUrls?.length ?? 0) > 0 ? "edit" : "text",
      prompt: inputs.prompt ?? "",
      generatedAt: row.created_at,
      generationId: row.id,
      // runAvatarGeneration stores the provider's bytes as they arrive.
      untouched: true,
    },
  };
}

/** A succeeded FRONT generation as something the operator can pick. */
export function generationToCandidate(row: GenerationRow): AvatarCandidate | null {
  const inputs = (row.inputs_snapshot ?? {}) as GenerationInputs;
  if (inputs.slot !== "front") return null;
  const image = generationToImage(row);
  if (!image) return null;
  return {
    generationId: row.id,
    batchId: inputs.batchId ?? null,
    url: image.url,
    modelId: row.model_used ?? "",
    createdAt: row.created_at,
    width: image.width,
    height: image.height,
    sizeBytes: image.sizeBytes,
  };
}
```

- [ ] **Step 5: Add the storage path and upload**

In `src/lib/storage/paths.ts`, add after `pathForAvatarImage`:

```ts
/** Where a Studio-generated avatar image lives — under `generated/`, apart from uploads, so
 *  the upload finalize route's prefix check can never be satisfied by a generated object. */
export function pathForAvatarGenerated(args: {
  clientId: string;
  avatarId: string;
  slot: AvatarImageSlot;
  ext: string;
}): string {
  const name = buildStoredName(undefined, { slug: "output", ext: args.ext });
  return `clients/${args.clientId}/avatars/${args.avatarId}/generated/${args.slot}/${name}`;
}
```

In `src/lib/storage/index.ts`, add `pathForAvatarGenerated` to the import from `./paths`, and add after `signAvatarImageUpload`:

```ts
// Stores a generated avatar image exactly as the provider returned it (no re-encode).
export async function uploadAvatarGenerated(args: {
  clientId: string;
  avatarId: string;
  slot: AvatarImageSlot;
  ext: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const path = pathForAvatarGenerated({
    clientId: args.clientId,
    avatarId: args.avatarId,
    slot: args.slot,
    ext: args.ext,
  });
  return _upload(path, args.body, args.contentType);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/avatars src/lib/storage/paths.test.ts`
Expected: PASS, including the 6 new tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/avatars/schema.ts src/lib/avatars/rows.ts src/lib/avatars/__tests__/rows.test.ts src/lib/storage/paths.ts src/lib/storage/index.ts src/lib/storage/paths.test.ts
git commit -m "feat(avatars): candidates read from generations; storage for generated images

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The generation runner

**Files:**
- Create: `src/lib/avatars/generate.ts`
- Test: `src/lib/avatars/__tests__/generate.test.ts`

**Interfaces:**
- Consumes: `insertGeneration`, `succeedGeneration`, `failGeneration` (Task 1); `avatarImageParams`, `estimateAvatarImageCostUsd` (Task 2); `uploadAvatarGenerated` (Task 3); `imageGenRegistry`; `reserveCredits`, `settleGeneration`, `refundReservation`, `CreditLimitError`; `computeImageCost`; `usdToFinalCredits`; `extForContentType`.
- Produces: `runAvatarGeneration(args): Promise<{ generation: GenerationRow; creditsCharged: number }>` where

  ```ts
  args = {
    clientId: string; avatarId: string; orgId: string;
    userId: string; userEmail: string | null;
    slot: "front" | "sheet";
    modelId: string; aspect: string;
    prompt: string; referenceUrls: string[];
    batchId: string | null;
  }
  ```

  `generation` is the row **as it stands after success** (status `succeeded`, `output_snapshot`, `meta`, `credits_charged` set), so callers can pass it to `generationToImage` / `generationToCandidate`. Throws `CreditLimitError` when the cap refuses, and `Error` for an unknown model, a missing estimate or a provider failure — having already failed the generation and refunded the reservation.

- [ ] **Step 1: Write the failing test**

`src/lib/avatars/__tests__/generate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const generate = vi.fn();
vi.mock("@/lib/image-gen/registry", () => ({
  imageGenRegistry: {
    "seedream:seedream-5-0-lite": {
      schema: { safeParse: (p: unknown) => ({ success: true, data: p }) },
      generate: (...a: unknown[]) => generate(...a),
    },
  },
}));
vi.mock("@/lib/db/generations", () => ({
  insertGeneration: vi.fn(), succeedGeneration: vi.fn(), failGeneration: vi.fn(),
}));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { reserveCredits: vi.fn(), settleGeneration: vi.fn(), refundReservation: vi.fn(), CreditLimitError };
});
vi.mock("@/lib/storage", () => ({ uploadAvatarGenerated: vi.fn() }));
vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({ width: 1536, height: 2048 }) }) }));

import { runAvatarGeneration } from "../generate";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import {
  reserveCredits, settleGeneration, refundReservation, CreditLimitError,
} from "@/lib/db/credit-transactions";
import { uploadAvatarGenerated } from "@/lib/storage";

const args = {
  clientId: "c1", avatarId: "a1", orgId: "org-1", userId: "user-1", userEmail: "op@x.com",
  slot: "front" as const, modelId: "seedream:seedream-5-0-lite", aspect: "3:4",
  prompt: "A chef.", referenceUrls: [], batchId: "b1",
};
const BYTES = Buffer.from("png-bytes");

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(insertGeneration).mockResolvedValue({
    id: "g1", created_at: "2026-09-30T10:00:00.000Z", status: "running",
    model_used: args.modelId, inputs_snapshot: {}, meta: { email: "op@x.com" },
  } as never);
  vi.mocked(reserveCredits).mockResolvedValue({ ok: true });
  vi.mocked(uploadAvatarGenerated).mockResolvedValue({ url: "https://storage.googleapis.com/b/x.png", path: "x.png" });
  generate.mockResolvedValue({
    imageBase64: BYTES.toString("base64"), mimeType: "image/png",
    tokensUsed: { text_input_tokens: 0, image_input_tokens: 0, image_output_tokens: 0, total_tokens: 0 },
    costUsd: 0.035,
  });
});

describe("runAvatarGeneration", () => {
  it("reserves the estimate, stores the provider's bytes unchanged, and settles the real cost", async () => {
    const out = await runAvatarGeneration(args);

    expect(insertGeneration).toHaveBeenCalledWith(expect.objectContaining({
      avatarId: "a1", orgId: "org-1", clientId: "c1", type: "image", modelUsed: args.modelId,
      inputsSnapshot: { slot: "front", prompt: "A chef.", batchId: "b1", referenceUrls: [] },
    }));
    expect(reserveCredits).toHaveBeenCalledWith("org-1", "g1", 35);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "A chef.", referenceUrls: [], params: expect.objectContaining({ aspect_ratio: "3:4" }),
    }));
    const upload = vi.mocked(uploadAvatarGenerated).mock.calls[0][0];
    expect(Buffer.compare(upload.body as Buffer, BYTES)).toBe(0);
    expect(upload).toMatchObject({ clientId: "c1", avatarId: "a1", slot: "front", ext: "png" });
    expect(settleGeneration).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1", actualAmount: 35 });
    expect(succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({
      generationId: "g1", creditsCharged: 35, costUsd: 0.035,
      outputSnapshot: "https://storage.googleapis.com/b/x.png",
      meta: { email: "op@x.com", width: 1536, height: 2048, sizeBytes: BYTES.length },
    }));
    expect(refundReservation).not.toHaveBeenCalled();

    expect(out.creditsCharged).toBe(35);
    expect(out.generation).toMatchObject({
      id: "g1", status: "succeeded", credits_charged: 35,
      output_snapshot: "https://storage.googleapis.com/b/x.png",
      inputs_snapshot: { slot: "front", prompt: "A chef.", batchId: "b1", referenceUrls: [] },
    });
  });

  it("refuses at the cap without calling the provider, and refunds nothing it did not take", async () => {
    vi.mocked(reserveCredits).mockResolvedValue({ ok: false });
    await expect(runAvatarGeneration(args)).rejects.toBeInstanceOf(CreditLimitError);
    expect(generate).not.toHaveBeenCalled();
    expect(failGeneration).toHaveBeenCalledWith(expect.objectContaining({ generationId: "g1" }));
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });

  it("fails the generation and refunds when the provider throws", async () => {
    generate.mockRejectedValue(new Error("Content blocked"));
    await expect(runAvatarGeneration(args)).rejects.toThrow("Content blocked");
    expect(failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: "Content blocked" });
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
    expect(settleGeneration).not.toHaveBeenCalled();
  });

  it("rejects an unknown model before creating a generation", async () => {
    await expect(runAvatarGeneration({ ...args, modelId: "nope:none" })).rejects.toThrow(/Unknown model/);
    expect(insertGeneration).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/avatars/__tests__/generate.test.ts`
Expected: FAIL — cannot resolve `../generate`.

- [ ] **Step 3: Write the runner**

`src/lib/avatars/generate.ts`:

```ts
import "server-only";
import sharp from "sharp";
import { imageGenRegistry } from "@/lib/image-gen/registry";
import { computeImageCost } from "@/lib/image-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import {
  reserveCredits, settleGeneration, refundReservation, CreditLimitError,
} from "@/lib/db/credit-transactions";
import { uploadAvatarGenerated } from "@/lib/storage";
import { extForContentType } from "@/lib/storage/paths";
import type { GenerationRow } from "@/lib/db/types";
import type { AvatarImageSlot } from "./schema";
import { avatarImageParams, estimateAvatarImageCostUsd } from "./generation";

export type AvatarGenerationArgs = {
  clientId: string;
  avatarId: string;
  orgId: string;
  userId: string;
  userEmail: string | null;
  slot: AvatarImageSlot;
  modelId: string;
  aspect: string;
  prompt: string;
  referenceUrls: string[];
  batchId: string | null;
};

// D291 — one avatar image, billed through the same ledger as every canvas generation:
// reserve the estimate, run the provider, store its bytes untouched, then settle the real
// cost — or fail the generation and refund on any error. The same order and the same
// fail-closed rule (no estimate, no generation) as image-generate/route.ts.
export async function runAvatarGeneration(
  args: AvatarGenerationArgs,
): Promise<{ generation: GenerationRow; creditsCharged: number }> {
  const config = imageGenRegistry[args.modelId];
  const params = avatarImageParams(args.modelId, args.aspect);
  if (!config || !params) throw new Error(`Unknown model: ${args.modelId}`);
  const parsed = config.schema.safeParse(params);
  if (!parsed.success) throw new Error(`Invalid params for ${args.modelId}.`);
  const validatedParams = parsed.data as Record<string, unknown>;

  const inputsSnapshot = {
    slot: args.slot,
    prompt: args.prompt,
    batchId: args.batchId,
    referenceUrls: args.referenceUrls,
  };
  const generation = await insertGeneration({
    avatarId: args.avatarId,
    orgId: args.orgId,
    clientId: args.clientId,
    userId: args.userId,
    userEmail: args.userEmail,
    type: "image",
    modelUsed: args.modelId,
    paramsSnapshot: validatedParams,
    inputsSnapshot,
  });

  try {
    const estimateUsd = estimateAvatarImageCostUsd({
      modelId: args.modelId,
      aspect: args.aspect,
      referenceCount: args.referenceUrls.length,
    });
    if (estimateUsd === null) {
      throw new Error(`No cost estimate available for ${args.modelId}.`);
    }
    const reservation = await reserveCredits(args.orgId, generation.id, usdToFinalCredits(estimateUsd));
    if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");

    const result = await config.generate({
      prompt: args.prompt,
      referenceUrls: args.referenceUrls,
      params: validatedParams,
    });

    // The provider's bytes, as they arrived: no resize, no re-encode.
    const bytes = Buffer.from(result.imageBase64, "base64");
    const { url } = await uploadAvatarGenerated({
      clientId: args.clientId,
      avatarId: args.avatarId,
      slot: args.slot,
      ext: extForContentType(result.mimeType),
      body: bytes,
      contentType: result.mimeType,
    });

    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(bytes).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      // best-effort — dimensions are display-only
    }

    // A provider billed per image (Seedream) reports its exact charge; token-billed ones don't.
    const cost =
      result.costUsd !== undefined
        ? { usd: result.costUsd }
        : result.tokensUsed
          ? computeImageCost(args.modelId, result.tokensUsed)
          : null;
    const creditsCharged = cost ? usdToFinalCredits(cost.usd) : 0;
    const meta = {
      ...(args.userEmail ? { email: args.userEmail } : {}),
      width,
      height,
      sizeBytes: bytes.length,
    };

    await settleGeneration({ orgId: args.orgId, generationId: generation.id, actualAmount: creditsCharged });
    await succeedGeneration({
      generationId: generation.id,
      costUsd: cost?.usd,
      creditsCharged,
      tokensUsed: { ...result.tokensUsed },
      outputSnapshot: url,
      meta,
    });

    return {
      creditsCharged,
      generation: {
        ...generation,
        status: "succeeded",
        inputs_snapshot: inputsSnapshot,
        output_snapshot: url,
        cost_usd: cost?.usd ?? null,
        credits_charged: creditsCharged,
        meta,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Image generation failed";
    await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
    await refundReservation({ orgId: args.orgId, generationId: generation.id }).catch(() => null);
    throw e;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/avatars/__tests__/generate.test.ts`
Expected: PASS, 4 tests. If `extForContentType("image/png")` does not return `"png"`, read `MEDIA_EXT_BY_TYPE` in `src/lib/storage/paths.ts`; if image types are missing from that map, add `image/png → png`, `image/jpeg → jpg`, `image/webp → webp` there (with a test in `paths.test.ts`) rather than mapping locally.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/avatars/generate.ts src/lib/avatars/__tests__/generate.test.ts
git commit -m "feat(avatars): generation runner — reserve, generate, store, settle or refund (D291)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Routes — generate a candidate, pick the front, generate the sheet

**Files:**
- Create: `src/app/api/clients/[id]/avatars/[avatarId]/generations/route.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/front/route.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/sheet/route.ts`
- Test: one `route.test.ts` beside each

**Interfaces:**
- Consumes: `runAvatarGeneration` (Task 4); `getAvatarGeneration`, `listAvatarGenerations`, `sumAvatarCredits` (Task 1); `generationToCandidate`, `generationToImage` (Task 3); prompts and constants (Task 2); plan 1's `getAvatar`, `updateAvatar`, `frontChangePatch`, `sheetChangePatch`, `withStatus`; `CreditLimitError`; `CREDIT_LIMIT_TOAST_MESSAGE`.
- Produces:
  - `GET  …/avatars/:avatarId/generations` → `200 { candidates: AvatarCandidate[], spentCredits: number }`
  - `POST …/avatars/:avatarId/generations` body `{ description, attributes?, styleId, modelId, batchId }` → `201 { candidate: AvatarCandidate, creditsCharged: number }` | `400` | `402` | `404` | `500`
  - `POST …/avatars/:avatarId/front` body `{ generationId }` → `200 { avatar }` | `400` | `404`
  - `POST …/avatars/:avatarId/sheet` body `{ modelId }` → `200 { avatar, creditsCharged }` | `400` | `402` | `404` | `500`
- All three export `export const maxDuration = 300;` — one image can take over a minute on some models, and the default function limit is shorter. (Read the Next 16 route segment config guide under `node_modules/next/dist/docs/01-app/` to confirm the export name before using it.)

- [ ] **Step 1: Write the failing test for the generations route**

`src/app/api/clients/[id]/avatars/[avatarId]/generations/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";
import { AVATAR_FRAMING_CLAUSE } from "@/lib/avatars/constants";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn() }));
vi.mock("@/lib/db/generations", () => ({ listAvatarGenerations: vi.fn(), sumAvatarCredits: vi.fn() }));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { CreditLimitError };
});
vi.mock("@/lib/avatars/generate", () => ({ runAvatarGeneration: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar } from "@/lib/db/avatars";
import { listAvatarGenerations, sumAvatarCredits } from "@/lib/db/generations";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { runAvatarGeneration } from "@/lib/avatars/generate";

const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const url = "http://localhost/api/clients/c1/avatars/a1/generations";
const post = (body: unknown) =>
  new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const row = {
  id: "g1", status: "succeeded", model_used: "seedream:seedream-5-0-lite",
  inputs_snapshot: { slot: "front", prompt: "p", batchId: "b1", referenceUrls: [] },
  output_snapshot: "https://storage.googleapis.com/b/x.png", meta: { width: 1, height: 2, sizeBytes: 3 },
  created_at: "2026-09-30T10:00:00.000Z",
};
const body = {
  description: "A chef.", attributes: { gender: "Male" }, styleId: "photoreal",
  modelId: "seedream:seedream-5-0-lite", batchId: "b1",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-9", email: "op@x.com", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ status: "draft" }));
  vi.mocked(runAvatarGeneration).mockResolvedValue({ generation: row as never, creditsCharged: 35 });
});

describe("GET generations", () => {
  it("returns only front candidates, and the credits spent on this avatar", async () => {
    vi.mocked(listAvatarGenerations).mockResolvedValue([
      row,
      { ...row, id: "g2", inputs_snapshot: { slot: "sheet", prompt: "p", batchId: null, referenceUrls: ["u"] } },
      { ...row, id: "g3", status: "failed", output_snapshot: null },
    ] as never);
    vi.mocked(sumAvatarCredits).mockResolvedValue(95);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(url), { params });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.candidates.map((c: { generationId: string }) => c.generationId)).toEqual(["g1"]);
    expect(json.spentCredits).toBe(95);
  });

  it("is a 404 for an avatar the client does not own", async () => {
    vi.mocked(getAvatar).mockResolvedValue(null);
    const { GET } = await import("./route");
    expect((await GET(new NextRequest(url), { params })).status).toBe(404);
    expect(listAvatarGenerations).not.toHaveBeenCalled();
  });
});

describe("POST generations", () => {
  it("generates one front candidate with the framing the operator cannot remove", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(body), { params });
    expect(res.status).toBe(201);
    const call = vi.mocked(runAvatarGeneration).mock.calls[0][0];
    expect(call).toMatchObject({
      clientId: "c1", avatarId: "a1", orgId: "org-1", userId: "user-9", userEmail: "op@x.com",
      slot: "front", modelId: "seedream:seedream-5-0-lite", aspect: "3:4", referenceUrls: [], batchId: "b1",
    });
    expect(call.prompt.startsWith("A chef.")).toBe(true);
    expect(call.prompt.endsWith(AVATAR_FRAMING_CLAUSE)).toBe(true);
    const json = await res.json();
    expect(json.candidate.generationId).toBe("g1");
    expect(json.creditsCharged).toBe(35);
  });

  it("rejects an empty description and an unknown style before spending anything", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ ...body, description: "  " }), { params })).status).toBe(400);
    expect((await POST(post({ ...body, styleId: "oil-painting" }), { params })).status).toBe(400);
    expect(runAvatarGeneration).not.toHaveBeenCalled();
  });

  it("is a 404 for an archived avatar", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ archivedAt: "2026-10-01T00:00:00.000Z" }));
    const { POST } = await import("./route");
    expect((await POST(post(body), { params })).status).toBe(404);
    expect(runAvatarGeneration).not.toHaveBeenCalled();
  });

  it("answers 402 with the actionable message at the credit cap", async () => {
    vi.mocked(runAvatarGeneration).mockRejectedValue(new CreditLimitError("Monthly credit limit reached"));
    const { POST } = await import("./route");
    const res = await POST(post(body), { params });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/Monthly credit limit reached\. Contact your admin/);
  });

  it("passes a provider failure through as a 500 with its message", async () => {
    vi.mocked(runAvatarGeneration).mockRejectedValue(new Error("Content blocked"));
    const { POST } = await import("./route");
    const res = await POST(post(body), { params });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Content blocked");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/app/api/clients/[id]/avatars/[avatarId]/generations"`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write the generations route**

`src/app/api/clients/[id]/avatars/[avatarId]/generations/route.ts`:

```ts
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getAvatar } from "@/lib/db/avatars";
import { listAvatarGenerations, sumAvatarCredits } from "@/lib/db/generations";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { runAvatarGeneration } from "@/lib/avatars/generate";
import { buildAvatarFrontPrompt } from "@/lib/avatars/generation";
import { generationToCandidate } from "@/lib/avatars/rows";
import {
  AVATAR_DESCRIPTION_MAX, AVATAR_FRONT_ASPECT, AVATAR_STYLES,
} from "@/lib/avatars/constants";
import type { AvatarCandidate } from "@/lib/avatars/schema";

// One image can take over a minute on some models.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; avatarId: string }> };

const STYLE_IDS = AVATAR_STYLES.map((s) => s.id) as [string, ...string[]];

const GenerateSchema = z.object({
  description: z.string().trim().min(1).max(AVATAR_DESCRIPTION_MAX),
  attributes: z
    .object({ gender: z.string().max(40), age: z.string().max(40), ethnicity: z.string().max(40) })
    .partial()
    .optional(),
  styleId: z.enum(STYLE_IDS),
  modelId: z.string().min(1),
  // Groups the images of one Generate click. Minted in the browser, so a batch is known
  // before its first image returns.
  batchId: z.string().min(1).max(64),
});

// GET …/generations — the front candidates generated so far, newest first, and what this
// avatar's images have cost (the ledger's settled amounts, not an estimate).
export async function GET(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the generated images.", async () => {
      const avatar = await getAvatar(clientId, avatarId);
      if (!avatar) return apiError("Avatar not found.", 404);
      const [rows, spentCredits] = await Promise.all([
        listAvatarGenerations(avatarId),
        sumAvatarCredits(avatarId),
      ]);
      const candidates = rows
        .map(generationToCandidate)
        .filter((c): c is AvatarCandidate => c !== null);
      return apiOk({ candidates, spentCredits });
    }),
  );
}

// POST …/generations — generate ONE front candidate. The browser sends one request per image
// in a batch, so each image has its own reservation, its own failure, and its own placeholder.
export async function POST(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId, client) => {
    const parsed = GenerateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Describe the character and choose a style and model.", 400);
    const { description, attributes, styleId, modelId, batchId } = parsed.data;

    const avatar = await getAvatar(clientId, avatarId);
    if (!avatar || avatar.archivedAt) return apiError("Avatar not found.", 404);

    const caller = await resolveCallerContext();
    try {
      const { generation, creditsCharged } = await runAvatarGeneration({
        clientId,
        avatarId,
        orgId: client.org_id,
        userId: caller.userId,
        userEmail: caller.email,
        slot: "front",
        modelId,
        aspect: AVATAR_FRONT_ASPECT,
        prompt: buildAvatarFrontPrompt({
          description,
          attributes: attributes ?? {},
          styleId: styleId as (typeof AVATAR_STYLES)[number]["id"],
        }),
        referenceUrls: [],
        batchId,
      });
      const candidate = generationToCandidate(generation);
      if (!candidate) return apiError("The image was generated but could not be read back.", 500);
      return apiOk({ candidate, creditsCharged }, 201);
    } catch (e) {
      if (e instanceof CreditLimitError) return apiError(CREDIT_LIMIT_TOAST_MESSAGE, 402);
      return apiError(e instanceof Error ? e.message : "Image generation failed", 500);
    }
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run "src/app/api/clients/[id]/avatars/[avatarId]/generations"`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing test for the front route**

`src/app/api/clients/[id]/avatars/[avatarId]/front/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn(), updateAvatar: vi.fn() }));
vi.mock("@/lib/db/generations", () => ({ getAvatarGeneration: vi.fn() }));
vi.mock("@/lib/storage", () => ({ removeObject: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { getAvatarGeneration } from "@/lib/db/generations";
import { removeObject } from "@/lib/storage";

const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/clients/c1/avatars/a1/front", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const row = {
  id: "g1", avatar_id: "a1", status: "succeeded", model_used: "seedream:seedream-5-0-lite",
  inputs_snapshot: { slot: "front", prompt: "A chef.", batchId: "b1", referenceUrls: [] },
  output_snapshot: "https://storage.googleapis.com/b/gen.png", meta: { width: 1, height: 2, sizeBytes: 3 },
  created_at: "2026-09-30T10:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar());
  vi.mocked(getAvatarGeneration).mockResolvedValue(row as never);
  vi.mocked(updateAvatar).mockImplementation(async (_c, _a, p) => makeAvatar(p));
});

describe("POST front", () => {
  it("a generated front makes the avatar generic, clears consent, stales the sheet and returns to draft", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ generationId: "g1" }), { params });
    expect(res.status).toBe(200);
    expect(getAvatarGeneration).toHaveBeenCalledWith("a1", "g1");
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.front?.source).toMatchObject({ kind: "generated", generationId: "g1", mode: "text" });
    expect(patch).toMatchObject({
      personType: "generic", likenessConsentBy: null, likenessConsentAt: null,
      sheetStale: true, status: "draft",
    });
  });

  it("removes the uploaded photo it replaces", async () => {
    const { POST } = await import("./route");
    await POST(post({ generationId: "g1" }), { params });
    expect(removeObject).toHaveBeenCalledTimes(1);
  });

  it("is a 404 for a generation of another avatar, and a 400 for a sheet or failed one", async () => {
    const { POST } = await import("./route");
    vi.mocked(getAvatarGeneration).mockResolvedValue(null);
    expect((await POST(post({ generationId: "g9" }), { params })).status).toBe(404);

    vi.mocked(getAvatarGeneration).mockResolvedValue({
      ...row, inputs_snapshot: { slot: "sheet", prompt: "p", batchId: null, referenceUrls: ["u"] },
    } as never);
    expect((await POST(post({ generationId: "g1" }), { params })).status).toBe(400);

    vi.mocked(getAvatarGeneration).mockResolvedValue({ ...row, status: "failed", output_snapshot: null } as never);
    expect((await POST(post({ generationId: "g1" }), { params })).status).toBe(400);
    expect(updateAvatar).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run it to verify it fails, then write the front route**

Run: `npx vitest run "src/app/api/clients/[id]/avatars/[avatarId]/front"` → FAIL, cannot resolve `./route`.

`src/app/api/clients/[id]/avatars/[avatarId]/front/route.ts`:

```ts
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { getAvatarGeneration } from "@/lib/db/generations";
import { removeObject } from "@/lib/storage";
import { generationToCandidate, generationToImage } from "@/lib/avatars/rows";
import { frontChangePatch, withStatus } from "@/lib/avatars/utils";

const PickSchema = z.object({ generationId: z.string().min(1) });

// POST …/front — make a generated candidate the avatar's front image. The image is looked up
// from the avatar's own generations, never taken as a URL from the browser.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not set the front image.", async () => {
      const parsed = PickSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Invalid request body.", 400);

      const current = await getAvatar(clientId, avatarId);
      if (!current || current.archivedAt) return apiError("Avatar not found.", 404);

      // Scoped to this avatar: another avatar's generation is a 404, never confirmed to exist.
      const generation = await getAvatarGeneration(avatarId, parsed.data.generationId);
      if (!generation) return apiError("Generated image not found.", 404);
      const image = generationToCandidate(generation) ? generationToImage(generation) : null;
      if (!image) return apiError("That image cannot be used as a front image.", 400);

      // frontChangePatch makes the avatar generic, clears consent and stales the sheet.
      const avatar = await updateAvatar(
        clientId,
        avatarId,
        withStatus(current, frontChangePatch(current, image)),
      );
      if (!avatar) return apiError("Avatar not found.", 404);

      // An uploaded photo it replaces is removed; a generated one stays — its batch still shows it.
      const replaced = current.front;
      if (replaced?.source.kind === "upload" && replaced.url !== image.url) {
        try {
          await removeObject(replaced.url);
        } catch {
          // Best-effort, as the upload finalize route.
        }
      }
      return apiOk({ avatar });
    }),
  );
}
```

Run: `npx vitest run "src/app/api/clients/[id]/avatars/[avatarId]/front"` → PASS, 3 tests.

- [ ] **Step 7: Write the failing test for the sheet route**

`src/app/api/clients/[id]/avatars/[avatarId]/sheet/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn(), updateAvatar: vi.fn() }));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { CreditLimitError };
});
vi.mock("@/lib/avatars/generate", () => ({ runAvatarGeneration: vi.fn() }));
vi.mock("@/lib/storage", () => ({ removeObject: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { runAvatarGeneration } from "@/lib/avatars/generate";
import { removeObject } from "@/lib/storage";

const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/clients/c1/avatars/a1/sheet", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const row = {
  id: "g5", status: "succeeded", model_used: "gemini:gemini-3-pro-image",
  inputs_snapshot: { slot: "sheet", prompt: "sheet", batchId: null, referenceUrls: ["front-url"] },
  output_snapshot: "https://storage.googleapis.com/b/sheet.png", meta: { width: 16, height: 9, sizeBytes: 3 },
  created_at: "2026-09-30T10:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-9", email: "op@x.com", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ sheetStale: true, status: "draft" }));
  vi.mocked(runAvatarGeneration).mockResolvedValue({ generation: row as never, creditsCharged: 40 });
  vi.mocked(updateAvatar).mockImplementation(async (_c, _a, p) => makeAvatar(p));
});

describe("POST sheet", () => {
  it("generates the sheet from the front image and makes it current", async () => {
    const front = makeAvatar().front!;
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: "gemini:gemini-3-pro-image" }), { params });
    expect(res.status).toBe(200);
    expect(vi.mocked(runAvatarGeneration).mock.calls[0][0]).toMatchObject({
      slot: "sheet", aspect: "16:9", modelId: "gemini:gemini-3-pro-image",
      referenceUrls: [front.url], batchId: null, userId: "user-9",
    });
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.sheet?.source).toMatchObject({ kind: "generated", mode: "edit", generationId: "g5" });
    expect(patch.sheetStale).toBe(false);
    expect((await res.json()).creditsCharged).toBe(40);
  });

  it("removes an uploaded sheet it replaces", async () => {
    const { POST } = await import("./route");
    await POST(post({ modelId: "gemini:gemini-3-pro-image" }), { params });
    expect(removeObject).toHaveBeenCalledTimes(1);
  });

  it("needs a front image first", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ front: null, sheet: null, status: "draft" }));
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: "gemini:gemini-3-pro-image" }), { params });
    expect(res.status).toBe(400);
    expect(runAvatarGeneration).not.toHaveBeenCalled();
  });

  it("answers 402 at the credit cap and leaves the avatar alone", async () => {
    vi.mocked(runAvatarGeneration).mockRejectedValue(new CreditLimitError("Monthly credit limit reached"));
    const { POST } = await import("./route");
    expect((await POST(post({ modelId: "gemini:gemini-3-pro-image" }), { params })).status).toBe(402);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("refuses when the front image changed while the sheet was generating", async () => {
    const before = makeAvatar({ sheetStale: true, status: "draft" });
    const after = makeAvatar({
      status: "draft",
      front: { ...before.front!, url: "https://storage.googleapis.com/b/other.png" },
    });
    vi.mocked(getAvatar).mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: "gemini:gemini-3-pro-image" }), { params });
    expect(res.status).toBe(409);
    expect(updateAvatar).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run it to verify it fails, then write the sheet route**

Run: `npx vitest run "src/app/api/clients/[id]/avatars/[avatarId]/sheet"` → FAIL, cannot resolve `./route`.

`src/app/api/clients/[id]/avatars/[avatarId]/sheet/route.ts`:

```ts
import { z } from "zod";
import { apiError, apiOk, withClient } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { removeObject } from "@/lib/storage";
import { runAvatarGeneration } from "@/lib/avatars/generate";
import { buildAvatarSheetPrompt } from "@/lib/avatars/generation";
import { generationToImage } from "@/lib/avatars/rows";
import { sheetChangePatch, withStatus } from "@/lib/avatars/utils";
import { AVATAR_SHEET_ASPECT } from "@/lib/avatars/constants";

// One image can take over a minute on some models.
export const maxDuration = 300;

const SheetSchema = z.object({ modelId: z.string().min(1) });

// POST …/sheet — generate the profile sheet FROM the front image (D288) and make it current.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId, client) => {
    const parsed = SheetSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Choose a model.", 400);

    const current = await getAvatar(clientId, avatarId);
    if (!current || current.archivedAt) return apiError("Avatar not found.", 404);
    if (!current.front) return apiError("Add a front image before generating the profile sheet.", 400);
    const frontUrl = current.front.url;

    const caller = await resolveCallerContext();
    try {
      const { generation, creditsCharged } = await runAvatarGeneration({
        clientId,
        avatarId,
        orgId: client.org_id,
        userId: caller.userId,
        userEmail: caller.email,
        slot: "sheet",
        modelId: parsed.data.modelId,
        aspect: AVATAR_SHEET_ASPECT,
        prompt: buildAvatarSheetPrompt(),
        referenceUrls: [frontUrl],
        batchId: null,
      });
      const image = generationToImage(generation);
      if (!image) return apiError("The sheet was generated but could not be read back.", 500);

      // Generation takes a while. If the front was replaced meanwhile, this sheet shows the
      // wrong person: do not attach it. (The credits are spent; the image stays in storage.)
      const latest = await getAvatar(clientId, avatarId);
      if (!latest || latest.archivedAt) return apiError("Avatar not found.", 404);
      if (latest.front?.url !== frontUrl) {
        return apiError("The front image changed while the sheet was generating. Generate it again.", 409);
      }

      const avatar = await updateAvatar(clientId, avatarId, withStatus(latest, sheetChangePatch(image)));
      if (!avatar) return apiError("Avatar not found.", 404);

      const replaced = latest.sheet;
      if (replaced?.source.kind === "upload" && replaced.url !== image.url) {
        try {
          await removeObject(replaced.url);
        } catch {
          // Best-effort, as the upload finalize route.
        }
      }
      return apiOk({ avatar, creditsCharged });
    } catch (e) {
      if (e instanceof CreditLimitError) return apiError(CREDIT_LIMIT_TOAST_MESSAGE, 402);
      return apiError(e instanceof Error ? e.message : "Image generation failed", 500);
    }
  });
}
```

- [ ] **Step 9: Run all avatar route tests, typecheck, commit**

Run: `npx vitest run "src/app/api/clients/[id]/avatars" && npx tsc --noEmit`
Expected: PASS (the 15 new tests plus plan 1's), no type errors.

```bash
git add "src/app/api/clients/[id]/avatars/[avatarId]/generations" "src/app/api/clients/[id]/avatars/[avatarId]/front" "src/app/api/clients/[id]/avatars/[avatarId]/sheet"
git commit -m "feat(avatars): routes to generate candidates, pick the front and generate the sheet (D288, D291)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Batches, the engine note, the service and the generation hook

**Files:**
- Modify: `src/lib/avatars/generation.ts` (append), `src/lib/avatars/__tests__/generation.test.ts` (append), `src/services/avatars.service.ts`, `src/hooks/use-avatar-studio.ts`
- Create: `src/hooks/use-avatar-generation.ts`

**Interfaces:**
- Consumes: Task 5's routes; `AvatarCandidate` (Task 3); constants (Task 2).
- Produces, from `generation.ts`:
  - `PendingCandidate = { key: string; batchId: string; modelId: string }`
  - `CandidateBatch = { batchId: string; modelId: string; createdAt: string | null; candidates: AvatarCandidate[]; pendingCount: number }`
  - `mergeCandidates(current, incoming): AvatarCandidate[]` — de-duplicated by `generationId`, newest first
  - `groupCandidatesByBatch(candidates, pending): CandidateBatch[]` — newest batch first; a batch still generating sorts first
  - `avatarEngineNote(avatar: Pick<Avatar, "front" | "personType">): string | null`
- Produces, from the service: `listGenerations`, `generateFront`, `pickFront`, `generateSheet`.
- Produces, from `useAvatarStudio`: two more returned members — `ensureAvatar(): Promise<Avatar>` and `replaceAvatar(avatar: Avatar): void`.
- Produces: `useAvatarGeneration({ clientId, avatarId, ensureAvatar, onAvatar })` → `{ candidates, pending, spentCredits, picking, generatingSheet, generate, pickFront, generateSheet }` and the type `GenerateFrontInput = { description: string; attributes: AvatarAttributes; styleId: AvatarStyleId; modelId: string; count: number }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/avatars/__tests__/generation.test.ts` (add `avatarEngineNote`, `groupCandidatesByBatch`, `mergeCandidates` to the import from `../generation`; add `import { GENERATED, makeAvatar, makeImage } from "./fixtures";` and `import type { AvatarCandidate } from "../schema";`):

```ts
const cand = (over: Partial<AvatarCandidate>): AvatarCandidate => ({
  generationId: "g1", batchId: "b1", url: "u1", modelId: SEEDANCE_FACE_MODEL_ID,
  createdAt: "2026-09-30T10:00:00.000Z", width: 3, height: 4, sizeBytes: 1, ...over,
});

describe("mergeCandidates", () => {
  it("adds new images, keeps one copy of a repeated one, newest first", () => {
    const a = cand({ generationId: "g1", createdAt: "2026-09-30T10:00:00.000Z" });
    const b = cand({ generationId: "g2", createdAt: "2026-09-30T10:05:00.000Z" });
    expect(mergeCandidates([a], [b, a]).map((c) => c.generationId)).toEqual(["g2", "g1"]);
  });
});

describe("groupCandidatesByBatch", () => {
  it("groups by batch, newest batch first, and counts images still generating", () => {
    const batches = groupCandidatesByBatch(
      [
        cand({ generationId: "g1", batchId: "old", createdAt: "2026-09-30T10:00:00.000Z" }),
        cand({ generationId: "g2", batchId: "new", createdAt: "2026-09-30T10:05:00.000Z" }),
      ],
      [{ key: "new-1", batchId: "new", modelId: SEEDANCE_FACE_MODEL_ID }],
    );
    expect(batches.map((b) => b.batchId)).toEqual(["new", "old"]);
    expect(batches[0]).toMatchObject({ pendingCount: 1, createdAt: "2026-09-30T10:05:00.000Z" });
    expect(batches[0].candidates).toHaveLength(1);
  });

  it("shows a batch that has only placeholders so far, ahead of finished ones", () => {
    const batches = groupCandidatesByBatch(
      [cand({ generationId: "g1", batchId: "old" })],
      [{ key: "p-0", batchId: "fresh", modelId: "gemini:gemini-3-pro-image" }],
    );
    expect(batches[0]).toMatchObject({
      batchId: "fresh", modelId: "gemini:gemini-3-pro-image", createdAt: null, pendingCount: 1,
    });
  });

  it("gives an image with no batch a group of its own", () => {
    const batches = groupCandidatesByBatch([cand({ generationId: "solo", batchId: null })], []);
    expect(batches).toHaveLength(1);
    expect(batches[0].candidates[0].generationId).toBe("solo");
  });
});

describe("avatarEngineNote", () => {
  it("a real person runs on Gemini Omni", () => {
    expect(avatarEngineNote(makeAvatar())).toBe("Gemini Omni · clips up to 10 s");
  });

  it("a generated Seedream face runs on Seedance", () => {
    const avatar = makeAvatar({ personType: "generic", front: makeImage(GENERATED) });
    expect(avatarEngineNote(avatar)).toBe("Seedance · clips up to 30 s");
  });

  it("a face generated on another model is called out", () => {
    const front = makeImage({ ...GENERATED, kind: "generated", modelId: "gemini:gemini-3-pro-image" });
    expect(avatarEngineNote(makeAvatar({ personType: "generic", front }))).toMatch(/Seedance will not accept/);
  });

  it("says nothing before there is a front image", () => {
    expect(avatarEngineNote(makeAvatar({ front: null, personType: null }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/avatars/__tests__/generation.test.ts`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Write the pure helpers**

Append to `src/lib/avatars/generation.ts` (add `import type { Avatar, AvatarCandidate } from "./schema";`):

```ts
// ── Batches (the Studio's candidate grid) ─────────────────────────────────────

/** A placeholder for an image still generating. */
export type PendingCandidate = { key: string; batchId: string; modelId: string };

export type CandidateBatch = {
  batchId: string;
  modelId: string;
  /** Null while the batch has produced nothing yet. */
  createdAt: string | null;
  candidates: AvatarCandidate[];
  pendingCount: number;
};

/** De-duplicated by generation, newest first — a list load and a just-finished image can both
 *  deliver the same row. */
export function mergeCandidates(
  current: AvatarCandidate[],
  incoming: AvatarCandidate[],
): AvatarCandidate[] {
  const byId = new Map<string, AvatarCandidate>();
  for (const c of [...current, ...incoming]) byId.set(c.generationId, c);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** One group per Generate click, newest first. A batch still generating sorts first so its
 *  placeholders appear where the operator is looking. */
export function groupCandidatesByBatch(
  candidates: AvatarCandidate[],
  pending: PendingCandidate[],
): CandidateBatch[] {
  const batches = new Map<string, CandidateBatch>();
  const batchFor = (batchId: string, modelId: string) => {
    let batch = batches.get(batchId);
    if (!batch) {
      batch = { batchId, modelId, createdAt: null, candidates: [], pendingCount: 0 };
      batches.set(batchId, batch);
    }
    return batch;
  };
  for (const p of pending) batchFor(p.batchId, p.modelId).pendingCount += 1;
  for (const c of candidates) {
    const batch = batchFor(c.batchId ?? c.generationId, c.modelId);
    batch.candidates.push(c);
    if (!batch.createdAt || c.createdAt > batch.createdAt) batch.createdAt = c.createdAt;
  }
  return [...batches.values()].sort((a, b) => {
    if ((a.pendingCount > 0) !== (b.pendingCount > 0)) return a.pendingCount > 0 ? -1 : 1;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

/** Which engine this avatar will run on (spec §8, D290). Derived, never stored. */
export function avatarEngineNote(avatar: Pick<Avatar, "front" | "personType">): string | null {
  if (!avatar.front || !avatar.personType) return null;
  if (avatar.personType === "specific") return "Gemini Omni · clips up to 10 s";
  const source = avatar.front.source;
  return source.kind === "generated" && isSeedanceFaceModel(source.modelId)
    ? "Seedance · clips up to 30 s"
    : "Seedance will not accept this face — generate it with Seedream 5.0 Lite";
}
```

Run: `npx vitest run src/lib/avatars/__tests__/generation.test.ts`
Expected: PASS (the 8 new tests plus Task 2's).

- [ ] **Step 4: Add the service calls**

In `src/services/avatars.service.ts`, extend the type import to
`import type { Avatar, AvatarCandidate, AvatarImageSlot } from "@/lib/avatars/schema";`, add
`import type { AvatarAttributes, AvatarStyleId } from "@/lib/avatars/constants";`, and add these methods to the class after `uploadImage`:

```ts
  async listGenerations(
    clientId: string,
    avatarId: string,
  ): Promise<{ candidates: AvatarCandidate[]; spentCredits: number }> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}/generations`);
    return readJson(res, "Could not load the generated images.");
  }

  /** ONE front candidate. The Studio calls this once per image in a batch. */
  async generateFront(
    clientId: string,
    avatarId: string,
    body: {
      description: string;
      attributes: AvatarAttributes;
      styleId: AvatarStyleId;
      modelId: string;
      batchId: string;
    },
  ): Promise<{ candidate: AvatarCandidate; creditsCharged: number }> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}/generations`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body),
    });
    return readJson(res, "Could not generate the image.");
  }

  async pickFront(clientId: string, avatarId: string, generationId: string): Promise<Avatar> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}/front`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ generationId }),
    });
    return (await readJson<{ avatar: Avatar }>(res, "Could not set the front image.")).avatar;
  }

  async generateSheet(
    clientId: string,
    avatarId: string,
    modelId: string,
  ): Promise<{ avatar: Avatar; creditsCharged: number }> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}/sheet`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ modelId }),
    });
    return readJson(res, "Could not generate the profile sheet.");
  }
```

- [ ] **Step 5: Let other hooks create the draft**

In `src/hooks/use-avatar-studio.ts` the draft is created inside `uploadImage`. Generation needs the same "create the draft on first need" step, and four parallel Generate requests must share one draft. Make these edits:

Replace the line `const createdHere = useRef(false);` with:

```ts
  // The in-flight (or finished) draft creation. Kept so concurrent callers — an upload, or the
  // four requests of one Generate click — share a single draft instead of creating one each.
  const creatingRef = useRef<Promise<Avatar> | null>(null);
```

Add, directly above `const uploadImage = useCallback(`:

```ts
  // Creates the draft the first time anything needs a row (an upload or a Generate click),
  // carrying the name and story typed so far, then moves the URL to /avatars/<id> in place.
  // Not router.replace: /new and /[avatarId] are different route segments, so that would
  // unmount and remount the Studio mid-flow. The Native History API integrates with the
  // Next.js router (app/getting-started/linking-and-navigating.md, "Native History API"), and
  // a reload still resumes this same draft.
  const ensureAvatar = useCallback((): Promise<Avatar> => {
    if (avatar) return Promise.resolve(avatar);
    creatingRef.current ??= avatarsService
      .create(clientId, { name, story })
      .then((created) => {
        setAvatar(created);
        window.history.replaceState(null, "", `${libraryHref}/${created.id}`);
        return created;
      })
      .catch((e) => {
        creatingRef.current = null;
        throw e;
      });
    return creatingRef.current;
  }, [avatar, clientId, name, story, libraryHref]);
```

Inside `uploadImage`, replace everything between `try {` and `} catch (e) {` with:

```ts
      const target = await ensureAvatar();
      setAvatar(await avatarsService.uploadImage(clientId, target.id, slot, file));
```

and change its dependency array to `[clientId, ensureAvatar]`.

Change the returned object to:

```ts
  return {
    avatar, name, story, gaps, uploading, saving, confirmingConsent,
    setName, setStory, uploadImage, markReady, archive, confirmConsent,
    ensureAvatar, replaceAvatar: setAvatar,
  };
```

- [ ] **Step 6: Write the generation hook**

`src/hooks/use-avatar-generation.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { avatarsService } from "@/services/avatars.service";
import { mergeCandidates, type PendingCandidate } from "@/lib/avatars/generation";
import type { AvatarAttributes, AvatarStyleId } from "@/lib/avatars/constants";
import type { Avatar, AvatarCandidate } from "@/lib/avatars/schema";

export type GenerateFrontInput = {
  description: string;
  attributes: AvatarAttributes;
  styleId: AvatarStyleId;
  modelId: string;
  count: number;
};

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// D288/D291 — generation state for the Avatar Studio: the front candidates, the images still
// generating, what this avatar has cost, and the two actions that change the avatar (pick a
// front, generate the sheet). One request per image, so each placeholder resolves on its own
// and one failure does not sink the batch.
export function useAvatarGeneration({
  clientId, avatarId, ensureAvatar, onAvatar,
}: {
  clientId: string;
  avatarId: string | null;
  ensureAvatar: () => Promise<Avatar>;
  onAvatar: (avatar: Avatar) => void;
}) {
  const [candidates, setCandidates] = useState<AvatarCandidate[]>([]);
  const [pending, setPending] = useState<PendingCandidate[]>([]);
  const [spentCredits, setSpentCredits] = useState(0);
  const [picking, setPicking] = useState<string | null>(null);
  const [generatingSheet, setGeneratingSheet] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // What was generated before this visit. Merged, not assigned: a draft created in this
  // session may already have results on screen when the load returns.
  useEffect(() => {
    if (!avatarId || loadedFor.current === avatarId) return;
    loadedFor.current = avatarId;
    avatarsService
      .listGenerations(clientId, avatarId)
      .then((loaded) => {
        setCandidates((prev) => mergeCandidates(prev, loaded.candidates));
        setSpentCredits((prev) => Math.max(prev, loaded.spentCredits));
      })
      .catch(() => {
        // The grid is a convenience; a failed load leaves it empty rather than blocking work.
      });
  }, [clientId, avatarId]);

  const generate = useCallback(async (input: GenerateFrontInput) => {
    let target: Avatar;
    try {
      target = await ensureAvatar();
    } catch (e) {
      toast.error(message(e, "Could not start the avatar"));
      return;
    }
    const batchId = crypto.randomUUID();
    const tiles: PendingCandidate[] = Array.from({ length: input.count }, (_, i) => ({
      key: `${batchId}-${i}`, batchId, modelId: input.modelId,
    }));
    setPending((prev) => [...tiles, ...prev]);

    // The same failure (the credit cap, a blocked prompt) usually hits every image in the
    // batch: report each distinct message once.
    const errors = new Set<string>();
    await Promise.all(tiles.map(async (tile) => {
      try {
        const { candidate, creditsCharged } = await avatarsService.generateFront(clientId, target.id, {
          description: input.description,
          attributes: input.attributes,
          styleId: input.styleId,
          modelId: input.modelId,
          batchId,
        });
        setCandidates((prev) => mergeCandidates(prev, [candidate]));
        setSpentCredits((prev) => prev + creditsCharged);
      } catch (e) {
        errors.add(message(e, "Could not generate the image"));
      } finally {
        setPending((prev) => prev.filter((p) => p.key !== tile.key));
      }
    }));
    for (const text of errors) toast.error(text);
  }, [clientId, ensureAvatar]);

  const pickFront = useCallback(async (candidate: AvatarCandidate) => {
    if (!avatarId || picking) return;
    setPicking(candidate.generationId);
    try {
      onAvatar(await avatarsService.pickFront(clientId, avatarId, candidate.generationId));
    } catch (e) {
      toast.error(message(e, "Could not set the front image"));
    } finally {
      setPicking(null);
    }
  }, [clientId, avatarId, picking, onAvatar]);

  const generateSheet = useCallback(async (modelId: string) => {
    if (!avatarId || generatingSheet) return;
    setGeneratingSheet(true);
    try {
      const { avatar, creditsCharged } = await avatarsService.generateSheet(clientId, avatarId, modelId);
      onAvatar(avatar);
      setSpentCredits((prev) => prev + creditsCharged);
    } catch (e) {
      toast.error(message(e, "Could not generate the profile sheet"));
    } finally {
      setGeneratingSheet(false);
    }
  }, [clientId, avatarId, generatingSheet, onAvatar]);

  return {
    candidates, pending, spentCredits, picking, generatingSheet,
    generate, pickFront, generateSheet,
  };
}
```

- [ ] **Step 7: Typecheck, lint, test, commit**

Run: `npx tsc --noEmit && npx eslint src/lib/avatars src/services/avatars.service.ts src/hooks/use-avatar-studio.ts src/hooks/use-avatar-generation.ts && npx vitest run src/lib/avatars`
Expected: no errors; PASS. If the react-hooks lint rule objects to `setState` inside the load effect's promise callback or to the ref check, keep the behaviour identical and describe the change in your report.

```bash
git add src/lib/avatars/generation.ts src/lib/avatars/__tests__/generation.test.ts src/services/avatars.service.ts src/hooks/use-avatar-studio.ts src/hooks/use-avatar-generation.ts
git commit -m "feat(avatars): generation state — batches, spend, pick a front, generate the sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Describe panel and the candidate grid

**Files:**
- Create: `src/components/avatars/avatar-credit-cost.tsx`, `src/components/avatars/avatar-model-select.tsx`, `src/components/avatars/avatar-describe-panel.tsx`, `src/components/avatars/avatar-candidate-grid.tsx`

**Interfaces:**
- Consumes: Task 2's constants and `estimateAvatarImageCredits`, `isSeedanceFaceModel`; Task 6's `groupCandidatesByBatch`, `PendingCandidate`, `GenerateFrontInput`; `imageGenClientModelGroups`, `imageGenClientModelMap`.
- Produces:
  - `<AvatarCreditCost credits={number | null} />` — a Sparkles icon and the number; renders nothing for null
  - `<AvatarModelSelect id value onChange />` — grouped image models; the Seedance face model is tagged
  - `<AvatarDescribePanel busy={boolean} onGenerate={(input: GenerateFrontInput) => void} />`
  - `<AvatarCandidateGrid candidates pending frontUrl picking onPick />`

Before writing, read `src/components/ui/select.tsx`, `textarea.tsx`, `button.tsx`, `skeleton.tsx`, `badge.tsx` and `label.tsx` so the props you pass exist, and `src/components/admin/generations-table.tsx` for how this codebase uses `Select` (`value`, `onValueChange`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`). If `Select`'s `onValueChange` hands back `string | null` or `unknown` in this Base UI build, narrow it (`typeof v === "string"`) before storing it.

- [ ] **Step 1: The credit cost label**

`src/components/avatars/avatar-credit-cost.tsx`:

```tsx
import { Sparkles } from "lucide-react";

// The credit cost shown on a generate control — the same number the route will reserve.
// Renders nothing when there is no priced estimate for the model.
export function AvatarCreditCost({ credits }: { credits: number | null }) {
  if (credits === null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-normal opacity-85 tabular-nums">
      <Sparkles className="size-3" strokeWidth={1.5} />
      {credits.toLocaleString()}
    </span>
  );
}
```

- [ ] **Step 2: The model select**

`src/components/avatars/avatar-model-select.tsx`:

```tsx
"use client";

import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { imageGenClientModelGroups, imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { isSeedanceFaceModel } from "@/lib/avatars/generation";

// The image models, grouped by provider as in Image Gen. The one model whose faces Seedance
// accepts carries a tag, so the operator sees the consequence before generating (spec §8).
export function AvatarModelSelect({
  id, value, onChange,
}: { id: string; value: string; onChange: (modelId: string) => void }) {
  return (
    <Select value={value} onValueChange={(v) => { if (typeof v === "string") onChange(v); }}>
      <SelectTrigger id={id} size="sm" className="min-w-44">
        <SelectValue>{imageGenClientModelMap[value]?.label ?? "Choose a model"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {imageGenClientModelGroups.map((group) => (
          <SelectGroup key={group.provider}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <span className="flex items-center gap-2">
                  {model.label}
                  {isSeedanceFaceModel(model.id) && <Badge variant="outline">Seedance</Badge>}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 3: The Describe panel**

`src/components/avatars/avatar-describe-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AVATAR_ATTRIBUTES, AVATAR_BATCH_DEFAULT, AVATAR_BATCH_MAX, AVATAR_DEFAULT_FRONT_MODEL_ID,
  AVATAR_DESCRIPTION_MAX, AVATAR_FRONT_ASPECT, AVATAR_STYLES,
  type AvatarAttributes, type AvatarStyleId,
} from "@/lib/avatars/constants";
import { estimateAvatarImageCredits, isSeedanceFaceModel } from "@/lib/avatars/generation";
import type { GenerateFrontInput } from "@/hooks/use-avatar-generation";
import { AvatarCreditCost } from "./avatar-credit-cost";
import { AvatarModelSelect } from "./avatar-model-select";

const ATTRIBUTE_LABELS: Record<keyof typeof AVATAR_ATTRIBUTES, string> = {
  gender: "Gender", age: "Age", ethnicity: "Ethnicity",
};
const ANY = "any";

// The composer of the Look step: what the character is, the settings, and Generate with its
// credit cost. Framing is fixed (facing camera, waist-up, plain background) and is not a field.
export function AvatarDescribePanel({
  busy, onGenerate,
}: { busy: boolean; onGenerate: (input: GenerateFrontInput) => void }) {
  const [description, setDescription] = useState("");
  const [attributes, setAttributes] = useState<AvatarAttributes>({});
  const [styleId, setStyleId] = useState<AvatarStyleId>(AVATAR_STYLES[0].id);
  const [modelId, setModelId] = useState(AVATAR_DEFAULT_FRONT_MODEL_ID);
  const [count, setCount] = useState(AVATAR_BATCH_DEFAULT);

  const perImage = estimateAvatarImageCredits({ modelId, aspect: AVATAR_FRONT_ASPECT, referenceCount: 0 });
  const canGenerate = description.trim().length > 0 && perImage !== null && !busy;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="avatar-description">Describe the character</Label>
        <Textarea
          id="avatar-description"
          value={description}
          maxLength={AVATAR_DESCRIPTION_MAX}
          rows={3}
          placeholder="Appearance, clothing, hair, and anything that makes them recognisable"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(AVATAR_ATTRIBUTES) as (keyof typeof AVATAR_ATTRIBUTES)[]).map((key) => (
          <Select
            key={key}
            value={attributes[key] ?? ANY}
            onValueChange={(v) => {
              if (typeof v !== "string") return;
              setAttributes((prev) => ({ ...prev, [key]: v === ANY ? undefined : v }));
            }}
          >
            <SelectTrigger size="sm" aria-label={ATTRIBUTE_LABELS[key]}>
              <SelectValue>
                <span className="text-muted-foreground">{ATTRIBUTE_LABELS[key]}</span>{" "}
                {attributes[key] ?? "Any"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any</SelectItem>
              {AVATAR_ATTRIBUTES[key].map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <AvatarModelSelect id="avatar-front-model" value={modelId} onChange={setModelId} />
        <Select value={styleId} onValueChange={(v) => { if (typeof v === "string") setStyleId(v as AvatarStyleId); }}>
          <SelectTrigger size="sm" aria-label="Style">
            <SelectValue>{AVATAR_STYLES.find((s) => s.id === styleId)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {AVATAR_STYLES.map((style) => (
              <SelectItem key={style.id} value={style.id}>{style.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center rounded-lg border">
          <Button
            variant="ghost" size="icon-sm" aria-label="Fewer images"
            disabled={count <= 1} onClick={() => setCount((c) => Math.max(1, c - 1))}
          >
            <Minus className="size-3.5" strokeWidth={1.5} />
          </Button>
          <span className="w-10 text-center text-sm tabular-nums" aria-live="polite">
            {count}<span className="text-muted-foreground">/{AVATAR_BATCH_MAX}</span>
          </span>
          <Button
            variant="ghost" size="icon-sm" aria-label="More images"
            disabled={count >= AVATAR_BATCH_MAX} onClick={() => setCount((c) => Math.min(AVATAR_BATCH_MAX, c + 1))}
          >
            <Plus className="size-3.5" strokeWidth={1.5} />
          </Button>
        </div>

        <Button
          className="ml-auto"
          disabled={!canGenerate}
          onClick={() => onGenerate({ description, attributes, styleId, modelId, count })}
        >
          {busy ? "Generating…" : "Generate"}
          <AvatarCreditCost credits={perImage === null ? null : perImage * count} />
        </Button>
      </div>

      {!isSeedanceFaceModel(modelId) && (
        <p className="text-xs text-muted-foreground">
          Seedance only accepts faces made with Seedream 5.0 Lite. An avatar generated on this
          model will not run on Seedance.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: The candidate grid**

`src/components/avatars/avatar-candidate-grid.tsx`:

```tsx
"use client";

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/kb/utils";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { groupCandidatesByBatch, type PendingCandidate } from "@/lib/avatars/generation";
import type { AvatarCandidate } from "@/lib/avatars/schema";

type Props = {
  candidates: AvatarCandidate[];
  pending: PendingCandidate[];
  /** The avatar's current front image, so the picked candidate can be marked. */
  frontUrl: string | null;
  /** The generation id being set as the front, if any. */
  picking: string | null;
  onPick: (candidate: AvatarCandidate) => void;
};

// Every batch generated for this avatar, newest first. Earlier attempts stay so models can be
// compared; clicking an image makes it the front. A placeholder is the same box as the image
// that replaces it, so nothing moves when a result arrives.
export function AvatarCandidateGrid({ candidates, pending, frontUrl, picking, onPick }: Props) {
  const batches = groupCandidatesByBatch(candidates, pending);
  if (batches.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {batches.map((batch) => (
        <div key={batch.batchId} className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {imageGenClientModelMap[batch.modelId]?.label ?? batch.modelId}
            {batch.createdAt ? ` · ${formatDate(batch.createdAt)}` : " · generating"}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {batch.candidates.map((candidate) => {
              const isFront = candidate.url === frontUrl;
              return (
                <Button
                  key={candidate.generationId}
                  variant="ghost"
                  disabled={picking !== null}
                  aria-pressed={isFront}
                  aria-label={isFront ? "Current front image" : "Use as the front image"}
                  onClick={() => onPick(candidate)}
                  className={cn(
                    "relative aspect-[3/4] h-auto w-full overflow-hidden rounded-lg border p-0",
                    isFront && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={candidate.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                  />
                  {isFront && (
                    <Badge className="absolute left-1.5 top-1.5 gap-1 bg-card">
                      <Check className="size-3 text-primary" strokeWidth={1.5} />
                      Front
                    </Badge>
                  )}
                </Button>
              );
            })}
            {Array.from({ length: batch.pendingCount }, (_, i) => (
              <Skeleton key={`${batch.batchId}-pending-${i}`} className="aspect-[3/4] w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck, lint, commit**

Run: `npx tsc --noEmit && npx eslint src/components/avatars`
Expected: no errors. If a `Select` prop used above does not exist in this build (for example `size` on `SelectTrigger`, or children on `SelectValue`), use what `select.tsx` actually exposes, keep the same look, and describe the change in your report.

```bash
git add src/components/avatars/avatar-credit-cost.tsx src/components/avatars/avatar-model-select.tsx src/components/avatars/avatar-describe-panel.tsx src/components/avatars/avatar-candidate-grid.tsx
git commit -m "feat(avatars): Describe panel and candidate grid with credit costs (D288, D290)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Wire generation into the Studio

**Files:**
- Create: `src/components/avatars/avatar-studio-look-step.tsx`, `src/components/avatars/avatar-studio-sheet-step.tsx`, `src/components/avatars/avatar-sheet-generate.tsx`
- Modify: `src/components/avatars/avatar-studio.tsx`, `src/components/avatars/avatar-studio-card.tsx`

**Interfaces:**
- Consumes: `useAvatarStudio` (with `ensureAvatar`, `replaceAvatar`), `useAvatarGeneration` (Task 6); Task 7's components; `avatarEngineNote`.
- Produces: the Look step with **Describe | Upload photo**, the sheet step with **Generate**, and a card that shows the engine and the credits spent. `avatar-studio.tsx` stays under ~200 lines by moving each step's body into its own file.

The sheet is generated when the operator clicks Generate, never automatically: operators sometimes bring their own sheet, and an automatic run would spend credits they did not ask to spend.

- [ ] **Step 1: The sheet's generate control**

`src/components/avatars/avatar-sheet-generate.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AVATAR_DEFAULT_SHEET_MODEL_ID, AVATAR_SHEET_ASPECT } from "@/lib/avatars/constants";
import { estimateAvatarImageCredits } from "@/lib/avatars/generation";
import { AvatarCreditCost } from "./avatar-credit-cost";
import { AvatarModelSelect } from "./avatar-model-select";

// Generates the profile sheet from the front image (D288). The model is the operator's choice;
// the default is the one the handoff design uses for model sheets.
export function AvatarSheetGenerate({
  hasSheet, generating, disabled, onGenerate,
}: {
  hasSheet: boolean;
  generating: boolean;
  disabled: boolean;
  onGenerate: (modelId: string) => void;
}) {
  const [modelId, setModelId] = useState(AVATAR_DEFAULT_SHEET_MODEL_ID);
  const credits = estimateAvatarImageCredits({ modelId, aspect: AVATAR_SHEET_ASPECT, referenceCount: 1 });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AvatarModelSelect id="avatar-sheet-model" value={modelId} onChange={setModelId} />
      <Button
        variant={hasSheet ? "outline" : "default"}
        disabled={disabled || generating || credits === null}
        onClick={() => onGenerate(modelId)}
      >
        {generating ? "Generating…" : hasSheet ? "Regenerate from the front image" : "Generate from the front image"}
        <AvatarCreditCost credits={credits} />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: The Look step**

`src/components/avatars/avatar-studio-look-step.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { useAvatarGeneration } from "@/hooks/use-avatar-generation";
import type { useAvatarStudio } from "@/hooks/use-avatar-studio";
import { AvatarCandidateGrid } from "./avatar-candidate-grid";
import { AvatarDescribePanel } from "./avatar-describe-panel";
import { AvatarImageDropzone } from "./avatar-image-dropzone";

type Mode = "describe" | "upload";

type Props = {
  studio: ReturnType<typeof useAvatarStudio>;
  generation: ReturnType<typeof useAvatarGeneration>;
  /** The likeness-consent block, or null when it does not apply. */
  consent: ReactNode;
  onContinue: () => void;
};

// Step 1 of the Studio: get a front image, either by describing the character and picking a
// generated candidate, or by uploading a photo. Switching mode keeps everything typed so far.
export function AvatarStudioLookStep({ studio: s, generation: g, consent, onContinue }: Props) {
  const front = s.avatar?.front ?? null;
  // Open on the way the current front was made; a new avatar starts on Describe.
  const [mode, setMode] = useState<Mode>(front?.source.kind === "upload" ? "upload" : "describe");
  const busy = g.pending.length > 0;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow text-muted-foreground">Front image</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Facing the camera, waist-up, even light, plain background.
          </p>
        </div>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="describe">Describe</TabsTrigger>
            <TabsTrigger value="upload">Upload photo</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {mode === "describe" ? (
        <>
          <AvatarDescribePanel busy={busy} onGenerate={g.generate} />
          <AvatarCandidateGrid
            candidates={g.candidates}
            pending={g.pending}
            frontUrl={front?.url ?? null}
            picking={g.picking}
            onPick={g.pickFront}
          />
        </>
      ) : (
        <div className="w-full max-w-xs">
          <AvatarImageDropzone
            label="Add a front image"
            hint="Click, or drop a photo here"
            aspect="3 / 4"
            image={front}
            uploading={s.uploading === "front"}
            disabled={s.uploading !== null || s.confirmingConsent || busy}
            onFile={(file) => s.uploadImage("front", file)}
          />
        </div>
      )}

      {consent}
      {front && (
        <Button variant="outline" className="self-start" onClick={onContinue}>
          Continue to profile sheet
        </Button>
      )}
    </>
  );
}
```

- [ ] **Step 3: The sheet step**

`src/components/avatars/avatar-studio-sheet-step.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import type { useAvatarGeneration } from "@/hooks/use-avatar-generation";
import type { useAvatarStudio } from "@/hooks/use-avatar-studio";
import { AvatarImageDropzone } from "./avatar-image-dropzone";
import { AvatarSheetGenerate } from "./avatar-sheet-generate";

type Props = {
  studio: ReturnType<typeof useAvatarStudio>;
  generation: ReturnType<typeof useAvatarGeneration>;
  consent: ReactNode;
};

// Step 2 of the Studio: the profile sheet — generated from the front image, or the operator's
// own. While it generates, the slot shows the same-size placeholder an upload does.
export function AvatarStudioSheetStep({ studio: s, generation: g, consent }: Props) {
  const sheet = s.avatar?.sheet ?? null;
  const working = s.uploading !== null || g.generatingSheet;

  return (
    <>
      <div>
        <p className="text-eyebrow text-muted-foreground">Profile sheet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Three views of the same person in one wide image: front, side and back. Generate it
          from the front image, or add your own.
        </p>
      </div>
      {consent}
      {s.avatar?.sheetStale && (
        <p className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          The front image changed. Regenerate or replace the sheet so it shows the same person.
        </p>
      )}
      <AvatarSheetGenerate
        hasSheet={sheet !== null}
        generating={g.generatingSheet}
        disabled={working || !s.avatar?.front}
        onGenerate={g.generateSheet}
      />
      <AvatarImageDropzone
        label="Add your own profile sheet"
        hint="Click, or drop the sheet here"
        aspect="16 / 9"
        image={sheet}
        uploading={s.uploading === "sheet" || g.generatingSheet}
        disabled={working}
        onFile={(file) => s.uploadImage("sheet", file)}
      />
    </>
  );
}
```

- [ ] **Step 4: Use them in the Studio**

In `src/components/avatars/avatar-studio.tsx`:

Add the imports:

```tsx
import { useAvatarGeneration } from "@/hooks/use-avatar-generation";
import { AvatarStudioLookStep } from "./avatar-studio-look-step";
import { AvatarStudioSheetStep } from "./avatar-studio-sheet-step";
```

and remove the `AvatarImageDropzone` import (the steps own it now).

Directly after `const s = useAvatarStudio({ clientId, clientSlug, initialAvatar });` add:

```tsx
  const g = useAvatarGeneration({
    clientId,
    avatarId: s.avatar?.id ?? null,
    ensureAvatar: s.ensureAvatar,
    onAvatar: s.replaceAvatar,
  });
```

Update the component's doc comment to: `// D287 — the Avatar Studio: a full page. The steps are on the left, the avatar card on the right. Plan 3 adds the Voice step.`

Replace the whole `{step === "look" ? ( … ) : ( … )}` expression inside the left `<Card>` with:

```tsx
          {step === "look" ? (
            <AvatarStudioLookStep
              studio={s}
              generation={g}
              consent={consent}
              onContinue={() => setStep("sheet")}
            />
          ) : (
            <AvatarStudioSheetStep studio={s} generation={g} consent={consent} />
          )}
```

Add one prop to `<AvatarStudioCard … />`: `spentCredits={g.spentCredits}`.

- [ ] **Step 5: Show the engine and the spend on the card**

In `src/components/avatars/avatar-studio-card.tsx`:

Add the imports `import { avatarEngineNote } from "@/lib/avatars/generation";` and `import { AvatarCreditCost } from "./avatar-credit-cost";`.

Add `spentCredits: number;` to `Props` and `spentCredits` to the destructured parameters.

Directly after the `const has = …` line add:

```tsx
  const engine = avatar ? avatarEngineNote(avatar) : null;
```

Inside the `<ul>`, after the "Permission" row, add:

```tsx
        {engine && <Row done label="Runs on" detail={engine} />}
```

The engine text is longer than the other details: in the `Row` component change the detail span's class to `"max-w-[60%] text-right text-xs text-muted-foreground"` so it wraps inside the card.

Directly above `{avatar && <AvatarArchiveButton … />}` add:

```tsx
      {spentCredits > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          Spent on this avatar
          <AvatarCreditCost credits={spentCredits} />
        </p>
      )}
```

- [ ] **Step 6: Typecheck, lint, run the avatar tests, commit**

Run: `npx tsc --noEmit && npx eslint src/components/avatars src/hooks/use-avatar-studio.ts src/hooks/use-avatar-generation.ts && npx vitest run src/lib/avatars src/lib/db "src/app/api/clients/[id]/avatars"`
Expected: no type or lint errors in the files this plan touched; all tests PASS.

```bash
git add src/components/avatars
git commit -m "feat(avatars): Describe and generate in the Avatar Studio; engine and spend on the card (D288, D290)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verify in the running app

**Files:** none changed unless a defect is found.

- [ ] **Step 1: Ask the operator to apply the migration**

Stop and ask the operator to paste `supabase/migrations/0042_generations_avatar.sql` into the Supabase SQL editor and run it, then run the three verify queries from `docs/auth-production-migration.md` § "Migration 0042". Do not continue until they confirm. Without it, Generate fails with `null value in column "node_id"`.

- [ ] **Step 2: Ask the operator to walk the flow**

This spends real credits (about 35 per Seedream image). Ask the operator to run `npm run dev:next` and, signed in, check:

1. **New avatar → Describe.** Generate shows a credit cost that changes with the model and with the count. Generate is disabled until something is described.
2. **Generate 2 on Seedream 5.0 Lite.** Two placeholders appear at once; each becomes an image on its own; the URL moves to `/avatars/<id>` without the page resetting. "Spent on this avatar" appears on the card and matches two images.
3. **Pick one.** It gains a "Front" mark; the card shows Person type **Generic**, **no** Permission row, and "Runs on · Seedance · clips up to 30 s".
4. **Generate 1 on another model** and pick it. "Runs on" says Seedance will not accept this face; the earlier batch is still there.
5. **Profile sheet → Generate from the front image.** The slot shows a placeholder the same size as the result, then the sheet. The spend goes up. Save becomes enabled once the avatar has a name.
6. **Replace the front** (pick another candidate). The sheet step says the front image changed; Save is disabled until the sheet is regenerated or replaced.
7. **Upload photo** on a second avatar. It is a **Real person**, asks for permission, and "Runs on · Gemini Omni · clips up to 10 s". Its sheet can be generated from the uploaded photo.
8. **Reload** an avatar with batches. The batches and the spend come back.
9. **Admin → generations.** The avatar images are listed with their credits; canvas generations are unchanged.

- [ ] **Step 3: Report**

Report each check's result as the operator saw it, including any that failed. Fix defects in the task that owns the file, re-run that task's tests, and commit the fix on its own.
