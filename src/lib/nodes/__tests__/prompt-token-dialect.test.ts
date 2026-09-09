import { describe, it, expect } from "vitest";
import {
  mentionDialect,
  imageRefDialect,
  serializeSegments,
  klingImageDialect,
  dialectForCapability,
} from "../prompt-token-dialect";
import { multishotCapabilityFor } from "../multishot-models";
import { GEMINI_OMNI_MODEL_ID, KLING_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

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

describe("klingImageDialect", () => {
  const d = klingImageDialect(["a", "b"]);

  it("is ONE-based, where imageRefDialect is zero-based", () => {
    expect(d.tokenForId("a", "A")).toBe("@image_1");
    expect(d.tokenForId("b", "B")).toBe("@image_2");
  });

  it("parses its own tokens back to the right ids", () => {
    const segs = d.parse("a hand lifts the @image_1 beside the @image_2");
    const mentions = segs.filter((s) => s.kind === "mention");
    expect(mentions.map((m: any) => m.id)).toEqual(["a", "b"]);
  });

  it("round-trips byte-exact", () => {
    const text = "the @image_2 rests on oak, the @image_1 just visible";
    expect(serializeSegments(d.parse(text), d)).toBe(text);
  });

  // @image_10 must not be read as @image_1 followed by a literal "0".
  it("does not truncate a two-digit index", () => {
    const wide = klingImageDialect(Array.from({ length: 12 }, (_, i) => `id${i}`));
    const segs = wide.parse("@image_10");
    expect(segs).toHaveLength(1);
    expect((segs[0] as any).id).toBe("id9");
  });

  it("keeps an unknown id's original text rather than rewriting it", () => {
    const segs = d.parse("@image_9");
    expect(serializeSegments(segs, d)).toBe("@image_9");
  });

  it("returns null for an id that is not attached", () => {
    expect(d.tokenForId("nope", "Nope")).toBeNull();
  });

  // The two dialects share a text field's worth of prose. Neither may claim the other's tokens.
  it("does not read Omni's tokens, and imageRefDialect does not read Kling's", () => {
    expect(d.parse("<IMAGE_REF_0>").every((s) => s.kind === "text")).toBe(true);
    expect(imageRefDialect(["a", "b"]).parse("@image_1").every((s) => s.kind === "text")).toBe(true);
  });
});

describe("dialectForCapability", () => {
  it("gives each model its own token shape", () => {
    const omni = dialectForCapability(multishotCapabilityFor(GEMINI_OMNI_MODEL_ID), ["a"]);
    const kling = dialectForCapability(multishotCapabilityFor(KLING_OMNI_MODEL_ID), ["a"]);
    expect(omni.tokenForId("a", "A")).toBe("<IMAGE_REF_0>");
    expect(kling.tokenForId("a", "A")).toBe("@image_1");
  });
});
