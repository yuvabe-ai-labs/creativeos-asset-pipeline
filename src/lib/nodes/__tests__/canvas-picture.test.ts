import { describe, expect, it } from "vitest";
import { canvasNodeName, canvasPicture, selectedInputPreview } from "../canvas-picture";

describe("canvasPicture", () => {
  it("reads a File or Sketch's own upload", () => {
    expect(canvasPicture("file", { fileUrl: "f.png", fileKind: "image" })).toEqual({ fileUrl: "f.png", fileKind: "image" });
    expect(canvasPicture("draw", { fileUrl: "d.png", fileKind: "image" })).toEqual({ fileUrl: "d.png", fileKind: "image" });
  });

  it("reads a generated image's active output", () => {
    expect(canvasPicture("image-gen", { parsed: "g.png" })).toEqual({ fileUrl: "g.png", fileKind: "image" });
    expect(canvasPicture("composite", {})).toEqual({ fileKind: "image" });
  });

  // The script's products and locations read "no preview" everywhere before this.
  it("reads a script Product's packshot and a Location's plate", () => {
    expect(canvasPicture("product", { name: "Pouch", images: [{ url: "p1.png" }, { url: "p2.png" }] }))
      .toEqual({ fileUrl: "p1.png", fileKind: "image" });
    expect(canvasPicture("location", { name: "Kitchen", image: { url: "k.png" } }))
      .toEqual({ fileUrl: "k.png", fileKind: "image" });
  });

  it("gives nothing for a product or location with no picture yet, or a text node", () => {
    expect(canvasPicture("product", { images: [] })).toEqual({});
    expect(canvasPicture("location", { image: null })).toEqual({});
    expect(canvasPicture("shot", { fileUrl: "x.png" })).toEqual({});
  });
});

describe("canvasNodeName", () => {
  it("prefers the title, then a product or location's name", () => {
    expect(canvasNodeName({ title: " Hero " })).toBe("Hero");
    expect(canvasNodeName({ name: "Pouch" })).toBe("Pouch");
    expect(canvasNodeName({})).toBeUndefined();
  });
});

describe("selectedInputPreview", () => {
  const server = [{ nodeId: "a", label: "File", type: "file", text: "t", fileUrl: "s.png", fileKind: "image" }];
  const rail = [
    { id: "a", label: "File", type: "file", fileUrl: "c.png", fileKind: "image" },
    { id: "p", label: "Pouch", type: "product", fileUrl: "p.png", fileKind: "image" },
    { id: "s", label: "Shot", type: "shot" },
  ];

  it("uses the server's row when it has one", () => {
    expect(selectedInputPreview(server, rail, "a")?.fileUrl).toBe("s.png");
  });

  it("falls back to the canvas picture when the server has no row for it", () => {
    expect(selectedInputPreview(server, rail, "p")).toEqual({
      nodeId: "p", label: "Pouch", type: "product", text: "", fileUrl: "p.png", fileKind: "image",
    });
  });

  it("is null when neither has anything to show", () => {
    expect(selectedInputPreview(server, rail, "s")).toBeNull();
    expect(selectedInputPreview(server, rail, "missing")).toBeNull();
  });
});
