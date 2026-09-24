"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { elevenLabsApi } from "@/lib/elevenlabs/api";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import {
  EMPTY_FILTERS, filterAccountVoices, libraryParams, type VoiceFilters,
} from "@/lib/elevenlabs/voice-filters";

export type VoiceTab = "account" | "library";
const SEARCH_DEBOUNCE_MS = 300;

/** D283 — state for the voice picker popover: tabs, filters (per tab), both lists, paging, one preview at a time. */
export function useVoiceBrowser(open: boolean) {
  const [tab, setTab] = useState<VoiceTab>("account");
  // Review fix — filters (including sort) used to be one shared object, so a My-voices sort
  // value ("name"/"newest") or an account-only label leaked into the Library query — sent
  // straight through to /v1/shared-voices — the moment the operator switched tabs. Each tab now
  // keeps its own filters (search included, the simplest split).
  const [filtersByTab, setFiltersByTab] = useState<Record<VoiceTab, VoiceFilters>>({
    account: EMPTY_FILTERS,
    library: EMPTY_FILTERS,
  });
  const filters = filtersByTab[tab];

  const [accountAll, setAccountAll] = useState<PickerVoice[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountNonce, setAccountNonce] = useState(0);

  const [library, setLibrary] = useState<{ voices: PickerVoice[]; cursor: string | null; hasMore: boolean }>(
    { voices: [], cursor: null, hasMore: true },
  );
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const libraryReq = useRef(0);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Debounce only the Library tab's own search text — the account list is filtered in the
  // browser, so there's no request to debounce for it.
  const [debouncedLibrarySearch, setDebouncedLibrarySearch] = useState(filtersByTab.library.search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedLibrarySearch(filtersByTab.library.search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filtersByTab.library.search]);

  // Account list: load once per open (server caches 5 min); reload on Retry.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for this fetch
    setAccountLoading(true);
    elevenLabsApi
      .listVoices({ source: "account" })
      .then((r) => {
        if (!cancelled) { setAccountAll(r.voices); setAccountError(null); }
      })
      .catch((e: unknown) => {
        if (!cancelled) setAccountError(e instanceof Error ? e.message : "Could not load voices.");
      })
      .finally(() => {
        if (!cancelled) setAccountLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, accountNonce]);

  const accountVoices = useMemo(
    () => filterAccountVoices(accountAll, filtersByTab.account),
    [accountAll, filtersByTab.account],
  );

  const lf = filtersByTab.library;
  // Review fix — depends on the individual filter fields + the DEBOUNCED search, never the whole
  // filters object (which carries the raw, undebounced search text). Depending on the object
  // meant its identity changed on every keystroke, which refetched Library page 0 on each one.
  const libraryFilters = useMemo(
    () => ({ ...lf, search: debouncedLibrarySearch }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally NOT `lf` or `lf.search`; see comment above.
    [lf.gender, lf.age, lf.accent, lf.language, lf.useCase, lf.sort, debouncedLibrarySearch],
  );

  const fetchLibraryPage = useCallback(
    (cursor: string | null) => {
      const req = ++libraryReq.current;
      setLibraryLoading(true);
      elevenLabsApi
        .listVoices(libraryParams(libraryFilters, cursor))
        .then((r) => {
          if (req !== libraryReq.current) return; // a newer filter change superseded this page
          setLibrary((prev) => ({
            voices: cursor === null ? r.voices : [...prev.voices, ...r.voices],
            cursor: r.nextCursor,
            hasMore: r.nextCursor !== null,
          }));
          setLibraryError(null);
        })
        .catch((e: unknown) => {
          if (req === libraryReq.current) setLibraryError(e instanceof Error ? e.message : "Could not load the Voice Library.");
        })
        .finally(() => {
          if (req === libraryReq.current) setLibraryLoading(false);
        });
    },
    [libraryFilters],
  );

  // Library: first page whenever the tab opens or its filters change.
  useEffect(() => {
    if (!open || tab !== "library") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the fetch; state lands in fetchLibraryPage's .then()/.catch()/.finally()
    fetchLibraryPage(null);
  }, [open, tab, fetchLibraryPage]);

  const loadMore = useCallback(() => {
    if (libraryLoading || !library.hasMore || library.cursor === null) return;
    fetchLibraryPage(library.cursor);
  }, [libraryLoading, library.hasMore, library.cursor, fetchLibraryPage]);

  // Preview: one element, one voice at a time; stopped on close/unmount.
  const stopPreview = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  }, []);

  const togglePreview = useCallback(
    (voice: PickerVoice) => {
      if (playingId === voice.voiceId) return stopPreview();
      stopPreview();
      if (!voice.previewUrl) return;
      const audio = new Audio(voice.previewUrl);
      audio.onended = () => setPlayingId((id) => (id === voice.voiceId ? null : id));
      audioRef.current = audio;
      setPlayingId(voice.voiceId);
      void audio.play().catch(() => {
        audioRef.current = null;
        setPlayingId(null);
      });
    },
    [playingId, stopPreview],
  );

  // Stop only on an open → closed transition (the trigger's own preview button plays while closed).
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) stopPreview();
    wasOpen.current = open;
  }, [open, stopPreview]);
  useEffect(() => stopPreview, [stopPreview]);

  const setFilter = useCallback(
    (key: keyof VoiceFilters, value: string) =>
      setFiltersByTab((f) => ({ ...f, [tab]: { ...f[tab], [key]: value } })),
    [tab],
  );
  const clearFilters = useCallback(
    () => setFiltersByTab((f) => ({ ...f, [tab]: { ...EMPTY_FILTERS, sort: f[tab].sort } })),
    [tab],
  );

  return {
    tab,
    setTab,
    filters,
    setFilter,
    clearFilters,
    accountAll,
    accountVoices,
    accountLoading,
    accountError,
    library: { voices: library.voices, loading: libraryLoading, error: libraryError, hasMore: library.hasMore, loadMore },
    // Reopening the popover after a Library save always refetches the account list (the effect
    // above re-runs on the open → true transition), which is enough to show the newly-saved
    // voice under My voices — no need for an explicit nonce bump here.
    retry: () => (tab === "account" ? setAccountNonce((n) => n + 1) : fetchLibraryPage(null)),
    preview: { playingId, toggle: togglePreview },
  };
}
