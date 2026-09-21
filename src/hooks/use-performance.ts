"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase/session-ready";
import type { TrackedPostRow } from "@/lib/db/performance";
import type { HandleIdentity, PerformanceStats } from "@/lib/market/performance";

export type PerformancePayload = {
  handle: string;
  identity: HandleIdentity | null;
  latest: {
    followersCount: number;
    followsCount: number;
    postsCount: number;
    capturedAt: string;
  } | null;
  series: { capturedAt: string; followers: number }[];
  posts: TrackedPostRow[];
  stats: PerformanceStats;
};

/** One handle's sub-tab data (D253). Pass `null` before a handle is selected — the
 *  hook then holds empty and fetches nothing, so the no-handles state costs no request. */
export function usePerformance(clientId: string, handle: string | null) {
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(handle !== null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!handle) {
      setData(null);
      setLoading(false);
      return;
    }
    const res = await authFetch(
      `/api/clients/${clientId}/performance?handle=${encodeURIComponent(handle)}`,
    );
    if (res.ok) setData((await res.json()) as PerformancePayload);
    setLoading(false);
  }, [clientId, handle]);

  useEffect(() => {
    // Switching sub-tabs must clear the previous handle's numbers immediately, or the
    // new tab renders the old account's stats for the length of one request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setLoading(handle !== null);
    void load();
  }, [handle, load]);

  /** Returns an error message to show, or null on success. */
  const refresh = useCallback(async (): Promise<string | null> => {
    if (!handle) return null;
    setRefreshing(true);
    try {
      // authFetch, not bare fetch: Refresh can be clicked long after page load, which
      // is exactly the stale-token race authFetch exists to close.
      const res = await authFetch(`/api/clients/${clientId}/performance/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return body?.error ?? "Could not refresh right now.";
      }
      await load();
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [clientId, handle, load]);

  return { data, loading, refreshing, refresh };
}
