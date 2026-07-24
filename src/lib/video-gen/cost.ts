import { USD_TO_INR } from "@/lib/pricing";

// Source: ai.google.dev/gemini-api/docs/pricing (verified 2026-07-24, page fetched by the
// user directly — every Veo 3.1 row is explicitly labeled "with audio price (default)",
// with no separate, cheaper no-audio tier listed at all). This app never toggles Veo's
// audio either way — params/veo.ts has no audio field, so Veo always runs at the API's own
// default, which generates audio. audioMultiplier is kept at 1.0 for all three Veo models
// (no real audio-based price split exists to multiply) purely so this table shares a shape
// with Kling's. Resolution tiers above 720p (1080p/4k) aren't modeled: this app doesn't
// expose a resolution param for Veo, so 720p is the only reachable tier.
//   Lite:    $0.05/s (720p)
//   Fast:    $0.10/s (720p)
//   Quality: $0.40/s (720p) — previously 0.2667 here (a stale "base rate" that a 1.5x
//     audio multiplier never actually applied, since Veo has no audio toggle) — a
//     confirmed 33% under-count on every Quality generation to date. Not backfilled,
//     corrected going forward only.
const VIDEO_MODEL_PRICING: Record<
  string,
  { perSecond: number; audioMultiplier: number }
> = {
  "veo:veo-3.1-lite":  { perSecond: 0.05, audioMultiplier: 1.0 },
  "veo:veo-3.1-fast":  { perSecond: 0.10, audioMultiplier: 1.0 },
  "veo:veo-3.1":       { perSecond: 0.40, audioMultiplier: 1.0 },
  // Source: platform.openai.com/docs/pricing (verified June 2026)
  // $0.10/s at 720p; no audio output, no premium multiplier
  "openai:sora-2":     { perSecond: 0.10,   audioMultiplier: 1.0 },
};

// Kling price varies by resolution AND audio (not just audio) — resolution-keyed table.
// Source: kling.ai/document-api/pricing/base/video (fetched 2026-07-23), restricted to
// the "no video-input / no voice-control / no motion-control" tiers this integration
// actually reaches. `on` = native/original audio; `off` = no audio. Missing keys mean
// that combination has no priced tier (e.g. 2.6 has no "native audio at 720p" row).
type KlingResolutionRates = Record<string, { off?: number; on?: number }>;

const KLING_RESOLUTION_PRICING: Record<string, KlingResolutionRates> = {
  // Only a single "native audio" tier exists for turbo — no off/on toggle to make.
  "kling:kling-3-0-turbo": {
    "720p": { on: 0.112 },
    "1080p": { on: 0.14 },
  },
  "kling:kling-2-6": {
    "720p": { off: 0.042 },
    "1080p": { off: 0.07, on: 0.14 },
  },
  "kling:kling-2-5-turbo": {
    "720p": { off: 0.042 },
    "1080p": { off: 0.07 },
  },
  "kling:kling-3-0": {
    "720p": { off: 0.084, on: 0.112 },
    "1080p": { off: 0.112, on: 0.14 },
    "4k": { off: 0.42, on: 0.42 },
  },
  // ASSUMPTION: o1 audio delta not split out on the pricing page (only splits by
  // video-input); reused the same $0.028/s step seen on 3.0. Revisit if wrong.
  "kling:kling-o1": {
    "720p": { off: 0.084, on: 0.112 },
    "1080p": { off: 0.112, on: 0.14 },
  },
};

/**
 * Determines whether audio is enabled for a video generation.
 * Returns true only when audioValue is explicitly "native" or "original".
 */
export function isVideoAudioEnabled(audioValue: unknown): boolean {
  return audioValue === "native" || audioValue === "original";
}

/**
 * Coerces a value to a resolution string if it's already a string, otherwise undefined.
 */
export function asResolutionString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function computeVideoCost(
  modelId: string,
  durationSeconds: number,
  audioEnabled: boolean,
  resolution?: string,
): { usd: number; inr: number } | null {
  const resolutionPricing = KLING_RESOLUTION_PRICING[modelId];
  if (resolutionPricing) {
    const rates = resolutionPricing[resolution ?? "720p"];
    if (!rates) return null;
    // Fall back to whichever tier exists when the requested one doesn't (e.g. turbo
    // only has "on", 2.6 only has "off" at 720p).
    const perSecond = (audioEnabled ? rates.on : rates.off) ?? rates.off ?? rates.on;
    if (perSecond === undefined) return null;
    const usd = durationSeconds * perSecond;
    return { usd, inr: usd * USD_TO_INR };
  }

  const pricing = VIDEO_MODEL_PRICING[modelId];
  if (!pricing) return null;
  const multiplier = audioEnabled ? pricing.audioMultiplier : 1;
  const usd = durationSeconds * pricing.perSecond * multiplier;
  return { usd, inr: usd * USD_TO_INR };
}
