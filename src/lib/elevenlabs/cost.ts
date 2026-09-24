import { USD_TO_INR } from "@/lib/pricing";
import { VOICE_CHANGE_USD_PER_MINUTE } from "./constants";

/** ElevenLabs bills voice change by audio duration, times the voice's custom-rate multiplier (D283). */
export function computeVoiceChangeCost(
  durationSeconds: number,
  priceMultiplier = 1,
): { usd: number; inr: number } {
  const usd = (durationSeconds / 60) * VOICE_CHANGE_USD_PER_MINUTE * priceMultiplier;
  return { usd, inr: usd * USD_TO_INR };
}
