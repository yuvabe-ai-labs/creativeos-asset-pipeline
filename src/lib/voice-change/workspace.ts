// D284 — pure helpers for Edit voice: the cost estimate, and why Apply is (or isn't) enabled.
// Unit-tested in __tests__/workspace.test.ts.
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";

/** The pre-generation estimate for a voice-only change: duration × the voice's rate multiplier. */
export function voiceChangeEstimateCredits(durationSeconds: number, priceMultiplier: number): number {
  return usdToFinalCredits(computeVoiceChangeCost(durationSeconds, priceMultiplier).usd);
}

/** Why the Apply button is disabled, in priority order — or `{ ok: true }` when it isn't. */
export function canApplyVoiceChange(a: {
  sourceId: string | null;
  voice: boolean;
  saving: boolean;
  running: boolean;
}): { ok: boolean; reason?: string } {
  if (!a.sourceId) return { ok: false, reason: "Show a finished version first — pick one in History." };
  if (!a.voice) return { ok: false, reason: "Pick a voice." };
  if (a.saving) return { ok: false, reason: "Adding the voice to your ElevenLabs account…" };
  if (a.running) return { ok: false, reason: "A generation is already running on this node." };
  return { ok: true };
}
