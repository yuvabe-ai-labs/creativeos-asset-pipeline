import { describe, it, expect } from "vitest";
import { buildUserContent } from "./compose-message";
import type { ContentPart } from "./compose-message";
import type { UpstreamPreview } from "./resolve-inputs";
import { resolveMentionTokens } from "./resolve-mention-tokens";

function up(overrides: Partial<UpstreamPreview> = {}): UpstreamPreview {
  return {
    nodeId: "n1",
    versionId: null,
    label: "Sketch",
    type: "draw",
    text: "",
    ...overrides,
  };
}

describe("buildUserContent — draw vision attachment", () => {
  it("sends a draw node's image as an image_url part", () => {
    const content = buildUserContent("PROMPT", [
      up({ type: "draw", fileKind: "image", fileUrl: "https://x/sketch.png" }),
    ]);
    expect(content).toEqual([
      { type: "text", text: "PROMPT" },
      {
        type: "image_url",
        image_url: { url: "https://x/sketch.png", detail: "auto" },
      },
    ]);
  });

  it("returns plain text when the draw node has no image yet", () => {
    const content = buildUserContent("PROMPT", [up({ type: "draw" })]);
    expect(content).toBe("PROMPT");
  });

  it("still sends a file node image (regression)", () => {
    const content = buildUserContent("PROMPT", [
      up({ type: "file", fileKind: "image", fileUrl: "https://x/ref.png" }),
    ]);
    expect(Array.isArray(content)).toBe(true);
  });
});

describe("ordering invariant — resolveMentionTokens and buildUserContent agree", () => {
  it("vision ordinals match the image_url part order in buildUserContent", () => {
    const upstream: UpstreamPreview[] = [
      { nodeId: "s1", versionId: null, label: "Script", type: "script", text: "reel script" },
      { nodeId: "img1", versionId: null, label: "Image", type: "file", text: "", fileUrl: "https://cdn.example.com/img1.jpg", fileKind: "image" },
      { nodeId: "img2", versionId: null, label: "Image", type: "file", text: "", fileUrl: "https://cdn.example.com/img2.jpg", fileKind: "image" },
    ];

    const mentionUpstream = upstream.map((u) => ({
      nodeId: u.nodeId,
      type: u.type,
      text: u.text,
      fileUrl: u.fileUrl,
      fileKind: u.fileKind,
      useLlm: u.useLlm,
    }));
    const resolved = resolveMentionTokens(
      "use @[Image: A](img1) as base, overlay @[Image: B](img2)",
      mentionUpstream,
    );
    expect(resolved).toBe("use the first image as base, overlay the second image");

    const content = buildUserContent("use the first image as base, overlay the second image", upstream);
    expect(Array.isArray(content)).toBe(true);
    const parts = content as ContentPart[];
    expect(parts[1]).toEqual({ type: "image_url", image_url: { url: "https://cdn.example.com/img1.jpg", detail: "auto" } });
    expect(parts[2]).toEqual({ type: "image_url", image_url: { url: "https://cdn.example.com/img2.jpg", detail: "auto" } });
  });
});
