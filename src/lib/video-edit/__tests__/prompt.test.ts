import { describe, it, expect } from "vitest";
import { composeVideoEditPrompt } from "../prompt";

describe("composeVideoEditPrompt", () => {
  it("adds the keep-everything-else line after the instruction", () => {
    const text = composeVideoEditPrompt({ instruction: "  Make the flour beige.  ", references: [] });
    expect(text.startsWith("Make the flour beige.\n\n")).toBe(true);
    expect(text).toContain("Change only what is described above.");
    expect(text).not.toContain("IMAGE_REF");
  });
  it("names each reference by its position, in order", () => {
    const text = composeVideoEditPrompt({ instruction: "Swap the pack.", references: [{ label: "Jackfruit 365 pack" }, { label: "Neha, front" }] });
    expect(text).toContain("<IMAGE_REF_0> is Jackfruit 365 pack.");
    expect(text).toContain("<IMAGE_REF_1> is Neha, front.");
    expect(text.indexOf("<IMAGE_REF_0>")).toBeLessThan(text.indexOf("<IMAGE_REF_1>"));
  });
});
