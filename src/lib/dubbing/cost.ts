import { USD_TO_INR } from "@/lib/pricing";
import { usdToFinalCredits } from "@/lib/credits/units";

/** Sarvam Dubbing, Starter API rate, per minute of source per target language. */
export const SARVAM_DUB_INR_PER_MIN = 40;
/** sync lipsync-2-pro on fal, listed rate per minute of video. Check fal's model page before launch. */
export const LIP_SYNC_PRO_USD_PER_MIN = 5;

/** Billed per whole second of source, one target language. */
export function computeDubCost(seconds: number): { usd: number } {
  return { usd: ((Math.ceil(seconds) / 60) * SARVAM_DUB_INR_PER_MIN) / USD_TO_INR };
}

export function computeLipSyncCost(seconds: number): { usd: number } {
  return { usd: (seconds / 60) * LIP_SYNC_PRO_USD_PER_MIN };
}

/** The figure on the button IS the reservation (D377): both read these. */
export const dubCredits = (seconds: number) => usdToFinalCredits(computeDubCost(seconds).usd);
export const lipSyncCredits = (seconds: number) => usdToFinalCredits(computeLipSyncCost(seconds).usd);
