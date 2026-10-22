// D406 — when the editor puts a Dubbing node between a clip and the Editor, that clip's pieces
// move to the Dubbing node unchanged: trims, picture and sound choices, and (by piece id) captions.
import type { EditDoc, EditSource } from "./types";

export function remapSource(doc: EditDoc, fromNodeId: string, to: EditSource): EditDoc {
  if (!doc.sources.some((s) => s.nodeId === fromNodeId) && !doc.pieces.some((p) => p.sourceNodeId === fromNodeId)) return doc;
  return {
    ...doc,
    sources: doc.sources.map((s) => (s.nodeId === fromNodeId ? to : s)),
    pieces: doc.pieces.map((p) => (p.sourceNodeId === fromNodeId ? { ...p, sourceNodeId: to.nodeId } : p)),
  };
}
