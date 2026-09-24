import { USD_TO_INR } from "@/lib/pricing";
import { VOICE_CHANGE_USD_PER_MINUTE } from "./constants";

/** ElevenLabs bills voice change by audio duration only. */
export function computeVoiceChangeCost(durationSeconds: number): { usd: number; inr: number } {
  const usd = (durationSeconds / 60) * VOICE_CHANGE_USD_PER_MINUTE;
  return { usd, inr: usd * USD_TO_INR };
}
