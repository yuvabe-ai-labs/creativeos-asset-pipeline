"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase/session-ready";
import type { TrackedPostRow } from "@/lib/db/performance";
import type { PerformanceStats } from "@/lib/market/performance";

export type PerformancePayload = {
  handle: string | null;
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

export function usePerformance(clientId: string) {
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await authFetch(`/api/clients/${clientId}/performance`);
    if (res.ok) setData((await res.json()) as PerformancePayload);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    // Initial fetch lands after the awaited response (same shape as use-market).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Returns an error message to show, or null on success. */
  const refresh = useCallback(async (): Promise<string | null> => {
    setRefreshing(true);
    try {
      const res = await authFetch(`/api/clients/${clientId}/performance/refresh`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return body?.error ?? "Could not refresh right now.";
      }
      await load();
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [clientId, load]);

  return { data, loading, refreshing, refresh };
}
