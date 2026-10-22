import { describe, expect, it } from "vitest";
import { planTranscription } from "../transcribe-plan";
import type { Piece } from "../types";
import { emptyDoc, source } from "./fixtures";

const piece = (id: string, src: string, sound: Piece["sound"] = "original"): Piece => ({ id, sourceNodeId: src, in: 0, out: 5, picture: "original", sound });

describe("planTranscription", () => {
  const a = source("a");
  const d = source("d", { kind: "dubbing" });
  const mute = source("m", { facts: { durationSeconds: 5, video: { fps: 24, frames: 120, width: 720, height: 1280 }, audio: null } });

  it("takes each piece's playing sound once: the dub when Dubbed, else the take", () => {
    const doc = emptyDoc({ pieces: [piece("1", "a"), piece("2", "a"), piece("3", "d", "dubbed")] });
    const r = planTranscription(doc, [a, d]);
    expect(r.files.map((f) => f.url)).toEqual([a.files.original.url, d.files.dubAudio!.url]);
    expect(r.files[0].seconds).toBeCloseTo(121 / 24, 9);
    expect(r.files[1].seconds).toBe(5);
  });

  it("only the requested pieces, and refuses a file with no sound", () => {
    const doc = emptyDoc({ pieces: [piece("1", "a"), piece("2", "m")] });
    const r = planTranscription(doc, [a, mute], ["2"]);
    expect(r.files).toEqual([]);
    expect(r.noSound).toEqual(["2"]);
  });

  it("skips a piece whose source is missing", () => {
    expect(planTranscription(emptyDoc({ pieces: [piece("1", "gone")] }), [a]).files).toEqual([]);
  });
});
