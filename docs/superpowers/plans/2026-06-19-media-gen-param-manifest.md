# Media Gen Parameter Manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-model Zod schemas with a typed `ParamSpec[]` manifest that drives generic UI rendering, eliminates client/server duplication, and maps 1:1 to a future DB table.

**Architecture:** Each model carries a `ParamSpec[]` array (replacing Zod schemas). A `buildZodFromParams()` utility derives Zod at registration time. The UI reads `params`, splits by `group`, and dispatches to per-component renderers — no more manual `provider === "openai"` branching.

**Tech Stack:** TypeScript, Zod, React, react-hook-form, Lucide icons, Next.js (App Router). No new npm packages needed.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/lib/image-gen/types.ts` | Modify | Add `ParamSpec`, `ParamConstraints`, `ParamComponent`, `ParamGroup`, `MediaType`, `ClientModelSpec` |
| `src/lib/image-gen/schema-builder.ts` | **Create** | `buildZodFromParams()` |
| `src/lib/image-gen/providers/openai.ts` | Modify | Replace Zod schemas with `ParamSpec[]`; export `openaiModels` as `MediaGenModelSpec[]` |
| `src/lib/image-gen/providers/gemini.ts` | Modify | Same |
| `src/lib/image-gen/client-models.ts` | Modify | Remove all Zod schemas; import `ParamSpec[]` from providers; add `defaultsForModel()`; remove `defaultsForSchema()` |
| `src/lib/image-gen/registry.ts` | Modify | Use `buildZodFromParams()` to derive schema at registration |
| `src/lib/image-gen/utils.ts` | Modify | Replace Zod introspection with direct `ParamSpec` lookup |
| `src/components/nodes/param-controls/select-control.tsx` | **Create** | `<select>` renderer |
| `src/components/nodes/param-controls/slider-control.tsx` | **Create** | `<input type="range">` renderer with value label |
| `src/components/nodes/param-controls/toggle-control.tsx` | **Create** | `<input type="checkbox">` renderer |
| `src/components/nodes/param-controls/number-control.tsx` | **Create** | `<input type="number">` renderer |
| `src/components/nodes/param-controls/textarea-control.tsx` | **Create** | `<textarea>` renderer |
| `src/components/nodes/param-controls/index.tsx` | **Create** | `ParamControl` dispatcher |
| `src/components/nodes/image-gen-output-settings.tsx` | Modify | Generic renderer replacing manual branching |
| `src/components/nodes/image-gen-focus-view.tsx` | Modify | Update type imports and `defaultsForSchema` → `defaultsForModel` calls |

---

## Task 1: Add core types to `types.ts`

**Files:**
- Modify: `src/lib/image-gen/types.ts`

- [ ] **Step 1: Add new types**

Replace the full file content with:

```typescript
import type { ZodTypeAny } from "zod";

export type ImageProvider = "openai" | "gemini";

export type ImageTokenUsage = {
  text_input_tokens: number;
  image_input_tokens: number;
  image_output_tokens: number;
  total_tokens: number;
};

export type ImageGenInput = {
  prompt: string;
  referenceUrls: string[];   // Supabase public URLs — never re-encoded to base64 for OpenAI
  params: Record<string, unknown>;
};

export type ImageGenResult = {
  imageBase64: string;       // raw bytes from provider, uploaded to Storage immediately
  mimeType: string;          // "image/png" | "image/jpeg" | "image/webp"
  tokensUsed: ImageTokenUsage;
};

// ── Param manifest types ──────────────────────────────────────────────────────

export type ParamComponent = "select" | "slider" | "toggle" | "number" | "textarea";
export type ParamGroup = "primary" | "advanced";
export type MediaType = "image" | "video";

export type ParamConstraints =
  | { type: "select";   options: string[] }
  | { type: "slider";   min: number; max: number; step?: number }
  | { type: "toggle" }
  | { type: "number";   min?: number; max?: number; step?: number }
  | { type: "textarea"; maxLength?: number };

export type ParamSpec = {
  name:         string;
  label:        string;
  component:    ParamComponent;
  group:        ParamGroup;
  order:        number;          // sort order within group (lower = first, resets per group)
  visible:      boolean;         // false = sent to API with defaultValue, never shown in UI
  defaultValue: unknown;         // JSON-serializable → DB-ready
  constraints:  ParamConstraints;
  description?: string;
};

// Server-side model config (includes generate function)
export type MediaGenModelSpec = {
  id:                    string;       // "openai:gpt-image-2"
  provider:              string;
  mediaType:             MediaType;
  label:                 string;
  providerLabel:         string;
  maxReferenceImages:    number;
  maxReferenceSizeBytes: number;
  params:                ParamSpec[];
  schema:                ZodTypeAny;   // derived via buildZodFromParams() at registration
  generate:              (input: ImageGenInput) => Promise<ImageGenResult>;
};

// Client-safe subset (no generate function, schema kept for form validation)
export type ClientModelSpec = Omit<MediaGenModelSpec, "generate">;

// Legacy alias kept so registry.ts and the API route compile without changes
export type ImageGenModelConfig = MediaGenModelSpec;
```

- [ ] **Step 2: Verify compilation**

```bash
cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only in providers/openai.ts and providers/gemini.ts (they still import the old types — fixed in Tasks 3 & 4).

- [ ] **Step 3: Commit**

```bash
git add src/lib/image-gen/types.ts
git commit -m "feat(image-gen): add ParamSpec and MediaGenModelSpec types"
```

---

## Task 2: Create `schema-builder.ts`

**Files:**
- Create: `src/lib/image-gen/schema-builder.ts`

- [ ] **Step 1: Create the file**

```typescript
import { z } from "zod";
import type { ParamSpec } from "./types";

export function buildZodFromParams(params: ParamSpec[]): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};

  for (const param of params) {
    const { name, constraints, defaultValue } = param;
    let field: z.ZodTypeAny;

    switch (constraints.type) {
      case "select":
        field = z.enum(constraints.options as [string, ...string[]]);
        break;
      case "slider":
      case "number": {
        let num = z.number();
        if ("min" in constraints && constraints.min !== undefined) num = num.min(constraints.min);
        if ("max" in constraints && constraints.max !== undefined) num = num.max(constraints.max);
        field = num;
        break;
      }
      case "toggle":
        field = z.boolean();
        break;
      case "textarea": {
        let str = z.string();
        if (constraints.maxLength) str = str.max(constraints.maxLength);
        field = str;
        break;
      }
    }

    field = defaultValue !== null && defaultValue !== undefined
      ? field.default(defaultValue as never)
      : field.optional();

    shape[name] = field;
  }

  return z.object(shape);
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit 2>&1 | grep "schema-builder"
```

Expected: no output (no errors in this file).

- [ ] **Step 3: Commit**

```bash
git add src/lib/image-gen/schema-builder.ts
git commit -m "feat(image-gen): add buildZodFromParams schema builder"
```

---

## Task 3: Migrate `providers/openai.ts`

**Files:**
- Modify: `src/lib/image-gen/providers/openai.ts`

- [ ] **Step 1: Replace the file**

```typescript
import "server-only";
import { createOpenAI } from "@/lib/openai/server";
import { buildZodFromParams } from "../schema-builder";
import type { ImageGenInput, ImageGenResult, MediaGenModelSpec, ParamSpec } from "../types";

// ── Params ref: https://platform.openai.com/docs/api-reference/images/create ──

export const gptImage2Params: ParamSpec[] = [
  { name: "size",     label: "Size",    component: "select", group: "primary",  order: 0, visible: true,
    defaultValue: "1024x1024",
    constraints: { type: "select", options: ["auto", "1024x1024", "1536x1024", "1024x1536"] } },
  { name: "quality",  label: "Quality", component: "select", group: "primary",  order: 1, visible: true,
    defaultValue: "medium",
    constraints: { type: "select", options: ["low", "medium", "high", "auto"] } },
  { name: "background",      label: "Background",    component: "select", group: "advanced", order: 0, visible: true,
    defaultValue: "auto",
    constraints: { type: "select", options: ["auto", "opaque", "transparent"] } },
  { name: "output_format",   label: "Output format", component: "select", group: "advanced", order: 1, visible: true,
    defaultValue: "png",
    constraints: { type: "select", options: ["png", "jpeg", "webp"] } },
  { name: "output_compression", label: "Compression", component: "slider", group: "advanced", order: 2, visible: false,
    defaultValue: 80,
    constraints: { type: "slider", min: 0, max: 100, step: 1 } },
];

// gpt-image-1 has same params as gpt-image-2
export const gptImage1Params: ParamSpec[] = gptImage2Params;

export const gptImage1MiniParams: ParamSpec[] = [
  { name: "size",    label: "Size",    component: "select", group: "primary",  order: 0, visible: true,
    defaultValue: "1024x1024",
    constraints: { type: "select", options: ["1024x1024", "1536x1024", "1024x1536"] } },
  { name: "quality", label: "Quality", component: "select", group: "primary",  order: 1, visible: true,
    defaultValue: "medium",
    constraints: { type: "select", options: ["low", "medium", "high"] } },
  { name: "output_format", label: "Output format", component: "select", group: "advanced", order: 0, visible: true,
    defaultValue: "png",
    constraints: { type: "select", options: ["png", "jpeg", "webp"] } },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function urlToFile(url: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch reference image (${res.status}): ${url}`);
  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "image/png";
  const ext = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  return new File([buffer], `reference.${ext}`, { type: contentType });
}

// ── Generate function ─────────────────────────────────────────────────────────

async function generateWithOpenAI(
  apiModelId: string,
  input: ImageGenInput,
): Promise<ImageGenResult> {
  const openai = createOpenAI();
  const p = input.params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharedParams: Record<string, any> = {
    model: apiModelId,
    n: 1,
    size: (p.size as string) ?? "1024x1024",
    quality: (p.quality as string) ?? "medium",
  };
  if (p.background)    sharedParams.background    = p.background;
  if (p.output_format) sharedParams.output_format = p.output_format;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let response: any;

  if (input.referenceUrls.length > 0) {
    const imageFiles = await Promise.all(input.referenceUrls.map(urlToFile));
    response = await openai.images.edit({
      ...sharedParams,
      prompt: input.prompt,
      image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
    });
  } else {
    response = await openai.images.generate({
      ...sharedParams,
      prompt: input.prompt,
    });
  }

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usage = response.usage as any;
  return {
    imageBase64: b64,
    mimeType:
      p.output_format === "jpeg" ? "image/jpeg"
      : p.output_format === "webp" ? "image/webp"
      : "image/png",
    tokensUsed: {
      text_input_tokens:   usage?.input_tokens_details?.text_tokens  ?? usage?.input_tokens  ?? 0,
      image_input_tokens:  usage?.input_tokens_details?.image_tokens ?? 0,
      image_output_tokens: usage?.output_tokens ?? 0,
      total_tokens:        usage?.total_tokens  ?? 0,
    },
  };
}

// ── Model configs ─────────────────────────────────────────────────────────────

export const openaiModels: MediaGenModelSpec[] = [
  {
    id: "openai:gpt-image-2",
    provider: "openai", mediaType: "image",
    label: "GPT Image 2", providerLabel: "OpenAI",
    maxReferenceImages: 10, maxReferenceSizeBytes: 50 * 1024 * 1024,
    params: gptImage2Params,
    schema: buildZodFromParams(gptImage2Params),
    generate: (input) => generateWithOpenAI("gpt-image-2", input),
  },
  {
    id: "openai:gpt-image-1",
    provider: "openai", mediaType: "image",
    label: "GPT Image 1", providerLabel: "OpenAI",
    maxReferenceImages: 10, maxReferenceSizeBytes: 50 * 1024 * 1024,
    params: gptImage1Params,
    schema: buildZodFromParams(gptImage1Params),
    generate: (input) => generateWithOpenAI("gpt-image-1", input),
  },
  {
    id: "openai:gpt-image-1-mini",
    provider: "openai", mediaType: "image",
    label: "GPT Image 1 Mini", providerLabel: "OpenAI",
    maxReferenceImages: 5, maxReferenceSizeBytes: 50 * 1024 * 1024,
    params: gptImage1MiniParams,
    schema: buildZodFromParams(gptImage1MiniParams),
    generate: (input) => generateWithOpenAI("gpt-image-1-mini", input),
  },
];
```

- [ ] **Step 2: Verify**

```bash
cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit 2>&1 | grep "openai"
```

Expected: no errors from `providers/openai.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/image-gen/providers/openai.ts
git commit -m "feat(image-gen): migrate OpenAI provider to ParamSpec manifest"
```

---

## Task 4: Migrate `providers/gemini.ts`

**Files:**
- Modify: `src/lib/image-gen/providers/gemini.ts`

- [ ] **Step 1: Replace the file**

```typescript
import "server-only";
import { createGemini } from "@/lib/gemini/server";
import { buildZodFromParams } from "../schema-builder";
import type { ImageGenInput, ImageGenResult, MediaGenModelSpec, ParamSpec } from "../types";

// ── Params ref: https://ai.google.dev/gemini-api/docs/image-generation ────────
// Only imageConfig.aspectRatio and imageConfig.imageSize are supported via the
// Gemini Developer API. safety_filter_level and person_generation are Vertex AI
// Imagen-only params and are NOT sent to the API — kept as UI-only placeholders.

export const geminiFlashParams: ParamSpec[] = [
  { name: "aspect_ratio", label: "Aspect ratio", component: "select", group: "primary", order: 0, visible: true,
    defaultValue: "1:1",
    constraints: { type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "4:1", "1:4"] } },
  { name: "image_size",   label: "Resolution",   component: "select", group: "primary", order: 1, visible: true,
    defaultValue: "1K",
    constraints: { type: "select", options: ["512", "1K", "2K", "4K"] } },
];

export const geminiProParams: ParamSpec[] = [
  { name: "aspect_ratio", label: "Aspect ratio", component: "select", group: "primary", order: 0, visible: true,
    defaultValue: "1:1",
    constraints: { type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4"] } },
  { name: "image_size",   label: "Resolution",   component: "select", group: "primary", order: 1, visible: true,
    defaultValue: "1K",
    constraints: { type: "select", options: ["1K", "2K", "4K"] } },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function urlToInlineData(url: string): Promise<{ mimeType: string; data: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch reference image (${res.status}): ${url}`);
  const buffer = await res.arrayBuffer();
  const mimeType = res.headers.get("content-type") ?? "image/png";
  return { mimeType, data: Buffer.from(buffer).toString("base64") };
}

// ── Generate function ─────────────────────────────────────────────────────────

async function generateWithGemini(
  apiModelId: string,
  input: ImageGenInput,
): Promise<ImageGenResult> {
  const ai = createGemini();
  const p = input.params;

  const refParts = await Promise.all(
    input.referenceUrls.map(async (url) => {
      const { mimeType, data } = await urlToInlineData(url);
      return { inlineData: { mimeType, data } };
    }),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (ai.models as any).generateContent({
    model: apiModelId,
    contents: [{ role: "user", parts: [...refParts, { text: input.prompt }] }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: p.aspect_ratio ?? "1:1",
        imageSize:   p.image_size   ?? "1K",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = response?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((pt: { inlineData?: { data?: string } }) => pt.inlineData?.data);

  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini returned no image in response");
  }

  const usage = response?.usageMetadata;
  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType ?? "image/png",
    tokensUsed: {
      text_input_tokens:   0,
      image_input_tokens:  0,
      image_output_tokens: usage?.candidatesTokenCount ?? 0,
      total_tokens:        usage?.totalTokenCount      ?? 0,
    },
  };
}

// ── Model configs ─────────────────────────────────────────────────────────────

export const geminiModels: MediaGenModelSpec[] = [
  {
    id: "gemini:gemini-2.5-flash-image",
    provider: "gemini", mediaType: "image",
    label: "Nano Banana", providerLabel: "Gemini",
    maxReferenceImages: 5, maxReferenceSizeBytes: 20 * 1024 * 1024,
    params: geminiFlashParams,
    schema: buildZodFromParams(geminiFlashParams),
    generate: (input) => generateWithGemini("gemini-2.5-flash-image", input),
  },
  {
    id: "gemini:gemini-3.1-flash-image",
    provider: "gemini", mediaType: "image",
    label: "Nano Banana 2", providerLabel: "Gemini",
    maxReferenceImages: 5, maxReferenceSizeBytes: 20 * 1024 * 1024,
    params: geminiFlashParams,
    schema: buildZodFromParams(geminiFlashParams),
    generate: (input) => generateWithGemini("gemini-3.1-flash-image", input),
  },
  {
    id: "gemini:gemini-3-pro-image",
    provider: "gemini", mediaType: "image",
    label: "Nano Banana Pro", providerLabel: "Gemini",
    maxReferenceImages: 5, maxReferenceSizeBytes: 20 * 1024 * 1024,
    params: geminiProParams,
    schema: buildZodFromParams(geminiProParams),
    generate: (input) => generateWithGemini("gemini-3-pro-image", input),
  },
];
```

- [ ] **Step 2: Verify**

```bash
cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit 2>&1 | grep "gemini"
```

Expected: no errors from `providers/gemini.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/image-gen/providers/gemini.ts
git commit -m "feat(image-gen): migrate Gemini provider to ParamSpec manifest"
```

---

## Task 5: Update `client-models.ts`

**Files:**
- Modify: `src/lib/image-gen/client-models.ts`

- [ ] **Step 1: Replace the file**

```typescript
// Client-safe model metadata. No generate functions — safe to import from React components.
// Params are imported directly from providers (single source of truth, no duplication).

import { gptImage2Params, gptImage1Params, gptImage1MiniParams } from "./providers/openai";
import { geminiFlashParams, geminiProParams } from "./providers/gemini";
import { buildZodFromParams } from "./schema-builder";
import type { ClientModelSpec, ParamSpec } from "./types";

export type { ClientModelSpec };

// ── Client model list ─────────────────────────────────────────────────────────

export const imageGenClientModels: ClientModelSpec[] = [
  {
    id: "openai:gpt-image-2",
    provider: "openai", mediaType: "image",
    label: "GPT Image 2", providerLabel: "OpenAI",
    maxReferenceImages: 10, maxReferenceSizeBytes: 50 * 1024 * 1024,
    params: gptImage2Params,
    schema: buildZodFromParams(gptImage2Params),
  },
  {
    id: "openai:gpt-image-1",
    provider: "openai", mediaType: "image",
    label: "GPT Image 1", providerLabel: "OpenAI",
    maxReferenceImages: 10, maxReferenceSizeBytes: 50 * 1024 * 1024,
    params: gptImage1Params,
    schema: buildZodFromParams(gptImage1Params),
  },
  {
    id: "openai:gpt-image-1-mini",
    provider: "openai", mediaType: "image",
    label: "GPT Image 1 Mini", providerLabel: "OpenAI",
    maxReferenceImages: 5, maxReferenceSizeBytes: 50 * 1024 * 1024,
    params: gptImage1MiniParams,
    schema: buildZodFromParams(gptImage1MiniParams),
  },
  {
    id: "gemini:gemini-2.5-flash-image",
    provider: "gemini", mediaType: "image",
    label: "Nano Banana", providerLabel: "Gemini",
    maxReferenceImages: 5, maxReferenceSizeBytes: 20 * 1024 * 1024,
    params: geminiFlashParams,
    schema: buildZodFromParams(geminiFlashParams),
  },
  {
    id: "gemini:gemini-3.1-flash-image",
    provider: "gemini", mediaType: "image",
    label: "Nano Banana 2", providerLabel: "Gemini",
    maxReferenceImages: 5, maxReferenceSizeBytes: 20 * 1024 * 1024,
    params: geminiFlashParams,
    schema: buildZodFromParams(geminiFlashParams),
  },
  {
    id: "gemini:gemini-3-pro-image",
    provider: "gemini", mediaType: "image",
    label: "Nano Banana Pro", providerLabel: "Gemini",
    maxReferenceImages: 5, maxReferenceSizeBytes: 20 * 1024 * 1024,
    params: geminiProParams,
    schema: buildZodFromParams(geminiProParams),
  },
];

export const imageGenClientModelMap: Record<string, ClientModelSpec> =
  Object.fromEntries(imageGenClientModels.map((m) => [m.id, m]));

export const imageGenClientModelGroups: Array<{
  provider: string;
  label: string;
  models: ClientModelSpec[];
}> = [
  { provider: "openai", label: "OpenAI", models: imageGenClientModels.filter((m) => m.provider === "openai") },
  { provider: "gemini", label: "Gemini", models: imageGenClientModels.filter((m) => m.provider === "gemini") },
];

export const DEFAULT_CLIENT_MODEL_ID = "openai:gpt-image-2";

// Extract default values from a model's ParamSpec array (replaces defaultsForSchema).
export function defaultsForModel(model: ClientModelSpec): Record<string, unknown> {
  return Object.fromEntries(
    model.params
      .filter((p: ParamSpec) => p.defaultValue !== null && p.defaultValue !== undefined)
      .map((p: ParamSpec) => [p.name, p.defaultValue]),
  );
}

// Legacy alias — remove once image-gen-focus-view.tsx is updated in Task 10.
export function defaultsForSchema(schema: ClientModelSpec["schema"]): Record<string, unknown> {
  const parsed = schema.safeParse({});
  if (parsed.success) return parsed.data as Record<string, unknown>;
  return {};
}

// Legacy type alias for components still using the old name.
export type ImageGenClientModel = ClientModelSpec;
```

- [ ] **Step 2: Verify**

```bash
cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit 2>&1 | grep "client-models"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/image-gen/client-models.ts
git commit -m "feat(image-gen): rewrite client-models to import from providers (no Zod duplication)"
```

---

## Task 6: Update `registry.ts`

**Files:**
- Modify: `src/lib/image-gen/registry.ts`

- [ ] **Step 1: Update the file**

The registry already has `schema` now (set in each model config in Tasks 3 & 4), so only the type import needs updating:

```typescript
import type { MediaGenModelSpec } from "./types";
import { openaiModels } from "./providers/openai";
import { geminiModels } from "./providers/gemini";

const allModels: MediaGenModelSpec[] = [...openaiModels, ...geminiModels];

export const imageGenRegistry: Record<string, MediaGenModelSpec> = Object.fromEntries(
  allModels.map((m) => [m.id, m]),
);

export const imageGenModelGroups: Array<{
  provider: string;
  label: string;
  models: MediaGenModelSpec[];
}> = [
  { provider: "openai", label: "OpenAI", models: openaiModels },
  { provider: "gemini", label: "Gemini", models: geminiModels },
];

export const DEFAULT_MODEL_ID = "openai:gpt-image-2";
```

- [ ] **Step 2: Verify**

```bash
cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit 2>&1 | grep "registry"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/image-gen/registry.ts
git commit -m "feat(image-gen): update registry to use MediaGenModelSpec"
```

---

## Task 7: Update `utils.ts`

**Files:**
- Modify: `src/lib/image-gen/utils.ts`

- [ ] **Step 1: Replace the file**

```typescript
import type { ClientModelSpec } from "./types";

export function enumOptions(model: ClientModelSpec, field: string): string[] {
  const spec = model.params.find((p) => p.name === field);
  if (spec?.constraints.type === "select") return spec.constraints.options;
  return [];
}
```

- [ ] **Step 2: Verify**

```bash
cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors anywhere in `src/lib/image-gen/`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/image-gen/utils.ts
git commit -m "feat(image-gen): replace enumOptions Zod introspection with ParamSpec lookup"
```

---

## Task 8: Create param control components

**Files:**
- Create: `src/components/nodes/param-controls/select-control.tsx`
- Create: `src/components/nodes/param-controls/slider-control.tsx`
- Create: `src/components/nodes/param-controls/toggle-control.tsx`
- Create: `src/components/nodes/param-controls/number-control.tsx`
- Create: `src/components/nodes/param-controls/textarea-control.tsx`
- Create: `src/components/nodes/param-controls/index.tsx`

The shared select class from the existing output-settings component:

```
"min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
```

- [ ] **Step 1: Create `select-control.tsx`**

```typescript
"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ParamSpec } from "@/lib/image-gen/types";

const SELECT_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

type Props = { spec: ParamSpec; form: UseFormReturn<Record<string, unknown>> };

export function SelectControl({ spec, form }: Props) {
  if (spec.constraints.type !== "select") return null;
  const value = String(form.watch(spec.name) ?? spec.defaultValue ?? "");

  return (
    <select
      value={value}
      onChange={(e) => {
        form.setValue(spec.name as never, e.target.value as never, { shouldDirty: true });
      }}
      className={SELECT_CLS}
    >
      {spec.constraints.options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Create `slider-control.tsx`**

```typescript
"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ParamSpec } from "@/lib/image-gen/types";

type Props = { spec: ParamSpec; form: UseFormReturn<Record<string, unknown>> };

export function SliderControl({ spec, form }: Props) {
  if (spec.constraints.type !== "slider") return null;
  const { min, max, step = 1 } = spec.constraints;
  const raw = form.watch(spec.name);
  const value = typeof raw === "number" ? raw : typeof spec.defaultValue === "number" ? spec.defaultValue : min;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          form.setValue(spec.name as never, Number(e.target.value) as never, { shouldDirty: true });
        }}
        className="flex-1 accent-primary"
      />
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {value}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Create `toggle-control.tsx`**

```typescript
"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ParamSpec } from "@/lib/image-gen/types";

type Props = { spec: ParamSpec; form: UseFormReturn<Record<string, unknown>> };

export function ToggleControl({ spec, form }: Props) {
  if (spec.constraints.type !== "toggle") return null;
  const raw = form.watch(spec.name);
  const checked = typeof raw === "boolean" ? raw : Boolean(spec.defaultValue);

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => {
        form.setValue(spec.name as never, e.target.checked as never, { shouldDirty: true });
      }}
      className="accent-primary"
    />
  );
}
```

- [ ] **Step 4: Create `number-control.tsx`**

```typescript
"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ParamSpec } from "@/lib/image-gen/types";

const INPUT_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

type Props = { spec: ParamSpec; form: UseFormReturn<Record<string, unknown>> };

export function NumberControl({ spec, form }: Props) {
  if (spec.constraints.type !== "number") return null;
  const { min, max, step } = spec.constraints;
  const raw = form.watch(spec.name);
  const value = typeof raw === "number" ? raw : typeof spec.defaultValue === "number" ? spec.defaultValue : "";

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => {
        const n = e.target.value === "" ? undefined : Number(e.target.value);
        form.setValue(spec.name as never, n as never, { shouldDirty: true });
      }}
      className={INPUT_CLS}
    />
  );
}
```

- [ ] **Step 5: Create `textarea-control.tsx`**

```typescript
"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ParamSpec } from "@/lib/image-gen/types";

const TEXTAREA_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none";

type Props = { spec: ParamSpec; form: UseFormReturn<Record<string, unknown>> };

export function TextareaControl({ spec, form }: Props) {
  if (spec.constraints.type !== "textarea") return null;
  const raw = form.watch(spec.name);
  const value = typeof raw === "string" ? raw : typeof spec.defaultValue === "string" ? spec.defaultValue : "";

  return (
    <textarea
      rows={3}
      maxLength={spec.constraints.maxLength}
      value={value}
      onChange={(e) => {
        form.setValue(spec.name as never, e.target.value as never, { shouldDirty: true });
      }}
      className={TEXTAREA_CLS}
    />
  );
}
```

- [ ] **Step 6: Create `index.tsx` dispatcher**

```typescript
"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ParamSpec } from "@/lib/image-gen/types";
import { SelectControl }   from "./select-control";
import { SliderControl }   from "./slider-control";
import { ToggleControl }   from "./toggle-control";
import { NumberControl }   from "./number-control";
import { TextareaControl } from "./textarea-control";

type Props = { spec: ParamSpec; form: UseFormReturn<Record<string, unknown>> };

export function ParamControl({ spec, form }: Props) {
  switch (spec.component) {
    case "select":   return <SelectControl   spec={spec} form={form} />;
    case "slider":   return <SliderControl   spec={spec} form={form} />;
    case "toggle":   return <ToggleControl   spec={spec} form={form} />;
    case "number":   return <NumberControl   spec={spec} form={form} />;
    case "textarea": return <TextareaControl spec={spec} form={form} />;
  }
}
```

- [ ] **Step 7: Verify**

```bash
cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit 2>&1 | grep "param-controls"
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/nodes/param-controls/
git commit -m "feat(image-gen): add generic param control components (select/slider/toggle/number/textarea)"
```

---

## Task 9: Rewrite `image-gen-output-settings.tsx`

**Files:**
- Modify: `src/components/nodes/image-gen-output-settings.tsx`

- [ ] **Step 1: Replace the file**

```typescript
"use client";

import { useState } from "react";
import {
  ChevronDown,
  Cpu,
  Crop,
  FileImage,
  Gauge,
  Layers,
  LayoutGrid,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { cn } from "@/lib/utils";
import {
  imageGenClientModelGroups,
  type ClientModelSpec,
} from "@/lib/image-gen/client-models";
import { ParamControl } from "./param-controls";
import { ImageGenParamRow } from "./image-gen-param-row";
import type { ParamSpec } from "@/lib/image-gen/types";

type ParamFormValues = Record<string, unknown>;

type Props = {
  model: ClientModelSpec;
  form: UseFormReturn<ParamFormValues>;
  onCommit: (values: ParamFormValues) => void;
  onModelChange: (id: string) => void;
};

// Icon per param name — presentation concern stays in this component, not in ParamSpec
const PARAM_ICONS: Record<string, LucideIcon> = {
  size:              LayoutGrid,
  quality:           Gauge,
  aspect_ratio:      Crop,
  image_size:        LayoutGrid,
  background:        Layers,
  output_format:     FileImage,
  output_compression: Settings2,
  duration_seconds:  Settings2,
  resolution:        Settings2,
};

const SELECT_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export function ImageGenOutputSettings({ model, form, onCommit, onModelChange }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const commit = () => onCommit(form.getValues());

  const primaryParams = model.params
    .filter((p: ParamSpec) => p.group === "primary" && p.visible)
    .sort((a: ParamSpec, b: ParamSpec) => a.order - b.order);

  const advancedParams = model.params
    .filter((p: ParamSpec) => p.group === "advanced" && p.visible)
    .sort((a: ParamSpec, b: ParamSpec) => a.order - b.order);

  return (
    <div className="space-y-2">
      {/* Model selector — always visible */}
      <ImageGenParamRow icon={Cpu} label="Model">
        <select
          value={model.id}
          onChange={(e) => onModelChange(e.target.value)}
          className={SELECT_CLS}
        >
          {imageGenClientModelGroups.map((g) => (
            <optgroup key={g.provider} label={g.label}>
              {g.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </ImageGenParamRow>

      {/* Primary params */}
      {primaryParams.map((param: ParamSpec) => (
        <ImageGenParamRow
          key={param.name}
          icon={PARAM_ICONS[param.name] ?? Settings2}
          label={param.label}
        >
          <div onChange={commit}>
            <ParamControl spec={param} form={form} />
          </div>
        </ImageGenParamRow>
      ))}

      {/* Advanced accordion */}
      {advancedParams.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex w-full items-center justify-between text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="tracking-wide uppercase">Advanced</span>
            <ChevronDown
              className={cn("size-3 transition-transform duration-200", advancedOpen && "rotate-180")}
              strokeWidth={1.5}
            />
          </button>

          {advancedOpen && (
            <div className="mt-2 space-y-2">
              {advancedParams.map((param: ParamSpec) => (
                <ImageGenParamRow
                  key={param.name}
                  icon={PARAM_ICONS[param.name] ?? Settings2}
                  label={param.label}
                >
                  <div onChange={commit}>
                    <ParamControl spec={param} form={form} />
                  </div>
                </ImageGenParamRow>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

> **Note on `onChange` bubbling:** The `<div onChange={commit}>` wrapper catches change events that bubble up from child `<select>`, `<input>`, and `<textarea>` elements, triggering `commit()` on every param change — same behavior as the original. This works because React's synthetic `onChange` bubbles like `oninput` in the DOM.

- [ ] **Step 2: Verify**

```bash
cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit 2>&1 | grep "output-settings"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/image-gen-output-settings.tsx
git commit -m "feat(image-gen): rewrite output settings as generic ParamSpec renderer"
```

---

## Task 10: Update `image-gen-focus-view.tsx`

**Files:**
- Modify: `src/components/nodes/image-gen-focus-view.tsx`

The focus view currently imports `defaultsForSchema` and `type ImageGenClientModel`. After this task, it uses `defaultsForModel` and `ClientModelSpec`.

- [ ] **Step 1: Update the import block (lines 42–47)**

Change:
```typescript
import {
  imageGenClientModelMap,
  DEFAULT_CLIENT_MODEL_ID,
  defaultsForSchema,
  type ImageGenClientModel,
} from "@/lib/image-gen/client-models";
```

To:
```typescript
import {
  imageGenClientModelMap,
  DEFAULT_CLIENT_MODEL_ID,
  defaultsForModel,
  type ClientModelSpec,
} from "@/lib/image-gen/client-models";
```

- [ ] **Step 2: Update the `model` type annotation (line 164)**

Change:
```typescript
const model =
  imageGenClientModelMap[selectedModelId] ??
  imageGenClientModelMap[DEFAULT_CLIENT_MODEL_ID];
```

No change needed to this line — just remove the explicit `: ImageGenClientModel` annotation if it appears anywhere. The map now returns `ClientModelSpec`.

- [ ] **Step 3: Update `defaultsForSchema` calls (lines 169 and 191)**

Line 169 — form initialization:
```typescript
// Before:
defaultValues: { ...defaultsForSchema(model.schema), ...(params ?? {}) },
// After:
defaultValues: { ...defaultsForModel(model), ...(params ?? {}) },
```

Line 191 — model change effect:
```typescript
// Before:
const defaults = defaultsForSchema(model.schema);
// After:
const defaults = defaultsForModel(model);
```

- [ ] **Step 4: Verify — full clean compile**

```bash
cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit
```

Expected: **zero errors**.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/image-gen-focus-view.tsx
git commit -m "feat(image-gen): update focus view to use ClientModelSpec and defaultsForModel"
```

---

## Task 11: End-to-end verification

- [ ] **Step 1: Start dev server**

```bash
cd e:\CreativeOS\creativeos-mvp && npm run dev
```

- [ ] **Step 2: Open image gen focus view**

Open a canvas with an Image Gen node → click to open the focus view.

Verify:
- Model selector dropdown shows all 6 models grouped by provider (OpenAI / Gemini)
- Switching from OpenAI to Gemini model updates params to show Aspect ratio + Resolution
- Switching from Gemini to OpenAI shows Size + Quality
- Advanced accordion appears for OpenAI models, collapses/expands on click
- Advanced accordion does NOT appear for Gemini models (no advanced params defined)

- [ ] **Step 3: Test param changes commit**

Change Size → verify the change persists (no console errors, node patch fires).

- [ ] **Step 4: Test generation**

Click Generate → image generates successfully → check Supabase `node_versions.params_used` contains all params (including `output_compression: 80` for OpenAI even though it's hidden in UI).

- [ ] **Step 5: Clean up legacy aliases**

Once you've verified everything works, remove the two legacy aliases from `client-models.ts`:

```typescript
// Remove these two lines:
export function defaultsForSchema(...) { ... }
export type ImageGenClientModel = ClientModelSpec;
```

Then run `npx tsc --noEmit` again to confirm nothing still imports them. Commit:

```bash
git add src/lib/image-gen/client-models.ts
git commit -m "chore(image-gen): remove legacy defaultsForSchema and ImageGenClientModel aliases"
```
