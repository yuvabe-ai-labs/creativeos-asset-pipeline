import { describe, it, expect } from "vitest";
import { compilePrompt, DEFAULT_INSTRUCTION } from "./prompt";

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
    expect(user).toContain(DEFAULT_INSTRUCTION);
  });

  it("uses the versioned system prompt", () => {
    const { system } = compilePrompt({ clientContext: "", upstream: [], instruction: "x" });
    expect(system).toContain("image-generation prompt");
  });

  it("injects the shot-controls block (after upstream, before instruction) when set", () => {
    const { user } = compilePrompt({
      clientContext: "",
      upstream: [{ label: "Shot", text: "a wide shot", type: "shot" }],
      instruction: "go",
      controls: { lens: "wide-24", composition: "auto", lighting: "golden-hour" },
    });
    expect(user).toContain("Shot controls (use these exactly");
    expect(user).toMatch(/Lens: .*24mm/);
    expect(user).not.toMatch(/Composition:/); // auto omitted
    // ordering: shot text → controls → instruction
    expect(user.indexOf("specific shot")).toBeLessThan(user.indexOf("Shot controls"));
    expect(user.indexOf("Shot controls")).toBeLessThan(user.indexOf("Instruction:"));
  });

  it("adds no controls block when controls are absent or all Auto (back-compat)", () => {
    const withoutControls = compilePrompt({ clientContext: "", upstream: [], instruction: "x" }).user;
    const allAuto = compilePrompt({
      clientContext: "",
      upstream: [],
      instruction: "x",
      controls: { lens: "auto", composition: "auto", lighting: "auto" },
    }).user;
    expect(withoutControls).not.toContain("Shot controls");
    expect(allAuto).not.toContain("Shot controls");
  });

  it("reports the effective instruction (blank falls back to the default)", () => {
    expect(
      compilePrompt({ clientContext: "", upstream: [], instruction: "" }).effectiveInstruction,
    ).toBe(DEFAULT_INSTRUCTION);
    expect(
      compilePrompt({ clientContext: "", upstream: [], instruction: "  make it airy " }).effectiveInstruction,
    ).toBe("make it airy");
  });

  it("resolves @[Label](nodeId) image tokens to positional references in instruction", () => {
    const { user } = compilePrompt({
      clientContext: "",
      upstream: [
        {
          nodeId: "img-1",
          label: "Image",
          type: "image-gen",
          text: "",
          fileUrl: "https://cdn.example.com/hero.jpg",
          fileKind: "image",
        },
        {
          nodeId: "img-2",
          label: "Image",
          type: "file",
          text: "",
          fileUrl: "https://cdn.example.com/ref.jpg",
          fileKind: "image",
        },
      ],
      instruction: "use @[Image: Hero](img-1) as base, composition from @[Image: Ref](img-2)",
    });
    expect(user).toContain("Instruction:\nuse the first image as base, composition from the second image");
  });
});
