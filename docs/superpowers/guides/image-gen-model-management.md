# Image Gen — Model Management & Architecture Guide

**Date:** 2026-06-18 (model sections rewritten 2026-11-23)
**Covers:** Where model data lives · Adding models · How a run is charged

---

## 1. Overview

An image or video model is a row in the `ai_models` table (decision D568). The row holds everything about the model that is data: its id, labels, status, sort order, params, rules, limits and capabilities, the `adapter_key` that names the code that calls its provider, and `provider_model_id`, the provider's own name for the model. Its price is a row in `ai_model_prices`.

Code holds only two things:

- **Adapters.** `imageAdapters` in `src/lib/image-gen/adapters.ts` and `videoAdapters` in `src/lib/video-gen/adapters.ts` map an `adapter_key` to a function that calls the provider. The function is given the request and the row's spec and `provider_model_id`. Adapters are server-only.
- **Ids with behaviour written in code.** `src/lib/ai-models/model-ids.ts` names the models that code treats specially (multishot ladders, prompt templates, voice preview engines, edit models).

Model ids use a `provider:name` key (for example `openai:gpt-image-2`). The id is the shared identity across the catalog, `node_versions.model_used`, the price table and the version history display. An id is never changed once a node has used it.

The app reads rows through the catalog (`src/lib/ai-models/catalog.ts`), and `model-lists.ts` turns them into the lists the pickers and validators use. A model with no adapter for its `adapter_key` cannot run; a task whose model has no row or adapter ends without a retry. A `retired` model has no adapter and stays in the table so past versions still read it.

---

## 2. Reading the Current Models

The current models are whatever the catalog holds. In tests, `seededModelCatalog()` (`src/lib/ai-models/test-catalog.ts`) returns the rows the migrations leave behind. In a database, `select id, kind, status, adapter_key, provider_model_id from ai_models where kind in ('image','video') order by kind, sort_order`.

---

## 3. How to Add a New Model

### A model that uses an existing adapter (for example another OpenAI image model)

**Step 1 — Write a new migration** `supabase/migrations/NNNN_<name>.sql` that inserts the model's row. Never edit 0077 or 0084; both are frozen by hash.

The row's columns:

| Column | Value |
|---|---|
| `id` | `provider:name`, unique, permanent |
| `provider` | `openai`, `gemini`, `kling`, ... |
| `kind` | `image` or `video` |
| `label`, `picker_label`, `provider_label` | shown in the picker; `picker_label` may be null |
| `status` | `draft`, `live`, `hidden` or `retired` |
| `replaced_by` | the id that takes over from a retired model, or null |
| `sort_order` | position in the picker |
| `adapter_key` | `image:<name>` or `video:<name>`, unique per model |
| `provider_model_id` | the name the provider's API takes |
| `params` | the param specs the form shows (JSON array) |
| `rules` | video constraint rules (JSON array, `[]` for none) |
| `capabilities` | image: reference limits, mask support, edge and ratio limits; video: duration and image inputs (JSON object) |

`src/lib/ai-models/schema.ts` checks these on load and `src/lib/ai-models/types.ts` shows the shapes. Copy a similar model's row from `0077_ai_models_seed.sql` as the starting point. The migration uses `on conflict (id) do nothing`, as 0082 does.

In the same migration, insert the model's `ai_model_prices` row: `model_id`, `effective_from`, `lines` (each a `meter` and a `unit_usd`), `estimate`, `source_url` and `note`. A model with no price row cannot run. See `docs/superpowers/specs/2026-11-21-model-catalog-design.md` for the shape and how prices are read.

**Step 2 — Point `adapter_key` at the adapter.** If an adapter for this provider already fits, add the model's `adapter_key` to the map in `adapters.ts` using the same function (see how `openai` or `gemini` is shared). Each model has its own key, so a new model always adds one line there.

**Step 3 — Code-written behaviour.** If code treats the model specially, add its id to `src/lib/ai-models/model-ids.ts` and use the constant where the behaviour is written.

**Step 4 — Let the tests see the migration.** `test-catalog.ts` reads a fixed list of migration files (`INSERTS` and `UPDATES`) and `test-prices.ts` another (`MIGRATIONS`). Add the new file to the list that matches what it does.

### A vendor renames a model

A dated vendor name change is only a migration that updates the row's `provider_model_id`. No adapter or other code changes. Update only the columns that change; leave `status`, `replaced_by` and `sort_order` to the admin.

### A new provider

**Step 1 — Create `src/lib/image-gen/providers/<name>.ts`** (or under `video-gen/providers/`) with `import "server-only"`, and a function that takes the model name and the request and returns the result.

```typescript
import "server-only";   // REQUIRED — prevents the SDK from leaking to the browser
import type { ImageGenInput, ImageGenResult } from "../types";

export async function generateWithStability(
  apiModelId: string,
  input: ImageGenInput,
): Promise<ImageGenResult> {
  // 1. Call the provider SDK or HTTP API with apiModelId
  // 2. Return { imageBase64, mimeType, tokensUsed }
  //    - imageBase64: raw base64 string (NOT a data URL)
  //    - mimeType: "image/png" | "image/jpeg" | "image/webp"
  //    - tokensUsed: { text_input_tokens, image_input_tokens, image_output_tokens, total_tokens }
  //      (set unknown fields to 0 — used for cost calculation)
  return {
    imageBase64: "...",
    mimeType: "image/png",
    tokensUsed: {
      text_input_tokens: 0,
      image_input_tokens: 0,
      image_output_tokens: 1000,
      total_tokens: 1000,
    },
  };
}
```

**Step 2 — Add the adapter** to `imageAdapters` (or `videoAdapters`) under the model's `adapter_key`:

```typescript
const stability: ImageAdapter = (input, { providerModelId }) => generateWithStability(providerModelId, input);

export const imageAdapters = {
  // ...
  "image:stability-sd-ultra": stability,
};
```

**Step 3 — Add the migration** for the model's row and price, as above.

**Step 4 — Add the env var** for the new API key (`.env.local`, Vercel and Trigger.dev) and a client factory following `src/lib/openai/server.ts` and `src/lib/gemini/server.ts`.

### Checking it

```bash
npx vitest run src/lib/ai-models src/lib/image-gen src/lib/video-gen
npx tsc --noEmit
```

- The seeded catalog tests (`src/lib/ai-models/__tests__/`) check every row against the catalog's schema.
- `src/lib/image-gen/__tests__/adapters.test.ts` checks that the keys in `imageAdapters` are exactly the keys of the image rows that are not retired, each once. `src/lib/video-gen/__tests__/adapters.test.ts` does the same for video. A missing or extra key fails here.
- Add the migration to `docs/auth-production-migration.md` in the same change, in the format of the 0082 and 0084 entries: what it does, when to apply it relative to the code deploy, whether it is safe to re-run, and verify SQL with the expected result, for example:

```sql
-- expect 1 row, status live, adapter_key matching the one in adapters.ts
select id, status, adapter_key, provider_model_id from ai_models where id = 'provider:name';
-- expect 1: the model has a price
select count(*) from ai_model_prices where model_id = 'provider:name';
```

---

## 4. How a Run is Charged

### Prices

What a model costs lives in the `ai_model_prices` table: dated rows, each a list of lines priced per meter (`input_token`, `image_output_token`, `video_second`, `output_image` and the rest in `src/lib/ai-models/types.ts`), with optional `when` conditions on the request's params. A price change is a new row with a later `effective_from`, so a run keeps the row it reserved with. A model with no row valid now cannot run. Adding or changing a price is described in `docs/superpowers/specs/2026-11-21-model-catalog-design.md`.

### Estimate, reserve, settle

The route estimates the run from the model's current price row and reserves that many credits. When the provider returns, the adapter reports a `ProviderBill` (what the provider charged or the usage it reported, as meters). Completion prices the bill with the same row and settles, storing `model_price_id`, `provider_bill`, `cost_usd` and `credits_charged` on the `generations` row. On failure the reservation is refunded.

### Gemini output token reference

Gemini maps output image size to token counts:

| Size | Approximate output tokens |
|------|--------------------------|
| 512 | ~747 |
| 1K | ~1,120 |
| 2K | ~1,680 |
| 4K | ~2,520 |
