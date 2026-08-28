import { describe, it, expect } from "vitest";
import { avoidClause } from "../providers/avoid-clause";

describe("avoidClause", () => {
  it("wraps a list in an Avoid sentence", () => {
    expect(avoidClause("blurry, warped label")).toBe("Avoid: blurry, warped label.");
  });

  // A cleared field must leave no dangling "Avoid:" on the request.
  it("returns empty string for blank input", () => {
    expect(avoidClause("")).toBe("");
    expect(avoidClause("   ")).toBe("");
  });

  // The function adds the period; a list already ending in one must not produce "..".
  it("strips trailing punctuation and whitespace before adding its own period", () => {
    expect(avoidClause("blurry, jitter.  ")).toBe("Avoid: blurry, jitter.");
  });
});
