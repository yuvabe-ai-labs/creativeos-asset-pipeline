import { describe, it, expect } from "vitest";
import { sourceVersionOptions, defaultSourceVersionId, voiceChangeEstimateCredits, canApplyVoiceChange } from "../workspace";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";

const v = (id: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  id, createdAt, output: `https://s/${id}.mp4`, error: null, paramsUsed: { durationSeconds: 8 }, inputsUsed: {}, ...extra,
});
const VERSIONS = [
  v("c", "2026-09-25T12:00:00Z", { inputsUsed: { voiceChange: { voiceName: "Anjali", rootVersionId: "b" } } }),
  v("x", "2026-09-25T11:30:00Z", { output: null, error: "boom" }),
  v("b", "2026-09-25T11:00:00Z"),
  v("a", "2026-09-25T10:00:00Z"),
];

describe("workspace helpers", () => {
  it("lists succeeded versions newest first with chronological labels", () => {
    expect(sourceVersionOptions(VERSIONS as never)).toEqual([
      { id: "c", label: "v4 · voice: Anjali" },
      { id: "b", label: "v2" },
      { id: "a", label: "v1" },
    ]);
  });

  it("defaults to the active version when it succeeded, else the newest succeeded one", () => {
    expect(defaultSourceVersionId(VERSIONS as never, "b")).toBe("b");
    expect(defaultSourceVersionId(VERSIONS as never, "x")).toBe("c");
    expect(defaultSourceVersionId([] as never, null)).toBeNull();
  });

  it("estimates voice-only credits with the multiplier", () => {
    expect(voiceChangeEstimateCredits(8, 2)).toBe(usdToFinalCredits(computeVoiceChangeCost(8, 2).usd));
  });

  it("explains why Apply is disabled", () => {
    expect(canApplyVoiceChange({ sourceId: null, voice: true, saving: false, running: false })).toEqual({ ok: false, reason: "Pick a version to change." });
    expect(canApplyVoiceChange({ sourceId: "b", voice: false, saving: false, running: false })).toEqual({ ok: false, reason: "Pick a voice." });
    expect(canApplyVoiceChange({ sourceId: "b", voice: true, saving: true, running: false })).toEqual({ ok: false, reason: "Adding the voice to your ElevenLabs account…" });
    expect(canApplyVoiceChange({ sourceId: "b", voice: true, saving: false, running: true })).toEqual({ ok: false, reason: "A generation is already running on this node." });
    expect(canApplyVoiceChange({ sourceId: "b", voice: true, saving: false, running: false })).toEqual({ ok: true });
  });
});
