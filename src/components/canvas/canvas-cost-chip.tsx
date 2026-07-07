"use client";

import { useEffect, useState } from "react";

export function CanvasCostChip({ canvasId }: { canvasId: string }) {
  const [canvasCostInr, setCanvasCostInr] = useState<number | null>(null);

  useEffect(() => {
    if (!canvasId) return;
    let cancelled = false;
    async function fetchCost() {
      try {
        const res = await fetch(`/api/canvas/${canvasId}/cost`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { totalInr: number };
        if (!cancelled) setCanvasCostInr(data.totalInr);
      } catch {
        // non-critical
      }
    }
    void fetchCost();
    return () => { cancelled = true; };
  }, [canvasId]);

  if (canvasCostInr === null || canvasCostInr <= 0) return null;

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground shadow-card">
      <span className="font-medium tabular-nums text-foreground">₹{canvasCostInr.toFixed(2)}</span>
      <span>total</span>
    </div>
  );
}
