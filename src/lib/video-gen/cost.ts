import { USD_TO_INR } from "@/lib/pricing";

const VIDEO_MODEL_PRICING: Record<
  string,
  { perSecond: number; audioMultiplier: number }
> = {
  "veo:veo-3.1-lite":  { perSecond: 0.05, audioMultiplier: 1.5 },
  "veo:veo-3.1-fast":  { perSecond: 0.10, audioMultiplier: 1.5 },
  "veo:veo-3.1":       { perSecond: 0.30, audioMultiplier: 1.5 },
};

export function computeVideoCost(
  modelId: string,
  durationSeconds: number,
  audioEnabled: boolean,
): { usd: number; inr: number } | null {
  const pricing = VIDEO_MODEL_PRICING[modelId];
  if (!pricing) return null;
  const multiplier = audioEnabled ? pricing.audioMultiplier : 1;
  const usd = durationSeconds * pricing.perSecond * multiplier;
  return { usd, inr: usd * USD_TO_INR };
}
