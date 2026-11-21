# Model catalog 1a — tables, seed, loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The AI model catalog exists in the database, seeded from today's TypeScript registries, and the app can load it (server cache, `/api/ai-models`, a TanStack hook) without anything reading it yet.

**Architecture:** Two new tables (`ai_models`, `ai_model_prices`) and three `generations` columns (migration 0076). A pure seed builder turns the image and video client registries into rows; migration 0077 carries those rows as JSON, and a drift test keeps 0077 equal to the builder until Plan 1b deletes the registries. Rows are validated with Zod on load; a converter turns a row back into today's `ClientModelSpec` / `VideoGenClientModelSpec`, proven by a round-trip test. A server loader caches the catalog for 60 s; the browser reads it through the three-layer TanStack pattern.

**Tech Stack:** Next.js route handlers, Supabase Postgres (service-role client), Zod 4, Vitest 4, TanStack Query 5.

**Spec:** `docs/superpowers/specs/2026-11-21-model-catalog-design.md` (D529–D533).

**Later plans (not this one):** 1b — every reader moves to the catalog and the registries are deleted. 2 — pricing module, provider bills for every adapter, price seed. 3 — record-only features. 4 — super-admin screens.

## Global Constraints

- Migration numbers start at **0076** (0062–0075 are used on the permissions and Razorpay branches).
- Decision numbers in code comments: **D529** (catalog), **D530** (prices), **D531** (bills), **D532** (record only), **D533** (margin, access later).
- Tables are default-deny under RLS: only the service-role client (`createServerSupabase`) reads or writes them.
- Model ids stay exactly as today (`gemini:gemini-omni-1.2-flash`, …).
- `kind` values: `image`, `video`, `edit`, `voice`, `dub`, `lipsync`, `transcribe`, `text`, `scrape`.
- `status` values: `draft`, `live`, `hidden`, `retired`.
- Meters: `input_token`, `cached_input_token`, `text_output_token`, `thought_token`, `image_output_token`, `video_output_token`, `output_image`, `input_image`, `video_second`, `audio_second`, `character`, `provider_unit`, `provider_credit`, `usd`, `request`.
- Server catalog cache: 60 seconds. Browser stale time: 5 minutes. Nothing loads per node.
- API routes use `apiOk` / `apiError` from `src/lib/api/route-helpers.ts`, never `NextResponse.json`.
- Every migration gets an entry in `docs/auth-production-migration.md` in the same commit.
- Commits carry no AI attribution lines.
- Migrations are applied by hand in the Supabase SQL editor (staging first). The implementer does not apply them.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0076_ai_model_catalog.sql` | the two tables, the price guard trigger, the `generations` columns and indexes |
| `supabase/migrations/0077_ai_models_seed.sql` | generated: today's models as rows |
| `src/lib/ai-models/types.ts` | catalog types and the kind/status/meter lists |
| `src/lib/ai-models/schema.ts` | Zod checks for a model row and a price row, and row → type mapping |
| `src/lib/ai-models/to-spec.ts` | a catalog model → today's image or video client spec |
| `src/lib/ai-models/seed.ts` | registries → seed rows, and seed rows → migration SQL |
| `src/lib/ai-models/catalog.ts` | server loader with the 60 s cache, and `currentPrice` |
| `src/app/api/ai-models/route.ts` | `GET /api/ai-models` |
| `src/services/ai-models.service.ts` | the browser call |
| `src/hooks/queries/ai-models.ts` | `aiModelKeys`, `useAiCatalog` |
| `docs/auth-production-migration.md` | entry for 0076 + 0077 |

Tests live in `src/lib/ai-models/__tests__/`, next to the route (`src/app/api/ai-models/route.test.ts`) and next to the service (`src/services/ai-models.service.test.ts`).

---

### Task 1: Migration 0076 — tables, guard, generations columns

**Files:**
- Create: `supabase/migrations/0076_ai_model_catalog.sql`
- Modify: `docs/auth-production-migration.md` (append at the end)

**Interfaces:**
- Produces: tables `ai_models`, `ai_model_prices`; columns `generations.model_price_id`, `generations.provider_bill`, `generations.record_only`. Column names below are used by every later task.

This task is SQL only; it has no unit test. It is verified by the queries in Step 3 once the user applies it to staging.

- [ ] **Step 1: Write the migration**

```sql
-- D529–D533: the AI model catalog. docs/superpowers/specs/2026-11-21-model-catalog-design.md
-- Every model the app runs is a row in ai_models; its prices are dated rows in ai_model_prices
-- that are never edited. generations gains the price row a run used, the provider's bill, and a
-- flag for calls that record their cost without charging credits.

create table if not exists ai_models (
  id                text primary key,
  provider          text not null,
  kind              text not null check (kind in
                      ('image','video','edit','voice','dub','lipsync','transcribe','text','scrape')),
  label             text not null,
  picker_label      text,
  provider_label    text not null,
  description       text,
  status            text not null default 'draft' check (status in ('draft','live','hidden','retired')),
  replaced_by       text references ai_models(id),
  sort_order        integer not null default 0,
  adapter_key       text not null,
  provider_model_id text,
  params            jsonb not null default '[]'::jsonb check (jsonb_typeof(params) = 'array'),
  rules             jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),
  capabilities      jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities) = 'object'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null,
  check (replaced_by is null or replaced_by <> id)
);

create index if not exists ai_models_replaced_by_idx on ai_models (replaced_by);

-- Default-deny: only the service role touches it.
alter table ai_models enable row level security;

-- D530: one row per model per start date, never edited. A run uses the row with the latest
-- effective_from at or before its start.
create table if not exists ai_model_prices (
  id              uuid primary key default gen_random_uuid(),
  model_id        text not null references ai_models(id),
  effective_from  timestamptz not null,
  lines           jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
  estimate        jsonb not null default '{}'::jsonb check (jsonb_typeof(estimate) = 'object'),
  source_url      text,
  note            text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- Also serves every lookup by model_id (its leading column), so no separate FK index.
  unique (model_id, effective_from)
);

alter table ai_model_prices enable row level security;

-- A price row is never edited; one that has not started yet may be deleted (cancelled).
create or replace function ai_model_prices_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'ai_model_prices rows are never edited; add a new row';
  end if;
  if old.effective_from <= now() then
    raise exception 'a price that has started cannot be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists ai_model_prices_guard on ai_model_prices;
create trigger ai_model_prices_guard
  before update or delete on ai_model_prices
  for each row execute function ai_model_prices_guard();

-- D531, D532.
alter table generations
  add column if not exists model_price_id uuid references ai_model_prices(id),
  add column if not exists provider_bill  jsonb,
  add column if not exists record_only    boolean not null default false;

create index if not exists generations_model_price_id_idx on generations (model_price_id);
-- Usage reports read record-only rows by org and month; canvas and history queries go by node.
create index if not exists generations_org_record_only_created_idx
  on generations (org_id, record_only, created_at);
```

- [ ] **Step 2: Add the migration doc entry**

Append to `docs/auth-production-migration.md`:

````markdown
## Migrations 0076 + 0077 — AI model catalog (D529–D533, 2026-11-21)

`supabase/migrations/0076_ai_model_catalog.sql` (the `ai_models` and `ai_model_prices` tables, the
price guard, three `generations` columns) and `supabase/migrations/0077_ai_models_seed.sql` (today's
image and video models as rows). Paste each into the Supabase SQL editor → Run, in order.

Nothing reads the catalog yet (Plan 1b switches the readers), so no deploy order applies.

**Safe to re-run:** 0076 uses `if not exists` / `create or replace` / `drop trigger if exists`;
0077 inserts with `on conflict (id) do nothing`.

**Verify after running:**

```sql
-- expect both true
select relrowsecurity from pg_class where relname in ('ai_models', 'ai_model_prices');
-- expect the three new columns
select column_name from information_schema.columns
where table_name = 'generations' and column_name in ('model_price_id', 'provider_bill', 'record_only');
-- expect 23 rows: 19 live, 4 retired (gpt-image-1 and the three Veo models)
select status, count(*) from ai_models group by status;
-- expect an error: "ai_model_prices rows are never edited"
-- (only once Plan 2 has seeded prices) update ai_model_prices set note = note;
```
````

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0076_ai_model_catalog.sql docs/auth-production-migration.md
git commit -m "feat(models): ai_models and ai_model_prices tables (migration 0076, D529, D530)"
```

The counts in the verify block (23 / 19 / 4) are checked against the seed in Task 4, Step 4; correct them there if the seed differs.

---

### Task 2: Catalog types and row checks

**Files:**
- Create: `src/lib/ai-models/types.ts`
- Create: `src/lib/ai-models/schema.ts`
- Test: `src/lib/ai-models/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: `ParamSpec` from `@/lib/image-gen/types`; `ConstraintRule` from `@/lib/video-gen/types`.
- Produces:
  - `AI_MODEL_KINDS`, `AiModelKind`, `AI_MODEL_STATUSES`, `AiModelStatus`, `METERS`, `Meter`
  - `type AiModel = { id; provider; kind; label; pickerLabel: string | null; providerLabel; description: string | null; status; replacedBy: string | null; sortOrder: number; adapterKey; providerModelId: string | null; params: ParamSpec[]; rules: ConstraintRule[]; capabilities: Record<string, unknown>; updatedAt: string }`
  - `type PriceLine = { meter: Meter; unit_usd: number; when?: Record<string, string | number | boolean> }`
  - `type AiModelPrice = { id; modelId; effectiveFrom: string; lines: PriceLine[]; estimate: Record<string, number>; sourceUrl: string | null; note: string | null }`
  - `type AiCatalog = { models: AiModel[]; prices: AiModelPrice[] }`
  - `parseAiModelRow(row: unknown): AiModel | null`, `parseAiModelPriceRow(row: unknown): AiModelPrice | null`
  - `MODEL_COLUMNS`, `PRICE_COLUMNS` (select strings)

- [ ] **Step 1: Write the failing test**

`src/lib/ai-models/__tests__/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAiModelRow, parseAiModelPriceRow } from "../schema";

const ROW = {
  id: "gemini:gemini-omni-1.2-flash",
  provider: "gemini",
  kind: "video",
  label: "Gemini Omni 1.2 Flash",
  picker_label: "Omni 1.2",
  provider_label: "Google",
  description: null,
  status: "live",
  replaced_by: null,
  sort_order: 7,
  adapter_key: "video:gemini",
  provider_model_id: null,
  params: [
    {
      name: "resolution", label: "Resolution", component: "select", group: "primary", order: 0,
      visible: true, defaultValue: "720p", constraints: { type: "select", options: ["360p", "720p"] },
    },
  ],
  rules: [
    {
      id: "end-needs-start",
      when: { op: "and", conditions: [
        { field: "hasEndFrame", op: "eq", value: true },
        { field: "hasStartFrame", op: "eq", value: false },
      ] },
      effect: { disableGenerate: true },
      reason: "End frame needs a start frame",
    },
  ],
  capabilities: { maxDurationSeconds: 15, imageInputs: { startFrame: true, endFrame: true, maxReferenceImages: 3 } },
  updated_at: "2026-11-21T00:00:00Z",
};

describe("parseAiModelRow", () => {
  it("maps a valid row to an AiModel", () => {
    expect(parseAiModelRow(ROW)).toEqual({
      id: "gemini:gemini-omni-1.2-flash",
      provider: "gemini",
      kind: "video",
      label: "Gemini Omni 1.2 Flash",
      pickerLabel: "Omni 1.2",
      providerLabel: "Google",
      description: null,
      status: "live",
      replacedBy: null,
      sortOrder: 7,
      adapterKey: "video:gemini",
      providerModelId: null,
      params: ROW.params,
      rules: ROW.rules,
      capabilities: ROW.capabilities,
      updatedAt: "2026-11-21T00:00:00Z",
    });
  });

  it("refuses an unknown kind or status", () => {
    expect(parseAiModelRow({ ...ROW, kind: "podcast" })).toBeNull();
    expect(parseAiModelRow({ ...ROW, status: "beta" })).toBeNull();
  });

  it("refuses a param whose constraints don't fit its type", () => {
    const bad = { ...ROW, params: [{ ...ROW.params[0], constraints: { type: "slider", min: 1 } }] };
    expect(parseAiModelRow(bad)).toBeNull();
  });

  it("refuses a rule with an unknown condition field", () => {
    const bad = { ...ROW, rules: [{ ...ROW.rules[0], when: { field: "colour", op: "eq", value: true } }] };
    expect(parseAiModelRow(bad)).toBeNull();
  });
});

const PRICE = {
  id: "p1",
  model_id: "gemini:gemini-omni-1.2-flash",
  effective_from: "2026-11-21T00:00:00Z",
  lines: [
    { meter: "video_output_token", unit_usd: 0.000012 },
    { meter: "video_second", unit_usd: 0.104, when: { resolution: "1080p" } },
  ],
  estimate: { thought_token: 1500 },
  source_url: "https://aistudio.google.com/docs/pricing",
  note: null,
};

describe("parseAiModelPriceRow", () => {
  it("maps a valid row to an AiModelPrice", () => {
    expect(parseAiModelPriceRow(PRICE)).toEqual({
      id: "p1",
      modelId: "gemini:gemini-omni-1.2-flash",
      effectiveFrom: "2026-11-21T00:00:00Z",
      lines: PRICE.lines,
      estimate: { thought_token: 1500 },
      sourceUrl: "https://aistudio.google.com/docs/pricing",
      note: null,
    });
  });

  it("refuses an unknown meter, a negative price or no lines", () => {
    expect(parseAiModelPriceRow({ ...PRICE, lines: [{ meter: "vibes", unit_usd: 1 }] })).toBeNull();
    expect(parseAiModelPriceRow({ ...PRICE, lines: [{ meter: "request", unit_usd: -1 }] })).toBeNull();
    expect(parseAiModelPriceRow({ ...PRICE, lines: [] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ai-models/__tests__/schema.test.ts`
Expected: FAIL — `Cannot find module '../schema'` (or "Failed to load url").

- [ ] **Step 3: Write `types.ts`**

```ts
// D529 — the AI model catalog, as the app reads it. Rows live in ai_models / ai_model_prices
// (migration 0076); src/lib/ai-models/schema.ts checks them on load. Client-safe.
import type { ParamSpec } from "@/lib/image-gen/types";
import type { ConstraintRule } from "@/lib/video-gen/types";

export const AI_MODEL_KINDS = [
  "image", "video", "edit", "voice", "dub", "lipsync", "transcribe", "text", "scrape",
] as const;
export type AiModelKind = (typeof AI_MODEL_KINDS)[number];

export const AI_MODEL_STATUSES = ["draft", "live", "hidden", "retired"] as const;
export type AiModelStatus = (typeof AI_MODEL_STATUSES)[number];

// D531 — what a provider bill and a price line are counted in.
export const METERS = [
  "input_token", "cached_input_token", "text_output_token", "thought_token",
  "image_output_token", "video_output_token", "output_image", "input_image",
  "video_second", "audio_second", "character", "provider_unit", "provider_credit", "usd", "request",
] as const;
export type Meter = (typeof METERS)[number];

export type AiModel = {
  id: string;
  provider: string;
  kind: AiModelKind;
  label: string;
  pickerLabel: string | null;
  providerLabel: string;
  description: string | null;
  status: AiModelStatus;
  replacedBy: string | null;
  sortOrder: number;
  adapterKey: string;
  providerModelId: string | null;
  params: ParamSpec[];
  rules: ConstraintRule[];
  capabilities: Record<string, unknown>;
  updatedAt: string;
};

/** D530 — one price line. `when` lists request params that must all match; none = any run. */
export type PriceLine = {
  meter: Meter;
  unit_usd: number;
  when?: Record<string, string | number | boolean>;
};

export type AiModelPrice = {
  id: string;
  modelId: string;
  effectiveFrom: string;
  lines: PriceLine[];
  /** Quantities added to the estimate only, e.g. { thought_token: 1500 }. */
  estimate: Record<string, number>;
  sourceUrl: string | null;
  note: string | null;
};

export type AiCatalog = { models: AiModel[]; prices: AiModelPrice[] };
```

- [ ] **Step 4: Write `schema.ts`**

```ts
// D529 — a catalog row is checked before the app uses it. A row that fails is left out of the
// catalog (the loader logs it), never half used.
import { z } from "zod";
import type { ParamSpec } from "@/lib/image-gen/types";
import type { ConstraintRule } from "@/lib/video-gen/types";
import { AI_MODEL_KINDS, AI_MODEL_STATUSES, METERS, type AiModel, type AiModelPrice, type PriceLine } from "./types";

export const MODEL_COLUMNS =
  "id, provider, kind, label, picker_label, provider_label, description, status, replaced_by, " +
  "sort_order, adapter_key, provider_model_id, params, rules, capabilities, updated_at";
export const PRICE_COLUMNS = "id, model_id, effective_from, lines, estimate, source_url, note";

const paramConstraintsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("select"), options: z.array(z.string()) }),
  z.object({ type: z.literal("slider"), min: z.number(), max: z.number(), step: z.number().optional() }),
  z.object({ type: z.literal("toggle") }),
  z.object({
    type: z.literal("number"),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
  }),
  z.object({ type: z.literal("textarea"), maxLength: z.number().optional() }),
]);

const paramSpecSchema = z.object({
  name: z.string().min(1),
  label: z.string(),
  component: z.enum(["select", "slider", "toggle", "number", "textarea"]),
  group: z.enum(["primary", "advanced"]),
  order: z.number(),
  visible: z.boolean(),
  defaultValue: z.unknown(),
  constraints: paramConstraintsSchema,
  description: z.string().optional(),
});

const leafConditionSchema = z.object({
  field: z.enum(["referenceCount", "hasEndFrame", "hasStartFrame", "duration"]),
  op: z.enum(["gt", "gte", "eq"]),
  value: z.union([z.number(), z.boolean()]),
});

type ConditionShape =
  | z.infer<typeof leafConditionSchema>
  | { op: "and" | "or"; conditions: ConditionShape[] };

const conditionSchema: z.ZodType<ConditionShape> = z.lazy(() =>
  z.union([
    leafConditionSchema,
    z.object({ op: z.enum(["and", "or"]), conditions: z.array(conditionSchema) }),
  ]),
);

const constraintRuleSchema = z.object({
  id: z.string().min(1),
  when: conditionSchema,
  effect: z.object({
    lockParams: z.array(z.object({ name: z.string(), value: z.unknown() })).optional(),
    disableFrameInputs: z.boolean().optional(),
    disableRefs: z.boolean().optional(),
    disableGenerate: z.boolean().optional(),
  }),
  reason: z.string(),
});

const aiModelRowSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  kind: z.enum(AI_MODEL_KINDS),
  label: z.string(),
  picker_label: z.string().nullable(),
  provider_label: z.string(),
  description: z.string().nullable(),
  status: z.enum(AI_MODEL_STATUSES),
  replaced_by: z.string().nullable(),
  sort_order: z.number().int(),
  adapter_key: z.string().min(1),
  provider_model_id: z.string().nullable(),
  params: z.array(paramSpecSchema),
  rules: z.array(constraintRuleSchema),
  capabilities: z.record(z.string(), z.unknown()),
  updated_at: z.string(),
});

const priceLineSchema = z.object({
  meter: z.enum(METERS),
  unit_usd: z.number().nonnegative(),
  when: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const aiModelPriceRowSchema = z.object({
  id: z.string().min(1),
  model_id: z.string().min(1),
  effective_from: z.string(),
  lines: z.array(priceLineSchema).min(1),
  estimate: z.record(z.string(), z.number().nonnegative()),
  source_url: z.string().nullable(),
  note: z.string().nullable(),
});

export function parseAiModelRow(row: unknown): AiModel | null {
  const parsed = aiModelRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    id: r.id,
    provider: r.provider,
    kind: r.kind,
    label: r.label,
    pickerLabel: r.picker_label,
    providerLabel: r.provider_label,
    description: r.description,
    status: r.status,
    replacedBy: r.replaced_by,
    sortOrder: r.sort_order,
    adapterKey: r.adapter_key,
    providerModelId: r.provider_model_id,
    // The Zod shapes above mirror ParamSpec and ConstraintRule field for field.
    params: r.params as ParamSpec[],
    rules: r.rules as ConstraintRule[],
    capabilities: r.capabilities,
    updatedAt: r.updated_at,
  };
}

export function parseAiModelPriceRow(row: unknown): AiModelPrice | null {
  const parsed = aiModelPriceRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    id: r.id,
    modelId: r.model_id,
    effectiveFrom: r.effective_from,
    lines: r.lines as PriceLine[],
    estimate: r.estimate,
    sourceUrl: r.source_url,
    note: r.note,
  };
}
```

- [ ] **Step 5: Run the test to make sure it passes**

Run: `npx vitest run src/lib/ai-models/__tests__/schema.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai-models/types.ts src/lib/ai-models/schema.ts src/lib/ai-models/__tests__/schema.test.ts
git commit -m "feat(models): catalog types and row checks (D529)"
```

---

### Task 3: Seed rows from the registries, and back to specs

**Files:**
- Create: `src/lib/ai-models/seed.ts`
- Create: `src/lib/ai-models/to-spec.ts`
- Test: `src/lib/ai-models/__tests__/seed.test.ts`

**Interfaces:**
- Consumes: `parseAiModelRow` (Task 2); `imageGenClientModels`, `DEPRECATED_IMAGE_MODEL_FALLBACK_ID` from `@/lib/image-gen/client-models`; `videoGenClientModelMap`, `DEFAULT_VIDEO_CLIENT_MODEL_ID` from `@/lib/video-gen/client-models`; `buildZodFromParams` from `@/lib/image-gen/schema-builder`.
- Produces:
  - `type AiModelSeedRow` (snake-case columns of `ai_models` minus `description`, `provider_model_id`, timestamps)
  - `seedRowsFromRegistries(): AiModelSeedRow[]` — live rows first, retired last
  - `seedSql(rows: AiModelSeedRow[]): string`
  - `SEED_JSON_TAG = "$seed$"`
  - `toImageClientSpec(model: AiModel): ClientModelSpec`, `toVideoClientSpec(model: AiModel): VideoGenClientModelSpec`

- [ ] **Step 1: Write the failing test**

`src/lib/ai-models/__tests__/seed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { seedRowsFromRegistries, seedSql } from "../seed";
import { parseAiModelRow } from "../schema";
import { toImageClientSpec, toVideoClientSpec } from "../to-spec";
import { imageGenClientModels, DEPRECATED_IMAGE_MODEL_FALLBACK_ID } from "@/lib/image-gen/client-models";
import { videoGenClientModelMap, DEFAULT_VIDEO_CLIENT_MODEL_ID } from "@/lib/video-gen/client-models";

// A seed row as the database returns it: through JSON, with the columns the seed leaves to defaults.
const asStored = (row: object) => ({
  ...JSON.parse(JSON.stringify(row)),
  description: null,
  provider_model_id: null,
  updated_at: "2026-11-21T00:00:00Z",
});

describe("seedRowsFromRegistries", () => {
  const rows = seedRowsFromRegistries();

  it("has one row per image and video model, ids unique", () => {
    const expected = imageGenClientModels.length + Object.keys(videoGenClientModelMap).length;
    expect(rows).toHaveLength(expected);
    expect(new Set(rows.map((r) => r.id)).size).toBe(expected);
  });

  it("passes the catalog's row check, every row", () => {
    for (const row of rows) expect(parseAiModelRow(asStored(row)), row.id).not.toBeNull();
  });

  it("retires the deprecated models, pointing at today's fallbacks, after every live row", () => {
    const firstRetired = rows.findIndex((r) => r.status === "retired");
    expect(rows.slice(firstRetired).every((r) => r.status === "retired")).toBe(true);
    for (const r of rows.filter((x) => x.status === "retired")) {
      expect(r.replaced_by).toBe(r.kind === "image" ? DEPRECATED_IMAGE_MODEL_FALLBACK_ID : DEFAULT_VIDEO_CLIENT_MODEL_ID);
    }
    expect(rows.find((r) => r.id === "openai:gpt-image-1")?.status).toBe("retired");
    expect(rows.filter((r) => r.id.startsWith("veo:")).every((r) => r.status === "retired")).toBe(true);
  });
});

describe("catalog row → client spec (round trip)", () => {
  const byId = new Map(seedRowsFromRegistries().map((r) => [r.id, parseAiModelRow(asStored(r))!]));

  it("gives back every image spec as the registry has it", () => {
    for (const spec of imageGenClientModels) {
      const { schema: expectedSchema, ...expected } = spec;
      const { schema, ...actual } = toImageClientSpec(byId.get(spec.id)!);
      expect(actual, spec.id).toEqual(expected);
      // Same params → same validator: both accept the params' own defaults.
      expect(schema.safeParse({}).success).toBe(expectedSchema.safeParse({}).success);
    }
  });

  it("gives back every video spec as the registry has it", () => {
    for (const spec of Object.values(videoGenClientModelMap)) {
      expect(toVideoClientSpec(byId.get(spec.id)!), spec.id).toEqual({ ...spec, rules: spec.rules ?? [] });
    }
  });
});

describe("seedSql", () => {
  it("embeds the rows as JSON inside the $seed$ tag and inserts with on conflict do nothing", () => {
    const rows = seedRowsFromRegistries();
    const sql = seedSql(rows);
    const json = sql.slice(sql.indexOf("$seed$") + 6, sql.lastIndexOf("$seed$"));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(rows)));
    expect(sql).toContain("insert into ai_models");
    expect(sql).toContain("on conflict (id) do nothing");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ai-models/__tests__/seed.test.ts`
Expected: FAIL — cannot find `../seed`.

- [ ] **Step 3: Write `to-spec.ts`**

```ts
// D529 — a catalog model as the spec shapes the app reads today, so Plan 1b can swap the
// registries for the catalog without touching their readers. Client-safe.
import type { ClientModelSpec } from "@/lib/image-gen/types";
import type { VideoGenClientModelSpec } from "@/lib/video-gen/types";
import { buildZodFromParams } from "@/lib/image-gen/schema-builder";
import type { AiModel } from "./types";

type ImageCapabilities = Omit<
  ClientModelSpec,
  "id" | "provider" | "mediaType" | "label" | "providerLabel" | "deprecated" | "params" | "schema"
>;
type VideoCapabilities = Omit<
  VideoGenClientModelSpec,
  "id" | "provider" | "label" | "pickerLabel" | "providerLabel" | "deprecated" | "params" | "rules"
>;

export function toImageClientSpec(model: AiModel): ClientModelSpec {
  return {
    id: model.id,
    provider: model.provider,
    mediaType: "image",
    label: model.label,
    providerLabel: model.providerLabel,
    ...(model.status === "retired" ? { deprecated: true } : {}),
    ...(model.capabilities as ImageCapabilities),
    params: model.params,
    schema: buildZodFromParams(model.params),
  };
}

export function toVideoClientSpec(model: AiModel): VideoGenClientModelSpec {
  return {
    id: model.id,
    provider: model.provider as VideoGenClientModelSpec["provider"],
    label: model.label,
    ...(model.pickerLabel ? { pickerLabel: model.pickerLabel } : {}),
    providerLabel: model.providerLabel,
    ...(model.status === "retired" ? { deprecated: true } : {}),
    ...(model.capabilities as VideoCapabilities),
    params: model.params,
    rules: model.rules,
  };
}
```

- [ ] **Step 4: Write `seed.ts`**

```ts
// D529 — today's image and video registries as ai_models rows, for migration 0077. Lives until
// Plan 1b deletes the registries; the drift test (seed-migration.test.ts) keeps 0077 equal to it.
import type { ParamSpec } from "@/lib/image-gen/types";
import type { ConstraintRule } from "@/lib/video-gen/types";
import { imageGenClientModels, DEPRECATED_IMAGE_MODEL_FALLBACK_ID } from "@/lib/image-gen/client-models";
import { videoGenClientModelMap, DEFAULT_VIDEO_CLIENT_MODEL_ID } from "@/lib/video-gen/client-models";

export const SEED_JSON_TAG = "$seed$";

export type AiModelSeedRow = {
  id: string;
  provider: string;
  kind: "image" | "video";
  label: string;
  picker_label: string | null;
  provider_label: string;
  status: "live" | "retired";
  replaced_by: string | null;
  sort_order: number;
  adapter_key: string;
  params: ParamSpec[];
  rules: ConstraintRule[];
  capabilities: Record<string, unknown>;
};

export function seedRowsFromRegistries(): AiModelSeedRow[] {
  const image: AiModelSeedRow[] = imageGenClientModels.map((m, i) => {
    // Everything that isn't a column is a capability; the Zod schema is rebuilt from params.
    const { id, provider, label, providerLabel, deprecated, params, schema: _schema, mediaType: _mediaType, ...capabilities } = m;
    return {
      id,
      provider,
      kind: "image",
      label,
      picker_label: null,
      provider_label: providerLabel,
      status: deprecated ? "retired" : "live",
      replaced_by: deprecated ? DEPRECATED_IMAGE_MODEL_FALLBACK_ID : null,
      sort_order: i,
      adapter_key: `image:${provider}`,
      params,
      rules: [],
      capabilities,
    };
  });

  const video: AiModelSeedRow[] = Object.values(videoGenClientModelMap).map((m, i) => {
    const { id, provider, label, pickerLabel, providerLabel, deprecated, params, rules, ...capabilities } = m;
    return {
      id,
      provider,
      kind: "video",
      label,
      picker_label: pickerLabel ?? null,
      provider_label: providerLabel,
      status: deprecated ? "retired" : "live",
      replaced_by: deprecated ? DEFAULT_VIDEO_CLIENT_MODEL_ID : null,
      sort_order: i,
      adapter_key: `video:${provider}`,
      params,
      rules: rules ?? [],
      capabilities,
    };
  });

  // Retired rows last, so the model each one is replaced by is inserted before it.
  const rows = [...image, ...video];
  return [...rows.filter((r) => r.status === "live"), ...rows.filter((r) => r.status === "retired")];
}

export function seedSql(rows: AiModelSeedRow[]): string {
  const json = JSON.stringify(rows, null, 2);
  if (json.includes(SEED_JSON_TAG)) throw new Error(`Seed JSON contains ${SEED_JSON_TAG}`);
  const cols =
    "id, provider, kind, label, picker_label, provider_label, status, replaced_by, sort_order, " +
    "adapter_key, params, rules, capabilities";
  return [
    "-- D529: today's image and video models, from the TypeScript registries.",
    "-- Generated by src/lib/ai-models/seed.ts. Regenerate with:",
    "--   UPDATE_SEED=1 npx vitest run src/lib/ai-models/__tests__/seed-migration.test.ts",
    `insert into ai_models (${cols})`,
    `select ${cols}`,
    `from jsonb_to_recordset(${SEED_JSON_TAG}${json}${SEED_JSON_TAG}::jsonb) as r(`,
    "  id text, provider text, kind text, label text, picker_label text, provider_label text,",
    "  status text, replaced_by text, sort_order integer, adapter_key text,",
    "  params jsonb, rules jsonb, capabilities jsonb",
    ")",
    "on conflict (id) do nothing;",
    "",
  ].join("\n");
}
```

- [ ] **Step 5: Run the test to make sure it passes**

Run: `npx vitest run src/lib/ai-models/__tests__/seed.test.ts`
Expected: PASS, 6 tests. If the round-trip test fails for a model, the failure names the model id and the differing key: fix `to-spec.ts` (never the registry).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai-models/seed.ts src/lib/ai-models/to-spec.ts src/lib/ai-models/__tests__/seed.test.ts
git commit -m "feat(models): seed rows from the registries, and catalog rows back to specs (D529)"
```

---

### Task 4: Migration 0077 and its drift test

**Files:**
- Create: `src/lib/ai-models/__tests__/seed-migration.test.ts`
- Create (generated): `supabase/migrations/0077_ai_models_seed.sql`

**Interfaces:**
- Consumes: `seedRowsFromRegistries`, `seedSql`, `SEED_JSON_TAG` (Task 3).
- Produces: `supabase/migrations/0077_ai_models_seed.sql`.

- [ ] **Step 1: Write the drift test**

`src/lib/ai-models/__tests__/seed-migration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { seedRowsFromRegistries, seedSql, SEED_JSON_TAG } from "../seed";

// D529 — migration 0077 must hold exactly today's registries until Plan 1b deletes them.
// After 0077 is applied anywhere, a registry change needs a new migration, not a rewrite of 0077.
// Vitest runs from the repo root.
const FILE = resolve(process.cwd(), "supabase/migrations/0077_ai_models_seed.sql");

describe("migration 0077 (ai_models seed)", () => {
  it("matches the registries", () => {
    const rows = seedRowsFromRegistries();
    if (process.env.UPDATE_SEED === "1") writeFileSync(FILE, seedSql(rows));

    expect(existsSync(FILE), "run with UPDATE_SEED=1 to write it").toBe(true);
    const sql = readFileSync(FILE, "utf8");
    const json = sql.slice(sql.indexOf(SEED_JSON_TAG) + SEED_JSON_TAG.length, sql.lastIndexOf(SEED_JSON_TAG));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(rows)));
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ai-models/__tests__/seed-migration.test.ts`
Expected: FAIL — "run with UPDATE_SEED=1 to write it: expected false to be true".

- [ ] **Step 3: Generate the migration**

Run (Git Bash): `UPDATE_SEED=1 npx vitest run src/lib/ai-models/__tests__/seed-migration.test.ts`
Expected: PASS, and `supabase/migrations/0077_ai_models_seed.sql` now exists.

- [ ] **Step 4: Check the generated file and the doc's counts**

Run: `grep -c '"status": "retired"' supabase/migrations/0077_ai_models_seed.sql; grep -c '"status": "live"' supabase/migrations/0077_ai_models_seed.sql`
Expected: `4` and `19`. If they differ, correct the counts in the `docs/auth-production-migration.md` verify block (Task 1, Step 2) to match.

Run: `npx vitest run src/lib/ai-models/__tests__/seed-migration.test.ts`
Expected: PASS without `UPDATE_SEED`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0077_ai_models_seed.sql src/lib/ai-models/__tests__/seed-migration.test.ts docs/auth-production-migration.md
git commit -m "feat(models): seed today's models into ai_models (migration 0077, D529)"
```

---

### Task 5: Server loader with a 60-second cache

**Files:**
- Create: `src/lib/ai-models/catalog.ts`
- Test: `src/lib/ai-models/__tests__/catalog.test.ts`

**Interfaces:**
- Consumes: `parseAiModelRow`, `parseAiModelPriceRow`, `MODEL_COLUMNS`, `PRICE_COLUMNS` (Task 2); `createServerSupabase` from `@/lib/supabase/server`.
- Produces:
  - `getAiCatalog(): Promise<AiCatalog>` — cached 60 s; concurrent callers share one load; a failed load throws and caches nothing
  - `clearAiCatalogCache(): void`
  - `currentPrice(catalog: AiCatalog, modelId: string, at: Date): AiModelPrice | null`
  - `CATALOG_CACHE_MS = 60_000`

- [ ] **Step 1: Write the failing test**

`src/lib/ai-models/__tests__/catalog.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const tables: Record<string, { data: unknown[] | null; error: unknown }> = {};
const selects: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: (table: string) => ({
      select: () => ({
        order: async () => {
          selects.push(table);
          return tables[table];
        },
      }),
    }),
  }),
}));

import { getAiCatalog, clearAiCatalogCache, currentPrice, CATALOG_CACHE_MS } from "../catalog";
import type { AiCatalog } from "../types";

const MODEL = {
  id: "kling:kling-3-0-omni", provider: "kling", kind: "video", label: "Kling 3.0 Omni",
  picker_label: null, provider_label: "Kling", description: null, status: "live", replaced_by: null,
  sort_order: 0, adapter_key: "video:kling", provider_model_id: null, params: [], rules: [],
  capabilities: { maxDurationSeconds: 15 }, updated_at: "2026-11-21T00:00:00Z",
};
const PRICE = (id: string, from: string) => ({
  id, model_id: MODEL.id, effective_from: from, lines: [{ meter: "provider_unit", unit_usd: 0.1508 }],
  estimate: {}, source_url: null, note: null,
});

beforeEach(() => {
  clearAiCatalogCache();
  selects.length = 0;
  tables.ai_models = { data: [MODEL], error: null };
  tables.ai_model_prices = { data: [PRICE("p1", "2026-11-01T00:00:00Z")], error: null };
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("getAiCatalog", () => {
  it("loads models and prices with one query each", async () => {
    const catalog = await getAiCatalog();
    expect(catalog.models.map((m) => m.id)).toEqual([MODEL.id]);
    expect(catalog.prices.map((p) => p.id)).toEqual(["p1"]);
    expect(selects.sort()).toEqual(["ai_model_prices", "ai_models"]);
  });

  it("serves the cache within 60 seconds and reloads after", async () => {
    await getAiCatalog();
    vi.advanceTimersByTime(CATALOG_CACHE_MS - 1);
    await getAiCatalog();
    expect(selects).toHaveLength(2);
    vi.advanceTimersByTime(2);
    await getAiCatalog();
    expect(selects).toHaveLength(4);
  });

  it("shares one load between concurrent callers", async () => {
    await Promise.all([getAiCatalog(), getAiCatalog(), getAiCatalog()]);
    expect(selects).toHaveLength(2);
  });

  it("leaves out a row that fails its check", async () => {
    tables.ai_models = { data: [MODEL, { ...MODEL, id: "bad", kind: "podcast" }], error: null };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const catalog = await getAiCatalog();
    expect(catalog.models.map((m) => m.id)).toEqual([MODEL.id]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("throws on a failed read and caches nothing", async () => {
    tables.ai_models = { data: null, error: new Error("down") };
    await expect(getAiCatalog()).rejects.toThrow("down");
    tables.ai_models = { data: [MODEL], error: null };
    await expect(getAiCatalog()).resolves.toMatchObject({ models: [{ id: MODEL.id }] });
  });
});

describe("currentPrice", () => {
  const catalog = (): AiCatalog => ({
    models: [],
    prices: [
      { id: "old", modelId: MODEL.id, effectiveFrom: "2026-11-01T00:00:00Z", lines: [], estimate: {}, sourceUrl: null, note: null },
      { id: "new", modelId: MODEL.id, effectiveFrom: "2026-12-03T08:00:00Z", lines: [], estimate: {}, sourceUrl: null, note: null },
    ],
  });

  it("is the latest row at or before the moment", () => {
    expect(currentPrice(catalog(), MODEL.id, new Date("2026-12-03T07:59:59Z"))?.id).toBe("old");
    expect(currentPrice(catalog(), MODEL.id, new Date("2026-12-03T08:00:00Z"))?.id).toBe("new");
  });

  it("is null before the first row, or for another model", () => {
    expect(currentPrice(catalog(), MODEL.id, new Date("2026-10-01T00:00:00Z"))).toBeNull();
    expect(currentPrice(catalog(), "other", new Date("2026-12-31T00:00:00Z"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ai-models/__tests__/catalog.test.ts`
Expected: FAIL — cannot find `../catalog`.

- [ ] **Step 3: Write `catalog.ts`**

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { MODEL_COLUMNS, PRICE_COLUMNS, parseAiModelPriceRow, parseAiModelRow } from "./schema";
import type { AiCatalog, AiModel, AiModelPrice } from "./types";

// D529 — the catalog is read once and kept for a minute per server instance: a run reads its
// model and price from memory, never with a query of its own. An admin change clears the cache
// in the instance that made it; other instances pick it up within a minute (a price applies by
// its date, so that delay never changes a charge).
export const CATALOG_CACHE_MS = 60_000;

let cached: { at: number; catalog: AiCatalog } | null = null;
let inflight: Promise<AiCatalog> | null = null;

export function clearAiCatalogCache(): void {
  cached = null;
}

export async function getAiCatalog(): Promise<AiCatalog> {
  if (cached && Date.now() - cached.at < CATALOG_CACHE_MS) return cached.catalog;
  if (inflight) return inflight;
  inflight = loadAiCatalog()
    .then((catalog) => {
      cached = { at: Date.now(), catalog };
      return catalog;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function loadAiCatalog(): Promise<AiCatalog> {
  const db = createServerSupabase();
  const [modelsRes, pricesRes] = await Promise.all([
    db.from("ai_models").select(MODEL_COLUMNS).order("sort_order"),
    db.from("ai_model_prices").select(PRICE_COLUMNS).order("effective_from"),
  ]);
  // A failed read is never an empty catalog (performance rule 13).
  if (modelsRes.error) throw modelsRes.error;
  if (pricesRes.error) throw pricesRes.error;

  const models: AiModel[] = [];
  for (const row of modelsRes.data ?? []) {
    const model = parseAiModelRow(row);
    if (model) models.push(model);
    else console.error("[ai-models] model row failed its check — left out", { id: (row as { id?: unknown }).id });
  }
  const prices: AiModelPrice[] = [];
  for (const row of pricesRes.data ?? []) {
    const price = parseAiModelPriceRow(row);
    if (price) prices.push(price);
    else console.error("[ai-models] price row failed its check — left out", { id: (row as { id?: unknown }).id });
  }
  return { models, prices };
}

/** D530 — the price row a run starting at `at` uses: the latest one at or before it. */
export function currentPrice(catalog: AiCatalog, modelId: string, at: Date): AiModelPrice | null {
  let best: AiModelPrice | null = null;
  for (const p of catalog.prices) {
    if (p.modelId !== modelId || new Date(p.effectiveFrom) > at) continue;
    if (!best || new Date(p.effectiveFrom) > new Date(best.effectiveFrom)) best = p;
  }
  return best;
}
```

`currentPrice` lives here rather than in `types.ts` only to keep this plan's files few; it has no server dependency, and Plan 2 may move it into the pricing module.

- [ ] **Step 4: Run the test to make sure it passes**

Run: `npx vitest run src/lib/ai-models/__tests__/catalog.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-models/catalog.ts src/lib/ai-models/__tests__/catalog.test.ts
git commit -m "feat(models): server catalog loader with a one-minute cache (D529, D530)"
```

---

### Task 6: `GET /api/ai-models`, the service and the query hook

**Files:**
- Create: `src/app/api/ai-models/route.ts`
- Test: `src/app/api/ai-models/route.test.ts`
- Create: `src/services/ai-models.service.ts`
- Test: `src/services/ai-models.service.test.ts`
- Create: `src/hooks/queries/ai-models.ts`

**Interfaces:**
- Consumes: `getAiCatalog` (Task 5); `resolveCallerContextOrNull` from `@/lib/dal`; `apiOk`, `apiError`; `authFetch` from `@/lib/supabase/session-ready`; `readJson` from `@/services/read-json`.
- Produces:
  - `GET /api/ai-models` → `200 { catalog: AiCatalog }` without `draft` models and their prices; `401` without a session; `500` "Could not load the models." on a failed read
  - `aiModelsService.catalog(): Promise<AiCatalog>`
  - `aiModelKeys.all`, `aiModelKeys.catalog()`; `useAiCatalog()` (stale time 5 minutes)

- [ ] **Step 1: Write the failing route test**

`src/app/api/ai-models/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const caller = vi.fn();
vi.mock("@/lib/dal", () => ({ resolveCallerContextOrNull: () => caller() }));
const load = vi.fn();
vi.mock("@/lib/ai-models/catalog", () => ({ getAiCatalog: () => load() }));

import { GET } from "./route";

const model = (id: string, status: string) => ({ id, status });
const price = (id: string, modelId: string) => ({ id, modelId });

beforeEach(() => {
  caller.mockResolvedValue({ userId: "u1" });
  load.mockResolvedValue({
    models: [model("live-1", "live"), model("draft-1", "draft"), model("retired-1", "retired")],
    prices: [price("p1", "live-1"), price("p2", "draft-1")],
  });
});

describe("GET /api/ai-models", () => {
  it("returns the catalog without draft models or their prices", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.catalog.models.map((m: { id: string }) => m.id)).toEqual(["live-1", "retired-1"]);
    expect(body.catalog.prices.map((p: { id: string }) => p.id)).toEqual(["p1"]);
  });

  it("refuses a caller with no session", async () => {
    caller.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("says plainly when the catalog cannot be read", async () => {
    load.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not load the models." });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/app/api/ai-models/route.test.ts`
Expected: FAIL — cannot find `./route`.

- [ ] **Step 3: Write the route**

`src/app/api/ai-models/route.ts`:

```ts
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { getAiCatalog } from "@/lib/ai-models/catalog";

export const dynamic = "force-dynamic";

// D529 — the catalog for the browser: every model a signed-in user can see (draft models are
// the super admin's alone) with their prices. One request per session (useAiCatalog), never
// one per node.
export async function GET() {
  const caller = await resolveCallerContextOrNull();
  if (!caller) return apiError("Unauthorized.", 401);
  try {
    const catalog = await getAiCatalog();
    const models = catalog.models.filter((m) => m.status !== "draft");
    const ids = new Set(models.map((m) => m.id));
    return apiOk({ catalog: { models, prices: catalog.prices.filter((p) => ids.has(p.modelId)) } });
  } catch (e) {
    console.error("[GET /api/ai-models] catalog read failed", e);
    return apiError("Could not load the models.", 500);
  }
}
```

- [ ] **Step 4: Run the route test to make sure it passes**

Run: `npx vitest run src/app/api/ai-models/route.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing service test**

`src/services/ai-models.service.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

const authFetch = vi.fn();
vi.mock("@/lib/supabase/session-ready", () => ({ authFetch: (url: string) => authFetch(url) }));

import { aiModelsService } from "./ai-models.service";

describe("aiModelsService.catalog", () => {
  it("reads /api/ai-models and returns the catalog", async () => {
    const catalog = { models: [{ id: "m1" }], prices: [] };
    authFetch.mockResolvedValue(new Response(JSON.stringify({ catalog }), { status: 200 }));
    await expect(aiModelsService.catalog()).resolves.toEqual(catalog);
    expect(authFetch).toHaveBeenCalledWith("/api/ai-models");
  });

  it("throws the route's message on failure", async () => {
    authFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Could not load the models." }), { status: 500 }));
    await expect(aiModelsService.catalog()).rejects.toThrow("Could not load the models.");
  });
});
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `npx vitest run src/services/ai-models.service.test.ts`
Expected: FAIL — cannot find `./ai-models.service`.

- [ ] **Step 7: Write the service and the hook**

`src/services/ai-models.service.ts`:

```ts
import { authFetch } from "@/lib/supabase/session-ready";
import type { AiCatalog } from "@/lib/ai-models/types";
import { readJson } from "./read-json";

class AiModelsService {
  /** D529 — the model catalog with prices; draft models are left out by the route. */
  async catalog(): Promise<AiCatalog> {
    const res = await authFetch("/api/ai-models");
    const { catalog } = await readJson<{ catalog: AiCatalog }>(res, "Could not load the models.");
    return catalog;
  }
}

export const aiModelsService = new AiModelsService();
```

`src/hooks/queries/ai-models.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { aiModelsService } from "@/services/ai-models.service";

// D529 — the model catalog, through TanStack Query. One request per session: pickers and focus
// views select from this cache, never fetch per node (performance rule 1).
export const aiModelKeys = {
  all: ["ai-models"] as const,
  catalog: () => [...aiModelKeys.all, "catalog"] as const,
};

const CATALOG_STALE_MS = 5 * 60_000;

export function useAiCatalog() {
  return useQuery({
    queryKey: aiModelKeys.catalog(),
    queryFn: () => aiModelsService.catalog(),
    staleTime: CATALOG_STALE_MS,
  });
}
```

- [ ] **Step 8: Run the service test, then everything in this plan**

Run: `npx vitest run src/services/ai-models.service.test.ts`
Expected: PASS, 2 tests.

Run: `npx vitest run src/lib/ai-models src/app/api/ai-models src/services/ai-models.service.test.ts`
Expected: PASS, 25 tests across 6 files.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^\.next/\|image-generate/route.test.ts(56"`
Expected: no output (the two filtered lines are errors that predate this plan).

- [ ] **Step 9: Commit**

```bash
git add src/app/api/ai-models src/services/ai-models.service.ts src/services/ai-models.service.test.ts src/hooks/queries/ai-models.ts
git commit -m "feat(models): GET /api/ai-models, its service and useAiCatalog (D529)"
```

---

## After the plan

The user applies 0076 and 0077 to staging in the SQL editor and runs the verify block in
`docs/auth-production-migration.md`. Nothing reads the catalog until Plan 1b, so production can
take the migrations any time before 1b ships.
