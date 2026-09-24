import { describe, it, expect } from "vitest";
import { readVoiceMeta } from "../meta";

const OK = { voiceId: "v", voiceName: "Priya", status: "applied", originalUrl: "https://s/o.mp4" };

describe("readVoiceMeta", () => {
  it("accepts a well-formed record", () => {
    expect(readVoiceMeta(OK)).toEqual({ ...OK, priceMultiplier: 1 });
    expect(readVoiceMeta({ ...OK, status: "failed", error: "429" })).toEqual({
      ...OK,
      status: "failed",
      error: "429",
      priceMultiplier: 1,
    });
  });

  it("rejects anything else", () => {
    expect(readVoiceMeta(undefined)).toBeNull();
    expect(readVoiceMeta("x")).toBeNull();
    expect(readVoiceMeta({ ...OK, status: "maybe" })).toBeNull();
    expect(readVoiceMeta({ ...OK, voiceId: 3 })).toBeNull();
  });

  it("keeps priceMultiplier and defaults it to 1 for versions written before D283", () => {
    expect(readVoiceMeta({ ...OK, priceMultiplier: 2 })?.priceMultiplier).toBe(2);
    expect(readVoiceMeta(OK)?.priceMultiplier).toBe(1);
    expect(readVoiceMeta({ ...OK, priceMultiplier: 0.5 })?.priceMultiplier).toBe(1);
  });
});
