import { USD_TO_INR } from "@/lib/pricing";

// Source: platform.openai.com/docs/pricing (verified June 2026)
// $0.10/s at 720p; no audio output, no premium multiplier
const VIDEO_MODEL_PRICING: Record<
  string,
  { perSecond: number; audioMultiplier: number }
> = {
  "openai:sora-2":     { perSecond: 0.10,   audioMultiplier: 1.0 },
};

// Source: ai.google.dev/gemini-api/docs/pricing (verified 2026-08-08). Every Veo 3.1 row is
// still the flat "with audio" price (default) — no separate, cheaper no-audio tier — so audio
// stays irrelevant to price, same as before. What changed: params/veo.ts now exposes a
// resolution param (previously absent, so every generation silently ran at the API's 720p
// default), and the API's own pricing table splits 720p from 1080p for Lite and Fast (Quality
// is priced flat across both — Google confirms one rate for "720p and 1080p"). 4k exists on
// Quality ($0.60/s) and Fast ($0.30/s) per the same page, but is left out: the SDK's
// GenerateVideosConfig.resolution only documents "720p" and "1080p" as supported values
// (node_modules/@google/genai/dist/genai.d.ts), and params/veo.ts doesn't offer a 4k option —
// so a 4k rate here would be unreachable dead weight.
//   Lite:    $0.05/s (720p) → $0.08/s (1080p)
//   Fast:    $0.10/s (720p) → $0.12/s (1080p)
//   Quality: $0.40/s (720p and 1080p — same rate)
// Renamed from VEO_RESOLUTION_PRICING: this is the shape for any model priced by resolution where
// audio does not move the price — now Veo AND Gemini Omni. Omni generates audio on every request
// and the published rate already includes it, so there is no audio dimension to key on, exactly
// as with every Veo 3.1 row.
const RESOLUTION_ONLY_PRICING: Record<string, Record<string, number>> = {
  "veo:veo-3.1-lite":  { "720p": 0.05, "1080p": 0.08 },
  "veo:veo-3.1-fast":  { "720p": 0.10, "1080p": 0.12 },
  "veo:veo-3.1":       { "720p": 0.40, "1080p": 0.40 },
  // Source: ai.google.dev/gemini-api/docs/pricing + the Omni 1.1 launch post (verified
  // 2026-08-28). 1080p and 4k are UPSCALED from a 720p generation, not natively rendered — the
  // price rises 1.5x and 3x for resolution alone, which is why 720p is the default and 360p
  // ($0.03/s, ~60% faster) is the draft tier.
  "gemini:gemini-omni-1.1-flash": {
    "360p": 0.03, "720p": 0.10, "1080p": 0.15, "4k": 0.30,
  },
};

// Kling price varies by resolution AND audio (not just audio) — resolution-keyed table.
// Source: kling.ai/document-api/pricing/base/video, full table pasted directly by the user
// 2026-07-24 (verified against the real page, not the 2026-07-23 fetch the values below
// replace). Restricted to the "no video-input / no voice-control / no motion-control"
// tiers this integration actually reaches (this app never sends a reference video to
// Kling — image-to-video via start/end frames only — so "With Video Input" tiers are
// unreachable regardless of model). `on` = native/original audio; `off` = no audio.
//
// Every reachable (resolution, audio) combination this app's own params can actually
// produce must have an explicit entry — no cross-key fallback. Where a model's params
// don't expose a real audio choice (turbo) or audio doesn't move the price (o1), `off`
// and `on` are both populated with the same value, same pattern both ways — never
// inferred by falling back to whichever key happens to exist. A combination that's
// genuinely unpriced (2.6 has no "native audio at 720p" tier — confirmed against the
// real table, not a documentation gap) is left absent on purpose: computeVideoCost
// returns null for it rather than silently charging the wrong tier.
type KlingResolutionRates = Record<string, { off?: number; on?: number }>;

const KLING_RESOLUTION_PRICING: Record<string, KlingResolutionRates> = {
  // No audio param exists for turbo (params/kling.ts) — this app only ever requests the
  // "off" key in practice, but the real price already includes native audio regardless
  // (Kling publishes only one tier for turbo), so both keys carry the same value —
  // same pattern as kling-o1 below, for the same reason.
  "kling:kling-3-0-turbo": {
    "720p": { off: 0.112, on: 0.112 },
    "1080p": { off: 0.14, on: 0.14 },
  },
  // 720p + native audio is intentionally absent — not a documentation gap. The real
  // table shows "-" for that cell; Kling doesn't offer native audio at 720p for this
  // model. computeVideoCost returns null if this combination is ever requested.
  "kling:kling-2-6": {
    "720p": { off: 0.042 },
    "1080p": { off: 0.07, on: 0.14 },
  },
  "kling:kling-2-5-turbo": {
    "720p": { off: 0.042 },
    "1080p": { off: 0.07 },
  },
  // CORRECTED 2026-07-24: "on" (with native audio, no voice control) was $0.112/$0.14 here
  // — a flat +$0.028/s guess. The real table's audio delta is +$0.042 (720p) / +$0.056
  // (1080p), i.e. +50% each time, not a flat step. 4k is unaffected either way (audio
  // doesn't change 4k price per the real table). Not backfilled, going forward only.
  "kling:kling-3-0": {
    "720p": { off: 0.084, on: 0.126 },
    "1080p": { off: 0.112, on: 0.168 },
    "4k": { off: 0.42, on: 0.42 },
  },
  // CORRECTED 2026-07-24: this was structurally wrong, not just imprecise. The real table
  // splits Kling O1's price by "video input" (this app never sends one — image-to-video
  // via start frame only, same as every other Kling model here) — audio does NOT change
  // O1's price at all. The old "on" tier ($0.112/$0.14, the same flawed +$0.028/s guess
  // used for 3.0 above, per this line's own prior comment) was overcharging every O1
  // generation with audio enabled. Flat rate now, matching the real "No Video Input" row
  // exactly — off and on both true, since audio doesn't move the price for this model.
  "kling:kling-o1": {
    "720p": { off: 0.084, on: 0.084 },
    "1080p": { off: 0.112, on: 0.112 },
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
    // Strict lookup, no cross-key fallback: a missing key means this specific
    // (resolution, audio) combination genuinely isn't priced (e.g. kling-2-6 at 720p
    // with native audio) — return null rather than silently substituting the wrong tier.
    const perSecond = audioEnabled ? rates.on : rates.off;
    if (perSecond === undefined) return null;
    const usd = durationSeconds * perSecond;
    return { usd, inr: usd * USD_TO_INR };
  }

  const resolutionOnlyPricing = RESOLUTION_ONLY_PRICING[modelId];
  if (resolutionOnlyPricing) {
    // Strict lookup, same as Kling above — an unreachable resolution returns null rather than
    // silently substituting the 720p rate.
    const perSecond = resolutionOnlyPricing[resolution ?? "720p"];
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
