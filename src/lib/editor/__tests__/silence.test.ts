import { describe, expect, it } from "vitest";
import { quietSections, WINDOW_SECONDS } from "../silence";

/** RMS windows (0.05 s each): loud except the runs given, in seconds. */
function windows(seconds: number, quiet: Array<[number, number]>): Float32Array {
  const out = new Float32Array(Math.round(seconds / WINDOW_SECONDS)).fill(0.2);
  for (const [a, b] of quiet) for (let i = Math.round(a / WINDOW_SECONDS); i < Math.round(b / WINDOW_SECONDS); i++) out[i] = 0.001;
  return out;
}

describe("quietSections", () => {
  it("finds a quiet run long enough to matter", () => {
    expect(quietSections(windows(5, [[1, 1.4]]), 0, 5)).toEqual([[1, 1.4]]);
  });

  it("ignores a short pause", () => {
    expect(quietSections(windows(5, [[1, 1.2]]), 0, 5)).toEqual([]);
  });

  it("keeps to the piece's range", () => {
    expect(quietSections(windows(5, [[0, 0.6], [4, 5]]), 0.2, 4.6)).toEqual([[0.2, 0.6], [4, 4.6]]);
    // Clipped to the piece, a run must still be long enough to matter.
    expect(quietSections(windows(5, [[4.4, 5]]), 0, 4.6)).toEqual([]);
  });
});
