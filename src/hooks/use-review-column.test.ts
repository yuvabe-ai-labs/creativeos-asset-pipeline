import { describe, it, expect } from "vitest";
import { REVIEW_COLUMN_QUERY } from "./use-review-column";

describe("REVIEW_COLUMN_QUERY (final review)", () => {
  it("is Tailwind's xl in rem, so the JS check and the CSS breakpoint agree at any default font size", () => {
    // xl is 80rem; media-query rem follows the browser's default font size, so a px value drifts
    // from the CSS breakpoint for anyone with a larger or smaller default font.
    expect(REVIEW_COLUMN_QUERY).toBe("(min-width: 80rem)");
  });
});
