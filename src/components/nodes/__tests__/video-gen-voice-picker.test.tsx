import { describe, it, expect } from "vitest";
import { voiceTriggerLabel, resolveEffectiveVoiceId, type PendingVoiceSave } from "../video-gen-voice-picker";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

const PRIYA: PickerVoice = {
  voiceId: "v1", source: "account", name: "Priya", description: null, previewUrl: null,
  labels: { gender: "female", accent: "indian" }, category: "cloned", priceMultiplier: 1,
};
const ANJALI: PickerVoice = {
  voiceId: "lib2", source: "library", name: "Anjali", description: null, previewUrl: null,
  labels: { gender: "female", language: "hi" }, category: "high_quality", priceMultiplier: 2,
  publicOwnerId: "own2",
};
const SAVING: PendingVoiceSave = { voice: ANJALI, status: "saving" };
const base = { value: "v1", selected: PRIYA, loading: false, notFound: false, blockedReason: null, pending: null };

describe("voiceTriggerLabel", () => {
  it("covers every state", () => {
    expect(voiceTriggerLabel({ ...base, blockedReason: "Audio off" })).toBe("Original (no change)");
    expect(voiceTriggerLabel({ ...base, value: null, selected: null })).toBe("Original (no change)");
    expect(voiceTriggerLabel({ ...base, selected: null, loading: true })).toBe("Loading voice…");
    expect(voiceTriggerLabel({ ...base, selected: null, notFound: true })).toBe("Unavailable voice");
    expect(voiceTriggerLabel(base)).toBe("Priya");
    expect(voiceTriggerLabel({ ...base, selected: null })).toBe("Selected voice");
  });

  it("D283 (C) — a pending Library save's voice name wins over the (suppressed) lookup", () => {
    expect(voiceTriggerLabel({ ...base, value: "lib2", selected: null, pending: SAVING })).toBe("Anjali");
    // Even if a stale `selected` were still around, the pending pick takes priority.
    expect(voiceTriggerLabel({ ...base, value: "lib2", pending: SAVING })).toBe("Anjali");
  });

  it("D283 — blocked still wins over a pending save", () => {
    expect(voiceTriggerLabel({ ...base, blockedReason: "Audio off", pending: SAVING })).toBe("Original (no change)");
  });
});

describe("resolveEffectiveVoiceId", () => {
  const r = { value: "v1", loading: false, notFound: false, error: null, blockedReason: null, pending: null };
  it("drops the voice only when blocked or confirmed gone", () => {
    expect(resolveEffectiveVoiceId(r)).toBe("v1");
    expect(resolveEffectiveVoiceId({ ...r, value: null })).toBeNull();
    expect(resolveEffectiveVoiceId({ ...r, blockedReason: "Audio off" })).toBeNull();
    expect(resolveEffectiveVoiceId({ ...r, notFound: true })).toBeNull();
    expect(resolveEffectiveVoiceId({ ...r, loading: true })).toBe("v1");
    expect(resolveEffectiveVoiceId({ ...r, error: "network" })).toBe("v1");
  });

  it("D283 (C) — kept (optimistically) while a Library save is pending, even though notFound would otherwise drop it", () => {
    expect(resolveEffectiveVoiceId({ ...r, value: "lib2", pending: SAVING })).toBe("lib2");
    expect(resolveEffectiveVoiceId({ ...r, value: "lib2", notFound: true, pending: SAVING })).toBe("lib2");
  });

  it("D283 — blocked still drops it even while pending", () => {
    expect(resolveEffectiveVoiceId({ ...r, value: "lib2", pending: SAVING, blockedReason: "Audio off" })).toBeNull();
  });
});
