// What the Editor card shows on the canvas (D388, the mockup's Editor node): sources, pieces,
// length, shape, a strip of the cut with its captions, and counts. From the same state the editor
// page uses.
import { captionTimes } from "./captions";
import { pieceSeconds, totalSeconds } from "./timeline";
import type { EditorState, ReelShape } from "./types";

export type EditSummary = {
  sources: number;
  pieces: number;
  seconds: number;
  shape: ReelShape;
  captions: number;
  dubbedPieces: number;
  strip: Array<{ id: string; fraction: number; dubbed: boolean }>;
  /** start and width as fractions of the reel. */
  captionStrip: Array<{ id: string; start: number; width: number }>;
};

export function editSummary(state: EditorState): EditSummary {
  const { doc } = state;
  const seconds = totalSeconds(doc.pieces);
  const captionStrip =
    seconds > 0
      ? doc.captions.flatMap((c) => {
          const t = captionTimes(doc, c);
          return t && t.end > t.start ? [{ id: c.id, start: t.start / seconds, width: (t.end - t.start) / seconds }] : [];
        })
      : [];
  return {
    sources: state.sources.length,
    pieces: doc.pieces.length,
    seconds,
    shape: doc.shape,
    captions: doc.captions.length,
    dubbedPieces: doc.pieces.filter((p) => p.sound === "dubbed").length,
    strip: seconds > 0 ? doc.pieces.map((p) => ({ id: p.id, fraction: pieceSeconds(p) / seconds, dubbed: p.sound === "dubbed" })) : [],
    captionStrip,
  };
}
