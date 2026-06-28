# Paste Image from Clipboard → File Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a canvas context-menu "Paste image" action (shown only when the clipboard holds an image) that creates a populated File node (image) at the cursor via the existing upload pipeline.

**Architecture:** A context-menu action — not a global paste listener. On menu-open we async-detect a clipboard image (fail-closed). On click: `addNode("file")` at the cursor `flowPos`, persist the node first (`saveCanvasNodesAction`, the same replace-all upsert autosave uses) to dodge the autosave race, upload the clipboard blob through the existing node-scoped `/file` route, then `updateNodeData`. On failure, the empty node is removed.

**Tech Stack:** Next.js 16 (App Router), React 19, Zustand + store-provider, React Flow (`@xyflow/react`), Supabase Storage, Vitest, sonner toasts, Lucide, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-28-clipboard-paste-image-design.md`.

## Global Constraints

- **No DB migration; no new upload endpoint.** Reuse `POST /api/nodes/:id/file` and the `node-files` bucket.
- **Option A for the persist race (spec §5):** `addNode` → `await saveCanvasNodesAction(canvasId, <full node list>)` → upload → `updateNodeData`. `saveCanvasNodes` is replace-all, so always pass the **full** current node list (read authoritatively from the store, never reconstructed).
- **Images only**, validated by the existing `/file` route against `FILE_NODE_IMAGE_EXTENSIONS = {png, jpg, jpeg, webp}` and `FILE_NODE_IMAGE_SIZE_LIMIT = 10 MB`.
- **Context-menu action, not global Ctrl/⌘+V** — never hijacks paste in text fields.
- **Detection fails closed:** if `navigator.clipboard.read()` is unavailable or denied, the action does not appear.
- **shadcn/house style:** Lucide icons (1.5 stroke); the context menu's existing row styling.
- **Test command:** `npm test` (Vitest). Pure helpers get failing-test-first TDD; the menu + canvas wiring have no component harness in this repo and are verified manually via `npm run dev`.
- **Pre-existing repo failures unrelated to this work:** `registry.test.ts` (2 gemini-id mismatches) and lint errors in `canvas-editor-skeleton.tsx` / `video-gen/providers/sora.ts`. Do not treat as regressions.
- **Branch:** `feat/clipboard-paste-image` (already checked out, off `main`). Commit after every task.

---

### Task 1: Pure clipboard-image helpers (`clipboardImageMime`, `mimeToImageExt`)

**Files:**
- Create: `src/lib/nodes/clipboard-image.ts`
- Test: `src/lib/nodes/clipboard-image.test.ts`

**Interfaces:**
- Produces: `clipboardImageMime(types: readonly string[]): string | null` (first `image/*` type) and `mimeToImageExt(mime: string): "png" | "jpg" | "webp" | null` (supported image MIME → extension, else null).
- Consumes: `FILE_NODE_IMAGE_EXTENSIONS` from `./file-constants`.
- Consumed by: Task 2 (wrappers), Task 4 (canvas wiring).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/nodes/clipboard-image.test.ts
import { describe, it, expect } from "vitest";
import { clipboardImageMime, mimeToImageExt } from "./clipboard-image";

describe("clipboardImageMime", () => {
  it("returns the first image/* type", () => {
    expect(clipboardImageMime(["text/plain", "image/png"])).toBe("image/png");
  });
  it("returns null when no image type is present", () => {
    expect(clipboardImageMime(["text/plain", "text/html"])).toBeNull();
  });
  it("returns null for an empty list", () => {
    expect(clipboardImageMime([])).toBeNull();
  });
});

describe("mimeToImageExt", () => {
  it("maps supported image mimes to extensions", () => {
    expect(mimeToImageExt("image/png")).toBe("png");
    expect(mimeToImageExt("image/jpeg")).toBe("jpg");
    expect(mimeToImageExt("image/webp")).toBe("webp");
  });
  it("returns null for unsupported image mimes", () => {
    expect(mimeToImageExt("image/gif")).toBeNull();
    expect(mimeToImageExt("image/svg+xml")).toBeNull();
  });
  it("returns null for non-image mimes", () => {
    expect(mimeToImageExt("text/plain")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/clipboard-image.test.ts`
Expected: FAIL — `Cannot find module "./clipboard-image"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/nodes/clipboard-image.ts
// Pure clipboard-image helpers for the canvas "Paste image" action. The browser
// wrappers (navigator.clipboard) are appended in Task 2 and are not unit-tested.
import { FILE_NODE_IMAGE_EXTENSIONS } from "./file-constants";

// First image/* MIME among the clipboard item types, or null.
export function clipboardImageMime(types: readonly string[]): string | null {
  return types.find((t) => t.startsWith("image/")) ?? null;
}

// Supported image MIME → file extension (matching FILE_NODE_IMAGE_EXTENSIONS),
// or null when unsupported (e.g. image/gif, image/svg+xml).
export function mimeToImageExt(mime: string): "png" | "jpg" | "webp" | null {
  const map: Record<string, "png" | "jpg" | "webp"> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  const ext = map[mime];
  return ext && FILE_NODE_IMAGE_EXTENSIONS.has(ext) ? ext : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/clipboard-image.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/clipboard-image.ts src/lib/nodes/clipboard-image.test.ts
git commit -m "$(printf 'feat(paste): add pure clipboard-image helpers (mime + ext)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: Clipboard browser wrappers (`clipboardHasImage`, `readClipboardImage`)

**Files:**
- Modify: `src/lib/nodes/clipboard-image.ts` (append)

**Interfaces:**
- Produces: `clipboardHasImage(): Promise<boolean>` and `readClipboardImage(): Promise<{ blob: Blob; ext: string; filename: string } | null>`.
- Consumes: `clipboardImageMime`, `mimeToImageExt` (Task 1); `navigator.clipboard.read()`.
- Consumed by: Task 4 (canvas wiring).
- Note: browser-only wrappers; no unit test (repo has no DOM/clipboard harness). Verified in Task 5.

- [ ] **Step 1: Append the wrappers to `clipboard-image.ts`**

```ts
// ── Browser wrappers (navigator.clipboard) — not unit-tested ──────────────────

// True if the clipboard currently holds a supported image. Fail-closed: returns
// false if the Clipboard API is unavailable or permission is denied.
export async function clipboardHasImage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.read) return false;
    const items = await navigator.clipboard.read();
    return items.some((item) => clipboardImageMime(item.types) !== null);
  } catch {
    return false;
  }
}

// Read the first supported image off the clipboard as a named, File-ready blob,
// or null if none present / API unavailable / permission denied.
export async function readClipboardImage(): Promise<
  { blob: Blob; ext: string; filename: string } | null
> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.read) return null;
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const mime = clipboardImageMime(item.types);
      const ext = mime ? mimeToImageExt(mime) : null;
      if (mime && ext) {
        const blob = await item.getType(mime);
        return { blob, ext, filename: `pasted-${crypto.randomUUID()}.${ext}` };
      }
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Type-check & confirm existing tests still pass**

Run: `npx tsc --noEmit 2>&1 | grep -v trigger | grep -i error || echo CLEAN` then `npx vitest run src/lib/nodes/clipboard-image.test.ts`
Expected: `CLEAN`; 6 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/nodes/clipboard-image.ts
git commit -m "$(printf 'feat(paste): add clipboard read wrappers (hasImage + readImage)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: "Paste image" row in the canvas context menu

**Files:**
- Modify: `src/components/canvas/canvas-context-menu.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `CanvasContextMenuProps` gains `canPasteImage?: boolean` and `onPasteImage?: () => void`. When `canPasteImage` is true, a "Paste image" row renders above the add-node list and calls `onPasteImage` (then `onClose`).
- Consumed by: Task 4 (canvas passes these props).
- Note: presentational; verified visually in Task 5.

- [ ] **Step 1: Add the props, the row, and dynamic menu height**

In `src/components/canvas/canvas-context-menu.tsx`:

(a) Add `ClipboardPaste` to the lucide import:

```tsx
import { FileText, ImageIcon, Paperclip, StickyNote, Sparkles, Pencil, Clapperboard, ClipboardPaste, type LucideIcon } from "lucide-react";
```

(b) Extend the props interface:

```tsx
interface CanvasContextMenuProps {
  screenX: number;
  screenY: number;
  onSelect: (type: AddNodeType) => void;
  onClose: () => void;
  canPasteImage?: boolean;
  onPasteImage?: () => void;
}
```

(c) Destructure the new props and compute the menu height dynamically (the extra
row ≈ 36px). Replace the existing `const y = ...` line's use of `MENU_H`:

```tsx
export function CanvasContextMenu({ screenX, screenY, onSelect, onClose, canPasteImage, onPasteImage }: CanvasContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  const menuH = canPasteImage ? MENU_H + 44 : MENU_H;
  const x = screenX + MENU_W > window.innerWidth  ? screenX - MENU_W : screenX;
  const y = screenY + menuH > window.innerHeight ? screenY - menuH : screenY;
```

(d) Render the "Paste image" row + a divider at the top of the menu body, before
the `{OPTIONS.map(...)}`:

```tsx
    >
      {canPasteImage && onPasteImage && (
        <>
          <button
            type="button"
            onClick={() => { onPasteImage(); onClose(); }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/5"
          >
            <ClipboardPaste className="size-4 shrink-0" strokeWidth={1.5} />
            Paste image
          </button>
          <div className="my-1 h-px bg-neutral-200" />
        </>
      )}
      {OPTIONS.map(({ type, label, icon: Icon }) => (
```

- [ ] **Step 2: Type-check & lint**

Run: `npx tsc --noEmit 2>&1 | grep -v trigger | grep -i error || echo CLEAN` then `npx eslint src/components/canvas/canvas-context-menu.tsx`
Expected: `CLEAN`; no lint output.

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/canvas-context-menu.tsx
git commit -m "$(printf 'feat(paste): add Paste image row to the canvas context menu\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: Wire detection + paste handler into the canvas (+ store getState accessor)

**Files:**
- Modify: `src/components/canvas/canvas-store-provider.tsx` (add `useCanvasStoreApi`)
- Modify: `src/components/canvas/canvas.tsx`

**Interfaces:**
- Consumes: `readClipboardImage`/`clipboardHasImage` (Task 2); `CanvasContextMenu` `canPasteImage`/`onPasteImage` (Task 3); `saveCanvasNodesAction` + `flowToPersisted` (existing); the store's `addNode`/`updateNodeData`/`deleteNode`.
- Produces: `useCanvasStoreApi(): CanvasStore` (raw store with `.getState()`); a working "Paste image" flow.
- Note: no automated test (no canvas harness); verified manually in Task 5.

- [ ] **Step 1: Expose the raw store from the provider**

In `src/components/canvas/canvas-store-provider.tsx`, append after `useCanvasStore`:

```tsx
// Raw store accessor — for reading the authoritative latest state synchronously
// (e.g. the node list immediately after addNode), where a selector hook would lag.
export function useCanvasStoreApi(): CanvasStore {
  const store = useContext(CanvasStoreContext);
  if (!store) {
    throw new Error("useCanvasStoreApi must be used within <CanvasStoreProvider>");
  }
  return store;
}
```

- [ ] **Step 2: Add imports to `canvas.tsx`**

Add (near the other imports):

```tsx
import { toast } from "sonner";
import { flowToPersisted } from "@/lib/canvas-nodes";
import { saveCanvasNodesAction } from "@/lib/actions/nodes";
import { readClipboardImage, clipboardHasImage } from "@/lib/nodes/clipboard-image";
import { useCanvasStore, useCanvasStoreApi } from "./canvas-store-provider";
```

(Note: `useCanvasStore` is already imported from `./canvas-store-provider`; merge the named import rather than duplicating it.)

- [ ] **Step 3: Pull `updateNodeData` + `deleteNode` from the store; get the store api**

In the `useCanvasStore(useShallow((s) => ({ ... })))` selector object, add two entries:

```tsx
      addNode: s.addNode,
      connectNodes: s.connectNodes,
      duplicateNode: s.duplicateNode,
      updateNodeData: s.updateNodeData,
      deleteNode: s.deleteNode,
```

Destructure them from the hook result (add `updateNodeData, deleteNode` to the existing destructure list), and add below it:

```tsx
  const storeApi = useCanvasStoreApi();
```

- [ ] **Step 4: Track `canPasteImage` and detect on menu-open**

Add state next to the existing `contextMenu` state:

```tsx
  const [canPaste, setCanPaste] = useState(false);
```

In `onPaneContextMenu`, after `setContextMenu({ ... })`, kick off detection:

```tsx
          setContextMenu({ screenX: e.clientX, screenY: e.clientY, flowPos });
          setCanPaste(false);
          void clipboardHasImage().then(setCanPaste);
```

In `onPaneClick`, also reset it:

```tsx
        onPaneClick={() => { setContextMenu(null); setCanPaste(false); }}
```

- [ ] **Step 5: Implement `handlePasteImage`**

Add this `useCallback` near `handleAddNode`:

```tsx
  const handlePasteImage = useCallback(
    async (flowPos: XYPosition) => {
      const img = await readClipboardImage();
      if (!img) {
        toast.error("Couldn't read an image from the clipboard.");
        return;
      }
      const newNodeId = crypto.randomUUID();
      addNode("file", flowPos, newNodeId);
      try {
        // Persist the node first (replace-all upsert) so the /file route finds it.
        await saveCanvasNodesAction(
          canvasId,
          storeApi.getState().nodes.map(flowToPersisted),
        );
        const form = new FormData();
        form.append("file", new File([img.blob], img.filename, { type: img.blob.type }));
        const res = await fetch(`/api/nodes/${newNodeId}/file`, { method: "POST", body: form });
        const json = (await res.json()) as {
          filename?: string;
          fileExt?: string;
          fileKind?: string;
          fileUrl?: string;
          error?: string;
        };
        if (!res.ok || !json.fileUrl) throw new Error(json.error ?? "Upload failed");
        updateNodeData(newNodeId, {
          filename: json.filename,
          fileExt: json.fileExt,
          fileKind: json.fileKind,
          fileUrl: json.fileUrl,
        });
        toast.success("Image pasted");
      } catch (e) {
        deleteNode(newNodeId);
        toast.error(e instanceof Error ? e.message : "Couldn't paste image");
      }
    },
    [addNode, updateNodeData, deleteNode, canvasId, storeApi],
  );
```

- [ ] **Step 6: Pass the props to `CanvasContextMenu`**

Update the `<CanvasContextMenu ... />` render:

```tsx
        <CanvasContextMenu
          screenX={contextMenu.screenX}
          screenY={contextMenu.screenY}
          onSelect={(type) => handleAddNode(type, contextMenu.flowPos)}
          onClose={() => setContextMenu(null)}
          canPasteImage={canPaste}
          onPasteImage={() => handlePasteImage(contextMenu.flowPos)}
        />
```

- [ ] **Step 7: Type-check & lint**

Run: `npx tsc --noEmit 2>&1 | grep -v trigger | grep -i error || echo CLEAN` then `npx eslint src/components/canvas/canvas.tsx src/components/canvas/canvas-store-provider.tsx`
Expected: `CLEAN`; no lint output.

- [ ] **Step 8: Commit**

```bash
git add src/components/canvas/canvas.tsx src/components/canvas/canvas-store-provider.tsx
git commit -m "$(printf 'feat(paste): wire clipboard detection + paste-to-File-node into canvas\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: Full-suite green + manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the suite**

Run: `npm test`
Expected: all green **except** the 2 pre-existing `registry.test.ts` failures; the 6 new `clipboard-image` tests pass.

- [ ] **Step 2: Type-check + lint the changed files**

Run: `npx tsc --noEmit 2>&1 | grep -v trigger | grep -i error || echo CLEAN` then `npx eslint $(git diff --name-only main...HEAD -- 'src/**/*.ts' 'src/**/*.tsx')`
Expected: `CLEAN`; no lint output from changed files.

- [ ] **Step 3: Manual verification (`npm run dev`)**

1. Copy an image to the clipboard (screenshot or "copy image" from a browser). Right-click the canvas → **"Paste image"** appears → click → a File node with the image renders at the cursor; toast "Image pasted".
2. Copy only text. Right-click the canvas → **"Paste image" does not appear**.
3. Paste an image, then connect the new File node to an Image Gen node and confirm it works as an image reference (and, with the image-editing branch, as an edit base).

- [ ] **Step 4: Commit (only if cleanup was needed)**

```bash
git add -A && git commit -m "$(printf 'chore(paste): suite green + verification checkoff\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Out of scope (deferred)

- Global Ctrl/⌘+V paste capture.
- Pasting directly into an Image Gen node as a reference (always a standalone File node).
- Multi-image clipboard (pastes the first image only).
- Firefox without `navigator.clipboard.read()` (action simply doesn't appear).
