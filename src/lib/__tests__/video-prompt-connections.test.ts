import { describe, it, expect } from "vitest";
import { VALID_CONNECTIONS } from "@/lib/canvas-nodes";
import { getNodeOutput } from "@/lib/nodes/node-output";

describe("video-prompt connections", () => {
  it("image-gen, shot, file, draw, text may connect to video-prompt", () => {
    expect(VALID_CONNECTIONS["image-gen"]).toContain("video-prompt");
    expect(VALID_CONNECTIONS["shot"]).toContain("video-prompt");
    expect(VALID_CONNECTIONS["file"]).toContain("video-prompt");
    expect(VALID_CONNECTIONS["draw"]).toContain("video-prompt");
    expect(VALID_CONNECTIONS["text"]).toContain("video-prompt");
  });

  it("video-prompt may connect to video-gen only", () => {
    expect(VALID_CONNECTIONS["video-prompt"]).toEqual(["video-gen"]);
  });
});

describe("getNodeOutput for video-prompt", () => {
  it("returns the active version's text output", () => {
    expect(getNodeOutput({ type: "video-prompt", data: {}, activeOutput: "Slow push-in. Steam rises." }))
      .toBe("Slow push-in. Steam rises.");
  });
  it("returns '' when no active output", () => {
    expect(getNodeOutput({ type: "video-prompt", data: {}, activeOutput: null })).toBe("");
  });
});
