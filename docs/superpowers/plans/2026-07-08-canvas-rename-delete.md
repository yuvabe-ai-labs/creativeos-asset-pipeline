# Canvas Rename & Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rename and delete actions to every canvas row in the canvas list page, triggered from a `⋯` popover menu that appears on hover.

**Architecture:** DB functions → server actions → client component. No new API routes. The `CanvasesTable` client component gains a `⋯` button per row that opens a Base UI `Popover` with Rename and Delete options. Rename uses a `Dialog`, Delete uses an `AlertDialog` — both already in the UI kit.

**Tech Stack:** Next.js 15 App Router, Supabase, Base UI (via shadcn wrappers), `useTransition`, `router.refresh()`

---

## File Map

| File | Change |
|---|---|
| `src/lib/db/canvases.ts` | Add `renameCanvas`, `deleteCanvas` |
| `src/lib/actions/canvases.ts` | Add `renameCanvasAction`, `deleteCanvasAction` |
| `src/components/canvases/canvases-table.tsx` | Add `⋯` popover menu, rename dialog, delete alert dialog |

---

### Task 1: Add `renameCanvas` and `deleteCanvas` to the DB layer

**Files:**
- Modify: `src/lib/db/canvases.ts`

- [ ] **Step 1: Add `renameCanvas` and `deleteCanvas` at the bottom of `src/lib/db/canvases.ts`**

```ts
export async function renameCanvas(
  id: string,
  name: string,
): Promise<CanvasRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .update({ name })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CanvasRow;
}

export async function deleteCanvas(id: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("canvases")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db/canvases.ts
git commit -m "feat: add renameCanvas and deleteCanvas DB helpers"
```

---

### Task 2: Add server actions for rename and delete

**Files:**
- Modify: `src/lib/actions/canvases.ts`

- [ ] **Step 1: Add the two imports at the top of `src/lib/actions/canvases.ts`**

Add `renameCanvas` and `deleteCanvas` to the existing import from `@/lib/db/canvases`:

```ts
import { createCanvas, renameCanvas, deleteCanvas } from "@/lib/db/canvases";
```

- [ ] **Step 2: Add `renameCanvasAction` and `deleteCanvasAction` at the bottom of `src/lib/actions/canvases.ts`**

```ts
export async function renameCanvasAction(input: {
  canvasId: string;
  clientSlug: string;
  name: string;
}): Promise<void> {
  const name = input.name?.trim();
  if (!name) throw new Error("Canvas needs a name");
  await renameCanvas(input.canvasId, name);
  revalidatePath(`/clients/${input.clientSlug}`);
}

export async function deleteCanvasAction(input: {
  canvasId: string;
  clientSlug: string;
}): Promise<void> {
  await deleteCanvas(input.canvasId);
  revalidatePath(`/clients/${input.clientSlug}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/canvases.ts
git commit -m "feat: add renameCanvasAction and deleteCanvasAction server actions"
```

---

### Task 3: Add `⋯` popover menu, rename dialog, and delete alert dialog to `CanvasesTable`

**Files:**
- Modify: `src/components/canvases/canvases-table.tsx`

- [ ] **Step 1: Replace the entire contents of `src/components/canvases/canvases-table.tsx` with the following**

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { filterAndSort, type SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { renameCanvasAction, deleteCanvasAction } from "@/lib/actions/canvases";
import type { CanvasRow } from "@/lib/db/types";

export function CanvasesTable({
  canvases,
  clientSlug,
}: {
  canvases: CanvasRow[];
  clientSlug: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [renamingCanvas, setRenamingCanvas] = useState<CanvasRow | null>(null);
  const [deletingCanvas, setDeletingCanvas] = useState<CanvasRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamePending, startRenameTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();

  const rows = useMemo(
    () =>
      filterAndSort(canvases, query, sort, {
        name: (c) => c.name,
        timestamp: (c) => c.updated_at,
      }),
    [canvases, query, sort],
  );

  function openRename(canvas: CanvasRow) {
    setRenamingCanvas(canvas);
    setRenameValue(canvas.name);
  }

  function handleRename() {
    if (!renamingCanvas) return;
    if (!renameValue.trim()) {
      toast.error("Canvas needs a name");
      return;
    }
    startRenameTransition(async () => {
      try {
        await renameCanvasAction({
          canvasId: renamingCanvas.id,
          clientSlug,
          name: renameValue.trim(),
        });
        router.refresh();
        toast.success("Renamed");
        setRenamingCanvas(null);
      } catch {
        toast.error("Failed to rename canvas");
      }
    });
  }

  function handleDelete() {
    if (!deletingCanvas) return;
    startDeleteTransition(async () => {
      try {
        await deleteCanvasAction({
          canvasId: deletingCanvas.id,
          clientSlug,
        });
        router.refresh();
        toast.success("Canvas deleted");
        setDeletingCanvas(null);
      } catch {
        toast.error("Failed to delete canvas");
      }
    });
  }

  return (
    <>
      <div>
        <ListToolbar
          query={query}
          onQueryChange={setQuery}
          sort={sort}
          onSortChange={setSort}
          placeholder="Search canvases…"
        />

        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <div className="text-eyebrow flex items-center gap-4 border-b bg-muted/40 px-5 py-3 text-[0.7rem] text-muted-foreground/80">
            <span className="flex-[3]">Canvas</span>
            <span className="flex-[2]">Last edited</span>
            <span className="flex-1 text-right">Created</span>
            <span className="w-8" />
          </div>

          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              No canvases match &quot;{query}&quot;.
            </p>
          ) : (
            <ul>
              {rows.map((canvas) => (
                <li key={canvas.id} className="group relative border-b last:border-b-0">
                  <Link
                    href={`/clients/${clientSlug}/canvases/${canvas.slug}`}
                    className="flex items-center gap-4 px-5 py-3.5 pr-12 transition-colors hover:bg-muted/40"
                  >
                    <span className="flex-[3] font-medium">{canvas.name}</span>
                    <span className="flex-[2] text-sm text-muted-foreground">
                      {formatRelativeTime(canvas.updated_at)}
                    </span>
                    <span className="flex flex-1 items-center justify-end gap-2 text-sm text-muted-foreground">
                      {new Date(canvas.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                      <ChevronRight
                        className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5"
                        strokeWidth={1.5}
                      />
                    </span>
                  </Link>

                  {/* ⋯ action menu — sits on top of the link */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                    <Popover>
                      <PopoverTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground"
                            onClick={(e) => e.preventDefault()}
                          >
                            <MoreHorizontal className="size-4" strokeWidth={1.5} />
                          </Button>
                        }
                      />
                      <PopoverContent align="end" className="w-36 p-1">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                          onClick={() => openRename(canvas)}
                        >
                          <Pencil className="size-3.5" strokeWidth={1.5} />
                          Rename
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
                          onClick={() => setDeletingCanvas(canvas)}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.5} />
                          Delete
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Rename dialog */}
      <Dialog
        open={renamingCanvas !== null}
        onOpenChange={(o) => { if (!o) setRenamingCanvas(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename canvas</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="rename-canvas-name">Name</Label>
            <Input
              id="rename-canvas-name"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingCanvas(null)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={renamePending}>
              {renamePending ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete alert dialog */}
      <AlertDialog
        open={deletingCanvas !== null}
        onOpenChange={(o) => { if (!o) setDeletingCanvas(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <strong>&quot;{deletingCanvas?.name}&quot;</strong> and all its
              nodes. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeletingCanvas(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePending}
            >
              {deletePending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Check the Popover component exports the right names**

Run:
```bash
grep -n "export function Popover\|export function PopoverTrigger\|export function PopoverContent" src/components/ui/popover.tsx
```

Expected output: three lines — one each for `Popover`, `PopoverTrigger`, `PopoverContent`. If names differ, update the imports in `canvases-table.tsx` to match.

- [ ] **Step 3: Check the AlertDialog component exports the right names**

Run:
```bash
grep -n "^function Alert" src/components/ui/alert-dialog.tsx
```

Expected output: lines for `AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`. If any name differs, update the import in `canvases-table.tsx`.

- [ ] **Step 4: Build to verify no TypeScript errors**

Run:
```bash
cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit
```

Expected: no errors. If there are import name mismatches from Steps 2–3, fix them now.

- [ ] **Step 5: Manual smoke test**

1. Run `npm run dev`
2. Navigate to any client's canvas list page
3. Hover a canvas row — verify `⋯` button appears
4. Click `⋯` — verify popover opens with Rename and Delete, clicking does NOT navigate to the canvas
5. Click Rename — verify dialog opens pre-filled with canvas name, press Enter or click Rename, verify list updates
6. Click `⋯` → Delete — verify alert dialog shows canvas name, click Delete, verify row disappears
7. Click `⋯` → Delete → Cancel — verify nothing happens

- [ ] **Step 6: Commit**

```bash
git add src/components/canvases/canvases-table.tsx
git commit -m "feat: add rename and delete actions to canvas list rows (YUV-164)"
```
