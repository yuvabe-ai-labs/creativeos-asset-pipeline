"use client";

import { Download, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArchiveStatus } from "@/lib/db/moodboards";

/** How long after a clip a `pending` row still counts as "this is happening now"
 *  rather than "this is in the backlog". Long enough to cover a cold Apify actor
 *  (38s observed) plus the gap until the next board refetch. */
const FRESH_CLIP_MS = 15 * 60 * 1000;

export type ArchiveChipState = {
  label: string;
  tone: "info" | "destructive";
  /** Whether the icon should animate — reserved for work actually in flight. */
  active: boolean;
};

/**
 * What the chip should say, or null for no chip. Pure, so the rule can be reasoned
 * about — and tested — without rendering anything.
 *
 *   ready / skipped  nothing. Success is silent, and a `link` that was never going to
 *                    be archived should not wear a badge about it.
 *   downloading      a task holds this row and is fetching bytes right now.
 *   failed           it will be retried; the user should see why a tile never plays.
 *   pending          DEPENDS. Migration 0039 defaults every pre-existing row to
 *                    `pending`, so a blanket chip puts a badge on the whole shelf —
 *                    hundreds of tiles claiming activity that will not start until the
 *                    nightly sweep reaches them. But a clip made seconds ago IS live
 *                    work the user is waiting on. Recency is what separates the two.
 */
export function archiveChipState(
  status: ArchiveStatus,
  addedAt: string,
  now: number = Date.now(),
): ArchiveChipState | null {
  if (status === "downloading") return { label: "Syncing", tone: "info", active: true };
  if (status === "failed") return { label: "Retrying", tone: "destructive", active: false };
  if (status !== "pending") return null;

  const age = now - new Date(addedAt).getTime();
  // NaN (an unparseable date) must not read as fresh — treat it as backlog.
  if (!Number.isFinite(age) || age > FRESH_CLIP_MS) return null;
  return { label: "Syncing", tone: "info", active: false };
}

/**
 * Archive state on a market tile. Sits bottom-LEFT because the other three corners are
 * taken: KindBadge top-left, selection Checkbox top-right, remove Button bottom-right.
 *
 * The fill is opaque rather than the `bg-info/12` tint used on flat surfaces
 * elsewhere: this badge sits on top of photographs, and a 12% wash disappears against
 * a bright frame. Solid `--info` with `--info-foreground` is contrast-checked (7.35:1)
 * and reads over any image, in either theme.
 */
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

  const Icon = state.tone === "destructive" ? RefreshCw : Download;

  return (
    <span
      className={cn(
        "pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5",
        "rounded-md px-2 py-1 text-[11px] font-medium leading-none shadow-card",
        state.tone === "info"
          ? "bg-info text-info-foreground"
          : "bg-destructive text-destructive-foreground",
        className,
      )}
    >
      {/* A pulse, not a bounce — the design system forbids springs and bounce, and a
          badge sitting on a photo should not draw the eye harder than the image. */}
      <Icon
        className={cn("size-3 shrink-0", state.active && "animate-pulse")}
        strokeWidth={1.5}
      />
      {state.label}
    </span>
  );
}
