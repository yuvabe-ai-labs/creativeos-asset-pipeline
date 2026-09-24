import { listVoices, type ElevenLabsVoice } from "./client";
import { VOICES_CACHE_TTL_MS } from "./constants";

let cache: { at: number; voices: ElevenLabsVoice[] } | null = null;

/** The account's voices, reused for 5 minutes. A failed load is never cached. */
export async function getVoicesCached(
  loader: () => Promise<ElevenLabsVoice[]> = () => listVoices(),
  now: () => number = Date.now,
): Promise<ElevenLabsVoice[]> {
  const t = now();
  if (cache && t - cache.at <= VOICES_CACHE_TTL_MS) return cache.voices;
  const voices = await loader();
  cache = { at: t, voices };
  return voices;
}

export function _resetVoicesCache(): void {
  cache = null;
}
