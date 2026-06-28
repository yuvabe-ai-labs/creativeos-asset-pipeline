# Paste Image from Clipboard → File Node — Design

**Date:** 2026-06-28
**Status:** Design / spec (awaiting review → writing-plans)
**Author:** Cyril + Claude
**Relates to:** PRD §11.4 (File node), §7.1; the existing File-node upload pipeline
(`src/app/api/nodes/[id]/file/route.ts`) and canvas context menu
(`src/components/canvas/canvas-context-menu.tsx`).
**Independent of** the image-editing feature (`feat/image-editing`) — but synergistic: a
pasted reference becomes a File-node image that the new edit flow can then edit.

---

## 1. Problem

Designers constantly have reference images on the clipboard (a screenshot, a product shot
copied from Slack/Figma/a browser). Today the only way to get one onto the canvas is: add a
File node → open it → pick a file from disk. There is no way to **paste** an image straight
in. We want: **right-click the canvas → "Paste image" → a File node (image) is created at the
cursor**, available only when the clipboard actually holds an image.

## 2. Goals

- A **"Paste image"** action in the canvas pane context menu, shown **only when the clipboard
  contains an image**.
- Clicking it creates a **File node of kind `image`** at the cursor position (the `flowPos`
  the context menu already computes), populated from the clipboard image.
- Reuse the existing File-node upload pipeline and storage — no parallel upload path.

## 3. Non-goals

- **Global `Ctrl/⌘+V` paste capture.** Explicitly a context-menu action, so it never hijacks
  paste inside text fields (prompt box, edit-instruction box, etc.).
- **Pasting onto a specific node** (e.g. dropping a reference straight into an Image Gen
  node). Always a standalone File node (the existing connect workflow wires it onward).
- **Pasting non-image clipboard content** (text/files-from-OS). Images only.
- A new node-agnostic upload endpoint (Option C, considered and rejected — see §5).

## 4. Architecture / flow

The canvas pane context menu already opens at the cursor and computes a `flowPos` via
`screenToFlowPosition` ([canvas.tsx:211-218](../../../src/components/canvas/canvas.tsx#L211-L218)),
then calls `onSelect(type)` → `handleAddNode(type, flowPos)`. We add a separate **"Paste
image"** action alongside the existing add-node options.

```
right-click canvas
  → onPaneContextMenu: compute flowPos, open menu,
                       async-detect whether the clipboard has an image
  → menu shows "Paste image" only if an image was detected
  → click → handlePasteImage(flowPos)
```

`handlePasteImage(flowPos)` (Option A — reuse `/file`, persist first):

1. `const img = await readClipboardImage()` → `{ blob, ext, filename } | null`. If null →
   toast "Couldn't read an image from the clipboard." and stop.
2. `const newId = crypto.randomUUID(); addNode("file", flowPos, newId)` (store only).
3. **`await saveCanvasNodesAction(canvasId, <full current node list incl. the new node>)`** —
   the same replace-all upsert autosave uses ([db/nodes.ts:66-91](../../../src/lib/db/nodes.ts#L66-L91)).
   This closes the persist race (the `/file` route 404s if the node row is absent, and
   autosave is debounced 600ms).
4. `POST /api/nodes/:newId/file` with `FormData` (`file` = `new File([blob], filename,
   { type: mime })`) → returns `{ filename, fileExt, fileKind: "image", fileUrl }`.
5. `updateNodeData(newId, { filename, fileExt, fileKind, fileUrl })`; autosave persists the
   populated node.
6. On upload failure → toast the error and `deleteNode(newId)` (remove the empty node).

### Clipboard image detection
On `onPaneContextMenu` (a user gesture, so the Clipboard API is permitted), kick off
`clipboardHasImage()` and store the result; the menu reveals "Paste image" when it resolves
true. Detection reads `ClipboardItem.types` only (no blob fetch) and **fails closed** — if the
Clipboard API is unavailable or permission is denied, it returns false and the item simply
doesn't appear (no dead action).

## 5. The persist-race decision (Option A)

`addNode` only mutates the Zustand store; the node row reaches the DB ~600ms later via
debounced autosave. The node-scoped `/file` route does `SELECT … WHERE id = :id` and returns
404 if the row is missing, so *create-then-immediately-upload* would lose the race.

**Chosen — Option A:** insert an awaited `saveCanvasNodesAction(...)` between `addNode` and
the upload, forcing the row into the DB first. Pure reuse of the existing `/file` route and
the existing save action; cost is one extra save round-trip and a brief empty-node flash.
**Rejected — Option C** (a node-agnostic `POST /api/canvases/:id/paste-image` that uploads
bytes with no node lookup): cleaner UX and no race, but adds a parallel upload endpoint when
`/file` already does the job — violates "reuse, don't add cases."

`saveCanvasNodesAction` is **replace-all** (upserts the passed nodes, deletes any canvas node
not in the list), so step 3 MUST pass the **full** current node list including the new node —
never just the new one. The post-`addNode` node list is read authoritatively from the store
(not reconstructed by hand).

## 6. Components / files

- **New pure helper** `src/lib/nodes/clipboard-image.ts`:
  - `clipboardImageMime(types: readonly string[]): string | null` — first `image/*` type, or
    null. (pure, unit-tested)
  - `mimeToImageExt(mime: string): "png" | "jpg" | "webp" | null` — supported image MIME →
    extension (matching `FILE_NODE_IMAGE_EXTENSIONS`); null if unsupported. (pure, unit-tested)
  - `readClipboardImage(): Promise<{ blob: Blob; ext: string; filename: string } | null>` —
    thin wrapper over `navigator.clipboard.read()`: find the first item whose type maps via
    `mimeToImageExt`, `getType(mime)` → blob, synthesize `filename = pasted-<crypto.randomUUID()>.<ext>`.
    Returns null on no-image / API-unavailable / error. (not unit-tested — browser wrapper)
  - `clipboardHasImage(): Promise<boolean>` — `navigator.clipboard.read()` then
    `clipboardImageMime(item.types)`; false on any error. (not unit-tested — browser wrapper)
- **Modify** `src/components/canvas/canvas-context-menu.tsx`: add an optional **Paste image**
  row (Lucide `ClipboardPaste`), rendered above the add-node list only when a new
  `canPasteImage` prop is true, calling a new `onPasteImage` prop. Bump the `MENU_H` constant
  (used for edge-flip positioning) to account for the extra row.
- **Modify** `src/components/canvas/canvas.tsx`: track `canPasteImage` in the context-menu
  state (set async on open via `clipboardHasImage()`), pass `canPasteImage`/`onPasteImage`
  to the menu, and implement `handlePasteImage(flowPos)` (the §4 flow). The store selector
  currently pulls `addNode`/`connectNodes`/`duplicateNode` etc. but **not** `updateNodeData`
  or `deleteNode` — add both to the `useShallow` selector. `canvasId` is already a prop. Read
  the post-`addNode` node list authoritatively via the canvas store's `getState()` (exposed by
  `canvas-store-provider`) — do not reconstruct it by hand.

No DB migration. No changes to `/file` route, storage layout, or `ImageGenNodeData`.

## 7. Error / edge handling

- No image in clipboard → item hidden (detection fail-closed). If a read fails between open
  and click → toast "Couldn't read an image from the clipboard."
- Unsupported image type / oversize → the existing `/file` validation (`FILE_NODE_IMAGE_EXTENSIONS`,
  `FILE_NODE_IMAGE_SIZE_LIMIT` = 10 MB) rejects it; surface the message and `deleteNode` the
  empty node.
- Browsers without `navigator.clipboard.read()` (e.g. older Firefox) → detection returns
  false → the action never shows. Acceptable (internal tool, Chromium-first).

## 8. Testing strategy

- **`clipboardImageMime` (pure):** unit tests — picks the first `image/*`, returns null when
  only `text/plain`/`text/html` present, handles empty. *(Write first, RED.)*
- **`mimeToImageExt` (pure):** unit tests — `image/png→png`, `image/jpeg→jpg`,
  `image/webp→webp`, `image/gif→null` (not in `FILE_NODE_IMAGE_EXTENSIONS`), unknown→null.
- **Context menu + `handlePasteImage`:** verified manually via `npm run dev` (no component
  harness in the repo) — right-click with an image on the clipboard shows "Paste image";
  clicking creates a populated File-node image at the cursor; right-click with only text on
  the clipboard does not show the item.

## 9. Rollout / scope order

1. `clipboard-image.ts` pure helpers (`clipboardImageMime`, `mimeToImageExt`) + tests.
2. `readClipboardImage` / `clipboardHasImage` browser wrappers (same file).
3. `CanvasContextMenu` — `canPasteImage` + `onPasteImage` + the Paste-image row + `MENU_H` bump.
4. `canvas.tsx` — detection on open, `handlePasteImage`, wiring. Manual verification.

## 10. Open questions (resolved)

- **Trigger?** → Context-menu action at the cursor, gated on clipboard having an image (not a
  global Ctrl+V listener) — §1/§3.
- **Placement?** → The cursor's `flowPos`, reusing the existing context-menu position.
- **Reuse vs. new endpoint for the race?** → Option A: reuse `/file`, persist the node first
  (§5). No new upload endpoint.
- **Paste onto a node as a reference?** → Out of scope; always a standalone File node (§3).
