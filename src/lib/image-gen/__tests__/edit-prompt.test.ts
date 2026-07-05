import { describe, it, expect } from "vitest";
import {
  buildEditPrompt,
  assembleEditReferences,
  selectEditReferenceUrls,
} from "../edit-prompt";

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

describe("buildEditPrompt — modify intent", () => {
  it("modify uses the change-only template", () => {
    const p = buildEditPrompt({ instruction: "recolor the label to matte black", intent: "modify" });
    expect(p).toContain("change only recolor the label to matte black");
    expect(p).toContain("Keep everything else exactly the same");
  });
});

describe("buildEditPrompt — annotation clause", () => {
  it("appends a guides-only clause when annotated is true", () => {
    const p = buildEditPrompt({ instruction: "the cup", intent: "remove", annotated: true });
    expect(p).toContain("remove the cup"); // template still applies
    expect(p).toContain("marked");
    expect(p).toContain("do not include the marks");
  });

  it("adds no annotation clause when annotated is false/absent", () => {
    const p = buildEditPrompt({ instruction: "the cup", intent: "remove" });
    expect(p).not.toContain("do not include the marks");
  });

  it("applies the annotation clause to the reference (add) template too", () => {
    const p = buildEditPrompt({ instruction: "the product", intent: "add", hasExtraReference: true, annotated: true });
    expect(p).toContain("base scene");
    expect(p).toContain("do not include the marks");
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

describe("selectEditReferenceUrls", () => {
  const connected = [
    { id: "a", url: "urlA" },
    { id: "b", url: "urlB" },
    { id: "c", url: "urlC" },
  ];

  it("returns only the selected nodes' urls", () => {
    expect(selectEditReferenceUrls({ connected, selectedIds: ["a", "c"] })).toEqual(["urlA", "urlC"]);
  });

  it("excludes the base url even if selected", () => {
    expect(
      selectEditReferenceUrls({ connected, selectedIds: ["a", "b"], baseUrl: "urlA" }),
    ).toEqual(["urlB"]);
  });

  it("empty selection falls back to all non-base urls (D27 default)", () => {
    expect(selectEditReferenceUrls({ connected, selectedIds: [], baseUrl: "urlA" })).toEqual([
      "urlB",
      "urlC",
    ]);
  });

  it("dedups repeated urls", () => {
    const dup = [
      { id: "a", url: "same" },
      { id: "b", url: "same" },
    ];
    expect(selectEditReferenceUrls({ connected: dup, selectedIds: ["a", "b"] })).toEqual(["same"]);
  });
});
