import { VoiceChangeSettingsSchema } from "@/lib/elevenlabs/voice-settings";
import type { VoiceChangeRecord } from "./types";

// D284 — client-safe (no `server-only`/storage import): the version history / usage panels
// (Tasks 5-6) read a version's inputs_used.voiceChange straight off the client bundle.

/**
 * A version's recorded audio duration, in seconds — the single source both the server-side
 * source resolver (source.ts, priced at request time) and the client workspace (the
 * pre-generation estimate) read from `params_used`/`paramsUsed`. `0` when nothing usable is
 * recorded, never negative or non-finite.
 */
export function durationOfParams(params: Record<string, unknown>): number {
  const d = Number(params.durationSeconds ?? params.duration ?? params.seconds);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

export function readVoiceChange(value: unknown): VoiceChangeRecord | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object") return null;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
  const settings = VoiceChangeSettingsSchema.safeParse(v.settings);
  if (!str("baseVersionId") || !str("rootVersionId") || !str("voiceId") || !str("voiceName") || !str("sourceUrl") || !settings.success) return null;
  return {
    baseVersionId: str("baseVersionId")!, rootVersionId: str("rootVersionId")!, sourceUrl: str("sourceUrl")!,
    voiceId: str("voiceId")!, voiceName: str("voiceName")!,
    priceMultiplier: typeof v.priceMultiplier === "number" && v.priceMultiplier >= 1 ? v.priceMultiplier : 1,
    settings: settings.data,
    ...(typeof v.driftMs === "number" ? { driftMs: v.driftMs } : {}),
  };
}
