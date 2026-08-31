"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useReactFlow } from "@xyflow/react";
import { ClipboardCheck } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useReviewList } from "@/hooks/use-review-list";
import { ReviewItemThumb } from "@/components/review/review-item-thumb";
import { ReviewListSkeleton } from "@/components/review/review-list-skeleton";
import { InfiniteScrollSentinel } from "@/components/review/infinite-scroll-sentinel";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { isUnhandledPointer, urlWithoutFocusPointer } from "@/lib/review/focus-pointer";
import { useReviewDrawer } from "./review-drawer-context";
import type { InboxItem } from "@/lib/review/queue";

// D163 — the canvas review drawer.
//
// NON-MODAL with no backdrop (R6.10), matching the gallery drawer. It stays mounted while
// a focus view is on screen, which is what makes R6.11 work: a focus sheet opens at 92% of
// viewport height, so the drawer and the node it points at cannot share the screen — but
// they do not need to. Leaving the list mounted underneath means it is waiting when the
// sheet closes, with the decided item already gone.
//
// That gets the benefit of a run (one open of the drawer, not one per item) WITHOUT
// auto-advancing past work the senior has not looked at (R6.9). There is no next button
// here and none in the focus view (R6.12) — the absence is the requirement.
//
// The drawer ROUTES; it is not a second approval surface (R6.4).
export function ReviewDrawer({ canvasId }: { canvasId: string }) {
  const { open, openDrawer, closeDrawer } = useReviewDrawer();
  const { items, loading, loadingMore, hasMore, loadMore } = useReviewList(
    `/api/canvases/${canvasId}/review`,
    open,
  );
  const { setCenter, getNode } = useReactFlow();
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const setFocusSection = useCanvasStore((s) => s.setFocusSection);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);

  // R6.3: reuse the generation tray's fly-to-node behaviour (D35) rather than inventing a
  // second way to navigate a canvas. Deliberately does NOT close the drawer (R6.11).
  function openItem(item: InboxItem) {
    const node = getNode(item.nodeId);
    if (node) {
      setCenter(node.position.x + 120, node.position.y + 60, { zoom: 1, duration: 500 });
    }
    // Ask for the Details section BEFORE the view opens — that is where sign-off lives in
    // every node type, and arriving from a review queue on the generation settings makes
    // the reviewer hunt for the control they came here to use.
    setFocusSection("details");
    setFocusedNodeId(item.nodeId);
  }

  // A navbar-inbox link carries ?node=<id>. Without this the link landed you on the right
  // canvas with nothing open — you still had to find the asset yourself, which defeats the
  // point of a pointer.
  //
  // The pointer is read from the LIVE URL, not from a server prop threaded down through the
  // page. Following a second inbox link to the canvas you are already on is a soft navigation
  // — the store provider is keyed on canvas id, so nothing under it remounts — and a prop
  // captured at mount went stale there: the second asset never opened, while cross-canvas
  // links looked healthy only because the remount re-seeded them. `useSearchParams` tracks
  // both router navigations and the `replaceState` below (Next.js: Native History API).
  //
  // Also keyed on the canvas's NODES, not on the drawer's list: on a fresh page load the
  // nodes hydrate after this mounts, and an effect that only re-ran when the list changed
  // could miss the window entirely and never open anything.
  const searchParams = useSearchParams();
  const pointer = searchParams.get("node");
  const nodes = useCanvasStore((s) => s.nodes);
  const handledPointerRef = useRef<string | null>(null);
  useEffect(() => {
    // No pointer in the URL means the last one was spent (below) or never existed — release
    // the latch here rather than at the moment of clearing, so there is never a render where
    // a live pointer meets an empty latch and a passing `nodes` change re-opens a sheet the
    // reviewer just closed.
    if (!pointer) {
      handledPointerRef.current = null;
      return;
    }
    if (!isUnhandledPointer(pointer, handledPointerRef.current)) return;
    const node = getNode(pointer);
    if (!node) return; // not hydrated yet — the next nodes change re-runs this
    handledPointerRef.current = pointer;
    setCenter(node.position.x + 120, node.position.y + 60, { zoom: 1, duration: 500 });
    setFocusSection("details");
    setFocusedNodeId(pointer);
    // D161 again, for the arrival that does not remount: the senior followed a count to get
    // here, so the list belongs on screen. The provider's `initialOpen` only fires at mount,
    // which is exactly what a same-canvas link is not.
    openDrawer();
  }, [pointer, getNode, setCenter, setFocusSection, setFocusedNodeId, openDrawer, nodes]);

  // Closing the focus view spends the pointer: drop `?node=` from the URL. Without this the
  // URL kept describing a sheet that was no longer on screen, and clicking that same inbox
  // row again produced a byte-identical href — a navigation the router drops — so the asset
  // could never be reopened.
  //
  // Emptying the URL is what releases the latch — see the effect above; this one only writes
  // the URL. `history.replaceState` rather than `router.replace` because the pointer is spent
  // client state: this page is force-dynamic, so a router write would refetch the whole
  // canvas to change nothing on screen.
  useEffect(() => {
    if (focusedNodeId !== null || handledPointerRef.current === null) return;
    const next = urlWithoutFocusPointer(window.location.href);
    if (next) window.history.replaceState(null, "", next);
  }, [focusedNodeId]);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && closeDrawer()} modal={false}>
      <SheetContent side="right" className="flex w-80 flex-col p-0">
        {/* Stacked, and pr-12, because SheetContent renders its own close button at
            `absolute top-3 right-3` — a count on the same baseline collides with it. */}
        <div className="flex shrink-0 flex-col gap-0.5 border-b border-border py-3 pl-4 pr-12">
          <SheetTitle className="text-eyebrow !text-[0.65rem]">Awaiting review</SheetTitle>
          {/* R9.8: state the scope. This counts THIS canvas; the navbar counts the whole
              org, so the two legitimately disagree and each must say which it is. */}
          <span className="text-xs tabular-nums text-muted-foreground">
            {items.length}
            {hasMore ? "+" : ""} on this canvas
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <ReviewListSkeleton rows={5} />
          ) : items.length === 0 ? (
            <EmptyReviewState />
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                {items.map((item) => (
                  <ReviewRow
                    key={item.versionId}
                    item={item}
                    active={focusedNodeId === item.nodeId}
                    onOpen={() => openItem(item)}
                  />
                ))}
              </div>
              {hasMore && (
                <InfiniteScrollSentinel onVisible={loadMore} loading={loadingMore} />
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// A cleared queue is a good outcome, so it reads as one rather than as an error.
function EmptyReviewState() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <ClipboardCheck className="size-7 text-muted-foreground/30" strokeWidth={1.5} />
      <p className="text-sm font-medium text-foreground">All caught up</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Nothing on this canvas is waiting for review.
      </p>
    </div>
  );
}

function ReviewRow({
  item,
  active,
  onOpen,
}: {
  item: InboxItem;
  active: boolean;
  onOpen: () => void;
}) {
  const label = item.nodeTitle || (item.nodeType === "video-gen" ? "Video" : "Image");
  return (
    <Button
      variant="ghost"
      onClick={onOpen}
      aria-label={`Review ${label}`}
      aria-current={active ? "true" : undefined}
      className={cn(
        "h-auto w-full items-center justify-start gap-2.5 rounded-lg border px-2 py-2",
        "text-left font-normal",
        "transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        // The row you are currently looking at stays marked, so closing the focus sheet
        // returns you to a list that shows where you were (R6.11).
        active
          ? "border-primary/50 bg-primary/5 hover:bg-primary/5"
          : "border-border bg-card hover:border-primary/40 hover:bg-primary/5",
      )}
    >
      {/* R6.2: preview, which node, who made it, and when — enough to triage without
          opening it. */}
      <ReviewItemThumb output={item.output} nodeType={item.nodeType} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{label}</span>
        <span className="block truncate text-[0.7rem] font-normal text-muted-foreground">
          {/* Legacy rows carry no maker reference (R11.4) — say so plainly instead of
              printing "Unknown" as if it were someone's name. */}
          {item.makerName ?? "Maker not recorded"} · {formatRelativeTime(item.createdAt)}
        </span>
      </span>
    </Button>
  );
}
