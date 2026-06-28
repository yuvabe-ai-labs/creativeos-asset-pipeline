import { describe, it, expect } from "vitest";
import { VALID_CONNECTIONS } from "@/lib/canvas-nodes";

describe("shot composer connections (image grounding)", () => {
  it("file, draw, image-gen may connect to a Shot", () => {
    expect(VALID_CONNECTIONS["file"]).toContain("shot");
    expect(VALID_CONNECTIONS["draw"]).toContain("shot");
    expect(VALID_CONNECTIONS["image-gen"]).toContain("shot");
  });

  it("non-image sources may NOT connect to a Shot", () => {
    expect(VALID_CONNECTIONS["text"]).not.toContain("shot");
    expect(VALID_CONNECTIONS["script"]).not.toContain("shot");
    expect(VALID_CONNECTIONS["prompt"]).not.toContain("shot");
  });
});
