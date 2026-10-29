// Checks on the Premiere XML, ported from the spike's tests (verified in the user's Windows
// Premiere 2026-10-20), using the real sample clips' facts: 24 fps, 121 frames, 720×1280,
// stereo AAC 32 kHz.
import { describe, expect, it } from "vitest";
import { buildPremiereXml, mediaUrl, rateParts } from "../premiere-xml";
import { planSequence, type SequencePlan } from "../sequence-plan";
import type { Caption, EditDoc, Piece } from "../types";
import { audioFacts, file, source, videoFacts } from "./fixtures";
import { DEFAULT_CAPTION_STYLE } from "../caption-style";

const piece = (id: string, src: string, inF: number, outF: number, o: Partial<Piece> = {}): Piece => ({
  id, sourceNodeId: src, in: inF / 24, out: outF / 24, picture: "original", sound: "original", ...o,
});
const plan = (pieces: Piece[], sources = [A, B], captions: Caption[] = [], shape: EditDoc["shape"] = "9:16"): SequencePlan => {
  const r = planSequence({ v: 2, captionStyle: DEFAULT_CAPTION_STYLE, shape, sources: [], pieces, captions }, sources);
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};

const A = source("a", { handle: "VID-AAAA" });
const B = source("b", { handle: "VID-BBBB" });
const three = [piece("1", "a", 0, 121), piece("2", "b", 10, 100), piece("3", "a", 50, 80)];

describe("buildPremiereXml", () => {
  const xml = buildPremiereXml(plan(three));

  it("places clips end to end in sequence frames at the source rate", () => {
    expect(xml).toContain("<timebase>24</timebase>");
    expect(xml).not.toContain("<timebase>25</timebase>");
    expect(xml).toMatch(/<duration>241<\/duration>/); // 121 + 90 + 30
    expect(xml).toMatch(/<start>121<\/start>\s*<end>211<\/end>\s*<in>10<\/in>\s*<out>100<\/out>/);
    expect(xml).toContain("<name>CreativeOS Rough Cut</name>");
  });

  it("writes one video + two audio clipitems per clip, all linked, with unique ids", () => {
    const ids = [...xml.matchAll(/<clipitem id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
    expect(xml).not.toMatch(/<clipitem id="[^"]+"\/>/); // no OTIO-style empty stubs
    expect(xml.match(/<link>/g)).toHaveLength(9 * 3);
  });

  it("writes each file in full once, then references it by id, at a relative path", () => {
    expect(xml.match(/<file id="file-1">/g)).toHaveLength(1);
    expect(xml.match(/<file id="file-1"\/>/g)!.length).toBeGreaterThan(0);
    expect(xml).toContain("<pathurl>media/001_VID-AAAA_take.mp4</pathurl>");
    expect(mediaUrl("001_a b.mp4")).toBe("media/001_a%20b.mp4");
  });

  it("handles NTSC rates", () => {
    expect(rateParts(23.976)).toEqual({ timebase: 24, ntsc: true });
    expect(rateParts(25)).toEqual({ timebase: 25, ntsc: false });
  });

  it("puts captions on V2 as Graphic titles, clipped to the cut", () => {
    const cap = (id: string, pieceId: string, at: number, extra: Partial<Caption> = {}): Caption => ({
      id, pieceId, at, duration: 2, text: id, ...extra,
    });
    const withTitles = buildPremiereXml(plan(three, [A, B], [cap("Hi", "1", 1), cap("past", "3", 99)]));
    expect(withTitles.match(/<mediaSource>GraphicAndType<\/mediaSource>/g)).toHaveLength(1);
    expect(withTitles).toMatch(/<clipitem id="clipitem-t1">[\s\S]*?<start>24<\/start>\s*<end>72<\/end>/);
    // the reel's caption position (D396)
    expect(withTitles).toContain("-91445760000000000,0.5:0.72,0,0,0,0,0,0,5,4,0,0,0,0");
    expect(withTitles.match(/<track>/g)).toHaveLength(2 + 2); // V1, V2, A1, A2
  });

  it("puts a dub on its own audio tracks and switches the original sound off", () => {
    const dubbedA = source("a", { handle: "VID-AAAA", dubAudio: file("https://storage.googleapis.com/b/a hi.wav", audioFacts(5)) });
    const p = plan([piece("1", "a", 0, 121, { sound: "dubbed" }), piece("2", "b", 10, 100), piece("3", "a", 50, 80)], [dubbedA, B]);
    expect(p.media.map((m) => m.fileName)).toEqual(["001_VID-AAAA_take.mp4", "002_VID-AAAA_dub-audio.wav", "003_VID-BBBB_take.mp4"]);
    const x = buildPremiereXml(p);
    expect(x.match(/<track>/g)).toHaveLength(1 + 4); // V1, A1 A2 (orig), A3 A4 (dub)
    expect(x).toMatch(/<clipitem id="clipitem-d1-1">[\s\S]*?<duration>120<\/duration>[\s\S]*?<out>120<\/out>/); // 5.0 s dub clamps 121 → 120
    expect(x).toMatch(/<clipitem id="clipitem-a1-1">\s*<masterclipid>masterclip-1<\/masterclipid>\s*<name>[^<]+<\/name>\s*<enabled>FALSE/);
    expect(x).toMatch(/<clipitem id="clipitem-a1-2">\s*<masterclipid>masterclip-3<\/masterclipid>\s*<name>[^<]+<\/name>\s*<enabled>TRUE/);
    expect(x.match(/<file id="file-2">/g)).toHaveLength(1);
  });

  it("takes picture and sound from different files", () => {
    const D = source("d", { kind: "dubbing", handle: "DUB-DDDD" });
    const x = buildPremiereXml(plan([piece("1", "d", 0, 121, { picture: "lipSynced" })], [D]));
    const block = (id: string) => x.match(new RegExp(`<clipitem id="${id}">[\\s\\S]*?</clipitem>`))![0];
    expect(block("clipitem-v1")).toContain("<masterclipid>masterclip-1</masterclipid>"); // lip-synced picture
    expect(block("clipitem-v1")).toContain("<pathurl>media/001_DUB-DDDD_lip-synced.mp4</pathurl>");
    expect(block("clipitem-a1-1")).toContain("<masterclipid>masterclip-2</masterclipid>"); // original sound
    expect(block("clipitem-a1-1")).toContain("<pathurl>media/002_DUB-DDDD_take.mp4</pathurl>");
    expect(block("clipitem-a1-1").match(/<link>/g)).toHaveLength(5); // picture, A1/A2, and the dub (off) on A3/A4
  });

  it("scales only the clip that needs it", () => {
    const wide = source("w", { handle: "VID-WIDE", facts: videoFacts({ width: 1280, height: 720 }) });
    const x = buildPremiereXml(plan([piece("1", "a", 0, 24), piece("2", "w", 0, 24)], [A, wide]));
    expect(x.match(/<effectid>basic<\/effectid>/g)).toHaveLength(1);
    expect(x).toContain("<value>56.25</value>");
  });

  describe("the choice not made stays in the sequence, switched off (D409)", () => {
    const D = source("d", { kind: "dubbing", handle: "DUB-DDDD", language: "hi-IN" });
    const block = (x: string, id: string) => x.match(new RegExp(`<clipitem id="${id}">[\\s\\S]*?</clipitem>`))![0];

    it("keeps a dub the clip doesn't play on A3/A4, off, with the original on", () => {
      const x = buildPremiereXml(plan([piece("1", "d", 0, 120)], [D]));
      expect(block(x, "clipitem-d1-1")).toMatch(/<enabled>FALSE<\/enabled>/);
      expect(block(x, "clipitem-a1-1")).toMatch(/<enabled>TRUE<\/enabled>/);
    });

    it("puts the picture not chosen on its own track above the captions, off", () => {
      const x = buildPremiereXml(plan([piece("1", "d", 0, 120, { picture: "lipSynced", sound: "dubbed" })], [D]));
      const alt = block(x, "clipitem-alt1");
      // the original take, already written in full for the sound, referenced by id
      expect(alt).toMatch(/<masterclipid>masterclip-2<\/masterclipid>[\s\S]*<file id="file-2"\/>/);
      expect(alt).toMatch(/<enabled>FALSE<\/enabled>/);
      // its own track after V1 (and after any caption tracks), before the audio tracks
      expect(x.indexOf('<clipitem id="clipitem-alt1">')).toBeGreaterThan(x.indexOf('<clipitem id="clipitem-v1">'));
      expect(x.indexOf('<clipitem id="clipitem-alt1">')).toBeLessThan(x.indexOf('<clipitem id="clipitem-a1-1">'));
    });

    it("marks each dubbed or lip-synced clip, and each pause, on the sequence", () => {
      const p = planSequence(
        { v: 2, captionStyle: DEFAULT_CAPTION_STYLE, shape: "9:16", sources: [], captions: [], pieces: [piece("1", "d", 0, 120, { picture: "lipSynced", sound: "dubbed" })] },
        [D],
        { pauses: new Map([[D.files.dubAudio!.url, [[2, 2.8]] as Array<[number, number]>]]) },
      );
      if (!p.ok) throw new Error(p.reason);
      expect(p.plan.markers).toEqual([
        { start: 0, end: null, name: "1. DUB-DDDD: dubbed (Hindi), lip-synced" },
        { start: 48, end: 67, name: "Pause 0.8 s" },
      ]);
      const x = buildPremiereXml(p.plan);
      expect(x).toMatch(/<marker>\s*<name>Pause 0.8 s<\/name>[\s\S]*?<in>48<\/in>\s*<out>67<\/out>/);
    });
  });

  it("dumps the XML for eyeballing", async () => {
    const out = process.env.EDITOR_XML_OUT;
    if (out) (await import("node:fs")).writeFileSync(out, xml);
  });

  it("puts overlapping captions on their own title tracks", () => {
    const cap = (id: string, at: number): Caption => ({ id, pieceId: "1", at, duration: 2, text: id });
    const p = plan(three, [A, B], [cap("a", 0), cap("b", 1), cap("c", 2.5)]);
    expect(p.titles.map((t) => t.track)).toEqual([0, 1, 0]);
    const x = buildPremiereXml(p);
    expect(x.match(/<mediaSource>GraphicAndType<\/mediaSource>/g)).toHaveLength(3);
    expect(x.match(/<track>/g)).toHaveLength(1 + 2 + 2); // V1, V2, V3, A1, A2
  });
});
