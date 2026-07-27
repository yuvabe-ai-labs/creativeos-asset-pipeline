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

  const pricing = VIDEO_MODEL_PRICING[modelId];
  if (!pricing) return null;
  const multiplier = audioEnabled ? pricing.audioMultiplier : 1;
  const usd = durationSeconds * pricing.perSecond * multiplier;
  return { usd, inr: usd * USD_TO_INR };
}
