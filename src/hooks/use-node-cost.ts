"use client";

import { useEffect, useState } from "react";

export function useNodeCost(nodeId: string) {
  const [totalInr, setTotalInr] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchCost() {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/cost`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { totalInr: number };
        if (!cancelled) setTotalInr(data.totalInr);
      } catch {
        // cost is non-critical, fail silently
      }
    }

    void fetchCost();
    return () => { cancelled = true; };
  }, [nodeId]);

  return totalInr;
}
