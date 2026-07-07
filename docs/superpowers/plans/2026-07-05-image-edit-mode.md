# Image Edit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Image Gen focus view's inline edit panel into a proper **Edit mode** tab that lets a designer annotate the base image on a separate layer, mark which connected nodes are references for the edit, and edit a connected reference that has never been generated — all over the existing D27 edit pipeline.

**Architecture:** A `Generate | Edit` tab (shadcn Base UI `Tabs`) inside `image-gen-focus-view.tsx`. Edit mode renders the base image (active attempt **or** the first connected reference) with a transparent annotation `<canvas>` overlay, a reference-selection list of connected nodes, and the existing chips/instruction/final-prompt composer. On Edit it composites base+marks to a PNG and POSTs it (as base64) plus the chosen `extraReferenceUrls` to the **existing** `image-generate` route, which gains two additive body fields. No new route, no new node, no DB migration (spec §4, §9; ADR **D37**).

**Tech Stack:** Next.js 16 (App Router, Route Handlers), React 19, Zustand, Supabase/GCS storage, Gemini/OpenAI image providers, Vitest, Tailwind v4 + shadcn (Base UI registry).

**Spec:** `docs/superpowers/specs/2026-07-05-image-edit-mode-design.md` · **Base feature (D27):** `docs/superpowers/specs/2026-06-28-image-editing-design.md`.

## Global Constraints

- **No DB migration.** New provenance rides `node_versions.inputs_used` JSONB; new node state rides `nodes.data` JSONB via `flowToPersisted` (spec §5).
- **Reuse the D27 pipeline.** One route, one `config.generate`, one version log. Edit mode is an input composer; the route gains only additive body fields (spec §4.1, §9).
- **A reference must be a connected node.** Edit mode only *marks* connected nodes — no new upload/storage path for references (spec §3, §7).
- **Annotation is a separate transparent layer.** Eraser = `destination-out`; marks are spatial guides, never rendered into output; marks are ephemeral (not persisted) (spec §8).
- **shadcn only, never native controls** — `Tabs`, `Textarea`, `Button` from `src/components/ui/*` (Base UI). No `checkbox.tsx` exists in the registry, so reference selection uses house-style **toggle tiles** (dashed-border primary chip affordance, AGENTS.md), not a native checkbox.
- **Yuvabe design system:** dashed-border primary chips for selectable/add actions; purple sparingly; Lucide icons at 1.5 stroke; `shadow-card`; motion easing `cubic-bezier(0.22,1,0.36,1)`.
- **Default editing model = Gemini** (suggest, don't block). Detect by `provider === "gemini"`.
- **Test command:** `npm test` (Vitest `vitest run`). Pure logic gets failing-test-first TDD (Tasks 1–4). No route/component harness exists (all tests are pure-lib units), so route/UI tasks (5–9) keep logic in the tested pure helpers and are verified manually via `npm run dev` — do **not** add a mocking harness.
- **Commit after every task.** Conventional messages ending with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Branch:** `worktree-image-edit-mode` (already checked out; forked from `origin/main`; the D37 spec commit is already there).

---

### Task 1: Transparent-layer drawing settings

**Files:**
- Modify: `src/lib/nodes/draw-canvas.ts`
- Test: `src/lib/nodes/draw-canvas.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `drawingContextSettings(tool, color, opts?: { transparent?: boolean })` — when `opts.transparent` and `tool === "eraser"`, returns `globalCompositeOperation: "destination-out"` (clears ink to transparent) instead of the white-pen default. Pen and the non-transparent eraser are unchanged. Consumed by Task 6 (`useDrawingCanvas` transparent mode).

- [ ] **Step 1: Write the failing test (append to `src/lib/nodes/draw-canvas.test.ts`)**

```ts
describe("drawingContextSettings — transparent layer (annotation overlay)", () => {
  it("transparent eraser clears to transparent via destination-out", () => {
    expect(drawingContextSettings("eraser", "#dc2626", { transparent: true })).toEqual({
      globalCompositeOperation: "destination-out",
      strokeStyle: "rgba(0,0,0,1)",
      lineWidth: ERASER_WIDTH,
    });
  });

  it("transparent pen is unchanged (draws the colour with source-over)", () => {
    expect(drawingContextSettings("pen", "#16a34a", { transparent: true })).toEqual({
      globalCompositeOperation: "source-over",
      strokeStyle: "#16a34a",
      lineWidth: PEN_WIDTH,
    });
  });

  it("without opts the eraser still paints white (white-layer Draw node unchanged)", () => {
    expect(drawingContextSettings("eraser", "#dc2626")).toEqual({
      globalCompositeOperation: "source-over",
      strokeStyle: "#ffffff",
      lineWidth: ERASER_WIDTH,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/draw-canvas.test.ts`
Expected: FAIL — the transparent eraser case returns `source-over`/`#ffffff`, not `destination-out`.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `drawingContextSettings` in `src/lib/nodes/draw-canvas.ts` with:

```ts
export function drawingContextSettings(
  tool: DrawTool,
  color: string,
  opts?: { transparent?: boolean },
): CanvasToolSettings {
  if (tool === "eraser") {
    // On a transparent overlay (the annotation layer) the eraser must CLEAR ink to
    // transparent — a white pen would paint white marks over the base image. On the
    // white-background Draw node it stays a white pen (destination-out would punch holes).
    return opts?.transparent
      ? {
          globalCompositeOperation: "destination-out",
          strokeStyle: "rgba(0,0,0,1)",
          lineWidth: ERASER_WIDTH,
        }
      : {
          globalCompositeOperation: "source-over",
          strokeStyle: "#ffffff",
          lineWidth: ERASER_WIDTH,
        };
  }
  return {
    globalCompositeOperation: "source-over",
    strokeStyle: color,
    lineWidth: PEN_WIDTH,
  };
}
```

Also update the file's top comment (currently says the eraser is "simply a white pen (no destination-out)") to note the transparent-overlay exception:

```ts
// Pure drawing-tool logic for the Draw node, isolated from the canvas/DOM so it can be
// unit-tested. The useDrawingCanvas hook applies these settings to the 2D context before
// each stroke. The Draw node's canvas is a single white-background layer, so its eraser is a
// white pen. The image-edit annotation overlay is a TRANSPARENT layer (opts.transparent),
// where the eraser uses destination-out to clear ink without touching the base image.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/draw-canvas.test.ts`
Expected: PASS (all existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/draw-canvas.ts src/lib/nodes/draw-canvas.test.ts
git commit -m "$(printf 'feat(image-edit): transparent-layer eraser (destination-out) for annotation\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: `buildEditPrompt` — `modify` intent + `annotated` clause

**Files:**
- Modify: `src/lib/image-gen/edit-prompt.ts`
- Test: `src/lib/image-gen/__tests__/edit-prompt.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `EditIntent` becomes `"remove" | "replace" | "add" | "modify" | "freeform"`.
  - `buildEditPrompt({ instruction, intent?, hasExtraReference?, annotated? })` — `modify` uses the change-only template (same family as `freeform`, distinct intent); `annotated: true` appends a guides-only clause to any template.
- Consumed by: Task 4 (`ImageGenNodeData`), Task 5 (route), Task 8 (Modify chip), Task 9 (focus view preview).

- [ ] **Step 1: Write the failing test (append to `src/lib/image-gen/__tests__/edit-prompt.test.ts`)**

```ts
describe("buildEditPrompt — modify intent", () => {
  it("modify uses the change-only template", () => {
    const p = buildEditPrompt({ instruction: "recolor the label to matte black", intent: "modify" });
    expect(p).toContain("change only recolor the label to matte black");
    expect(p).toContain("Keep everything else exactly the same");
  });
});

describe("buildEditPrompt — annotation clause", () => {
  it("appends a guides-only clause when annotated is true", () => {
    const p = buildEditPrompt({ instruction: "the cup", intent: "remove", annotated: true });
    expect(p).toContain("remove the cup"); // template still applies
    expect(p).toContain("marked");
    expect(p).toContain("do not include the marks");
  });

  it("adds no annotation clause when annotated is false/absent", () => {
    const p = buildEditPrompt({ instruction: "the cup", intent: "remove" });
    expect(p).not.toContain("do not include the marks");
  });

  it("applies the annotation clause to the reference (add) template too", () => {
    const p = buildEditPrompt({ instruction: "the product", intent: "add", hasExtraReference: true, annotated: true });
    expect(p).toContain("base scene");
    expect(p).toContain("do not include the marks");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/image-gen/__tests__/edit-prompt.test.ts`
Expected: FAIL — TypeScript rejects `intent: "modify"` (not in `EditIntent`); `annotated` clause not present.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/image-gen/edit-prompt.ts`, change the `EditIntent` type and `buildEditPrompt`:

```ts
export type EditIntent = "remove" | "replace" | "add" | "modify" | "freeform";

// When the user has drawn on the image, tell the model the marks are a spatial guide, not
// content to reproduce (Gemini annotation-pointing). Appended to whichever intent template.
const ANNOTATION_CLAUSE =
  " I have marked the area to change directly on the image. Apply the edit only within the " +
  "marked region and blend it seamlessly; treat the drawn marks as guides only — do not " +
  "include the marks themselves in the output.";

export function buildEditPrompt(input: {
  instruction: string;
  intent?: EditIntent;
  hasExtraReference?: boolean;
  annotated?: boolean;
}): string {
  const instruction = input.instruction.trim();
  const intent = input.intent ?? (input.hasExtraReference ? "add" : "freeform");

  let base: string;
  switch (intent) {
    case "remove":
      base =
        `Using the provided image, remove ${instruction}. Keep everything else exactly the ` +
        `same — preserve the original subject, style, lighting, composition, and all remaining ` +
        `elements, and fill the vacated area so the edit is seamless.`;
      break;
    case "replace":
      base =
        `Using the provided image as the base scene, replace ${instruction} with the product ` +
        `shown in the additional reference image(s). Match the original placement, scale, ` +
        `perspective, lighting, and shadows. Keep everything else in the scene exactly the same.`;
      break;
    case "add":
      base =
        `Using the provided image as the base scene, add ${instruction} using the product shown ` +
        `in the additional reference image(s). Integrate it naturally with realistic scale, ` +
        `perspective, lighting, and shadows, and keep everything else in the scene exactly the same.`;
      break;
    case "modify":
    case "freeform":
    default:
      base =
        `Using the provided image, change only ${instruction}. Keep everything else exactly the ` +
        `same — preserve the original style, lighting, composition, and all other elements.`;
      break;
  }

  return input.annotated ? base + ANNOTATION_CLAUSE : base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/image-gen/__tests__/edit-prompt.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-gen/edit-prompt.ts src/lib/image-gen/__tests__/edit-prompt.test.ts
git commit -m "$(printf 'feat(image-edit): buildEditPrompt gains modify intent + annotation clause\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 3: `selectEditReferenceUrls` — resolve chosen connected refs

**Files:**
- Modify: `src/lib/image-gen/edit-prompt.ts`
- Test: `src/lib/image-gen/__tests__/edit-prompt.test.ts`

**Interfaces:**
- Produces: `selectEditReferenceUrls({ connected: Array<{ id: string; url: string }>; selectedIds: string[]; baseUrl?: string }): string[]` — returns the URLs of the chosen connected nodes, excluding the base URL, deduped, order-preserving. Empty `selectedIds` ⇒ fall back to **all** non-base connected URLs (the D27 default).
- Consumed by: Task 9 (focus view resolves the marked set before POSTing).

- [ ] **Step 1: Write the failing test (append to `src/lib/image-gen/__tests__/edit-prompt.test.ts`)**

```ts
import { selectEditReferenceUrls } from "../edit-prompt";

describe("selectEditReferenceUrls", () => {
  const connected = [
    { id: "a", url: "urlA" },
    { id: "b", url: "urlB" },
    { id: "c", url: "urlC" },
  ];

  it("returns only the selected nodes' urls", () => {
    expect(selectEditReferenceUrls({ connected, selectedIds: ["a", "c"] })).toEqual(["urlA", "urlC"]);
  });

  it("excludes the base url even if selected", () => {
    expect(
      selectEditReferenceUrls({ connected, selectedIds: ["a", "b"], baseUrl: "urlA" }),
    ).toEqual(["urlB"]);
  });

  it("empty selection falls back to all non-base urls (D27 default)", () => {
    expect(selectEditReferenceUrls({ connected, selectedIds: [], baseUrl: "urlA" })).toEqual([
      "urlB",
      "urlC",
    ]);
  });

  it("dedups repeated urls", () => {
    const dup = [
      { id: "a", url: "same" },
      { id: "b", url: "same" },
    ];
    expect(selectEditReferenceUrls({ connected: dup, selectedIds: ["a", "b"] })).toEqual(["same"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/image-gen/__tests__/edit-prompt.test.ts`
Expected: FAIL — `selectEditReferenceUrls is not a function`.

- [ ] **Step 3: Write minimal implementation (append to `src/lib/image-gen/edit-prompt.ts`)**

```ts
// Resolve the connected nodes the user marked as references for this edit into URLs. Base is
// excluded (it's the image being edited, not an extra). Empty selection = the D27 default (all
// other connected images). Order-preserving, deduped (spec §7).
export function selectEditReferenceUrls(input: {
  connected: Array<{ id: string; url: string }>;
  selectedIds: string[];
  baseUrl?: string;
}): string[] {
  const nonBase = input.connected.filter((c) => !!c.url && c.url !== input.baseUrl);
  const chosen =
    input.selectedIds.length > 0
      ? nonBase.filter((c) => input.selectedIds.includes(c.id))
      : nonBase;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chosen) {
    if (!seen.has(c.url)) {
      seen.add(c.url);
      out.push(c.url);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/image-gen/__tests__/edit-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-gen/edit-prompt.ts src/lib/image-gen/__tests__/edit-prompt.test.ts
git commit -m "$(printf 'feat(image-edit): selectEditReferenceUrls (chosen connected refs, base-excluded)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 4: `editReferenceNodeIds` on `ImageGenNodeData`

**Files:**
- Modify: `src/lib/canvas-nodes.ts` (the `ImageGenNodeData` type, lines 57–64)
- Test: `src/lib/canvas-nodes.test.ts`

**Interfaces:**
- Produces: `ImageGenNodeData.editReferenceNodeIds?: string[]`. `flowToPersisted` already spreads `data` (minus `parsed`), so it persists via autosave with no other change.
- Consumed by: Task 9 (focus view reads/writes it).

- [ ] **Step 1: Write the failing test (append to `src/lib/canvas-nodes.test.ts`)**

```ts
import type { AppNode } from "./canvas-nodes";

describe("flowToPersisted (image-gen edit-mode fields)", () => {
  it("persists editReferenceNodeIds and editIntent, drops parsed", () => {
    const node = {
      id: "img1",
      type: "image-gen",
      position: { x: 0, y: 0 },
      data: {
        title: "Hero",
        editIntent: "modify",
        editReferenceNodeIds: ["file-1", "file-2"],
        parsed: "https://example.com/x.png",
      },
    } as unknown as AppNode;

    const persisted = flowToPersisted(node);
    const d = persisted.data as { editReferenceNodeIds?: string[]; editIntent?: string; parsed?: unknown };
    expect(d.editReferenceNodeIds).toEqual(["file-1", "file-2"]);
    expect(d.editIntent).toBe("modify");
    expect(d.parsed).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: FAIL — TS error: `editReferenceNodeIds` not a known property of `ImageGenNodeData` (and `"modify"` requires Task 2's `EditIntent`).

- [ ] **Step 3: Add the field**

In `src/lib/canvas-nodes.ts`, change `ImageGenNodeData` to add one line and update the `editIntent` comment:

```ts
export type ImageGenNodeData = {
  title?: string;
  modelId?: string;                   // e.g. "openai:gpt-image-2" — saved on node
  params?: Record<string, unknown>;   // last-used param values for selected model
  parsed?: unknown;                   // D19: active version output (image URL, display only — never persisted)
  editInstruction?: string;           // current edit instruction (the delta), persisted; snapshotted per attempt
  editIntent?: EditIntent;            // selected edit action (remove/replace/add/modify/freeform)
  editReferenceNodeIds?: string[];    // D37: connected node ids marked as references for the edit
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-nodes.test.ts
git commit -m "$(printf 'feat(image-edit): add editReferenceNodeIds to ImageGenNodeData\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 5: Route — explicit `extraReferenceUrls` + annotation composite

**Files:**
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts`

**Interfaces:**
- Consumes: `buildEditPrompt` (Task 2), `assembleEditReferences`, `uploadImageGen`, `getVersionById` (existing).
- Produces: the edit branch accepts `extraReferenceUrls?: string[]`, `annotated?: boolean`, `annotatedBaseImageBase64?: string`, `annotatedBaseImageMime?: string`. When `annotatedBaseImageBase64` is present the composite is uploaded and used as the image the model sees (base first), while `baseVersionId` still carries lineage; `inputs_used` records `annotated` + `annotatedBaseUrl` + the chosen `extraReferenceUrls`. `"modify"` is added to `EDIT_INTENTS`.
- Note: no automated test (no route harness); the edit logic lives in the Task 1–3 pure helpers, which are tested. Verified manually in Step 3.

- [ ] **Step 1: Extend the body type and `EDIT_INTENTS`**

In `src/app/api/nodes/[id]/image-generate/route.ts`, add `"modify"` to `EDIT_INTENTS`:

```ts
const EDIT_INTENTS: readonly EditIntent[] = ["remove", "replace", "add", "modify", "freeform"];
```

Extend the `body` cast (the object after `await req.json()`) to declare the new fields:

```ts
  const body = (await req.json().catch(() => null)) as
    | {
        modelId?: unknown;
        params?: unknown;
        instruction?: unknown;
        intent?: unknown;
        prompt?: unknown;
        baseVersionId?: unknown;
        baseImageUrl?: unknown;
        extraReferenceUrls?: unknown;
        annotated?: unknown;
        annotatedBaseImageBase64?: unknown;
        annotatedBaseImageMime?: unknown;
      }
    | null;
```

- [ ] **Step 2: Rewrite the `if (isEdit) { … }` block**

Replace the entire `if (isEdit) {` … `}` block (currently through the `inputsUsed = { … };` inside it — up to but not including the `} else {` fresh-generation branch) with:

```ts
  if (isEdit) {
    // Base image = the node's current image: a prior attempt or a connected reference.
    const baseVersionId =
      typeof body?.baseVersionId === "string" ? body.baseVersionId : undefined;
    let resolvedBaseUrl: string | undefined;
    let carriedPromptVersionId: string | null = null;

    if (baseVersionId) {
      const baseVersion = await getVersionById(baseVersionId);
      if (typeof baseVersion?.output === "string") resolvedBaseUrl = baseVersion.output;
      const prevInputs = (baseVersion?.inputs_used ?? {}) as { promptVersionId?: string };
      carriedPromptVersionId = prevInputs.promptVersionId ?? null;
    } else if (typeof body?.baseImageUrl === "string") {
      resolvedBaseUrl = body.baseImageUrl;
      carriedPromptVersionId = promptNode?.versionId ?? null;
    }
    if (!resolvedBaseUrl) return apiError("No base image to edit.", 400);

    // Annotation: the client composited base + drawn marks into one PNG (base64). Upload it and
    // send THAT as the image the model sees; lineage still points at the un-annotated base.
    const annotated =
      body?.annotated === true && typeof body?.annotatedBaseImageBase64 === "string";
    let annotatedBaseUrl: string | null = null;
    let modelBaseUrl = resolvedBaseUrl;
    if (annotated) {
      const mime =
        typeof body?.annotatedBaseImageMime === "string"
          ? body.annotatedBaseImageMime
          : "image/png";
      const uploaded = await uploadImageGen({
        nodeId,
        ext: mimeToExt(mime),
        body: Buffer.from(body!.annotatedBaseImageBase64 as string, "base64"),
        contentType: mime,
      });
      annotatedBaseUrl = uploaded.url;
      modelBaseUrl = uploaded.url;
    }

    // Extra references: the client's chosen connected-node URLs when provided; otherwise the
    // D27 default (all other connected images). Dedup the real base out either way.
    const bodyExtras = Array.isArray(body?.extraReferenceUrls)
      ? (body.extraReferenceUrls as unknown[]).filter(
          (u): u is string => typeof u === "string",
        )
      : undefined;
    const extraReferenceUrls = (bodyExtras ?? connectedImageUrls).filter(
      (u) => u !== resolvedBaseUrl,
    );

    referenceUrls = assembleEditReferences({
      baseImageUrl: modelBaseUrl,
      extraUrls: extraReferenceUrls,
      max: config.maxReferenceImages,
    });
    const intent = asIntent(body?.intent) ?? "freeform";
    // Use the operator's (possibly hand-edited) final prompt when provided; otherwise compose
    // it from the per-intent template. The literal prompt sent is recorded for traceability.
    const editedPrompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    prompt =
      editedPrompt ||
      buildEditPrompt({
        instruction,
        intent,
        hasExtraReference: extraReferenceUrls.length > 0,
        annotated,
      });
    inputsUsed = {
      promptVersionId: carriedPromptVersionId,
      baseVersionId: baseVersionId ?? null,
      intent,
      instruction,
      editPrompt: prompt,
      extraReferenceUrls,
      annotated,
      annotatedBaseUrl,
    };
  } else {
```

(Leave the `} else { … }` fresh-generation branch and everything after it unchanged.)

- [ ] **Step 3: Type-check, lint, manual regression**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Then `npm run dev` and confirm the **fresh generate path still works** (Prompt → Image Gen → Generate produces an image) and the **existing edit path still works** (generate, then use the current edit panel to Remove/Replace/Add). Edit-mode UI arrives in Tasks 7–9; this step only guards the route regression.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/nodes/[id]/image-generate/route.ts"
git commit -m "$(printf 'feat(image-edit): route accepts chosen extraReferenceUrls + annotation composite\n\nUpload the client-composited annotated base and send it as the model image while\nbaseVersionId still carries lineage; honor an explicit extraReferenceUrls set;\nrecord annotated/annotatedBaseUrl breadcrumbs; add modify intent. Fresh path unchanged.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 6: `useDrawingCanvas` transparent-overlay mode

**Files:**
- Modify: `src/components/nodes/use-drawing-canvas.ts`

**Interfaces:**
- Consumes: `drawingContextSettings(tool, color, opts)` (Task 1).
- Produces: `useDrawingCanvas(canvasRef, opts?: { transparent?: boolean })` and `initDrawingCanvas(el, w, h, opts?: { transparent?: boolean })` — in transparent mode init/clear leave the buffer transparent (no white fill) and strokes use the transparent settings. Default behavior (Draw node) is unchanged.
- Consumed by: Task 7 (annotation canvas).
- Note: no automated test (DOM hook); verified via Task 7.

- [ ] **Step 1: Add the transparent option to `initDrawingCanvas`**

In `src/components/nodes/use-drawing-canvas.ts`, replace `initDrawingCanvas` with:

```ts
export function initDrawingCanvas(
  el: HTMLCanvasElement,
  w: number,
  h: number,
  opts?: { transparent?: boolean },
) {
  el.width = w;
  el.height = h;
  const ctx = el.getContext("2d");
  if (!ctx) return;
  if (opts?.transparent) {
    ctx.clearRect(0, 0, w, h); // transparent overlay — no white fill
  } else {
    fillWhite(ctx, w, h);
  }
}
```

- [ ] **Step 2: Thread the option through the hook**

Change the hook signature and the two call sites (`onPointerMove` settings + `clear`):

```ts
export function useDrawingCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  opts?: { transparent?: boolean },
) {
```

In `onPointerMove`, pass `opts` to the settings call:

```ts
      const s = drawingContextSettings(tool, color, opts);
```

Add `opts` to that callback's dependency array:

```ts
    [toCanvasPoint, tool, color, opts],
  );
```

Replace `clear` so it does not re-fill white in transparent mode:

```ts
  const clear = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    if (!opts?.transparent) fillWhite(ctx, el.width, el.height);
  }, [canvasRef, opts]);
```

- [ ] **Step 3: Type-check & lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (the Draw node calls `useDrawingCanvas(canvasRef)` / `initDrawingCanvas(el, w, h)` with no opts — still valid).

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/use-drawing-canvas.ts
git commit -m "$(printf 'feat(image-edit): useDrawingCanvas transparent-overlay mode\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 7: `ImageGenAnnotationCanvas` component

**Files:**
- Create: `src/components/nodes/image-gen-annotation-canvas.tsx`

**Interfaces:**
- Consumes: `useDrawingCanvas`/`initDrawingCanvas` transparent mode (Task 6), `DRAW_COLORS` (existing).
- Produces: `ImageGenAnnotationCanvas` (forwardRef) with `type AnnotationHandle = { hasMarks: () => boolean; toCompositeBase64: () => Promise<{ base64: string; mime: string } | null>; clear: () => void }` and props `{ baseUrl: string; alt?: string; onMarksChange?: (has: boolean) => void }`. The parent holds a `ref<AnnotationHandle>` (calls `toCompositeBase64()` at edit time) and uses `onMarksChange` to keep a reactive "has annotation" flag so the Final-prompt preview and the sent prompt include the annotation clause.
- Consumed by: Task 9 (focus view Edit tab).
- Note: presentational/DOM; verified visually in Task 9.

- [ ] **Step 1: Create the component**

```tsx
// src/components/nodes/image-gen-annotation-canvas.tsx
"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Eraser, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useDrawingCanvas,
  initDrawingCanvas,
  DRAW_COLORS,
} from "./use-drawing-canvas";

export type AnnotationHandle = {
  hasMarks: () => boolean;
  toCompositeBase64: () => Promise<{ base64: string; mime: string } | null>;
  clear: () => void;
};

type Props = {
  baseUrl: string;
  alt?: string;
  onMarksChange?: (has: boolean) => void;
};

// Load the base image cross-origin so the composited canvas is readable (toDataURL). Base
// images are connected-node images in our storage (spec §7), which serve CORS.
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load base image for annotation"));
    img.src = url;
  });
}

export const ImageGenAnnotationCanvas = forwardRef<AnnotationHandle, Props>(
  function ImageGenAnnotationCanvas({ baseUrl, alt, onMarksChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dirtyRef = useRef(false);
    const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

    const {
      tool,
      setTool,
      color,
      setColor,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerLeave,
      clear,
    } = useDrawingCanvas(canvasRef, { transparent: true });

    // Load the base image to learn its natural size, then size the overlay buffer to match so
    // marks map 1:1 to pixels; CSS scales it to the displayed box (getBoundingClientRect maps
    // pointer coords, so it works at any scale).
    useEffect(() => {
      let cancelled = false;
      void loadImage(baseUrl).then((img) => {
        if (cancelled) return;
        setDims({ w: img.naturalWidth || 1024, h: img.naturalHeight || 1024 });
      });
      return () => {
        cancelled = true;
      };
    }, [baseUrl]);

    // Init the transparent buffer once the canvas element + dims exist.
    const setCanvasRef = useCallback(
      (el: HTMLCanvasElement | null) => {
        canvasRef.current = el;
        if (el && dims) initDrawingCanvas(el, dims.w, dims.h, { transparent: true });
      },
      [dims],
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!dirtyRef.current) {
          dirtyRef.current = true;
          onMarksChange?.(true); // reactive flag so the prompt preview picks up the clause
        }
        onPointerDown(e);
      },
      [onPointerDown, onMarksChange],
    );

    const resetMarks = useCallback(() => {
      clear();
      dirtyRef.current = false;
      onMarksChange?.(false);
    }, [clear, onMarksChange]);

    useImperativeHandle(
      ref,
      () => ({
        hasMarks: () => dirtyRef.current,
        clear: resetMarks,
        toCompositeBase64: async () => {
          const overlay = canvasRef.current;
          if (!overlay || !dirtyRef.current) return null;
          const img = await loadImage(baseUrl);
          const out = document.createElement("canvas");
          out.width = img.naturalWidth;
          out.height = img.naturalHeight;
          const ctx = out.getContext("2d");
          if (!ctx) return null;
          ctx.drawImage(img, 0, 0);
          ctx.drawImage(overlay, 0, 0, out.width, out.height);
          const dataUrl = out.toDataURL("image/png");
          return { base64: dataUrl.split(",")[1] ?? "", mime: "image/png" };
        },
      }),
      [baseUrl, resetMarks],
    );

    return (
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3">
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          {/* Wrapper matches the image aspect so the overlay lines up exactly. */}
          <div
            className="relative max-h-full max-w-full overflow-hidden rounded-xl border border-border bg-muted/20"
            style={dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={baseUrl}
              alt={alt || "Base image"}
              className="block size-full object-contain"
              draggable={false}
            />
            {dims && (
              <canvas
                ref={setCanvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerLeave}
                className="nodrag absolute inset-0 size-full"
                style={{ cursor: "crosshair", touchAction: "none" }}
              />
            )}
          </div>
        </div>

        {/* Tool strip — reuse the Draw node's control cluster styling. */}
        <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
                setTool("pen");
              }}
              className={cn(
                "size-6 rounded-full border border-border transition",
                tool === "pen" && color === c && "ring-2 ring-primary ring-offset-1",
              )}
              style={{ backgroundColor: c }}
              aria-label={`Pen ${c}`}
            />
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => setTool("eraser")}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-md transition hover:bg-muted",
              tool === "eraser" && "ring-2 ring-primary ring-offset-1",
            )}
            aria-label="Eraser"
          >
            <Eraser className="size-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={resetMarks}
            className="inline-flex size-8 items-center justify-center rounded-md text-destructive transition hover:bg-muted"
            aria-label="Clear annotation"
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    );
  },
);
```

- [ ] **Step 2: Type-check & lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/image-gen-annotation-canvas.tsx
git commit -m "$(printf 'feat(image-edit): ImageGenAnnotationCanvas (transparent overlay + composite)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 8: `ImageGenEditReferences` component + Modify chip

**Files:**
- Create: `src/components/nodes/image-gen-edit-references.tsx`
- Modify: `src/components/nodes/image-gen-edit-panel.tsx` (add the Modify chip)

**Interfaces:**
- Produces:
  - `ImageGenEditReferences` with props `{ items: Array<{ id: string; label: string; url: string; isBase: boolean }>; selectedIds: string[]; onToggle: (id: string) => void }` — renders each connected image node as a selectable toggle tile; the base tile is shown as "Base" and is not toggleable.
  - The edit panel's `CHIPS` gains a `modify` entry.
- Consumed by: Task 9 (focus view Edit tab).
- Note: presentational; verified visually in Task 9.

- [ ] **Step 1: Add the Modify chip to the edit panel**

In `src/components/nodes/image-gen-edit-panel.tsx`, extend the `CHIPS` array:

```ts
const CHIPS: Array<{ intent: EditIntent; label: string; starter: string }> = [
  { intent: "remove", label: "Remove", starter: "the cup on the table" },
  { intent: "replace", label: "Replace product", starter: "the bottle on the shelf" },
  { intent: "add", label: "Add product", starter: "it to the scene" },
  { intent: "modify", label: "Modify", starter: "recolor the label to matte black" },
];
```

- [ ] **Step 2: Create the reference-selection component**

```tsx
// src/components/nodes/image-gen-edit-references.tsx
"use client";

import { Check, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type EditReferenceItem = {
  id: string;
  label: string;
  url: string;
  isBase: boolean;
};

type Props = {
  items: EditReferenceItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
};

// Selectable connected-node tiles. Base is shown but not toggleable (it's the image being
// edited, not an extra). Selected extras are sent to the edit route (spec §7).
export function ImageGenEditReferences({ items, selectedIds, onToggle }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <span className="text-eyebrow !text-[0.6rem] text-muted-foreground">
        References for this edit
      </span>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => {
          const selected = it.isBase || selectedIds.includes(it.id);
          return (
            <button
              key={it.id}
              type="button"
              disabled={it.isBase}
              onClick={() => !it.isBase && onToggle(it.id)}
              className={cn(
                "nodrag group relative size-16 overflow-hidden rounded-lg border transition-colors",
                it.isBase
                  ? "border-border opacity-90"
                  : selected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-dashed border-primary/40 hover:bg-primary/5",
              )}
              title={it.isBase ? "Base image (being edited)" : it.label}
            >
              {it.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt={it.label} className="size-full object-cover" />
              ) : (
                <ImageIcon className="m-auto size-5 text-muted-foreground/50" strokeWidth={1.5} />
              )}
              {it.isBase ? (
                <span className="absolute inset-x-0 bottom-0 bg-background/80 py-0.5 text-center text-[0.55rem] font-medium">
                  Base
                </span>
              ) : (
                selected && (
                  <span className="absolute right-1 top-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                )
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check & lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/image-gen-edit-references.tsx src/components/nodes/image-gen-edit-panel.tsx
git commit -m "$(printf 'feat(image-edit): edit-reference toggle tiles + Modify chip\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 9: Wire Edit mode into the focus view

**Files:**
- Modify: `src/components/nodes/image-gen-focus-view.tsx`
- Modify: `src/components/nodes/image-gen-node.tsx`

**Interfaces:**
- Consumes: `ImageGenAnnotationCanvas`/`AnnotationHandle` (Task 7), `ImageGenEditReferences` (Task 8), `selectEditReferenceUrls` (Task 3), route edit branch (Task 5).
- Produces: a working `Generate | Edit` tab flow — annotate the base, mark connected refs, Edit → new active attempt; a connected reference is editable/annotatable with no prior generation.
- Note: no automated test (no component harness); verified manually in Step 8.

- [ ] **Step 1: Pass `editReferenceNodeIds` from the node**

In `src/components/nodes/image-gen-node.tsx`, add the prop to the `<ImageGenFocusView … />` call (next to `editIntent={d.editIntent}`):

```tsx
          editInstruction={d.editInstruction}
          editIntent={d.editIntent}
          editReferenceNodeIds={d.editReferenceNodeIds}
```

- [ ] **Step 2: Add imports + prop to the focus view**

In `src/components/nodes/image-gen-focus-view.tsx`, add imports near the other component/lib imports:

```ts
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ImageGenAnnotationCanvas, type AnnotationHandle } from "./image-gen-annotation-canvas";
import {
  ImageGenEditReferences,
  type EditReferenceItem,
} from "./image-gen-edit-references";
import { selectEditReferenceUrls } from "@/lib/image-gen/edit-prompt";
```

Add `useRef` is already imported. Extend `ImageGenFocusViewProps` (after `editIntent?: EditIntent;`):

```ts
  editReferenceNodeIds?: string[];
```

Add the prop to the destructured parameter list (after `editIntent,`):

```ts
  editIntent,
  editReferenceNodeIds,
  upstream,
```

- [ ] **Step 3: Add Edit-mode state + derived reference items**

After the existing `const [intent, setIntent] = useState<EditIntent>(editIntent ?? "freeform");` line, add:

```ts
  const [activeTab, setActiveTab] = useState<"generate" | "edit">("generate");
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>(
    editReferenceNodeIds ?? [],
  );
  const [hasAnnotation, setHasAnnotation] = useState(false);
  const annotationRef = useRef<AnnotationHandle>(null);
```

Then, right after the existing `const firstConnectedImageUrl = connectedImageUrls[0];` line, add the node-level reference model (needed for tiles + base exclusion):

```ts
  // Connected image NODES (id + url), for the edit-mode reference tiles.
  const connectedImageNodes = upstream
    .filter(
      (u) => (u.type === "file" || u.type === "draw" || u.type === "image-gen") && !!u.fileUrl,
    )
    .map((u) => ({ id: u.id, url: u.fileUrl as string, type: u.type }));

  // Base image shown/annotated in Edit mode: the active attempt, else the first connected image.
  const editBaseUrl = imageUrl ?? firstConnectedImageUrl ?? null;
  const baseNodeId =
    !baseIsAttempt && connectedImageNodes.length > 0 ? connectedImageNodes[0].id : null;

  const referenceItems: EditReferenceItem[] = connectedImageNodes.map((n) => ({
    id: n.id,
    url: n.url,
    label:
      n.type === "draw" ? "Sketch" : n.type === "image-gen" ? "Image reference" : "Image file",
    isBase: n.id === baseNodeId,
  }));
```

Replace the existing `hasExtraReference` derivation so it reflects the *selected* set (find the line `const hasExtraReference = extraReferenceCount > 0;` and the two lines above it defining `extraReferenceCount`, and replace all three with):

```ts
  // Extras = the connected image nodes the user marked (base excluded). Empty selection falls
  // back to "all other connected images" (D27 default) via selectEditReferenceUrls.
  const selectedExtraUrls = selectEditReferenceUrls({
    connected: connectedImageNodes,
    selectedIds: selectedRefIds,
    baseUrl: editBaseUrl ?? undefined,
  });
  const hasExtraReference = selectedExtraUrls.length > 0;
```

- [ ] **Step 4: Add the toggle handler**

Next to `handlePickChip`, add:

```ts
  function handleToggleRef(id: string) {
    setSelectedRefIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      onPatch({ editReferenceNodeIds: next });
      return next;
    });
  }
```

- [ ] **Step 5: Send annotation + chosen refs from `handleEdit`**

Replace the `handleEdit` function body's `fetch` call (the `body: JSON.stringify({ … })` object) so it includes the composite and chosen extras. Replace the whole `async function handleEdit() { … }` with:

```ts
  async function handleEdit() {
    const baseVersionId = activeVersionId ?? undefined;
    const baseImageUrl = baseVersionId ? undefined : firstConnectedImageUrl;
    if (!baseVersionId && !baseImageUrl) {
      toast.error("Generate an image, or connect an image reference, to edit it.");
      return;
    }
    setEditing(true);
    try {
      // Composite the annotation layer (if the user drew anything) into a PNG the route uploads.
      let annotatedBaseImageBase64: string | undefined;
      let annotatedBaseImageMime: string | undefined;
      if (annotationRef.current?.hasMarks()) {
        const composite = await annotationRef.current.toCompositeBase64();
        if (composite) {
          annotatedBaseImageBase64 = composite.base64;
          annotatedBaseImageMime = composite.mime;
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
          ...(annotatedBaseImageBase64
            ? { annotated: true, annotatedBaseImageBase64, annotatedBaseImageMime }
            : {}),
          ...(baseVersionId ? { baseVersionId } : { baseImageUrl }),
        }),
      });
      const json = (await res.json()) as {
        imageUrl?: string;
        versionId?: string;
        error?: string;
      };
      if (!res.ok || !json.imageUrl) throw new Error(json.error ?? "Edit failed");
      onPatch({ parsed: json.imageUrl });
      setActiveVersionId(json.versionId ?? null);
      annotationRef.current?.clear();
      await fetchVersions();
      toast.success("Image edited");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Edit failed");
      await fetchVersions();
    } finally {
      setEditing(false);
    }
  }
```

Also update `finalPrompt` so the preview shows the annotation clause when marks are present. Replace the `composedPrompt` line with:

```ts
  const composedPrompt = editInstr.trim()
    ? buildEditPrompt({
        instruction: editInstr,
        intent,
        hasExtraReference,
        annotated: hasAnnotation,
      })
    : "";
```

- [ ] **Step 6: Add the tab control in the header**

In the header's right-hand button cluster, add the tabs before the Generate `<Button>`. Find `<div className="flex shrink-0 items-center gap-2">` (inside `<header>`) and insert as its first child:

```tsx
              <div className="flex shrink-0 items-center gap-2">
                {canEditBase && (
                  <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as "generate" | "edit")}
                  >
                    <TabsList>
                      <TabsTrigger value="generate">Generate</TabsTrigger>
                      <TabsTrigger value="edit">Edit</TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}
                {versions.length > 0 && (
                  <ImageGenUsagePopover versions={versions} />
                )}
```

(Leave the Generate `<Button>` and the rest of the cluster as-is.)

- [ ] **Step 7: Swap the left/right panels by tab**

**Left panel** — wrap the existing edit panel so it only shows in Edit mode, and add the reference tiles. Replace the existing `{canEditBase && ( <ImageGenEditPanel … /> )}` block with:

```tsx
              {activeTab === "edit" && canEditBase && (
                <div className="space-y-4">
                  <ImageGenEditReferences
                    items={referenceItems}
                    selectedIds={selectedRefIds}
                    onToggle={handleToggleRef}
                  />
                  <ImageGenEditPanel
                    intent={intent}
                    instruction={editInstr}
                    finalPrompt={finalPrompt}
                    editing={editing}
                    canEdit={canEditBase && editable}
                    referenceWarning={referenceWarning}
                    suggestGemini={suggestGemini}
                    onPickChip={handlePickChip}
                    onInstructionChange={handleInstructionChange}
                    onInstructionBlur={handleInstructionBlur}
                    onFinalPromptChange={setPromptOverride}
                    onEdit={handleEdit}
                  />
                </div>
              )}
```

**Right panel** — render the annotation canvas in Edit mode, else the current image view. Wrap the existing `<div className="mt-3 flex-1 min-h-0"> … </div>` block (the one containing the `mode === "skeleton" | "empty" | "result"` branches) by replacing its opening with a tab check. Replace `<div className="mt-3 flex-1 min-h-0">` and its immediate first child guard so Edit mode short-circuits to the annotation canvas:

```tsx
              <div className="mt-3 flex-1 min-h-0">
                {activeTab === "edit" && editBaseUrl && !editing ? (
                  <ImageGenAnnotationCanvas
                    ref={annotationRef}
                    baseUrl={editBaseUrl}
                    alt={title || "Base image"}
                    onMarksChange={setHasAnnotation}
                  />
                ) : (
                  <>
                    {mode === "skeleton" && (
```

Then close the fragment: find the matching end of that inner content (immediately before the closing `</div>` that ends `<div className="mt-3 flex-1 min-h-0">`) and add `</>` so the ternary's else-branch is wrapped. Concretely, the `{mode === "result" && imageUrl && ( … )}` block is the last child; after it, change:

```tsx
                )}
              </div>
```

to:

```tsx
                )}
                  </>
                )}
              </div>
```

- [ ] **Step 8: Type-check, lint, manual verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Then `npm run dev` and verify all four scenarios:
1. **Tabs:** open a generated Image Gen node → `Generate | Edit` tabs appear; Generate tab is unchanged.
2. **Annotate a generated attempt:** Edit tab → draw a red circle on the image → pick **Remove**/type an instruction → the Final prompt preview shows the guides-only clause → **Edit image** → a new attempt appears and becomes active; the change is localized to the marked area; the marks are not visible in the output.
3. **Mark references:** connect a File image (a product) → Edit tab shows it as a toggle tile → check it → **Replace product** → Edit → the product is swapped in; unchecking it removes it from the edit.
4. **Edit a connected reference with no attempt:** connect a File image, never generate → Edit tab shows that image as the base (annotatable), reference tiles show it as **Base** → Remove/annotate → Edit → the first attempt is created in this node's log.

- [ ] **Step 9: Commit**

```bash
git add src/components/nodes/image-gen-focus-view.tsx src/components/nodes/image-gen-node.tsx
git commit -m "$(printf 'feat(image-edit): Generate|Edit tabs — annotation + reference selection\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 10: Full-suite green + spec checkoff

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all suites pass, including `draw-canvas.test.ts` (Task 1), `edit-prompt.test.ts` (Tasks 2–3), `canvas-nodes.test.ts` (Task 4); existing suites unchanged-green.

- [ ] **Step 2: Type-check + lint the whole project**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Spec coverage pass**

Re-read `docs/superpowers/specs/2026-07-05-image-edit-mode-design.md` §§5–11 and confirm each is implemented: `editReferenceNodeIds` (T4), `modify` + `annotated` clause (T2), reference selection (T3/T8), transparent eraser (T1/T6), route extras + annotation branch + breadcrumbs (T5), Generate|Edit tabs + annotation canvas + base-from-connected (T7/T9), both entry points (T9). Note any gap and add a follow-up task.

- [ ] **Step 4: Commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "$(printf 'chore(image-edit): suite green + spec checkoff\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Out of scope (deferred refinements)

- **One-click "Edit this image" on the File/clipper node** that pre-wires the connection and opens the Edit tab — a convenience over the existing connect step (spec §11), not a new edit path.
- **Persisting the annotation marks** across sessions — v1 marks are ephemeral; the composite is recorded per attempt for reproducibility (spec §8.3).
- **Pixel-mask / brush-region precision, style transfer, multi-scene composition** (spec §3).
- **A shadcn `Checkbox` primitive** — if the registry gains one later, the toggle tiles can migrate; tiles are intentionally image-thumbnails here (more useful than a bare checkbox for picking references).
```