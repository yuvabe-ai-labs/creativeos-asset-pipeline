"use client";

import { Loader2, Clock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArchiveStatus } from "@/lib/db/moodboards";

/** How long after a clip a `pending` row still counts as "this is happening now"
 *  rather than "this is in the backlog". Long enough to cover a cold Apify actor
 *  (38s observed) plus the gap until the next board refetch. */
const FRESH_CLIP_MS = 15 * 60 * 1000;

/**
 * What the chip should say, or null for no chip. Pure, so the rule can be reasoned
 * about — and tested — without rendering anything.
 *
 *   ready / skipped  nothing. Success is silent, and a `link` that was never going to
 *                    be archived should not wear a badge about it.
 *   downloading      a task holds this row and is fetching bytes right now.
 *   failed           it will be retried; the user should see why a tile never plays.
 *   pending          DEPENDS. Migration 0039 defaults every pre-existing row to
 *                    `pending`, so a blanket chip puts a spinner on the whole shelf —
 *                    hundreds of tiles claiming activity that will not start until the
 *                    nightly sweep reaches them. But a clip made seconds ago IS live
 *                    work the user is waiting on. Recency is what separates the two.
 */
export function archiveChipState(
  status: ArchiveStatus,
  addedAt: string,
  now: number = Date.now(),
): { label: string; icon: "spin" | "clock" | "retry" } | null {
  if (status === "downloading") return { label: "Saving media", icon: "spin" };
  if (status === "failed") return { label: "Retrying", icon: "retry" };
  if (status !== "pending") return null;

  const age = now - new Date(addedAt).getTime();
  // NaN (an unparseable date) must not read as fresh — treat it as backlog.
  if (!Number.isFinite(age) || age > FRESH_CLIP_MS) return null;
  return { label: "Queued", icon: "clock" };
}

/** Archive state on a market tile. Sits bottom-LEFT because the other three corners
 *  are taken: KindBadge top-left, selection Checkbox top-right, remove Button
 *  bottom-right. */
export function ArchiveChip({
  status,
  addedAt,
  className,
}: {
  status: ArchiveStatus;
  addedAt: string;
  className?: string;
}) {
  const state = archiveChipState(status, addedAt);
  if (!state) return null;

  const Icon = state.icon === "spin" ? Loader2 : state.icon === "clock" ? Clock : RefreshCw;

  return (
    <span
      className={cn(
        "pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md",
        "bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
        "shadow-card",
        className,
      )}
    >
      <Icon
        className={cn("size-2.5", state.icon === "spin" && "animate-spin")}
        strokeWidth={1.5}
      />
      {state.label}
    </span>
  );
}
