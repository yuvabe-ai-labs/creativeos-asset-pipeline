# Image Reference Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate reference image size and dimensions against per-model limits before any API call, show chip-level warnings in the focus view, and fix the incorrect Gemini registry limits.

**Architecture:** Pure validation logic lives in `src/lib/image-gen/validate.ts` (shared between client and server). Metadata (`fileSizeBytes`, `imageWidth`, `imageHeight`) is stored on node data at upload/generation time. Server validates before `insertGeneration()`; client disables Generate and warns on chips using the same function.

**Tech Stack:** TypeScript, Next.js App Router, Supabase, `sharp` (already a transitive dep via Next.js image optimization), Vitest, React/Tailwind.

---

## File map

| File | Action | What changes |
|---|---|---|
| `src/lib/canvas-nodes.ts` | Modify | Add `fileSizeBytes?`, `imageWidth?`, `imageHeight?` to `FileNodeData` and `DrawNodeData` |
| `src/lib/image-gen/types.ts` | Modify | Add `maxTotalReferenceSizeBytes?`, `maxImageEdgePx?`, `maxAspectRatio?`, `minDimensionMultiple?` to `MediaGenModelSpec` |
| `src/lib/image-gen/validate.ts` | **Create** | Pure `validateReferenceImages` function + types |
| `src/lib/image-gen/__tests__/validate.test.ts` | **Create** | Unit tests for all validation rules |
| `src/lib/image-gen/providers/openai.ts` | Modify | Add new limit fields to all 3 OpenAI model specs |
| `src/lib/image-gen/providers/gemini.ts` | Modify | Fix `maxReferenceSizeBytes` → `maxTotalReferenceSizeBytes: 100 MB` on all 3 Gemini specs |
| `src/lib/image-gen/client-models.ts` | Modify | Mirror registry fixes |
| `src/app/api/nodes/[id]/file/route.ts` | Modify | Add sharp dimension read + include metadata in response |
| `src/app/api/nodes/[id]/image-generate/route.ts` | Modify | Build `RefImageMeta[]`, call `validateReferenceImages`, backfill metadata lazily |
| `src/app/api/nodes/[id]/upstream-images/route.ts` | Modify | Return `fileSizeBytes`, `imageWidth`, `imageHeight` per image |
| `src/components/nodes/image-gen-focus-view.tsx` | Modify | Extend `upstream` prop type, add chip warnings, disable Generate on violations |

---

## Task 1: Add image metadata fields to node data types

**Files:**
- Modify: `src/lib/canvas-nodes.ts`

- [ ] **Add fields to `FileNodeData` and `DrawNodeData`**

In `src/lib/canvas-nodes.ts`, update both types:

```ts
export type FileNodeData = {
  title?: string;
  filename?: string;
  fileExt?: string;
  fileKind?: "text" | "image" | "document";
  fileUrl?: string;
  rawText?: string;
  useLlm?: boolean;
  llmPrompt?: string;
  processedOutput?: string;
  // image metadata — populated at upload time for size/dimension validation
  fileSizeBytes?: number;
  imageWidth?: number;
  imageHeight?: number;
};

export type DrawNodeData = {
  title?: string;
  fileUrl?: string;
  fileKind?: "image";
  filename?: string;
  instructions?: string;
  // image metadata — populated at upload time for size/dimension validation
  fileSizeBytes?: number;
  imageWidth?: number;
  imageHeight?: number;
};
```

- [ ] **Type-check**

```bash
cd creativeos-mvp && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Commit**

```bash
git add src/lib/canvas-nodes.ts
git commit -m "feat(types): add fileSizeBytes, imageWidth, imageHeight to FileNodeData and DrawNodeData"
```

---

## Task 2: Extend model spec types with new limit fields

**Files:**
- Modify: `src/lib/image-gen/types.ts`

- [ ] **Add new fields to `MediaGenModelSpec`**

In `src/lib/image-gen/types.ts`, update `MediaGenModelSpec`:

```ts
export type MediaGenModelSpec = {
  id:                          string;
  provider:                    string;
  mediaType:                   MediaType;
  label:                       string;
  providerLabel:               string;
  maxReferenceImages:          number;
  maxReferenceSizeBytes:       number;        // per-image (OpenAI); set to 0 for Gemini models
  maxTotalReferenceSizeBytes?: number;        // aggregate all images combined (Gemini: 100 MB)
  maxImageEdgePx?:             number;        // max pixels on either edge (OpenAI: 3840)
  maxAspectRatio?:             number;        // max long:short ratio (OpenAI: 3.0)
  minDimensionMultiple?:       number;        // both edges must be multiples of N (OpenAI: 16)
  supportsMask?:               boolean;
  params:                      ParamSpec[];
  schema:                      ZodTypeAny;
  generate:                    (input: ImageGenInput) => Promise<ImageGenResult>;
};
```

`ClientModelSpec` is `Omit<MediaGenModelSpec, "generate">` — it inherits the new fields automatically.

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors (new fields are optional).

- [ ] **Commit**

```bash
git add src/lib/image-gen/types.ts
git commit -m "feat(types): add maxTotalReferenceSizeBytes, maxImageEdgePx, maxAspectRatio, minDimensionMultiple to MediaGenModelSpec"
```

---

## Task 3: Write the pure validation function (TDD)

**Files:**
- Create: `src/lib/image-gen/validate.ts`
- Create: `src/lib/image-gen/__tests__/validate.test.ts`

- [ ] **Write the failing tests first**

Create `src/lib/image-gen/__tests__/validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateReferenceImages } from "../validate";
import type { RefImageMeta } from "../validate";

const openaiModel = {
  label: "GPT Image 2",
  maxReferenceSizeBytes: 50 * 1024 * 1024,      // 50 MB
  maxTotalReferenceSizeBytes: undefined,
  maxImageEdgePx: 3840,
  maxAspectRatio: 3.0,
  minDimensionMultiple: 16,
};

const geminiModel = {
  label: "Nano Banana",
  maxReferenceSizeBytes: 0,
  maxTotalReferenceSizeBytes: 100 * 1024 * 1024, // 100 MB
  maxImageEdgePx: undefined,
  maxAspectRatio: undefined,
  minDimensionMultiple: undefined,
};

describe("validateReferenceImages", () => {
  it("returns ok for empty image list", () => {
    expect(validateReferenceImages([], openaiModel)).toEqual({ ok: true });
  });

  it("returns ok when all metadata is absent (skip checks)", () => {
    const images: RefImageMeta[] = [{ url: "https://example.com/a.png" }];
    expect(validateReferenceImages(images, openaiModel)).toEqual({ ok: true });
  });

  it("fails per-image size when image exceeds maxReferenceSizeBytes", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/big.png", filename: "big.png", fileSizeBytes: 60 * 1024 * 1024 },
    ];
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toMatch(/60 MB/);
      expect(result.violations[0].message).toMatch(/50 MB/);
      expect(result.violations[0].message).toMatch(/big\.png/);
    }
  });

  it("passes per-image size when image is exactly at limit", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/ok.png", fileSizeBytes: 50 * 1024 * 1024 },
    ];
    expect(validateReferenceImages(images, openaiModel)).toEqual({ ok: true });
  });

  it("fails aggregate size for Gemini when combined exceeds maxTotalReferenceSizeBytes", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/a.png", fileSizeBytes: 60 * 1024 * 1024 },
      { url: "https://example.com/b.png", fileSizeBytes: 60 * 1024 * 1024 },
    ];
    const result = validateReferenceImages(images, geminiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations[0].message).toMatch(/120 MB/);
      expect(result.violations[0].message).toMatch(/100 MB/);
    }
  });

  it("passes aggregate size for Gemini when combined is under limit", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/a.png", fileSizeBytes: 40 * 1024 * 1024 },
      { url: "https://example.com/b.png", fileSizeBytes: 40 * 1024 * 1024 },
    ];
    expect(validateReferenceImages(images, geminiModel)).toEqual({ ok: true });
  });

  it("fails max edge when width exceeds maxImageEdgePx", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/wide.png", filename: "wide.png", imageWidth: 4000, imageHeight: 800 },
    ];
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations[0].message).toMatch(/4000/);
      expect(result.violations[0].message).toMatch(/3840/);
    }
  });

  it("fails max edge when height exceeds maxImageEdgePx", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/tall.png", imageWidth: 800, imageHeight: 4000 },
    ];
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations[0].message).toMatch(/4000/);
    }
  });

  it("fails aspect ratio when long:short exceeds maxAspectRatio", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/ratio.png", filename: "ratio.png", imageWidth: 3000, imageHeight: 900 },
    ];
    // 3000/900 = 3.33 > 3.0
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations[0].message).toMatch(/3\.33/);
      expect(result.violations[0].message).toMatch(/3:1/);
    }
  });

  it("passes aspect ratio exactly at 3:1", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/ok.png", imageWidth: 3072, imageHeight: 1024 },
    ];
    expect(validateReferenceImages(images, openaiModel)).toEqual({ ok: true });
  });

  it("fails dimension multiple when width is not a multiple of minDimensionMultiple", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/bad.png", filename: "bad.png", imageWidth: 1025, imageHeight: 1024 },
    ];
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations[0].message).toMatch(/1025/);
      expect(result.violations[0].message).toMatch(/16/);
    }
  });

  it("collects multiple violations across images", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/big.png", filename: "big.png", fileSizeBytes: 60 * 1024 * 1024 },
      { url: "https://example.com/wide.png", filename: "wide.png", imageWidth: 4200, imageHeight: 1000 },
    ];
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(2);
    }
  });

  it("skips dimension checks when metadata is absent", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/unknown.png", fileSizeBytes: 10 * 1024 * 1024 },
      // no imageWidth/imageHeight — dimension checks must not run
    ];
    expect(validateReferenceImages(images, openaiModel)).toEqual({ ok: true });
  });
});
```

- [ ] **Run tests to confirm they fail**

```bash
npx vitest run src/lib/image-gen/__tests__/validate.test.ts
```

Expected: all tests fail with "Cannot find module '../validate'".

- [ ] **Implement `validate.ts`**

Create `src/lib/image-gen/validate.ts`:

```ts
import type { MediaGenModelSpec } from "./types";

export type RefImageMeta = {
  url: string;
  filename?: string;
  fileSizeBytes?: number;
  imageWidth?: number;
  imageHeight?: number;
};

export type ValidationViolation = {
  url: string;
  filename?: string;
  message: string;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; violations: ValidationViolation[] };

type ModelLimits = Pick<
  MediaGenModelSpec,
  | "label"
  | "maxReferenceSizeBytes"
  | "maxTotalReferenceSizeBytes"
  | "maxImageEdgePx"
  | "maxAspectRatio"
  | "minDimensionMultiple"
>;

function mb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function label(img: RefImageMeta): string {
  return img.filename ? `"${img.filename}"` : "A reference image";
}

export function validateReferenceImages(
  images: RefImageMeta[],
  model: ModelLimits,
): ValidationResult {
  const violations: ValidationViolation[] = [];

  // Rule 1: per-image size (OpenAI)
  if (model.maxReferenceSizeBytes > 0) {
    for (const img of images) {
      if (img.fileSizeBytes === undefined) continue;
      if (img.fileSizeBytes > model.maxReferenceSizeBytes) {
        violations.push({
          url: img.url,
          filename: img.filename,
          message: `${label(img)} is ${mb(img.fileSizeBytes)} — ${model.label} allows ${mb(model.maxReferenceSizeBytes)} per image.`,
        });
      }
    }
  }

  // Rule 2: aggregate size (Gemini)
  if (model.maxTotalReferenceSizeBytes !== undefined) {
    const known = images.filter((i) => i.fileSizeBytes !== undefined);
    if (known.length > 0) {
      const total = known.reduce((sum, i) => sum + (i.fileSizeBytes ?? 0), 0);
      if (total > model.maxTotalReferenceSizeBytes) {
        violations.push({
          url: images[0].url,
          message: `${images.length} reference image${images.length > 1 ? "s" : ""} total ${mb(total)} — ${model.label} allows ${mb(model.maxTotalReferenceSizeBytes)} combined. Remove one or use smaller images.`,
        });
      }
    }
  }

  // Rule 3: max edge
  if (model.maxImageEdgePx !== undefined) {
    for (const img of images) {
      if (img.imageWidth === undefined || img.imageHeight === undefined) continue;
      const maxEdge = Math.max(img.imageWidth, img.imageHeight);
      if (maxEdge > model.maxImageEdgePx) {
        violations.push({
          url: img.url,
          filename: img.filename,
          message: `${label(img)} is ${img.imageWidth} × ${img.imageHeight} px — max edge is ${model.maxImageEdgePx} px for ${model.label}.`,
        });
      }
    }
  }

  // Rule 4: aspect ratio
  if (model.maxAspectRatio !== undefined) {
    for (const img of images) {
      if (img.imageWidth === undefined || img.imageHeight === undefined) continue;
      const long = Math.max(img.imageWidth, img.imageHeight);
      const short = Math.min(img.imageWidth, img.imageHeight);
      if (short === 0) continue;
      const ratio = long / short;
      if (ratio > model.maxAspectRatio) {
        violations.push({
          url: img.url,
          filename: img.filename,
          message: `${label(img)} is ${ratio.toFixed(2)}:1 — ${model.label} requires a max ${model.maxAspectRatio}:1 ratio between sides.`,
        });
      }
    }
  }

  // Rule 5: dimension multiple
  if (model.minDimensionMultiple !== undefined) {
    for (const img of images) {
      if (img.imageWidth === undefined || img.imageHeight === undefined) continue;
      const m = model.minDimensionMultiple;
      if (img.imageWidth % m !== 0) {
        violations.push({
          url: img.url,
          filename: img.filename,
          message: `${label(img)} width ${img.imageWidth} px is not a multiple of ${m} — resize to ${Math.round(img.imageWidth / m) * m} px.`,
        });
      } else if (img.imageHeight % m !== 0) {
        violations.push({
          url: img.url,
          filename: img.filename,
          message: `${label(img)} height ${img.imageHeight} px is not a multiple of ${m} — resize to ${Math.round(img.imageHeight / m) * m} px.`,
        });
      }
    }
  }

  if (violations.length > 0) return { ok: false, violations };
  return { ok: true };
}
```

- [ ] **Run tests to confirm they pass**

```bash
npx vitest run src/lib/image-gen/__tests__/validate.test.ts
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add src/lib/image-gen/validate.ts src/lib/image-gen/__tests__/validate.test.ts
git commit -m "feat(image-gen): add pure validateReferenceImages with tests"
```

---

## Task 4: Fix the model registry — OpenAI and Gemini limits

**Files:**
- Modify: `src/lib/image-gen/providers/openai.ts`
- Modify: `src/lib/image-gen/providers/gemini.ts`
- Modify: `src/lib/image-gen/client-models.ts`

- [ ] **Update all 3 OpenAI model specs in `providers/openai.ts`**

Add the new limit fields to each model object. All three OpenAI models get identical limits:

```ts
// In openaiModels array, update each model spec:
{
  id: "openai:gpt-image-2",
  provider: "openai", mediaType: "image",
  label: "GPT Image 2", providerLabel: "OpenAI",
  maxReferenceImages: 16,
  maxReferenceSizeBytes: 50 * 1024 * 1024,
  maxImageEdgePx: 3840,
  maxAspectRatio: 3.0,
  minDimensionMultiple: 16,
  supportsMask: true,
  params: gptImage2Params,
  schema: buildZodFromParams(gptImage2Params),
  generate: (input) => generateWithOpenAI("gpt-image-2", input),
},
// Repeat the same maxImageEdgePx/maxAspectRatio/minDimensionMultiple for gpt-image-1 and gpt-image-1-mini
```

- [ ] **Update all 3 Gemini model specs in `providers/gemini.ts`**

Remove `maxReferenceSizeBytes` and add `maxTotalReferenceSizeBytes`. Set `maxReferenceSizeBytes: 0` (required by the type, signals "no per-image limit"):

```ts
{
  id: "gemini:gemini-2.5-flash-image",
  provider: "gemini", mediaType: "image",
  label: "Nano Banana", providerLabel: "Gemini",
  maxReferenceImages: 14,
  maxReferenceSizeBytes: 0,                         // no per-image limit
  maxTotalReferenceSizeBytes: 100 * 1024 * 1024,    // 100 MB aggregate
  params: geminiFlashParams,
  schema: buildZodFromParams(geminiFlashParams),
  generate: (input) => generateWithGemini("gemini-2.5-flash-image", input),
},
// Same for gemini-3.1-flash-image and gemini-3-pro-image
```

- [ ] **Mirror changes in `client-models.ts`**

Apply identical changes to `imageGenClientModels` array in `client-models.ts` — same `maxReferenceSizeBytes`, `maxTotalReferenceSizeBytes`, `maxImageEdgePx`, `maxAspectRatio`, `minDimensionMultiple` values.

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/lib/image-gen/providers/openai.ts src/lib/image-gen/providers/gemini.ts src/lib/image-gen/client-models.ts
git commit -m "fix(image-gen): correct Gemini aggregate limit (100 MB), add OpenAI dimension limits to registry"
```

---

## Task 5: Store metadata at file upload time

**Files:**
- Modify: `src/app/api/nodes/[id]/file/route.ts`

The file upload route already has the buffer in memory via `file.arrayBuffer()`. We add a sharp dimension decode for images and include the three metadata fields in the API response. The client already patches node data from this response (`onPatch(result)` in `file-node.tsx`).

- [ ] **Add sharp import and dimension helper to the route**

At the top of `src/app/api/nodes/[id]/file/route.ts`, add:

```ts
import sharp from "sharp";
```

- [ ] **Add metadata to image upload response**

Replace the image upload block (the `try { const { url } = await uploadNodeFile(...) }` block) with:

```ts
try {
  const buffer = Buffer.from(await file.arrayBuffer());
  const { url } = await uploadNodeFile({
    nodeId,
    filename: file.name,
    body: buffer,
    contentType: file.type,
  });

  let imageWidth: number | undefined;
  let imageHeight: number | undefined;
  if (isImage) {
    try {
      const meta = await sharp(buffer).metadata();
      imageWidth = meta.width;
      imageHeight = meta.height;
    } catch {
      // best-effort — proceed without dimensions
    }
  }

  return apiOk({
    filename: file.name,
    fileExt: ext,
    fileKind: isDocument ? ("document" as const) : ("image" as const),
    fileUrl: url,
    ...(isImage && {
      fileSizeBytes: file.size,
      imageWidth,
      imageHeight,
    }),
  });
} catch (e) {
  return apiError(
    `Upload failed: ${e instanceof Error ? e.message : "unknown"}`,
    500,
  );
}
```

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/app/api/nodes/[id]/file/route.ts
git commit -m "feat(file-upload): return fileSizeBytes, imageWidth, imageHeight for image uploads"
```

---

## Task 6: Store metadata after image generation

**Files:**
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts`

After `uploadImageGen`, the buffer is still in scope. We decode dimensions from it and include them in the version's `paramsUsed` so future queries can read them. We also patch node data with the metadata.

- [ ] **Add sharp import**

At the top of `src/app/api/nodes/[id]/image-generate/route.ts`:

```ts
import sharp from "sharp";
```

- [ ] **Decode and store metadata after upload**

In the `try` block, after `const { url: imageUrl } = await uploadImageGen(...)`, add:

```ts
// Decode dimensions from the generated image buffer for future validation
let genWidth: number | undefined;
let genHeight: number | undefined;
try {
  const meta = await sharp(Buffer.from(result.imageBase64, "base64")).metadata();
  genWidth = meta.width;
  genHeight = meta.height;
} catch {
  // best-effort
}
```

Pass them into the version's `paramsUsed`:

```ts
const version = await insertVersion({
  nodeId,
  inputsUsed,
  paramsUsed: {
    modelId,
    ...validatedParams,
    tokensUsed: result.tokensUsed,
    imageWidth: genWidth,
    imageHeight: genHeight,
    fileSizeBytes: Buffer.from(result.imageBase64, "base64").length,
  },
  modelUsed: modelId,
  output: imageUrl,
});
```

Also include in the API response so the node can be patched client-side:

```ts
return apiOk({
  imageUrl,
  versionId: version.id,
  fileSizeBytes: Buffer.from(result.imageBase64, "base64").length,
  imageWidth: genWidth,
  imageHeight: genHeight,
});
```

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/app/api/nodes/[id]/image-generate/route.ts
git commit -m "feat(image-generate): store fileSizeBytes, imageWidth, imageHeight after generation"
```

---

## Task 7: Server-side validation before generation (with lazy backfill)

**Files:**
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts`

This task adds the actual validation gate. It runs **before** `insertGeneration()`. For images that have no metadata yet (uploaded before this feature shipped), it fetches + decodes lazily.

- [ ] **Add imports**

Add to the top of `image-generate/route.ts`:

```ts
import { validateReferenceImages, type RefImageMeta } from "@/lib/image-gen/validate";
import { createServerSupabase } from "@/lib/supabase/server";
```

- [ ] **Build `RefImageMeta[]` from upstream and validate**

After `referenceUrls` is resolved (at the end of the `if (isEdit)` / `else` block, before `insertGeneration`), add:

```ts
// Build metadata array from upstream node data (file/draw nodes carry fileSizeBytes etc.)
const refMetas: RefImageMeta[] = await Promise.all(
  referenceUrls.map(async (url) => {
    // Find the upstream node that owns this URL
    const ownerNode = upstream.find((u) => {
      if (u.type === "image-gen") return u.activeOutput === url;
      const d = u.data as Record<string, unknown>;
      return d.fileUrl === url;
    });

    const data = ownerNode?.data as Record<string, unknown> | undefined;
    let fileSizeBytes = data?.fileSizeBytes as number | undefined;
    let imageWidth = data?.imageWidth as number | undefined;
    let imageHeight = data?.imageHeight as number | undefined;

    // Lazy backfill: if metadata is absent, fetch the image now and decode
    if (fileSizeBytes === undefined && ownerNode) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          fileSizeBytes = buf.length;
          const meta = await sharp(buf).metadata();
          imageWidth = meta.width;
          imageHeight = meta.height;
          // Backfill onto node data so next generation doesn't need to re-fetch
          const supabase = createServerSupabase();
          await supabase
            .from("nodes")
            .update({
              data: {
                ...(ownerNode.data as Record<string, unknown>),
                fileSizeBytes,
                imageWidth,
                imageHeight,
              },
            })
            .eq("id", ownerNode.nodeId);
        }
      } catch {
        // best-effort — validation will skip this image if no metadata
      }
    }

    const filename = (data?.filename as string | undefined);
    return { url, filename, fileSizeBytes, imageWidth, imageHeight };
  }),
);

// Validate before inserting a generation row
const validationResult = validateReferenceImages(refMetas, config);
if (!validationResult.ok) {
  const message = validationResult.violations.map((v) => v.message).join(" | ");
  return apiError(message, 422);
}
```

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/app/api/nodes/[id]/image-generate/route.ts
git commit -m "feat(image-generate): validate reference image limits before generation, with lazy metadata backfill"
```

---

## Task 8: Return metadata from upstream-images route

**Files:**
- Modify: `src/app/api/nodes/[id]/upstream-images/route.ts`

The focus view fetches upstream images via `GET /api/nodes/:id/upstream-images`. We extend the response to include the three metadata fields so the client can validate without extra fetches.

- [ ] **Extend the image mapping in the route**

In `upstream-images/route.ts`, update the `.map((u) => ({...}))` block:

```ts
.map((u) => {
  const d = u.data as Record<string, unknown>;
  const imageUrl =
    u.type === "image-gen"
      ? (u.activeOutput as string)
      : (d.fileUrl as string);
  return {
    id: u.nodeId,
    type: u.type,
    imageUrl,
    fileSizeBytes: d.fileSizeBytes as number | undefined,
    imageWidth: d.imageWidth as number | undefined,
    imageHeight: d.imageHeight as number | undefined,
  };
});
```

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/app/api/nodes/[id]/upstream-images/route.ts
git commit -m "feat(upstream-images): return fileSizeBytes, imageWidth, imageHeight per image"
```

---

## Task 9: Client-side validation — chip warnings and disabled Generate

**Files:**
- Modify: `src/components/nodes/image-gen-focus-view.tsx`

- [ ] **Extend the `upstream` prop type**

In `ImageGenFocusViewProps`, update the `upstream` array item type:

```ts
upstream: Array<{
  id: string;
  type: string;
  fileUrl?: string;
  fileKind?: string;
  fileSizeBytes?: number;
  imageWidth?: number;
  imageHeight?: number;
}>;
```

- [ ] **Add import for `validateReferenceImages`**

```ts
import { validateReferenceImages, type RefImageMeta } from "@/lib/image-gen/validate";
```

Also import `AlertTriangle` from `lucide-react` (add to existing lucide import line).

- [ ] **Derive validation state**

In the component body, after `model` is resolved, add:

```ts
// Build metadata for all connected image nodes, validate against current model
const refMetas: RefImageMeta[] = upstream
  .filter((u) => (u.type === "file" || u.type === "draw" || u.type === "image-gen") && !!u.fileUrl)
  .map((u) => ({
    url: u.fileUrl!,
    fileSizeBytes: u.fileSizeBytes,
    imageWidth: u.imageWidth,
    imageHeight: u.imageHeight,
  }));

const refValidation = validateReferenceImages(refMetas, model);
const refViolationsByUrl = new Map(
  refValidation.ok
    ? []
    : refValidation.violations.map((v) => [v.url, v.message]),
);
const hasRefViolation = !refValidation.ok;
```

- [ ] **Add warning badge to reference image chips**

Find where `referenceItems` / `EditReferenceItem` chips are rendered (in the Edit tab, reference image tile grid). For each chip, if `refViolationsByUrl.has(item.url)`, render an `AlertTriangle` badge:

```tsx
// Inside each reference chip render:
const violation = refViolationsByUrl.get(item.url);
// Wrap chip content:
<div className="relative">
  {/* existing chip content */}
  {violation && (
    <div
      className="absolute -top-1 -right-1 rounded-full bg-amber-50 p-0.5"
      title={violation}
    >
      <AlertTriangle className="size-3 text-amber-500" strokeWidth={1.5} />
    </div>
  )}
</div>
```

- [ ] **Disable Generate button on violations**

Find the Generate button (`onClick={handleGenerate}`) and update its `disabled` prop:

```tsx
<Button
  size="lg"
  onClick={handleGenerate}
  disabled={generating || editing || !promptUpstream || !editable || hasRefViolation}
>
```

Add an inline note beneath the button when there's a violation:

```tsx
{hasRefViolation && !refValidation.ok && (
  <p className="mt-1.5 text-center text-xs text-amber-600">
    {refValidation.violations.length === 1
      ? refValidation.violations[0].message
      : `Fix ${refValidation.violations.length} oversized images to generate.`}
  </p>
)}
```

Note: the Gemini aggregate case produces one violation with a combined message — it already reads naturally as a single message.

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/components/nodes/image-gen-focus-view.tsx
git commit -m "feat(image-gen-focus-view): warn on oversized reference chips, disable Generate on limit violations"
```

---

## Task 10: Final verification

- [ ] **Run all tests**

```bash
npx vitest run
```

Expected: all existing tests pass, new validate tests pass.

- [ ] **Full type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Update bug-fixes spec doc**

Append a new section to `docs/superpowers/specs/2026-07-10-bug-fixes.md`:

```markdown
---

## YUV-175 — Validate reference image size before generation

**Fixed:** 2026-07-11
**Area:** Canvas → Image Gen node → focus view + API route

### Problem

Reference images exceeding provider limits produced a raw `413` or cryptic provider error with no
actionable message. The Gemini registry also had the wrong inline limit (20 MB, now 100 MB) and
wrong semantics (per-image vs aggregate).

### Fix

- Added `fileSizeBytes`, `imageWidth`, `imageHeight` to `FileNodeData`/`DrawNodeData`, populated
  at upload time via `sharp`.
- Added `maxTotalReferenceSizeBytes`, `maxImageEdgePx`, `maxAspectRatio`, `minDimensionMultiple`
  to `MediaGenModelSpec`.
- New pure `validateReferenceImages` function in `src/lib/image-gen/validate.ts` (shared
  client/server).
- Server validates before `insertGeneration()`, returns `422` with all violation messages joined.
- Focus view shows `AlertTriangle` on offending chips; Generate button disabled with inline note.
- Gemini registry corrected: `maxReferenceSizeBytes: 0`, `maxTotalReferenceSizeBytes: 100 MB`.

| File | Change |
|---|---|
| `src/lib/canvas-nodes.ts` | +3 metadata fields on `FileNodeData`, `DrawNodeData` |
| `src/lib/image-gen/types.ts` | +4 new limit fields on `MediaGenModelSpec` |
| `src/lib/image-gen/validate.ts` | New pure validation function |
| `src/lib/image-gen/providers/openai.ts` | Added dimension limits |
| `src/lib/image-gen/providers/gemini.ts` | Fixed aggregate limit to 100 MB |
| `src/lib/image-gen/client-models.ts` | Mirrored registry fixes |
| `src/app/api/nodes/[id]/file/route.ts` | Metadata in upload response |
| `src/app/api/nodes/[id]/image-generate/route.ts` | Validation gate + lazy backfill |
| `src/app/api/nodes/[id]/upstream-images/route.ts` | Metadata in image list response |
| `src/components/nodes/image-gen-focus-view.tsx` | Chip warnings + disabled Generate |
```

- [ ] **Commit**

```bash
git add docs/superpowers/specs/2026-07-10-bug-fixes.md
git commit -m "docs: add YUV-175 fix entry to bug-fixes spec"
```
