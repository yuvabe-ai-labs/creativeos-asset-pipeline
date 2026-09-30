import { describe, it, expect } from "vitest";
import { voiceChangeEstimateCredits, canApplyVoiceChange } from "../workspace";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";

describe("workspace helpers", () => {
  it("estimates voice-only credits with the multiplier", () => {
    expect(voiceChangeEstimateCredits(8, 2)).toBe(usdToFinalCredits(computeVoiceChangeCost(8, 2).usd));
  });

  it("explains why Apply is disabled", () => {
    expect(canApplyVoiceChange({ sourceId: null, voice: true, saving: false, running: false })).toEqual({ ok: false, reason: "Show a finished version first — pick one in History." });
    expect(canApplyVoiceChange({ sourceId: "b", voice: false, saving: false, running: false })).toEqual({ ok: false, reason: "Pick a voice." });
    expect(canApplyVoiceChange({ sourceId: "b", voice: true, saving: true, running: false })).toEqual({ ok: false, reason: "Adding the voice to your ElevenLabs account…" });
    expect(canApplyVoiceChange({ sourceId: "b", voice: true, saving: false, running: true })).toEqual({ ok: false, reason: "A generation is already running on this node." });
    expect(canApplyVoiceChange({ sourceId: "b", voice: true, saving: false, running: false })).toEqual({ ok: true });
  });
});
