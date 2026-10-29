import { describe, it, expect } from "vitest";
import { SCRIPT_FORMATS, formatFor, renderFormatMenu } from "../formats";

describe("formatFor", () => {
  it("finds the format named inside a free-typed answer", () => {
    expect(formatFor("like a UGC")?.name).toBe("UGC");
    expect(formatFor("founder-led")?.name).toBe("Founder-led");
  });

  it("prefers the longest menu name the answer contains", () => {
    expect(formatFor("UGC review first please")?.name).toBe("UGC review first");
  });

  it("ignores punctuation, so a saved \"UGC, review first\" still reads as that format", () => {
    expect(formatFor("UGC, review first")?.name).toBe("UGC review first");
  });

  it("finds nothing for a format that is not on the menu", () => {
    expect(formatFor("a carousel")).toBeUndefined();
  });
});

describe("renderFormatMenu", () => {
  it("marks the chosen format and describes each beat in neutral words", () => {
    const menu = renderFormatMenu("UGC");
    expect(menu).toContain("UGC (chosen)");
    expect(menu).toContain("REVIEW: a real customer review, only for brands that use them");
    expect(menu).toContain("A beat that doesn't fit this brand is left out or adapted, and the confirmation card lists the beats.");
  });

  it("says when the chosen format is not on the menu", () => {
    expect(renderFormatMenu("a carousel")).toContain("is not on the menu");
  });
});

describe("SCRIPT_FORMATS", () => {
  it("gives Founder-led five topic beats and a real-person lead", () => {
    const founder = SCRIPT_FORMATS.find((f) => f.name === "Founder-led")!;
    expect(founder.beats.filter((b) => b.label.startsWith("TOPIC"))).toHaveLength(5);
    expect(founder.realPersonLead).toBe(true);
  });

  it("puts the review second in UGC review first", () => {
    expect(SCRIPT_FORMATS.find((f) => f.name === "UGC review first")!.beats[1].label).toBe("REVIEW");
  });
});
