"use client";

import { useEffect, useState } from "react";

export function CanvasCostChip({ canvasId }: { canvasId: string }) {
  const [canvasCostCredits, setCanvasCostCredits] = useState<number | null>(null);

  useEffect(() => {
    if (!canvasId) return;
    let cancelled = false;
    async function fetchCost() {
      try {
        const res = await fetch(`/api/canvas/${canvasId}/cost`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { totalCredits: number };
        if (!cancelled) setCanvasCostCredits(data.totalCredits);
      } catch {
        // non-critical
      }
    }
    void fetchCost();
    return () => { cancelled = true; };
  }, [canvasId]);

  if (canvasCostCredits === null || canvasCostCredits <= 0) return null;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="font-medium tabular-nums text-foreground">{canvasCostCredits.toLocaleString()}</span>
      <span>credits total</span>
    </div>
  );
}
