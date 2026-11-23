# Image Gen — Model Management & Architecture Guide

**Date:** 2026-06-18 (model sections rewritten 2026-11-23)
**Covers:** Where model data lives · Adding models · Pricing calculation · Future: credits · Future: job queue

---

## 1. Overview

An image or video model is a row in the `ai_models` table (decision D545). The row holds everything about the model that is data: its id, labels, status, sort order, params, rules, limits and capabilities, the `adapter_key` that names the code that calls its provider, and `provider_model_id`, the provider's own name for the model. Its price is a row in `ai_model_prices`.

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

## 4. How Pricing is Calculated

### Token tracking

Every generation records token usage in `node_versions.params_used.tokensUsed` (JSONB). The shape:

```typescript
type ImageTokenUsage = {
  text_input_tokens: number;    // tokens used by the text prompt
  image_input_tokens: number;   // tokens used by reference images
  image_output_tokens: number;  // tokens used by the generated image
  total_tokens: number;
};
```

This is written once at generation time and **never mutated**. The charge for a run is worked out from these tokens and the model's price row.

### Prices

What a model costs lives in the `ai_model_prices` table, one dated row per model, and a price change is a new row, so past runs keep the price they were billed at. A model with no row cannot run. Adding or changing a price is described in `docs/superpowers/specs/2026-11-21-model-catalog-design.md`.

### Gemini output token reference

Gemini maps output image size to token counts:

| Size | Approximate output tokens |
|------|--------------------------|
| 512 | ~747 |
| 1K | ~1,120 |
| 2K | ~1,680 |
| 4K | ~2,520 |

### Text model pricing

Text model pricing (`MODEL_PRICING` in `src/lib/pricing.ts`) is separate from image pricing and is not used by the image gen system. It covers GPT models used by Prompt nodes.

---

## 5. Future: Per-User Credit Management

Auth is currently deferred (decision D14 — no `auth.uid()` in routes). Per-user credits require identity, so this section describes what to build once auth ships.

### Database additions

```sql
-- User credit balance (one row per user)
create table user_credits (
  user_id     uuid primary key references auth.users(id),
  balance_usd numeric(12, 6) not null default 0,
  updated_at  timestamptz not null default now()
);

-- Append-only transaction log
create table credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  amount_usd  numeric(12, 6) not null,   -- negative = spend, positive = topup
  type        text not null,              -- 'topup' | 'spend'
  node_id     uuid references nodes(id),
  version_id  uuid references node_versions(id),
  created_at  timestamptz not null default now()
);
```

### API route changes (`image-generate/route.ts`)

```typescript
// 1. Resolve user identity
const userId = req.headers.get("x-user-id"); // or from Supabase auth session

// 2. Pre-flight balance check (worst-case estimate per model)
const MAX_SPEND_USD = getMaxSpendEstimate(modelId); // e.g. $0.10 for high-quality
const { data: credits } = await supabase
  .from("user_credits").select("balance_usd").eq("user_id", userId).single();
if (!credits || credits.balance_usd < MAX_SPEND_USD) {
  return apiError("Insufficient credits", 402);
}

// 3. After generation — deduct actual cost
const cost = computeImageCost(modelId, result.tokensUsed);
if (cost) {
  await supabase.rpc("deduct_credits", {
    p_user_id: userId,
    p_amount_usd: cost.usd,
    p_node_id: nodeId,
    p_version_id: version.id,
  });
}
```

The `deduct_credits` function should run in a Postgres transaction to prevent double-spend.

### Estimated cost before generation

Token counts are only known after the API call, so exact cost cannot be checked upfront. The practical approach: keep a per-model worst-case spend table and require balance ≥ that threshold before proceeding.

### UI additions needed

- Credit balance display in the top nav or user settings
- Low-balance inline warning in the Image Gen focus view (shown when balance < 3× worst-case for selected model)
- Transaction history page under account settings

---

## 6. Future: Job Queue Migration

### Current limitation

The route `POST /api/nodes/[id]/image-generate` awaits the full provider call + Supabase Storage upload inline. For high-quality OpenAI generations this can take 20–60 seconds. Vercel serverless functions have a 10s limit on Hobby plans and 60s on Pro — making large generations unreliable without a Pro plan and `maxDuration` export.

The sync approach also provides no mid-flight feedback: the user sees a skeleton until the response arrives or times out.

### Short-term workaround (Pro plan only)

Add to `src/app/api/nodes/[id]/image-generate/route.ts`:

```typescript
export const maxDuration = 300; // 5 minutes, Vercel Pro only
```

This extends the timeout but does not fix retries, progress, or background execution.

### Recommended approach: Inngest

[Inngest](https://inngest.com) integrates with Next.js via `@inngest/next`. Functions run as durable step-based workflows outside Vercel's request timeout, with built-in retry and real-time event streaming.

**Install:**

```bash
npm install inngest @inngest/next
```

**New files to create:**

`src/lib/inngest/client.ts`
```typescript
import { Inngest } from "inngest";
export const inngest = new Inngest({ id: "creativeos" });
```

`src/lib/inngest/image-generate.ts`
```typescript
import { inngest } from "./client";
import { imageAdapters } from "@/lib/image-gen/adapters";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
// ... storage upload helpers

export const imageGenerateJob = inngest.createFunction(
  { id: "image-generate", retries: 2 },
  { event: "image/generate.requested" },
  async ({ event, step }) => {
    const { nodeId, modelId, adapterKey, spec, providerModelId, params, prompt, referenceUrls } = event.data;

    const result = await step.run("call-provider", () =>
      imageAdapters[adapterKey]({ prompt, referenceUrls, params }, { spec, providerModelId })
    );

    const imageUrl = await step.run("upload-to-storage", () =>
      uploadGeneratedImage(nodeId, result)
    );

    const version = await step.run("insert-version", () =>
      insertVersion({ nodeId, output: imageUrl, modelUsed: modelId, ... })
    );

    await step.run("set-active-version", () =>
      setActiveVersion(nodeId, version.id)
    );

    return { imageUrl, versionId: version.id };
  }
);
```

**Route becomes a thin dispatcher:**

```typescript
// POST /api/nodes/[id]/image-generate
const { ids } = await inngest.send({
  name: "image/generate.requested",
  data: { nodeId, modelId, params, prompt, referenceUrls },
});
return apiOk({ jobId: ids[0], status: "queued" });
```

**Client-side polling:**

The focus view can poll `GET /api/nodes/[id]/versions` every 2s until a new version appears (the skeleton shimmer already handles this state). Alternatively, subscribe to Inngest's realtime channel for push updates.

**Register the Inngest endpoint** in `src/app/api/inngest/route.ts`:

```typescript
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { imageGenerateJob } from "@/lib/inngest/image-generate";

export const { GET, POST, PUT } = serve({ client: inngest, functions: [imageGenerateJob] });
```

**Add env var:**

```bash
INNGEST_SIGNING_KEY=signkey-...
INNGEST_EVENT_KEY=...
```

### Migration checklist (when ready to ship)

- [ ] Install `inngest @inngest/next`
- [ ] Create `src/lib/inngest/client.ts`
- [ ] Create `src/lib/inngest/image-generate.ts` (step function)
- [ ] Create `src/app/api/inngest/route.ts` (serve endpoint)
- [ ] Update `image-generate/route.ts` to send event instead of awaiting inline
- [ ] Update focus view to poll `/api/nodes/[id]/versions` while `status === "queued"`
- [ ] Remove `maxDuration` export if added as a stopgap
- [ ] Add Inngest env vars to Vercel and `.env.local`
- [ ] Verify end-to-end: generate → canvas card updates → version history shows new entry
