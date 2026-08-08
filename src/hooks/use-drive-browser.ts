"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DriveBrowseItem, DriveBrowseResponse } from "@/app/api/drive/browse/route";
import { authFetch } from "@/lib/supabase/session-ready";

export type { DriveBrowseItem };

export type FolderFrame = { id: string; name: string };

type FolderState = {
  items: DriveBrowseItem[];
  nextPageToken: string | null;
  loading: boolean;
  loadingMore: boolean;
  loadError: string | null;
};

const EMPTY: FolderState = {
  items: [],
  nextPageToken: null,
  loading: true,
  loadingMore: false,
  loadError: null,
};

function buildUrl(folderId: string, search: string, pageToken?: string): string {
  const p = new URLSearchParams({ folderId });
  if (search) p.set("q", search);
  if (pageToken) p.set("pageToken", pageToken);
  return `/api/drive/browse?${p.toString()}`;
}

export function useDriveBrowser(rootFolder: FolderFrame | null) {
  const [stack, setStack] = useState<FolderFrame[]>(
    rootFolder ? [rootFolder] : [],
  );
  const [search, setSearchRaw] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [state, setState] = useState<FolderState>(EMPTY);
  const abortRef = useRef<AbortController | null>(null);

  // Sync stack root when rootFolder prop changes (e.g. after linking).
  useEffect(() => {
    setStack(rootFolder ? [rootFolder] : []);
    setSearchRaw("");
    setDebouncedSearch("");
  }, [rootFolder?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search 250ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const currentFolder = stack[stack.length - 1] ?? null;

  const fetchFolder = useCallback(
    async (
      folder: FolderFrame,
      searchTerm: string,
      pageToken: string | undefined,
      mode: "initial" | "more",
    ) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setState((prev) =>
        mode === "more"
          ? { ...prev, loadingMore: true, loadError: null }
          : { ...EMPTY, loading: true },
      );

      try {
        const res = await authFetch(buildUrl(folder.id, searchTerm, pageToken), {
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setState((prev) => ({
            ...prev,
            loading: false,
            loadingMore: false,
            loadError: body.error === "folder_not_found" ? "folder_not_found" : "load_failed",
          }));
          return;
        }

        const data = (await res.json()) as DriveBrowseResponse;
        setState((prev) => ({
          items: mode === "more" ? [...prev.items, ...data.items] : data.items,
          nextPageToken: data.nextPageToken,
          loading: false,
          loadingMore: false,
          loadError: null,
        }));
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setState((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          loadError: "load_failed",
        }));
      }
    },
    [],
  );

  // Fetch whenever current folder or search changes.
  useEffect(() => {
    if (!currentFolder) return;
    void fetchFolder(currentFolder, debouncedSearch, undefined, "initial");
  }, [currentFolder?.id, debouncedSearch, fetchFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateInto = useCallback((folder: FolderFrame) => {
    setStack((s) => [...s, folder]);
    setSearchRaw("");
    setDebouncedSearch("");
  }, []);

  const navigateTo = useCallback((index: number) => {
    setStack((s) => s.slice(0, index + 1));
    setSearchRaw("");
    setDebouncedSearch("");
  }, []);

  const loadMore = useCallback(() => {
    if (!currentFolder || !state.nextPageToken || state.loadingMore) return;
    void fetchFolder(currentFolder, debouncedSearch, state.nextPageToken, "more");
  }, [currentFolder, state.nextPageToken, state.loadingMore, debouncedSearch, fetchFolder]);

  const refresh = useCallback(() => {
    if (!currentFolder) return;
    void fetchFolder(currentFolder, debouncedSearch, undefined, "initial");
  }, [currentFolder, debouncedSearch, fetchFolder]);

  const setSearch = useCallback((v: string) => setSearchRaw(v), []);

  return {
    stack,
    currentFolder,
    items: state.items,
    nextPageToken: state.nextPageToken,
    loading: state.loading,
    loadingMore: state.loadingMore,
    loadError: state.loadError,
    search,
    setSearch,
    navigateInto,
    navigateTo,
    loadMore,
    refresh,
  };
}
