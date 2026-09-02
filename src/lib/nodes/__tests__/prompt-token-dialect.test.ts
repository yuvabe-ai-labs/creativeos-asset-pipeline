import { describe, it, expect } from "vitest";
import {
  mentionDialect,
  imageRefDialect,
  serializeSegments,
} from "../prompt-token-dialect";

describe("mentionDialect", () => {
  const d = mentionDialect();

  it("round-trips a mention", () => {
    const src = "push in on @[Image: Still](img1) then hold";
    expect(serializeSegments(d.parse(src), d)).toBe(src);
  });

  it("splits text and mentions", () => {
    expect(d.parse("a @[X](1) b")).toEqual([
      { kind: "text", text: "a " },
      { kind: "mention", label: "X", id: "1" },
      { kind: "text", text: " b" },
    ]);
  });

  it("builds a token for any id", () => {
    expect(d.tokenForId("n1", "Image: Still")).toBe("@[Image: Still](n1)");
  });
});

describe("imageRefDialect", () => {
  const d = imageRefDialect(["a", "b"]);

  it("resolves a token to the upstream at that index", () => {
    expect(d.parse("in <IMAGE_REF_0> then <IMAGE_REF_1>")).toEqual([
      { kind: "text", text: "in " },
      { kind: "mention", label: "<IMAGE_REF_0>", id: "a" },
      { kind: "text", text: " then " },
      { kind: "mention", label: "<IMAGE_REF_1>", id: "b" },
    ]);
  });

  // The caret arithmetic in the editor is driven by token LENGTH, so a round trip that changes
  // the text by even one character puts the caret in the wrong place on the next keystroke.
  it("round-trips exactly", () => {
    const src = "[0-4s] a student in <IMAGE_REF_0> walks past <IMAGE_REF_1>.";
    expect(serializeSegments(d.parse(src), d)).toBe(src);
  });

  it("serializes back to the index, not the id", () => {
    expect(d.tokenOf({ kind: "mention", label: "<IMAGE_REF_1>", id: "b" })).toBe("<IMAGE_REF_1>");
  });

  // A token the model invented past the end of the roster. Rewriting it to REF 0 would silently
  // rebind the operator's text to a different photograph.
  it("keeps an out-of-range token byte-identical", () => {
    const src = "look at <IMAGE_REF_7>";
    expect(serializeSegments(d.parse(src), d)).toBe(src);
    expect(d.parse(src)[1]).toMatchObject({ label: "<IMAGE_REF_7>" });
  });

  it("refuses to insert an upstream that is not an attached reference", () => {
    expect(d.tokenForId("not-attached", "x")).toBeNull();
    expect(d.tokenForId("b", "x")).toBe("<IMAGE_REF_1>");
  });

  it("handles no attachments at all", () => {
    const empty = imageRefDialect([]);
    expect(empty.tokenForId("a", "x")).toBeNull();
    expect(serializeSegments(empty.parse("<IMAGE_REF_0>"), empty)).toBe("<IMAGE_REF_0>");
  });

  it("returns plain text untouched", () => {
    expect(d.parse("no tokens")).toEqual([{ kind: "text", text: "no tokens" }]);
    expect(d.parse("")).toEqual([]);
  });

  // The same name the @ menu and the Instruction's chips show. A chip reading "REF 1" here and
  // the file's name there would make one reference look like two different things.
  it("labels a chip with the reference's name, matching the Instruction's chips", () => {
    expect(d.chipLabel({ kind: "mention", label: "<IMAGE_REF_1>", id: "b" }, "Screenshot 2026 08 25"))
      .toBe("Screenshot 2026 08 25");
  });

  it("falls back to the raw token when the upstream is gone", () => {
    expect(d.chipLabel({ kind: "mention", label: "<IMAGE_REF_7>", id: "x" }, undefined))
      .toBe("<IMAGE_REF_7>");
  });
});

describe("mentionDialect chip labels", () => {
  const d = mentionDialect();

  it("prefers the upstream's own name", () => {
    expect(d.chipLabel({ kind: "mention", label: "Image: Still", id: "a" }, "Hero still"))
      .toBe("Hero still");
  });

  it("strips the type prefix when the upstream is gone", () => {
    expect(d.chipLabel({ kind: "mention", label: "Image: Still", id: "a" }, undefined))
      .toBe("Still");
  });
});
