import { describe, expect, it } from "vitest";
import { activeWord, captionWords, groupWords, normalizeWords, replaceAutoCaptions, retextCaption, spreadWords, wordFrames } from "../caption-words";
import type { Piece } from "../types";
import type { TranscriptWord } from "@/lib/transcribe/types";
import { cap, emptyDoc } from "./fixtures";

const w = (t: string, s: number, e: number, p = 1): TranscriptWord => ({ t, s, e, p });
const piece = (id: string, inS: number, outS: number): Piece => ({ id, sourceNodeId: `s-${id}`, in: inS, out: outS, picture: "original", sound: "original" });

// Clip 4 of Reel 2, as the engine returned it.
const clip4 = [w("I", 0.26, 0.26), w("actually", 0.32, 0.6), w("started", 0.7, 1.04), w("paying", 1.08, 1.28), w("more", 1.32, 1.48),
  w("attention", 1.52, 1.96), w("to", 1.98, 2.06), w("what", 2.1, 2.24), w("I", 2.34, 2.42), w("eat", 2.48, 2.66), w("because", 2.76, 3.0),
  w("of", 3.04, 3.14), w("my", 3.16, 3.3), w("blood", 3.32, 3.52), w("sugar,", 3.6, 3.84), w("but", 4.6, 4.7), w("I", 4.78, 4.84)];

describe("normalizeWords", () => {
  it("gives a zero-length word one frame", () => {
    expect(normalizeWords([w("I", 0.26, 0.26)], 24)[0].e).toBeCloseTo(0.26 + 1 / 24, 9);
  });
  it("never runs a word into the next one's start", () => {
    expect(normalizeWords([w("I", 0.26, 0.5), w("a", 0.4, 0.6)], 24)[0].e).toBeCloseTo(0.4, 9);
  });
  it("drops empty words and trims spaces", () => {
    expect(normalizeWords([w(" ", 0, 0.1), w(" hi", 0.1, 0.2)], 24).map((x) => x.t)).toEqual(["hi"]);
  });
});

describe("groupWords", () => {
  it("makes lines of up to 3 words, breaking after punctuation and pauses", () => {
    const lines = groupWords(normalizeWords(clip4, 24)).map((l) => l.map((x) => x.t).join(" "));
    expect(lines).toEqual(["I actually started", "paying more attention", "to what I", "eat because of", "my blood sugar,", "but I"]);
  });
  it("never puts more than 22 characters on a line", () => {
    expect(groupWords([w("extraordinarily", 0, 0.5), w("unbelievable", 0.5, 1)])).toHaveLength(2);
  });
});

describe("spreadWords and captionWords", () => {
  it("spreads words over a span by their length", () => {
    const words = spreadWords("go now", 1, 1);
    expect(words.map((x) => x.text)).toEqual(["go", "now"]);
    expect(words[0]).toMatchObject({ at: 1 });
    expect(words[0].duration).toBeCloseTo(0.4, 9);
    expect(words[1].at).toBeCloseTo(1.4, 9);
  });
  it("spreads a hand-typed caption's text when it has no words", () => {
    expect(captionWords(cap("c", "p", 2, 2, { text: "Order now" })).map((x) => x.text)).toEqual(["Order", "now"]);
  });
});

describe("retextCaption", () => {
  const c = cap("c", "p", 1, 1.3, { text: "make dosa", words: [{ text: "make", at: 1, duration: 0.4 }, { text: "dosa", at: 1.5, duration: 0.5 }], auto: true });
  it("keeps every word's time when the word count is the same", () => {
    const r = retextCaption(c, "Make dosa!")!;
    expect(r.spread).toBe(false);
    expect(r.caption).toMatchObject({ text: "Make dosa!", edited: true });
    expect(r.caption.words).toEqual([{ text: "Make", at: 1, duration: 0.4 }, { text: "dosa!", at: 1.5, duration: 0.5 }]);
  });
  it("spreads the words over the line when the count changes", () => {
    const r = retextCaption(c, "make crispy dosa")!;
    expect(r.spread).toBe(true);
    expect(r.caption.words!.map((x) => x.text)).toEqual(["make", "crispy", "dosa"]);
    expect(r.caption.words![0].at).toBe(1);
  });
  it("returns null for empty text, and the same caption for unchanged text", () => {
    expect(retextCaption(c, "   ")).toBeNull();
    expect(retextCaption(c, "make dosa")!.caption).toBe(c);
  });
});

describe("replaceAutoCaptions", () => {
  const base = emptyDoc({ pieces: [piece("A", 0, 8)] });
  const words = normalizeWords(clip4, 24);
  let n = 0;
  const id = () => `n${++n}`;

  it("writes one auto caption per line, anchored in source seconds, marked with its file", () => {
    const doc = replaceAutoCaptions(base, "A", words, "https://x/a.mp4", id);
    expect(doc.captions).toHaveLength(6);
    expect(doc.captions[0]).toMatchObject({ pieceId: "A", at: 0.26, text: "I actually started", auto: true, from: "https://x/a.mp4" });
    expect(doc.captions[0].words).toHaveLength(3);
    // a line holds 0.3 s past its last word, cut short by the next line
    expect(doc.captions[0].at + doc.captions[0].duration).toBeCloseTo(1.08, 9);
  });

  it("keeps lines the user edited or added, and skips the words they cover", () => {
    const first = replaceAutoCaptions(base, "A", words, "https://x/a.mp4", id);
    const edited = { ...first, captions: first.captions.map((c, i) => (i === 0 ? { ...c, text: "I really started", edited: true as const } : c)) };
    const again = replaceAutoCaptions(edited, "A", words, "https://x/a.mp4", id);
    expect(again.captions.filter((c) => c.edited)).toHaveLength(1);
    expect(again.captions.map((c) => c.text)).not.toContain("I actually started");
    expect(again.captions).toHaveLength(6);
  });

  it("only uses words inside the piece's trim", () => {
    const doc = replaceAutoCaptions(emptyDoc({ pieces: [piece("A", 2, 4)] }), "A", words, "https://x/a.mp4", id);
    expect(doc.captions.length).toBeGreaterThan(0);
    expect(doc.captions.every((c) => c.at >= 2 && c.at < 4)).toBe(true);
  });
});

describe("wordFrames", () => {
  const doc = emptyDoc({ pieces: [piece("A", 0, 4), piece("B", 1, 5)] });
  const c = cap("c", "B", 1.5, 1, { text: "fresh jackfruit", words: [{ text: "fresh", at: 1.5, duration: 0.3 }, { text: "jackfruit", at: 1.9, duration: 0.5 }] });

  it("puts each word on the sequence frame it starts, active until the next word", () => {
    // B starts at reel 4 s; fresh at source 1.5 = reel 4.5 s = frame 108
    expect(wordFrames(doc, c, 24)).toEqual([
      { text: "fresh", start: 108, end: 118, charStart: 0, charEnd: 5 },
      { text: "jackfruit", start: 118, end: 132, charStart: 6, charEnd: 15 },
    ]);
  });

  it("finds the active word for a frame", () => {
    const f = wordFrames(doc, c, 24)!;
    expect(activeWord(f, 107)).toBe(-1);
    expect(activeWord(f, 108)).toBe(0);
    expect(activeWord(f, 120)).toBe(1);
  });

  it("returns null for a caption whose piece is gone", () => {
    expect(wordFrames(doc, { ...c, pieceId: "gone" }, 24)).toBeNull();
  });
});
