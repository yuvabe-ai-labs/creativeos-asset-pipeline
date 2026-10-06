"use client";

import { useCallback, useEffect, useState } from "react";
import type { NodeClientReview } from "@/lib/client-review/wire";

// Fetch-on-mount (the canvas load) and on demand (focus view open/close) — spec §5.
export function useNodeClientReview(nodeId: string) {
  const [data, setData] = useState<NodeClientReview | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/client-review`, { cache: "no-store" });
      // 404 = the node row isn't saved yet (autosave lag) — show the empty state.
      setData(res.ok ? ((await res.json()) as NodeClientReview) : { review: null, comments: [] });
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, reload };
}
