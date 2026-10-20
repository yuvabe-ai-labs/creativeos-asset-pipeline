import { describe, expect, it } from "vitest";
import type { Piece } from "../types";
import { formatTime, locate, movePiece, pieceOffsets, setTrim, splitPiece, totalSeconds } from "../timeline";

const piece = (id: string, inS: number, outS: number): Piece => ({
  id, sourceNodeId: `src-${id}`, in: inS, out: outS, picture: "original", sound: "original",
});
const ps: Piece[] = [piece("A", 0, 121 / 24), piece("B", 0.4, 3.75), piece("C", 1, 2)];
const lim = { duration: 121 / 24, fps: 24 };

describe("timeline maths in seconds", () => {
  it("sums lengths and offsets", () => {
    expect(totalSeconds(ps)).toBeCloseTo(121 / 24 + 3.35 + 1, 9);
    expect(pieceOffsets(ps)[2]).toBeCloseTo(121 / 24 + 3.35, 9);
  });

  it("locates half-open, last piece inclusive", () => {
    expect(locate(ps, 0)?.index).toBe(0);
    expect(locate(ps, 121 / 24)?.index).toBe(1);
    expect(locate(ps, totalSeconds(ps))?.index).toBe(2);
    expect(locate(ps, -1)).toBeNull();
    expect(locate(ps, totalSeconds(ps) + 1)).toBeNull();
  });

  it("snaps trims to the picture's frames, clamps, keeps one frame", () => {
    expect(setTrim(ps, "B", "in", 0.43, lim)[1].in).toBeCloseTo(10 / 24, 9);
    expect(setTrim(ps, "B", "out", 9, lim)[1].out).toBeCloseTo(121 / 24, 9);
    expect(setTrim(ps, "C", "in", 5, lim)[2].in).toBeCloseTo(2 - 1 / 24, 9);
    expect(setTrim(ps, "C", "out", -3, lim)[2].out).toBeCloseTo(1 + 1 / 24, 9);
  });

  it("returns the same array for a no-op", () => {
    expect(setTrim(ps, "C", "in", 1, lim)).toBe(ps);
    expect(setTrim(ps, "missing", "in", 1, lim)).toBe(ps);
    expect(movePiece(ps, 1, 1)).toBe(ps);
    expect(movePiece(ps, 5, 0)).toBe(ps);
  });

  it("splits strictly inside, copying choices", () => {
    const withChoice = ps.map((p) => (p.id === "A" ? { ...p, picture: "lipSynced" as const } : p));
    const out = splitPiece(withChoice, "A", 2.01, "A2", 24)!;
    expect(out.map((p) => p.id)).toEqual(["A", "A2", "B", "C"]);
    expect(out[0].out).toBeCloseTo(2, 9);
    expect(out[1].in).toBeCloseTo(2, 9);
    expect(out[1].out).toBeCloseTo(121 / 24, 9);
    expect(out[1].picture).toBe("lipSynced");
    expect(splitPiece(ps, "A", 0, "x", 24)).toBeNull();
    expect(splitPiece(ps, "A", 121 / 24, "x", 24)).toBeNull();
  });

  it("moves a piece", () => {
    expect(movePiece(ps, 2, 0).map((p) => p.id)).toEqual(["C", "A", "B"]);
  });

  it("formats time", () => {
    expect(formatTime(65.5)).toBe("01:05.50");
    expect(formatTime(0)).toBe("00:00.00");
  });
});
