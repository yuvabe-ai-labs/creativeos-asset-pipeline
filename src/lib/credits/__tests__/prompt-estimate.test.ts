import { describe, it, expect } from "vitest";
import { estimatePromptCredits } from "../prompt-estimate";

describe("estimatePromptCredits", () => {
  it("returns the base cost with no attachments", () => {
    expect(estimatePromptCredits(0)).toBe(5);
  });

  it("adds the per-attachment multiplier for each attached node", () => {
    expect(estimatePromptCredits(3)).toBe(12.5);
  });

  it("scales linearly with attachment count", () => {
    expect(estimatePromptCredits(1)).toBe(7.5);
    expect(estimatePromptCredits(10)).toBe(30);
  });
});
