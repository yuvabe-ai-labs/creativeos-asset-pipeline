import { USD_TO_INR } from "@/lib/pricing";

// perSecond = no-audio base rate; audioMultiplier applied when audio is enabled.
// Source: ai.google.dev/gemini-api/docs/pricing (verified June 2026)
//   Lite:    $0.05/s (audio not priced separately for Lite)
//   Fast:    $0.10/s base → $0.15/s with audio  (0.10 × 1.5 = 0.15 ✓)
//   Quality: $0.267/s base → $0.40/s with audio (0.267 × 1.5 ≈ 0.40 ✓)
const VIDEO_MODEL_PRICING: Record<
  string,
  { perSecond: number; audioMultiplier: number }
> = {
  "veo:veo-3.1-lite":  { perSecond: 0.05,   audioMultiplier: 1.0 },
  "veo:veo-3.1-fast":  { perSecond: 0.10,   audioMultiplier: 1.5 },
  "veo:veo-3.1":       { perSecond: 0.2667, audioMultiplier: 1.5 },
  // Source: platform.openai.com/docs/pricing (verified June 2026)
  // $0.10/s at 720p; no audio output, no premium multiplier
  "openai:sora-2":     { perSecond: 0.10,   audioMultiplier: 1.0 },
  // Source: klingai.com pricing (verified July 2026)
  // v1.5: ~2 credits/sec at $0.015/credit ≈ $0.030/s
  // v1.6: ~3 credits/sec ≈ $0.040/s
  // v2.1: ~4 credits/sec ≈ $0.060/s
  // v2.1-master: ~5 credits/sec ≈ $0.080/s
  // v2.6: ~7 credits/sec ≈ $0.100/s
  // v3 pro: ~8 credits/sec ≈ $0.120/s (using pro rate as default, D-kling-1)
  "kling:kling-v1-5":        { perSecond: 0.030, audioMultiplier: 1.0 },
  "kling:kling-v1-6":        { perSecond: 0.040, audioMultiplier: 1.0 },
  "kling:kling-v2-1":        { perSecond: 0.060, audioMultiplier: 1.0 },
  "kling:kling-v2-1-master": { perSecond: 0.080, audioMultiplier: 1.0 },
  "kling:kling-v2-6":        { perSecond: 0.100, audioMultiplier: 1.0 },
  "kling:kling-v3":          { perSecond: 0.120, audioMultiplier: 1.0 },
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
