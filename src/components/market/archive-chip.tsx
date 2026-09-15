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
 * `ready` and `skipped` render nothing at all. Success should be silent — a tile whose
 * media is safely ours looks exactly like a tile always has, and a `link` that was
 * never going to be archived should not wear a badge explaining its own absence.
 */
export function ArchiveChip({
  status,
  className,
}: {
  status: ArchiveStatus;
  className?: string;
}) {
  if (status === "ready" || status === "skipped") return null;

  const working = status === "pending" || status === "downloading";

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
