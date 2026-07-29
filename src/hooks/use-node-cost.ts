"use client";

import { useEffect, useState } from "react";
import { ensureFreshSession } from "@/lib/supabase/session-ready";
import { useIdentity } from "@/hooks/use-identity";
import { subscribeToOrgGenerationUpdates } from "@/lib/realtime/org-generation-updates";

export function useNodeCost(nodeId: string, upstreamNodeIds?: string[]) {
  const { orgId } = useIdentity();
  const [totalCredits, setTotalCredits] = useState<number | null>(null);

  // Stable cache key so effect only re-runs when the set of IDs actually changes.
  const upstreamKey = upstreamNodeIds?.slice().sort().join(",") ?? "";

  useEffect(() => {
    let cancelled = false;

    async function fetchCost() {
      try {
        // Every node on a canvas calls this hook — the biggest source of the request
        // burst that used to race a stale tab's expired refresh token (see
        // session-ready.ts). ensureFreshSession() is deduped, so N nodes share one check.
        await ensureFreshSession();
        const url = upstreamKey
          ? `/api/nodes/${nodeId}/cost?also=${encodeURIComponent(upstreamKey)}`
          : `/api/nodes/${nodeId}/cost`;
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { totalCredits: number };
        if (!cancelled) setTotalCredits(data.totalCredits);
      } catch {
        // cost is non-critical, fail silently
      }
    }

    void fetchCost();

    // Re-fetch once a relevant generation (this node, or an upstream node feeding this
    // node's pipeline total) settles — otherwise this figure is stuck at its
    // pre-generation value until the component remounts (YUV-250).
    let unsubscribe: (() => void) | null = null;
    if (orgId) {
      const relevantIds = new Set([nodeId, ...(upstreamNodeIds ?? [])]);
      unsubscribe = subscribeToOrgGenerationUpdates(orgId, (row) => {
        if (row.status === "succeeded" && relevantIds.has(row.node_id)) void fetchCost();
      });
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // upstreamNodeIds' identity is covered by the stable upstreamKey dep above; adding the
    // array itself would re-run this effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, upstreamKey, orgId]);

  return totalCredits;
}
