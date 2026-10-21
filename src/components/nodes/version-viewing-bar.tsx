"use client";

import { Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format/relative-time";

/** D383 — shown above the output while a version other than the active one is on screen. The
 *  only place Restore lives. */
export function VersionViewingBar({
  viewedLabel,
  viewedCreatedAt,
  activeLabel,
  canRestore,
  restoring,
  onBack,
  onRestore,
}: {
  viewedLabel: string;
  viewedCreatedAt: string;
  activeLabel: string | null;
  canRestore: boolean;
  restoring: boolean;
  onBack: () => void;
  onRestore: () => void;
}) {
  // One string, so the message is one text node (and one sentence for screen readers).
  const message =
    `Viewing ${viewedLabel}, made ${formatRelativeTime(viewedCreatedAt)}.` +
    (activeLabel ? ` The node still uses ${activeLabel}.` : "");
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/5 py-2 pl-3 pr-2 text-sm">
      <p className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-foreground/80">
        <Eye className="size-3.5 shrink-0 text-primary" strokeWidth={1.5} />
        <span>{message}</span>
      </p>
      <div className="flex shrink-0 gap-1.5">
        <Button type="button" variant="ghost" size="xs" onClick={onBack}>
          {activeLabel ? `Back to ${activeLabel}` : "Back"}
        </Button>
        {canRestore && (
          <Button type="button" size="xs" disabled={restoring} onClick={onRestore}>
            <RotateCcw strokeWidth={1.5} />
            {`Restore ${viewedLabel}`}
          </Button>
        )}
      </div>
    </div>
  );
}
