# Image Gen — Model Management & Architecture Guide

**Date:** 2026-06-18
**Covers:** Registry architecture · Adding models · Pricing calculation · Future: credits · Future: job queue

---

## 1. Overview

The Image Gen system uses a two-layer registry pattern split between server and client code:

- **Server registry** (`src/lib/image-gen/registry.ts`) — imports provider modules that call the OpenAI and Gemini SDKs. Marked `"server-only"` transitively, so it cannot be imported into React components.
- **Client mirror** (`src/lib/image-gen/client-models.ts`) — duplicates the Zod schemas and model metadata without the `generate()` functions or SDK imports. Used by the focus view for form validation and the model selector.

Model IDs use a composite `provider:apiModelId` key convention (e.g. `"openai:gpt-image-1"`). This key is the shared identity across all layers: the registry lookup, the `node_versions.model_used` column, the pricing table, and the version history display.

---

## 2. Current Models

| Model ID | Provider | Display Label | Max Ref Images | Key Params |
|---|---|---|---|---|
| `openai:gpt-image-2` | OpenAI | GPT Image 2 | 10 | size, quality, background, output_format, output_compression |
| `openai:gpt-image-1` | OpenAI | GPT Image 1 | 10 | size, quality, background, output_format, output_compression |
| `openai:gpt-image-1-mini` | OpenAI | GPT Image 1 Mini | 5 | size, quality, output_format, output_compression (no background/transparency) |
| `gemini:gemini-3.1-flash-image-preview` | Gemini | Nano Banana 2 | 5 | aspect_ratio, image_size, output_mime_type, safety_filter_level, person_generation |
| `gemini:gemini-3-pro-image-preview` | Gemini | Nano Banana Pro | 5 | aspect_ratio, image_size, output_mime_type, safety_filter_level, person_generation, thinking_level |

Default model: `openai:gpt-image-2` (set in `registry.ts` as `DEFAULT_MODEL_ID` and mirrored in `client-models.ts` as `DEFAULT_CLIENT_MODEL_ID`).

---

## 3. How to Add a New Model

### Adding a model to an existing provider (e.g. a new OpenAI model)

**Step 1 — Add the Zod schema in `src/lib/image-gen/providers/openai.ts`**

```typescript
export const gptImageNewSchema = z.object({
  size: z.enum(["1024x1024", "2048x2048"]).default("1024x1024"),
  quality: z.enum(["standard", "hd"]).default("standard"),
  // add any new params here
});
```

**Step 2 — Add the model config to the `openaiModels` array**

```typescript
export const openaiModels: ImageGenModelConfig[] = [
  // ... existing models ...
  {
    id: "openai:gpt-image-new",       // composite key — must be unique
    provider: "openai",
    apiModelId: "gpt-image-new",      // string passed to the API
    label: "GPT Image New",           // shown in UI selector
    providerLabel: "OpenAI",
    schema: gptImageNewSchema,
    maxReferenceImages: 10,
    maxReferenceSizeBytes: 50 * 1024 * 1024,
    generate: (input) => generateWithOpenAI("gpt-image-new", input),
  },
];
```

**Step 3 — Mirror the schema in `src/lib/image-gen/client-models.ts`**

The client file keeps a duplicate of the Zod schema. No `generate()` function, no SDK imports.

```typescript
// Duplicate schema (no server imports):
const gptImageNewSchema = z.object({
  size: z.enum(["1024x1024", "2048x2048"]).default("1024x1024"),
  quality: z.enum(["standard", "hd"]).default("standard"),
});

// Add to imageGenClientModels array:
{
  id: "openai:gpt-image-new",
  provider: "openai",
  label: "GPT Image New",
  providerLabel: "OpenAI",
  schema: gptImageNewSchema,
  maxReferenceImages: 10,
},
```

**Step 4 — Add pricing to `src/lib/image-gen/cost.ts`**

The key must exactly match `ImageGenModelConfig.id`:

```typescript
const IMAGE_MODEL_PRICING = {
  // ... existing entries ...
  "openai:gpt-image-new": { textIn: 5.00, imgIn: 10.00, imgOut: 40.00 },
};
```

Fields are USD per 1M tokens. Gemini models only need `imgOut`; OpenAI models use all three.

**Step 5 — Verify**

```bash
npx tsc --noEmit
```

No other files need changes — the registry auto-discovers models from the provider arrays, and the API route resolves models via `imageGenRegistry[modelId]`.

---

### Adding a new provider (e.g. Stability AI, FAL, etc.)

**Step 1 — Create `src/lib/image-gen/providers/<name>.ts`**

```typescript
import "server-only";   // REQUIRED — prevents SDK from leaking to the browser
import { z } from "zod";
import type { ImageGenInput, ImageGenModelConfig, ImageGenResult } from "../types";

export const stabilitySchema = z.object({
  style: z.enum(["photographic", "digital-art"]).default("photographic"),
  // ... provider-specific params
});

async function generateWithStability(
  apiModelId: string,
  input: ImageGenInput,
): Promise<ImageGenResult> {
  // 1. Call the provider SDK or HTTP API
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
      image_output_tokens: 1000,  // whatever the API reports
      total_tokens: 1000,
    },
  };
}

export const stabilityModels: ImageGenModelConfig[] = [
  {
    id: "stability:sd-ultra",
    provider: "stability" as never,  // add "stability" to ImageProvider union in types.ts
    apiModelId: "stable-diffusion-ultra",
    label: "SD Ultra",
    providerLabel: "Stability AI",
    schema: stabilitySchema,
    maxReferenceImages: 1,
    maxReferenceSizeBytes: 10 * 1024 * 1024,
    generate: (input) => generateWithStability("stable-diffusion-ultra", input),
  },
];
```

**Step 2 — Add `"stability"` to the `ImageProvider` union in `src/lib/image-gen/types.ts`**

```typescript
export type ImageProvider = "openai" | "gemini" | "stability";
```

**Step 3 — Register in `src/lib/image-gen/registry.ts`**

```typescript
import { stabilityModels } from "./providers/stability";

const allModels = [...openaiModels, ...geminiModels, ...stabilityModels];

export const imageGenModelGroups = [
  { provider: "openai",     label: "OpenAI",       models: openaiModels },
  { provider: "gemini",     label: "Gemini",        models: geminiModels },
  { provider: "stability",  label: "Stability AI",  models: stabilityModels },
];
```

**Step 4 — Mirror in `client-models.ts`** (same as adding a model, repeated for every model in the new provider)

**Step 5 — Add pricing in `cost.ts`**

**Step 6 — Add env var for the new API key**

```bash
# .env.local
STABILITY_API_KEY=sk-...
```

Create `src/lib/stability/server.ts` with a client factory following the same pattern as `src/lib/openai/server.ts` and `src/lib/gemini/server.ts`.

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

This is written once at generation time and **never mutated**. Cost is computed at read time, not stored.

### Cost formula (`src/lib/image-gen/cost.ts`)

```typescript
const IMAGE_MODEL_PRICING = {
  // USD per 1M tokens
  "openai:gpt-image-2":                    { textIn: 5.00, imgIn: 8.00,  imgOut: 30.00 },
  "openai:gpt-image-1":                    { textIn: 5.00, imgIn: 10.00, imgOut: 40.00 },
  "openai:gpt-image-1-mini":               { textIn: 2.00, imgIn: 2.50,  imgOut: 8.00  },
  "gemini:gemini-3.1-flash-image-preview": { imgOut: 60.00 },
  "gemini:gemini-3-pro-image-preview":     { imgOut: 80.00 }, // estimated
};

function computeImageCost(modelId, tokens) {
  const p = IMAGE_MODEL_PRICING[modelId];
  if (!p) return null;
  const usd =
    (tokens.text_input_tokens  / 1_000_000) * (p.textIn ?? 0) +
    (tokens.image_input_tokens / 1_000_000) * (p.imgIn  ?? 0) +
    (tokens.image_output_tokens / 1_000_000) * p.imgOut;
  return { usd, inr: usd * USD_TO_INR };
}
```

### INR conversion

`USD_TO_INR = 95.77` is defined in `src/lib/pricing.ts` (updated 2026-06-12). Updating this single constant refreshes all historical cost displays retroactively — because costs are never persisted.

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
import { imageGenRegistry } from "@/lib/image-gen/registry";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
// ... storage upload helpers

export const imageGenerateJob = inngest.createFunction(
  { id: "image-generate", retries: 2 },
  { event: "image/generate.requested" },
  async ({ event, step }) => {
    const { nodeId, modelId, params, prompt, referenceUrls } = event.data;

    const result = await step.run("call-provider", () =>
      imageGenRegistry[modelId].generate({ prompt, referenceUrls, params })
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
