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
    expect(user).toContain("Reference images (attached in order):");
    expect(user).toContain("1. the first image");
    expect(user).toContain("2. the second image");
    expect(user.indexOf("Reference images")).toBeLessThan(user.indexOf("Instruction:"));
  });

  it("does NOT inject composition block for single vision node", () => {
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
    expect(user).not.toContain("Reference images (attached in order):");
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
