// A piece's picture and sound choices, and putting a source on the timeline again (spec §4, §6).
// Each returns the SAME doc for a no-op or an option the source doesn't have.
import { pieceLimit } from "./reconcile";
import type { EditDoc, PictureChoice, Piece, SoundChoice, SourceView } from "./types";

function patchPiece(doc: EditDoc, pieceId: string, fn: (p: Piece) => Piece): EditDoc {
  const i = doc.pieces.findIndex((p) => p.id === pieceId);
  if (i < 0) return doc;
  const next = fn(doc.pieces[i]);
  if (next === doc.pieces[i]) return doc;
  const pieces = doc.pieces.slice();
  pieces[i] = next;
  return { ...doc, pieces };
}

const sourceOf = (sources: SourceView[], p: Piece) => sources.find((s) => s.nodeId === p.sourceNodeId);

/** Lip-synced only when the version has it. Trims are kept by time, pulled in to the file's end. */
export function setPicture(doc: EditDoc, pieceId: string, choice: PictureChoice, sources: SourceView[]): EditDoc {
  return patchPiece(doc, pieceId, (p) => {
    const source = sourceOf(sources, p);
    if (p.picture === choice || !source || (choice === "lipSynced" && !source.files.lipSynced)) return p;
    const next = { ...p, picture: choice };
    const limit = pieceLimit(next, source);
    if (!limit || next.out <= limit.duration) return next;
    const out = limit.duration;
    return { ...next, out, in: Math.min(next.in, out - 1 / limit.fps) };
  });
}

/** Dubbed only when the version has a dub. */
export function setSound(doc: EditDoc, pieceId: string, choice: SoundChoice, sources: SourceView[]): EditDoc {
  return patchPiece(doc, pieceId, (p) => {
    const source = sourceOf(sources, p);
    if (p.sound === choice || !source || (choice === "dubbed" && !source.files.dubAudio)) return p;
    return { ...p, sound: choice };
  });
}

/** A copy of a piece right after it, with its trims and choices. Captions stay with the original. */
export function duplicatePiece(doc: EditDoc, pieceId: string, newId: string): EditDoc {
  const i = doc.pieces.findIndex((p) => p.id === pieceId);
  if (i < 0) return doc;
  const pieces = doc.pieces.slice();
  pieces.splice(i + 1, 0, { ...doc.pieces[i], id: newId });
  return { ...doc, pieces };
}

/** A fresh, full-length piece of a source at the end of the reel. */
export function addSourceAgain(doc: EditDoc, sourceNodeId: string, sources: SourceView[], newId: string): EditDoc {
  const video = sources.find((s) => s.nodeId === sourceNodeId)?.files.original.facts?.video;
  if (!video) return doc;
  const piece: Piece = { id: newId, sourceNodeId, in: 0, out: video.frames / video.fps, picture: "original", sound: "original" };
  return { ...doc, pieces: [...doc.pieces, piece] };
}
