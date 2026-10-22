import { describe, expect, it } from "vitest";
import { editSummary } from "../summary";
import type { Caption, EditorState, Piece } from "../types";
import { source } from "./fixtures";
import { DEFAULT_CAPTION_STYLE } from "../caption-style";

const piece = (id: string, src: string, inS: number, outS: number, o: Partial<Piece> = {}): Piece => ({
  id, sourceNodeId: src, in: inS, out: outS, picture: "original", sound: "original", ...o,
});
const cap = (id: string, pieceId: string, at: number): Caption => ({
  id, pieceId, at, duration: 1, text: id,
});
const state = (pieces: Piece[], captions: Caption[] = []): EditorState => ({
  canvasId: "cv", editorNodeId: "ed", editorTitle: "Editor", changed: false, notices: [],
  sources: [source("a"), source("b"), source("c")],
  doc: { v: 2, captionStyle: DEFAULT_CAPTION_STYLE, shape: "9:16", sources: [], pieces, captions },
});

describe("editSummary", () => {
  it("counts sources, pieces and length, and draws the strip", () => {
    const s = editSummary(state([piece("1", "a", 0, 3), piece("2", "b", 1, 2, { sound: "dubbed" }), piece("3", "a", 4, 5)]));
    expect(s).toMatchObject({ sources: 3, pieces: 3, seconds: 5, shape: "9:16", dubbedPieces: 1, captions: 0 });
    expect(s.strip.map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(s.strip.reduce((sum, x) => sum + x.fraction, 0)).toBeCloseTo(1, 9);
    expect(s.strip[0].fraction).toBeCloseTo(0.6, 9);
    expect(s.strip.map((x) => x.dubbed)).toEqual([false, true, false]);
  });

  it("places captions on the strip as fractions of the reel", () => {
    const s = editSummary(state([piece("1", "a", 0, 4), piece("2", "b", 0, 4)], [cap("c1", "2", 1)]));
    expect(s.captions).toBe(1);
    expect(s.captionStrip).toEqual([{ id: "c1", start: 0.625, width: 0.125 }]);
  });

  it("has empty strips with no pieces", () => {
    const s = editSummary(state([]));
    expect(s.strip).toEqual([]);
    expect(s.captionStrip).toEqual([]);
  });
});
