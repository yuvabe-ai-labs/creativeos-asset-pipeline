"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
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

    // Re-fetch once a succeeded generation lands anywhere in the org — otherwise this total
    // is stuck at its pre-generation value until a full page reload (YUV-250, the
    // canvas-level counterpart of the per-node cost figure's same bug). This used to gate
    // the refetch on a client-side `nodes` lookup keyed by row.node_id + canvasId, but
    // `nodes` has RLS enabled with ZERO policies (migration 0017_default_deny_rls.sql):
    // the browser client's anon-key session always got zero rows back, so that check
    // silently never passed and fetchCost() never ran. There is no browser-safe way to ask
    // "is this node on my canvas" directly, so instead we refetch unconditionally on every
    // succeeded generation in the org — /api/canvas/[id]/cost does the real per-canvas
    // scoping server-side. Worst case: one harmless extra refetch for another canvas.
    let unsubscribe: (() => void) | null = null;
    if (orgId) {
      unsubscribe = subscribeToOrgGenerationUpdates(orgId, (row) => {
        if (row.status !== "succeeded") return;
        void fetchCost();
      });
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [canvasId, orgId]);

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
