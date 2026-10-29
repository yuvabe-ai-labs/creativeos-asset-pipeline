import { describe, expect, it } from "vitest";
import { resolvePieceMedia } from "../playback";
import type { Piece } from "../types";
import { source } from "./fixtures";

const D = source("d", { kind: "dubbing" });
const piece = (o: Partial<Piece>): Piece => ({ id: "p", sourceNodeId: "d", in: 0, out: 2, picture: "original", sound: "original", ...o });
const ORIGINAL = "https://storage.googleapis.com/b/d.mp4";
const LIP = "https://storage.googleapis.com/b/d-lip.mp4";
const DUB = "https://storage.googleapis.com/b/d-dub.wav";

describe("resolvePieceMedia: the preview plays what will be exported", () => {
  it("plays the original with its own sound", () => {
    expect(resolvePieceMedia(piece({}), D)).toEqual({ pictureUrl: ORIGINAL, pictureFps: 24, soundUrl: null, muteVideo: false });
  });
  it("shows the lip-synced picture over the original sound", () => {
    expect(resolvePieceMedia(piece({ picture: "lipSynced" }), D)).toEqual({ pictureUrl: LIP, pictureFps: 24, soundUrl: ORIGINAL, muteVideo: true });
  });
  it("plays the dub under the original picture", () => {
    expect(resolvePieceMedia(piece({ sound: "dubbed" }), D)).toEqual({ pictureUrl: ORIGINAL, pictureFps: 24, soundUrl: DUB, muteVideo: true });
  });
  it("plays the dub under the lip-synced picture", () => {
    expect(resolvePieceMedia(piece({ picture: "lipSynced", sound: "dubbed" }), D)).toEqual({ pictureUrl: LIP, pictureFps: 24, soundUrl: DUB, muteVideo: true });
  });
});
