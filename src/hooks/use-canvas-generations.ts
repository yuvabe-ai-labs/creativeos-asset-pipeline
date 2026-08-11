"use client";

import { useCallback, useEffect, useState } from "react";
import type { CanvasGenerationItem } from "@/app/api/canvas/[id]/generations/route";
import { authFetch } from "@/lib/supabase/session-ready";
import { useIdentity } from "@/hooks/use-identity";
import { subscribeToOrgGenerationUpdates } from "@/lib/realtime/org-generation-updates";

type Entry = {
  items: CanvasGenerationItem[];
  loadError: Error | null;
};

const cache = new Map<string, Entry>();
const inFlight = new Map<string, AbortController>();
const subscribers = new Set<() => void>();

function notify() {
  for (const cb of subscribers) cb();
}

export function __resetCanvasGenerationsCache() {
  cache.clear();
  for (const c of inFlight.values()) c.abort();
  inFlight.clear();
}

async function fetchGenerations(
  canvasId: string,
  signal: AbortSignal,
): Promise<CanvasGenerationItem[]> {
  const res = await authFetch(`/api/canvas/${canvasId}/generations`, { signal });
  if (!res.ok) throw new Error(`generations fetch failed: ${res.status}`);
  const body = (await res.json()) as { items: CanvasGenerationItem[] };
  return body.items;
}

async function doFetch(canvasId: string) {
  inFlight.get(canvasId)?.abort();
  const controller = new AbortController();
  inFlight.set(canvasId, controller);
  try {
    const items = await fetchGenerations(canvasId, controller.signal);
    if (controller.signal.aborted) return;
    cache.set(canvasId, { items, loadError: null });
    notify();
  } catch (err) {
    if (controller.signal.aborted) return;
    if ((err as { name?: string }).name === "AbortError") return;
    cache.set(canvasId, { items: [], loadError: err as Error });
    notify();
  }
}

/** Test-only pure internals. */
export const __canvasGenerationsInternals = {
  doFetch,
  getEntry: (canvasId: string) => cache.get(canvasId),
};

export function useCanvasGenerations(canvasId: string) {
  const { orgId } = useIdentity();
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  useEffect(() => {
    subscribers.add(rerender);
    return () => {
      subscribers.delete(rerender);
    };
  }, [rerender]);

  const [loading, setLoading] = useState(!cache.has(canvasId));

  useEffect(() => {
    if (cache.has(canvasId)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void doFetch(canvasId).finally(() => setLoading(false));
  }, [canvasId]);

  // Re-fetch once a succeeded generation lands anywhere in the org — otherwise the Gallery
  // Drawer's "Canvas Generations" tab only ever picks up new images via the manual refresh
  // button. This used to gate the refetch on a client-side lookup of whether row.node_id
  // belonged to this canvas (`supabase.from("nodes").select(...)`), but `nodes` has RLS
  // enabled with ZERO policies (migration 0017_default_deny_rls.sql — a deliberate
  // lockdown, not an oversight): the browser client's anon-key session always gets zero
  // rows back from it, so that check silently never passed and doFetch() never ran. There
  // is no browser-safe way to ask "is this node on my canvas" directly, so instead we
  // refetch unconditionally on every succeeded generation in the org — the real per-canvas
  // scoping already happens server-side inside doFetch's own endpoint (service-role client,
  // filtered by canvasId). Worst case: one harmless extra refetch when the event belongs to
  // a different canvas in the same org.
  useEffect(() => {
    if (!orgId) return;
    const unsubscribe = subscribeToOrgGenerationUpdates(orgId, (row) => {
      if (row.status !== "succeeded") return;
      void doFetch(canvasId);
    });
    return unsubscribe;
  }, [canvasId, orgId]);

  const refresh = useCallback(async () => {
    cache.delete(canvasId);
    setLoading(true);
    try {
      await doFetch(canvasId);
    } finally {
      setLoading(false);
    }
  }, [canvasId]);

  const entry = cache.get(canvasId);

  return {
    items: entry?.items ?? [],
    loading,
    loadError: entry?.loadError ?? null,
    refresh,
  };
}
