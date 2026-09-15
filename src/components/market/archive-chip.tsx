"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArchiveStatus } from "@/lib/db/moodboards";

/**
 * Archive state on a market tile.
 *
 * Sits bottom-LEFT because the other three corners are taken: KindBadge top-left,
 * the selection Checkbox top-right, the remove Button bottom-right.
 *
 * Only ACTIVE work is worth a chip:
 *
 *   ready/skipped — nothing. Success should be silent, and a `link` that was never
 *                   going to be archived should not wear a badge about it.
 *   pending       — nothing. This is a QUEUE, not progress. Migration 0039 defaults
 *                   every pre-existing row to `pending`, so treating it as "working"
 *                   puts a spinner on the entire existing shelf at once — hundreds of
 *                   tiles claiming activity that will not begin until the nightly
 *                   sweep reaches them. The tile already has its thumbnail and looks
 *                   finished; that is the honest rendering.
 *   downloading   — a chip. The task has claimed this row and is fetching it now.
 *   failed        — a chip, because it will be retried and the user should see why a
 *                   tile never becomes playable.
 */
export function ArchiveChip({
  status,
  className,
}: {
  status: ArchiveStatus;
  className?: string;
}) {
  if (status === "ready" || status === "skipped" || status === "pending") return null;

  const working = status === "downloading";

  return (
    <span
      className={cn(
        "pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md",
        "bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
        "shadow-card",
        className,
      )}
    >
      {working ? (
        <>
          <Loader2 className="size-2.5 animate-spin" strokeWidth={1.5} />
          Saving media
        </>
      ) : (
        <>
          <RefreshCw className="size-2.5" strokeWidth={1.5} />
          Retrying
        </>
      )}
    </span>
  );
}
