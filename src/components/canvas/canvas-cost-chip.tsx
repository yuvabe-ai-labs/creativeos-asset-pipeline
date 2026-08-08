"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { authFetch } from "@/lib/supabase/session-ready";
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
        // See use-node-cost.ts — dedups the same stale-refresh-token race across every
        // cost fetch a canvas view fires at once.
        const res = await authFetch(`/api/canvas/${canvasId}/cost`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { totalCredits: number };
        if (!cancelled) setCanvasCostCredits(data.totalCredits);
      } catch {
        // non-critical
      }
    }
    void fetchCost();

    // Re-fetch once a succeeded generation lands on one of this canvas's nodes —
    // otherwise this total is stuck at its pre-generation value until a full page reload
    // (YUV-250, the canvas-level counterpart of the per-node cost figure's same bug).
    // Checked live per event (a single indexed node lookup) rather than snapshotting this
    // canvas's node ids once up front, so a node created after this component mounts —
    // an everyday occurrence, not an edge case — is still covered.
    let unsubscribe: (() => void) | null = null;
    if (orgId) {
      const supabase = createBrowserSupabase();
      unsubscribe = subscribeToOrgGenerationUpdates(orgId, (row) => {
        if (row.status !== "succeeded") return;
        void supabase
          .from("nodes")
          .select("id")
          .eq("id", row.node_id)
          .eq("canvas_id", canvasId)
          .maybeSingle()
          .then(({ data }: { data: { id: string } | null }) => {
            if (!cancelled && data) void fetchCost();
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
