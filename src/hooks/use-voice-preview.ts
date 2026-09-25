"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { createPreviewController } from "@/lib/elevenlabs/preview-controller";

/**
 * D283/D284 — voice preview playback. Every hook instance shares ONE controller, so only one
 * preview plays on the page at a time (the Edit voice panel mounts the voice browser and the
 * chosen-voice card together). Each instance has its own owner token: `stop()` and unmount only
 * stop a preview this instance started. Logic + tests: src/lib/elevenlabs/preview-controller.ts.
 */
const shared = createPreviewController((url) => {
  const audio = new Audio(url);
  return {
    play: () => audio.play(),
    pause: () => audio.pause(),
    onEnded: (fn) => audio.addEventListener("ended", fn, { once: true }),
  };
});

export function useVoicePreview() {
  const owner = useMemo(() => Symbol("voice-preview"), []);
  const [playingId, setPlayingId] = useState<string | null>(shared.playingId());

  useEffect(() => shared.subscribe(setPlayingId), []);

  const stop = useCallback(() => shared.stop(owner), [owner]);
  const toggle = useCallback((voice: PickerVoice) => shared.toggle(owner, voice), [owner]);

  useEffect(() => stop, [stop]);

  return { playingId, toggle, stop };
}
