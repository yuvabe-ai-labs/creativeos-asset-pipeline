import { describe, expect, it } from "vitest";
import { addSourceAgain, duplicatePiece, setPicture, setSound } from "../pieces";
import type { EditDoc } from "../types";
import { file, source, videoFacts } from "./fixtures";
import { DEFAULT_CAPTION_STYLE } from "../caption-style";

const D = source("d", { kind: "dubbing", lipSynced: file("https://storage.googleapis.com/b/d-lip.mp4", videoFacts({ fps: 25, frames: 100 })) });
const A = source("a");
const doc: EditDoc = {
  v: 2, captionStyle: DEFAULT_CAPTION_STYLE, shape: "9:16", sources: [], captions: [],
  pieces: [
    { id: "p1", sourceNodeId: "d", in: 1, out: 5, picture: "original", sound: "original" },
    { id: "p2", sourceNodeId: "a", in: 0, out: 2, picture: "original", sound: "original" },
  ],
};

describe("picture and sound choices", () => {
  it("switches to the lip-synced picture, pulling the out point in to that file's length", () => {
    const out = setPicture(doc, "p1", "lipSynced", [D, A]);
    expect(out.pieces[0]).toMatchObject({ picture: "lipSynced", in: 1, out: 4 });
  });

  it("can't choose a lip-synced picture the source doesn't have", () => {
    expect(setPicture(doc, "p2", "lipSynced", [D, A])).toBe(doc);
  });

  it("switches to the dub when there is one, and not otherwise", () => {
    expect(setSound(doc, "p1", "dubbed", [D, A]).pieces[0].sound).toBe("dubbed");
    expect(setSound(doc, "p2", "dubbed", [D, A])).toBe(doc);
  });

  it("returns the same doc for a no-op", () => {
    expect(setPicture(doc, "p1", "original", [D, A])).toBe(doc);
  });
});

describe("addSourceAgain", () => {
  it("appends a fresh full-length piece", () => {
    const out = addSourceAgain(doc, "a", [D, A], "p3");
    expect(out.pieces.at(-1)).toMatchObject({ id: "p3", sourceNodeId: "a", in: 0, picture: "original", sound: "original" });
    expect(out.pieces.at(-1)!.out).toBeCloseTo(121 / 24, 9);
  });

  it("does nothing for a source it can't read", () => {
    expect(addSourceAgain(doc, "x", [source("x", { facts: null })], "p3")).toBe(doc);
  });
});

describe("duplicatePiece", () => {
  const doc: EditDoc = {
    v: 2, captionStyle: DEFAULT_CAPTION_STYLE, shape: "9:16", sources: [], captions: [],
    pieces: [
      { id: "a", sourceNodeId: "s", in: 1, out: 3, picture: "original", sound: "dubbed" },
      { id: "b", sourceNodeId: "t", in: 0, out: 2, picture: "original", sound: "original" },
    ],
  };
  it("puts a copy right after the piece, with its trims and choices", () => {
    expect(duplicatePiece(doc, "a", "a2").pieces.map((p) => p.id)).toEqual(["a", "a2", "b"]);
    expect(duplicatePiece(doc, "a", "a2").pieces[1]).toEqual({ ...doc.pieces[0], id: "a2" });
  });
  it("returns the same doc for a piece that isn't there", () => {
    expect(duplicatePiece(doc, "zz", "x")).toBe(doc);
  });
});
