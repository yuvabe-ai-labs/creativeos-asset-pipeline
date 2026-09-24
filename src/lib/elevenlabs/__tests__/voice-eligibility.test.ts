import { describe, it, expect } from "vitest";
import { voiceChangeBlockedReason } from "../voice-eligibility";

describe("voiceChangeBlockedReason", () => {
  it("allows a model with no audio param (audio is always generated)", () => {
    expect(voiceChangeBlockedReason(["duration"], {})).toBeNull();
  });

  it("allows a model whose audio param is on", () => {
    expect(voiceChangeBlockedReason(["audio"], { audio: "native" })).toBeNull();
  });

  it("blocks a model whose audio param is off", () => {
    expect(voiceChangeBlockedReason(["audio"], { audio: "off" })).toMatch(/Audio/);
  });

  it("blocks mock mode", () => {
    expect(voiceChangeBlockedReason([], {}, { mock: true })).toMatch(/mock/i);
  });
});
