import { describe, it, expect } from "vitest";
import { isGeneratedImageType, isImageSourceType } from "../image-node-types";
import { resolveMentionTokens } from "../resolve-mention-tokens";
import { selectImageUpstreams } from "../shot-compose";

describe("isGeneratedImageType (D310)", () => {
  it("isImageSourceType: files, draws and every generated image feed an image consumer like Post", () => {
    for (const t of ["file", "draw", "image-gen", "composite"]) expect(isImageSourceType(t)).toBe(true);
    for (const t of ["text", "prompt", "avatar", "video-gen", undefined]) expect(isImageSourceType(t)).toBe(false);
  });

  it("is true for image-gen and composite only", () => {
    expect(isGeneratedImageType("image-gen")).toBe(true);
    expect(isGeneratedImageType("composite")).toBe(true);
    for (const t of ["file", "draw", "avatar", "prompt", "video-gen", "", undefined, null]) {
      expect(isGeneratedImageType(t)).toBe(false);
    }
  });

  it("a composite mention resolves positionally, like an Image Gen still", () => {
    const out = resolveMentionTokens("put @[Composite: Office](c1) in", [
      { nodeId: "c1", type: "composite", text: "", fileUrl: "https://cdn/c.png", fileKind: "image" },
    ]);
    expect(out).toBe("put the first image in");
  });

  it("the shot composer picks up a composite's image", () => {
    const picked = selectImageUpstreams([
      { nodeId: "c1", type: "composite", data: {}, activeOutput: "https://cdn/c.png", versionId: "v1" },
    ]);
    expect(picked.map((p) => p.fileUrl)).toEqual(["https://cdn/c.png"]);
  });
});
