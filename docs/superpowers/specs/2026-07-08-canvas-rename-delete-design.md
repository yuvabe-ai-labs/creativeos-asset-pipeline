# Canvas Rename & Delete — Design Spec

**Date:** 2026-07-08
**Issue:** YUV-164
**Status:** Approved

---

## Problem

Once a canvas is created, users have no way to rename it or delete it. Canvases are stuck with their original name and pile up with no way to clean them up.

---

## Scope

- Rename a canvas from the canvas list page
- Delete a canvas from the canvas list page
- Both triggered from a per-row `⋯` action menu

---

## Data Layer

**`src/lib/db/canvases.ts`** — two new functions:

```ts
renameCanvas(id: string, name: string): Promise<CanvasRow>
deleteCanvas(id: string): Promise<void>
```

- `renameCanvas` — updates `name` on the canvas row. Does NOT regenerate the slug (slug is a stable URL identifier; renaming the display name doesn't change the URL).
- `deleteCanvas` — deletes the canvas row. Nodes and edges cascade-delete via FK constraints already in place.

**`src/lib/actions/canvases.ts`** — two new server actions:

```ts
renameCanvasAction({ canvasId, clientSlug, name }: { canvasId: string; clientSlug: string; name: string }): Promise<void>
deleteCanvasAction({ canvasId, clientSlug }: { canvasId: string; clientSlug: string }): Promise<void>
```

Both call `revalidatePath(`/clients/${clientSlug}`)` on success so the server component re-fetches the canvas list.

---

## Row UI — `CanvasesTable`

Each row `<li>` becomes a `group relative` wrapper. The `<Link>` takes up the full row but has right padding reduced to make room for the action button.

A `⋯` (`MoreHorizontal` Lucide icon) button is pinned to the right of each row:
- `opacity-0 group-hover:opacity-100 transition-opacity` — invisible at rest, appears on hover
- `onClick` calls `e.preventDefault(); e.stopPropagation()` so it doesn't navigate
- Opens a shadcn `DropdownMenu` with two items: **Rename** and **Delete**

State in `CanvasesTable`:
```ts
const [renamingCanvas, setRenamingCanvas] = useState<CanvasRow | null>(null)
const [deletingCanvas, setDeletingCanvas] = useState<CanvasRow | null>(null)
```

---

## Rename Flow

Triggered by clicking "Rename" in the `⋯` dropdown → sets `renamingCanvas`.

A shadcn `Dialog` renders when `renamingCanvas !== null`:
- **Title:** "Rename canvas"
- **Input:** pre-filled with `renamingCanvas.name`, auto-focused
- **Footer:** "Cancel" (outline) + "Rename" (primary, disabled while pending, shows "Renaming…")

On confirm:
1. Validate: reject empty/whitespace with `toast.error("Canvas needs a name")`
2. `useTransition` → call `renameCanvasAction({ canvasId: renamingCanvas.id, clientSlug, name })`
3. On success: `router.refresh()`, `toast.success("Renamed")`, close dialog
4. On error: `toast.error("Failed to rename canvas")`

---

## Delete Flow

Triggered by clicking "Delete" in the `⋯` dropdown → sets `deletingCanvas`.

A shadcn `AlertDialog` renders when `deletingCanvas !== null`:
- **Title:** "Delete canvas?"
- **Description:** `This will permanently delete "[canvas name]" and all its nodes. This can't be undone.`
- **Footer:** "Cancel" (outline) + "Delete" (destructive variant, disabled while pending, shows "Deleting…")

On confirm:
1. `useTransition` → call `deleteCanvasAction({ canvasId: deletingCanvas.id, clientSlug })`
2. On success: `router.refresh()`, `toast.success("Canvas deleted")`, close dialog
3. On error: `toast.error("Failed to delete canvas")`

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/db/canvases.ts` | Add `renameCanvas`, `deleteCanvas` |
| `src/lib/actions/canvases.ts` | Add `renameCanvasAction`, `deleteCanvasAction` |
| `src/components/canvases/canvases-table.tsx` | Add `⋯` menu, rename dialog, delete alert dialog |

No new files needed. No API routes needed — server actions handle both operations.

---

## Error Handling

- Empty/whitespace name → client-side guard, `toast.error` before submitting
- DB error on rename/delete → `toast.error` with generic message
- Canvas not found → Supabase returns 0 rows; action throws, caught by try/catch in action

---

## Acceptance Criteria

- [ ] Each canvas row shows a `⋯` button on hover
- [ ] Clicking `⋯` opens a dropdown with Rename and Delete — does not navigate into the canvas
- [ ] Rename opens a dialog pre-filled with the current name
- [ ] Renamed canvas reflects the new name immediately in the list (via `router.refresh()`)
- [ ] Slug does not change on rename
- [ ] Empty/whitespace name is rejected before submitting
- [ ] Delete shows an AlertDialog with the canvas name and a warning
- [ ] Confirmed delete removes the canvas and all its nodes from the DB
- [ ] Cancelled delete does nothing
- [ ] Both actions show loading state on the confirm button while pending
- [ ] Both actions show a success/error toast on completion
