import { describe, it, expect } from "vitest";
import { voiceChangeEstimateCredits, canApplyVoiceChange } from "../workspace";
import { seededPrice } from "@/lib/ai-models/test-prices";
import { VOICE_CHANGE_PRICE_MODEL_ID } from "@/lib/ai-models/service-models";
import { usdToFinalCredits } from "@/lib/credits/units";

describe("workspace helpers", () => {
  it("estimates voice-only credits with the multiplier", () => {
    expect(voiceChangeEstimateCredits(seededPrice(VOICE_CHANGE_PRICE_MODEL_ID), 30, 2)).toBe(usdToFinalCredits((30 / 60) * 0.12 * 2));
  });

  it("has no estimate without the voice change's price", () => {
    expect(voiceChangeEstimateCredits(null, 30, 2)).toBeNull();
  });

  it("explains why Apply is disabled", () => {
    expect(canApplyVoiceChange({ sourceId: null, voice: true, saving: false, running: false })).toEqual({ ok: false, reason: "Show a finished version first — pick one in History." });
    expect(canApplyVoiceChange({ sourceId: "b", voice: false, saving: false, running: false })).toEqual({ ok: false, reason: "Pick a voice." });
    expect(canApplyVoiceChange({ sourceId: "b", voice: true, saving: true, running: false })).toEqual({ ok: false, reason: "Adding the voice to your ElevenLabs account…" });
    expect(canApplyVoiceChange({ sourceId: "b", voice: true, saving: false, running: true })).toEqual({ ok: false, reason: "A generation is already running on this node." });
    expect(canApplyVoiceChange({ sourceId: "b", voice: true, saving: false, running: false })).toEqual({ ok: true });
  });
});

describe("the Editor's generation lock (D390)", () => {
  it("refuses Change voice on a clip in the reel", () => {
    expect(canApplyVoiceChange({ sourceId: "b", voice: true, saving: false, running: false, locked: "In use by the Editor · Disconnect to generate" }))
      .toEqual({ ok: false, reason: "In use by the Editor · Disconnect to generate" });
  });
});
