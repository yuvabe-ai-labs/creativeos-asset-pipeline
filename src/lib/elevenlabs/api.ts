// Client-safe wrapper for /api/elevenlabs/voices. Throws with the server's message.
import type { ElevenLabsVoice } from "./client";

export const elevenLabsApi = {
  async fetchVoices(): Promise<ElevenLabsVoice[]> {
    const res = await fetch("/api/elevenlabs/voices", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as
      | { voices?: ElevenLabsVoice[]; error?: string }
      | null;
    if (!res.ok) throw new Error(json?.error ?? "Could not load voices.");
    return json?.voices ?? [];
  },
};
