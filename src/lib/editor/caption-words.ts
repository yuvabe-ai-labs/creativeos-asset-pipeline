// Words inside captions (D397). Times are SOURCE seconds of the caption's piece, like Caption.at,
// so trimming or moving other pieces never knocks a word out of sync. wordFrames is the ONE place
// word times become frames: the stage and the Premiere writer both call it.
import type { TranscriptWord } from "@/lib/transcribe/types";
import { captionTimes, MAX_CAPTION_TEXT } from "./captions";
import { pieceOffsets } from "./timeline";
import type { Caption, CaptionWord, EditDoc } from "./types";

export const HOLD_SECONDS = 0.3;
const MAX_WORDS = 3;
const MAX_CHARS = 22;
const PAUSE_SECONDS = 0.35;
const LINE_END = /[.,?!;:]$/;
const MIN_CAPTION_SECONDS = 0.2;

/** Every word at least one frame long, never running into the next; empty words dropped. */
export function normalizeWords(words: TranscriptWord[], fps: number): TranscriptWord[] {
  const kept = words.filter((x) => x.t.trim().length > 0).map((x) => ({ ...x, t: x.t.trim() }));
  const frame = 1 / fps;
  return kept.map((x, i) => {
    let e = Math.max(x.e, x.s + frame);
    const next = kept[i + 1];
    if (next) e = Math.min(e, Math.max(x.s + frame, next.s));
    return { ...x, e };
  });
}

export function groupWords(words: TranscriptWord[], o: { maxWords?: number; maxChars?: number; pause?: number } = {}): TranscriptWord[][] {
  const maxWords = o.maxWords ?? MAX_WORDS;
  const maxChars = o.maxChars ?? MAX_CHARS;
  const pause = o.pause ?? PAUSE_SECONDS;
  const lines: TranscriptWord[][] = [];
  let cur: TranscriptWord[] = [];
  const flush = () => {
    if (cur.length) lines.push(cur);
    cur = [];
  };
  words.forEach((x, i) => {
    const chars = cur.reduce((n, y) => n + y.t.length + 1, 0) + x.t.length;
    if (cur.length && (cur.length >= maxWords || chars > maxChars)) flush();
    cur.push(x);
    const next = words[i + 1];
    if (LINE_END.test(x.t) || !next || next.s - x.e > pause) flush();
  });
  flush();
  return lines;
}

const tokens = (text: string) => text.trim().split(/\s+/).filter(Boolean);

/** Words spread over [at, at + duration] by their length. */
export function spreadWords(text: string, at: number, duration: number): CaptionWord[] {
  const toks = tokens(text);
  const weights = toks.map((t) => Math.max(1, t.length));
  const sum = weights.reduce((a, b) => a + b, 0);
  let cursor = at;
  return toks.map((t, i) => {
    const d = (duration * weights[i]) / sum;
    const word = { text: t, at: cursor, duration: d };
    cursor += d;
    return word;
  });
}

/** A caption's words: its own, or its text spread over its span (hand-typed captions). */
export function captionWords(c: Caption): CaptionWord[] {
  return c.words ?? spreadWords(c.text, c.at, c.duration);
}

/** New text for a line (spec §5). Null for empty text; the SAME caption when unchanged. */
export function retextCaption(c: Caption, text: string): { caption: Caption; spread: boolean } | null {
  const clean = text.slice(0, MAX_CAPTION_TEXT).trim();
  const toks = tokens(clean);
  if (toks.length === 0) return null;
  if (clean === c.text.trim()) return { caption: c, spread: false };
  const old = captionWords(c);
  if (toks.length === old.length) {
    return { caption: { ...c, text: clean, words: old.map((w, i) => ({ ...w, text: toks[i] })), edited: true }, spread: false };
  }
  const last = old[old.length - 1];
  const end = last ? last.at + last.duration : c.at + c.duration;
  return { caption: { ...c, text: clean, words: spreadWords(clean, c.at, Math.max(MIN_CAPTION_SECONDS, end - c.at)), edited: true }, spread: true };
}

/** Kept = added by hand, or edited since Auto captions wrote it. */
const keptByUser = (c: Caption) => !c.auto || c.edited === true;

/** Rewrites a piece's auto captions from its transcript, keeping the user's lines (D399). */
export function replaceAutoCaptions(doc: EditDoc, pieceId: string, words: TranscriptWord[], from: string, newId: () => string): EditDoc {
  const piece = doc.pieces.find((p) => p.id === pieceId);
  if (!piece) return doc;
  const others = doc.captions.filter((c) => c.pieceId !== pieceId || keptByUser(c));
  const keptSpans = others.filter((c) => c.pieceId === pieceId).map((c) => ({ s: c.at, e: c.at + c.duration }));
  const usable = words.filter((x) => x.s >= piece.in && x.s < piece.out && !keptSpans.some((k) => x.s >= k.s - 0.01 && x.s < k.e));
  const lines = groupWords(usable);
  const starts = [...lines.map((l) => l[0].s), ...keptSpans.map((k) => k.s)].sort((a, b) => a - b);
  const added: Caption[] = lines.map((line) => {
    const at = line[0].s;
    const last = line[line.length - 1];
    const nextStart = starts.find((s) => s > at + 1e-9) ?? Infinity;
    const end = Math.min(last.e + HOLD_SECONDS, nextStart, piece.out);
    return {
      id: newId(),
      pieceId,
      at,
      duration: Math.max(MIN_CAPTION_SECONDS, end - at),
      text: line.map((x) => x.t).join(" "),
      words: line.map((x) => ({ text: x.t, at: x.s, duration: x.e - x.s })),
      auto: true,
      from,
    };
  });
  return { ...doc, captions: [...others, ...added] };
}

export type WordFrame = { text: string; start: number; end: number; charStart: number; charEnd: number };

/** Each word's sequence frames (start inclusive, end exclusive), and where it sits in the text. */
export function wordFrames(doc: EditDoc, c: Caption, fps: number): WordFrame[] | null {
  const index = doc.pieces.findIndex((p) => p.id === c.pieceId);
  const span = captionTimes(doc, c);
  if (index < 0 || !span) return null;
  const piece = doc.pieces[index];
  const offset = pieceOffsets(doc.pieces)[index];
  const lineEnd = Math.round(span.end * fps);
  const words = captionWords(c).filter((x) => x.at >= piece.in - 1e-9 && x.at < piece.out);
  const starts = words.map((x) => Math.round((offset + x.at - piece.in) * fps));
  let char = 0;
  return words.map((x, i) => {
    const charStart = char;
    char += x.text.length + 1;
    const start = starts[i];
    const end = i + 1 < words.length ? Math.max(start + 1, starts[i + 1]) : Math.max(start + 1, lineEnd);
    return { text: x.text, start, end, charStart, charEnd: charStart + x.text.length };
  });
}

/** The word being said on `frame`: the last one started, or -1 before the first. */
export function activeWord(frames: WordFrame[], frame: number): number {
  let active = -1;
  for (let i = 0; i < frames.length; i++) if (frames[i].start <= frame) active = i;
  return active;
}
