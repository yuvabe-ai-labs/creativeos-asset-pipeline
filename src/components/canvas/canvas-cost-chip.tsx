"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useIdentity } from "@/hooks/use-identity";
import { subscribeToOrgGenerationUpdates } from "@/lib/realtime/org-generation-updates";

export function CanvasCostChip({ canvasId }: { canvasId: string }) {
  const { orgId } = useIdentity();
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

    // Re-fetch once any generation on one of this canvas's nodes settles — otherwise
    // this total is stuck at its pre-generation value until a full page reload (YUV-250,
    // the canvas-level counterpart of the per-node cost figure's same bug). Node membership
    // is snapshotted once here, not kept in sync with nodes added mid-session — an accepted
    // simplification, same spirit as header-credits.tsx's UTC-rollover note.
    let unsubscribe: (() => void) | null = null;
    if (orgId) {
      const supabase = createBrowserSupabase();
      void supabase
        .from("nodes")
        .select("id")
        .eq("canvas_id", canvasId)
        .then(({ data }: { data: { id: string }[] | null }) => {
          if (cancelled) return;
          const nodeIds = new Set((data ?? []).map((n) => n.id));
          unsubscribe = subscribeToOrgGenerationUpdates(orgId, (row) => {
            if (row.status === "succeeded" && nodeIds.has(row.node_id)) void fetchCost();
          });
        });
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [canvasId, orgId]);

  if (canvasCostCredits === null || canvasCostCredits <= 0) return null;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="font-medium tabular-nums text-foreground">{canvasCostCredits.toLocaleString()}</span>
      <span>credits total</span>
    </div>
  );
}
