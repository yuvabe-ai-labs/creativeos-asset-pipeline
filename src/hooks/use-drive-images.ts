"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DriveImageItem,
  DriveImagesResponse,
} from "@/app/api/drive/images/route";

export type DriveImagesFilters = {
  sharedOnly: boolean;
  folderIds: string[]; // sorted client-side for stable cache keys
  search: string;
};

type CacheEntry = {
  pages: DriveImageItem[][];
  nextPageToken: string | null;
  loadError: Error | null;
};

// Module-level cache keyed by the filter tuple. Refreshing / changing filters
// keeps existing entries alive so tabs feel snappy on toggle.
const cacheByKey = new Map<string, CacheEntry>();
const hasFetchedByKey = new Set<string>();
let inFlightController: AbortController | null = null;
const subscribers = new Set<() => void>();

function notify() {
  for (const cb of subscribers) cb();
}

function normalize(filters: DriveImagesFilters): DriveImagesFilters {
  return {
    sharedOnly: !!filters.sharedOnly,
    folderIds: [...filters.folderIds].sort(),
    search: filters.search.trim(),
  };
}

function keyOf(filters: DriveImagesFilters): string {
  return JSON.stringify(normalize(filters));
}

function buildUrl(filters: DriveImagesFilters, pageToken?: string): string {
  const params = new URLSearchParams();
  if (filters.sharedOnly) params.set("sharedOnly", "1");
  if (filters.folderIds.length > 0) params.set("folderIds", filters.folderIds.join(","));
  if (filters.search) params.set("q", filters.search);
  if (pageToken) params.set("pageToken", pageToken);
  const qs = params.toString();
  return qs ? `/api/drive/images?${qs}` : "/api/drive/images";
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
  filters: DriveImagesFilters,
  pageToken: string | undefined,
  signal: AbortSignal,
): Promise<DriveImagesResponse> {
  const res = await fetch(buildUrl(filters, pageToken), { signal });
  if (!res.ok) throw new Error(`Drive images fetch failed: ${res.status}`);
  return (await res.json()) as DriveImagesResponse;
}

async function doFetch(
  filters: DriveImagesFilters,
  pageToken: string | undefined,
  mode: "initial" | "more" | "refresh",
  onLoadingChange?: (loading: boolean, kind: "initial" | "more") => void,
) {
  const key = keyOf(filters);
  inFlightController?.abort();
  const controller = new AbortController();
  inFlightController = controller;
  const kind = mode === "more" ? "more" : "initial";
  onLoadingChange?.(true, kind);
  try {
    const data = await fetchPage(filters, pageToken, controller.signal);
    if (controller.signal.aborted) return;
    const prev = cacheByKey.get(key);
    if (mode === "more" && prev) {
      cacheByKey.set(key, {
        pages: [...prev.pages, data.items],
        nextPageToken: data.nextPageToken,
        loadError: null,
      });
    } else {
      cacheByKey.set(key, {
        pages: [data.items],
        nextPageToken: data.nextPageToken,
        loadError: null,
      });
    }
    notify();
  } catch (err) {
    if (controller.signal.aborted) return;
    if ((err as { name?: string }).name === "AbortError") return;
    const prev = cacheByKey.get(key) ?? {
      pages: [],
      nextPageToken: null,
      loadError: null,
    };
    cacheByKey.set(key, { ...prev, loadError: err as Error });
    notify();
  } finally {
    if (!controller.signal.aborted) onLoadingChange?.(false, kind);
  }
}

export function __resetDriveImagesCache() {
  cacheByKey.clear();
  hasFetchedByKey.clear();
  inFlightController?.abort();
  inFlightController = null;
}

export const __driveImagesInternals = {
  doFetch,
  getEntry: (filters: DriveImagesFilters) =>
    cacheByKey.get(keyOf(filters)),
  computeAvailableFolders,
};

export function useDriveImages(filters: DriveImagesFilters) {
  const normalized = useMemo(() => normalize(filters), [filters]);
  const key = useMemo(() => keyOf(normalized), [normalized]);

  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  useEffect(() => {
    subscribers.add(rerender);
    return () => {
      subscribers.delete(rerender);
    };
  }, [rerender]);

  const entry = cacheByKey.get(key);
  const [loading, setLoading] = useState(!hasFetchedByKey.has(key));
  const [loadingMore, setLoadingMore] = useState(false);

  const onLoadingChange = useCallback(
    (isLoading: boolean, kind: "initial" | "more") => {
      if (kind === "more") setLoadingMore(isLoading);
      else setLoading(isLoading);
    },
    [],
  );

  useEffect(() => {
    if (hasFetchedByKey.has(key)) {
      setLoading(false);
      return;
    }
    hasFetchedByKey.add(key);
    void doFetch(normalized, undefined, "initial", onLoadingChange);
  }, [key, normalized, onLoadingChange]);

  const loadMore = useCallback(async () => {
    const current = cacheByKey.get(key);
    if (!current?.nextPageToken || loadingMore) return;
    await doFetch(normalized, current.nextPageToken, "more", onLoadingChange);
  }, [key, normalized, loadingMore, onLoadingChange]);

  const refresh = useCallback(async () => {
    hasFetchedByKey.add(key);
    cacheByKey.delete(key);
    await doFetch(normalized, undefined, "refresh", onLoadingChange);
  }, [key, normalized, onLoadingChange]);

  const availableFolders = useMemo(
    () => computeAvailableFolders(entry?.pages ?? []),
    [entry?.pages],
  );

  return {
    pages: entry?.pages ?? [],
    nextPageToken: entry?.nextPageToken ?? null,
    loading,
    loadingMore,
    loadError: entry?.loadError ?? null,
    availableFolders,
    loadMore,
    refresh,
  };
}
