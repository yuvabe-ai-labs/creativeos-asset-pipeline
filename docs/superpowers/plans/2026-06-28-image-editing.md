# Image Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a designer apply targeted edits (remove / replace / add an element) to an existing image — a generated attempt or an uploaded reference — producing a new, fully-traceable attempt in the Image Gen node's version log.

**Architecture:** An edit is the **existing generate pipeline with one substitution** (spec §4.1, ADR D3): the same route, `config.generate`, upload, `insertVersion`/`setActiveVersion`, and attempts/eval UI — only the *prompt* is built by a new pure `buildEditPrompt` (a preservation instruction over a base image) instead of the upstream Prompt node. The base image is the node's current image: a prior attempt (`baseVersionId`) or a connected reference (`baseImageUrl`). No new node type, no second route, no schema migration.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), React 19, Zustand, Supabase (Postgres + Storage), Gemini/OpenAI image providers, Vitest, Tailwind v4 + shadcn (Base UI).

**Spec:** `docs/superpowers/specs/2026-06-28-image-editing-design.md` · **ADR:** D27 in `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7.

## Global Constraints

- **No DB migration.** All new provenance goes into the existing `node_versions.inputs_used` JSONB and `nodes.data` JSONB.
- **Reuse, don't add cases (spec §4.1).** No new node type, no second route, no node-spawning/auto-wiring action. Editing an uploaded image reuses the existing *connect-image-to-Image-Gen* workflow.
- **Trace ≠ resend (spec §6).** Record `promptVersionId` on every edit; never resend the base prompt text to the edit model.
- **Deterministic scaffold server-side (spec §6).** The preservation wrapper lives in `buildEditPrompt`; the instruction box holds only the human *delta*; the UI shows a read-only composed-prompt preview (PRD §12 / D3).
- **shadcn only, never native controls** (`src/components/ui/*`, Base UI) — use `Textarea`, `Button`. Yuvabe design system: dashed-border primary chips for "add"-style actions; purple used sparingly; Lucide icons at 1.5 stroke.
- **3 edit intents surfaced as chips:** Remove · Replace product · Add product. A 4th `freeform` intent = typing with no chip. No "Modify" chip (shares the change/remove template with Remove).
- **Default editing model = Gemini** (suggest, don't block — D9/D21). Detect by `provider === "gemini"`, never by hardcoded model id (the registry vs client-model ids are inconsistent in the repo).
- **Test command:** `npm test` (Vitest `vitest run`). Pure logic gets failing-test-first TDD (Tasks 1–3, 5). The repo has **no route/component test harness** (all existing tests are pure-lib units), so the route and UI tasks (4, 6, 7, 8) keep their logic in tested pure helpers and are verified manually via `npm run dev` — do **not** introduce a mocking harness.
- **Commit after every task.** Conventional commit messages, ending with the `Co-Authored-By` trailer used on this branch.
- **Branch:** `feat/image-editing` (already checked out; the spec/ADR commits are already there).

---

### Task 1: `buildEditPrompt` — pure preservation-prompt builder

**Files:**
- Create: `src/lib/image-gen/edit-prompt.ts`
- Test: `src/lib/image-gen/__tests__/edit-prompt.test.ts`

**Interfaces:**
- Produces: `type EditIntent = "remove" | "replace" | "add" | "freeform"` and `buildEditPrompt({ instruction: string; intent?: EditIntent; hasExtraReference?: boolean }): string`.
- Consumed by: Task 4 (route), Task 7 (focus-view preview).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/image-gen/__tests__/edit-prompt.test.ts
import { describe, it, expect } from "vitest";
import { buildEditPrompt } from "../edit-prompt";

describe("buildEditPrompt", () => {
  it("remove → change/remove template, interpolates the instruction", () => {
    const p = buildEditPrompt({ instruction: "the cup on the table", intent: "remove" });
    expect(p).toContain("change only the cup on the table");
    expect(p).toContain("Keep everything else exactly the same");
    expect(p).not.toContain("reference image");
  });

  it("freeform → change/remove template", () => {
    const p = buildEditPrompt({ instruction: "make the sky warmer", intent: "freeform" });
    expect(p).toContain("change only make the sky warmer");
  });

  it("replace → add/replace template referencing the additional image", () => {
    const p = buildEditPrompt({ instruction: "the bottle", intent: "replace", hasExtraReference: true });
    expect(p).toContain("Using the first image as the base scene");
    expect(p).toContain("additional reference image");
  });

  it("add → add/replace template", () => {
    const p = buildEditPrompt({ instruction: "the product", intent: "add", hasExtraReference: true });
    expect(p).toContain("Using the first image as the base scene");
  });

  it("falls back to hasExtraReference when intent is absent", () => {
    expect(buildEditPrompt({ instruction: "x", hasExtraReference: true })).toContain("base scene");
    expect(buildEditPrompt({ instruction: "x", hasExtraReference: false })).toContain("change only x");
  });

  it("trims the instruction and leaves no placeholder", () => {
    const p = buildEditPrompt({ instruction: "  the logo  ", intent: "remove" });
    expect(p).toContain("change only the logo.");
    expect(p).not.toContain("{instruction}");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/image-gen/__tests__/edit-prompt.test.ts`
Expected: FAIL — `Failed to resolve import "../edit-prompt"` / `buildEditPrompt is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/image-gen/edit-prompt.ts
// Pure edit-request construction. NO "server-only" import — also imported by the
// client focus view to render the composed-prompt preview (spec §6 / D3).

export type EditIntent = "remove" | "replace" | "add" | "freeform";

// The preservation behavior is carried entirely by prompt phrasing (Gemini image-editing
// guide). `intent` picks the template; `hasExtraReference` is the fallback when intent is
// absent. The scaffolding is deterministic so it stays a stable eval variable (spec §6).
export function buildEditPrompt(input: {
  instruction: string;
  intent?: EditIntent;
  hasExtraReference?: boolean;
}): string {
  const instruction = input.instruction.trim();
  const useReferenceTemplate =
    input.intent === "replace" || input.intent === "add"
      ? true
      : input.intent === "remove" || input.intent === "freeform"
        ? false
        : Boolean(input.hasExtraReference);

  if (useReferenceTemplate) {
    return (
      `Using the first image as the base scene, ${instruction} using the product shown in ` +
      `the additional reference image(s). Match the scene's lighting, perspective, and shadows. ` +
      `Keep everything else in the base image unchanged.`
    );
  }
  return (
    `Using the provided image, change only ${instruction}. Keep everything else exactly the ` +
    `same — preserve the original style, lighting, composition, and all other elements.`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/image-gen/__tests__/edit-prompt.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-gen/edit-prompt.ts src/lib/image-gen/__tests__/edit-prompt.test.ts
git commit -m "$(printf 'feat(image-edit): add buildEditPrompt preservation-prompt helper\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: `assembleEditReferences` — pure base+extras ordering

**Files:**
- Modify: `src/lib/image-gen/edit-prompt.ts`
- Test: `src/lib/image-gen/__tests__/edit-prompt.test.ts`

**Interfaces:**
- Produces: `assembleEditReferences({ baseImageUrl: string; extraUrls: string[]; max: number }): string[]` — base first, dedup the base out of extras, clamp to `max` (≥1).
- Consumed by: Task 4 (route).

- [ ] **Step 1: Write the failing test (append to the same test file)**

```ts
// append to src/lib/image-gen/__tests__/edit-prompt.test.ts
import { assembleEditReferences } from "../edit-prompt";

describe("assembleEditReferences", () => {
  it("puts the base image first", () => {
    expect(assembleEditReferences({ baseImageUrl: "base", extraUrls: ["a", "b"], max: 5 }))
      .toEqual(["base", "a", "b"]);
  });

  it("dedups the base out of the extras", () => {
    expect(assembleEditReferences({ baseImageUrl: "base", extraUrls: ["base", "a"], max: 5 }))
      .toEqual(["base", "a"]);
  });

  it("clamps to max (base always kept)", () => {
    expect(assembleEditReferences({ baseImageUrl: "base", extraUrls: ["a", "b", "c"], max: 2 }))
      .toEqual(["base", "a"]);
    expect(assembleEditReferences({ baseImageUrl: "base", extraUrls: ["a"], max: 0 }))
      .toEqual(["base"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/image-gen/__tests__/edit-prompt.test.ts`
Expected: FAIL — `assembleEditReferences is not a function`.

- [ ] **Step 3: Write minimal implementation (append to `edit-prompt.ts`)**

```ts
// append to src/lib/image-gen/edit-prompt.ts
// Ordered reference list for an edit: base image first (Gemini treats the first image as the
// scene to preserve), then the other connected references, deduped and clamped (spec §7).
export function assembleEditReferences(input: {
  baseImageUrl: string;
  extraUrls: string[];
  max: number;
}): string[] {
  const extras = input.extraUrls.filter((u) => u !== input.baseImageUrl);
  return [input.baseImageUrl, ...extras].slice(0, Math.max(1, input.max));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/image-gen/__tests__/edit-prompt.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-gen/edit-prompt.ts src/lib/image-gen/__tests__/edit-prompt.test.ts
git commit -m "$(printf 'feat(image-edit): add assembleEditReferences (base-first, deduped, clamped)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: `editInstruction` / `editIntent` on `ImageGenNodeData`

**Files:**
- Modify: `src/lib/canvas-nodes.ts:56-61` (the `ImageGenNodeData` type)
- Test: `src/lib/canvas-nodes.test.ts`

**Interfaces:**
- Produces: `ImageGenNodeData.editInstruction?: string` and `ImageGenNodeData.editIntent?: EditIntent`. `flowToPersisted` already spreads `data` (minus `parsed`), so both persist via autosave with no other change.
- Consumed by: Task 7 (focus view reads/writes them).

- [ ] **Step 1: Write the failing test (append to `src/lib/canvas-nodes.test.ts`)**

```ts
// append to src/lib/canvas-nodes.test.ts
import type { AppNode } from "./canvas-nodes";

describe("flowToPersisted (image-gen edit fields)", () => {
  it("persists editInstruction and editIntent, drops parsed", () => {
    const node = {
      id: "img1",
      type: "image-gen",
      position: { x: 0, y: 0 },
      data: {
        title: "Hero",
        editInstruction: "remove the cup",
        editIntent: "remove",
        parsed: "https://example.com/x.png",
      },
    } as unknown as AppNode;

    const persisted = flowToPersisted(node);
    expect((persisted.data as { editInstruction?: string }).editInstruction).toBe("remove the cup");
    expect((persisted.data as { editIntent?: string }).editIntent).toBe("remove");
    expect((persisted.data as { parsed?: unknown }).parsed).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: FAIL — TypeScript error: `editIntent` is not assignable / `editInstruction` not a known property of `ImageGenNodeData` (Vitest type-checks on import).

- [ ] **Step 3: Add the fields**

In `src/lib/canvas-nodes.ts`, add an import at the top (near the other `import type` lines):

```ts
import type { EditIntent } from "@/lib/image-gen/edit-prompt";
```

Then change the `ImageGenNodeData` type (currently lines 56-61) to:

```ts
export type ImageGenNodeData = {
  title?: string;
  modelId?: string;                   // e.g. "openai:gpt-image-2" — saved on node
  params?: Record<string, unknown>;   // last-used param values for selected model
  parsed?: unknown;                   // D19: active version output (image URL, display only — never persisted)
  editInstruction?: string;           // current edit instruction (the delta), persisted; snapshotted per attempt
  editIntent?: EditIntent;            // selected edit action (remove/replace/add/freeform)
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas-nodes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-nodes.test.ts
git commit -m "$(printf 'feat(image-edit): add editInstruction/editIntent to ImageGenNodeData\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: Route edit branch + `getVersionById`

**Files:**
- Modify: `src/lib/db/versions.ts` (add `getVersionById`)
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts` (full rewrite below)

**Interfaces:**
- Consumes: `buildEditPrompt`, `assembleEditReferences`, `EditIntent` (Tasks 1–2); `getUpstreamOutputs` (existing); `insertVersion`/`setActiveVersion` (existing).
- Produces: `getVersionById(versionId: string): Promise<NodeVersionRow | null>`. Route accepts body `{ modelId?, params?, instruction?, intent?, baseVersionId? | baseImageUrl? }`; when `instruction` is non-empty it runs the edit branch, else the unchanged fresh-generation branch.
- Note: **no automated test** (no route harness in the repo); the edit logic lives in the Task 1–2 pure helpers which are tested. Verified manually in Step 4.

- [ ] **Step 1: Add `getVersionById` to `src/lib/db/versions.ts`**

Append this export (after `listVersions`):

```ts
// Fetch a single version row by id — used by the image-edit route to resolve the base
// image (output) and carry forward its promptVersionId breadcrumb (spec §5).
export async function getVersionById(versionId: string): Promise<NodeVersionRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("node_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw error;
  return (data as NodeVersionRow | null) ?? null;
}
```

- [ ] **Step 2: Rewrite the image-generate route**

Replace the entire contents of `src/app/api/nodes/[id]/image-generate/route.ts` with:

```ts
import { createServerSupabase } from "@/lib/supabase/server";
import { getUpstreamOutputs } from "@/lib/db/nodes";
import { insertVersion, setActiveVersion, getVersionById } from "@/lib/db/versions";
import { imageGenRegistry, DEFAULT_MODEL_ID } from "@/lib/image-gen/registry";
import {
  buildEditPrompt,
  assembleEditReferences,
  type EditIntent,
} from "@/lib/image-gen/edit-prompt";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { NODE_FILE_BUCKET } from "@/lib/nodes/file-constants";

function mimeToExt(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

const EDIT_INTENTS: readonly EditIntent[] = ["remove", "replace", "add", "freeform"];
function asIntent(v: unknown): EditIntent | undefined {
  return typeof v === "string" && (EDIT_INTENTS as readonly string[]).includes(v)
    ? (v as EditIntent)
    : undefined;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const body = (await req.json().catch(() => null)) as
    | {
        modelId?: unknown;
        params?: unknown;
        instruction?: unknown;
        intent?: unknown;
        baseVersionId?: unknown;
        baseImageUrl?: unknown;
      }
    | null;

  const modelId = typeof body?.modelId === "string" ? body.modelId : DEFAULT_MODEL_ID;
  const config = imageGenRegistry[modelId];
  if (!config) return apiError(`Unknown modelId: ${modelId}`, 400);

  const parseResult = config.schema.safeParse(body?.params ?? {});
  if (!parseResult.success) {
    return apiError(`Invalid params: ${parseResult.error.message}`, 400);
  }
  const validatedParams = parseResult.data as Record<string, unknown>;

  const upstream = await getUpstreamOutputs(nodeId);

  // All connected image URLs (File images, Draw sketches, other Image Gen outputs).
  const connectedImageUrls = upstream
    .filter((u) => {
      if (u.type === "image-gen") return typeof u.activeOutput === "string";
      if (u.type === "file") {
        const d = u.data as Record<string, unknown>;
        return d.fileKind === "image" && typeof d.fileUrl === "string";
      }
      if (u.type === "draw") {
        const d = u.data as Record<string, unknown>;
        return typeof d.fileUrl === "string";
      }
      return false;
    })
    .map((u) =>
      u.type === "image-gen"
        ? (u.activeOutput as string)
        : ((u.data as Record<string, unknown>).fileUrl as string),
    );

  const promptNode = upstream.find((u) => u.type === "prompt");
  const instruction =
    typeof body?.instruction === "string" ? body.instruction.trim() : "";
  const isEdit = instruction.length > 0;

  let prompt: string;
  let referenceUrls: string[];
  let inputsUsed: Record<string, unknown>;

  if (isEdit) {
    // Base image = the node's current image: a prior attempt or a connected reference.
    const baseVersionId =
      typeof body?.baseVersionId === "string" ? body.baseVersionId : undefined;
    let baseImageUrl: string | undefined;
    let carriedPromptVersionId: string | null = null;

    if (baseVersionId) {
      const baseVersion = await getVersionById(baseVersionId);
      if (typeof baseVersion?.output === "string") baseImageUrl = baseVersion.output;
      const prevInputs = (baseVersion?.inputs_used ?? {}) as { promptVersionId?: string };
      carriedPromptVersionId = prevInputs.promptVersionId ?? null;
    } else if (typeof body?.baseImageUrl === "string") {
      baseImageUrl = body.baseImageUrl;
      carriedPromptVersionId = promptNode?.versionId ?? null;
    }
    if (!baseImageUrl) return apiError("No base image to edit.", 400);

    const extraReferenceUrls = connectedImageUrls.filter((u) => u !== baseImageUrl);
    referenceUrls = assembleEditReferences({
      baseImageUrl,
      extraUrls: extraReferenceUrls,
      max: config.maxReferenceImages,
    });
    const intent = asIntent(body?.intent) ?? "freeform";
    prompt = buildEditPrompt({
      instruction,
      intent,
      hasExtraReference: extraReferenceUrls.length > 0,
    });
    inputsUsed = {
      promptVersionId: carriedPromptVersionId,
      baseVersionId: baseVersionId ?? null,
      intent,
      instruction,
      extraReferenceUrls,
    };
  } else {
    // Fresh generation (unchanged): requires a connected Prompt node with output.
    if (!promptNode?.activeOutput) {
      return apiError("No connected Prompt node with output found.", 400);
    }
    prompt = String(promptNode.activeOutput);
    referenceUrls = connectedImageUrls.slice(0, config.maxReferenceImages);
    inputsUsed = {
      promptNodeId: promptNode.nodeId,
      promptVersionId: promptNode.versionId,
      referenceImageUrls: referenceUrls,
    };
  }

  try {
    const result = await config.generate({ prompt, referenceUrls, params: validatedParams });

    const supabase = createServerSupabase();
    const ext = mimeToExt(result.mimeType);
    const versionFileId = crypto.randomUUID();
    const storagePath = `image-gen/${nodeId}/${versionFileId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(NODE_FILE_BUCKET)
      .upload(storagePath, Buffer.from(result.imageBase64, "base64"), {
        contentType: result.mimeType,
        upsert: false,
      });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: publicData } = supabase.storage
      .from(NODE_FILE_BUCKET)
      .getPublicUrl(storagePath);
    const imageUrl = publicData.publicUrl;

    const version = await insertVersion({
      nodeId,
      inputsUsed,
      paramsUsed: { modelId, ...validatedParams, tokensUsed: result.tokensUsed },
      modelUsed: modelId,
      output: imageUrl,
    });
    await setActiveVersion(nodeId, version.id);

    return apiOk({ imageUrl, versionId: version.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Image generation failed";
    await insertVersion({
      nodeId,
      paramsUsed: { modelId, ...validatedParams },
      modelUsed: modelId,
      error: message,
    }).catch(() => null);
    return apiError(message, 500);
  }
}
```

- [ ] **Step 3: Type-check & lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual verification (fresh path still works + edit path)**

Run: `npm run dev`. In the app: open a canvas with a Prompt → Image Gen chain, click **Generate** — confirm a fresh image still appears (regression check). Then (after Task 7 ships the UI) re-verify the edit path. For now, confirm the route compiles and the fresh path is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/versions.ts "src/app/api/nodes/[id]/image-generate/route.ts"
git commit -m "$(printf 'feat(image-edit): route edit branch (base + instruction -> new attempt)\n\nResolve base from baseVersionId or connected baseImageUrl, build the edit\nprompt via buildEditPrompt, record baseVersionId/intent/instruction/\npromptVersionId breadcrumbs. Fresh-generation path unchanged.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: Surface edit breadcrumbs in the versions summary

**Files:**
- Modify: `src/app/api/nodes/[id]/versions/route.ts:25-40` (the `versions.map(...)` block)
- Modify: `src/components/nodes/image-gen-version-history.tsx:7-19` (the `ImageGenVersionSummary` type)

**Interfaces:**
- Produces: each version summary gains `inputsUsed?: { baseVersionId?: string | null; instruction?: string; intent?: string }`.
- Consumed by: Task 8 (lineage display in the version history).
- Note: no automated test (these are mapping/serialization changes; verified via Task 8's manual check).

- [ ] **Step 1: Extend the versions route mapping**

In `src/app/api/nodes/[id]/versions/route.ts`, inside `versions: rows.map((v) => ({ ... }))`, add one field (after the `note:` line):

```ts
      note: typeof v.note === "string" ? v.note : null,
      inputsUsed: (v.inputs_used ?? {}) as {
        baseVersionId?: string | null;
        instruction?: string;
        intent?: string;
      },
```

- [ ] **Step 2: Extend the `ImageGenVersionSummary` type**

In `src/components/nodes/image-gen-version-history.tsx`, add to the `ImageGenVersionSummary` type (after `note: string | null;`):

```ts
  inputsUsed?: {
    baseVersionId?: string | null;
    instruction?: string;
    intent?: string;
  };
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/nodes/[id]/versions/route.ts" src/components/nodes/image-gen-version-history.tsx
git commit -m "$(printf 'feat(image-edit): expose edit breadcrumbs in the versions summary\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: `ImageGenEditPanel` presentational component

**Files:**
- Create: `src/components/nodes/image-gen-edit-panel.tsx`

**Interfaces:**
- Produces: `ImageGenEditPanel` (default-less named export) with props:
  ```ts
  type ImageGenEditPanelProps = {
    intent: EditIntent;
    instruction: string;
    composedPrompt: string;     // buildEditPrompt(...) output for the preview ("" hides it)
    editing: boolean;
    canEdit: boolean;           // a base image is available
    referenceWarning: boolean;  // replace/add chosen but no extra reference connected
    suggestGemini: boolean;     // selected model is not a Gemini editing model
    onPickChip: (intent: EditIntent, starter: string) => void;
    onInstructionChange: (v: string) => void;
    onInstructionBlur: () => void;
    onEdit: () => void;
  };
  ```
- Consumed by: Task 7 (focus view).
- Note: presentational; verified visually in Task 7.

- [ ] **Step 1: Create the component**

```tsx
// src/components/nodes/image-gen-edit-panel.tsx
"use client";

import { Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EditIntent } from "@/lib/image-gen/edit-prompt";

// 3 chips over 2 server templates (spec §1.1/§10). "freeform" = typing with no chip.
const CHIPS: Array<{ intent: EditIntent; label: string; starter: string }> = [
  { intent: "remove", label: "Remove", starter: "the cup on the table" },
  { intent: "replace", label: "Replace product", starter: "the bottle, using the connected product reference" },
  { intent: "add", label: "Add product", starter: "the connected product reference into the scene" },
];

export type ImageGenEditPanelProps = {
  intent: EditIntent;
  instruction: string;
  composedPrompt: string;
  editing: boolean;
  canEdit: boolean;
  referenceWarning: boolean;
  suggestGemini: boolean;
  onPickChip: (intent: EditIntent, starter: string) => void;
  onInstructionChange: (v: string) => void;
  onInstructionBlur: () => void;
  onEdit: () => void;
};

export function ImageGenEditPanel({
  intent,
  instruction,
  composedPrompt,
  editing,
  canEdit,
  referenceWarning,
  suggestGemini,
  onPickChip,
  onInstructionChange,
  onInstructionBlur,
  onEdit,
}: ImageGenEditPanelProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
        <span className="text-eyebrow">Edit this image</span>
      </div>

      {/* Quick-action chips — dashed-border primary chips (AGENTS.md) */}
      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.intent}
            type="button"
            onClick={() => onPickChip(c.intent, c.starter)}
            className={cn(
              "nodrag inline-flex items-center rounded-full border border-dashed border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/5",
              intent === c.intent && "border-solid bg-primary/10",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <Textarea
        value={instruction}
        onChange={(e) => onInstructionChange(e.target.value)}
        onBlur={onInstructionBlur}
        rows={2}
        placeholder="remove the cup… · replace the bottle with the product reference… · add the product…"
        className="nodrag resize-none text-sm"
      />

      {referenceWarning && (
        <div className="flex items-start gap-1.5 text-[0.7rem] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" strokeWidth={1.5} />
          <span>
            “{intent === "replace" ? "Replace" : "Add"} product” works best with a product
            reference image connected to this node.
          </span>
        </div>
      )}

      {suggestGemini && (
        <p className="text-[0.7rem] text-muted-foreground">
          Tip: Gemini (Nano Banana) models give the most faithful edits — switch the model in
          Output settings.
        </p>
      )}

      {composedPrompt && (
        <div className="rounded-md border border-border bg-muted/30 p-2">
          <p className="text-eyebrow mb-1 !text-[0.6rem]">Final prompt</p>
          <p className="text-xs leading-snug text-muted-foreground">{composedPrompt}</p>
        </div>
      )}

      <Button
        onClick={onEdit}
        disabled={editing || !canEdit || !instruction.trim()}
        className="w-full"
      >
        <Sparkles className="size-4" strokeWidth={1.5} />
        {editing ? "Editing…" : "Edit image"}
      </Button>

      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          Generate an image, or connect an image reference, to edit it.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check & lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/image-gen-edit-panel.tsx
git commit -m "$(printf 'feat(image-edit): add ImageGenEditPanel (chips + instruction + preview)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 7: Wire the edit panel into the focus view + node passthrough

**Files:**
- Modify: `src/components/nodes/image-gen-focus-view.tsx`
- Modify: `src/components/nodes/image-gen-node.tsx`

**Interfaces:**
- Consumes: `ImageGenEditPanel` (Task 6), `buildEditPrompt`/`EditIntent` (Task 1), the route edit branch (Task 4).
- Produces: a working in-app edit flow (chips → instruction → Edit → new active attempt).
- Note: no automated test (no component harness); verified manually in Step 7.

- [ ] **Step 1: Pass the node's edit fields into the focus view**

In `src/components/nodes/image-gen-node.tsx`, add the two props to the `<ImageGenFocusView … />` call (alongside `modelId={d.modelId}`):

```tsx
        <ImageGenFocusView
          open={focusOpen}
          onOpenChange={setFocusOpen}
          nodeId={id}
          title={title}
          imageUrl={imageUrl}
          modelId={d.modelId}
          params={d.params}
          editInstruction={d.editInstruction}
          editIntent={d.editIntent}
          upstream={upstream}
          onPatch={(patch) => updateNodeData(id, patch)}
        />
```

- [ ] **Step 2: Extend the focus-view props type**

In `src/components/nodes/image-gen-focus-view.tsx`, add to `ImageGenFocusViewProps` (after `params?: Record<string, unknown>;`):

```ts
  editInstruction?: string;
  editIntent?: import("@/lib/image-gen/edit-prompt").EditIntent;
```

- [ ] **Step 3: Add imports and destructure the new props**

Add imports near the other component/lib imports:

```ts
import { ImageGenEditPanel } from "./image-gen-edit-panel";
import { buildEditPrompt, type EditIntent } from "@/lib/image-gen/edit-prompt";
```

Add `editInstruction` and `editIntent` to the destructured `ImageGenFocusView({ … })` parameter list (after `params,`):

```ts
  params,
  editInstruction,
  editIntent,
  upstream,
  onPatch,
```

- [ ] **Step 4: Add edit state + derived base/reference values**

Inside the component, after the existing `const [generating, setGenerating] = useState(false);` line, add:

```ts
  const [editing, setEditing] = useState(false);
  const [editInstr, setEditInstr] = useState(editInstruction ?? "");
  const [intent, setIntent] = useState<EditIntent>(editIntent ?? "freeform");

  // Connected image URLs (file/draw/image-gen all expose fileUrl in `upstream`).
  const connectedImageUrls = upstream
    .filter((u) => (u.type === "file" || u.type === "draw" || u.type === "image-gen") && !!u.fileUrl)
    .map((u) => u.fileUrl as string);
  const firstConnectedImageUrl = connectedImageUrls[0];

  // Base = the node's current image: the active attempt if present, else a connected image.
  const baseIsAttempt = Boolean(activeVersionId);
  const canEditBase = baseIsAttempt || Boolean(firstConnectedImageUrl);
  // Extras = the other connected images (the "product to add"). When the base is itself a
  // connected image, it's not also an extra.
  const extraReferenceCount = baseIsAttempt
    ? connectedImageUrls.length
    : Math.max(0, connectedImageUrls.length - 1);
  const hasExtraReference = extraReferenceCount > 0;

  const composedPrompt = editInstr.trim()
    ? buildEditPrompt({ instruction: editInstr, intent, hasExtraReference })
    : "";
  const referenceWarning =
    (intent === "replace" || intent === "add") && !hasExtraReference;
  const suggestGemini = model.provider !== "gemini";
```

- [ ] **Step 5: Add the chip / instruction / edit handlers**

Add these functions next to `handleGenerate`:

```ts
  function handlePickChip(nextIntent: EditIntent, starter: string) {
    setIntent(nextIntent);
    if (!editInstr.trim()) {
      setEditInstr(starter);
      onPatch({ editIntent: nextIntent, editInstruction: starter });
    } else {
      onPatch({ editIntent: nextIntent });
    }
  }

  function handleInstructionChange(v: string) {
    setEditInstr(v);
  }

  function handleInstructionBlur() {
    onPatch({ editInstruction: editInstr });
  }

  async function handleEdit() {
    const baseVersionId = activeVersionId ?? undefined;
    const baseImageUrl = baseVersionId ? undefined : firstConnectedImageUrl;
    if (!baseVersionId && !baseImageUrl) {
      toast.error("Generate an image, or connect an image reference, to edit it.");
      return;
    }
    setEditing(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/image-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          params: paramValues,
          instruction: editInstr,
          intent,
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

- [ ] **Step 6: Render the panel in the left column**

In the left panel `<div className="w-[40%] …">`, add the edit panel as the **first** child when a base is available (just before the `{versions.length > 0 && (<ImageGenVersionHistory …`):

```tsx
            {canEditBase && (
              <ImageGenEditPanel
                intent={intent}
                instruction={editInstr}
                composedPrompt={composedPrompt}
                editing={editing}
                canEdit={canEditBase}
                referenceWarning={referenceWarning}
                suggestGemini={suggestGemini}
                onPickChip={handlePickChip}
                onInstructionChange={handleInstructionChange}
                onInstructionBlur={handleInstructionBlur}
                onEdit={handleEdit}
              />
            )}

            {versions.length > 0 && (
```

- [ ] **Step 7: Type-check, lint, manual verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Then `npm run dev` and verify all three scenarios:
1. **Edit a generated attempt:** generate an image → "Edit this image" panel appears → click **Remove**, the box pre-fills, edit the text → preview updates → **Edit image** → a new attempt appears in History and becomes active.
2. **Add a product:** connect a File image (the product) → click **Add product** → Edit → the product appears composited; the reference warning is absent.
3. **Edit an uploaded reference (no attempt):** connect a File image, no prior generation → the panel is available with the connected image as base → Remove an element → Edit → first attempt is created in this node's log.

- [ ] **Step 8: Commit**

```bash
git add src/components/nodes/image-gen-focus-view.tsx src/components/nodes/image-gen-node.tsx
git commit -m "$(printf 'feat(image-edit): wire edit panel into the Image Gen focus view\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 8: Edit lineage in the version history

**Files:**
- Modify: `src/components/nodes/image-gen-version-history.tsx`

**Interfaces:**
- Consumes: `ImageGenVersionSummary.inputsUsed` (Task 5).
- Produces: each edit row shows "edited from vN" + its instruction.
- Note: no automated test; verified visually in Step 3.

- [ ] **Step 1: Compute a versionId → label map and render lineage**

In `ImageGenVersionHistory`, just after `const total = versions.length;`, add a label map:

```ts
  // versionId → "vN" label, so an edit can name the version it was derived from.
  const labelById = new Map(versions.map((v, i) => [v.id, `v${total - i}`]));
```

Then, in the row body, after the existing `{modelLabel && ( … )}` block (still inside the `<button>`), add:

```tsx
                  {v.inputsUsed?.baseVersionId && (
                    <p className="ml-3.5 mt-0.5 text-[0.65rem] leading-snug text-primary/70">
                      edited from {labelById.get(v.inputsUsed.baseVersionId) ?? "an earlier version"}
                    </p>
                  )}
                  {v.inputsUsed?.instruction && (
                    <p className="ml-3.5 mt-0.5 line-clamp-1 text-[0.7rem] leading-snug text-muted-foreground">
                      “{v.inputsUsed.instruction}”
                    </p>
                  )}
```

- [ ] **Step 2: Type-check & lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual verify**

`npm run dev` → run a 2–3 step edit chain (generate → remove → add) → confirm History shows each edit row with "edited from vN" and the instruction text, and Restore still steps back through the chain.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/image-gen-version-history.tsx
git commit -m "$(printf 'feat(image-edit): show edit lineage (edited-from + instruction) in history\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 9: Full-suite green + spec checkoff

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all suites pass, including the new `edit-prompt.test.ts` and the extended `canvas-nodes.test.ts`; `registry.test.ts`, `cost.test.ts`, `canvas-store.test.ts` unchanged-green.

- [ ] **Step 2: Type-check + lint the whole project**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Spec coverage pass**

Re-read `docs/superpowers/specs/2026-06-28-image-editing-design.md` §§5–11 and confirm each is implemented: data fields (T3), breadcrumbs (T4), `buildEditPrompt` templates (T1), reference ordering (T2), route branch (T4), 3-chip UI + preview + base resolution (T6/T7), both entry points (T7), lineage display (T5/T8). Note any gap and add a follow-up task.

- [ ] **Step 4: Commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "$(printf 'chore(image-edit): suite green + spec checkoff\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Out of scope (deferred refinements)

- **Explicit "set as base" picker** when several images are connected and there's no attempt — v1 uses the first connected image as base (spec §7 default). Add a base-marker on the connected-inputs card later if designers need it.
- **One-click "Edit this image" affordance on the File/Draw node** that pre-wires the connection — a convenience over the existing connect step (spec §11), not a new edit path.
- **Masking / brush regions, style transfer, multi-scene composition** (spec §3).
