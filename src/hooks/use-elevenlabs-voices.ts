"use client";

import { useEffect, useState } from "react";
import { elevenLabsApi } from "@/lib/elevenlabs/api";
import type { ElevenLabsVoice } from "@/lib/elevenlabs/client";

/** D282 — the account's voices for the Video Gen voice picker. Loads once `enabled` is true. */
export function useElevenLabsVoices(enabled: boolean) {
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Same pattern as use-tracked-handles.ts/use-market.ts: this kicks off the fetch,
    // the actual state updates land in the async .then()/.catch()/.finally() below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    elevenLabsApi
      .fetchVoices()
      .then((v) => {
        if (!cancelled) {
          setVoices(v);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load voices.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { voices, loading, error };
}
