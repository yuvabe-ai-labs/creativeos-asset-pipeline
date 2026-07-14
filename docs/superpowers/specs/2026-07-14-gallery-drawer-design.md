# Gallery Drawer — Design Spec

**Date:** 2026-07-14
**Status:** Draft, ready for review
**Supersedes:** the reference-image dialog (`reference-image-picker-dialog.tsx` and browsers under `drive/` + `generations/`)

## Goal

Replace the modal reference-image picker with a persistent right-side drawer that lets operators browse Drive images and canvas generations by recency, filter/search across their whole Drive, and add images to the canvas via multi-select **or** drag-and-drop.

## Motivation

The current dialog is modal — it blocks the canvas while open, so users can't drag an image onto a specific node. It also forces the user to navigate the Drive folder tree, which is slow when you just want "recent images across everything." A drawer that stays open, sorts by recency across the entire Drive (owned + shared), and supports drag-and-drop turns the picker into a proper working surface.

## Non-goals

- Server-side Drive search across un-loaded pages (client-side substring search on loaded pages is enough for v1).
- Bulk "select all matching filter" or range-select with Shift-click.
- Keyboard nav inside the grid (arrow keys, Enter-to-toggle) — follow-up.
- Removing the old dialog files in the same PR — they're left in place for one cycle to catch stragglers.

## Architecture

Right drawer via the existing `Sheet` primitive (`@base-ui/react/dialog`, `side="right"`), ~480px wide, full canvas height. Two top-level tabs — **References** (Drive) and **Assets** (canvas generations). Below the tabs, a toolbar row with search + filter popover + grid/list toggle. The main area is either a masonry grid or a vertical list of tiles; infinite scroll via `react-intersection-observer`. Sticky footer with `N / 10 selected` and an Add button.

Data comes from two paginated endpoints — `/api/drive/images` (new, recency-sorted, flat across owned + shared) and `/api/canvas/[id]/generations` (existing). Both fetches are session-cached in module-level singletons; a refresh button in the header clears the cache and re-fetches.

Commit path (Add or drop) is shared: seed file nodes locally, flush the autosave to persist the rows, then upload full-res Drive bytes to GCS via the existing `/api/nodes/[id]/file/drive` endpoint. Generated images reuse their existing GCS URL — no re-upload.

## Layout

```
┌───────────────────────────────────────────────┐
│ Gallery                            ⟳     ✕   │  ← header
├───────────────────────────────────────────────┤
│ [References]  [Assets]                        │  ← 2 tabs
├───────────────────────────────────────────────┤
│ 🔍 Search…          [Filter ▾]  [⊞ ≡]        │  ← search + filter + view toggle
├───────────────────────────────────────────────┤
│                                               │
│    <masonry grid OR list — infinite scroll>  │
│                                               │
│    ┌──┐ ┌──┐ ┌──┐    ← click = toggle select │
│    │⤢ │ │  │ │  │    ← Expand icon on hover  │
│    └──┘ └──┘ └──┘    ← drag = to canvas/node │
│                                               │
├───────────────────────────────────────────────┤
│ 3 / 10 selected                [Add 3 →]     │
└───────────────────────────────────────────────┘
```

Sizes: 480px wide, full canvas height. Header 48px, tabs 40px, toolbar 44px, footer 56px.

## Entry points

1. **Top-right canvas pill** — new `GalleryDrawerTrigger` (`Images` icon + "Gallery" label) placed alongside `CanvasKBBadge` in the top-right overlay group.
2. **Keyboard shortcut `G`** — toggles drawer. Registered in `canvas.tsx`'s existing keydown listener; ignored when the active element is an editable field (`INPUT`, `TEXTAREA`, `contenteditable`).
3. **Pane right-click "Add Reference Image"** — existing menu item, rewired to open the drawer instead of the dialog.
4. **Node context-menu "Add Reference Image"** — existing menu item on eligible nodes; opens the drawer and remembers `connectToNodeId` for auto-connect on commit.

## Component decomposition

New folder: `src/components/canvas/gallery-drawer/`. One component per file, ~50–150 lines each.

| File | Purpose |
|---|---|
| `gallery-drawer.tsx` | Top-level `Sheet` + composition. Owns `open`, `activeTab`, `selectedIds`, `imageMap`, `connectToNodeId`, `dropPosition`. |
| `gallery-header.tsx` | Title + refresh button + close. |
| `gallery-tabs.tsx` | 2-tab segmented control (References / Assets). |
| `gallery-toolbar.tsx` | Composes search + filter popover + view-mode toggle. |
| `gallery-search.tsx` | Search input. |
| `gallery-filter-popover.tsx` | Popover: "Shared only" toggle + folder checkbox list. |
| `gallery-view-toggle.tsx` | Grid/List segmented control (thin wrapper reusing the existing `ViewModeToggle`). |
| `gallery-content.tsx` | Loader / empty / grid / list switch. Owns `viewMode` state. |
| `gallery-masonry.tsx` | `MasonryPhotoAlbum` + `ImageTile` + IntersectionObserver sentinel. |
| `gallery-list.tsx` | Vertical list of `ImageRow` + sentinel. |
| `gallery-footer.tsx` | "N / 10 selected" chip + Cancel / Add buttons. |
| `types.ts` | `GalleryTab`, `Filters`, `DriveImageItem`, `GalleryImage`. |

**Reused as-is:**

- `src/components/canvas/reference-image-picker/image-tile.tsx`
- `src/components/canvas/reference-image-picker/image-row.tsx`
- `src/components/shared/full-screen-image-zoom.tsx`
- `src/hooks/use-image-dimensions.ts`
- `src/services/file-node.service.ts`

**New hooks (`src/hooks/`):**

- `use-drive-images.ts` — session-cached paginated Drive image fetcher. Returns `{ pages, nextPageToken, loading, loadingMore, refresh, loadMore, availableFolders, loadError }`.
- `use-canvas-generations.ts` — session-cached generation fetcher. Returns `{ items, loading, refresh, loadError }`.
- `use-gallery-drawer.ts` — replaces `use-reference-image-picker.ts`. Exposes `{ open, setOpen, openDrawer({ position?, connectToNodeId? }), handleAdd(images, opts?) }`. Same DB commit + Drive → GCS upload path as before, with the existing retry-with-backoff.

**New context:** `src/components/canvas/gallery-drawer-context.tsx` — exposes `openDrawer` so the trigger button, quick-add menu, node context menus, and drop handlers can call it without prop drilling.

**New API route:** `src/app/api/drive/images/route.ts` — `GET` with optional `pageToken`; returns `{ items, nextPageToken }`.

**Existing files touched:**

- `src/components/canvas/canvas.tsx` — mount `<GalleryDrawer>`, wire trigger, keyboard shortcut, canvas pane drop handler.
- Five eligible node files (`prompt-node.tsx`, `image-gen-node.tsx`, `video-prompt-node.tsx`, `video-gen-node.tsx`, `shot-node.tsx`) — add `onDragOver` + `onDrop`.
- `src/components/canvas/quick-add-menu.tsx` — route "Add reference image" through the drawer context.

## Data layer

### New Drive endpoint: `GET /api/drive/images`

Single Drive API query using existing `queryDrive` helper:

```
q            = mimeType contains 'image/' and trashed=false
orderBy      = modifiedTime desc
pageSize     = 50
pageToken    = <optional cursor>
fields       = nextPageToken, files(id, name, mimeType, thumbnailLink,
                modifiedTime, ownedByMe, parents, shared)
supportsAllDrives           = true
includeItemsFromAllDrives   = true
```

Drive returns items across My Drive + shared-with-me + shared drives in a single response when the two `AllDrives` flags are true; no separate `sharedWithMe` query needed.

For each returned file, the route resolves `parentFolder` by taking the first entry in `parents` and calling `files.get?fields=id,name` on it. Parent lookups are batched and deduped per-request (a Map<parentId, Promise<Folder>>), so a page with 50 items sharing 5 folders makes 5 Drive calls, not 50.

Response type:

```ts
export type DriveImageItem = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailUrl: string;      // /api/drive/thumbnail/{id}
  previewUrl: string;        // /api/drive/file/{id}
  modifiedTime: string;
  ownedByMe: boolean;
  isShared: boolean;         // ownedByMe === false OR shared === true
  parentFolder: { id: string; name: string } | null;
};

export type DriveImagesResponse = {
  items: DriveImageItem[];
  nextPageToken: string | null;
};
```

The existing `/api/drive/files` route (folder-tree browsing) stays untouched — nothing in this spec touches it.

### Session cache

Both hooks (`use-drive-images`, `use-canvas-generations`) hold a module-level singleton keyed by canvasId (for generations) or a fixed key (for Drive, since Drive is user-scoped). First open of the drawer hits the network; subsequent opens render immediately from the cache. Cache survives drawer close/open; cleared on page reload.

The refresh button (⟳ in header) calls `refresh()` which: aborts any in-flight request, clears the cache entry, and re-fetches from page 1.

### Filter model (client-side)

```ts
type Filters = {
  sharedOnly: boolean;
  folderIds: Set<string>;
};
```

Filters apply to the loaded pages — no server round-trip. Combined with search:

```
visible = pages.flat()
  .filter(i => !filters.sharedOnly || i.isShared)
  .filter(i => filters.folderIds.size === 0 || (i.parentFolder && filters.folderIds.has(i.parentFolder.id)))
  .filter(i => !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase()));
```

`availableFolders` (surfaced by `use-drive-images`) is derived from the loaded pages — as the user scrolls, more folders appear in the filter popover. This is a deliberate tradeoff: no separate "list all folders" call, and the top folders (by recency of their contents) show up first anyway.

### Loading states

While the initial fetch is in flight (cache miss), the content area shows a centered `Loader2` spinner (existing `CenteredLoader` component, reused). While `loadMore()` is in flight, a small inline spinner sits above the sentinel so the user sees progress without the main grid blanking out.

### Infinite scroll

`react-intersection-observer` (install as new dep). A sentinel `<div ref={inViewRef} />` sits at the bottom of the grid / list. When `inView` flips true **and** `nextPageToken` is present **and** `loadingMore` is false, the hook fires `loadMore()`.

- `rootMargin: "200px"` — prefetch just before the sentinel scrolls into view.
- Guard on `loadingMore` prevents duplicate requests.
- On `loadError`, sentinel stops firing until the retry chip is clicked.

## Selection + commit

### Click flow (multi-select + Add)

1. Click tiles → `selectedIds` + `imageMap` update. Cap at 10 → toast "You can select up to 10 images at a time." (existing behavior, ported over).
2. Click "Add N →" in footer → `handleAdd(images, { position, connectToNodeId })`.
3. First pass (sync): for each image, `addNode("file", position, uuid)` + `updateNodeData(nodeId, seedData)` + optional `connectNodes(nodeId, connectToNodeId)`. Non-Drive picks set `fileUrl` directly from the generation URL and skip the `uploading` flag.
4. Drawer closes; selection state clears.
5. Second pass (async): `await flushAutosave()` (persists new node rows via the existing `AutosaveFlushContext`). Then fire `importDriveFile(nodeId, image)` in parallel for each Drive pick. Existing retry-with-backoff (400 / 800 / 1600 ms on "Node not found") handles autosave-vs-upload races.

Position for click-driven Add:
- If invoked from the pane right-click, use the recorded pane position.
- If invoked from a node context menu, use the node's `position` + a fixed offset (unchanged from the current `use-reference-image-picker.ts` behavior).
- If invoked from the top-right pill or `G` key with nothing else in flight, spawn near the current viewport center (`reactFlowInstance.screenToFlowPosition({ x: viewportCenterX, y: viewportCenterY })`).

### Drag & drop

- `dragStart` on a tile/row: serializes `{ images: GalleryImage[] }` to `dataTransfer.setData("application/x-creativeos-gallery-image", JSON.stringify(payload))`. If the dragged tile is one of the currently-selected images, the payload contains **all selected**. Otherwise it contains just that one image.
- Canvas pane (`ReactFlow` wrapper `<div>`): `onDragOver` → `e.preventDefault()` (opts into being a drop target). `onDrop` → guard on MIME, parse payload in a try/catch, compute flow position with `reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY })`, call `handleAdd(images, { position })`.
- Eligible nodes (`prompt` / `image-gen` / `video-prompt` / `video-gen` / `shot`): same `onDragOver` + `onDrop` on the outer wrapper `<div>`. On drop: `handleAdd(images, { position: node.position + OFFSET, connectToNodeId: node.id })`. React Flow's own drag handling doesn't interfere because our payload is on a custom MIME.
- Non-eligible nodes (`text` / `draw` / `script` / `file`): no drop handler. The event bubbles to the canvas pane → falls through to a floating file node at cursor.
- Drawer stays open across drops — the user might drop several batches.

## Error handling

| Scenario | Behavior |
|---|---|
| Drive fetch fails, page 1 | Content area shows "Couldn't load Drive images. [Retry]". Cache untouched. |
| Drive fetch fails, page N > 1 | Loaded pages stay visible. Small "Failed to load more. [Retry]" chip near the sentinel. Sentinel stops auto-firing until retry succeeds. |
| Generations fetch fails | Same pattern as Drive. |
| Autosave flush fails inside `handleAdd` | `console.error` + still fire uploads. Retry-with-backoff on `importDriveFile` covers the race. |
| Drive → GCS upload fails | Node `data.uploadError` is set; file node renders the existing "Upload failed" state in the thumbnail slot. |
| Drag payload malformed / wrong MIME | `onDrop` no-ops (try/catch). |
| Search + no results | Empty state: "No images match `foo` — try a different query or clear filters." |
| Filter yields empty from loaded pages, `nextPageToken` present | Empty state + "Load more pages to keep searching" hint. |
| Refresh mid-scroll | Abort in-flight fetch, clear cache, reset to page 1. |

## Selection state lifecycle

- `selectedIds` + `imageMap` live on the drawer (not per-tab). Switching References ↔ Assets preserves selection — user can pick 3 refs + 2 assets and commit them together. Footer count reflects total.
- Drawer close (X, ESC, click outside, `G` toggle when open): clears selection + search + filters + imageMap.
- Filters reset every open. This avoids "why is nothing showing?" surprises when reopening after a prior filtered session.

## Testing

### Unit / integration (Vitest)

| File | Coverage |
|---|---|
| `use-drive-images.test.ts` | First call fetches; second call hits cache. `refresh()` clears cache and re-fetches. `loadMore()` appends by pageToken, dedupes by id. Abort mid-fetch on refresh. |
| `use-canvas-generations.test.ts` | Fetch / cache-hit / refresh. |
| `use-gallery-drawer.test.ts` | `handleAdd` seeds nodes with correct data. Drive picks call `flushAutosave` before `importDriveFile`. Generated picks set `fileUrl` directly. `connectToNodeId` produces an edge. |
| `gallery-filter-popover.test.tsx` | Toggling folder / shared checkboxes updates applied filters. |
| `gallery-drawer.test.tsx` | Drawer opens on `openDrawer()`. Selection cap at 10 shows toast. Tab switch preserves selection. Close clears state. |
| `api/drive/images.test.ts` | Route returns paginated shape, forwards `pageToken`, orders by `modifiedTime desc`. Drive 5xx returns `apiError`. |

### Manual smoke checklist

- [ ] Open drawer via top-right pill, `G` key, pane right-click, node right-click.
- [ ] `G` shortcut ignored when typing in an editable field.
- [ ] Grid ↔ List toggle persists within session (resets on refresh).
- [ ] Preview zoom (Expand icon) opens `FullScreenImageZoom` with full-res URL for Drive, existing URL for generations.
- [ ] Infinite scroll fires on sentinel, stops at `nextPageToken === null`.
- [ ] Filter popover: shared-only + folder multi-select apply as `AND`.
- [ ] Search across loaded pages (case-insensitive, filename substring).
- [ ] Refresh clears cache, re-fetches, cancels in-flight.
- [ ] Click 10 tiles → 11th shows toast, doesn't select.
- [ ] Add: adds all selected, drawer closes, file nodes appear, Drive uploads finish, thumbnails swap in.
- [ ] Drag one unselected tile to canvas → 1 file node created at cursor.
- [ ] Drag onto Image Gen node → 1 file node + edge to Image Gen.
- [ ] With 3 selected, drag one selected → all 3 dropped.
- [ ] Drop on non-eligible node → falls through to canvas as floating node.
- [ ] Selection persists across tab switch.
- [ ] ESC / click-outside closes drawer + clears selection.

## Rollout

Single PR, single deploy. No feature flag — the drawer replaces the dialog entry points in the same commit. Old dialog components (`reference-image-picker-dialog.tsx`, `drive-image-browser.tsx`, `generations-image-browser.tsx`, `reference-image-footer.tsx`, `reference-image-picker-tabs.tsx`) stay in the tree for one cycle. Removed in a follow-up PR after we verify nothing else references them.

## Follow-ups (out of scope)

- Server-side Drive search for filenames not in loaded pages.
- Bulk select across pages ("Select all matching filter").
- Keyboard nav within the grid (arrow keys, Enter to toggle, Shift+click for range).
- Delete unused dialog files.

## ADR entry

Append to `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7:

> **D28 — Reference gallery is a right drawer, not a modal.** Chosen so users can browse assets while dragging onto nodes without losing canvas context. Rejected: dialog (blocks the canvas), left sidebar (cramps the canvas surface), floating palette (fights the generation tray). Refines: replaces the D8 modal picker. Originated → `2026-07-14-gallery-drawer-design.md`.
