// The preview's clock (D402), pure so it is tested on its own. Given the piece under the playhead
// and where its file is, the next reel time, and whether playback crosses the cut into the next
// piece. A file that ended, or is within half a frame of the piece's out point, crosses.

export function advanceClock(a: {
  /** Reel time the piece starts at. */
  offset: number;
  /** The piece's length, seconds. */
  length: number;
  /** The playhead's current time inside the piece. */
  local: number;
  /** The piece's in point in its file. */
  sourceIn: number;
  /** The file's current time, or null while it isn't ready to say. */
  fileTime: number | null;
  ended: boolean;
  total: number;
  fps: number;
}): { time: number; crossed: boolean; done: boolean } {
  const end = a.offset + a.length;
  const atCut = a.ended || (a.fileTime !== null && a.fileTime - a.sourceIn >= a.length - 0.5 / a.fps);
  if (atCut) return { time: end, crossed: true, done: end >= a.total - 1e-6 };
  if (a.fileTime === null) return { time: a.offset + a.local, crossed: false, done: false };
  return { time: a.offset + Math.min(a.length, Math.max(a.local, a.fileTime - a.sourceIn)), crossed: false, done: false };
}
