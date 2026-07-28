"use client";

import { useEffect, useState } from "react";
import { ensureFreshSession } from "@/lib/supabase/session-ready";

export function useNodeCost(nodeId: string, upstreamNodeIds?: string[]) {
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
    return () => { cancelled = true; };
  }, [nodeId, upstreamKey]);

  return totalCredits;
}
