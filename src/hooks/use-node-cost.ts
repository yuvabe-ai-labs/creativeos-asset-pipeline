"use client";

import { useEffect, useState } from "react";

export function useNodeCost(nodeId: string, upstreamNodeIds?: string[]) {
  const [totalCredits, setTotalCredits] = useState<number | null>(null);

  // Stable cache key so effect only re-runs when the set of IDs actually changes.
  const upstreamKey = upstreamNodeIds?.slice().sort().join(",") ?? "";

  useEffect(() => {
    let cancelled = false;

    async function fetchCost() {
      try {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, upstreamKey]);

  return totalCredits;
}
