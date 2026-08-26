"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIdentity } from "./use-identity";
import { subscribeToOrgVersionUpdates } from "@/lib/realtime/org-version-updates";
import { authFetch } from "@/lib/supabase/session-ready";
import type { InboxItem } from "@/lib/review/queue";

const PAGE_SIZE = 25;
// Coalesces a burst of version writes (a batch duplicate, several generations landing at
// once) into one refresh instead of one per row.
const REFRESH_DEBOUNCE_MS = 400;

type Result = {
  items: InboxItem[];
  /** First load only — drives the skeleton. Paging in more never blanks the list. */
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
};

// Windowed infinite scroll over a review endpoint, shared by the canvas drawer and the
// navbar inbox so the two behave identically.
//
// Two behaviours worth stating, because both are the difference between "smooth" and
// "janky" here:
//
//   * A live update REFRESHES THE PAGES ALREADY LOADED — it re-fetches from offset 0 up to
//     however far the reviewer has scrolled, in one request. Appending or dropping single
//     rows would fight the scroll position; re-fetching the window keeps it exactly.
//   * A failed fetch NEVER blanks the list (R8.5). Stale beats empty: an empty queue reads
//     as "you're done", which is the one wrong answer that stops someone looking.
export function useReviewList(endpoint: string | null, enabled = true): Result {
  const { orgId } = useIdentity();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // How much is on screen, so a live refresh can restore exactly that window.
  const loadedRef = useRef(0);

  const fetchPage = useCallback(
    async (offset: number, limit: number): Promise<{ items: InboxItem[]; hasMore: boolean } | null> => {
      if (!endpoint) return null;
      try {
        const sep = endpoint.includes("?") ? "&" : "?";
        const res = await authFetch(`${endpoint}${sep}limit=${limit}&offset=${offset}`, {
          cache: "no-store",
        });
        if (!res.ok) return null;
        return (await res.json()) as { items: InboxItem[]; hasMore: boolean };
      } catch {
        return null;
      }
    },
    [endpoint],
  );

  // First page + live refresh of the loaded window.
  useEffect(() => {
    if (!enabled || !endpoint) return;
    let cancelled = false;

    const refresh = async (windowSize: number) => {
      const data = await fetchPage(0, Math.max(windowSize, PAGE_SIZE));
      if (cancelled || !data) {
        // R8.5 — keep whatever is on screen.
        if (!cancelled) setLoading(false);
        return;
      }
      setItems(data.items);
      setHasMore(data.hasMore);
      loadedRef.current = data.items.length;
      setLoading(false);
    };

    void refresh(loadedRef.current || PAGE_SIZE);

    if (!orgId) return () => { cancelled = true; };

    const unsubscribe = subscribeToOrgVersionUpdates(orgId, () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void refresh(loadedRef.current || PAGE_SIZE);
      }, REFRESH_DEBOUNCE_MS);
    });

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      unsubscribe();
    };
  }, [enabled, endpoint, orgId, fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    void (async () => {
      const data = await fetchPage(loadedRef.current, PAGE_SIZE);
      setLoadingMore(false);
      if (!data) return; // R8.5
      setItems((prev) => {
        // De-dupe by version id: a live refresh can race a page append, and a duplicated
        // React key is both a warning and a visibly repeated row.
        const seen = new Set(prev.map((i) => i.versionId));
        const merged = [...prev, ...data.items.filter((i) => !seen.has(i.versionId))];
        loadedRef.current = merged.length;
        return merged;
      });
      setHasMore(data.hasMore);
    })();
  }, [fetchPage, hasMore, loadingMore]);

  return { items, loading, loadingMore, hasMore, loadMore };
}
