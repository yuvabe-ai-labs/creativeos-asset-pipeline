import { describe, it, expect } from "vitest";
import { upstreamImageOf } from "./upstream-image";

const row = (type: string, data: Record<string, unknown>, activeOutput: unknown = null) => ({
  nodeId: "n1",
  type,
  data,
  activeOutput,
});

describe("upstreamImageOf", () => {
  it("reads an image File's upload", () => {
    expect(
      upstreamImageOf(row("file", { fileKind: "image", fileUrl: "https://x/a.png", filename: "a.png" })),
    ).toMatchObject({ id: "n1", type: "file", imageUrl: "https://x/a.png", filename: "a.png" });
  });

  it("reads a Draw's sketch", () => {
    expect(upstreamImageOf(row("draw", { fileKind: "image", fileUrl: "https://x/d.png" }))?.imageUrl).toBe(
      "https://x/d.png",
    );
  });

  it("reads a generated image's active output", () => {
    expect(upstreamImageOf(row("image-gen", {}, "https://x/g.png"))?.imageUrl).toBe("https://x/g.png");
    expect(upstreamImageOf(row("composite", {}, "https://x/c.png"))?.imageUrl).toBe("https://x/c.png");
  });

  it("is null for what is not an image yet", () => {
    expect(upstreamImageOf(row("file", { fileKind: "doc", fileUrl: "https://x/a.pdf" }))).toBeNull();
    expect(upstreamImageOf(row("file", { fileKind: "image" }))).toBeNull();
    expect(upstreamImageOf(row("image-gen", {}, null))).toBeNull();
  });

  // These become several rows, or need the server's rendered text, so only a read can list them.
  it("is null for nodes the server expands", () => {
    for (const type of ["avatar", "product", "location", "video-prompt", "multishot-prompt"]) {
      expect(upstreamImageOf(row(type, { fileKind: "image", fileUrl: "https://x/a.png" }))).toBeNull();
    }
  });

  it("names a script's picture, and points at the node it comes from", () => {
    const image = upstreamImageOf({
      nodeId: "prod:1",
      type: "file",
      activeOutput: null,
      data: {
        fileKind: "image",
        fileUrl: "https://x/p.png",
        scriptAsset: { kind: "product", id: "p", name: "Chupps", angle: 1 },
      },
    });
    expect(image?.filename).toBe("Chupps, angle 2");
    expect(image?.asset).toEqual({ kind: "product", nodeId: "prod", angle: 1 });
  });
});
