import { describe, expect, it } from "vitest";
import { transcribeCredits } from "@/lib/transcribe/cost";
import { autoCaptionCost, captionsFollowSound, fillFromTranscripts, staleAutoPieces, uncaptionedPieces, unsureWordIndexes } from "../auto-captions";
import { setSound } from "../pieces";
import type { Piece } from "../types";
import { cap, emptyDoc, source } from "./fixtures";

const a = source("a");
const b = source("b");
const piece = (id: string, src: string): Piece => ({ id, sourceNodeId: src, in: 0, out: 5, picture: "original", sound: "original" });
const doc = emptyDoc({ pieces: [piece("1", "a"), piece("2", "b"), piece("3", "a")] });
const transcript = (url: string, words = [{ t: "hello", s: 0.5, e: 0.9, p: 1 }, { t: "there.", s: 1, e: 1.4, p: 0.6 }]) => ({ url, language: "eng", words, engine: "e", model: "m", durationSeconds: 5 });

describe("autoCaptionCost", () => {
  it("prices each new file once and is free when all are transcribed", () => {
    expect(autoCaptionCost(doc, [a, b], new Set())).toEqual({ credits: transcribeCredits(2 * (121 / 24)), free: false });
    expect(autoCaptionCost(doc, [a, b], new Set([a.files.original.url, b.files.original.url]))).toEqual({ credits: 0, free: true });
    expect(autoCaptionCost(doc, [a, b], new Set([a.files.original.url]), ["1", "3"])).toEqual({ credits: 0, free: true });
  });
});

describe("fillFromTranscripts", () => {
  it("fills each requested piece that has a transcript", () => {
    let n = 0;
    const transcripts = new Map([[a.files.original.url, transcript(a.files.original.url)]]);
    const r = fillFromTranscripts(doc, [a, b], ["1", "2", "3"], transcripts, () => `n${++n}`);
    expect(r.filled).toEqual(["1", "3"]);
    expect(r.doc.captions.map((c) => c.pieceId)).toEqual(["1", "3"]);
    expect(r.added).toHaveLength(2);
    expect(r.doc.captions[0]).toMatchObject({ text: "hello there.", from: a.files.original.url, auto: true });
  });
});

describe("staleAutoPieces", () => {
  it("lists pieces whose auto captions came from another file", () => {
    const d = { ...doc, captions: [cap("c", "1", 1, 1, { auto: true, from: "https://old" }), cap("k", "2", 1, 1, { auto: true, from: b.files.original.url })] };
    expect(staleAutoPieces(d, [a, b])).toEqual(["1"]);
  });
});

describe("captions follow the sound (D410)", () => {
  const d = source("d", { kind: "dubbing" });
  const dubUrl = d.files.dubAudio!.url;
  const origUrl = d.files.original.url;
  const one = emptyDoc({ pieces: [{ ...piece("1", "d"), sound: "dubbed" }] });
  const tamil = new Map([[dubUrl, transcript(dubUrl, [{ t: "vanakkam", s: 0.5, e: 0.9, p: 1 }])]]);
  const both = new Map([...tamil, [origUrl, transcript(origUrl)]]);
  let n = 0;
  const id = () => `n${++n}`;

  it("rewrites stale auto captions from the stored transcript of the sound it plays now", () => {
    const dubbed = { ...one, captions: [cap("c", "1", 0.5, 1, { auto: true, from: dubUrl, text: "vanakkam" })] };
    const back = setSound(dubbed, "1", "original", [d]);
    const r = captionsFollowSound(back, [d], "1", both, id);
    expect(r.captions.map((c) => [c.text, c.from])).toEqual([["hello there.", origUrl]]);
  });

  it("leaves them when the new sound was never transcribed, and is a no-op when nothing is stale", () => {
    const dubbed = { ...one, captions: [cap("c", "1", 0.5, 1, { auto: true, from: dubUrl })] };
    const back = setSound(dubbed, "1", "original", [d]);
    expect(captionsFollowSound(back, [d], "1", tamil, id)).toBe(back);
    expect(captionsFollowSound(dubbed, [d], "1", both, id)).toBe(dubbed);
  });

  it("keeps lines the user edited", () => {
    const dubbed = { ...one, captions: [cap("e", "1", 3, 1, { auto: true, edited: true, from: dubUrl, text: "mine" }), cap("c", "1", 0.5, 1, { auto: true, from: dubUrl })] };
    const r = captionsFollowSound(setSound(dubbed, "1", "original", [d]), [d], "1", both, id);
    expect(r.captions.map((c) => c.text)).toEqual(["mine", "hello there."]);
  });
});

describe("uncaptionedPieces", () => {
  it("lists pieces with sound and no captions from what they play now", () => {
    const d2 = { ...doc, captions: [cap("c", "1", 1, 1, { auto: true, from: a.files.original.url }), cap("s", "2", 1, 1, { auto: true, from: "https://old" })] };
    expect(uncaptionedPieces(d2, [a, b], new Map())).toEqual(["2", "3"]);
  });

  it("counts a clip with nothing said in its trim as done", () => {
    const silent = new Map([[a.files.original.url, transcript(a.files.original.url, [{ t: "late", s: 9, e: 9.5, p: 1 }])]]);
    expect(uncaptionedPieces(doc, [a, b], silent)).toEqual(["2"]);
  });
});

describe("unsureWordIndexes", () => {
  it("marks words the transcript was unsure of, matched by time", () => {
    const c = cap("c", "1", 0.5, 1, { text: "hello there.", words: [{ text: "hello", at: 0.5, duration: 0.4 }, { text: "there.", at: 1, duration: 0.4 }], from: "u" });
    expect([...unsureWordIndexes(c, transcript("u"))]).toEqual([1]);
    expect(unsureWordIndexes(c, undefined).size).toBe(0);
  });
});
