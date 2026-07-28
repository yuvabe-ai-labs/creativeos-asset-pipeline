# OpenAI Image-Gen Error Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the dominant class of OpenAI image-gen failures (27/35 observed in staging+prod) by normalizing reference images server-side instead of leakily blocking on them, auto-correct the transparent-background/JPEG combo bug, and replace the layout-breaking error display with a reusable, copyable error badge across all generate-capable node types.

**Architecture:** Three independent fix areas sharing one root file (`src/lib/image-gen/providers/openai.ts`) for the backend pieces, plus one new shared UI component wired into four existing focus-view components. No new dependencies — `sharp` and all UI primitives used are already in the project.

**Tech Stack:** Next.js API routes, `sharp` (image processing), Vitest (unit tests), React/shadcn (Base UI registry) for the UI component.

## Global Constraints

- Every interactive control must be a shadcn primitive from `src/components/ui/*` — never a raw `<button>`. Base UI composes via the `render` prop, not `asChild`.
- No comments explaining *what* code does — only *why*, and only when non-obvious.
- Follow this repo's existing test convention: pure-function Vitest coverage only. There is no component-test harness (`@testing-library/*` is not installed) — do not add one; verify UI tasks via `npx tsc --noEmit` and manual check instead.
- Reference design spec: `docs/superpowers/specs/2026-07-28-openai-image-gen-error-remediation-design.md`. ADR: D91 in `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`.

---

### Task 1: Server-side reference-image normalization for OpenAI

**Files:**
- Modify: `src/lib/image-gen/providers/openai.ts`
- Test: `src/lib/image-gen/__tests__/openai-normalize.test.ts` (new)

**Interfaces:**
- Produces: `export async function normalizeReferenceImageForOpenAI(buffer: Buffer): Promise<Buffer>` — used internally by `urlToFile` in this same task, and available for import by any later task/file.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/image-gen/__tests__/openai-normalize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { normalizeReferenceImageForOpenAI } from "../providers/openai";

async function makeImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .png()
    .toBuffer();
}

describe("normalizeReferenceImageForOpenAI", () => {
  it("leaves an already-compliant image's dimensions unchanged", async () => {
    const input = await makeImage(1024, 1024);
    const output = await normalizeReferenceImageForOpenAI(input);
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
  });

  it("center-crops an image wider than 3:1 down to exactly 3:1", async () => {
    const input = await makeImage(4800, 800); // 6:1
    const output = await normalizeReferenceImageForOpenAI(input);
    const meta = await sharp(output).metadata();
    expect(meta.width! / meta.height!).toBeCloseTo(3.0, 1);
  });

  it("downscales an image whose longest edge exceeds 3840px", async () => {
    const input = await makeImage(4000, 4000);
    const output = await normalizeReferenceImageForOpenAI(input);
    const meta = await sharp(output).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(3840);
  });

  it("rounds both dimensions down to the nearest multiple of 16", async () => {
    const input = await makeImage(1025, 1030);
    const output = await normalizeReferenceImageForOpenAI(input);
    const meta = await sharp(output).metadata();
    expect(meta.width! % 16).toBe(0);
    expect(meta.height! % 16).toBe(0);
  });

  it("applies crop, downscale, and multiple-of-16 rounding together in the right order", async () => {
    const input = await makeImage(12000, 2000); // 6:1 AND over max edge
    const output = await normalizeReferenceImageForOpenAI(input);
    const meta = await sharp(output).metadata();
    expect(meta.width! / meta.height!).toBeLessThanOrEqual(3.0);
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(3840);
    expect(meta.width! % 16).toBe(0);
    expect(meta.height! % 16).toBe(0);
  });

  it("floors tiny dimensions at 16px instead of rounding to 0", async () => {
    const input = await makeImage(10, 10);
    const output = await normalizeReferenceImageForOpenAI(input);
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(16);
    expect(meta.height).toBe(16);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/image-gen/__tests__/openai-normalize.test.ts`
Expected: FAIL — `normalizeReferenceImageForOpenAI is not a function` (not exported yet).

- [ ] **Step 3: Add the `sharp` import and the normalization function**

In `src/lib/image-gen/providers/openai.ts`, add the import at the top (after the existing `import "server-only";` line):

```ts
import sharp from "sharp";
```

Then add this block directly below the existing `async function urlToFile(...)` function (after its closing `}`, before the `// ── Aspect ratio → pixel size mapping ──` section):

```ts
// Mirrors the maxAspectRatio/maxImageEdgePx/minDimensionMultiple values declared on all three
// OpenAI model configs below — kept as separate constants because this runs before a specific
// model is known to urlToFile's caller chain, not because the values are expected to diverge.
const MAX_ASPECT_RATIO = 3.0;
const MAX_EDGE_PX = 3840;
const DIMENSION_MULTIPLE = 16;

function floorToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.floor(value / multiple) * multiple);
}

// Guarantees every reference image sent to OpenAI satisfies its aspect-ratio, max-edge, and
// multiple-of-16 dimension requirements — unconditionally, so it can't be bypassed the way
// pre-flight validation can be when dimension metadata isn't known (see ADR D91).
export async function normalizeReferenceImageForOpenAI(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  let width = meta.width ?? 0;
  let height = meta.height ?? 0;
  if (width === 0 || height === 0) return buffer;

  let pipeline = sharp(buffer);

  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long / short > MAX_ASPECT_RATIO) {
    const newLong = Math.round(short * MAX_ASPECT_RATIO);
    if (width >= height) {
      pipeline = pipeline.extract({ left: Math.floor((width - newLong) / 2), top: 0, width: newLong, height });
      width = newLong;
    } else {
      pipeline = pipeline.extract({ left: 0, top: Math.floor((height - newLong) / 2), width, height: newLong });
      height = newLong;
    }
  }

  const maxEdge = Math.max(width, height);
  const scale = maxEdge > MAX_EDGE_PX ? MAX_EDGE_PX / maxEdge : 1;
  const scaledWidth = Math.round(width * scale);
  const scaledHeight = Math.round(height * scale);

  const finalWidth = floorToMultiple(scaledWidth, DIMENSION_MULTIPLE);
  const finalHeight = floorToMultiple(scaledHeight, DIMENSION_MULTIPLE);

  if (finalWidth !== width || finalHeight !== height) {
    pipeline = pipeline.resize({ width: finalWidth, height: finalHeight, fit: "fill" });
  }

  pipeline =
    meta.hasAlpha ? pipeline.png()
    : meta.format === "webp" ? pipeline.webp()
    : meta.format === "jpeg" ? pipeline.jpeg()
    : pipeline.png();

  return pipeline.toBuffer();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/image-gen/__tests__/openai-normalize.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire the normalizer into `urlToFile`**

Replace the existing `urlToFile` function body:

```ts
async function urlToFile(url: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch reference image (${res.status}): ${url}`);
  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "image/png";
  const ext = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  return new File([buffer], `reference.${ext}`, { type: contentType });
}
```

with:

```ts
async function urlToFile(url: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch reference image (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const normalized = await normalizeReferenceImageForOpenAI(buffer);
  // Detect format from the re-encoded bytes, not the (sometimes wrong/generic) response
  // content-type header — normalizeReferenceImageForOpenAI always re-encodes to png/jpeg/webp.
  const meta = await sharp(normalized).metadata();
  const ext = meta.format === "jpeg" ? "jpg" : meta.format === "webp" ? "webp" : "png";
  const contentType = ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  return new File([normalized], `reference.${ext}`, { type: contentType });
}
```

Note: `urlToFile` is declared above `normalizeReferenceImageForOpenAI` in the file — this is fine, `function` declarations are hoisted and `urlToFile` isn't invoked until a real request comes in, long after the module has finished loading.

- [ ] **Step 6: Run the full test suite to check nothing else broke**

Run: `npx vitest run src/lib/image-gen`
Expected: PASS — all existing tests in this directory (`mask-file.test.ts`, `registry.test.ts`, `cost.test.ts`, `validate.test.ts`) plus the new `openai-normalize.test.ts` pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/image-gen/providers/openai.ts src/lib/image-gen/__tests__/openai-normalize.test.ts
git commit -m "$(cat <<'EOF'
feat(image-gen): normalize OpenAI reference images server-side (D91)

Center-crop/downscale/round-to-16 every reference image before it
reaches OpenAI's images.edit/generate, instead of relying on a
pre-flight validation gate that silently skips when image dimensions
weren't backfilled (the actual cause of 27/35 observed prod+staging
OpenAI image-gen failures).
EOF
)"
```

---

### Task 2: Auto-correct transparent background + JPEG output

**Files:**
- Modify: `src/lib/image-gen/providers/openai.ts`
- Test: `src/lib/image-gen/__tests__/openai-generate.test.ts` (new)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `generateWithOpenAI` becomes exported (`export async function generateWithOpenAI(apiModelId: string, input: ImageGenInput): Promise<ImageGenResult>`) — was previously unexported, only used internally by the `openaiModels` array's `generate` closures. No signature change, just the `export` keyword.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/image-gen/__tests__/openai-generate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const imagesGenerate = vi.fn();

vi.mock("@/lib/openai/server", () => ({
  createOpenAI: () => ({
    images: { generate: imagesGenerate },
  }),
}));

import { generateWithOpenAI } from "../providers/openai";
import type { ImageGenInput } from "../types";

beforeEach(() => {
  imagesGenerate.mockReset();
  imagesGenerate.mockResolvedValue({
    data: [{ b64_json: "abc123" }],
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
  });
});

function baseInput(params: Record<string, unknown>): ImageGenInput {
  return {
    prompt: "a red ball on a white background",
    referenceUrls: [],
    params,
  };
}

describe("generateWithOpenAI — transparent background + jpeg output", () => {
  it("overrides output_format to png when background is transparent and output_format is jpeg", async () => {
    await generateWithOpenAI(
      "gpt-image-2",
      baseInput({ background: "transparent", output_format: "jpeg", aspect_ratio: "1:1", quality: "medium" }),
    );
    expect(imagesGenerate).toHaveBeenCalledTimes(1);
    expect(imagesGenerate.mock.calls[0][0].output_format).toBe("png");
  });

  it("leaves output_format untouched when background is opaque", async () => {
    await generateWithOpenAI(
      "gpt-image-2",
      baseInput({ background: "opaque", output_format: "jpeg", aspect_ratio: "1:1", quality: "medium" }),
    );
    expect(imagesGenerate.mock.calls[0][0].output_format).toBe("jpeg");
  });

  it("leaves output_format untouched when transparent is paired with png", async () => {
    await generateWithOpenAI(
      "gpt-image-2",
      baseInput({ background: "transparent", output_format: "png", aspect_ratio: "1:1", quality: "medium" }),
    );
    expect(imagesGenerate.mock.calls[0][0].output_format).toBe("png");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/image-gen/__tests__/openai-generate.test.ts`
Expected: FAIL — `generateWithOpenAI` is not exported from `../providers/openai`.

- [ ] **Step 3: Export `generateWithOpenAI` and add the override**

In `src/lib/image-gen/providers/openai.ts`, change the function declaration:

```ts
async function generateWithOpenAI(
  apiModelId: string,
  input: ImageGenInput,
): Promise<ImageGenResult> {
```

to:

```ts
export async function generateWithOpenAI(
  apiModelId: string,
  input: ImageGenInput,
): Promise<ImageGenResult> {
```

Then, immediately after these two existing lines:

```ts
  if (p.background)    sharedParams.background    = p.background;
  if (p.output_format) sharedParams.output_format = p.output_format;
```

add:

```ts

  // Transparent backgrounds require an alpha-capable output format — JPEG has none. OpenAI
  // rejects this combination outright (observed in prod, see ADR D91); auto-correct rather
  // than block the user.
  if (sharedParams.background === "transparent" && sharedParams.output_format === "jpeg") {
    sharedParams.output_format = "png";
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/image-gen/__tests__/openai-generate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run src/lib/image-gen`
Expected: PASS — all tests including Task 1's.

- [ ] **Step 6: Commit**

```bash
git add src/lib/image-gen/providers/openai.ts src/lib/image-gen/__tests__/openai-generate.test.ts
git commit -m "$(cat <<'EOF'
fix(image-gen): auto-correct transparent background + jpeg output (D91)

JPEG has no alpha channel, so OpenAI rejects background=transparent
paired with output_format=jpeg outright (confirmed from a real
production failure's params_snapshot). Silently override to png
instead of surfacing the rejection to the user.
EOF
)"
```

---

### Task 3: Remove the leaky dimension-blocking rules from `validateReferenceImages`

**Files:**
- Modify: `src/lib/image-gen/validate.ts`
- Modify: `src/lib/image-gen/__tests__/validate.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–2 (independent file).
- Produces: `validateReferenceImages` keeps its existing signature and export; only its internal rule set shrinks from 5 to 2. No caller (`src/app/api/nodes/[id]/image-generate/route.ts`, `src/components/nodes/image-gen-focus-view.tsx`) needs any change — they already just check `result.ok`/`result.violations`.

- [ ] **Step 1: Update the test file first (documents the new contract)**

Replace the full contents of `src/lib/image-gen/__tests__/validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateReferenceImages } from "../validate";
import type { RefImageMeta } from "../validate";

const openaiModel = {
  label: "GPT Image 2",
  maxReferenceSizeBytes: 50 * 1024 * 1024,      // 50 MB
  maxTotalReferenceSizeBytes: undefined,
};

const geminiModel = {
  label: "Nano Banana",
  maxReferenceSizeBytes: 0,
  maxTotalReferenceSizeBytes: 100 * 1024 * 1024, // 100 MB
};

describe("validateReferenceImages", () => {
  it("returns ok for empty image list", () => {
    expect(validateReferenceImages([], openaiModel)).toEqual({ ok: true });
  });

  it("returns ok when all metadata is absent", () => {
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

  it("collects multiple violations across images", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/big1.png", filename: "big1.png", fileSizeBytes: 60 * 1024 * 1024 },
      { url: "https://example.com/big2.png", filename: "big2.png", fileSizeBytes: 70 * 1024 * 1024 },
    ];
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(2);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify the removed-rule tests are gone and remaining ones fail-or-pass as expected**

Run: `npx vitest run src/lib/image-gen/__tests__/validate.test.ts`
Expected: FAIL — `"passes per-image size when image is exactly at limit"` and others may still pass, but this step is really a checkpoint; the important thing is the file now has no references to `maxImageEdgePx`/`maxAspectRatio`/`minDimensionMultiple`. Since `validate.ts` hasn't changed yet, the size/aggregate tests (Rules 1–2) already pass — that's expected and fine, they weren't being changed.

- [ ] **Step 3: Remove Rules 3–5 from `validate.ts`**

In `src/lib/image-gen/validate.ts`, change the `ModelLimits` type from:

```ts
type ModelLimits = Pick<
  MediaGenModelSpec,
  | "label"
  | "maxReferenceSizeBytes"
  | "maxTotalReferenceSizeBytes"
  | "maxImageEdgePx"
  | "maxAspectRatio"
  | "minDimensionMultiple"
>;
```

to:

```ts
type ModelLimits = Pick<
  MediaGenModelSpec,
  | "label"
  | "maxReferenceSizeBytes"
  | "maxTotalReferenceSizeBytes"
>;
```

Then delete the entire "Rules 3–5" block — everything from the `// Rules 3–5: per-image dimension checks` comment through its closing `}` (the `for (const img of images) { ... }` loop that follows Rule 2 and precedes the final `if (violations.length > 0)`). The function body should end with:

```ts
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

  if (violations.length > 0) return { ok: false, violations };
  return { ok: true };
}
```

(The `RefImageMeta` type keeps its `imageWidth`/`imageHeight` fields — they're used elsewhere for node metadata/display, not exclusively by the rules just removed.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/image-gen/__tests__/validate.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run src/lib/image-gen`
Expected: PASS — all tests across the directory.

- [ ] **Step 6: Commit**

```bash
git add src/lib/image-gen/validate.ts src/lib/image-gen/__tests__/validate.test.ts
git commit -m "$(cat <<'EOF'
refactor(image-gen): remove leaky dimension-blocking rules (D91)

Aspect-ratio/max-edge/multiple-of-16 validation is dropped from
validateReferenceImages now that Task 1's server-side normalization
guarantees these constraints unconditionally. The old rules only
fired when image dimensions happened to be backfilled — inconsistent
and no longer needed.
EOF
)"
```

---

### Task 4: `GenerationErrorBadge` shared component

**Files:**
- Create: `src/components/nodes/generation-error-badge.tsx`

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces: `export function GenerationErrorBadge({ error }: { error: string | null | undefined }): JSX.Element | null` — imported by Tasks 5–8.

- [ ] **Step 1: Create the component**

Create `src/components/nodes/generation-error-badge.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AlertCircle, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type GenerationErrorBadgeProps = {
  error: string | null | undefined;
};

export function GenerationErrorBadge({ error }: GenerationErrorBadgeProps) {
  const [copied, setCopied] = useState(false);

  if (!error) return null;

  function handleCopy() {
    navigator.clipboard.writeText(error as string);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="destructive" size="sm" className="rounded-full">
            <AlertCircle className="size-3.5" strokeWidth={1.5} />
            Last generation failed
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80">
        <div className="flex items-start justify-between gap-2">
          <p className="whitespace-pre-wrap break-words text-xs text-foreground">
            {error}
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            aria-label="Copy error"
            className="shrink-0"
          >
            {copied ? (
              <Check className="size-3.5 text-primary" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file (pre-existing unrelated errors, if any, are out of scope).

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/generation-error-badge.tsx
git commit -m "$(cat <<'EOF'
feat(nodes): add GenerationErrorBadge component (D91)

Fixed-width pill + click-to-open Popover with a copy button, so a
long provider error message can never break a focus-view header's
layout the way the old inline <p> did. Not wired into any view yet.
EOF
)"
```

---

### Task 5: Wire `GenerationErrorBadge` into `video-gen-focus-view.tsx` (fixes the reported layout bug)

**Files:**
- Modify: `src/components/nodes/video-gen-focus-view.tsx`

**Interfaces:**
- Consumes: `GenerationErrorBadge` from Task 4 (`src/components/nodes/generation-error-badge.tsx`).

- [ ] **Step 1: Add the import**

In `src/components/nodes/video-gen-focus-view.tsx`, add this import alongside the other local (`./`) imports (near the existing `import { EditableField } from "./editable-field";` line):

```ts
import { GenerationErrorBadge } from "./generation-error-badge";
```

- [ ] **Step 2: Replace the broken error banner**

Find this block (around line 824):

```tsx
                {lastError && !isGenerating && (
                  <p className="text-xs text-destructive">
                    Last attempt failed: {lastError}
                  </p>
                )}
```

Replace it with:

```tsx
                {!isGenerating && (
                  <div className="mt-1">
                    <GenerationErrorBadge error={lastError} />
                  </div>
                )}
```

(`GenerationErrorBadge` already renders `null` for a falsy `error`, so the `lastError &&` guard from the old code is redundant and dropped — the wrapping `<div>` only needs to exist when not generating.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manually verify**

Start the dev server (`npm run dev`), open a Video Gen node's focus view, trigger a generation that fails (e.g. against a model with an invalid param, or observe with a real failure), and confirm: the pill stays fixed-width regardless of message length, and clicking it opens a popover with the full message and a working copy button (icon flips to a checkmark for 2 seconds after clicking).

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/video-gen-focus-view.tsx
git commit -m "$(cat <<'EOF'
fix(video-gen): replace layout-breaking error banner with GenerationErrorBadge (D91)

The old inline <p> had no width constraint, so a long provider error
message (observed: a Gemini/Veo 429 message) stretched the header
layout instead of wrapping or truncating.
EOF
)"
```

---

### Task 6: Wire `GenerationErrorBadge` into `image-gen-focus-view.tsx`

**Files:**
- Modify: `src/components/nodes/image-gen-focus-view.tsx`

**Interfaces:**
- Consumes: `GenerationErrorBadge` from Task 4.
- Produces: new local `lastError` state, set on the same two failure paths (`handleGenerate`, `handleEdit`) that already call `toast.error`.

- [ ] **Step 1: Add the import**

Add alongside the other local imports (near `import { EditableField } from "./editable-field";`):

```ts
import { GenerationErrorBadge } from "./generation-error-badge";
```

- [ ] **Step 2: Add `lastError` state**

Find (around line 156):

```ts
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
```

Replace with:

```ts
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
```

- [ ] **Step 3: Set/clear `lastError` in `handleGenerate`**

Find (around line 566):

```ts
  async function handleGenerate() {
    if (!promptUpstream) {
      toast.error("Connect a Prompt node first.");
      return;
    }
    setGenerating(true);
    setEvalDecision(null);
    setEvalNote("");
    try {
      const values = paramValues;
      const res = await fetch(`/api/nodes/${nodeId}/image-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id, params: values }),
      });
      const json = (await res.json()) as {
        imageUrl?: string;
        versionId?: string;
        error?: string;
      };
      if (!res.ok || !json.imageUrl)
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
      onPatch({ parsed: json.imageUrl });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success("Image generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed", { duration: 6000 });
      await fetchVersions();
    } finally {
      setGenerating(false);
    }
  }
```

Replace with:

```ts
  async function handleGenerate() {
    if (!promptUpstream) {
      toast.error("Connect a Prompt node first.");
      return;
    }
    setGenerating(true);
    setLastError(null);
    setEvalDecision(null);
    setEvalNote("");
    try {
      const values = paramValues;
      const res = await fetch(`/api/nodes/${nodeId}/image-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id, params: values }),
      });
      const json = (await res.json()) as {
        imageUrl?: string;
        versionId?: string;
        error?: string;
      };
      if (!res.ok || !json.imageUrl)
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
      onPatch({ parsed: json.imageUrl });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success("Image generated");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      setLastError(message);
      toast.error(message, { duration: 6000 });
      await fetchVersions();
    } finally {
      setGenerating(false);
    }
  }
```

- [ ] **Step 4: Set/clear `lastError` in `handleEdit`**

Find (around line 637):

```ts
  async function handleEdit() {
    const baseVersionId = activeVersionId ?? undefined;
    const baseImageUrl = baseVersionId ? undefined : baseNodeUrl ?? undefined;
    if (!baseVersionId && !baseImageUrl) {
      toast.error(
        "Generate an image, or connect an image reference, to edit it."
      );
      return;
    }
    setEditing(true);
    try {
```

Replace with:

```ts
  async function handleEdit() {
    const baseVersionId = activeVersionId ?? undefined;
    const baseImageUrl = baseVersionId ? undefined : baseNodeUrl ?? undefined;
    if (!baseVersionId && !baseImageUrl) {
      toast.error(
        "Generate an image, or connect an image reference, to edit it."
      );
      return;
    }
    setEditing(true);
    setLastError(null);
    try {
```

Then find, later in the same function:

```ts
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Edit failed", { duration: 6000 });
      await fetchVersions();
    } finally {
      setEditing(false);
    }
  }
```

Replace with:

```ts
    } catch (e) {
      const message = e instanceof Error ? e.message : "Edit failed";
      setLastError(message);
      toast.error(message, { duration: 6000 });
      await fetchVersions();
    } finally {
      setEditing(false);
    }
  }
```

- [ ] **Step 5: Render the badge in the header**

Find (around line 908):

```tsx
                <GuidedNextButton
                  sourceId={nodeId}
                  variant="button"
                  onNavigate={() => onOpenChange(false)}
                />
              </div>
            </header>
          </div>
        </div>

        {/* Body: left rail + detail pane */}
```

Replace with:

```tsx
                <GuidedNextButton
                  sourceId={nodeId}
                  variant="button"
                  onNavigate={() => onOpenChange(false)}
                />
              </div>
            </header>
            {!generating && !editing && (
              <div className="mt-2">
                <GenerationErrorBadge error={lastError} />
              </div>
            )}
          </div>
        </div>

        {/* Body: left rail + detail pane */}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — this task touches no logic covered by existing tests, so nothing should regress.

- [ ] **Step 8: Manually verify**

Start the dev server, open an Image Gen node's focus view, trigger a failing generation (e.g. connect a Prompt node with content likely to trip OpenAI's safety system, or temporarily break `OPENAI_API_KEY` locally), and confirm the badge appears, persists after the toast disappears, and its popover shows the full message with a working copy button.

- [ ] **Step 9: Commit**

```bash
git add src/components/nodes/image-gen-focus-view.tsx
git commit -m "$(cat <<'EOF'
feat(image-gen): persist last generation error via GenerationErrorBadge (D91)

Previously only a transient toast.error surfaced generate/edit
failures. Adds local lastError state set alongside the existing
toasts, rendered as the same persistent badge video-gen now uses.
EOF
)"
```

---

### Task 7: Wire `GenerationErrorBadge` into `prompt-focus-view.tsx`

**Files:**
- Modify: `src/components/nodes/prompt-focus-view.tsx`

**Interfaces:**
- Consumes: `GenerationErrorBadge` from Task 4.
- Produces: new local `lastError` state, set in `runGenerate`'s catch block.

- [ ] **Step 1: Add the import**

Add alongside the other local imports (near `import { EditableField } from "./editable-field";`):

```ts
import { GenerationErrorBadge } from "./generation-error-badge";
```

- [ ] **Step 2: Add `lastError` state**

Find (around line 95):

```ts
  const [generating, setGenerating] = useState(false);
```

Replace with:

```ts
  const [generating, setGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
```

- [ ] **Step 3: Set/clear `lastError` in `runGenerate`**

Find (around line 307):

```ts
  async function runGenerate() {
    setGenerating(true);
    setEvalDecision(null);
    setEvalNote("");
    try {
      const res = await fetch(`/api/nodes/${nodeId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instructionDraft, slices, controls: controls ?? DEFAULT_SHOT_CONTROLS }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
      }
      onPatch({ parsed: json.output });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success("Prompt generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed", { duration: 6000 });
      await fetchVersions();
    } finally {
      setGenerating(false);
    }
  }
```

Replace with:

```ts
  async function runGenerate() {
    setGenerating(true);
    setLastError(null);
    setEvalDecision(null);
    setEvalNote("");
    try {
      const res = await fetch(`/api/nodes/${nodeId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instructionDraft, slices, controls: controls ?? DEFAULT_SHOT_CONTROLS }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
      }
      onPatch({ parsed: json.output });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success("Prompt generated");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      setLastError(message);
      toast.error(message, { duration: 6000 });
      await fetchVersions();
    } finally {
      setGenerating(false);
    }
  }
```

- [ ] **Step 4: Render the badge in the header**

Find (around line 425):

```tsx
              <div className="flex shrink-0 items-center gap-2">
                {versions.length > 0 && <UsagePopover versions={versions} />}
                <GuidedNextButton
                  sourceId={nodeId}
                  variant="button"
                  onNavigate={() => onOpenChange(false)}
                />
              </div>
            </header>
          </div>
        </div>

        {/* Body: left rail + detail pane */}
```

Replace with:

```tsx
              <div className="flex shrink-0 items-center gap-2">
                {versions.length > 0 && <UsagePopover versions={versions} />}
                <GuidedNextButton
                  sourceId={nodeId}
                  variant="button"
                  onNavigate={() => onOpenChange(false)}
                />
              </div>
            </header>
            {!generating && (
              <div className="mt-2">
                <GenerationErrorBadge error={lastError} />
              </div>
            )}
          </div>
        </div>

        {/* Body: left rail + detail pane */}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Manually verify**

Start the dev server, open a Prompt node's focus view, trigger a failing generation, confirm the badge behaves the same as in Task 6.

- [ ] **Step 8: Commit**

```bash
git add src/components/nodes/prompt-focus-view.tsx
git commit -m "$(cat <<'EOF'
feat(prompt): persist last generation error via GenerationErrorBadge (D91)
EOF
)"
```

---

### Task 8: Wire `GenerationErrorBadge` into `video-prompt-focus-view.tsx`

**Files:**
- Modify: `src/components/nodes/video-prompt-focus-view.tsx`

**Interfaces:**
- Consumes: `GenerationErrorBadge` from Task 4.
- Produces: new local `lastError` state, set in `runGenerate`'s catch block.

- [ ] **Step 1: Add the import**

Add alongside the other local imports (near `import { EditableField } from "./editable-field";`):

```ts
import { GenerationErrorBadge } from "./generation-error-badge";
```

- [ ] **Step 2: Add `lastError` state**

Find (around line 98):

```ts
  const [generating, setGenerating] = useState(false);
```

Replace with:

```ts
  const [generating, setGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
```

- [ ] **Step 3: Set/clear `lastError` in `runGenerate`**

Find (around line 307):

```ts
  async function runGenerate() {
    setGenerating(true);
    setEvalDecision(null);
    setEvalNote("");
    try {
      const res = await fetch(`/api/nodes/${nodeId}/video-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instructionDraft,
          slices,
          controls: controls ?? DEFAULT_VIDEO_CONTROLS,
          targetProvider: effectiveProvider,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
      }
      onPatch({ parsed: json.output });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success("Motion prompt generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
      await fetchVersions();
    } finally {
      setGenerating(false);
    }
  }
```

Replace with:

```ts
  async function runGenerate() {
    setGenerating(true);
    setLastError(null);
    setEvalDecision(null);
    setEvalNote("");
    try {
      const res = await fetch(`/api/nodes/${nodeId}/video-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instructionDraft,
          slices,
          controls: controls ?? DEFAULT_VIDEO_CONTROLS,
          targetProvider: effectiveProvider,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
      }
      onPatch({ parsed: json.output });
      setActiveVersionId(json.versionId ?? null);
      await fetchVersions();
      toast.success("Motion prompt generated");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      setLastError(message);
      toast.error(message);
      await fetchVersions();
    } finally {
      setGenerating(false);
    }
  }
```

- [ ] **Step 4: Render the badge in the header**

Find (around line 428):

```tsx
              <div className="flex shrink-0 items-center gap-2">
                {versions.length > 0 && <UsagePopover versions={versions} />}
                <GuidedNextButton
                  sourceId={nodeId}
                  variant="button"
                  onNavigate={() => onOpenChange(false)}
                />
              </div>
            </header>
```

Find the closing of that header's wrapping `<div>` a couple of lines below it (mirroring Task 7's Step 4 pattern — the `</header>` is immediately followed by the closing `</div></div>` pair and then the `{/* Body */}` comment) and replace the sequence from `</header>` through the start of the body comment:

```tsx
            </header>
          </div>
        </div>

        {/* Body: left rail + detail pane */}
```

with:

```tsx
            </header>
            {!generating && (
              <div className="mt-2">
                <GenerationErrorBadge error={lastError} />
              </div>
            )}
          </div>
        </div>

        {/* Body: left rail + detail pane */}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Manually verify**

Start the dev server, open a Video Prompt node's focus view, trigger a failing generation, confirm the badge behaves the same as in Tasks 6–7.

- [ ] **Step 8: Commit**

```bash
git add src/components/nodes/video-prompt-focus-view.tsx
git commit -m "$(cat <<'EOF'
feat(video-prompt): persist last generation error via GenerationErrorBadge (D91)
EOF
)"
```
