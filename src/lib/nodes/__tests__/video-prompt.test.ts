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
    expect(user).toContain("push-in toward the subject at a constant focal length");
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

  it("uses the Kling system but STILL includes camera prose (text-camera for all)", () => {
    const { system, user } = compileVideoPrompt({ ...base, targetProvider: "kling" });
    expect(system).toContain("image-to-video prompts for Kling");
    expect(user).toContain("Camera:");
    expect(user).toContain("Speed:");
  });
});

// D201/D210. The multishot ladder prompt now lives entirely on the Multishot Prompt node's own
// writer (src/prompts/multishot-prompt-generate.ts) — this route (the single-shot Video Prompt
// node) no longer selects it for any provider, multishot flag included, so gemini-omni always
// gets the continuous-take spine here. The controls-block suppression below is unrelated to which
// system prompt is chosen and still applies whenever the upstream Shot is multishot.
describe("compileVideoPrompt multishot routing", () => {
  const base = {
    clientContext: "",
    upstream: [],
    instruction: "make it move",
  };

  it("gives a multishot omni node the continuous-take spine too, since the ladder prompt moved off this route", () => {
    const { system } = compileVideoPrompt({
      ...base,
      controls: { camera: "auto", speed: "auto" },
      targetProvider: "gemini-omni",
      multishot: true,
    });
    expect(system).toContain("image-to-video prompts for Veo");
  });

  it("still gives a single-shot omni node the continuous-take spine", () => {
    const { system } = compileVideoPrompt({
      ...base,
      controls: { camera: "auto", speed: "auto" },
      targetProvider: "gemini-omni",
      multishot: false,
    });
    expect(system).toContain("image-to-video prompts for Veo");
  });

  it("drops the global camera/speed block on a multishot node", () => {
    // A multishot node carries a camera PER BEAT inside its ladder. Emitting the global block
    // too would contradict it — with a value the operator can no longer see, since the multishot
    // surface hides the camera select and `camera` keeps whatever it held before the toggle.
    const { user } = compileVideoPrompt({
      ...base,
      controls: { camera: "push-in", speed: "dynamic" },
      targetProvider: "gemini-omni",
      multishot: true,
    });
    expect(user).not.toContain("Motion controls");
    expect(user).not.toContain("push-in");
  });

  it("keeps the global block on a single shot", () => {
    const { user } = compileVideoPrompt({
      ...base,
      controls: { camera: "push-in", speed: "dynamic" },
      targetProvider: "veo",
      multishot: false,
    });
    expect(user).toContain("Motion controls");
  });
});
