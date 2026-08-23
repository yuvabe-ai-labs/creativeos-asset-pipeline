"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Microscope, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
  AlertDialogAction,
  AlertDialogCancel,
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
import { PendingCountPill } from "@/components/shared/pending-count-pill";
import { useReviewCounts } from "@/hooks/use-review-counts";
import type { CanvasRow } from "@/lib/db/types";
import type { ReviewCounts } from "@/lib/review/queue";

export function CanvasesTable({
  canvases,
  clientSlug,
  reviewCounts,
}: {
  canvases: CanvasRow[];
  clientSlug: string;
  reviewCounts: ReviewCounts;
}) {
  const router = useRouter();
  // R8.1: one subscription for the table, seeded from the server-rendered counts.
  const liveCounts = useReviewCounts(reviewCounts);
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
          {/* Mirrors the row nesting exactly: an inner flex-1 track carrying the three
              columns, then a w-32 sibling standing in for the row-actions gutter. Any
              other arrangement leaves the right-aligned headers running past the data
              they label, because the actions occupy that space in every row. */}
          <div className="text-eyebrow flex items-center border-b bg-muted/40 py-3 text-[0.7rem] text-muted-foreground/80">
            <div className="flex min-w-0 flex-1 items-center gap-4 pl-5">
              <span className="min-w-0 flex-3">Canvas</span>
              <span className="min-w-0 flex-2 text-right">Last edited</span>
              <span className="min-w-0 flex-1 text-right">Created</span>
            </div>
            <span className="w-32 shrink-0" aria-hidden />
          </div>

          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {query ? `No canvases match "${query}".` : "No canvases yet."}
            </p>
          ) : (
            <ul>
              {rows.map((canvas) => (
                <li
                  key={canvas.id}
                  className="group relative border-b transition-colors last:border-b-0 hover:bg-muted/40"
                >
                  {/* Stretched link — the whole row opens the editor; the Evals action
                      and the ⋯ menu re-enable pointer events and sit above it. */}
                  <Link
                    href={`/clients/${clientSlug}/canvases/${canvas.slug}`}
                    aria-label={canvas.name}
                    className="absolute inset-0"
                  />
                  <div className="pointer-events-none relative flex min-w-0 items-center py-3.5">
                    <div className="flex min-w-0 flex-1 items-center gap-4 pl-5">
                      {/* Truncates but does NOT get a hover tooltip: this row is a
                          stretched-link pattern, and re-enabling pointer events on the
                          name to catch hover would swallow the click that opens the
                          canvas. The stretched Link already carries the full name as
                          its aria-label for assistive tech. */}
                      <span className="flex min-w-0 flex-3 items-center gap-2">
                        <span className="truncate font-medium">{canvas.name}</span>
                        {/* R5.1's count. shrink-0 so a long canvas name truncates instead
                            of squeezing the pill, and it stays inside the
                            pointer-events-none overlay so it cannot punch a dead spot in
                            the stretched link. */}
                        <PendingCountPill
                          count={liveCounts.byCanvas[canvas.id] ?? 0}
                          scope="canvas"
                          className="shrink-0"
                        />
                      </span>
                      <span className="min-w-0 flex-2 truncate text-right text-sm whitespace-nowrap text-muted-foreground">
                        {formatRelativeTime(canvas.updated_at)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-right text-sm whitespace-nowrap text-muted-foreground">
                        {new Date(canvas.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    {/* Row actions — their own fixed gutter, so they never eat into the
                        Created column and pull the data out from under its header. */}
                    <div className="flex w-32 shrink-0 items-center justify-end gap-2 pr-5">
                      <Button
                        variant="outline"
                        size="xs"
                        nativeButton={false}
                        className="pointer-events-auto relative z-10 border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary dark:border-border dark:bg-background dark:hover:bg-primary/5"
                        render={
                          <Link
                            href={`/eval/${canvas.id}`}
                            title="Error analysis — inspect this canvas's generations"
                          >
                            <Microscope className="size-3.5" strokeWidth={1.5} /> Evals
                          </Link>
                        }
                      />
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5"
                        strokeWidth={1.5}
                      />
                    </div>
                  </div>

                  {/* ⋯ action menu — sits on top of the link */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                    <Popover>
                      <PopoverTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground"
                            aria-label="Canvas actions"
                            onClick={(e) => e.preventDefault()}
                          >
                            <MoreHorizontal className="size-4" strokeWidth={1.5} />
                          </Button>
                        }
                      />
                      <PopoverContent align="end" className="w-36 p-1">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 font-normal"
                          onClick={() => openRename(canvas)}
                        >
                          <Pencil className="size-3.5" strokeWidth={1.5} />
                          Rename
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeletingCanvas(canvas)}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.5} />
                          Delete
                        </Button>
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
            <AlertDialogCancel onClick={() => setDeletingCanvas(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePending}
            >
              {deletePending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
