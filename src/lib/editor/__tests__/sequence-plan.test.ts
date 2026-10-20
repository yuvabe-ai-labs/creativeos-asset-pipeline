import { describe, expect, it } from "vitest";
import { planSequence, type SequencePlan } from "../sequence-plan";
import type { Caption, EditDoc, Piece } from "../types";
import { audioFacts, file, source, videoFacts } from "./fixtures";

const A = source("a", { handle: "VID-AAAA" });
const B = source("b", { handle: "VID-BBBB" });
const D = source("d", { kind: "dubbing", handle: "DUB-DDDD" });

const piece = (id: string, src: string, inF: number, outF: number, o: Partial<Piece> = {}): Piece => ({
  id, sourceNodeId: src, in: inF / 24, out: outF / 24, picture: "original", sound: "original", ...o,
});
const doc = (pieces: Piece[], captions: Caption[] = [], shape: EditDoc["shape"] = "9:16"): EditDoc => ({ v: 1, shape, sources: [], pieces, captions });
const ok = (r: ReturnType<typeof planSequence>): SequencePlan => {
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};

describe("planSequence", () => {
  const three = doc([piece("p1", "a", 0, 121), piece("p2", "b", 10, 100), piece("p3", "a", 50, 80)]);

  it("places pieces end to end at the source rate", () => {
    const plan = ok(planSequence(three, [A, B]));
    expect(plan).toMatchObject({ name: "CreativeOS Rough Cut", fps: 24, width: 720, height: 1280, sampleRate: 32000 });
    expect(plan.clips[1]).toMatchObject({ start: 121, end: 211, picture: { in: 10 } });
    expect(plan.clips[2]).toMatchObject({ start: 211, end: 241, picture: { in: 50 } });
  });

  it("names media in first-use order", () => {
    expect(ok(planSequence(three, [A, B])).media.map((m) => m.fileName)).toEqual(["001_VID-AAAA_take.mp4", "002_VID-BBBB_take.mp4"]);
  });

  it("takes lip-synced picture with original sound", () => {
    const plan = ok(planSequence(doc([piece("p", "d", 0, 121, { picture: "lipSynced" })]), [D]));
    const pic = plan.media.find((m) => m.id === plan.clips[0].picture.media)!;
    const snd = plan.media.find((m) => m.id === plan.clips[0].sound!.media)!;
    expect(pic.role).toBe("lip-synced");
    expect(snd.role).toBe("take");
    expect(plan.clips[0].dub).toBeNull();
  });

  it("puts a chosen dub on the plan, clamped to the dub's length", () => {
    const plan = ok(planSequence(doc([piece("p", "d", 0, 121, { sound: "dubbed" })]), [D]));
    const dub = plan.clips[0].dub!;
    expect(plan.media.find((m) => m.id === dub.media)?.fileName).toBe("002_DUB-DDDD_dub-audio.wav");
    expect(dub).toMatchObject({ in: 0, out: 120, channels: 2 });
    expect(plan.clips[0].sound).not.toBeNull();
  });

  it("clamps a piece to a shorter lip-synced picture", () => {
    const short = source("d", { kind: "dubbing", lipSynced: file("https://storage.googleapis.com/b/d-lip.mp4", videoFacts({ fps: 25, frames: Math.round(4.9 * 25) })) });
    // A 24 fps reel: the 4.92 s lip-synced file ends at sequence frame 118, not the piece's 121.
    const plan24 = ok(planSequence(doc([piece("p0", "a", 0, 24), piece("p", "d", 0, 121, { picture: "lipSynced" })]), [A, short]));
    expect(plan24.fps).toBe(24);
    expect(plan24.clips[1].end - plan24.clips[1].start).toBe(118);
    // Leading the reel, the lip-synced file sets the rate (25 fps) and still ends at its last frame.
    const plan25 = ok(planSequence(doc([piece("p", "d", 0, 121, { picture: "lipSynced" })]), [short]));
    expect(plan25.fps).toBe(25);
    expect(plan25.clips[0].end - plan25.clips[0].start).toBe(123);
  });

  it("scales a 16:9 clip to fit a 9:16 reel", () => {
    const wide = source("w", { facts: videoFacts({ width: 1280, height: 720 }) });
    const plan = ok(planSequence(doc([piece("p1", "a", 0, 24), piece("p2", "w", 0, 24)]), [A, wide]));
    expect(plan.clips[0].scale).toBeNull();
    expect(plan.clips[1].scale).toBe(56.25);
  });

  it("uses a standard frame when the first clip is the other shape", () => {
    const plan = ok(planSequence(doc([piece("p1", "a", 0, 24)], [], "16:9"), [A]));
    expect(plan).toMatchObject({ width: 1920, height: 1080 });
    expect(plan.clips[0].scale).toBe(84.38);
  });

  it("turns captions into titles", () => {
    const cap = (id: string, at: number): Caption => ({ id, pieceId: "p1", at, duration: 2, text: id, x: 0.5, y: 0.82, font: "montserrat", size: 84, color: "#ffffff" });
    const plan = ok(planSequence(doc([piece("p1", "a", 0, 121)], [cap("in", 1), cap("past", 99)]), [A]));
    expect(plan.titles).toHaveLength(1);
    expect(plan.titles[0]).toMatchObject({ start: 24, end: 72, sizePx: 56, fontPostScript: "Montserrat-ExtraBold", fontKey: "montserrat", text: "in" });
    const clipped = ok(planSequence(doc([piece("p1", "a", 0, 24)], [cap("late", 0.999)]), [A]));
    expect(clipped.titles).toEqual([]);
  });

  it("refuses when a used file can't be read", () => {
    const blind = source("d", { kind: "dubbing", handle: "DUB-DDDD", lipSynced: file("https://storage.googleapis.com/b/x.mp4", null) });
    expect(planSequence(doc([piece("p", "d", 0, 24, { picture: "lipSynced" })]), [blind])).toEqual({
      ok: false,
      reason: "Couldn't read DUB-DDDD's lip-synced video, so the reel can't be exported. Reopen the editor to try again.",
    });
    const noDub = source("d", { kind: "dubbing", handle: "DUB-DDDD", dubAudio: file("https://storage.googleapis.com/b/y.wav", null) });
    expect(planSequence(doc([piece("p", "d", 0, 24, { sound: "dubbed" })]), [noDub])).toMatchObject({ ok: false, reason: expect.stringContaining("DUB-DDDD's dub,") });
  });

  it("refuses an empty reel", () => {
    expect(planSequence(doc([]), [A])).toEqual({ ok: false, reason: "Add a clip to the timeline first." });
  });

  it("falls back to 48 kHz when nothing has sound", () => {
    const silent = source("s", { facts: { ...videoFacts(), audio: null } });
    const plan = ok(planSequence(doc([piece("p", "s", 0, 24)]), [silent]));
    expect(plan.sampleRate).toBe(48000);
    expect(plan.clips[0].sound).toBeNull();
    expect(audioFacts(1).video).toBeNull();
  });

  it("never rounds a file's end up past its last frame", () => {
    // 126 frames at 25 fps = 5.04 s = 120.96 frames at 24: the piece ends at 120, not 121.
    const lip = source("d", { kind: "dubbing", lipSynced: file("https://storage.googleapis.com/b/d-lip.mp4", videoFacts({ fps: 25, frames: 126 })) });
    const plan = ok(planSequence(doc([piece("p0", "a", 0, 24), piece("p", "d", 0, 121, { picture: "lipSynced" })]), [A, lip]));
    expect(plan.clips[1].end - plan.clips[1].start).toBe(120);
    // A 5.02 s dub is 120.48 frames: it ends at 120.
    const dub = source("d", { kind: "dubbing", dubAudio: file("https://storage.googleapis.com/b/d.wav", audioFacts(5.02)) });
    expect(ok(planSequence(doc([piece("p", "d", 0, 121, { sound: "dubbed" })]), [dub])).clips[0].dub?.out).toBe(120);
  });

  it("refuses rather than silently dropping a piece whose clip has no take", () => {
    expect(planSequence(doc([piece("p1", "a", 0, 24), piece("p2", "gone", 0, 24)]), [A])).toEqual({
      ok: false,
      reason: "A clip in the reel has no finished take now, so the reel can't be exported. Remove its pieces or give it a take on the canvas.",
    });
  });
});
