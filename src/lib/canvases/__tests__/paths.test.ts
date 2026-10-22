import { describe, it, expect } from "vitest";
import { canvasHref } from "../paths";

describe("canvasHref", () => {
  it("points at the canvas, and asks it to add the script when one is given", () => {
    expect(canvasHref("acme", "reel-12")).toBe("/clients/acme/canvases/reel-12");
    expect(canvasHref("acme", "reel-12", "6f1c2b1e-0000-4000-8000-000000000001")).toBe("/clients/acme/canvases/reel-12?addScript=6f1c2b1e-0000-4000-8000-000000000001");
  });
});
