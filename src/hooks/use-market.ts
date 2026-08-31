"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase/session-ready";
import type { Moodboard, MoodboardItem } from "@/lib/db/moodboards";
import type { SignalWithItems } from "@/lib/db/signals";
import type { MarketBucket } from "@/lib/market/constants";

export type MarketData = {
  direct: { board: Moodboard; items: MoodboardItem[] };
  adjacent: { board: Moodboard; items: MoodboardItem[] };
  signals: SignalWithItems[];
};

export function useMarket(clientId: string) {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await authFetch(`/api/clients/${clientId}/market`);
    if (res.ok) setData((await res.json()) as MarketData);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    // Initial data fetch — state updates land after the awaited response, not
    // synchronously in the effect body (same shape as use-moodboards/use-brand-kit).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const addReference = useCallback(
    async (input: { url: string; bucket: MarketBucket; note?: string }) => {
      const res = await fetch(`/api/clients/${clientId}/market/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.ok) await refresh();
      return res.ok;
    },
    [clientId, refresh],
  );

  const createSignal = useCallback(
    async (input: { name: string; tags: string[]; description: string; itemIds: string[] }) => {
      const res = await fetch(`/api/clients/${clientId}/market/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.ok) await refresh();
      return res.ok;
    },
    [clientId, refresh],
  );

  // Reuses the extension-era items endpoint — proving board ownership authorizes
  // the delete there, and the item knows its board. No market-specific route needed.
  const removeReference = useCallback(
    async (item: MoodboardItem) => {
      const res = await fetch(`/api/moodboards/${item.moodboard_id}/items/${item.id}`, {
        method: "DELETE",
      });
      if (res.ok) await refresh();
      return res.ok;
    },
    [refresh],
  );

  const deleteSignal = useCallback(
    async (signalId: string) => {
      const res = await fetch(`/api/clients/${clientId}/market/signals/${signalId}`, {
        method: "DELETE",
      });
      if (res.ok) await refresh();
    },
    [clientId, refresh],
  );

  return { data, loading, refresh, addReference, removeReference, createSignal, deleteSignal };
}
