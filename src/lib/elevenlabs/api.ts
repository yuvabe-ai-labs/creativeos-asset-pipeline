// D283 — browser wrappers for the voice picker routes. Throw with the server's message.
import type { PickerVoice } from "./voice-catalog";

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { cache: "no-store", ...init });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !json) throw new Error(json?.error ?? "Could not reach the voice service.");
  return json;
}

export const elevenLabsApi = {
  listVoices(params: Record<string, string>): Promise<{ voices: PickerVoice[]; nextCursor: string | null }> {
    return call(`/api/elevenlabs/voices?${new URLSearchParams(params)}`);
  },
  async saveVoice(body: { publicOwnerId: string; voiceId: string; name: string }): Promise<PickerVoice> {
    return (
      await call<{ voice: PickerVoice }>("/api/elevenlabs/voices/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ).voice;
  },
};
