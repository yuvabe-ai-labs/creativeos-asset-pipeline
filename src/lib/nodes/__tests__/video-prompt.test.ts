import { describe, it, expect } from "vitest";
import { compileVideoPrompt, DEFAULT_MOTION_INSTRUCTION } from "../video-prompt";

describe("compileVideoPrompt", () => {
  it("uses the default motion instruction when none is given", () => {
    const { user } = compileVideoPrompt({
      clientContext: "", upstream: [], instruction: "", controls: { camera: "auto", speed: "auto" },
    });
    expect(user).toContain(DEFAULT_MOTION_INSTRUCTION);
  });

  it("injects the camera control as a standalone motion-controls block", () => {
    const { user } = compileVideoPrompt({
      clientContext: "", upstream: [], instruction: "let steam rise",
      controls: { camera: "push-in", speed: "auto" },
    });
    expect(user).toContain("a slow push-in toward the subject");
    expect(user).toContain("let steam rise");
  });

  it("includes brand context and a shot's action block", () => {
    const { user } = compileVideoPrompt({
      clientContext: "Brand: warm, slow luxury",
      upstream: [{ label: "Shot", text: "Action: condensation slides down the bottle", type: "shot" }],
      instruction: "",
      controls: { camera: "auto", speed: "auto" },
    });
    expect(user).toContain("Brand context:");
    expect(user).toContain("condensation slides down the bottle");
  });

  it("returns the motion-director system prompt", () => {
    const { system } = compileVideoPrompt({
      clientContext: "", upstream: [], instruction: "", controls: { camera: "auto", speed: "auto" },
    });
    expect(system.toLowerCase()).toContain("motion director");
  });
});

describe("compileVideoPrompt provider awareness", () => {
  const base = {
    clientContext: "",
    upstream: [],
    instruction: "make it move",
    controls: { camera: "push-in", speed: "dynamic" } as const,
  };

  it("defaults to the text-camera (veo) system and includes camera prose", () => {
    const { system, user } = compileVideoPrompt(base);
    expect(system).toContain("image-to-video prompts for Veo");
    expect(user).toContain("Camera:");
  });

  it("uses the Kling system and drops the camera control line for kling", () => {
    const { system, user } = compileVideoPrompt({ ...base, targetProvider: "kling" });
    expect(system).toContain("image-to-video prompts for Kling");
    expect(user).not.toContain("Camera:");
    expect(user).toContain("Speed:");
  });
});
