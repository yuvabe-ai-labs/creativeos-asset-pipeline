"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { elevenLabsApi } from "@/lib/elevenlabs/api";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import {
  EMPTY_FILTERS, filterAccountVoices, libraryParams, type VoiceFilters,
} from "@/lib/elevenlabs/voice-filters";

export type VoiceTab = "account" | "library";
const SEARCH_DEBOUNCE_MS = 300;

/** D283 — state for the voice picker popover: tabs, filters, both lists, paging, one preview at a time. */
export function useVoiceBrowser(open: boolean) {
  const [tab, setTab] = useState<VoiceTab>("account");
  const [filters, setFilters] = useState<VoiceFilters>(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState("");

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
  const [saving, setSaving] = useState<{ id: string | null; error: string | null }>({ id: null, error: null });

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters.search]);

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
    () => filterAccountVoices(accountAll, filters),
    [accountAll, filters],
  );

  const libraryFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
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

  /** The account voiceId to store for `voice`, saving Library voices first. Null on refusal. */
  const choose = useCallback(async (voice: PickerVoice): Promise<string | null> => {
    if (voice.source === "account") return voice.voiceId;
    setSaving({ id: voice.voiceId, error: null });
    try {
      const saved = await elevenLabsApi.saveVoice({
        publicOwnerId: voice.publicOwnerId ?? "",
        voiceId: voice.voiceId,
        name: voice.name,
      });
      setSaving({ id: null, error: null });
      setAccountNonce((n) => n + 1); // the saved voice now belongs under My voices
      return saved.voiceId;
    } catch (e) {
      setSaving({ id: voice.voiceId, error: e instanceof Error ? e.message : "Could not save this voice." });
      return null;
    }
  }, []);

  return {
    tab,
    setTab,
    filters,
    setFilter: (key: keyof VoiceFilters, value: string) => setFilters((f) => ({ ...f, [key]: value })),
    clearFilters: () => setFilters((f) => ({ ...EMPTY_FILTERS, sort: f.sort })),
    accountAll,
    accountVoices,
    accountLoading,
    accountError,
    library: { voices: library.voices, loading: libraryLoading, error: libraryError, hasMore: library.hasMore, loadMore },
    retry: () => (tab === "account" ? setAccountNonce((n) => n + 1) : fetchLibraryPage(null)),
    preview: { playingId, toggle: togglePreview },
    saving,
    choose,
  };
}
