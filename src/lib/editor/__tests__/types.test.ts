import { describe, expect, it } from "vitest";
import { EditDocSchema, type EditDoc } from "../types";
import { DEFAULT_CAPTION_STYLE } from "../caption-style";

const valid: EditDoc = {
  v: 2, captionStyle: DEFAULT_CAPTION_STYLE,
  shape: "9:16",
  sources: [{ nodeId: "n1", edgeId: "e1", versionId: "v1" }],
  pieces: [{ id: "p1", sourceNodeId: "n1", in: 0, out: 2, picture: "original", sound: "dubbed" }],
  captions: [{ id: "c1", pieceId: "p1", at: 0.5, duration: 1, text: "Hi" }],
};

describe("EditDocSchema", () => {
  it("accepts a valid edit", () => {
    expect(EditDocSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["out <= in", { ...valid, pieces: [{ ...valid.pieces[0], out: 0 }] }],
    ["x off the frame", { ...valid, captionStyle: { ...DEFAULT_CAPTION_STYLE, x: 1.2 } }],
    ["a named colour", { ...valid, captionStyle: { ...DEFAULT_CAPTION_STYLE, color: "white" } }],
    ["an unknown font", { ...valid, captionStyle: { ...DEFAULT_CAPTION_STYLE, font: "comic-sans" } }],
    ["no caption style", { ...valid, captionStyle: undefined }],
    ["a word with no text", { ...valid, captions: [{ ...valid.captions[0], words: [{ text: "", at: 0.5, duration: 0.2 }] }] }],
    ["an unknown shape", { ...valid, shape: "4:3" }],
  ])("rejects %s", (_name, doc) => {
    expect(EditDocSchema.safeParse(doc).success).toBe(false);
  });
});
