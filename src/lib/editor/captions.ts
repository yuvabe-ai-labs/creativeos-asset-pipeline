// Captions belong to the piece they start in (D393, spec §7). A caption stores its start as a
// SOURCE time inside that piece (`at`), so trimming or reordering an earlier piece never knocks
// it out of sync with the speech. Every function returns the SAME doc for a no-op.
import { captionWords, retextCaption } from "./caption-words";
import type { SrtCue } from "./srt";
import { locate, pieceOffsets, pieceSeconds, splitPiece, totalSeconds } from "./timeline";
import type { Caption, EditDoc } from "./types";

const MIN_CAPTION_SECONDS = 0.2;
const NEW_CAPTION_TEXT = "New caption";
const NEW_CAPTION_SECONDS = 2;
/** What an edit may hold (EditDocSchema): the editor never builds an edit the server refuses. */
export const MAX_CAPTION_TEXT = 500;
export const MAX_CAPTIONS = 1000;

/** Reel times of a caption. A start trimmed out of its piece shows at the piece's nearest edge;
 *  the stored anchor is untouched, so widening the trim again restores it. */
export function captionTimes(doc: EditDoc, c: Caption): { start: number; end: number } | null {
  const index = doc.pieces.findIndex((p) => p.id === c.pieceId);
  if (index < 0) return null;
  const piece = doc.pieces[index];
  const local = Math.min(Math.max(c.at - piece.in, 0), pieceSeconds(piece));
  const start = pieceOffsets(doc.pieces)[index] + local;
  return { start, end: Math.min(totalSeconds(doc.pieces), start + c.duration) };
}

/** The piece under reel time t, and t as a source time in it. */
function anchorAt(doc: EditDoc, t: number): { pieceId: string; at: number } | null {
  const hit = locate(doc.pieces, t);
  if (!hit) return null;
  const piece = doc.pieces[hit.index];
  return { pieceId: piece.id, at: piece.in + hit.local };
}

function withCaptions(doc: EditDoc, captions: Caption[]): EditDoc {
  return { ...doc, captions };
}

function patchCaption(doc: EditDoc, id: string, patch: Partial<Caption>): EditDoc {
  const i = doc.captions.findIndex((c) => c.id === id);
  if (i < 0) return doc;
  const current = doc.captions[i];
  const changed = (Object.keys(patch) as (keyof Caption)[]).some((k) => patch[k] !== current[k]);
  if (!changed) return doc;
  const captions = doc.captions.slice();
  captions[i] = { ...current, ...patch };
  return withCaptions(doc, captions);
}

export function addCaption(doc: EditDoc, t: number, newId: string): EditDoc {
  if (doc.captions.length >= MAX_CAPTIONS) return doc;
  const anchor = anchorAt(doc, t);
  if (!anchor) return doc;
  const caption: Caption = { id: newId, ...anchor, duration: NEW_CAPTION_SECONDS, text: NEW_CAPTION_TEXT };
  return withCaptions(doc, [...doc.captions, caption]);
}

/** New reel times; the caption moves to whichever piece is under its new start. Its words move
 *  with it, and scale when its length changes (D397). */
export function retimeCaption(doc: EditDoc, id: string, start: number, end: number): EditDoc {
  const anchor = anchorAt(doc, start);
  const current = doc.captions.find((c) => c.id === id);
  if (!anchor || !current) return doc;
  const duration = Math.max(MIN_CAPTION_SECONDS, end - start);
  if (anchor.pieceId === current.pieceId && Math.abs(anchor.at - current.at) < 1e-9 && Math.abs(duration - current.duration) < 1e-9) return doc;
  const k = duration / current.duration;
  const words = current.words?.map((w) => ({ ...w, at: anchor.at + (w.at - current.at) * k, duration: w.duration * k }));
  return patchCaption(doc, id, { ...anchor, duration, ...(words ? { words } : {}), edited: true });
}

/** Text edits keep word times when the count is unchanged (spec §5). Empty text removes it. */
export function editCaption(doc: EditDoc, id: string, text: string): { doc: EditDoc; spread: boolean } {
  const c = doc.captions.find((x) => x.id === id);
  if (!c) return { doc, spread: false };
  const r = retextCaption(c, text);
  if (!r) return { doc: removeCaption(doc, id), spread: false };
  if (r.caption === c) return { doc, spread: false };
  return { doc: withCaptions(doc, doc.captions.map((x) => (x.id === id ? r.caption : x))), spread: r.spread };
}

/** Splits a line before the first word at or after reel time t (the middle word otherwise). */
export function splitCaption(doc: EditDoc, id: string, t: number, newId: string): EditDoc {
  const c = doc.captions.find((x) => x.id === id);
  const index = c ? doc.pieces.findIndex((p) => p.id === c.pieceId) : -1;
  if (!c || index < 0) return doc;
  const words = captionWords(c);
  if (words.length < 2) return doc;
  const local = doc.pieces[index].in + (t - pieceOffsets(doc.pieces)[index]);
  let k = words.findIndex((w) => w.at >= local - 1e-9);
  if (k <= 0) k = Math.ceil(words.length / 2);
  const a = words.slice(0, k);
  const b = words.slice(k);
  const end = c.at + c.duration;
  const first: Caption = { ...c, text: a.map((w) => w.text).join(" "), words: a, duration: Math.max(MIN_CAPTION_SECONDS, b[0].at - c.at), edited: true };
  const second: Caption = { ...c, id: newId, at: b[0].at, text: b.map((w) => w.text).join(" "), words: b, duration: Math.max(MIN_CAPTION_SECONDS, end - b[0].at), edited: true };
  const captions = doc.captions.slice();
  captions.splice(doc.captions.indexOf(c), 1, first, second);
  return withCaptions(doc, captions);
}

export function removeCaption(doc: EditDoc, id: string): EditDoc {
  if (!doc.captions.some((c) => c.id === id)) return doc;
  return withCaptions(doc, doc.captions.filter((c) => c.id !== id));
}

/** Removes a piece and its captions. */
export function deletePiece(doc: EditDoc, pieceId: string): EditDoc {
  if (!doc.pieces.some((p) => p.id === pieceId)) return doc;
  return {
    ...doc,
    pieces: doc.pieces.filter((p) => p.id !== pieceId),
    captions: doc.captions.filter((c) => c.pieceId !== pieceId),
  };
}

/** Splits a piece; captions anchored at or after the cut move to the new half. */
export function splitPieceInDoc(doc: EditDoc, pieceId: string, sourceSeconds: number, newId: string, fps: number): EditDoc | null {
  const pieces = splitPiece(doc.pieces, pieceId, sourceSeconds, newId, fps);
  if (!pieces) return null;
  const cut = pieces.find((p) => p.id === newId)!.in;
  return {
    ...doc,
    pieces,
    captions: doc.captions.map((c) => (c.pieceId === pieceId && c.at >= cut ? { ...c, pieceId: newId } : c)),
  };
}

/** Attaches imported cues to the piece under each start; cues starting at or past the end drop. */
export function attachCues(doc: EditDoc, cues: SrtCue[], newId: () => string): { doc: EditDoc; dropped: number } {
  const total = totalSeconds(doc.pieces);
  const added: Caption[] = [];
  let dropped = 0;
  for (const cue of cues) {
    const anchor = cue.start < total ? anchorAt(doc, cue.start) : null;
    if (!anchor || doc.captions.length + added.length >= MAX_CAPTIONS) {
      dropped++;
      continue;
    }
    added.push({ id: newId(), ...anchor, duration: Math.max(MIN_CAPTION_SECONDS, cue.end - cue.start), text: cue.text.slice(0, MAX_CAPTION_TEXT) });
  }
  return { doc: added.length ? withCaptions(doc, [...doc.captions, ...added]) : doc, dropped };
}

/** Captions as SRT cues in reel time, sorted. */
export function docToCues(doc: EditDoc): SrtCue[] {
  return doc.captions
    .map((c) => {
      const t = captionTimes(doc, c);
      return t ? { start: t.start, end: t.end, text: c.text } : null;
    })
    .filter((c): c is SrtCue => c !== null)
    .sort((a, b) => a.start - b.start);
}
