import { describe, expect, it } from "vitest";
import { EditDocSchema, type EditDoc } from "../types";

const valid: EditDoc = {
  v: 1,
  shape: "9:16",
  sources: [{ nodeId: "n1", edgeId: "e1", versionId: "v1" }],
  pieces: [{ id: "p1", sourceNodeId: "n1", in: 0, out: 2, picture: "original", sound: "dubbed" }],
  captions: [{ id: "c1", pieceId: "p1", at: 0.5, duration: 1, text: "Hi", x: 0.5, y: 0.82, font: "montserrat", size: 84, color: "#FFFFFF" }],
};

describe("EditDocSchema", () => {
  it("accepts a valid edit", () => {
    expect(EditDocSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["out <= in", { ...valid, pieces: [{ ...valid.pieces[0], out: 0 }] }],
    ["x off the frame", { ...valid, captions: [{ ...valid.captions[0], x: 1.2 }] }],
    ["a named colour", { ...valid, captions: [{ ...valid.captions[0], color: "white" }] }],
    ["an unknown font", { ...valid, captions: [{ ...valid.captions[0], font: "comic-sans" }] }],
    ["an unknown shape", { ...valid, shape: "4:3" }],
  ])("rejects %s", (_name, doc) => {
    expect(EditDocSchema.safeParse(doc).success).toBe(false);
  });
});
