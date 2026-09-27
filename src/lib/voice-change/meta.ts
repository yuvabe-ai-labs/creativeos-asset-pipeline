import type { VoiceMeta } from "./types";

/** A VoiceMeta when `value` is one, else null — used on webhook input and stored params. */
export function readVoiceMeta(value: unknown): VoiceMeta | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object") return null;
  if (typeof v.voiceId !== "string" || typeof v.voiceName !== "string") return null;
  if (typeof v.originalUrl !== "string") return null;
  if (v.status !== "applied" && v.status !== "failed") return null;
  return {
    voiceId: v.voiceId,
    voiceName: v.voiceName,
    status: v.status,
    ...(typeof v.error === "string" ? { error: v.error } : {}),
    originalUrl: v.originalUrl,
    priceMultiplier:
      typeof v.priceMultiplier === "number" && v.priceMultiplier >= 1 ? v.priceMultiplier : 1,
  };
}
