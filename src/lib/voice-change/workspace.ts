// D284 — pure helpers for Edit voice: the cost estimate, and why Apply is (or isn't) enabled.
// Unit-tested in __tests__/workspace.test.ts.
import { voiceChangeEstimateUsd } from "@/lib/ai-models/service-price";
import type { AiModelPrice, CreditSettings } from "@/lib/ai-models/types";
import { creditsFromUsd } from "@/lib/credits/units";

/** The pre-generation estimate for a voice-only change: duration × the voice's rate multiplier. */
export function voiceChangeEstimateCredits(price: AiModelPrice | null, durationSeconds: number, priceMultiplier: number, settings: CreditSettings | null): number | null {
  const usd = price ? voiceChangeEstimateUsd(price, durationSeconds, priceMultiplier) : null;
  return usd === null || !settings ? null : creditsFromUsd(usd, settings);
}

/** Why the Apply button is disabled, in priority order — or `{ ok: true }` when it isn't. */
export function canApplyVoiceChange(a: {
  sourceId: string | null;
  voice: boolean;
  saving: boolean;
  running: boolean;
  /** D390 — why generation is locked (the clip is in the Editor's reel), or null. */
  locked?: string | null;
}): { ok: boolean; reason?: string } {
  if (a.locked) return { ok: false, reason: a.locked };
  if (!a.sourceId) return { ok: false, reason: "Show a finished version first — pick one in History." };
  if (!a.voice) return { ok: false, reason: "Pick a voice." };
  if (a.saving) return { ok: false, reason: "Adding the voice to your ElevenLabs account…" };
  if (a.running) return { ok: false, reason: "A generation is already running on this node." };
  return { ok: true };
}
