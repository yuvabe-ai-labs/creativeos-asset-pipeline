import { describe, it, expect } from "vitest";
import { describeVoiceChange } from "../describe";
import { DEFAULT_VOICE_CHANGE_SETTINGS } from "@/lib/elevenlabs/voice-settings";

const VC = { baseVersionId: "v3id", rootVersionId: "v2id", sourceUrl: "u", voiceId: "a", voiceName: "Anjali", priceMultiplier: 2, settings: { ...DEFAULT_VOICE_CHANGE_SETTINGS, seed: 7 }, driftMs: 40 };

describe("describeVoiceChange", () => {
  it("summarises voice, source and settings", () => {
    expect(describeVoiceChange({ voiceChange: VC }, new Map([["v3id", "v3"]]))).toEqual({
      title: "Voice: Anjali · 2×",
      detail: "changed from v3 · stability 50 · similarity 75 · style 0 · speaker boost on · noise removal off · Multilingual · seed 7 · drift 40 ms",
    });
  });

  it("returns null for a normal generation", () => {
    expect(describeVoiceChange({ prompt: "p" }, new Map())).toBeNull();
  });
});
