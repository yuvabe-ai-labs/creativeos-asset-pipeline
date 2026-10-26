import { describe, expect, it } from "vitest";
import { outputSize, renderArgs, renderSeconds } from "../render-plan";
import { planSequence, type SequencePlan } from "../sequence-plan";
import { DEFAULT_CAPTION_STYLE } from "../caption-style";
import type { Piece } from "../types";
import { source, videoFacts } from "./fixtures";

const piece = (id: string, src: string, inF: number, outF: number, o: Partial<Piece> = {}): Piece => ({ id, sourceNodeId: src, in: inF / 24, out: outF / 24, picture: "original", sound: "original", ...o });
const tall = source("a", { handle: "VID-AAAA", facts: videoFacts({ width: 1080, height: 1920 }) });
const wide = source("w", { handle: "VID-WIDE", facts: videoFacts({ width: 1920, height: 1080 }) });
const silent = source("s", { handle: "VID-MUTE", facts: { ...videoFacts({ width: 1080, height: 1920 }), audio: null } });
const dubbed = source("d", { kind: "dubbing", handle: "DUB-DDDD", facts: videoFacts({ width: 1080, height: 1920 }) });
const plan = (pieces: Piece[], sources = [tall, wide, silent, dubbed]): SequencePlan => {
  const r = planSequence({ v: 2, captionStyle: DEFAULT_CAPTION_STYLE, shape: "9:16", sources: [], pieces, captions: [] }, sources);
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};
const graphOf = (args: string[]) => args[args.indexOf("-filter_complex") + 1];
const inputsFor = (p: SequencePlan) => new Map(p.media.map((m) => [m.id, `m${m.id}.mp4`]));

describe("outputSize", () => {
  it("is the reel's frame for Full and 720 on the short edge for Quick", () => {
    const p = plan([piece("1", "a", 0, 24)]);
    expect(outputSize(p, "full")).toEqual({ width: 1080, height: 1920 });
    expect(outputSize(p, "quick")).toEqual({ width: 720, height: 1280 });
  });
});

describe("renderArgs", () => {
  const base = (p: SequencePlan, o: Partial<Parameters<typeof renderArgs>[1]> = {}) =>
    renderArgs(p, { quality: "full", inputs: inputsFor(p), output: "out.mp4", ass: null, fontsDir: null, ...o });

  it("trims each clip by frames, fits it into the frame, and joins them", () => {
    const p = plan([piece("1", "a", 10, 100), piece("2", "w", 0, 48)]);
    const g = graphOf(base(p));
    expect(g).toContain("fps=24,trim=start_frame=10:end_frame=100,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop=-1,trim=end_frame=90,scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black");
    expect(g).toContain("trim=start_frame=0:end_frame=48");
    expect(g).toContain("concat=n=2:v=1:a=1[vc][ac]");
    expect(renderSeconds(p)).toBeCloseTo((90 + 48) / 24, 6);
  });

  it("plays each clip's sound, silence for a clip without, and the dub when chosen", () => {
    const p = plan([piece("1", "a", 0, 24), piece("2", "s", 0, 24), piece("3", "d", 0, 24, { sound: "dubbed" })]);
    const g = graphOf(base(p));
    expect(g).toMatch(/\[0:a\]atrim=start=0:duration=1,asetpts=PTS-STARTPTS/);
    expect(g).toContain("anullsrc=r=48000:cl=stereo,atrim=duration=1[a1]");
    const dubInput = [...p.media].findIndex((m) => m.role === "dub-audio");
    expect(g).toContain(`[${dubInput}:a]atrim=start=0:duration=1`);
  });

  it("burns captions only when asked, from the working dir", () => {
    const p = plan([piece("1", "a", 0, 24)]);
    expect(graphOf(base(p))).not.toContain("ass=");
    const withCaps = base(p, { ass: "captions.ass", fontsDir: "fonts" });
    expect(graphOf(withCaps)).toContain("[vc]ass=filename=captions.ass:fontsdir=fonts[vout]");
    expect(withCaps).toContain("[vout]");
  });

  it("encodes H.264 + AAC for streaming, smaller for Quick", () => {
    const p = plan([piece("1", "a", 0, 24)]);
    const full = base(p);
    expect(full.join(" ")).toContain("-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p");
    expect(full.join(" ")).toContain("-c:a aac -b:a 192k -movflags +faststart -progress pipe:1");
    expect(full[full.length - 1]).toBe("out.mp4");
    const quick = base(p, { quality: "quick" });
    expect(quick.join(" ")).toContain("-crf 23");
    expect(graphOf(quick)).toContain("scale=720:1280");
  });

  it("refuses an empty reel", () => {
    const p = { ...plan([piece("1", "a", 0, 24)]), clips: [] };
    expect(() => base(p)).toThrow("Nothing to render: the plan has no clips");
  });

  it("uses an exact NTSC rate", () => {
    const ntsc = source("n", { handle: "VID-NTSC", facts: videoFacts({ width: 1080, height: 1920, fps: 30000 / 1001 }) });
    const p = plan([{ id: "1", sourceNodeId: "n", in: 0, out: 1, picture: "original", sound: "original" }], [ntsc]);
    expect(graphOf(base(p))).toContain("fps=30000/1001");
  });
});
