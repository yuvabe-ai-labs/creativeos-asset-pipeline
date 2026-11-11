"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown when this session is read-only: either someone else holds the lock ("Take over" enables
// once their lock is stale), or the person may only view this canvas (no take-over: D493).
export function LockBanner({
  heldByName,
  canTakeOver,
  onTakeOver,
  viewOnly = false,
}: {
  heldByName: string | null;
  canTakeOver: boolean;
  onTakeOver: () => void;
  viewOnly?: boolean;
}) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-background/90 px-4 py-2 shadow-card backdrop-blur">
      <Lock className="size-4 text-muted-foreground" strokeWidth={1.5} />
      {viewOnly ? (
        <span className="text-sm text-muted-foreground">You can view this canvas. Editing is turned off for you.</span>
      ) : (
        <>
          <span className="text-sm text-muted-foreground">
            {heldByName ? `${heldByName} is editing` : "Another session is editing"} — you&apos;re
            viewing read-only.
          </span>
          <Button size="sm" variant="outline" disabled={!canTakeOver} onClick={onTakeOver}>
            Take over editing
          </Button>
        </>
      )}
    </div>
  );
}
