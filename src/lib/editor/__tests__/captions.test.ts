import { describe, expect, it } from "vitest";
import { fontCoversText } from "../caption-fonts";
import {
  addCaption, attachCues, captionTimes, deletePiece, docToCues, editCaption, placeCaption, removeCaption,
  retimeCaption, splitPieceInDoc,
} from "../captions";
import { movePiece } from "../timeline";
import type { Caption, EditDoc, Piece } from "../types";

const piece = (id: string, inS: number, outS: number): Piece => ({
  id, sourceNodeId: `src-${id}`, in: inS, out: outS, picture: "original", sound: "original",
});
const c1: Caption = {
  id: "c1", pieceId: "B", at: 1.5, duration: 1, text: "Fresh jackfruit", x: 0.4, y: 0.7,
  font: "anton", size: 90, color: "#ffd60a",
};
const doc: EditDoc = { v: 1, shape: "9:16", sources: [], pieces: [piece("A", 0, 4), piece("B", 1, 3)], captions: [c1] };

describe("captions belong to pieces", () => {
  it("times a caption from its piece", () => {
    expect(captionTimes(doc, c1)).toEqual({ start: 4.5, end: 5.5 });
  });

  it("clamps to its piece when a trim cuts past its start, keeping the stored anchor", () => {
    const trimmed = { ...doc, pieces: [doc.pieces[0], { ...doc.pieces[1], in: 2 }] };
    expect(captionTimes(trimmed, c1)?.start).toBe(4);
    expect(trimmed.captions[0].at).toBe(1.5);
  });

  it("moves with its piece when pieces are reordered", () => {
    const moved = { ...doc, pieces: movePiece(doc.pieces, 1, 0) };
    expect(captionTimes(moved, c1)?.start).toBeCloseTo(0.5, 9);
  });

  it("clips the end to the reel and is gone with its piece", () => {
    expect(captionTimes(doc, { ...c1, duration: 9 })?.end).toBe(6);
    expect(captionTimes(doc, { ...c1, pieceId: "gone" })).toBeNull();
  });

  it("adds at the playhead with defaults, then copies the last caption's look", () => {
    const first = addCaption({ ...doc, captions: [] }, 4.5, "c2");
    expect(first.captions[0]).toMatchObject({
      pieceId: "B", at: 1.5, duration: 2, text: "New caption", font: "montserrat", size: 84, color: "#ffffff", x: 0.5, y: 0.82,
    });
    const second = addCaption(doc, 1, "c3");
    expect(second.captions.find((c) => c.id === "c3")).toMatchObject({
      pieceId: "A", at: 1, font: "anton", size: 90, color: "#ffd60a", x: 0.4, y: 0.7,
    });
  });

  it("re-attaches to the piece under a new start, with a 0.2 s minimum", () => {
    const moved = retimeCaption(doc, "c1", 1, 2);
    expect(moved.captions[0]).toMatchObject({ pieceId: "A", at: 1, duration: 1 });
    expect(retimeCaption(doc, "c1", 1, 1.05).captions[0].duration).toBeCloseTo(0.2, 9);
  });

  it("deletes a piece's captions with the piece", () => {
    const out = deletePiece(doc, "B");
    expect(out.pieces.map((p) => p.id)).toEqual(["A"]);
    expect(out.captions).toEqual([]);
  });

  it("moves later captions to the new half on a split", () => {
    const late: Caption = { ...c1, id: "c4", at: 2.5 };
    const out = splitPieceInDoc({ ...doc, captions: [c1, late] }, "B", 2, "B2", 24)!;
    expect(out.captions.find((c) => c.id === "c1")?.pieceId).toBe("B");
    expect(out.captions.find((c) => c.id === "c4")?.pieceId).toBe("B2");
    expect(splitPieceInDoc(doc, "B", 1, "x", 24)).toBeNull();
  });

  it("attaches SRT cues to the piece under their start and drops ones past the end", () => {
    let n = 0;
    const { doc: out, dropped } = attachCues({ ...doc, captions: [] }, [
      { start: 4.2, end: 5, text: "Order on the app" },
      { start: 99, end: 100, text: "late" },
    ], () => `s${++n}`);
    expect(dropped).toBe(1);
    expect(out.captions).toHaveLength(1);
    expect(out.captions[0]).toMatchObject({ pieceId: "B", text: "Order on the app" });
    expect(out.captions[0].at).toBeCloseTo(1.2, 9);
    expect(out.captions[0].duration).toBeCloseTo(0.8, 9);
  });

  it("exports cues in reel time, sorted", () => {
    const early: Caption = { ...c1, id: "c0", pieceId: "A", at: 0 };
    expect(docToCues({ ...doc, captions: [c1, early] }).map((c) => c.start)).toEqual([0, 4.5]);
  });

  it("returns the same doc for a no-op", () => {
    expect(placeCaption(doc, "c1", c1.x, c1.y)).toBe(doc);
    expect(editCaption(doc, "c1", { text: c1.text })).toBe(doc);
    expect(removeCaption(doc, "missing")).toBe(doc);
  });

  it("keeps captions inside the frame", () => {
    expect(placeCaption(doc, "c1", 2, -1).captions[0]).toMatchObject({ x: 0.96, y: 0.04 });
  });

  it("knows which fonts cover Devanagari", () => {
    expect(fontCoversText("montserrat", "नमस्ते")).toBe(false);
    expect(fontCoversText("poppins", "नमस्ते")).toBe(true);
  });
});
