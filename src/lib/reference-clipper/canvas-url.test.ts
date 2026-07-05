import { describe, it, expect } from "vitest";
import { parseCanvasUrl } from "./canvas-url";

describe("parseCanvasUrl", () => {
  it("extracts client + canvas slugs from a canvas URL", () => {
    expect(parseCanvasUrl("http://localhost:3000/clients/acme/canvases/reel-1")).toEqual({
      clientSlug: "acme",
      canvasSlug: "reel-1",
    });
  });

  it("ignores trailing path segments and query strings", () => {
    expect(
      parseCanvasUrl("http://localhost:3000/clients/acme/canvases/reel-1/foo?tab=evals"),
    ).toEqual({ clientSlug: "acme", canvasSlug: "reel-1" });
  });

  it("works for a production origin", () => {
    expect(parseCanvasUrl("https://creativeos.app/clients/acme/canvases/reel-1")).toEqual({
      clientSlug: "acme",
      canvasSlug: "reel-1",
    });
  });

  it("returns null for a non-canvas page", () => {
    expect(parseCanvasUrl("http://localhost:3000/clients/acme")).toBeNull();
  });

  it("returns null for a non-URL string", () => {
    expect(parseCanvasUrl("not a url")).toBeNull();
  });
});
