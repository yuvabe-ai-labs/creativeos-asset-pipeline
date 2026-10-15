import { describe, it, expect } from "vitest";
import { pathForImageGenResult, pathForImageGenMask } from "../paths";

const ids = { clientId: "c1", canvasId: "cv1", nodeId: "n1", generationId: "g1" };

describe("image-gen result and mask paths", () => {
  it("keys the result by generation id, so the route can sign it before the task runs", () => {
    expect(pathForImageGenResult({ ...ids, ext: "png" })).toBe(
      "clients/c1/canvases/cv1/nodes/n1/image-gen/g1.png",
    );
  });

  it("keeps the extension it is given", () => {
    expect(pathForImageGenResult({ ...ids, ext: "webp" })).toMatch(/\/g1\.webp$/);
  });

  it("puts the mask beside the result, under the same generation id", () => {
    expect(pathForImageGenMask(ids)).toBe("clients/c1/canvases/cv1/nodes/n1/image-gen/g1-mask.png");
  });
});
