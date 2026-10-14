"use client";

import { Zap } from "lucide-react";
import { useCanvasCost } from "@/hooks/queries/canvas-cost";

// The canvas's total spend. Shares one query with every node footer and Usage popover on the
// canvas; Canvas mounts its live refresh (useCanvasCostLiveUpdates), so a settled generation
// updates this figure without a reload (YUV-250).
export function CanvasCostChip({ canvasId }: { canvasId: string }) {
  const { data } = useCanvasCost(canvasId);
  const canvasCostCredits = data?.totalCredits ?? null;

  if (canvasCostCredits === null || canvasCostCredits <= 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Zap className="size-3.5" strokeWidth={1.5} />
      </span>
      <span className="font-display text-base leading-none font-semibold tabular-nums text-foreground">
        {canvasCostCredits.toLocaleString()}
      </span>
      <span className="text-sm leading-none text-muted-foreground">Canvas Consumption</span>
    </div>
  );
}
