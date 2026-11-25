# Model catalog 1b-iii — delete the code model lists and freeze the seed migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The image and video model lists that still live in code (the two `client-models.ts` files, the two registries, the provider spec objects, the `params/*` files and the seed builders) are deleted, so the `ai_models` rows are the only place a model's data lives; migrations 0077 and 0084 are frozen by hash; and two leftovers from 1b-i are closed (a missing model is a final task failure; Kling's reference support comes from the catalog).

**Architecture:** After plans 1b-i and 1b-ii, no app code reads the code lists: the server and the browser read the catalog, and only `generate` code comes from the adapter maps. What remains is test scaffolding and the seed builders that wrote 0077 and 0084. Tests move to `seededModelCatalog()` (the rows the migrations leave behind), the id constants that name model-specific behaviour move to one small file, and the drift tests become hash pins like 0077's. Provider files keep only their `generate` code and the constants that code uses.

**Tech Stack:** TypeScript, Vitest 4, Trigger.dev v4 tasks.

**Follows:** `docs/superpowers/plans/2026-11-23-model-catalog-1b-server.md` (1b-i) and `docs/superpowers/plans/2026-11-23-model-catalog-1b-browser.md` (1b-ii). Spec: `docs/superpowers/specs/2026-11-21-model-catalog-design.md` ("The registries become a seed … Once every caller reads the catalog, the registries and price tables are deleted").

## Global Constraints

- Decision **D568** (Task 6 writes it into the ADR log, §7 of `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`). No new migration. No behaviour change for users: every test that passed before must still pass, rewritten against the seeded catalog where it read a code list.
- Migrations **0077** and **0084** are frozen: their SQL bodies never change again; a model change goes in a new migration. Only 0084's header comment changes in this plan (it says how to regenerate, which stops being true), and it is pinned by hash after that edit.
- `src/lib/ai-models/test-catalog.ts` (`seededModelCatalog`, `withModel`, `stubAdapters`) and `src/lib/ai-models/test-prices.ts` keep working: they read the migration files, not the code lists. `SEED_JSON_TAG`, `seedSql` and the `AiModelSeedRow` type stay (text and service model migrations and their tests use them).
- The adapter maps `src/lib/image-gen/adapters.ts` and `src/lib/video-gen/adapters.ts` and every `generate…` function they call stay and keep their behaviour. A constant a `generate` function reads stays (moved next to it if its file is deleted).
- Model-specific behaviour keyed by id stays in code, in one file: `src/lib/ai-models/model-ids.ts`.
- Plain user-facing copy, no ids in the UI (unchanged by this plan; do not regress it).
- Files keep their line endings: check with `file <path>` before editing; a CRLF file stays CRLF. Comments are UTF-8 (no cp1252 bytes).
- No AI attribution in commits (no `Co-Authored-By`, no "Generated with" line). Stage files by explicit path; deletions with `git rm <path>`. Never `git add -A` or `git add .`.
- No database connections by the implementer.
- Run vitest from PowerShell (`npx vitest run …`); in Git Bash vitest fails with "Cannot read properties of undefined (reading 'config')".
- Test environment: node; no `@testing-library`; component tests use `react-dom/server` `renderToStaticMarkup`.
- `npx tsc --noEmit -p tsconfig.json`: the only known errors are under `.next/` from the showcase pages. Any other error is new and must be fixed.
- Known flakes: a full `npx vitest run` has about 11 API route timeouts that pass alone. Verify per directory; re-run a failing route file alone before treating it as broken.

---

## File structure

| File | Fate |
|---|---|
| `src/lib/generations/task-failure.ts` | gains `ModelUnavailableError` (moved from `runnable.ts`, re-exported there); `isFinalAttempt` treats it as final |
| `src/lib/video-gen/providers/kling.ts`, `src/lib/video-gen/adapters.ts` | `klingEndpoint` takes reference support from the catalog spec |
| `src/lib/ai-models/model-ids.ts` | new: `GEMINI_OMNI_11_MODEL_ID`, `GEMINI_OMNI_12_MODEL_ID`, `GEMINI_OMNI_MODEL_ID`, `KLING_OMNI_MODEL_ID`, `SEEDANCE_MODEL_ID` |
| `src/lib/ai-models/seed.ts` | loses `seedRowsFromRegistries` (keeps `SEED_JSON_TAG`, `seedSql`, `AiModelSeedRow`) |
| `src/lib/ai-models/adapter-sync.ts` | deleted |
| `src/lib/ai-models/__tests__/adapter-sync.test.ts` | becomes a hash pin of 0084 (renamed `adapters-migration.test.ts`) |
| `src/lib/ai-models/__tests__/seed.test.ts` | keeps only the `seedSql` test, on fixture rows |
| `src/lib/image-gen/client-models.ts`, `src/lib/image-gen/registry.ts`, `src/lib/image-gen/params/{openai,gemini,seedream}.ts` | deleted |
| `src/lib/video-gen/client-models.ts`, `src/lib/video-gen/registry.ts`, `src/lib/video-gen/params/{veo,kling,seedance,sora,gemini-omni}.ts`, `src/lib/video-gen/gemini-omni-shape.ts`, `src/lib/video-gen/providers/{veo,sora}.ts` | deleted |
| `src/lib/image-gen/providers/*.ts`, `src/lib/video-gen/providers/{kling,seedance,gemini-omni}.ts` | lose their spec objects (`openaiModels`, `kling30`, …); keep `generate…` and the constants it reads |
| `src/lib/ai-models/__tests__/no-client-registry-imports.test.ts` | deleted (the files it guards no longer exist; tsc catches an import) |

---

### Task 1: A missing model is a final task failure

**Files:**
- Modify: `src/lib/generations/task-failure.ts`, `src/lib/ai-models/runnable.ts`, `trigger/video-generate.ts`
- Test: `src/lib/generations/__tests__/task-failure.test.ts` (create if absent)

**Interfaces:**
- Produces: `ModelUnavailableError` exported from `src/lib/generations/task-failure.ts` and re-exported from `src/lib/ai-models/runnable.ts` (existing importers keep working). `isFinalAttempt(attemptNumber, maxAttempts, error)` returns true for it.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { isFinalAttempt, ModelUnavailableError, PaidResultError } from "@/lib/generations/task-failure";
import { ModelUnavailableError as FromRunnable } from "@/lib/ai-models/runnable";

describe("isFinalAttempt", () => {
  it("ends the run on a paid result, a missing model, or the last attempt", () => {
    expect(isFinalAttempt(1, 3, new PaidResultError("x"))).toBe(true);
    expect(isFinalAttempt(1, 3, new ModelUnavailableError("x"))).toBe(true);
    expect(isFinalAttempt(3, 3, new Error("x"))).toBe(true);
    expect(isFinalAttempt(1, 3, new Error("x"))).toBe(false);
  });

  it("is one class wherever it is imported from", () => {
    expect(FromRunnable).toBe(ModelUnavailableError);
    expect(new ModelUnavailableError("m").name).toBe("ModelUnavailableError");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/generations/__tests__/task-failure.test.ts`
Expected: FAIL (`ModelUnavailableError` is not exported from task-failure).

- [ ] **Step 3: Implement**

In `task-failure.ts`, below `PaidResultError`:

```ts
/** A task's model lookup failed (no catalog row or no adapter). Final: a retry finds the same. */
export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

/** Whether this failure ends the run: report it as `failed`, and do not retry. */
export function isFinalAttempt(attemptNumber: number, maxAttempts: number, error: unknown): boolean {
  return error instanceof PaidResultError || error instanceof ModelUnavailableError || attemptNumber >= maxAttempts;
}
```

In `runnable.ts`, delete the class body and replace it with `export { ModelUnavailableError } from "@/lib/generations/task-failure";` (keep its doc comment as a one-line pointer).

In `trigger/video-generate.ts`, the catch's abort line becomes:

```ts
      if (e instanceof PaidResultError || e instanceof ModelUnavailableError) throw new AbortTaskRunError(error);
```

importing `ModelUnavailableError` from `@/lib/generations/task-failure` beside `PaidResultError`. In `trigger/image-generate.ts`, replace the dynamic `await import("@/lib/ai-models/runnable")` for `ModelUnavailableError` with the same static import from `@/lib/generations/task-failure`, unless the file's comment explains the dynamic import is needed (then leave it and say so in the report).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/generations src/lib/ai-models src/lib/image-gen src/lib/video-gen src/lib/avatars`
Expected: PASS. `npx tsc --noEmit -p tsconfig.json` — only the known `.next/` errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/generations/task-failure.ts src/lib/ai-models/runnable.ts trigger/video-generate.ts trigger/image-generate.ts src/lib/generations/__tests__/task-failure.test.ts
git commit -m "fix(tasks): a model the catalog can't run ends the task without a retry"
```

---

### Task 2: Kling's reference support comes from the catalog

**Files:**
- Modify: `src/lib/video-gen/providers/kling.ts` (`klingEndpoint`), `src/lib/video-gen/adapters.ts`
- Test: `src/lib/video-gen/__tests__/kling-endpoint.test.ts` (create)

**Interfaces:**
- Produces: `klingEndpoint(model: KlingFalModel, vendorModel: string, maxReferenceImages: number): KlingEndpointConfig`. `supportsReferences` is `maxReferenceImages > 0`; `requiresStartFrame` is `maxReferenceImages === 0` (a Kling model with no references can only start from a frame). The endpoint path family stays keyed by the fal model (`kling-3-0` → `/image-to-video/…`, the others → `/omni-video/…`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { klingEndpoint } from "@/lib/video-gen/providers/kling";

describe("klingEndpoint", () => {
  it("takes reference support from the catalog's cap, and the path from the model", () => {
    expect(klingEndpoint("kling-3-0", "kling-3.0", 0)).toMatchObject({
      endpointPath: "/image-to-video/kling-3.0", supportsReferences: false, requiresStartFrame: true,
    });
    expect(klingEndpoint("kling-3-0-omni", "kling-3.0-omni", 5)).toMatchObject({
      endpointPath: "/omni-video/kling-3.0-omni", supportsReferences: true, requiresStartFrame: false,
    });
    // An admin who sets the cap to 0 turns references off without a code change.
    expect(klingEndpoint("kling-o1", "kling-o1", 0)).toMatchObject({ supportsReferences: false, requiresStartFrame: true });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/video-gen/__tests__/kling-endpoint.test.ts`
Expected: FAIL (the third case: today O1 always supports references).

- [ ] **Step 3: Implement**

```ts
/** D561, D568 — a Kling model's endpoint. `vendorModel` is the row's provider_model_id; whether it
 *  takes references is the row's imageInputs.maxReferenceImages. */
export function klingEndpoint(model: KlingFalModel, vendorModel: string, maxReferenceImages: number): KlingEndpointConfig {
  const supportsReferences = maxReferenceImages > 0;
  const family = model === "kling-3-0" ? "image-to-video" : "omni-video";
  return { endpointPath: `/${family}/${vendorModel}`, falModel: model, supportsReferences, requiresStartFrame: !supportsReferences };
}
```

In `adapters.ts`:

```ts
const kling =
  (model: KlingFalModel, settings: KlingSettingsBuilder): VideoAdapter =>
  (input, { spec, providerModelId }) =>
    generateWithKling(klingEndpoint(model, providerModelId, spec.imageInputs.maxReferenceImages), settings, input);
```

Update any other `klingEndpoint(` call (grep; the spec objects' own `generate` in `kling.ts` call it and are deleted in Task 5 — until then pass their spec's `imageInputs.maxReferenceImages`).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/video-gen`
Expected: PASS. tsc clean apart from `.next/`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/providers/kling.ts src/lib/video-gen/adapters.ts src/lib/video-gen/__tests__/kling-endpoint.test.ts
git commit -m "fix(models): Kling takes references when its catalog row allows them"
```

---

### Task 3: The model id constants get one home

**Files:**
- Create: `src/lib/ai-models/model-ids.ts`
- Modify: every importer of `GEMINI_OMNI_11_MODEL_ID`, `GEMINI_OMNI_12_MODEL_ID`, `GEMINI_OMNI_MODEL_ID`, `KLING_OMNI_MODEL_ID`, `SEEDANCE_MODEL_ID` from `@/lib/video-gen/client-models` or `../client-models` (app code and tests). Find them with `grep -rln "GEMINI_OMNI_1[12]_MODEL_ID\|GEMINI_OMNI_MODEL_ID\|KLING_OMNI_MODEL_ID\|SEEDANCE_MODEL_ID" src trigger`.
- Modify: `src/lib/video-gen/client-models.ts` (re-export the constants from the new file for now, so nothing breaks mid-plan)

**Interfaces:**
- Produces: `src/lib/ai-models/model-ids.ts` exporting the five constants with the same values. Every later task and every reader imports them from there.

- [ ] **Step 1: Create the file**

```ts
// D568 — ids of models whose behaviour is written in code (multishot ladders, prompt templates,
// voice preview engines, edit models). The models' data lives in the catalog; only these names
// stay here. Client-safe.
export const GEMINI_OMNI_11_MODEL_ID = "gemini:gemini-omni-1.1-flash";
export const GEMINI_OMNI_12_MODEL_ID = "gemini:gemini-omni-1.2-flash";
/** The current Omni version. */
export const GEMINI_OMNI_MODEL_ID = GEMINI_OMNI_12_MODEL_ID;
export const KLING_OMNI_MODEL_ID = "kling:kling-3-0-omni";
export const SEEDANCE_MODEL_ID = "seedance:seedance-2-5";
```

Check the values against `src/lib/video-gen/client-models.ts` before writing (they must be identical). Then in `client-models.ts`, replace the constants' definitions with `export { GEMINI_OMNI_11_MODEL_ID, GEMINI_OMNI_12_MODEL_ID, GEMINI_OMNI_MODEL_ID, KLING_OMNI_MODEL_ID, SEEDANCE_MODEL_ID } from "@/lib/ai-models/model-ids";` (it still uses them internally; import them for that too).

- [ ] **Step 2: Point every importer at the new file**

For each file the grep finds (outside `client-models.ts` itself): import the constants it uses from `@/lib/ai-models/model-ids`, and drop them from its client-models import (delete the import line if nothing else is left on it). This includes `src/lib/nodes/multishot-models.ts`, `src/lib/video-edit/record.ts`, `src/lib/avatars/voice-preview.ts`, `src/prompts/multishot-prompt-for.ts`, `src/lib/video-gen/providers/gemini-omni.ts` and the tests.

- [ ] **Step 3: Verify**

Run: `grep -rn "GEMINI_OMNI_1[12]_MODEL_ID\|GEMINI_OMNI_MODEL_ID\|KLING_OMNI_MODEL_ID\|SEEDANCE_MODEL_ID" src trigger | grep "client-models"` → only the re-export line in `src/lib/video-gen/client-models.ts`.
Run: `npx vitest run src/lib/nodes src/lib/video-edit src/lib/avatars src/prompts src/lib/video-gen src/lib/generations src/lib/canvas-store.test.ts "src/app/api/nodes"`
Expected: PASS. tsc clean apart from `.next/`.

- [ ] **Step 4: Commit** (every changed file by path)

```bash
git add src/lib/ai-models/model-ids.ts src/lib/video-gen/client-models.ts <every file you changed>
git commit -m "refactor(models): the ids of models with code-written behaviour live in model-ids.ts (D568)"
```

---

### Task 4: Freeze 0084 and drop the seed builders

**Files:**
- Modify: `supabase/migrations/0084_ai_models_adapters.sql` (header comment only)
- Delete: `src/lib/ai-models/adapter-sync.ts`
- Modify: `src/lib/ai-models/seed.ts` (delete `seedRowsFromRegistries` and its imports)
- Replace: `src/lib/ai-models/__tests__/adapter-sync.test.ts` → `src/lib/ai-models/__tests__/adapters-migration.test.ts`
- Modify: `src/lib/ai-models/__tests__/seed.test.ts`
- Modify: any other test reading `seedRowsFromRegistries` or `adapter-sync` (grep)

**Interfaces:**
- Consumes: `seededModelCatalog()` (rows from the migrations).
- Produces: nothing new.

- [ ] **Step 1: Edit 0084's header**

Replace its first five comment lines (the ones that say it is generated by `adapter-sync.ts` and how to regenerate) with:

```sql
-- D561: each image and video model's own adapter key and the provider's name for it, and its
-- label, params, rules and capabilities re-synced from the code registries of the day. Status,
-- replacement and order belong to the super admin and are left alone.
-- Frozen (D568): the registries it was generated from are deleted. A model change is a new migration.
```

Keep the file's line endings. Do not touch anything below the comments.

- [ ] **Step 2: Write the pin test**

`src/lib/ai-models/__tests__/adapters-migration.test.ts` (modelled on `seed-migration.test.ts`; read it and copy its normalisation of line endings exactly):

```ts
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { seededModelCatalog } from "../test-catalog";

// D568 — 0084 is history: its SQL never changes. A model change is a new migration.
const FILE = resolve(process.cwd(), "supabase/migrations/0084_ai_models_adapters.sql");
const FROZEN_SHA256 = "<fill in: the sha256 of the file after Step 1, normalised as in seed-migration.test.ts>";

describe("migration 0084 (frozen)", () => {
  it("is unchanged", () => {
    const sql = readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
    expect(createHash("sha256").update(sql).digest("hex")).toBe(FROZEN_SHA256);
  });

  it("gives every image and video model its own adapter key and the provider's model name", () => {
    const rows = seededModelCatalog().models.filter((m) => m.kind === "image" || m.kind === "video");
    expect(new Set(rows.map((r) => r.adapterKey)).size).toBe(rows.length);
    for (const r of rows) expect(r.providerModelId, r.id).toMatch(/\S/);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("seedream:seedream-5-0-pro")?.providerModelId).toBe("dola-seedream-5-0-pro-260628");
    expect(byId.get("kling:kling-3-0-omni")).toMatchObject({ adapterKey: "video:kling-3-0-omni", providerModelId: "kling-3.0-omni" });
    expect(byId.get("seedance:seedance-2-5")?.providerModelId).toBe("dreamina-seedance-2-5-260628");
  });

  it("never writes a model's status, replacement or order (the admin's)", () => {
    expect(readFileSync(FILE, "utf8")).not.toMatch(/\b(status|replaced_by|sort_order)\s*=/);
  });
});
```

Compute the hash with a one-off `node -e` that reads the file, normalises it the same way, and prints the sha256; paste it as `FROZEN_SHA256`. Write the value, never compute it inside the test from the file.

Also keep, from the old `adapter-sync.test.ts`, the assertion that every live image and video row has an adapter in `imageAdapters` / `videoAdapters` and retired rows have none, if the old file or `src/lib/image-gen/__tests__` / `src/lib/video-gen/__tests__` doesn't already cover it (grep for `imageAdapters` in tests first). Then `git rm src/lib/ai-models/__tests__/adapter-sync.test.ts`.

- [ ] **Step 3: Delete the builders**

`git rm src/lib/ai-models/adapter-sync.ts`. In `seed.ts`, delete `seedRowsFromRegistries` and the imports only it used (`imageGenClientModels`, `DEPRECATED_IMAGE_MODEL_FALLBACK_ID`, `videoGenClientModelMap`, `DEFAULT_VIDEO_CLIENT_MODEL_ID`), and update the file's top comment to say 0077 was generated from the code registries of the day and is frozen.

In `seed.test.ts`: delete the `seedRowsFromRegistries` and round-trip describes (their job — proving the seed matched the code — is done, and `seed-migration.test.ts` pins 0077). Keep the `seedSql` test, rewritten on two fixture rows built inline (one image, one video) in the `AiModelSeedRow` shape.

- [ ] **Step 4: Verify**

Run: `grep -rn "seedRowsFromRegistries\|adapter-sync\|adapterSync" src trigger` → nothing.
Run: `npx vitest run src/lib/ai-models`
Expected: PASS. tsc clean apart from `.next/`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0084_ai_models_adapters.sql src/lib/ai-models/seed.ts src/lib/ai-models/__tests__/seed.test.ts src/lib/ai-models/__tests__/adapters-migration.test.ts <other tests changed>
git rm src/lib/ai-models/adapter-sync.ts src/lib/ai-models/__tests__/adapter-sync.test.ts
git commit -m "refactor(models): freeze migration 0084 and drop the seed builders (D568)"
```

---

### Task 5: Delete the code model lists

**Files:**
- Delete: `src/lib/image-gen/client-models.ts`, `src/lib/image-gen/registry.ts`, `src/lib/image-gen/params/openai.ts`, `src/lib/image-gen/params/gemini.ts`, `src/lib/image-gen/params/seedream.ts`
- Delete: `src/lib/video-gen/client-models.ts`, `src/lib/video-gen/registry.ts`, `src/lib/video-gen/params/veo.ts`, `src/lib/video-gen/params/kling.ts`, `src/lib/video-gen/params/seedance.ts`, `src/lib/video-gen/params/sora.ts`, `src/lib/video-gen/params/gemini-omni.ts`, `src/lib/video-gen/gemini-omni-shape.ts`, `src/lib/video-gen/providers/veo.ts`, `src/lib/video-gen/providers/sora.ts`
- Delete: `src/lib/ai-models/__tests__/no-client-registry-imports.test.ts`
- Modify: `src/lib/image-gen/providers/{openai,gemini,seedream}.ts` and `src/lib/video-gen/providers/{kling,seedance,gemini-omni}.ts`: delete the spec objects (`openaiModels`, `geminiModels`, `seedreamModels`, `kling30`, `klingO1`, `kling30Omni`, `seedance25`, `geminiOmni`, `geminiOmni12`), the params re-exports, and the constants only those objects or the deleted seed builders read (`KLING_VENDOR_MODELS`, `SEEDANCE_VENDOR_MODEL`, `OMNI_11_API_MODEL`/`OMNI_12_API_MODEL` if only `OMNI_11`/`OMNI_12` and adapter-sync read them — keep them if `OMNI_11`/`OMNI_12` do)
- Move: constants a `generate` function still reads, from a deleted file into the provider that reads it (e.g. `GEMINI_OMNI_11_MAX_SECONDS`, `GEMINI_OMNI_12_MAX_SECONDS`, `OMNI_12_FRAME_PAIR_MAX_SECONDS` into `providers/gemini-omni.ts`)
- Modify: every test that imports a deleted file or symbol (find with tsc after the deletions)

**Interfaces:**
- Consumes: `seededModelCatalog`, `withModel`, `stubAdapters` (test-catalog); `imageModelsFrom`, `videoModelsFrom`, `paramDefaults` (model-lists); `toImageClientSpec`, `toVideoClientSpec` (to-spec); id constants from `@/lib/ai-models/model-ids`.
- Produces: nothing new.

- [ ] **Step 1: Delete and let the compiler list what breaks**

`git rm` the files above. Delete the spec objects and dead constants from the provider files. Run `npx tsc --noEmit -p tsconfig.json` and list every error outside `.next/`.

- [ ] **Step 2: Fix app code first**

Any app (non-test) error means something still read a code list that plans 1b-i/1b-ii missed. Fix it to read the catalog (a route or task: `getAiCatalog()` + `imageModelsFrom` / `videoModelsFrom` / `imageRun` / `videoRun`; a component: the hooks), or move a constant a `generate` function needs next to it. If a fix would change behaviour, stop and report it (NEEDS_CONTEXT) instead of guessing.

- [ ] **Step 3: Rewrite the tests**

For each failing test file, replace what it read from a deleted file with the seeded catalog:

| It read | Read instead |
|---|---|
| `imageGenClientModelMap[id]`, `imageGenClientModels` | `imageModelsFrom(seededModelCatalog()).get(id)` / `.all` |
| `videoGenClientModelMap[id]` | `videoModelsFrom(seededModelCatalog()).get(id)` |
| `defaultsForModel(spec)`, `defaultsForVideoModel(id)` | `paramDefaults(spec.params)` |
| `imageGenRegistry[id]` / `videoGenRegistry[id]` (in task tests) | the catalog spec (`toImageClientSpec` / `toVideoClientSpec` of the seeded row) plus `stubAdapters` or the adapter map, the way the task under test now resolves a model |
| a provider spec object (`kling30`, `seedance25`, …) | the seeded row's spec; for its `generate`, the adapter in `videoAdapters` |
| a params constant (`kling30Params`, `veoParams`, …) | the seeded row's `params` |
| `DEPRECATED_IMAGE_MODEL_FALLBACK_ID`, `DEFAULT_VIDEO_CLIENT_MODEL_ID` | the seeded row's `replacedBy`, or `DEFAULT_VIDEO_MODEL_ID` from `@/lib/ai-models/default-models` |

Keep every assertion's meaning. A test whose only purpose was to compare a code list with another code list (for example a `*-registration.test.ts` that checks a provider spec matches `client-models.ts`) is replaced by the same checks against the seeded row; if every check it made is already covered by `model-lists.test.ts` or `adapters-migration.test.ts`, delete it and name it in the report. Veo- and Sora-only tests (`veo-params.test.ts`, `veo-provider.test.ts`, any `sora` test) are deleted with their providers: both are retired, with no adapter.

- [ ] **Step 4: Verify**

Run: `grep -rln "client-models\|image-gen/registry\|video-gen/registry\|params/\(openai\|gemini\|seedream\|veo\|kling\|seedance\|sora\|gemini-omni\)\|gemini-omni-shape\|providers/veo\|providers/sora" src trigger` → nothing (comments that mention a deleted file: reword them).
Run, directory by directory: `npx vitest run src/lib src/components src/hooks src/prompts "src/app/api/nodes" "src/app/api/clients" "src/app/api/canvases" "src/app/api/ai-models"` and `npx vitest run trigger` if trigger has tests.
Expected: PASS (re-run a timed-out route file alone). Report the test count before and after: a drop must equal the tests you deleted on purpose, each named.
Run: `npx tsc --noEmit -p tsconfig.json` — only the known `.next/` errors.

- [ ] **Step 5: Commit** (two commits: image side, then video side, if that splits cleanly; otherwise one)

```bash
git rm <deleted files>
git add <modified files>
git commit -m "refactor(models): delete the code image and video model lists; tests read the seeded catalog (D568)"
```

---

### Task 6: ADR D568

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, after D567; keep the file's line endings)

- [ ] **Step 1: Append**

```markdown
### D568 — The catalog is the only home of image and video model data *(recorded 2026-11-23; completes D552, D561, D565)*

**Decision.** The code model lists are deleted: both `client-models.ts` files, both registries, the provider spec objects and the `params/*` files, and the builders that generated migrations 0077 and 0084. A model's label, params, rules, limits, status and provider model name live only in its `ai_models` row. Code keeps the adapters (`imageAdapters`, `videoAdapters` and the `generate` functions they call, with the constants those read) and the ids of models whose behaviour is written in code (`src/lib/ai-models/model-ids.ts`: the multishot ladders, prompt templates, voice preview engines and edit models). 0077 and 0084 are frozen by hash; a model change is a new migration or, later, an admin edit. Tests read the rows the migrations leave behind (`seededModelCatalog()`). A task whose model has no row or adapter ends without a retry. Kling takes references when its row's `maxReferenceImages` is above 0.

**Why.** Two sources of a model's data drift; the spec deletes the registries once every caller reads the catalog, and plans 1b-i and 1b-ii moved every caller.

**Rejected.** Keeping the registries as test fixtures: they would drift from the rows the app really runs on.

**Originated →** [2026-11-23-model-catalog-1b-cleanup.md](../plans/2026-11-23-model-catalog-1b-cleanup.md).
```

- [ ] **Step 2: Check encoding and line endings**, then commit:

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs: D568 the catalog is the only home of image and video model data"
```

---

## Not in this plan

- **Admin screens (Plan 4)**, including "can't set live without an adapter".
- **Text and service models' constants** in their callers (their data is already in the catalog; the callers keep their ids).
- **Deferred 1b-ii items:** the gate covering every client page, script composites starting on an unchecked model, KB and prompt versions storing text model ids that aren't catalog ids, the catalog's size in each client page's payload.

## After the plan

No deploy step of its own. Start `npm run dev` and `npx trigger.dev dev`, then generate one image (Nano Banana Pro), one Kling 3.0 Omni video with a reference image, and one Omni 1.2 video, and check each finishes and is charged as before.
