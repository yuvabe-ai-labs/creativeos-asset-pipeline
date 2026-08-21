"use client";

import { useCallback, useEffect, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useIdentity } from "@/hooks/use-identity";
import { subscribeToOrgVersionUpdates } from "@/lib/realtime/org-version-updates";
import { authFetch } from "@/lib/supabase/session-ready";
import { formatRelativeTime } from "@/lib/format/relative-time";
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
// The drawer ROUTES; it is not a second approval surface (R6.4). Decisions are made on the
// node, with the same control that exists everywhere else.
export function ReviewDrawer({ canvasId }: { canvasId: string }) {
  const { open, closeDrawer } = useReviewDrawer();
  const { orgId } = useIdentity();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { setCenter, getNode } = useReactFlow();
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);

  // Pure fetch: returns the rows, or null when the list should be left exactly as it is
  // (R8.5 — a dropped connection must never blank a list the reviewer is reading).
  // Deliberately does no setState of its own, so the effects below own cancellation.
  const fetchItems = useCallback(async (): Promise<InboxItem[] | null> => {
    try {
      const res = await authFetch(`/api/canvases/${canvasId}/review`, { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as { items: InboxItem[] };
      return data.items;
    } catch {
      return null; // offline or mid-token-refresh
    }
  }, [canvasId]);

  // Load on open. The `cancelled` guard is not ceremony: without it a slow response from a
  // previous open can land after a newer one and show a stale list.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const next = await fetchItems();
      if (cancelled) return;
      if (next) setItems(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, fetchItems]);

  // R6.6: an item leaves the drawer as soon as it is approved or rejected — because the
  // list is DERIVED from live state, not because anything removes it.
  useEffect(() => {
    if (!orgId || !open) return;
    let cancelled = false;
    const unsubscribe = subscribeToOrgVersionUpdates(orgId, () => {
      void (async () => {
        const next = await fetchItems();
        if (!cancelled && next) setItems(next);
      })();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [orgId, open, fetchItems]);

  // R6.3: reuse the generation tray's fly-to-node behaviour (D35) rather than inventing a
  // second way to navigate a canvas. Deliberately does NOT close the drawer (R6.11).
  function openItem(item: InboxItem) {
    const node = getNode(item.nodeId);
    if (node) {
      setCenter(node.position.x + 120, node.position.y + 60, { zoom: 1, duration: 500 });
    }
    setFocusedNodeId(item.nodeId);
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && closeDrawer()} modal={false}>
      <SheetContent side="right" className="w-80 p-0">
        <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
          <SheetTitle className="text-eyebrow !text-[0.65rem]">Awaiting review</SheetTitle>
          {/* R9.8: state the scope. This number counts THIS canvas; the navbar counts the
              whole org, so the two legitimately disagree and each must say which it is. */}
          <span className="text-xs tabular-nums text-muted-foreground">
            {items.length} on this canvas
          </span>
        </div>

        <div className="flex max-h-[calc(100vh-4rem)] flex-col gap-1.5 overflow-y-auto p-2">
          {loading && items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Nothing awaiting review on this canvas.
            </p>
          ) : (
            items.map((item) => (
              <Button
                key={item.versionId}
                variant="ghost"
                onClick={() => openItem(item)}
                aria-label={`Review ${item.nodeTitle ?? "asset"}`}
                className={cn(
                  "h-auto w-full items-center justify-start gap-2.5 rounded-lg border border-border",
                  "bg-card px-2 py-2 text-left font-normal",
                  // Pin hover to the resting background, cancelling the ghost variant's
                  // hover:bg-muted, then carry the affordance on the border instead —
                  // same approach as GenerationTrayItem.
                  "transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  "hover:bg-primary/5 hover:border-primary/40",
                )}
              >
                {/* R6.2: preview, which node, who made it, and when — enough to triage
                    without opening it. */}
                {item.output ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.output}
                    alt=""
                    className="size-9 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : (
                  <span className="size-9 shrink-0 rounded-md border border-border bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {item.nodeTitle || (item.nodeType === "video-gen" ? "Video" : "Image")}
                  </span>
                  <span className="block truncate text-[0.7rem] font-normal text-muted-foreground">
                    {item.makerName ?? "Unknown"} · {formatRelativeTime(item.createdAt)}
                  </span>
                </span>
              </Button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
