import { describe, it, expect } from "vitest";
import { readVoiceMeta } from "../meta";

const OK = { voiceId: "v", voiceName: "Priya", status: "applied", originalUrl: "https://s/o.mp4" };

describe("readVoiceMeta", () => {
  it("accepts a well-formed record", () => {
    expect(readVoiceMeta(OK)).toEqual(OK);
    expect(readVoiceMeta({ ...OK, status: "failed", error: "429" })).toEqual({ ...OK, status: "failed", error: "429" });
  });

  it("rejects anything else", () => {
    expect(readVoiceMeta(undefined)).toBeNull();
    expect(readVoiceMeta("x")).toBeNull();
    expect(readVoiceMeta({ ...OK, status: "maybe" })).toBeNull();
    expect(readVoiceMeta({ ...OK, voiceId: 3 })).toBeNull();
  });
});
