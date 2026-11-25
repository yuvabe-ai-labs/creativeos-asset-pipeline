# Model catalog 4 — super-admin models and prices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A super admin can see every model with this month's runs, provider cost and unpriced runs; change a model's status, labels, order and replacement; read its params, rules and capabilities; and add or cancel dated price rows, all under `/admin/models`, with every write going through one guarded path that a later param editor will reuse.

**Architecture:** Reads come from new admin helpers in `src/lib/db/ai-models-admin.ts` (raw rows with their check result, so a row the catalog drops is still visible to the admin) and one grouped SQL function for the month's numbers (migration 0085). Writes are server actions in `src/lib/actions/ai-models.ts`. Each one runs pure checks in `src/lib/ai-models/model-edit.ts` before touching the database: the edited row must pass the catalog's own row check, the param names and their types may not change, every price line's conditions must still match a param option, and a model may only be live with an adapter in this build (D569). After a write the action clears the catalog cache on that server (other servers within 60 s). The UI is two server pages with small client forms, in the existing admin look.

**Tech Stack:** Next.js 16 App Router (Server Components + server actions), Supabase Postgres (service-role client), Zod 4, Vitest 4, shadcn/Base UI primitives.

**Follows:** plans 1a–1b-iii. Spec: `docs/superpowers/specs/2026-11-21-model-catalog-design.md` ("Super admin (phase 1)", "Edge cases").

## Global Constraints

- Decisions **D569** (one guarded write path) and **D570** (the admin sees rows that fail their check). Migration **0085**. Task 8 writes the ADRs into §7 of `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`; Task 1 writes 0085's entry in `docs/auth-production-migration.md` (CRLF), in the format of the 0084 entry, in the same commit as the migration.
- Every admin page calls `requireSuperAdmin()` first; every admin action calls it first and is added to the ALLOWLIST in `src/lib/actions/with-action-coverage.test.ts` with the same reason the `admin.ts` actions give (D85 platform administration, explicit target, not acting as an org).
- Phase 1 edits only: `label`, `picker_label`, `provider_label`, `description`, `status`, `replaced_by`, `sort_order` on a model; add or cancel a price row. `params`, `rules`, `capabilities`, `adapter_key`, `provider_model_id`, `kind`, `provider`, `id` are shown, never edited, and `updateAiModelAction` refuses a patch that names them. The checks in `model-edit.ts` already cover param edits (names, types, price conditions) so the later editor only adds a form.
- A price row is never edited (the database refuses it); only a row whose `effective_from` is in the future may be deleted. A new row starts today (now) or later, and `effective_from` is unique per model.
- Status rules: a model of kind `image` or `video` may be `live` only if its `adapter_key` is in `imageAdapters` / `videoAdapters`. `replaced_by` must be another model of the same kind that is `live`, never the model itself; it may be set only when status is `retired` (cleared otherwise).
- Copy is plain (no ids in messages to users, no raw database errors; admins may see model ids as data in tables). Error copy, exactly:
  - `"Only an admin can change models."` is never shown: `requireSuperAdmin()` 404s instead.
  - `"This model can't go live: this build has no code to run it."`
  - `"Pick a live model of the same kind as the replacement."`
  - `"These changes would break the model's settings."` (the edited row fails the row check; log the issues)
  - `"A price can't start in the past."`
  - `"This model already has a price starting then."`
  - `"A price condition names a setting this model doesn't have."`
  - `"Only a price that hasn't started can be cancelled."`
  - `"Could not save. Try again."` (any unexpected database error; log it)
- UI: Yuvabe design system per AGENTS.md (Clash Display headings via `font-display`, Gilroy body, neutrals, purple only for the primary action and focus, `shadow-card` cards, Lucide 1.5 stroke, `.text-eyebrow` labels). Controls are shadcn primitives from `src/components/ui/*` only (no raw `<button>`, `<input>`, `<select>`). Reuse `ListToolbar`, `Badge`, `Card`, `Sheet`, `Select`, `Input`, `Textarea`, `AlertDialog`, `Breadcrumb` as the existing admin pages do. One component per file, named exports, split at ~200 lines.
- Performance: the models page makes a fixed number of queries regardless of the number of models (rows, current prices, month stats, editor names), in one `Promise.all`. No per-row query. The model page likewise.
- No AI attribution in commits. Stage by explicit path; never `git add -A` / `git add .`. No database connections by the implementer (migrations are applied by hand by the user).
- Files keep their line endings (check with `file`; CRLF stays CRLF). Comments UTF-8.
- Run vitest from PowerShell (`npx vitest run …`). Test env: node, no `@testing-library`; component tests use `react-dom/server` `renderToStaticMarkup`.
- `npx tsc --noEmit -p tsconfig.json`: only `.next/` errors are known.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0085_ai_model_month_stats.sql` | `ai_model_month_stats(p_from, p_to)` function; index `generations (created_at)` |
| `src/lib/db/ai-models-admin.ts` | admin reads (raw rows + check result, prices with editor names, month stats) and writes |
| `src/lib/ai-models/model-edit.ts` | pure checks: `checkModelPatch`, `checkNewPrice`, `priceConditionProblems`, `runPreviewUsd` |
| `src/lib/ai-models/runnable-keys.ts` | `RUNNABLE_ADAPTER_KEYS` (server-only: keys of the two adapter maps) |
| `src/lib/actions/ai-models.ts` | `updateAiModelAction`, `addAiModelPriceAction`, `cancelAiModelPriceAction` |
| `src/components/admin/admin-section-nav.tsx` | Agencies / Models tabs |
| `src/app/admin/layout.tsx` | renders the section nav above every admin page |
| `src/app/admin/models/page.tsx`, `loading.tsx` | models list |
| `src/components/admin/models/models-table.tsx` | the list, filters by kind and status |
| `src/app/admin/models/[id]/page.tsx` | model page |
| `src/components/admin/models/model-details-form.tsx` | labels, order, status, replacement |
| `src/components/admin/models/model-definition.tsx` | read-only params, rules, capabilities |
| `src/components/admin/models/model-month-stats.tsx` | runs, provider cost, credits, unpriced |
| `src/components/admin/models/price-history.tsx` | price rows, cancel button on future rows |
| `src/components/admin/models/add-price-sheet.tsx` | the add-price form with the run preview |

---

### Task 1: Month stats SQL and the admin data layer

**Files:**
- Create: `supabase/migrations/0085_ai_model_month_stats.sql`
- Create: `src/lib/db/ai-models-admin.ts`
- Modify: `docs/auth-production-migration.md` (0085 entry, CRLF)
- Test: `src/lib/db/__tests__/ai-models-admin.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase` (`src/lib/supabase/server.ts`), `MODEL_COLUMNS`, `PRICE_COLUMNS`, `parseAiModelRow`, `parseAiModelPriceRow` (`src/lib/ai-models/schema.ts`), `AiModel`, `AiModelPrice`, `PriceLine` (`types.ts`).
- Produces:
  ```ts
  export type AdminModelRow = { raw: Record<string, unknown>; model: AiModel | null; problems: string[]; updatedBy: string | null };
  export type AdminPriceRow = AiModelPrice & { createdAt: string; createdBy: string | null; createdByName: string | null };
  export type ModelMonthStats = { modelId: string; runs: number; costUsd: number; credits: number; unpriced: number };
  export async function listAdminModels(): Promise<AdminModelRow[]>;                // all rows, sort_order then id
  export async function getAdminModel(id: string): Promise<AdminModelRow | null>;
  export async function listAdminPrices(modelId?: string): Promise<AdminPriceRow[]>; // newest first; all models when no id
  export async function modelMonthStats(from: string, to: string, modelId?: string): Promise<ModelMonthStats[]>;
  export async function displayNames(userIds: string[]): Promise<Map<string, string>>; // profiles.display_name
  export async function updateAiModelRow(id: string, fields: Record<string, unknown>, userId: string): Promise<void>;
  export async function insertAiModelPrice(row: { modelId: string; effectiveFrom: string; lines: PriceLine[]; estimate: Record<string, number>; sourceUrl: string | null; note: string | null }, userId: string): Promise<void>;
  export async function deleteAiModelPrice(id: string): Promise<{ deleted: boolean }>;
  ```
  `problems` lists the row check's issues (`path: message`) when `model` is null, else `[]`.

- [ ] **Step 1: Write the migration**

```sql
-- D570: this month's runs, provider cost, credits and unpriced runs per model, in one query for
-- the super admin's models page. A run is any generations row (record-only rows included: they
-- are what a free feature cost us). Unpriced: no price row, or the bill had meters the row did
-- not price. Apply before the Plan 4 code deploys; harmless before.
create index if not exists generations_created_at_idx on generations (created_at);

create or replace function ai_model_month_stats(p_from timestamptz, p_to timestamptz)
returns table(model_id text, runs bigint, cost_usd numeric, credits numeric, unpriced bigint)
language sql stable
as $$
  select g.model_used as model_id,
         count(*) as runs,
         coalesce(sum(g.cost_usd), 0) as cost_usd,
         coalesce(sum(g.credits_charged), 0) as credits,
         count(*) filter (
           where g.model_price_id is null
              or jsonb_array_length(coalesce(g.provider_bill -> 'unpriced', '[]'::jsonb)) > 0
         ) as unpriced
  from generations g
  where g.created_at >= p_from and g.created_at < p_to and g.model_used is not null
  group by g.model_used
$$;
```

Check the column names against the migrations before writing (`model_used`, `cost_usd`, `credits_charged`, `model_price_id`, `provider_bill`, `created_at` on `generations`; `provider_bill.unpriced` is the `ProviderBill.unpriced` array from `src/lib/ai-models/types.ts`). If `provider_bill -> 'unpriced'` can hold a non-array, guard with `jsonb_typeof(...) = 'array'`.

- [ ] **Step 2: Migration doc entry**

In `docs/auth-production-migration.md`, after the 0084 entry (CRLF line endings), add `## Migration 0085 — per-model month stats for the admin (D570, 2026-11-23)`: what it does (one index, one read-only function), apply before Plan 4 deploys (the models page errors without the function; nothing else uses it), safe to re-run (`if not exists`, `create or replace`), and verify SQL:

```sql
-- expect 1 row
select count(*) from pg_proc where proname = 'ai_model_month_stats';
-- expect rows for models used this month (or none on a fresh database), never an error
select * from ai_model_month_stats(date_trunc('month', now()), now() + interval '1 day') limit 5;
```

- [ ] **Step 3: Write the failing tests**

`src/lib/db/__tests__/ai-models-admin.test.ts` mocks `@/lib/supabase/server` (follow the mock style of `src/lib/db/__tests__/generations-provider-bill.test.ts`; read it first). Cases:
  - `listAdminModels` returns a row that passes its check with `model` set and `problems: []`, and a row with a broken `params` (e.g. `params: [{ name: "" }]`) with `model: null` and a non-empty `problems` list; both are returned.
  - `listAdminPrices("m")` maps `created_by` to `createdByName` with one `profiles` query for all ids (assert the `in("id", [...])` call happens once).
  - `modelMonthStats` calls the RPC `ai_model_month_stats` with `p_from` / `p_to` and maps numeric strings to numbers; with `modelId` it filters to that model.
  - `updateAiModelRow` writes the fields plus `updated_by` and `updated_at`.
  - `deleteAiModelPrice` returns `{ deleted: false }` when the database refuses (the guard trigger raises) and rethrows other errors.

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/lib/db/__tests__/ai-models-admin.test.ts` → FAIL (module missing).

- [ ] **Step 5: Implement `src/lib/db/ai-models-admin.ts`**

`import "server-only"`. Select `MODEL_COLUMNS + ", updated_by"` for models and `PRICE_COLUMNS + ", created_at, created_by"` for prices. For `problems`, run the same Zod schema `parseAiModelRow` uses: export a `checkAiModelRow(row): { model: AiModel | null; problems: string[] }` from `schema.ts` (refactor `parseAiModelRow` to call it and return `.model`, so both share one check), and map issues as `` `${issue.path.join(".")}: ${issue.message}` ``. `deleteAiModelPrice` deletes by id with `.select("id")`; when the error message contains `"has started cannot be deleted"`, return `{ deleted: false }`. `displayNames` returns an empty map for an empty list without a query.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/db/__tests__/ai-models-admin.test.ts src/lib/ai-models` → PASS. tsc clean apart from `.next/`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0085_ai_model_month_stats.sql docs/auth-production-migration.md src/lib/db/ai-models-admin.ts src/lib/ai-models/schema.ts src/lib/db/__tests__/ai-models-admin.test.ts
git commit -m "feat(admin): model rows, prices and month stats for the super admin (D570)"
```

---

### Task 2: The guards

**Files:**
- Create: `src/lib/ai-models/model-edit.ts`
- Create: `src/lib/ai-models/runnable-keys.ts`
- Test: `src/lib/ai-models/__tests__/model-edit.test.ts`

**Interfaces:**
- Consumes: `checkAiModelRow` (Task 1), `seededModelCatalog`, `withModel` (tests), `imageEstimateUsd`, `videoEstimateUsd`, `paramDefaults`, `toImageClientSpec`/`toVideoClientSpec`, `isVideoAudioEnabled`, `asResolutionString` (`src/lib/video-gen/cost.ts`), `usdToFinalCredits`.
- Produces:
  ```ts
  export const EDITABLE_MODEL_FIELDS = ["label", "picker_label", "provider_label", "description", "status", "replaced_by", "sort_order"] as const;
  export type ModelPatch = Partial<Record<(typeof EDITABLE_MODEL_FIELDS)[number], unknown>>;
  export type EditContext = { models: AiModel[]; prices: AiModelPrice[]; runnableKeys: ReadonlySet<string> };
  export function checkModelPatch(raw: Record<string, unknown>, patch: Record<string, unknown>, ctx: EditContext): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string; log?: unknown };
  export function priceConditionProblems(params: ParamSpec[], lines: PriceLine[]): string[];
  export function checkNewPrice(model: AiModel, input: { effectiveFrom: Date; lines: PriceLine[]; estimate: Record<string, number> }, existing: AiModelPrice[], now: Date): { ok: true } | { ok: false; error: string };
  export function runPreviewUsd(model: AiModel, price: AiModelPrice): number | null;
  // runnable-keys.ts (server-only)
  export const RUNNABLE_ADAPTER_KEYS: ReadonlySet<string>;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import {
  checkModelPatch, checkNewPrice, priceConditionProblems, runPreviewUsd,
} from "@/lib/ai-models/model-edit";
import type { AiModel } from "@/lib/ai-models/types";

const catalog = seededModelCatalog();
const row = (id: string) => catalog.models.find((m) => m.id === id)!;
// The row as the database holds it (snake_case), which is what the action reads and patches.
const raw = (m: AiModel) => ({
  id: m.id, provider: m.provider, kind: m.kind, label: m.label, picker_label: m.pickerLabel,
  provider_label: m.providerLabel, description: m.description, status: m.status, replaced_by: m.replacedBy,
  sort_order: m.sortOrder, adapter_key: m.adapterKey, provider_model_id: m.providerModelId,
  params: m.params, rules: m.rules, capabilities: m.capabilities, updated_at: m.updatedAt,
});
const keys = new Set(catalog.models.filter((m) => m.status !== "retired").map((m) => m.adapterKey));
const ctx = { models: catalog.models, prices: catalog.prices, runnableKeys: keys };
const NANO_PRO = "gemini:gemini-3-pro-image";
const GPT1 = "openai:gpt-image-1"; // retired, no adapter
const SUNBURST = "openai:gpt-image-2.5-sunburst";
const OMNI12 = "gemini:gemini-omni-1.2-flash";

describe("checkModelPatch", () => {
  it("accepts a label, order and description change", () => {
    const r = checkModelPatch(raw(row(NANO_PRO)), { label: "Pro", sort_order: 3, description: "x" }, ctx);
    expect(r).toEqual({ ok: true, fields: { label: "Pro", sort_order: 3, description: "x" } });
  });

  it("refuses any field outside the editable list", () => {
    for (const patch of [{ params: [] }, { adapter_key: "image:x" }, { provider_model_id: "y" }, { kind: "video" }]) {
      expect(checkModelPatch(raw(row(NANO_PRO)), patch, ctx).ok).toBe(false);
    }
  });

  it("lets a model go live only with an adapter in this build", () => {
    expect(checkModelPatch(raw(row(GPT1)), { status: "live", replaced_by: null }, ctx)).toEqual({
      ok: false, error: "This model can't go live: this build has no code to run it.",
    });
    expect(checkModelPatch(raw(row(NANO_PRO)), { status: "hidden" }, ctx).ok).toBe(true);
  });

  it("takes a live same-kind replacement only when retiring, and clears it otherwise", () => {
    const retire = checkModelPatch(raw(row(NANO_PRO)), { status: "retired", replaced_by: SUNBURST }, ctx);
    expect(retire).toEqual({ ok: true, fields: { status: "retired", replaced_by: SUNBURST } });
    for (const bad of [OMNI12, NANO_PRO, GPT1, "nope:nope"]) {
      expect(checkModelPatch(raw(row(NANO_PRO)), { status: "retired", replaced_by: bad }, ctx)).toEqual({
        ok: false, error: "Pick a live model of the same kind as the replacement.",
      });
    }
    const live = checkModelPatch(raw(row(GPT1)), { status: "hidden" }, { ...ctx, runnableKeys: new Set([...keys, row(GPT1).adapterKey]) });
    expect(live).toEqual({ ok: true, fields: { status: "hidden", replaced_by: null } });
  });

  it("refuses a patch whose row would fail the catalog's check", () => {
    const r = checkModelPatch(raw(row(NANO_PRO)), { label: 42 }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("These changes would break the model's settings.");
  });
});

describe("priceConditionProblems", () => {
  const params = row(OMNI12).params;
  it("passes conditions that name a param and one of its values", () => {
    expect(priceConditionProblems(params, [{ meter: "video_second", unit_usd: 0.1, when: { resolution: "1080p" } }])).toEqual([]);
  });
  it("flags an unknown param or a value the param can't take", () => {
    expect(priceConditionProblems(params, [{ meter: "video_second", unit_usd: 0.1, when: { colour: "red" } }])).toHaveLength(1);
    expect(priceConditionProblems(params, [{ meter: "video_second", unit_usd: 0.1, when: { resolution: "8k" } }])).toHaveLength(1);
  });
  it("accepts the price dimensions the estimators add that are not params", () => {
    // Read imageDims / videoDims in image-price.ts / video-price.ts: every key they set that is not
    // a param name (e.g. audio, size) must be in ALLOWED_PRICE_DIMS and pass here.
    expect(priceConditionProblems(params, [{ meter: "video_second", unit_usd: 0.1, when: { audio: true } }])).toEqual([]);
  });
  it("passes every seeded price row of every model", () => {
    for (const p of catalog.prices) {
      const m = catalog.models.find((x) => x.id === p.modelId)!;
      expect(priceConditionProblems(m.params, p.lines), p.modelId).toEqual([]);
    }
  });
});

describe("checkNewPrice", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  const lines = [{ meter: "output_image" as const, unit_usd: 0.1 }];
  it("accepts a price starting now or later", () => {
    expect(checkNewPrice(row(NANO_PRO), { effectiveFrom: now, lines, estimate: {} }, [], now)).toEqual({ ok: true });
  });
  it("refuses the past, a taken start, and a condition on an unknown setting", () => {
    expect(checkNewPrice(row(NANO_PRO), { effectiveFrom: new Date("2026-11-22T00:00:00Z"), lines, estimate: {} }, [], now))
      .toEqual({ ok: false, error: "A price can't start in the past." });
    const taken = [{ ...catalog.prices[0], modelId: NANO_PRO, effectiveFrom: "2026-12-01T00:00:00.000Z" }];
    expect(checkNewPrice(row(NANO_PRO), { effectiveFrom: new Date("2026-12-01T00:00:00Z"), lines, estimate: {} }, taken, now))
      .toEqual({ ok: false, error: "This model already has a price starting then." });
    expect(checkNewPrice(row(NANO_PRO), { effectiveFrom: now, lines: [{ ...lines[0], when: { colour: "red" } }], estimate: {} }, [], now))
      .toEqual({ ok: false, error: "A price condition names a setting this model doesn't have." });
  });
});

describe("runPreviewUsd", () => {
  it("prices a default-settings image and video run, and nothing for other kinds", () => {
    const imagePrice = catalog.prices.find((p) => p.modelId === NANO_PRO)!;
    const videoPrice = catalog.prices.find((p) => p.modelId === OMNI12)!;
    expect(runPreviewUsd(row(NANO_PRO), imagePrice)).toBeGreaterThan(0);
    expect(runPreviewUsd(row(OMNI12), videoPrice)).toBeGreaterThan(0);
    const text = catalog.models.find((m) => m.kind === "text")!;
    expect(runPreviewUsd(text, catalog.prices.find((p) => p.modelId === text.id)!)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/ai-models/__tests__/model-edit.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `model-edit.ts`** (pure, client-safe, no `server-only`)

- `checkModelPatch`: reject any key not in `EDITABLE_MODEL_FIELDS` (`"These changes would break the model's settings."`, log the key). Merge `{ ...raw, ...patch }`. If the merged status is not `retired`, force `replaced_by: null` in `fields`. If retired and `replaced_by` is set, the target must exist in `ctx.models`, have the same `kind`, `status === "live"`, and differ from `raw.id`; else the replacement error. If merged status is `live` and `kind` is `image` or `video`, `adapter_key` must be in `ctx.runnableKeys`; else the can't-go-live error. Run `checkAiModelRow(merged)`; on failure return the break error with `log: problems`. Return `fields` = the patch plus any forced `replaced_by`.
- `priceConditionProblems(params, lines)`: for every `line.when` key: if the key is a param name, the value must be valid for it (select: in options; slider/number: a number within min/max; toggle: boolean); else the key must be in `ALLOWED_PRICE_DIMS`, a const list of the non-param dimensions `imageDims` / `videoDims` produce (read both functions and list exactly their extra keys). Return one plain string per problem (for the log).
- `checkNewPrice`: `effectiveFrom < now - 60 s` (a small allowance for a form submitted "now") → past error; an existing row of this model with the same `effectiveFrom` instant → taken error; `priceConditionProblems(model.params, lines).length > 0` → condition error; `lines.length === 0` or a negative `unit_usd` → `"These changes would break the model's settings."`.
- `runPreviewUsd`: image → `imageEstimateUsd(price, { modelId, quality, aspectRatio: aspect_ratio, imageSize: image_size, referenceCount: 0 })` from `paramDefaults(model.params)`; video → `videoEstimateUsd(price, { durationSeconds: Number(defaults.duration), audioEnabled: isVideoAudioEnabled(defaults.audio), resolution: asResolutionString(defaults.resolution), images: 0 })`; any other kind → `null`.

`runnable-keys.ts`:

```ts
import "server-only";
import { imageAdapters } from "@/lib/image-gen/adapters";
import { videoAdapters } from "@/lib/video-gen/adapters";

/** D569 — the adapter keys this build can run. An image or video model may be live only with one. */
export const RUNNABLE_ADAPTER_KEYS: ReadonlySet<string> = new Set([...Object.keys(imageAdapters), ...Object.keys(videoAdapters)]);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/ai-models` → PASS. tsc clean apart from `.next/`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-models/model-edit.ts src/lib/ai-models/runnable-keys.ts src/lib/ai-models/__tests__/model-edit.test.ts
git commit -m "feat(admin): one set of checks for every model and price edit (D569)"
```

---

### Task 3: The server actions

**Files:**
- Create: `src/lib/actions/ai-models.ts`
- Modify: `src/lib/actions/with-action-coverage.test.ts` (ALLOWLIST)
- Test: `src/lib/actions/ai-models.test.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin`, Task 1 helpers, Task 2 checks, `RUNNABLE_ADAPTER_KEYS`, `getAiCatalog`, `clearAiCatalogCache` (`src/lib/ai-models/catalog.ts`).
- Produces:
  ```ts
  export async function updateAiModelAction(id: string, patch: Record<string, unknown>): Promise<{ error?: string }>;
  export async function addAiModelPriceAction(input: { modelId: string; effectiveFrom: string; lines: PriceLine[]; estimate: Record<string, number>; sourceUrl?: string; note?: string }): Promise<{ error?: string }>;
  export async function cancelAiModelPriceAction(priceId: string, modelId: string): Promise<{ error?: string }>;
  ```

- [ ] **Step 1: Write the failing tests**

Mock `@/lib/auth/require-super-admin` (returns `{ userId: "u1" }`), `@/lib/db/ai-models-admin`, `@/lib/ai-models/catalog` (`getAiCatalog` → `seededModelCatalog()`, `clearAiCatalogCache` spy), `@/lib/ai-models/runnable-keys`, `next/cache` (`revalidatePath` spy). Cases:
  - a valid label change writes once with `updated_by` = caller, clears the cache once, revalidates `/admin/models` and `/admin/models/<id>`, returns `{}`;
  - a refused patch (e.g. `{ params: [] }`) writes nothing, clears nothing, returns the plain error;
  - an unknown model id returns `{ error: "Could not save. Try again." }` and writes nothing;
  - a database error on write returns `"Could not save. Try again."` (not the raw message);
  - `addAiModelPriceAction` with a past start returns the past error and inserts nothing; a valid one inserts with `created_by`, clears the cache;
  - `cancelAiModelPriceAction` when `deleteAiModelPrice` returns `{ deleted: false }` returns `"Only a price that hasn't started can be cancelled."`;
  - every action calls `requireSuperAdmin` before anything else (assert call order).

- [ ] **Step 2: Run them to verify they fail** → FAIL (module missing).

- [ ] **Step 3: Implement**

`"use server"`. Each action: `const caller = await requireSuperAdmin();` → read what it needs (`getAdminModel(id)` and `getAiCatalog()` in one `Promise.all`; for prices also `listAdminPrices(modelId)`) → the Task 2 check → write → `clearAiCatalogCache()` → `revalidatePath("/admin/models")` and the model's page → `{}`. Wrap the database calls in try/catch: `console.error` the real error, return `"Could not save. Try again."`. Use `getAdminModel(id).raw` (the database row) as the base of `checkModelPatch`, so a row the catalog dropped can still be fixed (D570). `addAiModelPriceAction` parses `effectiveFrom` as a date (`"Could not save. Try again."` when invalid) and uses `new Date()` as `now`.

Add the three names to the ALLOWLIST in `with-action-coverage.test.ts`, each with: `"ai-models.ts: /admin platform-administration (requireSuperAdmin()-gated); the catalog is platform-wide, not an org's data (D85, D569)."`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/actions` → PASS. tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/ai-models.ts src/lib/actions/ai-models.test.ts src/lib/actions/with-action-coverage.test.ts
git commit -m "feat(admin): save model and price changes through the checks (D569)"
```

---

### Task 4: Admin section nav and the models list

**Files:**
- Create: `src/components/admin/admin-section-nav.tsx`, `src/app/admin/layout.tsx`
- Create: `src/app/admin/models/page.tsx`, `src/app/admin/models/loading.tsx`
- Create: `src/components/admin/models/models-table.tsx`
- Test: `src/components/admin/models/__tests__/models-table.test.tsx`

**Interfaces:**
- Consumes: Task 1 reads; `currentPrice` (`src/lib/ai-models/pricing.ts`); `ListToolbar`, `Badge`, `Select`.
- Produces: `ModelsTable({ rows })` where `rows: Array<{ id; label; provider; kind; status; problems: string[]; priceSummary: string | null; runs; costUsd; unpriced }>`.

- [ ] **Step 1: Write the failing test**

Render `ModelsTable` with three rows (a live image model, a hidden video model with 2 unpriced runs, a row with problems) using `renderToStaticMarkup`. Assert: each label appears and links to `/admin/models/<id>` (URL-encode the id: ids contain `:`); the status text for each; "2 unpriced"; the problem row shows "Fails its check"; costs show as `$` with two decimals; a row with no price shows "No price".

- [ ] **Step 2: Run it to verify it fails** → FAIL.

- [ ] **Step 3: Implement**

- `admin-section-nav.tsx` (client): two ghost `Button` links, "Agencies" (`/admin`, active on `/admin` and `/admin/orgs*`) and "Models" (`/admin/models*`), underlined when active, the same style as `src/components/identity/admin-nav-link.tsx`.
- `src/app/admin/layout.tsx`: server layout rendering `<AdminSectionNav />` in a `mx-auto max-w-5xl px-6 pt-8` row above `{children}`. Do not call `requireSuperAdmin` here (each page does; a layout guard would duplicate the auth call per request — AGENTS.md rule 6). Check `src/app/loading-boundaries.test.ts` still passes.
- `models/page.tsx`: `requireSuperAdmin()`; month bounds as the org page computes them (UTC month start and next month start); `Promise.all([listAdminModels(), listAdminPrices(), modelMonthStats(from, to)])`; build `priceSummary` from the current price row (`currentPrice({ models, prices }, id, now)`): its lines as `"$0.134 / output image"` style, the first two lines then `+N more`; map stats by model id. Render a `font-display` heading "Models", the month label, and `<ModelsTable rows={…} />`.
- `models-table.tsx` (client): `ListToolbar` search on label and id; two `Select`s for kind and status ("All kinds", "All statuses"); rows grouped by kind with a `.text-eyebrow` group label; each row a link (`Link`) with label, provider, a status `Badge` (live: default; hidden: secondary; retired and draft: outline), price summary or "No price", runs, cost, and an "N unpriced" warning `Badge` when above 0; a problem row shows "Fails its check" instead of the price. Card styling as `orgs-table.tsx`.
- `loading.tsx`: a skeleton matching the table, using `Skeleton`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/admin src/app/loading-boundaries.test.ts` → PASS. tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/admin-section-nav.tsx src/app/admin/layout.tsx src/app/admin/models/page.tsx src/app/admin/models/loading.tsx src/components/admin/models/models-table.tsx src/components/admin/models/__tests__/models-table.test.tsx
git commit -m "feat(admin): the models list with this month's runs, cost and unpriced runs"
```

---

### Task 5: The model page — details, definition and month

**Files:**
- Create: `src/app/admin/models/[id]/page.tsx`
- Create: `src/components/admin/models/model-details-form.tsx`, `model-definition.tsx`, `model-month-stats.tsx`
- Test: `src/components/admin/models/__tests__/model-details-form.test.tsx`, `model-definition.test.tsx`

**Interfaces:**
- Consumes: Task 1 reads, `updateAiModelAction` (Task 3), `RUNNABLE_ADAPTER_KEYS`.
- Produces: `ModelDetailsForm({ model: { id; kind; label; pickerLabel; providerLabel; description; status; replacedBy; sortOrder }, canGoLive: boolean, replacements: Array<{ id; label }>, updatedBy: string | null, updatedAt: string })`.

- [ ] **Step 1: Write the failing tests**

- `ModelDetailsForm`: with `canGoLive: false` the "Live" status option is disabled and the note "This build has no code to run this model, so it can't go live." is shown; the replacement select renders only when the status is retired; "Last changed by <name>" with a relative time renders from `updatedBy` / `updatedAt`.
- `ModelDefinition`: renders each param's label, name, type and options or range, marks hidden params "hidden", lists each rule's reason, lists capabilities as key/value rows (nested `imageInputs` flattened as `imageInputs.maxReferenceImages`), and has no editable control (no `<input`, `<select`, `<textarea` in the markup).

- [ ] **Step 2: Run them to verify they fail** → FAIL.

- [ ] **Step 3: Implement**

- `[id]/page.tsx`: `requireSuperAdmin()`; `const id = decodeURIComponent((await params).id)`; `Promise.all([getAdminModel(id), listAdminModels(), listAdminPrices(id), modelMonthStats(from, to, id)])`; `notFound()` when absent; names for `updated_by` and every price `created_by` in one `displayNames` call. Breadcrumb Admin › Models › label. Sections, top to bottom: a problems `Card` when the row fails its check (title "This row fails its check", the problem list, and "The app leaves this model out until it is fixed." — D570); `ModelDetailsForm`; `ModelMonthStats`; the prices section (Task 6 fills it; leave a placeholder `div` with an id); `ModelDefinition`. `replacements` = live models of the same kind except this one, in sort order. `canGoLive` = kind not image/video, or `RUNNABLE_ADAPTER_KEYS.has(adapterKey)`.
- `model-details-form.tsx` (client): `Input` for label, picker label, provider label, `Textarea` for description, `Input type="number"` for sort order, `Select` for status (Draft, Live, Hidden, Retired; Live disabled with the note when `!canGoLive`), `Select` for the replacement (only when Retired; "No replacement" option). One "Save changes" primary `Button`, disabled until something changed; sends only changed fields to `updateAiModelAction`; shows the returned error under the button, or "Saved" for 2 s; follows the save/error pattern of `credit-limit-editor.tsx`. Inline-edit styling rules from AGENTS.md do not apply: this is a form.
- `model-definition.tsx` (server-safe, no client hooks): three sections "Settings", "Rules", "Limits" with `.text-eyebrow` headings, compact rows, monospace only for names (`font-mono text-xs`), plus a line "Changed by a migration. Editing here comes later." under the section header.
- `model-month-stats.tsx`: four figures (Runs, Provider cost, Credits charged, Unpriced runs) in one `Card`, the unpriced figure in the warning tone when above 0.

- [ ] **Step 4: Run the tests** → `npx vitest run src/components/admin` PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/models/[id]/page.tsx" src/components/admin/models/model-details-form.tsx src/components/admin/models/model-definition.tsx src/components/admin/models/model-month-stats.tsx src/components/admin/models/__tests__/model-details-form.test.tsx src/components/admin/models/__tests__/model-definition.test.tsx
git commit -m "feat(admin): a model's page with its details, month and read-only settings"
```

---

### Task 6: Prices — history, add and cancel

**Files:**
- Create: `src/components/admin/models/price-history.tsx`, `src/components/admin/models/add-price-sheet.tsx`
- Modify: `src/app/admin/models/[id]/page.tsx` (render them in the prices section)
- Test: `src/components/admin/models/__tests__/price-history.test.tsx`, `add-price-sheet.test.tsx`

**Interfaces:**
- Consumes: `AdminPriceRow` (Task 1); `addAiModelPriceAction`, `cancelAiModelPriceAction` (Task 3); `runPreviewUsd`, `checkNewPrice`, `priceConditionProblems` (Task 2); `usdToFinalCredits`; `METERS`.
- Produces: `PriceHistory({ modelId, prices: AdminPriceRow[], now: string })`, `AddPriceSheet({ model: AiModel, current: AiModelPrice | null })`.

- [ ] **Step 1: Write the failing tests**

- `PriceHistory`: newest first; the row in effect now carries a "Current" badge; a future row shows "Starts <date>" and a "Cancel" button; past and current rows have no Cancel; each line renders as `meter · $unit` with conditions as `resolution = 1080p`; source link, note and "Added by <name>" render.
- `AddPriceSheet`: the trigger "Add a price" renders; with `current` given, the form starts with the current row's lines and estimate copied in (so a change is an edit of what's there); the preview line reads "A default run: N credits (was M)" from `runPreviewUsd` on the draft and on `current` (test the pure helper that builds this text, exported from the file as `previewText(model, draft, current)`); for a text model the preview reads "No run preview for this kind of model."

- [ ] **Step 2: Run them to verify they fail** → FAIL.

- [ ] **Step 3: Implement**

- `price-history.tsx` (client, for the cancel button): a list of `Card`s; Cancel opens an `AlertDialog` ("Cancel this price? It hasn't started, so no run used it.") and calls `cancelAiModelPriceAction`; shows the error inline.
- `add-price-sheet.tsx` (client): a `Sheet` with: start date (`Input type="date"`, min today; today means now, a later day means 00:00 UTC that day — say so under the field), lines (rows of `Select` meter from `METERS`, `Input` $ per unit, and a conditions editor: "Add condition" dashed chip opening a key `Input` and value `Input`, values parsed as number or boolean when they look like one), estimate allowances (key `Input` + number `Input` rows, "Add allowance" chip), source URL `Input`, note `Textarea`. Below the form, the live preview (`previewText`) and any `priceConditionProblems` shown as plain warnings before saving. "Save price" primary `Button` calls `addAiModelPriceAction`; on success the sheet closes. Split into sub-components if the file passes ~200 lines (`price-lines-editor.tsx`, `price-allowances-editor.tsx`).
- Wire both into the model page's prices section with a `font-display` "Prices" heading.

- [ ] **Step 4: Run the tests** → `npx vitest run src/components/admin src/lib/ai-models src/lib/actions` PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/models/price-history.tsx src/components/admin/models/add-price-sheet.tsx "src/app/admin/models/[id]/page.tsx" src/components/admin/models/__tests__/price-history.test.tsx src/components/admin/models/__tests__/add-price-sheet.test.tsx <any split-out files>
git commit -m "feat(admin): add and cancel a model's dated prices, with a run preview"
```

---

### Task 7: Live check on dev (controller, with the user)

Not an implementer task. After Tasks 1–6: the user applies 0085 on dev and runs its verify SQL. Then on `http://localhost:3000/admin/models` (super admin login):

1. The list shows every model grouped by kind with this month's numbers; no request per row in the network tab (one page load).
2. Open Kling 3.0 Omni: set Hidden → Save; after a reload (or within 5 minutes in a tab already open; servers within 60 s) the Video Gen picker on a new node stops listing it, and a run on it is refused on the server; set Live again.
3. Open GPT Image 1 (retired): the Live option is disabled with the no-code note.
4. Add a price to a cheap image model starting tomorrow with the same lines: it shows "Starts …" with Cancel; cancel it.
5. Try a price starting yesterday: refused with "A price can't start in the past."

---

### Task 8: ADRs D569–D570

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, after D568; keep line endings)

- [ ] **Step 1: Append**

```markdown
### D569 — One guarded path for every model and price edit *(recorded 2026-11-23; follows D552, D563)*

**Decision.** The super admin changes models and prices only through three server actions (`src/lib/actions/ai-models.ts`), and each runs the same pure checks (`src/lib/ai-models/model-edit.ts`) before it writes. Phase 1 edits a model's labels, description, order, status and replacement, and adds or cancels a dated price row. An edited row must pass the catalog's own row check; a model's param names and their types never change through the admin; every price line's condition must name a setting the model has and a value it can take (or a price dimension the estimators add); an image or video model may be live only when this build has an adapter for its key; a replacement must be a live model of the same kind and is kept only while the model is retired. A price row is never edited, starts now or later, and can be cancelled only before it starts. After a write the action clears the catalog cache on its server; others pick the change up within 60 s. A later params editor adds a form on the same path, not new checks.

**Why.** A row that fails its check is left out of the catalog, so one bad edit would make a model vanish everywhere; and code reads params by name, so a renamed param breaks runs silently.

**Rejected.** Editing params, rules and capabilities in phase 1 (the checks are built for it; the form comes later). A free JSON editor (it bypasses the param-type and price-condition checks).

**Originated →** [2026-11-23-model-catalog-4-admin.md](../plans/2026-11-23-model-catalog-4-admin.md).

### D570 — The admin sees rows the catalog leaves out *(recorded 2026-11-23; refines D552)*

**Decision.** The admin pages read `ai_models` directly and run the row check themselves, so a row that fails it is listed with "Fails its check" and its problems, and can be fixed through D569's path (the edit starts from the stored row, not the catalog's copy). The models list's month figures come from one SQL function, `ai_model_month_stats` (migration 0085): runs, provider cost, credits charged and unpriced runs per model, where unpriced means no price row or a bill with meters the row did not price.

**Why.** The catalog drops a broken row with only a log line; without this the admin would see a model disappear and have no way to find out why.

**Rejected.** One query per model for its numbers (performance rule 1).

**Originated →** [2026-11-23-model-catalog-4-admin.md](../plans/2026-11-23-model-catalog-4-admin.md).
```

- [ ] **Step 2: Check encoding and line endings**, then commit:

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs: D569-D570 the super admin edits models and prices through one guarded path"
```

---

## Not in this plan

- **Param, rule and capability editor** (the checks exist; the form is next).
- **Adding a new model from the admin** (needs a migration and, for a new adapter key, code).
- **Per-agency model access and limits** (spec "Later").
- **Scoping the client-page catalog gate** (1b-ii deferred item).

## After the plan

Apply 0085 on dev, then run Task 7's checks. Staging and production need 0076–0085 before this branch deploys.
