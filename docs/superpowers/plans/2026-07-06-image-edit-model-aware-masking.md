# Model-Aware Image-Edit Region Control (Mask vs Text) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry the drawn edit-region in each model's native control channel — OpenAI via a real alpha mask (paint the region, clean base), Gemini via text only — and retire the burned-in annotation composite that reproduces marks into output.

**Architecture:** A `supportsMask` capability flag on the selected model drives a UI branch (paint-a-region vs type-only) and a payload branch (send `{ maskBase64 }` + clean base vs plain text). The OpenAI provider forwards the mask to the `images.edit` call it already makes; Gemini ignores it. All region/mask logic lives in small pure modules; the route/component/provider changes are thin wiring.

**Tech Stack:** Next.js (App Router, route handlers), React, TypeScript, Zod, Vitest (node env), OpenAI SDK (`images.edit`), GCS/Supabase storage helpers.

## Global Constraints

- Gate on the **selected model's `supportsMask` flag** — never hard-code `provider === "openai"`.
- Tests are **pure-logic, node-env Vitest** (`vitest run`). Route/component/provider wiring is verified manually — do NOT add jsdom or route-handler test harnesses.
- **Retire the composite entirely**: no `toCompositeBase64`, no `annotated*` payload fields, no `ANNOTATION_CLAUSE`, no "composite becomes base" route block.
- Mask polarity is **centralized in one module** (`EDIT_ALPHA` / `KEEP_ALPHA` in `mask.ts`) and **empirically verified** (Task 9) — assume painted → transparent → editable until proven otherwise.
- Base image sent to the model stays the **clean** `resolvedBaseUrl` — the mask never touches base pixels.
- Follow existing import/reuse rules (import shared helpers from `src/lib/image-gen/*`, never redefine).

---

### Task 1: `supportsMask` capability flag on model specs

**Files:**
- Modify: `src/lib/image-gen/types.ts` (`MediaGenModelSpec`)
- Modify: `src/lib/image-gen/providers/openai.ts` (3 specs)
- Modify: `src/lib/image-gen/client-models.ts` (openai specs)
- Test: `src/lib/image-gen/__tests__/registry.test.ts`

**Interfaces:**
- Produces: `MediaGenModelSpec.supportsMask?: boolean` (propagates to `ClientModelSpec` via the existing `Omit`).

- [ ] **Step 1: Write the failing test** — append to `registry.test.ts`:

```ts
import { imageGenRegistry } from "../registry";

describe("supportsMask capability", () => {
  it("is true for OpenAI gpt-image models and falsy for Gemini", () => {
    expect(imageGenRegistry["openai:gpt-image-2"].supportsMask).toBe(true);
    expect(imageGenRegistry["openai:gpt-image-1"].supportsMask).toBe(true);
    expect(imageGenRegistry["gemini:gemini-2.5-flash-image"].supportsMask ?? false).toBe(false);
    expect(imageGenRegistry["gemini:gemini-3-pro-image"].supportsMask ?? false).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/image-gen/__tests__/registry.test.ts`
Expected: FAIL — `supportsMask` is `undefined` for the OpenAI models (`expected undefined to be true`).

- [ ] **Step 3: Add the field to the type**

In `src/lib/image-gen/types.ts`, inside `MediaGenModelSpec`, add after `maxReferenceSizeBytes`:

```ts
  supportsMask?:         boolean;   // model accepts an alpha edit-mask (OpenAI images.edit)
```

- [ ] **Step 4: Set the flag on the OpenAI specs**

In `src/lib/image-gen/providers/openai.ts`, add `supportsMask: true,` to each of the three specs in `openaiModels` (next to `maxReferenceSizeBytes`). Leave the Gemini specs in `providers/gemini.ts` unchanged (falsy).

In `src/lib/image-gen/client-models.ts`, add `supportsMask: true,` to each of the three `openai:*` entries. Leave the `gemini:*` entries unchanged.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/image-gen/__tests__/registry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/image-gen/types.ts src/lib/image-gen/providers/openai.ts src/lib/image-gen/client-models.ts src/lib/image-gen/__tests__/registry.test.ts
git commit -m "feat(image-edit): supportsMask capability flag on model specs"
```

---

### Task 2: `editModeForModel` pure selector

**Files:**
- Create: `src/lib/image-gen/edit-mode.ts`
- Test: `src/lib/image-gen/__tests__/edit-mode.test.ts`

**Interfaces:**
- Produces: `editModeForModel(supportsMask?: boolean): "paint" | "type"` and `type EditMode`.

- [ ] **Step 1: Write the failing test** — create `src/lib/image-gen/__tests__/edit-mode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { editModeForModel } from "../edit-mode";

describe("editModeForModel", () => {
  it("returns 'paint' when the model supports a mask", () => {
    expect(editModeForModel(true)).toBe("paint");
  });
  it("returns 'type' when the model does not support a mask", () => {
    expect(editModeForModel(false)).toBe("type");
    expect(editModeForModel(undefined)).toBe("type");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/image-gen/__tests__/edit-mode.test.ts`
Expected: FAIL — cannot find module `../edit-mode`.

- [ ] **Step 3: Write minimal implementation** — create `src/lib/image-gen/edit-mode.ts`:

```ts
// How the Edit tab behaves for the selected model:
//   "paint" — the user paints the region to change; we send a clean base + an alpha mask.
//   "type"  — the user types the change; region targeting is text-only (no drawing).
export type EditMode = "paint" | "type";

export function editModeForModel(supportsMask?: boolean): EditMode {
  return supportsMask ? "paint" : "type";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/image-gen/__tests__/edit-mode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-gen/edit-mode.ts src/lib/image-gen/__tests__/edit-mode.test.ts
git commit -m "feat(image-edit): editModeForModel selector (paint vs type)"
```

---

### Task 3: `buildEditPrompt` masked variant (retire ANNOTATION_CLAUSE)

**Files:**
- Modify: `src/lib/image-gen/edit-prompt.ts`
- Test: `src/lib/image-gen/__tests__/edit-prompt.test.ts`

**Interfaces:**
- Produces: `buildEditPrompt({ instruction, intent?, hasExtraReference?, masked? })` — the `annotated` field is renamed to `masked`; when `masked` is true the region clause is appended.

- [ ] **Step 1: Write the failing test** — replace any `annotated`-based cases in `edit-prompt.test.ts` and add:

```ts
import { describe, it, expect } from "vitest";
import { buildEditPrompt } from "../edit-prompt";

describe("buildEditPrompt masked variant", () => {
  it("appends the mask region clause when masked", () => {
    const p = buildEditPrompt({ instruction: "the sky", intent: "modify", masked: true });
    expect(p).toContain("within the selected (masked) region");
    expect(p).not.toContain("drawn marks"); // old annotation clause is gone
  });
  it("omits the clause when not masked", () => {
    const p = buildEditPrompt({ instruction: "the sky", intent: "modify", masked: false });
    expect(p).not.toContain("masked");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/image-gen/__tests__/edit-prompt.test.ts`
Expected: FAIL — `masked` is not a recognized field / clause text absent.

- [ ] **Step 3: Edit the implementation** — in `src/lib/image-gen/edit-prompt.ts`:

Replace the `ANNOTATION_CLAUSE` constant (lines 6–11) with:

```ts
// When the user painted a region, the edit is constrained by a real alpha mask (OpenAI). The
// prompt reinforces the mask as soft guidance (mask + prompt are both "soft" — they reinforce).
const MASK_CLAUSE =
  " Apply the change only within the selected (masked) region and blend it seamlessly; " +
  "keep everything outside the region unchanged.";
```

In the `buildEditPrompt` input type, rename `annotated?: boolean;` to `masked?: boolean;`.

Change the final return (line 57) from:

```ts
  return input.annotated ? base + ANNOTATION_CLAUSE : base;
```

to:

```ts
  return input.masked ? base + MASK_CLAUSE : base;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/image-gen/__tests__/edit-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-gen/edit-prompt.ts src/lib/image-gen/__tests__/edit-prompt.test.ts
git commit -m "feat(image-edit): buildEditPrompt masked region clause; drop annotation clause"
```

---

### Task 4: `overlayToMaskRGBA` pure mask transform

**Files:**
- Create: `src/lib/image-gen/mask.ts`
- Test: `src/lib/image-gen/__tests__/mask.test.ts`

**Interfaces:**
- Produces:
  - `EDIT_ALPHA` (number), `KEEP_ALPHA` (number) — the polarity constants (verified in Task 9).
  - `type RGBA = { data: Uint8ClampedArray; width: number; height: number }`
  - `overlayToMaskRGBA(overlay: RGBA): RGBA` — painted pixels (`alpha > 0`) → `EDIT_ALPHA`, else `KEEP_ALPHA`; RGB set to black.

- [ ] **Step 1: Write the failing test** — create `src/lib/image-gen/__tests__/mask.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { overlayToMaskRGBA, EDIT_ALPHA, KEEP_ALPHA } from "../mask";

describe("overlayToMaskRGBA", () => {
  it("maps painted pixels to EDIT_ALPHA and untouched pixels to KEEP_ALPHA", () => {
    // two pixels: [0] painted (alpha 200), [1] untouched (alpha 0)
    const data = new Uint8ClampedArray([255, 0, 0, 200,  0, 0, 0, 0]);
    const out = overlayToMaskRGBA({ data, width: 2, height: 1 });
    expect(out.width).toBe(2);
    expect(out.height).toBe(1);
    expect(out.data[3]).toBe(EDIT_ALPHA);  // painted → editable
    expect(out.data[7]).toBe(KEEP_ALPHA);  // untouched → preserved
    // RGB is normalized to black
    expect([out.data[0], out.data[1], out.data[2]]).toEqual([0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/image-gen/__tests__/mask.test.ts`
Expected: FAIL — cannot find module `../mask`.

- [ ] **Step 3: Write minimal implementation** — create `src/lib/image-gen/mask.ts`:

```ts
// Alpha polarity for OpenAI's images.edit mask. Per the docs the mask carries an alpha channel;
// which side is edited is NOT stated explicitly, so these are VERIFIED EMPIRICALLY (plan Task 9).
// Assumption until verified: painted region → transparent → editable.
export const EDIT_ALPHA = 0;    // painted region  → transparent → model may edit here
export const KEEP_ALPHA = 255;  // untouched pixel → opaque      → preserved

export type RGBA = { data: Uint8ClampedArray; width: number; height: number };

// Turn a transparent drawing overlay (painted pixels have alpha > 0) into an OpenAI edit mask:
// painted → EDIT_ALPHA, everything else → KEEP_ALPHA. RGB is normalized to black throughout
// (only the alpha channel is meaningful to the API).
export function overlayToMaskRGBA(overlay: RGBA): RGBA {
  const { data, width, height } = overlay;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const painted = data[i + 3] > 0;
    out[i] = 0;
    out[i + 1] = 0;
    out[i + 2] = 0;
    out[i + 3] = painted ? EDIT_ALPHA : KEEP_ALPHA;
  }
  return { data: out, width, height };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/image-gen/__tests__/mask.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-gen/mask.ts src/lib/image-gen/__tests__/mask.test.ts
git commit -m "feat(image-edit): overlayToMaskRGBA pure mask transform + polarity constants"
```

---

### Task 5: Provider interface — `ImageGenInput` mask + OpenAI forwards it

**Files:**
- Modify: `src/lib/image-gen/types.ts` (`ImageGenInput`)
- Modify: `src/lib/image-gen/providers/openai.ts`
- Test: `src/lib/image-gen/__tests__/mask-file.test.ts`

**Interfaces:**
- Consumes: `ImageGenInput` (Task 4's `RGBA` not needed here — mask arrives as base64).
- Produces:
  - `ImageGenInput.maskBase64?: string; maskMime?: string;`
  - `maskFileFromInput(input: Pick<ImageGenInput, "maskBase64" | "maskMime">): File | undefined` (exported from `providers/openai.ts`).

- [ ] **Step 1: Write the failing test** — create `src/lib/image-gen/__tests__/mask-file.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { maskFileFromInput } from "../providers/openai";

describe("maskFileFromInput", () => {
  it("returns undefined when there is no mask", () => {
    expect(maskFileFromInput({})).toBeUndefined();
  });
  it("builds a PNG File from base64 with the given mime", () => {
    const b64 = Buffer.from("hello").toString("base64");
    const file = maskFileFromInput({ maskBase64: b64, maskMime: "image/png" });
    expect(file).toBeInstanceOf(File);
    expect(file!.type).toBe("image/png");
    expect(file!.name).toBe("mask.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/image-gen/__tests__/mask-file.test.ts`
Expected: FAIL — `maskFileFromInput` is not exported.

- [ ] **Step 3: Add the type + helper + wiring**

In `src/lib/image-gen/types.ts`, extend `ImageGenInput`:

```ts
export type ImageGenInput = {
  prompt: string;
  referenceUrls: string[];   // Supabase public URLs — never re-encoded to base64 for OpenAI
  params: Record<string, unknown>;
  maskBase64?: string;       // OpenAI alpha edit-mask (base64 PNG), same size as the base image
  maskMime?: string;         // defaults to image/png
};
```

In `src/lib/image-gen/providers/openai.ts`, add the exported helper (near `urlToFile`):

```ts
// Build the OpenAI edit `mask` File from the base64 the client painted. Returns undefined when
// no mask was sent (whole-image edit).
export function maskFileFromInput(
  input: Pick<ImageGenInput, "maskBase64" | "maskMime">,
): File | undefined {
  if (!input.maskBase64) return undefined;
  const mime = input.maskMime ?? "image/png";
  return new File([Buffer.from(input.maskBase64, "base64")], "mask.png", { type: mime });
}
```

Then in `generateWithOpenAI`, replace the `images.edit` call (lines 47–51) with:

```ts
    const mask = maskFileFromInput(input);
    response = await openai.images.edit({
      ...sharedParams,
      prompt: input.prompt,
      image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
      ...(mask ? { mask } : {}),
    });
```

(No change to `providers/gemini.ts` — it never reads `maskBase64`. Add a one-line comment there: `// masks are OpenAI-only; Gemini does region targeting via prompt text (D38).`)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/image-gen/__tests__/mask-file.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the provider edit**

Run: `npx tsc --noEmit`
Expected: no new errors in `providers/openai.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/image-gen/types.ts src/lib/image-gen/providers/openai.ts src/lib/image-gen/providers/gemini.ts src/lib/image-gen/__tests__/mask-file.test.ts
git commit -m "feat(image-edit): thread mask through ImageGenInput; OpenAI forwards it to images.edit"
```

---

### Task 6: Route — masked path (clean base + mask), retire composite

**Files:**
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts`

**Interfaces:**
- Consumes: `buildEditPrompt({ masked })` (Task 3), `uploadImageGen` (existing), `config.generate({ maskBase64, maskMime })` (Task 5).
- Produces: request body now accepts `{ masked, maskBase64, maskMime }` and no longer reads `annotated*`.

- [ ] **Step 1: Update the request body type** — in `route.ts`, in the `body` cast (lines 31–45), remove `annotated`, `annotatedBaseImageBase64`, `annotatedBaseImageMime` and add:

```ts
        masked?: unknown;
        maskBase64?: unknown;
        maskMime?: unknown;
```

- [ ] **Step 2: Replace the composite block** — replace the "Annotation" block (lines 108–127, from `const annotated =` through the `if (annotated) { … }`) with:

```ts
    // Region mask (OpenAI): the client painted a region and sent it as a base64 alpha PNG. The
    // base image stays CLEAN (never composited) — the mask travels separately to the provider.
    const masked =
      body?.masked === true && typeof body?.maskBase64 === "string";
    const maskBase64 = masked ? (body!.maskBase64 as string) : undefined;
    const maskMime =
      masked && typeof body?.maskMime === "string" ? (body.maskMime as string) : "image/png";
    const modelBaseUrl = resolvedBaseUrl; // clean base — no composite
```

- [ ] **Step 3: Pass `masked` into the prompt + carry mask to generate + fix lineage**

In the `buildEditPrompt` call (lines 149–156), change `annotated,` to `masked,`.

Change the `inputsUsed` object (lines 157–166): remove `annotated` and `annotatedBaseUrl`, add:

```ts
      masked,
```

In the generate call (line 182), add the mask fields:

```ts
    const result = await config.generate({
      prompt,
      referenceUrls,
      params: validatedParams,
      ...(maskBase64 ? { maskBase64, maskMime } : {}),
    });
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors — `annotated`, `annotatedBaseUrl`, `annotatedBaseImageBase64` no longer referenced anywhere in the route.

- [ ] **Step 5: Manual smoke (deferred to Task 9 end-to-end)** — the route has no unit-test harness in this codebase; full behavior is verified end-to-end in Task 9. For now just confirm the dev server compiles the route:

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:3000/api/nodes/does-not-exist/image-generate" -H "Content-Type: application/json" -d '{}'`
Expected: a JSON error response (e.g. 400/500) — NOT a compile/500 stack from a missing symbol.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/nodes/[id]/image-generate/route.ts"
git commit -m "feat(image-edit): route sends clean base + mask; retire composite path"
```

---

### Task 7: Repurpose the annotation canvas as a region-mask painter

**Files:**
- Modify: `src/components/nodes/image-gen-annotation-canvas.tsx`

**Interfaces:**
- Consumes: `overlayToMaskRGBA` (Task 4), `useDrawingCanvas` transparent mode (existing).
- Produces: `AnnotationHandle` now has `toMaskBase64(): Promise<{ base64: string; mime: string } | null>` (replaces `toCompositeBase64`); `hasMarks()` and `clear()` unchanged.

- [ ] **Step 1: Swap the handle method** — in `image-gen-annotation-canvas.tsx`:

Change the `AnnotationHandle` type:

```ts
export type AnnotationHandle = {
  hasMarks: () => boolean;
  toMaskBase64: () => Promise<{ base64: string; mime: string } | null>;
  clear: () => void;
};
```

Replace the `toCompositeBase64` implementation in `useImperativeHandle` with `toMaskBase64`, using the pure transform (no base image is loaded — the mask is base-independent):

```ts
        toMaskBase64: async () => {
          const overlay = canvasRef.current;
          if (!overlay || !dirtyRef.current) return null;
          const octx = overlay.getContext("2d");
          if (!octx) return null;
          const src = octx.getImageData(0, 0, overlay.width, overlay.height);
          const mask = overlayToMaskRGBA({ data: src.data, width: src.width, height: src.height });
          const out = document.createElement("canvas");
          out.width = mask.width;
          out.height = mask.height;
          const ctx = out.getContext("2d");
          if (!ctx) return null;
          ctx.putImageData(new ImageData(mask.data, mask.width, mask.height), 0, 0);
          const dataUrl = out.toDataURL("image/png");
          return { base64: dataUrl.split(",")[1] ?? "", mime: "image/png" };
        },
```

Add the import at the top:

```ts
import { overlayToMaskRGBA } from "@/lib/image-gen/mask";
```

Remove the now-unused `loadImage` usage inside the handle (the `useEffect` that loads the base for `dims` stays — it sizes the buffer to the base). The `proxied`/`loadImage` helpers remain in use by that effect.

- [ ] **Step 2: Single translucent mask color, drop the pen palette** — replace the multi-color palette block (the `DRAW_COLORS.map(...)` buttons) with a single fixed translucent highlight, and default the tool to pen with that color. At the top, set a mask color constant:

```ts
const MASK_COLOR = "rgba(88, 41, 199, 0.4)"; // brand purple @ 40% — reads as a mask overlay
```

Pass it as the initial color: in the `useDrawingCanvas(canvasRef, { transparent: true, size: brushSize })` call, after mount set the color once via the existing `setColor`:

```ts
  useEffect(() => {
    setColor(MASK_COLOR);
    setTool("pen");
  }, [setColor, setTool]);
```

Delete the `DRAW_COLORS` import and its `.map` button group in the right rail. Keep the **eraser**, **brush-size slider**, and **clear** controls.

- [ ] **Step 3: Update copy** — change the base `<img>`/canvas region caption or add a one-line hint above the canvas: `Paint over the area you want to change.` (place it where the rail header sits, matching existing text styles).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no references to `toCompositeBase64` or `DRAW_COLORS` remain in this file.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/image-gen-annotation-canvas.tsx
git commit -m "feat(image-edit): repurpose annotation canvas as translucent region-mask painter"
```

---

### Task 8: Focus view — mask/type branch, payload change, clear-on-switch

**Files:**
- Modify: `src/components/nodes/image-gen-focus-view.tsx`

**Interfaces:**
- Consumes: `editModeForModel` (Task 2), `model.supportsMask` (Task 1), `annotationRef.toMaskBase64` (Task 7).
- Produces: edit payload sends `{ masked, maskBase64, maskMime }` + clean base; no `annotated*` fields.

- [ ] **Step 1: Import the selector** — add near the other `image-gen` imports:

```ts
import { editModeForModel } from "@/lib/image-gen/edit-mode";
```

And derive the mode after `model` is resolved (near line 193):

```ts
  const editMode = editModeForModel(model.supportsMask); // "paint" | "type"
```

- [ ] **Step 2: Rename the annotation state to mask semantics** — rename `hasAnnotation`/`setHasAnnotation` (line 213) to `hasMaskRegion`/`setHasMaskRegion`; update the `composedPrompt` field (line 363) from `annotated: hasAnnotation` to `masked: editMode === "paint" && hasMaskRegion`; update the `onMarksChange` prop (line 832) to `setHasMaskRegion`; and the restore reset (line 564) to `setHasMaskRegion(false)`.

- [ ] **Step 3: Clear the painted region when the model flips modes** — extend the existing model-switch effect (lines 238–245):

```ts
  useEffect(() => {
    if (model.id !== seenModelIdRef.current) {
      seenModelIdRef.current = model.id;
      const defaults = defaultsForModel(model);
      setParamValues(defaults);
      onPatch({ params: defaults });
      annotationRef.current?.clear();   // drop any painted mask — it must not cross models
      setHasMaskRegion(false);
    }
  }, [model, onPatch]);
```

- [ ] **Step 4: Branch the Edit-tab body on `editMode`** — replace the render branch at line 826. When `editMode === "paint"`, render the mask canvas (as today); when `"type"`, render a read-only base image + hint instead:

```tsx
                {activeTab === "edit" && editBaseUrl && !editing ? (
                  editMode === "paint" ? (
                    <ImageGenAnnotationCanvas
                      key={editBaseUrl}
                      ref={annotationRef}
                      baseUrl={editBaseUrl}
                      alt={title || "Base image"}
                      onMarksChange={setHasMaskRegion}
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={editBaseUrl}
                        alt={title || "Base image"}
                        className="max-h-[80%] max-w-full rounded-xl border border-border object-contain"
                        draggable={false}
                      />
                      <p className="text-xs text-muted-foreground">
                        This model edits from your description — say what to change and where.
                      </p>
                    </div>
                  )
                ) : (
```

- [ ] **Step 5: Replace the composite payload with a mask payload** — in `handleEdit`, replace lines 507–529 (the composite block + the `annotated` spread) with:

```ts
      // Region mask (paint models only): convert the painted overlay into an alpha PNG and send
      // it alongside the CLEAN base. Type-only models send no mask.
      let maskBase64: string | undefined;
      let maskMime: string | undefined;
      if (editMode === "paint" && annotationRef.current?.hasMarks()) {
        const mask = await annotationRef.current.toMaskBase64();
        if (mask) {
          maskBase64 = mask.base64;
          maskMime = mask.mime;
        }
      }
      const res = await fetch(`/api/nodes/${nodeId}/image-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          params: paramValues,
          instruction: editInstr,
          intent,
          prompt: finalPrompt,
          extraReferenceUrls: selectedExtraUrls,
          ...(maskBase64 ? { masked: true, maskBase64, maskMime } : {}),
          ...(baseVersionId ? { baseVersionId } : { baseImageUrl }),
        }),
      });
```

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit && npx next lint --file src/components/nodes/image-gen-focus-view.tsx`
Expected: no errors; no remaining references to `hasAnnotation`, `annotatedBaseImageBase64`, or `toCompositeBase64`.

- [ ] **Step 7: Commit**

```bash
git add src/components/nodes/image-gen-focus-view.tsx
git commit -m "feat(image-edit): mask/type edit branch by model; send clean base + mask"
```

---

### Task 9: End-to-end verification + mask-polarity lock (manual)

**Files:**
- Possibly modify: `src/lib/image-gen/mask.ts` (flip `EDIT_ALPHA`/`KEEP_ALPHA` if verification shows the opposite convention)

**Interfaces:** none (verification task).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (leave running). Confirm it compiles clean.

- [ ] **Step 2: Paint-model edit (OpenAI)** — in the app: open an Image Gen node with a base image, select an OpenAI (`gpt-image-*`) model, open **Edit**, confirm the paint canvas shows a **translucent purple** brush and the multi-color palette is gone. Paint over one clear region (e.g. a specific object), type an instruction ("make this red"), and run the edit.

- [ ] **Step 3: Verify polarity** — inspect the result:
  - If **the painted region changed** and the rest is preserved → polarity is correct; leave `mask.ts` as-is.
  - If **everything EXCEPT the painted region changed** (or the whole image regenerated) → the convention is inverted. In `src/lib/image-gen/mask.ts` swap the constants to `EDIT_ALPHA = 255; KEEP_ALPHA = 0;`, re-run `npx vitest run src/lib/image-gen/__tests__/mask.test.ts` (update the test's expected values to match), rebuild, and repeat Step 2 to confirm.

- [ ] **Step 4: No marks in output** — confirm the output contains **no purple/paint strokes** anywhere (the whole point of the change). If strokes appear, the base is not clean — re-check Task 6 (`modelBaseUrl = resolvedBaseUrl`) and Task 8 (no composite sent).

- [ ] **Step 5: Type-model edit (Gemini)** — switch the node's model to a `gemini:*` model. Confirm: the paint canvas is **hidden**, the base shows read-only with the "edits from your description" hint, any previously painted region was cleared, and a text-only edit runs and applies.

- [ ] **Step 6: Mask + extra reference (edge)** — with an OpenAI model, connect a second image node, mark it as an extra reference, paint a region, and run an "add/replace … here" edit. Observe whether the mask still constrains the region with references present. Record the outcome in the spec's §10 (append a one-line note: works / partially / document limitation). Do NOT block on fixing — this is the flagged verify-then-document edge.

- [ ] **Step 7: Full test + lint gate**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 8: Commit any polarity/doc fixes**

```bash
git add src/lib/image-gen/mask.ts src/lib/image-gen/__tests__/mask.test.ts docs/superpowers/specs/2026-07-06-image-edit-model-aware-masking-design.md
git commit -m "test(image-edit): verify mask polarity end-to-end; record mask+refs behavior"
```

---

### Task 10: Record ADR D38

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7 ADR log)

- [ ] **Step 1: Append the ADR** — add a **D38** entry to §7 in the house format (Decision / Why / Rejected / Refines / Originated → spec):

```
- **D38 — Model-aware image-edit region control (mask vs text).**
  Decision: The Edit region is carried in the selected model's native channel — OpenAI via a
  real alpha mask (`images.edit` mask; user paints the region; clean base), Gemini via text only.
  A `supportsMask` capability flag on the model spec drives both the UI (paint vs type) and the
  payload. The D37 burned-in annotation composite is retired.
  Why: compositing marks into the base image reproduces them into the output; native channels
  (mask / text) don't, and mask polarity was verified empirically.
  Rejected: keep the composite (it is the bug); pass an annotated image as a Gemini reference
  (reintroduces marks-in-pixels, off-pattern, undocumented).
  Refines: D37 (partially reverses its "pixel masks are a non-goal" stance) / D27.
  Originated → spec: docs/superpowers/specs/2026-07-06-image-edit-model-aware-masking-design.md
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): record D38 model-aware image-edit region control"
```

---

## Self-Review

**Spec coverage:**
- §4 capability flag → Task 1. §5 UX (paint vs hide-canvas/type + copy) → Tasks 7, 8 (Step 4). §5 clear-on-switch → Task 8 (Step 3). §6 mask generation → Tasks 4, 7; §6 direction verification → Task 9 (Steps 2–4). §7 payload → Task 8 (Step 5); §7 route → Task 6; §7 provider → Task 5; §7 prompt → Task 3. §8 data flow → Tasks 5+6+7+8 together. §9 tests → Tasks 1–5 (unit) + Task 9 (e2e). §10 edges → Task 9 (Steps 3–4, 6). §11 ADR → Task 10. ✅ all covered.

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✅

**Type consistency:** `supportsMask` (Task 1) read in Tasks 2/8. `editModeForModel` returns `"paint"|"type"` (Task 2) used in Task 8. `masked` field name consistent across Tasks 3/6/8. `maskBase64`/`maskMime` consistent across Tasks 5/6/8. `toMaskBase64` defined in Task 7, called in Task 8. `overlayToMaskRGBA`/`EDIT_ALPHA`/`KEEP_ALPHA` defined in Task 4, used in Tasks 7/9. ✅
