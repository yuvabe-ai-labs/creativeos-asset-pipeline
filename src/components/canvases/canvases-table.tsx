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
            <span className="flex-3">Canvas</span>
            <span className="flex-2">Last edited</span>
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
                    <span className="flex-3 font-medium">{canvas.name}</span>
                    <span className="flex-2 text-sm text-muted-foreground">
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
