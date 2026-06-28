import { describe, it, expect } from "vitest";
import { buildEditPrompt } from "../edit-prompt";

describe("buildEditPrompt", () => {
  it("remove → change/remove template, interpolates the instruction", () => {
    const p = buildEditPrompt({ instruction: "the cup on the table", intent: "remove" });
    expect(p).toContain("change only the cup on the table");
    expect(p).toContain("Keep everything else exactly the same");
    expect(p).not.toContain("reference image");
  });

  it("freeform → change/remove template", () => {
    const p = buildEditPrompt({ instruction: "make the sky warmer", intent: "freeform" });
    expect(p).toContain("change only make the sky warmer");
  });

  it("replace → add/replace template referencing the additional image", () => {
    const p = buildEditPrompt({ instruction: "the bottle", intent: "replace", hasExtraReference: true });
    expect(p).toContain("Using the first image as the base scene");
    expect(p).toContain("additional reference image");
  });

  it("add → add/replace template", () => {
    const p = buildEditPrompt({ instruction: "the product", intent: "add", hasExtraReference: true });
    expect(p).toContain("Using the first image as the base scene");
  });

  it("falls back to hasExtraReference when intent is absent", () => {
    expect(buildEditPrompt({ instruction: "x", hasExtraReference: true })).toContain("base scene");
    expect(buildEditPrompt({ instruction: "x", hasExtraReference: false })).toContain("change only x");
  });

  it("trims the instruction and leaves no placeholder", () => {
    const p = buildEditPrompt({ instruction: "  the logo  ", intent: "remove" });
    expect(p).toContain("change only the logo.");
    expect(p).not.toContain("{instruction}");
  });
});
