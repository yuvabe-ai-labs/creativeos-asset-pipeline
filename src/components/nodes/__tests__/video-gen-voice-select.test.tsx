import { describe, it, expect } from "vitest";
import { groupVoices, voiceTriggerLabel, resolveEffectiveVoiceId } from "../video-gen-voice-select";
import type { ElevenLabsVoice } from "@/lib/elevenlabs/client";

describe("groupVoices", () => {
  it("splits custom voices from the ElevenLabs library, keeping order", () => {
    const groups = groupVoices([
      { voiceId: "c1", name: "Priya", category: "cloned", previewUrl: null },
      { voiceId: "p1", name: "Adam", category: "premade", previewUrl: "https://p/a.mp3" },
    ]);
    expect(groups.custom.map((v) => v.voiceId)).toEqual(["c1"]);
    expect(groups.library.map((v) => v.voiceId)).toEqual(["p1"]);
  });
});

const VOICES: ElevenLabsVoice[] = [
  { voiceId: "v1", name: "Priya", category: "cloned", previewUrl: null },
  { voiceId: "v2", name: "Adam", category: "premade", previewUrl: "https://p/a.mp3" },
];

describe("voiceTriggerLabel", () => {
  it("reads 'Original (no change)' when blocked, regardless of value", () => {
    expect(
      voiceTriggerLabel({ value: "v1", voices: VOICES, loading: false, blockedReason: "Audio is off." }),
    ).toBe("Original (no change)");
  });

  it("reads 'Unavailable voice' for an id the loaded list doesn't have", () => {
    expect(
      voiceTriggerLabel({ value: "gone", voices: VOICES, loading: false, blockedReason: null }),
    ).toBe("Unavailable voice");
  });

  it("reads 'Loading voices…' while the list is still loading, even with a value set", () => {
    expect(
      voiceTriggerLabel({ value: "v1", voices: [], loading: true, blockedReason: null }),
    ).toBe("Loading voices…");
  });

  it("reads the voice's name for a normal match", () => {
    expect(
      voiceTriggerLabel({ value: "v2", voices: VOICES, loading: false, blockedReason: null }),
    ).toBe("Adam");
  });

  it("reads 'Original (no change)' when value is null", () => {
    expect(
      voiceTriggerLabel({ value: null, voices: VOICES, loading: false, blockedReason: null }),
    ).toBe("Original (no change)");
  });
});

describe("resolveEffectiveVoiceId", () => {
  it("is null when blocked", () => {
    expect(
      resolveEffectiveVoiceId({
        value: "v1",
        voices: VOICES,
        loading: false,
        error: null,
        blockedReason: "Audio is off.",
      }),
    ).toBeNull();
  });

  it("is null for an id the loaded list doesn't have", () => {
    expect(
      resolveEffectiveVoiceId({ value: "gone", voices: VOICES, loading: false, error: null, blockedReason: null }),
    ).toBeNull();
  });

  it("keeps the value when the voice list errored — the route still validates it", () => {
    expect(
      resolveEffectiveVoiceId({
        value: "v1",
        voices: [],
        loading: false,
        error: "Could not load voices.",
        blockedReason: null,
      }),
    ).toBe("v1");
  });

  it("keeps the value while the list is still loading", () => {
    expect(
      resolveEffectiveVoiceId({ value: "v1", voices: [], loading: true, error: null, blockedReason: null }),
    ).toBe("v1");
  });

  it("keeps a normal matched value", () => {
    expect(
      resolveEffectiveVoiceId({ value: "v2", voices: VOICES, loading: false, error: null, blockedReason: null }),
    ).toBe("v2");
  });

  it("is null when value is null", () => {
    expect(
      resolveEffectiveVoiceId({ value: null, voices: VOICES, loading: false, error: null, blockedReason: null }),
    ).toBeNull();
  });
});
