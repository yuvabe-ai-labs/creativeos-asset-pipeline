// The browser side of Auto captions (D399, D401): what the button costs, which clips can be
// filled from stored transcripts, and which clips have a new take. Pure.
import { transcribeCredits } from "@/lib/transcribe/cost";
import type { Transcript } from "@/lib/transcribe/types";
import { normalizeWords, replaceAutoCaptions } from "./caption-words";
import { pieceSoundFile } from "./playback";
import type { Caption, EditDoc, SourceView } from "./types";

const FALLBACK_FPS = 24;
const UNSURE = 0.9;
const SAME_WORD_SECONDS = 0.02;

/** The sound a piece plays, its length, and its picture's frame rate. */
export function pieceSound(doc: EditDoc, sources: SourceView[], pieceId: string) {
  const p = doc.pieces.find((x) => x.id === pieceId);
  const s = p && sources.find((x) => x.nodeId === p.sourceNodeId);
  if (!p || !s) return null;
  const f = pieceSoundFile(p, s);
  return { url: f.url, seconds: f.facts?.durationSeconds ?? 0, hasSound: Boolean(f.facts?.audio), fps: s.files.original.facts?.video?.fps ?? FALLBACK_FPS };
}

/** What the button shows: credits for each file not yet transcribed, once each. */
export function autoCaptionCost(doc: EditDoc, sources: SourceView[], transcribed: ReadonlySet<string>, pieceIds?: string[]): { credits: number; free: boolean } {
  const ids = pieceIds ?? doc.pieces.map((p) => p.id);
  const fresh = new Map<string, number>();
  for (const id of ids) {
    const s = pieceSound(doc, sources, id);
    if (s && s.hasSound && !transcribed.has(s.url)) fresh.set(s.url, s.seconds);
  }
  const seconds = [...fresh.values()].reduce((x, y) => x + y, 0);
  return { credits: transcribeCredits(seconds), free: fresh.size === 0 };
}

/** Writes auto captions for each requested piece whose transcript is stored. */
export function fillFromTranscripts(doc: EditDoc, sources: SourceView[], pieceIds: string[], transcripts: ReadonlyMap<string, Transcript>, newId: () => string) {
  let next = doc;
  const filled: string[] = [];
  for (const id of pieceIds) {
    const s = pieceSound(next, sources, id);
    const t = s && transcripts.get(s.url);
    if (!s || !t) continue;
    next = replaceAutoCaptions(next, id, normalizeWords(t.words, s.fps), s.url, newId);
    filled.push(id);
  }
  const before = new Set(doc.captions.map((c) => c.id));
  return { doc: next, filled, added: next.captions.filter((c) => !before.has(c.id)).map((c) => c.id) };
}

/** Pieces whose auto captions came from another file than the one they play now (D401). */
export function staleAutoPieces(doc: EditDoc, sources: SourceView[]): string[] {
  const out = new Set<string>();
  for (const c of doc.captions) {
    if (!c.auto || !c.from) continue;
    const s = pieceSound(doc, sources, c.pieceId);
    if (s && s.url !== c.from) out.add(c.pieceId);
  }
  return [...out];
}

/** Indexes of a caption's words the transcript was unsure of, matched by start time. */
export function unsureWordIndexes(c: Caption, t: Transcript | undefined): ReadonlySet<number> {
  if (!t || !c.words) return new Set();
  const out = new Set<number>();
  c.words.forEach((w, i) => {
    if (t.words.some((x) => Math.abs(x.s - w.at) < SAME_WORD_SECONDS && x.p < UNSURE)) out.add(i);
  });
  return out;
}
