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

// D229/D231. A Shot upstream is always a single continuous take — the Multishot ladder prompt
// lives entirely on the Multishot Prompt node's own writer (src/prompts/multishot-prompt-generate.ts),
// and a Multishot node cannot connect to this route at all. So this route always emits the
// continuous-take spine and the global camera/speed block, for every provider including Omni.
describe("compileVideoPrompt continuous-take spine", () => {
  it("gives an omni node the continuous-take spine", () => {
    const { system } = compileVideoPrompt({
      clientContext: "",
      upstream: [],
      instruction: "make it move",
      controls: { camera: "auto", speed: "auto" },
      targetProvider: "gemini-omni",
    });
    // The spine itself — this is what the test is actually about: a Shot upstream is one
    // continuous take, so this route emits the i2v spine and never the multishot ladder.
    expect(system).toContain("STRUCTURE (image-to-video)");
    expect(system).not.toMatch(/\[\d+-\d+s\]/);
  });

  // D243 — this assertion used to read `toContain("image-to-video prompts for Veo")`, which
  // passed only because Omni had no record of its own and fell through to Veo's. It was pinning
  // the bug rather than the behaviour: the spine is what this describe block is about, and the
  // header line was a proxy that happened to work. Now it asserts the thing that was wrong.
  it("writes an omni node its OWN header, not Veo's", () => {
    const { system } = compileVideoPrompt({
      clientContext: "",
      upstream: [],
      instruction: "make it move",
      controls: { camera: "auto", speed: "auto" },
      targetProvider: "gemini-omni",
    });
    expect(system).toContain("for Gemini Omni");
    expect(system).not.toContain("for Veo 3.1");
  });

  it("keeps the global camera/speed block on an omni node", () => {
    const { user } = compileVideoPrompt({
      clientContext: "",
      upstream: [],
      instruction: "make it move",
      controls: { camera: "push-in", speed: "dynamic" },
      targetProvider: "gemini-omni",
    });
    expect(user).toContain("Motion controls");
  });
});

// D243/D245 — the gap the Task 7 implementer flagged: `omni` was a boolean, so Seedance (a third
// target) fell to the non-omni branch and got English prose, while Seedance's OWN system prompt
// separately instructs the writer to emit `@Image N` handles. These pin the three-way behaviour.
describe("compileVideoPrompt reference-token dialect per target", () => {
  const imageUpstream = [
    {
      nodeId: "img1",
      label: "Image: Hero shot",
      text: "",
      type: "image-gen",
      fileUrl: "https://example.com/hero.png",
      fileKind: "image",
    },
    {
      nodeId: "img2",
      label: "Image: Detail shot",
      text: "",
      type: "image-gen",
      fileUrl: "https://example.com/detail.png",
      fileKind: "image",
    },
  ];

  it("resolves a Seedance @-mention to the one-based @Image N token, not prose and not <IMAGE_REF_N>", () => {
    const { effectiveInstruction } = compileVideoPrompt({
      clientContext: "",
      upstream: imageUpstream,
      instruction: "show @[Image: Hero shot](img1) first",
      controls: { camera: "auto", speed: "auto" },
      targetProvider: "seedance",
    });
    expect(effectiveInstruction).toBe("show @Image 1 first");
    expect(effectiveInstruction).not.toContain("the first image");
    expect(effectiveInstruction).not.toContain("IMAGE_REF");
  });

  it("lists @Image 1 / @Image 2 in the Seedance composition roster and never ships Omni's forbidding sentence", () => {
    const { user } = compileVideoPrompt({
      clientContext: "",
      upstream: imageUpstream,
      instruction: "make it move",
      controls: { camera: "auto", speed: "auto" },
      targetProvider: "seedance",
    });
    expect(user).toContain("@Image 1 —");
    expect(user).toContain("@Image 2 —");
    // Omni's own text forbids the exact string Seedance is supposed to write — shipping it
    // verbatim would tell Seedance's writer not to use its own correct handle.
    expect(user).not.toContain("never write @Image1");
    expect(user).not.toContain("<IMAGE_REF");
  });

  it("keeps Gemini Omni's roster and resolution zero-based and unchanged", () => {
    const { user, effectiveInstruction } = compileVideoPrompt({
      clientContext: "",
      upstream: imageUpstream,
      instruction: "show @[Image: Hero shot](img1) first",
      controls: { camera: "auto", speed: "auto" },
      targetProvider: "gemini-omni",
    });
    expect(effectiveInstruction).toBe("show <IMAGE_REF_0> first");
    expect(user).toContain("<IMAGE_REF_0> —");
    expect(user).toContain("<IMAGE_REF_1> —");
    expect(user).toContain("never write @Image1");
  });

  it("still resolves Veo and Kling mentions to English prose, not any inline token", () => {
    for (const targetProvider of ["veo", "kling"] as const) {
      const { effectiveInstruction, user } = compileVideoPrompt({
        clientContext: "",
        upstream: imageUpstream,
        instruction: "show @[Image: Hero shot](img1) first",
        controls: { camera: "auto", speed: "auto" },
        targetProvider,
      });
      expect(effectiveInstruction).toBe("show the first image first");
      expect(user).toContain("the first image —");
      expect(user).toContain("the second image —");
      expect(user).not.toContain("IMAGE_REF");
      expect(user).not.toContain("@Image");
    }
  });
});
