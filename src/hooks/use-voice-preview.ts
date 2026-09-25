"use client";

import { useCallback, useEffect, useState } from "react";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

/**
 * D283/D284 — one-at-a-time audio preview playback for a voice row or card.
 *
 * The Change voice workspace mounts TWO instances of this hook at once: the voice browser (via
 * `useVoiceBrowser`) and the settings card's own preview (`video-gen-change-voice.tsx`). Each
 * used to own a private `HTMLAudioElement`, so starting a preview in one left the other's still
 * playing — two voices audible at once. The single `HTMLAudioElement` below is now a
 * module-level singleton shared by every `useVoicePreview()` call in the tree; each hook
 * instance is just a subscriber that mirrors the singleton's `playingId`, so starting a preview
 * anywhere stops whatever was playing anywhere else. The public API (`{ playingId, toggle, stop
 * }`) is unchanged.
 */

type Listener = (playingId: string | null) => void;

let sharedAudio: HTMLAudioElement | null = null;
let sharedPlayingId: string | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener(sharedPlayingId);
}

function stopShared() {
  sharedAudio?.pause();
  sharedAudio = null;
  sharedPlayingId = null;
  notify();
}

function toggleShared(voice: PickerVoice) {
  if (sharedPlayingId === voice.voiceId) {
    stopShared();
    return;
  }
  stopShared();
  if (!voice.previewUrl) return;
  const audio = new Audio(voice.previewUrl);
  // Only clears the shared state if THIS audio is still the current one — guards against a
  // stale onended/catch firing after a newer toggle() already replaced it.
  const clearIfCurrent = () => {
    if (sharedAudio !== audio) return;
    sharedAudio = null;
    sharedPlayingId = null;
    notify();
  };
  audio.onended = clearIfCurrent;
  sharedAudio = audio;
  sharedPlayingId = voice.voiceId;
  notify();
  void audio.play().catch(clearIfCurrent);
}

export function useVoicePreview() {
  const [playingId, setPlayingId] = useState<string | null>(sharedPlayingId);

  useEffect(() => {
    listeners.add(setPlayingId);
    return () => {
      listeners.delete(setPlayingId);
    };
  }, []);

  const stop = useCallback(() => stopShared(), []);
  const toggle = useCallback((voice: PickerVoice) => toggleShared(voice), []);

  useEffect(() => stop, [stop]);

  return { playingId, toggle, stop };
}
