import { describe, it, expect } from "vitest";
import { groupVoices } from "../video-gen-voice-select";

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
