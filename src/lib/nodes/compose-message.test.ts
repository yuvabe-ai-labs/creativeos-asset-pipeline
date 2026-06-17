import { describe, it, expect } from "vitest";
import { buildUserContent } from "./compose-message";
import type { UpstreamPreview } from "./resolve-inputs";

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
