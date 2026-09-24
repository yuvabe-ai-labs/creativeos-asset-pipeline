"use client";

import { useEffect, useState } from "react";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

/**
 * D283 — resolves the node's stored voiceId to a voice (name, preview, multiplier) with one lookup,
 * so nothing depends on which list page is loaded. `notFound` = the account no longer has it.
 */
export function useSelectedVoice(voiceId: string | null) {
  const [state, setState] = useState<{ voice: PickerVoice | null; loading: boolean; notFound: boolean; error: string | null }>(
    { voice: null, loading: false, notFound: false, error: null },
  );

  useEffect(() => {
    if (!voiceId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the selection clears
      setState({ voice: null, loading: false, notFound: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, notFound: false, error: null }));
    fetch(`/api/elevenlabs/voices/${encodeURIComponent(voiceId)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { voice?: PickerVoice; error?: string } | null;
        if (cancelled) return;
        if (res.status === 404) setState({ voice: null, loading: false, notFound: true, error: null });
        else if (!res.ok || !json?.voice) setState({ voice: null, loading: false, notFound: false, error: json?.error ?? "Could not load the voice." });
        else setState({ voice: json.voice, loading: false, notFound: false, error: null });
      })
      .catch(() => {
        if (!cancelled) setState({ voice: null, loading: false, notFound: false, error: "Could not load the voice." });
      });
    return () => {
      cancelled = true;
    };
  }, [voiceId]);

  return state;
}
