import { describe, it, expect } from "vitest";
import { voiceTriggerLabel, resolveEffectiveVoiceId } from "../video-gen-voice-picker";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

const PRIYA: PickerVoice = {
  voiceId: "v1", source: "account", name: "Priya", description: null, previewUrl: null,
  labels: { gender: "female", accent: "indian" }, category: "cloned", priceMultiplier: 1,
};
const base = { value: "v1", selected: PRIYA, loading: false, notFound: false, blockedReason: null };

describe("voiceTriggerLabel", () => {
  it("covers every state", () => {
    expect(voiceTriggerLabel({ ...base, blockedReason: "Audio off" })).toBe("Original (no change)");
    expect(voiceTriggerLabel({ ...base, value: null, selected: null })).toBe("Original (no change)");
    expect(voiceTriggerLabel({ ...base, selected: null, loading: true })).toBe("Loading voice…");
    expect(voiceTriggerLabel({ ...base, selected: null, notFound: true })).toBe("Unavailable voice");
    expect(voiceTriggerLabel(base)).toBe("Priya");
    expect(voiceTriggerLabel({ ...base, selected: null })).toBe("Selected voice");
  });
});

describe("resolveEffectiveVoiceId", () => {
  const r = { value: "v1", loading: false, notFound: false, error: null, blockedReason: null };
  it("drops the voice only when blocked or confirmed gone", () => {
    expect(resolveEffectiveVoiceId(r)).toBe("v1");
    expect(resolveEffectiveVoiceId({ ...r, value: null })).toBeNull();
    expect(resolveEffectiveVoiceId({ ...r, blockedReason: "Audio off" })).toBeNull();
    expect(resolveEffectiveVoiceId({ ...r, notFound: true })).toBeNull();
    expect(resolveEffectiveVoiceId({ ...r, loading: true })).toBe("v1");
    expect(resolveEffectiveVoiceId({ ...r, error: "network" })).toBe("v1");
  });
});
