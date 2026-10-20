import { describe, expect, it } from "vitest";
import { buildOtio } from "../otio";
import { planSequence, type SequencePlan } from "../sequence-plan";
import type { Piece } from "../types";
import { source, videoFacts } from "./fixtures";

const piece = (id: string, src: string, inF: number, outF: number, o: Partial<Piece> = {}): Piece => ({
  id, sourceNodeId: src, in: inF / 24, out: outF / 24, picture: "original", sound: "original", ...o,
});
type Track = { name: string; kind: string; children: Array<{ OTIO_SCHEMA: string; source_range: { duration: { value: number } }; media_references?: { DEFAULT_MEDIA: { target_url: string } } }> };

describe("buildOtio", () => {
  const A = source("a", { handle: "VID-AAAA" });
  const S = source("s", { handle: "VID-SILENT", facts: { ...videoFacts(), audio: null } });
  const D = source("d", { kind: "dubbing", handle: "DUB-DDDD" });
  const r = planSequence({ v: 1, shape: "9:16", sources: [], captions: [], pieces: [
    piece("1", "a", 0, 48), piece("2", "s", 0, 24), piece("3", "d", 0, 72, { sound: "dubbed" }),
  ] }, [A, S, D]);
  const plan = (r as { plan: SequencePlan }).plan;
  const json = JSON.parse(buildOtio(plan));
  const tracks: Track[] = json.tracks.children;
  const total = (t: Track) => t.children.reduce((s, c) => s + c.source_range.duration.value, 0);

  it("writes a timeline with V1, A1 and a Dub track", () => {
    expect(json.OTIO_SCHEMA).toBe("Timeline.1");
    expect(tracks.map((t) => [t.name, t.kind])).toEqual([["V1", "Video"], ["A1", "Audio"], ["Dub", "Audio"]]);
    expect(tracks[0].children.every((c) => c.OTIO_SCHEMA === "Clip.2")).toBe(true);
    expect(tracks[0].children[0].media_references?.DEFAULT_MEDIA.target_url).toBe("media/001_VID-AAAA_take.mp4");
  });

  it("keeps the sound tracks in sync with gaps", () => {
    expect(total(tracks[1])).toBe(total(tracks[0]));
    expect(tracks[1].children.map((c) => c.OTIO_SCHEMA)).toEqual(["Clip.2", "Gap.1", "Clip.2"]);
    expect(tracks[2].children.map((c) => c.OTIO_SCHEMA)).toEqual(["Gap.1", "Gap.1", "Clip.2"]);
  });
});
