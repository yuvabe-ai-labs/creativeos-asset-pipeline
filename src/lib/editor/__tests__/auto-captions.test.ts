import { describe, expect, it } from "vitest";
import { transcribeCredits } from "@/lib/transcribe/cost";
import { autoCaptionCost, fillFromTranscripts, staleAutoPieces, unsureWordIndexes } from "../auto-captions";
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

describe("unsureWordIndexes", () => {
  it("marks words the transcript was unsure of, matched by time", () => {
    const c = cap("c", "1", 0.5, 1, { text: "hello there.", words: [{ text: "hello", at: 0.5, duration: 0.4 }, { text: "there.", at: 1, duration: 0.4 }], from: "u" });
    expect([...unsureWordIndexes(c, transcript("u"))]).toEqual([1]);
    expect(unsureWordIndexes(c, undefined).size).toBe(0);
  });
});
