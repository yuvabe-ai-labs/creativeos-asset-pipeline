import { describe, it, expect } from "vitest";
import { describeVoiceChange, voiceChangeRows } from "../describe";
import { DEFAULT_VOICE_CHANGE_SETTINGS } from "@/lib/elevenlabs/voice-settings";

const VC = { baseVersionId: "v3id", rootVersionId: "v2id", sourceUrl: "u", voiceId: "a", voiceName: "Anjali", priceMultiplier: 2, settings: { ...DEFAULT_VOICE_CHANGE_SETTINGS, seed: 7 }, driftMs: 40 };
// Standard rate, no seed, no drift recorded.
const PLAIN = { baseVersionId: "v3id", rootVersionId: "v2id", sourceUrl: "u", voiceId: "a", voiceName: "Anjali", priceMultiplier: 1, settings: DEFAULT_VOICE_CHANGE_SETTINGS };

describe("describeVoiceChange", () => {
  it("summarises voice, source and settings", () => {
    expect(describeVoiceChange({ voiceChange: VC }, new Map([["v3id", "v3"]]))).toEqual({
      title: "Voice: Anjali · 2×",
      detail: "changed from v3 · stability 50 · similarity 75 · style 0 · speaker boost on · noise removal off · Multilingual · seed 7 · drift 40 ms",
    });
  });

  it("omits the multiplier, seed and drift when absent, and falls back when the source isn't numbered", () => {
    expect(describeVoiceChange({ voiceChange: PLAIN }, new Map())).toEqual({
      title: "Voice: Anjali",
      detail: "changed from an earlier version · stability 50 · similarity 75 · style 0 · speaker boost on · noise removal off · Multilingual",
    });
  });

  it("returns null for a normal generation", () => {
    expect(describeVoiceChange({ prompt: "p" }, new Map())).toBeNull();
  });
});

describe("voiceChangeRows", () => {
  it("lists every setting as a label/value row", () => {
    expect(voiceChangeRows({ voiceChange: VC }, new Map([["v3id", "v3"]]))).toEqual([
      { label: "Voice", value: "Anjali (2×)" },
      { label: "Changed from", value: "v3" },
      { label: "Stability", value: "50" },
      { label: "Similarity", value: "75" },
      { label: "Style exaggeration", value: "0" },
      { label: "Speaker boost", value: "On" },
      { label: "Remove background noise", value: "Off" },
      { label: "Model", value: "Multilingual" },
      { label: "Seed", value: "7" },
      { label: "Sync drift", value: "40 ms" },
    ]);
  });

  it("drops seed/drift rows when absent and returns null for a normal generation", () => {
    const rows = voiceChangeRows({ voiceChange: PLAIN }, new Map())!;
    expect(rows.map((r) => r.label)).not.toContain("Seed");
    expect(rows.map((r) => r.label)).not.toContain("Sync drift");
    expect(rows.find((r) => r.label === "Changed from")?.value).toBe("An earlier version");
    expect(voiceChangeRows({ prompt: "p" }, new Map())).toBeNull();
  });
});
