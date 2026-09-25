import { VoiceChangeSettingsSchema } from "@/lib/elevenlabs/voice-settings";
import type { VoiceChangeRecord } from "./types";

// D284 — client-safe (no `server-only`/storage import): the version history / usage panels
// (Tasks 5-6) read a version's inputs_used.voiceChange straight off the client bundle.
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
