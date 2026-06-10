import { describe, it, expect } from "vitest";
import { compilePrompt } from "./prompt";

describe("compilePrompt", () => {
  it("assembles labeled blocks for context + upstream + instruction", () => {
    const { user } = compilePrompt({
      clientContext: "Tone: warm",
      upstream: [{ label: "Script", text: "Title: Reel A" }],
      instruction: "cinematic hero shot",
    });
    expect(user).toContain("Brand context:\nTone: warm");
    expect(user).toContain("Script:\nTitle: Reel A");
    expect(user).toContain("Instruction:\ncinematic hero shot");
  });

  it("omits empty blocks and defaults a missing instruction", () => {
    const { user } = compilePrompt({ clientContext: "", upstream: [], instruction: "  " });
    expect(user).not.toContain("Brand context:");
    expect(user).not.toContain("Script:");
    expect(user).toContain("Instruction:");
  });

  it("uses the versioned system prompt", () => {
    const { system } = compilePrompt({ clientContext: "", upstream: [], instruction: "x" });
    expect(system).toContain("image-generation prompt");
  });
});
