import { describe, expect, it } from "vitest";
import { remapSource } from "../remap-source";
import { cap, emptyDoc } from "./fixtures";

describe("remapSource (D406)", () => {
  const doc = emptyDoc({
    sources: [
      { nodeId: "vg", edgeId: "e-vg", versionId: "v1" },
      { nodeId: "other", edgeId: "e-o", versionId: "v2" },
    ],
    pieces: [
      { id: "p1", sourceNodeId: "vg", in: 1, out: 3, picture: "original", sound: "original" },
      { id: "p2", sourceNodeId: "other", in: 0, out: 2, picture: "original", sound: "original" },
      { id: "p3", sourceNodeId: "vg", in: 4, out: 6, picture: "original", sound: "original" },
    ],
    captions: [cap("c1", "p1", 1.5)],
  });
  const to = { nodeId: "dub", edgeId: "e-dub", versionId: "input:v1" };

  it("moves every piece of the source, with trims and captions, and swaps the source entry", () => {
    const out = remapSource(doc, "vg", to);
    expect(out.pieces.map((p) => [p.id, p.sourceNodeId, p.in, p.out])).toEqual([["p1", "dub", 1, 3], ["p2", "other", 0, 2], ["p3", "dub", 4, 6]]);
    expect(out.sources).toEqual([to, { nodeId: "other", edgeId: "e-o", versionId: "v2" }]);
    expect(out.captions).toBe(doc.captions);
  });

  it("returns the same doc when the source isn't in it", () => {
    expect(remapSource(doc, "nope", to)).toBe(doc);
  });
});
