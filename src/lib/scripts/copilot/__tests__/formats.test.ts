import { describe, it, expect } from "vitest";
import { SCRIPT_FORMATS, formatFor, renderFormatMenu } from "../formats";

describe("formatFor", () => {
  it("finds the format named inside a free-typed answer", () => {
    expect(formatFor("like a UGC")?.name).toBe("UGC");
    expect(formatFor("founder-led")?.name).toBe("Founder-led");
  });

  it("ignores punctuation, so \"founder led\" reads as Founder-led", () => {
    expect(formatFor("founder led, please")?.name).toBe("Founder-led");
  });

  it("reads a saved \"UGC, review first\" as UGC, now that the menu has no review format (D464)", () => {
    expect(formatFor("UGC, review first")?.name).toBe("UGC");
  });

  it("finds nothing for a format that is not on the menu", () => {
    expect(formatFor("a carousel")).toBeUndefined();
  });
});

describe("renderFormatMenu", () => {
  it("marks the chosen format and describes each beat in neutral words", () => {
    const menu = renderFormatMenu("UGC");
    expect(menu).toContain("UGC (chosen)");
    expect(menu).toContain("PROOF: the brand's proof, from its KB");
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

  it("offers no review beat in any format: reviews were one client's need, added only when asked (D464)", () => {
    expect(SCRIPT_FORMATS.flatMap((f) => f.beats.map((b) => b.label))).not.toContain("REVIEW");
    expect(renderFormatMenu("UGC")).not.toMatch(/review/i);
  });
});
