"use client";

import { useCallback, useEffect, useState } from "react";
import { useMarketUpdates } from "./use-market-updates";
import { authFetch } from "@/lib/supabase/session-ready";
import type { Moodboard, MoodboardItem } from "@/lib/db/moodboards";
import type { SignalWithItems } from "@/lib/db/signals";
import type { MarketBucket } from "@/lib/market/constants";

export type MarketData = {
  direct: { board: Moodboard; items: MoodboardItem[] };
  adjacent: { board: Moodboard; items: MoodboardItem[] };
  signals: SignalWithItems[];
};

/**
 * Prints the archive backlog to the browser console on every board refetch.
 *
 * The board now refetches on Realtime events too (D276), so this fires whenever the
 * archive task touches a row — which makes it the quickest way to tell "the task ran
 * and is working" from "nothing is listening": both leave the tile looking finished,
 * but only one prints a status change here.
 *
 * `attempts: 0` across the board is the signature of the task never having been
 * reached at all — usually `npm run dev:trigger` not running.
 */
function logArchiveState(data: MarketData) {
  const items = [...data.direct.items, ...data.adjacent.items];
  if (items.length === 0) return;

  const byStatus: Record<string, number> = {};
  for (const it of items) byStatus[it.archive_status] = (byStatus[it.archive_status] ?? 0) + 1;

  const attempted = items.filter((i) => i.archive_attempts > 0).length;
  const newest = items.reduce((a, b) => (a.added_at > b.added_at ? a : b));

  console.log(
    `[archive] ${items.length} refs — ` +
      Object.entries(byStatus)
        .map(([s, n]) => `${s}:${n}`)
        .join("  ") +
      `  | ever-attempted: ${attempted}`,
  );
  console.log(
    `[archive] newest: ${newest.kind} ${newest.archive_status} ` +
      `attempts=${newest.archive_attempts} ` +
      `media=${newest.media_url ? "stored" : "none"}` +
      (newest.archive_error ? ` error="${newest.archive_error}"` : ""),
  );
  if (attempted === 0 && items.some((i) => i.archive_status === "pending")) {
    console.log(
      "[archive] nothing has ever been attempted — is `npm run dev:trigger` running? " +
        "Queued rows stay pending until a task picks them up.",
    );
  }
}

export function useMarket(clientId: string) {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await authFetch(`/api/clients/${clientId}/market`);
    if (res.ok) {
      const next = (await res.json()) as MarketData;
      setData(next);
      logArchiveState(next);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    // Initial data fetch — state updates land after the awaited response, not
    // synchronously in the effect body (same shape as use-moodboards/use-brand-kit).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // D276 — refetch when the archive task, a teammate, or the sweep changes a row on one
  // of this client's two boards. Enabled only once we know the board ids.
  useMarketUpdates(
    data ? [data.direct.board.id, data.adjacent.board.id] : [],
    data !== null,
    refresh,
  );

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
