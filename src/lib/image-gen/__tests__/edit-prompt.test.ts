import { describe, it, expect } from "vitest";
import { buildEditPrompt, assembleEditReferences } from "../edit-prompt";

describe("buildEditPrompt", () => {
  it("remove → a remove instruction, no reference language", () => {
    const p = buildEditPrompt({ instruction: "the cup on the table", intent: "remove" });
    expect(p).toMatch(/remove the cup on the table/i);
    expect(p).toContain("Keep everything else");
    expect(p).not.toContain("reference image");
  });

  it("replace → says replace and references the additional product image", () => {
    const p = buildEditPrompt({ instruction: "the bottle", intent: "replace", hasExtraReference: true });
    expect(p).toMatch(/replace the bottle/i);
    expect(p).toContain("additional reference image");
  });

  it("add → says add and references the additional product image", () => {
    const p = buildEditPrompt({ instruction: "a mug", intent: "add", hasExtraReference: true });
    expect(p).toMatch(/add a mug/i);
    expect(p).toContain("additional reference image");
  });

  it("produces a DISTINCT prompt for each of remove / replace / add", () => {
    const remove = buildEditPrompt({ instruction: "X", intent: "remove" });
    const replace = buildEditPrompt({ instruction: "X", intent: "replace", hasExtraReference: true });
    const add = buildEditPrompt({ instruction: "X", intent: "add", hasExtraReference: true });
    expect(new Set([remove, replace, add]).size).toBe(3);
  });

  it("freeform → generic change-only prompt", () => {
    const p = buildEditPrompt({ instruction: "make the sky warmer", intent: "freeform" });
    expect(p).toMatch(/change only make the sky warmer/i);
  });

  it("falls back by reference when intent is absent (add vs freeform)", () => {
    expect(buildEditPrompt({ instruction: "x", hasExtraReference: true })).toMatch(/add x/i);
    expect(buildEditPrompt({ instruction: "x", hasExtraReference: false })).toMatch(/change only x/i);
  });

  it("trims the instruction and leaves no placeholder", () => {
    const p = buildEditPrompt({ instruction: "  the logo  ", intent: "remove" });
    expect(p).toContain("remove the logo.");
    expect(p).not.toContain("{instruction}");
  });
});

describe("assembleEditReferences", () => {
  it("puts the base image first", () => {
    expect(assembleEditReferences({ baseImageUrl: "base", extraUrls: ["a", "b"], max: 5 }))
      .toEqual(["base", "a", "b"]);
  });

  it("dedups the base out of the extras", () => {
    expect(assembleEditReferences({ baseImageUrl: "base", extraUrls: ["base", "a"], max: 5 }))
      .toEqual(["base", "a"]);
  });

  it("clamps to max (base always kept)", () => {
    expect(assembleEditReferences({ baseImageUrl: "base", extraUrls: ["a", "b", "c"], max: 2 }))
      .toEqual(["base", "a"]);
    expect(assembleEditReferences({ baseImageUrl: "base", extraUrls: ["a"], max: 0 }))
      .toEqual(["base"]);
  });
});
