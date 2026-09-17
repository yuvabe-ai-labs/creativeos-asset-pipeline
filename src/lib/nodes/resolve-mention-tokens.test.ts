import { describe, it, expect } from "vitest";
import {
  resolveMentionTokens,
  omniImageRefToken,
  seedanceImageRefToken,
} from "./resolve-mention-tokens";
import type { MentionUpstream } from "./resolve-mention-tokens";

function img(nodeId: string, fileKind: "image" = "image"): MentionUpstream {
  return {
    nodeId,
    type: "file",
    text: "",
    fileUrl: `https://cdn.example.com/${nodeId}.jpg`,
    fileKind,
  };
}

function imgGen(nodeId: string): MentionUpstream {
  return {
    nodeId,
    type: "image-gen",
    text: "",
    fileUrl: `https://cdn.example.com/${nodeId}.jpg`,
    fileKind: "image",
  };
}

function draw(nodeId: string): MentionUpstream {
  return {
    nodeId,
    type: "draw",
    text: "",
    fileUrl: `https://cdn.example.com/${nodeId}.jpg`,
    fileKind: "image",
  };
}

function fileText(nodeId: string, text: string): MentionUpstream {
  return { nodeId, type: "file", text, fileUrl: undefined, fileKind: "document" };
}

function nonVision(nodeId: string): MentionUpstream {
  return { nodeId, type: "shot", text: "a wide shot", fileUrl: undefined };
}

describe("resolveMentionTokens", () => {
  it("returns instruction unchanged when no tokens present", () => {
    const upstream = [img("a"), img("b")];
    expect(resolveMentionTokens("use the main image", upstream)).toBe("use the main image");
  });

  it("resolves an image-gen token to 'the first image'", () => {
    const upstream = [imgGen("hero")];
    const result = resolveMentionTokens("use @[Image: Hero](hero) as start frame", upstream);
    expect(result).toBe("use the first image as start frame");
  });

  it("resolves a file image token to positional ordinal", () => {
    const upstream = [img("ref1")];
    const result = resolveMentionTokens("take composition from @[Image: Ref](ref1)", upstream);
    expect(result).toBe("take composition from the first image");
  });

  it("resolves a draw token to positional ordinal", () => {
    const upstream = [draw("sketch1")];
    const result = resolveMentionTokens("match @[Sketch: Draft](sketch1) style", upstream);
    expect(result).toBe("match the first image style");
  });

  it("assigns correct ordinals when multiple vision nodes", () => {
    const upstream = [img("a"), img("b"), img("c")];
    const result = resolveMentionTokens(
      "@[Image: A](a) start, @[Image: B](b) mid, @[Image: C](c) end",
      upstream,
    );
    expect(result).toBe("the first image start, the second image mid, the third image end");
  });

  it("resolves ordinal 4 to 'the fourth image'", () => {
    const upstream = [img("a"), img("b"), img("c"), img("d")];
    const result = resolveMentionTokens("@[Image: D](d) last", upstream);
    expect(result).toBe("the fourth image last");
  });

  it("resolves a file text node by inlining its extracted text", () => {
    const upstream = [fileText("brief", "Tone: warm and inviting")];
    const result = resolveMentionTokens("follow @[File: Brief](brief) guidelines", upstream);
    expect(result).toBe("follow Tone: warm and inviting guidelines");
  });

  it("ignores non-vision non-text nodes in vision ordinal count", () => {
    // shot node is not a vision attachment — should not affect ordinals
    const upstream = [nonVision("shot1"), img("ref1")];
    const result = resolveMentionTokens("use @[Image: Ref](ref1)", upstream);
    expect(result).toBe("use the first image");
  });

  it("falls back to display label when nodeId is not in upstream", () => {
    const upstream = [img("a")];
    const result = resolveMentionTokens("use @[Image: Missing](missing-id)", upstream);
    expect(result).toBe("use Image: Missing");
  });

  it("handles multiple tokens of mixed types", () => {
    const upstream = [img("hero"), fileText("brief", "brand voice: bold")];
    const result = resolveMentionTokens(
      "use @[Image: Hero](hero) as base; apply @[File: Brief](brief)",
      upstream,
    );
    expect(result).toBe("use the first image as base; apply brand voice: bold");
  });

  it("is a no-op on empty instruction", () => {
    expect(resolveMentionTokens("", [img("a")])).toBe("");
  });

  it("names ordinals 4-10 correctly", () => {
    const upstream = [
      img("a"), img("b"), img("c"), img("d"), img("e"),
      img("f"), img("g"), img("h"), img("i"), img("j"),
    ];
    const result = resolveMentionTokens(
      "@[Image: D](d) @[Image: E](e) @[Image: F](f) @[Image: G](g) @[Image: H](h) @[Image: I](i) @[Image: J](j)",
      upstream,
    );
    expect(result).toBe(
      "the fourth image the fifth image the sixth image the seventh image the eighth image the ninth image the tenth image",
    );
  });

  it("falls back to 'image N' for ordinals beyond 10", () => {
    const upstream = Array.from({ length: 11 }, (_, i) => img(`n${i}`));
    const result = resolveMentionTokens("@[Image: K](n10)", upstream);
    expect(result).toBe("image 11");
  });

  // D245 — Seedance's own system prompt independently instructs the model to write `@Image N`
  // handles, so a mention here must resolve to that same ONE-based shape, not English prose and
  // not Omni's ZERO-based `<IMAGE_REF_N>`.
  it("resolves to Seedance's one-based @Image N token when given seedanceImageRefToken", () => {
    const upstream = [imgGen("hero")];
    const result = resolveMentionTokens(
      "show @[Image: Hero](hero) first",
      upstream,
      seedanceImageRefToken,
    );
    expect(result).toBe("show @Image 1 first");
  });

  it("resolves to Omni's zero-based <IMAGE_REF_N> token when given omniImageRefToken", () => {
    const upstream = [imgGen("hero")];
    const result = resolveMentionTokens(
      "show @[Image: Hero](hero) first",
      upstream,
      omniImageRefToken,
    );
    expect(result).toBe("show <IMAGE_REF_0> first");
  });
});

describe("seedanceImageRefToken", () => {
  it("is one-based, unlike omniImageRefToken's zero-based scheme", () => {
    expect(seedanceImageRefToken(1)).toBe("@Image 1");
    expect(seedanceImageRefToken(2)).toBe("@Image 2");
    expect(omniImageRefToken(1)).toBe("<IMAGE_REF_0>");
  });
});
