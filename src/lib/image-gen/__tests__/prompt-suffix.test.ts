import { describe, it, expect } from "vitest";
import { withProductDetailSuffix } from "../utils";
import { PRODUCT_DETAIL_SUFFIX } from "../constants";

describe("withProductDetailSuffix", () => {
  it("appends the suffix to a plain prompt", () => {
    const p = withProductDetailSuffix("A bottle on a marble counter");
    expect(p).toBe(`A bottle on a marble counter. ${PRODUCT_DETAIL_SUFFIX}`);
  });

  it("does not double the separator when the prompt already ends in punctuation", () => {
    expect(withProductDetailSuffix("A bottle on a marble counter.")).toBe(
      `A bottle on a marble counter. ${PRODUCT_DETAIL_SUFFIX}`,
    );
    expect(withProductDetailSuffix("Where is the bottle?")).toBe(
      `Where is the bottle? ${PRODUCT_DETAIL_SUFFIX}`,
    );
  });

  it("is idempotent — a prompt already carrying the suffix is unchanged", () => {
    const once = withProductDetailSuffix("A bottle on a marble counter");
    expect(withProductDetailSuffix(once)).toBe(once);
  });

  it("trims surrounding whitespace", () => {
    expect(withProductDetailSuffix("  A bottle  ")).toBe(`A bottle. ${PRODUCT_DETAIL_SUFFIX}`);
  });

  it("returns just the suffix for an empty prompt", () => {
    expect(withProductDetailSuffix("   ")).toBe(PRODUCT_DETAIL_SUFFIX);
  });
});
