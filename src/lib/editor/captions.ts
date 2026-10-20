// Captions belong to the piece they start in (D392, spec §7). A caption stores its start as a
// SOURCE time inside that piece (`at`), so trimming or reordering an earlier piece never knocks
// it out of sync with the speech. Every function returns the SAME doc for a no-op.
import { CAPTION_DEFAULTS } from "./caption-fonts";
import type { SrtCue } from "./srt";
import { locate, pieceOffsets, pieceSeconds, splitPiece, totalSeconds } from "./timeline";
import type { Caption, EditDoc } from "./types";

const MIN_CAPTION_SECONDS = 0.2;
const EDGE_MARGIN = 0.04;
const NEW_CAPTION_TEXT = "New caption";
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

/** A new caption looks like the last one, so a run of captions stays consistent. */
function nextLook(doc: EditDoc): Pick<Caption, "font" | "size" | "color" | "x" | "y"> {
  const last = doc.captions[doc.captions.length - 1];
  const from = last ?? CAPTION_DEFAULTS;
  return { font: from.font, size: from.size, color: from.color, x: from.x, y: from.y };
}

export function addCaption(doc: EditDoc, t: number, newId: string): EditDoc {
  if (doc.captions.length >= MAX_CAPTIONS) return doc;
  const anchor = anchorAt(doc, t);
  if (!anchor) return doc;
  const look = nextLook(doc);
  const caption: Caption = { id: newId, ...anchor, duration: CAPTION_DEFAULTS.duration, text: NEW_CAPTION_TEXT, ...look };
  return withCaptions(doc, [...doc.captions, caption]);
}

/** New reel times; the caption moves to whichever piece is under its new start. */
export function retimeCaption(doc: EditDoc, id: string, start: number, end: number): EditDoc {
  const anchor = anchorAt(doc, start);
  if (!anchor) return doc;
  return patchCaption(doc, id, { ...anchor, duration: Math.max(MIN_CAPTION_SECONDS, end - start) });
}

export function placeCaption(doc: EditDoc, id: string, x: number, y: number): EditDoc {
  const clamp = (v: number) => Math.min(1 - EDGE_MARGIN, Math.max(EDGE_MARGIN, v));
  return patchCaption(doc, id, { x: clamp(x), y: clamp(y) });
}

export function editCaption(doc: EditDoc, id: string, patch: Partial<Pick<Caption, "text" | "font" | "size" | "color">>): EditDoc {
  return patchCaption(doc, id, patch.text === undefined ? patch : { ...patch, text: patch.text.slice(0, MAX_CAPTION_TEXT) });
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
  const look = nextLook(doc);
  const added: Caption[] = [];
  let dropped = 0;
  for (const cue of cues) {
    const anchor = cue.start < total ? anchorAt(doc, cue.start) : null;
    if (!anchor || doc.captions.length + added.length >= MAX_CAPTIONS) {
      dropped++;
      continue;
    }
    added.push({ id: newId(), ...anchor, duration: Math.max(MIN_CAPTION_SECONDS, cue.end - cue.start), text: cue.text.slice(0, MAX_CAPTION_TEXT), ...look });
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
