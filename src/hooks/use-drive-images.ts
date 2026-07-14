"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DriveImageItem,
  DriveImagesResponse,
} from "@/app/api/drive/images/route";

type CacheState = {
  pages: DriveImageItem[][];
  nextPageToken: string | null;
  loadError: Error | null;
};

// Module-level singleton: survives drawer close/open, cleared on page reload.
let cache: CacheState = { pages: [], nextPageToken: null, loadError: null };
let hasFetchedOnce = false;
let inFlightController: AbortController | null = null;
const subscribers = new Set<() => void>();

function notify() {
  for (const cb of subscribers) cb();
}

function setCache(next: CacheState) {
  cache = next;
  notify();
}

function computeAvailableFolders(pages: DriveImageItem[][]) {
  const seen = new Map<string, { id: string; name: string }>();
  for (const page of pages) {
    for (const item of page) {
      if (item.parentFolder && !seen.has(item.parentFolder.id)) {
        seen.set(item.parentFolder.id, item.parentFolder);
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchPage(
  pageToken: string | undefined,
  signal: AbortSignal,
): Promise<DriveImagesResponse> {
  const url = pageToken
    ? `/api/drive/images?pageToken=${encodeURIComponent(pageToken)}`
    : "/api/drive/images";
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Drive images fetch failed: ${res.status}`);
  return (await res.json()) as DriveImagesResponse;
}

/** Core fetch + cache-write, extracted so it's testable without React. */
async function doFetch(
  pageToken: string | undefined,
  mode: "initial" | "more" | "refresh",
  onLoadingChange?: (loading: boolean, kind: "initial" | "more") => void,
) {
  inFlightController?.abort();
  const controller = new AbortController();
  inFlightController = controller;
  const kind = mode === "more" ? "more" : "initial";
  onLoadingChange?.(true, kind);
  try {
    const data = await fetchPage(pageToken, controller.signal);
    if (controller.signal.aborted) return;
    if (mode === "more") {
      setCache({
        pages: [...cache.pages, data.items],
        nextPageToken: data.nextPageToken,
        loadError: null,
      });
    } else {
      setCache({ pages: [data.items], nextPageToken: data.nextPageToken, loadError: null });
    }
  } catch (err) {
    if (controller.signal.aborted) return;
    if ((err as { name?: string }).name === "AbortError") return;
    setCache({ ...cache, loadError: err as Error });
  } finally {
    if (!controller.signal.aborted) onLoadingChange?.(false, kind);
  }
}

/** Test-only: reset module state between tests. */
export function __resetDriveImagesCache() {
  cache = { pages: [], nextPageToken: null, loadError: null };
  hasFetchedOnce = false;
  inFlightController?.abort();
  inFlightController = null;
}

/** Test-only: pure internals for cache manipulation. */
export const __driveImagesInternals = {
  doFetch,
  getState: () => cache,
  computeAvailableFolders,
};

export function useDriveImages() {
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  useEffect(() => {
    subscribers.add(rerender);
    return () => {
      subscribers.delete(rerender);
    };
  }, [rerender]);

  const [loading, setLoading] = useState(!hasFetchedOnce);
  const [loadingMore, setLoadingMore] = useState(false);

  const onLoadingChange = useCallback(
    (isLoading: boolean, kind: "initial" | "more") => {
      if (kind === "more") setLoadingMore(isLoading);
      else setLoading(isLoading);
    },
    [],
  );

  useEffect(() => {
    if (hasFetchedOnce) {
      setLoading(false);
      return;
    }
    hasFetchedOnce = true;
    void doFetch(undefined, "initial", onLoadingChange);
  }, [onLoadingChange]);

  const loadMore = useCallback(async () => {
    if (!cache.nextPageToken || loadingMore) return;
    await doFetch(cache.nextPageToken, "more", onLoadingChange);
  }, [loadingMore, onLoadingChange]);

  const refresh = useCallback(async () => {
    hasFetchedOnce = true;
    setCache({ pages: [], nextPageToken: null, loadError: null });
    await doFetch(undefined, "refresh", onLoadingChange);
  }, [onLoadingChange]);

  const availableFolders = useMemo(
    () => computeAvailableFolders(cache.pages),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cache.pages],
  );

  return {
    pages: cache.pages,
    nextPageToken: cache.nextPageToken,
    loading,
    loadingMore,
    loadError: cache.loadError,
    availableFolders,
    loadMore,
    refresh,
  };
}
