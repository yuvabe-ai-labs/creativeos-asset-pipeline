// Pure timeline maths for the reel, ported from the rough-cut spike and moved from frames to
// seconds (D390): trims are kept by time so a lip-synced file at another frame rate still lines
// up. Every function returns the SAME array for a no-op, so a drag that changes nothing never
// replaces state (performance rule 4).
import type { Piece } from "./types";

export const snap = (seconds: number, fps: number): number => Math.round(seconds * fps) / fps;

export const pieceSeconds = (p: Piece): number => p.out - p.in;

export const totalSeconds = (pieces: Piece[]): number => pieces.reduce((sum, p) => sum + pieceSeconds(p), 0);

/** The reel time each piece starts at. */
export function pieceOffsets(pieces: Piece[]): number[] {
  const offsets: number[] = [];
  let at = 0;
  for (const p of pieces) {
    offsets.push(at);
    at += pieceSeconds(p);
  }
  return offsets;
}

export type Located = { index: number; local: number; offset: number };

/** The piece under reel time t. Half-open ranges, except the last piece includes its end. */
export function locate(pieces: Piece[], t: number): Located | null {
  if (t < 0) return null;
  let offset = 0;
  for (let index = 0; index < pieces.length; index++) {
    const d = pieceSeconds(pieces[index]);
    const last = index === pieces.length - 1;
    if (t < offset + d || (last && t <= offset + d)) return { index, local: t - offset, offset };
    offset += d;
  }
  return null;
}

/** Moves one edge to `seconds` of the source, snapped to the picture's frames, within
 *  [0, duration], keeping at least one frame. */
export function setTrim(
  pieces: Piece[],
  id: string,
  edge: "in" | "out",
  seconds: number,
  limit: { duration: number; fps: number },
): Piece[] {
  const i = pieces.findIndex((p) => p.id === id);
  if (i < 0) return pieces;
  const p = pieces[i];
  const frame = 1 / limit.fps;
  // The last frame boundary at or before the file's end: never past the last real frame.
  const end = Math.floor(limit.duration * limit.fps + 1e-6) / limit.fps;
  const at = Math.min(Math.max(snap(seconds, limit.fps), 0), end);
  const next =
    edge === "in"
      ? { ...p, in: Math.min(at, p.out - frame) }
      : { ...p, out: Math.max(at, p.in + frame) };
  if (Math.abs(next.in - p.in) < 1e-9 && Math.abs(next.out - p.out) < 1e-9) return pieces;
  const out = pieces.slice();
  out[i] = next;
  return out;
}

/** Splits a piece at a source time, snapped to frames. Null unless strictly inside the piece. */
export function splitPiece(pieces: Piece[], id: string, sourceSeconds: number, newId: string, fps: number): Piece[] | null {
  const i = pieces.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const p = pieces[i];
  const at = snap(sourceSeconds, fps);
  if (at <= p.in + 1e-9 || at >= p.out - 1e-9) return null;
  const out = pieces.slice();
  out.splice(i, 1, { ...p, out: at }, { ...p, id: newId, in: at });
  return out;
}

export function movePiece(pieces: Piece[], from: number, to: number): Piece[] {
  if (from === to || from < 0 || to < 0 || from >= pieces.length || to >= pieces.length) return pieces;
  const out = pieces.slice();
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

/** MM:SS.ss */
export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const minutes = Math.floor(s / 60);
  const rest = s - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
}
