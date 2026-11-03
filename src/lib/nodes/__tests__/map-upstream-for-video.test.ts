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

  // D478 — the writer is told a line is coming and who says it, never asked to write the words.
  it("tells the writer about a shot's spoken lines, and nothing when there are none", () => {
    const shot = (voiceover: object[]) => mapUpstreamForVideo({
      nodeId: "s", versionId: null, type: "shot", activeOutput: null,
      data: { script: { visual_script: { shots: [{ description: "Rhea stirs yogurt", voiceover }] } } },
    });
    expect(shot([{ text: "Okay, breakfast.", speaker: "Rhea" }]).text).toContain(
      'Spoken in this shot (added when sent; never write these words):\n  Rhea (on-screen): "Okay, breakfast."',
    );
    expect(shot([]).text).not.toContain("Spoken in this shot");
  });

  it("passes a text/note node through as text", () => {
    const out = mapUpstreamForVideo({
      nodeId: "t", versionId: null, type: "text", data: { text: "keep it calm" }, activeOutput: null,
    });
    expect(out.text).toBe("keep it calm");
    expect(out.fileUrl).toBeUndefined();
  });
});
