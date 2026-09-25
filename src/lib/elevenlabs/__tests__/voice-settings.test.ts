import { describe, it, expect } from "vitest";
import {
  DEFAULT_VOICE_CHANGE_SETTINGS, VoiceChangeSettingsSchema, elevenLabsVoiceSettings, VOICE_CHANGE_MODELS,
} from "../voice-settings";

describe("voice change settings", () => {
  it("defaults to ElevenLabs' own defaults", () => {
    expect(DEFAULT_VOICE_CHANGE_SETTINGS).toEqual({
      stability: 50, similarity: 75, style: 0, speakerBoost: true, removeBackgroundNoise: false,
      modelId: "eleven_multilingual_sts_v2",
    });
    expect(VOICE_CHANGE_MODELS.map((m) => m.value)).toEqual(["eleven_multilingual_sts_v2", "eleven_english_sts_v2"]);
  });

  it("validates ranges, the model and the seed; never accepts speed", () => {
    expect(VoiceChangeSettingsSchema.safeParse(DEFAULT_VOICE_CHANGE_SETTINGS).success).toBe(true);
    expect(VoiceChangeSettingsSchema.safeParse({ ...DEFAULT_VOICE_CHANGE_SETTINGS, stability: 101 }).success).toBe(false);
    expect(VoiceChangeSettingsSchema.safeParse({ ...DEFAULT_VOICE_CHANGE_SETTINGS, modelId: "eleven_v3" }).success).toBe(false);
    expect(VoiceChangeSettingsSchema.safeParse({ ...DEFAULT_VOICE_CHANGE_SETTINGS, seed: 4294967296 }).success).toBe(false);
    expect(VoiceChangeSettingsSchema.safeParse({ ...DEFAULT_VOICE_CHANGE_SETTINGS, seed: 42 }).success).toBe(true);
    const parsed = VoiceChangeSettingsSchema.parse({ ...DEFAULT_VOICE_CHANGE_SETTINGS, speed: 1.2 });
    expect(parsed).not.toHaveProperty("speed");
  });

  it("maps 0–100 sliders to ElevenLabs' 0–1 voice_settings", () => {
    expect(elevenLabsVoiceSettings({ ...DEFAULT_VOICE_CHANGE_SETTINGS, stability: 30, similarity: 90, style: 10, speakerBoost: false }))
      .toEqual({ stability: 0.3, similarity_boost: 0.9, style: 0.1, use_speaker_boost: false });
  });
});
