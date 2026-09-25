"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

/**
 * D283/D284 — one-at-a-time audio preview playback for a voice row or card. Extracted out of
 * `useVoiceBrowser` (D284) so the Change voice workspace's settings card can preview the chosen
 * voice without a second, otherwise-idle browser instance — `useVoiceBrowser` still owns this for
 * the browser panel's rows.
 */
export function useVoicePreview() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  }, []);

  const toggle = useCallback(
    (voice: PickerVoice) => {
      if (playingId === voice.voiceId) return stop();
      stop();
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
    [playingId, stop],
  );

  useEffect(() => stop, [stop]);

  return { playingId, toggle, stop };
}
