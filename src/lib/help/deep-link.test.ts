import { describe, it, expect } from "vitest";
import { parseHelpParams, helpParamsFor } from "@/lib/help/deep-link";

const parse = (qs: string) => parseHelpParams(new URLSearchParams(qs));

describe("help deep links", () => {
  it("returns null when there is no help param", () => {
    expect(parse("")).toBeNull();
    expect(parse("foo=bar")).toBeNull();
  });

  it("opens on the first step when no step is given", () => {
    expect(parse("help=create-a-reel")).toEqual({ slug: "create-a-reel", step: 1 });
  });

  it("parses a 1-based step param", () => {
    expect(parse("help=create-a-reel&step=3")).toEqual({ slug: "create-a-reel", step: 3 });
  });

  it("clamps a step past the end to the last step", () => {
    expect(parse("help=edit-an-image&step=99")).toEqual({ slug: "edit-an-image", step: 2 });
  });

  it("clamps a zero or negative step to the first step", () => {
    expect(parse("help=edit-an-image&step=0")).toEqual({ slug: "edit-an-image", step: 1 });
    expect(parse("help=edit-an-image&step=-4")).toEqual({ slug: "edit-an-image", step: 1 });
  });

  it("ignores a non-numeric step rather than throwing", () => {
    expect(parse("help=edit-an-image&step=abc")).toEqual({ slug: "edit-an-image", step: 1 });
  });

  it("returns null for an unknown slug", () => {
    expect(parse("help=nope")).toBeNull();
  });

  it("returns null for a draft chapter — it is not linkable until recorded", () => {
    expect(parse("help=archive-a-project")).toBeNull();
  });

  it("serializes the first step without a step param", () => {
    expect(helpParamsFor("create-a-reel", 1)).toBe("?help=create-a-reel");
  });

  it("serializes a later step with a step param", () => {
    expect(helpParamsFor("create-a-reel", 3)).toBe("?help=create-a-reel&step=3");
  });

  it("round-trips", () => {
    const qs = helpParamsFor("bring-in-references", 2);
    expect(parse(qs.slice(1))).toEqual({ slug: "bring-in-references", step: 2 });
  });
});
