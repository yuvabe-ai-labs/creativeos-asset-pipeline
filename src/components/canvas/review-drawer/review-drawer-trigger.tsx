"use client";

import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PendingCountPill } from "@/components/shared/pending-count-pill";
import { useReviewCounts } from "@/hooks/use-review-counts";
import { useReviewDrawer } from "./review-drawer-context";
import type { ReviewCounts } from "@/lib/review/queue";

// R5.3: the canvas-level control — how many of THIS canvas's assets await review, and the
// way into the drawer.
//
// R6.7/R5.6: shown to every role. A designer sees how much is outstanding and can open the
// drawer read-only; only a senior can act on it. Counts are not a privilege.
export function ReviewDrawerTrigger({
  canvasId,
  initialCounts,
}: {
  canvasId: string;
  initialCounts: ReviewCounts;
}) {
  const { toggleDrawer } = useReviewDrawer();
  const counts = useReviewCounts(initialCounts);
  const count = counts.byCanvas[canvasId] ?? 0;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleDrawer}
      className="h-8 gap-1.5 rounded-full px-3 text-xs shadow-sm"
    >
      <ClipboardCheck className="size-3.5" strokeWidth={1.5} />
      Review
      {/* Renders nothing at zero (R5.1), so a fully-reviewed canvas shows a plain
          "Review" button rather than a "0". */}
      <PendingCountPill count={count} scope="canvas" className="ml-0.5" />
    </Button>
  );
}
