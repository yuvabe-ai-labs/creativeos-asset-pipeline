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

// D201 regressions. Each of these shipped green: the multishot surface rendered, the controls
// saved, and the route recorded the Omni promptId — while the model was handed the Veo prompt
// with none of the multishot controls in it. Nothing failed; the output was just quietly wrong.
describe("compileVideoPrompt multishot routing", () => {
  const base = {
    clientContext: "",
    upstream: [],
    instruction: "make it move",
  };

  it("keeps gemini-omni instead of collapsing it into veo", () => {
    // The coercion here listed only "kling", so "gemini-omni" fell through to "veo" and the
    // ladder prompt was unreachable no matter what the route selected.
    const { system } = compileVideoPrompt({
      ...base,
      controls: { camera: "auto", speed: "auto" },
      targetProvider: "gemini-omni",
      multishot: true,
    });
    expect(system).not.toContain("image-to-video prompts for Veo");
    expect(system.toLowerCase()).toContain("beat");
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
