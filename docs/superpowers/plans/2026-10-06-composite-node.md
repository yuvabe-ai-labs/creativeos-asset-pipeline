# Composite Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Composite canvas node that makes a UGC shot's picture in one step — avatar, background and product references in (all optional), an `@`-mention instruction typed on the node, one image (a frame or a multi-angle sheet) out.

**Architecture:** A new node type `composite` registered like every other node. Its generate route copies `image-generate`'s pipeline (validate → generation row → reserve → provider → upload → version → settle) and differs only in where the prompt comes from: a pure reference roster (`src/lib/composite/references.ts`) numbers the wired images — an avatar contributes its front image and its fresh profile sheet as two entries, exactly as D308's `presenterUpstreamRows` does for a shot — and a pure prompt builder (`src/prompts/composite-generate.ts`) wraps the operator's resolved instruction in a fixed rule block. Downstream nodes learn that a composite's output is an image through one shared predicate, `isGeneratedImageType`.

**Tech Stack:** Next.js (App Router) route handlers, React 19 + React Flow (`@xyflow/react`), Zustand canvas store, TanStack Query, shadcn/Base UI primitives, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-composite-node-design.md` (rewritten 2026-10-06) · **ADR:** D309 in `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7.

## Global Constraints

- Every interactive control is a shadcn primitive from `src/components/ui/*` (Base UI — compose with `render`, never `asChild`). No raw `<button>`, `<input>`, `<textarea>`, `<select>`.
- Do not change the Image Gen node's behaviour. Shared Image Gen components may gain **optional** props whose defaults leave Image Gen exactly as it is.
- Do not change the Avatar node or D299's presenter path (`src/lib/avatars/presenter*.ts`).
- API routes use `apiError` / `apiOk` / `withNode` from `src/lib/api/route-helpers.ts` — never `NextResponse.json`.
- Import, don't redefine: `SEEDANCE_FACE_MODEL_ID` from `src/lib/avatars/constants.ts`; `refDisplayName` from `src/lib/nodes/ref-binding.ts`; `mentionDialect` from `src/lib/nodes/prompt-token-dialect.ts`.
- With an avatar wired, the model is `SEEDANCE_FACE_MODEL_ID` — enforced in the route, not only the picker.
- Icons: Lucide only, `strokeWidth={1.5}`. Brand purple only through `primary` tokens. Motion easing `cubic-bezier(0.22,1,0.36,1)`.
- One component per file, named exports, split at ~200 lines (`docs/component-structure.md`).
- Worktree: run everything from `.claude/worktrees/composite-node`. Run `npm install` first — the branch was rebased onto a much newer staging.
- Run Vitest on single files while iterating (`npx vitest run <file>`); never run Vitest in parallel with `tsc` (memory: parallel runs produce timeout bursts that are not regressions).

## Review Focus

1. **Type, then Generate at once.** The canvas autosaves on a delay, so the server's `node.data.instruction` can lag what is on screen. The client sends the instruction in the request body and the route prefers it (Task 5, test "uses the instruction from the request body over the stored one").
2. **More images than the model takes.** Seedream Lite takes 14; an avatar counts as two. The route refuses with a count — it never slices, because slicing would shift every later "image N" the instruction resolved to (Task 5, test "refuses more images than the model takes, without slicing").
3. **A stale client or a copilot call sends another model while an avatar is wired.** The route overrides nothing silently: it refuses with 400 (Task 5, test "refuses a model other than the lock while an avatar is wired").
4. **An avatar whose profile sheet is stale.** Only the front is sent, and numbering of the images after it stays correct (Task 3, test "skips a stale sheet and keeps later numbering right").
5. **A composite wired into Video Gen.** It is a reference, not a start frame — `assign-image-roles` and `video-gen-image-roles` deliberately keep promoting only `image-gen` (Task 2, test "a composite defaults to reference, never start_frame").

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/lib/composite/model.ts` (new) | default model, the avatar lock, its reason text | 1 |
| `src/lib/canvas-nodes.ts` | `CompositeNodeData`, union member, `VALID_CONNECTIONS` | 1 |
| `src/lib/canvas-store.ts` | creation defaults | 1 |
| `src/lib/nodes/node-output.ts` | `case "composite"` | 1 |
| `src/lib/nodes/describe-node.ts` | identity text + ref-handle abbreviation | 1 |
| `src/lib/nodes/image-node-types.ts` (new) | `isGeneratedImageType` — the one "is this a generated image?" answer | 2 |
| ~15 consumers (listed in Task 2) | use the predicate instead of `=== "image-gen"` | 2 |
| `src/lib/composite/references.ts` (new) | the numbered roster (one image per entry, D308's avatar rows), mention resolution, dangling mentions | 3 |
| `src/prompts/composite-generate.ts` (new) | the prompt the image model receives | 4 |
| `src/lib/image-gen/utils.ts` | `mimeToExt` extracted (second caller) | 5 |
| `src/lib/composite/load-inputs.ts` (new, server-only) | upstream rows + avatars → roster, or the reason it can't run | 5 |
| `src/app/api/nodes/[id]/composite-generate/route.ts` (new) | the generate route | 5 |
| `src/lib/composite/upstream-items.ts` (new) | browser: wired inputs → rail items + `@` mentionables | 6 |
| `src/components/nodes/image-gen-output-settings.tsx`, `…-body.tsx` | optional `modelLock`, `missingInputReason` props | 6 |
| `src/hooks/use-composite-upstream.ts` (new) | store + avatars → upstream items | 6 |
| `src/hooks/use-composite-versions.ts` (new) | versions fetch, generate, restore | 6 |
| `src/components/nodes/composite-node.tsx` (new) | the card | 6 |
| `src/components/nodes/composite-focus-view.tsx` (new) | the focus view | 6 |
| `src/lib/canvas-node-options.ts`, `quick-add-menu.tsx`, `canvas.tsx` | add-menu entry `C`, icon, `nodeTypes` | 6 |
| spec + ADR | sync §3.1 to what was built | 7 |

---

### Task 1: Register the `composite` node type

**Files:**
- Create: `src/lib/composite/model.ts`
- Create: `src/lib/composite/__tests__/model.test.ts`
- Modify: `src/lib/canvas-nodes.ts` (types near `ImageGenNodeData`; `AppNode` union ~line 255; `VALID_CONNECTIONS` ~line 276)
- Modify: `src/lib/canvas-store.ts:117-145` (`defaultData`)
- Modify: `src/lib/nodes/node-output.ts:34`
- Modify: `src/lib/nodes/describe-node.ts:42` and `NODE_ABBREV`
- Test: `src/lib/canvas-nodes.test.ts`, `src/lib/nodes/node-output.test.ts`

**Interfaces:**
- Produces: `CompositeNodeData` type; `COMPOSITE_DEFAULT_MODEL_ID: string`; `COMPOSITE_MODEL_LOCK_REASON: string`; `compositeModelLock(hasAvatar: boolean): string | null`; `resolveCompositeModelId(requested: string | undefined, hasAvatar: boolean): string`.

- [ ] **Step 1: Write the failing tests**

`src/lib/composite/__tests__/model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SEEDANCE_FACE_MODEL_ID } from "@/lib/avatars/constants";
import {
  COMPOSITE_DEFAULT_MODEL_ID,
  compositeModelLock,
  resolveCompositeModelId,
} from "../model";

describe("composite model (D309)", () => {
  it("defaults to the model Seedance takes faces from", () => {
    expect(COMPOSITE_DEFAULT_MODEL_ID).toBe(SEEDANCE_FACE_MODEL_ID);
  });

  it("locks to the Seedance face model only while an avatar is wired", () => {
    expect(compositeModelLock(true)).toBe(SEEDANCE_FACE_MODEL_ID);
    expect(compositeModelLock(false)).toBeNull();
  });

  it("an avatar overrides the stored model; without one the stored model wins", () => {
    expect(resolveCompositeModelId("gemini:gemini-3-pro-image", true)).toBe(SEEDANCE_FACE_MODEL_ID);
    expect(resolveCompositeModelId("gemini:gemini-3-pro-image", false)).toBe("gemini:gemini-3-pro-image");
    expect(resolveCompositeModelId(undefined, false)).toBe(COMPOSITE_DEFAULT_MODEL_ID);
  });
});
```

Append to `src/lib/canvas-nodes.test.ts`, and **replace** the existing `"D298 — an avatar connects to a script and to nothing else"` test (line ~144) with the D309 version below:

```ts
describe("D309 — composite connections", () => {
  it("an avatar connects to a script and a composite, and nothing else", () => {
    expect(canConnect("avatar", "script")).toBe(true);
    expect(canConnect("avatar", "composite")).toBe(true);
    expect(canConnect("avatar", "video-gen")).toBe(false);
    expect(canConnect("avatar", "prompt")).toBe(false);
    expect(canConnect("avatar", "image-gen")).toBe(false);
    expect(canConnect("script", "avatar")).toBe(false);
  });

  it("every image source feeds a composite", () => {
    for (const source of ["file", "draw", "image-gen", "composite", "avatar"]) {
      expect(canConnect(source, "composite")).toBe(true);
    }
    for (const source of ["text", "prompt", "script", "video-gen"]) {
      expect(canConnect(source, "composite")).toBe(false);
    }
  });

  it("a composite goes everywhere an Image Gen still goes", () => {
    for (const target of ["prompt", "video-gen", "video-prompt", "multishot-prompt", "shot", "post"]) {
      expect(canConnect("image-gen", target)).toBe(true);
      expect(canConnect("composite", target)).toBe(true);
    }
    expect(canConnect("composite", "composite")).toBe(true);
    expect(canConnect("composite", "image-gen")).toBe(false);
  });
});
```

Append to `src/lib/nodes/node-output.test.ts` inside `describe("getNodeOutput", …)`:

```ts
  it("returns a composite's active image URL, like image-gen (D309)", () => {
    expect(
      getNodeOutput({ type: "composite", data: {}, activeOutput: " https://cdn/c.png " }),
    ).toBe("https://cdn/c.png");
    expect(getNodeOutput({ type: "composite", data: {}, activeOutput: null })).toBe("");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/composite/__tests__/model.test.ts src/lib/canvas-nodes.test.ts src/lib/nodes/node-output.test.ts`
Expected: FAIL — `Cannot find module '../model'`; `canConnect("avatar", "composite")` false; composite output `""`.

- [ ] **Step 3: Implement**

`src/lib/composite/model.ts`:

```ts
import { SEEDANCE_FACE_MODEL_ID } from "@/lib/avatars/constants";

// D309 — which image model a composite is made with. A composite with an avatar in it is a new
// picture of that avatar's face, and Seedance accepts a face only from SEEDANCE_FACE_MODEL_ID
// (D290) — so while an avatar is wired the model is locked to it. Imported, never restated: if
// the avatar's face model changes, the composite follows.

export const COMPOSITE_DEFAULT_MODEL_ID = SEEDANCE_FACE_MODEL_ID;

export const COMPOSITE_MODEL_LOCK_REASON =
  "Made with Seedream so Seedance and Gemini Omni accept it.";

/** The model a composite must use, or null when the operator may choose. */
export function compositeModelLock(hasAvatar: boolean): string | null {
  return hasAvatar ? SEEDANCE_FACE_MODEL_ID : null;
}

/** The model a composite generates with: the lock, else the stored choice, else the default. */
export function resolveCompositeModelId(requested: string | undefined, hasAvatar: boolean): string {
  return compositeModelLock(hasAvatar) ?? requested ?? COMPOSITE_DEFAULT_MODEL_ID;
}
```

In `src/lib/canvas-nodes.ts`, after `ImageGenNodeData`:

```ts
/** D309 — a shot's picture made in one step: wired references in, an instruction typed here,
 *  one image out. The instruction stores references as `@[Label](nodeId)` chips (D272). */
export type CompositeNodeData = {
  title?: string;
  instruction?: string;
  /** Seedream by default; locked to SEEDANCE_FACE_MODEL_ID while an avatar is wired. */
  modelId?: string;
  params?: Record<string, unknown>;
  parsed?: unknown; // D19: active version output (image URL) — display only, never persisted
};
```

Add `| Node<CompositeNodeData, "composite">` to `AppNode` after the `image-gen` member. In `VALID_CONNECTIONS`, change these rows (keep the others):

```ts
  // D298 — an avatar presents a script. D309 — and is placed into a composite: the wire says
  // "this picture contains this person". Its face reaches shots through the script (D299).
  avatar:             ["script", "composite"],
  file:               ["prompt", "image-gen", "video-prompt", "multishot-prompt", "video-gen", "shot", "post", "composite"],
  draw:               ["prompt", "image-gen", "video-prompt", "multishot-prompt", "video-gen", "shot", "post", "composite"],
  "image-gen":        ["prompt", "video-gen", "video-prompt", "multishot-prompt", "shot", "post", "composite"],
  // D309 — a composite is a reference image: Image Gen's outputs, plus another composite (a
  // location sheet made first becomes the background of an avatar composite).
  composite:          ["prompt", "video-gen", "video-prompt", "multishot-prompt", "shot", "post", "composite"],
```

In `src/lib/canvas-store.ts` `defaultData`, add (import `COMPOSITE_DEFAULT_MODEL_ID` from `@/lib/composite/model`):

```ts
    case "composite":
      return { title: "", modelId: COMPOSITE_DEFAULT_MODEL_ID };
```

In `src/lib/nodes/node-output.ts`, make the `image-gen` case cover both:

```ts
    case "image-gen":
    case "composite":
      // Output is a public image URL; downstream nodes receive it as a URL string
      return typeof node.activeOutput === "string" ? node.activeOutput.trim() : "";
```

In `src/lib/nodes/describe-node.ts`, after `case "image-gen":` add:

```ts
    case "composite":
      return snippet(d.instruction) || "composite";
```

and add `composite: "CMP",` to `NODE_ABBREV`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/composite/__tests__/model.test.ts src/lib/canvas-nodes.test.ts src/lib/nodes/node-output.test.ts`
Expected: PASS. Then `npx tsc --noEmit` — expected clean (no consumer switches on `AppNode["type"]` exhaustively; if one does, add a `"composite"` branch mirroring `"image-gen"`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/composite src/lib/canvas-nodes.ts src/lib/canvas-nodes.test.ts src/lib/canvas-store.ts src/lib/nodes/node-output.ts src/lib/nodes/node-output.test.ts src/lib/nodes/describe-node.ts
git commit -m "feat(composite): register the composite node type and its connections (D309)"
```

---

### Task 2: One answer to "is this a generated image?"

Every reader that treats an upstream as an image compares against `"image-gen"`. A composite's output is an image too, so without this task it is wired into Video Gen, Motion Prompt, Multishot and Post and silently ignored.

**Files:**
- Create: `src/lib/nodes/image-node-types.ts`
- Create: `src/lib/nodes/__tests__/image-node-types.test.ts`
- Modify (server): `src/lib/nodes/compose-message.ts:40`, `src/lib/nodes/resolve-mention-tokens.ts:22`, `src/lib/nodes/resolve-inputs.ts:20,119`, `src/lib/nodes/shot-compose.ts:49-53`, `src/lib/db/eval.ts:79`, `src/app/api/nodes/[id]/video-generate/route.ts:205`, `src/app/api/nodes/[id]/upstream-images/route.ts:67,79`
- Modify (browser): `src/components/nodes/add-connection.tsx:19`, `connected-inputs-card.tsx:78,199,248`, `mention-instruction-editor.tsx:64,71,206,215,306`, `multishot-prompt-node.tsx:28,90,96`, `post-node.tsx:47`, `prompt-node.tsx:25,59,70`, `shot-compose-sheet.tsx:95`, `video-prompt-node.tsx:28,55,61`
- **Deliberately not modified:** `src/lib/video-gen/assign-image-roles.ts:78` and `src/components/nodes/video-gen-image-roles.tsx:37` (a composite is a reference, never auto-promoted to start frame — D281); `upstream-images/route.ts:25` and the Image Gen node's own files (they ask about the node itself, not an upstream).
- Test: `src/lib/nodes/__tests__/compose-message.test.ts`, `src/lib/nodes/__tests__/image-node-types.test.ts`, `src/lib/video-gen/__tests__/auto-assign-image-roles.test.ts`

**Interfaces:**
- Produces: `GENERATED_IMAGE_TYPES: readonly string[]`; `isGeneratedImageType(type: string | null | undefined): boolean`.

- [ ] **Step 1: Write the failing tests**

`src/lib/nodes/__tests__/image-node-types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isGeneratedImageType } from "../image-node-types";
import { resolveMentionTokens } from "../resolve-mention-tokens";
import { selectImageUpstreams } from "../shot-compose";

describe("isGeneratedImageType (D309)", () => {
  it("is true for image-gen and composite only", () => {
    expect(isGeneratedImageType("image-gen")).toBe(true);
    expect(isGeneratedImageType("composite")).toBe(true);
    for (const t of ["file", "draw", "avatar", "prompt", "video-gen", "", undefined, null]) {
      expect(isGeneratedImageType(t)).toBe(false);
    }
  });

  it("a composite mention resolves positionally, like an Image Gen still", () => {
    const out = resolveMentionTokens("put @[Composite: Office](c1) in", [
      { nodeId: "c1", type: "composite", text: "", fileUrl: "https://cdn/c.png", fileKind: "image" },
    ]);
    expect(out).toBe("put the first image in");
  });

  it("the shot composer picks up a composite's image", () => {
    const picked = selectImageUpstreams([
      { nodeId: "c1", type: "composite", data: {}, activeOutput: "https://cdn/c.png", versionId: "v1" },
    ]);
    expect(picked.map((p) => p.fileUrl)).toEqual(["https://cdn/c.png"]);
  });
});
```

Append to `src/lib/nodes/__tests__/compose-message.test.ts` inside the existing `describe`:

```ts
  it("treats a composite upstream WITH a fileUrl as a vision part (D309)", () => {
    const up: UpstreamPreview[] = [
      { ...base, type: "composite", fileUrl: "https://x/c.png", fileKind: "image" },
    ];
    expect(buildUserContent("PROMPT", up)).toContainEqual({
      type: "image_url",
      image_url: { url: "https://x/c.png", detail: "auto" },
    });
  });
```

For Review Focus 5, append to `src/lib/video-gen/__tests__/auto-assign-image-roles.test.ts` (it already imports `autoAssignImageRoles`):

```ts
describe("D309 — a composite is a reference", () => {
  it("a composite defaults to reference, never start_frame, even on a no-reference model", () => {
    const roles = autoAssignImageRoles(
      [{ nodeId: "c1", url: "https://cdn/c.png", type: "composite" }],
      {},
      { supportsStartFrame: true, supportsReferences: false },
    );
    expect(roles.c1).toBe("reference");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/image-node-types.test.ts src/lib/nodes/__tests__/compose-message.test.ts`
Expected: FAIL — module not found; composite not treated as vision. (The assign-image-roles test already passes — it pins current behaviour so this task does not change it.)

- [ ] **Step 3: Implement the predicate**

`src/lib/nodes/image-node-types.ts`:

```ts
// D309 — node types whose output IS an image: a URL in the active version (hydrated into
// `data.parsed` in the browser, D19). Every reader asking "is this upstream a generated image?"
// imports this instead of comparing against "image-gen", so a new image-producing node is one
// entry here rather than twenty call sites — the composite was nearly ignored by all of them.
export const GENERATED_IMAGE_TYPES: readonly string[] = ["image-gen", "composite"];

export function isGeneratedImageType(type: string | null | undefined): boolean {
  return typeof type === "string" && GENERATED_IMAGE_TYPES.includes(type);
}
```

- [ ] **Step 4: Replace each consumer check**

Add `import { isGeneratedImageType } from "@/lib/nodes/image-node-types";` to each file below, then apply exactly these edits:

| File:line | Before | After |
|---|---|---|
| `compose-message.ts:40` | `if (u.type === "image-gen" && hasImageUrl) return true;` | `if (isGeneratedImageType(u.type) && hasImageUrl) return true;` |
| `resolve-mention-tokens.ts:22` | `if (u.type === "image-gen" && hasUrl) return true;` | `if (isGeneratedImageType(u.type) && hasUrl) return true;` |
| `resolve-inputs.ts:119` | `if (u.type === "image-gen") {` | `if (isGeneratedImageType(u.type)) {` |
| `resolve-inputs.ts:20` (label map) | `"image-gen": "Image",` | `"image-gen": "Image",` then a new line `composite: "Composite",` |
| `shot-compose.ts:49` | `if (u.type === "image-gen") {` | `if (isGeneratedImageType(u.type)) {` |
| `shot-compose.ts:52` | `label: "Image", type: "image-gen",` | `label: u.type === "composite" ? "Composite" : "Image", type: u.type,` |
| `db/eval.ts:79` | `if (type === "image-gen" && typeof activeOutput === "string")` | `if (isGeneratedImageType(type) && typeof activeOutput === "string")` |
| `video-generate/route.ts:205` | `node.type === "image-gen" &&` | `isGeneratedImageType(node.type) &&` |
| `upstream-images/route.ts:67` | `u.type === "image-gen" &&` | `isGeneratedImageType(u.type) &&` |
| `upstream-images/route.ts:79` | `imageUrl: u.type === "image-gen"` | `imageUrl: isGeneratedImageType(u.type)` |
| `add-connection.tsx:19` | `if (node.type === "image-gen") return …` | `if (isGeneratedImageType(node.type)) return …` (rest of the line unchanged) |
| `connected-inputs-card.tsx:78` | `(u.type === "image-gen" \|\|` | `(isGeneratedImageType(u.type) \|\|` |
| `connected-inputs-card.tsx:199` | `(node.type === "image-gen" \|\|` | `(isGeneratedImageType(node.type) \|\|` |
| `connected-inputs-card.tsx:248` (`NodeIcon`) | — | add above the image-gen line: `if (type === "composite") return <Combine className="size-3 shrink-0 text-primary" strokeWidth={1.5} />;` and import `Combine` from `lucide-react` |
| `mention-instruction-editor.tsx:64` (`nodeTypeLabel`) | — | add `if (type === "composite") return "Composite";` and `if (type === "avatar") return "Avatar";` |
| `mention-instruction-editor.tsx:71` (`NodeIcon`) | `if (type === "image-gen") return <ImageIcon …/>;` | `if (isGeneratedImageType(type)) return <ImageIcon className="size-3 shrink-0" />;` |
| `mention-instruction-editor.tsx:206` | `upstream.type === "image-gen"` | `isGeneratedImageType(upstream.type)` |
| `mention-instruction-editor.tsx:215` | `typeKey === "image-gen" \|\|` | `isGeneratedImageType(typeKey) \|\|` |
| `mention-instruction-editor.tsx:306` | `.filter((u) => u.type === "image-gen" \|\| u.type === "draw" \|\| u.type === "file")` | `.filter((u) => isGeneratedImageType(u.type) \|\| u.type === "draw" \|\| u.type === "file")` |
| `multishot-prompt-node.tsx:90` and `:96` | `n.type === "image-gen"` | `isGeneratedImageType(n.type)` |
| `multishot-prompt-node.tsx:28`, `prompt-node.tsx:25`, `video-prompt-node.tsx:28` (TYPE_LABEL maps) | `"image-gen": "Image",` | `"image-gen": "Image", composite: "Composite",` |
| `post-node.tsx:47` | `n.type === "image-gen"` | `isGeneratedImageType(n.type)` |
| `prompt-node.tsx:59` and `:70` | `n.type === "image-gen"` | `isGeneratedImageType(n.type)` |
| `shot-compose-sheet.tsx:95` | `n.type === "image-gen"` | `isGeneratedImageType(n.type)` |
| `video-prompt-node.tsx:55` and `:61` | `n.type === "image-gen"` | `isGeneratedImageType(n.type)` |

Leave the existing comments next to each edited line in place, and update any that say "Image Gen still" to "generated image (Image Gen or Composite)". Line numbers are from `610d66ea`; if one has drifted, find it by the "Before" text.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/nodes src/lib/video-gen src/app/api/nodes`
Expected: PASS (all — this is a behaviour-preserving change for `image-gen`). Then `npx tsc --noEmit` and `npx eslint src/lib/nodes src/components/nodes src/app/api/nodes src/lib/db/eval.ts` — expected clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nodes src/lib/db/eval.ts src/lib/video-gen src/app/api/nodes src/components/nodes
git commit -m "refactor(nodes): one predicate for 'a generated image'; composite counts (D309)"
```

---

### Task 3: The composite's reference roster

Pure. Turns the composite's upstream rows into an ordered, numbered roster and resolves the instruction's `@`-chips against it.

> **Follows D308's convention, not the spec's first draft.** D308 (landed 2026-10-06) already decided how an avatar's two images travel: the front under the Avatar node's own id, the profile sheet as a **separate** virtual row under `avatarSheetId(avatarNodeId)` (`"<id>:sheet"`), each its own chip ("Riya", "Riya sheet"), built by `presenterUpstreamRows` (`src/lib/avatars/presenter.ts`) and mirrored in the browser by `useMentionUpstream`. The composite reuses exactly that, so every roster entry is one image and nothing in shared `ref-binding.ts` changes. The server loader (Task 5) expands each avatar row with `presenterUpstreamRows` **before** the roster sees it; this module recognises those rows by `data.presenter` (`true` = front, `"sheet"` = sheet).

**Files:**
- Create: `src/lib/composite/references.ts`
- Test: `src/lib/composite/__tests__/references.test.ts`

**Interfaces:**
- Consumes: `UpstreamOutput` (`@/lib/db/nodes`), `RefImageMeta` (`@/lib/image-gen/validate`), `isGeneratedImageType` (Task 2), `refDisplayName` (`@/lib/nodes/ref-binding`), `mentionDialect` (`@/lib/nodes/prompt-token-dialect`).
- Produces:
  - `type CompositeRefRole = "avatar" | "avatar-sheet" | "image"`
  - `type CompositeRef = { nodeId: string; name: string; role: CompositeRefRole; image: RefImageMeta; position: number }` — `position` is 1-based in the request's reference list
  - `compositeRefs(ups: readonly UpstreamOutput[]): CompositeRef[]` — avatar rows must already be expanded
  - `referenceImagesOf(refs: CompositeRef[]): RefImageMeta[]`
  - `resolveCompositeMentions(instruction: string, refs: CompositeRef[]): string`
  - `danglingMentions(instruction: string, refs: CompositeRef[]): string[]` — display names
  - `danglingMentionMessage(names: string[]): string`

- [ ] **Step 1: Write the failing tests**

`src/lib/composite/__tests__/references.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { UpstreamOutput } from "@/lib/db/nodes";
import type { Avatar, AvatarImage } from "@/lib/avatars/schema";
import { presenterUpstreamRows } from "@/lib/avatars/presenter";
import { avatarSheetId } from "@/lib/video-gen/select-references";
import {
  compositeRefs,
  referenceImagesOf,
  resolveCompositeMentions,
  danglingMentions,
  danglingMentionMessage,
} from "../references";

const img = (url: string): AvatarImage => ({
  url,
  width: 1024,
  height: 1024,
  sizeBytes: 2048,
  source: { kind: "upload", filename: "f.png", uploadedBy: "u", uploadedAt: "t" },
});
const RIYA = { name: "Riya", front: img("https://cdn/front.png"), sheet: img("https://cdn/sheet.png"), sheetStale: false } as Avatar;

const row = (nodeId: string, type: string, data: Record<string, unknown>, activeOutput: unknown = null): UpstreamOutput =>
  ({ nodeId, type, data, activeOutput, versionId: null });

// What the loader hands the roster: the avatar row already expanded, D308's way.
const AVATAR_ROWS = presenterUpstreamRows("n-av", RIYA);
const SANDALS = row("n-file", "file", { fileKind: "image", fileUrl: "https://cdn/sandals.png", filename: "Sandals.png", fileSizeBytes: 10 });
const OFFICE = row("n-cmp", "composite", { title: "Office sheet" }, "https://cdn/office.png");

describe("compositeRefs (D309)", () => {
  it("numbers one image per entry, in upstream order; the avatar's front then its sheet", () => {
    const refs = compositeRefs([...AVATAR_ROWS, SANDALS, OFFICE]);
    expect(refs.map((r) => [r.nodeId, r.name, r.role, r.position])).toEqual([
      ["n-av", "Riya", "avatar", 1],
      [avatarSheetId("n-av"), "Riya sheet", "avatar-sheet", 2],
      ["n-file", "Sandals.png", "image", 3],
      ["n-cmp", "Office sheet", "image", 4],
    ]);
    expect(referenceImagesOf(refs).map((i) => i.url)).toEqual([
      "https://cdn/front.png",
      "https://cdn/sheet.png",
      "https://cdn/sandals.png",
      "https://cdn/office.png",
    ]);
  });

  it("skips a stale sheet and keeps later numbering right", () => {
    const rows = presenterUpstreamRows("n-av", { ...RIYA, sheetStale: true });
    const refs = compositeRefs([...rows, SANDALS]);
    expect(refs.map((r) => r.role)).toEqual(["avatar", "image"]);
    expect(refs[1].position).toBe(2);
  });

  it("ignores rows that carry no image: text, a document file, an ungenerated still", () => {
    expect(
      compositeRefs([
        row("t", "text", { text: "hi" }),
        row("d", "file", { fileKind: "document", fileUrl: "https://cdn/a.pdf" }),
        row("g", "image-gen", {}, null),
      ]),
    ).toEqual([]);
  });

  it("carries size metadata for validation", () => {
    const [sandals] = referenceImagesOf(compositeRefs([SANDALS]));
    expect(sandals).toMatchObject({ url: "https://cdn/sandals.png", filename: "Sandals.png", fileSizeBytes: 10 });
  });
});

describe("resolveCompositeMentions", () => {
  const refs = compositeRefs([...AVATAR_ROWS, SANDALS]);

  it("turns chips into names with their image positions", () => {
    expect(
      resolveCompositeMentions(
        `@[Avatar: Riya](n-av) holding @[File: Sandals.png](n-file), dressed as in @[Avatar: Riya sheet](${avatarSheetId("n-av")})`,
        refs,
      ),
    ).toBe("Riya (image 1) holding Sandals.png (image 3), dressed as in Riya sheet (image 2)");
  });

  it("leaves plain text alone", () => {
    expect(resolveCompositeMentions("a bright bedroom, four angles", refs)).toBe("a bright bedroom, four angles");
  });
});

describe("danglingMentions", () => {
  const refs = compositeRefs([SANDALS]);

  it("names each chip whose node is no longer wired, once", () => {
    expect(
      danglingMentions("@[Avatar: Riya](gone) and @[Avatar: Riya](gone) with @[File: Sandals.png](n-file)", refs),
    ).toEqual(["Riya"]);
  });

  it("says what to do about them", () => {
    expect(danglingMentionMessage(["Riya"])).toBe(
      "'Riya' is mentioned in the instruction but no longer connected — reconnect it or remove the mention.",
    );
    expect(danglingMentionMessage(["Riya", "Office"])).toBe(
      "'Riya' and 'Office' are mentioned in the instruction but no longer connected — reconnect them or remove the mentions.",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/composite/__tests__/references.test.ts`
Expected: FAIL — `Cannot find module '../references'`.

- [ ] **Step 3: Implement**

`src/lib/composite/references.ts`:

```ts
import type { UpstreamOutput } from "@/lib/db/nodes";
import type { RefImageMeta } from "@/lib/image-gen/validate";
import { isGeneratedImageType } from "@/lib/nodes/image-node-types";
import { mentionDialect } from "@/lib/nodes/prompt-token-dialect";
import { refDisplayName } from "@/lib/nodes/ref-binding";

// D309 — the composite's reference roster. The image model gets one flat list of URLs, so every
// wired image is numbered by its position in that list and the instruction's chips resolve to
// those numbers. An avatar arrives already expanded into D308's rows — its front under the Avatar
// node's id, its fresh profile sheet under avatarSheetId — so each entry is exactly one image.
// Pure: the route and the tests feed it rows; nothing here reads the database.

export type CompositeRefRole = "avatar" | "avatar-sheet" | "image";

export type CompositeRef = {
  nodeId: string;
  name: string;
  role: CompositeRefRole;
  image: RefImageMeta;
  /** 1-based position in the request's reference list. */
  position: number;
};

const MENTION = mentionDialect();

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

/** One upstream row as a roster entry, or null when it carries no image. */
function entryOf(u: UpstreamOutput): Omit<CompositeRef, "position"> | null {
  const d = u.data;
  const meta = {
    filename: str(d.filename),
    fileSizeBytes: num(d.fileSizeBytes),
    imageWidth: num(d.imageWidth),
    imageHeight: num(d.imageHeight),
  };
  if (isGeneratedImageType(u.type)) {
    const url = str(u.activeOutput);
    if (!url) return null;
    const fallback = u.type === "composite" ? "Composite" : "Image";
    return { nodeId: u.nodeId, name: str(d.title) ?? fallback, role: "image", image: { url, ...meta } };
  }
  if (u.type !== "file" && u.type !== "draw") return null;
  const url = str(d.fileUrl);
  if (!url || (u.type === "file" && d.fileKind !== "image")) return null;
  // D308's avatar rows are file rows flagged `presenter`: true for the front, "sheet" for the sheet.
  if (d.presenter === true || d.presenter === "sheet") {
    const avatarName = str(d.title) ?? "Avatar";
    return d.presenter === true
      ? { nodeId: u.nodeId, name: avatarName, role: "avatar", image: { url, ...meta } }
      : { nodeId: u.nodeId, name: `${avatarName} sheet`, role: "avatar-sheet", image: { url, ...meta } };
  }
  const fallback = u.type === "draw" ? "Sketch" : "File";
  return {
    nodeId: u.nodeId,
    name: str(d.title) ?? str(d.filename) ?? fallback,
    role: "image",
    image: { url, ...meta },
  };
}

/** The upstream rows that carry an image, in order, each with its position. */
export function compositeRefs(ups: readonly UpstreamOutput[]): CompositeRef[] {
  const refs: CompositeRef[] = [];
  for (const u of ups) {
    const entry = entryOf(u);
    if (entry) refs.push({ ...entry, position: refs.length + 1 });
  }
  return refs;
}

/** Every image the request carries, in roster order. */
export function referenceImagesOf(refs: CompositeRef[]): RefImageMeta[] {
  return refs.map((r) => r.image);
}

/** The instruction with each chip replaced by its name and image position. */
export function resolveCompositeMentions(instruction: string, refs: CompositeRef[]): string {
  if (!instruction.includes("@[")) return instruction;
  const byId = new Map(refs.map((r) => [r.nodeId, r]));
  return MENTION.parse(instruction)
    .map((s) => {
      if (s.kind === "text") return s.text;
      const ref = byId.get(s.id);
      const name = refDisplayName(s.label);
      return ref ? `${name} (image ${ref.position})` : name;
    })
    .join("");
}

/** Names of the chips whose node is no longer in the roster, each once, in first-seen order. */
export function danglingMentions(instruction: string, refs: CompositeRef[]): string[] {
  const wired = new Set(refs.map((r) => r.nodeId));
  const names: string[] = [];
  for (const s of MENTION.parse(instruction)) {
    if (s.kind !== "mention" || wired.has(s.id)) continue;
    const name = refDisplayName(s.label);
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

export function danglingMentionMessage(names: string[]): string {
  const quoted = names.map((n) => `'${n}'`);
  if (quoted.length === 1) {
    return `${quoted[0]} is mentioned in the instruction but no longer connected — reconnect it or remove the mention.`;
  }
  const list = `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
  return `${list} are mentioned in the instruction but no longer connected — reconnect them or remove the mentions.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/composite/__tests__/references.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/composite/references.ts src/lib/composite/__tests__/references.test.ts
git commit -m "feat(composite): number the wired references, avatar front and sheet as D308 does (D309)"
```

---

### Task 4: The composite prompt

**Files:**
- Create: `src/prompts/composite-generate.ts`
- Test: `src/prompts/__tests__/composite-generate.test.ts`

**Interfaces:**
- Consumes: `CompositeRef` (Task 3).
- Produces: `COMPOSITE_PROMPT_ID = "composite-generate-v1"`; `buildCompositePrompt(args: { refs: CompositeRef[]; instruction: string }): string` — `instruction` is already resolved (`resolveCompositeMentions`).

- [ ] **Step 1: Write the failing test**

`src/prompts/__tests__/composite-generate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { CompositeRef } from "@/lib/composite/references";
import { buildCompositePrompt } from "../composite-generate";

const AVATAR: CompositeRef = { nodeId: "a", name: "Riya", role: "avatar", position: 1, image: { url: "https://cdn/f.png" } };
const SHEET: CompositeRef = { nodeId: "a:sheet", name: "Riya sheet", role: "avatar-sheet", position: 2, image: { url: "https://cdn/s.png" } };
const SANDALS: CompositeRef = { nodeId: "f", name: "Sandals.png", role: "image", position: 3, image: { url: "https://cdn/x.png" } };

describe("buildCompositePrompt (D309)", () => {
  const withAvatar = buildCompositePrompt({
    refs: [AVATAR, SHEET, SANDALS],
    instruction: "Riya (image 1) at her desk holding Sandals.png (image 3), in a bright office.",
  });

  it("lists every reference by position and name; the sheet as the same person", () => {
    expect(withAvatar).toContain("Image 1: Riya, the person in this picture");
    expect(withAvatar).toContain("Image 2: Riya's profile sheet");
    expect(withAvatar).toContain("Image 3: Sandals.png");
  });

  it("carries the operator's instruction verbatim", () => {
    expect(withAvatar).toContain("Riya (image 1) at her desk holding Sandals.png (image 3), in a bright office.");
  });

  it("holds both preservation rules and the sheet rule", () => {
    expect(withAvatar).toMatch(/same face/);
    expect(withAvatar).toMatch(/Add no text, logo, label or branding/);
    expect(withAvatar).toMatch(/every panel shows the same place, in the same light/);
  });

  it("states the person rule only when an avatar is wired", () => {
    const noAvatar = buildCompositePrompt({ refs: [SANDALS], instruction: "On a desk." });
    expect(noAvatar).not.toMatch(/same face/);
    expect(noAvatar).toMatch(/Add no text, logo, label or branding/);
  });

  it("works with no references at all — a background from text alone", () => {
    const bare = buildCompositePrompt({ refs: [], instruction: "An empty bedroom, four angles, warm light." });
    expect(bare).toContain("No reference images are attached");
    expect(bare).toContain("An empty bedroom, four angles, warm light.");
  });

  it("adds no styling of its own", () => {
    const plain = buildCompositePrompt({ refs: [SANDALS], instruction: "On a desk." });
    for (const term of ["mm", "f/", "aperture", "depth of field", "bokeh", "golden hour", "softbox", "film", "grain", "grade"]) {
      expect(plain.toLowerCase()).not.toContain(term);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/prompts/__tests__/composite-generate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/prompts/composite-generate.ts`:

```ts
import type { CompositeRef } from "@/lib/composite/references";

// D309 — what the image model receives for a Composite node: the roster of attached images, the
// operator's instruction (chips already resolved to "Name (image N)"), and a fixed rule block.
//
// The rules hold only what is always true. They add NO styling: camera, lens, lighting and colour
// come from the operator's words or not at all — a location sheet's light is its content, but a
// lighting recipe the operator never asked for is noise the video writer is told to discard
// (D281). Preservation runs both ways: a 2026-09-24 probe had Seedance invent lettering on a shoe
// specified "no text, no logo", so a prompt silent on it puts hallucinated branding on the
// client's product.

export const COMPOSITE_PROMPT_ID = "composite-generate-v1";

const PERSON_RULE =
  "The person from the avatar images stays exactly who they are: the same face, features, skin tone, hair and build. Vary only their pose, angle, expression and framing. Keep their clothing unless the description changes it.";

const COMMON_RULES = [
  "Any product or object taken from a reference image is reproduced exactly: the same shape, proportions, colours, materials, lettering and logo. Add no text, logo, label or branding that is not on it in the reference.",
  "Everything combined reads as one real photograph: one light, one perspective, consistent shadows and scale.",
  "The setting is what the description or a reference image shows. Add nothing to the scene that neither states.",
  "If the description asks for several panels or angles, every panel shows the same place, in the same light, at the same time of day.",
  "Use only the camera, lighting and colour treatment the description asks for.",
];

// The sheet's wording follows D308's presenter rows: identity only, because a multi-view sheet on
// a plain backdrop has been read as a location before (D281).
function rosterLine(ref: CompositeRef): string {
  const where = `Image ${ref.position}`;
  if (ref.role === "avatar") {
    return `- ${where}: ${ref.name}, the person in this picture (a front view). Take only their face, hair, build and clothing, never this image's background, lighting or framing.`;
  }
  if (ref.role === "avatar-sheet") {
    const person = ref.name.replace(/ sheet$/, "");
    return `- ${where}: ${person}'s profile sheet: front, side and back views of the same person, for their build and outfit. Never its plain background, lighting or layout.`;
  }
  return `- ${where}: ${ref.name}.`;
}

export function buildCompositePrompt(args: { refs: CompositeRef[]; instruction: string }): string {
  const hasAvatar = args.refs.some((r) => r.role === "avatar");
  const roster = args.refs.length
    ? ["Reference images, in the order attached:", ...args.refs.map(rosterLine)]
    : ["No reference images are attached; make the whole picture from the description."];
  const rules = [...(hasAvatar ? [PERSON_RULE] : []), ...COMMON_RULES];
  return [
    ...roster,
    "",
    "Make this picture:",
    args.instruction.trim(),
    "",
    "Rules:",
    ...rules.map((r) => `- ${r}`),
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/prompts/__tests__/composite-generate.test.ts`
Expected: PASS. (If the no-styling test trips on a word inside a rule — e.g. "film" — reword the rule, never weaken the test.)

- [ ] **Step 5: Commit**

```bash
git add src/prompts/composite-generate.ts src/prompts/__tests__/composite-generate.test.ts
git commit -m "feat(composite): the composite prompt — roster, instruction, preservation rules (D309)"
```

---

### Task 5: The generate route

**Files:**
- Modify: `src/lib/image-gen/utils.ts` (add `mimeToExt`), `src/app/api/nodes/[id]/image-generate/route.ts:27-31` (import it instead of its local copy)
- Create: `src/lib/composite/load-inputs.ts`
- Create: `src/app/api/nodes/[id]/composite-generate/route.ts`
- Test: `src/app/api/nodes/[id]/composite-generate/route.test.ts`

**Interfaces:**
- Consumes: `compositeRefs`, `referenceImagesOf`, `resolveCompositeMentions`, `danglingMentions`, `danglingMentionMessage` (Task 3); `presenterUpstreamRows` (`@/lib/avatars/presenter`, D308); `buildCompositePrompt`, `COMPOSITE_PROMPT_ID` (Task 4); `compositeModelLock`, `resolveCompositeModelId` (Task 1).
- Produces:
  - `loadCompositeInputs(nodeId: string, clientId: string): Promise<{ ok: true; refs: CompositeRef[]; avatarIds: string[] } | { ok: false; error: string }>`
  - `POST /api/nodes/[id]/composite-generate` — body `{ instruction?: string; modelId?: string; params?: Record<string, unknown> }` → `200 { imageUrl, versionId, fileSizeBytes, imageWidth, imageHeight }` | `400/402/422/500 { error }`.
  - `mimeToExt(mimeType: string): string` in `src/lib/image-gen/utils.ts`.

- [ ] **Step 1: Extract `mimeToExt`**

Move the function from `image-generate/route.ts:27-31` into `src/lib/image-gen/utils.ts` as an export (unchanged body), and in `image-generate/route.ts` delete the local copy and add `mimeToExt` to its existing `@/lib/image-gen/utils` import. Run `npx tsc --noEmit` — expected clean.

- [ ] **Step 2: Write the server loader**

`src/lib/composite/load-inputs.ts`:

```ts
import "server-only";
import { getUpstreamOutputs, type UpstreamOutput } from "@/lib/db/nodes";
import { getAvatar } from "@/lib/db/avatars";
import { presenterUpstreamRows } from "@/lib/avatars/presenter";
import { compositeRefs, type CompositeRef } from "./references";

// D309 — a composite's wired inputs, from the database. An Avatar node holds only an id (D298),
// so its images are read live; archived avatars still resolve (D287 — what already uses an
// avatar keeps working). Each avatar row is replaced, in place, by D308's rows — its front, then
// its fresh profile sheet — so the composite numbers an avatar exactly as a shot does. An avatar
// that cannot contribute a face is an operator problem, said before anything is reserved.

export type CompositeInputs =
  | { ok: true; refs: CompositeRef[]; avatarIds: string[] }
  | { ok: false; error: string };

export async function loadCompositeInputs(nodeId: string, clientId: string): Promise<CompositeInputs> {
  const rows: UpstreamOutput[] = [];
  const avatarIds: string[] = [];
  for (const row of await getUpstreamOutputs(nodeId)) {
    if (row.type !== "avatar") {
      rows.push(row);
      continue;
    }
    const avatarId = typeof row.data.avatarId === "string" ? row.data.avatarId : "";
    const avatar = avatarId ? await getAvatar(clientId, avatarId) : null;
    if (!avatar) {
      return { ok: false, error: "An avatar wired into this composite no longer exists — remove it from the canvas." };
    }
    if (!avatar.front) {
      return { ok: false, error: `${avatar.name} has no front image yet — finish them in the Avatar Studio.` };
    }
    rows.push(...presenterUpstreamRows(row.nodeId, avatar));
    avatarIds.push(avatar.id);
  }
  return { ok: true, refs: compositeRefs(rows), avatarIds };
}
```

- [ ] **Step 3: Write the failing route test**

`src/app/api/nodes/[id]/composite-generate/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SEEDANCE_FACE_MODEL_ID } from "@/lib/avatars/constants";
import type { CompositeRef } from "@/lib/composite/references";

vi.mock("server-only", () => ({}));

const stored = { instruction: "" };
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return {
    ...actual,
    withNode: (_req: Request, _params: unknown, fn: (...a: unknown[]) => Promise<Response>) =>
      fn("node-1", { data: stored }, { userId: "u1", email: "u@x.com" }, "client-1", "org-1"),
  };
});

const AVATAR_REF: CompositeRef = { nodeId: "n-av", name: "Riya", role: "avatar", position: 1, image: { url: "https://cdn/front.png" } };
const SHEET_REF: CompositeRef = { nodeId: "n-av:sheet", name: "Riya sheet", role: "avatar-sheet", position: 2, image: { url: "https://cdn/sheet.png" } };
const FILE_REF: CompositeRef = { nodeId: "n-file", name: "Sandals.png", role: "image", position: 3, image: { url: "https://cdn/sandals.png" } };
const loadCompositeInputs = vi.fn(async (..._a: unknown[]) => ({}) as unknown);
vi.mock("@/lib/composite/load-inputs", () => ({ loadCompositeInputs: (...a: unknown[]) => loadCompositeInputs(...a) }));

const generate = vi.fn(async (..._a: unknown[]) => ({}) as unknown);
const model = (label: string, maxReferenceImages: number) => ({
  label,
  maxReferenceImages,
  maxReferenceSizeBytes: 0,
  schema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
  generate: (...a: unknown[]) => generate(...a),
});
vi.mock("@/lib/image-gen/registry", () => ({
  imageGenRegistry: {
    "seedream:seedream-5-0-lite": model("Seedream 5.0 Lite", 14),
    "gemini:gemini-3-pro-image": model("Nano Banana Pro", 14),
    "tiny:two": model("Tiny", 2),
  },
}));

vi.mock("@/lib/image-gen/estimate", () => ({ estimateImageGenerationCostUsd: () => 0.03 }));
vi.mock("@/lib/image-gen/cost", () => ({ computeImageCost: () => ({ usd: 0.03 }) }));
vi.mock("@/lib/storage", () => ({ uploadImageGen: vi.fn(async () => ({ url: "https://cdn/out.png" })) }));
vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({ width: 1152, height: 2048 }) }) }));

// Every mock takes `...a: unknown[]` so `mock.calls[0][0]` is typed and tsc stays clean.
const insertVersion = vi.fn(async (..._a: unknown[]) => ({ id: "v1" }));
vi.mock("@/lib/db/versions", () => ({
  insertVersion: (...a: unknown[]) => insertVersion(...a),
  setActiveVersion: vi.fn(async () => undefined),
}));
const insertGeneration = vi.fn(async (..._a: unknown[]) => ({ id: "g1" }));
const failGeneration = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/db/generations", () => ({
  insertGeneration: (...a: unknown[]) => insertGeneration(...a),
  succeedGeneration: vi.fn(async () => undefined),
  failGeneration: (...a: unknown[]) => failGeneration(...a),
}));
const reserveCredits = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
const settleGeneration = vi.fn(async (..._a: unknown[]) => undefined);
const refundReservation = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/db/credit-transactions", () => ({
  reserveCredits: (...a: unknown[]) => reserveCredits(...a),
  settleGeneration: (...a: unknown[]) => settleGeneration(...a),
  refundReservation: (...a: unknown[]) => refundReservation(...a),
  CreditLimitError: class extends Error {},
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "node-1" }),
  });

/** What the provider was called with. */
const sent = () => generate.mock.calls[0][0] as { prompt: string; referenceUrls: string[] };

beforeEach(() => {
  vi.clearAllMocks();
  stored.instruction = "";
  loadCompositeInputs.mockResolvedValue({ ok: true, refs: [AVATAR_REF, SHEET_REF, FILE_REF], avatarIds: ["av-1"] });
  generate.mockResolvedValue({ imageBase64: Buffer.from("png").toString("base64"), mimeType: "image/png", costUsd: 0.03 });
});

describe("POST composite-generate (D309)", () => {
  it("refuses with no instruction, before reserving", async () => {
    const res = await post({ instruction: "   " });
    expect(res.status).toBe(400);
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("uses the instruction from the request body over the stored one", async () => {
    stored.instruction = "stale words";
    await post({ instruction: "fresh words", modelId: SEEDANCE_FACE_MODEL_ID });
    expect(sent().prompt).toContain("fresh words");
    expect(sent().prompt).not.toContain("stale words");
  });

  it("falls back to the stored instruction when the body has none", async () => {
    stored.instruction = "stored words";
    await post({ modelId: SEEDANCE_FACE_MODEL_ID });
    expect(sent().prompt).toContain("stored words");
  });

  it("refuses a dangling mention, naming it, before reserving", async () => {
    const res = await post({ instruction: "@[Avatar: Zoe](gone) in a kitchen", modelId: SEEDANCE_FACE_MODEL_ID });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("'Zoe'");
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("refuses when an avatar cannot contribute a face", async () => {
    loadCompositeInputs.mockResolvedValue({ ok: false, error: "Riya has no front image yet — finish them in the Avatar Studio." });
    const res = await post({ instruction: "x", modelId: SEEDANCE_FACE_MODEL_ID });
    expect(res.status).toBe(400);
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("refuses a model other than the lock while an avatar is wired", async () => {
    const res = await post({ instruction: "x", modelId: "gemini:gemini-3-pro-image" });
    expect(res.status).toBe(400);
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("allows any model when no avatar is wired", async () => {
    loadCompositeInputs.mockResolvedValue({ ok: true, refs: [FILE_REF], avatarIds: [] });
    const res = await post({ instruction: "on a desk", modelId: "gemini:gemini-3-pro-image" });
    expect(res.status).toBe(200);
  });

  it("generates with zero references — a background from text alone", async () => {
    loadCompositeInputs.mockResolvedValue({ ok: true, refs: [], avatarIds: [] });
    const res = await post({ instruction: "an empty bedroom, four angles" });
    expect(res.status).toBe(200);
    expect(sent().referenceUrls).toEqual([]);
  });

  it("refuses more images than the model takes, without slicing", async () => {
    loadCompositeInputs.mockResolvedValue({ ok: true, refs: [FILE_REF, { ...FILE_REF, nodeId: "b", position: 2 }, { ...FILE_REF, nodeId: "c", position: 3 }], avatarIds: [] });
    const res = await post({ instruction: "x", modelId: "tiny:two" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("3 reference images");
    expect(generate).not.toHaveBeenCalled();
  });

  it("sends the avatar's front and sheet first, then the rest, and resolves chips to positions", async () => {
    await post({ instruction: "@[Avatar: Riya](n-av) holding @[File: Sandals.png](n-file)", modelId: SEEDANCE_FACE_MODEL_ID });
    const call = sent();
    expect(call.referenceUrls).toEqual(["https://cdn/front.png", "https://cdn/sheet.png", "https://cdn/sandals.png"]);
    expect(call.prompt).toContain("Riya (image 1) holding Sandals.png (image 3)");
  });

  it("reserves, then settles, and records the avatar on the version", async () => {
    const res = await post({ instruction: "x", modelId: SEEDANCE_FACE_MODEL_ID });
    expect(res.status).toBe(200);
    expect(reserveCredits).toHaveBeenCalled();
    expect(settleGeneration).toHaveBeenCalled();
    const version = insertVersion.mock.calls[0][0] as { inputsUsed: Record<string, unknown> };
    expect(version.inputsUsed).toMatchObject({ avatarIds: ["av-1"], promptId: "composite-generate-v1" });
  });

  it("refunds when the provider fails, and records the failed attempt", async () => {
    generate.mockRejectedValue(new Error("provider down"));
    const res = await post({ instruction: "x", modelId: SEEDANCE_FACE_MODEL_ID });
    expect(res.status).toBe(500);
    expect(refundReservation).toHaveBeenCalled();
    expect(failGeneration).toHaveBeenCalled();
    expect(insertVersion).toHaveBeenCalledWith(expect.objectContaining({ error: "provider down" }));
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run "src/app/api/nodes/[id]/composite-generate/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 5: Write the route**

`src/app/api/nodes/[id]/composite-generate/route.ts`:

```ts
import sharp from "sharp";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { imageGenRegistry } from "@/lib/image-gen/registry";
import { computeImageCost } from "@/lib/image-gen/cost";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { validateReferenceImages } from "@/lib/image-gen/validate";
import { mimeToExt } from "@/lib/image-gen/utils";
import { usdToFinalCredits } from "@/lib/credits/units";
import {
  reserveCredits,
  settleGeneration,
  refundReservation,
  CreditLimitError,
} from "@/lib/db/credit-transactions";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";
import { uploadImageGen } from "@/lib/storage";
import { loadCompositeInputs } from "@/lib/composite/load-inputs";
import {
  referenceImagesOf,
  resolveCompositeMentions,
  danglingMentions,
  danglingMentionMessage,
} from "@/lib/composite/references";
import { compositeModelLock, resolveCompositeModelId } from "@/lib/composite/model";
import { buildCompositePrompt, COMPOSITE_PROMPT_ID } from "@/prompts/composite-generate";

// D309 — the Composite node's generation. image-generate/route.ts is the template, not the
// route: the pipeline (validate → generation → reserve → provider → upload → version → settle,
// and record-fail-refund on error) is the same; the prompt comes from the node's own instruction
// and the reference roster instead of a connected Prompt node. Every operator error is refused
// BEFORE insertGeneration, so nothing is reserved for a request that could never run.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, async (nodeId, node, caller, clientId, effectiveOrgId) => {
    const body = (await req.json().catch(() => null)) as
      | { instruction?: unknown; modelId?: unknown; params?: unknown }
      | null;

    // The body wins: the canvas autosaves on a delay, so the stored instruction can lag what the
    // operator just typed and clicked Generate on.
    const stored = (node.data as Record<string, unknown> | null)?.instruction;
    const rawInstruction =
      typeof body?.instruction === "string" ? body.instruction : typeof stored === "string" ? stored : "";
    if (!rawInstruction.trim()) return apiError("Say what to make — the instruction is empty.", 400);

    const inputs = await loadCompositeInputs(nodeId, clientId);
    if (!inputs.ok) return apiError(inputs.error, 400);
    const { refs, avatarIds } = inputs;

    const dangling = danglingMentions(rawInstruction, refs);
    if (dangling.length) return apiError(danglingMentionMessage(dangling), 400);

    const hasAvatar = refs.some((r) => r.role === "avatar");
    const requested = typeof body?.modelId === "string" ? body.modelId : undefined;
    const lock = compositeModelLock(hasAvatar);
    if (lock && requested && requested !== lock) {
      return apiError("A composite with an avatar is made with Seedream, so Seedance and Gemini Omni accept it.", 400);
    }
    const modelId = resolveCompositeModelId(requested, hasAvatar);
    const config = imageGenRegistry[modelId];
    if (!config) return apiError(`Unknown modelId: ${modelId}`, 400);

    const parsed = config.schema.safeParse(body?.params ?? {});
    if (!parsed.success) return apiError(`Invalid params: ${parsed.error.message}`, 400);
    const validatedParams = parsed.data as Record<string, unknown>;

    const images = referenceImagesOf(refs);
    // Never slice: every later "image N" the instruction resolved to would point at the wrong one.
    if (images.length > config.maxReferenceImages) {
      return apiError(
        `${images.length} reference images are connected — ${config.label} takes ${config.maxReferenceImages}. Disconnect some before generating.`,
        422,
      );
    }
    const validation = validateReferenceImages(images, config);
    if (!validation.ok) {
      const count = validation.violations.length;
      return apiError(
        count === 1
          ? `One of your reference images can't be used: ${validation.violations[0].message}`
          : `${count} reference images can't be used — resize them before generating.`,
        422,
      );
    }

    const referenceUrls = images.map((i) => i.url);
    const prompt = buildCompositePrompt({ refs, instruction: resolveCompositeMentions(rawInstruction, refs) });
    const inputsUsed = {
      promptId: COMPOSITE_PROMPT_ID,
      instruction: rawInstruction,
      prompt,
      referenceImageUrls: referenceUrls,
      avatarIds,
    };

    const generation = await insertGeneration({
      nodeId,
      orgId: effectiveOrgId,
      clientId,
      userId: caller.userId,
      userEmail: caller.email,
      type: "image",
      modelUsed: modelId,
      paramsSnapshot: validatedParams,
      inputsSnapshot: inputsUsed,
    });

    try {
      const costUsd = estimateImageGenerationCostUsd({
        modelId,
        quality: validatedParams.quality as string | undefined,
        aspectRatio: validatedParams.aspect_ratio as string | undefined,
        imageSize: validatedParams.image_size as string | undefined,
        referenceUrls,
      });
      if (costUsd === null) throw new Error(`No cost estimate available for ${modelId} at this quality/size.`);
      const reservation = await reserveCredits(effectiveOrgId, generation.id, usdToFinalCredits(costUsd));
      if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");

      const result = await config.generate({ prompt, referenceUrls, params: validatedParams });

      const buffer = Buffer.from(result.imageBase64, "base64");
      const { url: imageUrl } = await uploadImageGen({
        nodeId,
        ext: mimeToExt(result.mimeType),
        body: buffer,
        contentType: result.mimeType,
      });
      let width: number | undefined;
      let height: number | undefined;
      try {
        const meta = await sharp(buffer).metadata();
        width = meta.width;
        height = meta.height;
      } catch {
        // best-effort
      }

      const version = await insertVersion({
        nodeId,
        operatorUserId: caller.userId,
        inputsUsed,
        paramsUsed: {
          modelId,
          ...validatedParams,
          tokensUsed: result.tokensUsed,
          imageWidth: width,
          imageHeight: height,
          fileSizeBytes: buffer.length,
        },
        modelUsed: modelId,
        output: imageUrl,
      });
      await setActiveVersion(nodeId, version.id);

      // Seedream reports its exact per-image charge; token-billed providers don't.
      const cost =
        result.costUsd !== undefined
          ? { usd: result.costUsd }
          : result.tokensUsed
            ? computeImageCost(modelId, result.tokensUsed)
            : null;
      const actualCredits = cost ? usdToFinalCredits(cost.usd) : 0;
      await settleGeneration({ orgId: effectiveOrgId, generationId: generation.id, actualAmount: actualCredits });
      await succeedGeneration({
        generationId: generation.id,
        versionId: version.id,
        costUsd: cost?.usd,
        creditsCharged: actualCredits,
        tokensUsed: { ...result.tokensUsed },
        outputSnapshot: imageUrl,
      });

      return apiOk({ imageUrl, versionId: version.id, fileSizeBytes: buffer.length, imageWidth: width, imageHeight: height });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Composite generation failed";
      await insertVersion({
        nodeId,
        operatorUserId: caller.userId,
        inputsUsed,
        paramsUsed: { modelId, ...validatedParams },
        modelUsed: modelId,
        error: message,
      }).catch(() => null);
      await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
      await refundReservation({ orgId: effectiveOrgId, generationId: generation.id }).catch(() => null);
      return apiError(message, e instanceof CreditLimitError ? 402 : 500);
    }
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run "src/app/api/nodes/[id]/composite-generate/route.test.ts"`
Expected: PASS. Then `npx tsc --noEmit` (the `insertVersion` failure call passes `inputsUsed` — if its type rejects that on an error row, drop `inputsUsed` from the failure call and from the test's expectation, matching image-generate). The route file must stay under ~200 lines; it is ~170.

- [ ] **Step 7: Commit**

```bash
git add src/lib/image-gen/utils.ts "src/app/api/nodes/[id]/image-generate/route.ts" src/lib/composite/load-inputs.ts "src/app/api/nodes/[id]/composite-generate"
git commit -m "feat(composite): the generate route — instruction + roster, avatar model lock (D309)"
```

---

### Task 6: The card, the focus view, and the add menu

**Files:**
- Create: `src/lib/composite/upstream-items.ts`, `src/lib/composite/__tests__/upstream-items.test.ts`
- Modify: `src/components/nodes/image-gen-output-settings.tsx`, `src/components/nodes/image-gen-output-settings-body.tsx` (optional props)
- Create: `src/hooks/use-composite-upstream.ts`, `src/hooks/use-composite-versions.ts`
- Create: `src/components/nodes/composite-node.tsx`, `src/components/nodes/composite-focus-view.tsx`, `src/components/nodes/composite-output-pane.tsx`
- Modify: `src/lib/canvas-node-options.ts`, `src/lib/canvas-node-options.test.ts`, `src/components/canvas/quick-add-menu.tsx`, `src/components/canvas/canvas.tsx`

**Interfaces:**
- Consumes: `COMPOSITE_MODEL_LOCK_REASON`, `compositeModelLock`, `resolveCompositeModelId` (Task 1); `isGeneratedImageType` (Task 2); `POST /api/nodes/[id]/composite-generate` (Task 5).
- Produces:
  - `type CompositeUpstreamItem = { id: string; type: string; label: string; fileUrl?: string; fileKind?: string; sheetUrl?: string }` — one per wired node (the rail)
  - `compositeUpstreamItems(nodeId: string, nodes: AppNode[], edges: Edge[], avatars: Avatar[]): CompositeUpstreamItem[]`
  - `compositeMentionUpstream(items: CompositeUpstreamItem[]): CompositeUpstreamItem[]` — the same, with each avatar's fresh sheet as its own entry under `avatarSheetId` (D308, as `useMentionUpstream` does)
  - `compositeMentionables(items: CompositeUpstreamItem[]): Array<{ id: string; label: string; type: string; fileUrl?: string; fileKind?: string }>`
  - `ImageGenOutputSettings` / `ImageGenOutputSettingsBody` gain `modelLock?: { reason: string }`; the body also gains `missingInputReason?: string` (default `"Connect a Prompt node to generate."`).

- [ ] **Step 1: Write the failing tests**

`src/lib/composite/__tests__/upstream-items.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { Avatar } from "@/lib/avatars/schema";
import { avatarSheetId } from "@/lib/video-gen/select-references";
import { compositeUpstreamItems, compositeMentionUpstream, compositeMentionables } from "../upstream-items";

const node = (id: string, type: string, data: Record<string, unknown>) =>
  ({ id, type, position: { x: 0, y: 0 }, data }) as unknown as AppNode;
const edge = (source: string): Edge => ({ id: `${source}-c`, source, target: "c" });

const NODES = [
  node("c", "composite", {}),
  node("av", "avatar", { avatarId: "a1" }),
  node("f", "file", { filename: "Sandals.png", fileKind: "image", fileUrl: "https://cdn/s.png" }),
  node("g", "image-gen", { title: "Hero", parsed: "https://cdn/g.png" }),
  node("o", "composite", { title: "Office sheet", parsed: "https://cdn/o.png" }),
  node("d", "draw", { fileUrl: "https://cdn/d.png" }),
];
const EDGES = ["av", "f", "g", "o", "d"].map(edge);
const AVATARS = [
  { id: "a1", name: "Riya", front: { url: "https://cdn/front.png" }, sheet: { url: "https://cdn/sheet.png" }, sheetStale: false } as unknown as Avatar,
];

describe("compositeUpstreamItems (D309)", () => {
  it("lists every wired input with a name and its image", () => {
    const items = compositeUpstreamItems("c", NODES, EDGES, AVATARS);
    expect(items.map((i) => [i.type, i.label, i.fileUrl])).toEqual([
      ["avatar", "Riya", "https://cdn/front.png"],
      ["file", "Sandals.png", "https://cdn/s.png"],
      ["image-gen", "Hero", "https://cdn/g.png"],
      ["composite", "Office sheet", "https://cdn/o.png"],
      ["draw", "Sketch", "https://cdn/d.png"],
    ]);
  });

  it("names an avatar it cannot find yet 'Avatar'", () => {
    const [item] = compositeUpstreamItems("c", NODES, [edge("av")], []);
    expect(item).toMatchObject({ type: "avatar", label: "Avatar", fileUrl: undefined });
  });
});

describe("compositeMentionUpstream / compositeMentionables", () => {
  it("offers every wired input by @ — the avatar's front and sheet as D308 does, composites included", () => {
    const mention = compositeMentionUpstream(compositeUpstreamItems("c", NODES, EDGES, AVATARS));
    expect(mention.map((m) => m.id)).toEqual(["av", avatarSheetId("av"), "f", "g", "o", "d"]);
    expect(compositeMentionables(mention).map((m) => m.label)).toEqual([
      "Avatar: Riya",
      "Avatar: Riya sheet",
      "File: Sandals.png",
      "Image: Hero",
      "Composite: Office sheet",
      "Sketch: Sketch",
    ]);
  });

  it("offers no sheet chip for a stale sheet", () => {
    const stale = [{ ...AVATARS[0], sheetStale: true } as Avatar];
    const mention = compositeMentionUpstream(compositeUpstreamItems("c", NODES, [edge("av")], stale));
    expect(mention.map((m) => m.id)).toEqual(["av"]);
  });
});
```

Append to `src/lib/canvas-node-options.test.ts`: add `"composite"` to the sorted list in the first test and rename it `"has the 11 user-addable node types (kb, shot and multishot excluded)"`; add `c: "composite",` to the `expected` map in `mnemonicToType`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/composite/__tests__/upstream-items.test.ts src/lib/canvas-node-options.test.ts`
Expected: FAIL — module not found; `"composite"` missing from options.

- [ ] **Step 3: Implement the pure upstream items**

`src/lib/composite/upstream-items.ts`:

```ts
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { Avatar } from "@/lib/avatars/schema";
import { isGeneratedImageType } from "@/lib/nodes/image-node-types";
import { avatarSheetId } from "@/lib/video-gen/select-references";

// D309 — the browser's view of what is wired into a composite: the focus view's rail (one row per
// wired node) and what `@` offers. Nothing is mandatory, but everything wired must be mentionable
// — the editor's default menu offers only file/draw/generated images, so an avatar would be wired
// but never offered. An avatar is offered as D308 offers it in a shot: its front under the node's
// id, its fresh sheet under avatarSheetId — the same ids the server's roster numbers.

export type CompositeUpstreamItem = {
  id: string;
  type: string;
  label: string;
  fileUrl?: string;
  fileKind?: string;
  /** An avatar's profile sheet, when it has one that is not out of date. */
  sheetUrl?: string;
};

const TYPE_LABEL: Record<string, string> = {
  avatar: "Avatar",
  file: "File",
  draw: "Sketch",
  "image-gen": "Image",
  composite: "Composite",
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function itemOf(n: AppNode, avatars: Avatar[]): CompositeUpstreamItem {
  const d = n.data as Record<string, unknown>;
  const type = n.type ?? "";
  const fallback = TYPE_LABEL[type] ?? type;
  if (type === "avatar") {
    const avatar = avatars.find((a) => a.id === d.avatarId);
    const sheetUrl = avatar?.sheet && !avatar.sheetStale ? avatar.sheet.url : undefined;
    return { id: n.id, type, label: avatar?.name ?? fallback, fileUrl: avatar?.front?.url, fileKind: "image", sheetUrl };
  }
  if (isGeneratedImageType(type)) {
    return { id: n.id, type, label: str(d.title) ?? fallback, fileUrl: str(d.parsed), fileKind: "image" };
  }
  return {
    id: n.id,
    type,
    label: str(d.title) ?? str(d.filename) ?? fallback,
    fileUrl: str(d.fileUrl),
    fileKind: type === "draw" ? "image" : str(d.fileKind),
  };
}

/** Every node wired into `nodeId`, in edge order. */
export function compositeUpstreamItems(
  nodeId: string,
  nodes: AppNode[],
  edges: Edge[],
  avatars: Avatar[],
): CompositeUpstreamItem[] {
  return edges
    .filter((e) => e.target === nodeId)
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter((n): n is AppNode => Boolean(n))
    .map((n) => itemOf(n, avatars));
}

/** The wired inputs as `@` sees them: each avatar's fresh sheet follows its front as its own entry. */
export function compositeMentionUpstream(items: CompositeUpstreamItem[]): CompositeUpstreamItem[] {
  return items.flatMap((i) =>
    i.type === "avatar" && i.sheetUrl
      ? [i, { id: avatarSheetId(i.id), type: "avatar", label: `${i.label} sheet`, fileUrl: i.sheetUrl, fileKind: "image" }]
      : [i],
  );
}

/** What `@` offers: every entry, labelled "Type: Name" as the Instruction stores it. */
export function compositeMentionables(items: CompositeUpstreamItem[]) {
  return items.map((i) => ({
    id: i.id,
    label: `${TYPE_LABEL[i.type] ?? i.type}: ${i.label}`,
    type: i.type,
    fileUrl: i.fileUrl,
    fileKind: i.fileKind,
  }));
}
```

- [ ] **Step 4: Add the add-menu entry**

In `src/lib/canvas-node-options.ts`: add `| "composite"` to `AddNodeType`, and after the `image-gen` option:

```ts
  // D309 — "C": free, and the node's own initial. A composite is made by hand per shot.
  { type: "composite", label: "Composite", mnemonic: "C" },
```

In `src/components/canvas/quick-add-menu.tsx`: import `Combine` from `lucide-react` and add `composite: Combine,` to `ICONS`.

Run: `npx vitest run src/lib/composite/__tests__/upstream-items.test.ts src/lib/canvas-node-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Give the shared output settings two optional props**

In `src/components/nodes/image-gen-output-settings.tsx`, add `modelLock?: { reason: string };` to `Props`, destructure it, and replace the model block's inner `<div className="space-y-4">…</div>` with:

```tsx
        {modelLock ? (
          // D309 — a composite with an avatar must use the face model Seedance accepts. One
          // chip, nothing to choose, and the reason in plain words.
          <div className="space-y-2">
            <ParamChipGroup
              options={[{ value: model.id, label: model.label }]}
              value={model.id}
              onValueChange={() => {}}
            />
            <p className="text-xs text-muted-foreground">{modelLock.reason}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* existing imageGenClientModelGroups.map(...) block, unchanged */}
          </div>
        )}
```

In `src/components/nodes/image-gen-output-settings-body.tsx`: add to `Props`

```ts
  /** D309 — the composite locks the model while an avatar is wired. */
  modelLock?: { reason: string };
  /** Why Generate is unavailable when `hasPrompt` is false. Image Gen's default is unchanged. */
  missingInputReason?: string;
```

destructure `modelLock` and `missingInputReason = "Connect a Prompt node to generate."`, replace the literal `"Connect a Prompt node to generate."` in `generateDisabledReason` with `missingInputReason`, and pass `modelLock={modelLock}` to `<ImageGenOutputSettings>`. Image Gen passes neither, so it renders exactly as before.

- [ ] **Step 6: The two hooks**

`src/hooks/use-composite-upstream.ts`:

```ts
"use client";

import { useMemo } from "react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useClientId } from "@/components/canvas/client-id-context";
import { useAvatars } from "@/hooks/queries/avatars";
import { compositeUpstreamItems, type CompositeUpstreamItem } from "@/lib/composite/upstream-items";

/** D309 — the inputs wired into a composite, with avatars named and pictured. Raw store slices
 *  are selected and the list derived in useMemo — building it inside the selector would return a
 *  fresh array every time and loop useSyncExternalStore. */
export function useCompositeUpstream(nodeId: string): CompositeUpstreamItem[] {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const clientId = useClientId();
  const { data: avatars } = useAvatars(clientId);
  return useMemo(
    () => compositeUpstreamItems(nodeId, nodes, edges, avatars ?? []),
    [nodeId, nodes, edges, avatars],
  );
}
```

`src/hooks/use-composite-versions.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ImageGenVersionSummary } from "@/components/nodes/image-gen-version-history";
import { useNodeVersionUpdates } from "@/hooks/use-node-version-updates";
import { revalidateCanvasGenerations } from "@/hooks/use-canvas-generations";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";

type Patch = (patch: Record<string, unknown>) => void;

/** D309 — a composite's versions, Generate and Restore. The same endpoints Image Gen uses for
 *  versions and restore; generation goes to composite-generate with the instruction in the body
 *  (the canvas autosaves on a delay, so the stored copy can lag). */
export function useCompositeVersions(nodeId: string, open: boolean, onPatch: Patch) {
  const [versions, setVersions] = useState<ImageGenVersionSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(open);
  const [generating, setGenerating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/versions`);
      if (!res.ok) return;
      const json = (await res.json()) as { activeVersionId: string | null; versions: ImageGenVersionSummary[] };
      setVersions(json.versions ?? []);
      setActiveVersionId(json.activeVersionId ?? null);
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    if (open) void fetchVersions();
  }, [open, fetchVersions]);
  useNodeVersionUpdates(nodeId, open, () => void fetchVersions());

  async function generate(body: { instruction: string; modelId: string; params: Record<string, unknown> }) {
    if (generating) return; // a run in flight never starts another — next to the request it guards
    setGenerating(true);
    setLastError(null);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/composite-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { imageUrl?: string; versionId?: string; error?: string };
      if (!res.ok || !json.imageUrl) {
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
      }
      onPatch({ parsed: json.imageUrl });
      setActiveVersionId(json.versionId ?? null);
      void revalidateCanvasGenerations();
      toast.success("Composite generated");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      setLastError(message);
      toast.error(message, { duration: 6000 });
    } finally {
      setGenerating(false);
      await fetchVersions();
    }
  }

  async function restore(versionId: string) {
    setRestoring(true);
    const toastId = toast.loading("Restoring version…");
    try {
      const res = await fetch(`/api/nodes/${nodeId}/restore-version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const json = (await res.json()) as { output?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Restore failed");
      if (json.output) onPatch({ parsed: json.output });
      setActiveVersionId(versionId);
      toast.success("Version restored", { id: toastId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed", { id: toastId });
    } finally {
      setRestoring(false);
    }
  }

  return { versions, activeVersionId, loading, generating, restoring, lastError, generate, restore };
}
```

- [ ] **Step 7: The output pane and the focus view**

`src/components/nodes/composite-output-pane.tsx` — the always-visible right column:

```tsx
"use client";

import { Combine } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** D309 — the composite's current image, or what is about to fill it. */
export function CompositeOutputPane({ imageUrl, generating }: { imageUrl: string | null; generating: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-muted/40 p-6">
      {generating ? (
        <Skeleton className="aspect-[9/16] w-full max-w-sm rounded-xl" />
      ) : imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="Composite" className="max-h-full w-auto rounded-xl border border-border shadow-card" />
      ) : (
        <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
          <Combine className="size-6 text-primary" strokeWidth={1.5} />
          <p>Wire in an avatar, a background or a product — or none — and say what to make.</p>
        </div>
      )}
    </div>
  );
}
```

`src/components/nodes/composite-focus-view.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Combine, History, Settings2, Type } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { normalizeTitle } from "@/lib/nodes/title";
import { imageGenClientModelMap, defaultsForModel } from "@/lib/image-gen/client-models";
import { smartMergeParams } from "@/lib/image-gen/params/merge";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { validateReferenceImages } from "@/lib/image-gen/validate";
import { usdToFinalCredits } from "@/lib/credits/units";
import {
  COMPOSITE_DEFAULT_MODEL_ID,
  COMPOSITE_MODEL_LOCK_REASON,
  compositeModelLock,
  resolveCompositeModelId,
} from "@/lib/composite/model";
import { compositeMentionUpstream, compositeMentionables } from "@/lib/composite/upstream-items";
import { useCompositeUpstream } from "@/hooks/use-composite-upstream";
import { useCompositeVersions } from "@/hooks/use-composite-versions";
import { EditableField } from "./editable-field";
import { GenerationErrorBadge } from "./generation-error-badge";
import { NodeIcon } from "./connected-inputs-card";
import { AddConnection } from "./add-connection";
import { LeftSection } from "./focus-left-section";
import { RailItem } from "./focus-rail-item";
import { FieldLabel } from "./field-label";
import { MentionInstructionEditor } from "./mention-instruction-editor";
import { ImageGenOutputSettingsBody } from "./image-gen-output-settings-body";
import { ImageGenVersionHistory } from "./image-gen-version-history";
import { CompositeOutputPane } from "./composite-output-pane";
import { useRailDisconnect } from "./use-rail-disconnect";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  imageUrl: string | null;
  instruction: string;
  modelId?: string;
  params?: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
};

// D309 — the Composite node's focus view: Image Gen's shell and headings, minus the prompt lane.
// Rail: Composite (compose here), the wired inputs, History. Middle: the instruction and output
// settings. Right: the image, always visible.
export function CompositeFocusView({ open, onOpenChange, nodeId, title, imageUrl, instruction, modelId, params, onPatch }: Props) {
  const editable = useCanvasEditable();
  const upstream = useCompositeUpstream(nodeId);
  const mentionUpstream = useMemo(() => compositeMentionUpstream(upstream), [upstream]);
  const hasAvatar = upstream.some((u) => u.type === "avatar");
  const lock = compositeModelLock(hasAvatar);
  // A stored id the client map no longer lists (a retired model) falls back to the default.
  const model =
    imageGenClientModelMap[resolveCompositeModelId(modelId, hasAvatar)] ??
    imageGenClientModelMap[COMPOSITE_DEFAULT_MODEL_ID];
  const [draft, setDraft] = useState(instruction);
  const [selected, setSelected] = useState<"compose" | "history">("compose");
  const values = useMemo(
    () => smartMergeParams({ ...defaultsForModel(model), ...(params ?? {}) }, model),
    [model, params],
  );
  const { versions, activeVersionId, loading, generating, restoring, lastError, generate, restore } =
    useCompositeVersions(nodeId, open, onPatch);
  const { removeFor } = useRailDisconnect(nodeId, () => {});

  // The same images the server will send: an avatar's front and fresh sheet are two.
  const referenceUrls = mentionUpstream.flatMap((u) => (u.fileUrl ? [u.fileUrl] : []));
  const costUsd = estimateImageGenerationCostUsd({
    modelId: model.id,
    quality: values.quality as string | undefined,
    aspectRatio: values.aspect_ratio as string | undefined,
    imageSize: values.image_size as string | undefined,
    referenceUrls,
  });
  const refValidation = validateReferenceImages(referenceUrls.map((url) => ({ url })), model);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]">
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-7xl px-6 pb-5 pt-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="-ml-2.5 gap-1.5 font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </Button>
            <SheetTitle className="mt-4 p-0 font-display text-3xl font-semibold tracking-tight">
              <EditableField value={title} onCommit={(t) => onPatch({ title: normalizeTitle(t) })} placeholder="Composite" className="font-display text-3xl font-semibold tracking-tight" />
            </SheetTitle>
            {lastError && !generating && <div className="mt-2"><GenerationErrorBadge error={lastError} /></div>}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 overflow-hidden">
          <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4">
            <RailItem icon={<Combine className="size-4 text-primary" strokeWidth={1.5} />} label="Composite" active={selected === "compose"} onClick={() => setSelected("compose")} />
            <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
              <span className="text-eyebrow">Connected · {upstream.length}</span>
              <AddConnection targetId={nodeId} targetType="composite" connectedIds={upstream.map((u) => u.id)} />
            </div>
            {upstream.length === 0 ? (
              <p className="px-2.5 text-xs text-muted-foreground">Nothing wired — describe the whole picture.</p>
            ) : (
              upstream.map((u) => {
                const remove = editable ? removeFor(u.id, u.label) : null;
                return (
                  <RailItem key={u.id} icon={<NodeIcon type={u.type} />} label={u.label} active={false} onClick={() => setSelected("compose")} onRemove={remove?.onClick} removeLabel={remove?.label} removeKind={remove?.kind} />
                );
              })
            )}
            <div className="mx-2.5 my-2 h-px bg-border" />
            <RailItem icon={<History className="size-4 text-primary" strokeWidth={1.5} />} label="History" active={selected === "history"} onClick={() => setSelected("history")} badge={versions.length ? <span className="text-xs text-muted-foreground">{versions.length}</span> : undefined} />
          </nav>

          <div className="flex min-h-0 flex-1">
            <div className="min-h-0 w-[54%] shrink-0 overflow-y-auto border-x border-primary/25 bg-card panel-raised">
              {selected === "compose" ? (
                <div className="flex flex-col gap-6 px-6 py-5">
                  <div className="flex flex-col gap-2">
                    <FieldLabel icon={Type} label="Instruction" />
                    <MentionInstructionEditor
                      value={draft}
                      onChange={(v) => { setDraft(v); onPatch({ instruction: v }); }}
                      placeholder="e.g. @Riya at her desk holding @Sandals, in a bright open-plan office. A 2×2 sheet, four angles, warm window light."
                      upstream={mentionUpstream}
                      mentionables={compositeMentionables(mentionUpstream)}
                      disabled={!editable || generating}
                      className="min-h-24"
                    />
                    <p className="text-[0.65rem] text-muted-foreground">Type @ to use a connected input. Nothing has to be connected — a background can be words alone.</p>
                  </div>
                  <LeftSection icon={Settings2} label="Output settings">
                    <ImageGenOutputSettingsBody
                      model={model}
                      values={values}
                      onValuesChange={(next) => onPatch({ params: next })}
                      onCommit={(next) => onPatch({ params: next })}
                      onModelChange={(id) => onPatch({ modelId: id })}
                      modelLock={lock ? { reason: COMPOSITE_MODEL_LOCK_REASON } : undefined}
                      missingInputReason="Say what to make first."
                      referenceCount={referenceUrls.length}
                      refValidation={refValidation}
                      showGenerate
                      onGenerate={() => void generate({ instruction: draft, modelId: model.id, params: values })}
                      generating={generating}
                      editing={false}
                      hasPrompt={draft.trim().length > 0}
                      hasImage={Boolean(imageUrl)}
                      estimatedCredits={costUsd === null ? null : usdToFinalCredits(costUsd)}
                      estimating={false}
                    />
                  </LeftSection>
                </div>
              ) : (
                <div className="px-6 py-5">
                  {loading ? (
                    <Skeleton className="h-24 w-full rounded-xl" />
                  ) : versions.length ? (
                    <ImageGenVersionHistory versions={versions} activeVersionId={activeVersionId} onRestore={(id) => void restore(id)} restoring={restoring} />
                  ) : (
                    <p className="text-sm text-muted-foreground">No composites yet — every attempt will show up here.</p>
                  )}
                </div>
              )}
            </div>
            <CompositeOutputPane imageUrl={imageUrl} generating={generating} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

Notes for the implementer:
- `MentionInstructionEditor`'s `upstream` prop is typed `UpstreamNode[]` (`{ id, label, type, fileUrl?, fileKind?, … }`); `CompositeUpstreamItem` is assignable to it. If `tsc` disagrees, map explicitly.
- `ImageGenVersionHistory` takes `versions`, `activeVersionId`, `onRestore(versionId)` and `restoring` (`image-gen-version-history.tsx:43-45`).
- Restore here re-points the image only; it does not restore the version's model and params the way Image Gen's does (`paramsForRestore`). The next Generate uses the node's current settings — intended for v1, and worth a line in the hand-back.
- `params`, `values` and `model` must not be recomputed from a fresh object each render in a way that loops: `values` is memoised on `[model, params]`.
- The file is ~170 lines; if it grows past ~200, move the rail into `composite-focus-rail.tsx`.

- [ ] **Step 8: The card**

`src/components/nodes/composite-node.tsx` — the Image Gen card's shape, without the upstream walk (the focus view reads its own):

```tsx
"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Combine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { useGalleryDrawer } from "@/components/canvas/gallery-drawer-context";
import { useGalleryNodeDrop } from "@/hooks/use-gallery-node-drop";
import { useNodeCost } from "@/hooks/use-node-cost";
import type { CompositeNodeData } from "@/lib/canvas-nodes";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import { NodeCreditsFooter } from "./node-credits-footer";
import { CompositeFocusView } from "./composite-focus-view";

// D309 — the Composite card: the current image and a way in. Generation runs in the focus view.
export function CompositeNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps) {
  const d = data as CompositeNodeData;
  const imageUrl = typeof d.parsed === "string" ? d.parsed : null;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const deleteNode = useDeleteNode();
  const gallery = useGalleryDrawer();
  const position = { x: positionAbsoluteX ?? 0, y: positionAbsoluteY ?? 0 };
  const drop = useGalleryNodeDrop(id, position);
  const totalCredits = useNodeCost(id);
  const [focusOpen, setFocusOpen] = useState(false);

  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null);
  };
  useFocusViewRegistration(id, focusViewOpen);

  return (
    <>
      <NodeContextMenu
        onDuplicate={() => duplicateNode(id)}
        onDelete={() => deleteNode(id)}
        onAddReferenceImage={() => gallery.openDrawer({ position, connectToNodeId: id })}
      >
        <div
          onDoubleClick={(e) => { e.stopPropagation(); setFocusOpen(true); }}
          onDragOver={drop.onDragOver}
          onDrop={drop.onDrop}
          className={cn(
            "w-[480px] rounded-lg border border-border bg-card shadow-card",
            "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
            selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          )}
        >
          <NodeCardHeader
            icon={Combine}
            nodeId={id}
            nodeType="composite"
            title={d.title ?? ""}
            placeholder="Composite"
            onCommitTitle={(t) => updateNodeData(id, { title: t })}
          />
          <div className="px-3 py-3">
            {imageUrl && (
              <div className="mb-2 overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="Composite" className="aspect-video w-full object-cover" />
              </div>
            )}
            <Button
              variant="ghost"
              onClick={() => setFocusOpen(true)}
              className="nodrag -mx-1.5 h-auto gap-1 rounded-md border-0 px-1.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 hover:text-primary"
            >
              Open ↗
            </Button>
          </div>
          <NodeCreditsFooter totalCredits={totalCredits} hasOutput={Boolean(imageUrl)} />
          <Handle type="target" position={Position.Left} className="!size-4 !border-2 !border-card !bg-muted-foreground" />
          <Handle type="source" position={Position.Right} className="!size-4 !border-2 !border-card !bg-primary" />
        </div>
      </NodeContextMenu>

      {/* Outside NodeContextMenu: the sheet is portaled, but a portal keeps its place in the React
          tree, so as a child of the trigger its events would bubble into the card. */}
      <CompositeFocusView
        open={focusViewOpen}
        onOpenChange={handleFocusOpenChange}
        nodeId={id}
        title={d.title ?? ""}
        imageUrl={imageUrl}
        instruction={d.instruction ?? ""}
        modelId={d.modelId}
        params={d.params}
        onPatch={(patch) => updateNodeData(id, patch)}
      />
    </>
  );
}
```

If `NodeCardHeader`'s `icon` prop requires a specific `nodeType` union, check its props and add `"composite"` there.

In `src/components/canvas/canvas.tsx`: `import { CompositeNode } from "@/components/nodes/composite-node";` and add `composite: CompositeNode,` to `nodeTypes`.

- [ ] **Step 9: Verify**

Run, sequentially: `npx tsc --noEmit`, then `npx eslint src/components/nodes src/hooks src/lib/composite src/components/canvas`, then `npx vitest run src/lib/composite src/lib/canvas-node-options.test.ts`.
Expected: all clean / PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/composite src/hooks/use-composite-upstream.ts src/hooks/use-composite-versions.ts src/components/nodes/composite-node.tsx src/components/nodes/composite-focus-view.tsx src/components/nodes/composite-output-pane.tsx src/components/nodes/image-gen-output-settings.tsx src/components/nodes/image-gen-output-settings-body.tsx src/lib/canvas-node-options.ts src/lib/canvas-node-options.test.ts src/components/canvas/quick-add-menu.tsx src/components/canvas/canvas.tsx
git commit -m "feat(composite): the card, focus view and add-menu entry (D309)"
```

---

### Task 7: Sync the spec, run the whole suite, see it work

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-composite-node-design.md` §3.1 and §8
- Modify: `HANDOFF.md` (State)

- [ ] **Step 1: Sync the spec to what was built**

Rewrite spec §3.1 from its first paragraph to the end of the section as:

```markdown
An avatar contributes its **front image**, and its **profile sheet** when there is one and it is
not stale (`sheetStale`, D288/D295) — **as D308 already does for a shot**: the loader replaces the
avatar's row with `presenterUpstreamRows` (`src/lib/avatars/presenter.ts`), so the front travels
under the Avatar node's id and the sheet under `avatarSheetId` (`"<id>:sheet"`), each its own entry
and its own chip ("Riya", "Riya sheet"), identity only. One convention for an avatar's images
across shots and composites; no change to shared `ref-binding.ts`. The roster is the composite's
own module, `src/lib/composite/references.ts`.
```

In §6, change "plus the avatar's id when one was wired" to "and `inputsUsed` records `avatarIds`, the prompt id (`composite-generate-v1`), the instruction and the exact prompt sent" — the build records them as inputs, where image-generate records what it was given.

In §8, change the `ref-binding.test.ts` row to `` `composite/references.test.ts` `` — *the avatar's front and fresh sheet are entries 1 and 2 under D308's ids; a stale sheet is skipped and later numbering holds; chips resolve to "Name (image N)"*. Add a row: `` `image-node-types.test.ts` `` — *a composite counts as a generated image for every downstream reader; a composite is never auto-promoted to start frame*.

In `HANDOFF.md` "State", replace the paragraph with: `**Built** on this branch (plan: docs/superpowers/plans/2026-10-06-composite-node.md). Not merged.`

- [ ] **Step 2: Run the whole suite**

Run, sequentially (not in parallel): `npx tsc --noEmit`, `npm run lint`, `npx vitest run`.
Expected: clean, clean, PASS. If a kling test times out, re-run that file alone before investigating (known flake, memory `project-kling-test-flake`). Any other failure in a file this plan did not touch: run that file on `origin/staging` (`git show origin/staging:<path>` is not enough — check it out in a throwaway worktree) to confirm it fails there too, and report it as pre-existing rather than fixing it.

- [ ] **Step 3: See it work in the app**

Use the `run` skill to start the dev server and open a canvas. Image generation is synchronous and works on localhost (memory `project-local-video-gen-remote-only`). Check, in order:
1. Press `C` on the canvas → a Composite node appears with the Combine icon.
2. Open it with nothing wired, type "An empty bedroom, warm late-day light. A 2×2 sheet, four angles.", Generate → an image appears and History shows one version.
3. Drag an avatar from the gallery's Avatars tab, wire it in → the model shows Seedream alone with "Made with Seedream so Seedance and Gemini Omni accept it."
4. Wire a File image (a product) → type `@`, both the avatar and the file are offered as chips, with thumbnails.
5. Wire the composite from step 2 into a Video Gen node → it appears there as a reference image (not a start frame).

Report what was seen, with a screenshot of step 4.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-01-composite-node-design.md HANDOFF.md
git commit -m "docs(composite): spec matches the build — avatar images follow D308's rows"
```
