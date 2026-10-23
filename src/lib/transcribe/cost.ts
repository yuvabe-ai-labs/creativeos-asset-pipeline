import { usdToFinalCredits } from "@/lib/credits/units";

/** ElevenLabs Speech-to-Text, per hour of audio on our plan. Check the plan's rate before launch. */
export const STT_USD_PER_HOUR = 0.4;

export const transcribeCostUsd = (seconds: number) => (seconds / 3600) * STT_USD_PER_HOUR;

/** The figure on the Auto captions button IS the reservation (D377, D399). */
export function transcribeCredits(seconds: number): number {
  return seconds > 0 ? usdToFinalCredits(transcribeCostUsd(seconds)) : 0;
}
