import { describe, it, expect } from "vitest";
import { mapUpstreamForVideo } from "../resolve-inputs";

describe("mapUpstreamForVideo", () => {
  it("exposes an image-gen still as a vision fileUrl, with no text leak", () => {
    const out = mapUpstreamForVideo({
      nodeId: "i", versionId: "v1", type: "image-gen", data: {}, activeOutput: "https://x/still.png",
    });
    expect(out.fileUrl).toBe("https://x/still.png");
    expect(out.fileKind).toBe("image");
    expect(out.text).toBe(""); // the URL must NOT appear as text
  });

  it("renders a shot via renderShotForVideo (action/objective, not the image slice)", () => {
    const out = mapUpstreamForVideo({
      nodeId: "s", versionId: "v2", type: "shot", activeOutput: null,
      data: { script: { strategic_objective: "slow luxury", visual_script: { shots: [{ description: "steam rises" }] } } },
    });
    expect(out.text).toContain("steam rises");
    expect(out.text).toContain("slow luxury");
  });

  it("passes a text/note node through as text", () => {
    const out = mapUpstreamForVideo({
      nodeId: "t", versionId: null, type: "text", data: { text: "keep it calm" }, activeOutput: null,
    });
    expect(out.text).toBe("keep it calm");
    expect(out.fileUrl).toBeUndefined();
  });
});
