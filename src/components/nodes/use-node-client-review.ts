"use client";

import { useCallback, useEffect, useState } from "react";
import type { NodeClientReview } from "@/lib/client-review/wire";

// Fetch-on-mount (the canvas load) and on demand (focus view open/close) — spec §5.
// `replace` sets the data directly (after an upload) so card and focus view share one truth.
export function useNodeClientReview(nodeId: string) {
  const [data, setData] = useState<NodeClientReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/client-review`, { cache: "no-store" });
      if (res.status === 404) {
        // The node row isn't saved yet (autosave lag) — show the empty state.
        setData({ review: null, comments: [] });
        setError(null);
      } else if (res.ok) {
        setData((await res.json()) as NodeClientReview);
        setError(null);
      } else {
        setError("Couldn't load the review.");
      }
    } catch {
      setError("Couldn't load the review.");
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  const replace = useCallback((next: NodeClientReview) => {
    setData(next);
    setError(null);
  }, []);

  useEffect(() => {
    // Fetch-on-mount: every setState inside reload() runs after an await, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { data, loading, error, reload, replace };
}
