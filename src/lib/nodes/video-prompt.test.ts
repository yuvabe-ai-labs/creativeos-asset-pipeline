import { describe, it, expect } from "vitest";
import { compileVideoPrompt } from "./video-prompt";

describe("compileVideoPrompt — composition block", () => {
  it("injects composition block when ≥2 vision nodes and @[ token present", () => {
    const { user } = compileVideoPrompt({
      clientContext: "",
      upstream: [
        {
          nodeId: "img1",
          label: "Image",
          type: "image-gen",
          text: "",
          fileUrl: "https://cdn.example.com/still.jpg",
          fileKind: "image",
        },
        {
          nodeId: "img2",
          label: "File",
          type: "file",
          text: "",
          fileUrl: "https://cdn.example.com/ref.jpg",
          fileKind: "image",
        },
      ],
      instruction: "push in on @[Image: Still](img1), match motion from @[File: Ref](img2)",
    });
    expect(user).toContain("Reference images");
    expect(user).toContain("the first image — Image");
    expect(user).toContain("the second image — File");
    expect(user.indexOf("Reference images")).toBeLessThan(user.indexOf("Instruction:"));
  });

  // The labels are filenames ("Screenshot 2026 08 25 155453") and identify nothing. The images
  // travel as vision parts, so working out which is which is the model's job, not the operator's.
  it("tells the writer to identify each image by looking at it, not by its label", () => {
    const { user } = compileVideoPrompt({
      clientContext: "",
      upstream: [
        { nodeId: "img1", label: "Screenshot 2026 08 25 155453", type: "file", text: "", fileUrl: "u1", fileKind: "image" },
      ],
      instruction: "make it move",
    });
    expect(user).toMatch(/LOOK AT EACH ATTACHED IMAGE/);
    expect(user).toMatch(/labels above are filenames and carry no meaning/i);
  });

  // Previously gated on BOTH an @-mention and two images, so an operator who simply connected a
  // reference got a prompt that never pointed at it.
  it("injects the roster from one image, with no @-mention typed", () => {
    const { user } = compileVideoPrompt({
      clientContext: "",
      upstream: [
        { nodeId: "img1", label: "Image", type: "image-gen", text: "", fileUrl: "u1", fileKind: "image" },
      ],
      instruction: "push in slowly",
    });
    expect(user).toContain("Reference images");
  });

  it("injects nothing when no images are attached", () => {
    const { user } = compileVideoPrompt({
      clientContext: "",
      upstream: [{ nodeId: "t1", label: "Note", type: "text", text: "hello" }],
      instruction: "push in slowly",
    });
    expect(user).not.toContain("Reference images");
  });

  it("resolves tokens even without composition block (single vision)", () => {
    const { user } = compileVideoPrompt({
      clientContext: "",
      upstream: [
        {
          nodeId: "img1",
          label: "Image",
          type: "image-gen",
          text: "",
          fileUrl: "https://cdn.example.com/still.jpg",
          fileKind: "image",
        },
      ],
      instruction: "push in on @[Image: Still](img1)",
    });
    expect(user).toContain("push in on the first image");
  });
});

/**
 * Omni binds reference images through `<IMAGE_REF_N>` written INLINE in the prompt body, ZERO-based
 * over the references — "in the style of <IMAGE_REF_0> a woman <IMAGE_REF_1> is walking", per the
 * vendor docs. `@ImageN` is a different scheme that belongs only in the declaration header
 * planOmniInput emits. Prose ("the first image") binds to nothing: the header then declares handles
 * the body never uses, and the model guesses which picture is which — silently, in a paid clip.
 */
describe("compileVideoPrompt — Omni reference tokens", () => {
  const twoImages = [
    { nodeId: "a", label: "v-strap shot", type: "file", text: "", fileUrl: "u1", fileKind: "image" },
    { nodeId: "b", label: "sandal shot", type: "file", text: "", fileUrl: "u2", fileKind: "image" },
  ];

  it("resolves mentions to zero-based <IMAGE_REF_N> for Omni", () => {
    const { user, effectiveInstruction } = compileVideoPrompt({
      clientContext: "",
      upstream: twoImages,
      instruction: "the student wears @[v-strap](a), the traveller wears @[sandal](b)",
      targetProvider: "gemini-omni",
      multishot: true,
    });
    expect(user).toContain("the student wears <IMAGE_REF_0>");
    expect(user).toContain("the traveller wears <IMAGE_REF_1>");
    // Asserted on the resolved instruction, not the whole turn: the roster's own guidance quotes
    // the prose form in order to forbid it.
    expect(effectiveInstruction).not.toContain("the first image");
  });

  it("lists the roster with the same tokens", () => {
    const { user } = compileVideoPrompt({
      clientContext: "",
      upstream: twoImages,
      instruction: "make it move",
      targetProvider: "gemini-omni",
      multishot: true,
    });
    expect(user).toContain("<IMAGE_REF_0> — v-strap shot");
    expect(user).toContain("<IMAGE_REF_1> — sandal shot");
    expect(user).toMatch(/never write @Image1/i);
  });

  // The token is Omni syntax. To Veo and Kling it is literal noise.
  it("keeps positional prose for veo and kling", () => {
    for (const provider of ["veo", "kling"] as const) {
      const { user } = compileVideoPrompt({
        clientContext: "",
        upstream: twoImages,
        instruction: "the student wears @[v-strap](a)",
        targetProvider: provider,
      });
      expect(user).toContain("the student wears the first image");
      expect(user).not.toContain("<IMAGE_REF_");
    }
  });
});

// The model names what it identified immediately before the token — "the CHUPPS V-Straps
// <IMAGE_REF_1>". That naming is the error check: a misidentification becomes visible in the
// text, next to the thumbnail, instead of only in a finished video. It also matches the vendor's
// own example, which writes "Starting with woman <IMAGE_REF_0>".
describe("compileVideoPrompt — Omni reference naming", () => {
  it("requires a noun phrase before each token", () => {
    const { user } = compileVideoPrompt({
      clientContext: "",
      upstream: [
        { nodeId: "a", label: "v-strap shot", type: "file", text: "", fileUrl: "u1", fileKind: "image" },
      ],
      instruction: "make it move",
      targetProvider: "gemini-omni",
      multishot: true,
    });
    expect(user).toMatch(/noun phrase naming what you identified IMMEDIATELY BEFORE the token/i);
    expect(user).toMatch(/never the bare token on its own/i);
    expect(user).toMatch(/wrong identification/i);
  });
});
