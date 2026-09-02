import { describe, it, expect } from "vitest";
import { splitImageRefs } from "../prompt-focus";

/**
 * These drive which PHOTOGRAPH is drawn next to which sentence. An off-by-one here shows the
 * operator the sandals where the prompt actually names the v-straps — silently, with nothing to
 * check it against.
 */
describe("splitImageRefs", () => {
  it("splits a token out of surrounding text", () => {
    expect(splitImageRefs("a student in <IMAGE_REF_0> walks")).toEqual([
      { text: "a student in " },
      { text: "<IMAGE_REF_0>", refIndex: 0 },
      { text: " walks" },
    ]);
  });

  // The index comes from the TOKEN, never from the segment's position: the model names references
  // out of order and repeats them, so counting occurrences would bind the wrong picture.
  it("reads the index from the token, not the segment order", () => {
    const out = splitImageRefs("<IMAGE_REF_2> then <IMAGE_REF_0> then <IMAGE_REF_2>");
    expect(out.filter((s) => s.refIndex !== undefined).map((s) => s.refIndex)).toEqual([2, 0, 2]);
  });

  it("handles a token at each end", () => {
    expect(splitImageRefs("<IMAGE_REF_1>")).toEqual([{ text: "<IMAGE_REF_1>", refIndex: 1 }]);
    expect(splitImageRefs("<IMAGE_REF_0> x")).toHaveLength(2);
    expect(splitImageRefs("x <IMAGE_REF_0>")).toHaveLength(2);
  });

  it("handles adjacent tokens with no text between", () => {
    expect(splitImageRefs("<IMAGE_REF_0><IMAGE_REF_1>").map((s) => s.refIndex)).toEqual([0, 1]);
  });

  it("returns plain text untouched", () => {
    expect(splitImageRefs("no tokens here")).toEqual([{ text: "no tokens here" }]);
  });

  it("returns nothing for empty text", () => {
    expect(splitImageRefs("")).toEqual([]);
  });

  it("reassembles to the original string", () => {
    const src = "[0-4s] a student in <IMAGE_REF_0> walks past <IMAGE_REF_1> on the step.";
    expect(splitImageRefs(src).map((s) => s.text).join("")).toBe(src);
  });

  it("ignores a malformed token", () => {
    expect(splitImageRefs("<IMAGE_REF_> and <IMAGE_REF>").every((s) => s.refIndex === undefined))
      .toBe(true);
  });

  it("reads a double-digit index", () => {
    expect(splitImageRefs("<IMAGE_REF_10>")[0].refIndex).toBe(10);
  });
});
