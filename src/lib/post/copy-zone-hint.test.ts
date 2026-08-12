import { describe, it, expect } from "vitest";
import { copyZoneHint } from "./copy-zone-hint";

describe("copyZoneHint", () => {
  it("describes a bottom zone as a percentage of the frame", () => {
    expect(copyZoneHint({ side: "bottom", fraction: 0.36 })).toBe(
      "Leave the lower 36% of the frame clear and uncluttered — no key subject matter, no busy detail; this area will carry text.",
    );
  });

  it("describes a left zone", () => {
    expect(copyZoneHint({ side: "left", fraction: 0.46 })).toBe(
      "Leave the left 46% of the frame clear and uncluttered — no key subject matter, no busy detail; this area will carry text.",
    );
  });

  it("describes a top zone", () => {
    expect(copyZoneHint({ side: "top", fraction: 0.29 })).toContain("upper 29%");
  });

  it("describes a right zone", () => {
    expect(copyZoneHint({ side: "right", fraction: 0.5 })).toContain("right 50%");
  });

  it("rounds a fractional percentage to a whole number", () => {
    expect(copyZoneHint({ side: "bottom", fraction: 0.503 })).toContain("50%");
  });
});
