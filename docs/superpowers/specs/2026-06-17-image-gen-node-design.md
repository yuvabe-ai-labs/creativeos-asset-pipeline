# Image Generation Node — Design

**Date:** 2026-06-17
**Status:** Implemented (2026-06-18)

---

## Context

Designers currently leave CreativeOS to run image generation in external tools (OpenAI playground, Gemini AI Studio, etc.) after using the Prompt node to craft an image prompt. This breaks the "no platform switching" principle (PRD §4.1) and loses the generation history the studio needs to learn from (PRD §4.4).

The Image Gen node closes this gap: once a designer has a prompt text from a connected Prompt node, they can generate, compare, approve, and archive image attempts without leaving the canvas.

The node is already defined in `VALID_CONNECTIONS` and `AppNode` — this design completes the implementation.

---

## Goals

- Generate images from a connected Prompt node's output using OpenAI or Gemini
- Support multiple providers and models via a config-driven registry (scalable for new providers)
- Track every attempt with full provenance (inputs, params, model, cost)
- Show cost in USD + INR per attempt (same pattern as prompt node)
- Accept connected reference images (passed as Supabase public URLs — no base64)
- Approve / reject attempts inline
- Zoomable image output in a dialog
- One node = one active image output (single source, D19)

---

## Models

| Provider | Model ID (API) | Label | Notes |
|----------|---------------|-------|-------|
| OpenAI | `gpt-image-2` | GPT Image 2 | Latest, reasoning-enhanced |
| OpenAI | `gpt-image-1` | GPT Image 1 | Flagship |
| OpenAI | `gpt-image-1-mini` | GPT Image 1 Mini | Budget |
| Gemini | `gemini-3.1-flash-image-preview` | Nano Banana 2 | Fast |
| Gemini | `gemini-3-pro-image-preview` | Nano Banana Pro | High-fidelity |

---

## Architecture

### Provider Registry (`src/lib/image-gen/`)

```
src/lib/image-gen/
  registry.ts          ← master registry: modelId → ImageGenModelConfig
  types.ts             ← shared types: ImageGenParams, ImageGenResult, ImageTokenUsage
  cost.ts              ← token-based cost calculator
  providers/
    openai.ts          ← gpt-image-2, gpt-image-1, gpt-image-1-mini
    gemini.ts          ← gemini-3.1-flash-image-preview, gemini-3-pro-image-preview
```

Each registry entry:

```typescript
type ImageGenModelConfig = {
  id: string;                          // "openai:gpt-image-1"
  provider: "openai" | "gemini";
  apiModelId: string;                  // actual API model string
  label: string;                       // display name
  providerLabel: string;               // "OpenAI" | "Gemini"
  schema: ZodObject;                   // validates params + drives react-hook-form
  maxReferenceImages: number;          // model-specific limit
  maxReferenceSizeBytes: number;       // e.g. 50MB for OpenAI
  generate: (input: ImageGenInput) => Promise<ImageGenResult>;
};

type ImageGenInput = {
  prompt: string;            // from connected Prompt node's active output
  referenceUrls: string[];   // Supabase public URLs — never base64
  params: Record<string, unknown>;  // validated by schema
};

type ImageGenResult = {
  imageBase64: string;       // returned from API, immediately uploaded
  mimeType: string;
  tokensUsed: ImageTokenUsage;
};

type ImageTokenUsage = {
  text_input_tokens: number;
  image_input_tokens: number;
  image_output_tokens: number;
  total_tokens: number;
};
```

Adding a new provider = create `providers/<name>.ts`, add entries to `registry.ts`. No other files change.

---

## Provider Params (Zod Schemas)

### OpenAI — `gpt-image-2` and `gpt-image-1`

```typescript
z.object({
  size: z.enum(["auto", "1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  background: z.enum(["auto", "opaque", "transparent"]).default("auto"),
  output_format: z.enum(["png", "jpeg", "webp"]).default("png"),
  output_compression: z.number().min(0).max(100).optional(),  // shown in form only when output_format is jpeg or webp
})
```

### OpenAI — `gpt-image-1-mini`

```typescript
z.object({
  size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  output_format: z.enum(["png", "jpeg", "webp"]).default("png"),
})
// No background/transparency support
```

### Gemini — `gemini-3.1-flash-image-preview` (Nano Banana 2)

```typescript
z.object({
  aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "4:1", "1:4"]).default("1:1"),
  image_size: z.enum(["512", "1K", "2K", "4K"]).default("1K"),
  output_mime_type: z.enum(["image/png", "image/jpeg"]).default("image/png"),
  safety_filter_level: z.enum(["block_low_and_above", "block_medium_and_above", "block_only_high"]).default("block_medium_and_above"),
  person_generation: z.enum(["allow_adult", "disallow"]).default("allow_adult"),
})
```

### Gemini — `gemini-3-pro-image-preview` (Nano Banana Pro)

```typescript
z.object({
  aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).default("1:1"),
  image_size: z.enum(["1K", "2K", "4K"]).default("1K"),
  output_mime_type: z.enum(["image/png", "image/jpeg"]).default("image/png"),
  safety_filter_level: z.enum(["block_low_and_above", "block_medium_and_above", "block_only_high"]).default("block_medium_and_above"),
  person_generation: z.enum(["allow_adult", "disallow"]).default("allow_adult"),
  thinking_level: z.enum(["none", "low", "high"]).default("low"),
})
```

---

## Cost Tracking (`src/lib/image-gen/cost.ts`)

Token-based, computed at read time (never stored):

```typescript
// Per 1M tokens, USD
// Keys must match registry entry `id` exactly
const IMAGE_MODEL_PRICING = {
  "openai:gpt-image-2":                        { textIn: 5.00, imgIn: 8.00,  imgOut: 30.00 },
  "openai:gpt-image-1":                        { textIn: 5.00, imgIn: 10.00, imgOut: 40.00 },
  "openai:gpt-image-1-mini":                   { textIn: 2.00, imgIn: 2.50,  imgOut: 8.00  },
  "gemini:gemini-3.1-flash-image-preview":     { imgOut: 60.00 },
  "gemini:gemini-3-pro-image-preview":         { imgOut: 80.00 },  // estimated — update when Google publishes
};

function computeImageCost(modelId: string, tokens: ImageTokenUsage): { usd: number; inr: number }
```

Gemini token reference: 512→747t, 1K→1120t, 2K→1680t, 4K→2520t output tokens.
USD → INR: uses existing `USD_TO_INR = 95.77` constant from `src/lib/pricing.ts`.

---

## Data Model

### `ImageGenNodeData` (added to `canvas-nodes.ts`)

```typescript
type ImageGenNodeData = {
  title?: string;
  modelId?: string;                   // "openai:gpt-image-1" — saved on node
  params?: Record<string, unknown>;   // last-used param values for selected model
  parsed?: unknown;                   // D19: active version output (image URL, display only)
};
```

`parsed` is hydrated from `node_versions.output` on canvas load via `nodeRowToFlow()` and never persisted back (same D19 pattern as all other nodes).

### `node_versions` columns (no migration needed — fits existing JSONB)

```
params_used:  { modelId, size/aspect_ratio/quality/..., tokensUsed: ImageTokenUsage }
inputs_used:  { promptNodeId, promptVersionId, referenceImageUrls: string[] }
output:       "https://<supabase>/storage/v1/object/public/node-files/image-gen/<id>.png"
generated_output: same URL (D22 — frozen at generation, never overwritten)
model_used:   "openai:gpt-image-1"
decision:     "pass" | "fail" | null
```

### Image storage

Generated images are uploaded to the existing `node-files` Supabase Storage bucket at:
```
node-files/image-gen/<nodeId>/<versionId>.<ext>
```
The public URL is stored as the version `output`. Reference images use their existing Supabase public URLs — they are never re-encoded to base64.

---

## Canvas Connections

No changes to `VALID_CONNECTIONS` or `AppNode` discriminated union — `image-gen` is already defined. Only addition needed:

```typescript
// canvas-nodes.ts — add to AppNode union:
| Node<ImageGenNodeData, "image-gen">

// canvas.tsx — add to nodeTypes registry:
"image-gen": ImageGenNode
```

---

## Component Structure

### `image-gen-node.tsx` (canvas card)

Follows `prompt-node.tsx` pattern exactly:
- `NodeContextMenu` wrapper (duplicate / delete)
- Compact card (`w-44`):
  - Header: `ImageIcon` + "Image Gen" + status dot
  - Body: title + 32×32 thumbnail if active image exists, else "No image"
- `Handle` type=target (left), type=source (right)
- Double-click / "Open ↗" → `ImageGenFocusView`

### `image-gen-focus-view.tsx` (full-screen sheet)

Two-panel layout matching `prompt-focus-view.tsx`:

**Header:**
- Inline-editable title
- `ImageGenUsagePopover` (cost breakdown icon, shown when versions exist)
- Generate button (primary, disabled while generating or no Prompt node connected)

**Left panel (~40%):**
1. `ImageGenVersionHistory` — v1/v2/v3 list, restore on hover, approve/reject badge
2. Provider + model grouped `<select>` — saves `modelId` to node data on change; resets params form to schema defaults
3. Params form — `useForm` (react-hook-form) + resolver from selected model's Zod schema. Fields rendered dynamically per model. Saves to `node.data.params` on blur.
4. `ConnectedInputsCard` (reused) — shows:
   - Connected Prompt node output (text preview, read-only)
   - Connected reference images (thumbnails), with per-model limit warning if exceeded

**Right panel (~60%):**

Three states:
- **EMPTY** — "Connect a Prompt node and click Generate"
- **SKELETON** — shimmer rectangle at generated aspect ratio while in-flight
- **RESULT** — full-width generated image
  - `cursor-zoom-in` on hover
  - Click → `Dialog` with `react-zoom-pan-pinch` viewer (scroll to zoom, drag to pan, double-click to reset)
  - Below: `InlineEvalBar` (reused — pass/fail thumbs + note textarea)

---

## API Route

### `POST /api/nodes/[id]/image-generate`

```
src/app/api/nodes/[id]/image-generate/route.ts
```

Flow:
1. Parse body: `{ modelId, params }`
2. Validate `modelId` exists in registry → `apiError(400)` if not
3. Validate `params` against `registry[modelId].schema` → Zod parse errors → `apiError(400)`
4. `getUpstreamOutputs(nodeId)`:
   - Find connected Prompt node → get its active version text output
   - Find connected File/ImageGen reference nodes → collect Supabase public URLs
5. Enforce `config.maxReferenceImages` — trim extras, add warning to response
6. `registry[modelId].generate({ prompt, referenceUrls, params })`
7. Upload result image to Supabase Storage → get `publicImageUrl`
8. `insertVersion({ nodeId, inputsUsed, paramsUsed, modelUsed, output: publicImageUrl, generated_output: publicImageUrl })`
9. `setActiveVersion(nodeId, version.id)`
10. Return `{ imageUrl: publicImageUrl, versionId }`

Error path: failed generation still calls `insertVersion({ error })` for audit trail — same as prompt node.

Reused unchanged:
- `GET /api/nodes/[id]/versions` — fetches version history
- `POST /api/nodes/[id]/restore-version` — restores active pointer

---

## Usage Popover (`image-gen-usage-popover.tsx`)

Mirrors `prompt-usage-popover.tsx`:
- **Overall:** total images generated, total cost (USD + INR)
- **Per-generation:** version number, relative time, model label, cost per image
- Uses `computeImageCost(modelId, tokensUsed)` from `cost.ts`

---

## New Dependencies

- `react-zoom-pan-pinch` — zoomable image viewer in dialog
  - Install: `npm install react-zoom-pan-pinch`
- `@google/genai` — Gemini SDK
  - Install: `npm install @google/genai`
- New env var: `GOOGLE_GENAI_API_KEY`

OpenAI SDK (`openai`) already installed.

---

## Staleness Detection

Follows existing D9 pattern: if the connected Prompt node's `active_version_id` changes after an image was generated, the canvas card shows a stale indicator dot. Detected by comparing `inputs_used.promptVersionId` of the active image version against the Prompt node's current `active_version_id`.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/image-gen/types.ts` | Shared types |
| `src/lib/image-gen/registry.ts` | Master model registry |
| `src/lib/image-gen/cost.ts` | Token-based cost calculator |
| `src/lib/image-gen/providers/openai.ts` | OpenAI 3 model configs + generate() |
| `src/lib/image-gen/providers/gemini.ts` | Gemini 2 model configs + generate() |
| `src/app/api/nodes/[id]/image-generate/route.ts` | POST generation route |
| `src/components/nodes/image-gen-node.tsx` | Canvas card |
| `src/components/nodes/image-gen-focus-view.tsx` | Full-screen focus view |
| `src/components/nodes/image-gen-version-history.tsx` | Version list with badges |
| `src/components/nodes/image-gen-usage-popover.tsx` | Per-image cost breakdown |

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/canvas-nodes.ts` | Add `ImageGenNodeData` type + `image-gen` to `AppNode` union |
| `src/components/canvas/canvas.tsx` | Register `"image-gen": ImageGenNode` in `nodeTypes` |
| `src/lib/nodes/node-output.ts` | Add `image-gen` case → return `activeOutput` (image URL) |
| `src/lib/pricing.ts` | No change — `cost.ts` is separate; keeps text pricing clean |
| `.env` | Add `GOOGLE_GENAI_API_KEY` |

---

## Implementation Notes

Deviations and decisions made during implementation (2026-06-18):

**OpenAI API:** Used the Images API (`openai.images.generate` / `openai.images.edit`), NOT the Responses API. GPT image models (`gpt-image-1`, `gpt-image-1-mini`, `gpt-image-2`) do not support the Responses API or the `response_format` parameter — they always return `data[0].b64_json`. Reference images are fetched server-side as `File` objects and passed to `images.edit()`.

**Client-safe model mirror:** Added `src/lib/image-gen/client-models.ts` — a client-side duplicate of the Zod schemas + model metadata that does not import server-only SDK code. This is required because the focus view (a React client component) needs schemas for form validation, but the registry imports `"server-only"` providers.

**Gemini reference images:** Fetched server-side as inline base64 — Gemini's API does not accept arbitrary HTTP URLs.

**Test setup:** Added `__mocks__/server-only.ts` (exports `{}`) and a `vitest.config.ts` alias for `"server-only"` so registry tests can import server-side modules without crashing.

**UI label fix (post-ship):** `InlineEvalBar` originally hardcoded "Generated Prompt" as the section label. Added an optional `label` prop (defaulting to `"Generated Prompt"` for backward compatibility) so Image Gen focus view can pass `"Generated Image"`.

**Connected inputs preview:** Focus view fetches the connected prompt node's active version output via `/api/nodes/<promptId>/versions` on open, then passes it as `ConnectedPreview[]` so the expanded card shows the actual prompt text instead of "No output yet".

---

## Verification

1. **Registry unit test:** `registry["openai:gpt-image-1"].schema.parse({})` returns defaults without throwing
2. **Cost unit test:** `computeImageCost("openai:gpt-image-1", { image_output_tokens: 1000, ... })` returns correct USD
3. **API route:** POST with valid modelId + params → returns `{ imageUrl, versionId }` with image accessible at URL
4. **Canvas:** Image Gen node appears in right-click add menu, connects to/from Prompt node correctly
5. **Focus view:** Switch model → form fields update to new model's params; old params cleared
6. **Reference limit:** Connect more reference images than model max → warning shown, extras ignored
7. **Version restore:** Restore old version → canvas card thumbnail updates to restored image
8. **Usage popover:** After 2 generations → popover shows per-image cost in USD + INR
9. **Zoom dialog:** Click generated image → dialog opens; scroll zooms; double-click resets
10. **Staleness:** Re-generate from Prompt node → downstream Image Gen node shows stale indicator
